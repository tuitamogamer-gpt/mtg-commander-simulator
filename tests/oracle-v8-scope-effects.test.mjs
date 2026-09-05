import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureEngine, context, put, settle } from './helpers/oracle-v8-fixtures.mjs';
import { loadEngine } from './helpers/load-engine.mjs';
import { semanticClass } from '../scripts/import-oracle-batch.mjs';

const M = fixtureEngine([
  ['Scope Destroy', 'Destroy all enchantments target player controls.', 'Sorcery', '{G}'],
  ['Scope Tap', 'Tap all creatures target opponent controls.', 'Instant', '{G}'],
  ['Scope Pump', 'Creatures target player controls get -2/-2 until end of turn.', 'Sorcery', '{G}'],
  ['Scope Untap', 'Target player untaps all basic lands they control.', 'Instant', '{G}'],
  ['Scope Bounce', "Return all nonland permanents target player controls to their owner's hand.", 'Sorcery', '{G}'],
  ['Scope Enchantment', '', 'Enchantment', '{G}'],
  ['Scope Bear', '', 'Creature — Bear', '{G}'],
  ['Scope Shroud', 'Shroud', 'Creature — Bear', '{G}'],
  ['Scope Player Hexproof', 'You have hexproof.', 'Enchantment', '{G}'],
  ['Scope Exile Zones', "Exile all cards from target player's hand and graveyard.", 'Sorcery', '{G}'],
  ['Scope Return X', 'Return all creature and planeswalker cards with mana value X or less from your graveyard to the battlefield.', 'Sorcery', '{X}{G}'],
  ['Scope Destroy X', 'Destroy all creatures with mana value X or less.', 'Sorcery', '{X}{G}'],
  ['Scope Cost Two', '', 'Creature — Bear', '{1}{G}'],
  ['Scope Cost Three', '', 'Creature — Bear', '{2}{G}'],
  ['Scope Noncreature', '', 'Artifact', '{G}'],
  ...(!loadEngine().DEFS.Earthcraft ? [['Earthcraft', 'Tap an untapped creature you control: Untap target basic land.', 'Enchantment', '{1}{G}']] : []),
]);

async function cast(ctx, name, target = ctx.b) {
  const card = put(M, ctx.game, ctx.a, name, 'hand');
  ctx.a.pool.G = 1;
  const decide = ctx.a.controller.decide.bind(ctx.a.controller);
  ctx.a.controller.decide = (g, q) => q.type === 'chooseTargets' ? Promise.resolve([target]) : decide(g, q);
  assert.equal(await ctx.game.castSpell(ctx.a, card, { from: 'hand' }), true);
  assert.equal(ctx.a.pool.G, 0);
  return card;
}

for (const role of ['human', 'ai']) {
  test(`${role}: Earthcraft pays its creature tap cost and only untaps a basic land target`, async () => {
    const ctx = context(M, role), { game, a, b } = ctx;
    const earthcraft = put(M, game, a, 'Earthcraft'), creature = put(M, game, a, 'Scope Bear');
    const basic = put(M, game, b, 'Forest'), nonbasic = put(M, game, b, 'Command Tower');
    basic.tapped = nonbasic.tapped = true;
    const original = a.controller.decide.bind(a.controller);
    a.controller.decide = (g, q) => {
      if (q.type === 'chooseTargets') {
        assert.equal(q.candidates.includes(basic), true);
        assert.equal(q.candidates.includes(nonbasic), false);
        return Promise.resolve([basic]);
      }
      return original(g, q);
    };
    const ability = game.activatableList(a).find(row => row.card === earthcraft && row.ability);
    assert.ok(ability);
    assert.equal(await game.activateAbility(a, ability), true);
    assert.equal(creature.tapped, true); assert.equal(basic.tapped, true);
    await settle(game);
    assert.equal(basic.tapped, false); assert.equal(nonbasic.tapped, true);
  });

  test(`${role}: targeted group chooses a player and follows current controller at resolution`, async () => {
    const ctx = context(M, role, 2), { game, a, b, others } = ctx;
    const own = put(M, game, a, 'Scope Enchantment'), enemy = put(M, game, b, 'Scope Enchantment');
    const third = put(M, game, others[1], 'Scope Enchantment'), wrongType = put(M, game, b, 'Scope Bear');
    await cast(ctx, 'Scope Destroy');
    assert.deepEqual(Array.from(game.stack.at(-1).targets), [b]);
    M.OracleV8Control.gain(game, own, b); M.OracleV8Control.gain(game, enemy, a); game.recalc();
    await settle(game);
    assert.equal(own.zone, 'graveyard'); assert.equal(enemy.zone, 'battlefield');
    assert.equal(third.zone, 'battlefield'); assert.equal(wrongType.zone, 'battlefield');
  });

  test(`${role}: group effects affect shroud permanents without targeting them`, async () => {
    const ctx = context(M, role, 2), { game, a, b, others } = ctx;
    const target = put(M, game, b, 'Scope Shroud'), own = put(M, game, a, 'Scope Shroud');
    const third = put(M, game, others[1], 'Scope Shroud');
    await cast(ctx, 'Scope Tap'); await settle(game);
    assert.equal(target.tapped, true); assert.equal(own.tapped, false); assert.equal(third.tapped, false);
  });

  test(`${role}: player hexproof gained in response invalidates the whole sole-target group effect`, async () => {
    const ctx = context(M, role), { game, b } = ctx;
    const target = put(M, game, b, 'Scope Bear');
    await cast(ctx, 'Scope Tap');
    put(M, game, b, 'Scope Player Hexproof'); await settle(game);
    assert.equal(target.tapped, false);
  });

  test(`${role}: targeted untap respects basic status and targeted pump remains scoped`, async () => {
    const ctx = context(M, role), { game, a, b } = ctx;
    const own = put(M, game, a, 'Forest'), basic = put(M, game, b, 'Forest');
    const nonbasic = put(M, game, b, 'Command Tower');
    own.tapped = basic.tapped = nonbasic.tapped = true;
    await cast(ctx, 'Scope Untap'); await settle(game);
    assert.equal(basic.tapped, false); assert.equal(nonbasic.tapped, true); assert.equal(own.tapped, true);
    const ours = put(M, game, a, 'Scope Bear'), theirs = put(M, game, b, 'Scope Bear');
    await cast(ctx, 'Scope Pump'); await settle(game);
    assert.equal(ours.power, 2); assert.equal(ours.toughness, 3);
    assert.equal(theirs.power, 0); assert.equal(theirs.toughness, 1);
  });

  test(`${role}: bounce returns stolen permanents to their owners while respecting control scope`, async () => {
    const ctx = context(M, role), { game, a, b } = ctx;
    const stolen = put(M, game, a, 'Scope Bear'), own = put(M, game, a, 'Scope Bear');
    M.OracleV8Control.gain(game, stolen, b); game.recalc();
    await cast(ctx, 'Scope Bounce'); await settle(game);
    assert.equal(stolen.zone, 'hand'); assert.ok(a.hand.includes(stolen)); assert.equal(own.zone, 'battlefield');
  });

  test(`${role}: exile all hand and graveyard cards remains within the targeted player's zones`, async () => {
    const ctx = context(M, role), { game, a, b } = ctx;
    const enemyHand = put(M, game, b, 'Scope Bear', 'hand'), enemyGrave = put(M, game, b, 'Scope Bear', 'graveyard');
    const ownHand = put(M, game, a, 'Scope Bear', 'hand'), ownGrave = put(M, game, a, 'Scope Bear', 'graveyard');
    const libraryCount = b.library.length;
    await cast(ctx, 'Scope Exile Zones'); await settle(game);
    assert.equal(enemyHand.zone, 'exile'); assert.equal(enemyGrave.zone, 'exile');
    assert.equal(ownHand.zone, 'hand'); assert.equal(ownGrave.zone, 'graveyard'); assert.equal(b.library.length, libraryCount);
  });

  test(`${role}: paid X bounds mass effects in the resolving spell's exact scope`, async () => {
    for (const name of ['Scope Return X', 'Scope Destroy X']) {
      const ctx = context(M, role), { game, a, b } = ctx;
      const zone = name === 'Scope Return X' ? 'graveyard' : 'battlefield';
      const lower = put(M, game, a, 'Scope Cost Two', zone), higher = put(M, game, a, 'Scope Cost Three', zone);
      const artifact = put(M, game, a, 'Scope Noncreature', zone), opponent = put(M, game, b, 'Scope Cost Two', 'hand');
      // The opponent fixture has independent ownership and is not part of the
      // own-graveyard filter or the live battlefield destruction group.
      assert.equal(opponent.zone, 'hand');
      const source = put(M, game, a, name, 'hand'); a.pool.G = 1; a.pool.C = 2;
      assert.equal(await game.castSpell(a, source, { from: 'hand', xVal: 2 }), true);
      assert.equal(a.pool.G + a.pool.C, 0); assert.equal(game.stack.at(-1).x, 2);
      await settle(game);
      assert.equal(lower.zone, name === 'Scope Return X' ? 'battlefield' : 'graveyard');
      assert.equal(higher.zone, zone); assert.equal(artifact.zone, zone); assert.equal(opponent.zone, 'hand');
    }
  });
}

test('scoped group grammar rejects unconsumed instructions and multiple unrelated player scopes', () => {
  const base = { name: 'Scope Rejection', type_line: 'Sorcery', mana_cost: '{G}', layout: 'normal' };
  for (const text of [
    'Destroy all enchantments target player controls, then invent a spell.',
    'Destroy all enchantments target player controls and all lands target opponent controls simultaneously.',
    'Target player untaps all basic lands they control and wins the game.',
  ]) assert.equal(semanticClass({ ...base, oracle_text: text }).semanticClass, undefined);
  for (const text of [
    'Return all creature cards with mana value X or less from your graveyard to the battlefield.',
    'Destroy all creatures with mana value X or less.',
  ]) assert.equal(semanticClass({ ...base, oracle_text: text }).semanticClass, undefined, 'X requires an explicit paid binding');
});

test('local AI chooses opponents for harmful player scopes and itself for beneficial untap', async () => {
  for (const name of ['Scope Destroy', 'Scope Pump', 'Scope Exile Zones', 'Scope Untap']) {
    const ctx = context(M, 'ai', 2), { game, a, b } = ctx;
    const own = put(M, game, a, 'Scope Enchantment');
    put(M, game, b, 'Scope Enchantment'); put(M, game, b, 'Scope Bear');
    put(M, game, b, 'Scope Bear', 'hand');
    const land = put(M, game, a, 'Forest'); land.tapped = true;
    const source = put(M, game, a, name, 'hand'); a.pool.G = 1;
    assert.equal(await game.castSpell(a, source, { from: 'hand' }), true);
    const selected = game.stack.at(-1).targets[0];
    if (name === 'Scope Untap') assert.equal(selected === a, true, name + ': beneficial player scope chooses self');
    else assert.equal(selected === a, false, name + ': harmful player scope chooses an opponent');
    assert.ok(ctx.trace.some(row => row.q.type === 'chooseTargets'));
    await settle(game); assert.equal(own.zone, 'battlefield');
  }
});
