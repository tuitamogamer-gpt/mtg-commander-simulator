// Real Solo input, portable download/import, and an isolated diagnostic game.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createAccountHandler, MemoryAccountStore } from '../../api/account.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = process.env.REPORT_OUTPUT || join(tmpdir(), 'mtg-problem-report');
assert.ok(isAbsolute(output), 'REPORT_OUTPUT must be an absolute directory');
mkdirSync(output, { recursive: true });
let server, base = process.env.GAME_URL;
const local = !base;
if (local) {
  const app = express().use('/api/account', createAccountHandler({ store: new MemoryAccountStore(), limiter: null }));
  server = app.use(express.static(fileURLToPath(new URL('../../', import.meta.url)))).listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
}
const browser = await chromium.launch({ headless: true,
  ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}),
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' });
const page = await context.newPage();
page.setDefaultTimeout(20000);
const errors = [], failedRequests = [], sources = [], mutations = [];
const receipt = { target: base, localAuthenticatedAccount: local, errors, failedRequests, mutations };
let diagnosticStarted = false;
const description = 'Yuriko / Čarobni zmaj 🥷: expected entry; saw <tag> & "nothing".\nKeep this exact text.';
const credentials = { email: 'problem-report@example.invalid', password: 'Local-report-test-9381', displayName: 'Report Tester' };
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => {
  if (diagnosticStarted && request.method() !== 'GET' && new URL(request.url()).pathname === '/api/account') {
    let action = null;
    try { action = request.postDataJSON()?.action; } catch {}
    mutations.push({ method: request.method(), action });
  }
});
const sourcePaths = new Set(['/src/build-info.js', '/src/modules/problem-report.js', '/src/modules/main.js', '/src/modules/ui.js']);
page.on('response', response => {
  const path = new URL(response.url()).pathname;
  if (response.status() >= 400) failedRequests.push({ path, status: response.status() });
  if (sourcePaths.has(path) && response.status() === 200) sources.push(response.body().then(body => ({ path, status: response.status(),
    sha256: createHash('sha256').update(body).digest('hex') })).catch(error => ({ path, error: error.message })));
});
await page.addInitScript(() => {
  localStorage.setItem('mtgOnboardingComplete', '1');
  localStorage.setItem('mtgReducedMotion', '1');
  localStorage.setItem('mtgManaMode', 'auto');
  localStorage.setItem('mtgPlayerPreferences', JSON.stringify({ speed: 'fast', handSort: 'type' }));
});

async function openSetup() {
  await page.goto(base);
  await page.locator('[data-menu-action="solo"]').first().click();
  await page.waitForSelector('.deckentry:visible', { timeout: 120000 });
}

async function clickIf(selector) {
  const button = page.locator(selector).first();
  if (await button.count()) { await button.click(); return true; }
  return false;
}

const play = { lands: 0, spells: 0, attacks: 0, steps: 0 };
async function step() {
  const state = await page.evaluate(() => {
    const q = _ui.pending?.q;
    return { over: _game.gameOver, type: q?.type,
      land: q?.type === 'main' && q.lands?.length ? { id: q.lands[0].iid, name: q.lands[0].name } : null,
      cast: q?.type === 'main' && q.casts?.length ? { id: q.casts[0].card.iid, name: q.casts[0].card.name } : null };
  });
  if (state.over) return false;
  play.steps++;
  if (state.type === 'main' && (state.land || state.cast)) {
    const card = state.land || state.cast;
    await page.locator('.commandbutton').click();
    await page.locator('.commandsearch').fill(card.name);
    await page.locator(`.commandresult[data-card-id="${card.id}"]`).click();
    await page.locator('.sheetacts .pbtn.primary').first().click();
    if (state.land) play.lands++; else play.spells++;
    return true;
  }
  if (state.type === 'attackers') {
    const defenders = page.locator('.ct-defender-choice');
    if (await defenders.count()) await defenders.first().click();
    await clickIf('[data-testid="combat-all-attack"]:not(:disabled):visible');
    const confirm = page.locator('[data-testid="confirm-combat-battlefield"]');
    for (let i = 0; i < await defenders.count() && await confirm.isDisabled(); i++) await defenders.nth(i).click();
    assert.equal(await confirm.isEnabled(), true);
    if (await page.evaluate(() => _ui.pending.sel.length > 0)) play.attacks++;
    await confirm.click();
    return true;
  }
  if (['chooseTargets', 'choosePlayer'].includes(state.type)) {
    if (await clickIf('.promptbar .pbtn.primary:not(:disabled):visible')) return true;
    if (await clickIf('#game .targetable:not(.selected):visible')) return true;
  }
  if (['chooseCards', 'bottomCards'].includes(state.type)) {
    if (await clickIf('.modal .pbtn.primary:not(:disabled):visible')) return true;
    if (await clickIf('.modal .bigcard:not(.selected):visible')) return true;
  }
  for (const selector of ['.actionstage .pbtn.primary:visible', '.reveal .pbtn.primary:visible',
    '.modal .pbtn.primary:not(:disabled):visible', '.modal .pbtn:not(:disabled):visible',
    '.promptbar .pbtn.primary:not(:disabled):visible']) {
    if (await clickIf(selector)) return true;
  }
  await page.locator('body').click({ position: { x: 4, y: 4 } });
  await page.keyboard.press('Space');
  await page.waitForTimeout(40);
  return true;
}

async function board() {
  return page.evaluate(() => {
    const card = c => ({ name: c.name, zone: c.zone, owner: c.owner?.name || null,
      controller: c.ctrl?.name || null, tapped: !!c.tapped, sick: !!c.sick,
      counters: Object.fromEntries(Object.entries(c.counters || {}).sort(([a], [b]) => a.localeCompare(b))) });
    const q = _ui.pending?.q;
    return { turn: _game.turnNo, phase: _game.phase, step: _game.step, active: _game.turnPlayer?.name,
      players: _game.players.map(p => ({ name: p.name, deck: p.deckName, life: p.life, lost: !!p.lost,
        hand: p.hand.map(card), library: p.library.map(c => c.name), graveyard: p.graveyard.map(card),
        exile: p.exile.map(card), command: p.command.map(card) })),
      battlefield: _game.battlefield.map(card), stack: _game.stack.map(item => ({ label: item.label, kind: item.kind })),
      pending: { type: q?.type || null, prompt: q?.prompt || null, player: _ui.pending?.p?.name || null,
        lands: (q?.lands || []).map(c => c.name), casts: (q?.casts || []).map(entry => entry.card.name) } };
  });
}

async function reportDownload(replay, filename) {
  await page.locator('.menubutton').click();
  await page.getByRole('button', { name: /^Report a problem/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Report a problem', exact: true });
  await dialog.locator('textarea').fill(description);
  await dialog.getByRole('checkbox').setChecked(replay);
  await page.screenshot({ path: join(output, replay ? 'report-replay.png' : 'report-public.png') });
  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download report', exact: true }).click();
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /^commander-problem-.*\.json$/);
  const path = join(output, filename);
  await download.saveAs(path);
  const text = readFileSync(path, 'utf8');
  assert.ok(!text.includes(credentials.password) && !text.includes(credentials.email), 'Account credentials are excluded');
  return { report: JSON.parse(text), path };
}

async function accountSnapshot() {
  const response = await context.request.get(`${base}/api/account?action=session`);
  assert.equal(response.status(), 200);
  const account = await response.json();
  return { save: account.save ?? null, profile: account.profile ?? null };
}

try {
  if (local) {
    const response = await context.request.post(`${base}/api/account`, { data: { action: 'register', ...credentials } });
    assert.equal(response.status(), 201, 'Only the ephemeral local server creates a QA account');
  }
  await openSetup();
  if (local) await page.waitForFunction(() => !!MTGAccount.user);
  await page.locator('.decksearch input').fill('Abzan Armor');
  await page.locator('.deckcard:visible').click();
  await page.locator('.deckspotlightcontinue').click();
  await page.locator('[data-pod-preset="learn"]').click();
  await page.locator('.botfields .deckselect').selectOption('Turtle Power');
  await page.locator('.setupnext').click();
  await page.evaluate(() => { window.__qaRandom = Math.random; Math.random = () => 11081 / 1e9; });
  await page.locator('.reviewstart').click();
  await page.waitForFunction(() => !!window._ui?.pending);
  assert.equal(await page.evaluate(() => MTG.activeAccountMatch.setup.seed), '11081');
  await page.evaluate(() => { Math.random = window.__qaRandom; delete window.__qaRandom; _game.speedFactor = 0; });
  for (let i = 0; i < 100; i++) {
    if (play.lands > 0 && await page.evaluate(() => _ui.pending?.q.type === 'main')) break;
    await step();
  }
  assert.ok(play.lands > 0, 'A land was played through the real card action');
  await page.waitForFunction(() => _ui.pending?.q.type === 'main');
  const capturedBoard = await board();
  const loadedBuild = await page.evaluate(() => ({ ...MTG.BUILD_INFO }));
  if (process.env.EXPECTED_BUILD_REVISION) assert.equal(loadedBuild.revision, process.env.EXPECTED_BUILD_REVISION);
  const { report: publicReport } = await reportDownload(false, 'public-report.json');
  assert.equal(publicReport.schema, 'commander-problem/v1');
  assert.equal(publicReport.description, description);
  assert.equal(publicReport.replay, null);
  assert.match(publicReport.privacy, /Public diagnostics only/);
  const { report, path } = await reportDownload(true, 'solo-report.json');
  assert.deepEqual(report.build, loadedBuild);
  assert.equal(report.description, description);
  assert.equal(report.replay.setup.seed, '11081');
  assert.ok(report.replay.decisions.length >= 2, 'Native choices are recorded');
  assert.equal(report.diagnostics.checkpoint.turn, capturedBoard.turn);
  assert.deepEqual(await board(), capturedBoard, 'Opening and downloading reports preserves the pending decision');
  const cookies = await context.cookies();
  const serialized = JSON.stringify(report);
  for (const cookie of cookies) if (cookie.value.length >= 16) assert.equal(serialized.includes(cookie.value), false, 'No session cookie in export');
  await page.waitForTimeout(650);

  // A fresh document imports the actual downloaded file; the existing account
  // and its legitimate save remain, so diagnostic writes would be observable.
  await openSetup();
  await page.locator('.decksearch input').fill('Abzan Armor');
  await page.locator('.deckcard:visible').click();
  await page.locator('.deckspotlightcontinue').click();
  await page.locator('.supportdiagnostics > summary').click();
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open problem replay', exact: true }).click();
  await (await chooserPromise).setFiles(path);
  await page.getByRole('button', { name: 'Start diagnostic replay', exact: true }).waitFor();
  assert.equal(await page.locator('.problemreportdescription').textContent(), description);
  assert.equal(await page.locator('.problemreportdescription tag').count(), 0, 'Description is plain text');
  const beforeAccount = await accountSnapshot();
  if (local) assert.ok(beforeAccount.save, 'The authenticated original game has a real server save to protect');
  await page.evaluate(() => {
    window.__reportStorageWrites = [];
    for (const method of ['setItem', 'removeItem', 'clear']) {
      const original = Storage.prototype[method];
      Storage.prototype[method] = function (...args) {
        if (this === localStorage) window.__reportStorageWrites.push({ method, key: args[0] ?? null });
        return original.apply(this, args);
      };
    }
  });
  diagnosticStarted = true;
  await page.getByRole('button', { name: 'Start diagnostic replay', exact: true }).click();
  await page.waitForFunction(() => !!window._ui?.diagnosticReplay && _ui.pending?.q.type === 'main', null, { timeout: 120000 });
  const restoredBoard = await board();
  writeFileSync(join(output, 'board-comparison.json'), JSON.stringify({ captured: capturedBoard, restored: restoredBoard }, null, 2));
  assert.deepEqual(restoredBoard, capturedBoard, 'Replay reaches the captured card/turn/decision boundary');
  assert.match(await page.evaluate(() => _ui.accountSaveStatus?.text || ''), /Diagnostic replay.*saving disabled/);
  await page.screenshot({ path: join(output, 'diagnostic-restored.png') });
  await page.evaluate(() => { _game.speedFactor = 0; });
  for (let i = 0; i < 350 && await step(); i++);
  assert.equal(await page.evaluate(() => _game.gameOver), true, 'The diagnostic game finishes through actual UI choices');
  await page.waitForTimeout(650);
  assert.deepEqual(await accountSnapshot(), beforeAccount, 'Diagnostic completion preserves the original server save and profile stats');
  const storageWrites = await page.evaluate(() => window.__reportStorageWrites);
  const protectedWrites = storageWrites.filter(row => row.method === 'clear' || /recovery|save|account/i.test(row.key || ''));
  assert.deepEqual(protectedWrites, [], 'Diagnostic replay never updates device recovery or account storage');
  assert.deepEqual(mutations.filter(row => ['save', 'clearSave', 'completeMatch'].includes(row.action)), [], 'No account mutation request for diagnostic play');
  assert.deepEqual(errors, []);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'Mobile page has no horizontal overflow');
  await page.screenshot({ path: join(output, 'diagnostic-complete.png') });
  receipt.ok = true;
  receipt.build = loadedBuild;
  receipt.captured = { turn: capturedBoard.turn, pending: capturedBoard.pending.type, decisionCount: report.replay.decisions.length,
    checkpointTimelineIndex: report.replay.checkpointTimelineIndex ?? null, hasBoard: !!report.replay.state };
  receipt.play = play;
  receipt.final = await page.evaluate(() => ({ turn: _game.turnNo, winner: _game.winner?.name, diagnosticReplay: _ui.diagnosticReplay }));
  receipt.protectedStorageWrites = protectedWrites;
  console.log(JSON.stringify({ ok: true, target: base, output, play, final: receipt.final }));
} catch (error) {
  receipt.error = { name: error.name, message: error.message };
  process.exitCode = 1;
  console.error(error.message);
  await page.screenshot({ path: join(output, 'failure.png') }).catch(() => {});
} finally {
  receipt.sources = await Promise.all(sources);
  writeFileSync(join(output, 'receipt.json'), JSON.stringify(receipt, null, 2));
  await browser.close();
  if (server) server.close();
}
