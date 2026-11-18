// The phone: a calm second screen. One moment fills the screen at a time; earlier moments wait in a short list.
// Charts open in a sheet only when asked ("Show me"), so a new fan is never handed a dashboard. Cards come from the
// nudge gate on the server, on the same clock as the TV.
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { CONCEPT, CONCEPTS } from '../shared/concepts';
import type { Card, ConceptId, Lang, Level, VizData, VizRequest } from '../shared/types';
import { useStore } from '../store';
import { Viz, takeaway } from './charts';
import { Brand, Icon, STATUS, driverOf } from './kit';

// English until the fan picks a language
const T = (lang: Lang | undefined, en: string, hi: string) => (lang === 'hinglish' ? hi : en);

/** A friendly mark per kind of moment, from the card's moment id prefix. */
const MARKS: [string, string][] = [['gain', '🚀'], ['charge', '🚀'], ['pit', '🛞'], ['vsc', '🟡'], ['safety_car', '🚗'], ['red_flag', '🚩'], ['red-strategy', '🧠'], ['restart', '🟢'], ['lead', '👑']];
const markOf = (c: Card) => (c.momentId ? MARKS.find(([p]) => c.momentId!.startsWith(p))?.[1] : null) ?? (c.kind === 'answer' ? '💬' : '✨');

export function Companion({ id, embed }: { id: string; embed: boolean }) {
  const connect = useStore((s) => s.connect);
  useEffect(() => connect(id, 'phone'), [id, connect]);
  const { race, state, profile, error, conn } = useStore();
  const [sheet, setSheet] = useState<null | 'learn' | { viz: VizRequest; title: string }>(null);
  const cls = `app ${embed ? 'embed' : ''}`;
  if (error && !state) return <div className={cls}><div className="fatal"><Brand small /><p>{error}</p><a className="btn" href="/m">Enter another code</a></div></div>;
  if (!race || !state) return <div className={cls}><div className="loading"><Brand small /><span className="spinner" /> {conn === 'connecting' ? 'Connecting to the TV…' : 'Reconnecting…'}</div></div>;
  return (
    <div className={cls}>
      <header className="app-top">
        <Brand small />
        <span className={`live live-${conn}`}><i />{conn === 'live' ? T(profile?.lang, 'Synced with TV', 'TV ke saath sync') : T(profile?.lang, 'Reconnecting', 'Reconnect ho raha')}</span>
        {profile && <Progress onClick={() => setSheet('learn')} />}
      </header>
      {profile && <StatusLine />}
      {profile ? <Moments onChart={(viz, title) => setSheet({ viz, title })} /> : <Onboarding />}
      {profile && <AskBar />}
      {sheet === 'learn' && <LearningSheet onClose={() => setSheet(null)} />}
      {sheet && sheet !== 'learn' && <ChartSheet req={sheet.viz} title={sheet.title} onClose={() => setSheet(null)} />}
    </div>
  );
}

function Progress({ onClick }: { onClick: () => void }) {
  const p = useStore((s) => s.profile)!;
  const known = Object.values(p.concepts).filter((s) => s !== 'new').length, pct = known / CONCEPTS.length;
  return (
    <button className="progress" onClick={onClick} aria-label={`${known} of ${CONCEPTS.length} ideas learned`}>
      <svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" className="trk" /><circle cx="18" cy="18" r="15" className="val" strokeDasharray={`${pct * 94.2} 94.2`} /></svg>
      <span>{known}</span>
    </button>
  );
}

function StatusLine() {
  const { state, race, playing, profile } = useStore();
  if (!state || !race) return null;
  const lead = driverOf(race.drivers, state.cars[0].n)!;
  const flag = state.status !== 'green' && state.status !== 'pre' ? STATUS[state.status] : null;
  return (
    <div className="statusline">
      <span className="sl-lap">{state.lap ? <>Lap <b>{state.lap}</b>/{state.totalLaps}</> : T(profile?.lang, 'Starting soon', 'Start hone wala hai')}</span>
      {flag && <span className={`sl-flag ${flag.cls}`}>{flag.label}</span>}
      {state.rain && <span className="sl-rain">🌧</span>}
      <span className="sl-lead" style={{ '--team': lead.colour } as React.CSSProperties}><i />{lead.code} {T(profile?.lang, 'leads', 'aage')}</span>
      {!playing && <span className="sl-paused">❚❚</span>}
    </div>
  );
}

const LEVELS: { id: Level; icon: string; en: [string, string]; hi: [string, string] }[] = [
  { id: 'new', icon: '🌱', en: ['New to F1', 'Explain everything, simply'], hi: ['F1 mein naya hoon', 'Sab kuch simple mein samjhao'] },
  { id: 'basics', icon: '🏁', en: ['I know the basics', 'Skip tyres and pit stops'], hi: ['Basics pata hain', 'Tyres aur pit stop skip karo'] },
  { id: 'expert', icon: '🏆', en: ['I follow F1', 'Only the big moments, short'], hi: ['F1 follow karta hoon', 'Sirf bade moments, short mein'] },
];

/** Two short steps: how much do you know, which language. */
function Onboarding() {
  const setProfile = useStore((s) => s.setProfile);
  const [step, setStep] = useState(0);
  const [level, setLevel] = useState<Level>('new');
  const [busy, setBusy] = useState(false);
  return (
    <section className="onboard2">
      <div className="ob-dots"><i className={step === 0 ? 'on' : ''} /><i className={step === 1 ? 'on' : ''} /></div>
      {step === 0 ? (
        <>
          <h1>Your friend for the race.</h1>
          <p>I watch with you and explain what just happened, the moment it happens.</p>
          <h3>How well do you know F1?</h3>
          <div className="choices">
            {LEVELS.map((l) => (
              <button key={l.id} className={level === l.id ? 'on' : ''} onClick={() => setLevel(l.id)}>
                <span className="ic">{l.icon}</span><b>{l.en[0]}</b><span>{l.en[1]}</span>
              </button>
            ))}
          </div>
          <button className="cta" onClick={() => setStep(1)}>Continue <Icon name="arrow" size={18} /></button>
        </>
      ) : (
        <>
          <h1>Which language?</h1>
          <p>The commentary on TV is in English. I can explain in Hinglish, like a friend would.</p>
          <div className="choices">
            {(['hinglish', 'en'] as Lang[]).map((lang) => (
              <button key={lang} disabled={busy} onClick={async () => { setBusy(true); await setProfile(level, lang); }}>
                <span className="ic">{lang === 'hinglish' ? '🇮🇳' : '🇬🇧'}</span>
                <b>{lang === 'hinglish' ? 'Hinglish' : 'English'}</b>
                <span>{lang === 'hinglish' ? '"Abhi red flag aaya, race ruk gayi."' : '"The red flag has stopped the race."'}</span>
              </button>
            ))}
          </div>
          <button className="back" onClick={() => setStep(0)}>Back</button>
        </>
      )}
    </section>
  );
}

function Moments({ onChart }: { onChart: (viz: VizRequest, title: string) => void }) {
  const { cards, t, profile, asking } = useStore();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [pick, setPick] = useState<string | null>(null);
  // newest first: by race time, then by arrival (two answers asked while paused share a race time)
  const visible = useMemo(() => cards.map((c, i) => ({ c, i })).filter(({ c }) => c.t <= t + 1000 && !hidden.has(c.id))
    .sort((a, b) => b.c.t - a.c.t || b.i - a.i).map(({ c }) => c), [cards, t, hidden]);
  const newest = visible[0]?.id;
  useEffect(() => setPick(null), [newest]);
  const hero = visible.find((c) => c.id === pick) ?? visible[0];
  const thinking = !!asking && !asking.startsWith('moment:');
  const rest = visible.filter((c) => thinking || c !== hero).slice(0, 8);
  const lang = profile?.lang;
  return (
    <main className="moments">
      {thinking ? <Thinking q={asking} /> : hero ? <Hero key={hero.id} card={hero} onChart={onChart} onHide={() => setHidden(new Set([...hidden, hero.id]))} /> : (
        <div className="waiting">
          <div className="pulse-ring"><span>🏎️</span></div>
          <b>{T(lang, 'Watching with you', 'Aapke saath dekh raha hoon')}</b>
          <p>{T(lang, 'Press play on the TV. I will tap you when something worth knowing happens.', 'TV pe play dabao. Kuch jaanne layak hua toh main bataunga.')}</p>
        </div>
      )}
      {rest.length > 0 && (
        <section className="earlier">
          <h4>{T(lang, 'Earlier', 'Pehle')}</h4>
          {rest.map((c) => (
            <button key={c.id} onClick={() => setPick(c.id)}>
              <span className="em">{markOf(c)}</span><span className="tx">{c.headline}</span><span className="lp">L{c.why.match(/lap (\d+)/i)?.[1] ?? ''}</span>
            </button>
          ))}
        </section>
      )}
    </main>
  );
}

function Thinking({ q }: { q: string }) {
  return (
    <article className="hero thinking">
      <span className="hero-mark">💬</span>
      <p className="q">“{q}”</p>
      <div className="dots"><i /><i /><i /></div>
    </article>
  );
}

function Hero({ card, onChart, onHide }: { card: Card; onChart: (viz: VizRequest, title: string) => void; onHide: () => void }) {
  const { profile, explain, ask, asking } = useStore();
  const lang = profile?.lang;
  const explaining = asking === `moment:${card.momentId}`;
  const isHistory = card.viz?.type === 'then_now';
  return (
    <article className={`hero ${card.kind} src-${card.source}`}>
      <div className="hero-top">
        <span className="hero-mark">{markOf(card)}</span>
        <span className="hero-why">{card.why}</span>
        <button className="x" aria-label="Dismiss" onClick={onHide}><Icon name="x" size={14} /></button>
      </div>
      <h2>{card.headline}</h2>
      <p className="hero-body">{card.body}</p>
      {card.analogy && <p className="cricket"><span>🏏</span>{card.analogy}</p>}
      {isHistory && card.viz && <InlineViz req={card.viz} />}
      {card.more && <details><summary>{T(lang, 'Tell me more', 'Aur batao')}</summary><p>{card.more}</p></details>}
      {card.quiz && <Quiz concept={card.quiz} />}
      <div className="hero-actions">
        {card.viz && !isHistory && <button className="pill" onClick={() => onChart(card.viz!, card.headline)}><Icon name="chart" size={16} /> {T(lang, 'Show me', 'Dikhao')}</button>}
        {card.kind === 'nudge' && card.momentId && (
          <button className="pill accent" disabled={!!asking} onClick={() => explain(card.momentId!)}>
            {explaining ? <span className="spinner sm" /> : <Icon name="spark" size={16} />} {T(lang, 'Explain more', 'Aur samjhao')}
          </button>
        )}
      </div>
      {card.followups.length > 0 && (
        <div className="followups">{card.followups.map((f) => <button key={f} disabled={!!asking} onClick={() => ask(f)}>{f}<Icon name="arrow" size={14} /></button>)}</div>
      )}
    </article>
  );
}

function useViz(req: VizRequest) {
  const { sessionId, state } = useStore();
  const lap = state?.lap ?? 0;
  const [viz, setViz] = useState<VizData | null>(null);
  useEffect(() => {
    if (!sessionId) return;
    let live = true;
    api.viz(sessionId, req).then((r) => live && setViz(r.viz)).catch(() => {});
    return () => { live = false; };
  }, [sessionId, req.type, req.drivers.join(','), req.historyId, lap]);   // refetch on every lap: charts follow the replay and every seek
  return viz;
}

function InlineViz({ req }: { req: VizRequest }) {
  const race = useStore((s) => s.race);
  const viz = useViz(req);
  if (!viz || !race) return <div className="viz-skel" />;
  return <Viz data={viz} drivers={race.drivers} />;
}

function ChartSheet({ req, title, onClose }: { req: VizRequest; title: string; onClose: () => void }) {
  const race = useStore((s) => s.race);
  const viz = useViz(req);
  return (
    <div className="sheet-back" onClick={onClose}>
      <section className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <header><span className="eyebrow">{title}</span><button className="x" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button></header>
        {viz && race ? <><h3>{takeaway(viz, race.drivers)}</h3><Viz data={viz} drivers={race.drivers} /></> : <div className="viz-skel" />}
      </section>
    </div>
  );
}

function Quiz({ concept }: { concept: ConceptId }) {
  const { profile, quiz } = useStore();
  const [result, setResult] = useState<{ choice: number; correct: boolean; explain: string } | null>(null);
  const c = CONCEPT[concept], lang = profile?.lang ?? 'hinglish';
  return (
    <div className={`quiz2 ${result ? (result.correct ? 'ok' : 'no') : ''}`}>
      <span className="quiz-tag">⚡ {T(lang, 'Quick check', 'Quick check')} · {c.title[lang]}</span>
      <p>{c.quiz.q[lang]}</p>
      <div className="opts">
        {c.quiz.options[lang].map((o, i) => (
          <button key={i} disabled={!!result} className={result ? (i === c.quiz.answer ? 'right' : i === result.choice ? 'wrong' : '') : ''}
            onClick={async () => setResult({ choice: i, ...(await quiz(concept, i)) })}>{o}</button>
        ))}
      </div>
      {result && <p className="res">{result.correct ? `🎉 ${T(lang, 'Nice! You have got this one.', 'Badhiya! Yeh aapko aa gaya.')}` : T(lang, 'Not quite.', 'Thoda galat.')} {result.explain}</p>}
    </div>
  );
}

function AskBar() {
  const { ask, asking, profile, cards } = useStore();
  const [q, setQ] = useState('');
  const lang = profile?.lang;
  const chips = useMemo(() => {
    const last = [...cards].reverse().find((c) => c.followups.length);
    return (last?.followups ?? (lang === 'en' ? ['What just happened?', 'What is a pit stop?'] : ['Abhi kya hua?', 'Pit stop kya hota hai?'])).slice(0, 2);
  }, [cards, lang]);
  const send = (text: string) => { const v = text.trim(); if (!v || asking) return; setQ(''); void ask(v); };
  return (
    <div className="askbar">
      <div className="chips">{chips.map((s) => <button key={s} disabled={!!asking} onClick={() => send(s)}>{s}</button>)}</div>
      <form onSubmit={(e) => { e.preventDefault(); send(q); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={T(lang, 'Ask Saathi anything…', 'Saathi se kuch bhi poocho…')} maxLength={300} aria-label="Ask a question" />
        <button type="submit" disabled={!q.trim() || !!asking} aria-label="Send">{asking ? <span className="spinner sm" /> : <Icon name="send" size={18} />}</button>
      </form>
    </div>
  );
}

function LearningSheet({ onClose }: { onClose: () => void }) {
  const p = useStore((s) => s.profile)!;
  const label = { new: T(p.lang, 'Not yet', 'Abhi nahi'), introduced: T(p.lang, 'Seen it', 'Dekha hai'), demonstrated: T(p.lang, 'Got it', 'Aa gaya') };
  const known = Object.values(p.concepts).filter((s) => s !== 'new').length;
  return (
    <div className="sheet-back" onClick={onClose}>
      <section className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <header><span className="eyebrow">{T(p.lang, 'Your F1 journey', 'Aapka F1 safar')}</span><button className="x" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button></header>
        <h3>{known} / {CONCEPTS.length} {T(p.lang, 'ideas so far', 'ideas ab tak')}</h3>
        <p className="muted">{T(p.lang, 'Answer a quick check to lock an idea in. Then I keep it short.', 'Quick check sahi karo, idea lock ho jaayega. Phir main short mein bataunga.')}</p>
        <ul className="journey">
          {CONCEPTS.map((c) => <li key={c.id} className={`k-${p.concepts[c.id]}`}><i>{p.concepts[c.id] === 'demonstrated' ? '✓' : ''}</i><b>{c.title[p.lang]}</b><span>{label[p.concepts[c.id]]}</span></li>)}
        </ul>
      </section>
    </div>
  );
}
