// Controlled starting boards; casts, choices, mana and turning face up use
// the real human controller/UI and the local AI. No production access.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import express from 'express';
import { createAccountHandler, MemoryAccountStore } from '../../api/account.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = `${root}output/ability-audit-2026-09-05/browser`;
mkdirSync(output, { recursive: true });
const app = express();
app.use('/api/account', createAccountHandler({ store: new MemoryAccountStore(), limiter: null }));
app.use(express.static(root));
const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [], results = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('requestfailed', request => { if (!request.failure()?.errorText.includes('ERR_ABORTED')) errors.push(request.failure()?.errorText); });
await page.addInitScript(() => {
  localStorage.setItem('mtgOnboardingComplete', '1');
  localStorage.setItem('mtgReducedMotion', '1');
});

async function setup(scenario, name = 'Grizzly Bears') {
  await page.goto(`${base}/?smokeDeck=Avengers%20Assemble&seed=950505&smokeScenario=abilityFixture`);
  await page.waitForFunction(() => window._ui?.pending?.q.type === 'mulligan', { timeout: 30000 });
  await page.evaluate(({ scenario, name }) => {
    const ui = new MTG.UI();
    const game = MTG.newGame({
      seed: 950505, humanDeck: 'Avengers Assemble', aiDecks: ['Quick Draw'],
      aiStyles: ['balanced'], difficulty: 'hard', paced: false, maxTurns: 20,
      humanController: player => { ui.me = player; return ui.controllerFor(player); },
      onEvent: () => ui.queueRender(),
    });
    const actor = scenario.startsWith('ai') ? game.players.find(p => p.isAI) : ui.me;
    const put = (cardName, zone = 'battlefield', owner = actor) => {
      const card = new MTG.CardInst(MTG.DEFS[cardName], owner); card.zone = zone; card.ctrl = owner;
      if (zone === 'battlefield') game.battlefield.push(card); else owner[zone].push(card);
      return card;
    };
    actor.hand = []; actor.library = [];
    for (let i = 0; i < 20; i++) put('Forest', 'library');
    const card = scenario.includes('delve') ? put('Tasigur, the Golden Fang', 'hand') : put(name, 'library');
    const spell = scenario.includes('delve') ? card : put('Manifest Dread', 'hand');
    const lands = (scenario.includes('delve') ? ['Forest', 'Forest', 'Island', 'Woodland Cemetery'] : ['Forest', 'Island']).map(n => put(n));
    const fodder = scenario.includes('delve') ? ['Foreboding Landscape', 'Rampant Growth'].map(n => put(n, 'graveyard')) : [];
    game.turnPlayer = actor; game.turnNo = 8; game.phase = 'main1'; game.step = 'main'; game.speedFactor = 0;
    game.recalc(); ui.game = game; window._game = game; window._ui = ui;
    window.__abilityAudit = { actor, card, spell, lands, fodder, done: false, error: null, trace: [] };
    const decide = actor.controller.decide.bind(actor.controller);
    actor.controller.decide = async (g, q) => {
      __abilityAudit.trace.push({ type: q.type, min: q.min, max: q.max, hint: q.aiHint?.kind });
      return decide(g, q);
    };
    window.__offerAbilityAudit = () => {
      const state = __abilityAudit; state.done = false;
      void actor.controller.decide(game, {
        type: 'main', player: actor, casts: game.castableList(actor), acts: game.activatableList(actor), lands: [], phase: game.phase,
      }).then(async action => { state.action = action.kind; state.ok = await game.performAction(actor, action); state.done = true; ui.render(); })
        .catch(error => { state.error = error.stack; });
    };
    __offerAbilityAudit(); ui.render();
  }, { scenario, name });
}

async function state() {
  return page.evaluate(() => ({
    done: __abilityAudit.done, error: __abilityAudit.error, action: __abilityAudit.action, ok: __abilityAudit.ok,
    iid: __abilityAudit.card.iid, spell: __abilityAudit.spell.iid,
    name: __abilityAudit.card.name, faceDown: __abilityAudit.card.faceDown, zone: __abilityAudit.card.zone,
    power: __abilityAudit.card.power, tapped: __abilityAudit.lands.map(c => c.tapped),
    exiled: __abilityAudit.fodder.filter(c => c.zone === 'exile').length,
    spent: __abilityAudit.card.castMeta?.manaSpent,
    pending: _ui.pending?.q.type, hint: _ui.pending?.q.aiHint?.kind,
    min: _ui.pending?.q.min, max: _ui.pending?.q.max,
    choices: _ui.pending?.q.from?.map(c => ({ iid: c.iid, name: c.name })), selected: _ui.pending?.sel?.length || 0,
    stack: _game.stack.length, fallback: _game.aiDecisionLog?.some(row => row.fallback) || !!_game._decisionFallbacks,
    trace: __abilityAudit.trace,
  }));
}

async function drive(scenario) {
  for (let n = 0; n < 100; n++) {
    const s = await state(); if (s.error) throw new Error(s.error); if (s.done) return s;
    if (s.pending === 'chooseCards') {
      const picks = s.hint === 'manifestDread' ? s.choices.filter(c => c.iid === s.iid) : s.choices.slice(0, s.min);
      for (const pick of picks.slice(s.selected)) await page.locator(`.modal .bigcard[data-card-name=${JSON.stringify(pick.name)}]`).first().click();
      if (s.hint === 'delve') {
        assert.equal(s.min, 2); assert.equal(s.max, 2);
        await page.screenshot({ path: `${output}/${scenario}-payment.png`, animations: 'disabled' });
      }
      await page.getByRole('button', { name: /^Confirm/ }).last().click();
    } else {
      const proceed = page.getByRole('button', { name: /^(Proceed|Pass|Resolve|Continue|Got it|Confirm order)/ });
      if (await proceed.count()) await proceed.last().click();
    }
    await page.waitForTimeout(30);
  }
  throw new Error(`Unfinished ${scenario}: ${JSON.stringify(await state())}`);
}

async function openCard(iid) {
  await page.locator(`.mini[data-iid="${iid}"]`).first().click();
  await page.locator('.sheet').waitFor();
}
async function capture(name) {
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${output}/${name}.png`, animations: 'disabled' });
  writeFileSync(`${output}/${name}-state.json`, await page.evaluate(() => render_game_to_text()));
}

try {
  for (const [scenario, name] of [['human-manifest', 'Grizzly Bears'], ['human-noncreature', 'Forest'], ['ai-manifest', 'Grizzly Bears'], ['human-delve', 'Grizzly Bears'], ['ai-delve', 'Grizzly Bears']]) {
    await setup(scenario, name);
    if (scenario.startsWith('human')) {
      const s = await state();
      await page.locator('.hand [data-cname]').first().click();
      await page.locator('.sheetacts button').filter({ hasText: /^(Cast|Delve)/ }).first().click();
    }
    const cast = await drive(scenario); assert.equal(cast.ok, true);
    if (scenario.includes('delve')) {
      assert.equal(cast.exiled, 2); assert.equal(cast.spent, 4); assert.equal(cast.zone, 'battlefield');
      assert.ok(cast.tapped.every(Boolean)); assert.equal(cast.fallback, false);
      await capture(`${scenario}-resolved`); results.push({ scenario, cast }); continue;
    }
    assert.equal(cast.faceDown, true); assert.equal(cast.zone, 'battlefield');
    if (scenario.startsWith('human')) {
      await page.evaluate(() => __offerAbilityAudit()); await openCard(cast.iid);
      if (scenario === 'human-noncreature') {
        assert.match(await page.locator('.faceuphelp').innerText(), /noncreature.*stays a 2\/2/);
        assert.equal(await page.locator('.faceupaction:not(:disabled)').count(), 0);
        await capture(scenario); results.push({ scenario, cast }); continue;
      }
      assert.match(await page.locator('.faceupaction').innerText(), /not enough mana/);
      assert.equal(await page.locator('.faceupaction').isDisabled(), true);
      await capture(`${scenario}-no-mana`);
      await page.getByRole('button', { name: /^Close$/i }).last().click();
      await page.evaluate(() => {
        _ui.pending = null;
        for (const land of __abilityAudit.lands) _game.untap(land);
        _game.recalc(); __offerAbilityAudit(); _ui.render();
      });
      await openCard(cast.iid);
      assert.equal(await page.locator('.faceupaction:not(:disabled)').count(), 1);
      for (const [width, height] of [[1280, 720], [390, 844], [820, 900], [1440, 1000]]) {
        await page.setViewportSize({ width, height });
        await page.waitForTimeout(120);
        const controls = await page.locator('.faceupsheet .sheetacts button').evaluateAll(buttons => buttons.map(button => {
          const r = button.getBoundingClientRect(), top = Math.max(0, r.top), bottom = Math.min(innerHeight, r.bottom);
          return { visible: top === r.top && bottom === r.bottom && r.left >= 0 && r.right <= innerWidth,
            reachable: button.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)) };
        }));
        assert.ok(controls.length >= 2 && controls.every(c => c.visible && c.reachable), `${width}x${height}: face-up and Close buttons stay visible and clickable`);
        await capture(`human-manifest-ready-${width}`);
      }
      await capture(`${scenario}-ready`);
      await page.locator('.faceupaction:not(:disabled)').click();
    } else {
      // Human's screen must never expose the bot's manifested identity.
      const hidden = await page.evaluate(() => {
        _ui.sheet = { card: __abilityAudit.card }; _ui.render();
        return document.querySelector('.sheet').innerText;
      });
      assert.doesNotMatch(hidden, /Grizzly Bears|mana cost:|Turn face up/);
      await capture('ai-manifest-hidden');
      await page.evaluate(() => {
        _ui.sheet = null;
        for (const land of __abilityAudit.lands) _game.untap(land);
        _game.recalc(); __offerAbilityAudit(); _ui.render();
      });
    }
    const turned = await drive(`${scenario}-faceup`);
    assert.equal(turned.faceDown, false); assert.equal(turned.name, name); assert.equal(turned.stack, 0);
    assert.ok(turned.tapped.every(Boolean)); assert.equal(turned.fallback, false);
    await capture(`${scenario}-faceup`); results.push({ scenario, cast, turned });
  }
  if (process.env.WEB_GAME_CLIENT) {
    // The generic skill client has a fixed five-second selector timeout.
    // Give the large catalogue a full action burst to load, then activate the
    // focused face-up button with Enter; this DOM game has no canvas.
    const child = spawn(process.execPath, [process.env.WEB_GAME_CLIENT, '--url', `${base}/?smokeDeck=Avengers%20Assemble&seed=109&smokeScenario=manifest`,
      '--actions-json', '{"steps":[{"buttons":[],"frames":180},{"buttons":["enter"],"frames":1},{"buttons":[],"frames":30}]}',
      '--iterations', '2', '--pause-ms', '350', '--screenshot-dir', `${output}/skill-client`], { stdio: 'inherit' });
    const [code] = await once(child, 'exit'); assert.equal(code, 0);
    const skillState = JSON.parse(readFileSync(`${output}/skill-client/state-1.json`, 'utf8'));
    assert.ok(skillState.players.some(player => player.battlefield.some(card =>
      card.name === 'Stalwart Pathlighter' && !card.faceDown && card.power === 3)), 'skill client must actually turn the creature face up');
  }
  assert.deepEqual(errors, []);
  writeFileSync(`${output}/results.json`, JSON.stringify({ results, errors }, null, 2));
  console.log(JSON.stringify({ scenarios: results.map(r => r.scenario), errors }));
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` });
  writeFileSync(`${output}/failure.txt`, `${error.stack}\n${await page.locator('body').innerText()}`);
  throw error;
} finally { await browser.close(); server.close(); }
