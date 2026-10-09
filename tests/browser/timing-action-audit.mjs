// Focused mobile clicks use native cards, paid actions, real turns/combat and
// priority. Fixtures never replace an engine rule or a controller's answer.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createAccountHandler, MemoryAccountStore } from '../../api/account.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = `${root}output/timing-audit-2026-10-09/browser`;
mkdirSync(output, { recursive: true });
const server = express().use('/api/account', createAccountHandler({ store: new MemoryAccountStore(), limiter: null }))
  .use(express.static(root)).listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true,
  ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}),
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' });
const errors = [], results = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await page.addInitScript(() => {
  localStorage.setItem('mtgOnboardingComplete', '1');
  localStorage.setItem('mtgReducedMotion', '1');
  localStorage.setItem('mtgManaMode', 'auto');
  localStorage.setItem('mtgStopProfile', 'end');
});

const scenarios = [
  { label: 'forecast-upkeep', source: 'Proclamation of Rebirth', zone: 'hand', phase: 'upkeep', mode: 'off', route: 'turn', marker: 'handAbility', lands: Array(6).fill('Plains') },
  { label: 'dragon-upkeep', source: 'Eternal Dragon', zone: 'graveyard', phase: 'upkeep', mode: 'off', route: 'turn', marker: 'gyAbility', lands: Array(5).fill('Plains') },
  { label: 'cycling-combat', source: 'Drannith Healer', zone: 'hand', phase: 'combat', mode: 'end', route: 'priority', marker: 'cycling', lands: ['Forest'] },
  { label: 'morph-combat', source: 'Zoetic Cavern', zone: 'hand', phase: 'combat', mode: 'end', route: 'priority', marker: 'turnFaceUp', lands: ['Forest', 'Forest'] },
  { label: 'crew-before-blocks', source: 'Sky Skiff', zone: 'battlefield', phase: 'combat', mode: 'end', route: 'combat', marker: 'crew', lands: [] },
  { label: 'prepared-reaction', source: 'Inspired Skypainter', zone: 'battlefield', phase: 'combat', mode: 'end', route: 'priority', marker: 'prepared', lands: ['Island', 'Mountain', 'Forest', 'Forest', 'Forest'] },
];

async function state() {
  return page.evaluate(() => {
    const qa = __timing, g = _game, ui = _ui, q = ui.pending?.q || ui.react?.q;
    const card = c => c && ({ iid: c.iid, name: c.name, zone: c.zone, faceDown: c.faceDown, tapped: c.tapped,
      attacking: c.attacking?.name, blocking: c.blocking, damage: c.damage, creature: c.is('Creature'),
      land: c.is('Land'), prepared: c.meta.prepared, token: c.isToken, haste: c.kw('haste') });
    const options = (q?.acts || []).map(entry => ({ name: entry.card.name, label: ui.activationLabel(entry), zone: entry.card.zone,
      iid: entry.card.iid, marker: ['handAbility', 'gyAbility', 'cycling', 'turnFaceUp', 'crew'].find(key => entry[key]) }));
    return { done: qa.done, error: qa.error, mode: ui.prioMode, phase: g.phase, step: g.step,
      question: q?.type, hint: q?.aiHint?.kind, prompt: q?.prompt, reaction: !!ui.react,
      actionQuestion: !!ui.actionQuestion(), options, selected: ui.pending?.sel.length || 0,
      source: card(qa.source), target: card(qa.target), donor: card(qa.donor), enemy: card(qa.enemy),
      sourceIid: qa.source.iid, targetIid: qa.target?.iid, enemyIid: qa.enemy?.iid,
      castAttempts: qa.castAttempts, activations: qa.activations, resolutions: qa.resolutions, questions: qa.questions,
      wrongTiming: qa.wrongTiming, preparedWithoutFlash: qa.preparedWithoutFlash, staleButtonGuard: qa.staleButtonGuard,
      hand: qa.human.hand.map(c => c.name), paidLands: qa.lands.map(c => ({ name: c.name, tapped: c.tapped })),
      battlefield: g.bf().filter(c => c.ctrl === qa.human).map(card),
      life: g.players.map(p => p.life), stack: g.stack.map(item => item.name),
      fallback: !!g._decisionFallbacks || (g.aiDecisionLog || []).some(row => row.fallback),
    };
  });
}

async function shot(label) {
  await page.screenshot({ path: `${output}/${label}.png`, animations: 'disabled' });
  writeFileSync(`${output}/${label}.json`, JSON.stringify(await state(), null, 2) + '\n');
}

async function fixture(scenario) {
  await page.evaluate(async scenario => {
    const old = document.querySelector('#game'); old.replaceWith(old.cloneNode(false));
    document.querySelector('#setup').style.display = 'none'; document.querySelector('#game').style.display = 'flex';
    document.body.classList.add('game-active');
    const ui = new MTG.UI(), g = new MTG.Game({ seed: 102609, paced: true, onEvent: () => ui.queueRender() });
    const human = g.addPlayer('You', { name: 'Timing audit' }, null, false);
    const bot = g.addPlayer('Native AI', { name: 'Quick Draw' }, null, true);
    ui.game = g; ui.me = human; ui.prioMode = scenario.mode;
    human.controller = ui.controllerFor(human);
    bot.controller = new MTG.AIController(bot, { difficulty: 'normal', style: 'aggressive' });
    g.turnPlayer = human; g.turnNo = 8; g.phase = 'main1'; g.step = 'main'; g.speedFactor = 0;
    window._game = g; window._ui = ui;
    const put = (name, owner = human, zone = 'battlefield') => {
      if (!MTG.DEFS[name]) throw new Error(`Missing native definition: ${name}`);
      const c = new MTG.CardInst(MTG.DEFS[name], owner); c.zone = zone; c.ctrl = owner; c.sick = false;
      (zone === 'battlefield' ? g.battlefield : owner[zone]).push(c); return c;
    };
    for (const player of [human, bot]) for (let n = 0; n < 16; n++) put('Forest', player, 'library');
    const source = put(scenario.source, human, scenario.zone);
    const lands = scenario.lands.map(name => put(name));
    const qa = window.__timing = { human, source, lands, target: null, donor: null, enemy: null, spell: null,
      done: false, error: null, castAttempts: 0, activations: [], resolutions: [], questions: [], wrongTiming: [] };
    if (scenario.label === 'forecast-upkeep') qa.target = put('Ornithopter', human, 'graveyard');
    if (scenario.label === 'morph-combat') { await g.putFaceDown(human, source, 'morph'); source.sick = false; }
    if (scenario.label === 'crew-before-blocks') {
      qa.donor = put('Grizzly Bears'); qa.donor.sick = true;
      qa.enemy = put('Wind Drake', bot); g.turnPlayer = bot;
    }
    if (scenario.label === 'prepared-reaction') {
      qa.target = put('Grizzly Bears');
      qa.spell = MTG.E.prepareSpell(g, source, MTG.E.preparedSpellDefinitions["Maestro's Gift"]);
      g.phase = 'combat'; g.step = 'blockers'; g.recalc();
      qa.preparedWithoutFlash = !g.castableList(human).some(entry => entry.card === qa.spell);
      put('Vedalken Orrery');
    }
    g.recalc();
    if (scenario.route === 'turn') {
      for (const [phase, owner] of [['main1', human], ['draw', human], ['combat', human], ['upkeep', bot]]) {
        g.phase = phase; g.turnPlayer = owner;
        qa.wrongTiming.push({ phase, ownTurn: owner === human, offered: g.activatableList(human).some(entry => entry.card === source && entry[scenario.marker]) });
      }
      g.turnPlayer = human; g.phase = 'main1'; g.step = 'main';
    } else if (scenario.route === 'priority') {
      g.phase = scenario.phase; g.step = 'blockers';
      g.combat = { attackers: [], defenders: new Map(), blockersDeclared: true, hadAttackers: false };
    }
    const decide = human.controller.decide.bind(human.controller);
    human.controller.decide = async (game, q) => {
      qa.questions.push({ type: q.type, phase: game.phase, step: game.step,
        offered: (q.acts || []).some(entry => entry.card === source && entry[scenario.marker]) ||
          (q.casts || []).some(entry => entry.card === qa.spell), hint: q.aiHint?.kind });
      return decide(game, q);
    };
    const activate = g.activateAbility;
    g.activateAbility = async function (player, entry) {
      const phase = this.phase, step = this.step;
      const ok = await activate.call(this, player, entry);
      if (this === g && entry.card === source) qa.activations.push({ phase, step, ok, label: ui.activationLabel(entry) });
      return ok;
    };
    const cast = g.castSpell;
    g.castSpell = async function (player, card, ...args) {
      if (this === g && card === qa.spell) qa.castAttempts++;
      return cast.call(this, player, card, ...args);
    };
    const resolve = g.resolveTop;
    g.resolveTop = async function (...args) {
      const top = this.stack.at(-1), phase = this.phase, step = this.step;
      const own = top && (top.srcCard === source || top.ctx?.src === source || top.card === qa.spell);
      const answer = await resolve.apply(this, args);
      if (this === g && own) qa.resolutions.push({ phase, step, kind: top.kind, sourceZone: source.zone,
        targetZone: qa.target?.zone, faceDown: source.faceDown, prepared: source.meta.prepared,
        creature: source.is('Creature'), donorTapped: qa.donor?.tapped, paidLands: lands.filter(c => c.tapped).length });
      return answer;
    };
    const run = scenario.route === 'turn' ? g.runTurn() : scenario.route === 'combat' ? g.combatPhase(bot) : g.priorityRound(human);
    void run.then(() => { qa.done = true; ui.render(); }).catch(error => { qa.error = error.stack; });
    ui.render();
  }, scenario);
}

async function progress() {
  const s = await state();
  assert.equal(s.error, null);
  if (s.question === 'chooseTargets') {
    assert.equal(s.actionQuestion, false, 'a blocking target decision never exposes stale actions');
    const candidate = await page.evaluate(() => {
      const q = _ui.pending.q;
      const c = q.candidates.find(card => card === __timing.target) || q.candidates[0];
      return c && { iid: c.iid, name: c.name, zone: c.zone };
    });
    assert.ok(candidate, 'the printed target has a legal candidate');
    if (!s.selected) {
      if (candidate.zone === 'graveyard') {
        await page.getByRole('button', { name: /^Open your graveyard/ }).filter({ visible: true }).first().click();
        await page.locator(`.sheet .bigcard[data-card-name="${candidate.name}"]`).click();
      } else await page.locator(`.mini.targetable[data-iid="${candidate.iid}"]`).filter({ visible: true }).first().click();
    }
    if (await page.evaluate(() => _ui.pending?.q.type === 'chooseTargets')) {
      await page.locator('.promptbar .pbtn.primary:not(:disabled)').last().click();
    }
  } else if (s.question === 'chooseCards') {
    assert.equal(s.actionQuestion, false);
    const name = s.hint === 'crew' ? 'Grizzly Bears' : await page.evaluate(() => _ui.pending.q.from[0]?.name);
    if (!s.selected) await page.locator(`.cardgrid .bigcard[data-card-name="${name}"]`).first().click();
    await page.getByRole('button', { name: /^Confirm.*\(1\)/ }).click();
  } else if (s.question === 'blockers') {
    const ready = await page.evaluate(() => _ui.blockAssignments().length);
    if (!ready) {
      await page.locator(`[data-combat-attacker="${s.enemyIid}"]`).tap();
      await page.locator(`.ct-mobile-combat-card[data-iid="${s.sourceIid}"]:visible, .mini[data-iid="${s.sourceIid}"]:visible`).first().tap();
    }
    await page.locator('[data-testid="confirm-combat-battlefield"]').tap();
  } else if (s.question === 'combatReview' || s.question === 'attackers') {
    await page.locator('[data-testid="confirm-combat-battlefield"]').tap();
  } else {
    const proceed = page.getByRole('button', { name: /^(Proceed|Pass|Resolve|Continue|End turn|Got it|Confirm order|No attacks)/ }).filter({ visible: true });
    if (await proceed.count()) await proceed.last().click();
  }
  await page.waitForTimeout(25);
}

async function ready(scenario) {
  for (let n = 0; n < 100; n++) {
    const s = await state(); assert.equal(s.error, null);
    const offered = scenario.marker === 'prepared'
      ? await page.evaluate(() => !!_ui.actionQuestion()?.casts?.some(entry => entry.card === __timing.spell))
      : s.options.some(entry => entry.iid === s.sourceIid && entry.marker === scenario.marker);
    if (offered && s.phase === scenario.phase && (scenario.route !== 'combat' || s.step === 'attackers')) return s;
    assert.equal(s.done, false, `${scenario.label}: required action window was skipped`);
    await progress();
  }
  throw new Error(`${scenario.label}: no action window`);
}

try {
  await page.goto(base); await page.locator('[data-menu-action="solo"]').first().click();
  await page.waitForSelector('.deckentry:visible');
  for (const scenario of scenarios) {
    await fixture(scenario);
    const before = await ready(scenario);
    assert.equal(before.mode, scenario.mode);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    assert.ok(before.wrongTiming.every(row => !row.offered), 'upkeep abilities remain unavailable outside their own upkeep');
    if (scenario.zone === 'hand' && scenario.marker !== 'turnFaceUp') {
      assert.equal(await page.locator(`.hand .hcard[data-iid="${before.sourceIid}"]`).getAttribute('class').then(value => value.includes('castable')), true, 'reaction preserves hand action highlighting');
    }
    if (scenario.marker === 'turnFaceUp') {
      assert.equal(await page.locator(`.mini[data-iid="${before.sourceIid}"] .faceupready`).count(), 1);
    }
    if (scenario.marker === 'prepared') {
      assert.equal(before.reaction, true);
      assert.equal(before.preparedWithoutFlash, true, 'the printed flash grant is necessary for this sorcery');
      const source = page.locator(`.mini[data-iid="${before.sourceIid}"]`);
      assert.equal(await source.getAttribute('class').then(value => value.includes('prepared-castable')), true);
      await source.click();
      const cast = page.locator('.preparedcast:not(:disabled)');
      assert.equal(await cast.count(), 1, 'prepared source has one legal cast button during reaction');
      await cast.evaluate(button => { __timing.stalePreparedButton = button; });
      await shot(`${scenario.label}-available`);
      await cast.click();
      await page.waitForFunction(() => _ui.pending?.q.type === 'chooseTargets' || __timing.error);
      assert.equal(await page.evaluate(() => _ui.actionQuestion()), null);
      await page.evaluate(() => __timing.stalePreparedButton.click());
      assert.equal(await page.evaluate(() => _ui.pending.q.type), 'chooseTargets', 'stale cast button leaves the blocking target decision intact');
      assert.equal(await page.evaluate(() => __timing.castAttempts), 1, 'a stale button does not start a second cast');
      await page.evaluate(() => { __timing.staleButtonGuard = true; });
    } else {
      const option = before.options.find(entry => entry.iid === before.sourceIid && entry.marker === scenario.marker);
      const ability = page.locator('.priorityabilities button').filter({ hasText: option.name }).filter({ visible: true }).first();
      assert.equal(await ability.count(), 1, 'the legal timed/zone action has a direct visible button');
      await shot(`${scenario.label}-available`);
      await ability.click();
    }
    for (let n = 0; n < 150 && !(await state()).done; n++) await progress();
    const result = await state();
    assert.equal(result.error, null); assert.equal(result.done, true);
    assert.equal(result.fallback, false); assert.deepEqual(result.stack, []);
    assert.ok(result.paidLands.every(card => card.tapped), 'all required native mana sources were used');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    if (scenario.marker === 'prepared') {
      assert.equal(result.castAttempts, 1); assert.equal(result.source.prepared, false); assert.equal(result.staleButtonGuard, true);
      const bears = result.battlefield.filter(card => card.name === 'Grizzly Bears');
      assert.equal(bears.length, 2); assert.ok(bears.some(card => card.token && card.haste));
    } else {
      assert.equal(result.activations.length, 1); assert.equal(result.activations[0].ok, true);
      assert.equal(result.activations[0].phase, scenario.phase);
    }
    if (scenario.marker === 'handAbility') {
      assert.equal(result.source.zone, 'hand'); assert.equal(result.target.zone, 'battlefield');
      assert.ok(result.resolutions.some(row => row.phase === 'upkeep' && row.targetZone === 'battlefield' && row.paidLands === 6));
    }
    if (scenario.marker === 'gyAbility') {
      assert.equal(result.source.zone, 'hand');
      assert.ok(result.resolutions.some(row => row.phase === 'upkeep' && row.sourceZone === 'hand' && row.paidLands === 5));
    }
    if (scenario.marker === 'cycling') {
      assert.equal(result.source.zone, 'graveyard'); assert.deepEqual(result.hand, ['Forest']);
    }
    if (scenario.marker === 'turnFaceUp') {
      assert.equal(result.source.faceDown, false); assert.equal(result.source.name, 'Zoetic Cavern'); assert.equal(result.source.land, true);
    }
    if (scenario.marker === 'crew') {
      assert.equal(before.enemy.attacking, 'You'); assert.equal(result.donor.tapped, true);
      assert.equal(result.source.zone, 'battlefield'); assert.equal(result.source.creature, true); assert.equal(result.source.damage, 2);
      assert.equal(result.enemy.zone, 'graveyard'); assert.deepEqual(result.life, [40, 40]);
    }
    await shot(`${scenario.label}-resolved`);
    results.push({ scenario, before, result });
    console.log(`PASS ${scenario.label}: native window, visible action, actual payment and effect; mobile layout and guards`);
  }
  assert.deepEqual(errors, []);
  writeFileSync(`${output}/result.json`, JSON.stringify({ viewport: { width: 390, height: 844 }, results, browserErrors: errors, fullMatches: 0 }, null, 2) + '\n');
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` });
  writeFileSync(`${output}/failure.json`, JSON.stringify({ error: error.stack, state: await state().catch(() => null), browserErrors: errors }, null, 2) + '\n');
  throw error;
} finally {
  await browser.close(); await new Promise(resolve => server.close(resolve));
}
