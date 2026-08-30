import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function fallbackDecision(query) {
  if (query.type === 'priority') return { kind: 'pass' };
  if (query.type === 'main') return { kind: 'done' };
  if (query.type === 'attackers' || query.type === 'blockers' || query.type === 'combatReview') return [];
  if (query.type === 'chooseTargets') return query.candidates.slice(0, query.min || 0);
  if (query.type === 'chooseCards') return query.from.slice(0, query.min || 0);
  if (query.type === 'chooseOption') return query.options[0]?.key;
  if (query.type === 'chooseX') return query.min || 0;
  if (query.type === 'orderTriggers') return query.triggers;
  return null;
}

function aiGame(seed) {
  const game = new MTG.Game({ seed, paced: false, maxTurns: 20, difficulty: 'hard' });
  const bot = game.addPlayer('Hard global-pump bot', { name: 'Oracle AI regression' }, null, true);
  const opponent = game.addPlayer('Opponent', { name: 'Opponent deck' }, {
    decide: async (currentGame, query) => fallbackDecision(query),
  }, false);
  bot.controller = new MTG.AIController(bot, { difficulty: 'hard', style: 'balanced' });
  game.turnNo = 9;
  game.turnPlayer = bot;
  game.phase = 'main1';
  game.step = 'main';
  return { game, bot, opponent };
}

function addActual(game, player, name, zone = 'battlefield') {
  const definition = MTG.DEFS[name];
  assert.ok(definition, `actual imported definition exists: ${name}`);
  const card = new MTG.CardInst(definition, player);
  card.ctrl = player;
  card.zone = zone;
  card.sick = false;
  if (zone === 'battlefield') game.battlefield.push(card);
  else player[zone].push(card);
  game.recalc();
  return card;
}

function mainWindow(game, player) {
  return {
    type: 'main', player,
    casts: game.castableList(player), acts: game.activatableList(player), lands: [],
    phase: game.phase,
  };
}

function stageCombat(game, attacker, defender) {
  attacker.attacking = defender;
  attacker.tapped = true;
  game.combat = { attackers: [attacker], blockers: [], defendingPlayer: defender };
  game.recalc();
}

function considered(controller, cardName) {
  return controller.lastV2Decision.consideredActions.find(entry => entry.action === `Cast ${cardName}`);
}

async function resolveAll(game) {
  let guard = 0;
  while ((game.pendingTriggers.length || game.stack.length) && guard++ < 40) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
  }
  assert.ok(guard < 40, 'global-pump AI regression stack did not settle');
}

test('hard local AI holds actual Rollick of Abandon when its global pump kills three own creatures', async () => {
  const { game, bot, opponent } = aiGame(9321);
  const rollick = addActual(game, bot, 'Rollick of Abandon', 'hand');
  const ownCreatures = Array.from({ length: 3 }, () => addActual(game, bot, 'Elvish Mystic'));
  const greatwurm = addActual(game, opponent, 'Impervious Greatwurm');
  bot.pool.C = 3;
  bot.pool.R = 2;

  const operation = rollick.def.oracleImplementation.find(entry => entry.kind === 'spell-global-pump');
  assert.deepEqual({ power: operation.power, toughness: operation.toughness }, { power: 2, toughness: -2 });
  const decision = await bot.controller.decide(game, mainWindow(game, bot));

  assert.equal(decision.kind, 'done', 'AI keeps the net-negative global pump in hand');
  const castScore = considered(bot.controller, 'Rollick of Abandon');
  assert.ok(castScore, 'actual Rollick remained a legal evaluated action');
  assert.ok(castScore.scoreBreakdown.threat < -15,
    `three projected friendly deaths are reflected in board score (${castScore.scoreBreakdown.threat})`);
  assert.ok(castScore.score < bot.controller.lastV2Decision.consideredActions.find(entry => entry.action === 'End action window').score);
  assert.equal(rollick.zone, 'hand');
  assert.ok(ownCreatures.every(card => card.zone === 'battlefield'));
  assert.equal(greatwurm.zone, 'battlefield');
});

test('global-pump scoring counts marked damage that becomes lethal after an actual toughness reduction', async () => {
  const { game, bot, opponent } = aiGame(9325);
  const rollick = addActual(game, bot, 'Rollick of Abandon', 'hand');
  const damaged = addActual(game, bot, 'Pyroceratops');
  addActual(game, opponent, 'Impervious Greatwurm');
  damaged.damage = 1;
  game.recalc();
  assert.equal(damaged.toughness, 3);
  bot.pool.C = 3;
  bot.pool.R = 2;

  const decision = await bot.controller.decide(game, mainWindow(game, bot));
  assert.equal(decision.kind, 'done');
  const castScore = considered(bot.controller, 'Rollick of Abandon');
  assert.ok(castScore.scoreBreakdown.threat < -8,
    `1 marked damage is lethal after 3 toughness becomes 1 (${castScore.scoreBreakdown.threat})`);
  assert.equal(rollick.zone, 'hand');
  assert.equal(damaged.zone, 'battlefield');
});

test('hard local AI casts actual Rollick when the same global pump has a positive net board result', async () => {
  const { game, bot, opponent } = aiGame(9322);
  const rollick = addActual(game, bot, 'Rollick of Abandon', 'hand');
  const greatwurm = addActual(game, bot, 'Impervious Greatwurm');
  const victims = Array.from({ length: 3 }, () => addActual(game, opponent, 'Elvish Mystic'));
  const powerBefore = greatwurm.power;
  const toughnessBefore = greatwurm.toughness;
  bot.pool.C = 3;
  bot.pool.R = 2;

  const decision = await bot.controller.decide(game, mainWindow(game, bot));
  assert.equal(decision.kind, 'cast');
  assert.equal(decision.card, rollick);
  game.priorityRound = async () => {};
  assert.equal(await game.performAction(bot, decision), true);
  await resolveAll(game);

  assert.ok(victims.every(card => card.zone === 'graveyard'), 'all three actual 1/1 opponents die to -2 toughness');
  assert.equal(greatwurm.zone, 'battlefield');
  assert.equal(greatwurm.power, powerBefore + 2);
  assert.equal(greatwurm.toughness, toughnessBefore - 2);
  assert.equal(rollick.zone, 'graveyard');
});

test('hard local AI holds actual Magnify when only an enemy attacker receives the global bonus', async () => {
  const { game, bot, opponent } = aiGame(9323);
  game.turnPlayer = opponent;
  game.phase = 'combat';
  game.step = 'blockers';
  const magnify = addActual(game, bot, 'Magnify', 'hand');
  const attacker = addActual(game, opponent, 'Impervious Greatwurm');
  stageCombat(game, attacker, bot);
  bot.pool.G = 1;

  const decision = await game.askPriorityAction(bot);
  assert.equal(decision.kind, 'pass', 'AI does not spend Magnify to strengthen only the enemy attacker');
  const castScore = considered(bot.controller, 'Magnify');
  assert.ok(castScore);
  assert.ok(castScore.scoreBreakdown.combat < 0, 'enemy attacker bonus is a negative combat swing');
  assert.ok(castScore.scoreBreakdown.timing <= -6, 'non-positive global effect receives a hold penalty');
  assert.equal(magnify.zone, 'hand');
  assert.equal(attacker.power, 16);
  assert.equal(attacker.toughness, 16);
});

test('actual Magnify scores both a friendly blocker and the hostile attacker it would also pump', async () => {
  const { game, bot, opponent } = aiGame(9326);
  game.turnPlayer = opponent;
  game.phase = 'combat';
  game.step = 'blockers';
  const magnify = addActual(game, bot, 'Magnify', 'hand');
  const attacker = addActual(game, opponent, 'Grizzly Bears');
  const blocker = addActual(game, bot, 'Grizzly Bears');
  stageCombat(game, attacker, bot);
  attacker.wasBlocked = true;
  attacker.blockedBy = [blocker];
  blocker.blocking = attacker.iid;
  game.recalc();
  bot.pool.G = 1;

  const decision = await game.askPriorityAction(bot);
  assert.equal(decision.kind, 'pass', 'a symmetric global bonus is not mistaken for a friendly-only trick');
  const castScore = considered(bot.controller, 'Magnify');
  assert.ok(castScore.scoreBreakdown.combat < 0,
    `both combatants are included instead of granting the old friendly-only bonus (${castScore.scoreBreakdown.combat})`);
  assert.equal(magnify.zone, 'hand');
});

test('hard local AI still casts actual Magnify for a positive own-attacker combat swing', async () => {
  const { game, bot, opponent } = aiGame(9324);
  game.phase = 'combat';
  game.step = 'blockers';
  const magnify = addActual(game, bot, 'Magnify', 'hand');
  const attacker = addActual(game, bot, 'Grizzly Bears');
  stageCombat(game, attacker, opponent);
  bot.pool.G = 1;
  const powerBefore = attacker.power;
  const toughnessBefore = attacker.toughness;

  const decision = await game.askPriorityAction(bot);
  assert.equal(decision.kind, 'cast');
  assert.equal(decision.card, magnify);
  game.priorityRound = async () => {};
  assert.equal(await game.performAction(bot, decision), true);
  await resolveAll(game);

  assert.equal(attacker.power, powerBefore + 1);
  assert.equal(attacker.toughness, toughnessBefore + 1);
  assert.equal(magnify.zone, 'graveyard');
});
