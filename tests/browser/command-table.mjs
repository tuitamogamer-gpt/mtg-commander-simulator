// Rendering fixtures exercise the actual UI decision promises; the separate
// player-gameplay suite covers a complete game without fixture answers.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createAccountHandler, MemoryAccountStore } from '../../api/account.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = `${root}output/web-game/command-table`;
mkdirSync(output, { recursive: true });
const server = express().use('/api/account', createAccountHandler({ store: new MemoryAccountStore(), limiter: null }))
  .use(express.static(root)).listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1024 }, reducedMotion: 'reduce' });
const errors = [], failedRequests = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => { if (response.status() >= 400) failedRequests.push({ status: response.status(), url: response.url() }); });
await page.addInitScript(() => {
  localStorage.setItem('mtgOnboardingComplete', '1');
  localStorage.setItem('mtgReducedMotion', '1');
});
const check = message => { checks.push(message); console.log(`PASS ${message}`); };
const shot = async name => {
  await page.mouse.move(0, 0);
  await page.waitForFunction(() => [...document.querySelectorAll('.ct-portrait, .ct-review-art[src]')].every(image => image.complete && image.naturalWidth > 0));
  await page.screenshot({ path: `${output}/${name}.png` });
};
async function openSetup() {
  await page.goto(base);
  await page.locator('[data-menu-action="solo"]').first().click();
  await page.waitForSelector('.deckentry');
}
async function fixture() {
  await openSetup();
  await page.evaluate(() => {
    const oldRoot = document.querySelector('#game');
    oldRoot.replaceWith(oldRoot.cloneNode(false));
    document.querySelector('#setup').style.display = 'none';
    document.body.classList.add('game-active');
    const game = new MTG.Game({ seed: 90526, paced: false });
    const quiet = { decide: async () => [] };
    const deckNames = ['Quick Draw', 'Elven Council', 'Squirreled Away', 'Temur Roar'];
    const players = ['You', 'AI Dragon', 'AI Wolf', 'AI Raven'].map((name, index) => game.addPlayer(name, { name: deckNames[index] }, quiet, index > 0));
    const you = players[0], ui = new MTG.UI();
    ui.game = game; ui.me = you; ui.commandTableView = 'table';
    you.controller = ui.controllerFor(you);
    game.turnPlayer = you; game.turnNo = 8; game.phase = 'main1'; game.step = 'main';
    window._game = game; window._ui = ui;
    const put = (name, owner, zone = 'battlefield') => {
      assertDefinition(name);
      const card = new MTG.CardInst(MTG.DEFS[name], owner);
      card.ctrl = owner; card.zone = zone; card.sick = false;
      if (zone === 'battlefield') game.battlefield.push(card);
      else if (owner[zone]) owner[zone].push(card);
      return card;
    };
    function assertDefinition(name) { if (!MTG.DEFS[name]) throw new Error(`Missing fixture card: ${name}`); }
    for (const [index, player] of players.entries()) {
      const commander = put(MTG.DECKS[deckNames[index]].commander, player, 'command');
      player.commanders = [commander]; player.life = [32, 36, 28, 24][index];
      const creature = put('Riders of Gavony', player);
      creature.counters['+1/+1'] = index + 1;
      put('Humble Defector', player).tapped = index === 2;
      put('Stormcatch Mentor', player);
      put('Sol Ring', player);
      for (const name of ['Forest', 'Island', 'Mountain', 'Island', 'Forest', 'Mountain']) put(name, player);
      for (let count = 0; count < index + 2; count++) put('Forest', player, 'graveyard');
    }
    for (const name of ['Counterspell', 'Beast Within', 'Swords to Plowshares', 'Sol Ring', 'Forest', 'Island', 'Mountain']) put(name, you, 'hand');
    you.pool.U = you.pool.G = you.pool.W = 3; you.pool.C = 6;
    game.recalc();
    window.__ctPut = put;
    window.__ctAnswered = null;
    void you.controller.decide(game, { type: 'main', player: you, phase: game.phase, casts: game.castableList(you), acts: [], lands: you.hand.filter(card => card.is('Land')) })
      .then(answer => { window.__ctAnswered = answer; });
    window.__ctMain = ui.pending;
    ui.render();
  });
}
async function assertPrimaryVisible(selector) {
  const control = page.locator(selector).first();
  const metrics = await control.evaluate(button => {
    const r = button.getBoundingClientRect();
    const parent = button.closest('.promptbar, .actionstage').getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height,
      parentBottom: parent.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight, clickable: hit === button || button.contains(hit) };
  });
  assert.ok(metrics.width >= 44 && metrics.height >= 42 && metrics.x >= 0 && metrics.right <= metrics.viewportWidth + 1 && metrics.bottom <= metrics.viewportHeight && metrics.bottom <= metrics.parentBottom + 1 && metrics.clickable,
    `Primary action must remain visible and reachable: ${JSON.stringify(metrics)}`);
}

try {
  await openSetup();
  await page.locator('.decksearch input').fill('Quick Draw');
  await page.locator('.deckcard:visible').click();
  await page.locator('.deckspotlightcontinue').click();
  for (const [index, name] of ['Elven Council', 'Squirreled Away', 'Temur Roar'].entries()) {
    await page.locator('.botfields .deckselect').nth(index).selectOption(name);
  }
  await page.locator('.setupnext').click();
  assert.equal(await page.locator('.ct-review-seat').count(), 4);
  assert.equal(await page.locator('.ct-review-art[src]').count(), 4);
  for (const [width, height] of [[1440, 1024], [1280, 720], [390, 844]]) {
    await page.setViewportSize({ width, height });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await shot(`review-${width}`);
  }
  await page.getByRole('button', { name: 'Change AI Wolf deck', exact: true }).click();
  assert.equal(await page.locator('#setup').getAttribute('data-setup-stage'), 'pod');
  assert.equal(await page.locator('.botfields .deckselect').nth(1).inputValue(), 'Squirreled Away');
  check('Four official commander portraits; changing a seat preserves selected decks');

  await page.setViewportSize({ width: 1440, height: 1024 });
  await fixture();
  await shot('desktop-table');
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('.opprow')].every(row => {
    const player = _game.players.find(player => String(player.idx) === row.dataset.playerId);
    return row.querySelector('.ct-portrait').getAttribute('src') === MTG.cardImageURL(player.commanders[0].name, 'art');
  })), true, 'Portraits come from official card image resolver');
  await page.getByRole('button', { name: 'Focus', exact: true }).click();
  await page.locator('[data-focus-player="2"]').click();
  assert.equal(await page.locator('.opprow:visible').count(), 1);
  assert.equal(await page.locator('.opprow:visible').getAttribute('data-player-id'), '2');
  assert.equal(await page.evaluate(() => _ui.pending === window.__ctMain && window.__ctAnswered === null), true);
  assert.equal(await page.evaluate(() => localStorage.getItem('mtgCommandTableView')), 'focus');
  await page.locator('.opprow:visible .mini').first().click();
  await page.locator('.sheet').getByRole('button', { name: 'Close', exact: true }).click();
  assert.equal(await page.evaluate(() => _ui.pending === window.__ctMain), true);
  await shot('desktop-focus');

  const targetId = await page.evaluate(() => {
    _ui.collapsed = new Set([1, 3]);
    const candidates = _game.bf().filter(card => card.ctrl !== _ui.me && card.is('Creature'));
    window.__ctTargetAnswer = null;
    void _ui.me.controller.decide(_game, { type: 'chooseTargets', player: _ui.me, candidates, min: 1, max: 1, message: 'Choose a creature' })
      .then(answer => { window.__ctTargetAnswer = answer.map(card => card.iid); });
    return candidates.find(card => card.ctrl.idx === 3).iid;
  });
  assert.equal(await page.locator('.opprow:visible').count(), 3);
  await page.locator(`.mini[data-iid="${targetId}"]`).click();
  const confirm = page.locator('.promptbar .pbtn.primary:visible:not(:disabled)');
  if (await confirm.count() && await page.evaluate(() => !window.__ctTargetAnswer)) await confirm.click();
  await page.waitForFunction(() => !!window.__ctTargetAnswer);
  assert.deepEqual(await page.evaluate(() => window.__ctTargetAnswer), [targetId]);
  check('Focus and card inspection preserve decisions; all targetable seats expand and accept a real target choice');

  await page.getByRole('button', { name: 'Table', exact: true }).click();
  await page.evaluate(() => {
    const spell = __ctPut('Beast Within', _game.players[1], 'stack');
    const target = _game.bf().find(card => card.ctrl === _ui.me && card.name === 'Sol Ring');
    _game.stack.push({ kind: 'spell', name: spell.name, ctrl: _game.players[1], card: spell, targets: [[target]], castOpts: {} });
    window.__ctPriorityAnswer = null;
    void _ui.me.controller.decide(_game, { type: 'priority', player: _ui.me, casts: _game.castableList(_ui.me), acts: [] })
      .then(answer => { window.__ctPriorityAnswer = answer; });
  });
  for (const [width, height] of [[1440, 1024], [1280, 620], [390, 844], [320, 568]]) {
    await page.setViewportSize({ width, height });
    if (width < 901) {
      for (const id of [1, 3, 2]) {
        await page.locator(`[data-focus-player="${id}"]`).click();
        assert.equal(await page.locator('.opprow:visible').count(), 1);
        assert.equal(await page.locator('.opprow:visible').getAttribute('data-player-id'), String(id));
      }
      assert.match(await page.locator('.ct-response-summary').innerText(), /Beast Within.*Sol Ring/);
      const tabs = await page.locator('.mobileviewtabs').boundingBox();
      assert.ok(tabs.y + tabs.height <= height + 1);
    }
    await assertPrimaryVisible('.actionstage .pbtn.primary');
    await shot(`response-${width}`);
  }
  await page.locator('.actionstage .pbtn.primary').click();
  await page.waitForFunction(() => !!window.__ctPriorityAnswer);
  assert.equal(await page.evaluate(() => window.__ctPriorityAnswer.kind), 'pass');
  assert.equal(await page.evaluate(() => _ui.pending === window.__ctMain), true);
  check('Stack review remains a hard pause with a reachable Proceed action on desktop, short laptop and phones');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    _game.stack.length = 0;
    for (let count = 0; count < 11; count++) __ctPut('Forest', _ui.me, 'hand');
    for (let count = 0; count < 12; count++) __ctPut('Riders of Gavony', _ui.me);
    _game.recalc(); _ui.render();
  });
  await page.locator('.hand').evaluate(element => { element.scrollLeft = 380; });
  await page.locator('.myboard').evaluate(element => { element.scrollTop = 180; });
  const before = await page.evaluate(() => [document.querySelector('.hand').scrollLeft, document.querySelector('.myboard').scrollTop]);
  await page.evaluate(() => _ui.render());
  assert.deepEqual(await page.evaluate(() => [document.querySelector('.hand').scrollLeft, document.querySelector('.myboard').scrollTop]), before);
  await assertPrimaryVisible('.promptbar .pbtn.primary');
  const standardSize = await page.locator('.hcard').first().boundingBox();
  await page.evaluate(() => { _ui.handSize = 'large'; _ui.render(); });
  const largerSize = await page.locator('.hcard').first().boundingBox();
  assert.ok(largerSize.width > standardSize.width && largerSize.height > standardSize.height, 'Larger-card preference changes actual dimensions');
  await shot('mobile-crowded');
  const hand = await page.locator('.hand').boundingBox();
  assert.ok(hand.width > 200 && hand.y + hand.height <= 844);
  check('Crowded battlefield and 18-card hand scroll at readable sizes; positions survive rerender');
  assert.deepEqual(errors, []);
  assert.deepEqual(failedRequests, []);
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` });
  throw error;
} finally {
  writeFileSync(`${output}/report.json`, JSON.stringify({ checks, errors, failedRequests }, null, 2));
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
