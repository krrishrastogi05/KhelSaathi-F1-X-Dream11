// HTTP calls to the API. The sync stream is in store.ts.
import type { Card, Chapter, ConceptId, Driver, Lang, Level, Profile, RaceMeta, TrackShape, VizData, VizRequest } from './shared/types';
import type { Snapshot } from './shared/wire';

/** Where the backend lives. Empty = same origin (one service). Set VITE_API_URL when the app is hosted apart from it. */
export const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

export interface RaceInfo { meta: RaceMeta; drivers: Driver[]; track: TrackShape; chapters: Chapter[]; publicUrl: string | null; lanIp: string | null }

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}/api${path}`, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  return body as T;
}
const post = <T>(path: string, body: unknown) => call<T>(path, { method: 'POST', body: JSON.stringify(body) });

export const api = {
  race: () => call<RaceInfo>('/race'),
  createSession: () => post<{ id: string }>('/sessions', {}),
  snapshot: (id: string) => call<Omit<Snapshot, 'seq'>>(`/sessions/${id}`),
  control: (id: string, action: 'play' | 'pause' | 'seek' | 'speed', arg?: number) =>
    post<{ v: number; t: number }>(`/sessions/${id}/control`, { action, ...(action === 'seek' ? { t: arg } : action === 'speed' ? { speed: arg } : {}) }),
  profile: (id: string, level: Level, lang: Lang) => post<Profile>(`/sessions/${id}/profile`, { level, lang }),
  ask: (id: string, body: { question?: string; momentId?: string }) => post<{ card: Card; viz: VizData | null }>(`/sessions/${id}/ask`, body),
  viz: (id: string, req: VizRequest | { q: string }) => {
    const qs = 'q' in req ? `q=${encodeURIComponent(req.q)}` : `type=${req.type}&drivers=${req.drivers.join(',')}${req.historyId ? `&history=${req.historyId}` : ''}`;
    return call<{ request?: VizRequest; viz: VizData | null }>(`/sessions/${id}/viz?${qs}`);
  },
  quiz: (id: string, concept: ConceptId, choice: number) => post<{ correct: boolean; explain: string; profile: Profile }>(`/sessions/${id}/quiz`, { concept, choice }),
};
