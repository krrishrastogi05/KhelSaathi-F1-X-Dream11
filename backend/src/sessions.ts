// Sessions: one authoritative replay clock per watch party (a TV screen plus phones). The clock is stored as
// (base t, wall time, playing, speed) so the current t is computed, never ticked forward by hand: no drift, and a
// restart of the server resumes the same moment. A 250 ms loop sends ticks and lets the nudge gate pick cards.
import { randomBytes } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import { introduce, startingConcepts, CONCEPT } from '../../src/shared/concepts';
import { commentaryLine, headlineOf, nudgeCard } from '../../src/shared/copy';
import { markShown, NEVER, newGate, onSeek, pickNudge, type GateState } from '../../src/shared/gate';
import { stateAt, type RaceIndex } from '../../src/shared/race';
import { carsAt, SPEEDS, type MomentView, type Presence, type Snapshot, type Unsent } from '../../src/shared/wire';
import type { Card, CarFrames, ConceptId, Lang, Level, Moment, Ms, Profile } from '../../src/shared/types';
import type { Config } from './config';
import { HttpError } from './http';
import type { Store } from './store';

export interface Clock { base: Ms; at: number; playing: boolean; speed: number }
export interface SessionData {
  id: string; createdAt: number; clock: Clock; v: number; profile: Profile | null; gate: GateState; cards: Card[];
  /** concept -> race time a quick check was last offered (one check per 10 race minutes) */
  quizAt: Ms;
}
interface Client { role: 'tv' | 'phone'; res: ServerResponse; seq: number }

const QUIZ_GAP = 10 * 60_000;
const newId = () => { const a = 'abcdefghjkmnpqrstuvwxyz23456789', b = randomBytes(6); return Array.from(b, (x) => a[x % a.length]).join(''); };

export type Hub = ReturnType<typeof createHub>;

export function createHub(cfg: Pick<Config, 'tickMs' | 'sessionTtlMs'>, ix: RaceIndex, moments: Moment[], frames: CarFrames, store: Store, now: () => number = Date.now) {
  const duration = ix.data.meta.duration;
  const sessions = new Map<string, SessionData>(store.load().map((s) => [s.id, s]));
  const clients = new Map<string, Set<Client>>();
  const lastT = new Map<string, Ms>();                         // replay time of the last loop step, per session
  // commentators say surnames ("Verstappen"), not timing-screen codes ("VER"); OpenF1 sends "Max VERSTAPPEN"
  const surname = new Map(ix.data.drivers.map((d) => { const last = d.name.split(' ').slice(-1)[0]; return [d.code, last[0] + last.slice(1).toLowerCase()]; }));
  const persist = () => store.save([...sessions.values()]);

  const timeOf = (c: Clock, wall = now()) => Math.max(0, Math.min(duration, c.base + (c.playing ? (wall - c.at) * c.speed : 0)));
  const get = (id: string) => { const s = sessions.get(id); if (!s) throw new HttpError(404, 'Session not found'); return s; };
  const presence = (id: string): Presence => { const set = clients.get(id) ?? new Set(); let tv = 0, phone = 0; for (const c of set) c.role === 'tv' ? tv++ : phone++; return { tv, phone }; };
  const momentView = (m: Moment): MomentView => ({ id: m.id, t: m.t, type: m.type, lap: m.lap, importance: m.importance, label: headlineOf(m), say: commentaryLine(m).replace(/\b[A-Z]{3}\b/g, (c) => surname.get(c) ?? c), drivers: m.drivers });

  function send(c: Client, msg: Unsent) {
    c.seq++;
    c.res.write(`event: ${msg.type}\ndata: ${JSON.stringify({ ...msg, seq: c.seq })}\n\n`);
  }
  const broadcast = (id: string, msg: Unsent) => { for (const c of clients.get(id) ?? []) send(c, msg); };

  function snapshot(s: SessionData): Omit<Snapshot, 'seq'> {
    const t = timeOf(s.clock);
    return {
      type: 'snapshot', sessionId: s.id, v: s.v, t, playing: s.clock.playing, speed: s.clock.speed, duration,
      state: stateAt(ix, t), cars: carsAt(frames, t),
      cards: s.cards.filter((c) => c.t <= t),                 // after a seek back, cards from "the future" are hidden
      profile: s.profile, moments: moments.filter((m) => m.t <= t && m.importance >= 0.5).map(momentView), presence: presence(s.id),
    };
  }

  function create(): SessionData {
    const s: SessionData = { id: newId(), createdAt: now(), clock: { base: ix.data.chapters[0]?.t ?? 0, at: now(), playing: false, speed: 1 }, v: 1, profile: null, gate: newGate(), cards: [], quizAt: NEVER };
    sessions.set(s.id, s); persist();
    return s;
  }

  function control(id: string, action: string, arg?: number) {
    const s = get(id), t = timeOf(s.clock), wall = now();
    switch (action) {
      case 'play': s.clock = { base: t >= duration ? 0 : t, at: wall, playing: true, speed: s.clock.speed }; break;
      case 'pause': s.clock = { ...s.clock, base: t, at: wall, playing: false }; break;
      case 'seek':
        if (typeof arg !== 'number' || !Number.isFinite(arg)) throw new HttpError(400, 'seek needs t');
        s.clock = { ...s.clock, base: Math.max(0, Math.min(duration, arg)), at: wall };
        s.gate = onSeek(s.gate, s.clock.base);
        break;
      case 'speed':
        if (!SPEEDS.includes(arg as typeof SPEEDS[number])) throw new HttpError(400, `speed must be one of ${SPEEDS.join(', ')}`);
        s.clock = { ...s.clock, base: t, at: wall, speed: arg! }; break;
      default: throw new HttpError(400, 'Unknown action');
    }
    s.v++; persist();
    lastT.set(id, timeOf(s.clock));
    broadcast(id, snapshot(s));
    return { v: s.v, t: timeOf(s.clock) };
  }

  function setProfile(id: string, level: Level, lang: Lang) {
    const s = get(id), keep = s.profile && s.profile.level === level ? s.profile.concepts : startingConcepts(level);
    s.profile = { level, lang, concepts: keep }; persist();
    broadcast(id, { type: 'profile', profile: s.profile });
    return s.profile;
  }

  function addCard(s: SessionData, card: Card) {
    s.cards = [...s.cards.filter((c) => c.id !== card.id), card].slice(-60);
    if (s.profile) s.profile = introduce(s.profile, card.concepts);
    persist();
    broadcast(s.id, { type: 'card', v: s.v, card });
    if (s.profile) broadcast(s.id, { type: 'profile', profile: s.profile });
  }

  function answerQuiz(id: string, concept: ConceptId, choice: number) {
    const s = get(id), c = CONCEPT[concept];
    if (!c || !s.profile) throw new HttpError(400, 'No such check');
    const correct = choice === c.quiz.answer;
    if (correct) s.profile = { ...s.profile, concepts: { ...s.profile.concepts, [concept]: 'demonstrated' } };
    s.gate = { ...s.gate, lastInteract: now() }; persist();
    broadcast(id, { type: 'profile', profile: s.profile });
    return { correct, explain: c.quiz.explain[s.profile.lang], profile: s.profile };
  }

  /** One step of the loop for one session: end-of-race pause, moments crossing, nudges, ticks. */
  function step(s: SessionData, set: Set<Client>) {
    const wall = now(), t = timeOf(s.clock, wall);
    if (s.clock.playing && t >= duration) { control(s.id, 'pause'); return; }
    if (s.profile && s.clock.playing) {
      const pick = pickNudge(moments, s.profile, s.gate, t, wall);
      if (pick) {
        const m = pick.moment, quizConcept = m.importance >= 0.8 && t - s.quizAt > QUIZ_GAP ? m.concepts.find((c) => s.profile!.concepts[c] === 'introduced') ?? null : null;
        if (quizConcept) s.quizAt = t;
        s.gate = markShown(s.gate, m, wall);
        addCard(s, nudgeCard(m, s.profile, { reason: pick.reason, quiz: quizConcept }));
      }
    }
    // moments the replay just passed go to the broadcast ticker (a seek resets the mark, see control())
    const prev = lastT.get(s.id) ?? t;
    if (t > prev) for (const m of moments) if (m.t > prev && m.t <= t && m.importance >= 0.5) broadcast(s.id, { type: 'moment', v: s.v, moment: momentView(m) });
    lastT.set(s.id, t);
    const state = stateAt(ix, t);
    for (const c of set) send(c, { type: 'tick', v: s.v, t, playing: s.clock.playing, speed: s.clock.speed, duration, state, cars: c.role === 'tv' ? carsAt(frames, t) : [] });
  }

  const timer = setInterval(() => {
    for (const [id, set] of clients) { const s = sessions.get(id); if (s && set.size) step(s, set); }
  }, cfg.tickMs);
  timer.unref();

  // forget sessions nobody touched for a day
  setInterval(() => {
    const cut = now() - cfg.sessionTtlMs;
    for (const [id, s] of sessions) if (s.clock.at < cut && !clients.get(id)?.size) sessions.delete(id);
    persist();
  }, 3600_000).unref();

  return {
    create, get, control, setProfile, answerQuiz, addCard, snapshot, timeOf: (s: SessionData) => timeOf(s.clock),
    touch: (id: string) => { const s = get(id); s.gate = { ...s.gate, lastInteract: now() }; },
    /** Attach an SSE response. The first message is always a full snapshot, so a reconnect is just a new connect. */
    connect(id: string, role: 'tv' | 'phone', res: ServerResponse) {
      const s = get(id), c: Client = { role, res, seq: 0 };
      if (!clients.has(id)) clients.set(id, new Set());
      clients.get(id)!.add(c);
      send(c, snapshot(s));
      broadcast(id, { type: 'presence', presence: presence(id) });
      const ping = setInterval(() => res.write(': ping\n\n'), 15_000);
      res.on('close', () => { clearInterval(ping); clients.get(id)?.delete(c); broadcast(id, { type: 'presence', presence: presence(id) }); });
    },
    stop: () => clearInterval(timer),
    /** test hook: run the loop once for a session without waiting for the timer */
    stepNow: (id: string) => step(get(id), clients.get(id) ?? new Set()),
  };
}
