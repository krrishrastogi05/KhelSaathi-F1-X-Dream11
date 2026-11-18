// The nudge gate: decides if a detected moment becomes a card on the phone right now. It is the difference between a
// companion and a notification firehose. Inputs: importance, the viewer's level and concept knowledge, time since the
// last nudge (race time and wall time), whether the viewer is busy asking something, and whether it was shown before.
// A moment that is blocked stays a candidate while it is fresh, so a short cooldown delays a card instead of dropping it.
import type { Level, Moment, Ms, Profile } from './types';

export interface GateState {
  /** moment id -> wall time shown; never shown twice, also after seeking back */
  shown: Record<string, number>;
  lastWall: number; lastRaceT: Ms;
  /** wall time of the viewer's last question or tap; busy viewers only get critical cards */
  lastInteract: number;
  /** moment type -> race time of the last card of that type: the same story is not explained twice in a row */
  lastByType: Record<string, Ms>;
}

export const GATE = {
  freshMs: 90_000,          // a moment older than this (race time) is history, not news: no card
  raceGapMs: 75_000,        // normal cards need this much race time since the last card
  wallGapMs: 6_000,         // and this much wall time (fast playback must not stack cards)
  criticalWallGapMs: 2_500,
  busyMs: 20_000,
  repeatMs: 10 * 60_000,    // the same kind of moment within 10 race minutes needs repeatBar importance
  repeatBar: 0.85,
  critical: 0.9,
  threshold: { new: 0.5, basics: 0.62, expert: 0.78 } satisfies Record<Level, number>,
};

// -1e12 rather than -Infinity: the state is saved as JSON, which has no Infinity
export const NEVER = -1e12;
export const newGate = (): GateState => ({ shown: {}, lastWall: NEVER, lastRaceT: NEVER, lastInteract: NEVER, lastByType: {} });

export type Verdict = { show: true; reason: string } | { show: false; why: 'shown' | 'future' | 'stale' | 'low' | 'repeat' | 'busy' | 'cooldown' };

/** Pure decision for one moment at race time t and wall time wall. */
export function decide(m: Moment, p: Profile, g: GateState, t: Ms, wall: number): Verdict {
  if (g.shown[m.id] !== undefined) return { show: false, why: 'shown' };
  if (m.t > t) return { show: false, why: 'future' };
  if (t - m.t > GATE.freshMs) return { show: false, why: 'stale' };
  const unknown = m.concepts.filter((c) => p.concepts[c] === 'new');
  const allKnown = m.concepts.every((c) => p.concepts[c] === 'demonstrated');
  const threshold = GATE.threshold[p.level] - (unknown.length ? 0.12 : 0) + (allKnown ? 0.1 : 0);
  const critical = m.importance >= GATE.critical;
  if (!critical && m.importance < threshold) return { show: false, why: 'low' };
  const lastSame = g.lastByType?.[m.type] ?? NEVER;
  if (!critical && m.importance < GATE.repeatBar && m.t >= lastSame && m.t - lastSame < GATE.repeatMs) return { show: false, why: 'repeat' };
  if (!critical && wall - g.lastInteract < GATE.busyMs) return { show: false, why: 'busy' };
  if (wall - g.lastWall < (critical ? GATE.criticalWallGapMs : GATE.wallGapMs)) return { show: false, why: 'cooldown' };
  if (!critical && m.t - g.lastRaceT < GATE.raceGapMs && m.t >= g.lastRaceT) return { show: false, why: 'cooldown' };
  return { show: true, reason: reasonFor(m, p, unknown.length > 0, critical) };
}

/** Pick at most one card from the candidates: the most important that passes. */
export function pickNudge(moments: Moment[], p: Profile, g: GateState, t: Ms, wall: number): { moment: Moment; reason: string } | null {
  const candidates = moments.filter((m) => m.t <= t && t - m.t <= GATE.freshMs && g.shown[m.id] === undefined)
    .sort((a, b) => b.importance - a.importance || b.t - a.t);
  for (const m of candidates) { const v = decide(m, p, g, t, wall); if (v.show) return { moment: m, reason: v.reason }; }
  return null;
}

export const markShown = (g: GateState, m: Moment, wall: number): GateState =>
  ({ ...g, shown: { ...g.shown, [m.id]: wall }, lastWall: wall, lastRaceT: Math.max(g.lastRaceT, m.t), lastByType: { ...g.lastByType, [m.type]: m.t } });

/** Seeking backwards resets the race-time cooldown so the next moment is not blocked by a card from "the future". */
export const onSeek = (g: GateState, t: Ms): GateState => ({
  ...g, lastRaceT: g.lastRaceT > t ? NEVER : g.lastRaceT,
  lastByType: Object.fromEntries(Object.entries(g.lastByType ?? {}).filter(([, x]) => x <= t)),
});

function reasonFor(m: Moment, p: Profile, newConcept: boolean, critical: boolean): string {
  const en = p.lang === 'en';
  const imp = critical ? (en ? 'Race-changing moment' : 'Race badalne wala moment') : m.importance >= 0.75 ? (en ? 'Big moment' : 'Bada moment') : (en ? 'Worth knowing' : 'Jaanne layak');
  const learn = newConcept ? (en ? ' · new idea for you' : ' · aapke liye naya concept') : '';
  return `${imp}${learn} · lap ${m.lap}`;
}
