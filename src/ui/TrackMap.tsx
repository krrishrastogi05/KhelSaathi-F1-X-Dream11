// The circuit with every car on it. The server sends car positions about four times a second; between ticks the map
// tweens from the previous to the latest position with requestAnimationFrame, writing straight to the SVG nodes so
// React does not re-render 20 cars at 60 fps.
import { useEffect, useMemo, useRef } from 'react';
import { useStore } from '../store';
import type { Driver, TrackShape } from '../shared/types';

const TWEEN_MS = 260;

export function TrackMap({ track, drivers, leaders }: { track: TrackShape; drivers: Driver[]; leaders: number[] }) {
  const refs = useRef(new Map<number, SVGGElement>());
  const d = useMemo(() => `M${track.path.map((p) => p.join(',')).join(' L')} Z`, [track]);
  const box = useMemo(() => {
    const xs = track.path.map((p) => p[0]), ys = track.path.map((p) => p[1]), pad = 60;
    return `${Math.min(...xs) - pad} ${Math.min(...ys) - pad} ${Math.max(...xs) - Math.min(...xs) + 2 * pad} ${Math.max(...ys) - Math.min(...ys) + 2 * pad}`;
  }, [track]);

  useEffect(() => {
    let raf = 0;
    const frame = () => {
      const { cars, prevCars, carsAt, jump } = useStore.getState();
      const k = jump ? 1 : Math.min(1, (performance.now() - carsAt) / TWEEN_MS);
      const prev = new Map<number, [number, number]>();
      for (let i = 0; i < prevCars.length; i += 3) prev.set(prevCars[i], [prevCars[i + 1], prevCars[i + 2]]);
      for (let i = 0; i < cars.length; i += 3) {
        const g = refs.current.get(cars[i]); if (!g) continue;
        const x = cars[i + 1], y = cars[i + 2], p = prev.get(cars[i]);
        if (x < 0) { g.style.opacity = '0'; continue; }
        const ok = p && p[0] >= 0 && Math.abs(p[0] - x) + Math.abs(p[1] - y) < 140;
        const cx = ok ? p![0] + (x - p![0]) * k : x, cy = ok ? p![1] + (y - p![1]) * k : y;
        g.style.opacity = '1';
        g.setAttribute('transform', `translate(${cx.toFixed(1)} ${cy.toFixed(1)})`);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <svg className="trackmap" viewBox={box} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Interlagos circuit with live car positions">
      <defs>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="9" /></filter>
      </defs>
      <path d={d} className="track-glow" filter="url(#glow)" />
      <path d={d} className="track-base" />
      <path d={d} className="track-line" />
      <circle cx={track.path[0][0]} cy={track.path[0][1]} r="9" className="start-line" />
      {drivers.map((dr) => {
        const lead = leaders.indexOf(dr.n);
        return (
          <g key={dr.n} ref={(el) => { if (el) refs.current.set(dr.n, el); }} className={`car ${lead === 0 ? 'p1' : ''}`} style={{ opacity: 0 }}>
            {lead === 0 && <circle r="26" className="halo" />}
            <circle r={lead >= 0 && lead < 3 ? 15 : 12} fill={dr.colour} stroke="#05060a" strokeWidth="4" />
            {lead === 0 && <text y="-30" textAnchor="middle" className="car-label">P1 {dr.code}</text>}
          </g>
        );
      })}
    </svg>
  );
}
