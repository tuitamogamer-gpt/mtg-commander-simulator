import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';

// Bots keep mana open for the instant answers in their hand, spend it where
// the answer is no longer needed (the end step before their own untap), and
// still tap out for the plays that are worth it.
const M = loadEngine();
function table() {
  const game = new M.Game({seed: 241026, paced: false});
  game.speedFactor = 0;
  game.priorityRound = async () => {};
  const bot = game.addPlayer('Bot', {name: 'Hold'}, null, true);
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
  for (let i = 0; i < 3; i++) add('Island', opponent, 'hand');
  for (let i = 0; i < 20; i++) { add('Island', bot, 'library'); add('Island', opponent, 'library'); }
  function query(type) {
    return {type, player: bot, phase: game.phase, stack: game.stack, lands: [],
      casts: game.castableList(bot), acts: game.activatableList(bot, type === 'priority')};
  }
  async function decide(type = 'main', forceSearch = false) {
    const answer = await M.chooseBotAction({gameState: game, botPlayerId: bot.idx,
      difficulty: 'normal', seed: 17, budgetMs: 0, forceSearch, actionWindow: query(type)});
    return M.unwrapBotDecisionAction(answer.action);
  }
  return {game, bot, opponent, add, decide};
}
const castName = action => action?.kind === 'cast' ? action.card.name : null;

for (const forceSearch of [false, true]) {
  const mode = forceSearch ? 'live search' : 'quick';
  test(`${mode}: with Counterspell in hand the bot does not tap below UU for a filler creature`, async () => {
    const f = table();
    for (let i = 0; i < 4; i++) f.add('Island');
    f.add('Counterspell', f.bot, 'hand');
    f.add('Phantom Warrior', f.bot, 'hand');
    assert.equal(castName(await f.decide('main', forceSearch)), null);
  });

  test(`${mode}: the same creature is cast when no answer is held`, async () => {
    const f = table();
    for (let i = 0; i < 4; i++) f.add('Island');
    f.add('Phantom Warrior', f.bot, 'hand');
    assert.equal(castName(await f.decide('main', forceSearch)), 'Phantom Warrior');
  });

  test(`${mode}: a play that still leaves UU open is made`, async () => {
    const f = table();
    for (let i = 0; i < 5; i++) f.add('Island');
    f.add('Counterspell', f.bot, 'hand');
    f.add('Phantom Warrior', f.bot, 'hand');
    assert.equal(castName(await f.decide('main', forceSearch)), 'Phantom Warrior');
  });
}

test('an instant in the bot\'s own combat does not spend the mana kept for Counterspell', async () => {
  const f = table();
  f.add('Island'); f.add('Island'); f.add('Plains');
  f.add('Counterspell', f.bot, 'hand');
  f.add('Raise the Alarm', f.bot, 'hand');
  f.game.phase = 'combat'; f.game.step = 'blockers';
  assert.equal(castName(await f.decide('priority')), null);
});

test('the end step before the bot\'s untap spends what the answer no longer needs', async () => {
  const f = table();
  f.add('Island'); f.add('Island'); f.add('Plains'); f.add('Plains');
  f.add('Counterspell', f.bot, 'hand');
  f.add('Raise the Alarm', f.bot, 'hand');
  f.game.turnPlayer = f.opponent; f.game.phase = 'end'; f.game.step = 'end';
  assert.equal(castName(await f.decide('priority')), 'Raise the Alarm');
});

test('a flash creature waits for the end step before the bot\'s own untap', async () => {
  const f = table();
  for (let i = 0; i < 3; i++) f.add('Forest');
  f.add('Ambush Viper', f.bot, 'hand');
  f.game.turnPlayer = f.opponent; f.game.phase = 'main1'; f.game.step = 'main';
  assert.equal(castName(await f.decide('priority')), null, 'not in the opponent\'s main phase');
  f.game.phase = 'end'; f.game.step = 'end';
  assert.equal(castName(await f.decide('priority')), 'Ambush Viper');
});

test('instant removal waits through the bot\'s own main phase and is used at the end step before its untap', async () => {
  const f = table();
  for (let i = 0; i < 3; i++) f.add('Swamp');
  f.add('Murder', f.bot, 'hand');
  const dragon = f.add('Shivan Dragon', f.opponent);
  assert.equal(castName(await f.decide('main')), null, 'not in its own main phase');
  f.game.turnPlayer = f.opponent; f.game.phase = 'main1'; f.game.step = 'main';
  assert.equal(castName(await f.decide('priority')), null, 'not in the opponent\'s main phase with nothing to answer');
  f.game.phase = 'end'; f.game.step = 'end';
  const action = await f.decide('priority');
  assert.equal(castName(action), 'Murder');
  assert.equal(dragon.zone, 'battlefield', 'the decision alone does not resolve anything');
});
