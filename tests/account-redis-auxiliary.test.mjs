import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { UpstashAccountStore, createAccountHandler } from '../api/account.js';
import { loadEngine } from './helpers/load-engine.mjs';
import { startLocalAccountRedis } from './helpers/local-account-redis.mjs';

const libraryKey = owner => `commander-account:v1:decks:${owner}`;
const namesKey = owner => `commander-account:v1:deck-names:${owner}`;
const copy = value => JSON.parse(JSON.stringify(value));
const conflict = error => error?.status === 409;

// REDIS_SERVER_BINARY may point to a local development executable. These tests
// never use a deployment URL/token or flush a database shared with other tests.
test('real Redis Lua preserves imported deck auxiliary JSON and account invariants', async t => {
  let fixture;
  try {
    fixture = await startLocalAccountRedis();
  } catch (error) {
    if (error.code === 'ENOENT' && !process.env.REDIS_SERVER_BINARY) {
      t.skip('Install redis-server or set REDIS_SERVER_BINARY to run the real Redis regression.');
      return;
    }
    throw error;
  }
  t.after(fixture.close);
  const { adapter, rawRedis, ownerPrefix } = fixture;
  const store = new UpstashAccountStore(adapter);
  const M = loadEngine();
  const text = await readFile(new URL('./fixtures/yuriko-custom-deck.txt', import.meta.url), 'utf8');
  const validation = M.importCommanderDeck(text, { name: 'Yuriko', commanders: ["Yuriko, the Tiger's Shadow"] });
  assert.equal(validation.ok, true, validation.errors.map(error => error.message).join('\n'));
  assert.equal(validation.summary.resolvedCards, 100);
  const yuriko = copy(M.createImportedDeckRecord(validation, { id: 'deck-yuriko-redis-0001' }));
  let previousCodecRaw;

  await t.test('the previous Lua JSON codec loses empty container types', async child => {
    const encoded = JSON.stringify(yuriko);
    const roundTrip = await adapter.eval('return cjson.encode(cjson.decode(ARGV[1]))', [], [encoded]);
    previousCodecRaw = roundTrip;
    const decoded = JSON.parse(roundTrip);
    assert.notDeepEqual(decoded.auxiliaryV87, yuriko.auxiliaryV87,
      'the old decode/encode path must reproduce the empty-container type loss');
    child.diagnostic(`Redis Lua empty containers: ${JSON.stringify(decoded.auxiliaryV87)}`);
    const revalidated = M.validateImportedDeckRecord(decoded);
    assert.equal(revalidated.ok, false);
    assert.ok(revalidated.errors.some(error => ['chosen-colors', 'draft-format', 'auxiliary-list'].includes(error.code)));
  });

  await t.test('saving and loading the supplied Yuriko deck preserves empty objects and arrays', async () => {
    const owner = `${ownerPrefix}-yuriko`;
    const forged = { ...yuriko, revision: 999, createdAt: '2000-01-01T00:00:00.000Z', updatedAt: '2000-01-01T00:00:00.000Z' };
    const saved = await store.upsertDeck(owner, forged);
    assert.equal(saved.created, true);
    assert.equal(saved.deck.revision, 1);
    assert.notEqual(saved.deck.createdAt, forged.createdAt);
    assert.equal(saved.deck.createdAt, saved.deck.updatedAt);
    assert.equal(Object.hasOwn(saved.deck, '_libraryNameKey'), false);
    assert.deepEqual(saved.deck.auxiliaryV87, yuriko.auxiliaryV87);
    const storedRaw = JSON.parse(await rawRedis.hget(libraryKey(owner), yuriko.id));
    assert.deepEqual(storedRaw.auxiliaryV87.colors, {});
    assert.deepEqual(storedRaw.auxiliaryV87.draft, {});
    for (const field of ['attractions', 'stickers', 'outsideGame']) assert.deepEqual(storedRaw.auxiliaryV87[field], []);
    const [loaded] = await store.getDecks(owner);
    assert.deepEqual(loaded, saved.deck);
    assert.equal(M.validateImportedDeckRecord(loaded).ok, true);
    M.hydrateImportedDeckLibrary([loaded], { source: 'account', ownerId: owner });
    try {
      const [entry] = M.getImportedDeckLibrary().entries;
      assert.equal(entry.ready, true, entry.validation?.errors?.map(error => error.message).join('\n'));
    } finally {
      M.hydrateImportedDeckLibrary([], { source: 'guest' });
    }
  });

  await t.test('populated maps, nested empty card notes and empty draft lists retain their exact types', async () => {
    const owner = `${ownerPrefix}-nested`;
    const record = { ...yuriko, id: 'deck-yuriko-redis-nested', auxiliaryV87: {
      ...copy(yuriko.auxiliaryV87),
      colors: { Island: ['U'], Swamp: [] },
      draft: { Island: {}, Swamp: { numbers: [], keywords: [] }, palianoColors: [], automatonCounts: [], trackerPlayers: [] },
    } };
    const saved = await store.upsertDeck(owner, record);
    const persisted = JSON.parse(await rawRedis.hget(libraryKey(owner), record.id));
    assert.deepEqual(persisted.auxiliaryV87, record.auxiliaryV87);
    assert.deepEqual(saved.deck.auxiliaryV87, record.auxiliaryV87);
    assert.deepEqual((await store.getDecks(owner))[0].auxiliaryV87, record.auxiliaryV87);
    assert.equal(M.validateImportedDeckRecord(saved.deck).ok, true);
    const oldRaw = await adapter.eval('return cjson.encode(cjson.decode(ARGV[1]))', [], [JSON.stringify(record)]);
    const legacyOwner = `${ownerPrefix}-nested-legacy`;
    await rawRedis.hset(libraryKey(legacyOwner), record.id, oldRaw);
    const [oldLoaded] = await store.getDecks(legacyOwner);
    assert.deepEqual(oldLoaded, record, 'known empty container fields from the actual previous codec retain their schema types');
    assert.equal(M.validateImportedDeckRecord(oldLoaded).ok, true);
    assert.equal(await rawRedis.hget(libraryKey(legacyOwner), record.id), oldRaw);
  });

  await t.test('legacy empty maps are repaired on read without changing identities, cards or timestamps', async () => {
    const owner = `${ownerPrefix}-legacy`;
    const legacy = { ...yuriko, revision: 7, createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-10-09T12:00:00.000Z',
      _libraryNameKey: 'yuriko', auxiliaryV87: { ...copy(yuriko.auxiliaryV87), colors: [], draft: [] } };
    const brokenRaw = JSON.stringify(legacy);
    await rawRedis.hset(libraryKey(owner), legacy.id, brokenRaw);
    await rawRedis.hset(namesKey(owner), 'yuriko', legacy.id);
    assert.equal(M.validateImportedDeckRecord(legacy).ok, false);
    const [loaded] = await store.getDecks(owner);
    const expected = copy(legacy);
    delete expected._libraryNameKey;
    expected.auxiliaryV87.colors = {};
    expected.auxiliaryV87.draft = {};
    assert.deepEqual(loaded, expected);
    assert.equal(M.validateImportedDeckRecord(loaded).ok, true);
    assert.equal(await rawRedis.hget(libraryKey(owner), legacy.id), brokenRaw, 'reading repairs the response without rewriting saved data');

    const codecOwner = `${ownerPrefix}-previous-codec`;
    await rawRedis.hset(libraryKey(codecOwner), yuriko.id, previousCodecRaw);
    const [decodedLegacy] = await store.getDecks(codecOwner);
    assert.deepEqual(decodedLegacy, yuriko, 'the actual old codec output is readable regardless of its empty-table encoding direction');
    assert.equal(M.validateImportedDeckRecord(decodedLegacy).ok, true);
    assert.equal(await rawRedis.hget(libraryKey(codecOwner), yuriko.id), previousCodecRaw);

    const legacyNotes = { ...legacy, id: 'deck-yuriko-legacy-notes', name: 'Yuriko notes', auxiliaryV87: {
      ...copy(yuriko.auxiliaryV87), draft: { Island: [], palianoColors: [], automatonCounts: [], trackerPlayers: [] },
    } };
    await rawRedis.hset(libraryKey(owner), legacyNotes.id, JSON.stringify(legacyNotes));
    const notes = (await store.getDecks(owner)).find(record => record.id === legacyNotes.id);
    assert.deepEqual(notes.auxiliaryV87.draft.Island, {});
    for (const key of ['palianoColors', 'automatonCounts', 'trackerPlayers']) assert.deepEqual(notes.auxiliaryV87.draft[key], []);
    assert.equal(M.validateImportedDeckRecord(notes).ok, true);
  });

  await t.test('nonempty invalid maps and card-note arrays stay invalid', async () => {
    const owner = `${ownerPrefix}-invalid`;
    const records = [
      { ...yuriko, id: 'deck-yuriko-invalid-colors', auxiliaryV87: { ...copy(yuriko.auxiliaryV87), colors: ['U'] } },
      { ...yuriko, id: 'deck-yuriko-invalid-draft', auxiliaryV87: { ...copy(yuriko.auxiliaryV87), draft: [{}] } },
      { ...yuriko, id: 'deck-yuriko-invalid-notes', auxiliaryV87: { ...copy(yuriko.auxiliaryV87), draft: { Island: ['invalid'] } } },
      { ...yuriko, id: 'deck-yuriko-invalid-attractions', auxiliaryV87: { ...copy(yuriko.auxiliaryV87), attractions: { invalid: true } } },
      { ...yuriko, id: 'deck-yuriko-invalid-stickers', auxiliaryV87: { ...copy(yuriko.auxiliaryV87), stickers: { invalid: true } } },
      { ...yuriko, id: 'deck-yuriko-invalid-outside', auxiliaryV87: { ...copy(yuriko.auxiliaryV87), outsideGame: { invalid: true } } },
      { ...yuriko, id: 'deck-yuriko-null-colors', auxiliaryV87: { ...copy(yuriko.auxiliaryV87), colors: null } },
      { ...yuriko, id: 'deck-yuriko-null-draft', auxiliaryV87: { ...copy(yuriko.auxiliaryV87), draft: null } },
      { ...yuriko, id: 'deck-yuriko-null-notes', auxiliaryV87: { ...copy(yuriko.auxiliaryV87), draft: { Island: null } } },
    ];
    await rawRedis.hset(libraryKey(owner), Object.fromEntries(records.map(record => [record.id, JSON.stringify(record)])));
    const loaded = await store.getDecks(owner);
    for (const original of records) {
      const record = loaded.find(row => row.id === original.id);
      assert.deepEqual(record, original);
      assert.equal(M.validateImportedDeckRecord(record).ok, false);
    }
  });

  await t.test('atomic duplicate checks and concurrent revisions survive the codec fix', async () => {
    const owner = `${ownerPrefix}-duplicate`;
    const choices = [
      { ...yuriko, id: 'deck-yuriko-redis-race-a', name: 'Concurrent Yuriko' },
      { ...yuriko, id: 'deck-yuriko-redis-race-b', name: 'concurrent yuriko' },
    ];
    const results = await Promise.allSettled(choices.map(record => store.upsertDeck(owner, record)));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.ok(results.filter(result => result.status === 'rejected').every(result => conflict(result.reason)));
    const [initial] = await store.getDecks(owner);
    assert.equal(await rawRedis.hlen(libraryKey(owner)), 1);
    const updates = await Promise.all([
      store.upsertDeck(owner, { ...initial, name: 'Yuriko revision A', revision: 999 }),
      store.upsertDeck(owner, { ...initial, name: 'Yuriko revision B', revision: 999 }),
    ]);
    assert.deepEqual(updates.map(result => result.deck.revision).sort(), [2, 3]);
    assert.ok(updates.every(result => result.deck.createdAt === initial.createdAt));
    const [latest] = await store.getDecks(owner);
    assert.equal(latest.revision, 3);
    assert.equal(await rawRedis.hlen(namesKey(owner)), 1);
    assert.equal(await rawRedis.hget(namesKey(owner), latest.name.toLowerCase()), initial.id);
    assert.deepEqual(latest.auxiliaryV87, yuriko.auxiliaryV87);
  });

  await t.test('concurrent final-slot inserts obey the capacity limit while existing decks remain editable', async () => {
    const owner = `${ownerPrefix}-capacity`;
    const seeded = Array.from({ length: 39 }, (_, index) => ({ ...yuriko,
      id: `deck-yuriko-capacity-${index.toString().padStart(4, '0')}`,
      name: `Capacity ${index}`, revision: 1, _libraryNameKey: `capacity ${index}`,
    }));
    await rawRedis.hset(libraryKey(owner), Object.fromEntries(seeded.map(record => [record.id, JSON.stringify(record)])));
    const results = await Promise.allSettled([
      store.upsertDeck(owner, { ...yuriko, id: 'deck-yuriko-capacity-final-a', name: 'Final A' }),
      store.upsertDeck(owner, { ...yuriko, id: 'deck-yuriko-capacity-final-b', name: 'Final B' }),
    ]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.ok(results.filter(result => result.status === 'rejected').every(result => conflict(result.reason)));
    assert.equal(await rawRedis.hlen(libraryKey(owner)), 40);
    const updated = await store.upsertDeck(owner, { ...seeded[0], name: 'Edited while full' });
    assert.equal(updated.created, false);
    assert.equal(updated.deck.revision, 2);
    assert.equal(await rawRedis.hlen(libraryKey(owner)), 40);
    assert.deepEqual(updated.deck.auxiliaryV87, yuriko.auxiliaryV87);
  });

  await t.test('the real Redis account route retains owner checks and rejects malformed incoming maps', async child => {
    const server = createServer(createAccountHandler({ store, limiter: null }));
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    child.after(() => new Promise(resolve => server.close(resolve)));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const call = async (action, body, cookie = '') => {
      const response = await fetch(`${origin}/api/account`, { method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
        body: JSON.stringify({ action, ...body }),
      });
      return { status: response.status, payload: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie };
    };
    const account = await call('register', { email: `${ownerPrefix}@example.com`, displayName: 'Yuriko Owner', password: 'local-redis-regression-password' });
    assert.equal(account.status, 201);
    const owner = account.payload.user.id;
    const forgedDate = '2000-01-01T00:00:00.000Z';
    const saved = await call('upsertDeck', { expectedOwnerId: owner, deck: {
      ...yuriko, revision: 999, createdAt: forgedDate, updatedAt: forgedDate,
    } }, account.cookie);
    assert.equal(saved.status, 201);
    assert.equal(M.validateImportedDeckRecord(saved.payload.deck).ok, true);
    assert.equal(saved.payload.deck.revision, 1);
    assert.notEqual(saved.payload.deck.createdAt, forgedDate);
    const before = await rawRedis.hget(libraryKey(owner), yuriko.id);
    const wrongOwner = `${ownerPrefix}-other`;
    const rejected = await call('upsertDeck', { expectedOwnerId: wrongOwner, deck: { ...yuriko, name: 'Unwanted replacement' } }, account.cookie);
    assert.equal(rejected.status, 409);
    assert.equal(await rawRedis.hget(libraryKey(owner), yuriko.id), before);
    assert.equal(await rawRedis.hlen(libraryKey(wrongOwner)), 0);
    for (const malformedAuxiliary of [{ colors: [] }, { colors: ['U'] }, { colors: null }, { draft: [] }, { draft: [{}] }, { draft: null }, { attractions: {} }]) {
      const malformed = await call('upsertDeck', { expectedOwnerId: owner, deck: {
        ...yuriko, auxiliaryV87: { ...copy(yuriko.auxiliaryV87), ...malformedAuxiliary },
      } }, account.cookie);
      assert.equal(malformed.status, 400);
      assert.equal(await rawRedis.hget(libraryKey(owner), yuriko.id), before);
    }
    const updated = await call('upsertDeck', { expectedOwnerId: owner, deck: {
      ...yuriko, revision: 999, createdAt: forgedDate, updatedAt: forgedDate,
    } }, account.cookie);
    assert.equal(updated.status, 200);
    assert.equal(updated.payload.deck.revision, 2);
    assert.equal(updated.payload.deck.createdAt, saved.payload.deck.createdAt);
    assert.notEqual(updated.payload.deck.updatedAt, forgedDate);
    assert.deepEqual(updated.payload.deck.auxiliaryV87, yuriko.auxiliaryV87);
  });
});
