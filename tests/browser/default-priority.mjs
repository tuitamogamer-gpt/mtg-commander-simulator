// Fresh-player defaults must retain end-of-combat sacrifice opportunities.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdirSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import express from 'express';
import {createAccountHandler, MemoryAccountStore} from '../../api/account.js';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = process.env.DEFAULT_PRIORITY_OUTPUT || `${root}output/web-game/default-priority`;
mkdirSync(output, {recursive: true});
const server = process.env.GAME_URL ? null : express()
  .use('/api/account', createAccountHandler({store: new MemoryAccountStore(), limiter: null}))
  .use(express.static(root)).listen(0, '127.0.0.1');
if (server) await once(server, 'listening');
const base = process.env.GAME_URL || `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({headless: true,
  ...(process.env.BROWSER_EXECUTABLE ? {executablePath: process.env.BROWSER_EXECUTABLE} : {})});
const receipt = {target: base, checks: [], errors: []};
let page;
const check = name => {receipt.checks.push(name); console.log(`PASS ${name}`);};

async function load() {
  await page.goto(base);
  await page.locator('[data-menu-action="solo"]').first().click();
  await page.locator('.deckentry').first().waitFor({timeout: 120000});
}

async function fixture({withSacrifice = false} = {}) {
  await page.evaluate(async withSacrifice => {
    const old = document.querySelector('#game');
    old.replaceWith(old.cloneNode(false));
    document.querySelector('#setup').style.display = 'none';
    document.querySelector('#game').style.display = 'flex';
    document.body.classList.add('game-active');
    const ui = new MTG.UI(); // No profile override: exercise production defaults.
    const game = new MTG.Game({seed: 838291, paced: false, onEvent: () => ui.queueRender()});
    const you = game.addPlayer('You', {name: 'Mardu Surge'}, null, false);
    const opponent = game.addPlayer('Opponent', {name: 'Quick Draw'},
      {decide: async (_game, q) => q.type === 'priority' ? {kind: 'pass'} : null}, true);
    ui.game = game; ui.me = you; ui.applySpeed();
    const controller = ui.controllerFor(you), questions = [];
    you.controller = {decide(g, q) {questions.push(q.type); return controller.decide(g, q);}};
    game.turnPlayer = you; game.turnNo = 8; game.phase = 'combat'; game.step = 'damage';
    const put = (name, owner = you, zone = 'battlefield') => {
      const card = new MTG.CardInst(MTG.DEFS[name], owner);
      card.zone = zone; card.ctrl = owner; card.sick = false;
      (zone === 'battlefield' ? game.battlefield : owner[zone]).push(card);
      return card;
    };
    for (const player of [you, opponent]) {
      for (let n = 0; n < 12; n++) put('Forest', player, 'library');
    }
    let token;
    if (withSacrifice) {
      const zurgo = put('Zurgo Stormrender'); zurgo.commander = true; you.commanders = [zurgo];
      put('Viscera Seer');
      await game.makeTokens({name: 'Warrior', cost: '', super: [], types: ['Creature'],
        subtypes: ['Warrior'], power: '1', toughness: '1', colorsOverride: ['R']}, you, {n: 1});
      token = game.creatures(you).find(card => card.isToken);
      token.attacking = opponent; token.tapped = true;
    }
    game.combat = {attackingPlayer: you, attackers: token ? [token] : []};
    game.recalc();
    window._ui = ui; window._game = game;
    window.__defaults = {you, opponent, token, questions, done: false, error: null};
    ui.render();
    void game.endCombatStep(you).then(() => {
      game.phase = 'main2'; game.step = 'main'; __defaults.done = true; ui.render();
    }, error => {__defaults.error = error.stack;});
  }, withSacrifice);
  await page.waitForFunction(() => _ui.pending?.q.type === 'priority' || __defaults.done || __defaults.error);
  assert.equal(await page.evaluate(() => __defaults.error), null);
  assert.equal(await page.evaluate(() => _ui.pending?.q.type), 'priority');
}

async function stopSettings() {
  await page.getByRole('button', {name: 'MENU', exact: true}).click();
  await page.getByRole('tab', {name: /Controls/}).filter({visible: true}).click();
  await page.getByRole('button', {name: /Priority stops/}).click();
}

try {
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    const context = await browser.newContext({viewport: {width, height}, reducedMotion: 'reduce'});
    page = await context.newPage(); page.setDefaultTimeout(20000);
    page.on('pageerror', error => receipt.errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem('mtgOnboardingComplete', '1');
      localStorage.setItem('mtgReducedMotion', '1');
      localStorage.setItem('mtgManaMode', 'auto');
    });
    await load();
    await fixture();
    assert.deepEqual(await page.evaluate(() => ({profile: _ui.prioMode, speed: _ui.speed,
      factor: _game.speedFactor, preference: localStorage.getItem('mtgStopProfile'),
      choices: _ui.pending.q.casts.length + _ui.pending.q.acts.length})),
    {profile: 'full', speed: 'normal', factor: 1.25, preference: null, choices: 0});
    await stopSettings();
    assert.equal(await page.locator('[data-stop-mode="full"]').getAttribute('aria-pressed'), 'true');
    await page.screenshot({path: `${output}/default-settings-${width}.png`});
    await page.getByRole('button', {name: 'Back to game', exact: true}).click();
    await page.evaluate(() => {window.__originalPriority = _ui.pending; _ui.render(); _ui.queueRender();});
    await page.waitForTimeout(350);
    assert.equal(await page.evaluate(() => _ui.pending === __originalPriority &&
      !__defaults.done && _game.phase === 'combat' && _game.step === 'endCombat'), true);
    await page.locator('.promptbar .pbtn.primary').filter({hasText: /^Proceed/}).click();
    await page.waitForFunction(() => __defaults.done);
    assert.equal(await page.evaluate(() => _game.phase), 'main2');
    check(`${width}px fresh Full control selected; empty combat priority waits for explicit Proceed; Normal pacing applied`);

    await fixture({withSacrifice: true});
    await page.locator('.priorityabilities .abilitybtn').filter({hasText: /Viscera Seer/}).click();
    await page.waitForFunction(() => _ui.pending?.q.type === 'chooseCards');
    const tokenId = await page.evaluate(() => __defaults.token.iid);
    await page.locator(`.cardselectionmodal .bigcard[data-iid="${tokenId}"]`).click();
    await page.locator('.cardselectionmodal .pbtn.primary').click();
    let scries = 0, priorityStops = 0;
    for (let n = 0; n < 12; n++) {
      await page.waitForFunction(() => !!_ui.pending || __defaults.done || __defaults.error);
      const state = await page.evaluate(() => ({done: __defaults.done, error: __defaults.error, type: _ui.pending?.q.type}));
      assert.equal(state.error, null);
      if (state.done) break;
      if (state.type === 'scry') {
        scries++;
        await page.screenshot({path: `${output}/zurgo-seer-scry-${width}.png`});
        await page.locator('.scrydecision .pbtn.primary').click();
      } else {
        assert.equal(state.type, 'priority'); priorityStops++;
        await page.locator('.promptbar .pbtn.primary').filter({hasText: /^Proceed/}).click();
      }
    }
    assert.deepEqual(await page.evaluate(() => ({done: __defaults.done, error: __defaults.error,
      phase: _game.phase, hand: __defaults.you.hand.length, opponentLife: __defaults.opponent.life,
      tokenZone: __defaults.token.zone, stack: _game.stack.length})),
    {done: true, error: null, phase: 'main2', hand: 1, opponentLife: 40, tokenZone: 'ceased', stack: 0});
    assert.equal(scries, 1); assert.ok(priorityStops >= 3);
    check(`${width}px end-of-combat Seer activation sacrifices an attacking token; Zurgo draws one and Seer scries one`);

    await stopSettings();
    await page.locator('[data-stop-mode="off"]').click();
    assert.equal(await page.evaluate(() => localStorage.getItem('mtgStopProfile')), 'off');
    await page.reload();
    await page.locator('[data-menu-action="solo"]').first().click();
    await page.locator('.deckentry').first().waitFor({timeout: 120000});
    assert.equal(await page.evaluate(() => new MTG.UI().prioMode), 'off');
    check(`${width}px explicit priority choice survives reload`);
    await context.close();
  }
  assert.deepEqual(receipt.errors, []);
} catch (error) {
  receipt.failure = error.stack;
  if (page && !page.isClosed()) await page.screenshot({path: `${output}/failure.png`});
  throw error;
} finally {
  writeFileSync(`${output}/receipt.json`, JSON.stringify(receipt, null, 2));
  await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
