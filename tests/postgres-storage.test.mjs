import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID, scryptSync } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createDatabasePool } from '../server/postgres.js';
import { PostgresAccountStore } from '../server/postgres-account-store.js';
import { PostgresRoomStore } from '../server/postgres-room-store.js';
import { createAccountHandler } from '../api/account.js';
import { createCommanderLiveServer } from '../api/ws.js';
import { migrateSchema } from '../scripts/migrate-postgres.mjs';
import { importSnapshot } from '../scripts/import-redis.mjs';

// An explicit TEST_DATABASE_URL must point to a disposable local database.
// Never infer a database from production/development environment variables.
const url = process.env.TEST_DATABASE_URL;
const sha = value => createHash('sha256').update(value).digest('hex');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate) {
  for (let i = 0; i < 400; i++) { const result = await predicate(); if (result) return result; await delay(10); }
  throw new Error('Timed out waiting for database synchronization.');
}

test('PostgreSQL migration, auth, concurrent account writes and cross-worker Live rooms', { skip: !url && 'Set TEST_DATABASE_URL to an empty disposable PostgreSQL database.' }, async t => {
  const pool = createDatabasePool(url);
  t.after(() => pool.end());
  await migrateSchema(pool);
  const existing = await pool.query('SELECT count(*) AS n FROM commander.accounts');
  assert.equal(Number(existing.rows[0].n), 0, 'Use an empty disposable test database.');

  const id = randomUUID(), token = 'existing-private-session', salt = Buffer.from('migration-fixture').toString('base64');
  const user = { id, email: 'migration@example.invalid', emailHash: sha('migration@example.invalid'), displayName: 'Migration',
    passwordSalt: salt, passwordHash: scryptSync('keep-my-password', Buffer.from(salt, 'base64'), 64).toString('base64'),
    createdAt: '2026-01-01T00:00:00.000Z' };
  const saved = { schema: 'commander-save/v1', mode: 'solo', matchId: 'existing-match-000001', setup: { deck: 'Deck' },
    decisions: [], summary: { commanders: [] }, auxiliary: { colors: {}, cards: [] } };
  const deck = { id: 'existing-deck-000001', name: 'Existing deck', revision: 7, createdAt: user.createdAt,
    updatedAt: user.createdAt, auxiliaryV87: { colors: {}, draft: {}, attractions: [], stickers: [], outsideGame: [] } };
  const records = [];
  const add = (key, type, value, expiresAt = null) => records.push({ key: 'commander-account:v1:' + key, type, value, expiresAt });
  add('user:' + id, 'string', JSON.stringify(user));
  add('email:' + user.emailHash, 'string', id);
  add('session:' + sha(token), 'string', JSON.stringify({ userId: id, createdAt: user.createdAt }), Date.now() + 600000);
  add('session:expired', 'string', JSON.stringify({ userId: id }), Date.now() - 1000);
  add('profile:' + id, 'hash', ['gamesPlayed', '2', 'wins', '1', 'losses', '1', 'lifetimeScore', '20']);
  add('commanders:' + id, 'hash', ['Sauron', '2']);
  add('favorites:' + id, 'set', ['Deck B', 'Deck A']);
  add('recent:' + id, 'list', [JSON.stringify({ matchId: 'old-match', won: true })]);
  add('completed:' + id, 'set', ['old-match'], Date.now() + 600000);
  add('save:' + id, 'string', JSON.stringify(saved));
  add('decks:' + id, 'hash', [deck.id, JSON.stringify(deck)]);
  const room = randomUUID();
  const roomState = { revision: 10, actionReceipts: { private: [1] }, privateViews: [{ cards: [] }] };
  records.push({ key: 'commander-live:room:' + room, type: 'string', value: JSON.stringify(roomState), expiresAt: Date.now() + 600000 });
  const bytes = Buffer.from(JSON.stringify({ format: 'commander-redis-export/v1', sourceFingerprint: 'a'.repeat(64), records }));
  const store = new PostgresAccountStore(url), other = new PostgresAccountStore(url);
  t.after(() => Promise.all([store.close(), other.close()]));

  await t.test('imports all persistent records, preserves hashes and expires old sessions, retries without overwriting', async () => {
    await assert.rejects(importSnapshot(pool, bytes, { expectedFingerprint: 'b'.repeat(64) }), /source/);
    const result = await importSnapshot(pool, bytes, { expectedFingerprint: 'a'.repeat(64) });
    assert.deepEqual([result.accounts, result.sessions, result.decks, result.rooms, result.saves, result.completed], [1, 1, 1, 1, 1, 1]);
    assert.equal((await importSnapshot(pool, bytes)).alreadyImported, true);
    assert.deepEqual(await store.getUser(id), user);
    assert.deepEqual(await store.getSave(id), saved);
    assert.deepEqual(await store.getDecks(id), [deck]);
    assert.equal((await store.getProfile(id)).gamesPlayed, 2);
    assert.deepEqual((await store.getProfile(id)).favoriteDecks, ['Deck A', 'Deck B']);
    assert.deepEqual((await pool.query('SELECT state FROM commander.live_rooms WHERE room=$1', [room])).rows[0].state, roomState);
    assert.equal(await store.getSession('expired'), null);
    const different = Buffer.from(bytes.toString().replace('"revision":7', '"revision":8') + ' ');
    await assert.rejects(importSnapshot(pool, different), /not empty/);
    assert.deepEqual(await store.getUser(id), user);
  });

  await t.test('existing password and cookie work, logout invalidates the server session, owners stay isolated', async () => {
    const server = createServer(createAccountHandler({ store }));
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const origin = `http://127.0.0.1:${server.address().port}`;
    const call = async (action, body, cookie = '') => {
      const response = await fetch(origin + '/api/account?action=' + action, { method: body ? 'POST' : 'GET',
        headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: cookie },
        body: body ? JSON.stringify({ action, ...body }) : undefined });
      return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
    };
    try {
      const session = await call('session', null, 'commander_session=' + token);
      assert.equal(session.body.user.id, id);
      assert.deepEqual(session.body.save, saved);
      const login = await call('login', { email: user.email, password: 'keep-my-password' });
      assert.equal(login.status, 200);
      assert.equal(login.body.user.id, id);
      assert.equal('passwordHash' in login.body.user, false);
      assert.equal((await call('login', { email: user.email, password: 'wrong-password' })).status, 401);
      const second = await call('register', { email: 'second@example.invalid', password: 'another-password', displayName: 'Second' });
      assert.equal(second.status, 201);
      assert.equal(second.body.save, null);
      assert.equal((await call('save', { expectedOwnerId: id, save: saved }, second.cookie)).status, 409);
      assert.equal((await call('logout', {}, login.cookie)).status, 200);
      assert.equal((await call('session', null, login.cookie)).body.user, null);
    } finally { await new Promise(resolve => server.close(resolve)); }
  });

  await t.test('concurrent completions count once; completed saves cannot return; different saves survive cleanup', async () => {
    const match = { matchId: 'completed-match-000001', won: true, score: 5, commanders: ['Sauron'] };
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => (i % 2 ? store : other).completeMatch(id, match)));
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal((await store.getProfile(id)).gamesPlayed, 3);
    assert.equal((await store.getProfile(id)).lifetimeScore, 25);
    await assert.rejects(store.saveGame(id, { ...saved, matchId: match.matchId }), { code: 'MATCH_ALREADY_COMPLETED' });
    await other.saveGame(id, saved);
    assert.equal(await store.deleteSaveIfMatch(id, match.matchId), false);
    assert.deepEqual(await store.getSave(id), saved);
  });

  await t.test('deck names, revisions and library cap remain atomic across instances', async () => {
    const results = await Promise.allSettled([store.upsertDeck(id, { id: 'deck-1', name: 'Same Name' }), other.upsertDeck(id, { id: 'deck-2', name: 'same name' })]);
    assert.equal(results.filter(row => row.status === 'fulfilled').length, 1);
    const revisions = await Promise.all(Array.from({ length: 10 }, (_, i) => (i % 2 ? store : other).upsertDeck(id, deck)));
    assert.deepEqual(revisions.map(row => row.deck.revision).sort((a, b) => a - b), [8,9,10,11,12,13,14,15,16,17]);
    const additions = await Promise.allSettled(Array.from({ length: 45 }, (_, i) => (i % 2 ? store : other).upsertDeck(id, { id: 'cap-' + i, name: 'Deck ' + i })));
    assert.equal(additions.filter(row => row.status === 'fulfilled').length, 38);
    assert.equal((await store.getDecks(id)).length, 40);
    assert.equal(await store.deleteDeck('does-not-exist', deck.id).catch(() => false), false);
  });

  await t.test('distributed auth rate limit accepts exactly eight concurrent attempts and expires', async () => {
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 ? store : other).limit('concurrent-fixture')));
    assert.equal(results.filter(row => row.success).length, 8);
    await pool.query("UPDATE commander.rate_limits SET attempts=ARRAY[1::bigint],expires_at=now()-interval '1 second' WHERE key='concurrent-fixture'");
    assert.equal((await store.limit('concurrent-fixture')).success, true);
  });

  await t.test('Live transactions serialize workers, roll back failed changes and reject released leases', async () => {
    const first = new PostgresRoomStore(url), second = new PostgresRoomStore(url);
    try {
      const key = randomUUID();
      let stale;
      await first.withLock(key, async lease => { stale = lease; await first.set(key, { revision: 0 }, lease); });
      await assert.rejects(first.set(key, { revision: 999 }, stale), { code: 'ROOM_BUSY' });
      await Promise.all(Array.from({ length: 20 }, (_, i) => {
        const current = i % 2 ? first : second;
        return current.withLock(key, async lease => { const state = await current.get(key); state.revision++; await current.set(key, state, lease); });
      }));
      assert.equal((await first.get(key)).revision, 20);
      await assert.rejects(first.withLock(key, async lease => { await first.set(key, { revision: 100 }, lease); throw new Error('abort'); }), /abort/);
      assert.equal((await second.get(key)).revision, 20);
      await pool.query("UPDATE commander.live_rooms SET expires_at=now()-interval '1 second' WHERE room=$1", [key]);
      assert.equal(await first.get(key), null);
    } finally { await Promise.all([first.close(), second.close()]); }
  });

  await t.test('real WebSockets on separate workers deliver private views, receipts and reconnect updates via PostgreSQL', async () => {
    const stores = [new PostgresRoomStore(url), new PostgresRoomStore(url)];
    const servers = stores.map(store => createCommanderLiveServer({ store }));
    const sockets = [], key = randomUUID();
    for (const server of servers) { server.listen(0, '127.0.0.1'); await once(server, 'listening'); }
    const join = async (index, playerId, create = false) => {
      const ws = new WebSocket(`ws://127.0.0.1:${servers[index].address().port}/api/ws?room=${key}${create ? '&create=1&players=2' : ''}`);
      sockets.push(ws);
      const messages = [];
      ws.on('message', data => messages.push(JSON.parse(String(data))));
      await once(ws, 'open');
      ws.send(JSON.stringify({ type: 'join', playerId }));
      const state = await until(() => messages.find(message => message.type === 'state'));
      return { ws, messages, state };
    };
    try {
      assert.equal(stores[0].subscriber, null, 'An idle server does not keep Neon awake.');
      const host = await join(0, 'private-host-000001', true);
      const guest = await join(1, 'private-guest-00001');
      assert.equal(host.state.view.you, 0);
      assert.equal(guest.state.view.you, 1);
      await until(() => host.messages.find(message => message.view?.seats[1]?.connected));
      const requestId = `action:v1:${randomUUID()}:1`;
      const action = { type: 'configure', deckId: 'Abzan Armor', ready: true };
      host.ws.send(JSON.stringify({ type: 'action', requestId, action }));
      const ack = await until(() => host.messages.find(message => message.requestId === requestId && message.type === 'actionAck'));
      const committed = await stores[0].get(key);
      await until(() => guest.messages.find(message => message.view?.revision >= committed.revision));
      assert.equal(JSON.stringify(guest.messages).includes('private-host-000001'), false);
      host.ws.send(JSON.stringify({ type: 'action', requestId, action }));
      await until(() => host.messages.filter(message => message.requestId === requestId && message.type === 'actionAck').length === 2);
      assert.equal((await stores[1].get(key)).revision, committed.revision);
      assert.ok(ack);
      // Terminate LISTEN and ensure reconnect resynchronizes a missed publication.
      const listenerPid = stores[1].subscriber.processID;
      await pool.query('SELECT pg_terminate_backend($1)', [listenerPid]);
      const before = guest.messages.length;
      await stores[0].withLock(key, async lease => { const state = await stores[0].get(key); state.revision++; await stores[0].set(key, state, lease); });
      const revision = (await stores[0].get(key)).revision;
      await until(() => guest.messages.slice(before).some(message => message.view?.revision === revision));
    } finally {
      sockets.forEach(socket => socket.terminate());
      await until(() => servers.every(server => server.commanderLive.clients.size === 0));
      assert.ok(stores.every(store => store.subscriber === null), 'Closing the last socket releases LISTEN connections.');
      // Let disconnect commits settle before shutting down both pools.
      await delay(100);
      await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
    }
  });
});
