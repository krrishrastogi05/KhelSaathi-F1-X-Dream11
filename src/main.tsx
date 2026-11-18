// Routes without a router: /            start page (create a watch party, or join with a code)
//                           /tv/:id      the broadcast replay (desktop)
//                           /m/:id       the companion (phone); ?embed=1 inside the TV's preview frame
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from './api';
import { Broadcast } from './ui/Broadcast';
import { Companion } from './ui/Companion';
import { Brand, Icon } from './ui/kit';
import './styles.css';

function Home({ phone }: { phone?: boolean }) {
  const [code, setCode] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const start = async () => { setBusy(true); try { location.assign(`/tv/${(await api.createSession()).id}`); } catch (e) { setErr((e as Error).message); setBusy(false); } };
  return (
    <div className={`home ${phone ? 'home-phone' : ''}`}>
      <div className="home-bg" aria-hidden><svg viewBox="0 0 1200 600" preserveAspectRatio="none"><path d="M-50 480C200 380 260 140 520 170s360 260 760 40" /><path d="M-50 520C220 430 300 220 560 240s380 230 760 20" /></svg></div>
      <main>
        <Brand />
        <h1>The race is on one screen.<br /><em>Understanding is on the other.</em></h1>
        <p>Khel Saathi watches a live match with you and explains the moments that matter, in Hinglish or English, at your level. This proof of concept replays the 2024 São Paulo Grand Prix from real OpenF1 timing data.</p>
        {!phone && <button className="btn primary big" disabled={busy} onClick={start}><Icon name="play" /> Start the watch party</button>}
        <form className="join" onSubmit={(e) => { e.preventDefault(); if (code.trim()) location.assign(`/m/${code.trim().toLowerCase()}`); }}>
          <label htmlFor="code">{phone ? 'Enter the code shown on the TV' : 'Already have a code? Join on this device'}</label>
          <div><input id="code" value={code} onChange={(e) => setCode(e.target.value.replace(/[^a-z0-9]/gi, ''))} placeholder="e.g. K7M2QX" maxLength={12} autoCapitalize="characters" /><button className="btn" type="submit">Join</button></div>
        </form>
        {err && <p className="err">{err}</p>}
        {!phone && (
          <figure className="home-video">
            <video src="/demo/khel-saathi-demo.mp4" poster="/demo/poster.jpg" controls playsInline preload="none" />
            <figcaption>2-minute demo: the TV replay with commentary, and Saathi explaining it on the phone.</figcaption>
          </figure>
        )}
        <ul className="home-points">
          <li><b>Synced</b> One server clock drives the TV and every phone.</li>
          <li><b>Grounded</b> Every number comes from the race data, never from the AI.</li>
          <li><b>No spoilers</b> The AI only knows the race up to the moment you are watching.</li>
        </ul>
        <small>Unofficial fan prototype. Not affiliated with Formula 1 or Dream11. Data: OpenF1.</small>
      </main>
    </div>
  );
}

function App() {
  const [, root, id] = location.pathname.split('/');
  if (root === 'tv' && id) return <Broadcast id={id.toLowerCase()} />;
  if (root === 'm' && id) return <Companion id={id.toLowerCase()} embed={new URLSearchParams(location.search).has('embed')} />;
  return <Home phone={root === 'm'} />;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
