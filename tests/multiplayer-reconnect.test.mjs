import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

function harness({ replay = true, joined = true } = {}) {
  const sockets = [], storage = new Map(), timers = new Map(), errors = [];
  let now = 0, serial = 0;
  class FakeSocket {
    constructor() { this.sent = []; sockets.push(this); }
    send(value) { this.sent.push(JSON.parse(value)); }
    receive(value) { this.onmessage?.({ data: JSON.stringify(value) }); }
    open() { this.onopen?.(); }
    close() { this.drop(1000); }
    drop(code = 1006) { this.onclose?.({ code }); }
  }
  const context = vm.createContext({
    URL, URLSearchParams, crypto: webcrypto, Uint8Array,
    Date: class extends Date { static now() { return now; } },
    setTimeout(fn, delay = 0) { const id = ++serial; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); }, console: { error: (...args) => errors.push(args) },
    location: new URL('http://localhost/?room=reconnect-regression-001'), history: { replaceState() {} },
    sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    window: { addEventListener() {}, removeEventListener() {} }, WebSocket: FakeSocket,
  });
  vm.runInContext(fs.readFileSync(new URL('../src/modules/multiplayer.js', import.meta.url), 'utf8'), context);
  const client = context.MTG.createHiggsfieldRoomClient({ create: true });
  const state = (socket, phase = 'running', extra = {}) => socket.receive({ type: 'state', status: 'playing', actionAcks: true, actionReplay: replay,
    view: { protocolVersion: context.MTG.ONLINE_PROTOCOL_VERSION, revision: now + 1, you: 0, phase,
      seats: [{ seat: 0, connected: true }, { seat: 1, connected: true }], ...extra } });
  const tick = elapsed => {
    now += elapsed;
    for (;;) {
      const due = [...timers].filter(([, timer]) => timer.at <= now).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]); due[1].fn();
    }
  };
  sockets[0].open(); if (joined) state(sockets[0]);
  return { client, sockets, state, tick, MTG: context.MTG, errors };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('interrupted action retains its promise and exact identity across socket replacement', async () => {
  const h = harness(); const old = h.sockets[0];
  let completed = false;
  const result = h.client.dispatch({ type: 'sync', views: { 0: { turn: 3 } } }).then(() => { completed = true; });
  const original = old.sent.at(-1);
  assert.match(original.requestId, /^action:v1:[0-9a-f-]{36}:1$/);
  old.drop(); await flush();
  assert.equal(completed, false);
  assert.equal(h.client.current().phase, 'paused');
  assert.equal(h.client.current().seats[0].connected, false);
  h.tick(1500); const next = h.sockets[1]; next.open();
  assert.equal(next.sent.length, 1, 'join precedes any retry');
  h.state(next, 'paused');
  assert.deepEqual(next.sent.at(-1), original, 'server deduplicates this exact envelope');
  old.receive({ type: 'error', requestId: original.requestId, error: 'stale socket' });
  old.drop(4001);
  next.receive({ type: 'actionAck', requestId: original.requestId });
  await result; assert.equal(completed, true);
  const second = h.client.dispatch({ type: 'sync', views: {} }); h.tick(125);
  assert.notEqual(next.sent.at(-1).requestId, original.requestId);
  next.receive({ type: 'actionAck', requestId: next.sent.at(-1).requestId }); await second;
  h.client.close();
});

test('an uncommitted paused request waits without blocking Resume and retries the same identity', async () => {
  const h = harness(), old = h.sockets[0];
  let resolved = false;
  const pending = h.client.dispatch({ type: 'decisionRequest', decision: { id: 'd1' } }).then(() => { resolved = true; });
  const original = old.sent.at(-1);
  old.drop(); h.tick(1500); const next = h.sockets[1]; next.open(); h.state(next, 'paused');
  next.receive({ type: 'actionDeferred', requestId: original.requestId, reason: 'paused' });
  await flush(); assert.equal(resolved, false);
  const later = h.client.dispatch({ type: 'sync', views: {} });
  h.tick(125); assert.deepEqual(next.sent.at(-1), original, 'ordinary later actions cannot overtake the parked request');
  const resumed = h.client.dispatch({ type: 'resume' }); h.tick(125);
  const resume = next.sent.at(-1); assert.equal(resume.action.type, 'resume');
  h.state(next, 'running'); next.receive({ type: 'actionAck', requestId: resume.requestId }); await resumed;
  h.tick(125); assert.deepEqual(next.sent.at(-1), original);
  next.receive({ type: 'actionAck', requestId: original.requestId }); await pending;
  assert.equal(resolved, true);
  h.tick(125); assert.equal(next.sent.at(-1).action.type, 'sync');
  next.receive({ type: 'actionAck', requestId: next.sent.at(-1).requestId }); await later;
  h.client.close();
});

test('a legacy server never receives an uncertain replay', async () => {
  const h = harness({ replay: false });
  const pending = h.client.dispatch({ type: 'manualAction', action: { type: 'createToken' } });
  const rejected = assert.rejects(pending, /closed before the action was confirmed/);
  h.sockets[0].drop(); await rejected;
  h.tick(1500); const next = h.sockets[1]; next.open(); h.state(next);
  assert.equal(next.sent.filter(packet => packet.type === 'action').length, 0);
  h.client.close();
});

test('busy lock refusals back off with the exact action identity and preserve queue order', async () => {
  const h = harness(), socket = h.sockets[0];
  let completed = false;
  const pending = h.client.dispatch({ type: 'manualAction', action: { type: 'createToken' } }).then(() => { completed = true; });
  const original = socket.sent.at(-1);
  const later = h.client.dispatch({ type: 'resume' });
  socket.receive({ type: 'actionDeferred', requestId: original.requestId, reason: 'busy', retryAfterMs: 1000 });
  h.tick(999); assert.equal(socket.sent.length, 2); assert.equal(completed, false);
  h.tick(1); assert.deepEqual(socket.sent.at(-1), original);
  socket.receive({ type: 'actionDeferred', requestId: original.requestId, reason: 'busy', retryAfterMs: 1000 });
  h.tick(1999); assert.equal(socket.sent.length, 3);
  h.tick(1); assert.deepEqual(socket.sent.at(-1), original);
  socket.receive({ type: 'actionAck', requestId: original.requestId }); await pending;
  assert.equal(completed, true);
  h.tick(125); assert.equal(socket.sent.at(-1).action.type, 'resume');
  socket.receive({ type: 'actionAck', requestId: socket.sent.at(-1).requestId }); await later;
  h.client.close();
});

test('busy action retries are bounded and unrelated deferrals cannot affect the inflight action', async () => {
  const h = harness(), socket = h.sockets[0];
  const pending = h.client.dispatch({ type: 'sync', views: {} });
  const later = h.client.dispatch({ type: 'decisionAck', decisionId: 'depends-on-sync' });
  const rejected = Promise.all([pending, later].map(result => assert.rejects(result, /remained busy after several retries/)));
  const original = socket.sent.at(-1);
  socket.receive({ type: 'actionDeferred', requestId: 'another-request', reason: 'busy', retryAfterMs: 1000 });
  h.tick(10000); assert.equal(socket.sent.length, 2);
  for (let attempt = 0; attempt < 6; attempt++) {
    socket.receive({ type: 'actionDeferred', requestId: original.requestId, reason: 'busy', retryAfterMs: 1000 });
    h.tick(2000); assert.deepEqual(socket.sent.at(-1), original);
  }
  assert.equal(socket.sent.length, 8, 'one join, one original action, six retries');
  socket.receive({ type: 'actionDeferred', requestId: original.requestId, reason: 'busy', retryAfterMs: 1000 });
  await rejected; h.tick(10000); assert.equal(socket.sent.length, 8);
  assert.equal(h.sockets.length, 1, 'exhaustion stops automatic reconnect');
  await assert.rejects(h.client.dispatch({ type: 'resume' }), /connection is closed/);
  h.client.close();
});

test('a busy join retries the same handshake and cannot release gameplay before state', async () => {
  const h = harness({ joined: false }), socket = h.sockets[0];
  const join = socket.sent[0];
  const pending = h.client.dispatch({ type: 'sync', views: {} });
  socket.receive({ type: 'error', code: 'ROOM_BUSY', retryAfterMs: 1000, error: 'busy' });
  h.tick(999); assert.equal(socket.sent.length, 1);
  h.tick(1); assert.deepEqual(socket.sent.at(-1), join);
  socket.receive({ type: 'error', code: 'ROOM_BUSY', retryAfterMs: 1000, error: 'busy' });
  h.tick(1999); assert.equal(socket.sent.length, 2);
  h.state(socket); assert.equal(socket.sent.at(-1).action.type, 'sync');
  socket.receive({ type: 'actionAck', requestId: socket.sent.at(-1).requestId }); await pending;
  h.tick(10000); assert.equal(socket.sent.length, 3, 'accepted state cancels scheduled join retry');
  h.client.close();
});

test('a busy replacement join holds an uncertain action until its new connection owns the seat', async () => {
  const h = harness(), old = h.sockets[0];
  const pending = h.client.dispatch({ type: 'decisionRequest', decision: { id: 'still-waiting' } });
  const original = old.sent.at(-1);
  old.drop(); h.tick(1500); const next = h.sockets[1]; next.open();
  next.receive({ type: 'error', code: 'ROOM_BUSY', retryAfterMs: 1000, error: 'busy' });
  h.tick(1000);
  assert.equal(next.sent.length, 2); assert.ok(next.sent.every(packet => packet.type === 'join'));
  h.state(next, 'paused'); assert.deepEqual(next.sent.at(-1), original);
  next.receive({ type: 'actionAck', requestId: original.requestId }); await pending;
  h.client.close();
});

test('busy join retries stop on close or exhaustion and reject waiting gameplay', async () => {
  for (const exhaust of [false, true]) {
    const h = harness({ joined: false }), socket = h.sockets[0];
    const pending = h.client.dispatch({ type: 'sync', views: {} });
    const rejected = assert.rejects(pending, exhaust ? /remained busy while reconnecting/ : /closed/);
    if (exhaust) {
      for (let attempt = 0; attempt < 6; attempt++) {
        socket.receive({ type: 'error', code: 'ROOM_BUSY', retryAfterMs: 1000, error: 'busy' });
        h.tick(2000);
      }
    }
    socket.receive({ type: 'error', code: 'ROOM_BUSY', retryAfterMs: 1000, error: 'busy' });
    if (!exhaust) h.client.close();
    await rejected;
    const sent = socket.sent.length;
    h.tick(10000); assert.equal(socket.sent.length, sent); assert.equal(h.sockets.length, 1);
    assert.ok(socket.sent.every(packet => packet.type === 'join'));
    h.client.close();
  }
});

test('seat takeover and explicit close reject queued work without sending or reconnecting', async () => {
  for (const explicit of [false, true]) {
    const h = harness();
    const a = h.client.dispatch({ type: 'sync', views: {} });
    const b = h.client.dispatch({ type: 'manualAck', manualId: 'm1' });
    const results = Promise.allSettled([a, b]);
    if (explicit) h.client.close(); else h.sockets[0].drop(4001);
    assert.ok((await results).every(result => result.status === 'rejected'));
    h.tick(10000); assert.equal(h.sockets.length, 1);
    assert.equal(h.sockets[0].sent.filter(packet => packet.type === 'action').length, 1);
  }
});

test('a recovered decision acknowledgement cannot advance the host while paused', async () => {
  const h = harness(); h.client.close();
  let emit, finishAck, latest = { phase: 'running', seats: [{ connected: true }] };
  const room = {
    current: () => latest,
    subscribe(fn) { emit = view => { latest = view; fn(view); }; },
    async dispatch(action) {
      if (action.type === 'decisionRequest') emit({ ...latest, lastDecision: { id: 'd1', response: 'yes' } });
      if (action.type === 'decisionAck') {
        emit({ ...latest, phase: 'paused' });
        await new Promise(resolve => { finishAck = resolve; });
      }
    },
  };
  const bridge = h.MTG.onlineHostBridge(room);
  let completed = false;
  const result = bridge.requestDecision({ id: 'd1', descriptor: { id: 'd1' } }).then(value => { completed = true; return value; });
  await flush(); finishAck(); await flush(); assert.equal(completed, false);
  emit({ ...latest, phase: 'running' }); assert.equal(await result, 'yes');
});

test('retrying a manual acknowledgement never repeats the applied correction', async () => {
  const h = harness(); h.client.close();
  let emit, applied = 0, acknowledgements = 0;
  const request = { id: 'manual-1', action: { type: 'createToken' } };
  let latest = { phase: 'running', pendingManualAction: request };
  const bridge = h.MTG.onlineHostBridge({
    current: () => latest,
    subscribe(fn) { emit = view => { latest = view; fn(view); }; },
    async dispatch(action) { assert.equal(action.type, 'manualAck'); if (++acknowledgements === 1) throw new Error('terminal acknowledgement failure'); },
  });
  bridge.setManualActionHandler(async () => { applied++; return { text: 'Created token' }; });
  await flush(); assert.equal(applied, 1); assert.equal(h.errors.length, 1);
  emit({ ...latest }); await flush();
  assert.equal(acknowledgements, 2); assert.equal(applied, 1);
});
