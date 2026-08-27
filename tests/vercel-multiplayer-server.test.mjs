import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { WebSocket } from 'ws';
import { createCommanderLiveServer, createMemoryRoomStore } from '../api/ws.js';

function socketHarness(url, playerId) {
  const ws = new WebSocket(url);
  const opened = once(ws, 'open');
  const messages = [];
  const waiters = new Set();
  ws.on('message', data => {
    const message = JSON.parse(String(data));
    messages.push(message);
    for (const waiter of waiters) {
      if (!waiter.predicate(message)) continue;
      waiters.delete(waiter);
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    }
  });
  const waitFor = (predicate, timeout = 3000) => {
    const existing = messages.find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, timer: null };
      waiter.timer = setTimeout(() => {
        waiters.delete(waiter);
        reject(new Error(`Timed out waiting for WebSocket message. Received: ${JSON.stringify(messages.slice(-3))}`));
      }, timeout);
      waiters.add(waiter);
    });
  };
  return {
    ws, messages, waitFor,
    opened: () => opened,
    async join() {
      await opened;
      ws.send(JSON.stringify({ type: 'join', playerId }));
      return waitFor(message => message.type === 'state' && message.view && message.view.you !== null);
    },
    async act(action) {
      const revision = messages.filter(message => message.type === 'state' && message.view)
        .reduce((max, message) => Math.max(max, message.view.revision), -1);
      ws.send(JSON.stringify({ type: 'action', action }));
      const error = waitFor(message => message.type === 'error', 3000).then(message => ({ error: message }));
      const state = waitFor(message => message.type === 'state' && message.view && message.view.revision > revision, 3000)
        .then(message => ({ state: message }));
      const result = await Promise.race([error, state]);
      if (result.error) throw new Error(result.error.error);
      return result.state;
    },
    close() { ws.close(); },
  };
}

test('Vercel room serves two private human seats and two local AI seats through real WebSockets', async t => {
  const store = createMemoryRoomStore();
  const server = createCommanderLiveServer({ store });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  const room = '0123456789abcdef0123456789abcdef';
  const base = `ws://127.0.0.1:${address.port}/api/ws?room=${room}`;
  const host = socketHarness(`${base}&create=1`, 'p-host-00000001');
  const guest = socketHarness(base, 'p-guest-0000001');
  t.after(async () => {
    host.ws.terminate();
    guest.ws.terminate();
    await new Promise(resolve => server.close(resolve));
  });

  const hostJoined = await host.join();
  assert.equal(hostJoined.view.you, 0);
  assert.deepEqual(hostJoined.view.seats.map(seat => seat.kind), ['human', 'human', 'bot', 'bot']);
  assert.equal(hostJoined.view.seats[1].connected, false);
  assert.equal('playerId' in hostJoined.view.seats[0], false);

  const guestJoined = await guest.join();
  assert.equal(guestJoined.view.you, 1);
  assert.equal(guestJoined.view.seats[0].connected, true);
  assert.equal(guestJoined.view.seats[1].connected, true);

  await host.act({ type: 'configure', deckId: 'Abzan Armor', commanderNames: ['Felothar the Steadfast'], ready: true });
  await guest.act({ type: 'configure', deckId: 'Elven Council', commanderNames: ['Galadriel, Elven-Queen'], ready: true });
  await host.act({ type: 'configureBot', seat: 2, deckId: 'Doom Prevails', aiStyle: 'balanced' });
  await host.act({ type: 'configureBot', seat: 3, deckId: 'Turtle Power', aiStyle: 'balanced' });
  const started = await host.act({ type: 'start', seed: 240824 });
  assert.equal(started.view.phase, 'running');
  assert.equal(started.view.settings.seed, 240824);

  await host.act({ type: 'sync', views: {
    0: { hand: ['host-secret'], battlefield: [], players: [], stack: [] },
    1: { hand: ['guest-secret'], battlefield: [], players: [], stack: [] },
  } });
  const hostPrivate = await host.waitFor(message => message.type === 'state' && message.view.gameView?.hand?.[0] === 'host-secret');
  const guestPrivate = await guest.waitFor(message => message.type === 'state' && message.view.gameView?.hand?.[0] === 'guest-secret');
  assert.deepEqual(hostPrivate.view.gameView.hand, ['host-secret']);
  assert.deepEqual(guestPrivate.view.gameView.hand, ['guest-secret']);
  assert.doesNotMatch(JSON.stringify(guestPrivate.view), /host-secret/);

  await guest.act({ type: 'manualAction', action: { type: 'setLife', playerSeat: 2, value: 23 } });
  const hostManual = await host.waitFor(message => message.type === 'state' && message.view.pendingManualAction?.action?.value === 23);
  assert.equal(hostManual.view.pendingManualAction.seat, 1);
  assert.doesNotMatch(JSON.stringify(guest.messages.at(-1)?.view || {}), /pendingManualAction.*setLife/);
  await host.act({ type: 'manualAck', manualId: hostManual.view.pendingManualAction.id, ok: true, message: 'AI Dragon life = 23' });
  const guestManual = await guest.waitFor(message => message.type === 'state' && message.view.lastManualAction?.message === 'AI Dragon life = 23');
  assert.equal(guestManual.view.lastManualAction.ok, true);

  guest.close();
  const paused = await host.waitFor(message => message.type === 'state' && message.view.phase === 'paused');
  assert.equal(paused.view.pause.seat, 1);
});

test('Vercel room rejects a third human and keeps online play optional beside solo mode', async t => {
  const store = createMemoryRoomStore();
  const server = createCommanderLiveServer({ store });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  const room = 'fedcba9876543210fedcba9876543210';
  const base = `ws://127.0.0.1:${address.port}/api/ws?room=${room}`;
  const host = socketHarness(`${base}&create=1`, 'p-host-00000002');
  const guest = socketHarness(base, 'p-guest-0000002');
  const intruder = socketHarness(base, 'p-third-0000002');
  t.after(async () => {
    host.ws.terminate(); guest.ws.terminate(); intruder.ws.terminate();
    await new Promise(resolve => server.close(resolve));
  });
  await host.join();
  await guest.join();
  await intruder.opened();
  intruder.ws.send(JSON.stringify({ type: 'join', playerId: 'p-third-0000002' }));
  const rejected = await intruder.waitFor(message => message.type === 'error');
  assert.match(rejected.error, /two human seats are full/i);

  const main = await readFile(new URL('../src/modules/main.js', import.meta.url), 'utf8');
  const multiplayer = await readFile(new URL('../src/modules/multiplayer.js', import.meta.url), 'utf8');
  const lobby = await readFile(new URL('../src/modules/multiplayer-ui.js', import.meta.url), 'utf8');
  assert.match(main, /Solo table<\/strong><small>You \+ 1–3 AI V2 bots/);
  assert.match(main, /2 players live<\/strong><small>Friend link \+ 2 AI V2 bots/);
  assert.match(main, /state\.ai = state\.mode === 'online' \? 2 : 3/);
  assert.match(multiplayer, /vercel\\\.app/);
  assert.match(multiplayer, /\/api\/ws\?room=/);
  assert.match(lobby, /if \(!this\.client\.platformAutoJoin\)/);
});
