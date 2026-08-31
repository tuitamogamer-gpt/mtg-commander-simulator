// Controlled boards, real paid Aura cast, human modal choices and local AI.
// PLAYWRIGHT_MODULE may point to an installed Playwright index.mjs.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createAccountHandler, MemoryAccountStore } from '../../api/account.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = `${root}output/web-game/gift-of-immortality/browser`;
mkdirSync(output, { recursive: true });
const app = express();
app.use('/api/account', createAccountHandler({ store: new MemoryAccountStore(), limiter: null }));
app.use(express.static(root));
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [], results = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await page.addInitScript(() => {
  localStorage.setItem('mtgOnboardingComplete', '1');
  localStorage.setItem('mtgReducedMotion', '1');
});

async function drive(scenario, stage) {
  for (let n = 0; n < 100; n++) {
    const pending = await page.evaluate(() => ({
      done: __gift.done, error: __gift.error, captain: __gift.captain.iid,
      type: _ui.pending?.q.type, hint: _ui.pending?.q.aiHint?.kind,
      selected: _ui.pending?.sel?.length || 0,
    }));
    if (pending.error) throw new Error(pending.error);
    if (pending.done) return;
    if (pending.type === 'chooseTargets') {
      if (!pending.selected) await page.locator(`.mini[data-iid="${pending.captain}"]`).first().click();
      await page.getByRole('button', { name: /Lock.*1 target/ }).click();
    } else if (pending.hint === 'commanderZone') {
      assert.match(await page.locator('.modal').innerText(), /Keep it in the graveyard to let Gift of Immortality return it/);
      await page.screenshot({ path: `${output}/${scenario}-choice.png`, animations: 'disabled' });
      await page.locator(`[data-choice-key="${scenario === 'human-command' ? 'cz' : 'stay'}"]`).click();
    } else {
      const proceed = page.getByRole('button', { name: /^(Proceed|Pass|Resolve|Continue|Got it|Confirm order)/ });
      if (await proceed.count()) await proceed.last().click();
    }
    await page.evaluate(() => window.advanceTime(150));
    await page.waitForTimeout(20);
  }
  throw new Error(`${scenario}/${stage} did not finish: ${await page.locator('body').innerText()}`);
}

async function runStage(stage, scenario) {
  await page.evaluate(({ stage, scenario }) => {
    const a = __gift; a.done = false; a.error = null;
    void (async () => {
      if (stage === 'cast') a.cast = await _game.castSpell(a.owner, a.gift);
      if (stage === 'death') {
        if (scenario === 'human-wipe') await _game.destroyMany([a.gift, a.captain]);
        else await _game.destroy(a.captain);
        await _game.flushTriggers();
        await _game.priorityRound(a.owner);
      }
      if (stage === 'end') {
        _game.phase = 'end'; _game.step = 'end';
        await _game.emit('endStep', { player: _game.players.find(player => player !== a.owner) });
        await _game.flushTriggers();
        await _game.priorityRound(a.owner);
      }
      _ui.render(); a.done = true;
    })().catch(error => { a.error = error.stack; });
  }, { stage, scenario });
  await drive(scenario, stage);
}

async function state() {
  return page.evaluate(() => ({
    captain: __gift.captain.zone, gift: __gift.gift.zone,
    attached: __gift.gift.attachedTo === __gift.captain.iid,
    casts: __gift.captain.cmdCasts, spent: __gift.gift.castMeta?.manaSpent,
    stack: _game.stack.length, triggers: _game.pendingTriggers.length,
    fallback: _game.log.some(row => /AI V2 fallback/.test(row.msg)),
    state: JSON.parse(render_game_to_text()),
  }));
}

async function finishVisuals() {
  await page.locator('.battlefieldarrival').waitFor({ state: 'detached', timeout: 10000 });
  await page.waitForTimeout(400);
}

try {
  for (const scenario of ['human-destroy', 'human-wipe', 'human-command', 'ai-easy', 'ai-normal', 'ai-hard']) {
    await page.goto(`${base}/?smokeDeck=Avengers%20Assemble&seed=31831&smokeScenario=giftFixture`);
    await page.waitForFunction(() => !!window._game && window._ui?.pending?.q.type === 'mulligan');
    await page.evaluate(scenario => {
      // Keep the bootstrap opening-hand continuation suspended. Each case
      // uses a fresh UI/game and only advances through the requested actions.
      const ui = new MTG.UI();
      const botOwns = scenario.startsWith('ai-');
      const game = MTG.newGame({
        seed: 31831, humanDeck: botOwns ? 'Quick Draw' : 'Avengers Assemble',
        aiDecks: [botOwns ? 'Avengers Assemble' : 'Quick Draw'], aiStyles: ['balanced'],
        difficulty: botOwns ? scenario.slice(3) : 'hard', paced: true, maxTurns: 20,
        humanController: player => { ui.me = player; return ui.controllerFor(player); },
        onEvent: event => {
          if (event.type === 'spotlight') ui.showSpot(event.text, event.kind);
          if (event.type === 'effectNotice') ui.showEffectNotice(event.text, event.kind, event);
          if (event.type === 'gameEffect') ui.showGameEffect(event);
          if (event.type === 'battlefieldArrival') ui.showBattlefieldArrival(event);
          ui.queueRender();
        },
      });
      const owner = game.players.find(player => !!player.isAI === botOwns);
      const take = (name, zone = 'battlefield') => {
        const card = [...owner.library, ...owner.command].find(card => card.name === name) || new MTG.CardInst(MTG.DEFS[name], owner);
        game.remove(card); card.zone = zone; card.ctrl = owner; card.sick = false;
        if (zone === 'battlefield') game.battlefield.push(card); else owner[zone].push(card);
        return card;
      };
      const captain = take('Captain America, Team Leader'); captain.cmdCasts = 2;
      const gift = take('Gift of Immortality', 'hand');
      for (let n = 0; n < 3; n++) take('Plains');
      game.turnPlayer = owner; game.turnNo = 12; game.phase = 'main1'; game.step = 'main'; game.speedFactor = 0;
      game.recalc(); ui.game = game; window._game = game; window._ui = ui;
      window.__gift = { owner, captain, gift, done: true, error: null };
      ui.render();
    }, scenario);
    await runStage('cast', scenario);
    const cast = await state();
    assert.equal(cast.attached, true); assert.equal(cast.spent, 3);
    await runStage('death', scenario);
    const death = await state();
    assert.equal(death.captain, scenario === 'human-command' ? 'command' : 'battlefield');
    assert.equal(death.gift, 'graveyard'); assert.equal(death.casts, 2);
    await finishVisuals();
    await page.screenshot({ path: `${output}/${scenario}-returned-creature.png`, animations: 'disabled' });
    await runStage('end', scenario);
    const end = await state();
    assert.equal(end.gift, scenario === 'human-command' ? 'graveyard' : 'battlefield');
    assert.equal(end.attached, scenario !== 'human-command');
    assert.equal(end.stack, 0); assert.equal(end.triggers, 0); assert.equal(end.fallback, false);
    await finishVisuals();
    await page.screenshot({ path: `${output}/${scenario}-end-step.png`, animations: 'disabled' });
    results.push({ scenario, cast, death, end });
    console.log(`PASS ${scenario}: paid cast, commander choice, creature return, next end-step Aura`);
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
