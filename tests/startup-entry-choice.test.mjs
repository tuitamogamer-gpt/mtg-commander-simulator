// Before the table opens, the page decides whether to load the complete card
// collection first (src/public-entry.js, wantsFullCatalogAtEntry), and asks
// the engine whether the player has saved imported lists (src/modules/main.js,
// MTG.playerHasImportedLists). Completing the collection later stops the page
// for several seconds, so a player with saved lists and a Live room get it
// behind the loading message; everyone else opens with the cards of built-in
// decks. Both functions are read from the source and run with stand-ins.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = file => fs.readFileSync(new URL(file, import.meta.url), 'utf8');
function block(source, from, closing) {
  const start = source.indexOf(from);
  assert.ok(start >= 0, `the source has: ${from}`);
  const end = source.indexOf(closing, start);
  assert.ok(end > start, `and its end: ${JSON.stringify(closing)}`);
  return source.slice(start, end + closing.length);
}
const choiceSource = block(read('../src/public-entry.js'), 'async function wantsFullCatalogAtEntry', '\n}\n');
const listsSource = block(read('../src/modules/main.js'), '  let entryAccountDecks = null;', '\n  };\n');

async function choose({ search = '', webdriver = false, lists = false, live = false, mode = 'solo' } = {}) {
  let asked = 0;
  const context = vm.createContext({
    URLSearchParams,
    window: { location: { search } },
    navigator: { webdriver },
    MTG: { playerHasImportedLists: async () => { asked++; return lists; }, ...(live ? { createHiggsfieldRoomClient() {} } : {}) },
  });
  vm.runInContext(choiceSource, context);
  const choice = await vm.runInContext(`wantsFullCatalogAtEntry(${JSON.stringify(mode)})`, context);
  return { choice, asked };
}

test('a visitor opens with the startup cards; a player with saved lists with every card', async () => {
  assert.deepEqual(await choose(), { choice: null, asked: 1 });
  assert.deepEqual(await choose({ lists: true }), { choice: 'for-saved-lists', asked: 1 });
});

test('the address decides before anything is asked', async () => {
  assert.deepEqual(await choose({ search: '?catalog=full' }), { choice: 'required', asked: 0 });
  assert.deepEqual(await choose({ search: '?catalog=startup', lists: true, live: true, mode: 'online' }), { choice: null, asked: 0 });
  // An unknown value is no choice.
  assert.deepEqual(await choose({ search: '?catalog=everything' }), { choice: null, asked: 1 });
});

test('a page under automation loads everything, unless it asks to decide as a visitor', async () => {
  assert.deepEqual(await choose({ webdriver: true }), { choice: 'required', asked: 0 });
  assert.deepEqual(await choose({ webdriver: true, search: '?catalog=visitor' }), { choice: null, asked: 1 });
  assert.deepEqual(await choose({ webdriver: true, search: '?catalog=visitor', lists: true }), { choice: 'for-saved-lists', asked: 1 });
  assert.deepEqual(await choose({ webdriver: true, search: '?catalog=startup' }), { choice: null, asked: 0 });
});

test('a Live room has every card before it opens, where rooms exist', async () => {
  assert.deepEqual(await choose({ mode: 'online', live: true }), { choice: 'required', asked: 0 });
  assert.deepEqual(await choose({ search: '?room=ABCD', mode: null, live: true }), { choice: 'required', asked: 0 });
  // A build without the room service opens no room: the visitor's rule.
  assert.deepEqual(await choose({ mode: 'online' }), { choice: null, asked: 1 });
  assert.deepEqual(await choose({ mode: 'solo', live: true }), { choice: null, asked: 1 });
});

// MTG.playerHasImportedLists with a stand-in profile and device storage.
function listsQuestion({ account = null, guestRecords = [], readGuest = () => ({ ok: true, records: guestRecords }) } = {}) {
  const context = vm.createContext({
    setTimeout, Promise,
    MTG: {},
    U: { readGuestImportedDeckRecords: readGuest },
    MTGAccount: account,
  });
  vm.runInContext(`function currentImportedLibraryOwner() {
    if (globalThis.MTGAccount?.loading) return 'loading';
    return globalThis.MTGAccount?.user?.id ? 'account:' + globalThis.MTGAccount.user.id : 'guest';
  }\n${listsSource}`, context);
  return { ask: options => context.MTG.playerHasImportedLists(options), kept: () => vm.runInContext('entryAccountDecks', context) };
}
const never = new Promise(() => {});

test('lists saved on the device count for a guest, and nothing is requested', async () => {
  assert.equal(await listsQuestion().ask(), false);
  assert.equal(await listsQuestion({ guestRecords: [{ id: 'deck-1' }] }).ask(), true);
  // No profile module at all, as in the offline bundle.
  assert.equal(await listsQuestion({ account: undefined, guestRecords: [{ id: 'deck-1' }] }).ask(), true);
  // A guest's device lists do not count for a signed-in player.
  let requests = 0;
  const signedIn = { loading: false, user: { id: 'u1' }, whenReady: async () => {}, loadDecks: async () => { requests++; return []; } };
  assert.equal(await listsQuestion({ account: signedIn, guestRecords: [{ id: 'deck-1' }] }).ask(), false);
  assert.equal(requests, 1);
});

test("the account's lists are requested once and kept for the first library refresh", async () => {
  let requests = 0;
  const decks = [{ id: 'deck-a', name: 'A' }];
  const account = { loading: false, user: { id: 'u1' }, whenReady: async () => {}, loadDecks: async () => { requests++; return decks; } };
  const question = listsQuestion({ account });
  assert.equal(await question.ask(), true);
  assert.equal(requests, 1);
  assert.equal(question.kept().accountId, 'u1');
  assert.equal(question.kept().records, decks);
  // The library refresh uses what was kept instead of asking again.
  const refresh = read('../src/modules/main.js');
  assert.match(refresh, /const fetched = entryAccountDecks && entryAccountDecks\.accountId === accountId \? entryAccountDecks\.records : null;\s*entryAccountDecks = null;\s*const records = fetched \|\| await globalThis\.MTGAccount\.loadDecks\(\);/);
});

test('a slow or failing profile never keeps the table closed', async () => {
  const started = Date.now();
  // The profile is still loading when the wait ends.
  assert.equal(await listsQuestion({ account: { loading: true, user: null, whenReady: () => never } }).ask({ wait: 30 }), false);
  // The profile is known, its lists do not arrive in time.
  const slow = listsQuestion({ account: { loading: false, user: { id: 'u1' }, whenReady: async () => {}, loadDecks: () => never } });
  assert.equal(await slow.ask({ wait: 30 }), false);
  assert.equal(slow.kept(), null);
  // The request fails.
  const failing = { loading: false, user: { id: 'u1' }, whenReady: async () => {}, loadDecks: async () => { throw new Error('offline'); } };
  assert.equal(await listsQuestion({ account: failing }).ask({ wait: 30 }), false);
  // Device storage cannot be read.
  assert.equal(await listsQuestion({ readGuest: () => { throw new Error('storage is blocked'); } }).ask(), false);
  assert.ok(Date.now() - started < 2000, 'none of these waits for the default 2.5 s');
});

test('the page starts the entry itself, after the decision', () => {
  const entry = read('../src/public-entry.js');
  const load = block(entry, "await import('./data.js');", 'globalThis.MTG.initializeEntry();');
  const order = ['window.__mtgDeferEntry = true;', "await import('./app-startup.js');", 'await wantsFullCatalogAtEntry(mode)',
    'await globalThis.MTG.ensureFullCatalog()', 'globalThis.MTG.initializeEntry();'].map(step => load.indexOf(step));
  assert.ok(order.every((position, index) => position >= 0 && (index === 0 || position > order[index - 1])), JSON.stringify(order));
  // Saved lists alone do not keep the table closed when the collection fails.
  assert.match(load, /if \(complete === 'required'\) throw error;/);
  const main = read('../src/modules/main.js');
  assert.match(main, /MTG\.initializeEntry = initializeEntry;\s*const entryLeftToPage = window\.__mtgDeferEntry === true;\s*delete window\.__mtgDeferEntry;/);
  assert.match(main, /if \(document\.readyState === 'loading'\) \{\s*if \(!entryLeftToPage\) window\.addEventListener\('DOMContentLoaded', initializeEntry, \{ once: true \}\);\s*\} else if \(!entryLeftToPage\) \{\s*initializeEntry\(\);/);
});
