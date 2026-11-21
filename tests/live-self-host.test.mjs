// Commander Live on a host of its own (server/live-server.js): the page lives
// on another origin, connections stay open for hours, and the process stops
// to deploy. Real WebSockets against the in-memory test store.
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { WebSocket } from 'ws';
import { createCommanderLiveServer, createMemoryRoomStore, parseAllowedOrigins, originAllowed } from '../api/ws.js';
import { startLiveServer } from '../server/live-server.js';

const PAGE = 'https://www.game.example';
const read = path => readFile(new URL(path, import.meta.url), 'utf8');

async function listen(t, options) {
  const server = createCommanderLiveServer({ store: createMemoryRoomStore(), ...options });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.commanderLive.shutdown({ timeoutMs: 500 }));
  return { server, port: server.address().port };
}

function connect(port, room, { origin, create = false, autoPong = true } = {}) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/api/ws?room=${room}${create ? '&create=1&players=2' : ''}`, { origin, autoPong });
  const messages = [];
  const waiters = new Set();
  ws.on('message', data => {
    const message = JSON.parse(String(data));
    messages.push(message);
    for (const waiter of [...waiters]) if (waiter.predicate(message)) { waiters.delete(waiter); waiter.resolve(message); }
  });
  const waitFor = predicate => messages.find(predicate) ? Promise.resolve(messages.find(predicate))
    : new Promise(resolve => waiters.add({ predicate, resolve }));
  const opened = new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('unexpected-response', (_request, response) => reject(new Error(`HTTP ${response.statusCode}`)));
    ws.once('error', reject);
  });
  const closed = new Promise(resolve => ws.once('close', code => resolve(code)));
  return {
    ws, opened, closed, waitFor,
    async join(playerId = `p-${randomUUID()}`) {
      await opened;
      ws.send(JSON.stringify({ type: 'join', playerId }));
      return waitFor(message => message.type === 'state' && message.view.you !== null);
    },
  };
}

test('allowed origins are exact origins, and a mistake stops the server instead of opening it', () => {
  assert.deepEqual(parseAllowedOrigins(undefined), []);
  assert.deepEqual(parseAllowedOrigins(' https://www.game.example , https://game.example/ '),
    ['https://www.game.example', 'https://game.example']);
  for (const wrong of ['www.game.example', 'https://www.game.example/play', 'https://*.game.example', 'ftp://game.example', '*']) {
    assert.throws(() => parseAllowedOrigins(wrong), /LIVE_ALLOWED_ORIGINS/, wrong);
  }
  assert.equal(originAllowed(undefined, 'live.game.example', []), true);
  assert.equal(originAllowed('https://live.game.example', 'live.game.example', []), true);
  assert.equal(originAllowed(PAGE, 'live.game.example', [PAGE]), true);
  assert.equal(originAllowed('https://www.game.example.evil.test', 'live.game.example', [PAGE]), false);
  assert.equal(originAllowed('http://www.game.example', 'live.game.example', [PAGE]), false);
  assert.equal(originAllowed('not an origin', 'live.game.example', [PAGE]), false);
});

test('the game page on another origin plays through the room server; other sites are refused', async t => {
  const { port } = await listen(t, { allowedOrigins: [PAGE] });
  const room = `room-${randomUUID()}`;
  const host = connect(port, room, { origin: PAGE, create: true });
  assert.equal((await host.join()).view.you, 0);
  const guest = connect(port, room, { origin: PAGE });
  assert.equal((await guest.join()).view.you, 1);
  await host.waitFor(message => message.type === 'state' && message.view.seats.every(seat => seat.connected));

  await assert.rejects(connect(port, room, { origin: 'https://another-site.example' }).opened, /HTTP 403/);

  const allowed = await fetch(`http://127.0.0.1:${port}/api/ws`, { headers: { Origin: PAGE } });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get('access-control-allow-origin'), PAGE);
  assert.match(allowed.headers.get('vary') || '', /Origin/);
  assert.equal(allowed.headers.get('cache-control'), 'no-store');
  const stranger = await fetch(`http://127.0.0.1:${port}/api/ws`, { headers: { Origin: 'https://another-site.example' } });
  assert.equal(stranger.headers.get('access-control-allow-origin'), null);
});

test('without a list, only a page on the server\'s own host connects, as on Vercel', async t => {
  const { port } = await listen(t, { allowedOrigins: [] });
  const room = `room-${randomUUID()}`;
  assert.equal((await connect(port, room, { origin: `http://127.0.0.1:${port}`, create: true }).join()).view.you, 0);
  await assert.rejects(connect(port, room, { origin: PAGE }).opened, /HTTP 403/);
});

test('a connection that stops answering is ended and its seat is marked away', async t => {
  const { port } = await listen(t, { allowedOrigins: [PAGE], heartbeatMs: 40 });
  const room = `room-${randomUUID()}`;
  const host = connect(port, room, { origin: PAGE, create: true });
  await host.join();
  // This peer stays open but never answers a ping, like a laptop that went to sleep.
  const silent = connect(port, room, { origin: PAGE, autoPong: false });
  await silent.join();
  await host.waitFor(message => message.type === 'state' && message.view.seats.every(seat => seat.connected));
  const away = await host.waitFor(message => message.type === 'state'
    && message.view.seats.some(seat => seat.seat === 1 && seat.connected === false));
  assert.equal(away.view.seats[0].connected, true, 'a peer that answers its pings stays connected');
});

test('the connection cap refuses the next player without disturbing the others', async t => {
  const { port } = await listen(t, { allowedOrigins: [PAGE], maxClients: 2 });
  const room = `room-${randomUUID()}`;
  const host = connect(port, room, { origin: PAGE, create: true });
  await host.join();
  const guest = connect(port, room, { origin: PAGE });
  await guest.join();
  await assert.rejects(connect(port, room, { origin: PAGE }).opened, /HTTP 503/);
  assert.equal(host.ws.readyState, WebSocket.OPEN);
});

test('stopping the server tells players to reconnect and stores every seat as away first', async t => {
  const store = createMemoryRoomStore();
  let storeClosed = 0;
  const close = store.close.bind(store);
  store.close = async () => { storeClosed += 1; return close(); };
  const server = createCommanderLiveServer({ store, allowedOrigins: [PAGE] });
  const lines = [];
  const running = await startLiveServer({ server, env: { PORT: '0', HOST: '127.0.0.1' }, log: { log: line => lines.push(line) } });
  t.after(() => running.stop('test'));
  assert.match(lines[0], /listening on 127\.0\.0\.1:\d+ \(storage: memory; page origins: https:\/\/www\.game\.example\)/);

  const room = `room-${randomUUID()}`;
  const host = connect(running.port, room, { origin: PAGE, create: true });
  await host.join();
  const guest = connect(running.port, room, { origin: PAGE });
  await guest.join();

  await running.stop('SIGTERM');
  assert.deepEqual([await host.closed, await guest.closed], [1012, 1012]);
  assert.deepEqual((await store.get(room)).seats.map(seat => seat.connected), [false, false]);
  assert.equal(storeClosed, 1, 'storage closes once, after the last seat update');
  assert.equal(server.listening, false);
  await assert.rejects(connect(running.port, room, { origin: PAGE }).opened);
});

test('the launcher refuses to start without room storage', async () => {
  const server = { commanderLive: { store: { kind: 'missing' }, allowedOrigins: [], clients: new Set(), shutdown: async () => {} } };
  await assert.rejects(startLiveServer({ server, env: {}, log: { log() {} } }), /Room storage is not configured/);
});

test('the Hostinger package runs the same server, keeps Redis private and names every setting', async () => {
  const [dockerfile, compose, caddy, example, ignore] = await Promise.all([
    read('../deploy/hostinger/Dockerfile'), read('../deploy/hostinger/docker-compose.yml'),
    read('../deploy/hostinger/Caddyfile'), read('../deploy/hostinger/env.example'), read('../.dockerignore'),
  ]);
  assert.match(dockerfile, /CMD \["node", "server\/live-server\.js"\]/);
  assert.match(dockerfile, /npm ci --omit=dev/);
  assert.match(dockerfile, /USER node/);
  for (const needed of ['api/ws.js', 'server', 'logic.js', 'package.json', 'package-lock.json']) {
    assert.match(ignore, new RegExp(`^!${needed.replace('.', '\\.')}`, 'm'), `${needed} reaches the image`);
  }
  assert.match(ignore, /^\*$/m, 'nothing else from the repository is sent to the build');
  // Redis has no published port: only the room server reaches it.
  const redis = compose.slice(compose.indexOf('\n  redis:'), compose.indexOf('\n  live:'));
  assert.doesNotMatch(redis, /ports:/);
  assert.match(redis, /--appendonly/);
  assert.match(compose, /LIVE_ALLOWED_ORIGINS: \$\{LIVE_ALLOWED_ORIGINS:\?/);
  assert.match(compose, /restart: unless-stopped/);
  assert.match(caddy, /\{\$LIVE_DOMAIN\}/);
  assert.match(caddy, /reverse_proxy live:8787/);
  for (const name of ['LIVE_DOMAIN', 'LIVE_ALLOWED_ORIGINS', 'LIVE_MAX_CONNECTIONS', 'REDIS_MAXMEMORY']) {
    assert.match(example, new RegExp(`^${name}=`, 'm'), `${name} is documented in env.example`);
  }
  assert.doesNotMatch(example, /rediss?:\/\/[^\s]*:[^\s@]+@|postgres(?:ql)?:\/\/[^\s]*:[^\s@]+@/, 'no credentials in the example');
  // The runbook names the settings and commands the package actually uses.
  const runbook = await read('../docs/hostinger-live.md');
  for (const term of ['LIVE_DOMAIN', 'LIVE_ALLOWED_ORIGINS', 'COMMANDER_LIVE_ORIGIN', 'docker compose up -d --build',
    'npm run live:smoke', 'deploy/hostinger/update.sh']) assert.ok(runbook.includes(term), `runbook mentions ${term}`);
});
