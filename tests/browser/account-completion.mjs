// Native Solo completion, loss UI, and actual HTTP account acknowledgments.
// All accounts and fault injection stay on a private local HTTP server.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createAccountHandler, MemoryAccountStore } from '../../api/account.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = process.env.COMPLETION_OUTPUT || `${tmpdir()}/mtg-account-completion`;
mkdirSync(output, { recursive: true });
const requests = [], receipts = [], checks = [], errors = [], assets = [];
let rejectCompletion = false, holdCompletion = false, releaseCompletion = null;
const app = express().use('/api/account', express.json({ limit: '2mb' }), (req, res, next) => {
  const action = req.body?.action || req.query.action;
  requests.push({ action, matchId: req.body?.matchId || req.body?.save?.matchId });
  // Failed checkpoints leave a real device recovery for the completion cases.
  if (action === 'save') return res.status(503).json({ ok: false, error: 'Controlled local checkpoint outage' });
  if (action === 'completeMatch') {
    if (rejectCompletion) return res.status(503).json({ ok: false, error: 'Controlled local completion outage' });
    const end = res.end.bind(res);
    res.end = (...args) => {
      const payload = JSON.parse(String(args[0]));
      receipts.push({ matchId: req.body.matchId, recorded: payload.recorded, status: res.statusCode });
      if (holdCompletion) { releaseCompletion = () => { releaseCompletion = null; end(...args); }; return res; }
      return end(...args);
    };
  }
  next();
}).use('/api/account', createAccountHandler({ store: new MemoryAccountStore(), limiter: null }))
  .use(express.static(fileURLToPath(new URL('../../', import.meta.url))));
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true,
  ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
let activePage;
async function start(label) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' });
  await context.addInitScript(() => {
    localStorage.setItem('mtgOnboardingComplete', '1');
    localStorage.setItem('mtgReducedMotion', '1');
  });
  const response = await context.request.post(`${base}/api/account`, { data: { action: 'register',
    email: `${label}@completion.example.test`, displayName: 'Completion QA', password: 'Local-completion-102615!' } });
  assert.equal(response.ok(), true);
  const owner = (await response.json()).user.id;
  const page = await context.newPage(); activePage = page;
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (!/\/(?:main|account)\.js$/.test(new URL(response.url()).pathname)) return;
    assets.push(response.body().then(bytes => ({ url: response.url(), sha256: createHash('sha256').update(bytes).digest('hex') })).catch(() => null));
  });
  page.setDefaultTimeout(30000);
  await page.goto(`${base}/?smokeDeck=Quick%20Draw&seed=10`);
  await page.waitForFunction(owner => !MTGAccount.loading && MTGAccount.user?.id === owner && window._ui?.pending?.q.type === 'mulligan', owner,
    { timeout: 120000 });
  await page.getByRole('button', { name: 'Keep ✓', exact: true }).click();
  await page.waitForFunction(() => MTG.activeAccountMatch.decisions.length > 0 && !!(_ui.pending || _ui.react), null, { timeout: 90000 });
  assert.equal(await page.evaluate(() => MTG.flushAccountSave()), false);
  await page.evaluate(() => history.replaceState(null, '', '/'));
  const recovery = await page.evaluate(() => MTGAccount.getLocalRecovery());
  assert.equal(recovery.ownerId, owner);
  return { context, page, owner, recovery, matchId: recovery.save.matchId };
}
const nativeLoss = page => page.evaluate(async () => { await _game.playerLoses(_ui.me, 'conceded'); _ui.render(); });
const completeTable = page => page.evaluate(async () => {
  for (const player of _game.players.slice(0, -1)) await _game.playerLoses(player, 'conceded');
  _ui.render();
});
const profileGames = page => page.evaluate(() => MTGAccount.profile.gamesPlayed);
async function waitForHeld() {
  const deadline = Date.now() + 30000;
  while (!releaseCompletion) {
    assert.ok(Date.now() < deadline, 'the native HTTP completion must reach the held response');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}
const report = { checks, errors, requests, receipts };
try {
  rejectCompletion = true;
  const failed = await start('failed');
  await nativeLoss(failed.page);
  await failed.page.getByRole('button', { name: 'I lost', exact: true }).click();
  await failed.page.waitForFunction(() => _ui.accountSaveStatus?.text === 'Stats pending' && !_ui.leavingAsLoss);
  assert.equal(await failed.page.evaluate(() => MTGAccount.getLocalRecovery().revision), failed.recovery.revision);
  assert.equal(await failed.page.getByRole('button', { name: 'I lost', exact: true }).isEnabled(), true);
  assert.equal(await profileGames(failed.page), 0);
  await failed.page.screenshot({ path: `${output}/failed-result-keeps-table.png`, animations: 'disabled' });
  rejectCompletion = false;
  await failed.page.getByRole('button', { name: 'I lost', exact: true }).click();
  await failed.page.waitForURL(url => url.searchParams.get('view') === 'profile');
  await failed.page.waitForFunction(() => !MTGAccount.loading && MTGAccount.profile?.gamesPlayed === 1);
  assert.equal(await failed.page.evaluate(() => MTGAccount.getLocalRecovery()), null);
  assert.equal(requests.filter(row => row.action === 'completeMatch' && row.matchId === failed.matchId).length, 2);
  checks.push('The actual I lost button keeps the table and exact device checkpoint after HTTP 503, then retries once and records one loss');
  await failed.context.close();

  const duplicate = await start('duplicate');
  const match = { matchId: duplicate.matchId, expectedOwnerId: duplicate.owner, deck: duplicate.recovery.save.setup.deck,
    commanders: duplicate.recovery.save.setup.commanders, won: false, turns: duplicate.recovery.save.summary.turn };
  const preexisting = await duplicate.context.request.post(`${base}/api/account`, { data: { action: 'completeMatch', ...match } });
  assert.equal((await preexisting.json()).recorded, true);
  await nativeLoss(duplicate.page);
  await duplicate.page.getByRole('button', { name: 'I lost', exact: true }).click();
  await duplicate.page.waitForURL(url => url.searchParams.get('view') === 'profile');
  await duplicate.page.waitForFunction(() => !MTGAccount.loading && MTGAccount.profile?.gamesPlayed === 1);
  assert.equal(await duplicate.page.evaluate(() => MTGAccount.getLocalRecovery()), null);
  assert.deepEqual(receipts.filter(row => row.matchId === duplicate.matchId).map(row => row.recorded), [true, false]);
  checks.push('A real idempotent HTTP recorded:false reply acknowledges the existing result, clears its checkpoint, and awards no second loss');
  await duplicate.context.close();

  holdCompletion = true;
  const pending = await start('pending');
  await completeTable(pending.page);
  await waitForHeld();
  await pending.page.evaluate(() => { window.__completionLeaving = MTG.leaveAsLoss(); });
  assert.equal(new URL(pending.page.url()).search, '');
  assert.equal(await pending.page.evaluate(() => MTGAccount.getLocalRecovery().revision), pending.recovery.revision);
  assert.equal(requests.filter(row => row.action === 'completeMatch' && row.matchId === pending.matchId).length, 1);
  releaseCompletion();
  await pending.page.waitForURL(url => url.searchParams.get('view') === 'profile');
  await pending.page.waitForFunction(() => !MTGAccount.loading && MTGAccount.profile?.gamesPlayed === 1);
  assert.equal(requests.filter(row => row.action === 'completeMatch' && row.matchId === pending.matchId).length, 1);
  checks.push('The native gameover event and concurrent leave callback share one held HTTP completion and navigate only after its acknowledgment');
  await pending.context.close();

  const signedOut = await start('signedout');
  await completeTable(signedOut.page);
  await waitForHeld();
  assert.equal((await signedOut.page.evaluate(() => MTGAccount.logout())).signedOut, true);
  releaseCompletion();
  await signedOut.page.waitForFunction(() => _ui.accountSaveStatus?.text === 'Stats pending');
  assert.equal(await signedOut.page.evaluate(() => MTGAccount.user), null);
  assert.equal(await signedOut.page.evaluate(owner => JSON.parse(localStorage.getItem('mtg-solo-recovery/v1/' + encodeURIComponent(owner))).revision, signedOut.owner), signedOut.recovery.revision);
  assert.equal(await signedOut.page.evaluate(() => MTGAccount.getLocalRecovery()), null, 'a signed-out browser cannot expose the previous owner’s checkpoint');
  checks.push('Signout during an actual held completion response cannot show Stats updated or delete the prior owner’s device recovery');
  await signedOut.context.close();
  assert.deepEqual(errors, []);
  console.log(`PASS ${checks.length} native HTTP account-completion browser flows; ${output}/receipt.json`);
} catch (error) {
  report.failure = error.stack;
  report.state = await activePage?.evaluate(() => ({ url: location.href, turn: window._game?.turnNo,
    over: window._game?.gameOver, status: window._ui?.accountSaveStatus, question: window._ui?.pending?.q.type,
    lost: window._ui?.me?.lost, profile: window.MTGAccount?.profile })).catch(() => null);
  throw error;
} finally {
  report.assets = (await Promise.allSettled(assets)).filter(row => row.status === 'fulfilled' && row.value).map(row => row.value);
  writeFileSync(`${output}/receipt.json`, JSON.stringify(report, null, 2));
  releaseCompletion?.();
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
