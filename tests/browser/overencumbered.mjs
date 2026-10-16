// Paid player Aura, portable checkpoint, and actual human combat decisions.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import express from 'express';
import {createAccountHandler, MemoryAccountStore} from '../../api/account.js';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = process.env.OVERENCUMBERED_OUTPUT || join(tmpdir(), 'mtg-overencumbered');
const baseline = process.env.OVERENCUMBERED_BASELINE;
let server, base = process.env.GAME_URL;
assert.ok(!base || !baseline, 'Public checks must use deployed code');
mkdirSync(output, {recursive: true});
if (!base) {
  const app = express().use('/api/account', createAccountHandler({store: new MemoryAccountStore(), limiter: null}));
  if (baseline) for (const name of ['save-state', 'scripts-pom-objects', 'pom-integration']) {
    app.get(`/src/modules/${name}.js`, (_request, response) => response.sendFile(join(dirname(baseline), `${name}-baseline.js`)));
  }
  server = app.use(express.static(root)).listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
}
const browser = await chromium.launch({headless: true,
  ...(process.env.BROWSER_EXECUTABLE ? {executablePath: process.env.BROWSER_EXECUTABLE} : {})});
const page = await browser.newPage({viewport: {width: 1440, height: 1000}, reducedMotion: 'reduce'});
page.setDefaultTimeout(12000);
const receipt = {target: base, baseline: !!baseline, errors: [], failedRequests: [], checks: [], sources: []};
const hashes = [];
const sourceNames = ['save-state.js', 'ui.js', 'engine.js', 'engine2.js', 'scripts-pom-objects.js', 'pom-payments.js', 'pom-integration.js'];
page.on('pageerror', error => receipt.errors.push(error.message));
page.on('response', response => {
  if (response.status() >= 400) receipt.failedRequests.push({status: response.status(), url: response.url()});
  const name = new URL(response.url()).pathname.split('/').at(-1);
  if (sourceNames.includes(name)) hashes.push(response.body().then(body => ({name, status: response.status(),
    sha256: createHash('sha256').update(body).digest('hex')})));
});
await page.addInitScript(() => {
  localStorage.setItem('mtgOnboardingComplete', '1');
  localStorage.setItem('mtgReducedMotion', '1');
  localStorage.setItem('mtgManaMode', 'auto');
});

async function fixture({restore, manual, unaffordable = false}) {
  return page.evaluate(async ({restore, manual, unaffordable}) => {
    const old = document.querySelector('#game'); old.replaceWith(old.cloneNode(false));
    document.querySelector('#setup').style.display = 'none';
    document.querySelector('#game').style.display = 'flex';
    document.body.classList.add('game-active');
    const create = () => {
      const ui = new MTG.UI();
      const game = new MTG.Game({seed: 10162026, paced: false, onEvent: () => ui.queueRender()});
      for (const [index, name] of ['You', 'AI Raven', 'AI Wolf', 'AI Dragon'].entries()) {
        game.addPlayer(name, {name: 'Overencumbered QA'}, {decide: async (_game, question) => {
          if (question.type === 'chooseTargets') return [game.players[0]];
          if (question.type === 'orderTriggers') return question.triggers;
          return {kind: 'pass'};
        }}, index !== 0);
      }
      ui.game = game; ui.me = game.players[0]; ui.prioMode = 'off';
      ui.manaMode = manual ? 'manual' : 'auto'; ui.me.manualMana = manual;
      ui.me.controller = ui.controllerFor(ui.me);
      game.turnPlayer = ui.me; game.turnNo = 13; game.phase = 'main1'; game.step = 'main';
      game.speedFactor = 0; window._game = game; window._ui = ui;
      return {game, ui};
    };
    let {game, ui} = create();
    const put = (name, owner, zone = 'battlefield') => {
      const card = new MTG.CardInst(MTG.DEFS[name], owner);
      card.zone = zone; card.sick = false;
      (zone === 'battlefield' ? game.battlefield : owner[zone]).push(card);
      return card;
    };
    for (const player of game.players) for (let i = 0; i < 12; i++) put('Plains', player, 'library');
    const you = game.players[0], raven = game.players[1];
    for (const name of ['Plains', 'Mountain', 'Sunhome, Fortress of the Legion', 'Mind Stone']) put(name, you);
    put('Nelly Borca, Impulsive Accuser', you);
    put('Plains', raven); put('Plains', raven);
    const aura = put('Overencumbered', raven, 'hand');
    // The setup cast is native and paid; the human UI takes over before
    // Continue so the tested payment and mana choices remain interactive.
    you.controller = {decide: async () => ({kind: 'pass'})};
    game.turnPlayer = raven; game.recalc();
    const cast = await Promise.race([game.castSpell(raven, aura, {from: 'hand'}),
      new Promise((_, reject) => setTimeout(() => reject(Error('Aura cast stalled at ' + ui.pending?.q.type + ': ' + ui.pending?.q.prompt)), 12000))]);
    await game.flushTriggers();
    await Promise.race([game.priorityRound(raven), new Promise((_, reject) => setTimeout(() => reject(Error('Aura resolution stalled at ' + ui.pending?.q.type + ': ' + ui.pending?.q.prompt)), 12000))]);
    const entry = {cast, zone: aura.zone, enchanted: aura.meta.cursedPlayer?.idx,
      tokens: game.bf().filter(card => card.ctrl === you && card.isToken).map(card => card.name),
      paid: game.bf().filter(card => card.ctrl === raven && card.tapped).length};
    game.turnPlayer = you; game.recalc();
    if (unaffordable) game.tap(game.bf().find(card => card.ctrl === you && card.name === 'Plains'));
    if (restore) {
      const checkpoint = MTG.captureGameState(game);
      if (!checkpoint) throw Error('Native Aura board cannot be checkpointed: ' + MTG.gameStateSnapshotBlockers(game));
      const wire = JSON.stringify(checkpoint);
      ({game, ui} = create());
      MTG.restoreGameState(game, JSON.parse(wire));
      ui.me = game.players[0]; ui.me.manualMana = manual; ui.me.controller = ui.controllerFor(ui.me);
    }
    ui.me.controller = ui.controllerFor(ui.me);
    const receipt = window.__overencumbered = {entry, done: false, error: null};
    ui.render();
    void (async () => {
      const action = await ui.me.controller.decide(game, {type: 'main', player: ui.me, casts: [], acts: [], lands: [], phase: game.phase});
      if (action?.kind !== 'done') throw Error('Expected native Continue: ' + JSON.stringify(action));
      await game.combatPhase(ui.me); receipt.done = true; ui.render();
    })().catch(error => {receipt.error = error.stack;});
    return entry;
  }, {restore, manual, unaffordable});
}

async function state() {
  return page.evaluate(() => ({done: __overencumbered.done, error: __overencumbered.error,
    pending: _ui.pending?.q.type || null, prompt: _ui.pending?.q.prompt || null, options: _ui.pending?.q.options || [],
    enchanted: _game.bf().find(card => card.name === 'Overencumbered')?.meta.cursedPlayer?.idx ?? null,
    tapped: _game.bf().filter(card => card.ctrl === _ui.me && card.tapped).map(card => card.name),
    restricted: !_game.canAttackAtAll(_game.bf().find(card => card.name === 'Nelly Borca, Impulsive Accuser')),
    stack: _game.stack.length, logs: _game.log.slice(-8).map(row => row.text || row.msg || row)}));
}

try {
  await page.goto(base);
  await page.locator('[data-menu-action="solo"]').first().click();
  await page.waitForSelector('.deckentry:visible', {timeout: 120000});
  for (const width of [1440, 390]) {
    await page.setViewportSize({width, height: width === 390 ? 844 : 1000});
    for (const scenario of [{restore: false, manual: false, pay: true}, {restore: false, manual: true, pay: true},
      {restore: false, manual: false, pay: false, unaffordable: true}, {restore: true, manual: false, pay: true},
      {restore: true, manual: true, pay: true}, {restore: true, manual: false, pay: false}]) {
      if (process.env.OVERENCUMBERED_CASE === 'unaffordable' && !scenario.unaffordable) continue;
      if (process.env.OVERENCUMBERED_CASE === 'restore' && scenario.unaffordable) continue;
      const name = `${width}-${scenario.restore ? 'restored' : 'live'}-${scenario.manual ? 'manual' : 'auto'}-${scenario.unaffordable ? 'unaffordable' : scenario.pay ? 'pay' : 'decline'}`;
      const entry = await fixture(scenario);
      assert.equal(entry.cast, true); assert.equal(entry.zone, 'battlefield'); assert.equal(entry.enchanted, 0);
      assert.deepEqual(entry.tokens.sort(), ['Clue Token', 'Food Token', 'Junk Token']); assert.equal(entry.paid, 2);
      await page.getByRole('button', {name: 'Continue ▶ (combat)', exact: true}).click();
      await page.waitForFunction(() => _ui.pending?.q.type !== 'main' || __overencumbered.done || __overencumbered.error);
      const before = await state();
      receipt.checks.push({name, entry, before});
      await page.screenshot({path: join(output, `${name}-choice.png`)});
      assert.equal(before.error, null); assert.equal(before.pending, 'chooseOption', 'Human sees the optional payment before declaring attackers');
      assert.match(before.prompt, /pay.*\{4\}/i); assert.equal(before.enchanted, 0);
      if (!baseline) assert.match(before.prompt, /4 artifacts/);
      assert.equal(before.tapped.length, scenario.unaffordable ? 1 : 0, 'Showing the choice spends nothing');
      if (scenario.unaffordable) assert.deepEqual(before.options, [{key: 'no', label: 'Continue without attacking'}]);
      const answer = before.options.find(option => option.key === (scenario.pay ? 'yes' : 'no'));
      assert.ok(answer);
      await page.getByRole('button', {name: answer.label, exact: true}).click();
      if (scenario.manual && scenario.pay) {
        await page.waitForFunction(() => _ui.pending?.q.type === 'chooseManaSources');
        assert.match(await page.locator('.manapickcost').innerText(), /Cost:\s*4/);
        await page.getByRole('button', {name: 'Tap selected sources ✓', exact: true}).click();
      }
      await page.waitForFunction(() => _ui.pending?.q.type === 'attackers' || __overencumbered.done || __overencumbered.error);
      const after = await state(); receipt.checks.at(-1).after = after;
      assert.equal(after.error, null);
      assert.equal(after.tapped.length, scenario.pay ? 4 : scenario.unaffordable ? 1 : 0);
      assert.equal(after.restricted, !scenario.pay);
      if (!baseline) assert.match(after.logs.join('\n'), scenario.pay ? /You paid \{4\} for 4 artifacts/ : /Their creatures cannot attack this combat/);
      if (scenario.pay) {
        assert.equal(after.pending, 'attackers');
        await page.getByRole('button', {name: /^No attacks/}).click();
      }
      await page.waitForFunction(() => __overencumbered.done || __overencumbered.error);
      assert.equal((await state()).done, true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    }
  }
  receipt.sources = await Promise.all(hashes);
  for (const name of sourceNames) {
    const source = receipt.sources.find(source => source.name === name);
    assert.ok(source, `${name} loaded`); assert.equal(source.status, 200);
    assert.equal(source.sha256, createHash('sha256').update(readFileSync(join(root, 'src/modules', name))).digest('hex'));
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
