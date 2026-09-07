// Controlled public boards; actual local AI, tap costs, stack and Proceed UI.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createAccountHandler, MemoryAccountStore } from '../../api/account.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = `${root}output/web-game/station/${process.env.GAME_URL ? 'browser-production' : 'browser'}`;
mkdirSync(output, { recursive: true });
const app = express();
app.use('/api/account', createAccountHandler({ store: new MemoryAccountStore(), limiter: null }));
app.use(express.static(root));
const server = process.env.GAME_URL ? null : app.listen(0, '127.0.0.1');
if (server) await once(server, 'listening');
const base = process.env.GAME_URL || `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const errors = [], results = [];
try {
  for (const mobile of [false, true]) {
    const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      isMobile: mobile, hasTouch: mobile });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('requestfailed', request => errors.push(request.url() + ': ' + request.failure()?.errorText));
    await page.addInitScript(() => {
      localStorage.setItem('mtgOnboardingComplete', '1'); localStorage.setItem('mtgReducedMotion', '1');
    });
    for (const scenario of ['cap', 'minimal', 'defense', 'multitap', 'kilo', 'reactor']) {
      await page.goto(`${base}/?smokeDeck=Counter%20Intelligence&seed=90708&smokeScenario=stationFixture`);
      await page.waitForFunction(() => window._ui?.pending?.q.type === 'mulligan');
      await page.evaluate(scenario => {
        // Leave the bootstrap mulligan suspended and run a fresh controlled
        // game through the normal UI/controller/priority path.
        const ui = new MTG.UI();
        const game = MTG.newGame({ seed: 90708, humanDeck: 'Quick Draw', aiDecks: ['Counter Intelligence'],
          difficulty: 'hard', aiStyles: ['balanced'], paced: true, maxTurns: 20,
          humanController: player => { ui.me = player; return ui.controllerFor(player); },
          onEvent: event => {
            if (event.type === 'spotlight') ui.showSpot(event.text, event.kind);
            if (event.type === 'effectNotice') ui.showEffectNotice(event.text, event.kind, event);
            if (event.type === 'gameEffect') ui.showGameEffect(event);
            if (event.type === 'battlefieldArrival') ui.showBattlefieldArrival(event);
            ui.queueRender();
          },
        });
        const bot = game.players.find(p => p.isAI);
        const take = (name, player = bot) => {
          const card = [...player.library, ...player.command].find(c => c.name === name) || new MTG.CardInst(MTG.DEFS[name], player);
          game.remove(card); card.ctrl = player; card.zone = 'battlefield'; card.sick = false;
          game.battlefield.push(card); return card;
        };
        const source = take('Inspirit, Flagship Vessel');
        source.counters.charge = scenario === 'cap' || scenario === 'reactor' ? 8
          : scenario === 'minimal' ? 7 : scenario === 'defense' ? 1 : 4;
        let pilots;
        if (scenario === 'multitap') pilots = [take('Enthusiastic Mechanaut'), take('Enthusiastic Mechanaut'), take('Enthusiastic Mechanaut')];
        else if (scenario === 'kilo' || scenario === 'reactor') pilots = [take('Kilo, Apogee Mind'), take('Angel of the Ruins')];
        else pilots = scenario === 'defense' ? [take('Thrummingbird')] : [take('Angel of the Ruins'), take('Thrummingbird')];
        if (scenario === 'minimal') pilots[1].sick = true;
        if (scenario === 'defense') {
          bot.life = 4; const threat = take('Angel of the Ruins', ui.me); threat.tapped = true;
        }
        const reactor = scenario === 'reactor' ? take('Darksteel Reactor') : null;
        if (reactor) reactor.counters.charge = 19;
        game.turnPlayer = bot; game.turnNo = 8; game.phase = 'main2'; game.step = 'main'; game.speedFactor = 0;
        game.recalc(); ui.game = game; ui.prioMode = 'full'; window._game = game; window._ui = ui; ui.render();
        const audit = window.__station = { done: false, error: null, source: source.iid,
          pilots: pilots.map(c => c.iid), reactor: reactor?.iid, stackSeen: false, paidBeforeResolve: false };
        void game.mainPhase(bot).then(() => { ui.render(); audit.done = true; })
          .catch(error => { audit.error = error.stack; });
      }, scenario);
      let proceeds = 0;
      for (let step = 0; step < 100; step++) {
        const state = await page.evaluate(() => {
          const a = __station, g = _game;
          if (g.stack.some(item => item.srcCard?.iid === a.source)) {
            a.stackSeen = true;
            if (a.pilots.some(id => g.byIid(id)?.tapped)) a.paidBeforeResolve = true;
          }
          return { done: a.done, error: a.error };
        });
        if (state.error) throw new Error(state.error);
        if (state.done) break;
        const button = page.getByRole('button', { name: /^(Proceed|Pass|Resolve|Continue|Got it)/ });
        if (await button.count()) { await button.last().click(); proceeds++; }
        await page.evaluate(() => window.advanceTime(100));
        await page.waitForTimeout(20);
      }
      const result = await page.evaluate(() => ({
        ...__station, charge: _game.byIid(__station.source).counters.charge,
        pilots: __station.pilots.map(id => ({ name: _game.byIid(id).name, tapped: _game.byIid(id).tapped })),
        reactorCharge: __station.reactor && _game.byIid(__station.reactor).counters.charge,
        opponentLost: _ui.me.lost, stack: _game.stack.length, triggers: _game.pendingTriggers.length,
        fallback: _game.log.some(entry => /AI V2 fallback/.test(entry.msg)), state: JSON.parse(render_game_to_text()),
      }));
      assert.equal(result.done, true, `${scenario}: main phase completed`);
      assert.equal(result.fallback, false);
      const taps = result.pilots.filter(c => c.tapped).length;
      if (scenario === 'cap' || scenario === 'defense') {
        assert.equal(taps, 0); assert.equal(result.charge, scenario === 'cap' ? 8 : 1);
      } else if (scenario === 'reactor') {
        assert.equal(result.reactorCharge, 20); assert.equal(result.opponentLost, true); assert.equal(taps, 1);
      } else {
        assert.equal(result.charge, 8); assert.equal(taps, scenario === 'multitap' ? 2 : 1);
        assert.equal(result.stack, 0); assert.equal(result.triggers, 0);
        assert.ok(proceeds > 0); assert.equal(result.paidBeforeResolve, true);
        if (scenario === 'minimal') assert.equal(result.pilots.find(c => c.name === 'Angel of the Ruins').tapped, false);
      }
      await page.waitForTimeout(200);
      await page.screenshot({ path: `${output}/${mobile ? 'mobile' : 'desktop'}-${scenario}.png`, animations: 'disabled' });
      results.push({ mobile, scenario, proceeds, ...result });
      console.log(`PASS ${mobile ? 'mobile' : 'desktop'} ${scenario}: ${result.charge} charge, ${taps} taps, ${proceeds} UI confirmations`);
    }
    await page.close();
  }
  assert.deepEqual(errors, []);
  writeFileSync(`${output}/results.json`, JSON.stringify({ results, errors }, null, 2));
} finally {
  await browser.close(); if (server) await new Promise(resolve => server.close(resolve));
}
