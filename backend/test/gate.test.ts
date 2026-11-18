// The nudge gate: no duplicates, no floods, fewer cards for viewers who already know the ideas.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decide, GATE, markShown, newGate, onSeek, pickNudge } from '../../src/shared/gate';
import { introduce } from '../../src/shared/concepts';
import type { Moment } from '../../src/shared/types';
import { MOMENTS, profile } from './helpers';

const m = (over: Partial<Moment>): Moment => ({ id: 'x', t: 100_000, type: 'pit_stop', lap: 5, importance: 0.6, drivers: [], concepts: ['pit_stop'], tags: [], evidence: [], facts: {}, ...over });
const WALL = 1_000_000;

describe('nudge gate', () => {
  it('never shows a moment twice, also after seeking back', () => {
    const mo = m({ importance: 0.95 });
    let g = markShown(newGate(), mo, WALL);
    g = onSeek(g, 50_000);
    assert.deepEqual(decide(mo, profile(), g, 120_000, WALL + 60_000), { show: false, why: 'shown' });
  });

  it('never shows the future, and drops moments that are old news', () => {
    assert.equal((decide(m({ t: 200_000 }), profile(), newGate(), 100_000, WALL) as { why: string }).why, 'future');
    assert.equal((decide(m({ importance: 0.95 }), profile(), newGate(), 100_000 + GATE.freshMs + 1, WALL) as { why: string }).why, 'stale');
  });

  it('beginners get more cards than experts for the same moment', () => {
    const mo = m({ importance: 0.6 });
    assert.equal(decide(mo, profile('new'), newGate(), 100_000, WALL).show, true);
    assert.equal(decide(mo, profile('expert'), newGate(), 100_000, WALL).show, false);
  });

  it('a busy viewer only gets critical cards', () => {
    const g = { ...newGate(), lastInteract: WALL - 1000 };
    assert.equal((decide(m({ importance: 0.7 }), profile(), g, 100_000, WALL) as { why: string }).why, 'busy');
    assert.equal(decide(m({ importance: 0.95 }), profile(), g, 100_000, WALL).show, true);
  });

  it('cooldown spaces normal cards but lets a critical one through', () => {
    const g = markShown(newGate(), m({ id: 'a', t: 90_000 }), WALL);
    assert.equal(decide(m({ id: 'b', importance: 0.7 }), profile(), g, 100_000, WALL + 10_000).show, false);
    assert.equal(decide(m({ id: 'c', importance: 1 }), profile(), g, 100_000, WALL + 10_000).show, true);
  });

  it('a concept already demonstrated raises the bar', () => {
    const mo = m({ importance: 0.55, concepts: ['pit_stop'] }), p = profile('new');
    assert.equal(decide(mo, p, newGate(), 100_000, WALL).show, true);
    const known = { ...introduce(p, ['pit_stop']), concepts: { ...p.concepts, pit_stop: 'demonstrated' as const } };
    assert.equal(decide(mo, known, newGate(), 100_000, WALL).show, false);
  });

  it('over the whole real race a beginner gets a readable number of cards, an expert fewer', () => {
    const run = (level: 'new' | 'expert') => {
      let g = newGate(), wall = 0, n = 0;
      const p = profile(level);
      for (let t = 0; t <= MOMENTS.at(-1)!.t + 1000; t += 1000) {
        wall += 100;                                         // 10x playback
        const pick = pickNudge(MOMENTS, p, g, t, wall);
        if (pick) { g = markShown(g, pick.moment, wall); n++; }
      }
      return n;
    };
    const beginner = run('new'), expert = run('expert');
    assert.ok(beginner >= 6 && beginner <= 16, `beginner cards: ${beginner}`);
    assert.ok(expert < beginner, `expert ${expert} < beginner ${beginner}`);
  });
});

describe('nudge gate: repeats', () => {
  it('a second moment of the same kind soon after is held back unless it is big', () => {
    const g = markShown(newGate(), m({ id: 'a', type: 'position_gain', t: 100_000 }), WALL);
    const later = WALL + 60_000;
    assert.deepEqual(decide(m({ id: 'b', type: 'position_gain', t: 300_000, importance: 0.7 }), profile(), g, 300_000, later), { show: false, why: 'repeat' });
    assert.equal(decide(m({ id: 'c', type: 'position_gain', t: 300_000, importance: 0.86 }), profile(), g, 300_000, later).show, true);
    assert.equal(decide(m({ id: 'd', type: 'pit_stop', t: 300_000, importance: 0.7 }), profile(), g, 300_000, later).show, true);
  });
});
