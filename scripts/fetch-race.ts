// Data pipeline: download the 2024 São Paulo Grand Prix from OpenF1 once, normalize it, and write a replayable local
// dataset. The demo never calls OpenF1 at run time.
//   npm run data            (raw responses are cached in data/raw; delete a file there to download it again)
// Output: data/race.json (timing, pits, tyres, race control, weather, track outline) and data/cars.json (car location
// resampled to 1 Hz). session_result is not downloaded: the server has no reason to hold the final classification.
import fs from 'node:fs';
import path from 'node:path';
import type { CarFrames, Chapter, Compound, ControlRow, Driver, GapRow, LapRow, OvertakeRow, PitRow, PosRow, RaceData, Stint, TrackShape, WeatherRow } from '../src/shared/types.ts';

const SESSION = 9636;
const API = 'https://api.openf1.org/v1';
const ORIGIN = Date.parse('2024-11-03T15:49:00Z');      // one minute before lights out (aborted start already done)
const END_PAD = 60_000;                                   // keep one minute after the chequered flag
const STEP = 1000;                                        // car location frame step
const NO_SIGNAL_MS = 15_000;                              // no location sample this close: hide the car
const ROOT = path.resolve(import.meta.dirname, '..');
const RAW = path.join(ROOT, 'data/raw');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rel = (iso: string) => Date.parse(iso) - ORIGIN;

async function raw<T>(file: string, query: string): Promise<T> {
  const f = path.join(RAW, `${file}.json`);
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8')) as T;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${API}/${query}`);
    if (res.ok) {
      const text = await res.text();
      fs.writeFileSync(f, text);
      await sleep(400);                                   // stay under the free rate limit
      return JSON.parse(text) as T;
    }
    if (attempt >= 5) throw new Error(`${query}: HTTP ${res.status}`);
    console.warn(`${query}: HTTP ${res.status}, retry ${attempt}`);
    await sleep(2000 * attempt);
  }
}

type Row = Record<string, any>;

async function main() {
  fs.mkdirSync(RAW, { recursive: true });
  const q = (e: string) => raw<Row[]>(e, `${e}?session_key=${SESSION}`);
  const [drivers, laps, position, intervals, pit, stints, control, weather, overtakes] = await Promise.all(
    ['drivers', 'laps', 'position', 'intervals', 'pit', 'stints', 'race_control', 'weather', 'overtakes'].map(q));

  const lightsOutIso = laps.filter((l) => l.lap_number === 1 && l.date_start).map((l) => l.date_start as string).sort()[0];
  const lightsOut = rel(lightsOutIso);
  const flagRows = control.filter((c) => c.flag === 'CHEQUERED');
  if (!flagRows.length) throw new Error('No chequered flag in race control');
  const duration = rel(flagRows[0].date) + END_PAD;

  // ---- normalize ----
  const D: Driver[] = drivers.map((d) => ({ n: d.driver_number, code: d.name_acronym, name: `${d.first_name} ${d.last_name}`, team: d.team_name, colour: `#${d.team_colour}` }))
    .sort((a, b) => a.n - b.n);

  const positions: PosRow[] = [];
  const grid = new Map<number, Row>();                    // last position before the replay starts = the grid
  for (const p of position) {
    const t = rel(p.date);
    if (t < 0) grid.set(p.driver_number, p); else if (t <= duration) positions.push({ t, n: p.driver_number, pos: p.position });
  }
  positions.unshift(...[...grid.values()].map((p) => ({ t: 0, n: p.driver_number, pos: p.position })));
  positions.sort((a, b) => a.t - b.t || a.pos - b.pos);

  const lappedOf = (v: unknown) => (typeof v === 'string' ? Number(/\+(\d+)/.exec(v)?.[1] ?? 1) : 0);
  const gaps: GapRow[] = intervals.map((r) => ({ t: rel(r.date), n: r.driver_number, gap: typeof r.gap_to_leader === 'number' ? r.gap_to_leader : null, lapped: lappedOf(r.gap_to_leader) }))
    .filter((g) => g.t >= 0 && g.t <= duration).sort((a, b) => a.t - b.t);

  const lapRows: LapRow[] = laps.map((l) => ({ t: l.date_start ? rel(l.date_start) : l.lap_number === 1 ? lightsOut : NaN, n: l.driver_number, lap: l.lap_number }))
    .filter((l) => Number.isFinite(l.t) && l.t <= duration).sort((a, b) => a.t - b.t);

  const C: ControlRow[] = control.map((c) => ({ t: rel(c.date), lap: c.lap_number ?? 0, category: c.category, flag: c.flag ?? null, message: c.message }))
    .filter((c) => c.t >= -30 * 60_000 && c.t <= duration).sort((a, b) => a.t - b.t);

  // red-flag window: from RED FLAG to two minutes after the session restarts (cars leave the pit lane in order)
  const red = C.find((c) => c.flag === 'RED');
  const restart = red && C.find((c) => c.t > red.t && c.category === 'SessionStatus' && /STARTED/.test(c.message));
  const inRed = (t: number) => !!red && !!restart && t >= red.t && t <= restart.t + 120_000;

  const pits: PitRow[] = pit.map((p) => ({ t: rel(p.date), n: p.driver_number, lap: p.lap_number, laneS: p.lane_duration ?? p.pit_duration ?? null, stopS: p.stop_duration ?? null, underRedFlag: inRed(rel(p.date)) }))
    .filter((p) => p.t >= 0 && p.t <= duration).sort((a, b) => a.t - b.t);

  const S: Stint[] = stints.map((s) => ({ n: s.driver_number, stint: s.stint_number, lapStart: s.lap_start, lapEnd: s.lap_end, compound: (s.compound ?? 'UNKNOWN') as Compound, ageAtStart: s.tyre_age_at_start ?? 0 }))
    .sort((a, b) => a.n - b.n || a.stint - b.stint);

  const W: WeatherRow[] = weather.map((w) => ({ t: rel(w.date), rain: w.rainfall > 0, air: w.air_temperature, track: w.track_temperature, humidity: w.humidity }))
    .filter((w) => w.t <= duration).sort((a, b) => a.t - b.t);

  const O: OvertakeRow[] = overtakes.map((o) => ({ t: rel(o.date), by: o.overtaking_driver_number, on: o.overtaken_driver_number, pos: o.position }))
    .filter((o) => o.t >= 0 && o.t <= duration).sort((a, b) => a.t - b.t);

  // ---- car location: one request per driver, resampled to 1 Hz ----
  const locs = new Map<number, Row[]>();
  const from = new Date(ORIGIN - 10_000).toISOString(), to = new Date(ORIGIN + duration + 10_000).toISOString();
  for (const d of D) {
    console.log(`location ${d.code}`);
    locs.set(d.n, await raw<Row[]>(`location-${d.n}`, `location?session_key=${SESSION}&driver_number=${d.n}&date>${from}&date<${to}`));
  }

  // track outline: the leader's lap 10 (green flag, full speed)
  const ver = locs.get(1)!, l10 = lapRows.find((l) => l.n === 1 && l.lap === 10)!, l11 = lapRows.find((l) => l.n === 1 && l.lap === 11)!;
  const lapPts = ver.map((p) => ({ t: rel(p.date), x: p.x as number, y: p.y as number })).filter((p) => p.t >= l10.t && p.t <= l11.t && (p.x || p.y));
  const xs = lapPts.map((p) => p.x), ys = lapPts.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const pad = 0.05 * Math.max(maxX - minX, maxY - minY), span = Math.max(maxX - minX, maxY - minY) + 2 * pad;
  const sx = (x: number) => Math.round(((x - minX + pad) / span) * 1000), sy = (y: number) => Math.round(((maxY - y + pad) / span) * 1000);
  const every = Math.max(1, Math.floor(lapPts.length / 360));
  const track: TrackShape = { path: lapPts.filter((_, i) => i % every === 0).map((p) => [sx(p.x), sy(p.y)]), width: sx(maxX) + Math.round(pad / span * 1000), height: sy(minY) + Math.round(pad / span * 1000) };

  const frames = Math.floor(duration / STEP) + 1;
  const cars: CarFrames = { stepMs: STEP, frames, cars: {} };
  for (const [n, rows] of locs) {
    const pts = rows.map((p) => ({ t: rel(p.date), x: p.x as number, y: p.y as number })).filter((p) => p.x || p.y).sort((a, b) => a.t - b.t);
    const out: number[] = new Array(frames * 2);
    let j = 0;
    for (let f = 0; f < frames; f++) {
      const t = f * STEP;
      while (j < pts.length - 1 && pts[j + 1].t <= t) j++;
      const a = pts[j], b = pts[j + 1];
      if (!a || Math.abs(a.t - t) > NO_SIGNAL_MS && (!b || Math.abs(b.t - t) > NO_SIGNAL_MS)) { out[2 * f] = -1; out[2 * f + 1] = -1; continue; }
      const k = b && b.t > a.t && t >= a.t ? Math.min(1, (t - a.t) / (b.t - a.t)) : 0;
      out[2 * f] = sx(a.x + (b ? (b.x - a.x) * k : 0));
      out[2 * f + 1] = sy(a.y + (b ? (b.y - a.y) * k : 0));
    }
    cars.cars[n] = out;
  }

  // ---- demo chapters (neutral labels: they never say what happens next) ----
  const leaderLapStart = (lap: number) => lapRows.find((l) => l.lap === lap)?.t ?? 0;
  const chapters: Chapter[] = [
    { id: 'start', t: Math.max(0, lightsOut - 8000), label: 'Lights out' },
    { id: 'l27', t: leaderLapStart(27), label: 'Lap 27' },
    { id: 'l31', t: leaderLapStart(31), label: 'Lap 31' },
    { id: 'restart', t: (restart?.t ?? 0) - 20_000, label: 'Restart' },
    { id: 'l42', t: leaderLapStart(42), label: 'Lap 42' },
    { id: 'final', t: leaderLapStart(66), label: 'Final laps' },
  ];

  const race: RaceData = {
    meta: { sessionKey: SESSION, title: '2024 São Paulo Grand Prix', circuit: 'Interlagos', year: 2024, originUtc: new Date(ORIGIN).toISOString(), lightsOut, duration, totalLaps: Math.max(...lapRows.map((l) => l.lap)), source: 'OpenF1 (api.openf1.org), historical data' },
    drivers: D, positions, gaps, laps: lapRows, pits, stints: S, control: C, weather: W, overtakes: O, track, chapters,
  };

  validate(race);
  fs.writeFileSync(path.join(ROOT, 'data/race.json'), JSON.stringify(race));
  fs.writeFileSync(path.join(ROOT, 'data/cars.json'), JSON.stringify(cars));
  const kb = (f: string) => Math.round(fs.statSync(path.join(ROOT, f)).size / 1024);
  console.log(`race.json ${kb('data/race.json')} KB, cars.json ${kb('data/cars.json')} KB, ${D.length} drivers, ${race.meta.totalLaps} laps, ${Math.round(duration / 60000)} min`);
}

/** Fail the build when the data is not in time order or refers to unknown drivers. */
function validate(r: RaceData) {
  const known = new Set(r.drivers.map((d) => d.n));
  const lists: [string, { t: number; n?: number }[]][] = [['positions', r.positions], ['gaps', r.gaps], ['laps', r.laps], ['pits', r.pits], ['control', r.control], ['weather', r.weather], ['overtakes', r.overtakes]];
  for (const [name, rows] of lists) {
    for (let i = 1; i < rows.length; i++) if (rows[i].t < rows[i - 1].t) throw new Error(`${name} is not in time order at row ${i}`);
    for (const row of rows) if (row.n !== undefined && !known.has(row.n)) throw new Error(`${name}: unknown driver ${row.n}`);
  }
  if (r.track.path.length < 100) throw new Error('Track outline is too short');
}

main().catch((e) => { console.error(e); process.exit(1); });
