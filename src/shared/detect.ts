// Deterministic moment detectors. They run once over the whole race when the server starts; the replay clock then
// reveals each moment only when t passes moment.t. Same data in, same moments out (see backend/test/detect.test.ts).
// Each moment carries its evidence, marked observed (straight from OpenF1) or derived (computed here).
// Burst importance favours a real comeback (5+ places from the grid) and gains into the top 10.
import { code, gridOf, lapAt, lastAt, stateAt, statusAt, upTo, wetAt, type RaceIndex } from './race';
import type { Evidence, Moment, Ms, PitRow } from './types';

const MIN = 60_000;
const BURST_WINDOW = 5 * MIN;     // a burst: 4+ places gained inside 5 minutes
const BURST_PLACES = 4;
const CHARGE_PLACES = 10;          // a charge: 10+ places gained from the grid
const PIT_GROUP = 150_000;         // stops this close together form one pit window
const clamp = (x: number) => Math.max(0, Math.min(1, Math.round(x * 100) / 100));

export function detectMoments(ix: RaceIndex): Moment[] {
  const out = [...positionGains(ix), ...pitWindows(ix), ...neutralisations(ix), ...redFlagStrategy(ix), ...leadChanges(ix)];
  return out.sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
}

const ev = (source: Evidence['source'], t: Ms, text: string, kind: Evidence['kind'] = 'observed'): Evidence => ({ source, t, text, kind });

function positionGains(ix: RaceIndex): Moment[] {
  const out: Moment[] = [];
  const { lightsOut } = ix.data.meta;
  for (const [n, d] of ix.drivers) {
    const grid = d.grid;
    let window: { t: Ms; pos: number }[] = [{ t: lightsOut, pos: grid }], charged = false, lastBurst = -Infinity;
    for (const row of d.pos) {
      if (row.t < lightsOut) continue;
      window = window.filter((w) => w.t >= row.t - BURST_WINDOW);
      if (!window.length || window[0].t > row.t - BURST_WINDOW) {
        const before = lastAt(d.pos, row.t - BURST_WINDOW);
        window.unshift({ t: row.t - BURST_WINDOW, pos: before && before.t >= lightsOut ? before.pos : grid });
      }
      window.push({ t: row.t, pos: row.pos });
      const worst = Math.max(...window.map((w) => w.pos)), gain = worst - row.pos;
      if (gain >= BURST_PLACES && row.t - lastBurst > BURST_WINDOW && statusAt(ix, row.t) !== 'red') {
        const passed = ix.data.overtakes.filter((o) => o.by === n && o.t >= row.t - BURST_WINDOW && o.t <= row.t);
        const pitted = passed.filter((o) => ix.data.pits.some((p) => p.n === o.on && p.t <= row.t && p.t >= o.t - 90_000)).length;
        const lap = lapAt(ix, row.t), ownStop = d.pits.some((p) => p.t >= row.t - BURST_WINDOW && p.t <= row.t);
        // places that came from pit cycles (own stop, or most cars passed were in the pits) are not overtakes
        if (ownStop || passed.length - pitted < gain / 2) { lastBurst = row.t; window = [{ t: row.t, pos: row.pos }]; continue; }
        out.push({
          id: `gain-${code(ix, n)}-${Math.round(row.t / 1000)}`, t: row.t, type: 'position_gain', lap, drivers: [n],
          importance: clamp(0.4 + 0.05 * gain + (grid - row.pos >= 5 ? 0.1 : 0) + (row.pos <= 10 ? 0.05 : 0) - (pitted > gain / 2 ? 0.2 : 0)),
          concepts: ['overtaking'], tags: ['gain', ...(wetAt(ix, row.t) ? ['wet'] : []), ...(grid >= 10 ? ['comeback'] : [])],
          evidence: [
            ev('position', row.t, `${code(ix, n)} P${worst} → P${row.pos} within ${Math.round((row.t - window[0].t) / 1000)} s`),
            ev('overtakes', row.t, `${passed.length} position swaps recorded, ${pitted} of them with the other car in the pits`, 'derived'),
          ],
          facts: { driver: code(ix, n), from: worst, to: row.pos, gain, grid, onTrack: passed.length - pitted },
        });
        lastBurst = row.t; window = [{ t: row.t, pos: row.pos }];
      }
      if (!charged && grid - row.pos >= CHARGE_PLACES) {
        charged = true;
        out.push({
          id: `charge-${code(ix, n)}`, t: row.t + 1, type: 'position_gain', lap: lapAt(ix, row.t), drivers: [n], importance: 0.85,
          concepts: ['overtaking', 'strategy'], tags: ['gain', 'charge', 'comeback', ...(wetAt(ix, row.t) ? ['wet'] : [])],
          evidence: [ev('position', 0, `${code(ix, n)} started P${grid}`), ev('position', row.t, `${code(ix, n)} now P${row.pos}`)],
          facts: { driver: code(ix, n), from: grid, to: row.pos, gain: grid - row.pos, grid, laps: lapAt(ix, row.t) },
        });
      }
    }
  }
  return out;
}

/** Racing pit stops grouped into windows. A stop under a VSC or safety car costs less time, so it matters more. */
function pitWindows(ix: RaceIndex): Moment[] {
  const stops = ix.data.pits.filter((p) => !p.underRedFlag), out: Moment[] = [];
  const groups: PitRow[][] = [];
  for (const p of stops) { const g = groups[groups.length - 1]; if (g && p.t - g[0].t <= PIT_GROUP) g.push(p); else groups.push([p]); }
  for (const g of groups) {
    // the moment is dated at the last stop of the window, so it never names a stop before it happens.
    // A stop counts as cheap when the field was neutralised at the stop or up to 45 s before (cars commit on the last lap).
    const t = g[g.length - 1].t, first = g[0].t, status = [statusAt(ix, first), statusAt(ix, first - 45_000)].find((s) => s === 'vsc' || s === 'sc') ?? statusAt(ix, first), cheap = status === 'vsc' || status === 'sc';
    const state = stateAt(ix, first - 1000), posOf = (n: number) => state.cars.find((c) => c.n === n)?.pos ?? 20;
    const drivers = [...new Set(g.map((p) => p.n))].sort((a, b) => posOf(a) - posOf(b)), top = Math.min(...drivers.map(posOf));
    const importance = clamp(0.25 + (cheap ? 0.35 : 0) + (top <= 3 ? 0.2 : top <= 6 ? 0.1 : 0) + Math.min(0.1, g.length * 0.02));
    const fastest = g.filter((p) => p.stopS).sort((a, b) => a.stopS! - b.stopS!)[0];
    out.push({
      id: `pit-${Math.round(t / 1000)}`, t, type: 'pit_stop', lap: lapAt(ix, t), drivers, importance,
      concepts: cheap ? ['pit_stop', 'strategy', 'safety_car'] : ['pit_stop', 'tyres'], tags: ['pit', ...(cheap ? ['cheap_stop'] : [])],
      evidence: [
        ev('pit', first, `${drivers.map((n) => `${code(ix, n)} (P${posOf(n)})`).join(', ')} entered the pit lane`),
        ...(cheap ? [ev('race_control', first, `${status === 'vsc' ? 'Virtual safety car' : 'Safety car'} active at the time`)] : []),
        ...(fastest ? [ev('pit', fastest.t, `Fastest stationary time ${fastest.stopS!.toFixed(1)} s (${code(ix, fastest.n)})`)] : []),
      ],
      facts: { count: drivers.length, leaders: drivers.filter((n) => posOf(n) <= 6).map((n) => code(ix, n)).join(', '), top, status, driver: code(ix, drivers[0]) },
    });
  }
  return out;
}

function neutralisations(ix: RaceIndex): Moment[] {
  const out: Moment[] = [];
  for (const c of ix.data.control) {
    if (c.t < ix.data.meta.lightsOut) continue;
    const kind = c.flag === 'RED' ? 'red_flag' : /VIRTUAL SAFETY CAR DEPLOYED/.test(c.message) ? 'vsc' : /^SAFETY CAR DEPLOYED/.test(c.message) ? 'safety_car' : /SESSION STARTED/.test(c.message) && statusAt(ix, c.t - 1000) === 'red' ? 'restart' : null;
    if (!kind) continue;
    const lap = lapAt(ix, c.t), cause = [...upTo(ix.data.control, c.t)].reverse().find((x) => x.t > c.t - 90_000 && /INCIDENT|STOPPED|CRASH/.test(x.message));
    out.push({
      id: `${kind}-${lap}`, t: c.t, type: kind, lap, drivers: [],
      importance: kind === 'red_flag' ? 1 : kind === 'safety_car' ? 0.8 : kind === 'vsc' ? 0.7 : 0.65,
      concepts: kind === 'red_flag' ? ['red_flag', 'strategy'] : kind === 'restart' ? ['safety_car'] : ['safety_car'],
      tags: [kind, ...(wetAt(ix, c.t) ? ['wet'] : [])],
      evidence: [ev('race_control', c.t, c.message), ...(cause ? [ev('race_control', cause.t, cause.message)] : [])],
      facts: { lap, laps: ix.data.meta.totalLaps },
    });
  }
  return out;
}

/** After a red flag, race control publishes the restart order. Compare it with the order before the stoppage and with
 *  who made a racing stop in the laps before: a red flag allows tyre changes, so earlier stops lose their cost. */
function redFlagStrategy(ix: RaceIndex): Moment[] {
  const red = ix.data.control.find((c) => c.flag === 'RED'), order = red && ix.data.control.find((c) => c.t > red.t && /ORDER FOR RESTART/.test(c.message));
  if (!red || !order) return [];
  const restartOrder = (order.message.split(':')[1] ?? '').split(',').map((s) => Number(s.trim())).filter(Number.isFinite);
  const before = stateAt(ix, red.t - 1000), front = before.cars.slice(0, 8);
  const since = red.t - 10 * MIN;
  const stopped = front.filter((c) => (ix.drivers.get(c.n)?.pits ?? []).some((p) => !p.underRedFlag && p.t >= since && p.t < red.t)).map((c) => c.n);
  const stayed = front.filter((c) => !stopped.includes(c.n)).map((c) => c.n);
  return [{
    id: 'red-strategy', t: order.t, type: 'red_flag_strategy', lap: lapAt(ix, order.t), drivers: restartOrder.slice(0, 5),
    importance: 0.95, concepts: ['strategy', 'red_flag', 'pit_stop'], tags: ['red_flag', 'strategy', 'wet'],
    evidence: [
      ev('race_control', order.t, order.message),
      ev('pit', red.t, `Racing stops in the 10 minutes before the red flag: ${stopped.map((n) => code(ix, n)).join(', ') || 'none in the top 8'}`, 'derived'),
      ev('position', red.t, `Top 8 when the race stopped: ${front.map((c) => code(ix, c.n)).join(', ')}`),
    ],
    facts: { order: restartOrder.slice(0, 6).map((n) => code(ix, n)).join(', '), stopped: stopped.map((n) => code(ix, n)).join(', '), stayed: stayed.map((n) => code(ix, n)).join(', '), leader: code(ix, restartOrder[0]) },
  }];
}

function leadChanges(ix: RaceIndex): Moment[] {
  const out: Moment[] = [];
  let leader = -1;
  for (const p of ix.data.positions) {
    if (p.pos !== 1 || p.n === leader) continue;
    const prev = leader; leader = p.n;
    if (prev < 0 || p.t < ix.data.meta.lightsOut + 2 * MIN) continue;         // the start itself is not a lead change
    const grid = gridOf(ix, p.n), wet = wetAt(ix, p.t), lap = lapAt(ix, p.t);
    out.push({
      id: `lead-${code(ix, p.n)}-${lap}`, t: p.t, type: 'lead_change', lap, drivers: [p.n, prev],
      importance: clamp(0.75 + (grid >= 10 ? 0.15 : 0) + (wet ? 0.05 : 0)), concepts: ['overtaking', 'tyres'],
      tags: ['lead', ...(wet ? ['wet'] : []), ...(grid >= 10 ? ['comeback'] : []), 'interlagos'],
      evidence: [ev('position', p.t, `${code(ix, p.n)} P1, ${code(ix, prev)} P2`), ev('position', 0, `${code(ix, p.n)} started P${grid}`),
        ...(wet ? [ev('stints', p.t, 'Field on intermediate tyres (wet track)', 'derived')] : [])],
      facts: { driver: code(ix, p.n), passed: code(ix, prev), grid, lap, laps: ix.data.meta.totalLaps },
    });
  }
  return out;
}
