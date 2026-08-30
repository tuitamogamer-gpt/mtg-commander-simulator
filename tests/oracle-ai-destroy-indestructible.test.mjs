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
  const bot = game.addPlayer('Hard removal bot', { name: 'Oracle AI regression' }, null, true);
  const opponent = game.addPlayer('Opponent', { name: 'Opponent deck' }, {
    decide: async (currentGame, query) => fallbackDecision(query),
  }, false);
  bot.controller = new MTG.AIController(bot, { difficulty: 'hard', style: 'balanced' });
  game.turnNo = 9;
  game.turnPlayer = bot;
  game.phase = 'main1';
  game.step = 'main';
  game.priorityRound = async () => {};
  return { game, bot, opponent };
}

function addCard(game, player, name, zone) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.ctrl = player;
  card.zone = zone;
  card.sick = false;
  if (zone === 'battlefield') game.battlefield.push(card);
  else player[zone].push(card);
  game.recalc();
  return card;
}

function mainWindow(game, bot) {
  return {
    type: 'main', player: bot,
    casts: game.castableList(bot), acts: game.activatableList(bot), lands: [],
    phase: game.phase,
  };
}

async function resolveAll(game) {
  let guard = 0;
  while ((game.pendingTriggers.length || game.stack.length) && guard++ < 40) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
  }
  assert.ok(guard < 40, 'destroy-aware AI regression stack did not settle');
}

test('hard local AI holds actual Vote Out when actual Impervious Greatwurm is its only legal target', async () => {
  const { game, bot, opponent } = aiGame(9311);
  const voteOut = addCard(game, bot, 'Vote Out', 'hand');
  const greatwurm = addCard(game, opponent, 'Impervious Greatwurm', 'battlefield');
  bot.pool.B = 1;
  bot.pool.C = 3;

  const cast = game.castableList(bot).find(entry => entry.card === voteOut);
  assert.ok(cast, 'Vote Out remains castable for a human-facing rules query');
  const spec = game.spellTargetSpecs(voteOut, cast.alt || {}, bot)[0];
  assert.equal(spec.aiHint.removalKind, 'destroy');
  assert.ok(game.legalTargets(spec, voteOut, bot).includes(greatwurm),
    'indestructible Greatwurm remains a rules-legal destroy target');

  const decision = await bot.controller.decide(game, mainWindow(game, bot));
  assert.equal(decision.kind, 'done', 'hard AI keeps the ineffective destroy spell in hand');
  assert.equal(voteOut.zone, 'hand');
  assert.equal(greatwurm.zone, 'battlefield');
});

test('hard local AI points actual Vote Out at an effective creature instead of Impervious Greatwurm', async () => {
  const { game, bot, opponent } = aiGame(9312);
  const voteOut = addCard(game, bot, 'Vote Out', 'hand');
  const greatwurm = addCard(game, opponent, 'Impervious Greatwurm', 'battlefield');
  const mulldrifter = addCard(game, opponent, 'Mulldrifter', 'battlefield');
  bot.pool.B = 1;
  bot.pool.C = 3;

  const decision = await bot.controller.decide(game, mainWindow(game, bot));
  assert.equal(decision.kind, 'cast');
  assert.equal(decision.card, voteOut);
  assert.equal(await game.performAction(bot, decision), true);
  await resolveAll(game);

  assert.equal(mulldrifter.zone, 'graveyard', 'AI destroys the effective actual-card target');
  assert.equal(greatwurm.zone, 'battlefield', 'AI does not waste Vote Out on the indestructible target');
});

test('hard local AI still uses actual exile removal on Impervious Greatwurm', async () => {
  const { game, bot, opponent } = aiGame(9313);
  const unmake = addCard(game, bot, 'Unmake', 'hand');
  const greatwurm = addCard(game, opponent, 'Impervious Greatwurm', 'battlefield');
  bot.pool.B = 3;

  const cast = game.castableList(bot).find(entry => entry.card === unmake);
  assert.ok(cast);
  const spec = game.spellTargetSpecs(unmake, cast.alt || {}, bot)[0];
  assert.equal(spec.aiHint.removalKind, 'exile');

  const decision = await bot.controller.decide(game, mainWindow(game, bot));
  assert.equal(decision.kind, 'cast', 'exile removal receives no indestructible penalty');
  assert.equal(decision.card, unmake);
  assert.equal(await game.performAction(bot, decision), true);
  await resolveAll(game);

  assert.equal(greatwurm.zone, 'exile', 'actual exile answer removes the indestructible creature');
});
