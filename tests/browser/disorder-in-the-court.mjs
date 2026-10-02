import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createAccountHandler, MemoryAccountStore } from '../../api/account.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = `${root}output/web-game/disorder-in-the-court`;
mkdirSync(output, { recursive: true });
const server = express().use('/api/account', createAccountHandler({ store: new MemoryAccountStore(), limiter: null }))
  .use(express.static(root)).listen(0, '127.0.0.1');
await once(server, 'listening');
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1024 }, reducedMotion: 'reduce' });
const errors = [];
page.on('pageerror', error => errors.push(error.stack));
await page.addInitScript(() => {
  localStorage.setItem('mtgOnboardingComplete', '1');
  localStorage.setItem('mtgReducedMotion', '1');
});

try {
  await page.goto(`http://127.0.0.1:${server.address().port}/?smokeDeck=Deep%20Clue%20Sea&seed=913274`);
  await page.waitForFunction(() => window._ui?.pending?.q.type === 'mulligan', null, { timeout: 120000 });
  await page.evaluate(() => {
    // Keep the real Solo event handlers and human decision recorder. The
    // opening-game task remains suspended at its unanswered mulligan.
    const game = _game, ui = _ui, you = ui.me, other = game.players.find(player => player !== you);
    ui.pendings = []; ui.commandTableView = 'table'; ui.prioMode = 'off';
    game.battlefield = []; game.stack = []; game.pendingTriggers = [];
    for (const player of game.players) {
      for (const zone of ['library', 'hand', 'graveyard', 'exile', 'command']) player[zone] = [];
      player.commanders = [];
    }
    game.turnPlayer = you; game.turnNo = 6; game.phase = 'main1'; game.step = 'main'; game.speedFactor = 0;
    ui.acceptAllReveals = game.turnNo;
    const put = (name, player, zone = 'battlefield') => {
      const card = new MTG.CardInst(MTG.DEFS[name], player);
      card.ctrl = player; card.zone = zone; card.sick = false;
      (zone === 'battlefield' ? game.battlefield : player[zone]).push(card);
      return card;
    };
    const creatures = [put('Morska, Undersea Sleuth', you), put('Graf Mole', you),
      put('Grizzly Bears', other), put('Llanowar Elves', other)];
    const spell = put('Disorder in the Court', you, 'hand');
    you.pool.C = 4; you.pool.W = 1; you.pool.U = 1;
    const audit = window.__disorder = { creatures, spell, done: false, error: null };
    game.recalc(); ui.render();
    void (async () => {
      audit.cast = await game.castSpell(you, spell, { from: 'hand' });
      while (game.stack.length || game.pendingTriggers.length) {
        await game.flushTriggers();
        if (game.stack.length) await game.resolveTop();
      }
      audit.done = true; ui.render();
    })().catch(error => { audit.error = error.stack; });
  });

  await page.waitForFunction(() => _ui.pending?.q.type === 'chooseX' || __disorder.error);
  assert.equal(await page.evaluate(() => __disorder.error), null);
  while (await page.evaluate(() => _ui.pending.xVal) !== 4) {
    await page.getByRole('button', { name: '+', exact: true }).click();
  }
  await page.locator('.modal .pbtn.primary').click();
  await page.waitForFunction(() => _ui.pending?.q.type === 'chooseTargets' || __disorder.error);
  assert.equal(await page.evaluate(() => __disorder.error), null);
  const ids = await page.evaluate(() => __disorder.creatures.map(card => card.iid));
  for (const id of ids) await page.locator(`.mini[data-iid="${id}"]:visible`).first().click();
  assert.match(await page.locator('.targetprompthead').innerText(), /4 \/ 4 selected/);
  await page.screenshot({ path: `${output}/four-targets.png` });
  await page.locator('.targetprompt .primary').click();
  for (let step = 0; step < 50; step++) {
    const state = await page.evaluate(() => ({ pending: _ui.pending?.q.type, done: __disorder.done, error: __disorder.error }));
    assert.equal(state.error, null);
    assert.deepEqual(errors, []);
    if (state.done) break;
    const proceed = page.getByRole('button', { name: /^(Proceed|Pass|Continue|Let it|Let resolve|Got it)/ }).filter({ visible: true });
    if (await proceed.count()) await proceed.last().click();
    else await page.waitForTimeout(100);
  }
  const result = await page.evaluate(() => ({ done: __disorder.done, cast: __disorder.cast,
    zones: __disorder.creatures.map(card => card.zone),
    clues: _game.bf().filter(card => card.ctrl === _ui.me && card.isToken && card.hasSub('Clue')).length,
    pending: _ui.pending?.q.type, error: __disorder.error }));
  assert.equal(result.done, true, JSON.stringify(result));
  assert.equal(result.cast, true);
  assert.deepEqual(result.zones, ['exile', 'exile', 'exile', 'exile']);
  assert.equal(result.clues, 4);
  assert.deepEqual(errors, []);
  console.log('PASS: Disorder in the Court X=4 selected and resolved through the browser UI');
} catch (error) {
  console.error('Page errors:', errors);
  console.error('Game state:', await page.evaluate(() => window.__disorder && ({
    pending: _ui.pending?.q.type, error: __disorder.error, done: __disorder.done,
    stack: _game.stack.map(item => item.name), log: _game.log?.slice(-10),
  })).catch(() => null));
  await page.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  throw error;
} finally {
  await browser.close();
  await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
}
