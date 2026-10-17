import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {aiIsolationFingerprint} from './helpers/run-ai-adversarial-games.mjs';

const M = loadEngine();

async function table({difficulty = 'normal', style = 'balanced', tokens = 1, commander = true} = {}) {
  const game = new M.Game({seed: 20261017, paced: false});
  game.speedFactor = 0;
  const bot = game.addPlayer('Mardu', M.DECKS['Mardu Surge'], null, true);
  const opponent = game.addPlayer('Opponent', {name: 'Test'}, null, true);
  bot.controller = new M.AIController(bot, {difficulty, style});
  opponent.controller = new M.AIController(opponent, {difficulty: 'normal'});
  let lastEquipTarget;
  const originalDecide = bot.controller.decide.bind(bot.controller);
  bot.controller.decide = async (g, q) => {
    const result = await originalDecide(g, q);
    if (q.type === 'chooseTargets' && q.aiHint?.kind === 'equipTarget') lastEquipTarget = result[0];
    return result;
  };
  game.turnPlayer = bot; game.turnNo = 8; game.phase = 'main2'; game.step = 'main';
  const add = (name, zone = 'battlefield', owner = bot) => {
    const card = new M.CardInst(M.DEFS[name], owner);
    card.zone = zone; card.sick = false;
    if (zone === 'battlefield') game.battlefield.push(card);
    else owner[zone].push(card);
    game.recalc();
    return card;
  };
  const zurgo = commander ? add('Zurgo Stormrender') : null;
  if (zurgo) zurgo.commander = true;
  const clamp = add('Skullclamp');
  const warriors = tokens ? await game.makeTokens('warriorR', bot, {n: tokens}) : [];
  for (let i = 0; i < 12; i++) add('Plains', 'library');
  bot.pool.C = tokens + 1;
  const entries = () => game.activatableList(bot).filter(entry => entry.card === clamp && entry.equip);
  const decide = async (extra = {}) => {
    const before = aiIsolationFingerprint(game);
    const result = await M.chooseBotAction({gameState: game, botPlayerId: bot.idx, difficulty,
      forceSearch: false, actionWindow: {type: 'main', player: bot, phase: game.phase,
        casts: [], lands: [], acts: entries()}, ...extra});
    assert.equal(aiIsolationFingerprint(game), before, 'planning does not change the live game');
    assert.equal(result.log.fallback, false);
    return result.action;
  };
  const resolve = async action => {
    assert.equal(action.kind, 'activate');
    assert.equal(action.entry.card, clamp);
    assert.equal(await game.activateAbility(bot, action.entry), true);
    const host = lastEquipTarget;
    assert.ok(host, 'the real AI selected an equip target');
    for (let i = 0; i < 25 && (game.pendingTriggers.length || game.stack.length); i++) {
      await game.flushTriggers();
      if (game.stack.length) assert.equal(await game.resolveTop(), true);
    }
    assert.equal(game.pendingTriggers.length + game.stack.length, 0);
    return host;
  };
  return {game, bot, opponent, clamp, zurgo, warriors, add, entries, decide, resolve};
}

for (const difficulty of ['easy', 'normal', 'hard']) for (const style of ['balanced', 'aggressive', 'passive']) {
  test(`${style}/${difficulty}: Mardu repeatedly clamps 1/1 tokens instead of its commander`, async () => {
    const f = await table({difficulty, style, tokens: 2});
    f.bot.pool.C = 2;
    for (let i = 0; i < 2; i++) {
      const host = await f.resolve(await f.decide());
      assert.ok(f.warriors.includes(host));
      assert.notEqual(host.zone, 'battlefield');
      assert.equal(f.bot.hand.length, (i + 1) * 2, 'the real death trigger draws two cards');
      assert.equal(f.clamp.attachedTo, null);
      assert.equal(f.zurgo.toughness, 3);
    }
    assert.equal(f.bot.pool.C, 0, 'each equip pays one mana');
    assert.equal(f.opponent.life, 38, 'Zurgo also rewards each nonattacking token leaving');
    assert.equal((await f.decide()).kind, 'done');
  });
}

test('Skullclamp moves off an already equipped commander to draw from a 1/1', async () => {
  const f = await table();
  await f.game.attach(f.clamp, f.zurgo);
  assert.equal(f.zurgo.toughness, 2);
  assert.equal(await f.resolve(await f.decide()), f.warriors[0]);
  assert.equal(f.zurgo.toughness, 3);
  assert.equal(f.bot.hand.length, 2);
});

test('Skullclamp uses current toughness instead of printed or token stats', async () => {
  const f = await table();
  f.add('Intangible Virtue');
  const memnite = f.add('Memnite');
  assert.equal(f.warriors[0].toughness, 2);
  assert.equal(await f.resolve(await f.decide()), memnite);
  assert.equal(memnite.zone, 'graveyard');
  assert.equal(f.warriors[0].zone, 'battlefield');
  assert.equal(f.bot.hand.length, 2);
});

test('Skullclamp does not repeatedly move between surviving boosted tokens', async () => {
  const f = await table({tokens: 2, commander: false});
  for (const warrior of f.warriors) f.game.addCounters(warrior, '+1/+1', 1);
  await f.resolve(await f.decide());
  assert.equal(f.bot.hand.length, 0);
  assert.ok(f.warriors.every(card => card.zone === 'battlefield'));
  assert.equal((await f.decide()).kind, 'done');
});

test('indestructible does not prevent a 1/1 from dying to Skullclamp', async () => {
  const f = await table();
  const warrior = f.warriors[0];
  f.game.addCounters(warrior, 'indestructible', 1);
  assert.ok(warrior.kw('indestructible'));
  assert.equal(await f.resolve(await f.decide()), warrior);
  assert.equal(f.bot.hand.length, 2);
});

test('Skullclamp preserves a valuable 1-toughness engine when no fodder exists', async () => {
  const f = await table({tokens: 0, commander: false});
  const artist = f.add('Blood Artist');
  assert.ok(f.entries().length, 'the equip remains legal for a human');
  assert.equal((await f.decide()).kind, 'done');
  assert.ok(f.bot.controller.activationScore(f.game, f.entries()[0]) <= 0);
  assert.equal(artist.zone, 'battlefield');
});

test('Skullclamp avoids a draw that would immediately deck its controller', async () => {
  const f = await table({commander: false});
  while (f.bot.library.length > 1) await f.game.move(f.bot.library[0], 'exile');
  assert.ok(f.entries().length);
  assert.equal((await f.decide()).kind, 'done');
  assert.equal(f.warriors[0].zone, 'battlefield');
});

test('Skullclamp still equips a surviving commander when no disposable body exists', async () => {
  const f = await table({tokens: 0});
  assert.equal(await f.resolve(await f.decide()), f.zurgo);
  assert.equal(f.clamp.attachedTo, f.zurgo.iid);
  assert.equal(f.bot.hand.length, 0);
});

test('Skullclamp fallback target choice also selects the disposable token', async () => {
  const f = await table();
  const picks = f.bot.controller.chooseTargets(f.game, {type: 'chooseTargets',
    candidates: [f.zurgo, ...f.warriors], min: 1, max: 1,
    aiHint: {kind: 'equipTarget', card: f.clamp}});
  assert.equal(picks[0], f.warriors[0]);
});

test('deep search values a real Skullclamp draw without mutating the live board', async () => {
  const f = await table({difficulty: 'hard'});
  assert.equal(await f.resolve(await f.decide({forceSearch: true, budgetMs: 2000})), f.warriors[0]);
  assert.equal(f.bot.hand.length, 2);
});

for (const name of ['Rest in Peace', 'Hushbringer']) {
  test(`Skullclamp preserves its token when ${name} prevents the draw`, async () => {
    const f = await table({commander: false});
    f.add(name, 'battlefield', f.opponent);
    const entry = f.entries()[0];
    assert.ok(entry, 'equipping the token remains legal');
    assert.equal((await f.decide()).kind, 'done');
    assert.ok(f.bot.controller.activationScore(f.game, entry) <= 0);
    const mana = f.bot.pool.C;
    // A human may still choose the legal, unprofitable equip. Resolve it to
    // prove the public effect actually prevents Skullclamp's two-card draw.
    assert.equal(await f.game.activateAbility(f.bot, entry, [f.warriors[0]]), true);
    for (let i = 0; i < 20 && (f.game.pendingTriggers.length || f.game.stack.length); i++) {
      await f.game.flushTriggers();
      if (f.game.stack.length) await f.game.resolveTop();
    }
    assert.equal(f.game.pendingTriggers.length + f.game.stack.length, 0);
    assert.notEqual(f.warriors[0].zone, 'battlefield');
    assert.equal(f.bot.pool.C, mana - 1);
    assert.equal(f.bot.hand.length, 0);
  });
}

test('Skullclamp can use a surviving commander while Rest in Peace blocks token draw', async () => {
  const f = await table();
  f.add('Rest in Peace', 'battlefield', f.opponent);
  assert.equal(await f.resolve(await f.decide()), f.zurgo);
  assert.equal(f.warriors[0].zone, 'battlefield');
  assert.equal(f.bot.hand.length, 0);
});

for (const name of ['Kalitas, Traitor of Ghet', 'Leyline of the Void']) {
  test(`${name}'s card-only replacement still permits Skullclamp token draw`, async () => {
    const f = await table();
    f.add(name, 'battlefield', f.opponent);
    assert.equal(await f.resolve(await f.decide()), f.warriors[0]);
    assert.equal(f.bot.hand.length, 2);
  });
}
