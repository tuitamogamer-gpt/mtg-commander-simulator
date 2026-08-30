import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function passDecision(query) {
  if (query.type === 'priority') return { kind: 'pass' };
  if (query.type === 'main') return { kind: 'done' };
  if (query.type === 'attackers' || query.type === 'blockers' || query.type === 'combatReview') return [];
  if (query.type === 'chooseOption') return query.options[0]?.key;
  if (query.type === 'chooseTargets') return query.candidates.slice(0, query.min || 0);
  if (query.type === 'chooseCards') return query.from.slice(0, query.min || 0);
  if (query.type === 'orderTriggers') return query.triggers.slice();
  return null;
}

function actualCard(player, name, zone) {
  const definition = MTG.DEFS[name];
  assert.ok(definition, `actual imported definition exists: ${name}`);
  const card = new MTG.CardInst(definition, player);
  card.zone = zone;
  player[zone].push(card);
  return card;
}

function actualPermanent(game, player, name) {
  const definition = MTG.DEFS[name];
  assert.ok(definition, `actual imported definition exists: ${name}`);
  const card = new MTG.CardInst(definition, player);
  card.zone = 'battlefield';
  card.ctrl = player;
  card.sick = false;
  game.battlefield.push(card);
  game.recalc();
  return card;
}

function combatFixture(seed, cardName, pool) {
  const game = new MTG.Game({ seed, paced: false, maxTurns: 4, difficulty: 'hard' });
  const bot = game.addPlayer('Oracle hard bot', { name: 'Team-pump regression' }, null, true);
  const opponent = game.addPlayer(
    'Combat opponent',
    { name: 'Combat fixture' },
    { decide: async (currentGame, query) => passDecision(query) },
    false,
  );
  bot.controller = new MTG.AIController(bot, { difficulty: 'hard', style: 'balanced' });
  game.turnNo = 8;
  game.phase = 'combat';
  game.step = 'attackers';
  const spell = actualCard(bot, cardName, 'hand');
  Object.assign(bot.pool, pool);
  return { game, bot, opponent, spell };
}

function setAttacker(game, attacker, defender) {
  attacker.attacking = defender;
  game.combat = {
    attackers: [attacker],
    blockers: [],
    defendingPlayer: defender,
  };
  game.recalc();
}

test('hard local AI keeps actual Army of Allah when only a hostile attacker would get +2/+0', async () => {
  const { game, bot, opponent, spell } = combatFixture(7461, 'Army of Allah', { C: 1, W: 2 });
  const attacker = actualPermanent(game, opponent, 'Grizzly Bears');
  const powerBefore = attacker.power;
  game.turnPlayer = opponent;
  setAttacker(game, attacker, bot);

  await game.priorityRound(opponent);

  assert.equal(spell.zone, 'hand', 'Army of Allah is not spent to buff only the enemy attacker');
  assert.equal(attacker.power, powerBefore, 'hostile attacker receives no accidental positive pump');
  const decision = game.aiDecisionLog.find(entry =>
    entry.chosen === 'Pass priority' || entry.alternatives.some(candidate => /Army of Allah/.test(candidate.action)));
  assert.ok(decision, 'real local AI records the Army-versus-pass decision');
  assert.equal(decision.chosen, 'Pass priority');
  const army = [decision, ...(decision.alternatives || [])].find(entry => /Army of Allah/.test(entry.action || entry.chosen));
  assert.ok(army, 'Army of Allah remains an evaluated, rules-legal action');
  assert.ok(army.score < decision.score, `hostile-only Army score ${army.score} loses to pass ${decision.score}`);
});

test('hard local AI casts actual Hydrolash to debuff a hostile attacker and draw', async () => {
  const { game, bot, opponent, spell } = combatFixture(7462, 'Hydrolash', { C: 2, U: 1 });
  const drawCard = actualCard(bot, 'Island', 'library');
  const attacker = actualPermanent(game, opponent, 'Grizzly Bears');
  const powerBefore = attacker.power;
  game.turnPlayer = opponent;
  setAttacker(game, attacker, bot);

  await game.priorityRound(opponent);

  assert.equal(spell.zone, 'graveyard', 'Hydrolash is cast and resolves through the real Stack');
  assert.equal(attacker.power, powerBefore - 2, 'actual hostile attacker gets the printed -2/-0');
  assert.equal(drawCard.zone, 'hand', 'Hydrolash keeps its actual draw rider');
  assert.ok(game.aiDecisionLog.some(entry => entry.chosen === 'Cast Hydrolash'),
    'genuine hard AI selected actual Hydrolash');
  assert.equal(game.stack.length, 0);
});

test('hard local AI still casts actual Army of Allah for its own attacker', async () => {
  const { game, bot, opponent, spell } = combatFixture(7463, 'Army of Allah', { C: 1, W: 2 });
  const attacker = actualPermanent(game, bot, 'Grizzly Bears');
  const powerBefore = attacker.power;
  game.turnPlayer = bot;
  setAttacker(game, attacker, opponent);

  await game.priorityRound(bot);

  assert.equal(spell.zone, 'graveyard', 'Army of Allah remains useful on the bot attack');
  assert.equal(attacker.power, powerBefore + 2, 'actual friendly attacker gets the printed +2/+0');
  assert.ok(game.aiDecisionLog.some(entry => entry.chosen === 'Cast Army of Allah'));
  assert.equal(game.stack.length, 0);
});
