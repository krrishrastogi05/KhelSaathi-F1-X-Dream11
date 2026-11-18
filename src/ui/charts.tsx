// The four chart components. Hand-made SVG, no chart library: each draws only the data the server computed at the
// session's current time, so a chart never shows a lap that has not happened. Hover (or touch) shows exact values.
import { useMemo, useState, type PointerEvent } from 'react';
import type { Driver, GapsViz, PositionsViz, ThenNowViz, TyresViz, VizData } from '../shared/types';
import { TYRE, driverOf } from './kit';

const W = 360, PAD = { l: 30, r: 46, t: 14, b: 24 };

export function Viz({ data, drivers }: { data: VizData; drivers: Driver[] }) {
  switch (data.type) {
    case 'positions': return <PositionsChart d={data} drivers={drivers} />;
    case 'tyres': return <TyresChart d={data} drivers={drivers} />;
    case 'gaps': return <GapsChart d={data} drivers={drivers} />;
    case 'then_now': return <ThenNow d={data} />;
  }
}

/** One plain sentence on top of a chart, from its own numbers: what a beginner should see in it. */
export function takeaway(d: VizData, drivers: Driver[]): string {
  const code = (n: number) => driverOf(drivers, n)?.code ?? `#${n}`;
  switch (d.type) {
    case 'positions': {
      const s = d.series[0]; if (!s) return 'Positions so far';
      const a = s.points[0][1], b = s.points[s.points.length - 1][1], g = a - b;
      return `${code(s.n)}: P${a} → P${b}${g > 0 ? `, ${g} places gained` : g < 0 ? `, ${-g} places lost` : ''}`;
    }
    case 'tyres': {
      const out = d.rows.filter((r) => !r.stops.some((x) => !x.redFlag)).map((r) => code(r.n));
      const stopped = d.rows.filter((r) => r.stops.some((x) => !x.redFlag)).map((r) => code(r.n));
      return stopped.length && out.length ? `${out.join(', ')} have not stopped. ${stopped.join(', ')} have.` : stopped.length ? `${stopped.join(', ')} have made a pit stop` : `No pit stops yet for ${out.join(', ')}`;
    }
    case 'gaps': {
      const last = d.series.map((s) => ({ n: s.n, g: [...s.points].reverse().find((p) => p[1] !== null)?.[1] ?? null })).filter((x) => x.g !== null && x.g > 0);
      return last.length ? `${code(last[0].n)} is ${last[0].g!.toFixed(1)} s behind the leader` : 'Gaps to the leader';
    }
    case 'then_now': return d.history.title;
  }
}

/** Colours per driver: team colour, but a teammate in the same chart gets a dashed line. */
function useColours(ns: number[], drivers: Driver[]) {
  return useMemo(() => {
    const seen = new Set<string>();
    return Object.fromEntries(ns.map((n) => {
      const d = driverOf(drivers, n), team = d?.team ?? String(n), dash = seen.has(team);
      seen.add(team);
      return [n, { colour: d?.colour ?? '#aaa', dash, code: d?.code ?? `#${n}` }];
    })) as Record<number, { colour: string; dash: boolean; code: string }>;
  }, [ns.join(','), drivers]);
}

function useHover(width: number, toValue: (x: number) => number) {
  const [x, setX] = useState<number | null>(null);
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect(), px = ((e.clientX - r.left) / r.width) * width;
    setX(px < PAD.l || px > width - PAD.r ? null : toValue(px));
  };
  return { value: x, bind: { onPointerMove: onMove, onPointerDown: onMove, onPointerLeave: () => setX(null) } };
}

const Marks = ({ marks, sx, top, bottom }: { marks: { lap: number; label: string }[]; sx: (l: number) => number; top: number; bottom: number }) => (
  <g className="marks">
    {marks.map((m, i) => (
      <g key={i} className={`mark mark-${m.label.toLowerCase()}`}>
        <line x1={sx(m.lap)} x2={sx(m.lap)} y1={top} y2={bottom} />
        <text x={sx(m.lap) + 3} y={top + 8}>{m.label}</text>
      </g>
    ))}
  </g>
);

export function PositionsChart({ d, drivers }: { d: PositionsViz; drivers: Driver[] }) {
  const H = 210, maxLap = Math.max(d.upToLap, 5);
  const allPos = d.series.flatMap((s) => s.points.map((p) => p[1]));
  const lo = Math.max(1, Math.min(...allPos) - 1), hi = Math.min(20, Math.max(...allPos) + 1);
  const sx = (l: number) => PAD.l + (l / maxLap) * (W - PAD.l - PAD.r), sy = (p: number) => PAD.t + ((p - lo) / Math.max(1, hi - lo)) * (H - PAD.t - PAD.b);
  const col = useColours(d.series.map((s) => s.n), drivers);
  const hover = useHover(W, (px) => Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * maxLap));
  const ticks = [...new Set([lo, Math.round((lo + hi) / 2), hi])];
  const at = (pts: [number, number][], lap: number) => [...pts].reverse().find((p) => p[0] <= lap)?.[1];
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} {...hover.bind} role="img" aria-label="Position by lap">
        {ticks.map((p) => <g key={p} className="grid"><line x1={PAD.l} x2={W - PAD.r} y1={sy(p)} y2={sy(p)} /><text x={PAD.l - 6} y={sy(p) + 3} textAnchor="end">P{p}</text></g>)}
        <Marks marks={d.marks} sx={sx} top={PAD.t} bottom={H - PAD.b} />
        {d.series.map((s) => {
          const path = s.points.map(([l, p], i) => `${i ? 'L' : 'M'}${sx(l).toFixed(1)},${sy(p).toFixed(1)}`).join(' ');
          const last = s.points[s.points.length - 1], c = col[s.n];
          return (
            <g key={s.n}>
              <path d={path} className="line draw" stroke={c.colour} strokeDasharray={c.dash ? '5 4' : undefined} pathLength={1} />
              <circle cx={sx(last[0])} cy={sy(last[1])} r="4" fill={c.colour} className="end" />
              <text x={sx(last[0]) + 7} y={sy(last[1]) + 4} className="end-label" fill={c.colour}>{c.code} P{last[1]}</text>
            </g>
          );
        })}
        <text x={sx(0)} y={H - 6} className="axis">Grid</text>
        <text x={W - PAD.r} y={H - 6} textAnchor="end" className="axis">Lap {d.upToLap}</text>
        {hover.value !== null && (
          <g className="hover">
            <line x1={sx(hover.value)} x2={sx(hover.value)} y1={PAD.t} y2={H - PAD.b} />
            <text x={sx(hover.value)} y={H - PAD.b + 12} textAnchor="middle">L{hover.value}</text>
            {d.series.map((s, i) => { const p = at(s.points, hover.value!); return p ? <text key={s.n} x={Math.min(sx(hover.value!) + 6, W - 80)} y={PAD.t + 22 + i * 13} fill={col[s.n].colour}>{col[s.n].code} P{p}</text> : null; })}
          </g>
        )}
      </svg>
      <figcaption>Position at the start of each lap · lower is better · from OpenF1 timing</figcaption>
    </figure>
  );
}

export function TyresChart({ d, drivers }: { d: TyresViz; drivers: Driver[] }) {
  const row = 30, H = PAD.t + d.rows.length * row + 22, maxLap = Math.max(d.upToLap, 10), L = 44;
  const sx = (l: number) => L + ((l - 1) / Math.max(1, maxLap - 1 + 1)) * (W - L - 14);
  const col = useColours(d.rows.map((r) => r.n), drivers);
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Tyre stints">
        <Marks marks={d.marks} sx={sx} top={PAD.t - 6} bottom={H - 20} />
        {d.rows.map((r, i) => {
          const y = PAD.t + i * row;
          return (
            <g key={r.n}>
              <text x={L - 8} y={y + 15} textAnchor="end" className="row-label" fill={col[r.n].colour}>{col[r.n].code}</text>
              {r.stints.map((s, j) => {
                const x0 = sx(s.from), x1 = Math.max(sx(s.to + 1) - 2, x0 + 4), c = TYRE[s.compound].color;
                return (
                  <g key={j} className="stint">
                    <rect x={x0} y={y + 4} width={x1 - x0} height={16} rx="4" fill={c} opacity={0.88} />
                    {s.open && <rect x={x1 - 3} y={y + 2} width={3} height={20} rx="1.5" fill="#fff" className="now-tick" />}
                    {x1 - x0 > 26 && <text x={x0 + 6} y={y + 16} className="stint-label">{TYRE[s.compound].label} · {s.to - s.from + 1}L</text>}
                  </g>
                );
              })}
              {r.stops.map((s, j) => <path key={j} d={`M${sx(s.lap)},${y + 1} l-4,-5 h8z`} className={s.redFlag ? 'stop red' : 'stop'} transform={`translate(0 ${s.redFlag ? 0 : 0})`} />)}
            </g>
          );
        })}
        <text x={L} y={H - 4} className="axis">Lap 1</text>
        <text x={W - 14} y={H - 4} textAnchor="end" className="axis">Lap {d.upToLap} (now)</text>
      </svg>
      <figcaption>
        {[...new Set(d.rows.flatMap((r) => r.stints.map((s) => s.compound)))].map((c) => <span key={c} className="legend"><i style={{ background: TYRE[c].color }} />{c.toLowerCase()}</span>)}
        <span className="legend"><i className="tri" />pit stop</span><span className="legend"><i className="tri red" />tyres changed in red flag</span>
      </figcaption>
    </figure>
  );
}

export function GapsChart({ d, drivers }: { d: GapsViz; drivers: Driver[] }) {
  const H = 200, xs = d.series[0]?.points.map((p) => p[0]) ?? [0, 1], x0 = xs[0], x1 = xs[xs.length - 1] || x0 + 1;
  const vals = d.series.flatMap((s) => s.points.map((p) => p[1]).filter((v): v is number => v !== null));
  const max = Math.max(5, ...vals) * 1.08;
  const sx = (x: number) => PAD.l + ((x - x0) / Math.max(1, x1 - x0)) * (W - PAD.l - PAD.r), sy = (g: number) => PAD.t + (g / max) * (H - PAD.t - PAD.b);
  const col = useColours(d.series.map((s) => s.n), drivers);
  const hover = useHover(W, (px) => x0 + ((px - PAD.l) / (W - PAD.l - PAD.r)) * (x1 - x0));
  const near = (pts: [number, number | null][], x: number) => pts.reduce((b, p) => (Math.abs(p[0] - x) < Math.abs(b[0] - x) ? p : b), pts[0]);
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} {...hover.bind} role="img" aria-label="Gap to leader">
        {[0, max / 2, max].map((g) => <g key={g} className="grid"><line x1={PAD.l} x2={W - PAD.r} y1={sy(g)} y2={sy(g)} /><text x={PAD.l - 6} y={sy(g) + 3} textAnchor="end">{g === 0 ? 'P1' : `+${g.toFixed(0)}s`}</text></g>)}
        {d.series.map((s) => {
          let path = '', pen = false;
          for (const [x, g] of s.points) { if (g === null) { pen = false; continue; } path += `${pen ? 'L' : 'M'}${sx(x).toFixed(1)},${sy(g).toFixed(1)}`; pen = true; }
          const last = [...s.points].reverse().find((p) => p[1] !== null), c = col[s.n];
          return (
            <g key={s.n}>
              <path d={path} className="line draw" stroke={c.colour} strokeDasharray={c.dash ? '5 4' : undefined} pathLength={1} />
              {last && <text x={sx(last[0]) + 5} y={sy(last[1]!) + 4} className="end-label" fill={c.colour}>{c.code}</text>}
            </g>
          );
        })}
        <text x={PAD.l} y={H - 6} className="axis">{Math.round((x1 - x0) / 60)} min ago</text>
        <text x={W - PAD.r} y={H - 6} textAnchor="end" className="axis">now</text>
        {hover.value !== null && (
          <g className="hover">
            <line x1={sx(hover.value)} x2={sx(hover.value)} y1={PAD.t} y2={H - PAD.b} />
            {d.series.map((s, i) => { const p = near(s.points, hover.value!); return <text key={s.n} x={Math.min(sx(hover.value!) + 6, W - 96)} y={PAD.t + 22 + i * 13} fill={col[s.n].colour}>{col[s.n].code} {p[1] === null ? 'no timing' : p[1] === 0 ? 'leader' : `+${p[1].toFixed(1)}s`}</text>; })}
          </g>
        )}
      </svg>
      <figcaption>{d.note}</figcaption>
    </figure>
  );
}

export function ThenNow({ d }: { d: ThenNowViz }) {
  return (
    <figure className="thennow">
      <div className="tn-cols">
        <div className="tn then">
          <span className="tn-tag">THEN · {d.history.season}</span>
          <b>{d.history.race}</b>
          <em>{d.history.title}</em>
          <dl>{d.then.map((f) => <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}</dl>
        </div>
        <div className="tn-vs">vs</div>
        <div className="tn now">
          <span className="tn-tag">NOW · LIVE REPLAY</span>
          <b>São Paulo GP 2024</b>
          <em>{d.now.find((f) => f.label === 'Conditions')?.value ?? 'Unfolding now'}</em>
          <dl>{d.now.map((f) => <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}</dl>
        </div>
      </div>
      <p className="tn-summary">{d.history.summary}</p>
      <figcaption>Verified history · <a href={d.history.source} target="_blank" rel="noreferrer">source</a></figcaption>
    </figure>
  );
}
