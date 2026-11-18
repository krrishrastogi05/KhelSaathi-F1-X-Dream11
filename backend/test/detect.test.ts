// Detectors and race state against the real 2024 São Paulo data: the three demo scenes must be found, at the right
// times, the same way on every run.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { detectMoments } from '../../src/shared/detect';
import { indexRace, stateAt, statusAt, code } from '../../src/shared/race';
import { buildViz } from '../../src/shared/viz';
import { DATA, IX, MOMENTS, utc } from './helpers';

const find = (id: string) => MOMENTS.find((m) => m.id === id);

describe('moment detection', () => {
  it('is reproducible: same data, same moments', () => {
    assert.deepEqual(detectMoments(indexRace(structuredClone(DATA))), MOMENTS);
  });

  it('every moment has an id, a time, an importance and evidence', () => {
    assert.equal(new Set(MOMENTS.map((m) => m.id)).size, MOMENTS.length);
    for (const m of MOMENTS) {
      assert.ok(m.t >= 0 && m.t <= DATA.meta.duration, m.id);
      assert.ok(m.importance > 0 && m.importance <= 1, m.id);
      assert.ok(m.evidence.length > 0, m.id);
    }
  });

  it('scene 2: finds Verstappen\'s opening burst and the 10-place charge', () => {
    const burst = MOMENTS.find((m) => m.type === 'position_gain' && m.facts.driver === 'VER' && m.lap === 1)!;
    assert.ok(burst, 'lap-1 burst');
    assert.equal(burst.facts.from, 17);
    assert.ok(Number(burst.facts.gain) >= 4);
    const charge = find('charge-VER')!;
    assert.equal(charge.facts.from, 17);
    assert.ok(Number(charge.facts.to) <= 7);
    assert.ok(Math.abs(charge.t - utc('16:03:19')) < 2000);
  });

  it('scene 3: VSC, safety car, red flag at the race-control times, then the restart order', () => {
    assert.ok(Math.abs(find('vsc-28')!.t - utc('16:28:21')) < 1000);
    assert.ok(Math.abs(find('safety_car-30')!.t - utc('16:32:53')) < 1000);
    const red = find('red_flag-32')!;
    assert.ok(Math.abs(red.t - utc('16:37:22')) < 1000);
    assert.equal(red.importance, 1);
    const strategy = find('red-strategy')!;
    assert.ok(strategy.t > red.t);
    assert.equal(strategy.facts.leader, 'OCO');
    assert.match(String(strategy.facts.stopped), /NOR/);
    assert.match(String(strategy.facts.stayed), /VER/);
  });

  it('scene 3: the leaders\' stops around the VSC are a cheap pit window', () => {
    const w = MOMENTS.find((m) => m.type === 'pit_stop' && m.tags.includes('cheap_stop') && String(m.facts.leaders).includes('NOR'));
    assert.ok(w, 'cheap pit window with NOR');
  });

  it('scene 4: Verstappen takes the lead on a wet track, tagged as a comeback', () => {
    const lead = MOMENTS.find((m) => m.type === 'lead_change' && m.facts.driver === 'VER')!;
    assert.ok(Math.abs(lead.t - utc('17:20:17')) < 1000);
    assert.deepEqual(['wet', 'comeback'].filter((t) => lead.tags.includes(t)), ['wet', 'comeback']);
  });
});

describe('race state', () => {
  it('reads the track status from race control', () => {
    assert.equal(statusAt(IX, utc('16:29:00')), 'vsc');
    assert.equal(statusAt(IX, utc('16:40:00')), 'red');
    assert.equal(statusAt(IX, utc('17:15:00')), 'sc');
    assert.equal(statusAt(IX, utc('17:25:00')), 'green');
  });

  it('classification at the red flag puts Ocon in front', () => {
    const s = stateAt(IX, utc('16:38:00'));
    assert.equal(code(IX, s.cars[0].n), 'OCO');
    assert.equal(s.cars.length, DATA.drivers.length);
    assert.deepEqual(s.cars.map((c) => c.pos), [...s.cars.map((c) => c.pos)].sort((a, b) => a - b));
  });

  it('tyre chart never shows the end of a stint that is still running', () => {
    const t = utc('16:20:00'), viz = buildViz(IX, MOMENTS, t, { type: 'tyres', drivers: [1] });
    assert.ok(viz && viz.type === 'tyres');
    const last = viz.rows[0].stints.at(-1)!;
    assert.equal(last.open, true);
    assert.ok(last.to <= stateAt(IX, t).lap);
  });

  it('position chart stops at the current lap', () => {
    const t = utc('16:10:00'), lap = stateAt(IX, t).lap, viz = buildViz(IX, MOMENTS, t, { type: 'positions', drivers: [1] });
    assert.ok(viz && viz.type === 'positions');
    assert.ok(viz.series[0].points.every(([l]) => l <= lap));
  });
});

describe('race state: pit lane', () => {
  it('after the red-flag restart no car is shown as in the pit lane', () => {
    assert.deepEqual(stateAt(IX, utc('17:25:00')).cars.filter((c) => c.inPit).map((c) => code(IX, c.n)), []);
  });
  it('a racing stop shows the car in the pit lane for the stop only', () => {
    const p = DATA.pits.find((x) => !x.underRedFlag)!;
    assert.equal(stateAt(IX, p.t + 5000).cars.find((c) => c.n === p.n)!.inPit, true);
    assert.equal(stateAt(IX, p.t + 120_000).cars.find((c) => c.n === p.n)!.inPit, false);
  });
});
