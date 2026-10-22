// Real keyboard ownership and reaction callbacks around native, paid spells.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {mkdirSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {isAbsolute, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import express from 'express';
import {createAccountHandler, MemoryAccountStore} from '../../api/account.js';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = process.env.PRIORITY_OUTPUT || join(tmpdir(), 'mtg-priority-actions');
const baseline = process.env.PRIORITY_BASELINE_UI;
let server, base = process.env.GAME_URL;
assert.ok(isAbsolute(output), 'PRIORITY_OUTPUT must be an absolute output directory');
assert.ok(!baseline || isAbsolute(baseline), 'PRIORITY_BASELINE_UI must be an absolute file');
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
const errors = [], sources = [], failures = [];
const receipt = {target: base, baseline: !!baseline, keyboard: [], failures};
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
const check = (condition, message) => {if (!condition) failures.push(message);};

// A new production UI, two native seats, actual card definitions and real mana.
// Opponents pass their own decisions; the human remains on the real controller.
async function fixture() {
  await page.evaluate(() => {
    const old = document.querySelector('#game');
    old.replaceWith(old.cloneNode(false));
    document.querySelector('#setup').style.display = 'none';
    document.querySelector('#game').style.display = 'flex';
    document.body.classList.add('game-active');
    const ui = new MTG.UI();
    const game = new MTG.Game({seed: 131030, paced: false, onEvent: () => ui.queueRender()});
    const pass = {decide: async (_game, q) => q.type === 'priority' ? {kind: 'pass'} : null};
    const you = game.addPlayer('You', {name: 'Quick Draw'}, null, false);
    const opponent = game.addPlayer('Opponent', {name: 'Quick Draw'}, pass, true);
    ui.game = game; ui.me = you; ui.prioMode = 'end';
    you.controller = ui.controllerFor(you);
    game.turnPlayer = opponent; game.turnNo = 7; game.phase = 'main1'; game.step = 'main';
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
    const forests = Array.from({length: 4}, () => put('Forest', 'battlefield', opponent));
    const island = put('Island'), opt = put('Opt', 'hand');
    const bears = [put('Grizzly Bears', 'hand', opponent), put('Grizzly Bears', 'hand', opponent)];
    game.recalc();
    const state = window.__priority = {ui, game, you, opponent, forests, island, opt, bears, casts: []};
    state.begin = index => {
      const cast = state.casts[index] = {status: 'pending'};
      void game.castSpell(opponent, bears[index], {from: 'hand'}).then(value => {
        cast.status = 'resolved'; cast.value = value;
      }, error => {cast.status = 'rejected'; cast.error = error.message;});
    };
    ui.render();
    state.begin(0);
  });
  await pending(() => !!_ui.react);
}

try {
  await page.goto(base);
  await page.locator('[data-menu-action="solo"]').first().click();
  await page.waitForSelector('.deckentry:visible', {timeout: 120000});
  await pending(() => !!window.MTG?.DEFS?.Opt);

  for (const key of ['Space', 'Enter']) {
    await fixture();
    await page.evaluate(() => {__priority.waitingReaction = _ui.react;});
    const before = await page.evaluate(() => ({spellZone: __priority.bears[0].zone,
      manaSpent: __priority.bears[0].castMeta.manaSpent,
      tappedForests: __priority.forests.filter(card => card.tapped).length,
      responseCasts: _ui.react.q.casts.map(entry => entry.card.name)}));
    assert.deepEqual(before, {spellZone: 'stack', manaSpent: 2, tappedForests: 2, responseCasts: ['Opt']});
    await page.keyboard.press('?');
    await page.waitForSelector('.helpguide:visible');
    // A real pointer click gives the noninteractive sheet keyboard focus.
    await page.locator('.helpguide').click({position: {x: 20, y: 20}});
    const focus = await page.evaluate(() => ({tag: document.activeElement.tagName,
      className: document.activeElement.className, inHelp: !!document.activeElement.closest('.helpguide')}));
    assert.equal(focus.inHelp, true);
    await page.keyboard.press(key);
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));
    const after = await page.evaluate(() => ({sameReaction: _ui.react === __priority.waitingReaction,
      showHelp: _ui.showHelp, spellZone: __priority.bears[0].zone, status: __priority.casts[0].status,
      optZone: __priority.opt.zone, islandTapped: __priority.island.tapped, renderError: _ui.renderError?.message ?? null}));
    receipt.keyboard.push({key, before, focus, after});
    check(after.sameReaction && after.showHelp && after.spellZone === 'stack' && after.status === 'pending',
      `${key} from Help passed the hidden native response`);
    check(after.optZone === 'hand' && !after.islandTapped && after.renderError === null,
      `${key} from Help changed response resources or broke rendering`);
    // The panel's own focused close control keeps its normal keyboard action.
    await page.getByRole('button', {name: 'Close help', exact: true}).focus();
    await page.keyboard.press('Enter');
    await page.waitForSelector('.helptext', {state: 'detached'});
    check(await page.evaluate(() => !_ui.showHelp), `${key}: focused Help close did not work`);
    if (await page.evaluate(() => !!_ui.react)) {
      await page.locator('.actionstage .pbtn.primary').focus();
      await page.keyboard.press('Space');
    }
    await pending(() => __priority.casts[0].status !== 'pending');
    assert.equal(await page.evaluate(() => __priority.casts[0].value === true && __priority.bears[0].zone === 'battlefield'), true);
  }

  await fixture();
  await page.evaluate(() => {
    __priority.oldProceed = document.querySelector('.actionstage .pbtn.primary').onclick;
    __priority.oldRespond = document.querySelector('.actionstage .actionrespond').onclick;
    __priority.firstQuestion = _ui.react.q;
  });
  await page.locator('.actionstage .pbtn.primary').click();
  await pending(() => __priority.casts[0].status !== 'pending');
  await page.evaluate(() => {__priority.begin(1);});
  await pending(() => !!_ui.react);
  await page.evaluate(() => {
    __priority.secondReaction = _ui.react;
    __priority.secondQuestion = _ui.react.q;
    __priority.oldProceed();
  });
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));
  receipt.staleProceed = await page.evaluate(() => ({sameReaction: _ui.react === __priority.secondReaction,
    newQuestion: __priority.secondQuestion !== __priority.firstQuestion, pending: _ui.pending?.q.type ?? null,
    status: __priority.casts[1].status, spellZone: __priority.bears[1].zone}));
  check(receipt.staleProceed.sameReaction && receipt.staleProceed.newQuestion && receipt.staleProceed.pending === null &&
    receipt.staleProceed.status === 'pending' && receipt.staleProceed.spellZone === 'stack',
  'A stale reaction Proceed consumed the new native response');
  if (await page.evaluate(() => !!_ui.react)) {
    await page.evaluate(() => {__priority.oldRespond();});
    receipt.staleRespond = await page.evaluate(() => ({sameReaction: _ui.react === __priority.secondReaction,
      pending: _ui.pending?.q.type ?? null, status: __priority.casts[1].status}));
    check(receipt.staleRespond.sameReaction && receipt.staleRespond.pending === null && receipt.staleRespond.status === 'pending',
      'A stale reaction RESPOND opened the new native response');
    // Open the current response through its real focused control.
    await page.locator('.actionstage .actionrespond').focus();
    await page.keyboard.press('Enter');
    await pending(() => _ui.pending?.q.type === 'priority');
    receipt.currentRespond = await page.evaluate(() => ({sameQuestion: _ui.pending.q === __priority.secondQuestion,
      react: !!_ui.react, casts: _ui.pending.q.casts.map(entry => entry.card.name), status: __priority.casts[1].status}));
    assert.deepEqual(receipt.currentRespond, {sameQuestion: true, react: false, casts: ['Opt'], status: 'pending'});
    await page.locator('.promptbar .pbtn.primary').filter({hasText: 'Proceed'}).focus();
    await page.keyboard.press('Enter');
  }
  await pending(() => __priority.casts[1].status !== 'pending');
  receipt.final = await page.evaluate(() => ({casts: __priority.casts.map(cast => ({status: cast.status, value: cast.value})),
    spellZones: __priority.bears.map(card => card.zone), manaSpent: __priority.bears.map(card => card.castMeta.manaSpent),
    tappedForests: __priority.forests.filter(card => card.tapped).length, optZone: __priority.opt.zone,
    islandTapped: __priority.island.tapped, pending: _ui.pendings.length, react: !!_ui.react,
    renderError: _ui.renderError?.message ?? null}));
  assert.deepEqual(receipt.final, {casts: [{status: 'resolved', value: true}, {status: 'resolved', value: true}],
    spellZones: ['battlefield', 'battlefield'], manaSpent: [2, 2], tappedForests: 4, optZone: 'hand',
    islandTapped: false, pending: 0, react: false, renderError: null});
  receipt.sources = await Promise.all(sources);
  receipt.errors = errors;
  assert.deepEqual(errors, []);
  assert.equal(receipt.sources.length > 0, true);
  assert.deepEqual(failures, []);
  console.log(JSON.stringify({ok: true, target: base, output, keyboard: receipt.keyboard.map(case_ => case_.key)}));
} catch (error) {
  receipt.error = {name: error.name, message: error.message};
  process.exitCode = 1;
  console.error(error.message);
} finally {
  receipt.sources ||= await Promise.all(sources);
  receipt.errors = errors;
  writeFileSync(join(output, 'receipt.json'), JSON.stringify(receipt, null, 2));
  await browser.close();
  if (server) server.close();
}
