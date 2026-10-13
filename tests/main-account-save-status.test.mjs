import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const mainSource = readFileSync(new URL('../src/modules/main.js', import.meta.url), 'utf8');
const uiSource = readFileSync(new URL('../src/modules/ui.js', import.meta.url), 'utf8');

function harness(saveGame) {
  const ui = { messages: [], queueRender() {}, render() {}, toast(message) { this.messages.push(message); } };
  const g = { turnNo: 4, gameOver: false };
  const account = { user: { id: 'owner-a' }, saveGame };
  const context = { ui, g, console, clearTimeout, setTimeout,
    MTGAccount: account, accountCheckpointEnabled: true, saveTimer: null,
    saveSetup: { deck: 'Quick Draw' }, recordedTimeline: [], matchId: 'match-old-0001',
    latestBoardState: null, latestBoardTimelineIndex: null,
    MTG: { buildAccountSave: () => ({ matchId: 'match-old-0001' }) },
  };
  const start = mainSource.indexOf('    let gameAccountOwnerId =');
  const end = mainSource.indexOf('    queueAccountSave =', start);
  assert.ok(start >= 0 && end > start);
  // Execute the real closure that backs MTG.flushAccountSave. No engine
  // payment, checkpoint decisions, or API response handling is reimplemented.
  const actions = vm.runInNewContext(mainSource.slice(start, end) +
    '\n({ flush: writeAccountSave, canWrite: accountCanWrite });', context);
  context.MTG.flushAccountSave = actions.flush;
  return { ...actions, ui, g, account, context };
}

function completedError() {
  return Object.assign(new Error('This match has already finished. Start a new match to save again.'),
    { status: 409, code: 'MATCH_ALREADY_COMPLETED' });
}

test('a remotely completed match pauses only its old table saves and preserves the account and game', async () => {
  let writes = 0;
  const f = harness(async () => { writes++; throw completedError(); });
  assert.equal(await f.flush(), false);
  assert.equal(f.canWrite(), false);
  assert.equal(f.ui.accountSaveStatus.text, 'Match finished · saves paused');
  assert.equal(f.account.user.id, 'owner-a');
  assert.equal(f.g.gameOver, false);
  f.ui.accountSaveStatus = { state: 'saving', text: 'Saving…' };
  assert.equal(await f.flush(), false);
  assert.equal(writes, 1, 'later decisions and retries cannot keep autosaving a completed match');
  assert.equal(f.ui.accountSaveStatus.text, 'Match finished · saves paused');
});

test('ordinary checkpoint failures remain retryable', async () => {
  let writes = 0;
  const f = harness(async () => { if (++writes === 1) throw new Error('Network unavailable.'); return true; });
  assert.equal(await f.flush(), false);
  assert.equal(f.canWrite(), true);
  assert.equal(f.ui.accountSaveStatus.text, 'Save failed');
  assert.equal(await f.flush(), true);
  assert.equal(f.ui.accountSaveStatus.text, 'Saved · turn 4');
  assert.equal(writes, 2);
});

test('the real Save & exit callback stays at the table after its completed-match checkpoint is refused', async () => {
  const f = harness(async () => { throw completedError(); });
  let exitCalls = 0, saveExit;
  f.context.MTG.exitToMainMenu = () => { exitCalls++; };
  f.context.action = (_title, _description, callback) => { saveExit = callback; };
  const start = uiSource.indexOf("        action('Save & exit',");
  const end = uiSource.indexOf('      } else if (soloSaveAvailable', start);
  assert.ok(start >= 0 && end > start);
  vm.runInNewContext('(function () {\n' + uiSource.slice(start, end) + '\n}).call(ui);', f.context);
  await saveExit();
  assert.equal(exitCalls, 0);
  assert.equal(f.ui.accountSaveStatus.text, 'Match finished · saves paused');
  assert.equal(f.account.user.id, 'owner-a');
});
