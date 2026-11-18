// Race state at a replay time t. This is the only door to the race data: every caller (live ticks, AI context,
// charts) asks "what is true at t" here, so nothing after t can reach the viewer. Pure functions, no I/O.
import type { CarState, ControlRow, GapRow, LapRow, Ms, PitRow, PosRow, RaceData, RaceState, Stint, TrackStatus } from './types';

interface DriverIndex { pos: PosRow[]; gaps: GapRow[]; laps: LapRow[]; pits: PitRow[]; stints: Stint[]; grid: number }
export interface RaceIndex { data: RaceData; drivers: Map<number, DriverIndex>; status: { t: Ms; status: TrackStatus }[]; leaderLaps: LapRow[] }

/** Last row with row.t <= t (rows sorted by t), or undefined. */
export function lastAt<T extends { t: Ms }>(rows: T[], t: Ms): T | undefined {
  let lo = 0, hi = rows.length - 1, found = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (rows[mid].t <= t) { found = mid; lo = mid + 1; } else hi = mid - 1; }
  return found >= 0 ? rows[found] : undefined;
}
/** Rows with row.t <= t. */
export const upTo = <T extends { t: Ms }>(rows: T[], t: Ms): T[] => { const last = lastAt(rows, t); return last ? rows.slice(0, rows.indexOf(last) + 1) : []; };

export function indexRace(data: RaceData): RaceIndex {
  const drivers = new Map<number, DriverIndex>();
  for (const d of data.drivers) {
    const pos = data.positions.filter((p) => p.n === d.n);
    drivers.set(d.n, {
      pos, gaps: data.gaps.filter((g) => g.n === d.n), laps: data.laps.filter((l) => l.n === d.n),
      pits: data.pits.filter((p) => p.n === d.n), stints: data.stints.filter((s) => s.n === d.n), grid: pos[0]?.pos ?? 20,
    });
  }
  // the race lap at t is the highest lap any car has started (the leader's lap)
  const leaderLaps: LapRow[] = [];
  for (const l of data.laps) if (!leaderLaps.length || l.lap > leaderLaps[leaderLaps.length - 1].lap) leaderLaps.push(l);
  return { data, drivers, status: statusTimeline(data.control, data.meta.lightsOut, leaderLaps), leaderLaps };
}

/** Track status changes from race control messages (observed), as a time-ordered list. After a red flag the race
 *  resumes with a rolling start behind the safety car, which peels off at the end of that lap (derived from lap times). */
function statusTimeline(control: ControlRow[], lightsOut: Ms, leaderLaps: LapRow[]): { t: Ms; status: TrackStatus }[] {
  const out: { t: Ms; status: TrackStatus }[] = [{ t: -Infinity, status: 'pre' }, { t: lightsOut, status: 'green' }];
  let current = 'green' as TrackStatus, rollingUntil = Infinity;
  const set = (t: Ms, s: TrackStatus) => { if (s !== current) { current = s; out.push({ t, status: s }); } };
  for (const c of control) {
    if (c.t < lightsOut) continue;
    if (c.t >= rollingUntil) { set(rollingUntil, 'green'); rollingUntil = Infinity; }
    if (/ROLLING START/.test(c.message)) rollingUntil = leaderLaps.find((l) => l.t > c.t)?.t ?? Infinity;
    const m = c.message;
    if (c.flag === 'CHEQUERED') set(c.t, 'chequered');
    else if (c.flag === 'RED') set(c.t, 'red');
    else if (/VIRTUAL SAFETY CAR DEPLOYED/.test(m)) set(c.t, 'vsc');
    else if (/^SAFETY CAR DEPLOYED/.test(m)) set(c.t, 'sc');
    else if (/VIRTUAL SAFETY CAR ENDING/.test(m)) set(c.t, 'green');
    else if (current === 'red' && c.category === 'SessionStatus' && /STARTED/.test(m)) set(c.t, 'sc');   // rolling restart behind the safety car
    else if (current === 'sc' && /SAFETY CAR IN THIS LAP/.test(m)) continue;
    else if ((current === 'sc' || current === 'vsc') && /TRACK CLEAR|GREEN LIGHT/.test(m) && !/PIT EXIT/.test(m)) set(c.t, 'green');
  }
  return out;
}

export const statusAt = (ix: RaceIndex, t: Ms): TrackStatus => lastAt(ix.status, t)!.status;
export const lapAt = (ix: RaceIndex, t: Ms): number => lastAt(ix.leaderLaps, t)?.lap ?? 0;
export const gridOf = (ix: RaceIndex, n: number): number => ix.drivers.get(n)?.grid ?? 20;
export const code = (ix: RaceIndex, n: number): string => ix.data.drivers.find((d) => d.n === n)?.code ?? `#${n}`;
export const byCode = (ix: RaceIndex, c: string): number | undefined => ix.data.drivers.find((d) => d.code === c.toUpperCase())?.n;

/** The tyre stint a driver is on at lap `lap`. Only stints that have started are visible; the end lap is never shown. */
export function stintAt(ix: RaceIndex, n: number, lap: number): { compound: Stint['compound']; age: number; stint: number; from: number } | null {
  const s = [...(ix.drivers.get(n)?.stints ?? [])].reverse().find((x) => x.lapStart <= Math.max(1, lap));
  return s ? { compound: s.compound, age: s.ageAtStart + Math.max(0, lap - s.lapStart), stint: s.stint, from: s.lapStart } : null;
}

/** Racing pit stops a driver has made by t (pit-lane passes under the red flag are not counted). */
export const pitsBy = (ix: RaceIndex, n: number, t: Ms): PitRow[] => upTo(ix.drivers.get(n)?.pits ?? [], t).filter((p) => !p.underRedFlag);

export function stateAt(ix: RaceIndex, t: Ms): RaceState {
  const lap = lapAt(ix, t), weather = lastAt(ix.data.weather, t);
  const cars: CarState[] = [];
  for (const [n, d] of ix.drivers) {
    const pos = lastAt(d.pos, t)?.pos ?? d.grid, g = lastAt(d.gaps, t), myLap = lastAt(d.laps, t)?.lap ?? 0;
    const stint = stintAt(ix, n, myLap || 1), lastPit = lastAt(d.pits, t);
    cars.push({
      n, pos, gap: g?.gap ?? null, lapped: g?.lapped ?? 0, interval: null, lap: myLap,
      compound: stint?.compound ?? 'UNKNOWN', tyreAge: stint?.age ?? 0, pits: pitsBy(ix, n, t).length,
      // racing stops only (red-flag pit-lane waits last minutes), lane time capped at 45 s
      inPit: !!lastPit && !lastPit.underRedFlag && t - lastPit.t < Math.min(lastPit.laneS ?? 25, 45) * 1000, gained: d.grid - pos,
    });
  }
  cars.sort((a, b) => a.pos - b.pos);
  for (let i = 1; i < cars.length; i++) {
    const a = cars[i - 1], b = cars[i];
    if (a.gap !== null && b.gap !== null) b.interval = Math.round((b.gap - a.gap) * 1000) / 1000;
  }
  const lastControl = [...upTo(ix.data.control, t)].reverse().find((c) => c.t >= t - 45_000 && (c.flag || c.category === 'SafetyCar' || c.category === 'SessionStatus')) ?? null;
  return {
    t, lap, totalLaps: ix.data.meta.totalLaps, status: t < ix.data.meta.lightsOut ? 'pre' : statusAt(ix, t),
    rain: !!weather?.rain, air: weather?.air ?? null, trackTemp: weather?.track ?? null, cars, lastControl,
  };
}

/** True when the track counts as wet at t: rain in the last 30 minutes or most cars on intermediate or wet tyres. */
export function wetAt(ix: RaceIndex, t: Ms): boolean {
  if (upTo(ix.data.weather, t).some((w) => w.t >= t - 30 * 60_000 && w.rain)) return true;
  const s = stateAt(ix, t).cars.filter((c) => c.compound === 'INTERMEDIATE' || c.compound === 'WET');
  return s.length >= 10;
}
