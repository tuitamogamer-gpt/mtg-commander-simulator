import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import { createCommanderLiveServer, createMemoryRoomStore } from '../api/ws.js';

async function fixture(t) {
  const store = createMemoryRoomStore(), servers = [], sockets = [];
  const room = randomUUID();
  t.after(async () => {
    sockets.forEach(ws => ws.terminate());
    await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
  });
  async function server() {
    const instance = createCommanderLiveServer({ store });
    servers.push(instance);
    instance.listen(0, '127.0.0.1');
    await once(instance, 'listening');
    return instance;
  }
  async function join(instance, playerId, create = false) {
    const ws = new WebSocket(`ws://127.0.0.1:${instance.address().port}/api/ws?room=${room}${create ? '&create=1&players=2' : ''}`);
    sockets.push(ws);
    const messages = [];
    ws.on('message', raw => messages.push(JSON.parse(String(raw))));
    await once(ws, 'open');
    async function wait(predicate, from = 0) {
      for (let i = 0; i < 300; i++) {
        const found = messages.slice(from).find(predicate);
        if (found) return found;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      throw new Error('Expected replay protocol response was not received.');
    }
    ws.send(JSON.stringify({ type: 'join', playerId }));
    const initial = await wait(message => message.type === 'state');
    const session = randomUUID();
    let serial = 0;
    return {
      ws, messages, initial, wait,
      nextId: () => `action:v1:${session}:${++serial}`,
      async reply(action, requestId) {
        const from = messages.length;
        ws.send(JSON.stringify({ type: 'action', action, requestId }));
        return wait(message => message.requestId === requestId, from);
      },
      async act(action, requestId = `action:v1:${session}:${++serial}`) {
        const result = await this.reply(action, requestId);
        assert.equal(result.type, 'actionAck', result.error);
        return requestId;
      },
    };
  }
  const first = await server();
  const host = await join(first, 'test-host-0000000001', true);
  const guest = await join(first, 'test-guest-000000001');
  async function start() {
    await host.act({ type: 'configure', deckId: 'Abzan Armor', ready: true });
    await guest.act({ type: 'configure', deckId: 'Elven Council', ready: true });
    await host.act({ type: 'start', seed: 8147 });
  }
  return { store, room, server, join, first, host, guest, start };
}

test('durable receipts survive another server connection and preserve an answered decision', async t => {
  const f = await fixture(t);
  await f.start();
  const request = { type: 'decisionRequest', decision: { id: 'keep-answer', seat: 1, type: 'chooseOption', legal: { kind: 'token', tokens: ['yes', 'no'] } } };
  const requestId = await f.host.act(request);
  const response = { type: 'decisionResponse', decisionId: 'keep-answer', response: 'yes' };
  const responseId = await f.guest.act(response);
  const closed = once(f.host.ws, 'close');
  f.host.ws.terminate();
  await closed;
  await f.guest.wait(message => message.type === 'state' && message.view.phase === 'paused');
  const host = await f.join(await f.server(), 'test-host-0000000001');
  assert.equal(host.initial.actionReplay, true);
  const before = await f.store.get(f.room);
  assert.equal(before.lastDecision.response, 'yes');
  await host.act(request, requestId);
  await f.guest.act(response, responseId);
  assert.deepEqual(await f.store.get(f.room), before, 'duplicate requests neither mutate nor clear the returned answer');
  const mismatch = await host.reply({ ...request, decision: { ...request.decision, id: 'changed' } }, requestId);
  assert.equal(mismatch.type, 'error');
  assert.match(mismatch.error, /cannot change/);
  assert.equal(JSON.stringify(host.initial).includes('actionReceipts'), false);
  assert.equal(JSON.stringify(host.initial).includes(requestId), false);
});

test('an uncommitted paused decision defers without a receipt and resumes exactly once', async t => {
  const f = await fixture(t);
  await f.start();
  await f.host.act({ type: 'presence', connected: false });
  const action = { type: 'decisionRequest', decision: { id: 'after-resume', seat: 1, type: 'chooseOption', legal: { kind: 'token', tokens: ['yes'] } } };
  const requestId = f.host.nextId();
  const before = await f.store.get(f.room);
  assert.equal((await f.host.reply(action, requestId)).type, 'actionDeferred');
  assert.deepEqual(await f.store.get(f.room), before);
  await f.host.act({ type: 'reconnect' });
  await f.host.act({ type: 'resume' });
  await f.host.act(action, requestId);
  const applied = await f.store.get(f.room);
  assert.equal(applied.pendingDecision.id, 'after-resume');
  await f.host.act(action, requestId);
  assert.deepEqual(await f.store.get(f.room), applied);
});

test('a lost action acknowledgement replays the committed correction without a second mutation', async t => {
  const f = await fixture(t);
  await f.start();
  const action = { type: 'manualAction', action: { type: 'setLife', playerSeat: 1, value: 27 } };
  const requestId = f.guest.nextId();
  const connection = [...f.first.commanderLive.clients].find(client => client.playerId === 'test-guest-000000001');
  const send = connection.ws.send.bind(connection.ws);
  connection.ws.send = (payload, ...args) => {
    if (JSON.parse(String(payload)).type === 'actionAck') return connection.ws.terminate();
    return send(payload, ...args);
  };
  const closed = once(f.guest.ws, 'close');
  f.guest.ws.send(JSON.stringify({ type: 'action', requestId, action }));
  await closed;
  const guest = await f.join(await f.server(), 'test-guest-000000001');
  const committed = await f.store.get(f.room);
  assert.equal(committed.pendingManualAction.action.value, 27);
  await guest.act(action, requestId);
  assert.deepEqual(await f.store.get(f.room), committed);
});

test('receipts are bounded, legacy IDs remain compatible and publication failure does not reject a commit', async t => {
  const f = await fixture(t);
  const action = { type: 'configure', deckId: 'Abzan Armor', ready: true };
  for (let i = 0; i < 131; i++) await f.host.act(action);
  const bounded = await f.store.get(f.room);
  assert.equal(bounded.actionReceipts[0].length, 128);
  await f.host.act({ ...action, ready: false }, 'action:1');
  await f.host.act(action, 'action:1');
  assert.equal((await f.store.get(f.room)).seats[0].ready, true);
  const publish = f.store.publish.bind(f.store);
  f.store.publish = async () => { throw new Error('Expected test notification failure'); };
  const requestId = await f.host.act({ ...action, ready: false });
  f.store.publish = publish;
  const committed = await f.store.get(f.room);
  assert.equal(committed.seats[0].ready, false);
  await f.host.act({ ...action, ready: false }, requestId);
  assert.deepEqual(await f.store.get(f.room), committed);
});

test('a transient notification failure retries delivery to another worker without replaying the mutation', async t => {
  const f = await fixture(t);
  const remoteGuest = await f.join(await f.server(), 'test-guest-000000001');
  const before = await f.store.get(f.room);
  const publish = f.store.publish.bind(f.store);
  let attempts = 0;
  f.store.publish = async room => {
    if (++attempts === 1) throw new Error('Temporary publish outage');
    await publish(room);
  };
  await f.host.act({ type: 'configure', deckId: 'Abzan Armor', ready: true });
  await remoteGuest.wait(message => message.type === 'state' && message.view.seats[0].deckId === 'Abzan Armor');
  assert.equal(attempts, 2);
  assert.equal((await f.store.get(f.room)).revision, before.revision + 1);
});
