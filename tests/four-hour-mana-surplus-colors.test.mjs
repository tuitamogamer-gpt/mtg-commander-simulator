import test from 'node:test';
import assert from 'node:assert/strict';
import {M, table, paidCast, stable} from './helpers/second-audit-combat-fixtures.mjs';

for (const reverse of [false, true]) {
  for (const scenario of [
    {spell: 'Baleful Strix', lands: ['Izzet Boilerworks', 'Swamp'], excess: 'R'},
    {spell: "Thassa's Oracle", lands: ['Simic Growth Chamber', 'Island'], excess: 'G'},
  ]) test(`mana surplus: ${scenario.spell} uses both lands with the bounceland ${reverse ? 'last' : 'first'}`, async () => {
    const f = table();
    const lands = f.lands(reverse ? scenario.lands.slice().reverse() : scenario.lands);
    const spell = f.put(scenario.spell, 'hand');
    assert.ok(f.g.canPayMana(f.a, M.parseCost(spell.def.cost), {card: spell}),
      'surplus of one color does not require this source to pay all remaining colors');
    await paidCast(f, f.a, spell);
    assert.equal(spell.zone, 'battlefield');
    assert.equal(lands.every(card => card.tapped), true);
    assert.equal(f.a.pool[scenario.excess], 1, 'the unused unit stays in the mana pool');
    assert.equal(spell.castMeta.manaSpent, 2);
    stable(f, 'native mixed-color source surplus');
  });
}

test('mana surplus: Phyrexian Tower pays black while an Island supplies the remaining blue', async () => {
  const f = table();
  const lands = f.lands(['Phyrexian Tower', 'Island']);
  const donor = f.put('Changeling Outcast');
  const spell = f.put('Baleful Strix', 'hand');
  f.cards = (player, q) => q.aiHint?.kind === 'sacCost' ? [donor] : undefined;
  assert.ok(f.g.canPayMana(f.a, M.parseCost(spell.def.cost), {card: spell}));
  await paidCast(f, f.a, spell);
  assert.equal(spell.zone, 'battlefield');
  assert.equal(donor.zone, 'graveyard', 'the real mana ability pays its sacrifice cost once');
  assert.equal(lands.every(card => card.tapped), true);
  assert.equal(f.a.pool.B, 1);
  stable(f, 'native sacrificing producer surplus');
});
