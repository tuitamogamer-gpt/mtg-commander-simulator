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

test('hard local AI keeps actual Dismiss against actual uncounterable Supreme Verdict', async () => {
  const game = new MTG.Game({ seed: 7451, paced: false, maxTurns: 4, difficulty: 'hard' });
  const bot = game.addPlayer('Oracle hard bot', { name: 'AI counter regression' }, null, true);
  const opponent = game.addPlayer(
    'Verdict caster',
    { name: 'Verdict fixture' },
    { decide: async (currentGame, query) => passDecision(query) },
    false,
  );
  const controller = new MTG.AIController(bot, { difficulty: 'hard', style: 'balanced' });
  bot.controller = controller;
  game.turnPlayer = opponent;
  game.turnNo = 7;
  game.phase = 'main1';
  game.step = 'main';

  const dismiss = actualCard(bot, 'Dismiss', 'hand');
  const drawCard = actualCard(bot, 'Island', 'library');
  const threatenedCreature = actualPermanent(game, bot, 'Pyroceratops');
  const verdict = actualCard(opponent, 'Supreme Verdict', 'hand');
  bot.pool.C = 2;
  bot.pool.U = 2;

  // Leave the actual spell on Stack so the test can inspect and execute the
  // local AI's real response window.
  const realPriorityRound = game.priorityRound;
  game.priorityRound = async () => {};
  assert.equal(await game.castSpell(opponent, verdict, {
    from: 'hand', alt: { free: true },
  }), true, 'opponent casts actual Supreme Verdict through the engine');
  game.priorityRound = realPriorityRound;

  const stackTop = game.stack.at(-1);
  assert.equal(stackTop?.card, verdict);
  assert.equal(MTG.isUncounterable(game, stackTop), true,
    'actual Supreme Verdict is uncounterable on the real Stack');

  let priorityQuery = null;
  const decide = controller.decide.bind(controller);
  controller.decide = async (currentGame, query) => {
    if (query.type === 'priority') priorityQuery = query;
    return decide(currentGame, query);
  };
  const response = await game.askPriorityAction(bot);

  assert.ok(priorityQuery?.casts.some(entry => entry.card === dismiss),
    'Dismiss remains rules-legal and payable; this is an AI choice, not a legality shortcut');
  assert.equal(response?.kind, 'pass',
    'hard local AI does not spend Dismiss for only its draw rider');
  assert.equal(controller.priorityAction(game, priorityQuery)?.kind, 'pass',
    'legacy local-AI fallback applies the same uncounterable guard');

  const dismissScore = controller.lastV2Decision.consideredActions.find(entry => /Dismiss/.test(entry.action));
  assert.ok(dismissScore, 'V2 evaluator considered the actual payable Dismiss action');
  assert.ok(dismissScore.scoreBreakdown.timing <= -90,
    `uncounterable response is decisively rejected in scoring (${dismissScore.scoreBreakdown.timing})`);

  const handBefore = bot.hand.slice();
  const libraryBefore = bot.library.slice();
  await game.priorityRound(opponent);

  assert.deepEqual(bot.hand, handBefore, 'Dismiss remains in hand after the complete priority round');
  assert.deepEqual(bot.library, libraryBefore, 'Dismiss draw rider did not consume the actual library card');
  assert.equal(bot.library[0], drawCard);
  assert.equal(verdict.zone, 'graveyard', 'Supreme Verdict resolves normally');
  assert.equal(threatenedCreature.zone, 'graveyard', 'the uncounterable wipe still destroys the creature');
  assert.equal(game.stack.length, 0);
});

test('hard local AI still casts actual Dismiss against actual counterable Wrath of God', async () => {
  const game = new MTG.Game({ seed: 7452, paced: false, maxTurns: 4, difficulty: 'hard' });
  const bot = game.addPlayer('Oracle hard bot', { name: 'AI counter control' }, null, true);
  const opponent = game.addPlayer(
    'Wrath caster',
    { name: 'Wrath fixture' },
    { decide: async (currentGame, query) => passDecision(query) },
    false,
  );
  const controller = new MTG.AIController(bot, { difficulty: 'hard', style: 'balanced' });
  bot.controller = controller;
  game.turnPlayer = opponent;
  game.turnNo = 7;
  game.phase = 'main1';
  game.step = 'main';

  const dismiss = actualCard(bot, 'Dismiss', 'hand');
  actualCard(bot, 'Island', 'library');
  const wrath = actualCard(opponent, 'Wrath of God', 'hand');
  bot.pool.C = 2;
  bot.pool.U = 2;

  const realPriorityRound = game.priorityRound;
  game.priorityRound = async () => {};
  assert.equal(await game.castSpell(opponent, wrath, {
    from: 'hand', alt: { free: true },
  }), true, 'opponent casts actual Wrath of God through the engine');
  game.priorityRound = realPriorityRound;

  const stackTop = game.stack.at(-1);
  assert.equal(stackTop?.card, wrath);
  assert.equal(MTG.isUncounterable(game, stackTop), false);

  let priorityQuery = null;
  const decide = controller.decide.bind(controller);
  controller.decide = async (currentGame, query) => {
    if (query.type === 'priority') priorityQuery = query;
    return decide(currentGame, query);
  };
  const response = await game.askPriorityAction(bot);

  assert.ok(priorityQuery?.casts.some(entry => entry.card === dismiss));
  assert.equal(response?.kind, 'cast', 'hard local AI still uses its counter on a counterable wipe');
  assert.equal(response?.card, dismiss);
  assert.equal(controller.priorityAction(game, priorityQuery)?.card, dismiss,
    'legacy local-AI fallback retains the counterable response');
});
