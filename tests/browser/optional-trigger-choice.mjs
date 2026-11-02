// A may effect still chooses its mandatory target before going on the Stack.
// Verify the explanation and the later decline using real Ingester resolution.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdirSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import express from 'express';
import {createAccountHandler, MemoryAccountStore} from '../../api/account.js';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = process.env.OPTIONAL_TRIGGER_OUTPUT || `${root}output/web-game/optional-trigger-choice`;
mkdirSync(output, {recursive: true});
const remote = process.env.GAME_URL || null;
const server = remote ? null : express().use('/api/account', createAccountHandler({store: new MemoryAccountStore(), limiter: null}))
  .use(express.static(root)).listen(0, '127.0.0.1');
if (server) await once(server, 'listening');
const base = remote || `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({headless: true,
  ...(process.env.BROWSER_EXECUTABLE ? {executablePath: process.env.BROWSER_EXECUTABLE} : {})});
const page = await browser.newPage({viewport: {width: 390, height: 844}, hasTouch: true, reducedMotion: 'reduce'});
page.setDefaultTimeout(20000);
const receipt = {checks: [], errors: []};
page.on('pageerror', error => receipt.errors.push(error.message));
const hint = 'Choose a target now. You can choose No when this ability resolves to decline the effect.';

async function fixture() {
  await page.evaluate(() => {
    const old = document.getElementById('game'); old.replaceWith(old.cloneNode(false));
    document.getElementById('setup').style.display = 'none';
    document.getElementById('game').style.display = 'flex';
    document.body.classList.add('game-active');
    const ui = new MTG.UI();
    const game = new MTG.Game({seed: 11032026, paced: false, onEvent: () => ui.queueRender()});
    const pass = {decide: async () => ({kind: 'pass'})};
    const human = game.addPlayer('You', {name: 'Optional trigger QA'}, pass, false);
    game.addPlayer('AI Dragon', {name: 'Optional trigger QA'}, pass, true);
    ui.game = game; ui.me = human; ui.prioMode = 'off';
    human.controller = ui.controllerFor(human);
    game.turnPlayer = human; game.turnNo = 5; game.phase = 'main1'; game.step = 'main'; game.pace = async () => {};
    const ingester = new MTG.CardInst(MTG.DEFS['Phyrexian Ingester'], human);
    ingester.zone = 'hand'; human.hand.push(ingester);
    window._game = game; window._ui = ui;
    window.__optional = {ingester, stacked: false, done: false, error: null};
    ui.render(); ui.showMobileView('mine');
    void (async () => {
      await game.move(ingester, 'battlefield');
      await game.flushTriggers();
      __optional.stacked = true;
      await game.resolveTop();
      __optional.done = true;
    })().catch(error => { __optional.error = error.message; });
  });
  await page.waitForFunction(() => _ui.pending?.q.type === 'chooseTargets' || __optional.error);
  assert.equal(await page.evaluate(() => __optional.error), null);
}

try {
  await page.addInitScript(() => {
    localStorage.setItem('mtgOnboardingComplete', '1');
    localStorage.setItem('mtgReducedMotion', '1');
  });
  // Hosted verification uses a fresh Solo browser and cannot send account,
  // room, telemetry or save writes to the production service.
  if (remote) await page.route('**/api/**', route => ['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())
    ? route.continue() : route.fulfill({status: 403, json: {error: 'Writes disabled in browser verification'}}));
  await page.goto(base);
  await page.locator('[data-menu-action="solo"]').first().click();
  await page.locator('.deckentry').first().waitFor({timeout: 120000});
  receipt.url = page.url();
  receipt.build = await page.evaluate(() => MTG.BUILD_INFO || null);
  if (process.env.EXPECTED_BUILD_REVISION) {
    assert.equal(receipt.build?.revision, process.env.EXPECTED_BUILD_REVISION, 'Browser loaded the requested shipped commit');
    assert.equal(receipt.build?.dirty, false, 'Shipped build identity is clean');
  }
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({width, height: width > 600 ? 1000 : 844});
    await fixture();
    const explanation = page.getByTestId('optional-target-explanation');
    await explanation.waitFor();
    assert.equal(await explanation.textContent(), hint);
    const state = await page.evaluate(() => ({min: _ui.pending.q.min, max: _ui.pending.q.max,
      optional: _ui.pending.q.optionalEffect?.choiceTiming, selected: _ui.pending.sel.length,
      candidates: _ui.pending.q.candidates.map(card => card.iid), iid: __optional.ingester.iid,
      zone: __optional.ingester.zone, stack: _game.stack.length}));
    assert.deepEqual(state, {min: 1, max: 1, optional: 'resolution', selected: 0,
      candidates: [state.iid], iid: state.iid, zone: 'battlefield', stack: 0});
    assert.equal(await page.locator('[data-testid="target-selection"] .pbtn.primary').isDisabled(), true);
    const visible = await explanation.evaluate(el => {
      const r = el.getBoundingClientRect(), body = el.closest('.targetpromptbody').getBoundingClientRect();
      return r.left >= 0 && r.right <= innerWidth && r.top >= body.top && r.bottom <= body.bottom + 1 && r.bottom <= innerHeight;
    });
    assert.ok(visible, `${width}px: the may-effect explanation is visible without scrolling`);
    await page.screenshot({path: `${output}/ingester-target-${width}.png`});
    await page.locator(`.mini[data-iid="${state.iid}"]`).tap();
    await page.locator('[data-testid="target-selection"] .pbtn.primary').tap();
    await page.waitForFunction(() => _ui.pending?.q.type === 'chooseOption' && _ui.pending.q.options.some(option => option.key === 'no'));
    const no = page.locator('.modal button[data-choice-key="no"]');
    await no.waitFor();
    assert.equal(await no.isEnabled(), true);
    await page.screenshot({path: `${output}/ingester-decline-${width}.png`});
    await no.tap();
    await page.waitForFunction(() => __optional.done || __optional.error);
    assert.deepEqual(await page.evaluate(() => ({done: __optional.done, error: __optional.error,
      stacked: __optional.stacked, zone: __optional.ingester.zone, exiled: _ui.me.exile.length,
      power: __optional.ingester.power, toughness: __optional.ingester.toughness, stack: _game.stack.length})),
    {done: true, error: null, stacked: true, zone: 'battlefield', exiled: 0, power: 3, toughness: 3, stack: 0});
    receipt.checks.push(`${width}px: required self-target is explained; the later No touch control declines without exile`);
    console.log(`PASS ${receipt.checks.at(-1)}`);
  }
  assert.deepEqual(receipt.errors, []);
} finally {
  writeFileSync(`${output}/receipt.json`, JSON.stringify(receipt, null, 2));
  await browser.close(); server?.close();
}
