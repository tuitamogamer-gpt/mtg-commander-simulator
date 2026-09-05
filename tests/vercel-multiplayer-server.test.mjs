import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
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

test('Vercel room serves four human seats, four private views, and Player 4 decisions through real WebSockets', async t => {
  const store = createMemoryRoomStore();
  const server = createCommanderLiveServer({ store });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  const room = '0123456789abcdef0123456789abcdef';
  const base = `ws://127.0.0.1:${address.port}/api/ws?room=${room}`;
  const clients = [
    socketHarness(`${base}&create=1&players=4`, 'p-host-00000001'),
    socketHarness(base, 'p-guest-0000002'),
    socketHarness(base, 'p-guest-0000003'),
    socketHarness(base, 'p-guest-0000004'),
  ];
  const [host, player2, player3, player4] = clients;
  t.after(async () => {
    clients.forEach(client => client.ws.terminate());
    await new Promise(resolve => server.close(resolve));
  });

  for (let seat = 0; seat < clients.length; seat++) {
    const joined = await clients[seat].join();
    assert.equal(joined.view.you, seat);
    assert.equal(joined.view.settings.playerCount, 4);
    assert.deepEqual(joined.view.seats.map(item => item.kind), ['human', 'human', 'human', 'human']);
    assert.equal('playerId' in joined.view.seats[seat], false);
    for (const id of ['p-host-00000001', 'p-guest-0000002', 'p-guest-0000003', 'p-guest-0000004']) {
      assert.equal(JSON.stringify(joined).includes(id), false, 'reconnect identities stay out of the complete state envelope');
    }
  }

  const configurations = [
    ['Abzan Armor', ['Felothar the Steadfast']],
    ['Elven Council', ['Galadriel, Elven-Queen']],
    ['Doom Prevails', ['Doctor Doom, King of Latveria']],
    ['Turtle Power', ['Heroes in a Half Shell']],
  ];
  for (let seat = 0; seat < clients.length; seat++) {
    await clients[seat].act({
      type: 'configure', deckId: configurations[seat][0], commanderNames: configurations[seat][1], ready: true,
    });
  }
  await host.act({ type: 'configureSettings', sumPartnerDamage: true });
  const started = await host.act({ type: 'start', seed: 240828 });
  assert.equal(started.view.phase, 'running');
  assert.equal(started.view.settings.seed, 240828);
  assert.equal(started.view.settings.sumPartnerDamage, true);

  await host.act({ type: 'sync', views: {
    0: { hand: ['host-secret'], battlefield: [], players: [], stack: [] },
    1: { hand: ['player-2-secret'], battlefield: [], players: [], stack: [] },
    2: { hand: ['player-3-secret'], battlefield: [], players: [], stack: [] },
    3: { hand: ['player-4-secret'], battlefield: [], players: [], stack: [] },
  } });
  for (let seat = 0; seat < clients.length; seat++) {
    const privateState = await clients[seat].waitFor(message => message.type === 'state' && message.view.gameView?.hand?.[0] === `${seat === 0 ? 'host' : `player-${seat + 1}`}-secret`);
    assert.equal(privateState.view.gameView.hand.length, 1);
    for (let other = 0; other < clients.length; other++) {
      if (other === seat) continue;
      assert.doesNotMatch(JSON.stringify(privateState.view), new RegExp(`${other === 0 ? 'host' : `player-${other + 1}`}-secret`));
    }
  }

  await host.act({
    type: 'decisionRequest',
    decision: { id: 'player-4-choice', seat: 3, type: 'chooseOption', prompt: 'Choose', legal: { kind: 'token', tokens: ['yes', 'no'] } },
  });
  const player4Decision = await player4.waitFor(message => message.type === 'state' && message.view.pendingDecision?.id === 'player-4-choice');
  assert.equal(player4Decision.view.pendingDecision.seat, 3);
  assert.equal(player2.messages.at(-1).view.pendingDecision, null);
  await player4.act({ type: 'decisionResponse', decisionId: 'player-4-choice', response: 'yes' });
  const hostDecision = await host.waitFor(message => message.type === 'state' && message.view.lastDecision?.id === 'player-4-choice');
  assert.equal(hostDecision.view.lastDecision.seat, 3);

  await player3.act({ type: 'manualAction', action: { type: 'setLife', playerSeat: 2, value: 23 } });
  const hostManual = await host.waitFor(message => message.type === 'state' && message.view.pendingManualAction?.action?.value === 23);
  assert.equal(hostManual.view.pendingManualAction.seat, 2);
  assert.doesNotMatch(JSON.stringify(player2.messages.at(-1)?.view || {}), /pendingManualAction.*setLife/);
  await host.act({ type: 'manualAck', manualId: hostManual.view.pendingManualAction.id, ok: true, message: 'Player 3 life = 23' });
  const player3Manual = await player3.waitFor(message => message.type === 'state' && message.view.lastManualAction?.message === 'Player 3 life = 23');
  assert.equal(player3Manual.view.lastManualAction.ok, true);

  player4.close();
  const paused = await host.waitFor(message => message.type === 'state' && message.view.phase === 'paused');
  assert.equal(paused.view.pause.seat, 3);
});

test('Vercel room enforces the host-selected count and the setup keeps solo play separate', async t => {
  const store = createMemoryRoomStore();
  const server = createCommanderLiveServer({ store });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  const room = 'fedcba9876543210fedcba9876543210';
  const base = `ws://127.0.0.1:${address.port}/api/ws?room=${room}`;
  const host = socketHarness(`${base}&create=1&players=3`, 'p-host-00000002');
  const player2 = socketHarness(base, 'p-guest-0000005');
  const player3 = socketHarness(base, 'p-guest-0000006');
  const intruder = socketHarness(base, 'p-fourth-0000007');
  t.after(async () => {
    host.ws.terminate(); player2.ws.terminate(); player3.ws.terminate(); intruder.ws.terminate();
    await new Promise(resolve => server.close(resolve));
  });
  const joined = await host.join();
  assert.equal(joined.view.seats.length, 3);
  await player2.join();
  await player3.join();
  await intruder.opened();
  intruder.ws.send(JSON.stringify({ type: 'join', playerId: 'p-fourth-0000007' }));
  const rejected = await intruder.waitFor(message => message.type === 'error');
  assert.match(rejected.error, /3-player room is full/i);
  await host.act({ type: 'configure', deckId: 'Abzan Armor', commanderNames: ['Felothar the Steadfast'], ready: true });
  const flushed = once(intruder.ws, 'pong');
  intruder.ws.ping();
  await flushed;
  assert.equal(intruder.messages.some(message => message.type === 'state'), false, 'a failed join receives no later broadcasts');

  const main = await readFile(new URL('../src/modules/main.js', import.meta.url), 'utf8');
  const multiplayer = await readFile(new URL('../src/modules/multiplayer.js', import.meta.url), 'utf8');
  const lobby = await readFile(new URL('../src/modules/multiplayer-ui.js', import.meta.url), 'utf8');
  assert.match(main, /Solo table<\/strong><small>You \+ 1-3 AI V2 bots/);
  assert.match(main, /2–4 humans · no bots/);
  assert.match(main, /livePlayers: 2/);
  assert.match(multiplayer, /players=\$\{playerCount\}/);
  assert.match(multiplayer, /\/api\/ws\?room=/);
  assert.match(lobby, /All \$\{playerCount\} players ready/);
  assert.doesNotMatch(lobby, /configureBot|LOCAL AI V2/);
});

async function browserRoomRuntime(pageUrl, WebSocketClass) {
  const storage = new Map();
  const runtime = {
    URL, URLSearchParams, Uint8Array, crypto: webcrypto, WebSocket: WebSocketClass,
    setTimeout, clearTimeout,
    location: new URL(pageUrl),
    sessionStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    window: { addEventListener() {}, removeEventListener() {} },
  };
  runtime.history = { replaceState(_state, _title, url) { runtime.location = new URL(url, runtime.location); } };
  vm.runInNewContext(await readFile(new URL('../src/modules/multiplayer.js', import.meta.url), 'utf8'), runtime);
  return runtime;
}

test('browser Live adapter selects same-origin API for custom domains and localhost and preserves the Higgsfield protocol', async () => {
  const urls = [];
  class FakeWebSocket {
    constructor(url) { urls.push(new URL(url)); }
    close() {}
  }
  for (const origin of ['https://commander.example', 'https://commander.vercel.app', 'http://127.0.0.1:8000']) {
    const runtime = await browserRoomRuntime(`${origin}/`, FakeWebSocket);
    const client = runtime.MTG.createHiggsfieldRoomClient({ create: true, playerCount: 4 });
    const socket = urls.at(-1);
    assert.equal(socket.host, new URL(origin).host);
    assert.equal(socket.protocol, origin.startsWith('https:') ? 'wss:' : 'ws:');
    assert.equal(socket.pathname, '/api/ws');
    assert.equal(socket.searchParams.get('create'), '1');
    assert.equal(socket.searchParams.get('players'), '4');
    assert.match(socket.searchParams.get('room'), /^[a-f0-9]{32}$/);
    client.close();
  }
  const higgsfield = await browserRoomRuntime('https://games.higgsfield.ai/commander', FakeWebSocket);
  const client = higgsfield.MTG.createHiggsfieldRoomClient({ create: true });
  assert.match(urls.at(-1).pathname, /^\/commander\/ws\/[a-f0-9]{32}$/);
  client.close();
});

test('browser Live adapter creates and configures a local room through its real WebSocket connection', async t => {
  const server = createCommanderLiveServer({ store: createMemoryRoomStore() });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const runtime = await browserRoomRuntime(`http://127.0.0.1:${server.address().port}/`, WebSocket);
  const client = runtime.MTG.createHiggsfieldRoomClient({ create: true, playerCount: 3 });
  t.after(async () => {
    client.close();
    for (const socket of server.commanderLive.wss.clients) socket.terminate();
    await new Promise(resolve => server.close(resolve));
  });
  const joined = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Browser adapter did not join the local room.')), 3000);
    client.subscribe(view => {
      if (view?.you === 0) { clearTimeout(timer); resolve(view); }
    });
  });
  assert.equal(joined.seats.length, 3);
  const configured = await client.dispatch({ type: 'configure', deckId: 'Abzan Armor', commanderNames: ['Felothar the Steadfast'], ready: true });
  assert.equal(configured.seats[0].deckId, 'Abzan Armor');
  assert.equal(configured.seats[0].ready, true);
});

test('browser reconnect identities are room-scoped and never reuse a legacy disclosed token', async () => {
  const sockets = [];
  class FakeWebSocket {
    constructor() { this.sent = []; sockets.push(this); }
    send(value) { this.sent.push(JSON.parse(value)); }
    close() {}
  }
  const runtime = await browserRoomRuntime('https://commander.example/', FakeWebSocket);
  runtime.sessionStorage.setItem('commander-live-player-id', 'p-legacy-disclosed-identity');
  const join = roomCode => {
    const client = runtime.MTG.createHiggsfieldRoomClient({ create: true, roomCode });
    const socket = sockets.at(-1);
    socket.onopen();
    const id = socket.sent[0].playerId;
    client.close();
    return id;
  };
  const first = join('first-room-00000000000001');
  const second = join('second-room-000000000001');
  assert.notEqual(first, 'p-legacy-disclosed-identity');
  assert.notEqual(second, 'p-legacy-disclosed-identity');
  assert.notEqual(first, second, 'separate rooms must not share reconnect capabilities');
  assert.equal(join('first-room-00000000000001'), first, 'the original tab can reconnect to its existing room');
});

test('host bridge keeps remote decisions pending across a room pause and explicit resume', async () => {
  const runtime = await browserRoomRuntime('https://commander.example/', class {});
  let current = { phase: 'paused', seats: [{ connected: true }, { connected: false }], lastDecision: null };
  const listeners = new Set();
  const actions = [];
  const client = {
    current: () => current,
    subscribe(listener) { listeners.add(listener); },
    async dispatch(action) { actions.push(action); return current; },
  };
  const emit = next => { current = next; for (const listener of listeners) listener(current); };
  const flush = () => new Promise(resolve => setImmediate(resolve));
  const bridge = runtime.MTG.onlineHostBridge(client);
  const pending = bridge.requestDecision({ id: 'resume-choice', descriptor: { id: 'resume-choice', seat: 1 } });
  await flush();
  assert.equal(actions.length, 0, 'no decision request is sent while the room is paused');
  emit({ phase: 'running', seats: [{ connected: true }, { connected: true }], lastDecision: null });
  await flush();
  assert.deepEqual(actions.map(action => action.type), ['decisionRequest']);
  emit({ phase: 'paused', seats: [{ connected: true }, { connected: false }], lastDecision: { id: 'resume-choice', response: 'yes' } });
  await flush();
  assert.deepEqual(actions.map(action => action.type), ['decisionRequest'], 'a received decision stays pending until the host resumes');
  emit({ ...current, phase: 'running', seats: [{ connected: true }, { connected: true }] });
  assert.equal(await pending, 'yes');
  assert.deepEqual(actions.map(action => action.type), ['decisionRequest', 'decisionAck']);
});

test('a reconnected seat revokes the previous connection and its private broadcasts', async t => {
  const store = createMemoryRoomStore();
  const server = createCommanderLiveServer({ store });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const room = 'reconnect-room-000000000000001';
  const base = `ws://127.0.0.1:${server.address().port}/api/ws?room=${room}`;
  const hostId = 'p-private-host-00001';
  const guestId = 'p-private-guest-0002';
  const host = socketHarness(`${base}&create=1`, hostId);
  const guest = socketHarness(base, guestId);
  const clients = [host, guest];
  t.after(async () => {
    clients.forEach(client => client.ws.terminate());
    await new Promise(resolve => server.close(resolve));
  });
  await host.join();
  await guest.join();
  await host.act({ type: 'configure', deckId: 'Abzan Armor', commanderNames: ['Felothar the Steadfast'], ready: true });
  await guest.act({ type: 'configure', deckId: 'Elven Council', commanderNames: ['Galadriel, Elven-Queen'], ready: true });
  await host.act({ type: 'start', seed: 42 });
  const oldClosed = once(guest.ws, 'close');
  const replacement = socketHarness(base, guestId);
  clients.push(replacement);
  assert.equal((await replacement.join()).view.you, 1);
  assert.equal((await oldClosed)[0], 4001);
  await host.act({ type: 'sync', views: { 0: { hand: ['new-host-secret'] }, 1: { hand: ['replacement-only-secret'] } } });
  const privateState = await replacement.waitFor(message => message.view?.gameView?.hand?.[0] === 'replacement-only-secret');
  assert.equal(JSON.stringify(privateState).includes(hostId), false);
  assert.equal(JSON.stringify(privateState).includes(guestId), false);
  assert.equal(guest.messages.some(message => JSON.stringify(message).includes('replacement-only-secret')), false);
  assert.equal((await store.get(room)).phase, 'running', 'closing a superseded connection must not pause the reconnected seat');
});

test('a stale connection cannot act before a remote-instance replacement broadcast arrives', async t => {
  const store = createMemoryRoomStore();
  const server = createCommanderLiveServer({ store });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const room = 'stale-connection-room-0000001';
  const host = socketHarness(`ws://127.0.0.1:${server.address().port}/api/ws?room=${room}&create=1`, 'p-stale-host-0000001');
  t.after(async () => {
    host.ws.terminate();
    await new Promise(resolve => server.close(resolve));
  });
  await host.join();
  const remoteState = await store.get(room);
  remoteState.seats[0].connectionId = 'replacement-on-another-function';
  await store.set(room, remoteState);
  host.ws.send(JSON.stringify({ type: 'action', action: { type: 'configure', deckId: 'Changed by stale socket', ready: true } }));
  const rejected = await host.waitFor(message => message.type === 'error');
  assert.match(rejected.error, /no longer owns the seat/);
  assert.equal((await store.get(room)).seats[0].deckId, null);
  host.ws.send(JSON.stringify({ type: 'join', playerId: 'p-stale-host-0000001' }));
  await host.waitFor(message => message.type === 'error' && /Open a new connection/.test(message.error));
  assert.equal((await store.get(room)).seats[0].connectionId, 'replacement-on-another-function',
    'a superseded bound socket cannot reclaim its seat through a queued join');
});

test('a rejected reconnect cannot subscribe to private state when storage rejects its join', async t => {
  const store = createMemoryRoomStore();
  const server = createCommanderLiveServer({ store });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const room = 'failed-reconnect-room-000001';
  const base = `ws://127.0.0.1:${server.address().port}/api/ws?room=${room}`;
  const hostId = 'p-reconnect-owner-001';
  const host = socketHarness(`${base}&create=1`, hostId);
  const rejectedClient = socketHarness(base, hostId);
  t.after(async () => {
    host.ws.terminate(); rejectedClient.ws.terminate();
    await new Promise(resolve => server.close(resolve));
  });
  await host.join();
  await rejectedClient.opened();
  const withLock = store.withLock.bind(store);
  store.withLock = async () => { throw new Error('Storage rejected this join.'); };
  rejectedClient.ws.send(JSON.stringify({ type: 'join', playerId: hostId }));
  await rejectedClient.waitFor(message => message.type === 'error' && /Storage rejected/.test(message.error));
  store.withLock = withLock;
  const state = await store.get(room);
  state.views[0] = { hand: ['private-after-failed-join'] };
  await store.set(room, state);
  await store.publish(room);
  await host.waitFor(message => message.view?.gameView?.hand?.[0] === 'private-after-failed-join');
  const flushed = once(rejectedClient.ws, 'pong');
  rejectedClient.ws.ping();
  await flushed;
  assert.equal(rejectedClient.messages.some(message => message.type === 'state'), false);
});
