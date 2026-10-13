import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/modules/main.js', import.meta.url), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
function deferred() { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; }

function harness({ guest = false, diagnosticReplay = false, saveGame = async () => true } = {}) {
  const handlers = new Map(), timers = new Map();
  let local = null, revision = 0, cloudWrites = 0, completions = 0;
  const ui = { diagnosticReplay, messages: [], queueRender() {}, toast(message) { this.messages.push(message); } };
  if (diagnosticReplay) ui.accountSaveStatus = { state: 'paused', text: 'Diagnostic replay · saving disabled' };
  const g = { turnNo: 7, gameOver: false };
  const account = { loading: false, user: guest ? null : { id: 'owner-a' },
    async saveGame(save, ownerId) { cloudWrites++; return saveGame(save, ownerId); },
    async completeMatch() { completions++; return true; },
    saveLocalRecovery(save, ownerId) { local = { save: copy(save), ownerId, revision: String(++revision) }; return { saved: true, revision: local.revision }; },
    clearLocalRecovery(ownerId, { matchId, revision: expectedRevision }) {
      if (local?.ownerId === ownerId && local.save.matchId === matchId && (!expectedRevision || local.revision === expectedRevision)) {
        local = null; return { cleared: true };
      }
      return { cleared: false };
    },
  };
  const context = vm.createContext({ ui, g, MTGAccount: account, state: { diagnosticReplay }, console,
    accountCheckpointEnabled: false, customDecksInPlay: [], saveTimer: null,
    saveSetup: { deck: 'Quick Draw' }, recordedTimeline: [], matchId: 'match-device-recovery-0001',
    latestBoardState: { turnNo: 6 }, latestBoardTimelineIndex: 0,
    queueAccountSave() {}, completeAccountMatch() {},
    setTimeout(callback) { const id = timers.size + 1; timers.set(id, callback); return id; }, clearTimeout(id) { timers.delete(id); },
    window: { addEventListener(name, callback) { handlers.set(name, callback); }, removeEventListener(name, callback) { if (handlers.get(name) === callback) handlers.delete(name); } },
    MTG: { buildAccountSave(game, setup, decisions, matchId, board, offset) {
      return { schema: 'commander-save/v1', mode: 'solo', setup, matchId, decisions: copy(decisions), state: copy(board), checkpointTimelineIndex: offset, summary: { turn: game.turnNo } };
    } },
  });
  // Execute the native eligibility gate and closure: mocks stand only at
  // browser timers/storage and the cloud API, not at recovery decisions.
  const gateStart = source.indexOf('    const accountCheckpointEnabled =');
  const gateEnd = source.indexOf('    // The board as of', gateStart);
  vm.runInContext(source.slice(gateStart, gateEnd).replace('const accountCheckpointEnabled', 'accountCheckpointEnabled'), context);
  const start = source.indexOf('    let gameAccountOwnerId =');
  const end = source.indexOf('    if (state.onlineBridge && state.onlineBridge.setManualActionHandler)', start);
  assert.ok(start >= 0 && end > start);
  vm.runInContext(source.slice(start, end), context);
  return { ui, g, account, context, handlers, timers, local: () => local, cloudWrites: () => cloudWrites, completions: () => completions,
    queue: (...args) => context.queueAccountSave(...args), flush: (...args) => context.MTG.flushAccountSave(...args) };
}

test('guest actions and pagehide synchronously retain the native board and full decision tail', () => {
  const f = harness({ guest: true });
  f.context.recordedTimeline.push({ kind: 'decision', response: { value: false } });
  f.queue();
  assert.equal(f.local().ownerId, 'guest');
  assert.equal(f.local().save.decisions.length, 1);
  assert.equal(f.local().save.checkpointTimelineIndex, 0);
  assert.equal(f.local().save.state.turnNo, 6);
  assert.equal(f.timers.size, 0, 'guest backup does not depend on the cloud debounce');
  assert.equal(f.cloudWrites(), 0);
  f.context.recordedTimeline.push({ kind: 'decision', response: { value: true } });
  f.handlers.get('pagehide')();
  assert.equal(f.local().save.decisions.length, 2);
  assert.match(f.ui.accountSaveStatus.text, /Saved on this device/);
});

test('a false cloud acknowledgment cannot report Saved or let Save & exit succeed', async () => {
  const f = harness({ saveGame: async () => false });
  assert.equal(await f.flush(), false);
  assert.equal(f.ui.accountSaveStatus.text, 'Saved on this device · cloud pending');
  assert.ok(f.local());
});

test('lost connection keeps the device copy and online retries once while a retry is in flight', async () => {
  const receipt = deferred();
  let attempts = 0;
  const f = harness({ saveGame: async () => { if (++attempts === 1) throw new Error('Offline'); return receipt.promise; } });
  assert.equal(await f.flush(), false);
  assert.ok(f.local());
  const retry = f.handlers.get('online')();
  await f.handlers.get('online')();
  assert.equal(attempts, 2);
  receipt.resolve(true);
  await retry;
  assert.equal(f.local(), null);
  assert.equal(f.ui.accountSaveStatus.text, 'Saved · turn 7');
  await f.handlers.get('online')();
  assert.equal(attempts, 2, 'a settled cloud save is not retried');
});

test('an older cloud receipt preserves the newer device revision and pending status', async () => {
  const receipt = deferred();
  const f = harness({ saveGame: async () => receipt.promise });
  const flush = f.flush();
  const oldRevision = f.local().revision;
  f.context.recordedTimeline.push({ kind: 'decision', response: { value: true } });
  f.queue();
  const nextRevision = f.local().revision;
  assert.notEqual(nextRevision, oldRevision);
  receipt.resolve(true);
  assert.equal(await flush, true);
  assert.equal(f.local().revision, nextRevision);
  assert.equal(f.local().save.decisions.length, 1);
  assert.equal(f.ui.accountSaveStatus.text, 'Saved on this device · cloud pending');
});

test('explicit guest leave clears this match and pagehide cannot recreate it', () => {
  const f = harness({ guest: true });
  f.queue();
  f.context.MTG.discardActiveLocalRecovery();
  f.handlers.get('pagehide')();
  assert.equal(f.local(), null);
});

test('guest completion clears the local match without profile writes', async () => {
  const f = harness({ guest: true });
  f.queue();
  f.g.gameOver = true;
  await f.context.completeAccountMatch();
  assert.equal(f.local(), null);
  assert.equal(f.completions(), 0);
});

test('diagnostic replay remains reportable but cannot write cloud, local copies or statistics', async () => {
  const f = harness({ diagnosticReplay: true });
  f.queue({ immediate: true });
  f.handlers.get('pagehide')();
  await f.handlers.get('online')();
  assert.equal(await f.flush(), false);
  await f.context.completeAccountMatch();
  assert.equal(f.cloudWrites(), 0);
  assert.equal(f.completions(), 0);
  assert.equal(f.local(), null);
  assert.equal(f.context.MTG.activeAccountMatch.setup, null);
  assert.ok(f.context.MTG.captureActiveSoloSave(f.g));
  assert.equal(f.ui.accountSaveStatus.text, 'Diagnostic replay · saving disabled');
});

test('capture checks the live game identity and cleanup removes only its own capture hook', () => {
  const f = harness();
  assert.equal(f.context.MTG.captureActiveSoloSave({}), null);
  assert.ok(f.context.MTG.captureActiveSoloSave(f.g));
  f.context.window._accountGameCleanup();
  assert.equal(f.context.MTG.captureActiveSoloSave, undefined);
  assert.equal(f.handlers.size, 0);
  const next = harness();
  const replacement = () => 'another table';
  next.context.MTG.captureActiveSoloSave = replacement;
  next.context.window._accountGameCleanup();
  assert.equal(next.context.MTG.captureActiveSoloSave, replacement);
});

test('device Continue rechecks its exact owner, match and revision after the module load', () => {
  const old = { matchId: 'match-device-recovery-0001', setup: { aiDecks: ['Elven Council'] } };
  let current = { ownerId: 'owner-a', revision: 'new-revision', save: old };
  const started = [];
  const context = vm.createContext({ document: { querySelector: () => null, body: { classList: { remove() {} } } },
    MTGAccount: { loading: false, user: { id: 'owner-a' }, getLocalRecovery: () => current },
    MTG: { validateAccountSave: save => save }, startGame: state => { started.push(state); return state; } });
  const begin = source.indexOf('  MTG.resumeAccountSave = function');
  const end = source.indexOf('  // The generated Higgsfield', begin);
  vm.runInContext(source.slice(begin, end), context);
  const options = { expectedOwnerId: 'owner-a', localRecovery: true, matchId: old.matchId, revision: 'old-revision' };
  assert.throws(() => context.MTG.resumeAccountSave(old, options), /checkpoint changed/);
  assert.equal(started.length, 0, 'a newer device copy must survive without an old table starting');
  current = { ...current, revision: 'old-revision' };
  context.MTG.resumeAccountSave(old, options);
  assert.equal(started.length, 1);
  context.MTGAccount.user = { id: 'owner-b' };
  assert.throws(() => context.MTG.resumeAccountSave(old, options), /profile changed/);
  assert.equal(started.length, 1);
});
