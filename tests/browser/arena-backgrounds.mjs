// PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node tests/browser/arena-backgrounds.mjs
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import express from 'express';
import { createAccountHandler, MemoryAccountStore } from '../../api/account.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const out = process.env.ARENA_QA_OUTPUT || `${root}output/web-game/arena-backgrounds`;
mkdirSync(out, { recursive: true });
const server = process.env.GAME_URL ? null : express().use('/api/account', createAccountHandler({ store: new MemoryAccountStore(), limiter: null })).use(express.static(root)).listen(0, '127.0.0.1');
if (server) await once(server, 'listening');
const base = process.env.GAME_URL || `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const errors = [], failedRequests = [], checks = [], backgroundRequests = [];
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addInitScript(() => {
  localStorage.setItem('mtgOnboardingComplete', '1');
  localStorage.setItem('mtgReducedMotion', '1');
});
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('response', response => { if (response.status() >= 400) failedRequests.push({ status: response.status(), url: response.url() }); });
page.on('request', request => { if (request.url().includes('/backgrounds/')) backgroundRequests.push(request.url()); });
const shot = async name => {
  await page.mouse.move(0, 0);
  await page.waitForTimeout(200);
  return page.screenshot({ path: `${out}/${name}.png` });
};
const check = name => { checks.push(name); console.log(`PASS ${name}`); };
const picker = () => page.locator('.arenabackgroundpicker');
const choose = id => page.locator(`.arenabackgroundchoice[data-arena-background="${id}"]`).click();
async function openPicker() {
  await page.locator('.menubutton').click();
  await page.locator('.arenabackgroundopen').click();
  await picker().waitFor({ state: 'visible' });
}
async function startGame() {
  await page.locator('[data-menu-action="solo"]').first().click();
  await page.waitForSelector('.deckentry');
  await page.locator('.decksearch input').fill('Quick Draw');
  await page.locator('.deckentry:visible').first().click();
  await page.locator('.deckspotlightcontinue').click();
  await page.locator('[data-pod-preset="learn"]').click();
  await page.locator('.setupnext').click();
  await page.locator('.reviewstart').click();
  await page.waitForFunction(() => window._ui?.pending?.q.type === 'mulligan');
  await page.locator('.modal .pbtn.primary').click();
  await page.evaluate(() => { _game.speedFactor = 0; });
  for (let i = 0; i < 100; i++) {
    if (await page.evaluate(() => _ui.pending?.q.type === 'main')) return;
    const proceed = page.locator('.actionstage .pbtn.primary:visible, .reveal .pbtn.primary:visible, .modal .pbtn.primary:visible');
    if (await proceed.count()) await proceed.first().click();
    else await page.waitForTimeout(100);
  }
  throw new Error('Human main phase did not appear');
}
try {
  await page.goto(base);
  await startGame();
  await page.evaluate(() => { window._backgroundPending = _ui.pending; window._backgroundHand = _ui.me.hand.map(card => card.iid); });
  const before = await page.evaluate(() => MTG.activeAccountMatch.decisions.length);
  await openPicker();
  assert.equal(await picker().getAttribute('role'), 'dialog');
  assert.equal(await picker().getAttribute('aria-modal'), 'true');
  assert.equal(await page.locator('.arenabackgroundchoice').count(), 11);
  const names = await page.locator('.arenabackgroundchoice').evaluateAll(nodes => nodes.map(node => node.dataset.arenaBackground));
  const paints = [];
  for (const id of names) {
    await choose(id);
    assert.equal(await page.locator('#game').getAttribute('data-arena-background'), id);
    assert.equal(await page.locator('.arenabackgroundchoice[aria-pressed="true"]').count(), 1);
    assert.equal(await page.evaluate(() => MTG.playerPreferences().arenaBackground), id);
    paints.push(await page.locator('#game').evaluate(node => getComputedStyle(node).backgroundImage));
  }
  assert.equal(new Set(paints).size, 11, 'Every background has a distinct rendered image');
  assert.ok(paints.every(paint => paint !== 'none'));
  await choose('moonlit-grove');
  await page.locator('#arena-background-dim').focus();
  await page.keyboard.press('Home');
  assert.equal(await page.evaluate(() => _ui.arenaDim), 0);
  await page.keyboard.press('End');
  assert.equal(await page.evaluate(() => _ui.arenaDim), 75);
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.evaluate(() => _ui.arenaDim), 70);
  await page.locator('#arena-background-dim').fill('25');
  assert.equal(await page.locator('.arenabackgrounddimmer output').innerText(), '25%');
  await shot('desktop-picker');
  assert.equal(await page.evaluate(() => _ui.pending === window._backgroundPending), true);
  assert.equal(await page.evaluate(() => MTG.activeAccountMatch.decisions.length), before);
  assert.deepEqual(await page.evaluate(() => _ui.me.hand.map(card => card.iid)), await page.evaluate(() => window._backgroundHand));
  check('11 local scenes and mana backgrounds; immediate selection; keyboard dimmer; pending game decision preserved');
  await page.locator('.arenabackgrounddone').focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Close arena backgrounds');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.activeElement.classList.contains('arenabackgrounddone')), true);
  await page.keyboard.press('Escape');
  assert.equal(await picker().count(), 0);
  assert.equal(await page.evaluate(() => document.activeElement.classList.contains('menubutton')), true);
  await shot('desktop-grove-arena');
  await page.keyboard.press('Control+k');
  await page.locator('.commandsearch').fill('background');
  await page.locator('.commandresult').first().click();
  await picker().waitFor({ state: 'visible' });
  await choose('molten-forge');
  await page.locator('.arenabackgroundback').click();
  assert.equal(await picker().count(), 0);
  assert.equal(await page.locator('.arenabackgroundopen').isVisible(), true);
  await page.locator('.arenabackgroundopen').click();
  await page.locator('.arenabackgrounddone').click();
  await shot('desktop-forge-arena');
  check('search entry, Back, Done, Escape, focus containment and focus return');
  for (const [width, height] of [[320, 740], [390, 844], [820, 1180], [1440, 1000], [1900, 950]]) {
    await page.setViewportSize({ width, height });
    await openPicker();
    await choose('astral-sanctum');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `No horizontal overflow at ${width}`);
    const rect = await picker().boundingBox();
    assert.ok(rect.x >= -1 && rect.y >= -1 && rect.x + rect.width <= width + 1 && rect.y + rect.height <= height + 1, `Picker fits ${width}: ${JSON.stringify(rect)}`);
    const done = await page.locator('.arenabackgrounddone').boundingBox();
    assert.ok(done.height >= 44 && done.y + done.height <= height + 1, `Done remains visible at ${width}`);
    if (width === 390) { await page.locator('.arenabackgroundbody').evaluate(node => { node.scrollTop = 0; }); await shot('mobile-picker'); }
    await page.locator('.arenabackgrounddone').click();
    if ([390, 1900].includes(width)) await shot(`astral-arena-${width}`);
  }
  check('320, 390, 820, 1440 and 1900px picker and arena fit; scrollable options and always-visible Done');
  await page.setViewportSize({ width: 1440, height: 1000 });
  const landName = await page.evaluate(() => _ui.pending.q.lands[0]?.name);
  assert.ok(landName);
  await page.locator('.hand .hcard').filter({ has: page.locator('.mname', { hasText: landName }) }).first().click();
  await page.locator('.sheetacts button').filter({ hasText: 'Play land' }).click();
  await page.waitForFunction(name => _game.bf().some(card => card.ctrl === _ui.me && card.name === name), landName);
  await shot('land-played-after-background-change');
  check('real land play through ordinary card sheet after background changes');
  await page.reload();
  await startGame();
  assert.equal(await page.locator('#game').getAttribute('data-arena-background'), 'astral-sanctum');
  assert.equal(await page.evaluate(() => _ui.arenaDim), 25);
  assert.equal(await page.evaluate(() => MTG.renderGameState().playerTools.arenaBackground), 'astral-sanctum');
  await openPicker();
  assert.equal(await page.locator('.arenabackgroundchoice[aria-pressed="true"]').getAttribute('data-arena-background'), 'astral-sanctum');
  await page.evaluate(() => { window._originalBackgroundWrite = Storage.prototype.setItem; Storage.prototype.setItem = function () { throw new Error('Storage unavailable'); }; });
  await choose('blue');
  assert.match(await page.locator('.arenabackgroundstatus').innerText(), /session.*storage is unavailable/);
  assert.equal(await page.locator('#game').getAttribute('data-arena-background'), 'blue');
  await page.evaluate(() => { Storage.prototype.setItem = window._originalBackgroundWrite; });
  await page.locator('.arenabackgrounddone').click();
  check('selection and dimmer persist through reload/new game; blocked storage still applies safely and reports session-only state');
  assert.ok(backgroundRequests.every(url => new URL(url).origin === new URL(base).origin));
  assert.deepEqual(errors, []); assert.deepEqual(failedRequests, []);
  writeFileSync(`${out}/state.json`, await page.evaluate(() => window.render_game_to_text()));
  // The shared skill client also observes a stable public entry frame with real input.
  if (process.env.WEB_GAME_CLIENT) {
    const child = spawn(process.execPath, [process.env.WEB_GAME_CLIENT, '--url', base, '--click-selector', '[data-menu-action="solo"]', '--actions-json', '{"steps":[{"buttons":[],"frames":3}]}', '--iterations', '2', '--pause-ms', '250', '--screenshot-dir', `${out}/skill`], { stdio: 'inherit' });
    assert.equal((await once(child, 'exit'))[0], 0);
  }
  writeFileSync(`${out}/report.json`, JSON.stringify({ checks, errors, failedRequests, backgroundRequests }, null, 2));
  console.log(`PASS all arena backgrounds checks. Screenshots: ${out}`);
} finally { await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); }
