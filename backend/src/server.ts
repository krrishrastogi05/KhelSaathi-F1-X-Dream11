// One service for everything: the API, the SSE sync stream and (after `npm run build`) the app itself.
//   npm run dev      API on :8787 with Vite on :5173 (proxy /api)        npm start   one port, production
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { detectMoments } from '../../src/shared/detect';
import { indexRace } from '../../src/shared/race';
import type { CarFrames, RaceData } from '../../src/shared/types';
import { createAi } from './ai';
import { createApi } from './api';
import { config } from './config';
import { createHub } from './sessions';
import { fileStore, type Store } from './store';

export function boot(cfg = config(), store: Store = fileStore(cfg.dataDir)) {
  const read = <T>(f: string) => JSON.parse(fs.readFileSync(path.join(cfg.dataDir, f), 'utf8')) as T;
  const ix = indexRace(read<RaceData>('race.json')), frames = read<CarFrames>('cars.json'), moments = detectMoments(ix);
  const hub = createHub(cfg, ix, moments, frames, store), ai = createAi(cfg, ix, moments), api = createApi(cfg, ix, moments, hub, ai);
  return { cfg, ix, moments, hub, ai, api };
}

const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

function serveStatic(dist: string, urlPath: string, res: http.ServerResponse) {
  const safe = path.normalize(decodeURIComponent(urlPath)).replace(/^([/\\])+/, '');
  let file = path.join(dist, safe);
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html');   // SPA routes: /tv/:id, /m/:id
  if (!fs.existsSync(file)) { res.writeHead(404).end('Run npm run build first'); return; }
  const immutable = file.includes(`${path.sep}assets${path.sep}`);
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache' });
  fs.createReadStream(file).pipe(res);
}

export function listen(app = boot()) {
  const { cfg, hub, api } = app;
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    // CORS: lets a separately hosted frontend (e.g. on Vercel) use this API and stream
    if (url.pathname.startsWith('/api/')) {
      const origin = String(req.headers.origin ?? ''), allowed = cfg.allowOrigin.split(',').map((s) => s.trim());
      if (origin && (allowed.includes('*') || allowed.includes(origin))) {
        res.setHeader('access-control-allow-origin', allowed.includes('*') ? '*' : origin);
        res.setHeader('access-control-allow-headers', 'content-type');
        res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
      }
      if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
    }
    const stream = /^\/api\/sessions\/([a-z0-9]{4,12})\/stream$/.exec(url.pathname);
    if (stream && req.method === 'GET') {
      try { hub.get(stream[1]); } catch { res.writeHead(404, { 'content-type': 'application/json' }).end('{"error":"Session not found"}'); return; }
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
      res.write('retry: 1500\n\n');
      hub.connect(stream[1], url.searchParams.get('role') === 'tv' ? 'tv' : 'phone', res);
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const out = await api.handle({ method: req.method ?? 'GET', path: url.pathname, query: url.searchParams, body: chunks.length ? Buffer.concat(chunks).toString('utf8') : null, host: String(req.headers.host ?? '') });
      res.writeHead(out.status, out.headers).end(out.body);
      return;
    }
    serveStatic(cfg.distDir, url.pathname, res);
  });
  server.listen(cfg.port, () => console.log(`Khel Saathi on http://localhost:${cfg.port} · ${app.moments.length} moments · AI ${app.ai.enabled ? cfg.providers.map((p) => p.model).join(' → ') : 'off (fallback answers)'}`));
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) listen();
