import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function defaultDecision(game, query) {
  if (query.type === 'priority') return { kind: 'pass' };
  if (query.type === 'main') return { kind: 'done' };
  if (query.type === 'attackers' || query.type === 'blockers' || query.type === 'combatReview') return [];
  if (query.type === 'chooseOption') return query.options[0]?.key;
  if (query.type === 'chooseTargets') return query.candidates.slice(0, query.min || 0);
  if (query.type === 'chooseCards') return query.from.slice(0, query.min || 0);
  if (query.type === 'chooseManaSources') return { auto: true };
  if (query.type === 'orderTriggers') return query.triggers;
  return null;
}

function rulesGame(deciders = [], count = 2) {
  const game = new MTG.Game({ seed: 2408247, paced: false, maxTurns: 20 });
  const players = Array.from({ length: count }, (_, index) => game.addPlayer(
    index ? `Opponent ${index}` : 'Player',
    { name: `Rules deck ${index}` },
    { decide: async (g, query) => deciders[index] ? deciders[index](g, query) : defaultDecision(g, query) },
    index > 0,
  ));
  game.turnPlayer = players[0];
  game.turnNo = 9;
  game.phase = 'main1';
  game.step = 'main';
  return { game, players };
}

function definition(name, extra = {}) {
  return Object.assign({
    name, cost: '{1}', types: ['Creature'], super: [], subtypes: [], kws: [],
    oracle: '', power: '1', toughness: '1',
  }, extra);
}

function permanent(game, player, defOrName) {
  const def = typeof defOrName === 'string' ? MTG.DEFS[defOrName] : defOrName;
  const card = new MTG.CardInst(def, player);
  card.ctrl = player;
  card.zone = 'battlefield';
  card.sick = false;
  game.battlefield.push(card);
  game.recalc();
  return card;
}

function inZone(player, defOrName, zone) {
  const def = typeof defOrName === 'string' ? MTG.DEFS[defOrName] : defOrName;
  const card = new MTG.CardInst(def, player);
  card.zone = zone;
  player[zone].push(card);
  return card;
}

test('mixed same-color unrestricted and colored-only mana pays colored plus generic in either source order', async () => {
  const { game, players: [player] } = rulesGame();
  const coloredOnly = permanent(game, player, definition('Colored-only White Source', {
    types: ['Artifact'], power: undefined, toughness: undefined,
    mana: { cost: { tap: true }, coloredOnly: true, produce: [{ W: 1 }] },
  }));
  // The existing unrestricted white is legally usable for {1}, while the
  // source whose mana cannot pay generic pays {W}.
  player.pool.W = 1;
  const cost = MTG.parseCost('{1}{W}');
  assert.equal(game.canPayMana(player, cost), true);
  assert.equal(await game.payMana(player, cost), true);
  assert.equal(coloredOnly.tapped, true);
  assert.equal(player.pool.W, 0);
  assert.equal(player.coloredOnlyPool.W, 0);

  const manual = rulesGame([
    (g, query) => query.type === 'chooseManaSources'
      ? { cards: query.candidates }
      : defaultDecision(g, query),
  ]);
  const plains = permanent(manual.game, manual.players[0], 'Plains');
  const restricted = permanent(manual.game, manual.players[0], definition('Manual Colored-only White', {
    types: ['Artifact'], power: undefined, toughness: undefined,
    mana: { cost: { tap: true }, coloredOnly: true, produce: [{ W: 1 }] },
  }));
  manual.players[0].manualMana = true;
  const spell = inZone(manual.players[0], definition('Manual Mixed Mana Spell', {
    cost: '{1}{W}', types: ['Instant'], power: undefined, toughness: undefined,
    resolve: async () => {},
  }), 'hand');
  assert.ok(manual.game.manualManaSelectionSolution(manual.players[0], cost, { card: spell }, [plains, restricted]),
    'the exact selected unrestricted and colored-only sources form a legal payment');
  assert.equal(await manual.game.castSpell(manual.players[0], spell, { from: 'hand' }), true);
  assert.equal(plains.tapped, true);
  assert.equal(restricted.tapped, true);
});

test('two additional combat-plus-main effects preserve both phase pairs before normal combat and main2', async () => {
  const { game, players: [player] } = rulesGame();
  for (let i = 0; i < 4; i++) inZone(player, 'Island', 'library');
  const phases = [];
  let scheduled = false;
  game.priorityRound = async () => {};
  game.mainPhase = async () => {
    phases.push(game.phase);
    if (!scheduled && game.phase === 'main1') {
      scheduled = true;
      game.scheduleAdditionalCombat({ followedByMain: true });
      game.scheduleAdditionalCombat({ followedByMain: true });
    }
  };
  game.combatPhase = async () => { phases.push('combat'); };

  await game.runTurn();

  assert.deepEqual(phases, ['main1', 'combat', 'main2', 'combat', 'main2', 'combat', 'main2']);
  assert.equal(game._additionalPhases.length, 0);
  assert.equal(game._extraCombats, 0);
});

test('an additional combat created inside another additional combat is inserted before its pending main', async () => {
  const { game, players: [player] } = rulesGame();
  for (let i = 0; i < 4; i++) inZone(player, 'Island', 'library');
  const phases = [];
  let scheduled = false;
  let combats = 0;
  game.priorityRound = async () => {};
  game.mainPhase = async () => {
    phases.push(game.phase);
    if (!scheduled && game.phase === 'main1') {
      scheduled = true;
      game.scheduleAdditionalCombat({ followedByMain: true });
    }
  };
  game.combatPhase = async () => {
    phases.push('combat');
    combats++;
    if (combats === 1) game.scheduleAdditionalCombat({ followedByMain: true });
  };

  await game.runTurn();

  assert.deepEqual(phases, ['main1', 'combat', 'combat', 'main2', 'main2', 'combat', 'main2']);
  assert.equal(game._additionalPhases.length, 0);
  assert.equal(game._extraCombats, 0);
});

test('simultaneous leave uses every pre-event Dauthi replacement source and then applies commander choice', async () => {
  const commanderDestinations = new Map();
  const decider = (game, query) => {
    if (query.aiHint?.kind === 'commanderZone') {
      commanderDestinations.set(query.aiHint.card.name, query.aiHint.toZone);
      return query.aiHint.card.name === 'Returning Commander' ? 'cz' : 'stay';
    }
    return defaultDecision(game, query);
  };
  const { game, players: [first, second, owner] } = rulesGame([null, null, decider], 3);
  const sourceDef = name => definition(name, { opponentGraveyardVoid: true, kws: ['shadow'] });
  const firstVoid = permanent(game, first, sourceDef('First Void Source'));
  const secondVoid = permanent(game, second, sourceDef('Second Void Source'));
  const ordinary = permanent(game, owner, definition('Ordinary Victim'));
  const staying = permanent(game, owner, definition('Staying Commander', { super: ['Legendary'] }));
  const returning = permanent(game, owner, definition('Returning Commander', { super: ['Legendary'] }));
  staying.commander = true;
  returning.commander = true;
  owner.commanders.push(staying, returning);
  const graveyardBatches = [];
  const originalEmit = game.emit.bind(game);
  game.emit = async (name, data) => {
    if (name === 'cardsToGraveyard') graveyardBatches.push(data.cards.slice());
    return originalEmit(name, data);
  };

  // Array order is deliberately hostile: both replacement sources are
  // represented as leaving before the other objects in the same event.
  await game.destroyMany([firstVoid, secondVoid, ordinary, staying, returning]);

  for (const card of [firstVoid, secondVoid, ordinary, staying]) {
    assert.equal(card.zone, 'exile', `${card.name} is replaced to exile`);
    assert.equal(card.counters.void, 1, `${card.name} receives exactly one void counter`);
  }
  assert.equal(returning.zone, 'command');
  assert.equal(returning.counters.void || 0, 0);
  assert.equal(commanderDestinations.get('Staying Commander'), 'exile', 'Dauthi replacement is applied before commander choice');
  assert.equal(commanderDestinations.get('Returning Commander'), 'exile', 'command-zone choice sees the replaced exile destination');
  assert.deepEqual(graveyardBatches, [], 'the batch contains no graveyard entries after all replacements');
});
