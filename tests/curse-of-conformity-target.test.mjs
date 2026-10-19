import test from 'node:test';
import assert from 'node:assert/strict';
import {M, setup, card, body, mana, settle} from './helpers/c21-fixtures.mjs';

async function enchantedTable(targetSeat) {
  const f = setup('human', 3), {game, a} = f;
  f.target = game.players[targetSeat];
  f.bears = game.players.map(player => body(f, player));
  f.counterCreature = body(f, f.target);
  game.addCounters(f.counterCreature, '+1/+1', 2);
  f.legendary = card(f, 'Leinore, Autumn Sovereign', 'battlefield', f.target);
  f.legendaryBefore = {
    power: f.legendary.power,
    toughness: f.legendary.toughness,
    subtypes: [...f.legendary.cur.subtypes],
  };
  f.curse = card(f, 'Curse of Conformity', 'hand');
  let targetChoices = 0;
  f.decide = (player, q) => {
    if (q.type !== 'chooseTargets' || q.src !== f.curse) return undefined;
    assert.ok(player === a, 'the caster chooses the enchanted player');
    assert.ok(q.candidates.includes(f.target), 'the selected seat is a legal target');
    targetChoices++;
    return [f.target];
  };
  a.pool.W = 1;
  a.pool.C = 4;
  assert.equal(mana(a), 5);
  assert.equal(await game.castSpell(a, f.curse, {from: 'hand'}), true);
  assert.equal(mana(a), 0, 'the cast pays all five mana');
  const spell = game.stack.find(item => item.card === f.curse);
  assert.ok(spell, 'the paid Aura spell uses the stack');
  assert.ok(spell.ctrl === a);
  assert.equal(spell.targets.length, 1);
  assert.ok(spell.targets[0] === f.target, 'the announced target is locked on the stack');
  await settle(game);
  assert.equal(targetChoices, 1, 'resolution does not ask for another target');
  return f;
}

function assertEnchantedBoard(f, game = f.game) {
  const curse = game.byIid(f.curse.iid), target = game.players[f.target.idx];
  assert.equal(curse.zone, 'battlefield');
  assert.ok(curse.ctrl === game.players[f.a.idx], 'the caster still controls the Curse');
  assert.ok(curse.meta.cursedPlayer === target, 'the Curse enchants the chosen player');
  for (const original of f.bears) {
    const bear = game.byIid(original.iid), enchanted = bear.ctrl === target;
    assert.equal(bear.power, enchanted ? 3 : 2, bear.ctrl.name + ': power');
    assert.equal(bear.toughness, enchanted ? 3 : 2, bear.ctrl.name + ': toughness');
    assert.deepEqual([...bear.cur.subtypes], enchanted ? [] : ['Bear'], bear.ctrl.name + ': creature types');
  }
  const counters = game.byIid(f.counterCreature.iid);
  assert.equal(counters.counters['+1/+1'], 2, 'the Curse preserves existing counters');
  assert.equal(counters.cur.basePower, 3);
  assert.equal(counters.cur.baseToughness, 3);
  assert.equal(counters.power, 5, 'counters apply after the new base power');
  assert.equal(counters.toughness, 5, 'counters apply after the new base toughness');
  assert.deepEqual([...counters.cur.subtypes], []);
  const legendary = game.byIid(f.legendary.iid);
  assert.ok(legendary.cur.super.includes('Legendary'));
  assert.equal(legendary.power, f.legendaryBefore.power);
  assert.equal(legendary.toughness, f.legendaryBefore.toughness);
  assert.deepEqual([...legendary.cur.subtypes], f.legendaryBefore.subtypes, 'legendary creatures retain their types');
}

for (const targetSeat of [0, 1, 2, 3]) {
  test(`Curse of Conformity affects only its announced player in seat ${targetSeat}`, async () => {
    const f = await enchantedTable(targetSeat);
    assertEnchantedBoard(f);
    for (const player of f.game.players) {
      const entrant = card(f, 'Grizzly Bears', 'hand', player);
      await f.game.move(entrant, 'battlefield', {ctrl: player});
      f.bears.push(entrant);
    }
    await settle(f.game);
    assertEnchantedBoard(f);
  });
}

test('Curse of Conformity keeps its enchanted player and creature effects through JSON save/restore', async () => {
  const f = await enchantedTable(2);
  const snapshot = JSON.parse(JSON.stringify(M.captureGameState(f.game)));
  assert.ok(snapshot);
  const entry = snapshot.cards.find(saved => saved.iid === f.curse.iid);
  assert.equal(entry.enchantedPlayer, f.target.idx);
  assert.equal(entry.meta?.cursedPlayer, undefined, 'the snapshot stores a seat rather than a live Player');
  const restored = setup('human', 3);
  M.restoreGameState(restored.game, snapshot);
  assertEnchantedBoard(f, restored.game);
  assert.ok(restored.game.byIid(f.curse.iid).meta.cursedPlayer !== f.target);
  assert.equal(M.gameStateFingerprint(restored.game), M.gameStateFingerprint(f.game));
});

test('an AI simulation cannot change the live Curse of Conformity target or creature effects', async () => {
  const f = await enchantedTable(2), before = M.gameStateFingerprint(f.game);
  const clone = M.cloneGameForAISimulation(f.game, 135);
  assertEnchantedBoard(f, clone);
  const clonedCurse = clone.byIid(f.curse.iid);
  assert.ok(clonedCurse.meta.cursedPlayer !== f.target, 'the cloned attachment belongs to the cloned game');
  await clone.move(clonedCurse, 'graveyard');
  clone.recalc();
  const clonedVictim = clone.byIid(f.bears[f.target.idx].iid);
  assert.equal(clonedVictim.power, 2, 'removing the cloned Curse restores the cloned creature');
  assert.deepEqual([...clonedVictim.cur.subtypes], ['Bear']);
  assertEnchantedBoard(f);
  assert.equal(M.gameStateFingerprint(f.game), before, 'the live game is unchanged by the simulated removal');
});
