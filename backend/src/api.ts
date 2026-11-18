// HTTP API, independent of the transport (server.ts maps node:http to handle(); the SSE stream lives there).
//   GET  /api/health                       GET  /api/race          (circuit, drivers, chapters; no results)
//   POST /api/sessions                     GET  /api/sessions/:id  (snapshot, for a resync)
//   POST /api/sessions/:id/control         { action: play | pause | seek | speed, t?, speed? }
//   POST /api/sessions/:id/profile         { level: new | basics | expert, lang: hinglish | en }
//   POST /api/sessions/:id/ask             { question? , momentId? }  -> { card, viz }
//   GET  /api/sessions/:id/viz?type=&drivers=1,31&history=
//   POST /api/sessions/:id/quiz            { concept, choice }
// Every time-dependent answer uses the session's server clock. The client never sends a time to read data at.
import { networkInterfaces } from 'node:os';
import { CONCEPT } from '../../src/shared/concepts';
import { instantViz } from '../../src/shared/context';
import type { RaceIndex } from '../../src/shared/race';
import { buildViz, validateVizRequest } from '../../src/shared/viz';
import type { ConceptId, Lang, Level, Moment } from '../../src/shared/types';
import type { Ai } from './ai';
import type { Config } from './config';
import { HttpError, json, parse, type Req, type Res } from './http';
import type { Hub } from './sessions';

const LEVELS: Level[] = ['new', 'basics', 'expert'], LANGS: Lang[] = ['hinglish', 'en'];

/** A LAN address, so a phone on the same Wi-Fi can open the QR link when the TV page runs on localhost. */
const lanIp = () => Object.values(networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal && /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))/.test(i.address))?.address ?? null;

export function createApi(cfg: Pick<Config, 'publicUrl'>, ix: RaceIndex, moments: Moment[], hub: Hub, ai: Ai) {
  const race = { meta: ix.data.meta, drivers: ix.data.drivers, track: ix.data.track, chapters: ix.data.chapters };

  async function handle(req: Req): Promise<Res> {
    try {
      const parts = req.path.replace(/\/+$/, '').split('/').filter(Boolean), [api, root, id, sub] = parts;
      if (api !== 'api') throw new HttpError(404, 'Not found');
      const route = `${req.method} /${root ?? ''}${id ? '/:id' : ''}${sub ? `/${sub}` : ''}`;
      if (id && !/^[a-z0-9]{4,12}$/.test(id)) throw new HttpError(404, 'Session not found');
      switch (route) {
        case 'GET /health': return json(200, { ok: true, ai: ai.enabled, moments: moments.length });
        case 'GET /race': return json(200, { ...race, publicUrl: cfg.publicUrl || null, lanIp: /^(localhost|127\.|\[::1\])/.test(req.host) ? lanIp() : null });
        case 'POST /sessions': return json(201, { id: hub.create().id });
        case 'GET /sessions/:id': return json(200, hub.snapshot(hub.get(id)));
        case 'POST /sessions/:id/control': {
          const b = parse(req.body), action = String(b.action ?? '');
          return json(200, hub.control(id, action, typeof b.t === 'number' ? b.t : typeof b.speed === 'number' ? b.speed : undefined));
        }
        case 'POST /sessions/:id/profile': {
          const b = parse(req.body);
          if (!LEVELS.includes(b.level as Level) || !LANGS.includes(b.lang as Lang)) throw new HttpError(400, 'level or lang is not valid');
          return json(200, hub.setProfile(id, b.level as Level, b.lang as Lang));
        }
        case 'POST /sessions/:id/ask': {
          const b = parse(req.body), s = hub.get(id);
          const question = typeof b.question === 'string' ? b.question.trim().slice(0, 300) : undefined, momentId = typeof b.momentId === 'string' ? b.momentId : undefined;
          if (!question && !momentId) throw new HttpError(400, 'Ask a question');
          if (!s.profile) throw new HttpError(409, 'Finish the setup first');
          hub.touch(id);
          const t = hub.timeOf(s), card = await ai.ask(s.profile, t, { question, momentId });
          hub.addCard(s, card);
          return json(200, { card, viz: card.viz ? buildViz(ix, moments, t, card.viz) : null });
        }
        case 'GET /sessions/:id/viz': {
          const s = hub.get(id), t = hub.timeOf(s);
          const q = req.query.get('q');
          const wanted = q ? instantViz(ix, moments, t, q.slice(0, 300)) : validateVizRequest({ type: req.query.get('type'), drivers: (req.query.get('drivers') ?? '').split(',').filter(Boolean).map(Number), historyId: req.query.get('history') ?? undefined }, ix);
          if (!wanted) return json(200, { viz: null });
          return json(200, { request: wanted, viz: buildViz(ix, moments, t, wanted) });
        }
        case 'POST /sessions/:id/quiz': {
          const b = parse(req.body);
          if (!(String(b.concept) in CONCEPT) || typeof b.choice !== 'number') throw new HttpError(400, 'concept and choice are required');
          return json(200, hub.answerQuiz(id, b.concept as ConceptId, b.choice));
        }
        default: throw new HttpError(404, 'Not found');
      }
    } catch (e) {
      if (e instanceof HttpError) return json(e.status, { error: e.message });
      console.error(e);
      return json(500, { error: 'Internal error' });
    }
  }
  return { handle };
}
