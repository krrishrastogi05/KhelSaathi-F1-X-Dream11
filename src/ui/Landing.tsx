// The public landing page, laid out like a motorsport site: a two-tier header, a race bar, quick-link chips, then a
// hero grid (a big video tile and four story tiles). Below: jargon ticker, how it works, demo, promises, under the hood.
import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { Brand, Icon } from './kit';
import './landing.css';

const DECODE: [string, string][] = [
  ['"Box, box"', 'Abhi pit stop karo'], ['Undercut', 'Pehle pit karke aage nikalna'], ['Red flag', 'Race ruk gayi, tyre free mein'],
  ['VSC', 'Sab ek slow pace pe'], ['DRS', 'Rear wing khula, straight pe extra speed'], ['Inters', 'Geeli track ke tyre'],
  ['"Shades of 2016"', 'Isi track pe, isi baarish mein, pehle bhi hua tha'], ['Pit window', 'Stop karne ka sahi waqt'],
];

const TILES = [
  { img: '/bg/tile-app.jpg', tag: 'Demo', title: 'Watch Saathi explain a wet, wild race in two minutes', href: '#demo' },
  { img: '/bg/tile-pit.jpg', tag: 'Explained', title: 'Lap 32 pe red flag: why the stay-out call paid off', href: '#how' },
  { img: '/bg/tile-battle.jpg', tag: 'Jargon', title: '"Box, box" means pit now. Saathi decodes the rest', href: '#decode' },
  { img: '/bg/tile-onboard.jpg', tag: 'Under the hood', title: 'No spoilers, ever: the AI only knows the race so far', href: '#build' },
];

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const i = setInterval(() => setNow(new Date()), 15_000); return () => clearInterval(i); }, []);
  return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function Landing() {
  const [busy, setBusy] = useState(false), [err, setErr] = useState(''), [code, setCode] = useState('');
  const start = async () => { setBusy(true); setErr(''); try { location.assign(`/tv/${(await api.createSession()).id}`); } catch { setErr('The race server is waking up (free hosting sleeps). Try again in a few seconds.'); setBusy(false); } };
  const clock = useClock();
  const video = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const v = video.current;
    // React does not put the muted attribute in the DOM, so browsers may block autoplay: mute and start it here.
    // Reduced-motion users still get the footage (only the slow zoom stops, in CSS) and a pause button.
    const play = () => { if (v && v.paused && !v.dataset.userPaused) v.play().catch(() => {}); };
    if (v) { v.muted = true; play(); }
    // phones in low-power mode block autoplay until the first touch or scroll
    const once = () => { play(); removeEventListener('pointerdown', once); removeEventListener('scroll', once); };
    addEventListener('pointerdown', once); addEventListener('scroll', once, { passive: true });
    fetch(`${(import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')}/api/health`).catch(() => {});   // wake the free server early
    return () => { removeEventListener('pointerdown', once); removeEventListener('scroll', once); };
  }, []);
  const toggle = () => {
    const v = video.current; if (!v) return;
    if (v.paused) { delete v.dataset.userPaused; v.play().catch(() => {}); setPaused(false); } else { v.dataset.userPaused = '1'; v.pause(); setPaused(true); }
  };

  return (
    <div className="lp">
      <header className="lp-head">
        <div className="lp-top">
          <span className="lp-series">Dream11 FDE · Prototype <Icon name="chev" size={14} /></span>
          <nav><a href="#how">How it works</a><a href="#demo">Demo</a><a href="#build">Under the hood</a><a href="https://github.com/krrishrastogi05/KhelSaathi-F1-X-Dream11" target="_blank" rel="noreferrer">Code</a></nav>
          <a className="lp-top-ghost" href="#join">Join with code</a>
          <button className="lp-top-cta" disabled={busy} onClick={start}>Start watching</button>
        </div>
        <div className="lp-main">
          <Brand />
          <nav><button onClick={start} disabled={busy}>Watch party</button><a href="#decode">Decoder</a><a href="#how">Learn F1</a><a href="#demo">Demo</a><a href="#build">Tech</a></nav>
        </div>
        <div className="lp-race">
          <div><span className="lp-gp"><span className="lp-flag" aria-hidden />São Paulo <Icon name="chev" size={12} /></span><b>RACE REPLAY</b><i /><b className="mono">69 L · 21 MOMENTS</b></div>
          <div className="lp-time"><span className="dot" /><b>MY TIME</b><b className="mono">{clock}</b><span className="lp-wet">🌧 Wet race</span></div>
        </div>
      </header>

      <nav className="lp-chips" aria-label="Quick links">
        <button onClick={start} disabled={busy}><Icon name="play" size={15} /> Watch party</button>
        <a href="#decode"><Icon name="book" size={15} /> Jargon decoder</a>
        <a href="#how"><Icon name="spark" size={15} /> New to F1?</a>
        <a href="#demo"><Icon name="chart" size={15} /> Demo</a>
        <a href="#build"><Icon name="flag" size={15} /> No spoilers</a>
      </nav>

      <section className="lp-grid">
        <article className="lp-feature">
          <video ref={video} className="lp-bg" src="/bg/race-loop.mp4" poster="/bg/race-loop.jpg" autoPlay muted loop playsInline preload="auto" aria-hidden />
          <div className="lp-shade" aria-hidden />
          <div className="lp-feature-in">
            <span className="lp-eyebrow"><i /> Live replay · 2024 São Paulo Grand Prix</span>
            <h1>The race is on one screen. <em>Understanding is on the other.</em></h1>
            <p>Your first F1 race, explained by a friend who talks your language: what just happened, why it matters, and what it reminds the experts of.</p>
            <div className="lp-ctas">
              <button className="lp-btn primary" disabled={busy} onClick={start}>{busy ? <span className="spinner sm" /> : <Icon name="play" size={18} />} Start the watch party</button>
              <a className="lp-btn ghost" href="#demo">Watch the 2-min demo</a>
            </div>
            {err && <p className="lp-err">{err}</p>}
          </div>
          <button className="lp-pause" onClick={toggle} aria-label={paused ? 'Play background video' : 'Pause background video'}><Icon name={paused ? 'play' : 'pause'} size={14} /></button>
        </article>
        <div className="lp-tiles">
          {TILES.map((t) => (
            <a key={t.title} className="lp-tile" href={t.href}>
              <span className="lp-tile-img" style={{ backgroundImage: `url(${t.img})` }}><em>{t.tag}</em></span>
              <b>{t.title}</b>
            </a>
          ))}
        </div>
      </section>

      <form id="join" className="lp-joinbar" onSubmit={(e) => { e.preventDefault(); if (code.trim()) location.assign(`/m/${code.trim().toLowerCase()}`); }}>
        <span>Watching on a TV already? Enter the code shown on it to bring Saathi to this phone.</span>
        <div><input value={code} onChange={(e) => setCode(e.target.value.replace(/[^a-z0-9]/gi, ''))} placeholder="K7M2QX" maxLength={12} aria-label="Session code" /><button type="submit">Join <Icon name="arrow" size={16} /></button></div>
      </form>

      <section className="lp-decode" id="decode" aria-label="F1 jargon, decoded">
        <div className="lp-track">
          {[...DECODE, ...DECODE].map(([term, plain], i) => <span key={i}><b>{term}</b><Icon name="arrow" size={14} />{plain}</span>)}
        </div>
      </section>

      <section className="lp-sec" id="how">
        <span className="lp-kicker">How it works</span>
        <h2>Watch together. <em>Understand instantly.</em></h2>
        <ol className="lp-steps">
          <li><span>01</span><b>The race plays on your TV</b><p>A broadcast replay drawn from real timing data, with commentary, flags and the live order.</p></li>
          <li><span>02</span><b>Scan, and your phone joins</b><p>One server clock keeps TV and phone on the same second, through pause, seek and reconnect.</p></li>
          <li><span>03</span><b>Saathi explains the big moments</b><p>In Hinglish or English, at your level, with a chart when it helps. Ask it anything, any time.</p></li>
        </ol>
      </section>

      <section className="lp-sec lp-demo" id="demo">
        <span className="lp-kicker">The demo</span>
        <h2>Two minutes, <em>five moments.</em></h2>
        <video src="/demo/khel-saathi-demo.mp4" poster="/demo/poster.jpg" controls playsInline preload="none" />
      </section>

      <section className="lp-sec">
        <span className="lp-kicker">The promises</span>
        <h2>A friend, <em>not a dashboard.</em></h2>
        <div className="lp-promises">
          <div><span>⏱</span><b>On the same second</b><p>The phone never runs its own clock. Every screen shows the server's moment.</p></div>
          <div><span>📊</span><b>Grounded in the data</b><p>Every number on a chart comes from the race timing. The AI only explains.</p></div>
          <div><span>🙈</span><b>No spoilers. Ever.</b><p>Saathi only knows the race up to the moment you are watching. Tested.</p></div>
          <div><span>🌱</span><b>Learns what you know</b><p>New ideas get a full card. Ideas you have got right get one line, or none.</p></div>
        </div>
      </section>

      <section className="lp-sec lp-build" id="build">
        <span className="lp-kicker">Under the hood</span>
        <h2>Deterministic facts. <em>AI for the explaining.</em></h2>
        <div className="lp-flow">
          {['OpenF1 timing', 'Moment detectors', 'Nudge gate', 'Grounded LLM', 'Your phone'].map((s, i) => <span key={s}>{i > 0 && <Icon name="arrow" size={14} />}<b>{s}</b></span>)}
        </div>
        <div className="lp-stats">
          <div><b>250 ms</b><span>sync ticks over SSE</span></div>
          <div><b>21</b><span>race moments detected</span></div>
          <div><b>&lt;1 s</b><span>AI answers, with a chart</span></div>
          <div><b>35</b><span>tests, incl. no-spoiler proofs</span></div>
        </div>
        <a className="lp-link" href="https://github.com/krrishrastogi05/KhelSaathi-F1-X-Dream11" target="_blank" rel="noreferrer">Read the code and the design notes <Icon name="arrow" size={14} /></a>
      </section>

      <section className="lp-final">
        <h2>Ready for <em>lights out?</em></h2>
        <button className="lp-btn primary" disabled={busy} onClick={start}><Icon name="play" size={18} /> Start the watch party</button>
      </section>

      <footer className="lp-foot">
        <Brand small />
        <p>Unofficial fan prototype for a Dream11 FDE submission. Not affiliated with Formula 1 or Dream11. Race data: OpenF1. Background footage: Formula 1, "F1 2023: This Is No Ordinary Sport".</p>
      </footer>
    </div>
  );
}
