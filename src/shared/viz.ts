// Chart data, always computed from the race index at the session's current time t. The AI only picks a chart type and
// drivers; every number on screen comes from here. A stint that is still running shows as open, so its end lap
// (known to the server, not to the viewer) never leaks.
import { historyById } from './history';
import { code, gridOf, lapAt, lastAt, stateAt, wetAt, type RaceIndex } from './race';
import type { Moment, Ms, VizData, VizRequest, VizType } from './types';

const marksUpTo = (moments: Moment[], t: Ms) => moments.filter((m) => m.t <= t && (m.type === 'vsc' || m.type === 'safety_car' || m.type === 'red_flag'))
  .map((m) => ({ lap: m.lap, label: m.type === 'vsc' ? 'VSC' : m.type === 'safety_car' ? 'SC' : 'RED' }));

/** Drivers for a chart: the requested ones that exist, else the current top 5. */
function pickDrivers(ix: RaceIndex, t: Ms, drivers: number[], max: number): number[] {
  const ok = drivers.filter((n) => ix.drivers.has(n)).slice(0, max);
  return ok.length ? ok : stateAt(ix, t).cars.slice(0, Math.min(5, max)).map((c) => c.n);
}

export function buildViz(ix: RaceIndex, moments: Moment[], t: Ms, req: VizRequest): VizData | null {
  const lap = lapAt(ix, t);
  switch (req.type) {
    case 'positions': {
      const series = pickDrivers(ix, t, req.drivers, 4).map((n) => {
        const d = ix.drivers.get(n)!, points: [number, number][] = [[0, d.grid]];
        for (const l of d.laps) if (l.t <= t) points.push([l.lap, lastAt(d.pos, l.t)?.pos ?? d.grid]);
        const now = lastAt(d.pos, t)?.pos ?? d.grid, myLap = lastAt(d.laps, t)?.lap ?? 0;
        if (points[points.length - 1][1] !== now) points.push([Math.max(myLap, 0.5), now]);
        return { n, points };
      });
      return { type: 'positions', upToLap: Math.max(1, lap), series, marks: marksUpTo(moments, t) };
    }
    case 'tyres': {
      const rows = pickDrivers(ix, t, req.drivers, 6).map((n) => {
        const d = ix.drivers.get(n)!, myLap = Math.max(1, lastAt(d.laps, t)?.lap ?? 1);
        const started = d.stints.filter((s) => s.lapStart <= myLap);
        return {
          n, stints: started.map((s, i) => { const open = i === started.length - 1; return { from: s.lapStart, to: open ? myLap : s.lapEnd, compound: s.compound, open }; }),
          stops: d.pits.filter((p) => p.t <= t).map((p) => ({ lap: p.lap, redFlag: p.underRedFlag })),
        };
      });
      return { type: 'tyres', upToLap: Math.max(1, lap), rows, marks: marksUpTo(moments, t) };
    }
    case 'gaps': {
      const from = Math.max(ix.data.meta.lightsOut, t - 12 * 60_000), step = 15_000;
      const series = pickDrivers(ix, t, req.drivers, 5).map((n) => {
        const gaps = ix.drivers.get(n)!.gaps, points: [number, number | null][] = [];
        for (let x = from; x <= t; x += step) {
          const g = lastAt(gaps, x);
          points.push([Math.round((x - ix.data.meta.lightsOut) / 1000), g && x - g.t < 60_000 && g.gap !== null ? g.gap : null]);
        }
        return { n, points };
      });
      return { type: 'gaps', t, series, note: 'Gap to the leader in seconds (OpenF1 timing). Breaks mean no timing: a lapped car, the pit lane or a stopped race.' };
    }
    case 'then_now': {
      const h = req.historyId ? historyById(req.historyId) : null;
      if (!h) return null;
      const n = pickDrivers(ix, t, req.drivers, 1)[0], s = stateAt(ix, t), car = s.cars.find((c) => c.n === n)!;
      return {
        type: 'then_now', history: h, then: h.facts,
        now: [
          { label: 'Driver', value: code(ix, n) }, { label: 'Started', value: `P${gridOf(ix, n)}` },
          { label: 'Now', value: `P${car.pos} · lap ${s.lap}/${s.totalLaps}` },
          { label: 'Conditions', value: wetAt(ix, t) ? `Wet · ${car.compound.toLowerCase()} tyres` : 'Dry' },
        ],
      };
    }
  }
}

const VIZ_TYPES: VizType[] = ['positions', 'tyres', 'gaps', 'then_now'];

/** Validate a chart request from the AI or the client: known type, known drivers, at most six. */
export function validateVizRequest(x: unknown, ix: RaceIndex): VizRequest | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  if (!VIZ_TYPES.includes(o.type as VizType)) return null;
  const raw = Array.isArray(o.drivers) ? o.drivers : [];
  const drivers = raw.map((d) => (typeof d === 'number' ? d : ix.data.drivers.find((x) => x.code === String(d).toUpperCase())?.n))
    .filter((n): n is number => typeof n === 'number' && ix.drivers.has(n)).slice(0, 6);
  const historyId = typeof o.historyId === 'string' && historyById(o.historyId) ? o.historyId : undefined;
  if (o.type === 'then_now' && !historyId) return null;
  return { type: o.type as VizType, drivers, ...(historyId ? { historyId } : {}) };
}
