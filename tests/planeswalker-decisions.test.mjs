import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const M = loadEngine();
const AJANI = 'Ajani, Caller of the Pride';
const passive = { async decide(g, q) {
  if (q.type === 'priority') return {kind: 'pass'};
  if (q.type === 'main') return {kind: 'done'};
  if (q.type === 'chooseTargets') return q.candidates.slice(0, q.min ?? 1);
  if (q.type === 'chooseCards') return q.from.slice(0, q.min ?? 0);
  if (q.type === 'chooseOption') return q.options[0]?.key;
  return [];
} };

function fixture(difficulty = 'hard') {
  const g = new M.Game({seed: 73, paced: false});
  const bot = g.addPlayer('Bot', M.DECKS['Token Triumph'], null, true);
  bot.controller = new M.AIController(bot, {difficulty});
  const human = g.addPlayer('Human', M.DECKS['First Flight'], passive, false);
  g.turnPlayer = bot; g.turnNo = 5; g.phase = 'main1'; g.step = 'main';
  const put = (owner, name, zone = 'battlefield') => {
    const c = new M.CardInst(M.DEFS[name], owner);
    c.zone = zone; c.ctrl = owner; c.sick = false;
    (zone === 'battlefield' ? g.battlefield : owner[zone]).push(c);
    if (c.def.loyalty) c.counters.loyalty = Number(c.def.loyalty);
    g.recalc();
    return c;
  };
  return {g, bot, human, put};
}

const windowFor = (g, player) => ({type: 'main', player, casts: [], lands: [],
  acts: g.activatableList(player), phase: g.phase});
const activate = (f, source, index) => f.g.activateAbility(source.ctrl,
  f.g.activatableList(source.ctrl).find(e => e.card === source && e.idx === index));

for (const difficulty of ['easy', 'normal', 'hard']) {
  test(`Ajani ${difficulty}: real AI activation grants both keywords to its own ready creature`, async () => {
    const f = fixture(difficulty), {g, bot, human, put} = f;
    const ajani = put(bot, AJANI), own = put(bot, 'Soul Warden'), enemy = put(human, 'Serra Angel');
    const spec = ajani.def.abilities[1].targets[0];
    for (const seed of [1, 3, 73, 811]) {
      const decision = await M.chooseBotAction({gameState: g, botPlayerId: bot.idx, difficulty, seed,
        actionWindow: {type: 'chooseTargets', candidates: g.legalTargets(spec, ajani, bot),
          src: ajani, spec, min: 1, max: 1, aiHint: spec.aiHint}});
      assert.equal(M.unwrapBotDecisionAction(decision.action)[0], own);
    }
    assert.equal(await activate(f, ajani, 1), true);
    assert.equal(ajani.counters.loyalty, 1);
    assert.equal(own.kw('flying'), true);
    assert.equal(own.kw('double strike'), true);
    assert.equal(enemy.kw('double strike'), false);
    assert.equal(g.stack.length, 0);
    assert.equal(g.activatableList(bot).some(e => e.card === ajani), false);
    assert.equal(g.log.some(row => /AI V2 fallback/.test(row.msg)), false);
    g.untilEffects = g.untilEffects.filter(e => e.expires !== 'eot'); g.recalc();
    assert.equal(own.kw('flying'), false);
    assert.equal(own.kw('double strike'), false);
  });

  for (const state of ['empty', 'tapped', 'sick', 'main2', 'already-buffed']) {
    test(`Ajani ${difficulty}: ${state} board preserves loyalty and never buffs the enemy`, async () => {
      const f = fixture(difficulty), {g, bot, human, put} = f;
      const ajani = put(bot, AJANI), enemy = put(human, 'Serra Angel');
      const own = state === 'empty' ? null : put(bot, 'Soul Warden');
      if (state === 'tapped') own.tapped = true;
      if (state === 'sick') own.sick = true;
      if (state === 'main2') g.phase = 'main2';
      if (state === 'already-buffed') M.E.pumpUntilEOT(g, own, 0, 0, ['flying', 'double strike']);
      const decision = await bot.controller.decide(g, windowFor(g, bot));
      assert.equal(decision.kind, 'activate');
      assert.equal(decision.entry.ability.loyalty, 1, bot.controller.lastV2Decision.reason);
      assert.equal(await g.performAction(bot, decision), true);
      assert.equal(ajani.counters.loyalty, 5);
      assert.equal(enemy.counters['+1/+1'] || 0, 0);
      assert.equal(enemy.kw('double strike'), false);
      if (own) assert.equal(own.counters['+1/+1'], 1);
    });
  }
}

test('Ajani human: optional +1 with no target still pays loyalty; enemy target remains legal', async () => {
  const f = fixture(), {g, bot, human, put} = f;
  bot.controller = passive; bot.isAI = false; human.isAI = true;
  const ajani = put(bot, AJANI), enemy = put(human, 'Soul Warden');
  assert.ok(g.legalTargets(ajani.def.abilities[1].targets[0], ajani, bot).includes(enemy));
  assert.equal(await activate(f, ajani, 0), true);
  assert.equal(ajani.counters.loyalty, 5);
  assert.equal(enemy.counters['+1/+1'] || 0, 0);
  g.turnNo++;
  assert.equal(await activate(f, ajani, 1), true);
  assert.equal(enemy.kw('flying'), true);
  assert.equal(enemy.kw('double strike'), true);
});

test('Ajani ultimate uses life at resolution and resolves after zero-loyalty source dies', async () => {
  const f = fixture(), {g, bot, put} = f;
  const ajani = put(bot, AJANI); ajani.counters.loyalty = 8;
  bot.life = 9;
  const priority = g.priorityRound;
  g.priorityRound = async () => {};
  assert.equal(await activate(f, ajani, 2), true);
  assert.equal(g.stack.at(-1).srcCard, ajani);
  await g.checkSBA();
  assert.equal(ajani.zone, 'graveyard');
  bot.life = 6;
  await g.resolveTop();
  const cats = g.creatures(bot).filter(c => c.hasSub('Cat'));
  assert.equal(cats.length, 6);
  assert.ok(cats.every(c => c.power === 2 && c.toughness === 2 && c.isToken && c.colors.includes('W')));
  g.priorityRound = priority;
});

test('Ajani blink invalidates the announced buff target without refunding loyalty', async () => {
  const f = fixture(), {g, bot, put} = f;
  const ajani = put(bot, AJANI), target = put(bot, 'Soul Warden');
  g.priorityRound = async () => {};
  assert.equal(await activate(f, ajani, 1), true);
  assert.equal(g.stack.at(-1).targets[0], target);
  await g.move(target, 'exile'); await g.move(target, 'battlefield');
  await g.resolveTop();
  assert.equal(target.kw('double strike'), false);
  assert.equal(ajani.counters.loyalty, 1);
});

for (const role of ['human', 'easy', 'normal', 'hard']) {
  test(`Atarka ${role}: paid cast and equip enable an immediate attack and both damage steps`, async () => {
    const f = fixture(role === 'human' ? 'hard' : role), {g, bot, human, put} = f;
    const atarka = put(bot, 'Atarka, World Render', 'hand'), boots = put(bot, 'Swiftfoot Boots');
    for (let n = 0; n < 8; n++) put(bot, n === 0 ? 'Mountain' : 'Forest');
    if (role === 'human') {bot.isAI = false; human.isAI = true; bot.controller = {async decide(game, q) {
      if (q.type === 'chooseTargets') return [atarka];
      if (q.type === 'attackers') return [{card: atarka, target: human}];
      return passive.decide(game, q);
    }};}
    assert.equal(await g.castSpell(bot, atarka, {from: 'hand'}), true);
    assert.equal(atarka.castMeta.manaSpent, 7);
    assert.equal(atarka.sick, true);
    assert.equal(atarka.kw('haste'), false);
    const equip = g.activatableList(bot).find(e => e.card === boots && e.equip);
    assert.ok(equip);
    assert.equal(await g.activateAbility(bot, equip), true);
    assert.equal(boots.attachedTo, atarka.iid);
    assert.equal(atarka.kw('haste'), true);
    let offered = false, declared = false;
    const decide = bot.controller.decide.bind(bot.controller);
    bot.controller.decide = async (game, q) => {
      const answer = await decide(game, q);
      if (q.type === 'attackers') {
        offered = q.eligible.includes(atarka);
        declared = answer.some(e => e.card === atarka && e.target === human);
      }
      return answer;
    };
    await g.combatPhase(bot);
    assert.equal(offered, true); assert.equal(declared, true);
    assert.equal(human.life, 28, '6 flying/trample damage in each of two strike steps');
    assert.equal(g.log.some(row => /AI V2 fallback/.test(row.msg)), false);
  });
}

test('Atarka loses same-turn attack eligibility when Boots leave; haste never untaps a tapped creature', async () => {
  const {g, bot, put} = fixture();
  const atarka = put(bot, 'Atarka, World Render'), boots = put(bot, 'Swiftfoot Boots');
  atarka.sick = true;
  await g.attach(boots, atarka); atarka.tapped = true;
  let offered = [];
  bot.controller = {async decide(game, q) {
    if (q.type === 'attackers') offered.push(...q.eligible);
    return passive.decide(game, q);
  }};
  await g.combatPhase(bot);
  assert.equal(offered.includes(atarka), false);
  atarka.tapped = false;
  await g.destroy(boots);
  assert.equal(atarka.kw('haste'), false);
  await g.combatPhase(bot);
  assert.equal(offered.includes(atarka), false);
});

const walkers = [...new Set(Object.values(M.DECKS).flatMap(deck => deck.cards.map(row => row.name))
  .filter(name => M.DEFS[name]?.types.includes('Planeswalker')))];
for (const name of walkers) for (const [index, ability] of M.DEFS[name].abilities.entries()) {
  if (ability.loyalty === undefined) continue;
  for (const role of ['human', 'AI']) test(`${name} #${index + 1} ${role}: paid entry, legal loyalty window, Stack resolution and once-per-turn`, async () => {
    const f = fixture(), {g, bot, human, put} = f;
    if (role === 'human') {bot.isAI = false; human.isAI = true; bot.controller = {async decide(game, q) {
      if (q.type === 'chooseTargets') return q.candidates.slice(0, q.max ?? 1);
      if (q.type === 'chooseCards') return q.from.slice(0, q.max ?? q.min ?? 0);
      return passive.decide(game, q);
    }};}
    put(bot, 'Solemn Simulacrum').tapped = true;
    put(bot, 'Gravecrawler'); put(bot, 'Swiftfoot Boots');
    for (let n = 0; n < 8; n++) put(bot, 'Forest').tapped = true;
    put(human, 'Rampaging Baloths').counters['-1/-1'] = 1;
    put(human, 'Serra Angel').tapped = true; put(human, 'Swiftfoot Boots');
    for (const zone of ['hand', 'graveyard']) for (const card of ['Solemn Simulacrum', 'Swiftfoot Boots', 'Gravecrawler']) put(bot, card, zone);
    for (let n = 0; n < 32; n++) put(bot, n < 28 ? 'Forest' : 'Gravecrawler', 'library');
    await g.makeTokens({name: 'Soldier', types: ['Creature'], subtypes: ['Soldier'], power: '1', toughness: '1', kws: []}, bot);
    const walker = put(bot, name, 'hand');
    for (const color of ['W', 'U', 'B', 'R', 'G', 'C']) bot.pool[color] = 30;
    assert.equal(await g.castSpell(bot, walker, {from: 'hand'}), true);
    assert.equal(walker.zone, 'battlefield');
    assert.ok(walker.counters.loyalty > 0);
    assert.ok(walker.castMeta.manaSpent > 0);
    walker.counters.loyalty = Math.max(20, -ability.loyalty + 1);
    g.phase = 'end';
    assert.equal(g.activatableList(bot).some(e => e.card === walker), false);
    g.phase = 'main1'; g.turnPlayer = human;
    assert.equal(g.activatableList(bot).some(e => e.card === walker), false);
    g.turnPlayer = bot;
    if (ability.loyalty < 0) {
      walker.counters.loyalty = -ability.loyalty - 1;
      assert.equal(g.activatableList(bot).some(e => e.card === walker && e.idx === index), false);
      walker.counters.loyalty = Math.max(20, -ability.loyalty + 1);
    }
    const before = walker.counters.loyalty;
    let paid = null, onStack = false;
    const priority = g.priorityRound.bind(g);
    g.priorityRound = async player => {
      const object = g.stack.find(so => so.kind === 'ability' && so.srcCard === walker);
      if (object && !onStack) {
        paid = walker.counters.loyalty; onStack = true;
        assert.equal(object.ctx.ability, ability);
        assert.equal(g.activatableList(bot).some(e => e.card === walker), false);
      }
      return priority(player);
    };
    const entry = g.activatableList(bot).find(e => e.card === walker && e.idx === index);
    assert.ok(entry, 'supported loyalty path must be actually activatable');
    assert.equal(await g.activateAbility(bot, entry), true);
    assert.equal(onStack, true);
    assert.equal(paid, before + ability.loyalty, 'loyalty is a cost paid before resolution');
    assert.equal(g.stack.length, 0); assert.equal(g.pendingTriggers.length, 0);
    assert.equal(g.activatableList(bot).some(e => e.card === walker), false);
    assert.equal(g.log.some(row => /AI V2 fallback/.test(row.msg)), false);
  });
}

for (const difficulty of ['easy', 'normal', 'hard']) {
  for (const [name, loyalty, setup] of [
    [AJANI, -8, f => {f.bot.life = 16;}],
    ['Garruk, Primal Hunter', -6, f => {for (let n = 0; n < 8; n++) f.put(f.bot, 'Forest');}],
    ['Garruk, Primal Hunter', -3, f => {f.put(f.bot, 'Atarka, World Render');}],
  ]) test(`${name} ${difficulty}: evaluates actual public X for ${loyalty}`, async () => {
    const f = fixture(difficulty), walker = f.put(f.bot, name);
    walker.counters.loyalty = Math.max(8, -loyalty);
    for (let n = 0; n < 20; n++) f.put(f.bot, 'Forest', 'library');
    f.put(f.bot, 'Soul Warden'); setup(f); f.g.recalc();
    const decision = await f.bot.controller.decide(f.g, windowFor(f.g, f.bot));
    assert.equal(decision.kind, 'activate');
    assert.equal(decision.entry.ability.loyalty, loyalty, JSON.stringify(f.bot.controller.lastV2Decision.consideredActions));
  });
}
