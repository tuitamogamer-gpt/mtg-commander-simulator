// Controlled positions use native cards, native bot decisions and the complete
// paid combat/priority pipeline. No game methods or priority answers are stubbed.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createAccountHandler, MemoryAccountStore } from '../../api/account.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const baseline = process.env.YURIKO_BASELINE_DIRECTORY;
const output = process.env.YURIKO_OUTPUT || `${root}output/yuriko-ninjutsu-2026-10-09/${baseline ? 'baseline' : 'fixed'}`;
mkdirSync(output, { recursive: true });
const rawText = readFileSync(new URL('../fixtures/yuriko-custom-deck.txt', import.meta.url), 'utf8');
const deckText = rawText.trimEnd().replace(/1 Yuriko, the Tiger's Shadow$/, "1 Yuriko, the Tiger's Shadow *CMDR*");
const app = express();
app.use('/api/account', createAccountHandler({ store: new MemoryAccountStore(), limiter: null }));
if (baseline) for (const name of ['engine2.js', 'ui.js', 'scripts-c17-c19-turns.js']) {
  app.get(`/src/modules/${name}`, (_request, response) => response.sendFile(`${baseline}/${name}`, { dotfiles: 'allow' }));
}
app.use(express.static(root));
const server = app.listen(0, '127.0.0.1');
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

async function state() {
  return page.evaluate(() => {
    const qa = __yuriko, g = _game, ui = _ui;
    const q = ui.pending?.q || ui.react?.q;
    return {
      done: qa.done, error: qa.error, mode: ui.prioMode, sourceZone: qa.sourceZone,
      phase: g.phase, step: g.step, question: q?.type, hint: q?.aiHint?.kind,
      reaction: !!ui.react, options: (q?.acts || []).map(entry => ({ name: entry.card.name, ninjutsu: !!entry.ninjutsu, zone: entry.card.zone, cost: entry.ninjutsuCost })),
      attackers: g.combat?.attackers.map(card => ({ name: card.name, target: card.attacking?.name, blocked: card.wasBlocked, blockers: card.blockedBy.map(blocker => blocker.name) })) || [],
      yuriko: { zone: qa.yuriko.zone, onBattlefield: g.bf().includes(qa.yuriko), tapped: qa.yuriko.tapped, attacking: qa.yuriko.attacking?.name, commanderCasts: qa.yuriko.cmdCasts },
      outcast: { zone: qa.outcast.zone, attacking: qa.outcast.attacking?.name },
      manaMode: ui.manaMode, pool: { ...ui.me.pool },
      vaultZone: qa.vault?.zone,
      paidLands: qa.lands.map(card => ({ name: card.name, tapped: card.tapped })),
      revealed: { name: qa.top.name, manaValue: qa.top.mv, zone: qa.top.zone },
      life: g.players.map(player => ({ name: player.name, life: player.life })),
      entered: qa.entered, returned: qa.returned, damage: qa.damage, reveals: qa.reveals,
      humanQueries: qa.humanQueries, botBlocks: qa.botBlocks,
      stack: g.stack.map(object => ({ name: object.name, kind: object.kind })),
      fallback: !!g._decisionFallbacks || (g.aiDecisionLog || []).some(row => row.fallback),
    };
  });
}

async function shot(label) {
  await page.screenshot({ path: `${output}/${label}.png`, animations: 'disabled' });
  writeFileSync(`${output}/${label}.json`, JSON.stringify(await state(), null, 2) + '\n');
}

async function fixture(scenario) {
  await page.evaluate(({ scenario, deckText }) => {
    const imported = MTG.importCommanderDeck(deckText, { name: 'Yuriko mobile combat', register: false });
    if (!imported.ok || imported.summary.resolvedCards !== 100) throw new Error(JSON.stringify(imported.errors));
    const old = document.querySelector('#game');
    old.replaceWith(old.cloneNode(false));
    document.querySelector('#setup').style.display = 'none';
    document.querySelector('#game').style.display = 'flex';
    document.body.classList.add('game-active');
    const ui = new MTG.UI();
    const game = new MTG.Game({ seed: 941010, paced: true, onEvent: event => {
      if (event.type === 'battlefieldArrival') ui.showBattlefieldArrival(event);
      ui.queueRender();
    } });
    const human = game.addPlayer('You', imported.deck, null, false);
    const bots = ['AI Dragon', 'AI Wolf', 'AI Raven'].map((name, index) => game.addPlayer(name,
      { name: ['Quick Draw', 'Elven Council', 'Squirreled Away'][index] }, null, true));
    ui.game = game; ui.me = human; ui.prioMode = scenario.mode;
    if (scenario.filterLand) ui.arenaDragEnabled = true;
    ui.manaMode = scenario.manual ? 'manual' : 'auto';
    human.manualMana = !!scenario.manual;
    human.controller = ui.controllerFor(human);
    for (const bot of bots) bot.controller = new MTG.AIController(bot, { difficulty: 'normal', style: 'balanced' });
    const put = (name, player, zone = 'battlefield') => {
      if (!MTG.DEFS[name]) throw new Error(`Missing definition: ${name}`);
      const card = new MTG.CardInst(MTG.DEFS[name], player);
      card.zone = zone; card.ctrl = player; card.sick = false;
      if (zone === 'battlefield') game.battlefield.push(card); else player[zone].push(card);
      return card;
    };
    for (const player of game.players) for (let n = 0; n < 20; n++) put('Island', player, 'library');
    const top = put('Temporal Trespass', human, 'library');
    const yuriko = put("Yuriko, the Tiger's Shadow", human, scenario.zone);
    yuriko.commander = true; yuriko.cmdCasts = 3; human.commanders.push(yuriko);
    const outcast = put(scenario.attacker || 'Changeling Outcast', human);
    const lands = (scenario.lands || ['Island', 'Swamp']).map(name => put(name, human));
    const vault = scenario.filterLand ? put("Lim-Dûl's Vault", human, 'hand') : null;
    put('Grizzly Bears', bots[0]).tapped = !!scenario.filterLand;
    const qa = window.__yuriko = { sourceZone: scenario.zone, yuriko, outcast, lands, top, vault,
      done: false, error: null, entered: null, returned: null, damage: [], reveals: [], humanQueries: [], botBlocks: [] };
    const humanDecide = human.controller.decide.bind(human.controller);
    human.controller.decide = async (g, q) => {
      qa.humanQueries.push({ type: q.type, step: g.step, hint: q.aiHint?.kind,
        ninjutsu: (q.acts || []).filter(entry => entry.ninjutsu).map(entry => ({ zone: entry.card.zone, cost: entry.ninjutsuCost })) });
      return humanDecide(g, q);
    };
    for (const bot of bots) {
      const decide = bot.controller.decide.bind(bot.controller);
      bot.controller.decide = async (g, q) => {
        const answer = await decide(g, q);
        if (q.type === 'blockers') qa.botBlocks.push({ name: bot.name, potential: q.potential.map(card => card.name), blocks: answer.length });
        return answer;
      };
    }
    const move = game.move.bind(game);
    game.move = async (card, zone, ...args) => {
      const answer = await move(card, zone, ...args);
      if (card === yuriko && zone === 'battlefield') qa.entered = { zone: card.zone, tapped: card.tapped,
        attacking: card.attacking?.name, step: game.step, inCombat: game.combat?.attackers.includes(card) };
      if (card === outcast && zone === 'hand') qa.returned = { zone: card.zone, step: game.step };
      return answer;
    };
    const emit = game.emit.bind(game);
    game.emit = async (event, data) => {
      if (event === 'combatDamageToPlayer') qa.damage.push({ name: data.card.name, player: data.player.name, amount: data.n });
      return emit(event, data);
    };
    const reveal = game.revealToHuman.bind(game);
    game.revealToHuman = async payload => {
      if ((payload.cards || []).includes(top)) qa.reveals.push({ name: top.name, manaValue: top.mv, kind: payload.kind });
      return reveal(payload);
    };
    game.turnPlayer = human; game.turnNo = 8; game.phase = 'main1'; game.step = 'main'; game.speedFactor = 0;
    game.recalc(); window._game = game; window._ui = ui;
    void game.combatPhase(human).then(() => { qa.done = true; ui.render(); }).catch(error => { qa.error = error.stack; });
    ui.render();
  }, { scenario, deckText });
}

async function reachNinjutsu(scenario) {
  await fixture(scenario);
  // The filter land and the instant in hand create earlier, real response
  // windows. Pass those through the visible controls before declaring attacks.
  await page.waitForFunction(() => (_ui.pending?.q || _ui.react?.q)?.type || __yuriko.error);
  while ((await state()).question === 'priority') {
    assert.equal((await state()).options.some(entry => entry.ninjutsu), false, 'Ninjutsu is unavailable before blockers');
    await page.getByRole('button', { name: /^(Proceed|Pass)/ }).filter({ visible: true }).last().click();
    await page.waitForFunction(() => (_ui.pending?.q || _ui.react?.q)?.type || __yuriko.error);
  }
  await page.waitForFunction(() => _ui.pending?.q.type === 'attackers' || __yuriko.error);
  assert.equal((await state()).error, null);
  await page.locator('[data-combat-defender="player-1"]').tap();
  const iid = await page.evaluate(() => __yuriko.outcast.iid);
  await page.locator(`.ct-mobile-combat-card[data-iid="${iid}"]:visible, .mini[data-iid="${iid}"]:visible`).first().tap();
  await page.locator('[data-testid="confirm-combat-battlefield"]').tap();
  await page.waitForFunction(() => _ui.pending?.q.type === 'combatReview' || __yuriko.error);
  assert.equal((await state()).error, null);
  await page.locator('[data-testid="confirm-combat-battlefield"]').tap();
  await page.waitForFunction(() => (_ui.pending?.q || _ui.react?.q)?.type || __yuriko.done || __yuriko.error);
  while ((await state()).question === 'priority' && (await state()).step !== 'blockers') {
    assert.equal((await state()).options.some(entry => entry.ninjutsu), false, 'Ninjutsu is unavailable before blockers');
    await page.getByRole('button', { name: /^(Proceed|Pass)/ }).filter({ visible: true }).last().click();
    await page.waitForFunction(() => (_ui.pending?.q || _ui.react?.q)?.type || __yuriko.done || __yuriko.error);
  }
  await page.waitForFunction(() => ((_ui.pending?.q || _ui.react?.q)?.type === 'priority' && _game.step === 'blockers') || __yuriko.done || __yuriko.error);
  const s = await state();
  assert.equal(s.error, null);
  assert.equal(s.done, false, 'combat waits before applying damage');
  assert.equal(s.question, 'priority');
  assert.equal(s.step, 'blockers');
  assert.equal(s.mode, scenario.mode, 'the player did not enable HOLD or full control');
  assert.ok(s.options.some(entry => entry.ninjutsu && entry.zone === scenario.zone && entry.cost === '{U}{B}'));
  assert.deepEqual(s.botBlocks, scenario.filterLand ? [] : [{ name: 'AI Dragon', potential: ['Grizzly Bears'], blocks: 0 }], 'native defender cannot block the attacker');
  assert.equal(s.life.every(player => player.life === 40), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  return s;
}

async function floatFilterMana(scenario) {
  await page.getByRole('button', { name: /RESPOND/ }).click();
  const vault = page.locator('.hcard').filter({ hasText: "Lim-Dûl's Vault" });
  assert.equal(await vault.locator('.arenadragbadge').count(), 1, 'the instant is playable by drag');
  await vault.click();
  await page.locator('.sheet').getByRole('button', { name: 'Close', exact: true }).click();
  assert.equal((await state()).vaultZone, 'hand', 'inspecting a playable instant does not queue a cast');
  await page.locator('.landstack').filter({ hasText: 'Sunken Ruins', visible: true }).click();
  await page.locator('.sheetacts .abilitybtn:not(:disabled)').first().click();
  await page.waitForFunction(() => _ui.pending?.q.type === 'chooseOption');
  const choiceKey = await page.evaluate(() => _ui.pending.q.options.find(option => option.mana?.U === 1 && option.mana?.B === 1)?.key);
  assert.ok(choiceKey, 'Sunken Ruins offers one blue and one black');
  await page.locator(`.modal [data-choice-key="${choiceKey}"]`).click();
  await page.waitForFunction(() => _ui.pending?.q.type === 'chooseManaSources');
  assert.deepEqual(await page.evaluate(() => _ui.pending.q.suggested.map(card => card.name)), ['Swamp'], 'Swamp pays the filter fee');
  await page.getByRole('button', { name: /^Tap selected sources/ }).click();
  await page.waitForFunction(() => (_ui.pending?.q || _ui.react?.q)?.type === 'priority');
  const floated = await state();
  assert.equal(floated.pool.U, 1);
  assert.equal(floated.pool.B, 1);
  assert.equal(floated.vaultZone, 'hand');
  assert.equal(floated.yuriko.zone, 'command');
  assert.deepEqual(floated.stack, [], 'mana activation resolves without using the Stack');
  await shot(`${scenario.label}-floated-UB`);
}

try {
  await page.goto(base);
  await page.locator('[data-menu-action="solo"]').first().click();
  await page.waitForSelector('.deckentry:visible');
  const scenarios = baseline ? [{ label: 'command-end', mode: 'end', zone: 'command' }]
    : [{ label: 'command-end', mode: 'end', zone: 'command' }, { label: 'command-off', mode: 'off', zone: 'command' }, { label: 'hand-off', mode: 'off', zone: 'hand' },
      ...[false, true].map(prefloat => ({ label: `command-manual-filter-${prefloat ? 'prefloated' : 'payment'}`, mode: 'end', zone: 'command', manual: true,
        filterLand: true, prefloat, attacker: "Thassa's Oracle", lands: ['Sunken Ruins', 'Swamp', 'Gemstone Caverns'] }))];
  for (const scenario of scenarios) {
    const priority = await reachNinjutsu(scenario);
    if (baseline) {
      assert.equal(priority.reaction, true);
      assert.equal(await page.getByRole('button', { name: /Ninjutsu/i }).filter({ visible: true }).count(), 0, 'baseline offers only generic RESPOND');
      assert.doesNotMatch(await page.locator('.czcard').innerText(), /NINJUTSU/i);
      await shot('command-end-generic-window');
      results.push({ scenario, priority, genericWindowOnly: true, discoverableCommanderNinjutsu: false });
      console.log('PASS baseline: legal blockers priority exists in end mode, but commander/reaction controls do not expose Ninjutsu');
      continue;
    }
    if (scenario.zone === 'command') {
      assert.match(await page.locator('.czcard').innerText(), /Ninjutsu/i, 'command zone exposes the available ability');
      const commandCost = await page.locator('.czcard .czcost').innerText();
      assert.doesNotMatch(commandCost, /tax/i, 'Ninjutsu displays its ability cost rather than commander casting tax');
    }
    if (scenario.prefloat) await floatFilterMana(scenario);
    const ability = page.getByRole('button', { name: /Ninjutsu/i }).filter({ visible: true }).first();
    assert.ok(await ability.count(), 'Ninjutsu has a direct visible activation button');
    await shot(`${scenario.label}-before-damage`);
    await ability.click();
    await page.waitForFunction(() => _ui.pending?.q.aiHint?.kind === 'ninjutsuReturn' || __yuriko.error);
    assert.equal((await state()).error, null);
    await page.locator('.cardgrid .bigcard').filter({ hasText: scenario.attacker || 'Changeling Outcast' }).click();
    await shot(`${scenario.label}-return-attacker`);
    await page.getByRole('button', { name: /^Confirm.*\(1\)/ }).click();
    for (let n = 0; n < 80; n++) {
      const s = await state();
      assert.equal(s.error, null);
      if (s.done) break;
      if (s.question === 'chooseManaSources') {
        assert.equal(scenario.manual, true, 'only manual mode asks for exact payment sources');
        assert.equal(scenario.prefloat, false, 'floating blue and black already pays Ninjutsu');
        assert.deepEqual(await page.evaluate(() => _ui.pending.q.suggested.map(card => card.name)), ['Swamp', 'Sunken Ruins']);
        await shot(`${scenario.label}-mana-sources`);
        await page.getByRole('button', { name: /^Tap selected sources/ }).click();
        continue;
      }
      const proceed = page.getByRole('button', { name: /^(Proceed|Pass|Resolve|Continue|Got it|Confirm order|Exile top card|Reveal cards)/ }).filter({ visible: true });
      if (await proceed.count()) await proceed.last().click();
      await page.waitForTimeout(25);
    }
    const result = await state();
    assert.equal(result.error, null);
    assert.equal(result.done, true);
    assert.deepEqual(result.entered, { zone: 'battlefield', tapped: true, attacking: 'AI Dragon', step: 'blockers', inCombat: true });
    assert.deepEqual(result.returned, { zone: 'hand', step: 'blockers' });
    assert.equal(result.yuriko.commanderCasts, 3, 'ability activation does not increment commander casts');
    assert.equal(result.yuriko.zone, 'battlefield', 'Yuriko survives combat');
    assert.equal(result.yuriko.onBattlefield, true, 'Yuriko remains visible on the battlefield');
    assert.ok(result.paidLands.filter(card => card.name !== 'Gemstone Caverns').every(card => card.tapped), 'the two selected lands pay the colored mana');
    if (scenario.filterLand) {
      assert.equal(result.manaMode, 'manual');
      assert.equal(result.paidLands.find(card => card.name === 'Gemstone Caverns').tapped, false, 'unneeded Caverns remains untapped');
      assert.equal(result.vaultZone, 'hand', 'the separate instant remains in hand throughout Ninjutsu');
    }
    assert.deepEqual(result.damage, [{ name: "Yuriko, the Tiger's Shadow", player: 'AI Dragon', amount: 1 }]);
    assert.deepEqual(result.reveals, [{ name: 'Temporal Trespass', manaValue: 11, kind: 'reveal' }]);
    assert.equal(result.revealed.zone, 'hand');
    assert.deepEqual(result.life.map(player => player.life), [40, 28, 29, 29]);
    assert.equal(result.outcast.zone, 'hand');
    assert.equal(result.outcast.attacking, undefined, 'the returned card has no attacking role after combat');
    assert.equal(result.fallback, false);
    assert.deepEqual(result.stack, []);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    await shot(`${scenario.label}-resolved`);
    results.push({ scenario, priority, result });
    console.log(`PASS ${scenario.label}: Declare attack → native bot no blocks → visible Ninjutsu UB → return attacker → tapped attacking Yuriko → damage/reveal trigger`);
  }
  assert.deepEqual(errors, []);
  writeFileSync(`${output}/result.json`, JSON.stringify({ baseline: !!baseline, viewport: { width: 390, height: 844 }, fixtureCards: 100, results, browserErrors: errors, fullMatches: 0 }, null, 2) + '\n');
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` });
  writeFileSync(`${output}/failure.json`, JSON.stringify({ error: error.stack, state: await state().catch(() => null), browserErrors: errors }, null, 2) + '\n');
  throw error;
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
