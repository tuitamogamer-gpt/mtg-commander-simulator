import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

function controller(option = 'G') {
  return {
    decide: async (game, q) => {
      if (q.type === 'priority') return { kind: 'pass' };
      if (q.type === 'chooseOption') {
        return q.options.some(candidate => candidate.key === option) ? option : q.options[0]?.key;
      }
      if (q.type === 'chooseTargets') return q.candidates.slice(0, q.min || 0);
      if (q.type === 'orderTriggers') return q.triggers;
      return null;
    },
  };
}

function rulesGame(MTG) {
  const game = new MTG.Game({ seed: 83, paced: false, maxTurns: 10 });
  const player = game.addPlayer('Player', { name: 'Test' }, controller(), false);
  const opponent = game.addPlayer('Opponent', { name: 'Test' }, controller(), true);
  game.turnPlayer = player;
  game.phase = 'main1';
  game.step = 'main';
  return { game, player, opponent };
}

function permanent(MTG, game, player, name, { sick = false } = {}) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.ctrl = player;
  card.zone = 'battlefield';
  card.sick = sick;
  game.battlefield.push(card);
  return card;
}

test('Ninja Pizza Food nudi odvojeno manu i svoju life aktivaciju', async () => {
  const MTG = loadEngine();
  const { game, player } = rulesGame(MTG);
  permanent(MTG, game, player, 'Ninja Pizza');
  const [food] = await game.makeTokens('food', player, { noReplace: true });
  player.pool.C = 2;
  game.recalc();

  const choices = game.activatableList(player).filter(entry => entry.card === food);
  assert.ok(choices.some(entry => entry.ability && /3 life/.test(entry.ability.label)));
  const manaChoice = choices.find(entry => entry.manaAbility);
  assert.ok(manaChoice);
  assert.match(manaChoice.label, /Ninja Pizza/);

  assert.equal(await game.activateAbility(player, manaChoice), true);
  assert.equal(food.zone, 'ceased');
  assert.equal(player.pool.G, 1);
  assert.equal(game.stack.length, 0, 'mana sposobnost ne koristi stack');
});

test('igrač može izabrati Food život umjesto mane koju daje Ninja Pizza', async () => {
  const MTG = loadEngine();
  const { game, player } = rulesGame(MTG);
  permanent(MTG, game, player, 'Ninja Pizza');
  const [food] = await game.makeTokens('food', player, { noReplace: true });
  player.pool.C = 2;
  const lifeBefore = player.life;
  game.recalc();

  const lifeChoice = game.activatableList(player)
    .find(entry => entry.card === food && entry.ability && /3 life/.test(entry.ability.label));
  assert.ok(lifeChoice);
  assert.equal(await game.activateAbility(player, lifeChoice), true);
  assert.equal(player.life, lifeBefore + 3);
  assert.equal(food.zone, 'ceased');
  assert.equal(player.pool.G, 0);
});

test("Gourmand's Talent artefaktu daje stvarni izbor između njegove mane i Food života", () => {
  const MTG = loadEngine();
  const { game, player } = rulesGame(MTG);
  permanent(MTG, game, player, "Gourmand's Talent");
  const solRing = permanent(MTG, game, player, 'Sol Ring');
  player.pool.C = 2;
  game.recalc();

  assert.equal(solRing.hasSub('Food'), true);
  const choices = game.activatableList(player).filter(entry => entry.card === solRing);
  assert.ok(choices.some(entry => entry.manaAbility && /2×C/.test(entry.label)));
  assert.ok(choices.some(entry => entry.ability && /Food: sacrifice/.test(entry.ability.label)));
});

test('utility land nudi mana sposobnost uz posebnu aktivaciju', () => {
  const MTG = loadEngine();
  const { game, player } = rulesGame(MTG);
  const grounds = permanent(MTG, game, player, 'Scavenger Grounds');
  player.pool.C = 2;
  game.recalc();

  const choices = game.activatableList(player).filter(entry => entry.card === grounds);
  assert.ok(choices.some(entry => entry.manaAbility && /1×C/.test(entry.label)));
  assert.ok(choices.some(entry => entry.ability && /exile all graveyards/.test(entry.ability.label)));
});

test('Relic of Legends može za manu tapnuti i novodošlo legendarno stvorenje', async () => {
  const MTG = loadEngine();
  const { game, player } = rulesGame(MTG);
  permanent(MTG, game, player, 'Relic of Legends');
  const mikaeus = permanent(MTG, game, player, 'Mikaeus, the Lunarch', { sick: true });
  game.recalc();

  const manaChoice = game.activatableList(player)
    .find(entry => entry.card === mikaeus && entry.manaAbility && /Relic of Legends/.test(entry.label));
  assert.ok(manaChoice);
  assert.equal(await game.activateAbility(player, manaChoice), true);
  assert.equal(mikaeus.tapped, true);
  assert.equal(player.pool.G, 1);
  assert.equal(game.stack.length, 0);
});
