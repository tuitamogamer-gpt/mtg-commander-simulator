// Deterministic Solo fixtures, operated through the real mobile/desktop controls.
// Run with PLAYWRIGHT_MODULE pointing to an installed playwright/index.mjs.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';

const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = process.env.GAME_URL ? null : express()
  .use(express.static(fileURLToPath(new URL('../../', import.meta.url))))
  .listen(0, '127.0.0.1');
if (server) await once(server, 'listening');
const base = process.env.GAME_URL || `http://127.0.0.1:${server.address().port}`;
const out = process.env.GAME_QA_OUTPUT || 'output/astral-cornucopia';
mkdirSync(out, { recursive: true });
const browser = await pw.chromium.launch({ headless: true,
  ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
const errors = [], checks = [];
let activePage;

try {
  for (const mobile of [true, false]) {
    const name = mobile ? 'mobile' : 'desktop-reduced-cost';
    const context = await browser.newContext({
      viewport: mobile ? { width: 393, height: 852 } : { width: 1440, height: 1000 },
      isMobile: mobile, hasTouch: mobile, reducedMotion: 'reduce',
    });
    await context.addInitScript(() => {
      localStorage.setItem('mtgOnboardingComplete', '1');
      localStorage.setItem('mtgReducedMotion', '1');
      localStorage.setItem('mtgManaMode', 'auto');
    });
    const page = await context.newPage();
    activePage = page;
    page.on('pageerror', error => errors.push(`${name}: ${error.message}`));
    await page.goto(base);
    await page.locator('[data-menu-action="solo"]').first().click();
    await page.waitForFunction(() => !!MTG.UI && !!MTG.DEFS?.['Astral Cornucopia']);
    const fixture = await page.evaluate(reduced => {
      const game = new MTG.Game({ seed: 91026, paced: false, maxTurns: 5 });
      const ui = new MTG.UI();
      const player = game.addPlayer('You', { name: 'Invent Superiority' }, null, false);
      game.addPlayer('AI Opponent', { name: 'Elven Council' }, { decide: async () => ({ kind: 'pass' }) }, true);
      game.turnPlayer = player; game.turnNo = 3; game.phase = 'main1'; game.step = 'main';
      ui.game = game; ui.me = player; ui.prioMode = 'full';
      const controls = ui.controllerFor(player);
      player.controller = { decide: (g, q) => q.type === 'priority'
        ? Promise.resolve({ kind: 'pass' }) : controls.decide(g, q) };
      const put = (name, zone = 'battlefield') => {
        const card = new MTG.CardInst(MTG.DEFS[name], player); card.zone = zone; card.sick = false;
        (zone === 'battlefield' ? game.battlefield : player[zone]).push(card);
        return card;
      };
      const lands = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', ...(!reduced ? ['Wastes'] : [])];
      lands.forEach(name => put(name));
      const spare = put('Sol Ring');
      if (reduced) put('Etherium Sculptor');
      const cornucopia = put('Astral Cornucopia', 'hand');
      game.recalc();
      window._game = game; window._ui = ui;
      document.querySelector('#setup').style.display = 'none';
      document.querySelector('#game').style.display = 'flex';
      document.body.classList.add('game-active');
      void (async () => {
        while (!game.gameOver) {
          const answer = await player.controller.decide(game, {
            type: 'main', player, lands: [], casts: game.castableList(player), acts: game.activatableList(player),
          });
          if (answer.kind === 'cast') await game.castSpell(player, answer.card, { from: answer.from, ...answer.alt });
          else if (answer.kind === 'activate') await game.activateAbility(player, answer.entry);
          else break;
        }
      })().catch(error => { setTimeout(() => { throw error; }); });
      return { cornucopia: cornucopia.iid, spare: spare.iid, lands };
    }, !mobile);

    await page.locator(`.hcard[data-iid="${fixture.cornucopia}"]`).click();
    await page.locator('.sheetacts').getByRole('button', { name: /^Cast/ }).first().click();
    await page.locator('.xrow').getByRole('button', { name: '+', exact: true }).click();
    await page.locator('.xrow').getByRole('button', { name: '+', exact: true }).click();
    const total = mobile ? 6 : 5;
    assert.match(await page.locator('.xcostsummary').innerText(), /All 3 X symbols use the same value/);
    assert.equal(await page.locator('.xcostsummary .mana-generic').innerText(), String(total));
    assert.match(await page.locator('.xcostsummary').innerText(), /charge counters/);
    await page.screenshot({ path: `${out}/${name}-x.png` });
    await page.getByRole('button', { name: 'Confirm X=2 ✓', exact: true }).click();
    await page.locator('.manapickmodal').waitFor();
    assert.equal(await page.locator('.manapickcost .mana-generic').innerText(), String(total));
    while (await page.locator('.manasourcerow.selected').count()) await page.locator('.manasourcerow.selected').first().click();
    for (const name of fixture.lands) await page.locator('.manasourcerow').filter({ has: page.locator('b', { hasText: new RegExp(`^${name}$`) }) }).click();
    assert.equal(await page.getByRole('button', { name: 'Tap selected sources ✓', exact: true }).isEnabled(), true);
    await page.screenshot({ path: `${out}/${name}-payment.png` });
    await page.getByRole('button', { name: 'Tap selected sources ✓', exact: true }).click();
    await page.waitForFunction(iid => _game.byIid(iid)?.zone === 'battlefield' && _ui.pending?.q.type === 'main', fixture.cornucopia);
    assert.equal(await page.evaluate(iid => _game.byIid(iid).tapped, fixture.spare), false);

    for (const [amount, color] of [[2, 'U'], [3, 'G']]) {
      if (amount === 3) await page.evaluate(iid => {
        const card = _game.byIid(iid); card.tapped = false; _game.addCounters(card, 'charge', 1);
        _ui.pending.q.acts = _game.activatableList(_ui.me); _ui.render();
      }, fixture.cornucopia);
      await page.locator(`.mini[data-iid="${fixture.cornucopia}"]`).first().click();
      await page.locator('.sheetacts').getByRole('button', { name: /Mana:/ }).click();
      await page.waitForFunction(() => _ui.pending?.q.type === 'chooseOption');
      assert.equal(await page.locator('.modal [data-choice-key]').count(), 5);
      const bounds = await page.locator('.modal').boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= page.viewportSize().width + 1);
      await page.screenshot({ path: `${out}/${name}-${amount}-mana.png` });
      await page.locator('.modal').getByRole('button', { name: `Add ${amount} ${color === 'U' ? 'blue' : 'green'} mana`, exact: true }).click();
      await page.waitForFunction(() => _ui.pending?.q.type === 'main');
      assert.equal(await page.evaluate(color => _ui.me.pool[color], color), amount);
    }
    assert.equal(await page.evaluate(iid => _game.byIid(iid).counters.charge, fixture.cornucopia), 3);
    checks.push(`${name}: one X, exact total, selected sources, chosen blue/green mana and updated counters`);
    console.log(`PASS ${checks.at(-1)}`);
    await context.close();
  }
  assert.deepEqual(errors, []);
  writeFileSync(`${out}/report.json`, JSON.stringify({ checks, errors }, null, 2));
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: `${out}/failure.png` });
    writeFileSync(`${out}/failure.json`, JSON.stringify(await activePage.evaluate(() => ({
      pending: window._ui?.pending?.q.type, prompt: window._ui?.pending?.q.prompt,
      stack: window._game?.stack.map(item => item.name),
    })), null, 2));
  }
  throw error;
} finally {
  await browser.close();
  server?.close();
}
