import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M = loadEngine();
function table(deck = 'Eternal Might', seats = 2, difficulty = 'hard') {
  const game = new M.Game({seed: 10323, paced: false, difficulty});
  const players = Array.from({length: seats}, (_, i) => game.addPlayer(`Seat ${i}`,
    {name: i ? 'Draconic Dissent' : deck}, {decide: async (g, q) =>
      q.type === 'priority' ? {kind: 'pass'} : q.type === 'chooseOption' ? q.options[0]?.key : []}, i === 0));
  const bot = players[0]; bot.life = 24;
  bot.controller = new M.AIController(bot, {difficulty, style: 'balanced'});
  game.turnPlayer = bot; game.turnNo = 10; game.phase = 'main2'; game.step = 'main';
  const put = (name, player = bot, zone = 'battlefield') => {
    assert.ok(M.DEFS[name], `registered card: ${name}`);
    const card = new M.CardInst(M.DEFS[name], player); card.zone = zone; card.sick = false;
    if (zone === 'battlefield') game.battlefield.push(card); else player[zone].push(card);
    game.recalc(); return card;
  };
  for (const p of players) for (let i = 0; i < 30; i++) put('Forest', p, 'library');
  const draw = source => game.activatableList(bot).find(entry => entry.card === source &&
    entry.ability.oracleOperation?.effects.some(effect => effect.action === 'draw'));
  const decide = async source => {
    const entry = draw(source); assert.ok(entry, 'printed draw ability is payable');
    return bot.controller.decide(game, {type: 'main', player: bot, phase: game.phase, casts: [], lands: [], acts: [entry]});
  };
  return {game, bot, players, put, draw, decide};
}

for (const deck of ['Eternal Might', 'Wretched Ranks']) {
  for (const difficulty of ['easy', 'normal', 'hard']) {
    test(`${deck}/${difficulty}: Cryptbreaker draws in a quiet pod using its real three-Zombie cost`, async () => {
      const f = table(deck, 4, difficulty);
      const source = f.put('Cryptbreaker'); f.put('Undead Augur'); f.put('Lazotep Reaver');
      const choice = await f.decide(source);
      assert.equal(choice.kind, 'activate');
      assert.equal(await f.game.activateAbility(f.bot, choice.entry), true);
      assert.equal(f.game.creatures(f.bot).filter(card => card.tapped).length, 3);
      assert.equal(f.bot.hand.length, 1); assert.equal(f.bot.life, 23);
      assertGameStateInvariants(f.game, 'quiet Cryptbreaker payment');
    });
  }
  test(`${deck}: four real attackers make exhausting all three Zombies a bad draw`, async () => {
    const f = table(deck);
    const source = f.put('Cryptbreaker'); f.put('Undead Augur'); f.put('Lazotep Reaver');
    for (let i = 0; i < 4; i++) f.put('Craw Wurm', f.players[1]);
    assert.equal((await f.decide(source)).kind, 'done');
    assert.equal(f.game.creatures(f.bot).some(card => card.tapped), false);
  });
}

test('Cryptbreaker draws with spare Zombies, then stops before spending the reserve', async () => {
  const f = table(); f.bot.life = 5;
  const source = f.put('Cryptbreaker');
  for (let i = 0; i < 5; i++) f.put('Lazotep Reaver');
  f.put('Craw Wurm', f.players[1]);
  const choice = await f.decide(source); assert.equal(choice.kind, 'activate');
  assert.equal(await f.game.activateAbility(f.bot, choice.entry), true);
  assert.equal(f.bot.hand.length, 1);
  assert.equal(f.game.creatures(f.bot).filter(card => !card.tapped).length, 3);
  assert.equal((await f.decide(source)).kind, 'done');
});

test('five defenders that cannot attack do not make the bot hoard Zombies', async () => {
  const f = table(); f.bot.life = 12;
  const source = f.put('Cryptbreaker'); f.put('Undead Augur'); f.put('Lazotep Reaver');
  for (let i = 0; i < 5; i++) f.put('Wall of Omens', f.players[1]);
  assert.equal((await f.decide(source)).kind, 'activate');
});

test('a single trampling attacker can be more dangerous than five harmless creatures', async () => {
  const f = table(); f.bot.life = 6;
  const source = f.put('Cryptbreaker'); f.put('Undead Augur'); f.put('Lazotep Reaver');
  f.put('Colossal Dreadmaw', f.players[1]);
  assert.equal((await f.decide(source)).kind, 'done');
});

for (const danger of ['poison', 'commander']) test(`Cryptbreaker respects lethal ${danger} damage even at 40 life`, async () => {
  const f = table(); f.bot.life = 40;
  const source = f.put('Cryptbreaker'); f.put('Undead Augur'); f.put('Lazotep Reaver');
  const threat = f.put(danger === 'poison' ? 'Ichorclaw Myr' : 'Skullbriar, the Walking Grave', f.players[1]);
  if (danger === 'poison') f.bot.poison = 9;
  else { threat.commander = true; f.bot.commanderDamage[threat.iid] = 20; }
  assert.equal((await f.decide(source)).kind, 'done');
});

test('three-Zombie payment preserves the only flying Zombie, even when expensive ground bodies are available', async () => {
  const f = table(); f.bot.life = 4;
  const source = f.put('Cryptbreaker'), flyer = f.put('Crow of Dark Tidings');
  for (let i = 0; i < 3; i++) f.put('Corpse Augur');
  f.put('Shivan Dragon', f.players[1]);
  const choice = await f.decide(source); assert.equal(choice.kind, 'activate');
  assert.equal(await f.game.activateAbility(f.bot, choice.entry), true);
  assert.equal(f.game.creatures(f.bot).filter(card => card.tapped).length, 3);
  assert.equal(flyer.tapped, false);
});

test('Arcanis keeps a blocker at the first opponent end step, but draws at the last', async () => {
  const f = table('Arcane Wizardry', 4); f.bot.life = 4;
  const source = f.put('Arcanis the Omnipotent');
  f.put('Craw Wurm', f.players[2]);
  f.game.turnPlayer = f.players[1]; f.game.phase = 'end'; f.game.step = 'end';
  assert.equal((await f.decide(source)).kind, 'done');
  f.game.turnPlayer = f.players[3];
  assert.equal((await f.decide(source)).kind, 'activate');
});

test('mana payment preserves Birds of Paradise as the only blocker for a Dragon', async () => {
  const f = table('Elven Council'); f.bot.life = 4;
  const flyer = f.put('Birds of Paradise'), elf = f.put('Llanowar Elves');
  f.put('Shivan Dragon', f.players[1]);
  assert.equal(await f.game.payMana(f.bot, M.parseCost('{G}')), true);
  assert.equal(elf.tapped, true); assert.equal(flyer.tapped, false);
  assertGameStateInvariants(f.game, 'mana keeps a flying blocker');
});

test('Springleaf Drum taps a spare ground creature and preserves the flying blocker', async () => {
  const f = table('Quick Draw'); f.bot.life = 4;
  const flyer = f.put('Ornithopter'), spare = f.put('Lazotep Reaver');
  const drum = f.put('Springleaf Drum'); f.put('Shivan Dragon', f.players[1]);
  assert.equal(await f.game.payMana(f.bot, M.parseCost('{U}')), true);
  assert.equal(drum.tapped, true); assert.equal(spare.tapped, true); assert.equal(flyer.tapped, false);
  assertGameStateInvariants(f.game, 'Drum keeps a flying blocker');
});

test('mana creatures still fund development when no other mana is available', async () => {
  const f = table('Elven Council');
  const elf = f.put('Llanowar Elves');
  assert.equal(await f.game.payMana(f.bot, M.parseCost('{G}')), true);
  assert.equal(elf.tapped, true);
});

for (const threatened of [false, true]) test(`a draw spell ${threatened ? 'waits instead of spending the only flying blocker' : 'uses creature mana in a quiet pod'}`, async () => {
  const f = table('Elven Council'); f.bot.life = 4;
  const bird = f.put('Birds of Paradise');
  const spell = f.put('Brainstorm', f.bot, 'hand');
  if (threatened) f.put('Shivan Dragon', f.players[1]);
  const casts = f.game.castableList(f.bot).filter(entry => entry.card === spell);
  assert.equal(casts.length, 1);
  const choice = await f.bot.controller.decide(f.game, {type: 'main', player: f.bot, phase: f.game.phase, casts, lands: [], acts: []});
  assert.equal(choice.kind, threatened ? 'done' : 'cast', JSON.stringify(f.game.aiDecisionLog.at(-1)));
  assert.equal(bird.tapped, false, 'decision forecasting does not mutate the live payment');
});
