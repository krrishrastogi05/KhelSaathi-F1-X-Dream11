// Replay sync over real HTTP and SSE: snapshot on connect, pause, seek, speed, reconnect, and no duplicate or future
// cards after seeking back. Runs the real server on a free port with an in-memory store and no AI keys.
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { accept, type ServerMsg, type Snapshot } from '../../src/shared/wire';
import { config } from '../src/config';
import { boot, listen } from '../src/server';
import { memoryStore } from '../src/store';
import { utc } from './helpers';

let base = '', server: http.Server, app: ReturnType<typeof boot>;
before(async () => {
  app = boot({ ...config(), port: 0, providers: [] }, memoryStore());
  server = listen(app);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => { app.hub.stop(); server.closeAllConnections(); server.close(); });

const post = async (p: string, body: unknown) => { const r = await fetch(base + p, { method: 'POST', body: JSON.stringify(body) }); return { status: r.status, body: await r.json() as any }; };

/** Open an SSE stream and collect parsed messages. */
function stream(id: string, role: 'tv' | 'phone') {
  const msgs: ServerMsg[] = [];
  let req!: http.ClientRequest, buf = '';
  const ready = new Promise<void>((resolve) => {
    req = http.get(`${base}/api/sessions/${id}/stream?role=${role}`, (res) => {
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        buf += chunk;
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i); buf = buf.slice(i + 2);
          const data = block.split('\n').find((l) => l.startsWith('data: '));
          if (data) msgs.push(JSON.parse(data.slice(6)));
        }
        resolve();
      });
    });
  });
  const waitFor = async <T extends ServerMsg>(pred: (m: ServerMsg) => m is T, from = 0, ms = 4000): Promise<T> => {
    const end = Date.now() + ms;
    while (Date.now() < end) { const hit = msgs.slice(from).find(pred); if (hit) return hit; await new Promise((r) => setTimeout(r, 20)); }
    throw new Error('timeout waiting for message');
  };
  return { msgs, ready, waitFor, close: () => req.destroy() };
}
const isSnap = (m: ServerMsg): m is Snapshot => m.type === 'snapshot';

describe('replay sync', () => {
  it('pairs a TV and a phone on one clock through pause, seek, speed and reconnect', async () => {
    const { body: { id } } = await post('/api/sessions', {});
    const tv = stream(id, 'tv'), phone = stream(id, 'phone');
    await Promise.all([tv.ready, phone.ready]);
    const first = await phone.waitFor(isSnap);
    assert.equal(first.sessionId, id);
    assert.equal(first.playing, false);

    const seekT = utc('16:36:00');
    const n = phone.msgs.length;
    const r = await post(`/api/sessions/${id}/control`, { action: 'seek', t: seekT });
    assert.equal(r.status, 200);
    const snap = await phone.waitFor(isSnap, n);
    assert.equal(snap.t, seekT);
    assert.equal(snap.v, first.v + 1);
    assert.equal(snap.state.status, 'sc');
    const tvSnap = await tv.waitFor((m): m is Snapshot => isSnap(m) && m.v === snap.v);
    assert.equal(tvSnap.t, seekT, 'TV and phone see the same moment');
    assert.ok(tvSnap.cars.length > 0 && snap.cars.length > 0);

    await post(`/api/sessions/${id}/control`, { action: 'speed', speed: 10 });
    const m2 = phone.msgs.length;
    await post(`/api/sessions/${id}/control`, { action: 'play' });
    const tick = await phone.waitFor((m): m is Extract<ServerMsg, { type: 'tick' }> => m.type === 'tick' && m.playing, m2);
    assert.ok(tick.t >= seekT);
    await post(`/api/sessions/${id}/control`, { action: 'pause' });
    const paused = (await post(`/api/sessions/${id}/control`, { action: 'pause' })).body.t;

    phone.close();                                               // reconnect: the first message is the current snapshot
    const again = stream(id, 'phone');
    await again.ready;
    const re = await again.waitFor(isSnap);
    assert.equal(re.t, paused);
    assert.equal(re.playing, false);
    again.close(); tv.close();
  });

  it('client rule: drops old seq and older clock versions, resyncs on a newer version', () => {
    const tick = (seq: number, v: number) => ({ type: 'tick', seq, v, t: 0, playing: true, speed: 1, duration: 1, state: {} as never, cars: [] }) as ServerMsg;
    assert.equal(accept({ seq: 5, v: 2 }, tick(5, 2)), 'drop');
    assert.equal(accept({ seq: 5, v: 2 }, tick(6, 1)), 'drop');
    assert.equal(accept({ seq: 5, v: 2 }, tick(6, 2)), 'apply');
    assert.equal(accept({ seq: 5, v: 2 }, tick(6, 3)), 'resync');
  });

  it('a nudge is sent once; after seeking back it is hidden, and crossing it again sends no duplicate', async () => {
    const { body: { id } } = await post('/api/sessions', {});
    await post(`/api/sessions/${id}/profile`, { level: 'new', lang: 'en' });
    const phone = stream(id, 'phone');
    await phone.ready;
    const red = utc('16:37:22');
    await post(`/api/sessions/${id}/control`, { action: 'seek', t: red - 3000 });
    await post(`/api/sessions/${id}/control`, { action: 'play' });
    const card = await phone.waitFor((m): m is Extract<ServerMsg, { type: 'card' }> => m.type === 'card' && m.card.momentId === 'red_flag-32', 0, 8000);
    assert.ok(card.card.t <= red);

    const n = phone.msgs.length;
    await post(`/api/sessions/${id}/control`, { action: 'seek', t: red - 60_000 });
    const back = await phone.waitFor(isSnap, n);
    assert.ok(!back.cards.some((c) => c.momentId === 'red_flag-32'), 'card from the future is hidden after seeking back');
    assert.ok(!back.moments.some((m) => m.t > back.t), 'no future moments on the ticker');

    await post(`/api/sessions/${id}/control`, { action: 'seek', t: red - 1000 });
    await new Promise((r) => setTimeout(r, 1800));             // cross the red flag again
    const dupes = phone.msgs.slice(n).filter((m) => m.type === 'card' && m.card.momentId === 'red_flag-32');
    assert.equal(dupes.length, 0);
    await post(`/api/sessions/${id}/control`, { action: 'pause' });
    phone.close();
  });

  it('rejects bad input', async () => {
    const { body: { id } } = await post('/api/sessions', {});
    assert.equal((await post(`/api/sessions/${id}/control`, { action: 'speed', speed: 999 })).status, 400);
    assert.equal((await post(`/api/sessions/${id}/profile`, { level: 'pro', lang: 'en' })).status, 400);
    assert.equal((await post(`/api/sessions/${id}/ask`, { question: 'hi' })).status, 409);
    assert.equal((await fetch(`${base}/api/sessions/zzzzzz`)).status, 404);
  });
});
