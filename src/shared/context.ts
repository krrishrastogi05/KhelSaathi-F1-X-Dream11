// The AI harness, minus the network call: intent detection, the context packet, response validation and the
// deterministic fallback. The packet is built only from stateAt(t) and moments with m.t <= t, so the model sees what a
// viewer at t could know. backend/test/spoiler.test.ts proves the packet is identical with or without the future data.
import { CONCEPT, CONCEPTS, depthFor } from './concepts';
import { nudgeCard, vizFor } from './copy';
import { historyById, matchHistory } from './history';
import { code, gridOf, stateAt, wetAt, type RaceIndex } from './race';
import { validateVizRequest } from './viz';
import type { AiAnswer, Card, ConceptId, Lang, Moment, Ms, Profile, VizRequest } from './types';

export type Intent = 'spoiler' | 'history' | 'positions' | 'tyres' | 'gaps' | 'concept' | 'moment';

const SPOILER = /\b(who|kaun)\b.*\b(win|wins|won|jeet|jeetega|jeetegi)|\bwinner\b|final (result|position|standings)|\bpodium\b.*\b(end|finish)|kaun jeet|end mein kya|how does (it|this|the race) end/i;
const HISTORY = /\b(before|history|historic|similar|pehle|kabhi|reminds|like this)\b/i;
const POSITIONS = /\b(position|positions|places|gain|gained|comeback|charge|overtak\w*|aage kaise|climb)\b/i;
const TYRES = /\b(tyre|tyres|tire|tires|pit|pits|pitted|undercut|strategy|stint|compound|inter|inters)\b/i;
const GAPS = /\b(gap|gaps|behind|ahead|catch|peeche|lead by|close)\b/i;
const WHAT_IS = /\b(what is|what's|what are|explain|matlab|kya hota|kya hai|meaning)\b/i;

const CONCEPT_WORDS: [ConceptId, RegExp][] = [
  ['undercut', /undercut/i], ['drs', /\bdrs\b/i], ['red_flag', /red flag/i], ['safety_car', /safety car|\bvsc\b|virtual/i],
  ['pit_stop', /pit ?stop|\bpit\b/i], ['tyres', /tyre|tire|compound|inter/i], ['strategy', /strategy/i], ['overtaking', /overtak/i],
];

export function conceptIn(q: string): ConceptId | null { return CONCEPT_WORDS.find(([, r]) => r.test(q))?.[0] ?? null; }

export function intentOf(q: string): Intent {
  if (SPOILER.test(q)) return 'spoiler';
  if (HISTORY.test(q)) return 'history';
  if (WHAT_IS.test(q) && conceptIn(q) && !/\b(that|this|just|abhi|yeh)\b/i.test(q)) return 'concept';
  if (/\b(show|dikhao|chart|graph)\b/i.test(q) || POSITIONS.test(q)) return POSITIONS.test(q) ? 'positions' : TYRES.test(q) ? 'tyres' : GAPS.test(q) ? 'gaps' : 'positions';
  if (TYRES.test(q)) return 'tyres';
  if (GAPS.test(q)) return 'gaps';
  return 'moment';
}

/** Driver numbers named in a question by code ("VER") or last name ("Verstappen"). */
export function driversIn(ix: RaceIndex, q: string): number[] {
  const words = q.toLowerCase();
  return ix.data.drivers.filter((d) => new RegExp(`\\b${d.code.toLowerCase()}\\b`).test(words) || words.includes(d.name.split(' ').slice(-1)[0].toLowerCase())).map((d) => d.n);
}

export const visibleMoments = (moments: Moment[], t: Ms) => moments.filter((m) => m.t <= t);
const latestMoment = (moments: Moment[], t: Ms, minImportance = 0.6) => [...visibleMoments(moments, t)].reverse().find((m) => m.importance >= minImportance) ?? null;

/** The instant chart for a question, before the AI answers. */
export function instantViz(ix: RaceIndex, moments: Moment[], t: Ms, q: string): VizRequest | null {
  const named = driversIn(ix, q), last = latestMoment(moments, t), drivers = named.length ? named : last?.drivers ?? [];
  switch (intentOf(q)) {
    case 'positions': return { type: 'positions', drivers };
    case 'tyres': return { type: 'tyres', drivers };
    case 'gaps': return { type: 'gaps', drivers: named };
    case 'history': { const h = last && matchHistory(last); return h ? { type: 'then_now', drivers, historyId: h.entry.id } : null; }
    case 'moment': return last ? vizFor(last) : null;
    default: return null;
  }
}

export interface ContextPacket {
  replay: { note: string; lap: number; totalLaps: number; trackStatus: string; wetTrack: boolean; raining: boolean; airC: number | null; trackC: number | null };
  classification: { pos: number; startedPos: number; driver: string; team: string; gapToLeaderS: number | null; lapsDown: number; intervalS: number | null; tyre: string; tyreAgeLaps: number; stops: number; placesGainedSinceStart: number; inPit: boolean }[];
  recentMoments: { lap: number; type: string; facts: Moment['facts']; evidence: string[] }[];
  focusMoment: { lap: number; type: string; facts: Moment['facts']; evidence: string[] } | null;
  viewer: { level: string; language: Lang; depth: 'beginner' | 'expert'; concepts: Record<string, string> };
  conceptNotes: { id: ConceptId; note: string }[];
  history: { id: string; race: string; season: number; summary: string; facts: { label: string; value: string }[]; why: string; source: string } | null;
  allowedViz: string[];
}

export function buildContext(ix: RaceIndex, moments: Moment[], p: Profile, t: Ms, opts: { question?: string; momentId?: string }): ContextPacket {
  const s = stateAt(ix, t), team = (n: number) => ix.data.drivers.find((d) => d.n === n)?.team ?? '';
  const named = opts.question ? driversIn(ix, opts.question) : [];
  const rows = s.cars.filter((c) => c.pos <= 10 || named.includes(c.n));
  const seen = visibleMoments(moments, t), focus = opts.momentId ? seen.find((m) => m.id === opts.momentId) ?? null : null;
  const recent = seen.filter((m) => m.lap >= s.lap - 15 && m.importance >= 0.5).slice(-6);
  const ofMoment = (m: Moment) => ({ lap: m.lap, type: m.type, facts: m.facts, evidence: m.evidence.map((e) => `${e.kind}: ${e.text}`) });
  const anchor = focus ?? latestMoment(moments, t);
  const conceptIds = [...new Set<ConceptId>([...(anchor?.concepts ?? []), ...(opts.question && conceptIn(opts.question) ? [conceptIn(opts.question)!] : [])])];
  const asked = opts.question ? conceptIn(opts.question) : null, depth = depthFor(p, asked ? [asked] : conceptIds);   // a concept question follows that concept's state
  const wantsHistory = !!opts.question && intentOf(opts.question) === 'history' || anchor?.type === 'lead_change';
  const hist = wantsHistory && anchor ? matchHistory(anchor) : null;
  return {
    replay: { note: 'Historical replay of the 2024 São Paulo Grand Prix. Everything below is what is known at this moment of the replay.', lap: s.lap, totalLaps: s.totalLaps, trackStatus: s.status, wetTrack: wetAt(ix, t), raining: s.rain, airC: s.air, trackC: s.trackTemp },
    classification: rows.map((c) => ({ pos: c.pos, startedPos: gridOf(ix, c.n), driver: code(ix, c.n), team: team(c.n), gapToLeaderS: c.gap, lapsDown: c.lapped, intervalS: c.interval, tyre: c.compound, tyreAgeLaps: c.tyreAge, stops: c.pits, placesGainedSinceStart: gridOf(ix, c.n) - c.pos, inPit: c.inPit })),
    recentMoments: recent.map(ofMoment), focusMoment: focus ? ofMoment(focus) : null,
    viewer: { level: p.level, language: p.lang, depth, concepts: p.concepts },
    conceptNotes: conceptIds.map((id) => ({ id, note: CONCEPT[id][depth].en })),
    history: hist ? { id: hist.entry.id, race: hist.entry.race, season: hist.entry.season, summary: hist.entry.summary, facts: hist.entry.facts, why: hist.entry.why.en, source: hist.entry.source } : null,
    allowedViz: ['positions', 'tyres', 'gaps', ...(hist ? ['then_now'] : [])],
  };
}

export function systemPrompt(lang: Lang): string {
  return [
    'You are Khel Saathi, a friendly second-screen companion who helps a new fan understand a Formula 1 race while they watch a replay.',
    'Rules:',
    '- Use ONLY the facts in the CONTEXT JSON. Never invent lap times, gaps, positions, telemetry or quotes.',
    '- Never calculate numbers yourself. Quote them from CONTEXT as given (pos, startedPos, gapToLeaderS, placesGainedSinceStart, lap).',
    '- You do NOT know how this race ends. Ignore anything you remember about the 2024 São Paulo Grand Prix. Never predict or hint at the result, never describe events that are not in CONTEXT.',
    '- Be specific: name the drivers, laps and numbers from CONTEXT (recentMoments, classification) that answer the question. A general rule alone is not an answer.',
    '- If the context does not support an answer, say so plainly and set "uncertain": true.',
    '- Historical comparisons: only use CONTEXT.history if present. Never name other past races.',
    '- Match viewer.depth: "beginner" = simple words, one idea at a time; "expert" = short and technical.',
    '- Use a cricket analogy only if it genuinely makes the idea clearer, otherwise "analogy": null.',
    lang === 'hinglish'
      ? '- Write in natural Hinglish (Hindi-English mix in Roman script, like friends texting during a match). Keep F1 terms in English.'
      : '- Write in plain, friendly English.',
    '- Keep "body" to 2-3 short sentences. Put extra detail in "more" (max 4 sentences).',
    '- Pick one chart from CONTEXT.allowedViz that best shows the answer, with up to 4 driver codes, or null.',
    'Reply with JSON only: {"headline": string (max 70 chars), "body": string, "more": string, "analogy": string|null, "viz": {"type": string, "drivers": string[], "historyId"?: string}|null, "followups": [string, string], "concepts": string[] (from: tyres, pit_stop, undercut, overtaking, drs, safety_car, red_flag, strategy), "uncertain": boolean}',
  ].join('\n');
}

/** Phrases that would describe the end of this race. An AI answer containing one is replaced by the fallback. */
const FUTURE = /\b(went on to|goes on to|would go on|eventually|ended up|won the race|wins the race|will win|takes the win|took the win|victory|chequered flag|finished (first|second|third|p\d|on the podium)|final result)\b/i;
export const leaksFuture = (a: Pick<AiAnswer, 'headline' | 'body' | 'more'>) => FUTURE.test(`${a.headline} ${a.body} ${a.more}`);

const str = (x: unknown, max: number) => (typeof x === 'string' ? x.trim().slice(0, max) : '');

/** Parse and validate the model's JSON. Returns null when the shape is wrong (the caller then uses the fallback). */
export function validateAnswer(raw: string, ix: RaceIndex): AiAnswer | null {
  let o: Record<string, unknown>;
  try { o = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch { return null; }
  if (!o || typeof o !== 'object') return null;
  const headline = str(o.headline, 90), body = str(o.body, 600);
  if (!headline || !body) return null;
  const ids = CONCEPTS.map((c) => c.id);
  return {
    headline, body, more: str(o.more, 900), analogy: str(o.analogy, 300) || null,
    viz: o.viz ? validateVizRequest(o.viz, ix) : null,
    followups: (Array.isArray(o.followups) ? o.followups : []).map((f) => str(f, 90)).filter(Boolean).slice(0, 2),
    concepts: (Array.isArray(o.concepts) ? o.concepts : []).filter((c): c is ConceptId => ids.includes(c as ConceptId)),
    uncertain: o.uncertain === true,
  };
}

/** Deterministic answer used when the AI is off, slow, invalid, or the question asks for the result. */
export function fallbackAnswer(ix: RaceIndex, moments: Moment[], p: Profile, t: Ms, q: string, why: string): Card {
  const en = p.lang === 'en', s = stateAt(ix, t), lead = s.cars[0], intent = intentOf(q), viz = instantViz(ix, moments, t, q);
  const base = { id: `ans-${Date.now().toString(36)}`, momentId: null, t, kind: 'answer' as const, analogy: null, history: viz?.historyId ?? null, quiz: null, source: 'fallback' as const, why };
  const leaderLine = en ? `Lap ${s.lap} of ${s.totalLaps}: ${code(ix, lead.n)} leads.` : `Lap ${s.lap}/${s.totalLaps}: ${code(ix, lead.n)} aage hai.`;
  if (intent === 'spoiler') {
    return { ...base, headline: en ? 'No spoilers here' : 'Spoiler nahi milega', body: `${en ? 'I only know the race up to this moment of the replay.' : 'Mujhe replay mein sirf abhi tak ki race pata hai.'} ${leaderLine} ${s.totalLaps - s.lap} ${en ? 'laps to go.' : 'laps baaki.'}`, more: null, viz: { type: 'positions', drivers: s.cars.slice(0, 3).map((c) => c.n) }, followups: en ? ['Who has the advantage now?', 'Show me the gaps'] : ['Ab advantage kiska hai?', 'Gaps dikhao'], concepts: [] };
  }
  const c = conceptIn(q);
  if (intent === 'concept' && c) {
    const concept = CONCEPT[c], depth = depthFor(p, [c]);
    return { ...base, headline: concept.title[p.lang], body: concept[depth][p.lang], more: null, analogy: depth === 'beginner' ? concept.analogy?.[p.lang] ?? null : null, viz, followups: en ? ['What just happened?', 'Show me the tyre strategy'] : ['Abhi kya hua?', 'Tyre strategy dikhao'], concepts: [c] };
  }
  const last = latestMoment(moments, t);
  if (last) {
    const card = nudgeCard(last, p, { reason: why, quiz: null });
    return { ...card, ...base, headline: card.headline, body: card.body, more: card.more, analogy: card.analogy, viz: viz ?? card.viz, history: viz?.historyId ?? card.history, followups: card.followups, concepts: card.concepts };
  }
  return { ...base, headline: en ? 'Race so far' : 'Abhi tak ki race', body: leaderLine, more: null, viz, followups: en ? ['What is a pit stop?', 'Show me the positions'] : ['Pit stop kya hota hai?', 'Positions dikhao'], concepts: [] };
}

/** Turn a validated AI answer into a card. The chart falls back to the instant one when the AI picked none. */
export function answerCard(a: AiAnswer, fallbackViz: VizRequest | null, t: Ms, why: string): Card {
  const viz = a.viz ?? fallbackViz;
  return {
    id: `ans-${Date.now().toString(36)}`, momentId: null, t, kind: 'answer', headline: a.headline, body: a.body, more: a.more || null,
    analogy: a.analogy, why: a.uncertain ? `${why} · limited data` : why, viz, history: viz?.historyId ? historyById(viz.historyId)?.id ?? null : null,
    followups: a.followups, concepts: a.concepts, source: 'ai', quiz: null,
  };
}
