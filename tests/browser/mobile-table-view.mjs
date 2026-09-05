// PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node tests/browser/mobile-table-view.mjs
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createAccountHandler, MemoryAccountStore } from '../../api/account.js';

const playwright = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browserEngine = process.env.BROWSER_ENGINE || 'chromium';
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = process.env.MOBILE_TABLE_QA_OUTPUT || `${root}output/web-game/mobile-table-view`;
mkdirSync(output, { recursive: true });
const server = process.env.GAME_URL ? null : express()
  .use('/api/account', createAccountHandler({ store: new MemoryAccountStore(), limiter: null }))
  .use(express.static(root)).listen(0, '127.0.0.1');
if (server) await once(server, 'listening');
const base = process.env.GAME_URL || `http://127.0.0.1:${server.address().port}`;
const browser = await playwright[browserEngine].launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', hasTouch: true });
const errors = [], failedRequests = [], checks = [], layouts = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('response', response => { if (response.status() >= 400) failedRequests.push({ status: response.status(), url: response.url() }); });
page.on('requestfailed', request => failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
await page.addInitScript(() => {
  localStorage.setItem('mtgOnboardingComplete', '1');
  localStorage.setItem('mtgReducedMotion', '1');
});
const check = name => { checks.push(name); console.log(`PASS ${name}`); };
const screenshot = async name => {
  await page.mouse.move(0, 0);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${output}/${name}.png` });
};
async function switchView(name) {
  await page.getByRole('navigation', { name: 'Arena view' }).getByRole('button', { name: new RegExp(`^${name}`, 'i') }).click();
  await page.waitForFunction(view => document.querySelector('#game').dataset.mobileView === view, name.toLowerCase());
}
async function captureLayout(label) {
  const layout = await page.evaluate(() => {
    const root = document.querySelector('#game');
    const rect = selector => {
      const node = root.querySelector(selector), r = node?.getBoundingClientRect();
      return node && { x: r.x, y: r.y, width: r.width, height: r.height, display: getComputedStyle(node).display };
    };
    return {
      width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
      view: root.dataset.mobileView, columns: getComputedStyle(root).gridTemplateColumns,
      topbar: rect('.topbar'), turnTitle: rect('.phase'), topActions: rect('.topbtns'), tabs: rect('.mobileviewtabs'), opponents: rect('.oppsouter'),
      prompt: rect('.promptbar'), hand: rect('.handwrap'), board: rect('.myboard'), sidebar: rect('.sidebar'),
      decision: window._ui.pending?.q.type,
    };
  });
  layouts.push({ label, ...layout });
  return layout;
}
function assertUsable(layout, selector, minimumWidth = layout.width - 36) {
  const rect = layout[selector];
  assert.ok(rect && rect.display !== 'none' && rect.width >= minimumWidth && rect.height > 0,
    `${layout.view} ${selector} must have usable width: ${JSON.stringify(layout)}`);
  assert.ok(rect.x >= -1 && rect.x + rect.width <= layout.width + 1,
    `${layout.view} ${selector} must fit horizontally: ${JSON.stringify(rect)}`);
}
async function assertPhoneLayout(label) {
  const layout = await captureLayout(label);
  assert.equal(layout.columns.split(' ').length, 1, `Only one explicit arena column: ${JSON.stringify(layout)}`);
  assert.ok(layout.scrollWidth <= layout.width + 1, 'No horizontal page overflow');
  assert.ok(layout.turnTitle.x + layout.turnTitle.width <= layout.topActions.x - 3,
    `Turn title must not overlap Find or other controls: ${JSON.stringify(layout)}`);
  for (const button of await page.locator('.topbtns .hudaction').evaluateAll(nodes => nodes.map(node => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height }))))
    assert.ok(button.width >= 44 && button.height >= 44, 'Top actions retain their touch targets');
  for (const selector of ['topbar', 'tabs', 'prompt']) assertUsable(layout, selector);
  assert.ok(layout.tabs.y + layout.tabs.height <= layout.height, 'Arena tabs remain on screen');
  assert.ok(layout.prompt.y + layout.prompt.height <= layout.height + 1, `Prompt remains on screen: ${JSON.stringify(layout)}`);
  if (layout.view === 'mine') {
    assertUsable(layout, 'board');
    assertUsable(layout, 'hand');
    assert.ok(layout.hand.y + layout.hand.height <= layout.height + 1, `Hand remains on screen: ${JSON.stringify(layout)}`);
  } else {
    assert.equal(layout.hand.display, 'none', `${layout.view} hides the hand without an implicit grid area`);
    assertUsable(layout, layout.view === 'table' ? 'opponents' : 'sidebar');
  }
  return layout;
}
async function startGame() {
  await page.goto(`${base}/?smokeDeck=Quick%20Draw&seed=11081`);
  await page.waitForFunction(() => window._ui?.pending?.q.type === 'mulligan');
  await page.locator('.modal .pbtn.primary').click();
  await page.evaluate(() => { _game.speedFactor = 0; });
  for (let i = 0; i < 150; i++) {
    if (await page.evaluate(() => _ui.pending?.q.type === 'main')) return;
    const proceed = page.locator('.actionstage .pbtn.primary:visible, .reveal .pbtn.primary:visible, .modal .pbtn.primary:visible');
    if (await proceed.count()) await proceed.first().click();
    else await page.waitForTimeout(100);
  }
  throw new Error('Human main phase did not appear');
}

// Dense public boards and hand-size extremes are deterministic rendering
// fixtures; navigation and card inspection still use the ordinary UI handlers.
async function installFixture(handMode = 'normal') {
  // Isolate from a real game's queued animations/account-save renders.
  await page.goto(base);
  await page.locator('[data-menu-action="solo"]').first().click();
  await page.waitForSelector('.deckentry');
  await page.evaluate(mode => {
    const oldRoot = document.querySelector('#game');
    oldRoot.replaceWith(oldRoot.cloneNode(false));
    document.body.classList.add('game-active');
    document.querySelector('#setup').style.display = 'none';
    document.querySelector('#game').style.display = 'flex';
    const game = new MTG.Game({ seed: 90526, paced: false });
    const you = game.addPlayer('You', { name: 'Mobile Table Fixture' }, null, false);
    const opponents = ['North', 'East', 'West'].map(name => game.addPlayer(name, { name: 'Public Board Fixture' }, null, true));
    const ui = new MTG.UI();
    ui.me = you;
    ui.game = game;
    ui.handSize = mode === 'large' ? 'large' : 'standard';
    you.controller = ui.controllerFor(you);
    game.turnPlayer = you;
    game.turnNo = 26;
    game.phase = 'main1';
    game.step = 'main';
    window._game = game;
    window._ui = ui;
    const put = (name, owner, zone = 'battlefield') => {
      if (!MTG.DEFS[name]) throw new Error(`Missing mobile fixture definition: ${name}`);
      const card = new MTG.CardInst(MTG.DEFS[name], owner);
      card.ctrl = owner;
      card.zone = zone;
      card.sick = false;
      if (zone === 'battlefield') game.battlefield.push(card);
      else owner[zone].push(card);
      return card;
    };
    for (const player of [you, ...opponents]) {
      for (const name of ['Riders of Gavony', 'Humble Defector', 'Stormcatch Mentor', 'Sol Ring', 'Forest', 'Island', 'Mountain']) put(name, player);
    }
    for (let i = 0; i < (mode === 'empty' ? 0 : mode === 'large' ? 18 : 8); i++) put(['Forest', 'Island', 'Mountain'][i % 3], you, 'hand');
    game.recalc();
    window.__mobileDecisionAnswered = false;
    void you.controller.decide(game, { type: 'main', player: you, phase: game.phase, casts: [], acts: [], lands: you.hand.slice() })
      .then(() => { window.__mobileDecisionAnswered = true; });
    window.__mobilePending = ui.pending;
    window.__mobileHand = you.hand.map(card => card.iid);
    ui.render();
  }, handMode);
}

async function inspectEveryOpponent() {
  for (const playerId of await page.locator('.opprow').evaluateAll(rows => rows.map(row => row.dataset.playerId))) {
    const row = page.locator(`.opprow[data-player-id="${playerId}"]`);
    await row.scrollIntoViewIfNeeded();
    const card = row.locator('.mini[data-cname]').first();
    const name = await card.getAttribute('data-cname');
    await card.click();
    await page.locator('.sheet').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => _ui.sheet.card.name), name, 'Public battlefield card opens the normal card sheet');
    await page.locator('.sheet').getByRole('button', { name: 'Close', exact: true }).click();
    assert.equal(await page.evaluate(() => _ui.pending === window.__mobilePending), true, 'Card inspection preserves pending decision');
  }
}

try {
  await startGame();
  await page.locator('.toastmsg').waitFor({ state: 'detached' });
  assert.equal(await page.locator('.opprow').count(), 3, 'Real game has three opponents');
  await page.evaluate(() => { window.__mobilePending = _ui.pending; window.__mobileHand = _ui.me.hand.map(card => card.iid); });
  await switchView('Mine');
  await switchView('Table');
  await screenshot(process.env.MOBILE_TABLE_BASELINE ? 'baseline-table-390' : 'real-table-390');
  await assertPhoneLayout('real-table-390');
  await switchView('Stack');
  await assertPhoneLayout('real-stack-390');
  await switchView('Mine');
  await assertPhoneLayout('real-mine-390');
  assert.equal(await page.evaluate(() => _ui.pending === window.__mobilePending), true, 'View changes preserve the actual pending decision');
  assert.deepEqual(await page.evaluate(() => _ui.me.hand.map(card => card.iid)), await page.evaluate(() => window.__mobileHand));
  check('Real seeded four-player game: Mine → Table → Stack → Mine, usable layout and pending decision retained');

  const land = await page.evaluate(() => ({ iid: _ui.pending.q.lands[0].iid, name: _ui.pending.q.lands[0].name }));
  await page.locator('.hand .hcard').filter({ has: page.locator('.mname', { hasText: land.name }) }).first().click();
  await page.locator('.sheetacts button').filter({ hasText: 'Play land' }).click();
  await page.waitForFunction(id => _game.bf().some(card => card.ctrl === _ui.me && card.iid === id), land.iid);
  check('Actual land play through the card sheet succeeds after view switching');

  for (const handMode of ['normal', 'empty', 'large']) {
    await installFixture(handMode);
    for (const [width, height] of [[320, 568], [390, 720], [390, 844], [430, 932], [767, 900]]) {
      await page.setViewportSize({ width, height });
      await switchView('Table');
      await assertPhoneLayout(`${handMode}-table-${width}x${height}`);
      if (handMode === 'normal' && [320, 390, 767].includes(width)) {
        await inspectEveryOpponent();
        await screenshot(`table-${width}x${height}`);
      }
      await switchView('Stack');
      await assertPhoneLayout(`${handMode}-stack-${width}x${height}`);
      if (width === 390 && height === 844) await screenshot(`${handMode}-stack-390`);
      await switchView('Mine');
      await assertPhoneLayout(`${handMode}-mine-${width}x${height}`);
      if (width === 390 && height === 844) await screenshot(`${handMode}-mine-390`);
      assert.equal(await page.evaluate(() => _ui.pending === window.__mobilePending && !window.__mobileDecisionAnswered), true);
      assert.deepEqual(await page.evaluate(() => _ui.me.hand.map(card => card.iid)), await page.evaluate(() => window.__mobileHand));
    }
    check(`${handMode} hand: Table, Stack and Mine at 320×568, 390×720/844, 430×932 and 767×900; all decisions retained`);
  }
  check('Every opponent seat is scrollable and public battlefield cards remain clickable');

  await page.setViewportSize({ width: 820, height: 1180 });
  for (const view of ['table', 'stack', 'mine']) {
    await switchView(view);
    await assertPhoneLayout(`tablet-${view}-820`);
  }
  await screenshot('arena-820');
  for (const [width, height] of [[1024, 900], [1440, 1000]]) {
    await page.setViewportSize({ width, height });
    for (const lastMobileView of ['table', 'stack', 'mine']) {
      // Resize from each phone destination so desktop cannot inherit a hidden hand.
      await page.setViewportSize({ width: 390, height: 844 });
      await switchView(lastMobileView);
      await page.setViewportSize({ width, height });
      const layout = await captureLayout(`desktop-from-${lastMobileView}-${width}`);
      assert.equal(layout.tabs.display, 'none', 'Phone navigation is hidden on desktop');
      // Desktop reserves a decision rail beside the battlefield and hand.
      assertUsable(layout, 'topbar', width - 80);
      assertUsable(layout, 'hand', width - 340);
      assertUsable(layout, 'board', width - 360);
      assert.ok(layout.scrollWidth <= width + 1);
    }
    await screenshot(`arena-${width}`);
  }
  check('820px tablet retains focused navigation; 1024/1440px desktop restores hand and battlefield from every phone view');
  assert.deepEqual(errors, []);
  assert.deepEqual(failedRequests, []);
  writeFileSync(`${output}/state.json`, await page.evaluate(() => window.render_game_to_text()));
} catch (error) {
  await screenshot('failure');
  throw error;
} finally {
  writeFileSync(`${output}/report.json`, JSON.stringify({ checks, layouts, errors, failedRequests }, null, 2));
  await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
