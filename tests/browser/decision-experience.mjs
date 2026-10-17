// Native layout and keyboard regressions for decision and inspection surfaces.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROMIUM_PATH=/path/to/chromium node tests/browser/decision-experience.mjs
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const out = process.env.GAME_QA_OUTPUT || `${root}output/playwright/decision-experience`;
mkdirSync(out, { recursive: true });
const app = express();
app.get('/api/account', (_req, res) => res.json({ user: null, profile: null, save: null }));
app.use(express.static(root));
const server = process.env.GAME_URL ? null : app.listen(0, '127.0.0.1');
if (server) await once(server, 'listening');
const base = process.env.GAME_URL || `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
await context.addInitScript(() => {
  localStorage.setItem('mtgOnboardingComplete', '1'); localStorage.setItem('mtgReducedMotion', '1');
});
const page = await context.newPage(), checks = [], errors = [];
page.setDefaultTimeout(15000);
page.on('pageerror', error => errors.push(error.message));
const check = name => { checks.push(name); console.log(`PASS ${name}`); };
const shot = async name => page.screenshot({ path: `${out}/${name}.png`, animations: 'disabled' });

async function fixture() {
  await page.evaluate(() => {
    document.querySelector('#setup').style.display = 'none';
    const old = document.querySelector('#game'); old.replaceWith(old.cloneNode(false));
    document.querySelector('#game').style.display = 'flex'; document.body.classList.add('game-active');
    const ui = window._ui = new MTG.UI(), g = window._game = new MTG.Game({ seed: 447, paced: false, onEvent: () => {} });
    const me = g.addPlayer('You', { name: 'Mardu Surge' }, null, false), rival = g.addPlayer('AI Raven', { name: 'Primal Power' }, null, true);
    ui.game = g; ui.me = me; me.controller = ui.controllerFor(me);
    g.turnPlayer = me; g.turnNo = 8; g.phase = 'main1'; g.step = 'main'; g.speedFactor = 0;
    const put = (name, owner, zone) => {
      const card = new MTG.CardInst(MTG.DEFS[name], owner); card.zone = zone; card.sick = false;
      (zone === 'battlefield' ? g.battlefield : owner[zone]).push(card); return card;
    };
    for (const [player, name] of [[me, 'Zurgo Stormrender'], [rival, 'Etali, Primal Storm']]) {
      player.commander = put(name, player, 'command'); player.commander.commander = true;
      put('Plains', player, 'battlefield'); put('Sol Ring', player, 'battlefield');
    }
    ['Swords to Plowshares', 'Arcane Signet', 'Plains', 'Aetherize', 'Command Tower', 'Lightning Bolt', 'Sol Ring'].forEach(name => put(name, me, 'hand'));
    ['Sol Ring', 'Colossal Dreadmaw', 'Mountain', 'Aetherize', 'Command Tower'].forEach(name => put(name, me, 'graveyard'));
    window.question = q => {
      ui.clearInspectionViews(); ui.pendings = []; window.answers = 0; window.answer = undefined;
      me.controller.decide(g, { player: me, ...q }).then(value => { window.answers++; window.answer = value; });
      window.heldDecision = ui.pending;
    };
    g.recalc(); ui.render();
  });
}

async function expectPending(value) {
  assert.deepEqual(await page.evaluate(() => ({ same: _ui.pending === heldDecision, value: _ui.pending?.xVal, answers })),
    { same: true, value, answers: 0 });
}

async function expectOneModal() {
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')]
    .filter(node => node.getClientRects().length && !node.closest('[inert], [aria-hidden="true"]')).length), 1);
}

async function checkRows(selector, name, width) {
  await page.waitForSelector(`${selector} .bigcard`);
  await page.locator(`${selector} img`).evaluateAll(async nodes => {
    await Promise.race([Promise.all(nodes.map(image => image.decode().catch(() => {}))), new Promise(resolve => setTimeout(resolve, 2000))]);
  });
  const layout = await page.locator(selector).evaluate(grid => {
    const cards = [...grid.querySelectorAll('.bigcard')].map(node => {
      const rect = node.getBoundingClientRect(); return { name: node.dataset.cardName, x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom };
    });
    const overlaps = [];
    for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
      const a = cards[i], b = cards[j];
      if (Math.min(a.right, b.right) > Math.max(a.x, b.x) + 1 && Math.min(a.bottom, b.bottom) > Math.max(a.y, b.y) + 1) overlaps.push([a.name, b.name]);
    }
    return { overlaps, count: cards.length, overflow: document.documentElement.scrollWidth > innerWidth + 1 };
  });
  assert.equal(layout.count, name === 'zone' ? 5 : 7);
  assert.deepEqual(layout.overlaps, [], `${width}px ${name} cards must not overlap`);
  assert.equal(layout.overflow, false);
  await shot(`${name}-${width}-top`);
  await page.locator(`${selector} .bigcard`).last().focus();
  assert.equal(await page.locator(selector).evaluate(grid => {
    grid.scrollTop = grid.scrollHeight;
    const card = grid.querySelector('.bigcard:last-child').getBoundingClientRect(), rect = grid.getBoundingClientRect();
    return card.bottom <= rect.bottom + 1 && card.bottom > rect.top;
  }), true, `${width}px ${name}: final card remains reachable by scrolling`);
  await shot(`${name}-${width}-bottom`);
  check(`${name}: all cards retain their height in a scrollable grid at ${width}px`);
}

try {
  await page.goto(base, { waitUntil: 'networkidle', timeout: 60000 });
  await page.locator('[data-menu-action="solo"]').first().click();
  await page.waitForSelector('.deckentry:not([hidden])', { timeout: 60000 });
  for (const [width, height] of [[1440, 1000], [390, 844], [360, 800]]) {
    await page.setViewportSize({ width, height }); await fixture();
    await page.evaluate(() => { _ui.zoneBrowse = { player: _ui.me, zone: 'graveyard' }; _ui.render(); });
    await checkRows('.zonebrowsergrid', 'zone', width);
    await page.evaluate(() => question({ type: 'chooseCards', min: 1, max: 2, from: _ui.me.hand, prompt: 'Choose up to two cards to discard' }));
    await checkRows('.cardselectionmodal .cardgrid', 'card-choice', width);
    await page.evaluate(() => question({ type: 'scry', cards: _ui.me.hand }));
    await checkRows('.scrydecision .cardgrid', 'scry', width);

    await page.evaluate(() => {
      question({ type: 'chooseX', min: 0, max: 40, suggested: 3 });
      _ui.sheet = { card: _ui.me.hand[0] }; _ui.render();
    });
    await page.locator('.cardinspectionclose').focus(); await page.keyboard.press('ArrowRight');
    await expectPending(3); await expectOneModal();
    await page.keyboard.press('?'); await page.locator('.helpguide').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.cardinspection').count(), 0);
    await expectPending(3); await expectOneModal();
    await page.getByRole('button', { name: 'Close help', exact: true }).focus();
    await page.keyboard.press('ArrowRight'); await expectPending(3);
    await page.keyboard.press('Escape'); await page.locator('.xinput').waitFor({ state: 'visible' });
    await expectPending(3); await expectOneModal();

    await page.evaluate(() => { _ui.quickMenuOpen = true; _ui.render(); });
    await page.locator('.settingsdone').focus(); await page.keyboard.press('ArrowLeft'); await expectPending(3);
    await page.keyboard.press('?'); await page.locator('.helpguide').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.experiencesettings').count(), 0);
    await expectPending(3); await expectOneModal(); await shot(`help-over-pending-x-${width}`);
    await page.keyboard.press('Escape'); await page.locator('[data-decision-type="chooseX"]').evaluate(node => node.focus());
    await page.keyboard.press('ArrowRight'); await expectPending(4);
    await page.locator('[data-decision-type="chooseX"] .pbtn.primary').click();
    await page.waitForFunction(() => window.answers === 1); assert.equal(await page.evaluate(() => window.answer), 4);
    check(`inspection/help/menu own keyboard input and preserve the exact X decision at ${width}px`);
  }
  assert.deepEqual(errors, []);
} finally {
  writeFileSync(`${out}/report.json`, JSON.stringify({ base, checks, errors }, null, 2));
  await browser.close(); if (server) server.close();
}
