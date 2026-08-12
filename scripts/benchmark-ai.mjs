import { performance } from 'node:perf_hooks';
import { loadEngine } from '../tests/helpers/load-engine.mjs';

const MTG = loadEngine();
const deckNames = Object.keys(MTG.DECKS);

function createGame(seed = 9001) {
  const game = MTG.newGame({
    humanDeck: deckNames[0], aiDecks: deckNames.slice(1, 4),
    aiStyles: ['balanced', 'balanced', 'balanced'], difficulty: 'normal',
    seed, maxTurns: 80, paced: false,
  });
  const bot = game.players.find(player => player.isAI);
  game.turnPlayer = bot;
  game.turnNo = 12;
  game.phase = 'main1';
  game.step = 'main';
  return { game, bot };
}

function moveCard(game, player, predicate, zone) {
  const index = player.library.findIndex(predicate);
  if (index < 0) return null;
  const [card] = player.library.splice(index, 1);
  card.zone = zone;
  card.ctrl = player;
  card.sick = false;
  if (zone === 'battlefield') game.battlefield.push(card);
  else player[zone].push(card);
  return card;
}

function prepareResources(game, player, lands = 6, hand = 8) {
  for (let i = 0; i < lands; i++) moveCard(game, player, card => card.is('Land'), 'battlefield');
  for (let i = 0; i < hand; i++) moveCard(game, player, card => !card.is('Land'), 'hand');
  game.recalc();
}

async function measure(name, setup, options = {}) {
  const { game, bot, q } = setup();
  const start = performance.now();
  const decision = await MTG.chooseBotAction({
    gameState: game, botPlayerId: bot.idx, difficulty: options.difficulty || 'normal',
    seed: options.seed || 41, actionWindow: q, forceSearch: options.forceSearch,
  });
  return {
    scenario: name,
    milliseconds: Math.round((performance.now() - start) * 100) / 100,
    action: decision.log.chosen,
    nodes: decision.log.analyzedNodes,
    depth: decision.log.reachedDepth,
    fallback: decision.log.fallback,
  };
}

const scenarios = [
  await measure('main-phase', () => {
    const { game, bot } = createGame(9101);
    prepareResources(game, bot, 6, 9);
    return { game, bot, q: { type: 'main', player: bot, casts: game.castableList(bot), acts: game.activatableList(bot), lands: game.playableLands(bot), phase: game.phase } };
  }, { forceSearch: true }),

  await measure('stack-response', () => {
    const { game, bot } = createGame(9102);
    prepareResources(game, bot, 6, 12);
    const opponent = bot.opponents(game)[0];
    const spell = moveCard(game, opponent, card => !card.is('Land'), 'hand');
    opponent.hand.splice(opponent.hand.indexOf(spell), 1);
    spell.zone = 'stack';
    game.stack.push({ kind: 'spell', name: spell.name, card: spell, ctrl: opponent, targets: [] });
    const casts = game.castableList(bot).filter(entry => entry.card.is('Instant') || entry.card.kw('flash'));
    return { game, bot, q: { type: 'priority', player: bot, casts, acts: game.activatableList(bot, true), stack: game.stack, phase: game.phase } };
  }, { forceSearch: true }),

  await measure('declare-attackers', () => {
    const { game, bot } = createGame(9103);
    for (let i = 0; i < 8; i++) moveCard(game, bot, card => card.is('Creature'), 'battlefield');
    game.phase = 'combat'; game.step = 'attackers'; game.recalc();
    const eligible = game.creatures(bot).filter(card => !card.tapped && !card.sick && game.canAttackAtAll(card));
    return { game, bot, q: { type: 'attackers', player: bot, eligible, opponents: bot.opponents(game), forced: [] } };
  }),

  await measure('declare-blockers', () => {
    const { game, bot } = createGame(9104);
    const enemy = bot.opponents(game)[0];
    for (let i = 0; i < 8; i++) moveCard(game, bot, card => card.is('Creature'), 'battlefield');
    for (let i = 0; i < 8; i++) {
      const attacker = moveCard(game, enemy, card => card.is('Creature'), 'battlefield');
      if (attacker) attacker.attacking = bot;
    }
    game.phase = 'combat'; game.step = 'blockers'; game.recalc();
    return { game, bot, q: { type: 'blockers', player: bot, attackers: game.creatures(enemy), potential: game.creatures(bot) } };
  }),

  await measure('complex-board', () => {
    const { game, bot } = createGame(9105);
    for (const player of game.players) {
      for (let i = 0; i < 13; i++) moveCard(game, player, card => card.is('Land'), 'battlefield');
      for (let i = 0; i < 12; i++) moveCard(game, player, card => !card.is('Instant') && !card.is('Sorcery') && !card.is('Land'), 'battlefield');
    }
    for (let i = 0; i < 10; i++) moveCard(game, bot, card => !card.is('Land'), 'hand');
    game.recalc();
    return { game, bot, q: { type: 'main', player: bot, casts: game.castableList(bot), acts: game.activatableList(bot), lands: game.playableLands(bot), phase: game.phase } };
  }, { forceSearch: true }),
];

console.table(scenarios);
console.log(JSON.stringify({ generatedAt: new Date().toISOString(), scenarios }, null, 2));
if (scenarios.some(row => row.fallback)) process.exitCode = 1;
