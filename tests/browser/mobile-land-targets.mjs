// Printed Reality Spasm, real X/mode/target choices, mana payment and priority.
// The two equal-name lands must remain independently selectable on phones.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createAccountHandler, MemoryAccountStore } from '../../api/account.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = process.env.LAND_TARGET_OUTPUT || `${root}output/web-game/mobile-land-targets`;
mkdirSync(output, { recursive: true });
const server = express().use('/api/account', createAccountHandler({ store: new MemoryAccountStore(), limiter: null }))
  .use(express.static(root)).listen(0, '127.0.0.1');
await once(server, 'listening');
const browser = await chromium.launch({ headless: true,
  ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}),
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' });
const errors = [], results = [];
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
  localStorage.setItem('mtgOnboardingComplete', '1');
  localStorage.setItem('mtgReducedMotion', '1');
  localStorage.setItem('mtgManaMode', 'auto');
  localStorage.setItem('mtgStopProfile', 'off');
});

async function state() {
  return page.evaluate(() => {
    const qa = window.__lands;
    if (!qa) return null;
    const q = _ui.pending?.q || _ui.react?.q;
    return { done: qa.done, error: qa.error, ok: qa.ok, question: q?.type, min: q?.min, max: q?.max,
      selected: _ui.pending?.sel.map(card => card.iid) || [],
      forests: qa.forests.map(card => ({ iid: card.iid, tapped: card.tapped })),
      islands: qa.islands.map(card => ({ iid: card.iid, tapped: card.tapped })),
      source: { name: qa.source.name, zone: qa.source.zone, manaSpent: qa.source.castMeta?.manaSpent },
      questions: qa.questions, targets: qa.targets, log: _game.log.map(row => row.msg),
      stack: _game.stack.map(object => object.name),
    };
  });
}

async function fixture() {
  await page.evaluate(() => {
    const old = document.querySelector('#game'); old.replaceWith(old.cloneNode(false));
    document.querySelector('#setup').style.display = 'none';
    document.querySelector('#game').style.display = 'flex'; document.body.classList.add('game-active');
    const ui = new MTG.UI();
    const game = new MTG.Game({ seed: 101110, paced: true, onEvent: () => ui.queueRender() });
    const human = game.addPlayer('You', { name: 'Land target regression' }, null, false);
    const bot = game.addPlayer('Local AI', { name: 'Quick Draw' }, null, true);
    ui.game = game; ui.me = human; ui.prioMode = 'off';
    human.controller = ui.controllerFor(human);
    bot.controller = new MTG.AIController(bot, { difficulty: 'normal', style: 'balanced' });
    const put = (name, player, zone = 'battlefield') => {
      const card = new MTG.CardInst(MTG.DEFS[name], player);
      card.zone = zone; card.ctrl = player; card.sick = false;
      (zone === 'battlefield' ? game.battlefield : player[zone]).push(card);
      return card;
    };
    for (const player of game.players) for (let i = 0; i < 12; i++) put('Island', player, 'library');
    const forests = [put('Forest', human), put('Forest', human)];
    forests.forEach(card => { card.tapped = true; });
    const islands = Array.from({ length: 4 }, () => put('Island', human));
    const source = put('Reality Spasm', human, 'hand');
    const qa = window.__lands = { forests, islands, source, done: false, error: null, questions: [], targets: [] };
    const decide = human.controller.decide.bind(human.controller);
    human.controller.decide = async (g, q) => {
      qa.questions.push(q.type);
      const answer = await decide(g, q);
      if (q.type === 'chooseTargets') qa.targets.push(answer?.map(card => card.iid));
      return answer;
    };
    game.turnPlayer = human; game.turnNo = 9; game.phase = 'main1'; game.step = 'main'; game.speedFactor = 0;
    game.recalc(); window._game = game; window._ui = ui;
    void (async () => {
      const action = await human.controller.decide(game, {
        type: 'main', player: human, casts: game.castableList(human), acts: game.activatableList(human), lands: [], phase: game.phase,
      });
      qa.ok = await game.performAction(human, action);
      await game.flushTriggers(); await game.priorityRound(human);
      qa.done = true; ui.render();
    })().catch(error => { qa.error = error.stack; });
    ui.render();
  });
}

try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator('[data-menu-action="solo"]').first().click();
  await page.waitForSelector('.deckentry:visible');
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await fixture();
    await page.locator('.hcard[data-cname="Reality Spasm"]').click();
    await page.locator('.sheetacts button').filter({ hasText: /^Cast/ }).click();
    for (let step = 0; step < 5; step++) {
      const observed = await state();
      assert.equal(observed.error, null);
      if (observed.question === 'chooseTargets') break;
      if (observed.question === 'chooseX') {
        while (Number(await page.locator('.modal .xval').inputValue()) < 2) await page.locator('.modal .xrow button').nth(1).click();
        await page.getByRole('button', { name: /^Confirm X=/ }).click();
      } else if (observed.question === 'chooseMulti') {
        await page.locator('.modal button').filter({ hasText: /Untap X target permanents/ }).click();
        await page.getByRole('button', { name: /^Confirm \(/ }).click();
      } else if (observed.question === 'chooseOption') {
        await page.locator('.modal [data-choice-key]').filter({ hasText: /Untap X target permanents/ }).click();
      } else throw new Error(`Unexpected printed spell choice: ${observed.question}`);
    }
    await page.waitForFunction(() => _ui.pending?.q.type === 'chooseTargets' || __lands.error);
    const before = await state();
    assert.equal(before.min, 2);
    assert.equal(before.max, 2);
    const ids = before.forests.map(card => card.iid);
    const choices = page.locator(ids.map(iid => `.myboard .targetable[data-iid="${iid}"]:visible`).join(', '));
    assert.equal(await choices.count(), 2, 'each identical Forest is independently selectable');
    for (const iid of ids) {
      await page.locator(`.myboard .targetable[data-iid="${iid}"]:visible`).click();
    }
    assert.deepEqual((await state()).selected.sort((a, b) => a - b), ids.slice().sort((a, b) => a - b));
    await page.screenshot({ path: `${output}/${width}-two-forests-selected.png`, animations: 'disabled' });
    await page.locator('.targetpromptactions .primary:not(:disabled)').click();
    for (let step = 0; step < 15; step++) {
      const observed = await state();
      assert.equal(observed.error, null);
      if (observed.done) break;
      const proceed = page.getByRole('button', { name: /^(Proceed|Pass|Resolve|Continue|Got it)/ }).filter({ visible: true });
      if (await proceed.count()) await proceed.last().click();
      await page.waitForTimeout(25);
    }
    const result = await state();
    assert.equal(result.done, true);
    assert.equal(result.ok, true);
    assert.equal(result.source.zone, 'graveyard');
    assert.equal(result.source.manaSpent, 4);
    assert.ok(result.forests.every(card => !card.tapped), 'both chosen Forests untap');
    assert.ok(result.islands.every(card => card.tapped), 'four Islands paid X=2 plus UU');
    assert.deepEqual(result.targets, [ids]);
    assert.deepEqual(result.stack, []);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    await page.screenshot({ path: `${output}/${width}-resolved.png`, animations: 'disabled' });
    results.push({ width, ...result });
    console.log(`PASS ${width}px: select both identical Forests, pay Reality Spasm X=2, untap both`);
  }
  assert.deepEqual(errors, []);
  writeFileSync(`${output}/results.json`, JSON.stringify({ results, errors }, null, 2) + '\n');
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png`, animations: 'disabled' });
  writeFileSync(`${output}/failure.json`, JSON.stringify({ error: error.stack, state: await state(), errors }, null, 2) + '\n');
  throw error;
} finally {
  await browser.close(); await new Promise(resolve => server.close(resolve));
}
