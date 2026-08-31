// PLAYWRIGHT_MODULE may point to an installed Playwright index.mjs.
// Controlled public boards, real AIController/casting/UI, local account store.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createAccountHandler, MemoryAccountStore } from '../../api/account.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = `${root}output/web-game/twinflame/browser`;
mkdirSync(output, { recursive: true });
const app = express();
app.use('/api/account', createAccountHandler({ store: new MemoryAccountStore(), limiter: null }));
app.use(express.static(root));
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
const results = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await page.addInitScript(() => {
  localStorage.setItem('mtgOnboardingComplete', '1');
  localStorage.setItem('mtgReducedMotion', '1');
});

async function finishInteraction() {
  for (let step = 0; step < 100; step++) {
    const current = await page.evaluate(() => ({ done: window.__twinflame.done, error: window.__twinflame.error, pending: window._ui.pending?.q.type }));
    if (current.error) throw new Error(current.error);
    if (current.done) return;
    const proceed = page.getByRole('button', { name: /^(Proceed|Pass|Resolve|Continue|Got it)/ });
    if (await proceed.count()) await proceed.last().click();
    await page.evaluate(() => window.advanceTime(500));
    await page.waitForTimeout(30);
  }
  throw new Error(`Interaction did not finish: ${await page.locator('body').innerText()}`);
}

try {
  for (const difficulty of ['easy', 'normal', 'hard']) {
    for (const scenario of ['empty', 'legend', 'one', 'two-base', 'two-strive']) {
      await page.goto(`${base}/?smokeDeck=Quick%20Draw&seed=31831&smokeScenario=twinflameFixture`);
      await page.waitForFunction(() => !!window._game && window._ui?.pending?.q.type === 'mulligan');
      await page.evaluate(({ difficulty, scenario }) => {
        // Leave the bootstrap opening-hand continuation suspended. This fresh
        // game runs only the controlled decision and its normal priority flow.
        const ui = new MTG.UI();
        const game = MTG.newGame({
          seed: 31831, humanDeck: 'Quick Draw', aiDecks: ['Prismari Artistry'], aiStyles: ['balanced'],
          difficulty, paced: true, maxTurns: 20,
          humanController: player => { ui.me = player; return ui.controllerFor(player); },
          onEvent: event => {
            if (event.type === 'spotlight') ui.showSpot(event.text, event.kind);
            if (event.type === 'effectNotice') ui.showEffectNotice(event.text, event.kind, event);
            if (event.type === 'gameEffect') ui.showGameEffect(event);
            if (event.type === 'battlefieldArrival') ui.showBattlefieldArrival(event);
            ui.queueRender();
          },
        });
        const bot = game.players.find(player => player.isAI);
        const take = (name, zone = 'battlefield') => {
          const card = [...bot.library, ...bot.command].find(card => card.name === name) || new MTG.CardInst(MTG.DEFS[name], bot);
          game.remove(card); card.ctrl = bot; card.zone = zone; card.sick = false;
          if (zone === 'battlefield') game.battlefield.push(card); else bot[zone].push(card);
          return card;
        };
        const creatures = scenario === 'legend' ? ['Rootha, Mastering the Moment']
          : scenario === 'one' ? ['Goldspan Dragon']
            : scenario.startsWith('two') ? ['Goldspan Dragon', 'Storm-Kiln Artist'] : [];
        creatures.forEach(name => take(name));
        for (let i = 0; i < (scenario === 'two-strive' ? 5 : 2); i++) take('Mountain');
        const spell = take('Twinflame', 'hand');
        game.turnPlayer = bot; game.turnNo = 12; game.phase = 'main1'; game.step = 'main'; game.speedFactor = 0;
        game.recalc();
        ui.game = game; window._game = game; window._ui = ui;
        ui.render();
        const audit = window.__twinflame = { done: false, error: null, bot: bot.idx, spell: spell.iid, creatures };
        void (async () => {
          const decision = await bot.controller.decide(game, {
            type: 'main', player: bot, casts: game.castableList(bot).filter(entry => entry.card === spell), acts: [], lands: [], phase: game.phase,
          });
          audit.decision = decision.kind;
          if (decision.kind === 'cast') audit.applied = await game.performAction(bot, decision);
          ui.render();
          audit.done = true;
        })().catch(error => { audit.error = error.stack; });
      }, { difficulty, scenario });
      await finishInteraction();
      const result = await page.evaluate(() => {
        const audit = window.__twinflame;
        const game = window._game;
        const bot = game.players.find(player => player.idx === audit.bot);
        const spell = game.byIid(audit.spell);
        const copies = game.creatures(bot).filter(card => card.isToken && audit.creatures.includes(card.name));
        return {
          decision: audit.decision, applied: audit.applied, zone: spell.zone, spent: spell.castMeta?.manaSpent,
          copies: copies.map(card => ({ name: card.name, haste: card.kw('haste') })),
          stack: game.stack.length, triggers: game.pendingTriggers.length,
          fallback: game.log.some(entry => /AI V2 fallback/.test(entry.msg)),
          state: JSON.parse(render_game_to_text()),
        };
      });
      const shouldHold = scenario === 'empty' || scenario === 'legend';
      assert.equal(result.decision, shouldHold ? 'done' : 'cast');
      assert.equal(result.zone, shouldHold ? 'hand' : 'graveyard');
      assert.equal(result.copies.length, shouldHold ? 0 : scenario === 'two-strive' ? 2 : 1);
      if (!shouldHold) assert.equal(result.spent, scenario === 'two-strive' ? 5 : 2);
      assert.equal(result.copies.every(card => card.haste), true);
      assert.equal(result.stack, 0); assert.equal(result.triggers, 0); assert.equal(result.fallback, false);
      results.push({ difficulty, scenario, ...result });
      if (difficulty === 'hard') {
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${output}/${scenario}.png`, animations: 'disabled' });
      }
      if (!shouldHold) {
        await page.evaluate(() => {
          const audit = window.__twinflame; audit.done = false;
          const game = window._game;
          game.phase = 'end'; game.step = 'end';
          void (async () => {
            await game.emit('endStep', { player: game.turnPlayer });
            await game.flushTriggers();
            await game.priorityRound(game.turnPlayer);
            window._ui.render(); audit.done = true;
          })().catch(error => { audit.error = error.stack; });
        });
        await finishInteraction();
        assert.equal(await page.evaluate(() => _game.creatures(_game.turnPlayer).filter(card => card.isToken && __twinflame.creatures.includes(card.name)).length), 0);
      }
      console.log(`PASS ${difficulty} / ${scenario}: decision, payment, copies, haste, end-step cleanup`);
    }
  }
  assert.deepEqual(errors, []);
  writeFileSync(`${output}/results.json`, JSON.stringify({ results, errors }, null, 2));
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` });
  throw error;
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
