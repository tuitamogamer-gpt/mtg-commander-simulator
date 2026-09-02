import assert from 'node:assert/strict';
import test from 'node:test';
import { loadEngine } from './helpers/load-engine.mjs';

// A leveler keeps one identity on the battlefield; only its characteristics
// follow the level counters on it. These tests drive the shipped catalog cards
// through the real activation path.

function board(MTG, seed = 51) {
  const game = new MTG.Game({ seed, paced: false, maxTurns: 5 });
  const you = game.addPlayer('You', { name: 'You' }, { decide: async () => ({ kind: 'pass' }) }, false);
  const bot = game.addPlayer('Bot', { name: 'Bot' }, { decide: async () => ({ kind: 'pass' }) }, true);
  game.turnPlayer = you;
  game.turnNo = 5;
  game.phase = 'main1';
  game.step = 'main';
  for (let index = 0; index < 20; index++) {
    const land = new MTG.CardInst(MTG.DEFS.Plains, you);
    land.zone = 'battlefield';
    land.sick = false;
    game.battlefield.push(land);
  }
  return { game, you, bot };
}

function permanent(MTG, game, player, name) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.zone = 'battlefield';
  card.sick = false;
  game.battlefield.push(card);
  game.recalc();
  return card;
}

const levelUp = (game, player, card) => game.activatableList(player)
  .find(row => row.card === card && /^Level up /.test(row.ability?.label || ''));

test('a leveler starts as its printed body and grows band by band', async () => {
  const MTG = loadEngine();
  const { game, you } = board(MTG);
  const student = permanent(MTG, game, you, 'Student of Warfare');
  assert.deepEqual([student.power, student.toughness], [1, 1], 'level 0 is the printed 1/1');
  assert.equal(student.cur.kw.has('first strike'), false, 'no band keyword before its band is reached');
  assert.equal(student.cur.kw.has('double strike'), false, 'no band keyword before its band is reached');

  for (let level = 1; level <= 7; level++) {
    const offer = levelUp(game, you, student);
    assert.ok(offer, `level up is offered at level ${level - 1}`);
    assert.equal(offer.ability.sorcery, true, 'level up is a sorcery-speed activation');
    for (const color of Object.keys(you.pool)) you.pool[color] = 10;
    assert.equal(await game.activateAbility(you, offer), true, `level up is paid at level ${level - 1}`);
    while (game.stack.length) await game.resolveTop();
    game.recalc();
    assert.equal(student.counters.level || 0, level, 'exactly one level counter per activation');
  }

  assert.deepEqual([student.power, student.toughness], [4, 4], 'LEVEL 7+ is a 4/4');
  assert.equal(student.cur.kw.has('double strike'), true, 'the live band grants its printed keyword');
  assert.equal(student.cur.kw.has('first strike'), false,
    'a keyword printed only on an earlier band is not carried forward');
});

test('a band ability exists only while its band is live', async () => {
  const MTG = loadEngine();
  const { game, you } = board(MTG, 52);
  const assassin = permanent(MTG, game, you, 'Guul Draz Assassin');
  const gated = (assassin.def.abilities || []).filter(ability => !/^Level up /.test(ability.label || ''));
  assert.equal(gated.length, 2, 'both printed band abilities are compiled');

  const live = () => { game.recalc(); return gated.filter(ability => !ability.cond || ability.cond(game, assassin, you)).length; };
  assert.equal(live(), 0, 'no band ability before the first band');
  for (let level = 1; level <= 4; level++) {
    assassin.counters.level = level;
    assert.equal(live(), level >= 2 ? 1 : 0, `exactly the live band's ability at level ${level}`);
  }
});

test('a leveler that leaves the battlefield comes back at level zero', async () => {
  const MTG = loadEngine();
  const { game, you } = board(MTG, 53);
  const knight = permanent(MTG, game, you, 'Knight of Cliffhaven');
  knight.counters.level = 4;
  game.recalc();
  assert.deepEqual([knight.power, knight.toughness], [4, 4], 'LEVEL 4+ is a 4/4');

  await game.move(knight, 'graveyard');
  const returned = permanent(MTG, game, you, 'Knight of Cliffhaven');
  assert.deepEqual([returned.power, returned.toughness], [2, 2], 'a new object starts at level 0');
  assert.equal(returned.cur.kw.has('flying'), false, 'and without the band keywords');
});
