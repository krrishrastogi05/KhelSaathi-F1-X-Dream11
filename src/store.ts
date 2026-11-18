// App state (zustand). The UI never computes race facts: the race state, cards and charts all come from the server
// at the session's clock. The store only keeps the latest snapshot/ticks and estimates t between ticks for smooth motion.
import { create } from 'zustand';
import { api, API_BASE, type RaceInfo } from './api';
import { accept, type MomentView, type Presence, type ServerMsg, type Snapshot } from './shared/wire';
import type { Card, ConceptId, Lang, Level, Profile, RaceState } from './shared/types';

export type Conn = 'connecting' | 'live' | 'reconnecting';
export type Role = 'tv' | 'phone';

interface State {
  sessionId: string | null; role: Role; conn: Conn; error: string | null;
  race: RaceInfo | null;
  /** clock as last told by the server, and when (performance.now) */
  v: number; seq: number; t: number; at: number; playing: boolean; speed: number; duration: number;
  state: RaceState | null;
  /** car positions [n, x, y, ...]: prev and current, for the map to tween between ticks */
  cars: number[]; prevCars: number[]; carsAt: number; jump: boolean;
  cards: Card[]; profile: Profile | null; moments: MomentView[]; presence: Presence;
  /** a question in flight, with its instant chart request */
  asking: string | null;
  connect: (id: string, role: Role) => () => void;
  control: (action: 'play' | 'pause' | 'seek' | 'speed', arg?: number) => Promise<void>;
  setProfile: (level: Level, lang: Lang) => Promise<void>;
  ask: (question: string) => Promise<void>;
  explain: (momentId: string) => Promise<void>;
  quiz: (concept: ConceptId, choice: number) => Promise<{ correct: boolean; explain: string }>;
}

/** Best estimate of the replay time right now, between server ticks. */
export const nowT = (s: Pick<State, 't' | 'at' | 'playing' | 'speed' | 'duration'>) =>
  Math.min(s.duration, s.t + (s.playing ? (performance.now() - s.at) * s.speed : 0));

const upsert = (cards: Card[], card: Card) => [...cards.filter((c) => c.id !== card.id), card].sort((a, b) => a.t - b.t);

export const useStore = create<State>((set, get) => {
  function applySnapshot(s: Omit<Snapshot, 'seq'> & { seq?: number }) {
    set({
      v: s.v, seq: s.seq ?? get().seq, t: s.t, at: performance.now(), playing: s.playing, speed: s.speed, duration: s.duration,
      state: s.state, cars: s.cars, prevCars: s.cars, carsAt: performance.now(), jump: true,
      cards: s.cards, profile: s.profile, moments: s.moments, presence: s.presence,
    });
  }
  async function resync() { const id = get().sessionId; if (id) applySnapshot(await api.snapshot(id)); }

  function onMessage(msg: ServerMsg) {
    const st = get(), verdict = accept({ seq: st.seq, v: st.v }, msg);
    if (verdict === 'drop') return;
    if (verdict === 'resync') { void resync(); return; }
    switch (msg.type) {
      case 'snapshot': applySnapshot(msg); break;
      case 'tick':
        set({ seq: msg.seq, t: msg.t, at: performance.now(), playing: msg.playing, speed: msg.speed, duration: msg.duration, state: msg.state,
          ...(msg.cars.length ? { prevCars: st.cars, cars: msg.cars, carsAt: performance.now(), jump: false } : {}) });
        break;
      case 'card': set({ seq: msg.seq, cards: upsert(st.cards, msg.card) }); break;
      case 'moment': set({ seq: msg.seq, moments: [...st.moments, msg.moment] }); break;
      case 'presence': set({ seq: msg.seq, presence: msg.presence }); break;
      case 'profile': set({ seq: msg.seq, profile: msg.profile }); break;
    }
  }

  return {
    sessionId: null, role: 'phone', conn: 'connecting', error: null, race: null,
    v: 0, seq: 0, t: 0, at: 0, playing: false, speed: 1, duration: 1, state: null,
    cars: [], prevCars: [], carsAt: 0, jump: true, cards: [], profile: null, moments: [], presence: { tv: 0, phone: 0 }, asking: null,

    connect(id, role) {
      set({ sessionId: id, role, conn: 'connecting', error: null });
      api.race().then((race) => set({ race })).catch((e) => set({ error: e.message }));
      let es: EventSource, lastMsg = performance.now(), closed = false;
      const open = () => {
        es = new EventSource(`${API_BASE}/api/sessions/${id}/stream?role=${role}`);
        // a new connection restarts seq at 1, and its first message is always a snapshot
        es.onopen = () => { lastMsg = performance.now(); set({ conn: 'live', seq: 0 }); };
        es.onerror = () => {
          set({ conn: 'reconnecting' });
          if (es.readyState === EventSource.CLOSED) {
            api.snapshot(id).then(() => !closed && setTimeout(open, 1500)).catch(() => set({ error: 'This session does not exist (or the server restarted without it).' }));
          }
        };
        for (const type of ['snapshot', 'tick', 'card', 'moment', 'presence', 'profile']) {
          es.addEventListener(type, (e) => { lastMsg = performance.now(); onMessage(JSON.parse((e as MessageEvent).data)); });
        }
      };
      open();
      // Watchdog: the server ticks 4 times a second. Silence for 5 s means a dead stream that the browser has not
      // noticed (a proxy can keep it open after the server restarts): drop it and reconnect, which brings a snapshot.
      const watchdog = setInterval(() => {
        if (performance.now() - lastMsg > 5000 && es.readyState !== EventSource.CONNECTING) {
          es.close(); set({ conn: 'reconnecting' }); lastMsg = performance.now(); open();
        }
      }, 1000);
      return () => { closed = true; clearInterval(watchdog); es.close(); };
    },

    async control(action, arg) {
      const id = get().sessionId; if (!id) return;
      if (action === 'seek' && typeof arg === 'number') set({ t: arg, at: performance.now() });     // feels instant; the snapshot confirms
      await api.control(id, action, arg);
    },

    async setProfile(level, lang) {
      const id = get().sessionId; if (!id) return;
      set({ profile: await api.profile(id, level, lang) });
    },

    async ask(question) {
      const id = get().sessionId; if (!id || get().asking) return;
      set({ asking: question });
      try {
        const { card } = await api.ask(id, { question });
        set({ cards: upsert(get().cards, card) });
      } catch (e) { set({ error: (e as Error).message }); } finally { set({ asking: null }); }
    },

    async explain(momentId) {
      const id = get().sessionId; if (!id || get().asking) return;
      set({ asking: `moment:${momentId}` });
      try {
        const { card } = await api.ask(id, { momentId });
        set({ cards: upsert(get().cards, card) });
      } catch (e) { set({ error: (e as Error).message }); } finally { set({ asking: null }); }
    },

    async quiz(concept, choice) {
      const id = get().sessionId!;
      const r = await api.quiz(id, concept, choice);
      set({ profile: r.profile });
      return r;
    },
  };
});
