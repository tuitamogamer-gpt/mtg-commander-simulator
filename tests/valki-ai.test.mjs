import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {context, put, settle} from './helpers/oracle-v8-fixtures.mjs';

const M = loadEngine();

function table({difficulty = 'normal', paced = false, human = false} = {}) {
  const f = context(M);
  const {game, a: bot, b: opponent} = f;
  game.paced = paced;
  game.speedFactor = 0;
  bot.isAI = !human;
  const ai = new M.AIController(bot, {difficulty, style: 'balanced'});
  const trace = [];
  const controller = human ? bot.controller : ai;
  bot.controller = {decide: async (g, q) => {
    const answer = await controller.decide(g, q);
    trace.push({q, answer});
    return answer;
  }};
  const add = (name, zone = 'battlefield', player = bot) => put(M, game, player, name, zone);
  const decide = () => bot.controller.decide(game, {type: 'main', player: bot, phase: game.phase,
    casts: game.castableList(bot), acts: game.activatableList(bot), lands: game.playableLands(bot)});
  const enter = async (name = 'Grizzly Bears') => {
    const creature = add(name, 'hand', opponent);
    const valki = add('Valki, God of Lies', 'hand');
    await game.putPermanentOntoBattlefield(valki, bot);
    await settle(game);
    assert.equal(creature.zone, 'exile', 'Valki actually exiles the creature through its ETB');
    return {valki, creature};
  };
  const activate = async valki => {
    const entry = game.activatableList(bot).find(e => e.card === valki && !e.manaAbility);
    assert.ok(entry, 'the rules allow the activation');
    assert.equal(await game.activateAbility(bot, entry), true);
    await settle(game);
  };
  return {...f, bot, opponent, ai, trace, add, decide, enter, activate};
}

for (const paced of [false, true]) {
  for (const difficulty of ['easy', 'normal', 'hard']) {
    test(`Valki does not repeat an empty copy activation (${difficulty}, paced=${paced})`, async () => {
      const {game, bot, add, decide} = table({difficulty, paced});
      const valki = add('Valki, God of Lies');
      add('Ornithopter', 'exile');
      const before = valki.meta.c1719Links;
      assert.equal((await decide()).kind, 'done', 'unlinked exiled creatures do not make copying useful');
      assert.equal(valki.meta.c1719Links, before, 'planning does not create linked-exile state');
      assert.ok(game.activatableList(bot).some(e => e.card === valki), 'human X=0 remains legal');
    });

    test(`Valki pays the linked creature's exact mana value (${difficulty}, paced=${paced})`, async () => {
      const {game, bot, trace, enter, decide, activate} = table({difficulty, paced});
      const {valki, creature} = await enter();
      bot.pool.C = 9;
      const decision = await decide();
      assert.equal(decision.kind, 'activate');
      assert.equal(decision.entry.card, valki);
      await activate(valki);
      assert.equal(trace.find(row => row.q.type === 'chooseX').answer, 2);
      assert.equal(bot.pool.C, 7, 'only the announced X is paid');
      assert.equal(valki.name, creature.name);
      assert.equal((await decide()).kind, 'done');
      await game.move(valki, 'graveyard');
      assert.equal(creature.zone, 'hand', 'the linked card still returns when the copy leaves');
      assert.equal(valki.name, 'Valki, God of Lies');
    });
  }

  test(`Valki advances through a real main phase without a repeat loop (paced=${paced})`, async () => {
    const {game, bot, add, trace} = table({paced});
    add('Valki, God of Lies');
    game.priorityRound = M.Game.prototype.priorityRound;
    const decide = bot.controller.decide;
    let mainChoices = 0;
    bot.controller.decide = async (g, q) => {
      if (q.type === 'main') assert.ok(++mainChoices <= 3, 'main phase must finish before repeating empty activations');
      return decide(g, q);
    };
    await game.mainPhase(bot);
    assert.equal(mainChoices, 1);
    assert.equal(trace.some(row => row.answer?.kind === 'activate'), false);
    assert.equal(game.stack.length + game.pendingTriggers.length, 0);
  });
}

test('Valki waits for enough usable mana, then copies the previously unaffordable creature', async () => {
  const {game, bot, ai, enter, decide, activate} = table();
  const {valki} = await enter('Colossal Dreadmaw');
  bot.pool.C = 5;
  assert.equal((await decide()).kind, 'done');
  assert.equal(ai.mainAction(game, {lands: [], casts: [], acts: game.activatableList(bot)}).kind, 'done');
  bot.pool.C = 8;
  assert.equal((await decide()).kind, 'activate');
  await activate(valki);
  assert.equal(valki.name, 'Colossal Dreadmaw');
  assert.equal(bot.pool.C, 2);
});

test('Valki ignores a linked creature that left exile, including after it is exiled again', async () => {
  const {game, bot, enter, decide} = table();
  const {creature} = await enter();
  bot.pool.C = 4;
  await game.move(creature, 'hand');
  assert.equal((await decide()).kind, 'done');
  await game.move(creature, 'exile');
  assert.equal((await decide()).kind, 'done', 'a different zone incarnation is not linked');
});

test('Valki can copy a linked zero-mana creature and then finish', async () => {
  const {bot, enter, decide, activate} = table();
  const {valki} = await enter('Ornithopter');
  assert.equal((await decide()).kind, 'activate');
  await activate(valki);
  assert.equal(valki.name, 'Ornithopter');
  assert.equal(bot.pool.C, 0);
  assert.equal((await decide()).kind, 'done');
});

test('the fallback AI also chooses a matching X and finishes after copying', async () => {
  const {game, bot, ai, enter, decide, activate} = table();
  const {valki} = await enter();
  bot.pool.C = 9;
  const original = bot.controller.decide;
  bot.controller.decide = (g, q) => q.type === 'main' ? ai.mainAction(g, q)
    : q.type === 'chooseX' ? ai.chooseX(g, q) : original(g, q);
  assert.equal((await decide()).entry.card, valki);
  await activate(valki);
  assert.equal(valki.name, 'Grizzly Bears');
  assert.equal(bot.pool.C, 7);
  assert.equal((await decide()).kind, 'done');
  assert.equal(game.stack.length + game.pendingTriggers.length, 0);
});

test('Valki cannot fund its copy with mana restricted to creature spells', async () => {
  const {bot, add, enter, decide, activate} = table();
  const {valki} = await enter();
  add('Ancient Ziggurat'); add('Ancient Ziggurat');
  assert.equal((await decide()).kind, 'done');
  const lands = [add('Forest'), add('Forest')];
  assert.equal((await decide()).entry.card, valki);
  await activate(valki);
  assert.equal(valki.name, 'Grizzly Bears');
  assert.ok(lands.every(card => card.tapped), 'uses sources that can actually pay for an ability');
  assert.equal(bot.pool.C, 0);
});

test('copying another Valki does not reuse the original linked cards', async () => {
  const {game, bot, enter, decide, activate} = table();
  const {valki, creature} = await enter('Valki, God of Lies');
  bot.pool.C = 6;
  assert.equal((await decide()).entry.card, valki);
  await activate(valki);
  assert.equal(valki.name, 'Valki, God of Lies');
  assert.equal(bot.pool.C, 4);
  assert.equal((await decide()).kind, 'done', 'the new copy ability has no linked exile choices');
  await game.move(valki, 'graveyard');
  assert.equal(creature.zone, 'hand');
});

test('a human may activate Valki with X=0 even when there is no linked creature', async () => {
  const {add, activate, trace} = table({human: true});
  const valki = add('Valki, God of Lies');
  await activate(valki);
  assert.equal(valki.name, 'Valki, God of Lies');
  assert.equal(trace.find(row => row.q.type === 'chooseX').answer, 0);
});
