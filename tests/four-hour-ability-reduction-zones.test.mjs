import test from 'node:test';
import assert from 'node:assert/strict';
import {table, stable} from './helpers/second-audit-combat-fixtures.mjs';

function combat(f, name = 'Ninja of the Deep Hours') {
  const attacker = f.put('Changeling Outcast');
  const ninja = f.put(name, 'hand');
  f.g.phase = 'combat';
  f.g.step = 'blockers';
  attacker.tapped = true;
  attacker.attacking = f.b;
  f.g.combat = {attackers: [attacker], defenders: new Map()};
  f.cards = (p, q) => q.aiHint?.kind === 'ninjutsuReturn' ? [attacker] : undefined;
  return {attacker, ninja};
}

for (const reducer of ['Training Grounds', 'Heartstone', "Biomancer's Familiar"]) {
  test(`${reducer} does not discount printed ninjutsu from hand`, async () => {
    const f = table();
    f.put(reducer);
    const {attacker, ninja} = combat(f);
    const island = f.put('Island');
    assert.equal(f.g.activatableList(f.a).some(row => row.card === ninja && row.ninjutsu), false);
    assert.equal(await f.g.activateAbility(f.a, {card: ninja, ninjutsu: true, ninjutsuCost: '{1}{U}'}), false);
    assert.equal(island.tapped, false);
    assert.equal(attacker.zone, 'battlefield');
    const wastes = f.put('Wastes');
    const entry = f.g.activatableList(f.a).find(row => row.card === ninja && row.ninjutsu);
    assert.ok(entry);
    assert.equal(await f.g.activateAbility(f.a, entry), true);
    assert.equal(ninja.zone, 'battlefield');
    assert.equal(attacker.zone, 'hand');
    assert.equal(island.tapped && wastes.tapped, true);
    stable(f, 'printed ninjutsu pays its full hand cost');
  });

  test(`${reducer} still discounts a native battlefield creature activation`, async () => {
    const f = table();
    f.put(reducer);
    const mage = f.put('Azure Mage');
    const lands = f.lands(['Island', ...Array(reducer === 'Heartstone' ? 2 : 1).fill('Wastes')]);
    const entry = f.g.activatableList(f.a).find(row => row.card === mage && row.ability);
    assert.ok(entry, 'Azure Mage {3}{U} is payable after the battlefield reduction');
    const before = f.a.hand.length;
    assert.equal(await f.g.activateAbility(f.a, entry), true);
    assert.equal(f.a.hand.length, before + 1);
    assert.ok(lands.every(card => card.tapped));
    stable(f, 'battlefield creature reduction remains active');
  });
}

test('Training Grounds does not discount Satoru-granted ninjutsu', async () => {
  const f = table();
  f.put('Training Grounds');
  f.put('Satoru Umezawa');
  const {attacker, ninja} = combat(f, 'Colossal Dreadmaw');
  const lands = f.lands(['Island', 'Swamp']);
  assert.equal(f.g.activatableList(f.a).some(row => row.card === ninja && row.v90Ninjutsu), false);
  assert.equal(await f.g.activateAbility(f.a, {
    card: ninja, ninjutsu: true, ninjutsuCost: '{2}{U}{B}', v90Ninjutsu: true,
  }), false);
  assert.ok(lands.every(card => !card.tapped));
  lands.push(...f.lands(['Wastes', 'Wastes']));
  const entry = f.g.activatableList(f.a).find(row => row.card === ninja && row.v90Ninjutsu);
  assert.ok(entry);
  assert.equal(await f.g.activateAbility(f.a, entry), true);
  assert.equal(ninja.zone, 'battlefield');
  assert.equal(attacker.zone, 'hand');
  assert.ok(lands.every(card => card.tapped));
  stable(f, 'granted ninjutsu pays its full hand cost');
});

test('Training Grounds does not discount creature cycling from hand', async () => {
  const f = table();
  f.put('Training Grounds');
  const tusker = f.put('Krosan Tusker', 'hand');
  const lands = f.lands(['Forest']);
  assert.equal(f.g.activatableList(f.a).some(row => row.card === tusker && row.cycling), false);
  assert.equal(await f.g.activateAbility(f.a, {card: tusker, cycling: true}), false);
  assert.equal(tusker.zone, 'hand');
  assert.equal(lands[0].tapped, false);
  lands.push(...f.lands(['Wastes', 'Wastes']));
  const entry = f.g.activatableList(f.a).find(row => row.card === tusker && row.cycling);
  assert.ok(entry);
  assert.equal(await f.g.activateAbility(f.a, entry), true);
  assert.equal(tusker.zone, 'graveyard');
  assert.ok(lands.every(card => card.tapped));
  stable(f, 'cycling pays its full hand cost');
});

test('Zirda still discounts nonmana abilities activated from hand', async () => {
  const f = table();
  f.put('Zirda, the Dawnwaker');
  const {ninja} = combat(f);
  const island = f.put('Island');
  const entry = f.g.activatableList(f.a).find(row => row.card === ninja && row.ninjutsu);
  assert.ok(entry, 'Zirda applies to abilities you activate regardless of source zone');
  assert.equal(await f.g.activateAbility(f.a, entry), true);
  assert.equal(ninja.zone, 'battlefield');
  assert.equal(island.tapped, true);
  stable(f, 'legitimate hand-ability reduction remains active');
});

test('Training Grounds does not discount a creature ability activated from the graveyard', async () => {
  const f = table();
  f.put('Training Grounds');
  const skeleton = f.put('Reassembling Skeleton', 'graveyard');
  const swamp = f.put('Swamp');
  assert.equal(f.g.activatableList(f.a).some(row => row.card === skeleton && row.gyAbility), false);
  assert.equal(await f.g.activateAbility(f.a, {card: skeleton, gyAbility: true}), false);
  assert.equal(skeleton.zone, 'graveyard');
  assert.equal(swamp.tapped, false);
  const wastes = f.put('Wastes');
  const entry = f.g.activatableList(f.a).find(row => row.card === skeleton && row.gyAbility);
  assert.ok(entry, 'the printed {1}{B} is payable with both lands');
  assert.equal(await f.g.activateAbility(f.a, entry), true);
  assert.equal(skeleton.zone, 'battlefield');
  assert.equal(skeleton.tapped, true);
  assert.equal(swamp.tapped && wastes.tapped, true);
  stable(f, 'graveyard creature pays its full activation cost');
});
