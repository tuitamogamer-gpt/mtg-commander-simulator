import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';

// Holding up answers is a reason not to tap out, never a reason to skip a
// land drop. Several signature styles scored "end the main phase" above a
// free Plains whenever they held an instant with open mana, so full-game
// audits saw them sit on two or three lands in hand turn after turn.
const M = loadEngine();
function mainDecision(style, landsInPlay) {
  const game = new M.Game({seed: 291027, paced: false});
  game.speedFactor = 0;
  game.priorityRound = async () => {};
  const bot = game.addPlayer('Bot', {name: 'Hold'}, null, true);
  const opponents = [1, 2, 3].map(index => game.addPlayer(`Opponent ${index}`, {name: 'Table'}, null, true));
  bot.controller = new M.AIController(bot, {difficulty: 'normal', style});
  bot.aiStyle = style;
  for (const opponent of opponents) opponent.controller = {decide: async (g, q) => q.type === 'priority' ? {kind: 'pass'} : []};
  game.turnPlayer = bot; game.turnNo = 19; game.phase = 'main1'; game.step = 'main';
  const add = (name, owner = bot, zone = 'battlefield') => {
    const card = new M.CardInst(M.DEFS[name], owner);
    assert.ok(card.def, name);
    card.zone = zone; card.sick = false;
    if (zone === 'battlefield') game.battlefield.push(card); else owner[zone].push(card);
    return card;
  };
  for (let i = 0; i < landsInPlay; i++) add(i % 2 ? 'Island' : 'Plains');
  for (const opponent of opponents) {
    add('Serra Angel', opponent); add('Grizzly Bears', opponent);
    for (let i = 0; i < 10; i++) add('Swamp', opponent, 'library');
  }
  for (let i = 0; i < 20; i++) add('Plains', bot, 'library');
  for (const name of ['Swords to Plowshares', 'Counterspell', 'Plains']) add(name, bot, 'hand');
  game.recalc();
  return bot.controller.decide(game, {type: 'main', player: bot, phase: game.phase, stack: game.stack,
    lands: game.playableLands(bot), casts: game.castableList(bot), acts: game.activatableList(bot)});
}

for (const style of ['post', 'olivia', 'josh', 'balanced']) for (const landsInPlay of [4, 8]) {
  test(`${style} with ${landsInPlay} lands still plays its land while holding answers`, async () => {
    const answer = await mainDecision(style, landsInPlay);
    assert.equal(answer?.kind, 'land');
    assert.equal(answer.card.name, 'Plains');
  });
}
