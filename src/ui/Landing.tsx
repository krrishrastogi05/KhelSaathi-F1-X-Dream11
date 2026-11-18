// The public landing page. Cinematic first screen (race footage behind the promise), then one idea per section:
// what the jargon problem feels like, how it works, the demo, the promises, and how it is built (for reviewers).
import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { Brand, Icon } from './kit';
import './landing.css';

const DECODE: [string, string][] = [
  ['"Box, box"', 'Abhi pit stop karo'], ['Undercut', 'Pehle pit karke aage nikalna'], ['Red flag', 'Race ruk gayi, tyre free mein'],
  ['VSC', 'Sab ek slow pace pe'], ['DRS', 'Rear wing khula, straight pe extra speed'], ['Inters', 'Geeli track ke tyre'],
  ['"Shades of 2016"', 'Isi track pe, isi baarish mein, pehle bhi hua tha'], ['Pit window', 'Stop karne ka sahi waqt'],
];

export function Landing() {
  const [busy, setBusy] = useState(false), [err, setErr] = useState(''), [code, setCode] = useState('');
  const start = async () => { setBusy(true); setErr(''); try { location.assign(`/tv/${(await api.createSession()).id}`); } catch { setErr('The race server is waking up (free hosting sleeps). Try again in a few seconds.'); setBusy(false); } };
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {                                                   // respect reduced motion: keep the poster still
    const v = video.current;
    // React does not put the muted attribute in the DOM, so browsers may block autoplay: mute and start it here
    if (v) { v.muted = true; if (matchMedia('(prefers-reduced-motion: reduce)').matches) v.pause(); else v.play().catch(() => {}); }
    fetch(`${(import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')}/api/health`).catch(() => {});   // wake the free server early
  }, []);
  return (
    <div className="lp">
      <header className="lp-nav">
        <Brand />
        <nav><a href="#how">How it works</a><a href="#demo">Demo</a><a href="#build">Under the hood</a></nav>
        <button className="lp-nav-cta" disabled={busy} onClick={start}>Start watching</button>
      </header>

      <section className="lp-hero">
        <video ref={video} className="lp-bg" src="/bg/race-loop.mp4" poster="/bg/race-loop.jpg" autoPlay muted loop playsInline preload="auto" aria-hidden />
        <div className="lp-shade" aria-hidden />
        <div className="lp-hero-in">
          <div className="lp-copy">
            <span className="lp-eyebrow"><i /> Live replay · 2024 São Paulo Grand Prix</span>
            <h1>The race is on one screen.<br /><em>Understanding is on the other.</em></h1>
            <p>Your first F1 race, explained by a friend who talks your language. Khel Saathi watches with you and tells you what just happened, why it matters, and what it reminds the experts of.</p>
            <div className="lp-ctas">
              <button className="lp-btn primary" disabled={busy} onClick={start}>{busy ? <span className="spinner sm" /> : <Icon name="play" size={18} />} Start the watch party</button>
              <a className="lp-btn ghost" href="#demo">Watch the 2-min demo</a>
            </div>
            <form className="lp-join" onSubmit={(e) => { e.preventDefault(); if (code.trim()) location.assign(`/m/${code.trim().toLowerCase()}`); }}>
              <span>Got a code from the TV?</span>
              <input value={code} onChange={(e) => setCode(e.target.value.replace(/[^a-z0-9]/gi, ''))} placeholder="K7M2QX" maxLength={12} aria-label="Session code" />
              <button type="submit" aria-label="Join"><Icon name="arrow" size={16} /></button>
            </form>
            {err && <p className="lp-err">{err}</p>}
          </div>
          <aside className="lp-card" aria-label="Example Saathi card">
            <div className="lp-card-top"><span className="m">🚩</span><span>Race-changing moment · lap 32</span></div>
            <b>Lap 32 pe red flag</b>
            <p>Race ruk gayi. Rukne ke dauraan teams free mein tyre badal sakti hain, isliye jo bahar rahe, unko fayda.</p>
            <div className="lp-cricket">🏏 Jaise baarish se match ruk jaaye: sabko reset milta hai.</div>
            <div className="lp-card-ask"><span>Kaun jeetega?</span><em>Spoiler nahi milega 😉</em></div>
          </aside>
        </div>
        <a className="lp-scroll" href="#decode" aria-label="Scroll down"><Icon name="chev" /></a>
      </section>

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
