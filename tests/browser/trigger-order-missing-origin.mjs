// A real Ring-bearer attack mixes a delayed trigger with a printed ability.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import express from 'express';
import {createAccountHandler, MemoryAccountStore} from '../../api/account.js';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = process.env.TRIGGER_ORDER_OUTPUT || join(tmpdir(), 'mtg-trigger-order-origin');
const baseline = process.env.TRIGGER_ORDER_BASELINE;
let server, base = process.env.GAME_URL;
assert.ok(!base || !baseline, 'Public checks must use deployed code');
mkdirSync(output, {recursive: true});
if (!base) {
  const app = express().use('/api/account', createAccountHandler({store: new MemoryAccountStore(), limiter: null}));
  if (baseline) app.get('/src/modules/ui.js', (_request, response) => response.sendFile(baseline));
  server = app.use(express.static(root)).listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
}
const browser = await chromium.launch({headless: true,
  ...(process.env.BROWSER_EXECUTABLE ? {executablePath: process.env.BROWSER_EXECUTABLE} : {})});
const page = await browser.newPage({viewport: {width: 1440, height: 1000}, reducedMotion: 'reduce'});
page.setDefaultTimeout(15000);
const receipt = {target: base, baseline: !!baseline, errors: [], failedRequests: [], checks: [], sources: []};
const hashes = [], paths = ['src/modules/ui.js', 'src/modules/engine.js', 'src/modules/engine2.js'];
page.on('pageerror', error => receipt.errors.push(error.message));
page.on('response', response => {
  if (response.status() >= 400) receipt.failedRequests.push({status: response.status(), url: response.url()});
  const path = new URL(response.url()).pathname.slice(1);
  if (paths.includes(path)) hashes.push(response.body().then(body => ({path, status: response.status(),
    sha256: createHash('sha256').update(body).digest('hex')})));
});
await page.addInitScript(() => {
  localStorage.setItem('mtgOnboardingComplete', '1');
  localStorage.setItem('mtgReducedMotion', '1');
});

async function fixture() {
  return page.evaluate(async () => {
    const old = document.querySelector('#game'); old.replaceWith(old.cloneNode(false));
    document.querySelector('#setup').style.display = 'none';
    document.querySelector('#game').style.display = 'flex';
    document.body.classList.add('game-active');
    const ui = new MTG.UI();
    const game = new MTG.Game({seed: 10161854, paced: false, onEvent: () => ui.queueRender()});
    for (const [index, name] of ['You', 'AI Raven', 'AI Wolf', 'AI Dragon'].entries()) {
      game.addPlayer(name, {name: 'Elven Council'}, {decide: async (_game, q) => {
        if (q.type === 'orderTriggers') return q.triggers;
        if (q.type === 'chooseCards') return q.from.slice(0, q.min || 0);
        return {kind: 'pass'};
      }}, index !== 0);
    }
    ui.game = game; ui.me = game.players[0]; ui.prioMode = 'off';
    game.turnPlayer = ui.me; game.turnNo = 33; game.phase = 'main1'; game.step = 'main';
    game.speedFactor = 0; window._game = game; window._ui = ui;
    const put = (name, owner = ui.me, zone = 'battlefield') => {
      const card = new MTG.CardInst(MTG.DEFS[name], owner);
      card.zone = zone; card.sick = false;
      (zone === 'battlefield' ? game.battlefield : owner[zone]).push(card);
      return card;
    };
    for (const player of game.players) for (let i = 0; i < 12; i++) put('Plains', player, 'library');
    const galadriel = put('Galadriel, Elven-Queen'); galadriel.commander = true;
    ui.me.commanders = [galadriel];
    const tome = put('Tome of Legends');
    game.recalc();
    // Exercise the native Ring acquisition and its persistent delayed ability.
    await MTG.E7.ringTempts(game, ui.me); await MTG.E7.ringTempts(game, ui.me);
    await game.flushTriggers(); await game.priorityRound(ui.me);
    const human = ui.controllerFor(ui.me);
    const result = window.__triggerOrder = {done: false, error: null, answers: [], ringLevel: ui.me.ringLevel,
      pending: null, originalTriggers: null, galadriel, tome, lifeBefore: game.players[1].life};
    ui.me.controller = {decide: async (g, q) => {
      // The attack declaration is deterministic; trigger order and its next
      // discard decision are answered through the actual browser controls.
      if (q.type === 'attackers') return [{card: galadriel, target: game.players[1]}];
      const answer = human.decide(g, q);
      if (q.type === 'orderTriggers') {
        result.pending = ui.pending; result.originalTriggers = q.triggers.slice();
        result.before = q.triggers.map(t => ({name: t.name, source: t.src?.name || null,
          hasOrigin: !!t.triggerOrigin}));
      }
      const value = await answer;
      if (q.type === 'orderTriggers') result.answers.push(value.map(t => q.triggers.indexOf(t)));
      return value;
    }};
    ui.render();
    void game.combatPhase(ui.me).then(() => {result.done = true; ui.render();})
      .catch(error => {result.error = error.stack;});
    return {ringLevel: ui.me.ringLevel, bearer: galadriel.meta.ringBearer};
  });
}

const state = () => page.evaluate(() => ({done: __triggerOrder.done, error: __triggerOrder.error,
  pending: _ui.pending?.q.type || null, before: __triggerOrder.before, answers: __triggerOrder.answers,
  samePending: _ui.pending === __triggerOrder.pending,
  originalTriggersUnchanged: __triggerOrder.originalTriggers?.every((t, i) => __triggerOrder.pending.q.triggers[i] === t),
  recovery: !!document.querySelector('[data-testid="view-recovery"]'),
  recoveryText: document.querySelector('[data-testid="view-recovery"]')?.textContent || null,
  pages: __triggerOrder.tome.counters.page || 0,
  life: _game.players[1].life, lifeBefore: __triggerOrder.lifeBefore,
  power: __triggerOrder.galadriel.power, graveyard: _ui.me.graveyard.map(card => card.name),
  stack: _game.stack.length, logs: _game.log.slice(-10).map(row => row.msg)}));

try {
  await page.goto(base);
  await page.locator('[data-menu-action="solo"]').first().click();
  await page.waitForSelector('.deckentry:visible', {timeout: 120000});
  for (const width of [390, 1440]) {
    await page.setViewportSize({width, height: width === 390 ? 844 : 1000});
    const entry = await fixture();
    assert.deepEqual(entry, {ringLevel: 2, bearer: true});
    await page.waitForFunction(() => _ui.pending?.q.type === 'orderTriggers' || __triggerOrder.error);
    const before = await state(); receipt.checks.push({width, entry, before});
    await page.screenshot({path: join(output, `${width}-order.png`)});
    assert.equal(before.error, null);
    assert.equal(before.before.length, 2);
    assert.ok(before.before.some(t => t.name === 'The Ring: draw, then discard' && !t.hasOrigin));
    assert.ok(before.before.some(t => t.source === 'Tome of Legends' && t.hasOrigin));
    assert.equal(before.recovery, false, 'A delayed Ring trigger must render without an origin object');
    const rows = page.locator('.triggerorderrow');
    assert.equal(await rows.count(), 2);
    assert.match(await rows.nth(0).innerText(), /Tome of Legends/);
    assert.match(await rows.nth(1).innerText(), /The Ring: draw, then discard/);
    await rows.nth(0).getByRole('button', {name: '↓', exact: true}).click();
    assert.match(await rows.nth(0).innerText(), /The Ring: draw, then discard/);
    assert.match(await rows.nth(1).innerText(), /Tome of Legends/);
    const reordered = await state(); receipt.checks.at(-1).reordered = reordered;
    assert.equal(reordered.samePending, true); assert.equal(reordered.originalTriggersUnchanged, true);
    assert.equal(reordered.recovery, false);
    await page.getByRole('button', {name: 'Confirm order', exact: true}).click();
    await page.waitForFunction(() => _ui.pending?.q.type === 'chooseCards' || __triggerOrder.done || __triggerOrder.error);
    const discard = await state(); receipt.checks.at(-1).discard = discard;
    assert.deepEqual(discard.answers, [[1, 0]], 'Confirm resolves the original decision using the new order');
    assert.equal(discard.pending, 'chooseCards', 'The Ring continues to its draw/discard choice');
    assert.equal(discard.pages, 1, 'Tome on top resolved before The Ring');
    assert.equal(discard.error, null); assert.equal(discard.recovery, false);
    await page.locator('.cardgrid .bigcard').first().click();
    await page.getByRole('button', {name: /Confirm.*1/}).click();
    await page.waitForFunction(() => __triggerOrder.done || __triggerOrder.error);
    const after = await state(); receipt.checks.at(-1).after = after;
    assert.equal(after.done, true); assert.equal(after.error, null); assert.equal(after.recovery, false);
    assert.deepEqual(after.graveyard, ['Plains']);
    assert.equal(after.life, after.lifeBefore - after.power, 'Combat damage completes after the trigger decisions');
    assert.equal(after.stack, 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    await page.screenshot({path: join(output, `${width}-completed.png`)});
  }
  receipt.sources = await Promise.all(hashes);
  for (const path of paths) {
    const source = receipt.sources.find(row => row.path === path);
    assert.ok(source, `${path} loaded`); assert.equal(source.status, 200);
    assert.equal(source.sha256, createHash('sha256').update(readFileSync(join(root, path))).digest('hex'));
  }
  assert.deepEqual(receipt.errors, []); assert.deepEqual(receipt.failedRequests, []);
  receipt.passed = true;
  console.log(JSON.stringify({passed: receipt.checks.length, target: base, errors: receipt.errors}));
} catch (error) {
  receipt.failure = error.stack;
  await page.screenshot({path: join(output, 'failure.png')});
  throw error;
} finally {
  receipt.sources = await Promise.all(hashes);
  writeFileSync(join(output, 'receipt.json'), JSON.stringify(receipt, null, 2));
  await browser.close(); server?.close();
}
