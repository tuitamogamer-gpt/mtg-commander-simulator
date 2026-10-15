import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const accountSource = readFileSync(new URL('../src/account.js', import.meta.url), 'utf8');
const mainSource = readFileSync(new URL('../src/modules/main.js', import.meta.url), 'utf8');
const uiSource = readFileSync(new URL('../src/modules/ui.js', import.meta.url), 'utf8');
const matchId = 'match-completion-native-0001';
const otherMatch = 'match-completion-native-0002';
const profile = { gamesPlayed: 0, wins: 0, losses: 0, lifetimeScore: 0, favoriteDecks: [] };
const recoveryKey = owner => 'mtg-solo-recovery/v1/' + encodeURIComponent(owner);
function deferred() { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; }
function save(id = matchId) {
  return { schema: 'commander-save/v1', mode: 'solo', matchId: id,
    setup: { deck: 'Quick Draw', commanders: ['Stella Lee, Wild Card'], ai: 1, aiDecks: ['Elven Council'], seed: '10' },
    decisions: [], summary: { turn: 7 } };
}

async function harness({ guest = false, handle } = {}) {
  const requests = [], local = new Map(), handlers = new Map(), navigations = [], errors = [];
  const session = { ownerId: guest ? null : 'owner-a' };
  const ui = { me: { lost: true }, renders: 0, queueRender() { this.renders++; }, toast() {} };
  const g = { turnNo: 7, gameOver: true, winner: null };
  const c = { console: { ...console, error: (...args) => errors.push(args.map(String).join(' ')) },
    URL, URLSearchParams, Intl, TextEncoder, setTimeout, clearTimeout,
    location: { search: '', pathname: '/', replace: path => navigations.push(path) },
    document: { readyState: 'complete', querySelector: () => null, body: { classList: { add() {}, remove() {} } } },
    localStorage: { getItem: key => local.get(key) ?? null, setItem: (key, value) => local.set(key, String(value)), removeItem: key => local.delete(key) },
    CustomEvent: class { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
    addEventListener(type, fn) { const list = handlers.get(type) || []; list.push(fn); handlers.set(type, list); },
    removeEventListener(type, fn) { handlers.set(type, (handlers.get(type) || []).filter(entry => entry !== fn)); },
    dispatchEvent(event) { for (const fn of handlers.get(event.type) || []) fn(event); },
    async fetch(url, options = {}) {
      const body = options.body ? JSON.parse(options.body) : null;
      const action = body?.action || new URL(url, 'https://native.example/').searchParams.get('action');
      const request = { action, body }; requests.push(request);
      const custom = handle ? await handle(request) : null;
      const status = custom?.status || 200;
      return { ok: status >= 200 && status < 300, status, async json() {
        if (custom?.json) return custom.json();
        if (custom) return custom.payload;
        if (action === 'session') return { ok: true, user: session.ownerId ? { id: session.ownerId } : null, profile, save: null };
        if (action === 'logout') return { ok: true };
        if (action === 'completeMatch') return { ok: true, ownerId: session.ownerId, recorded: true, profile, save: null };
        throw new Error('Unexpected request: ' + action);
      } };
    },
  };
  c.window = c; c.globalThis = c;
  vm.createContext(c);
  vm.runInContext(accountSource, c, { filename: 'src/account.js' });
  await c.MTGAccount.whenReady();
  Object.assign(c, { ui, g, _ui: ui, _game: g, accountCheckpointEnabled: true, saveTimer: null, state: {},
    saveSetup: save().setup, recordedTimeline: [], matchId, latestBoardState: null, latestBoardTimelineIndex: null,
    queueAccountSave() {}, completeAccountMatch() {}, MTG: { buildAccountSave: () => save() } });
  const start = mainSource.indexOf('    let gameAccountOwnerId =');
  const end = mainSource.indexOf('    if (state.onlineBridge && state.onlineBridge.setManualActionHandler)', start);
  assert.ok(start >= 0 && end > start);
  // Native account callbacks and the actual game completion closure share one
  // identity. Only HTTP, browser storage, and navigation are boundary doubles.
  vm.runInContext(mainSource.slice(start, end), c, { filename: 'main-completion-closure.js' });
  return { c, ui, g, session, requests, local, navigations, errors, api: c.MTGAccount,
    complete: () => c.completeAccountMatch(), leave: () => c.MTG.leaveAsLoss() };
}

test('logout before the native completion callback cannot claim statistics were updated or latch success', async () => {
  const logoutBody = deferred();
  let logoutReady = false;
  const f = await harness({ handle: request => request.action === 'logout'
    ? { json: () => { logoutReady = true; return logoutBody.promise; } } : null });
  f.api.saveLocalRecovery(save(), 'owner-a');
  const loggingOut = f.api.logout();
  while (!logoutReady) await Promise.resolve();
  logoutBody.resolve({ ok: true });
  for (let step = 0; step < 3; step++) await Promise.resolve();
  assert.equal(f.api.user.id, 'owner-a', 'the game sees its original owner before calling the native API');
  assert.equal(await f.complete(), false);
  await loggingOut;
  assert.equal(f.requests.filter(request => request.action === 'completeMatch').length, 0);
  assert.equal(f.ui.accountSaveStatus.text, 'Stats pending');
  assert.ok(f.local.has(recoveryKey('owner-a')), 'unconfirmed completion retains that account’s device checkpoint');
  await f.api.refresh();
  assert.equal(await f.complete(), true, 'signing back into the same account can retry the unconfirmed result');
  assert.equal(f.requests.filter(request => request.action === 'completeMatch').length, 1);
  assert.equal(f.ui.accountSaveStatus.text, 'Stats updated');
  assert.equal(f.local.has(recoveryKey('owner-a')), false);
});

for (const recorded of [true, false]) test(`a confirmed ${recorded ? 'new' : 'duplicate'} completion acknowledges success and preserves a different recovery`, async () => {
  const f = await harness({ handle: request => request.action === 'completeMatch'
    ? { payload: { ok: true, ownerId: 'owner-a', recorded, profile, save: save(otherMatch) } } : null });
  f.api.saveLocalRecovery(save(otherMatch), 'owner-a');
  const before = f.local.get(recoveryKey('owner-a'));
  assert.equal(await f.complete(), true);
  assert.equal(await f.complete(), true);
  assert.equal(f.requests.filter(request => request.action === 'completeMatch').length, 1, 'confirmed completion is latched');
  assert.equal(f.ui.accountSaveStatus.text, 'Stats updated');
  assert.equal(f.local.get(recoveryKey('owner-a')), before);
  assert.equal(f.api.save.matchId, otherMatch);
});

test('duplicate completion callers and I lost await the same in-flight result before leaving', async () => {
  const response = deferred();
  const f = await harness({ handle: request => request.action === 'completeMatch' ? response.promise : null });
  f.api.saveLocalRecovery(save(), 'owner-a');
  const first = f.complete(), second = f.complete();
  assert.equal(first, second, 'a second caller must share the pending acknowledgment');
  const leaving = f.leave();
  while (!f.requests.some(request => request.action === 'completeMatch')) await Promise.resolve();
  await Promise.resolve();
  assert.equal(f.navigations.length, 0);
  assert.ok(f.local.has(recoveryKey('owner-a')));
  response.resolve({ payload: { ok: true, ownerId: 'owner-a', recorded: true, profile, save: null } });
  assert.equal(await first, true);
  assert.equal(await leaving, true);
  assert.equal(f.requests.filter(request => request.action === 'completeMatch').length, 1);
  assert.deepEqual(f.navigations, ['/?view=profile']);
  assert.equal(f.local.has(recoveryKey('owner-a')), false);
});

test('an incomplete or malformed completion receipt preserves recovery and remains retryable', async () => {
  for (const recorded of [undefined, null, 'false']) {
    let invalid = true;
    const f = await harness({ handle: request => request.action === 'completeMatch'
      ? { payload: { ok: true, ownerId: 'owner-a', recorded: invalid ? recorded : false,
        profile: { ...profile, gamesPlayed: 1 }, save: null } } : null });
    f.api.saveLocalRecovery(save(), 'owner-a');
    const before = f.local.get(recoveryKey('owner-a'));
    assert.equal(await f.complete(), false);
    assert.equal(f.ui.accountSaveStatus.text, 'Stats pending');
    assert.equal(f.local.get(recoveryKey('owner-a')), before);
    assert.equal(f.api.profile.gamesPlayed, 0);
    invalid = false;
    assert.equal(await f.complete(), true);
    assert.equal(f.api.profile.gamesPlayed, 1);
    assert.equal(f.local.has(recoveryKey('owner-a')), false);
  }
});

test('a failed loss submission keeps the table and exact checkpoint for a successful retry', async () => {
  let fail = true;
  const f = await harness({ handle: request => request.action === 'completeMatch' && fail
    ? { status: 503, payload: { ok: false, error: 'Temporary outage' } } : null });
  f.api.saveLocalRecovery(save(), 'owner-a');
  const before = f.local.get(recoveryKey('owner-a'));
  await assert.rejects(f.leave(), /result.*confirmed/i);
  assert.equal(f.navigations.length, 0);
  assert.equal(f.local.get(recoveryKey('owner-a')), before);
  assert.equal(f.ui.accountSaveStatus.text, 'Stats pending');
  fail = false;
  assert.equal(await f.leave(), true);
  assert.equal(f.requests.filter(request => request.action === 'completeMatch').length, 2);
  assert.equal(f.local.has(recoveryKey('owner-a')), false);
  assert.equal(f.navigations.length, 1);
});

test('an in-flight completion cannot publish success or clear either owner’s recovery after an account switch', async () => {
  const response = deferred();
  const f = await harness({ handle: request => request.action === 'completeMatch' ? response.promise : null });
  f.api.saveLocalRecovery(save(), 'owner-a');
  const beforeA = f.local.get(recoveryKey('owner-a'));
  const completing = f.complete();
  while (!f.requests.some(request => request.action === 'completeMatch')) await Promise.resolve();
  f.session.ownerId = 'owner-b';
  await f.api.refresh();
  f.api.saveLocalRecovery(save(otherMatch), 'owner-b');
  const beforeB = f.local.get(recoveryKey('owner-b'));
  response.resolve({ payload: { ok: true, ownerId: 'owner-a', recorded: true, profile, save: null } });
  assert.equal(await completing, false);
  assert.equal(f.ui.accountSaveStatus.text, 'Profile changed · saves paused');
  assert.equal(f.local.get(recoveryKey('owner-a')), beforeA);
  assert.equal(f.local.get(recoveryKey('owner-b')), beforeB);
  assert.equal(f.api.user.id, 'owner-b');
  assert.equal(await f.complete(), false);
  assert.equal(f.requests.filter(request => request.action === 'completeMatch').length, 1);
});

test('a late completion updates the account without rendering over the replacement table', async () => {
  for (const failure of [false, true]) {
    const response = deferred();
    const f = await harness({ handle: request => request.action === 'completeMatch' ? response.promise : null });
    const completing = f.complete();
    while (!f.requests.some(request => request.action === 'completeMatch')) await Promise.resolve();
    f.c._accountGameCleanup();
    f.c._game = {};
    f.c._ui = { accountSaveStatus: { text: 'New table' } };
    f.api.saveLocalRecovery(save(otherMatch), 'owner-a');
    const replacement = f.local.get(recoveryKey('owner-a'));
    const renders = f.ui.renders;
    response.resolve(failure ? { status: 503, payload: { ok: false, error: 'Temporary outage' } }
      : { payload: { ok: true, ownerId: 'owner-a', recorded: true, profile: { ...profile, gamesPlayed: 1 }, save: save(otherMatch) } });
    assert.equal(await completing, !failure);
    assert.equal(f.ui.renders, renders, 'the detached table must not schedule a render after rematch');
    assert.equal(f.c._ui.accountSaveStatus.text, 'New table');
    assert.equal(f.local.get(recoveryKey('owner-a')), replacement);
    assert.equal(f.api.profile.gamesPlayed, failure ? 0 : 1);
  }
});

test('guest completion clears its finished device checkpoint and leaves without account writes', async () => {
  const f = await harness({ guest: true });
  f.api.saveLocalRecovery(save(), 'guest');
  assert.equal(await f.leave(), true);
  assert.equal(f.local.has(recoveryKey('guest')), false);
  assert.equal(f.requests.filter(request => request.action === 'completeMatch').length, 0);
  assert.deepEqual(f.navigations, ['/']);
});

test('pagehide cannot recreate a confirmed loss while the remaining seats are still playing', async () => {
  for (const guest of [false, true]) {
    const f = await harness({ guest });
    f.g.gameOver = false;
    const ownerId = guest ? 'guest' : 'owner-a';
    f.api.saveLocalRecovery(save(), ownerId);
    assert.equal(await f.leave(), true);
    f.c.dispatchEvent({ type: 'pagehide' });
    f.c.queueAccountSave();
    assert.equal(f.local.has(recoveryKey(ownerId)), false);
    assert.equal(f.requests.filter(request => request.action === 'save').length, 0);
  }
});

test('an archived loss callback is handled without changing or leaving the replacement table', async () => {
  const f = await harness();
  const archived = f.c.MTG.leaveAsLoss;
  f.c._accountGameCleanup();
  f.c._game = {};
  f.c._ui = { accountSaveStatus: { text: 'New table' } };
  f.api.saveLocalRecovery(save(otherMatch), 'owner-a');
  const replacement = f.local.get(recoveryKey('owner-a'));
  assert.equal(await archived(), true, 'handled=true prevents the UI from taking its fallback exit');
  assert.equal(f.requests.filter(request => request.action === 'completeMatch').length, 0);
  assert.deepEqual(f.navigations, []);
  assert.equal(f.local.get(recoveryKey('owner-a')), replacement);
});

test('the native I lost callback cannot navigate or fall back to exit after a replacement table starts', async () => {
  for (const failure of [false, true]) {
    const response = deferred();
    const f = await harness({ handle: request => request.action === 'completeMatch' ? response.promise : null });
    let fallbackExits = 0;
    f.c.MTG.exitToMainMenu = () => { fallbackExits++; };
    f.c.location.reload = () => { fallbackExits++; };
    const begin = uiSource.indexOf('    async leaveAsLoss(button) {');
    const end = uiSource.indexOf('    renderGameOver(g) {', begin);
    assert.ok(begin >= 0 && end > begin);
    const nativeUILeave = vm.runInContext('({' + uiSource.slice(begin, end) + '}).leaveAsLoss', f.c);
    const leaving = nativeUILeave.call(f.ui, { disabled: false, textContent: 'I lost' });
    while (!f.requests.some(request => request.action === 'completeMatch')) await Promise.resolve();
    f.c._accountGameCleanup();
    f.c._game = {};
    f.c._ui = { accountSaveStatus: { text: 'New table' } };
    f.api.saveLocalRecovery(save(otherMatch), 'owner-a');
    const replacement = f.local.get(recoveryKey('owner-a'));
    response.resolve(failure ? { status: 503, payload: { ok: false, error: 'Temporary outage' } }
      : { payload: { ok: true, ownerId: 'owner-a', recorded: true, profile, save: save(otherMatch) } });
    await leaving;
    assert.deepEqual(f.navigations, []);
    assert.equal(fallbackExits, 0);
    assert.equal(f.local.get(recoveryKey('owner-a')), replacement);
    assert.equal(f.c._ui.accountSaveStatus.text, 'New table');
    assert.equal(f.ui.leavingAsLoss, true, 'the obsolete UI callback settles as handled without showing a retry error');
  }
});
