import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const accountSource = readFileSync(new URL('../src/account.js', import.meta.url), 'utf8');
const mainSource = readFileSync(new URL('../src/modules/main.js', import.meta.url), 'utf8');
const menuCss = readFileSync(new URL('../src/public-menu.css', import.meta.url), 'utf8');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function response(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, async json() { return payload; } };
}

function createAccountClient(handleRequest, { offlineIOS = false } = {}) {
  const requests = [];
  const listeners = new Map();
  const local = new Map();
  const document = {
    readyState: 'complete',
    activeElement: null,
    querySelector(selector) { return offlineIOS && selector === 'meta[name="mtg-build"]' ? { content: 'ios-offline' } : null; },
    body: { classList: { add() {}, remove() {} } },
  };
  const context = {
    console,
    document,
    location: { search: '' },
    URL,
    URLSearchParams,
    Intl,
    setTimeout,
    clearTimeout,
    localStorage: {
      getItem(key) { return local.has(key) ? local.get(key) : null; },
      setItem(key, value) { local.set(key, String(value)); },
    },
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
    },
    addEventListener(type, listener) {
      const group = listeners.get(type) || [];
      group.push(listener);
      listeners.set(type, group);
    },
    dispatchEvent(event) {
      for (const listener of listeners.get(event.type) || []) listener(event);
      return true;
    },
    async fetch(url, options = {}) {
      const parsed = new URL(url, 'https://commander.example/');
      const body = options.body ? JSON.parse(options.body) : null;
      const action = body?.action || parsed.searchParams.get('action');
      const request = { action, body, url: parsed, options };
      requests.push(request);
      const result = await handleRequest(request, requests);
      return response(result.payload, result.status);
    },
  };
  context.window = context;
  context.globalThis = context;
  vm.runInNewContext(accountSource, context, { filename: 'src/account.js' });
  return { api: context.MTGAccount, requests, listeners };
}

const user = id => ({ id, displayName: `Player ${id}`, email: `${id}@example.com`, createdAt: '2026-08-30T00:00:00.000Z' });
const profile = { gamesPlayed: 0, wins: 0, losses: 0, lifetimeScore: 0, winRate: 0, favoriteCommanders: [], favoriteDecks: [], recentMatches: [] };
const deck = id => ({ id, name: id, updatedAt: '2026-08-30T00:00:00.000Z' });

test('bundled iOS Solo settles as a guest without calling the account backend', async () => {
  const { api, requests } = createAccountClient(() => { throw new Error('Unexpected network request'); }, { offlineIOS: true });
  await api.whenReady();
  assert.equal(api.loading, false);
  assert.equal(api.user, null);
  assert.equal(requests.length, 0);
});

test('account deck operations wait for initial identity and serialize read/write commits', async () => {
  const initialSession = deferred();
  const deckRead = deferred();
  const calls = [];
  const { api, requests } = createAccountClient(async request => {
    calls.push(request.action);
    if (request.action === 'session') return initialSession.promise;
    if (request.action === 'favorites') return { status: 200, payload: { ok: true, ownerId: request.body.expectedOwnerId, profile } };
    if (request.action === 'upsertDeck') return { status: 201, payload: { ok: true, ownerId: 'owner-a', deck: deck('deck-new-0001') } };
    if (request.action === 'decks') return deckRead.promise;
    if (request.action === 'deleteDeck') return { status: 200, payload: { ok: true, ownerId: 'owner-a', deleted: true, deckId: request.body.deckId } };
    throw new Error(`Unexpected action ${request.action}`);
  });

  const savedBeforeReady = api.upsertDeck(deck('deck-new-0001'));
  await Promise.resolve();
  assert.deepEqual(calls, ['session'], 'no guest/account mutation may run before the initial session resolves');

  initialSession.resolve({ status: 200, payload: { ok: true, user: user('owner-a'), profile, save: null } });
  await api.whenReady();
  assert.equal(api.loading, false);
  assert.equal((await savedBeforeReady).id, 'deck-new-0001');
  const upsertRequest = requests.find(request => request.action === 'upsertDeck');
  assert.equal(upsertRequest.body.expectedOwnerId, 'owner-a');

  const loading = api.loadDecks();
  while (!requests.some(request => request.action === 'decks')) await Promise.resolve();
  const deleting = api.deleteDeck('deck-new-0001');
  await Promise.resolve();
  assert.equal(requests.some(request => request.action === 'deleteDeck'), false, 'delete waits for the queued read and its local commit');
  const deckRequest = requests.find(request => request.action === 'decks');
  assert.equal(deckRequest.url.searchParams.get('expectedOwnerId'), 'owner-a');

  deckRead.resolve({ status: 200, payload: { ok: true, ownerId: 'owner-a', decks: [deck('deck-new-0001')] } });
  assert.equal((await loading).length, 1);
  assert.equal(await deleting, true);
  assert.deepEqual(Array.from(api.decks), []);
});

test('a server owner mismatch discards stale decks, refreshes the session, and rejects the operation', async () => {
  let sessionCalls = 0;
  const { api, requests } = createAccountClient(async request => {
    if (request.action === 'session') {
      sessionCalls += 1;
      const ownerId = sessionCalls === 1 ? 'owner-a' : 'owner-b';
      return { status: 200, payload: { ok: true, user: user(ownerId), profile, save: null } };
    }
    if (request.action === 'favorites') return { status: 200, payload: { ok: true, ownerId: request.body.expectedOwnerId, profile } };
    if (request.action === 'decks') return { status: 200, payload: { ok: true, ownerId: 'owner-b', decks: [deck('wrong-owner-deck')] } };
    throw new Error(`Unexpected action ${request.action}`);
  });

  await api.whenReady();
  await assert.rejects(api.loadDecks(), /account changed/i);
  assert.equal(api.user.id, 'owner-b');
  assert.deepEqual(Array.from(api.decks), []);
  assert.equal(sessionCalls, 2);
  assert.equal(requests.find(request => request.action === 'decks').url.searchParams.get('expectedOwnerId'), 'owner-a');
});

test('checkpoint and match writes are serialized and remain bound to their captured account owner', async () => {
  const pendingSave = deferred();
  const { api, requests } = createAccountClient(async request => {
    if (request.action === 'session') return { status: 200, payload: { ok: true, user: user('owner-a'), profile, save: null } };
    if (request.action === 'favorites') return { status: 200, payload: { ok: true, ownerId: request.body.expectedOwnerId, profile } };
    if (request.action === 'save') return pendingSave.promise;
    if (request.action === 'completeMatch') return { status: 200, payload: { ok: true, ownerId: 'owner-a', recorded: true, profile, save: null } };
    throw new Error(`Unexpected action ${request.action}`);
  });

  await api.whenReady();
  const saving = api.saveGame({ schema: 'test-save' }, 'owner-a');
  while (!requests.some(request => request.action === 'save')) await Promise.resolve();
  const completing = api.completeMatch({ matchId: 'match-account-owner-0001', won: true }, 'owner-a');
  await Promise.resolve();
  assert.equal(requests.some(request => request.action === 'completeMatch'), false, 'completion waits for the pending checkpoint');
  assert.equal(requests.find(request => request.action === 'save').body.expectedOwnerId, 'owner-a');

  pendingSave.resolve({ status: 200, payload: { ok: true, ownerId: 'owner-a', save: { schema: 'test-save' } } });
  assert.equal(await saving, true);
  assert.equal(await completing, true);
  assert.equal(requests.find(request => request.action === 'completeMatch').body.expectedOwnerId, 'owner-a');
});

test('logout clears local identity only when the server confirms logout or LOCAL_SESSION_CLEARED', async () => {
  const localClearClient = createAccountClient(async request => {
    if (request.action === 'session') return { status: 200, payload: { ok: true, user: user('owner-a'), profile, save: null } };
    if (request.action === 'favorites') return { status: 200, payload: { ok: true, ownerId: request.body.expectedOwnerId, profile } };
    if (request.action === 'logout') return { status: 503, payload: { ok: false, code: 'LOCAL_SESSION_CLEARED', error: 'Cleanup failed.' } };
    throw new Error(`Unexpected action ${request.action}`);
  });
  await localClearClient.api.whenReady();
  const cleared = await localClearClient.api.logout();
  assert.equal(cleared.signedOut, true);
  assert.match(cleared.warning, /signed out in this browser/i);
  assert.equal(localClearClient.api.user, null);
  assert.deepEqual(Array.from(localClearClient.api.decks), []);

  const networkFailureClient = createAccountClient(async request => {
    if (request.action === 'session') return { status: 200, payload: { ok: true, user: user('owner-a'), profile, save: null } };
    if (request.action === 'favorites') return { status: 200, payload: { ok: true, ownerId: request.body.expectedOwnerId, profile } };
    if (request.action === 'logout') throw new Error('network unavailable');
    throw new Error(`Unexpected action ${request.action}`);
  });
  await networkFailureClient.api.whenReady();
  await assert.rejects(networkFailureClient.api.logout(), /network unavailable/);
  assert.equal(networkFailureClient.api.user.id, 'owner-a', 'unconfirmed logout must preserve the signed-in identity');
});

test('a delayed favorites response cannot replace the next account profile', async () => {
  const oldFavorites = deferred();
  const oldProfile = { ...profile, lifetimeScore: 900 };
  const newProfile = { ...profile, lifetimeScore: 25 };
  let sessionCalls = 0;
  let favoritesCalls = 0;
  const { api } = createAccountClient(async request => {
    if (request.action === 'session') {
      sessionCalls += 1;
      const initial = sessionCalls === 1;
      return { status: 200, payload: { ok: true, user: user(initial ? 'owner-a' : 'owner-b'), profile: initial ? oldProfile : newProfile, save: null } };
    }
    if (request.action === 'favorites') {
      favoritesCalls += 1;
      if (favoritesCalls === 1) return oldFavorites.promise;
      return { status: 200, payload: { ok: true, ownerId: 'owner-b', profile: newProfile } };
    }
    throw new Error(`Unexpected action ${request.action}`);
  });
  await api.whenReady();
  assert.equal(favoritesCalls, 1);
  await api.refresh();
  assert.equal(api.user.id, 'owner-b');
  assert.equal(api.profile.lifetimeScore, 25);
  oldFavorites.resolve({ status: 200, payload: { ok: true, ownerId: 'owner-a', profile: oldProfile } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(api.user.id, 'owner-b');
  assert.equal(api.profile.lifetimeScore, 25, 'account A favorites must not overwrite account B statistics');
});

for (const action of ['save', 'clearSave', 'completeMatch']) test(`a delayed same-owner session snapshot cannot undo a confirmed ${action}`, async () => {
  const pendingSession = deferred();
  const oldSave = { matchId: 'match-old-0001' };
  const newSave = { matchId: 'match-new-0002' };
  const oldProfile = { ...profile, gamesPlayed: 1, lifetimeScore: 25 };
  const newProfile = { ...profile, gamesPlayed: 2, lifetimeScore: 125 };
  let sessionCalls = 0, currentProfile = oldProfile;
  const { api } = createAccountClient(async request => {
    if (request.action === 'session') return ++sessionCalls === 1
      ? { status: 200, payload: { ok: true, user: user('owner-a'), profile: oldProfile, save: oldSave } }
      : pendingSession.promise;
    if (request.action === 'favorites') return { status: 200, payload: { ok: true, ownerId: 'owner-a', profile: currentProfile } };
    if (request.action === 'save') return { status: 200, payload: { ok: true, ownerId: 'owner-a', save: newSave } };
    if (request.action === 'clearSave') return { status: 200, payload: { ok: true, ownerId: 'owner-a', save: null } };
    if (request.action === 'completeMatch') {
      currentProfile = newProfile;
      return { status: 200, payload: { ok: true, ownerId: 'owner-a', recorded: true, profile: newProfile, save: null } };
    }
    throw new Error(`Unexpected action ${request.action}`);
  });
  await api.whenReady();
  const refreshing = api.refresh();
  if (action === 'save') await api.saveGame(newSave, 'owner-a');
  else if (action === 'clearSave') await api.clearSave('owner-a');
  else await api.completeMatch({ matchId: oldSave.matchId, won: true }, 'owner-a');
  const expectedSave = action === 'save' ? newSave : null;
  assert.equal(api.save, expectedSave);
  pendingSession.resolve({ status: 200, payload: { ok: true, user: user('owner-a'), profile: oldProfile, save: oldSave } });
  await refreshing;
  assert.equal(api.save, expectedSave, 'an earlier response cannot restore a deleted checkpoint or replace the new checkpoint');
  if (action === 'completeMatch') assert.equal(api.profile.lifetimeScore, newProfile.lifetimeScore);
});

test('a delayed same-owner favorites response cannot undo completed-match statistics', async () => {
  const pendingFavorites = deferred();
  const oldProfile = { ...profile, gamesPlayed: 1, lifetimeScore: 25 };
  const newProfile = { ...profile, gamesPlayed: 2, lifetimeScore: 125 };
  const { api, requests } = createAccountClient(async request => {
    if (request.action === 'session') return { status: 200, payload: { ok: true, user: user('owner-a'), profile: oldProfile, save: null } };
    if (request.action === 'favorites') return pendingFavorites.promise;
    if (request.action === 'completeMatch') return { status: 200, payload: { ok: true, ownerId: 'owner-a', recorded: true, profile: newProfile, save: null } };
    throw new Error(`Unexpected action ${request.action}`);
  });
  await api.whenReady();
  await api.completeMatch({ matchId: 'match-statistics-0001', won: true }, 'owner-a');
  assert.equal(api.profile.lifetimeScore, 125);
  pendingFavorites.resolve({ status: 200, payload: { ok: true, ownerId: 'owner-a', profile: oldProfile } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(api.profile.lifetimeScore, 125);
  assert.equal(requests.find(request => request.action === 'favorites').body.expectedOwnerId, 'owner-a');
});

test('a newer local save does not suppress a session snapshot for a different account', async () => {
  const pendingSession = deferred();
  const otherSave = { matchId: 'match-owner-b-0001' };
  let sessionCalls = 0;
  const { api } = createAccountClient(async request => {
    if (request.action === 'session') return ++sessionCalls === 1
      ? { status: 200, payload: { ok: true, user: user('owner-a'), profile, save: null } }
      : pendingSession.promise;
    if (request.action === 'favorites') return { status: 200, payload: { ok: true, ownerId: request.body.expectedOwnerId, profile } };
    if (request.action === 'save') return { status: 200, payload: { ok: true, ownerId: 'owner-a', save: { matchId: 'match-owner-a-0001' } } };
    throw new Error(`Unexpected action ${request.action}`);
  });
  await api.whenReady();
  const refreshing = api.refresh();
  await api.saveGame({ matchId: 'match-owner-a-0001' }, 'owner-a');
  pendingSession.resolve({ status: 200, payload: { ok: true, user: user('owner-b'), profile, save: otherSave } });
  await refreshing;
  assert.equal(api.user.id, 'owner-b');
  assert.equal(api.save, otherSave);
});

test('a failed checkpoint write still allows a newer same-owner session snapshot', async () => {
  const pendingSession = deferred();
  const serverSave = { matchId: 'match-other-tab-0001' };
  let sessionCalls = 0;
  const { api } = createAccountClient(async request => {
    if (request.action === 'session') return ++sessionCalls === 1
      ? { status: 200, payload: { ok: true, user: user('owner-a'), profile, save: null } }
      : pendingSession.promise;
    if (request.action === 'favorites') return { status: 200, payload: { ok: true, ownerId: 'owner-a', profile } };
    if (request.action === 'save') return { status: 503, payload: { ok: false, error: 'Storage unavailable.', ownerId: 'owner-a' } };
    throw new Error(`Unexpected action ${request.action}`);
  });
  await api.whenReady();
  const refreshing = api.refresh();
  await assert.rejects(api.saveGame({ matchId: 'match-failed-0001' }, 'owner-a'), /Storage unavailable/);
  pendingSession.resolve({ status: 200, payload: { ok: true, user: user('owner-a'), profile, save: serverSave } });
  await refreshing;
  assert.equal(api.save, serverSave);
});

test('older favorites cannot prevent a newer session from showing another tab match statistics', async () => {
  const pendingSession = deferred(), oldFavorites = deferred(), newFavorites = deferred();
  const oldProfile = { ...profile, lifetimeScore: 25 };
  const newProfile = { ...profile, lifetimeScore: 125 };
  let sessionCalls = 0, favoritesCalls = 0;
  const { api } = createAccountClient(async request => {
    if (request.action === 'session') return ++sessionCalls === 1
      ? { status: 200, payload: { ok: true, user: user('owner-a'), profile: oldProfile, save: null } }
      : pendingSession.promise;
    if (request.action === 'favorites') return ++favoritesCalls === 1 ? oldFavorites.promise : newFavorites.promise;
    throw new Error(`Unexpected action ${request.action}`);
  });
  await api.whenReady();
  const refreshing = api.refresh();
  oldFavorites.resolve({ status: 200, payload: { ok: true, ownerId: 'owner-a', profile: oldProfile } });
  await new Promise(resolve => setImmediate(resolve));
  pendingSession.resolve({ status: 200, payload: { ok: true, user: user('owner-a'), profile: newProfile, save: null } });
  await refreshing;
  assert.equal(api.profile.lifetimeScore, 125);
  newFavorites.resolve({ status: 200, payload: { ok: true, ownerId: 'owner-a', profile: newProfile } });
  await new Promise(resolve => setImmediate(resolve));
});

for (const mismatchedSuccess of [false, true]) test(`favorites ${mismatchedSuccess ? 'response-owner mismatch' : 'owner rejection'} refreshes identity without committing another profile`, async () => {
  const wrongProfile = { ...profile, lifetimeScore: 900 };
  const nextProfile = { ...profile, lifetimeScore: 25 };
  let sessionCalls = 0, favoritesCalls = 0;
  const { api, requests } = createAccountClient(async request => {
    if (request.action === 'session') return { status: 200, payload: { ok: true,
      user: user(++sessionCalls === 1 ? 'owner-a' : 'owner-b'), profile: nextProfile, save: null } };
    if (request.action === 'favorites') {
      if (++favoritesCalls === 1) return mismatchedSuccess
        ? { status: 200, payload: { ok: true, ownerId: 'owner-b', profile: wrongProfile } }
        : { status: 409, payload: { ok: false, code: 'ACCOUNT_OWNER_MISMATCH', ownerId: 'owner-b', error: 'Your signed-in account changed.' } };
      return { status: 200, payload: { ok: true, ownerId: 'owner-b', profile: nextProfile } };
    }
    throw new Error(`Unexpected action ${request.action}`);
  });
  const observed = [];
  api.onChange(snapshot => observed.push(snapshot.profile?.lifetimeScore));
  await api.whenReady();
  for (let n = 0; n < 20 && (api.user?.id !== 'owner-b' || api.loading); n++)
    await new Promise(resolve => setImmediate(resolve));
  assert.equal(api.user.id, 'owner-b');
  assert.equal(api.profile.lifetimeScore, 25);
  assert.equal(observed.includes(900), false, 'a mismatched successful payload is rejected before commit');
  assert.equal(sessionCalls, 2);
  const favorites = requests.filter(request => request.action === 'favorites');
  assert.equal(favorites[0].body.expectedOwnerId, 'owner-a');
  assert.equal(favorites[1].body.expectedOwnerId, 'owner-b');
});

test('account/library lifecycle keeps recovery, cross-tab sync, and active custom games fail-safe', () => {
  assert.match(accountSource, /await gameLoader\(state\.save\)/, 'restore failures must enter the account recovery path');
  assert.match(accountSource, /Cannot continue[\s\S]*account-clear-save/, 'a failed legacy restore remains deletable');
  assert.match(accountSource, /catch \(error\) \{[\s\S]*logout\.disabled = false;[\s\S]*return;[\s\S]*applySessionSnapshot\(\{ user: null/s, 'failed logout must not present a false signed-out state');
  assert.match(accountSource, /new BroadcastChannel\('mtg-account-session\/v1'\)/);
  assert.match(accountSource, /event\.key === ACCOUNT_SYNC_KEY/);
  assert.match(mainSource, /await globalThis\.MTGAccount\?\.whenReady\?\.\(\)/, 'save/delete must wait for initial account readiness');
  assert.match(mainSource, /U\.hideImportedDeckLibrary\(\{ source: 'loading' \}\)/, 'an owner switch hides old entries without unregistering an active game');
  assert.match(mainSource, /delete MTG\.rematchLastGame/, 'a custom rematch cannot reuse a deck from the previous account');
  assert.match(mainSource, /generation !== importedLibraryGeneration/, 'stale library responses are discarded');
  assert.match(mainSource, /gameAccountOwnerId = globalThis\.MTGAccount\?\.user\?\.id \|\| null/);
  assert.match(mainSource, /ownerId !== gameAccountOwnerId[\s\S]*disableAccountBinding\(\)/);
  assert.match(mainSource, /MTGAccount\.saveGame\([\s\S]*gameAccountOwnerId\)/);
  assert.match(mainSource, /MTGAccount\.completeMatch\([\s\S]*gameAccountOwnerId\)/);
  assert.match(mainSource, /existingBuiltIn && !existingBuiltIn\.custom/);
  assert.match(mainSource, /class="mainmenu-decklibrary-reset">Reset local library/);
  assert.match(mainSource, /U\.removeGuestImportedDeck\(''\)/);
  assert.match(menuCss, /\.mainmenu-decklibrary-reset/);
});
