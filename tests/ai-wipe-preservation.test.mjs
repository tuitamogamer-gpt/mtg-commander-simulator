import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function fixture(name = 'Day of Judgment', style = 'balanced') {
  const game = new MTG.Game({ seed: 801, paced: false });
  const players = Array.from({ length: 4 }, (_, i) => {
    const player = game.addPlayer(`Seat ${i}`, MTG.DECKS['Quick Draw'], null, true);
    player.controller = new MTG.AIController(player, { style, difficulty: 'normal' });
    return player;
  });
  const bot = players[0];
  game.turnPlayer = bot; game.turnNo = 20; game.phase = 'main2'; game.step = 'main';
  for (let i = 0; i < 8; i++) add(game, bot, i < 4 ? 'Plains' : 'Mountain');
  bot.pool.B = 10;
  const wipe = add(game, bot, name, 'hand');
  return { game, players, bot, wipe };
}

function add(game, player, def, zone = 'battlefield') {
  const card = new MTG.CardInst(typeof def === 'string' ? MTG.DEFS[def] : def, player);
  card.zone = zone; card.sick = false;
  if (zone === 'battlefield') game.battlefield.push(card); else player[zone].push(card);
  return card;
}

function body(game, player, power, toughness = power, kws = [], cost = '{4}') {
  return add(game, player, { name: `Body ${game.battlefield.length}`, types: ['Creature'],
    super: [], subtypes: [], cost, oracle: '', power: String(power), toughness: String(toughness), kws, abilities: [] });
}

function window(game, bot, wipe) {
  game.recalc();
  const casts = game.castableList(bot).filter(entry => entry.card === wipe);
  assert.ok(casts.length, 'the real engine offers the wipe');
  return { type: 'main', player: bot, casts, acts: [], lands: [], phase: game.phase };
}

async function decide(game, bot, q, forceSearch = false) {
  return MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, actionWindow: q,
    difficulty: 'normal', seed: 22, forceSearch, budgetMs: 0 });
}

for (const style of ['balanced', 'control', 'josh', 'olivia']) {
  test(`${style}: preserves a leading board against three individually smaller armies`, async () => {
    const { game, bot, players, wipe } = fixture('Day of Judgment', style);
    for (let i = 0; i < 4; i++) body(game, bot, 5);
    for (const opponent of players.slice(1)) for (let i = 0; i < 2; i++) body(game, opponent, 4);
    const q = window(game, bot, wipe);
    assert.equal((await decide(game, bot, q)).action.kind, 'done');
    assert.equal(bot.controller.mainAction(game, q).kind, 'done');
  });
}

test('live search also preserves the leading multiplayer board', async () => {
  const { game, bot, players, wipe } = fixture('Blasphemous Act');
  for (let i = 0; i < 4; i++) body(game, bot, 5);
  for (const opponent of players.slice(1)) for (let i = 0; i < 2; i++) body(game, opponent, 4);
  const result = await decide(game, bot, window(game, bot, wipe), true);
  assert.equal(result.action.kind, 'done', JSON.stringify(result.consideredActions));
  assert.ok(result.log.analyzedNodes > 0);
});

test('damage wipe retains blockers when the lethal threat would survive it', async () => {
  const { game, bot, players, wipe } = fixture('Blasphemous Act', 'control');
  bot.life = 3;
  body(game, bot, 4); body(game, bot, 4);
  body(game, players[1], 20, 20, ['indestructible']);
  body(game, players[2], 1);
  const q = window(game, bot, wipe);
  assert.equal((await decide(game, bot, q)).action.kind, 'done');
  assert.equal(bot.controller.mainAction(game, q).kind, 'done');
});

for (const name of ['Day of Judgment', 'Austere Command', 'Farewell']) test(`${name} prevents lethal flying damage despite losing more own value`, async () => {
  const { game, bot, players, wipe } = fixture(name);
  bot.life = 3;
  for (let i = 0; i < 3; i++) body(game, bot, 7);
  body(game, players[1], 4, 4, ['flying']);
  const q = window(game, bot, wipe);
  assert.equal((await decide(game, bot, q)).action.card, wipe);
  assert.equal(bot.controller.mainAction(game, q).card, wipe);
  assert.equal(await game.castSpell(bot, wipe, { from: 'hand' }), true);
  for (let i = 0; i < 20 && (game.stack.length || game.pendingTriggers.length); i++) {
    await game.flushTriggers(); if (game.stack.length) await game.resolveTop();
  }
  assert.equal(game.creatures(players[1]).length, 0, 'the chosen modes remove the lethal flyer');
});

test('mandatory modal choices evaluate their actual affected sets before casting', async () => {
  const { game, bot, players, wipe } = fixture('Austere Command');
  for (let i = 0; i < 4; i++) body(game, bot, 5, 5, [], '{2}');
  for (const opponent of players.slice(1)) body(game, opponent, 3, 3, [], '{5}');
  const q = window(game, bot, wipe);
  const impact = MTG.botBoardWipeImpact(game, bot, { kind: 'cast', card: wipe });
  assert.equal(impact.mineLoss, 0);
  assert.equal((await decide(game, bot, q)).action.card, wipe);
  assert.equal(bot.controller.mainAction(game, q).card, wipe);
  const options = wipe.def.modes.list.map((mode, i) => ({ ...mode, key: String(i) }));
  assert.equal(bot.controller.chooseMulti(game, { type: 'chooseMulti', options, min: 2, max: 2 }).includes('2'), false);
  assert.equal(await game.castSpell(bot, wipe, { from: 'hand' }), true);
  for (let i = 0; i < 20 && (game.stack.length || game.pendingTriggers.length); i++) {
    await game.flushTriggers(); if (game.stack.length) await game.resolveTop();
  }
  assert.equal(game.creatures(bot).length, 4);
  assert.ok(players.slice(1).every(opponent => !game.creatures(opponent).length));
});

test('targeted modal removal is never modeled as destroying every matching permanent', () => {
  const { game, bot } = fixture();
  for (const name of ['Casualties of War', 'Destroy Evil', 'Desperate Plea']) {
    const spell = add(game, bot, name, 'hand');
    assert.equal(MTG.botBoardWipeImpact(game, bot, { kind: 'cast', card: spell }), null, name);
  }
});

test('Perplexing Test preserves the token qualifier of each mode', () => {
  const { game, bot, players } = fixture();
  const own = body(game, bot, 5);
  const token = body(game, players[1], 5); token.isToken = true;
  game.recalc();
  const spell = add(game, bot, 'Perplexing Test', 'hand');
  const impact = MTG.botBoardWipeImpact(game, bot, { kind: 'cast', card: spell });
  assert.equal(impact.removes(own), false);
  assert.equal(impact.removes(token), true);
});

test('a free cast does not justify destroying the leading board', async () => {
  const { game, bot, players, wipe } = fixture();
  for (let i = 0; i < 4; i++) body(game, bot, 5);
  for (const opponent of players.slice(1)) for (let i = 0; i < 2; i++) body(game, opponent, 4);
  game.recalc();
  const q = { type: 'chooseOption', player: bot, options: [{ key: 'yes', label: 'Cast' }, { key: 'no', label: 'Skip' }],
    aiHint: { kind: 'freeCast', card: wipe } };
  assert.equal((await decide(game, bot, q)).action.value, 'no');
  assert.equal(bot.controller.chooseOption(game, q), 'no');
});

for (const labels of [
  ['Exile all artifacts', 'Exile all creatures', 'Exile all enchantments', 'Exile all graveyards'],
  ['Artefakti', 'Stvorenja', 'Enchantmenti', 'Groblja'],
  ['Artifacts', 'Creatures', 'Enchantments', 'Graveyards'],
]) test(`Farewell preserves own artifacts using stable keys with ${labels[0]} labels`, async () => {
  const { game, bot, players } = fixture('Farewell');
  for (const name of ['Academy Manufactor', 'Sol Ring', 'Arcane Signet']) add(game, bot, name);
  for (let i = 0; i < 3; i++) body(game, players[1], 5);
  game.recalc();
  const q = { type: 'chooseMulti', player: bot, min: 1, max: 4,
    options: [3, 1, 0, 2].map(index => ({ key: String(index), label: labels[index] })),
    aiHint: { kind: 'farewellModes' } };
  for (const selected of [(await decide(game, bot, q)).action.value, bot.controller.chooseMulti(game, q)]) {
    assert.equal(selected.includes('0'), false, 'keep own artifact advantage');
    assert.equal(selected.includes('1'), true, 'remove the opposing creatures');
  }
});

test('casting Decree of Pain does not include its separate cycling shrink effect', () => {
  const { game, bot, players, wipe } = fixture('Decree of Pain');
  const protectedBody = body(game, bot, 2, 2, ['indestructible']);
  const other = body(game, players[1], 4);
  game.recalc();
  const impact = MTG.botBoardWipeImpact(game, bot, { kind: 'cast', card: wipe });
  assert.equal(impact.removes(protectedBody), false);
  assert.equal(impact.removes(other), true);
});

test('destroy and exile modal wipes distinguish shield, regeneration and indestructible', () => {
  const { game, bot, players, wipe } = fixture('Farewell');
  for (const protection of ['shield', 'regeneration', 'indestructible']) {
    const card = body(game, players[1], 5, 5, protection === 'indestructible' ? ['indestructible'] : []);
    if (protection === 'shield') card.counters.shield = 1;
    if (protection === 'regeneration') card.regenShield = 1;
  }
  game.recalc();
  const artifactLand = add(game, players[1], { name: 'Artifact land', types: ['Artifact', 'Land'],
    super: [], subtypes: [], cost: '', oracle: '', kws: [], abilities: [] });
  game.recalc();
  const impact = MTG.botBoardWipeImpact(game, bot, { kind: 'cast', card: wipe });
  assert.ok(game.creatures(players[1]).every(impact.removes));
  assert.equal(impact.removes(artifactLand), true, 'Farewell also exiles artifact lands');
  assert.equal(MTG.botModeSweepValue(game, bot, { label: 'Destroy all creatures' }), 0);
  assert.ok(MTG.botModeSweepValue(game, bot, { label: 'Exile all creatures' }) > 10);
});
