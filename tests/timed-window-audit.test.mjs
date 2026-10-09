import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { loadEngine } from './helpers/load-engine.mjs';
import { context, put } from './helpers/oracle-v8-fixtures.mjs';
import { assertGameStateInvariants } from './helpers/game-state-invariants.mjs';

const M = loadEngine();
const UI = { ...M };
runInNewContext(readFileSync(new URL('../src/modules/ui.js', import.meta.url), 'utf8'), {
  MTG: UI,
  document: { readyState: 'loading', addEventListener() {} },
  window: { addEventListener() {} },
});

const forecastRows = [
  ['Piercing Rays', ['Plains', 'Plains', 'Plains']],
  ['Plumes of Peace', ['Plains', 'Island']],
  ['Proclamation of Rebirth', Array(6).fill('Plains')],
  ['Sky Hussar', []],
  ['Skyscribing', ['Island', 'Island', 'Island']],
  ['Spirit en-Dal', ['Plains', 'Plains']],
  ['Steeling Stance', ['Plains']],
  ['Pride of the Clouds', ['Plains', 'Plains', 'Island', 'Island']],
  ['Writ of Passage', ['Island', 'Island']],
  ['Govern the Guildless', ['Island', 'Island']],
  ['Paladin of Prahv', ['Plains', 'Plains']],
].map(([name, lands]) => ({ name, lands, zone: 'hand', marker: 'handAbility', phase: 'upkeep' }));
const restrictedRows = [
  { name: 'Eternal Dragon', lands: Array(5).fill('Plains'), zone: 'graveyard', marker: 'gyAbility', phase: 'upkeep', destination: 'hand' },
  { name: 'Necrosavant', lands: Array(5).fill('Swamp'), zone: 'graveyard', marker: 'gyAbility', phase: 'upkeep', destination: 'battlefield' },
  { name: 'Undead Gladiator', lands: Array(2).fill('Swamp'), zone: 'graveyard', marker: 'gyAbility', phase: 'upkeep', destination: 'hand' },
  { name: 'Dwarven Weaponsmith', lands: [], zone: 'battlefield', phase: 'upkeep' },
  { name: 'Well of Knowledge', lands: ['Island', 'Island'], zone: 'battlefield', phase: 'draw' },
  { name: 'Jade Statue', lands: ['Island', 'Island'], zone: 'battlefield', phase: 'combat' },
  { name: 'Najeela, the Blade-Blossom', lands: ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'], zone: 'battlefield', phase: 'combat' },
];
const rows = [...forecastRows, ...restrictedRows];

// The production controller decides whether a native priority question reaches
// the player. The driver answers that visible question without replacing any
// phase, payment, activation, combat, or stack method.
function fixture(row, { mode = 'end', affordable = true, upkeepTrigger = false } = {}) {
  const f = context(M, 'human', 3);
  const { game, a, b } = f;
  delete game.priorityRound;
  game.speedFactor = 0;
  const source = put(M, game, a, row.name, row.zone);
  const lands = row.lands.slice(0, affordable ? undefined : -1)
    .map(name => put(M, game, a, name));
  const bear = put(M, game, a, 'Grizzly Bears');
  const bird = put(M, game, a, 'Ornithopter', 'graveyard');
  const artifact = put(M, game, a, 'Ornithopter');
  const discard = put(M, game, a, 'Island', 'hand');
  const target = put(M, game, b, 'Grizzly Bears');
  const white = put(M, game, a, 'Soul Warden');
  const blue = put(M, game, a, 'Merfolk Looter');
  if (upkeepTrigger) put(M, game, a, 'Phyrexian Arena');
  game.recalc();
  const windows = [], activations = [], resolutions = [];
  const matches = entry => entry.card === source && (!row.marker || entry[row.marker]);
  const ui = Object.assign(Object.create(UI.UI.prototype), {
    game, me: a, prioMode: mode, manaMode: 'auto', pendings: [], activated: false,
    focusDecisionView() {}, scrollPromptIntoView() {},
    render() {
      if (this.react) { this.takeReactWindow(); return; }
      if (!this.pending) return;
      const q = this.pending.q;
      let answer;
      if (q.type === 'priority') {
        windows.push({ phase: game.phase, step: game.step, offered: q.acts.some(matches),
          stackNames: game.stack.map(object => object.name) });
        const entry = q.acts.find(matches);
        if (entry && !this.activated && game.phase === row.phase) {
          this.activated = true;
          answer = { kind: 'activate', entry };
        } else answer = { kind: 'pass' };
      } else if (q.type === 'main') answer = { kind: 'done' };
      else if (q.type === 'chooseCards') answer = q.from.slice(0, q.min || 0);
      else if (q.type === 'chooseTargets') {
        const preferred = row.name === 'Piercing Rays' || row.name === 'Plumes of Peace'
          ? target : row.name === 'Proclamation of Rebirth' ? bird : bear;
        answer = q.candidates.includes(preferred) ? [preferred] : q.candidates.slice(0, q.min || 0);
      } else if (q.type === 'chooseOption') answer = q.options.find(option => option.key === 'yes')?.key || q.options[0]?.key;
      else if (q.type === 'orderTriggers') answer = q.triggers;
      else if (q.type === 'scry') answer = { top: q.cards, bottom: [] };
      else if (q.type === 'chooseX') answer = q.min || 0;
      else if (['attackers', 'blockers', 'combatReview'].includes(q.type)) answer = [];
      else answer = null;
      this.resolvePending(answer);
    },
  });
  a.controller = ui.controllerFor(a);
  const activate = game.activateAbility.bind(game);
  game.activateAbility = async (player, entry, ...rest) => {
    const result = await activate(player, entry, ...rest);
    if (matches(entry)) activations.push({ phase: game.phase, result });
    return result;
  };
  const resolve = game.resolveTop.bind(game);
  game.resolveTop = async (...args) => {
    const top = game.stack.at(-1);
    const result = await resolve(...args);
    if (top?.kind === 'ability' && (top.src === source || top.card === source || top.srcCard === source)) {
      resolutions.push({ phase: game.phase, sourceZone: source.zone,
        stillOffered: game.activatableList(a).some(matches),
        tappedLands: lands.filter(card => card.tapped).length,
        targetTapped: target.tapped, bearPower: bear.power,
        birdZone: bird.zone, artifactZone: artifact.zone, sourceCreature: source.is('Creature'),
        whiteTapped: white.tapped, blueTapped: blue.tapped });
    }
    return result;
  };
  return { ...f, source, lands, bear, bird, artifact, discard, white, blue, target,
    windows, activations, resolutions, ui, matches };
}

for (const mode of ['end', 'off']) for (const row of rows) {
  test(`${mode}: native full turn exposes and executes ${row.name} in its restricted window`, async () => {
    const f = fixture(row, { mode });
    await f.game.runTurn();
    assert.ok(f.windows.some(window => window.phase === row.phase && window.offered),
      `${row.name}: legal ${row.phase} activation must reach the player`);
    assert.equal(f.activations.length, 1, 'the visible action executes exactly once');
    assert.equal(f.activations[0].result, true);
    assert.equal(f.resolutions.length, 1, 'the action resolves through the native stack');
    assert.equal(f.resolutions[0].phase, row.phase);
    assert.equal(f.resolutions[0].tappedLands, row.lands.length, 'payment uses actual mana sources');
    if (row.zone === 'hand') {
      assert.equal(f.resolutions[0].sourceZone, 'hand', 'Forecast retains its revealed source');
      assert.equal(f.source.meta.oracleForecast.turn, f.game.turnNo);
      assert.equal(f.source.meta.oracleForecast.zoneVersion, f.source.zoneVersion);
      assert.equal(f.resolutions[0].stillOffered, false, 'Forecast cannot be repeated during this upkeep');
      assert.equal(f.game.forecastRevealedCards().length, 0, 'disclosure ends after upkeep');
    }
    if (row.destination) assert.equal(f.source.zone, row.destination);
    if (row.name === 'Proclamation of Rebirth') assert.equal(f.resolutions[0].birdZone, 'battlefield');
    if (['Piercing Rays', 'Plumes of Peace'].includes(row.name)) assert.equal(f.resolutions[0].targetTapped, true);
    if (row.name === 'Sky Hussar') {
      assert.equal(f.resolutions[0].whiteTapped, true);
      assert.equal(f.resolutions[0].blueTapped, true);
      assert.equal(f.a.hand.length, 4, 'Forecast draws one card before the normal draw step');
    }
    if (row.name === 'Skyscribing') {
      assert.equal(f.a.hand.length, 4);
      for (const opponent of f.others) assert.equal(opponent.hand.length, 1, 'each player draws from Forecast');
    }
    if (row.name === 'Necrosavant') assert.equal(f.bear.zone, 'graveyard', 'the printed sacrifice is paid');
    if (row.name === 'Undead Gladiator') assert.equal(f.discard.zone, 'graveyard', 'the printed discard is paid');
    if (row.name === 'Dwarven Weaponsmith') {
      assert.equal(f.resolutions[0].artifactZone, 'graveyard');
      assert.equal(f.bear.counters['+1/+1'], 1);
    }
    if (row.name === 'Jade Statue') {
      assert.equal(f.resolutions[0].sourceCreature, true, 'the combat-only ability animates the artifact');
      assert.equal(f.source.is('Creature'), false, 'the animation ends at end of combat');
    }
    if (row.name === 'Well of Knowledge') assert.equal(f.a.hand.length, 3, 'its draw follows the normal draw-step turn action');
    if (row.name === 'Najeela, the Blade-Blossom') assert.equal(f.a.turnState.combatPhaseCount, 2,
      'the resolved activation creates the native additional combat phase');
    assert.equal(f.game.stack.length, 0);
    assert.equal(f.game.pendingTriggers.length, 0);
    assertGameStateInvariants(f.game, row.name);
  });
}

for (const mode of ['end', 'off']) {
  test(`${mode}: own upkeep trigger does not conceal Eternal Dragon's restricted activation`, async () => {
    const row = rows.find(entry => entry.name === 'Eternal Dragon');
    const f = fixture(row, { mode, upkeepTrigger: true });
    await f.game.runTurn();
    const firstOffer = f.windows.find(window => window.offered);
    assert.ok(firstOffer?.stackNames.some(name => name.includes('Phyrexian Arena')),
      'the activation must be reachable before the own upkeep trigger resolves');
    assert.equal(f.activations.length, 1);
    assert.equal(f.activations[0].result, true);
    assert.equal(f.source.zone, 'hand');
    assert.equal(f.a.life, 39, 'the Arena trigger still resolves normally');
    assert.equal(f.game.stack.length, 0);
    assertGameStateInvariants(f.game, row.name);
  });
}

test('ACTIONS keeps ordinary instant and empty priority windows automatic', async () => {
  const f = fixture({ name: 'Lightning Bolt', lands: ['Mountain'], zone: 'hand', marker: 'handAbility', phase: 'upkeep' }, { mode: 'off' });
  await f.game.runTurn();
  assert.equal(f.windows.length, 0, 'a response available in ordinary main phases does not require an automatic stop');
  assert.equal(f.source.zone, 'hand');
  assertGameStateInvariants(f.game, 'ordinary instant control');
});

test('Forecast and upkeep-only abilities stay illegal during main, draw, combat and a rival upkeep', async () => {
  for (const row of rows.filter(row => row.phase === 'upkeep')) {
    const f = fixture(row);
    for (const [phase, ownTurn] of [['main1', true], ['draw', true], ['combat', true], ['upkeep', false]]) {
      f.game.phase = phase;
      f.game.turnPlayer = ownTurn ? f.a : f.b;
      assert.equal(f.game.activatableList(f.a).some(f.matches), false,
        `${row.name}: ${ownTurn ? 'own' : 'rival'} ${phase} must not invent a legal activation`);
    }
  }
});

test('combat-only and own draw-step abilities keep their phase and turn restrictions', () => {
  for (const name of ['Najeela, the Blade-Blossom', 'Jade Statue']) {
    const f = fixture(rows.find(row => row.name === name));
    for (const phase of ['upkeep', 'draw', 'main1', 'main2', 'end']) {
      f.game.phase = phase;
      assert.equal(f.game.activatableList(f.a).some(f.matches), false, `${name} is illegal during ${phase}`);
    }
    f.game.phase = 'combat';
    f.game.step = 'begin';
    assert.equal(f.game.activatableList(f.a).some(f.matches), true);
  }
  const f = fixture(rows.find(row => row.name === 'Well of Knowledge'));
  f.game.phase = 'draw';
  f.game.turnPlayer = f.b;
  assert.equal(f.game.activatableList(f.a).some(f.matches), false, 'Well of Knowledge only allows the player taking the draw step');
  f.game.turnPlayer = f.a;
  assert.equal(f.game.activatableList(f.a).some(f.matches), true);
  f.game.phase = 'main1';
  assert.equal(f.game.activatableList(f.a).some(f.matches), false);
});

for (const name of ['Proclamation of Rebirth', 'Eternal Dragon', 'Necrosavant', 'Undead Gladiator', 'Najeela, the Blade-Blossom']) {
  test(`ACTIONS does not invent ${name} with one mana source missing`, async () => {
    const row = rows.find(entry => entry.name === name);
    const f = fixture(row, { mode: 'off', affordable: false });
    await f.game.runTurn();
    assert.equal(f.ui.activated, false);
    assert.equal(f.activations.length, 0);
    assert.equal(f.windows.some(window => window.offered), false);
    assert.equal(f.source.zone, row.zone);
    assertGameStateInvariants(f.game, name);
  });
}
