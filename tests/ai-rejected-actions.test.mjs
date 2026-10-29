import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';

// Full-game audits showed bots offered actions that the engine then rejected
// (Aetherworks Marvel without energy, Lair of the Hydra with X=0, Bedevil
// aimed at a Pursued Whale it could not pay the tax for). Each rejection was
// repeated in every later priority window of the turn.
const M = loadEngine();
function table({stubPriority = true} = {}) {
  const game = new M.Game({seed: 291026, paced: false});
  game.speedFactor = 0;
  if (stubPriority) game.priorityRound = async () => {};
  const bot = game.addPlayer('Bot', {name: 'Bot'}, null, true);
  const opponent = game.addPlayer('Opponent', {name: 'Table'}, null, true);
  bot.controller = new M.AIController(bot, {difficulty: 'normal', style: 'balanced'});
  opponent.controller = {decide: async (g, q) => q.type === 'priority' ? {kind: 'pass'} : []};
  game.turnPlayer = bot; game.turnNo = 9; game.phase = 'main1'; game.step = 'main';
  function add(name, owner = bot, zone = 'battlefield') {
    const card = new M.CardInst(M.DEFS[name], owner);
    assert.ok(card.def, name);
    card.zone = zone; card.sick = false;
    if (zone === 'battlefield') game.battlefield.push(card); else owner[zone].push(card);
    game.recalc(); return card;
  }
  for (let i = 0; i < 20; i++) { add('Swamp', bot, 'library'); add('Swamp', opponent, 'library'); }
  return {game, bot, opponent, add};
}
const offers = (game, player, card) => game.activatableList(player).some(entry => entry.card === card && entry.ability);

test('an ability that costs energy is offered only when the player has that much energy', () => {
  const {game, bot, add} = table();
  const marvel = add('Aetherworks Marvel');
  bot.counters = {...bot.counters, energy: 5};
  assert.equal(offers(game, bot, marvel), false, 'five energy cannot pay six');
  bot.counters.energy = 6;
  assert.equal(offers(game, bot, marvel), true);
});

test('an X ability whose X cannot be 0 needs mana for the smallest legal X', () => {
  const {game, bot, add} = table();
  const lair = add('Lair of the Hydra');
  assert.equal(offers(game, bot, lair), false, 'Lair alone pays {G}, not {1}{G}');
  add('Forest');
  assert.equal(offers(game, bot, lair), true);
});

test('a bot never aims a spell at a target whose tax it cannot pay', async () => {
  const {game, bot, opponent, add} = table();
  for (const name of ['Swamp', 'Swamp', 'Mountain']) add(name);
  const whale = add('Pursued Whale', opponent);
  const bears = add('Grizzly Bears', opponent);
  const bedevil = add('Bedevil', bot, 'hand');
  let candidates = null;
  const decide = bot.controller.decide;
  bot.controller.decide = async function (state, query) {
    if (query.type === 'chooseTargets') candidates = query.candidates.slice();
    return decide.call(this, state, query);
  };
  assert.ok(game.castableList(bot).some(entry => entry.card === bedevil), 'Bedevil is castable on the Bears');
  assert.notEqual(await game.castSpell(bot, bedevil, {from: 'hand'}), false);
  assert.ok(candidates.includes(bears));
  assert.equal(candidates.includes(whale), false, 'the whale would add {3} the bot cannot pay');
  assert.equal(game.stack.at(-1)?.card, bedevil);
  assert.equal([game.stack.at(-1).targets].flat()[0], bears);
});

test('a human keeps every legal target, including a taxed one', async () => {
  const {game, bot, opponent, add} = table();
  bot.isAI = false;
  for (const name of ['Swamp', 'Swamp', 'Mountain']) add(name);
  const whale = add('Pursued Whale', opponent);
  add('Grizzly Bears', opponent);
  const bedevil = add('Bedevil', bot, 'hand');
  let candidates = null;
  bot.controller = {decide: async (g, query) => {
    if (query.type === 'chooseTargets') { candidates = query.candidates.slice(); return {kind: 'cancel'}; }
    return [];
  }};
  await game.castSpell(bot, bedevil, {from: 'hand'});
  assert.ok(candidates.includes(whale));
});

test('X is announced only from the values a mana-value casting limit allows', async () => {
  const {game, bot, opponent, add} = table();
  for (const name of ['Plains', 'Island', 'Island', 'Island']) add(name);
  add('Void Winnower', opponent);
  for (const name of ['Grizzly Bears', 'Grizzly Bears']) add(name, opponent);
  const disorder = add('Disorder in the Court', bot, 'hand');
  let announced = null;
  const decide = bot.controller.decide;
  bot.controller.decide = async function (state, query) {
    if (query.type === 'chooseX') announced = query.values;
    return decide.call(this, state, query);
  };
  assert.notEqual(await game.castSpell(bot, disorder, {from: 'hand'}), false);
  assert.deepEqual([...announced], [1], 'X=0 and X=2 give an even mana value');
  assert.equal(game.stack.at(-1)?.card, disorder);
  assert.equal(game.stack.at(-1).x, 1);
});

test('a rejected bot action is not offered again until its resources change', async () => {
  const {game, bot, add} = table({stubPriority: false});
  add('Mountain');
  const bolt = add('Lightning Bolt', bot, 'hand');
  let offered = 0;
  bot.controller = {decide: async (g, query) => {
    if (query.type !== 'priority') return [];
    const cast = query.casts.find(entry => entry.card === bolt);
    if (!cast) return {kind: 'pass'};
    offered++;
    return {kind: 'cast', card: bolt, from: cast.from, alt: cast.alt};
  }};
  const performAction = game.performAction;
  game.performAction = async function (player, action) {
    return action.card === bolt ? false : performAction.call(this, player, action);
  };
  game.phase = 'combat'; game.step = 'attackers';
  await game.priorityRound(bot);
  await game.priorityRound(bot);
  assert.equal(offered, 1, 'the failed cast is remembered across priority windows');
  add('Mountain');
  await game.priorityRound(bot);
  assert.equal(offered, 2, 'new mana makes the cast worth another try');
});
