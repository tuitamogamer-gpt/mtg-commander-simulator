import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function defaultDecision(game, query) {
  if (query.type === 'priority') return { kind: 'pass' };
  if (query.type === 'main') return { kind: 'done' };
  if (query.type === 'chooseOption') return query.options[0]?.key;
  if (query.type === 'chooseCards') return query.from.slice(0, query.min || 0);
  if (query.type === 'chooseTargets') return query.candidates.slice(0, query.min || 0);
  if (query.type === 'chooseX') return query.max;
  if (query.type === 'orderTriggers') return query.triggers;
  return null;
}

function rulesGame() {
  const game = new MTG.Game({ seed: 8272703, paced: false, maxTurns: 40 });
  const player = game.addPlayer('Troyan Player', { name: 'Quandrix Unlimited' }, {
    decide: async (g, query) => defaultDecision(g, query),
  }, false);
  game.addPlayer('Opponent', { name: 'Opponent' }, {
    decide: async (g, query) => defaultDecision(g, query),
  }, true);
  game.turnPlayer = player;
  game.turnNo = 9;
  game.phase = 'main1';
  game.step = 'main';
  game.priorityRound = async () => {};
  return { game, player };
}

function permanent(game, player, name) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.ctrl = player;
  card.zone = 'battlefield';
  card.sick = false;
  game.battlefield.push(card);
  game.recalc();
  return card;
}

function inHand(player, name) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.zone = 'hand';
  player.hand.push(card);
  return card;
}

async function resolveAll(game) {
  let guard = 0;
  while ((game.pendingTriggers.length || game.stack.length) && guard++ < 100) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
  }
  assert.ok(guard < 100);
}

test('Troyanova prva sposobnost je vidljiva mana akcija i odmah dodaje ograničene G/U bez stacka', async () => {
  const { game, player } = rulesGame();
  const troyan = permanent(game, player, 'Troyan, Gutsy Explorer');

  const action = game.activatableList(player).find(entry => entry.card === troyan && entry.manaAbility);
  assert.ok(action, 'prva Troyanova aktivacija mora biti dostupna igraču');
  assert.match(action.label, /MV 5\+ or X spells/i);
  assert.equal(await game.activateAbility(player, action), true);

  assert.equal(troyan.tapped, true);
  assert.equal(game.stack.length, 0, 'mana ability ne koristi stack');
  assert.equal(player.pool.G, 1);
  assert.equal(player.pool.U, 1);
  assert.equal(player.poolMeta.reduce((sum, entry) => sum + entry.n, 0), 2);
});

test('ručno floatana Troyanova mana ne može platiti MV manji od 5 bez X', async () => {
  const { game, player } = rulesGame();
  const troyan = permanent(game, player, 'Troyan, Gutsy Explorer');
  const action = game.activatableList(player).find(entry => entry.card === troyan && entry.manaAbility);
  assert.equal(await game.activateAbility(player, action), true);
  const apprentice = inHand(player, 'Quandrix Apprentice');

  assert.equal(await game.castSpell(player, apprentice, { from: 'hand' }), false);
  assert.equal(apprentice.zone, 'hand');
  assert.equal(player.pool.G, 1);
  assert.equal(player.pool.U, 1);
  troyan.tapped = false;
  assert.equal(game.activatableList(player).some(entry => entry.card === troyan && entry.ability), false,
    'Troyanova ograničena U mana ne može platiti njegovu draw/discard sposobnost');
});

test('ručno floatana Troyanova mana legalno plaća X spell i MV 5 spell', async () => {
  {
    const { game, player } = rulesGame();
    const troyan = permanent(game, player, 'Troyan, Gutsy Explorer');
    const action = game.activatableList(player).find(entry => entry.card === troyan && entry.manaAbility);
    assert.equal(await game.activateAbility(player, action), true);
    const bloom = inHand(player, 'Mana Bloom');

    assert.equal(await game.castSpell(player, bloom, { from: 'hand', xVal: 1 }), true);
    await resolveAll(game);
    assert.equal(bloom.counters.charge, 1);
    assert.equal(player.pool.G + player.pool.U, 0);
    assert.equal(player.poolMeta.length, 0);
  }

  {
    const { game, player } = rulesGame();
    player.pool.C = 3;
    const troyan = permanent(game, player, 'Troyan, Gutsy Explorer');
    const action = game.activatableList(player).find(entry => entry.card === troyan && entry.manaAbility);
    assert.equal(await game.activateAbility(player, action), true);
    const tanazir = inHand(player, 'Tanazir Quandrix');

    assert.equal(await game.castSpell(player, tanazir, { from: 'hand' }), true);
    await resolveAll(game);
    assert.equal(tanazir.zone, 'battlefield');
    assert.equal(Object.values(player.pool).reduce((sum, n) => sum + n, 0), 0);
    assert.equal(player.poolMeta.length, 0);
  }
});

test('Troyanova ograničena floatana mana nestaje na kraju faze zajedno sa metapodacima', async () => {
  const { game, player } = rulesGame();
  const troyan = permanent(game, player, 'Troyan, Gutsy Explorer');
  const action = game.activatableList(player).find(entry => entry.card === troyan && entry.manaAbility);
  assert.equal(await game.activateAbility(player, action), true);

  game.emptyPool();
  assert.equal(player.pool.G + player.pool.U, 0);
  assert.equal(player.poolMeta.length, 0);
});
