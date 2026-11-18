// Test helpers: load the real race once, and cut it at a time T to get "the race as known at T".
import fs from 'node:fs';
import path from 'node:path';
import { detectMoments } from '../../src/shared/detect';
import { indexRace, lapAt } from '../../src/shared/race';
import type { CarFrames, Profile, RaceData } from '../../src/shared/types';
import { startingConcepts } from '../../src/shared/concepts';

const dir = path.resolve(import.meta.dirname, '../../data');
export const DATA = JSON.parse(fs.readFileSync(path.join(dir, 'race.json'), 'utf8')) as RaceData;
export const FRAMES = JSON.parse(fs.readFileSync(path.join(dir, 'cars.json'), 'utf8')) as CarFrames;
export const IX = indexRace(DATA);
export const MOMENTS = detectMoments(IX);
export const utc = (hms: string) => Date.parse(`2024-11-03T${hms}Z`) - Date.parse(DATA.meta.originUtc);
export const profile = (level: Profile['level'] = 'new', lang: Profile['lang'] = 'en'): Profile => ({ level, lang, concepts: startingConcepts(level) });

/** The race data with everything after T removed, as a server that only ever saw a live feed up to T would have it.
 *  Stints that have started are kept, with the end lap of a running stint unknown (cut to the driver's lap at T). */
export function truncate(d: RaceData, T: number): RaceData {
  const cut = <R extends { t: number }>(rows: R[]) => rows.filter((r) => r.t <= T);
  const ix = indexRace(d), lap = lapAt(ix, T);
  const myLap = (n: number) => Math.max(1, ...d.laps.filter((l) => l.n === n && l.t <= T).map((l) => l.lap));
  return {
    ...d, positions: cut(d.positions), gaps: cut(d.gaps), laps: cut(d.laps), pits: cut(d.pits), control: cut(d.control), weather: cut(d.weather), overtakes: cut(d.overtakes),
    stints: d.stints.filter((s) => s.lapStart <= Math.max(lap, myLap(s.n))).map((s) => ({ ...s, lapEnd: Math.min(s.lapEnd, myLap(s.n)) })),
  };
}
