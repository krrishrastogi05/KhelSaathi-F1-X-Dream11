// The public landing page, kept short: race footage behind one promise and one button, a jargon ticker, the demo,
// four one-line facts, a final button. The idea should land in a few seconds.
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
  const [busy, setBusy] = useState(false), [err, setErr] = useState(''), [code, setCode] = useState(''), [joining, setJoining] = useState(false);
  const start = async () => { setBusy(true); setErr(''); try { location.assign(`/tv/${(await api.createSession()).id}`); } catch { setErr('The race server is waking up (free hosting sleeps). Try again in a few seconds.'); setBusy(false); } };
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
      <header className="lp-nav">
        <Brand />
        <nav><a href="#demo">Demo</a></nav>
        <button className="lp-nav-cta" disabled={busy} onClick={start}>Start watching</button>
      </header>

      <section className="lp-hero">
        <video ref={video} className="lp-bg" src="/bg/race-loop.mp4" poster="/bg/race-loop.jpg" autoPlay muted loop playsInline preload="auto" aria-hidden />
        <div className="lp-shade" aria-hidden />
        <div className="lp-hero-in">
          <div className="lp-copy">
            <h1>The race is on one screen.<br /><em>Understanding is on the other.</em></h1>
            <p>Your AI friend for F1, in Hinglish.</p>
            <div className="lp-ctas">
              <button className="lp-btn primary" disabled={busy} onClick={start}>{busy ? <span className="spinner sm" /> : <Icon name="play" size={18} />} Start watching</button>
              <a className="lp-btn ghost" href="#demo">Watch demo</a>
            </div>
            {joining
              ? <form className="lp-join" onSubmit={(e) => { e.preventDefault(); if (code.trim()) location.assign(`/m/${code.trim().toLowerCase()}`); }}>
                  <input autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/[^a-z0-9]/gi, ''))} placeholder="TV CODE" maxLength={12} aria-label="Session code" />
                  <button type="submit" aria-label="Join"><Icon name="arrow" size={16} /></button>
                </form>
              : <button className="lp-codelink" onClick={() => setJoining(true)}>Have a code from the TV?</button>}
            {err && <p className="lp-err">{err}</p>}
          </div>
          <aside className="lp-card" aria-label="Example Saathi card">
            <div className="lp-card-top"><span className="m">🚩</span><span>Lap 32</span></div>
            <b>Red flag! Race ruk gayi.</b>
            <div className="lp-card-ask"><span>Kaun jeetega?</span><em>Spoiler nahi milega 😉</em></div>
          </aside>
        </div>
        <a className="lp-scroll" href="#decode" aria-label="Scroll down"><Icon name="chev" /></a>
        <button className="lp-pause" onClick={toggle} aria-label={paused ? 'Play background video' : 'Pause background video'}><Icon name={paused ? 'play' : 'pause'} size={14} /></button>
      </section>

      <section className="lp-decode" id="decode" aria-label="F1 jargon, decoded">
        <div className="lp-track">
          {[...DECODE, ...DECODE].map(([term, plain], i) => <span key={i}><b>{term}</b><Icon name="arrow" size={14} />{plain}</span>)}
        </div>
      </section>

      <section className="lp-sec lp-demo" id="demo">
        <video src="/demo/khel-saathi-demo.mp4" poster="/demo/poster.jpg" controls playsInline preload="none" />
        <ul className="lp-facts">
          <li><span>📱</span>TV and phone in sync</li>
          <li><span>💬</span>Explains every big moment</li>
          <li><span>🙈</span>No spoilers</li>
          <li><span>🗣️</span>Hinglish or English</li>
        </ul>
      </section>

      <section className="lp-final">
        <h2>Ready for <em>lights out?</em></h2>
        <button className="lp-btn primary" disabled={busy} onClick={start}><Icon name="play" size={18} /> Start watching</button>
      </section>

      <footer className="lp-foot">
        <p>Unofficial fan prototype · Not affiliated with Formula 1 or Dream11 · Data: OpenF1 · Footage: Formula 1 · <a href="https://github.com/krrishrastogi05/KhelSaathi-F1-X-Dream11" target="_blank" rel="noreferrer">Code</a></p>
      </footer>
    </div>
  );
}
