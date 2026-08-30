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

function createAccountClient(handleRequest) {
  const requests = [];
  const listeners = new Map();
  const local = new Map();
  const document = {
    readyState: 'complete',
    activeElement: null,
    querySelector() { return null; },
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

test('account deck operations wait for initial identity and serialize read/write commits', async () => {
  const initialSession = deferred();
  const deckRead = deferred();
  const calls = [];
  const { api, requests } = createAccountClient(async request => {
    calls.push(request.action);
    if (request.action === 'session') return initialSession.promise;
    if (request.action === 'favorites') return { status: 200, payload: { ok: true, profile } };
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
    if (request.action === 'favorites') return { status: 200, payload: { ok: true, profile } };
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
    if (request.action === 'favorites') return { status: 200, payload: { ok: true, profile } };
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
    if (request.action === 'favorites') return { status: 200, payload: { ok: true, profile } };
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
    if (request.action === 'favorites') return { status: 200, payload: { ok: true, profile } };
    if (request.action === 'logout') throw new Error('network unavailable');
    throw new Error(`Unexpected action ${request.action}`);
  });
  await networkFailureClient.api.whenReady();
  await assert.rejects(networkFailureClient.api.logout(), /network unavailable/);
  assert.equal(networkFailureClient.api.user.id, 'owner-a', 'unconfirmed logout must preserve the signed-in identity');
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
