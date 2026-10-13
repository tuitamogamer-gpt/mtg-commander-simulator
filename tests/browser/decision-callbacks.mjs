// Real mobile UI callbacks and a native paid Rolling Thunder with three targets.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import express from 'express';
import {createAccountHandler, MemoryAccountStore} from '../../api/account.js';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = process.env.DECISION_OUTPUT || `${root}output/decision-callbacks`;
const baseline = process.env.DECISION_BASELINE_UI;
let server, base = process.env.GAME_URL;
assert.ok(!base || !baseline, 'Production must load actual deployed source');
mkdirSync(output, {recursive: true});
if (!base) {
  const app = express().use('/api/account', createAccountHandler({store: new MemoryAccountStore(), limiter: null}));
  if (baseline) app.get('/src/modules/ui.js', (_req, res) => res.sendFile(baseline));
  server = app.use(express.static(root)).listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
}
const browser = await chromium.launch({headless: true,
  ...(process.env.BROWSER_EXECUTABLE ? {executablePath: process.env.BROWSER_EXECUTABLE} : {}),
});
const page = await browser.newPage({viewport: {width: 390, height: 844}, hasTouch: true, reducedMotion: 'reduce'});
page.setDefaultTimeout(20000);
const errors = [], sources = [], receipt = {target: base, baseline: !!baseline};
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => {
  if (new URL(response.url()).pathname === '/src/modules/ui.js') sources.push(response.body().then(body => ({
    status: response.status(), sha256: createHash('sha256').update(body).digest('hex'),
  })));
});
await page.addInitScript(() => {
  localStorage.setItem('mtgOnboardingComplete', '1');
  localStorage.setItem('mtgReducedMotion', '1');
  localStorage.setItem('mtgManaMode', 'auto');
});
const pending = callback => page.waitForFunction(callback, null, {timeout: 20000});
try {
  await page.goto(base);
  await page.locator('[data-menu-action="solo"]').first().click();
  await page.waitForSelector('.deckentry:visible', {timeout: 120000});
  await pending(() => !!window.MTG?.DEFS?.['Rolling Thunder']);
  await page.evaluate(() => {
    const old = document.querySelector('#game');
    old.replaceWith(old.cloneNode(false));
    document.querySelector('#setup').style.display = 'none';
    document.querySelector('#game').style.display = 'flex';
    document.body.classList.add('game-active');
    const ui = new MTG.UI();
    const game = new MTG.Game({seed: 131027, paced: false, onEvent: () => ui.queueRender()});
    const pass = {decide: async (_game, q) => q.type === 'priority' ? {kind: 'pass'} : null};
    const you = game.addPlayer('You', {name: 'Quick Draw'}, null, false);
    const opponent = game.addPlayer('Opponent', {name: 'Quick Draw'}, pass, true);
    ui.game = game; ui.me = you; ui.prioMode = 'off';
    you.controller = ui.controllerFor(you);
    game.turnPlayer = you; game.turnNo = 7; game.phase = 'main1'; game.step = 'main';
    window._game = game; window._ui = ui;
    const put = (name, zone = 'battlefield', owner = you) => {
      const card = new MTG.CardInst(MTG.DEFS[name], owner);
      card.zone = zone; card.sick = false;
      (zone === 'battlefield' ? game.battlefield : owner[zone]).push(card);
      return card;
    };
    for (const player of [you, opponent]) {
      const card = put(MTG.DECKS['Quick Draw'].commander, 'command', player);
      card.commander = true; player.commanders = [card];
    }
    const lands = ['Mountain', 'Mountain', ...Array(5).fill('Wastes')].map(name => put(name));
    const first = put('Colossal Dreadmaw', 'battlefield', opponent);
    const second = put('Colossal Dreadmaw', 'battlefield', opponent);
    const spell = put('Rolling Thunder', 'hand');
    game.recalc();
    const state = window.__callbacks = {game, ui, you, opponent, lands, first, second, spell,
      status: 'pending', error: null, allocations: [], options: [], modes: []};
    const decide = you.controller.decide.bind(you.controller);
    you.controller.decide = async (game, q) => {
      const value = await decide(game, q);
      if (q.allocation) state.allocations.push({index: q.allocation.index, value});
      return value;
    };
    ui.render();
    void game.castSpell(you, spell, {from: 'hand'}).then(value => {
      state.status = 'resolved'; state.castValue = value;
    }, error => {state.status = 'rejected'; state.error = error.message;});
  });
  await pending(() => _ui.pending?.q.type === 'chooseX' && !_ui.pending.q.allocation);
  // Set X using the actual current UI step controls, then confirm it.
  await page.evaluate(() => {
    const plus = [...document.querySelectorAll('.xrow button')].find(button => button.textContent === '+');
    while (_ui.pending.xVal < 5) document.querySelector('.xrow button:last-child').click();
    if (!plus) throw new Error('Missing native X step control');
  });
  await page.locator('.overlay .modal .pbtn.primary').click();
  await pending(() => _ui.pending?.q.type === 'chooseTargets');
  const ids = await page.evaluate(() => [__callbacks.first.iid, __callbacks.second.iid, __callbacks.opponent.idx]);
  await page.locator(`.ct-seat[data-focus-player="${ids[2]}"]`).click();
  await page.locator(`.mini.targetable[data-iid="${ids[0]}"]`).click();
  await page.locator(`.mini.targetable[data-iid="${ids[1]}"]`).click();
  await page.locator(`.opprow[data-player-id="${ids[2]}"] .opphead`).click({position: {x: 60, y: 20}});
  assert.equal(await page.evaluate(() => _ui.pending.sel.length), 3);
  await page.locator('[data-testid="target-selection"] .targetpromptactions .primary').click();
  await pending(() => _ui.pending?.q.allocation?.index === 0);
  await page.evaluate(() => {
    const control = document.querySelector('[data-testid="damage-allocation"] .damageconfirm');
    __callbacks.oldAllocation = {control, callback: control.onclick, entry: _ui.pending};
  });
  await page.locator('[data-testid="damage-allocation"] .damageconfirm').click();
  await pending(() => _ui.pending?.q.allocation?.index === 1);
  await page.evaluate(() => {__callbacks.secondEntry = _ui.pending; __callbacks.oldAllocation.callback();});
  // Await a browser task and the native decision continuation without answering it.
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));
  receipt.staleAllocation = await page.evaluate(() => ({
    samePending: _ui.pending === __callbacks.secondEntry,
    oldConnected: __callbacks.oldAllocation.control.isConnected,
    index: _ui.pending?.q.allocation?.index ?? null,
    allocations: __callbacks.allocations.slice(),
  }));
  assert.deepEqual(receipt.staleAllocation, {samePending: true, oldConnected: false, index: 1,
    allocations: [{index: 0, value: 1}]});
  await page.locator('.damagecontrols button:last-child').click();
  await page.locator('.damagecontrols button:last-child').click();
  await page.locator('[data-testid="damage-allocation"] .damageconfirm').click();
  await pending(() => _ui.pending?.q.allocation?.index === 2);
  await page.locator('[data-testid="damage-allocation"] .damageconfirm').click();
  await pending(() => __callbacks.status !== 'pending');
  receipt.rollingThunder = await page.evaluate(() => ({status: __callbacks.status, error: __callbacks.error,
    castValue: __callbacks.castValue, allocations: __callbacks.allocations,
    damage: [__callbacks.first.damage, __callbacks.second.damage], opponentLife: __callbacks.opponent.life,
    tappedLands: __callbacks.lands.filter(card => card.tapped).length, manaSpent: __callbacks.spell.castMeta.manaSpent,
    spellZone: __callbacks.spell.zone, pending: _ui.pendings.length, renderError: _ui.renderError?.message ?? null}));
  assert.deepEqual(receipt.rollingThunder, {status: 'resolved', error: null, castValue: true,
    allocations: [{index: 0, value: 1}, {index: 1, value: 3}, {index: 2, value: 1}], damage: [1, 3],
    opponentLife: 39, tappedLands: 7, manaSpent: 7, spellZone: 'graveyard', pending: 0, renderError: null});

  await page.evaluate(() => {
    void __callbacks.you.controller.decide(_game, {type: 'chooseOption', prompt: 'First option',
      options: [{key: 'first', label: 'First'}]}).then(value => __callbacks.options.push(value));
  });
  await pending(() => _ui.pending?.q.prompt === 'First option');
  await page.evaluate(() => {__callbacks.oldOption = document.querySelector('[data-choice-key="first"]').onclick;});
  await page.locator('[data-choice-key="first"]').click();
  await pending(() => __callbacks.options.length === 1);
  await page.evaluate(() => {
    void __callbacks.you.controller.decide(_game, {type: 'chooseOption', prompt: 'Second option',
      options: [{key: 'second', label: 'Second'}]}).then(value => __callbacks.options.push(value));
    __callbacks.nextOption = _ui.pending;
    __callbacks.oldOption();
  });
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));
  assert.equal(await page.evaluate(() => _ui.pending === __callbacks.nextOption && __callbacks.options.length === 1), true);
  // The live current control remains keyboard accessible.
  await page.locator('[data-choice-key="second"]').focus();
  await page.keyboard.press('Enter');
  await pending(() => __callbacks.options.length === 2);
  receipt.options = await page.evaluate(() => __callbacks.options.slice());
  assert.deepEqual(receipt.options, ['first', 'second']);

  await page.evaluate(() => {
    void __callbacks.you.controller.decide(_game, {type: 'chooseMulti', prompt: 'First modes', min: 1, max: 2,
      options: [{key: 'draw', label: 'Draw a card'}]}).then(value => __callbacks.modes.push(value));
  });
  await pending(() => _ui.pending?.q.prompt === 'First modes');
  await page.evaluate(() => {
    __callbacks.oldPick = [...document.querySelectorAll('.modal button')].find(button => button.textContent === 'Draw a card').onclick;
  });
  await page.getByRole('button', {name: 'Draw a card', exact: true}).click();
  await page.evaluate(() => {__callbacks.oldModesConfirm = document.querySelector('.modal .primary').onclick;});
  await page.locator('.modal .primary').click();
  await pending(() => __callbacks.modes.length === 1);
  await page.evaluate(() => {
    void __callbacks.you.controller.decide(_game, {type: 'chooseMulti', prompt: 'Second modes', min: 1, max: 2,
      options: [{key: 'bounce', label: 'Return a creature'}]}).then(value => __callbacks.modes.push(value));
  });
  await page.getByRole('button', {name: 'Return a creature', exact: true}).click();
  await page.evaluate(() => {
    __callbacks.nextModes = _ui.pending;
    __callbacks.oldPick(); __callbacks.oldModesConfirm();
  });
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));
  assert.equal(await page.evaluate(() => _ui.pending === __callbacks.nextModes && __callbacks.modes.length === 1 &&
    _ui.pending.sel.join(',') === 'bounce'), true);
  await page.locator('.modal .primary').click();
  await pending(() => __callbacks.modes.length === 2);
  receipt.modes = await page.evaluate(() => __callbacks.modes.slice());
  assert.deepEqual(receipt.modes, [['draw'], ['bounce']]);
  assert.deepEqual(errors, []);
  const loaded = await Promise.all(sources);
  if (process.env.GAME_URL) assert.ok(loaded.some(row => row.status === 200 && row.sha256 ===
    createHash('sha256').update(readFileSync(`${root}src/modules/ui.js`)).digest('hex')), 'Deployed UI matches tested source');
  await page.screenshot({path: `${output}/completed.png`, animations: 'disabled', timeout: 15000});
  writeFileSync(`${output}/result.json`, JSON.stringify({...receipt, errors, loaded}, null, 2) + '\n');
  console.log(JSON.stringify(receipt));
} catch (error) {
  writeFileSync(`${output}/failure.json`, JSON.stringify({...receipt, error: error.message, errors}, null, 2) + '\n');
  throw error;
} finally {
  await browser.close();
  if (server) server.close();
}
