import assert from 'node:assert/strict';
import test from 'node:test';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function setup(difficulty = 'hard') {
  const game = new MTG.Game({ seed: 8351, paced: false, maxTurns: 12 });
  const players = ['Poison bot', 'Low-life opponent', 'Poisoned opponent'].map((name, index) => {
    const player = game.addPlayer(name, { name: `${name} deck` }, null, index === 0);
    player.controller = new MTG.AIController(player, { difficulty, style: 'balanced' });
    return player;
  });
  game.turnNo = 6;
  game.turnPlayer = players[0];
  game.phase = 'main1';
  game.step = 'main';
  game.priorityRound = async () => {};
  game.revealToHuman = async () => {};
  return { game, players };
}

function put(game, player, definition, zone = 'battlefield') {
  const card = new MTG.CardInst(typeof definition === 'string' ? MTG.DEFS[definition] : definition, player);
  card.zone = zone;
  card.ctrl = player;
  card.sick = false;
  if (zone === 'battlefield') game.battlefield.push(card);
  else player[zone].push(card);
  game.recalc();
  return card;
}

async function castActual(game, player, name) {
  const card = put(game, player, name, 'hand');
  player.pool.B = 8;
  player.pool.C = 8;
  assert.equal(await game.castSpell(player, card, { from: 'hand' }), true, 'actual imported creature is cast with mana');
  while (game.stack.length || game.pendingTriggers.length) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
  }
  assert.equal(card.zone, 'battlefield');
  card.sick = false;
  return card;
}

function assertBotWitness(game, bot, type) {
  const entries = (game.aiDecisionLog || []).filter(entry => entry.playerId === bot.idx);
  assert.ok(entries.length > 0, `${type}: the actual local controller decided`);
  assert.equal(entries.some(entry => entry.fallback), false, `${type}: no AI fallback`);
  assert.equal(game.stack.length, 0);
  assert.equal(game.pendingTriggers.length, 0);
}

test('poison is public state, changes the AI cache key, and affects survival without exposing hidden cards', () => {
  const { game, players: [bot, opponent] } = setup();
  put(game, opponent, 'Badlands Revival', 'hand');
  const safe = MTG.createBotPlayerView(game, bot.idx);
  assert.equal(safe.players[0].poison, 0);
  assert.equal(Object.hasOwn(safe.players[1], 'hand'), false);
  const safeScore = MTG.evaluateState(safe, bot.idx);
  const originalHash = MTG.hashBotPlayerView(safe);

  bot.poison = 9;
  opponent.poison = 3;
  const danger = MTG.createBotPlayerView(game, bot.idx);
  assert.equal(danger.players[0].poison, 9);
  assert.equal(danger.players[1].poison, 3);
  assert.equal(Object.hasOwn(danger.players[1], 'hand'), false);
  assert.notEqual(MTG.hashBotPlayerView(danger), originalHash, 'nine poison must not reuse the zero-poison evaluation');
  assert.ok(MTG.evaluateState(danger, bot.idx).survival < safeScore.survival);
  assert.equal(safe.players[0].poison, 0, 'immutable earlier public snapshot is unchanged');
  const clone = MTG.cloneGameForAISimulation(game, 22);
  clone.players[0].poison += 1;
  assert.equal(game.players[0].poison, 9, 'simulation does not mutate live poison');
});

for (const difficulty of ['easy', 'normal', 'hard']) {
  test(`${difficulty} actual AI: infect chooses poison lethal, never fake life-total lethal`, async () => {
    const { game, players: [bot, bait, lethal] } = setup(difficulty);
    const attacker = await castActual(game, bot, 'Plague Stinger');
    bait.life = 1;
    lethal.life = 40;
    lethal.poison = 9;
    const assessment = MTG.assessAttackAssignment(game, bot, attacker, bait);
    assert.equal(assessment.lethal, false, 'infect deals no life loss to the one-life opponent');
    assert.equal(MTG.assessAttackAssignment(game, bot, attacker, lethal).lethal, true);
    const attacks = await bot.controller.decide(game, {
      type: 'attackers', player: bot, eligible: [attacker], opponents: [bait, lethal], forced: [],
    });
    assert.equal(attacks.length, 1);
    assert.equal(attacks[0].target.idx, lethal.idx, 'AI attacks the actual poison-lethal opponent');
    await game.combatPhase(bot);
    assert.equal(lethal.poison, 10, 'the real combat step confirms the predicted poison lethal');
    assert.equal(lethal.life, 40, 'infect did not cause life loss');
    assert.equal(lethal.lost, true);
    assert.equal(bait.life, 1);
    assert.equal(bait.lost, false);
    assertBotWitness(game, bot, 'infect attackers');
  });

  test(`${difficulty} actual AI: toxic attacks the player at nine poison`, async () => {
    const { game, players: [bot, safe, lethal] } = setup(difficulty);
    const attacker = await castActual(game, bot, 'Bilious Skulldweller');
    safe.life = 40;
    lethal.life = 40;
    lethal.poison = 9;
    assert.equal(MTG.assessAttackAssignment(game, bot, attacker, safe).lethal, false);
    assert.equal(MTG.assessAttackAssignment(game, bot, attacker, lethal).poisonLethal, true);
    const attacks = await bot.controller.decide(game, {
      type: 'attackers', player: bot, eligible: [attacker], opponents: [safe, lethal], forced: [],
    });
    assert.equal(attacks.length, 1);
    assert.equal(attacks[0].target.idx, lethal.idx);
    await game.combatPhase(bot);
    assert.equal(lethal.poison, 10);
    assert.equal(lethal.life, 39, 'toxic still causes normal combat life loss');
    assert.equal(lethal.lost, true);
    assert.equal(safe.poison, 0);
    assertBotWitness(game, bot, 'toxic attackers');
  });
}

test('actual local AI sacrifices a valuable blocker to stop poison lethal', async () => {
  for (const name of ['Plague Stinger', 'Bilious Skulldweller']) {
    const { game, players: [bot, enemy] } = setup();
    bot.poison = 9;
    const attacker = await castActual(game, enemy, name);
    const blocker = put(game, bot, {
      name: 'Valuable flying blocker', cost: '{8}', super: [], types: ['Creature'], subtypes: ['Bird'],
      power: '0', toughness: '1', kws: ['flying'],
      oracle: 'Whenever you cast a spell, draw a card.', abilities: [],
    });
    attacker.attacking = bot;
    game.turnPlayer = enemy;
    game.phase = 'combat';
    game.step = 'blockers';
    const blocks = await bot.controller.decide(game, {
      type: 'blockers', player: bot, attackers: [attacker], potential: [blocker],
    });
    assert.equal(blocks.length, 1, `${name}: survival takes priority over keeping a valuable creature`);
    assert.equal(blocks[0].attacker.iid, attacker.iid);
    assert.equal(blocks[0].blocker.iid, blocker.iid);
    attacker.blockedBy = [blocks[0].blocker];
    attacker.wasBlocked = true;
    blocker.blocking = attacker.iid;
    game.combat = { attackers: [attacker] };
    await game.combatDamage(enemy, 'normal');
    assert.equal(bot.poison, 9, 'the chosen block actually prevents the lethal poison counter');
    assert.equal(bot.lost, false);
    assert.equal(blocker.zone, 'graveyard', 'bot paid the material cost to remain alive');
    assertBotWitness(game, bot, `${name} blocker`);
  }
});

test('public threat and win estimates distinguish infect, toxic, and ordinary life damage', async () => {
  const { game, players: [bot, opponent] } = setup();
  const attacker = await castActual(game, bot, 'Plague Stinger');
  opponent.life = 1;
  let view = MTG.createBotPlayerView(game, bot.idx);
  assert.equal(MTG.assessPlayerThreat(view, opponent.idx, bot.idx).immediateLethal, 0);
  assert.ok(MTG.evaluateState(view, bot.idx).immediateWinPotential < 55);
  opponent.poison = 9;
  view = MTG.createBotPlayerView(game, bot.idx);
  assert.equal(MTG.assessPlayerThreat(view, opponent.idx, bot.idx).immediateLethal, 1);
  assert.equal(MTG.evaluateState(view, bot.idx).immediateWinPotential, 55);

  opponent.poison = 0;
  attacker.cur.kw.delete('infect');
  view = MTG.createBotPlayerView(game, bot.idx);
  assert.equal(MTG.assessPlayerThreat(view, opponent.idx, bot.idx).immediateLethal, 1, 'ordinary damage really is life lethal');
  assert.equal(MTG.evaluateState(view, bot.idx).immediateWinPotential, 55, 'keyword-only change invalidates the cached poison projection');
});

test('toxic public value disappears with ability removal and remains hidden for unknown face-down cards', async () => {
  const { game, players: [bot, opponent] } = setup();
  const attacker = await castActual(game, bot, 'Bilious Skulldweller');
  let view = MTG.createBotPlayerView(game, opponent.idx);
  assert.equal(view.battlefield.find(card => card.id === attacker.iid).toxic, 1);
  attacker.cur.abilitiesDisabled = true;
  view = MTG.createBotPlayerView(game, opponent.idx);
  assert.equal(view.battlefield.find(card => card.id === attacker.iid).toxic, 0);
  attacker.cur.abilitiesDisabled = false;
  attacker.faceDown = true;
  view = MTG.createBotPlayerView(game, opponent.idx);
  const unknown = view.battlefield.find(card => card.id === attacker.iid);
  assert.equal(unknown.known, false);
  assert.equal(unknown.toxic, 0);
});

test('toxic forecast requires positive damage and counts both actual double-strike hits', async () => {
  const { game, players: [bot, opponent] } = setup();
  const attacker = await castActual(game, bot, 'Bilious Skulldweller');
  opponent.poison = 8;
  MTG.E.pumpUntilEOT(game, attacker, 0, 0, ['double strike']);
  assert.equal(MTG.assessAttackAssignment(game, bot, attacker, opponent).poisonLethal, true);
  await game.combatPhase(bot);
  assert.equal(opponent.poison, 10);
  assert.equal(opponent.lost, true);
  assertBotWitness(game, bot, 'double strike toxic');

  const zero = setup();
  const harmless = await castActual(zero.game, zero.players[0], 'Bilious Skulldweller');
  zero.players[1].poison = 9;
  MTG.E.pumpUntilEOT(zero.game, harmless, -1, 0);
  const forecast = MTG.assessAttackAssignment(zero.game, zero.players[0], harmless, zero.players[1]);
  assert.equal(forecast.expectedDamage, 0);
  assert.equal(forecast.poisonLethal, false, 'zero damage cannot apply toxic');
});
