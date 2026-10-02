// Public payment receipts use the actual combat review controller promise.
// Engine payment and legality regressions are covered by ghostly-prison.test.mjs.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createAccountHandler, MemoryAccountStore } from '../../api/account.js';

const playwright = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = process.env.GHOSTLY_PRISON_QA_OUTPUT || `${root}output/web-game/ghostly-prison`;
mkdirSync(output, { recursive: true });
const server = process.env.GAME_URL ? null : express().use('/api/account', createAccountHandler({ store: new MemoryAccountStore(), limiter: null }))
  .use(express.static(root)).listen(0, '127.0.0.1');
if (server) await once(server, 'listening');
const base = process.env.GAME_URL || `http://127.0.0.1:${server.address().port}`;
const browser = await playwright.chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1024 }, reducedMotion: 'reduce', hasTouch: true });
const errors = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
  localStorage.setItem('mtgOnboardingComplete', '1');
  localStorage.setItem('mtgReducedMotion', '1');
});
const check = message => { checks.push(message); console.log(`PASS ${message}`); };
const receipt = () => page.locator('.combat-tax-summary:visible');
const confirm = () => page.locator('[data-testid="confirm-combat-battlefield"]');
const expected = 'Attack costs paid: {8} · Ghostly Prison + Windborn Muse';
const shot = async name => {
  await page.waitForFunction(() => [...document.querySelectorAll('#game img')]
    .filter(image => { const rect = image.getBoundingClientRect(); return rect.width && rect.height; })
    .every(image => image.complete && image.naturalWidth > 0));
  await page.screenshot({ path: `${output}/${name}.png` });
};

async function fixture() {
  await page.evaluate(() => {
    const oldRoot = document.querySelector('#game');
    oldRoot.replaceWith(oldRoot.cloneNode(false));
    document.querySelector('#setup').style.display = 'none';
    document.body.classList.add('game-active');
    const game = new MTG.Game({ seed: 90526, paced: false });
    const quiet = { decide: async () => [] };
    const deckNames = ['Quick Draw', 'Elven Council', 'Squirreled Away', 'Temur Roar'];
    const players = ['You', 'AI Dragon', 'AI Wolf', 'AI Raven'].map((name, index) => game.addPlayer(name, { name: deckNames[index] }, quiet, index > 0));
    const you = players[0], opponent = players[1], ui = new MTG.UI();
    ui.game = game; ui.me = you; ui.commandTableView = 'table';
    you.controller = ui.controllerFor(you);
    const put = (name, owner, zone = 'battlefield') => {
      const card = new MTG.CardInst(MTG.DEFS[name], owner);
      card.ctrl = owner; card.zone = zone; card.sick = false;
      if (zone === 'battlefield') game.battlefield.push(card); else owner[zone].push(card);
      return card;
    };
    for (const [index, player] of players.entries()) {
      player.commanders = [put(MTG.DECKS[deckNames[index]].commander, player, 'command')];
      put('Forest', player); put('Humble Defector', player);
    }
    put('Ghostly Prison', you); put('Windborn Muse', you);
    const attackers = ['Llanowar Elves', 'Serra Angel'].map(name => {
      const card = put(name, opponent); card.attacking = you; card.tapped = true; return card;
    });
    game.turnPlayer = opponent; game.turnNo = 7; game.phase = 'combat'; game.step = 'attackers';
    game.combat = { attackers, defenders: new Map() }; game.recalc();
    const attackTaxPayments = attackers.map(card => ({ card, target: you, cost: { generic: 4, x: 0, pips: [] }, sources: ['Ghostly Prison', 'Windborn Muse'] }));
    window._game = game; window._ui = ui; window.__combatAnswer = null;
    void you.controller.decide(game, { type: 'combatReview', attackingPlayer: opponent, attackers, attackTaxPayments })
      .then(answer => { window.__combatAnswer = answer == null ? 'continue' : answer; });
    ui.render();
  });
}

try {
  await page.goto(base);
  await page.locator('[data-menu-action="solo"]').first().click();
  await page.waitForSelector('.deckentry:visible', { timeout: 120000 });
  await fixture();
  assert.equal(await receipt().textContent(), expected);
  await shot('desktop');
  await page.locator('[data-testid="back-to-combat-overlay"]').click();
  assert.equal(await page.locator('.ct-combat-review .combat-tax-summary').textContent(), expected);
  assert.equal(await page.evaluate(() => _ui.renderDecisionModal(_game).querySelector('.combat-tax-summary').textContent), expected, 'Legacy review retains the public payment receipt');
  await shot('desktop-details');
  check('Desktop battlefield, combat details and legacy modal show the total paid attack cost and both sources');

  for (const [name, width, height] of [['portrait', 390, 844], ['landscape', 844, 390]]) {
    await page.setViewportSize({ width, height }); await fixture();
    assert.equal(await page.locator('.ct-mobile-combat-targets .combat-tax-summary').textContent(), expected);
    assert.equal(await receipt().isVisible(), true);
    const rect = await receipt().boundingBox();
    assert.ok(rect && rect.x >= 0 && rect.x + rect.width <= width, 'The receipt fits the phone viewport');
    await page.locator('[data-combat-attacker]').first().tap();
    await page.locator('.sheet').getByRole('button', { name: 'Close', exact: true }).click();
    assert.equal(await receipt().textContent(), expected, 'Inspecting an attacker preserves the receipt');
    assert.equal(await page.evaluate(() => __combatAnswer), null, 'Inspection never acknowledges combat');
    await shot(`mobile-${name}`);
    await confirm().tap(); await page.waitForFunction(() => __combatAnswer === 'continue');
    check(`Mobile ${name} shows payment, preserves inspection and waits for Continue`);
  }

  await page.setViewportSize({ width: 390, height: 844 }); await fixture();
  await page.evaluate(() => {
    for (const payment of _ui.pending.q.attackTaxPayments) {
      payment.cost = { generic: 0, x: 0, pips: [['W', 'PHY']] };
      payment.sources = ["Norn's Annex"];
    }
    _ui.render();
  });
  assert.equal(await receipt().textContent(), "Attack costs paid: {W/P}{W/P} · Norn's Annex", 'Phyrexian receipt preserves the paid cost without claiming a mana or life choice');
  await page.evaluate(() => {
    _ui.pending.q.attackTaxPayments[0].sources = ['Ghostly Prison <img src=x onerror=alert(1)>'];
    _ui.render();
  });
  assert.match(await receipt().textContent(), /<img src=x onerror=alert\(1\)>/);
  assert.equal(await receipt().locator('img').count(), 0, 'Source labels are plain text');
  await page.evaluate(() => { _ui.pending.q.attackTaxPayments = []; _ui.render(); });
  assert.equal(await page.locator('.combat-tax-summary').count(), 0, 'Unpaid combat never displays a payment receipt');
  check('Phyrexian costs stay precise, labels escape HTML and empty receipts stay hidden');
  assert.deepEqual(errors, [], 'No browser errors');
  writeFileSync(`${output}/results.json`, JSON.stringify({ base, checks, errors }, null, 2));
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` });
  writeFileSync(`${output}/failure.json`, JSON.stringify({ message: error.message, errors }, null, 2));
  throw error;
} finally { await browser.close(); if (server) server.close(); }
