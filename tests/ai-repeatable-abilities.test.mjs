import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';

const M = loadEngine();
function table() {
  const game = new M.Game({seed: 11157, paced: false});
  game.speedFactor = 0;
  const choices = [];
  const passive = {decide: async (g, q) => {
    if (q.type === 'orderTriggers') return q.triggers;
    if (q.type === 'chooseTargets') return q.candidates.slice(0, q.min ?? q.count ?? 1);
    if (q.type === 'chooseX') { choices.push(q); return q.max; }
    if (q.type === 'chooseOption') return q.options[0].key;
    return {kind: 'pass'};
  }};
  const bot = game.addPlayer('Bot', {name: 'Test'}, passive, true);
  game.addPlayer('Opponent', {name: 'Test'}, passive, true);
  game.turnPlayer = bot; game.turnNo = 8; game.phase = 'main1'; game.step = 'main';
  const ai = new M.AIController(bot, {difficulty: 'normal', style: 'balanced'});
  const add = name => {
    const card = new M.CardInst(M.DEFS[name], bot);
    card.zone = 'battlefield'; card.sick = false;
    game.battlefield.push(card); game.recalc();
    return card;
  };
  const decide = () => ai.decide(game, {type: 'main', player: bot, phase: game.phase,
    casts: game.castableList(bot), acts: game.activatableList(bot), lands: game.playableLands(bot)});
  const resolve = async entry => {
    assert.ok(entry, 'activation is offered');
    assert.equal(await game.activateAbility(bot, entry), true);
    while (game.stack.length) assert.equal(await game.resolveTop(), true);
  };
  const animate = async name => {
    const card = add(name);
    Object.assign(bot.pool, {C: 2, U: 1, B: 1, R: 1});
    await resolve(game.activatableList(bot).find(e => e.card === card && !e.manaAbility));
    for (const color of Object.keys(bot.pool)) bot.pool[color] = 0;
    return card;
  };
  return {game, bot, add, decide, resolve, animate, choices};
}

test('AI does not repeatedly equip an attached Belt of Giant Strength for zero mana', async () => {
  const {game, bot, add, decide, resolve} = table();
  const giant = add('Colossal Dreadmaw');
  game.addCounters(giant, '+1/+1', 4);
  add('Grizzly Bears');
  const belt = add('Belt of Giant Strength');
  const choice = await decide();
  assert.equal(choice.kind, 'activate');
  assert.equal(choice.entry.card, belt);
  await resolve(choice.entry);
  assert.equal(belt.attachedTo, giant.iid);
  assert.equal((await decide()).kind, 'done');
  assert.ok(game.activatableList(bot).some(e => e.card === belt), 'human re-equip remains legal');
});

test('AI switches Wandering Fumarole for an attack once, then advances', async () => {
  const {game, bot, animate, decide, resolve} = table();
  const land = await animate('Wandering Fumarole');
  const choice = await decide();
  assert.equal(choice.kind, 'activate');
  assert.match(choice.entry.ability.label, /^Switch/);
  await resolve(choice.entry);
  assert.equal(land.power, 4); assert.equal(land.toughness, 1);
  assert.equal((await decide()).kind, 'done');
  const humanSwitch = game.activatableList(bot).find(e => e.card === land && /^Switch/.test(e.ability?.label));
  await resolve(humanSwitch);
  assert.equal(land.power, 1); assert.equal(land.toughness, 4);
});

test('Lavaclaw Reaches asks for X, spends it, and the AI stops when no mana remains', async () => {
  const {game, bot, animate, decide, resolve, choices} = table();
  const land = await animate('Lavaclaw Reaches');
  land.tapped = true; bot.pool.C = 3;
  const choice = await decide();
  assert.equal(choice.kind, 'activate');
  assert.equal(choice.entry.ability.label, 'Gets +X/+0');
  await resolve(choice.entry);
  assert.equal(choices.length, 1);
  assert.equal(choices[0].max, 3);
  assert.equal(bot.pool.C, 0);
  assert.equal(land.power, 5); assert.equal(land.toughness, 2);
  assert.equal((await decide()).kind, 'done');
  // Zero is still a legal announcement for a human, with finite statistics.
  await resolve(game.activatableList(bot).find(e => e.card === land && e.ability?.label === 'Gets +X/+0'));
  assert.equal(choices[1].max, 0);
  assert.equal(land.power, 5);
});

test('AI animates a free Mobilized District once and then advances', async () => {
  const {game, bot, add, decide, resolve} = table();
  for (const name of ['Galea, Kindler of Hope', 'Jhoira, Weatherlight Captain', 'Krenko, Mob Boss', 'Sram, Senior Edificer']) add(name);
  const land = add('Mobilized District');
  const entry = game.activatableList(bot).find(e => e.card === land && !e.manaAbility);
  assert.ok(entry.ability.aiScore(game, land, bot) > 0);
  await resolve(entry);
  assert.equal(land.power, 3); assert.equal(land.toughness, 3);
  assert.ok(land.kw('vigilance'));
  // Other creatures may have useful abilities, so ask with just this legal offer.
  const ai = new M.AIController(bot, {difficulty: 'normal', style: 'balanced'});
  const choice = await ai.decide(game, {type: 'main', player: bot, phase: game.phase,
    casts: [], lands: [], acts: game.activatableList(bot).filter(e => e.card === land)});
  assert.equal(choice.kind, 'done');
});

test('AI declines Illusionary Mask when no creature can use its payment', async () => {
  const {game, bot, add, decide} = table();
  const mask = add('Illusionary Mask');
  assert.equal((await decide()).kind, 'done');
  const bear = new M.CardInst(M.DEFS['Grizzly Bears'], bot);
  bear.zone = 'hand'; bot.hand.push(bear);
  assert.equal((await decide()).kind, 'done');
  bot.pool.C = 2;
  assert.equal((await decide()).kind, 'done', 'colorless mana cannot satisfy the creature cost');
  bot.pool.C = 1; bot.pool.G = 1;
  const ability = mask.def.abilities[0];
  assert.ok(ability.aiScore(game, mask, bot) > 0, 'a useful Mask activation is still valued');
  assert.ok(game.activatableList(bot).some(e => e.card === mask), 'a human may still choose X=0');
});

test('AI ends the optional counter loop between two Enduring Scalelords', async () => {
  const {game, bot, add} = table();
  bot.controller = new M.AIController(bot, {difficulty: 'normal', style: 'balanced'});
  const first = add('Enduring Scalelord'), second = add('Enduring Scalelord');
  game.addCounters(first, '+1/+1', 1);
  for (let i = 0; i < 100 && (game.pendingTriggers.length || game.stack.length); i++) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
  }
  assert.equal(game.pendingTriggers.length + game.stack.length, 0, 'the real trigger sequence finishes');
  assert.ok(first.power > 5 && second.power > 5, 'the AI uses the combo before declining');
  assert.ok(first.power < 100 && second.power < 100);
});

test('Scalelord copies share a trigger budget instead of growing a quadratic stack', async () => {
  const {game, bot, add} = table();
  bot.controller = new M.AIController(bot, {difficulty: 'normal', style: 'balanced'});
  const copies = Array.from({length: 12}, () => add('Enduring Scalelord'));
  game.addCounters(copies[0], '+1/+1', 1);
  let resolved = 0;
  while (resolved < 200 && (game.pendingTriggers.length || game.stack.length)) {
    await game.flushTriggers();
    if (game.stack.length) { await game.resolveTop(); resolved++; }
  }
  assert.equal(game.pendingTriggers.length + game.stack.length, 0);
  assert.ok(resolved > 12 && resolved < 100, 'useful counters resolve without a flood of optional copies');
});
