import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { createAccountHandler, MemoryAccountStore, UpstashAccountStore } from '../api/account.js';

function testServer(options = {}) {
  const store = options.store || new MemoryAccountStore();
  const handler = createAccountHandler({ store, limiter: options.limiter ?? null });
  const server = createServer(handler);
  return { store, server };
}

async function openServer(t, options) {
  const harness = testServer(options);
  harness.server.listen(0, '127.0.0.1');
  await once(harness.server, 'listening');
  t.after(() => new Promise(resolve => harness.server.close(resolve)));
  const origin = `http://127.0.0.1:${harness.server.address().port}`;
  const call = async (action, body, cookie = '', query = {}) => {
    const params = new URLSearchParams({ action, ...query });
    const response = await fetch(`${origin}/api/account${body ? '' : `?${params}`}`, {
      method: body ? 'POST' : 'GET',
      headers: { Origin: origin, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify({ action, ...body }) : undefined,
    });
    const payload = await response.json();
    const setCookie = response.headers.get('set-cookie');
    return { response, payload, cookie: setCookie ? setCookie.split(';')[0] : cookie };
  };
  return { ...harness, origin, call };
}

function checkpoint(matchId = 'match-account-test-0001') {
  return {
    schema: 'commander-save/v1', mode: 'solo', matchId,
    setup: {
      deck: 'Quandrix Unlimited', commanders: ['Zimone, Infinite Analyst'], ai: 3,
      aiDecks: ['Elven Council', 'Doom Prevails', 'Quick Draw'], aiStyles: ['balanced', 'josh', 'olivia'],
      aiRandomCommanders: false, sumPartnerDamage: false, diplomacyEnabled: true, difficulty: 'hard', seed: '290829',
    },
    decisions: [{ shape: { type: 'mulligan' }, response: { kind: 'boolean', value: false } }],
    summary: { deck: 'Quandrix Unlimited', commanders: ['Zimone, Infinite Analyst'], turn: 8 },
  };
}

function importedDeck(overrides = {}) {
  return {
    schema: 'commander-deck/v1',
    id: 'deck-sauron-0001',
    name: 'Sauron Brings the Ring',
    commanders: ['Sauron, the Dark Lord'],
    cards: [
      { name: 'Sauron, the Dark Lord', n: 1, section: 'Commander' },
      { name: 'Island', n: 99, section: 'Main' },
    ],
    revision: 999,
    createdAt: '2000-01-01T00:00:00.000Z',
    updatedAt: '2000-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function libraryOwner(account) {
  return account.payload.user.id;
}

function listImportedDecks(call, account) {
  return call('decks', null, account.cookie, { expectedOwnerId: libraryOwner(account) });
}

function saveImportedDeck(call, account, deck) {
  return call('upsertDeck', { expectedOwnerId: libraryOwner(account), deck }, account.cookie);
}

function deleteImportedDeck(call, account, deckId) {
  return call('deleteDeck', { expectedOwnerId: libraryOwner(account), deckId }, account.cookie);
}

function saveCheckpoint(call, account, save) {
  return call('save', { expectedOwnerId: libraryOwner(account), save }, account.cookie);
}

function clearCheckpoint(call, account) {
  return call('clearSave', { expectedOwnerId: libraryOwner(account) }, account.cookie);
}

function completeAccountMatch(call, account, match) {
  return call('completeMatch', { expectedOwnerId: libraryOwner(account), ...match }, account.cookie);
}

class ConcurrentMemoryAccountStore extends MemoryAccountStore {
  armConcurrentUpserts(count = 2) {
    let release;
    const promise = new Promise(resolve => { release = resolve; });
    this.upsertGate = { remaining: count, promise, release };
  }

  disarmConcurrentUpserts() {
    this.upsertGate = null;
  }

  async upsertDeck(id, deck) {
    const gate = this.upsertGate;
    if (gate && gate.remaining > 0) {
      gate.remaining -= 1;
      if (gate.remaining === 0) gate.release();
      await gate.promise;
    }
    return super.upsertDeck(id, deck);
  }
}

class FailingLogoutStore extends MemoryAccountStore {
  constructor() {
    super();
    this.failPing = false;
    this.failDelete = false;
  }

  async ping() {
    if (this.failPing) throw new Error('simulated ping failure');
    return super.ping();
  }

  async deleteSession(hash) {
    if (this.failDelete) throw new Error('simulated delete failure');
    return super.deleteSession(hash);
  }
}

test('account API registers, authenticates, saves, scores once, syncs favorites, and logs out', async t => {
  const { store, call } = await openServer(t);
  const created = await call('register', { displayName: 'Boro', email: 'BORO@example.com', password: 'strong-pass-2026' });
  assert.equal(created.response.status, 201);
  assert.equal(created.payload.user.displayName, 'Boro');
  assert.equal(created.payload.user.email, 'boro@example.com');
  assert.equal(created.payload.profile.lifetimeScore, 0);
  assert.match(created.cookie, /^commander_session=/);
  assert.doesNotMatch(JSON.stringify(created.payload), /passwordHash|passwordSalt/);

  const stored = await store.findUserByEmailHash(createHash('sha256').update('boro@example.com').digest('hex'));
  assert.ok(stored.passwordHash);
  assert.notEqual(stored.passwordHash, 'strong-pass-2026');

  const duplicate = await call('register', { displayName: 'Other', email: 'boro@example.com', password: 'strong-pass-2026' });
  assert.equal(duplicate.response.status, 409);
  const badLogin = await call('login', { email: 'boro@example.com', password: 'wrong-password' });
  assert.equal(badLogin.response.status, 401);
  const login = await call('login', { email: 'boro@example.com', password: 'strong-pass-2026' });
  assert.equal(login.response.status, 200);

  const saved = await saveCheckpoint(call, login, checkpoint());
  assert.equal(saved.response.status, 200);
  assert.equal(saved.payload.ownerId, libraryOwner(login));
  assert.equal(saved.payload.save.summary.turn, 8);
  assert.equal(saved.payload.save.summary.decisionCount, 1);
  const favorites = await call('favorites', { decks: ['Quandrix Unlimited', 'Elven Council', 'Quandrix Unlimited'] }, login.cookie);
  assert.deepEqual(favorites.payload.profile.favoriteDecks, ['Elven Council', 'Quandrix Unlimited']);

  const completed = await completeAccountMatch(call, login, {
    matchId: 'match-account-test-0001', deck: 'Quandrix Unlimited', commanders: ['Zimone, Infinite Analyst'], won: true, turns: 14,
  });
  assert.equal(completed.payload.ownerId, libraryOwner(login));
  assert.equal(completed.payload.recorded, true);
  assert.equal(completed.payload.profile.gamesPlayed, 1);
  assert.equal(completed.payload.profile.wins, 1);
  assert.equal(completed.payload.profile.lifetimeScore, 100);
  assert.deepEqual(completed.payload.profile.favoriteCommanders, [{ name: 'Zimone, Infinite Analyst', games: 1 }]);
  assert.equal(completed.payload.save, null);

  const duplicateCompletion = await completeAccountMatch(call, login, {
    matchId: 'match-account-test-0001', deck: 'Quandrix Unlimited', commanders: ['Zimone, Infinite Analyst'], won: true, turns: 14,
  });
  assert.equal(duplicateCompletion.payload.recorded, false);
  assert.equal(duplicateCompletion.payload.profile.gamesPlayed, 1);
  assert.equal(duplicateCompletion.payload.profile.lifetimeScore, 100);

  await saveCheckpoint(call, login, checkpoint('match-account-test-0002'));
  const cleared = await clearCheckpoint(call, login);
  assert.equal(cleared.response.status, 200);
  assert.equal(cleared.payload.ownerId, libraryOwner(login));
  assert.equal(cleared.payload.save, null);

  const session = await call('session', null, login.cookie);
  assert.equal(session.payload.user.displayName, 'Boro');
  assert.equal(session.payload.profile.winRate, 100);
  assert.match(session.response.headers.get('set-cookie'), /HttpOnly; SameSite=Lax; Max-Age=2592000/);
  const logout = await call('logout', {}, login.cookie);
  assert.equal(logout.response.status, 200);
  assert.match(logout.response.headers.get('set-cookie'), /Max-Age=0/);
  const signedOut = await call('session', null, login.cookie);
  assert.equal(signedOut.payload.user, null);
});

test('account API rejects cross-origin writes, invalid saves, and rate-limited auth attempts', async t => {
  const { origin, call } = await openServer(t, { limiter: { limit: async () => ({ success: false }) } });
  const limited = await call('login', { email: 'nobody@example.com', password: 'strong-pass-2026' });
  assert.equal(limited.response.status, 429);

  const response = await fetch(`${origin}/api/account`, {
    method: 'POST', headers: { Origin: 'https://attacker.example', 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'register', displayName: 'Attacker', email: 'attacker@example.com', password: 'strong-pass-2026' }),
  });
  assert.equal(response.status, 403);

  const clean = await openServer(t);
  const registered = await clean.call('register', { displayName: 'Player', email: 'player@example.com', password: 'strong-pass-2026' });
  const invalid = await saveCheckpoint(clean.call, registered, { schema: 'debug/v1', mode: 'solo' });
  assert.equal(invalid.response.status, 400);
  assert.match(invalid.payload.error, /Unsupported save-game format/);
});

test('save, completeMatch, and clearSave reject a stale expected owner before mutating the authenticated account', async t => {
  const { call } = await openServer(t);
  const accountA = await call('register', { displayName: 'Former Player', email: 'former-player@example.com', password: 'strong-pass-2026' });
  const accountB = await call('register', { displayName: 'Current Player', email: 'current-player@example.com', password: 'strong-pass-2026' });

  const missingOwnerSave = await call('save', { save: checkpoint('match-missing-owner-01') }, accountB.cookie);
  assert.equal(missingOwnerSave.response.status, 409);
  assert.equal(missingOwnerSave.payload.code, 'ACCOUNT_OWNER_MISMATCH');
  assert.equal(missingOwnerSave.payload.ownerId, libraryOwner(accountB));

  const staleSave = await call('save', {
    expectedOwnerId: libraryOwner(accountA), save: checkpoint('match-stale-owner-0001'),
  }, accountB.cookie);
  assert.equal(staleSave.response.status, 409);
  assert.equal(staleSave.payload.code, 'ACCOUNT_OWNER_MISMATCH');
  assert.equal(staleSave.payload.ownerId, libraryOwner(accountB));
  assert.equal((await call('session', null, accountB.cookie)).payload.save, null);

  const currentSave = await saveCheckpoint(call, accountB, checkpoint('match-current-owner-01'));
  assert.equal(currentSave.response.status, 200);
  assert.equal(currentSave.payload.ownerId, libraryOwner(accountB));

  const staleCompletion = await call('completeMatch', {
    expectedOwnerId: libraryOwner(accountA),
    matchId: 'match-current-owner-01',
    deck: 'Quandrix Unlimited',
    commanders: ['Zimone, Infinite Analyst'],
    won: true,
    turns: 9,
  }, accountB.cookie);
  assert.equal(staleCompletion.response.status, 409);
  assert.equal(staleCompletion.payload.code, 'ACCOUNT_OWNER_MISMATCH');
  assert.equal(staleCompletion.payload.ownerId, libraryOwner(accountB));
  let currentSnapshot = await call('session', null, accountB.cookie);
  assert.equal(currentSnapshot.payload.profile.gamesPlayed, 0);
  assert.equal(currentSnapshot.payload.profile.lifetimeScore, 0);
  assert.equal(currentSnapshot.payload.save.matchId, 'match-current-owner-01');

  const staleClear = await call('clearSave', { expectedOwnerId: libraryOwner(accountA) }, accountB.cookie);
  assert.equal(staleClear.response.status, 409);
  assert.equal(staleClear.payload.code, 'ACCOUNT_OWNER_MISMATCH');
  assert.equal(staleClear.payload.ownerId, libraryOwner(accountB));
  currentSnapshot = await call('session', null, accountB.cookie);
  assert.equal(currentSnapshot.payload.profile.gamesPlayed, 0);
  assert.equal(currentSnapshot.payload.save.matchId, 'match-current-owner-01');

  const formerSnapshot = await call('session', null, accountA.cookie);
  assert.equal(formerSnapshot.payload.profile.gamesPlayed, 0);
  assert.equal(formerSnapshot.payload.save, null);
});

test('imported deck library persists normalized records per account and owns metadata', async t => {
  const { call } = await openServer(t);
  const accountA = await call('register', { displayName: 'Player A', email: 'player-a@example.com', password: 'strong-pass-2026' });

  const saved = await saveImportedDeck(call, accountA, importedDeck());
  assert.equal(saved.response.status, 201);
  assert.equal(saved.payload.ownerId, libraryOwner(accountA));
  assert.equal(saved.payload.deck.revision, 1);
  assert.notEqual(saved.payload.deck.createdAt, '2000-01-01T00:00:00.000Z');
  assert.notEqual(saved.payload.deck.updatedAt, '2000-01-01T00:00:00.000Z');
  assert.deepEqual(Object.keys(saved.payload.deck), ['schema', 'id', 'name', 'commanders', 'cards', 'revision', 'createdAt', 'updatedAt']);

  const session = await call('session', null, accountA.cookie);
  assert.equal(Object.hasOwn(session.payload, 'decks'), false, 'normal account snapshots should stay small');
  const listed = await listImportedDecks(call, accountA);
  assert.equal(listed.response.status, 200);
  assert.equal(listed.payload.ownerId, libraryOwner(accountA));
  assert.deepEqual(listed.payload.decks, [saved.payload.deck]);

  const renamed = await saveImportedDeck(call, accountA, importedDeck({ name: 'Mordor Reforged', createdAt: '1999-01-01T00:00:00.000Z' }));
  assert.equal(renamed.response.status, 200);
  assert.equal(renamed.payload.ownerId, libraryOwner(accountA));
  assert.equal(renamed.payload.deck.revision, 2);
  assert.equal(renamed.payload.deck.createdAt, saved.payload.deck.createdAt);

  const duplicateName = await saveImportedDeck(call, accountA, importedDeck({ id: 'deck-mordor-0002', name: 'mordor reforged' }));
  assert.equal(duplicateName.response.status, 409);
  assert.equal(duplicateName.payload.ownerId, libraryOwner(accountA));

  const accountB = await call('register', { displayName: 'Player B', email: 'player-b@example.com', password: 'strong-pass-2026' });
  const listB = await listImportedDecks(call, accountB);
  assert.equal(listB.payload.ownerId, libraryOwner(accountB));
  assert.deepEqual(listB.payload.decks, []);
  const deleteFromB = await deleteImportedDeck(call, accountB, renamed.payload.deck.id);
  assert.equal(deleteFromB.payload.ownerId, libraryOwner(accountB));
  assert.equal(deleteFromB.payload.deleted, false);
  assert.equal((await listImportedDecks(call, accountA)).payload.decks.length, 1);

  const removed = await deleteImportedDeck(call, accountA, renamed.payload.deck.id);
  assert.equal(removed.payload.deleted, true);
  assert.equal(removed.payload.ownerId, libraryOwner(accountA));
  assert.deepEqual((await listImportedDecks(call, accountA)).payload.decks, []);
});

test('imported deck library fails closed on malformed records and enforces its 40-deck cap', async t => {
  const { call } = await openServer(t);
  const anonymousList = await call('decks');
  assert.equal(anonymousList.response.status, 401);
  assert.equal(anonymousList.payload.ownerId, null);
  const anonymousSave = await call('upsertDeck', { deck: importedDeck() });
  assert.equal(anonymousSave.response.status, 401);
  assert.equal(anonymousSave.payload.ownerId, null);

  const account = await call('register', { displayName: 'Library Owner', email: 'library@example.com', password: 'strong-pass-2026' });
  const invalidRecords = [
    importedDeck({ schema: 'commander-deck/v0' }),
    importedDeck({ id: '../../unsafe' }),
    importedDeck({ commanders: [] }),
    importedDeck({ commanders: ['One', 'Two', 'Three'] }),
    importedDeck({ cards: [
      { name: 'Sauron, the Dark Lord', n: 1, section: 'Commander' },
      { name: 'Island', n: 98, section: 'Main' },
    ] }),
    importedDeck({ cards: [
      { name: 'Sauron, the Dark Lord', n: 1, section: 'Commander' },
      { name: 'Island', n: 98, section: 'Main' },
      { name: 'Island', n: 1, section: 'Main' },
    ] }),
    importedDeck({ cards: [
      { name: 'Sauron, the Dark Lord', n: 2, section: 'Commander' },
      { name: 'Island', n: 98, section: 'Main' },
    ] }),
    importedDeck({ cards: [
      { name: 'Sauron, the Dark Lord', n: 1, section: 'Main' },
      { name: 'Island', n: 99, section: 'Main' },
    ] }),
  ];
  for (const deck of invalidRecords) {
    const rejected = await saveImportedDeck(call, account, deck);
    assert.ok([400, 413].includes(rejected.response.status), rejected.payload.error);
  }
  assert.deepEqual((await listImportedDecks(call, account)).payload.decks, []);

  for (let index = 0; index < 40; index++) {
    const suffix = String(index).padStart(4, '0');
    const result = await saveImportedDeck(call, account, importedDeck({ id: `deck-limit-${suffix}`, name: `Library Deck ${suffix}` }));
    assert.equal(result.response.status, 201);
  }
  const overflow = await saveImportedDeck(call, account, importedDeck({ id: 'deck-limit-0040', name: 'Library Deck 0040' }));
  assert.equal(overflow.response.status, 409);
  assert.match(overflow.payload.error, /up to 40 decks/);
  assert.equal((await listImportedDecks(call, account)).payload.decks.length, 40);
});

test('deck library rejects stale or missing expected owners before reads and mutations', async t => {
  const { call } = await openServer(t);
  const accountA = await call('register', { displayName: 'Old Owner', email: 'old-owner@example.com', password: 'strong-pass-2026' });
  const accountB = await call('register', { displayName: 'New Owner', email: 'new-owner@example.com', password: 'strong-pass-2026' });
  await saveImportedDeck(call, accountA, importedDeck());

  const missingOwner = await call('decks', null, accountB.cookie);
  assert.equal(missingOwner.response.status, 409);
  assert.equal(missingOwner.payload.code, 'ACCOUNT_OWNER_MISMATCH');
  assert.equal(missingOwner.payload.ownerId, libraryOwner(accountB));

  const staleList = await call('decks', null, accountB.cookie, { expectedOwnerId: libraryOwner(accountA) });
  assert.equal(staleList.response.status, 409);
  assert.equal(staleList.payload.code, 'ACCOUNT_OWNER_MISMATCH');
  assert.equal(staleList.payload.ownerId, libraryOwner(accountB));

  const staleSave = await call('upsertDeck', {
    expectedOwnerId: libraryOwner(accountA),
    deck: importedDeck({ id: 'deck-stale-0001', name: 'Must Not Reach New Owner' }),
  }, accountB.cookie);
  assert.equal(staleSave.response.status, 409);
  assert.equal(staleSave.payload.code, 'ACCOUNT_OWNER_MISMATCH');
  assert.equal(staleSave.payload.ownerId, libraryOwner(accountB));

  const staleDelete = await call('deleteDeck', {
    expectedOwnerId: libraryOwner(accountA), deckId: importedDeck().id,
  }, accountB.cookie);
  assert.equal(staleDelete.response.status, 409);
  assert.equal(staleDelete.payload.code, 'ACCOUNT_OWNER_MISMATCH');
  assert.equal(staleDelete.payload.ownerId, libraryOwner(accountB));
  assert.deepEqual((await listImportedDecks(call, accountB)).payload.decks, []);
  assert.equal((await listImportedDecks(call, accountA)).payload.decks.length, 1);
});

test('concurrent same-name imported deck creates commit exactly one record', async t => {
  const store = new ConcurrentMemoryAccountStore();
  const { call } = await openServer(t, { store });
  const account = await call('register', { displayName: 'Race Owner', email: 'race-name@example.com', password: 'strong-pass-2026' });

  store.armConcurrentUpserts();
  const results = await Promise.all([
    saveImportedDeck(call, account, importedDeck({ id: 'deck-race-name01', name: 'One Ring Race' })),
    saveImportedDeck(call, account, importedDeck({ id: 'deck-race-name02', name: 'one ring race' })),
  ]);
  store.disarmConcurrentUpserts();

  assert.deepEqual(results.map(result => result.response.status).sort(), [201, 409]);
  assert.equal(results.find(result => result.response.status === 409).payload.ownerId, libraryOwner(account));
  const listed = await listImportedDecks(call, account);
  assert.equal(listed.payload.decks.length, 1);
  assert.equal(listed.payload.decks[0].name.toLowerCase(), 'one ring race');
});

test('concurrent imported deck creates cannot overrun the 40-deck cap', async t => {
  const store = new ConcurrentMemoryAccountStore();
  const { call } = await openServer(t, { store });
  const account = await call('register', { displayName: 'Cap Owner', email: 'race-cap@example.com', password: 'strong-pass-2026' });
  for (let index = 0; index < 39; index++) {
    const suffix = String(index).padStart(4, '0');
    const result = await saveImportedDeck(call, account, importedDeck({ id: `deck-race-${suffix}`, name: `Race Deck ${suffix}` }));
    assert.equal(result.response.status, 201);
  }

  store.armConcurrentUpserts();
  const results = await Promise.all([
    saveImportedDeck(call, account, importedDeck({ id: 'deck-race-final1', name: 'Race Final One' })),
    saveImportedDeck(call, account, importedDeck({ id: 'deck-race-final2', name: 'Race Final Two' })),
  ]);
  store.disarmConcurrentUpserts();

  assert.deepEqual(results.map(result => result.response.status).sort(), [201, 409]);
  assert.equal((await listImportedDecks(call, account)).payload.decks.length, 40);
});

test('concurrent imported deck updates receive distinct monotonic revisions', async t => {
  const store = new ConcurrentMemoryAccountStore();
  const { call } = await openServer(t, { store });
  const account = await call('register', { displayName: 'Revision Owner', email: 'race-revision@example.com', password: 'strong-pass-2026' });
  const initial = await saveImportedDeck(call, account, importedDeck());

  store.armConcurrentUpserts();
  const results = await Promise.all([
    saveImportedDeck(call, account, importedDeck({ name: 'Sauron Revision A' })),
    saveImportedDeck(call, account, importedDeck({ name: 'Sauron Revision B' })),
  ]);
  store.disarmConcurrentUpserts();

  assert.deepEqual(results.map(result => result.response.status), [200, 200]);
  assert.deepEqual(results.map(result => result.payload.deck.revision).sort((a, b) => a - b), [2, 3]);
  assert.ok(results.every(result => result.payload.deck.createdAt === initial.payload.deck.createdAt));
  const [stored] = (await listImportedDecks(call, account)).payload.decks;
  assert.equal(stored.revision, 3);
  assert.ok(['Sauron Revision A', 'Sauron Revision B'].includes(stored.name));
});

test('Upstash imported deck writes and deletes each use one atomic Lua operation', async () => {
  const calls = [];
  const redis = {
    async eval(script, keys, args) {
      calls.push({ script, keys, args });
      if (script.includes("local candidate = cjson.decode(ARGV[3])")) {
        const candidate = JSON.parse(args[2]);
        return [1, JSON.stringify({ ...candidate, revision: 1, createdAt: args[3], updatedAt: args[3] })];
      }
      return 1;
    },
  };
  const store = new UpstashAccountStore(redis);
  const saved = await store.upsertDeck('owner-redis-test', {
    schema: importedDeck().schema,
    id: importedDeck().id,
    name: importedDeck().name,
    commanders: importedDeck().commanders,
    cards: importedDeck().cards,
  });
  const deleted = await store.deleteDeck('owner-redis-test', importedDeck().id);

  assert.equal(saved.created, true);
  assert.equal(saved.deck.revision, 1);
  assert.equal(Object.hasOwn(saved.deck, '_libraryNameKey'), false);
  assert.equal(deleted, true);
  assert.equal(calls.length, 2);
  assert.match(calls[0].script, /HLEN/);
  assert.match(calls[0].script, /HGETALL/);
  assert.match(calls[0].script, /HSET/);
  assert.match(calls[1].script, /HDEL/);
  assert.equal(calls[0].keys.length, 2);
  assert.equal(calls[1].keys.length, 2);
});

test('logout always expires the browser cookie when storage ping or session deletion fails', async t => {
  await t.test('storage ping failure', async child => {
    const store = new FailingLogoutStore();
    store.failPing = true;
    const { call } = await openServer(child, { store });
    const logout = await call('logout', {}, 'commander_session=stale-token');
    assert.equal(logout.response.status, 503);
    assert.equal(logout.payload.ok, false);
    assert.equal(logout.payload.code, 'LOCAL_SESSION_CLEARED');
    assert.match(logout.response.headers.get('set-cookie'), /commander_session=;.*Max-Age=0/);
  });

  await t.test('session deletion failure', async child => {
    const store = new FailingLogoutStore();
    const { call } = await openServer(child, { store });
    const account = await call('register', { displayName: 'Logout Owner', email: 'logout-failure@example.com', password: 'strong-pass-2026' });
    store.failDelete = true;
    const logout = await call('logout', {}, account.cookie);
    assert.equal(logout.response.status, 503);
    assert.equal(logout.payload.ok, false);
    assert.equal(logout.payload.code, 'LOCAL_SESSION_CLEARED');
    assert.match(logout.response.headers.get('set-cookie'), /commander_session=;.*Max-Age=0/);
  });
});
