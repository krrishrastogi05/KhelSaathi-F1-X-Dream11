// The "TV": a full-screen broadcast of the replay. Like a real feed, the race fills the screen and the graphics stay
// small: a lap bug, a slim top-10 tower, one lower third at a time, controls that hide. English commentary is spoken
// on big moments (fast, for people who already follow F1); the phone is where it gets explained.
import QRCode from 'qrcode';
import { useEffect, useMemo, useRef, useState } from 'react';
import { nowT, useStore } from '../store';
import { SPEEDS, type MomentView } from '../shared/wire';
import { TrackMap } from './TrackMap';
import { Brand, Icon, driverOf, fmtClock, fmtGap, STATUS } from './kit';

export function Broadcast({ id }: { id: string }) {
  const connect = useStore((s) => s.connect);
  useEffect(() => connect(id, 'tv'), [id, connect]);
  const { race, state, error, presence } = useStore();
  const [phone, setPhone] = useState(() => new URLSearchParams(location.search).has('phone'));   // ?phone=1 docks the companion (demos, recordings)
  const [voice, setVoice] = useState(true);
  const idle = useIdle(3000);
  const line = useCommentary(voice);
  if (error) return <div className="fatal"><Brand /><p>{error}</p><a className="btn" href="/">Start a new watch party</a></div>;
  if (!race || !state) return <div className="loading"><Brand /><span className="spinner" /> Loading the replay…</div>;
  const leaders = state.cars.slice(0, 3).map((c) => c.n);
  const paired = presence.phone > 0;
  return (
    <div className={`bc ${idle ? 'idle' : ''} status-${state.status} ${phone ? 'with-phone' : ''}`}>
      <div className="bc-stage">
        <TrackMap track={race.track} drivers={race.drivers} leaders={leaders} />
        {state.rain && <div className="rain" aria-hidden />}
      </div>
      <div className="bc-vignette" aria-hidden />

      <header className="bug">
        <Brand small />
        <span className="bug-live">REPLAY</span>
        <div className="bug-lap"><b>LAP {state.lap || '–'}</b><span>/ {state.totalLaps}</span></div>
        {state.status !== 'green' && state.status !== 'pre' && <span className={`bug-flag ${STATUS[state.status].cls}`}>{STATUS[state.status].label}</span>}
        {state.rain && <span className="bug-rain"><Icon name="rain" size={16} /> Rain</span>}
      </header>

      <Tower />

      <div className="bc-right">
        {paired
          ? <button className="pair-chip" onClick={() => setPhone(!phone)}><span className="dot" /> Saathi on {presence.phone} phone{presence.phone > 1 ? 's' : ''} <em>{phone ? 'Hide' : 'Show'}</em></button>
          : <PairCard id={id} onPreview={() => setPhone(true)} />}
        {paired && !phone && <button className="pair-chip ghost" onClick={() => setPhone(true)}><Icon name="phone" size={15} /> Preview companion</button>}
      </div>
      {phone && <div className="float-phone"><iframe title="Khel Saathi companion" src={`/m/${id}?embed=1`} /></div>}

      <LowerThird line={line} />
      <SaathiToast />
      <Controls voice={voice} setVoice={setVoice} />
    </div>
  );
}

/** True after `ms` without mouse or key activity (the player hides its chrome). */
function useIdle(ms: number) {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let t = setTimeout(() => setIdle(true), ms);
    const wake = () => { setIdle(false); clearTimeout(t); t = setTimeout(() => setIdle(true), ms); };
    addEventListener('pointermove', wake); addEventListener('keydown', wake);
    return () => { clearTimeout(t); removeEventListener('pointermove', wake); removeEventListener('keydown', wake); };
  }, [ms]);
  return idle;
}

/** Speaks the commentary line of each big moment as the replay passes it, in a British English voice when the
 *  browser has one. Moments already on screen after a seek or reconnect are never spoken. */
function useCommentary(enabled: boolean) {
  const moments = useStore((s) => s.moments);
  const seen = useRef<Set<string> | null>(null), lastSaid = useRef(-1e9);
  const [line, setLine] = useState<{ text: string; at: number } | null>(null);
  useEffect(() => {
    const st = useStore.getState(), t = nowT(st);
    if (!seen.current) { seen.current = new Set(moments.map((m) => m.id)); return; }
    const fresh = moments.filter((m) => !seen.current!.has(m.id));
    fresh.forEach((m) => seen.current!.add(m.id));
    // like a real commentator: only the big moments, and never talk over the last line
    const say = fresh.filter((m) => m.importance >= 0.72 && t - m.t < 8000).sort((a, b) => b.importance - a.importance)[0];
    if (!say || performance.now() - lastSaid.current < 6500) return;
    lastSaid.current = performance.now();
    setLine({ text: say.say, at: performance.now() });
    if (enabled && 'speechSynthesis' in window) speak(say.say);
  }, [moments, enabled]);
  return line;
}

function speak(text: string) {
  const synth = window.speechSynthesis, voices = synth.getVoices();
  const gb = voices.filter((v) => v.lang === 'en-GB');
  const voice = gb.find((v) => /Ryan|George|Thomas|Daniel|Arthur|UK English Male/i.test(v.name)) ?? gb[0] ?? voices.find((v) => v.lang.startsWith('en'));
  const u = new SpeechSynthesisUtterance(text);
  if (voice) u.voice = voice;
  u.rate = 1.08; u.pitch = 1.02;
  synth.cancel(); synth.speak(u);
}

function Tower() {
  const { state, race } = useStore();
  const [all, setAll] = useState(false);
  if (!state || !race) return null;
  const rows = state.cars.slice(0, all ? 20 : 10);
  return (
    <aside className="tower2">
      <ol>
        {rows.map((c) => {
          const d = driverOf(race.drivers, c.n)!;
          return (
            <li key={c.n} style={{ '--team': d.colour } as React.CSSProperties} className={c.inPit ? 'pit' : ''}>
              <span className="p">{c.pos}</span><i /><b>{d.code}</b>
              <span className="g">{c.inPit ? 'PIT' : c.pos === 1 ? 'Leader' : fmtGap(c.gap, c.lapped)}</span>
            </li>
          );
        })}
      </ol>
      <button onClick={() => setAll(!all)}>{all ? 'Top 10' : 'All 20'}</button>
    </aside>
  );
}

function PairCard({ id, onPreview }: { id: string; onPreview: () => void }) {
  const race = useStore((s) => s.race);
  const [svg, setSvg] = useState('');
  const url = useMemo(() => {
    const base = race?.publicUrl || (race?.lanIp ? `${location.protocol}//${race.lanIp}${location.port ? `:${location.port}` : ''}` : location.origin);
    return `${base}/m/${id}`;
  }, [race, id]);
  useEffect(() => { QRCode.toString(url, { type: 'svg', margin: 1, color: { dark: '#0a0b10', light: '#ffffff' } }).then(setSvg); }, [url]);
  return (
    <div className="paircard">
      <div className="qr" dangerouslySetInnerHTML={{ __html: svg }} />
      <div>
        <b>Watch with Saathi</b>
        <p>Scan to get your companion. It explains the race in Hinglish, as it happens.</p>
        <span className="code">{id.toUpperCase()}</span>
        <button className="preview-link" onClick={onPreview}>No phone? Preview here</button>
      </div>
    </div>
  );
}

/** One lower third at a time: race control flags first, then the commentary subtitle. */
function LowerThird({ line }: { line: { text: string; at: number } | null }) {
  const c = useStore((s) => s.state?.lastControl);
  const [, tick] = useState(0);
  useEffect(() => { const i = setInterval(() => tick((x) => x + 1), 500); return () => clearInterval(i); }, []);
  const showLine = line && performance.now() - line.at < 7000;
  if (c && (c.flag === 'RED' || /SAFETY CAR|CHEQUERED/.test(c.message) || c.flag === 'CHEQUERED')) {
    const cls = c.flag === 'RED' ? 'red' : c.flag === 'CHEQUERED' ? 'cheq' : 'sc';
    return <div key={c.t} className={`lower lower-${cls}`}><span>Race control</span><b>{c.message}</b></div>;
  }
  if (!showLine) return null;
  return <div key={line!.at} className="lower lower-comm"><span><Icon name="spark" size={12} /> Commentary</span><b>“{line!.text}”</b></div>;
}

/** A small toast when Saathi sends a card to the phone, so the room sees the second screen at work. */
function SaathiToast() {
  const cards = useStore((s) => s.cards);
  const last = cards.filter((c) => c.kind === 'nudge').at(-1);
  const [shown, setShown] = useState<string | null>(null);
  // announce a card once, when it is new: not the cards present on load, and not old cards that come back after a seek
  const known = useRef(new Set(cards.map((c) => c.id)));
  useEffect(() => {
    if (!last || known.current.has(last.id)) return;
    known.current.add(last.id); setShown(last.id);
    const t = setTimeout(() => setShown(null), 5000);
    return () => clearTimeout(t);
  }, [last?.id]);
  if (!last || shown !== last.id) return null;
  return <div className="toast"><span className="toast-ic"><Icon name="phone" size={15} /></span><div><em>Saathi explained this on your phone</em><b>{last.headline}</b></div></div>;
}

function Controls({ voice, setVoice }: { voice: boolean; setVoice: (v: boolean) => void }) {
  const { duration, playing, speed, race, control, moments } = useStore();
  const [drag, setDrag] = useState<number | null>(null);
  const [, tick] = useState(0);
  useEffect(() => { const i = setInterval(() => tick((x) => x + 1), 250); return () => clearInterval(i); }, []);
  const live = nowT(useStore.getState()), shown = drag ?? live;
  const pct = (x: number) => `${(x / duration) * 100}%`;
  const lightsOut = race?.meta.lightsOut ?? 0;
  const commit = () => { if (drag !== null) { void control('seek', drag); setDrag(null); } };
  return (
    <footer className={`player ${playing ? '' : 'paused'}`}>
      <div className="scenes">
        {race?.chapters.map((c, i) => <button key={c.id} onClick={() => control('seek', c.t)}><em>{String(i + 1).padStart(2, '0')}</em>{c.label}</button>)}
      </div>
      <div className="bar">
        <button className="pl-play" aria-label={playing ? 'Pause' : 'Play'} onClick={() => control(playing ? 'pause' : 'play')}><Icon name={playing ? 'pause' : 'play'} size={22} /></button>
        <button className="pl-btn" aria-label="Back 30 seconds" onClick={() => control('seek', Math.max(0, live - 30_000))}><Icon name="back" /></button>
        <button className="pl-btn" aria-label="Forward 30 seconds" onClick={() => control('seek', Math.min(duration, live + 30_000))}><Icon name="fwd" /></button>
        <span className="pl-time">{live < lightsOut ? `Start in ${fmtClock(lightsOut - live)}` : fmtClock(live - lightsOut)}</span>
        <div className="pl-rail">
          <div className="fill" style={{ width: pct(shown) }} />
          {moments.filter((m: MomentView) => m.importance >= 0.75 && m.t <= live).map((m) => <i key={m.id} className={`mk mk-${m.type}`} style={{ left: pct(m.t) }} />)}
          <input type="range" min={0} max={duration} step={1000} value={shown} aria-label="Replay position" onChange={(e) => setDrag(Number(e.target.value))} onPointerUp={commit} onKeyUp={commit} />
        </div>
        <div className="pl-speed">{SPEEDS.map((s) => <button key={s} className={s === speed ? 'on' : ''} onClick={() => control('speed', s)}>{s}×</button>)}</div>
        <button className={`pl-btn ${voice ? 'on' : ''}`} aria-label={voice ? 'Mute commentary' : 'Play commentary'} onClick={() => { setVoice(!voice); if (voice) speechSynthesis.cancel(); }}>
          <Icon name={voice ? 'volume' : 'mute'} />
        </button>
      </div>
    </footer>
  );
}
