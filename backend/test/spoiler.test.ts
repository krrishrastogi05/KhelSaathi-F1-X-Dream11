// The no-spoiler guarantee. The strongest form: what the viewer (and the AI) gets at time T is exactly the same
// whether the server holds the whole race or only the race up to T. If any future row leaked into a context packet or
// a chart, the two would differ.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildContext, fallbackAnswer, intentOf, leaksFuture } from '../../src/shared/context';
import { detectMoments } from '../../src/shared/detect';
import { indexRace } from '../../src/shared/race';
import { buildViz } from '../../src/shared/viz';
import { createAi } from '../src/ai';
import { DATA, IX, MOMENTS, profile, truncate, utc } from './helpers';

const TIMES = ['15:52:00', '16:05:00', '16:30:00', '16:40:00', '16:55:00', '17:10:00', '17:21:00'].map(utc);
const QUESTIONS = ['What just happened?', 'Why did the red flag change the strategy?', 'How did Verstappen gain so many places?', 'Show me the gaps'];

describe('no spoilers', () => {
  for (const T of TIMES) {
    it(`context and charts at ${new Date(Date.parse(DATA.meta.originUtc) + T).toISOString().slice(11, 19)} equal those from data cut at that time`, () => {
      const cutIx = indexRace(truncate(DATA, T)), cutMoments = detectMoments(cutIx).filter((m) => m.t <= T);
      const fullVisible = MOMENTS.filter((m) => m.t <= T);
      assert.deepEqual(fullVisible.map((m) => m.id), cutMoments.map((m) => m.id), 'visible moments');
      for (const question of QUESTIONS) {
        assert.deepEqual(buildContext(IX, MOMENTS, profile(), T, { question }), buildContext(cutIx, cutMoments, profile(), T, { question }), question);
      }
      for (const type of ['positions', 'tyres', 'gaps'] as const) {
        assert.deepEqual(buildViz(IX, MOMENTS, T, { type, drivers: [1, 31, 4] }), buildViz(cutIx, cutMoments, T, { type, drivers: [1, 31, 4] }), type);
      }
    });
  }

  it('"who wins?" never reaches the model and only describes the present', async () => {
    let called = 0;
    const ai = createAi({ providers: [{ url: 'http://x', key: 'k', model: 'm' }], llmTimeoutMs: 100 }, IX, MOMENTS, (async () => { called++; throw new Error('no'); }) as typeof fetch);
    const T = utc('17:00:00');
    for (const q of ['Who wins this race?', 'who will win', 'Kaun jeetega?', 'What is the final result?']) {
      assert.equal(intentOf(q), 'spoiler', q);
      const card = await ai.ask(profile(), T, { question: q });
      assert.equal(card.source, 'fallback');
      assert.match(card.body, /Lap 33/);
      assert.doesNotMatch(`${card.headline} ${card.body}`, /VER.*(won|win)/i);
    }
    assert.equal(called, 0);
  });

  it('an AI answer that talks about the ending is replaced', async () => {
    const reply = JSON.stringify({ headline: 'Verstappen went on to win', body: 'He eventually won the race.', more: '', analogy: null, viz: null, followups: [], concepts: [], uncertain: false });
    const fake = (async () => new Response(JSON.stringify({ choices: [{ message: { content: reply } }] }), { status: 200 })) as typeof fetch;
    const ai = createAi({ providers: [{ url: 'http://x', key: 'k', model: 'm' }], llmTimeoutMs: 1000 }, IX, MOMENTS, fake);
    assert.ok(leaksFuture({ headline: 'Verstappen went on to win', body: '', more: '' }));
    const card = await ai.ask(profile(), utc('16:40:00'), { question: 'What just happened?' });
    assert.equal(card.source, 'fallback');
  });

  it('after seeking back, a cached answer from later in the race is not reused', async () => {
    let n = 0;
    const fake = (async () => { n++; return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ headline: `Answer ${n}`, body: 'ok', more: '', analogy: null, viz: null, followups: [], concepts: [], uncertain: false }) } }] })); }) as typeof fetch;
    const ai = createAi({ providers: [{ url: 'http://x', key: 'k', model: 'm' }], llmTimeoutMs: 1000 }, IX, MOMENTS, fake);
    const late = await ai.ask(profile(), utc('17:21:00'), { question: 'What just happened?' });
    const again = await ai.ask(profile(), utc('17:21:00'), { question: 'What just happened?' });
    const early = await ai.ask(profile(), utc('16:05:00'), { question: 'What just happened?' });
    assert.equal(again.headline, late.headline, 'same moment: cache hit');
    assert.notEqual(early.headline, late.headline, 'earlier moment: no cache hit');
    assert.equal(n, 2);
  });

  it('fallback answers only use moments up to now', () => {
    const T = utc('16:31:00'), card = fallbackAnswer(IX, MOMENTS, profile(), T, 'What just happened?', 'test');
    const future = MOMENTS.filter((m) => m.t > T).map((m) => m.id);
    assert.ok(!future.includes(card.momentId ?? ''));
    assert.doesNotMatch(card.headline, /red flag|restart/i);
  });
});
