import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createAccountHandler, MemoryAccountStore } from '../../api/account.js';

const playwrightModule = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { chromium } = playwrightModule.default || playwrightModule;
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = `${root}output/web-game/arena-drag-controls`;
mkdirSync(output, { recursive: true });

const app = express();
app.use('/api/account', createAccountHandler({ store: new MemoryAccountStore(), limiter: null }));
app.use(express.static(root));
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const errors = [];
const network = [];
page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
page.on('requestfailed', request => network.push({ url: request.url(), failed: request.failure()?.errorText || 'failed' }));
page.on('response', response => {
  if (response.url().includes('/src/public-entry.js') || response.status() >= 400) {
    network.push({ url: response.url(), status: response.status(), contentType: response.headers()['content-type'] });
  }
});
await page.addInitScript(() => {
  localStorage.setItem('mtgOnboardingComplete', '1');
  localStorage.setItem('mtgReducedMotion', '1');
  if (!sessionStorage.getItem('arenaDragTestInitialized')) {
    localStorage.removeItem('mtgArenaDrag');
    sessionStorage.setItem('arenaDragTestInitialized', '1');
  }
});

async function waitForApp() {
  try {
    await page.waitForFunction(() => !!window.MTG?.DEFS?.['Swords to Plowshares'] && !window.MTGAccount?.loading);
  } catch (error) {
    const state = await page.evaluate(() => ({
      url: location.href,
      mtg: !!window.MTG,
      defs: Object.keys(window.MTG?.DEFS || {}).length,
      account: window.MTGAccount ? { loading: window.MTGAccount.loading, error: window.MTGAccount.error } : null,
      title: document.title,
    }));
    throw new Error(`App did not initialize: ${JSON.stringify({ state, errors, network })}`, { cause: error });
  }
}

async function waitForShell() {
  await page.waitForFunction(() => document.querySelector('#setup')?.getAttribute('aria-busy') !== 'true' && !window.MTGAccount?.loading);
}

async function installScenario(mode) {
  return page.evaluate(modeName => {
    const oldUI = window._ui;
    if (oldUI?.clearGameOverTransients) oldUI.clearGameOverTransients();
    const oldGameRoot = document.querySelector('#game');
    const cleanGameRoot = oldGameRoot.cloneNode(false);
    oldGameRoot.replaceWith(cleanGameRoot);
    document.body.classList.add('game-active');
    document.querySelector('#setup').style.display = 'none';
    document.querySelector('#game').style.display = 'flex';

    let ui = null;
    const game = new MTG.Game({ seed: 90422, paced: false, onEvent: () => ui?.queueRender() });
    const quiet = { decide: async (_game, q) => q.type === 'chooseTargets' ? q.candidates.slice(0, q.min || 0) : [] };
    const you = game.addPlayer('You', { name: 'Arena Drag Fixture' }, null, false);
    const opponent = game.addPlayer('Opponent', { name: 'Target Fixture' }, quiet, false);
    you.deckName = 'Quick Draw';
    opponent.deckName = 'Coven Counters';
    ui = new MTG.UI();
    ui.me = you;
    ui.game = game;
    you.controller = ui.controllerFor(you);
    game.turnPlayer = you;
    game.turnNo = 8;
    game.phase = 'main1';
    game.step = 'main';
    game.paced = false;
    game.priorityRound = async () => {};
    game.revealToHuman = async () => {};
    window._game = game;
    window._ui = ui;
    window.__arenaOutcome = null;

    const put = (name, owner, zone = 'battlefield') => {
      const card = new MTG.CardInst(MTG.DEFS[name], owner);
      if (!card.def) throw new Error(`Missing fixture definition: ${name}`);
      card.ctrl = owner;
      card.zone = zone;
      card.sick = false;
      card.tapped = false;
      if (zone === 'battlefield') game.battlefield.push(card);
      else owner[zone].push(card);
      return card;
    };
    const waitForDecision = (question, perform = false) => {
      const promise = you.controller.decide(game, question);
      window.__arenaDecision = promise.then(async answer => {
        const performed = perform ? await game.performAction(you, answer) : undefined;
        window.__arenaOutcome = { answer, performed };
        ui.render();
        return window.__arenaOutcome;
      });
      return promise;
    };

    let result;
    if (modeName === 'cast') {
      const spell = put('Swords to Plowshares', you, 'hand');
      const target = put('Riders of Gavony', opponent);
      you.pool.W = 1;
      game.recalc();
      const entry = game.castableList(you).find(candidate => candidate.card === spell);
      if (!entry) throw new Error('Swords fixture is not castable');
      waitForDecision({ type: 'main', player: you, phase: game.phase, casts: [entry], acts: [], lands: [] }, true);
      result = { sourceId: spell.iid, targetId: target.iid };
    } else if (modeName === 'land') {
      const land = put('Forest', you, 'hand');
      const invalid = put('Sol Ring', opponent);
      game.recalc();
      waitForDecision({ type: 'main', player: you, phase: game.phase, casts: [], acts: [], lands: [land] }, true);
      result = { sourceId: land.iid, invalidId: invalid.iid };
    } else if (modeName === 'attack') {
      const first = put('Riders of Gavony', you);
      const second = put('Humble Defector', you);
      const walker = put("Vraska, Betrayal's Sting", opponent);
      walker.counters.loyalty = 6;
      game.phase = 'combat';
      game.step = 'attackers';
      game.combat = { attackers: [], defenders: new Map() };
      game.recalc();
      waitForDecision({
        type: 'attackers', eligible: [first, second], opponents: [opponent],
        attackTargets: [opponent, walker], forced: [],
      });
      ui.pending.boardPeek = true;
      ui.pending.attackTarget = opponent;
      ui.render();
      result = { sourceId: first.iid, clickId: second.iid, targetId: walker.iid };
    } else if (modeName === 'block') {
      const attacker = put('Riders of Gavony', opponent);
      const blocker = put('Stormcatch Mentor', you);
      attacker.attacking = you;
      attacker.tapped = true;
      game.turnPlayer = opponent;
      game.phase = 'combat';
      game.step = 'blockers';
      game.combat = { attackers: [attacker], defenders: new Map() };
      game.recalc();
      waitForDecision({ type: 'blockers', attackers: [attacker], potential: [blocker] });
      ui.pending.boardPeek = true;
      ui.pending.mode = attacker;
      ui.render();
      result = { sourceId: blocker.iid, targetId: attacker.iid };
    } else throw new Error(`Unknown Arena drag fixture: ${modeName}`);

    return { ...result, enabled: ui.arenaDragEnabled };
  }, mode);
}

async function pointerDrag(source, target, screenshot) {
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  assert.ok(from && to, 'drag endpoints must be visible');
  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const end = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 12, start.y - 10, { steps: 3 });
  await page.waitForTimeout(80);
  if (screenshot) await page.screenshot({ path: `${output}/${screenshot}` });
  await page.mouse.move(end.x, end.y, { steps: 10 });
  await page.waitForTimeout(80);
  await page.mouse.up();
  await page.waitForTimeout(420);
}

async function touchPointerDrag(source, target) {
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  assert.ok(from && to, 'touch drag endpoints must be visible');
  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const end = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
  const pointer = { pointerId: 41, pointerType: 'touch', isPrimary: true, button: 0, buttons: 1 };
  await source.dispatchEvent('pointerdown', { ...pointer, clientX: start.x, clientY: start.y, bubbles: true, cancelable: true });
  await page.waitForTimeout(220);
  await page.evaluate(({ pointer, end }) => {
    window.dispatchEvent(new PointerEvent('pointermove', { ...pointer, clientX: end.x, clientY: end.y, bubbles: true, cancelable: true }));
    window.dispatchEvent(new PointerEvent('pointerup', { ...pointer, buttons: 0, clientX: end.x, clientY: end.y, bubbles: true, cancelable: true }));
  }, { pointer, end });
  await page.waitForTimeout(500);
}

const results = [];
try {
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await waitForShell();
  await page.locator('[data-menu-action="solo"]').first().click();
  await waitForApp();
  await page.locator('.advancedrules summary').click();
  const toggle = page.locator('.arenadragsetup input');
  assert.equal(await toggle.isChecked(), false, 'Arena drag defaults off');
  assert.equal(await page.evaluate(() => localStorage.getItem('mtgArenaDrag')), null);
  await toggle.check();
  assert.equal(await page.evaluate(() => localStorage.getItem('mtgArenaDrag')), '1');
  await page.screenshot({ path: `${output}/01-advanced-rule-enabled.png` });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForShell();
  await page.locator('[data-menu-action="solo"]').first().click();
  await waitForApp();
  await page.locator('.advancedrules summary').click();
  assert.equal(await page.locator('.arenadragsetup input').isChecked(), true, 'toggle persists across reload');
  results.push({ scenario: 'sticky-toggle', defaultOff: true, persisted: true });

  const cast = await installScenario('cast');
  assert.equal(cast.enabled, true);
  // Hand cards use cname rather than iid in the current DOM.
  const actualCastSource = page.locator('.hcard[data-cname="Swords to Plowshares"]');
  assert.equal(await actualCastSource.getAttribute('data-arena-source'), 'cast');
  await actualCastSource.click();
  await page.locator('.sheet').waitFor();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  assert.equal(await page.locator('.sheet').count(), 0, 'ordinary click still opens and closes the card sheet');
  await pointerDrag(actualCastSource, page.locator(`.mini[data-iid="${cast.targetId}"]`), '02-cast-drag-active.png');
  await page.waitForFunction(() => window.__arenaOutcome?.performed === true && window._game.stack.length === 1);
  const castState = JSON.parse(await page.evaluate(() => render_game_to_text()));
  assert.equal(castState.stack[0].name, 'Swords to Plowshares');
  assert.deepEqual(castState.stack[0].targets.map(target => target.name), ['Riders of Gavony']);
  assert.equal(await page.locator('.sheet').count(), 0, 'compatibility click after drag is suppressed');
  await page.screenshot({ path: `${output}/03-cast-direct-target.png` });
  results.push({ scenario: 'cast-to-direct-target', stackTarget: castState.stack[0].targets[0].name, clickStillWorks: true });

  const land = await installScenario('land');
  const landSource = page.locator('.hcard[data-cname="Forest"]');
  await pointerDrag(landSource, page.locator(`.mini[data-iid="${land.invalidId}"]`));
  let landState = JSON.parse(await page.evaluate(() => render_game_to_text()));
  assert.equal(landState.players.find(player => !player.isAI).hand.some(card => card.name === 'Forest'), true);
  assert.equal(landState.pending.type, 'main', 'invalid target does not consume the action');
  await page.waitForTimeout(1900);
  await pointerDrag(landSource, page.locator('.resourcezone'));
  await page.waitForFunction(() => window.__arenaOutcome?.performed === true);
  landState = JSON.parse(await page.evaluate(() => render_game_to_text()));
  assert.equal(landState.players.find(player => !player.isAI).battlefield.some(card => card.name === 'Forest'), true);
  await page.screenshot({ path: `${output}/04-land-drop.png` });
  results.push({ scenario: 'land-and-invalid-drop', invalidPreservedState: true, landPlayed: true });

  const attack = await installScenario('attack');
  await pointerDrag(page.locator(`.mini[data-iid="${attack.sourceId}"]`), page.locator(`.mini[data-iid="${attack.targetId}"]`));
  let attackState = JSON.parse(await page.evaluate(() => render_game_to_text()));
  assert.deepEqual(attackState.pendingDecision.assignments, [{ card: 'Riders of Gavony', target: "Vraska, Betrayal's Sting" }]);
  assert.equal(await page.locator('[data-testid="confirm-combat-battlefield"]').count(), 1, 'drag assignment still awaits atomic confirmation');
  await page.locator(`.mini[data-iid="${attack.clickId}"]`).click();
  attackState = JSON.parse(await page.evaluate(() => render_game_to_text()));
  assert.equal(attackState.pendingDecision.assignments.length, 2, 'click assignment coexists with drag');
  await page.locator(`.mini[data-iid="${attack.clickId}"]`).click();
  await page.mouse.move(1380, 950);
  await page.waitForTimeout(80);
  await page.screenshot({ path: `${output}/05-attack-assigned-before-confirm.png` });
  await page.locator('[data-testid="confirm-combat-battlefield"]').click();
  await page.waitForFunction(() => Array.isArray(window.__arenaOutcome?.answer));
  assert.equal(await page.evaluate(() => window.__arenaOutcome.answer.length), 1);
  results.push({ scenario: 'battlefield-attack', directPlaneswalker: true, finalConfirmRetained: true, clickStillWorks: true });

  const block = await installScenario('block');
  await pointerDrag(page.locator(`.mini[data-iid="${block.sourceId}"]`), page.locator(`.mini[data-iid="${block.targetId}"]`));
  const blockState = JSON.parse(await page.evaluate(() => render_game_to_text()));
  assert.deepEqual(blockState.pendingDecision.assignments, [{ card: 'Stormcatch Mentor', target: 'Riders of Gavony' }]);
  assert.equal(await page.locator('.promptbar .pbtn.primary').count() > 0, true, 'block remains pending until confirmation');
  await page.mouse.move(1380, 950);
  await page.waitForTimeout(80);
  await page.screenshot({ path: `${output}/06-block-assigned-before-confirm.png` });
  await page.getByRole('button', { name: /Confirm blocks/ }).click();
  await page.waitForFunction(() => Array.isArray(window.__arenaOutcome?.answer));
  assert.equal(await page.evaluate(() => window.__arenaOutcome.answer.length), 1);
  results.push({ scenario: 'battlefield-block', assigned: true, finalConfirmRetained: true });

  await page.setViewportSize({ width: 430, height: 900 });
  await installScenario('land');
  const touchLand = page.locator('.hcard[data-cname="Forest"]');
  await touchPointerDrag(touchLand, page.locator('.resourcezone'));
  await page.waitForFunction(() => window.__arenaOutcome?.performed === true);
  const touchState = JSON.parse(await page.evaluate(() => render_game_to_text()));
  assert.equal(touchState.players.find(player => !player.isAI).battlefield.some(card => card.name === 'Forest'), true);
  await page.screenshot({ path: `${output}/07-touch-land-drop-mobile.png` });
  results.push({ scenario: 'touch-pointer-land', longPressDrag: true, landPlayed: true });

  writeFileSync(`${output}/results.json`, JSON.stringify({ results, errors }, null, 2));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ results, errors }, null, 2));
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
