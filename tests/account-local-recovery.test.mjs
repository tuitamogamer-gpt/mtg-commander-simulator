import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(process.env.ACCOUNT_RECOVERY_SOURCE || new URL('../src/account.js', import.meta.url), 'utf8');
const publicEntrySource = readFileSync(new URL('../src/public-entry.js', import.meta.url), 'utf8');
const prefix = 'mtg-solo-recovery/v1/';
const key = owner => prefix + encodeURIComponent(owner);
const matchM = 'match-local-recovery-0001';
const matchN = 'match-local-recovery-0002';
const profile = { gamesPlayed: 0, wins: 0, losses: 0, lifetimeScore: 0, favoriteDecks: [], favoriteCommanders: [], recentMatches: [] };
const copy = value => JSON.parse(JSON.stringify(value));
function checkpoint(matchId = matchM) {
  return { schema: 'commander-save/v1', mode: 'solo', matchId,
    setup: { deck: 'Quick Draw', commanders: ['Stella Lee, Wild Card'], ai: 1,
      aiDecks: ['Elven Council'], aiStyles: ['balanced'], seed: '2026', importedDecks: [] },
    decisions: [], summary: { deck: 'Quick Draw', commanders: ['Stella Lee, Wild Card'], turn: 4 } };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function client({ ownerId = null, cloudSave = null, local = new Map(), home = false, handle,
  textEncoder = true, crypto = true } = {}) {
  const session = { ownerId, save: cloudSave };
  const requests = [], storageCalls = [], elements = [];
  const failures = { get: false, set: false, remove: false };
  const user = () => session.ownerId ? { id: session.ownerId, displayName: 'Player', email: 'local@example.test' } : null;
  const sessionPayload = () => ({ ok: true, user: user(), profile: user() ? profile : null, save: session.save });
  const element = () => {
    const node = { className: '', textContent: '', innerHTML: '', disabled: false, attributes: {},
      setAttribute(name, value) { this.attributes[name] = value; },
      remove() { const index = elements.indexOf(this); if (index >= 0) elements.splice(index, 1); } };
    return node;
  };
  const actions = { prepend(node) { elements.unshift(node); } };
  const context = {
    console, URL, URLSearchParams, Intl, setTimeout, clearTimeout,
    location: { search: '' },
    document: { readyState: 'complete', activeElement: null,
      body: { classList: { add() {}, remove() {} } }, createElement: element,
      querySelector(selector) {
        if (selector === '#setup[data-app-view="home"] #primary-actions') return home ? actions : null;
        if (selector === '.mainmenu-account-return:not(.mainmenu-device-return)')
          return elements.find(node => node.className.split(' ').includes('mainmenu-account-return') && !node.className.split(' ').includes('mainmenu-device-return')) || null;
        if (selector.startsWith('.')) return elements.find(node => node.className.split(' ').includes(selector.slice(1))) || null;
        return null;
      } },
    localStorage: {
      getItem(name) { storageCalls.push(['get', name]); if (failures.get) throw new Error('PRIVATE storage data'); return local.get(name) ?? null; },
      setItem(name, value) { storageCalls.push(['set', name]); if (failures.set) throw new Error('PRIVATE quota details'); local.set(name, String(value)); },
      removeItem(name) { storageCalls.push(['remove', name]); if (failures.remove) throw new Error('PRIVATE removal details'); local.delete(name); },
    },
    CustomEvent: class { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
    addEventListener() {}, dispatchEvent() { return true; },
    MTG: { validateAccountSave() { throw new Error('Local reads must not hydrate the imported library'); } },
    async fetch(url, options = {}) {
      const parsed = new URL(url, 'https://local.example/');
      const body = options.body ? JSON.parse(options.body) : null;
      const request = { action: body?.action || parsed.searchParams.get('action'), body };
      requests.push(request);
      const custom = handle ? await handle(request, sessionPayload) : null;
      const result = custom || (request.action === 'session' ? { payload: sessionPayload() }
        : request.action === 'logout' ? { payload: { ok: true } }
          : { payload: { ok: true, ownerId: session.ownerId, save: session.save, profile } });
      const status = result.status || 200;
      return { ok: status >= 200 && status < 300, status, async json() { return result.payload; } };
    },
  };
  if (textEncoder) context.TextEncoder = TextEncoder;
  if (crypto) context.crypto = { randomUUID };
  context.globalThis = context;
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'src/account.js' });
  return { api: context.MTGAccount, context, session, sessionPayload, requests, local, failures, storageCalls, elements };
}

test('guest device recovery is synchronous, survives reload, and never uploads or validates the imported library on read', async () => {
  const c = client();
  await c.api.whenReady();
  const written = c.api.saveLocalRecovery(checkpoint(), 'guest');
  assert.equal(written.saved, true);
  assert.equal(typeof written.then, 'undefined');
  assert.equal(typeof written.revision, 'string');
  assert.equal(written.error, '');
  const record = c.api.getLocalRecovery();
  assert.equal(record.ownerId, 'guest');
  assert.equal(record.revision, written.revision);
  assert.deepEqual(copy(record.save), checkpoint());
  record.save.setup.deck = 'Changed by caller';
  assert.equal(c.api.getLocalRecovery().save.setup.deck, 'Quick Draw');
  const next = client({ local: c.local });
  await next.api.whenReady();
  assert.equal(next.api.getLocalRecovery().revision, written.revision);
  assert.deepEqual(next.requests.map(request => request.action), ['session']);
  assert.deepEqual(c.requests.map(request => request.action), ['session']);
});

test('device backup encodes the full checkpoint once and preserves escaped metadata and toJSON output', async () => {
  const ownerId = 'owner/"\\🥷\u2028';
  const c = client({ ownerId });
  await c.api.whenReady();
  const expected = checkpoint();
  expected.setup.deck = 'Deck "},"save":null,"note":"<>&🥷\u2028';
  let toJSONCalls = 0;
  const save = { ...checkpoint(), toJSON() { toJSONCalls++; return expected; } };
  const json = vm.runInContext('JSON', c.context);
  const stringify = json.stringify;
  let checkpointEncodings = 0;
  json.stringify = function (value, ...args) {
    if (value?.schema === 'commander-save/v1' || value?.save?.schema === 'commander-save/v1') checkpointEncodings++;
    return stringify(value, ...args);
  };
  let written;
  try { written = c.api.saveLocalRecovery(save, ownerId); }
  finally { json.stringify = stringify; }
  assert.equal(written.saved, true);
  assert.equal(toJSONCalls, 1);
  assert.equal(checkpointEncodings, 1, 'each synchronous backup traverses the full checkpoint only once');
  const stored = JSON.parse(c.local.get(key(ownerId)));
  assert.deepEqual(stored, { version: 1, ownerId, revision: written.revision, save: expected });
  assert.deepEqual(copy(c.api.getLocalRecovery().save), expected);
});

test('initial loading and settled owner boundaries prevent cross-owner recovery reads and writes', async () => {
  const ready = deferred();
  let pending = ready;
  const c = client({ ownerId: 'owner/á', handle: request => request.action === 'session' && pending ? pending.promise : null });
  assert.equal(c.api.getLocalRecovery(), null);
  assert.equal(c.api.saveLocalRecovery(checkpoint(), 'guest').saved, false);
  assert.equal(c.api.saveLocalRecovery(checkpoint(), 'owner/á').saved, false);
  ready.resolve({ payload: c.sessionPayload() });
  await c.api.whenReady();
  pending = deferred();
  const refreshing = c.api.refresh();
  assert.equal(c.api.loading, true);
  assert.equal(c.api.getLocalRecovery(), null);
  assert.equal(c.api.saveLocalRecovery(checkpoint(), 'owner/á').saved, true);
  assert.equal(c.local.has(key('owner/á')), true);
  assert.equal(c.api.saveLocalRecovery(checkpoint(), 'guest').saved, false);
  pending.resolve({ payload: c.sessionPayload() });
  await refreshing;
  pending = null;
  c.session.ownerId = 'owner-b';
  await c.api.refresh();
  c.storageCalls.length = 0;
  assert.equal(c.api.getLocalRecovery(), null);
  assert.equal(c.api.saveLocalRecovery(checkpoint(), 'owner/á').saved, false);
  assert.equal(c.api.clearLocalRecovery('owner/á', { matchId: matchM }).cleared, false);
  assert.deepEqual(c.storageCalls, [['get', key('owner-b')]]);
  await c.api.logout();
  c.storageCalls.length = 0;
  assert.equal(c.api.getLocalRecovery(), null);
  assert.deepEqual(c.storageCalls, [['get', key('guest')]]);
  assert.equal(c.local.has(key('owner/á')), true);
});

for (const textEncoder of [true, false]) test(`device recovery enforces JSON shape and UTF-8 save limits ${textEncoder ? 'with' : 'without'} TextEncoder`, async () => {
  const c = client({ textEncoder });
  await c.api.whenReady();
  assert.equal(c.api.saveLocalRecovery(checkpoint(), 'guest').saved, true);
  const old = c.local.get(key('guest'));
  const invalid = [null, [], { ...checkpoint(), schema: 'other' }, { ...checkpoint(), mode: 'online' },
    { ...checkpoint(), setup: [] }, { ...checkpoint(), setup: null }, { ...checkpoint(), matchId: 1234567890123456 },
    { ...checkpoint(), matchId: 'short' }, { ...checkpoint(), decisions: {} }, { ...checkpoint(), decisions: Array(5001).fill(null) },
    { ...checkpoint(), toJSON() { return null; } }, { ...checkpoint(), toJSON() { return { ...checkpoint(), mode: 'online' }; } },
    { ...checkpoint(), extra: 'é'.repeat(900_000) }];
  const circular = checkpoint(); circular.extra = circular; invalid.push(circular);
  for (const save of invalid) {
    const result = c.api.saveLocalRecovery(save, 'guest');
    assert.equal(result.saved, false);
    assert.equal(typeof result.error, 'string');
    assert.ok(result.error);
    assert.equal(c.local.get(key('guest')), old);
  }
  const boundary = { ...checkpoint(), extra: '' };
  boundary.extra = 'x'.repeat(1_750_000 - Buffer.byteLength(JSON.stringify(boundary)));
  assert.equal(Buffer.byteLength(JSON.stringify(boundary)), 1_750_000);
  assert.equal(c.api.saveLocalRecovery(boundary, 'guest').saved, true);
  boundary.extra += 'x';
  assert.equal(c.api.saveLocalRecovery(boundary, 'guest').saved, false);
});

test('quota, corrupt metadata, and storage failures stay honest and retain the prior record', async () => {
  const c = client(); await c.api.whenReady();
  assert.equal(c.api.saveLocalRecovery(checkpoint(), 'guest').saved, true);
  const old = c.local.get(key('guest'));
  c.failures.set = true;
  const failed = c.api.saveLocalRecovery(checkpoint(matchN), 'guest');
  assert.equal(failed.saved, false);
  assert.doesNotMatch(failed.error, /PRIVATE/);
  assert.equal(c.local.get(key('guest')), old);
  c.failures.set = false;
  for (const corrupt of ['PRIVATE malformed JSON', JSON.stringify({ ...JSON.parse(old), ownerId: 'another-owner' }),
    JSON.stringify({ ...JSON.parse(old), version: 2 }), JSON.stringify({ ...JSON.parse(old), revision: null })]) {
    c.local.set(key('guest'), corrupt);
    assert.throws(() => c.api.getLocalRecovery(), error => /could not be read/.test(error.message) && !/PRIVATE|another-owner/.test(error.message));
    assert.equal(c.api.clearLocalRecovery('guest', { matchId: matchM }).cleared, false);
    assert.equal(c.local.get(key('guest')), corrupt);
  }
  c.local.set(key('guest'), old);
  c.failures.get = true;
  assert.throws(() => c.api.getLocalRecovery(), /could not be read/);
  c.failures.get = false;
  c.failures.remove = true;
  assert.equal(c.api.clearLocalRecovery('guest', { matchId: matchM }).cleared, false);
  assert.equal(c.local.get(key('guest')), old);
});

test('matched recovery cleanup requires the exact revision and never reuses a deleted revision', async () => {
  const c = client({ ownerId: 'owner-a', crypto: false }); await c.api.whenReady();
  const first = c.api.saveLocalRecovery(checkpoint(), 'owner-a');
  const next = c.api.saveLocalRecovery(checkpoint(), 'owner-a');
  assert.notEqual(first.revision, next.revision);
  assert.equal(c.api.clearLocalRecovery('owner-a', null).cleared, false);
  assert.equal(c.api.clearLocalRecovery('owner-a').cleared, false);
  assert.equal(c.api.clearLocalRecovery('owner-a', { matchId: matchN }).cleared, false);
  assert.equal(c.api.clearLocalRecovery('owner-a', { matchId: matchM, revision: first.revision }).cleared, false);
  assert.equal(c.api.clearLocalRecovery('owner-a', { matchId: matchM, revision: next.revision }).cleared, true);
  const recreated = c.api.saveLocalRecovery(checkpoint(), 'owner-a');
  assert.notEqual(recreated.revision, next.revision);
  assert.equal(c.api.clearLocalRecovery('owner-a', { matchId: matchM, revision: next.revision }).cleared, false);
  assert.equal(c.api.getLocalRecovery().revision, recreated.revision);
});

test('a pending guest session refresh still allows terminal matching recovery cleanup', async () => {
  const response = deferred();
  let refreshing = false;
  const c = client({ handle: request => request.action === 'session' && refreshing ? response.promise : null });
  await c.api.whenReady();
  c.api.saveLocalRecovery(checkpoint(), 'guest');
  refreshing = true;
  const pending = c.api.refresh();
  assert.equal(c.api.loading, true);
  assert.equal(c.api.getLocalRecovery(), null);
  assert.equal(c.api.saveLocalRecovery(checkpoint(), 'guest').saved, false);
  assert.equal(c.api.clearLocalRecovery('guest', { matchId: matchN }).cleared, false);
  assert.equal(c.api.clearLocalRecovery('guest', { matchId: matchM }).cleared, true);
  response.resolve({ payload: c.sessionPayload() });
  await pending;
  assert.equal(c.api.getLocalRecovery(), null, 'the completed guest match cannot appear again after refresh');
});

test('successful and duplicate match completion clear only their own recovery', async () => {
  for (const recorded of [true, false]) for (const localMatch of [matchM, matchN]) {
    const c = client({ ownerId: 'owner-a', handle: request => request.action === 'completeMatch'
      ? { payload: { ok: true, ownerId: 'owner-a', recorded, save: checkpoint(matchN), profile } } : null });
    await c.api.whenReady();
    c.api.saveLocalRecovery(checkpoint(localMatch), 'owner-a');
    assert.equal(await c.api.completeMatch({ matchId: matchM }, 'owner-a'), true);
    assert.equal(c.api.getLocalRecovery()?.save.matchId || null, localMatch === matchM ? null : matchN);
  }
});

test('a completed-match save rejection removes that recovery and preserves a different match', async () => {
  for (const localMatch of [matchM, matchN]) {
    const c = client({ ownerId: 'owner-a', cloudSave: checkpoint(matchN), handle: request => request.action === 'save'
      ? { status: 409, payload: { ok: false, ownerId: 'owner-a', code: 'MATCH_ALREADY_COMPLETED', error: 'Finished' } } : null });
    await c.api.whenReady(); c.api.saveLocalRecovery(checkpoint(localMatch), 'owner-a');
    await assert.rejects(c.api.saveGame(checkpoint(), 'owner-a'), error => error.code === 'MATCH_ALREADY_COMPLETED');
    assert.equal(c.api.getLocalRecovery()?.save.matchId || null, localMatch === matchM ? null : matchN);
    assert.equal(c.api.user.id, 'owner-a');
  }
});

test('deleting cloud M preserves a new device N written while its response is pending', async () => {
  const clearing = deferred();
  const c = client({ ownerId: 'owner-a', cloudSave: checkpoint(), handle: request => request.action === 'clearSave' ? clearing.promise : null });
  await c.api.whenReady(); c.api.saveLocalRecovery(checkpoint(), 'owner-a');
  const pending = c.api.clearSave('owner-a');
  while (!c.requests.some(request => request.action === 'clearSave')) await Promise.resolve();
  c.api.saveLocalRecovery(checkpoint(matchN), 'owner-a');
  clearing.resolve({ payload: { ok: true, ownerId: 'owner-a', save: null } });
  assert.equal(await pending, true);
  assert.equal(c.api.getLocalRecovery().save.matchId, matchN);
});

test('device Continue is explicit, owner-bound, and preserves its checkpoint on restore failure', async () => {
  const c = client({ ownerId: 'owner-a', cloudSave: checkpoint(), home: true }); await c.api.whenReady();
  const written = c.api.saveLocalRecovery(checkpoint(), 'owner-a');
  const calls = [];
  c.api.setGameLoader(async (save, options) => { calls.push({ save, options }); return true; });
  assert.equal(calls.length, 0);
  c.api.render(); c.api.render();
  const deviceCards = c.elements.filter(node => node.className.split(' ').includes('mainmenu-device-return'));
  assert.equal(deviceCards.length, 1);
  assert.equal(c.elements.filter(node => node.className === 'mainmenu-account-return').length, 1);
  assert.match(deviceCards[0].innerHTML, /Continue on this device/);
  await deviceCards[0].onclick();
  assert.deepEqual(copy(calls[0].options), { expectedOwnerId: 'owner-a', localRecovery: true,
    matchId: matchM, revision: written.revision });
  assert.equal(calls[0].save.matchId, matchM);
  assert.equal(c.api.getLocalRecovery().revision, written.revision);
  assert.deepEqual(c.requests.map(request => request.action), ['session']);
  c.api.setGameLoader(async () => { throw new Error('PRIVATE card details'); });
  await c.elements.find(node => node.className.split(' ').includes('mainmenu-device-return')).onclick();
  const error = c.elements.find(node => node.className === 'mainmenu-device-recovery-error');
  assert.match(error.textContent, /could not be restored/);
  assert.doesNotMatch(error.textContent, /PRIVATE/);
  assert.equal(c.api.getLocalRecovery().revision, written.revision);
});

test('old device button callbacks cannot read or resume another owner or a replaced revision', async () => {
  const c = client({ ownerId: 'owner-a', home: true }); await c.api.whenReady();
  c.api.saveLocalRecovery(checkpoint(), 'owner-a');
  const old = c.elements.find(node => node.className.split(' ').includes('mainmenu-device-return'));
  let loaded = 0; c.api.setGameLoader(async () => { loaded++; });
  c.api.saveLocalRecovery(checkpoint(), 'owner-a');
  await old.onclick(); assert.equal(loaded, 0);
  c.session.ownerId = 'owner-b'; await c.api.refresh();
  c.api.saveLocalRecovery(checkpoint(matchN), 'owner-b');
  await old.onclick(); assert.equal(loaded, 0);
  assert.equal(c.api.getLocalRecovery().save.matchId, matchN);
});

test('a lazy public-loader receives the captured device revision and cannot commit a replaced same-owner checkpoint', async () => {
  const c = client({ ownerId: 'owner-a' }); await c.api.whenReady();
  const first = c.api.saveLocalRecovery(checkpoint(), 'owner-a');
  const loading = deferred();
  let supplied, attemptedSave, committed = 0, loadingHidden = 0;
  c.context.loadGame = async () => loading.promise;
  c.context.hideLoading = () => { loadingHidden++; };
  c.context.MTG.resumeAccountSave = (save, options) => {
    attemptedSave = save;
    supplied = options;
    // The main module owns this post-load gate. This dependency rejects a
    // changed receipt so the real public loader cannot start the old version.
    const current = c.api.getLocalRecovery();
    if (current.revision !== options.revision || current.save.matchId !== options.matchId)
      throw new Error('Device checkpoint changed');
    committed++;
    return true;
  };
  const registration = publicEntrySource.match(/globalThis\.MTGAccount\?\.setGameLoader\(async \(save, options\) => \{[\s\S]*?\n\}\);/)?.[0];
  assert.ok(registration, 'exercise the actual public-entry lazy loader callback');
  vm.runInContext(registration, c.context, { filename: 'src/public-entry.js:device-loader' });
  const pending = c.api.resumeLocalRecovery('owner-a', { matchId: matchM, revision: first.revision });
  const rejection = assert.rejects(pending, /could not be restored/);
  const newerSave = checkpoint(); newerSave.summary.turn = 5;
  const newer = c.api.saveLocalRecovery(newerSave, 'owner-a');
  loading.resolve();
  await rejection;
  assert.deepEqual(copy(supplied), { expectedOwnerId: 'owner-a', localRecovery: true,
    matchId: matchM, revision: first.revision });
  assert.equal(attemptedSave.summary.turn, 4, 'the helper passes the captured save rather than substituting a later one');
  assert.equal(committed, 0);
  assert.equal(loadingHidden, 1, 'the real public loading veil is dismissed on rejection');
  assert.equal(c.api.getLocalRecovery().revision, newer.revision);
  assert.equal(c.api.getLocalRecovery().save.summary.turn, 5);
});

test('corrupt device recovery renders a generic hint without blocking account readiness', async () => {
  const local = new Map([[key('guest'), 'PRIVATE broken recovery']]);
  const c = client({ local, home: true }); await c.api.whenReady();
  assert.equal(c.api.loading, false);
  assert.equal(c.elements.some(node => node.className.split(' ').includes('mainmenu-device-return')), false);
  assert.match(c.elements.find(node => node.className === 'mainmenu-device-recovery-error').textContent, /could not be read/);
  assert.equal(local.get(key('guest')), 'PRIVATE broken recovery');
});

test('adopting the active guest table clears only its matching recovery before sign-in', async () => {
  for (const [localMatch, connected, diagnostic] of [[matchM, true, false], [matchN, true, false], [matchM, false, false], [matchM, true, true]]) {
    const c = client({ handle: request => request.action === 'completeMatch'
      ? { payload: { ok: true, ownerId: 'owner-a', recorded: true, profile, save: null } } : null });
    await c.api.whenReady(); c.api.saveLocalRecovery(checkpoint(localMatch), 'guest');
    c.context.MTG.activeAccountMatch = { matchId: matchM, setup: diagnostic ? null : checkpoint().setup };
    if (connected) c.context.MTG.captureActiveSoloSave = () => checkpoint();
    c.session.ownerId = 'owner-a'; await c.api.refresh();
    c.api.saveLocalRecovery(checkpoint(), 'owner-a');
    await c.api.completeMatch({ matchId: matchM }, 'owner-a');
    await c.api.logout();
    assert.equal(c.api.getLocalRecovery()?.save.matchId || null,
      localMatch === matchM && connected && !diagnostic ? null : localMatch);
  }
});

test('cloud Continue captures its owner and does not mark another owner checkpoint as failed', async () => {
  const c = client({ ownerId: 'owner-a', cloudSave: checkpoint() }); await c.api.whenReady();
  const restoring = deferred(), button = {};
  let options;
  c.api.setGameLoader(async (_save, supplied) => { options = supplied; return restoring.promise; });
  let reopened = 0;
  c.context.modalShell = () => { reopened++; };
  const content = { innerHTML: '', querySelector(selector) { return selector === '.account-continue' ? button : null; } };
  c.context.renderModal('profile', content);
  const pending = button.onclick();
  assert.equal(options.expectedOwnerId, 'owner-a');
  c.session.ownerId = 'owner-b'; c.session.save = checkpoint(matchN); await c.api.refresh();
  restoring.reject(new Error('Old account restore rejected'));
  await pending;
  c.context.renderModal('profile', content);
  assert.doesNotMatch(content.innerHTML, /Cannot continue/);
  assert.equal(c.api.save.matchId, matchN);
  assert.equal(reopened, 1);
});
