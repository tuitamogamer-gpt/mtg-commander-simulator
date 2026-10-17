// Real Solo decisions stay pending while the report editor survives redraws.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdirSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {isAbsolute, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import express from 'express';
import {createAccountHandler, MemoryAccountStore} from '../../api/account.js';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = process.env.REPORT_OUTPUT || join(tmpdir(), 'mtg-report-controls');
assert.ok(isAbsolute(output), 'REPORT_OUTPUT must be an absolute directory');
mkdirSync(output, {recursive: true});
let server, base = process.env.GAME_URL;
if (!base) {
  server = express().use('/api/account', createAccountHandler({store: new MemoryAccountStore(), limiter: null}))
    .use(express.static(fileURLToPath(new URL('../../', import.meta.url)))).listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
}
const browser = await chromium.launch({headless: true,
  ...(process.env.BROWSER_EXECUTABLE ? {executablePath: process.env.BROWSER_EXECUTABLE} : {})});
const page = await browser.newPage({viewport: {width: 390, height: 844}, hasTouch: true, reducedMotion: 'reduce'});
page.setDefaultTimeout(20000);
const receipt = {target: base, errors: [], failedRequests: [], checks: []};
let downloads = 0;
page.on('download', () => {downloads++;});
page.on('pageerror', error => receipt.errors.push(error.message));
page.on('response', response => {if (response.status() >= 400) receipt.failedRequests.push({status: response.status(), url: response.url()});});
await page.addInitScript(() => {
  localStorage.setItem('mtgOnboardingComplete', '1');
  localStorage.setItem('mtgReducedMotion', '1');
  localStorage.setItem('mtgManaMode', 'auto');
});
async function openReport() {
  await page.locator('.menubutton').click();
  await page.locator('[data-settings-tab="help"]').click();
  await page.getByRole('button', {name: /^Report a problem/}).click();
  await page.locator('#problem-description').waitFor();
}
async function unchangedDecision() {
  assert.equal(await page.evaluate(() => _ui.pending === window.__reportPending), true, 'The same native decision is still pending');
  assert.equal(await page.evaluate(() => MTG.gameStateFingerprint(_game)), receipt.fingerprint, 'Report controls cannot change the game');
}

try {
  await page.goto(base);
  await page.locator('[data-menu-action="solo"]').first().click();
  await page.waitForSelector('.deckentry:visible', {timeout: 120000});
  await page.locator('.decksearch input').fill('Abzan Armor');
  await page.locator('.deckcard:visible').click();
  await page.locator('.deckspotlightcontinue').click();
  await page.locator('[data-pod-preset="learn"]').click();
  await page.locator('.botfields .deckselect').selectOption('Turtle Power');
  await page.locator('.setupnext').click();
  await page.evaluate(() => {window.__qaRandom = Math.random; Math.random = () => 11081 / 1e9;});
  await page.locator('.reviewstart').click();
  await page.waitForFunction(() => !!window._ui?.pending);
  await page.evaluate(() => {Math.random = window.__qaRandom; delete window.__qaRandom; _game.speedFactor = 0;});
  await page.getByRole('button', {name: /^Keep/}).click();
  await page.waitForFunction(() => _ui.pending?.q.type === 'main');
  receipt.fingerprint = await page.evaluate(() => {window.__reportPending = _ui.pending; return MTG.gameStateFingerprint(_game);});

  for (const [width, height] of [[390, 844], [1440, 1024], [320, 568]]) {
    await page.setViewportSize({width, height});
    await openReport();
    const editor = page.locator('#problem-description');
    await editor.fill('Yuriko should enter when an attacker returns.');
    await editor.evaluate(node => {node.focus(); node.setSelectionRange(7, 13); window.__reportEditor = node;});
    const checkbox = page.locator('.problemreport input[type="checkbox"]');
    assert.equal(await checkbox.isChecked(), true);
    await checkbox.uncheck();
    await editor.focus();
    await page.evaluate(() => {for (let i = 0; i < 4; i++) _ui.render();});
    assert.deepEqual(await editor.evaluate(node => ({same: node === window.__reportEditor, focused: document.activeElement === node,
      start: node.selectionStart, end: node.selectionEnd})), {same: true, focused: true, start: 7, end: 13});
    await page.keyboard.type('will');
    assert.equal(await editor.inputValue(), 'Yuriko will enter when an attacker returns.');
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter');
    await page.keyboard.insertText('Čarobni zmaj 🥷 <tag>');
    assert.match(await editor.inputValue(), /\nČarobni zmaj 🥷 <tag>$/);
    assert.equal(await checkbox.isChecked(), false, 'Redraw cannot silently reattach private replay data');
    await checkbox.focus();
    await page.keyboard.press('Space');
    assert.equal(await checkbox.isChecked(), true, 'Native checkbox Space still works');
    await unchangedDecision();
    await page.getByRole('button', {name: 'Download report', exact: true}).focus();
    await page.keyboard.press('Tab');
    assert.equal(await editor.evaluate(node => document.activeElement === node), true, 'Tab stays inside the report');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    await page.screenshot({path: join(output, `report-controls-${width}.png`)});
    await page.keyboard.press('Escape');
    await page.locator('.problemreport').waitFor({state: 'detached'});
    await page.waitForFunction(() => document.activeElement?.classList.contains('menubutton'));
    await unchangedDecision();
    receipt.checks.push(`${width}px: connected textarea, selected replacement, Unicode/newline, privacy checkbox, Tab, Escape and Menu focus`);
  }

  await openReport();
  await page.evaluate(() => {
    const report = document.querySelector('.problemreport');
    window.__oldReport = {cancel: [...report.querySelectorAll('button')].find(node => node.textContent === 'Cancel'),
      download: report.querySelector('.primary'), editor: report.querySelector('textarea'), checkbox: report.querySelector('input')};
  });
  await page.getByRole('button', {name: 'Cancel', exact: true}).click();
  await openReport();
  await page.locator('#problem-description').fill('Current report remains open.');
  await page.evaluate(() => {
    __oldReport.cancel.click(); __oldReport.download.click();
    __oldReport.editor.value = 'Stale input'; __oldReport.editor.dispatchEvent(new Event('input'));
    __oldReport.checkbox.checked = false; __oldReport.checkbox.dispatchEvent(new Event('change'));
  });
  assert.equal(await page.locator('#problem-description').inputValue(), 'Current report remains open.');
  assert.equal(await page.locator('.problemreport input').isChecked(), true);
  await unchangedDecision();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', {name: 'Download report', exact: true}).focus();
  await page.keyboard.press('Enter');
  await (await downloadEvent).saveAs(join(output, 'keyboard-report.json'));
  await page.locator('.problemreport').waitFor({state: 'detached'});
  await unchangedDecision();
  receipt.checks.push('Stale report controls cannot close or edit a newer draft; focused Enter downloads without answering the game');

  // A native paid spell can finish resolving while the player is writing.
  // Its mandatory entry choice must wait beneath the same captured report.
  await page.evaluate(() => {
    const put = (name, zone) => {
      const card = new MTG.CardInst(MTG.DEFS[name], _ui.me);
      card.zone = zone; card.sick = false;
      (zone === 'battlefield' ? _game.battlefield : _ui.me[zone]).push(card);
      return card;
    };
    window.__reportLands = Array.from({length: 4}, () => put('Wastes', 'battlefield'));
    window.__reportThrone = put('Roaming Throne', 'hand');
    _ui.prioMode = 'off'; _game.recalc(); _ui.render();
  });
  await openReport();
  await page.locator('#problem-description').fill('Keep this report while Roaming Throne enters.');
  await page.locator('#problem-description').evaluate(node => {
    node.focus(); node.setSelectionRange(5, 9); window.__reportEditor = node;
    window.__capturedReport = _ui.problemReportDraft.captured;
  });
  await page.evaluate(() => {
    window.__reportThroneFinished = null;
    void _game.castSpell(_ui.me, __reportThrone, {from: 'hand'}).then(result => {window.__reportThroneFinished = result;});
  });
  await page.waitForFunction(() => _ui.pending?.q.aiHint?.kind === 'chooseType');
  assert.equal(await page.locator('.problemreport').count(), 1, 'A newly arriving native choice cannot dismiss a report in progress');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.deepEqual(await page.locator('#problem-description').evaluate(node => ({same: node === __reportEditor,
    focused: document.activeElement === node, start: node.selectionStart, end: node.selectionEnd})),
  {same: true, focused: true, start: 5, end: 9});
  assert.equal(await page.evaluate(() => _ui.problemReportDraft.captured === __capturedReport), true);
  const entryFingerprint = await page.evaluate(() => {
    window.__reportEntryPending = _ui.pending;
    return MTG.gameStateFingerprint(_game);
  });
  await page.keyboard.press('Escape');
  await page.locator('.problemreport').waitFor({state: 'detached'});
  assert.equal(await page.evaluate(() => _ui.pending === __reportEntryPending), true, 'Closing the report cannot answer the new native choice');
  assert.equal(await page.evaluate(() => MTG.gameStateFingerprint(_game)), entryFingerprint);
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Creature type');
  await page.locator('input[aria-label="Creature type"]').fill('Ninja');
  await page.locator('[data-choice-key="Ninja"]').click();
  await page.waitForFunction(() => window.__reportThroneFinished !== null);
  assert.deepEqual(await page.evaluate(() => ({finished: __reportThroneFinished, zone: __reportThrone.zone,
    type: __reportThrone.meta.cslType, paid: __reportLands.every(card => card.tapped), originalPending: _ui.pending === __reportPending})),
  {finished: true, zone: 'battlefield', type: 'Ninja', paid: true, originalPending: true});
  receipt.checks.push('A real paid Roaming Throne waits for its native Ninja choice while report text, selection and captured checkpoint survive');

  // A previous UI can outlive its detached DOM during a rematch/continuation.
  // Its old controls must never repaint that table over the current instance.
  await openReport();
  const obsolete = await page.evaluate(() => {
    const oldUI = _ui, editor = document.querySelector('#problem-description');
    const cancel = [...document.querySelectorAll('.problemreport button')].find(node => node.textContent === 'Cancel');
    const download = document.querySelector('.problemreport button.primary');
    const replacement = new MTG.UI(); replacement.game = _game; replacement.me = oldUI.me;
    replacement.pending = oldUI.pending;
    window._ui = replacement; replacement.render();
    const before = document.querySelector('#game').innerHTML;
    cancel.click(); download.click(); editor.value = 'Old UI input'; editor.dispatchEvent(new Event('input'));
    oldUI.openProblemReport(_game);
    return {sameUI: window._ui === replacement, sameDOM: document.querySelector('#game').innerHTML === before,
      noReport: !document.querySelector('.problemreport'), currentQuestion: replacement.pending === window.__reportPending};
  });
  assert.deepEqual(obsolete, {sameUI: true, sameDOM: true, noReport: true, currentQuestion: true});
  await page.waitForTimeout(100);
  assert.equal(downloads, 1, 'Obsolete report callbacks cannot initiate an additional download');
  receipt.checks.push('Obsolete report callbacks cannot download or repaint an old table after its UI instance is replaced');
  assert.deepEqual(receipt.errors, []);
  assert.deepEqual(receipt.failedRequests, []);
  delete receipt.fingerprint;
  writeFileSync(join(output, 'report-controls.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt, null, 2));
} catch (error) {
  receipt.failure = error.stack;
  writeFileSync(join(output, 'report-controls.json'), JSON.stringify(receipt, null, 2) + '\n');
  await page.screenshot({path: join(output, 'failure.png')}).catch(() => {});
  throw error;
} finally {
  await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
