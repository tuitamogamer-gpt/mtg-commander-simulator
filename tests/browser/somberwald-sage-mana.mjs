import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createAccountHandler, MemoryAccountStore } from '../../api/account.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = process.env.SAGE_QA_OUTPUT || `${root}output/web-game/somberwald-sage-mana`;
mkdirSync(output, { recursive: true });
const server = process.env.GAME_URL ? null : express().use('/api/account', createAccountHandler({ store: new MemoryAccountStore(), limiter: null }))
  .use(express.static(root)).listen(0, '127.0.0.1');
if (server) await once(server, 'listening');
const base = process.env.GAME_URL || `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
const page = await browser.newPage({ reducedMotion: 'reduce', hasTouch: true });
const errors = [];
page.on('pageerror', error => errors.push(error.stack));
await page.addInitScript(() => {
  localStorage.setItem('mtgOnboardingComplete', '1');
  localStorage.setItem('mtgReducedMotion', '1');
});

try {
  for (const [width, height] of [[390, 844], [1440, 1024]]) {
    await page.setViewportSize({ width, height });
    await page.goto(base);
    await page.locator('[data-menu-action="solo"]').first().click();
    await page.waitForSelector('.deckentry:visible', { timeout: 120000 });
    const ids = await page.evaluate(() => {
      const root = document.querySelector('#game'); root.replaceWith(root.cloneNode(false));
      document.querySelector('#setup').style.display = 'none'; document.body.classList.add('game-active');
      const game = new MTG.Game({ seed: 92426, paced: false });
      const you = game.addPlayer('You', { name: 'Coven Counters' }, null, false);
      game.addPlayer('Opponent', { name: 'Test' }, { decide: async () => ({ kind: 'pass' }) }, true);
      const ui = new MTG.UI(); ui.game = game; ui.me = you; ui.prioMode = 'full'; ui.commandTableView = 'table';
      you.controller = ui.controllerFor(you);
      game.turnPlayer = you; game.turnNo = 4; game.phase = 'main1'; game.step = 'main'; game.speedFactor = 0;
      game.priorityRound = async () => {};
      const put = (name, zone = 'battlefield') => {
        const card = new MTG.CardInst(MTG.DEFS[name], you); card.zone = zone; card.sick = false;
        (zone === 'battlefield' ? game.battlefield : you[zone]).push(card);
        return card;
      };
      const sage = put('Somberwald Sage'), witness = put('Eternal Witness', 'hand'), sorcery = put('Cultivate', 'hand');
      const audit = window.__sageMana = { game, ui, you, sage, witness, sorcery, activations: 0, cast: false, error: null };
      window._game = game; window._ui = ui;
      const decide = async () => {
        const action = await you.controller.decide(game, {
          type: 'main', player: you, phase: 'main1', casts: game.castableList(you), acts: game.activatableList(you), lands: [],
        });
        assertAction(action);
        const ok = await game.performAction(you, action);
        if (!ok) throw Error('Mana or cast action was rejected');
        if (action.kind === 'activate') { audit.activations++; void decide().catch(fail); }
        else { audit.cast = true; ui.render(); }
      };
      const assertAction = action => {
        if (!['activate', 'cast'].includes(action.kind)) throw Error('Unexpected action: ' + action.kind);
      };
      const fail = error => { audit.error = error.stack; };
      game.recalc(); void decide().catch(fail); ui.render();
      return { sage: sage.iid, witness: witness.iid };
    });
    await page.locator(`.mini[data-iid="${ids.sage}"]:visible`).first().click();
    const ability = page.getByRole('button', { name: /Mana:.*only for creature spells/ });
    await ability.waitFor();
    assert.equal(await ability.evaluate(el => el.scrollWidth <= el.clientWidth + 1), true, 'mana action fits its button');
    await ability.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/sage-action-${width}.png` });
    await ability.click();
    await page.waitForFunction(() => _ui.pending?.q.type === 'chooseOption' || __sageMana.error);
    assert.equal(await page.getByRole('button', { name: /3 (white|blue|black|red|green) mana/ }).count(), 5);
    await page.getByRole('button', { name: /3 green mana/ }).click();
    await page.waitForFunction(() => __sageMana.activations === 1 || __sageMana.error);
    const produced = await page.evaluate(() => ({
      error: __sageMana.error, pool: __sageMana.you.pool.G, tapped: __sageMana.sage.tapped, stack: _game.stack.length,
      witness: _ui.pending.q.casts.some(entry => entry.card === __sageMana.witness),
      sorcery: _ui.pending.q.casts.some(entry => entry.card === __sageMana.sorcery),
    }));
    assert.deepEqual(produced, { error: null, pool: 3, tapped: true, stack: 0, witness: true, sorcery: false });
    await page.screenshot({ path: `${output}/sage-pool-${width}.png` });
    await page.locator(`.hcard[data-iid="${ids.witness}"]:visible`).first().click();
    await page.locator('.sheetacts').getByRole('button', { name: /^Cast / }).click();
    await page.waitForFunction(() => __sageMana.cast || __sageMana.error);
    const payment = await page.evaluate(() => ({ error: __sageMana.error, pool: __sageMana.you.pool.G, metadata: __sageMana.you.poolMeta.length }));
    assert.deepEqual(payment, { error: null, pool: 0, metadata: 0 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  }
  assert.deepEqual(errors, []);
  console.log('PASS: Somberwald Sage card action, five colors, three restricted mana and actual creature payment at 390 and 1440 px; no page errors.');
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` });
  throw error;
} finally {
  await browser.close();
  if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
}
