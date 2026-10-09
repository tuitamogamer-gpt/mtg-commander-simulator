import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M = loadEngine(), U = {...M};
runInNewContext(readFileSync(new URL('../src/modules/ui.js', import.meta.url), 'utf8'), {
  MTG: U, document: {readyState: 'loading', addEventListener() {}},
  window: {addEventListener() {}},
});

// Native card definitions, turn/priority/Stack processing, and the actual UI
// controller policy all run. Only render/DOM and the player's choices are
// supplied; a missing window prevents the chosen action from happening.
function fixture({mode = 'end', ownTurn = false} = {}) {
  const game = new M.Game({seed: 10192026, paced: false});
  game.speedFactor = 0;
  const answer = q => q.type === 'priority' ? {kind: 'pass'}
    : q.type === 'main' ? {kind: 'done'}
      : q.type === 'chooseCards' ? q.from.slice(0, q.min || 0)
        : q.type === 'chooseTargets' ? q.candidates.slice(0, q.min || 0)
          : q.type === 'chooseOption' ? q.options.find(o => o.key === 'yes')?.key || q.options[0]?.key
            : q.type === 'orderTriggers' ? q.triggers
              : q.type === 'scry' ? {top: q.cards, bottom: []}
                : q.type === 'chooseX' ? q.min || 0
                  : ['attackers', 'blockers', 'combatReview'].includes(q.type) ? [] : null;
  const players = ['You', 'Rival 1', 'Rival 2', 'Previous seat'].map(name =>
    game.addPlayer(name, {name}, {decide: async (g, q) => answer(q)}, false));
  const [me, rival] = players, predecessor = players.at(-1);
  game.turnPlayer = ownTurn ? me : predecessor;
  game.turnNo = 12;
  const put = (name, zone = 'battlefield', owner = me) => {
    assert.ok(M.DEFS[name], `native definition: ${name}`);
    const c = new M.CardInst(M.DEFS[name], owner);
    c.zone = zone; c.ctrl = owner; c.sick = false;
    if (zone === 'battlefield') game.battlefield.push(c); else owner[zone].push(c);
    game.recalc(); return c;
  };
  for (const player of players) for (let i = 0; i < 15; i++) put('Forest', 'library', player);
  const questions = [], windows = [], selections = [];
  const ui = Object.assign(Object.create(U.UI.prototype), {
    game, me, prioMode: mode, manaMode: 'auto', pendings: [],
    focusDecisionView() {}, scrollPromptIntoView() {},
    render() {
      if (this.react) {
        windows.push({phase: game.phase, step: game.step, type: 'reaction', q: this.react.q});
        this.takeReactWindow(); return;
      }
      const pending = this.pending;
      if (!pending) return;
      const q = pending.q;
      questions.push({phase: game.phase, step: game.step, q});
      let choice;
      if (this.select && ['priority', 'main'].includes(q.type)) choice = this.select(q, game);
      if (choice) selections.push({phase: game.phase, step: game.step, choice});
      this.resolvePending(choice || answer(q));
    },
  });
  me.controller = ui.controllerFor(me);
  return {game, players, me, rival, predecessor, put, ui, questions, windows, selections};
}

function chooseOne(f, predicate) {
  f.ui.select = q => {
    if (f.selections.length) return null;
    const entry = q.acts?.find(predicate);
    return entry ? {kind: 'activate', entry} : null;
  };
}
function chooseCast(f, card, predicate = () => true) {
  f.ui.select = q => {
    if (f.selections.length) return null;
    const entry = q.casts?.find(e => e.card === card && predicate(e));
    return entry ? {kind: 'cast', card, alt: entry.alt, from: entry.from} : null;
  };
}
function finished(f) {
  assert.equal(f.game.stack.length, 0);
  assert.equal(f.game.pendingTriggers.length, 0);
  assertGameStateInvariants(f.game);
}

test('native cycling can be used at the last end step before the player turn', async () => {
  const f = fixture(), card = f.put('Krosan Tusker', 'hand');
  const lands = ['Forest', 'Island', 'Island'].map(n => f.put(n));
  const before = f.me.library.length;
  chooseOne(f, e => e.card === card && e.cycling);
  await f.game.runEndStepV90(f.predecessor);
  assert.equal(f.selections.length, 1);
  assert.equal(card.zone, 'graveyard');
  assert.ok(lands.every(c => c.tapped));
  assert.ok(f.me.library.length < before, 'draw and the native cycling search trigger resolve');
  assert.ok(f.windows.some(w => w.q.acts.some(e => e.card === card && e.cycling)));
  finished(f);
});

test('native Channel uses a legendary creature discount in the opponent end step', async () => {
  const f = fixture(), card = f.put('Otawara, Soaring City', 'hand');
  f.put("Yuriko, the Tiger's Shadow");
  const target = f.put('Sol Ring', 'battlefield', f.rival);
  const lands = ['Island', 'Forest', 'Forest'].map(n => f.put(n));
  chooseOne(f, e => e.card === card && e.handAbility);
  const decide = f.me.controller.decide;
  f.me.controller.decide = (g, q) => q.type === 'chooseTargets' && q.candidates.includes(target)
    ? Promise.resolve([target]) : decide(g, q);
  await f.game.runEndStepV90(f.predecessor);
  assert.equal(f.selections.length, 1);
  assert.equal(card.zone, 'graveyard');
  assert.equal(target.zone, 'hand');
  assert.ok(lands.every(c => c.tapped));
  finished(f);
});

test('native Derevi command ability is reachable, pays its ability cost and leaves commander casts unchanged', async () => {
  const f = fixture(), card = f.put('Derevi, Empyrial Tactician', 'command');
  card.commander = true; card.cmdCasts = 3; f.me.commanders.push(card);
  ['Forest', 'Forest', 'Plains', 'Island'].forEach(n => f.put(n));
  chooseOne(f, e => e.card === card && e.c13Command);
  await f.game.runEndStepV90(f.predecessor);
  assert.equal(f.selections.length, 1);
  assert.equal(card.zone, 'battlefield');
  assert.equal(card.cmdCasts, 3);
  assert.ok(f.windows.some(w => w.q.acts.some(e => e.card === card && e.c13Command)));
  finished(f);
});

for (const name of ['Eternal Dragon', 'Undead Gladiator']) {
  test(`${name}: native upkeep-only graveyard return reaches the real UI`, async () => {
    const f = fixture({ownTurn: true}), card = f.put(name, 'graveyard');
    ['Plains', 'Plains', 'Swamp', 'Forest', 'Forest'].forEach(n => f.put(n));
    f.put('Island', 'hand');
    chooseOne(f, e => e.card === card && e.gyAbility);
    await f.game.runBeginningPhase(f.me);
    assert.equal(f.selections.length, 1);
    assert.equal(f.selections[0].phase, 'upkeep');
    assert.equal(card.zone, 'hand');
    finished(f);
  });
}

for (const name of ['Dregscape Zombie', 'Deadbridge Goliath', 'Sliver Gravemother']) {
  test(`${name}: graveyard activation waits for main phase and resolves in a native full turn`, async () => {
    const f = fixture({ownTurn: true}), card = f.put(name, 'graveyard');
    ['Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Swamp'].forEach(n => f.put(n));
    const target = f.put('Grizzly Bears');
    chooseOne(f, e => e.card === card && e.gyAbility);
    await f.game.runTurn();
    assert.equal(f.selections.length, 1);
    assert.equal(f.selections[0].phase, 'main1');
    if (name === 'Deadbridge Goliath') {
      assert.equal(card.zone, 'exile');
      assert.equal(target.counters['+1/+1'], 5);
    } else assert.equal(card.zone, 'exile', 'Unearth and Encore leave their source exiled by end step');
    finished(f);
  });
}

test('native flashback instant resolves from graveyard in the last opponent end step', async () => {
  const f = fixture(), card = f.put('Think Twice', 'graveyard');
  ['Island', 'Forest', 'Forest'].forEach(n => f.put(n));
  const before = f.me.hand.length;
  chooseCast(f, card, e => e.alt?.flashback);
  await f.game.runEndStepV90(f.predecessor);
  assert.equal(f.selections.length, 1);
  assert.equal(card.zone, 'exile');
  assert.equal(f.me.hand.length, before + 1);
  finished(f);
});

test('native escape creature is offered in main phase and pays five graveyard exiles', async () => {
  const f = fixture({ownTurn: true}), card = f.put("Uro, Titan of Nature's Wrath", 'graveyard');
  ['Forest', 'Forest', 'Island', 'Island'].forEach(n => f.put(n));
  for (let i = 0; i < 5; i++) f.put('Forest', 'graveyard');
  chooseCast(f, card, e => e.alt?.escape);
  await f.game.runTurn();
  assert.equal(f.selections.length, 1);
  assert.equal(f.selections[0].phase, 'main1');
  assert.equal(card.zone, 'battlefield');
  assert.equal(f.me.exile.length, 5);
  assert.equal(f.me.life, 43);
  finished(f);
});

test('native foretell special action can be taken in upkeep and cast on a later opponent turn', async () => {
  const f = fixture({ownTurn: true, mode: 'full'}), card = f.put('Behold the Multiverse', 'hand');
  ['Island', 'Island', 'Island', 'Forest'].forEach(n => f.put(n));
  chooseOne(f, e => e.card === card && e.foretell);
  await f.game.runBeginningPhase(f.me);
  assert.equal(f.selections[0].phase, 'upkeep');
  assert.equal(card.zone, 'exile');
  assert.equal(card.faceDown, true);
  assert.equal(f.game.castableList(f.me).some(e => e.card === card), false, 'same-turn foretell cast is not legal');
  f.ui.prioMode = 'end'; f.selections.length = 0;
  f.game.turnNo++; f.game.turnPlayer = f.predecessor;
  chooseCast(f, card, e => e.alt?.foretell);
  await f.game.runEndStepV90(f.predecessor);
  assert.equal(f.selections.length, 1);
  assert.equal(card.zone, 'graveyard');
  finished(f);
});

test('native instant Suspend remains reachable on an opponent turn with another spell on the Stack', async () => {
  const f = fixture(), card = f.put('Suspended Sentence', 'hand');
  ['Swamp', 'Forest'].forEach(n => f.put(n));
  const spell = f.put('Lightning Bolt', 'hand', f.predecessor);
  f.predecessor.pool.R = 1;
  chooseOne(f, e => e.card === card && e.suspend);
  await f.game.castSpell(f.predecessor, spell, {quickTargets: [f.rival]});
  assert.equal(f.selections.length, 1);
  assert.equal(card.zone, 'exile');
  assert.equal(card.meta.suspended, 3);
  assert.equal(spell.zone, 'graveyard');
  finished(f);
});

for (const [name, targetName] of [['Boseiju, Who Endures', null], ['Otawara, Soaring City', 'Invisible Stalker']]) {
  test(`${name}: the native Channel action is absent when no legal target exists`, async () => {
    const f = fixture({mode: 'full'}), card = f.put(name, 'hand');
    ['Island', 'Forest', 'Forest', 'Forest'].forEach(n => f.put(n));
    if (targetName) f.put(targetName, 'battlefield', f.rival);
    assert.equal(f.game.legalTargets(card.def.handAbility.targets[0], card, f.me).length, 0);
    await f.game.runEndStepV90(f.predecessor);
    const priorities = f.questions.filter(row => row.q.type === 'priority');
    assert.ok(priorities.length);
    assert.equal(priorities.some(row => row.q.acts.some(e => e.card === card && e.handAbility)), false,
      'a displayed activation must have a legal target');
    assert.equal(card.zone, 'hand');
    finished(f);
  });
}

for (const sourceName of ['Secluded Courtyard', 'Unclaimed Territory', 'Somberwald Sage', 'Ancient Ziggurat', 'Abundant Countryside']) {
  test(`${sourceName}: creature-restricted mana cannot fund native Suspend, a special action`, async () => {
    const f = fixture({ownTurn: true}), card = f.put('Deep-Sea Kraken', 'hand');
    const source = f.put(sourceName);
    if (source.is('Land')) source.meta.chosenType = 'Kraken';
    if (sourceName !== 'Somberwald Sage') ['Forest', 'Forest'].forEach(n => f.put(n));
    chooseOne(f, e => e.card === card && e.suspend);
    await f.game.runTurn();
    assert.equal(f.selections.length, 0);
    assert.equal(card.zone, 'hand');
    assert.equal(source.tapped, false);
    finished(f);
  });
}

for (const scenario of [
  {source: 'Primal Beyond', card: 'Deep-Sea Kraken', otherLands: ['Wastes', 'Wastes'], elementalConspiracy: true},
  {source: 'Haven of the Spirit Dragon', card: 'Pardic Dragon', otherLands: ['Mountain']},
]) {
  test(`${scenario.source}: typed spell/ability mana cannot fund printed Suspend`, async () => {
    const f = fixture({ownTurn: true}), card = f.put(scenario.card, 'hand');
    const source = f.put(scenario.source);
    if (scenario.elementalConspiracy) {
      const typeGrant = f.put('Conspiracy');
      typeGrant.meta.oracleEntryCreatureTypeV28 = {version: typeGrant.zoneVersion, type: 'Elemental'};
      f.game.recalc();
      assert.equal(card.hasSub('Elemental'), true, 'the real Conspiracy continuous effect changes this hand card');
    }
    scenario.otherLands.forEach(n => f.put(n));
    chooseOne(f, e => e.card === card && e.suspend);
    await f.game.runTurn();
    assert.equal(f.selections.length, 0);
    assert.equal(card.zone, 'hand');
    assert.equal(source.tapped, false);
    finished(f);
  });
}

test('an ordinary Island can fund native Suspend in main phase', async () => {
  const f = fixture({ownTurn: true}), card = f.put('Deep-Sea Kraken', 'hand');
  const lands = ['Island', 'Forest', 'Forest'].map(n => f.put(n));
  chooseOne(f, e => e.card === card && e.suspend);
  await f.game.runTurn();
  assert.equal(f.selections.length, 1);
  assert.equal(f.selections[0].phase, 'main1');
  assert.equal(card.zone, 'exile');
  assert.equal(card.meta.suspended, 9);
  assert.ok(lands.every(c => c.tapped));
  finished(f);
});

test('Niko Defies Destiny chapter II mana still pays the native Foretell special action', async () => {
  const f = fixture({ownTurn: true}), saga = f.put('Niko Defies Destiny', 'hand');
  const card = f.put('Behold the Multiverse', 'hand');
  const lands = ['Island', 'Plains', 'Forest'].map(n => f.put(n));
  let foretoldWithRestrictedPool = false;
  const chapterTwoQuestions = [];
  f.ui.select = q => {
    if (f.selections.length === 0) {
      const entry = q.casts?.find(e => e.card === saga);
      if (entry) return {kind: 'cast', card: saga, alt: entry.alt, from: entry.from};
    }
    if (saga.zone === 'battlefield' && saga.counters.lore === 2) {
      chapterTwoQuestions.push({type: q.type, phase: f.game.phase,
        pool: {...f.me.pool}, restricted: f.me.poolMeta.map(unit => ({color: unit.color, n: unit.n, restricted: !!unit.restrict})),
        foretells: (q.acts || []).filter(e => e.card === card).map(e => !!e.foretell)});
      const entry = q.acts?.find(e => e.card === card && e.foretell);
      if (entry && f.me.poolMeta.some(unit => unit.restrict)) {
        foretoldWithRestrictedPool = f.me.poolMeta.some(unit => unit.restrict);
        return {kind: 'activate', entry};
      }
    }
    return null;
  };
  await f.game.runTurn();
  assert.equal(saga.counters.lore, 1);
  assert.equal(card.zone, 'hand');
  for (let n = 0; n < 3; n++) await f.game.runTurn();
  assert.equal(f.game.turnPlayer, f.me);
  await f.game.runTurn();
  assert.equal(foretoldWithRestrictedPool, true, JSON.stringify(chapterTwoQuestions));
  assert.equal(card.zone, 'exile');
  assert.equal(card.meta.foretold, true);
  assert.ok(lands.every(land => !land.tapped), 'chapter II mana pays the special action without tapping lands');
  assert.equal(f.selections.length, 2);
  finished(f);
});
