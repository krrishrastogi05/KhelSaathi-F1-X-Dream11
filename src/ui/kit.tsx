// Small shared pieces: formatting, icons, tyre and status badges.
import type { Compound, Driver, TrackStatus } from '../shared/types';

export const fmtClock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(x).padStart(2, '0')}`;
};
export const fmtGap = (gap: number | null, lapped: number) => (lapped ? `+${lapped} LAP` : gap === null ? '—' : gap === 0 ? 'LEADER' : `+${gap.toFixed(1)}`);

export const TYRE: Record<Compound, { label: string; color: string }> = {
  SOFT: { label: 'S', color: '#ff4d4d' }, MEDIUM: { label: 'M', color: '#ffd23f' }, HARD: { label: 'H', color: '#eef0f5' },
  INTERMEDIATE: { label: 'I', color: '#3ccf4e' }, WET: { label: 'W', color: '#3a8dff' }, UNKNOWN: { label: '?', color: '#7d8396' },
};

export const STATUS: Record<TrackStatus, { label: string; cls: string }> = {
  pre: { label: 'PRE-RACE', cls: 'st-pre' }, green: { label: 'GREEN', cls: 'st-green' }, yellow: { label: 'YELLOW', cls: 'st-yellow' },
  vsc: { label: 'VIRTUAL SAFETY CAR', cls: 'st-vsc' }, sc: { label: 'SAFETY CAR', cls: 'st-sc' }, red: { label: 'RED FLAG', cls: 'st-red' },
  chequered: { label: 'CHEQUERED', cls: 'st-cheq' },
};

export function TyreDot({ c, size = 18 }: { c: Compound; size?: number }) {
  const t = TYRE[c];
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" className="tyre" aria-label={c.toLowerCase()}>
      <circle cx="10" cy="10" r="8.2" fill="#0b0c10" stroke={t.color} strokeWidth="2.6" />
      <text x="10" y="13.6" textAnchor="middle" fontSize="10" fontWeight="700" fill={t.color} fontFamily="Barlow Condensed">{t.label}</text>
    </svg>
  );
}

export const StatusPill = ({ s }: { s: TrackStatus }) => <span className={`status ${STATUS[s].cls}`}><i />{STATUS[s].label}</span>;

export const driverOf = (drivers: Driver[], n: number) => drivers.find((d) => d.n === n);

type IconName = 'play' | 'pause' | 'back' | 'fwd' | 'send' | 'spark' | 'x' | 'chev' | 'phone' | 'rain' | 'link' | 'bat' | 'check' | 'book' | 'flag' | 'volume' | 'mute' | 'chart' | 'arrow';
const PATHS: Record<IconName, string> = {
  play: 'M7 4.5v15l12-7.5z', pause: 'M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z',
  back: 'M11 6 5 12l6 6M19 6l-6 6 6 6', fwd: 'm13 6 6 6-6 6M5 6l6 6-6 6',
  send: 'M4 12 20 4l-6 16-3-7z', spark: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6',
  x: 'M6 6l12 12M18 6 6 18', chev: 'm6 9 6 6 6-6', phone: 'M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11 18h2',
  rain: 'M7 15a4 4 0 1 1 1.5-7.7A5 5 0 0 1 18 9a3.5 3.5 0 0 1 0 7H7zM9 18l-1 2.5M13 18l-1 2.5M17 18l-1 2.5',
  link: 'M10 14a4 4 0 0 0 5.6 0l3-3a4 4 0 0 0-5.6-5.6l-1 1M14 10a4 4 0 0 0-5.6 0l-3 3a4 4 0 0 0 5.6 5.6l1-1',
  bat: 'M14.5 3.5l6 6-9 9-3-3zM8.5 15.5 4 20M5 4.5a1.8 1.8 0 1 0 0 .1',
  check: 'm5 12.5 4.5 4.5L19 7.5', book: 'M5 4.5h9a3 3 0 0 1 3 3v12H8a3 3 0 0 1-3-3zM17 19.5h2V7', flag: 'M6 21V4M6 4h11l-2 4 2 4H6',
  volume: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11', mute: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4zM16 9.5l5 5M21 9.5l-5 5',
  chart: 'M4 19.5h16M7 16V11M12 16V6.5M17 16v-3', arrow: 'M5 12h14M13 6l6 6-6 6',
};
export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={name === 'play' || name === 'pause' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name]} />
    </svg>
  );
}

export function Brand({ small }: { small?: boolean }) {
  return (
    <span className={`brand ${small ? 'small' : ''}`}>
      <svg viewBox="0 0 64 64" width={small ? 20 : 26} height={small ? 20 : 26} aria-hidden><path d="M12 46c8-22 24-28 40-26" fill="none" stroke="var(--accent)" strokeWidth="7" strokeLinecap="round" /><circle cx="51" cy="19" r="7" fill="var(--data)" /></svg>
      <b>KHEL</b><span>SAATHI</span>
    </span>
  );
}
