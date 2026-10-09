// A bounded mobile audit of native engine questions, real clicks, paid costs
// and resolution. The fixtures set starting positions; no rules or decisions
// are replaced with scripted answers.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createAccountHandler, MemoryAccountStore } from '../../api/account.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = `${root}output/engine-gap-audit-2026-10-09/browser`;
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
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await page.addInitScript(() => {
  localStorage.setItem('mtgOnboardingComplete', '1');
  localStorage.setItem('mtgReducedMotion', '1');
  localStorage.setItem('mtgManaMode', 'auto');
  localStorage.setItem('mtgStopProfile', 'end');
});

const scenarios = [
  { label: 'fifth-activation', source: 'Staff of Domination', zone: 'battlefield', route: 'priority', lands: Array(5).fill('Forest'), action: /Draw a card/ },
  { label: 'opponent-graveyard', source: 'Scavenging Ooze', zone: 'battlefield', route: 'priority', lands: ['Forest'], action: /Exile a graveyard/ },
  { label: 'sacrifice-target-cost', source: 'Goblin Bombardment', zone: 'battlefield', route: 'priority', lands: [], action: /Sacrifice a creature/ },
  { label: 'monstrosity-x', source: 'Death Kiss', zone: 'battlefield', route: 'priority', lands: ['Mountain', 'Forest', 'Forest', 'Forest', 'Forest'], action: /Monstrosity X/, x: 2 },
  { label: 'explosion-two-targets', source: 'Expansion // Explosion', zone: 'hand', route: 'priority', lands: ['Island', 'Island', 'Mountain', 'Mountain', 'Forest', 'Forest'], action: /^Explosion/, x: 2 },
  { label: 'adventure-exile', source: 'Bonecrusher Giant', zone: 'hand', route: 'priority', lands: ['Mountain', 'Forest', 'Mountain', 'Forest', 'Forest'], action: /^Adventure: Stomp/ },
  { label: 'mdfc-land-face', source: 'Valakut Awakening', zone: 'hand', route: 'main', lands: [], action: /^Play land/ },
  { label: 'counter-stack-target', source: 'Counterspell', zone: 'hand', route: 'opponentCast', lands: ['Island', 'Island'], action: /^Cast/ },
  { label: 'teferi-opponent-loyalty', source: 'Teferi, Master of Time', zone: 'battlefield', route: 'priority', lands: [], action: /\+1: Draw a card/ },
  { label: 'native-megamorph', source: 'Den Protector', zone: 'hand', route: 'main', lands: Array(5).fill('Forest'), action: /^Cast face down/ },
  { label: 'etali-free-adventure-choice', source: 'Etali, Primal Storm', zone: 'battlefield', route: 'combat', lands: [] },
];

async function state() {
  return page.evaluate(() => {
    const a = __gap, ui = _ui, g = _game, q = ui.pending?.q || ui.react?.q;
    const card = c => c && ({ iid: c.iid, name: c.name, zone: c.zone, tapped: c.tapped, faceDown: c.faceDown,
      power: c.power, toughness: c.toughness, counters: { ...c.counters }, meta: { monstrous: c.meta.monstrous, adventureExiled: c.meta.adventureExiled },
      colors: [...c.colors], subtypes: [...(c.cur?.subtypes || c.def.subtypes || [])], manaValue: c.mv,
      land: c.is('Land'), creature: c.is('Creature'), manaSpent: c.castMeta?.manaSpent, adventureCast: c.castMeta?.alt?.adventure });
    return { done: a.done, error: a.error, source: card(a.source), target: card(a.target), sacrifice: card(a.sacrifice), opponentSpell: card(a.opponentSpell),
      hit: card(a.hit), control: card(a.control), question: q?.type, pending: ui.pending?.q.type, reaction: !!ui.react, prompt: q?.prompt, hint: q?.aiHint?.kind,
      min: q?.min, max: q?.max, targetStep: q?.targetStep, selected: ui.pending?.sel.length || 0,
      choices: q?.from?.map(card), options: q?.options?.map(o => ({ key: o.key, label: o.label })),
      candidates: q?.candidates?.map(c => ({ iid: c.iid, name: c.name, kind: c.kind, zone: c.zone, player: c instanceof MTG.Player, mine: c === a.human })),
      activations: a.activations, casts: a.casts, questions: a.questions, lands: a.lands.map(card),
      hand: a.human.hand.map(c => c.name), graveyard: a.human.graveyard.map(c => c.name), libraryCount: a.human.library.length, life: g.players.map(p => p.life), stack: g.stack.map(s => s.name),
      fallback: !!g._decisionFallbacks || (g.aiDecisionLog || []).some(row => row.fallback),
      phase: g.phase, step: g.step, ownTurn: g.turnPlayer === a.human, botSeat: a.bot.idx,
    };
  });
}

async function fixture(scenario) {
  await page.evaluate(scenario => {
    const old = document.querySelector('#game'); old.replaceWith(old.cloneNode(false));
    document.querySelector('#setup').style.display = 'none'; document.querySelector('#game').style.display = 'flex';
    document.body.classList.add('game-active');
    const ui = new MTG.UI(), g = new MTG.Game({ seed: 102709, paced: true, onEvent: () => ui.queueRender() });
    const human = g.addPlayer('You', { name: 'Engine gap audit' }, null, false);
    const bot = g.addPlayer('Native AI', { name: 'Quick Draw' }, null, true);
    ui.game = g; ui.me = human; ui.prioMode = 'end'; human.controller = ui.controllerFor(human);
    bot.controller = new MTG.AIController(bot, { difficulty: 'normal', style: 'aggressive' });
    g.turnPlayer = human; g.turnNo = 9; g.phase = scenario.route === 'main' ? 'main1' : 'combat';
    g.step = scenario.route === 'main' ? 'main' : 'blockers'; g.speedFactor = 0;
    g.combat = { attackers: [], defenders: new Map(), blockersDeclared: true, hadAttackers: false };
    window._game = g; window._ui = ui;
    const put = (name, owner = human, zone = 'battlefield') => {
      if (!MTG.DEFS[name]) throw new Error(`Missing native definition: ${name}`);
      const c = new MTG.CardInst(MTG.DEFS[name], owner); c.zone = zone; c.ctrl = owner; c.sick = false;
      (zone === 'battlefield' ? g.battlefield : owner[zone]).push(c); return c;
    };
    for (const player of [human, bot]) for (let n = 0; n < 20; n++) put('Forest', player, 'library');
    const source = put(scenario.source, human, scenario.zone), lands = scenario.lands.map(name => put(name));
    const a = window.__gap = { human, bot, source, lands, target: null, sacrifice: null, opponentSpell: null,
      done: false, error: null, activations: [], casts: [], questions: [] };
    if (scenario.label === 'fifth-activation') a.target = put('Grizzly Bears');
    if (scenario.label === 'opponent-graveyard') a.target = put('Grizzly Bears', bot, 'graveyard');
    if (scenario.label === 'sacrifice-target-cost') { a.sacrifice = put('Ornithopter'); a.target = put('Llanowar Elves', bot); }
    if (['explosion-two-targets', 'adventure-exile', 'monstrosity-x'].includes(scenario.label)) a.target = put('Grizzly Bears', bot);
    if (scenario.label === 'counter-stack-target') { a.opponentSpell = put('Lightning Bolt', bot, 'hand'); put('Mountain', bot); g.turnPlayer = bot; }
    if (scenario.label === 'teferi-opponent-loyalty') { source.counters.loyalty = 3; g.turnPlayer = bot; }
    if (scenario.label === 'native-megamorph') a.target = put('Ponder', human, 'graveyard');
    if (scenario.label === 'etali-free-adventure-choice') { a.hit = put('Bonecrusher Giant', human, 'library'); a.control = put('Grizzly Bears', bot, 'library'); }
    g.recalc();
    const decide = human.controller.decide.bind(human.controller);
    human.controller.decide = async (game, q) => {
      a.questions.push({ type: q.type, phase: game.phase, step: game.step, prompt: q.prompt, hint: q.aiHint?.kind,
        offeredActs: (q.acts || []).filter(e => e.card === source).map(e => ui.activationLabel(e)),
        options: q.options?.map(o => ({ key: o.key, label: o.label })),
        offeredCasts: (q.casts || []).filter(e => e.card === source).map(e => ({ name: e.alt?.name, label: e.alt?.label, from: e.from })) });
      return decide(game, q);
    };
    const activate = g.activateAbility;
    g.activateAbility = async function (p, entry) {
      const label = ui.activationLabel(entry), ok = await activate.call(this, p, entry);
      if (this === g && entry.card === source) a.activations.push({ label, ok });
      return ok;
    };
    const cast = g.castSpell;
    g.castSpell = async function (p, card, opts) {
      const from = card.zone, name = opts?.name, ok = await cast.call(this, p, card, opts);
      if (this === g && (card === source || card === a.hit || card === a.control)) a.casts.push({ from, name, ok, card: card.name });
      return ok;
    };
    const run = scenario.route === 'combat' ? g.combatPhase(human) : scenario.route === 'main' ? g.mainPhase(human) : scenario.route === 'opponentCast'
      ? g.castSpell(bot, a.opponentSpell, {}) : g.priorityRound(human);
    void run.then(() => { a.done = true; ui.render(); }).catch(error => { a.error = error.stack; });
    ui.render();
  }, { ...scenario, action: undefined });
}

async function progress(scenario) {
  const s = await state(); assert.equal(s.error, null);
  if (s.pending === 'chooseX') {
    const desired = scenario.x ?? s.min;
    for (let n = 0; n < 15; n++) {
      const current = Number(await page.locator('.modal .xval').innerText());
      if (current === desired) break;
      await page.locator('.modal .xrow button').nth(current < desired ? 1 : 0).click();
    }
    await page.getByRole('button', { name: /^Confirm X=/ }).click();
  } else if (s.pending === 'chooseOption') {
    if (scenario.label === 'etali-free-adventure-choice' && s.hint === 'oracleSpellFace') {
      assert.ok(s.options.some(o => /Stomp/.test(o.label)), 'the native free-cast face choice includes the Adventure');
      await shot(`${scenario.label}-face-choice`);
    }
    const option = scenario.label === 'etali-free-adventure-choice'
      ? s.options.find(o => /Stomp/.test(o.label)) || s.options.find(o => o.key === 'yes') || s.options[0]
      : s.options.find(o => /Valakut Stoneforge/.test(o.label)) || s.options.find(o => /Decline|No\b/.test(o.label)) || s.options[0];
    await page.locator(`.modal [data-choice-key="${option.key}"]`).click();
  } else if (s.pending === 'chooseMulti') {
    await page.locator('.modal .pbtn.wide:not(.primary)').first().click();
    await page.getByRole('button', { name: /^Confirm \(/ }).last().click();
  } else if (s.pending === 'chooseCards') {
    const wanted = s.hint === 'sacCreature' || /sacrific/i.test(s.prompt || '') ? s.sacrifice?.iid : null;
    const choices = wanted ? s.choices.filter(c => c.iid === wanted) : s.choices.slice(0, s.min);
    for (const c of choices.slice(s.selected)) await page.locator(`.modal .bigcard[data-card-name="${c.name}"]`).first().click();
    const confirm = page.getByRole('button', { name: /^Confirm.*\(/ }).filter({ visible: true }).last();
    if (await confirm.count()) await confirm.click();
    else await page.getByRole('button', { name: /^None$/ }).click();
  } else if (s.pending === 'chooseTargets') {
    assert.equal(await page.evaluate(() => _ui.actionQuestion()), null);
    if (!s.selected && !(s.min === 0 && !s.candidates.length)) {
      const wanted = scenario.label === 'etali-free-adventure-choice' ? s.candidates.find(c => c.player && !c.mine)
        : s.candidates.find(c => c.iid === s.target?.iid) || s.candidates.find(c => c.kind === 'spell') || s.candidates.find(c => c.player && c.mine) || s.candidates[0];
      assert.ok(wanted, 'printed target has a native candidate');
      if (wanted.zone === 'graveyard') {
        await page.locator('.targetzoneopen[data-target-zone="graveyard"]').filter({ visible: true }).first().click();
        await page.locator(`.sheet .bigcard[data-card-name="${wanted.name}"].targetable`).click();
      } else if (wanted.kind) {
        await page.locator('.mobileviewtab[data-view="stack"]').click();
        await page.locator('.sidebar .stackitem.targetable').filter({ visible: true }).first().click();
      }
      else if (wanted.player) {
        const target = page.locator(wanted.mine ? '.melife.targetable' : '.opphead.targetable').filter({ visible: true }).first();
        if (!(await target.count())) await page.locator(`.mobileviewtab[data-view="${wanted.mine ? 'mine' : 'table'}"]`).click();
        await target.click();
      } else {
        const target = page.locator(`.mini.targetable[data-iid="${wanted.iid}"]`).filter({ visible: true }).first();
        if (!(await target.count())) await page.locator('.mobileviewtab[data-view="table"]').click();
        await target.click();
      }
    }
    if (await page.evaluate(() => _ui.pending?.q.type === 'chooseTargets')) await page.locator('.targetpromptactions .primary:not(:disabled)').click();
  } else if (s.pending === 'attackers') {
    const assigned = await page.evaluate(() => _ui.pending.sel.length);
    if (!assigned) {
      await page.locator(`.ct-mobile-combat-card[data-iid="${s.source.iid}"]:visible, .mini.ct-combat-pick[data-iid="${s.source.iid}"]:visible`).first().click();
      await page.locator(`[data-combat-defender="player-${s.botSeat}"]`).filter({ visible: true }).click();
    }
    await page.locator('[data-testid="confirm-combat-battlefield"]').click();
  } else if (s.pending === 'combatReview') {
    await page.locator('[data-testid="confirm-combat-battlefield"]').click();
  } else {
    const proceed = page.getByRole('button', { name: /^(Proceed|Pass|Resolve|Continue|End turn|Got it|Confirm order|No attacks)/ }).filter({ visible: true });
    if (await proceed.count()) await proceed.last().click();
  }
  await page.waitForTimeout(25);
}

async function shot(label) {
  await page.screenshot({ path: `${output}/${label}.png`, animations: 'disabled' });
  writeFileSync(`${output}/${label}.json`, JSON.stringify(await state(), null, 2) + '\n');
}

try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator('[data-menu-action="solo"]').first().click();
  await page.waitForSelector('.deckentry:visible');
  for (const scenario of scenarios) {
    await fixture(scenario);
    if (scenario.route === 'combat') {
      const before = await state();
      for (let n = 0; n < 180 && !(await state()).done; n++) await progress(scenario);
      const result = await state(); assert.equal(result.error, null); assert.equal(result.done, true);
      assert.equal(result.hit.zone, 'exile'); assert.equal(result.hit.meta.adventureExiled, true);
      assert.equal(result.hit.adventureCast, true); assert.equal(result.hit.manaSpent, 0);
      assert.equal(result.control.zone, 'battlefield'); assert.equal(result.control.manaSpent, 0);
      assert.deepEqual(result.life, [40, 32]); assert.ok(result.casts.every(row => row.ok));
      assert.ok(result.questions.some(q => q.hint === 'oracleSpellFace' && q.options?.some(o => /Stomp/.test(o.label))));
      assert.deepEqual(result.stack, []); assert.equal(result.fallback, false);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      await shot(`${scenario.label}-resolved`); results.push({ label: scenario.label, before, result });
      console.log(`PASS ${scenario.label}: native attack trigger, free Adventure choice and effect`);
      continue;
    }
    for (let n = 0; n < 100 && !(await page.evaluate(() => !!_ui.actionQuestion())); n++) await progress(scenario);
    assert.equal(await page.evaluate(() => !!_ui.actionQuestion()), true, `${scenario.label}: native action window is reached`);
    const before = await state(); assert.equal(before.error, null);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    const openResponses = page.locator('.actionrespond').filter({ visible: true });
    if (await openResponses.count()) await openResponses.click();
    await page.locator('.mobileviewtab[data-view="mine"]').click();
    if (before.source.zone === 'hand') await page.locator(`.hand .hcard[data-iid="${before.source.iid}"]`).click();
    else await page.locator(`.mini[data-iid="${before.source.iid}"]`).filter({ visible: true }).first().click();
    await page.locator('.sheet').waitFor();
    const action = page.locator('.sheetacts button:not(:disabled)').filter({ hasText: scenario.action }).first();
    assert.equal(await action.count(), 1, `${scenario.label}: the legal native action is visible`);
    if (scenario.label === 'fifth-activation') assert.equal(await page.locator('.sheetacts .abilitybtn:not(:disabled)').count(), 5);
    await shot(`${scenario.label}-available`);
    await action.click();
    let intermediate;
    if (scenario.label === 'native-megamorph') {
      for (let n = 0; n < 150; n++) {
        const s = await state(); assert.equal(s.error, null);
        if (s.source.zone === 'battlefield' && s.source.faceDown && s.pending === 'main') { intermediate = s; break; }
        assert.equal(s.done, false, 'the paid face-down spell returns to the native main phase');
        await progress(scenario);
      }
      assert.ok(intermediate); assert.equal(intermediate.source.faceDown, true);
      assert.equal(intermediate.source.power, 2); assert.equal(intermediate.source.toughness, 2);
      assert.equal(intermediate.source.manaValue, 0); assert.deepEqual(intermediate.source.colors, []);
      assert.deepEqual(intermediate.source.subtypes, []); assert.equal(intermediate.source.manaSpent, 3);
      assert.equal(intermediate.lands.filter(c => c.tapped).length, 3);
      await shot(`${scenario.label}-face-down`);
      await page.locator('.faceupactions button').click();
    }
    for (let n = 0; n < 150 && !(await state()).done; n++) await progress(scenario);
    let result = await state(); assert.equal(result.error, null); assert.equal(result.done, true, `${scenario.label}: native action completes`);
    assert.equal(result.fallback, false); assert.deepEqual(result.stack, []);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    if (scenario.label === 'fifth-activation') { assert.equal(result.source.tapped, true); assert.deepEqual(result.hand, ['Forest']); assert.ok(result.lands.every(c => c.tapped)); }
    if (scenario.label === 'opponent-graveyard') { assert.equal(result.target.zone, 'exile'); assert.equal(result.source.counters['+1/+1'], 1); assert.deepEqual(result.life, [41, 40]); }
    if (scenario.label === 'sacrifice-target-cost') { assert.equal(result.sacrifice.zone, 'graveyard'); assert.equal(result.target.zone, 'graveyard'); }
    if (scenario.label === 'monstrosity-x') { assert.equal(result.source.counters['+1/+1'], 2); assert.ok(result.lands.every(c => c.tapped)); }
    if (scenario.label === 'explosion-two-targets') { assert.equal(result.target.zone, 'graveyard'); assert.deepEqual(result.hand, ['Forest', 'Forest']); assert.ok(result.lands.every(c => c.tapped)); }
    if (scenario.label === 'adventure-exile') {
      assert.equal(result.source.zone, 'exile'); assert.equal(result.source.meta.adventureExiled, true); assert.equal(result.target.zone, 'graveyard');
      await shot(`${scenario.label}-adventure-resolved`);
      await page.evaluate(() => {
        _game.phase = 'main2'; _game.step = 'main'; __gap.done = false;
        void _game.mainPhase(__gap.human).then(() => { __gap.done = true; _ui.render(); }).catch(error => { __gap.error = error.stack; });
      });
      await page.waitForFunction(() => _ui.pending?.q.type === 'main' || __gap.error);
      assert.equal(await page.evaluate(() => _ui.actionQuestion().casts.some(e => e.card === __gap.source && e.from === 'exile')), true,
        'the native adventure permission offers the creature from exile');
      await page.locator('.offzone button').filter({ hasText: 'Bonecrusher Giant' }).click();
      for (let n = 0; n < 150 && !(await state()).done; n++) await progress(scenario);
      result = await state(); assert.equal(result.error, null); assert.equal(result.done, true);
      assert.equal(result.source.zone, 'battlefield'); assert.equal(result.source.creature, true);
      assert.equal(result.casts.length, 2); assert.ok(result.casts.every(row => row.ok));
      assert.equal(result.casts[1].from, 'exile'); assert.ok(result.lands.every(card => card.tapped));
      assert.deepEqual(result.stack, []); assert.equal(result.fallback, false);
    }
    if (scenario.label === 'mdfc-land-face') { assert.equal(result.source.zone, 'battlefield'); assert.equal(result.source.name, 'Valakut Stoneforge'); assert.equal(result.source.land, true); assert.equal(result.source.tapped, true); }
    if (scenario.label === 'counter-stack-target') { assert.equal(result.opponentSpell.zone, 'graveyard'); assert.deepEqual(result.life, [40, 40]); assert.equal(result.source.zone, 'graveyard'); }
    if (scenario.label === 'teferi-opponent-loyalty') {
      assert.equal(before.ownTurn, false); assert.equal(result.source.counters.loyalty, 4);
      assert.deepEqual(result.hand, []); assert.deepEqual(result.graveyard, ['Forest']); assert.equal(result.libraryCount, before.libraryCount - 1); assert.equal(result.activations.length, 1); assert.equal(result.activations[0].ok, true);
      assert.equal(await page.evaluate(() => _game.activatableList(__gap.human, true).some(e => e.card === __gap.source)), false,
        'the timing exception still permits only one loyalty action per turn');
    }
    if (scenario.label === 'native-megamorph') {
      assert.equal(result.source.faceDown, false); assert.equal(result.source.power, 3); assert.equal(result.source.toughness, 2);
      assert.deepEqual(result.source.colors, ['G']); assert.deepEqual(result.source.subtypes, ['Human', 'Warrior']);
      assert.equal(result.source.manaValue, 2); assert.equal(result.target.zone, 'hand');
      assert.ok(result.lands.every(c => c.tapped)); assert.equal(result.casts.length, 1); assert.equal(result.casts[0].ok, true);
      assert.equal(result.activations.length, 1); assert.equal(result.activations[0].ok, true);
    }
    await shot(`${scenario.label}-resolved`); results.push({ label: scenario.label, before, intermediate, result });
    console.log(`PASS ${scenario.label}: mobile native action, payment and resolution`);
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
