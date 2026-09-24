import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createAccountHandler, MemoryAccountStore } from '../../api/account.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = process.env.EMET_QA_OUTPUT || `${root}output/web-game/emet-selch-removal`;
mkdirSync(output, { recursive: true });
const server = process.env.GAME_URL ? null : express().use('/api/account', createAccountHandler({ store: new MemoryAccountStore(), limiter: null }))
  .use(express.static(root)).listen(0, '127.0.0.1');
if (server) await once(server, 'listening');
const base = process.env.GAME_URL || `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
const page = await browser.newPage({ reducedMotion: 'reduce', hasTouch: true });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
  localStorage.setItem('mtgOnboardingComplete', '1'); localStorage.setItem('mtgReducedMotion', '1');
});

async function reachable(selector) {
  const metrics = await page.locator(selector).evaluate(element => {
    const r = element.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { visible: r.width > 0 && r.height >= 40 && r.x >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight,
      clickable: hit === element || element.contains(hit) };
  });
  assert.deepEqual(metrics, { visible: true, clickable: true }, selector);
}

try {
  await page.goto(base);
  await page.locator('[data-menu-action="solo"]').first().click();
  await page.waitForSelector('.deckentry:not([hidden])');
  for (const [width, height] of [[390, 844], [320, 568], [1440, 1024]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => {
      const root = document.querySelector('#game'); root.replaceWith(root.cloneNode(false));
      document.querySelector('#setup').style.display = 'none'; document.body.classList.add('game-active');
      const game = new MTG.Game({ seed: 92445, paced: false });
      const quiet = { decide: async () => [] };
      const you = game.addPlayer('You', { name: 'Scions & Spellcraft' }, quiet, false);
      const wolf = game.addPlayer('AI Wolf', { name: 'Mutant Menace' }, quiet, true);
      game.addPlayer('AI Raven', { name: 'Mutant Menace' }, quiet, true);
      const ui = new MTG.UI(); ui.game = game; ui.me = you; ui.commandTableView = 'table';
      you.controller = ui.controllerFor(you);
      game.turnPlayer = wolf; game.turnNo = 45; game.phase = 'main1'; game.step = 'main';
      game.priorityRound = async () => {};
      const put = (name, player, zone = 'battlefield') => {
        const card = new MTG.CardInst(MTG.DEFS[name], player);
        card.ctrl = player; card.zone = zone; card.sick = false;
        if (zone === 'battlefield') game.battlefield.push(card); else player[zone].push(card);
        return card;
      };
      const source = put('Emet-Selch of the Third Seat', you);
      you.commanders = [put("Y'shtola, Night's Blessed", you, 'command')];
      wolf.commanders = [put('The Wise Mothman', wolf, 'command')];
      const victim = put('Shivan Dragon', wolf);
      const swamp = put('Swamp', you); swamp.tapped = true;
      put('Mountain', wolf); put('Forest', wolf);
      const spell = put('Snuff Out', you, 'graveyard');
      for (const name of ['Swords to Plowshares', 'Vindicate', 'Void Rend', 'Forest']) put(name, you, 'graveyard');
      for (const name of ['Hypnotic Sprite', 'Merfolk Looter', 'Thought Vessel', "Archaeomancer's Map"]) put(name, you, 'hand');
      window._game = game; window._ui = ui;
      window.__emet = { source, victim, spell, done: false, error: null };
      game.recalc(); ui.render();
      void (async () => {
        await game.loseLife(wolf, 1, source);
        for (let i = 0; i < 20 && (game.pendingTriggers.length || game.stack.length); i++) {
          await game.flushTriggers();
          if (game.stack.length) await game.resolveTop();
        }
        __emet.done = true; ui.render();
      })().catch(error => { __emet.error = error.message; });
    });
    await page.waitForFunction(() => _ui.pending?.q.type === 'chooseTargets');
    assert.match(await page.locator('.targetinstructiontext').innerText(), /graveyard.*optional.*paying its costs/s);
    assert.match(await page.locator('.targetzoneopen').innerText(), /4 legal/);
    assert.equal(await page.locator('.targetprompt .primary').isDisabled(), true);
    await reachable('.targetzoneopen');
    await page.screenshot({ path: `${output}/graveyard-choice-${width}.png` });
    await page.getByRole('button', { name: /Open your graveyard/ }).click();
    assert.equal(await page.locator('.zonetargetpicker .targetzonepick').count(), 4);
    await page.getByRole('button', { name: 'Choose Snuff Out from graveyard', exact: true }).click();
    assert.equal(await page.evaluate(() => __emet.spell.zone), 'graveyard');
    await reachable('.targetprompt .primary');
    await page.locator('.targetprompt .primary').click();
    await page.waitForFunction(() => _ui.pending?.q.type === 'chooseOption');
    await page.getByRole('button', { name: 'Yes', exact: true }).click();
    await page.waitForFunction(() => _ui.pending?.q.type === 'chooseTargets' && _ui.pending.q.src.name === 'Snuff Out');
    assert.match(await page.locator('.targetprompthead').innerText(), /Snuff Out/);
    assert.equal(await page.locator('.targetzoneopen').count(), 0);
    const iid = await page.evaluate(() => __emet.victim.iid);
    await page.locator(`.mini[data-iid="${iid}"]`).click();
    await reachable('.targetprompt .primary');
    await page.screenshot({ path: `${output}/removal-target-${width}.png` });
    await page.locator('.targetprompt .primary').click();
    await page.waitForFunction(() => __emet.done || __emet.error);
    assert.deepEqual(await page.evaluate(() => ({ error: __emet.error, victim: __emet.victim.zone,
      spell: __emet.spell.zone, life: _ui.me.life, stack: _game.stack.length, pending: !!_ui.pending })),
    { error: null, victim: 'graveyard', spell: 'exile', life: 36, stack: 0, pending: false });
    await page.screenshot({ path: `${output}/resolved-${width}.png` });
  }
  assert.deepEqual(errors, []);
  console.log('PASS: real Emet-Selch trigger, four graveyard targets, Snuff Out alternative payment, separate removal target and resolution at 390, 320 and 1440px');
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` });
  throw error;
} finally {
  await browser.close();
  if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
}
