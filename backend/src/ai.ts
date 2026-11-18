// The AI step of the harness: one OpenAI-compatible chat call per question, JSON mode, a hard timeout, provider
// failover (LLM_* then LLM2_* ...), schema validation, a future-leak check, and a cache. Anything that fails falls back
// to the deterministic answer, and the card says so. The model never gets more than buildContext() gives it.
import { createHash } from 'node:crypto';
import { answerCard, buildContext, fallbackAnswer, instantViz, intentOf, leaksFuture, systemPrompt, validateAnswer } from '../../src/shared/context';
import { lapAt, type RaceIndex } from '../../src/shared/race';
import type { Card, Moment, Ms, Profile } from '../../src/shared/types';
import type { Config, Provider } from './config';

const CACHE_MAX = 300;

export function createAi(cfg: Pick<Config, 'providers' | 'llmTimeoutMs'>, ix: RaceIndex, moments: Moment[], fetchImpl: typeof fetch = fetch) {
  const cache = new Map<string, Card>();

  async function call(p: Provider, messages: { role: string; content: string }[]): Promise<string> {
    const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), cfg.llmTimeoutMs);
    try {
      const res = await fetchImpl(`${p.url.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST', signal: ctrl.signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${p.key}` },
        body: JSON.stringify({ model: p.model.split(',')[0].trim(), messages, temperature: 0.3, max_tokens: 1400, reasoning_effort: 'low', response_format: { type: 'json_object' } }),   // gpt-oss reasons first: keep it short
      });
      if (!res.ok) throw new Error(`${p.model}: HTTP ${res.status}`);
      const body = await res.json() as { choices?: { message?: { content?: string } }[] };
      return body.choices?.[0]?.message?.content ?? '';
    } finally { clearTimeout(timer); }
  }

  /** The cache key holds everything the answer depends on, including the lap and the latest visible moment, so an
   *  answer cached late in the race is never served after a seek back. */
  function keyOf(p: Profile, t: Ms, q: string, momentId: string | undefined) {
    const lastSeen = [...moments].reverse().find((m) => m.t <= t)?.id ?? '-';
    const raw = JSON.stringify([q.trim().toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ''), momentId ?? '', lapAt(ix, t), lastSeen, p.level, p.lang, p.concepts]);
    return createHash('sha1').update(raw).digest('hex');
  }

  async function ask(p: Profile, t: Ms, input: { question?: string; momentId?: string }): Promise<Card> {
    const moment = input.momentId ? moments.find((m) => m.id === input.momentId && m.t <= t) : undefined;
    const q = input.question?.trim() || (moment ? `Explain this moment in more depth: ${moment.type.replace(/_/g, ' ')} on lap ${moment.lap}.` : 'What just happened?');
    const why = moment ? (p.lang === 'en' ? `Deeper look · lap ${moment.lap}` : `Detail mein · lap ${moment.lap}`) : (p.lang === 'en' ? `Your question · lap ${lapAt(ix, t)}` : `Aapka sawaal · lap ${lapAt(ix, t)}`);
    if (intentOf(q) === 'spoiler') return fallbackAnswer(ix, moments, p, t, q, why);          // never ask a model about the result

    const key = keyOf(p, t, q, moment?.id);
    const hit = cache.get(key);
    if (hit) return { ...hit, why: `${hit.why} · cached` };

    const viz = moment ? null : instantViz(ix, moments, t, q);
    const context = buildContext(ix, moments, p, t, { question: input.question, momentId: moment?.id });
    const messages = [{ role: 'system', content: systemPrompt(p.lang) }, { role: 'user', content: `CONTEXT:\n${JSON.stringify(context)}\n\nQUESTION: ${q}` }];
    for (const provider of cfg.providers) {
      try {
        const a = validateAnswer(await call(provider, messages), ix);
        if (!a) { console.warn(`ai: ${provider.model} returned an invalid answer`); continue; }
        if (leaksFuture(a)) { console.warn(`ai: ${provider.model} answer looked like a spoiler, dropped`); break; }
        if (a.viz?.type === 'then_now' && !context.history) a.viz = null;          // history only when the match was strong
        const card = answerCard(a, viz ?? (moment ? { type: 'positions', drivers: moment.drivers } : null), t, why);
        if (moment) card.momentId = moment.id;
        cache.set(key, card);
        if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
        return card;
      } catch (e) { console.warn(`ai: ${provider.model} failed: ${(e as Error).message}`); }
    }
    const off = cfg.providers.length ? (p.lang === 'en' ? 'AI unavailable, data-only answer' : 'AI abhi busy, data se jawab') : (p.lang === 'en' ? 'AI off, data-only answer' : 'AI off, data se jawab');
    const card = fallbackAnswer(ix, moments, p, t, q, `${why} · ${off}`);
    return moment ? { ...card, momentId: moment.id } : card;
  }

  return { ask, enabled: cfg.providers.length > 0 };
}
export type Ai = ReturnType<typeof createAi>;
