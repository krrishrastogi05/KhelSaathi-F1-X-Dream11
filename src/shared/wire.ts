// Messages on the sync stream (Server-Sent Events). The server owns the clock; clients only render.
// Every message has a per-connection seq (drop anything not newer) and the clock version v, which goes up on every
// play, pause, seek or speed change (drop ticks from an older version: they were sent before a seek landed).
import type { Card, Moment, Ms, Profile, RaceState } from './types';

export const SPEEDS = [1, 4, 10, 30] as const;

export interface ClockView { v: number; t: Ms; playing: boolean; speed: number; duration: Ms }
export interface Presence { tv: number; phone: number }
/** say: the broadcast commentary line for this moment (spoken on the TV) */
export interface MomentView { id: string; t: Ms; type: Moment['type']; lap: number; importance: number; label: string; say: string; drivers: number[] }

export interface Snapshot extends ClockView {
  type: 'snapshot'; seq: number; sessionId: string; state: RaceState; cars: number[];
  cards: Card[]; profile: Profile | null; moments: MomentView[]; presence: Presence;
}
export interface Tick extends ClockView { type: 'tick'; seq: number; state: RaceState; cars: number[] }
export interface CardMsg { type: 'card'; seq: number; v: number; card: Card }
export interface MomentMsg { type: 'moment'; seq: number; v: number; moment: MomentView }
export interface PresenceMsg { type: 'presence'; seq: number; presence: Presence }
export interface ProfileMsg { type: 'profile'; seq: number; profile: Profile }
export type ServerMsg = Snapshot | Tick | CardMsg | MomentMsg | PresenceMsg | ProfileMsg;

/** Should a client apply this message? Pure, shared with the tests. */
export function accept(last: { seq: number; v: number }, msg: ServerMsg): 'apply' | 'drop' | 'resync' {
  if (msg.type === 'snapshot') return 'apply';
  if (msg.seq <= last.seq) return 'drop';
  if ('v' in msg) {
    if (msg.v < last.v) return 'drop';
    if (msg.v > last.v) return 'resync';                    // a clock change we never saw: ask for a fresh snapshot
  }
  return 'apply';
}

/** Car positions at t from the 1 Hz frames, linearly interpolated: [n, x, y, n, x, y, ...], x = -1 when hidden. */
export function carsAt(frames: { stepMs: number; frames: number; cars: Record<string, number[]> }, t: Ms): number[] {
  const f = Math.max(0, Math.min(frames.frames - 1, Math.floor(t / frames.stepMs))), k = Math.min(1, Math.max(0, t / frames.stepMs - f));
  const g = Math.min(frames.frames - 1, f + 1), out: number[] = [];
  for (const [n, xy] of Object.entries(frames.cars)) {
    const x0 = xy[2 * f], y0 = xy[2 * f + 1], x1 = xy[2 * g], y1 = xy[2 * g + 1];
    if (x0 < 0) { out.push(Number(n), -1, -1); continue; }
    const ok = x1 >= 0 && Math.abs(x1 - x0) + Math.abs(y1 - y0) < 120;  // do not slide across the map when a car jumps (pit lane, retirement)
    out.push(Number(n), Math.round(ok ? x0 + (x1 - x0) * k : x0), Math.round(ok ? y0 + (y1 - y0) * k : y0));
  }
  return out;
}

/** A message before the server stamps its seq (Omit over each member of the union). */
export type Unsent = { [K in ServerMsg['type']]: Omit<Extract<ServerMsg, { type: K }>, 'seq'> }[ServerMsg['type']];
