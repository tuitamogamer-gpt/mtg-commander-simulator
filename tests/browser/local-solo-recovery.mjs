// Real native Solo continuation, browser storage, and local HTTP accounts.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createAccountHandler, MemoryAccountStore } from '../../api/account.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = process.env.RECOVERY_OUTPUT || `${tmpdir()}/mtg-local-recovery-${Date.now()}`;
mkdirSync(output, { recursive: true });
let rejectSaves = false;
const requests = [];
const app = express().use('/api/account', express.json({ limit: '2mb' }), (req, res, next) => {
  const action = req.body?.action || req.query.action;
  requests.push({ action, matchId: req.body?.save?.matchId || req.body?.matchId });
  if (rejectSaves && action === 'save') return res.status(503).json({ ok: false, error: 'The connection is temporarily unavailable.' });
  next();
}).use('/api/account', createAccountHandler({ store: new MemoryAccountStore(), limiter: null })).use(express.static(root));
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true,
  ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
const receipt = { checks: [], browserErrors: [], assets: [] };
const assets = [];
let activePage;
function watch(page) {
  activePage = page;
  page.on('pageerror', error => receipt.browserErrors.push(error.message));
  page.on('response', response => {
    if (!/\/(?:account|main|save-game|save-state)\.js$/.test(new URL(response.url()).pathname)) return;
    assets.push(response.body().then(bytes => ({ url: response.url(), sha256: createHash('sha256').update(bytes).digest('hex') })).catch(() => null));
  });
  page.setDefaultTimeout(30000);
}
async function context() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await ctx.addInitScript(() => {
    localStorage.setItem('mtgOnboardingComplete', '1');
    localStorage.setItem('mtgReducedMotion', '1');
  });
  return ctx;
}
const view = page => page.evaluate(() => ({ matchId: MTG.activeAccountMatch.matchId,
  question: _ui.pending?.q.type || (_ui.react ? 'priority' : null), turn: _game.turnNo, phase: _game.phase,
  hand: _ui.me.hand.map(card => card.name), commanders: _ui.me.commanders.map(card => card.name),
  decisions: MTG.activeAccountMatch.decisions.length }));
async function start(page) {
  await page.goto(`${base}/?smokeDeck=Quick%20Draw&seed=10`);
  await page.waitForFunction(() => window._ui?.pending?.q.type === 'mulligan', null, { timeout: 120000 });
  await page.waitForFunction(() => !MTGAccount.loading);
}
async function keepAndWait(page) {
  await page.getByRole('button', { name: 'Keep ✓', exact: true }).click();
  await page.waitForFunction(() => MTG.activeAccountMatch.decisions.length > 0 && !!(_ui.pending || _ui.react), null, { timeout: 90000 });
}
async function deviceContinue(page) {
  await page.goto(base);
  await page.locator('.mainmenu-device-return').click();
  await page.waitForFunction(() => !!(window._ui?.pending || window._ui?.react), null, { timeout: 120000 });
  await page.waitForFunction(() => !_ui.accountReplay);
}
try {
  const guest = await context();
  const page = await guest.newPage();
  watch(page);
  await start(page);
  await keepAndWait(page);
  const before = await view(page);
  const stored = await page.evaluate(() => MTGAccount.getLocalRecovery());
  assert.equal(stored.ownerId, 'guest');
  assert.equal(stored.save.matchId, before.matchId);
  assert.equal(stored.save.decisions.length, before.decisions);
  await deviceContinue(page);
  assert.deepEqual(await view(page), before, 'refresh and explicit device Continue restore the native hand, question and timeline');
  assert.equal(requests.some(request => request.action === 'save'), false, 'guest recovery never uploads');
  receipt.checks.push({ case: 'guest-refresh', before, restored: await view(page) });
  await page.screenshot({ path: `${output}/guest-restored.png`, animations: 'disabled' });
  await guest.close();

  const signedIn = await context();
  const registration = await signedIn.request.post(`${base}/api/account`, { data: { action: 'register',
    displayName: 'Recovery QA', email: 'device-recovery@example.test', password: 'Local-only-recovery-102613!' } });
  const owner = (await registration.json()).user.id;
  const accountPage = await signedIn.newPage();
  watch(accountPage);
  await start(accountPage);
  await accountPage.evaluate(() => MTG.flushAccountSave());
  await signedIn.setOffline(true);
  await keepAndWait(accountPage);
  assert.equal(await accountPage.evaluate(() => MTG.flushAccountSave()), false);
  const offline = await view(accountPage);
  const pending = await accountPage.evaluate(() => MTGAccount.getLocalRecovery());
  assert.equal(pending.ownerId, owner);
  assert.equal(pending.save.decisions.length, offline.decisions);
  assert.match(await accountPage.evaluate(() => _ui.accountSaveStatus.text), /cloud pending/);
  rejectSaves = true;
  await signedIn.setOffline(false);
  await deviceContinue(accountPage);
  assert.deepEqual(await view(accountPage), offline, 'the pending device revision survives a refresh with an older confirmed cloud save');
  assert.equal((await accountPage.evaluate(() => MTGAccount.getLocalRecovery())).ownerId, owner);
  receipt.checks.push({ case: 'lost-connection-refresh', before: offline, restored: await view(accountPage) });

  const diagnostic = await accountPage.evaluate(() => MTG.captureActiveSoloSave(_game));
  const localBefore = await accountPage.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith('mtg-solo-recovery/'))));
  const writesBefore = requests.filter(request => ['save', 'completeMatch'].includes(request.action)).length;
  await accountPage.evaluate(save => MTG.resumeAccountSave(save, { diagnosticReplay: true }), diagnostic);
  await accountPage.waitForFunction(() => !!(_ui.pending || _ui.react) && !_ui.accountReplay);
  assert.equal(await accountPage.evaluate(() => MTG.flushAccountSave()), false);
  await accountPage.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  assert.equal(await accountPage.evaluate(() => _ui.diagnosticReplay), true);
  assert.deepEqual(await accountPage.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith('mtg-solo-recovery/')))), localBefore);
  assert.equal(requests.filter(request => ['save', 'completeMatch'].includes(request.action)).length, writesBefore);
  receipt.checks.push({ case: 'diagnostic-persistence-disabled', label: await accountPage.evaluate(() => _ui.accountSaveStatus.text) });

  await signedIn.request.post(`${base}/api/account`, { data: { action: 'logout' } });
  const nextRegistration = await signedIn.request.post(`${base}/api/account`, { data: { action: 'register',
    displayName: 'Other QA', email: 'other-recovery@example.test', password: 'Local-only-recovery-102613!' } });
  const nextOwner = (await nextRegistration.json()).user.id;
  await accountPage.goto(base);
  await accountPage.waitForFunction(owner => !MTGAccount.loading && MTGAccount.user?.id === owner, nextOwner);
  assert.equal(await accountPage.locator('.mainmenu-device-return').count(), 0);
  assert.equal(await accountPage.evaluate(() => MTGAccount.getLocalRecovery()), null);
  assert.equal(await accountPage.evaluate(owner => !!localStorage.getItem('mtg-solo-recovery/v1/' + encodeURIComponent(owner)), owner), true);
  await accountPage.evaluate(() => MTGAccount.logout());
  assert.equal(await accountPage.locator('.mainmenu-device-return').count(), 0);
  assert.equal(await accountPage.evaluate(() => MTGAccount.getLocalRecovery()), null);
  receipt.checks.push({ case: 'owner-switch-and-guest-isolation', hiddenFromOtherAccount: true, hiddenFromGuest: true });
  await signedIn.close();
  assert.deepEqual(receipt.browserErrors, []);
  console.log(`PASS ${receipt.checks.length} native browser recovery flows; receipt ${output}/receipt.json`);
} catch (error) {
  receipt.failure = error.stack;
  receipt.state = await activePage?.evaluate(() => ({ turn: window._game?.turnNo, phase: window._game?.phase,
    question: window._ui?.pending?.q.type, error: window._ui?.fatalError,
    decisions: window.MTG?.activeAccountMatch?.decisions.length, log: window._game?.log.slice(-8) })).catch(() => null);
  throw error;
} finally {
  receipt.assets = (await Promise.allSettled(assets)).filter(result => result.status === 'fulfilled' && result.value).map(result => result.value);
  writeFileSync(`${output}/receipt.json`, JSON.stringify(receipt, null, 2));
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
