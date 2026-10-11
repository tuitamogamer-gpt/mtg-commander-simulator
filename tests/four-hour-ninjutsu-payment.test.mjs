import test from 'node:test';
import assert from 'node:assert/strict';
import {M, table, stable} from './helpers/second-audit-combat-fixtures.mjs';

function combat({zone = 'command', extraDonor = false} = {}) {
  const f = table();
  f.attacker = f.put('Changeling Outcast');
  f.ninja = f.put("Yuriko, the Tiger's Shadow", zone);
  f.ninja.commander = true;
  f.a.commanders.push(f.ninja);
  f.tower = f.put('Phyrexian Tower');
  if (extraDonor) f.donor = f.put('Ornithopter');
  f.a.pool.U = 1;
  f.g.phase = 'combat';
  f.g.step = 'blockers';
  f.attacker.tapped = true;
  f.attacker.attacking = f.b;
  f.g.combat = {attackers: [f.attacker], defenders: new Map()};
  f.cards = (p, q) => q.aiHint?.kind === 'ninjutsuReturn' ? [f.attacker] :
    q.aiHint?.kind === 'sacCost' && f.donor ? [f.donor] : undefined;
  return f;
}

for (const zone of ['hand', 'command']) {
  test(`ninjutsu from ${zone} cannot sacrifice and return the same attacking creature`, async () => {
    const f = combat({zone});
    assert.equal(f.g.activatableList(f.a).some(row => row.card === f.ninja && row.ninjutsu), false,
      'paying for ninjutsu must leave its return-cost attacker available');
    assert.equal(await f.g.activateAbility(f.a, {card: f.ninja, ninjutsu: true, ninjutsuCost: '{U}{B}'}), false);
    assert.equal(f.attacker.zone, 'battlefield');
    assert.equal(f.tower.tapped, false);
    assert.equal(f.a.pool.U, 1);
    assert.equal(f.ninja.zone, zone);
    stable(f, 'unpayable ninjutsu is atomic');
  });

  test(`ninjutsu from ${zone} preserves the attacker while sacrificing another creature for mana`, async () => {
    const f = combat({zone, extraDonor: true});
    const entry = f.g.activatableList(f.a).find(row => row.card === f.ninja && row.ninjutsu);
    assert.ok(entry);
    assert.equal(await f.g.activateAbility(f.a, entry), true);
    assert.equal(f.donor.zone, 'graveyard');
    assert.equal(f.attacker.zone, 'hand');
    assert.equal(f.ninja.zone, 'battlefield');
    assert.equal(f.ninja.attacking, f.b);
    assert.equal(f.ninja.tapped, true);
    assert.equal(f.a.pool.B, 1);
    assert.equal(f.events.filter(row => row.event === 'dies' && row.data.card === f.attacker).length, 0);
    stable(f, 'ninjutsu reserves its return cost');
  });
}

test('Satoru cannot offer or activate granted ninjutsu before blockers are declared', async () => {
  const f = table();
  f.put('Satoru Umezawa');
  const attacker = f.put('Changeling Outcast');
  const ninja = f.put('Colossal Dreadmaw', 'hand');
  f.lands(['Island', 'Swamp', 'Forest', 'Forest']);
  f.g.phase = 'combat';
  f.g.step = 'attackers';
  attacker.tapped = true;
  attacker.attacking = f.b;
  f.g.combat = {attackers: [attacker], defenders: new Map()};
  assert.equal(f.g.activatableList(f.a).some(row => row.card === ninja && row.ninjutsu), false);
  assert.equal(await f.g.activateAbility(f.a, {
    card: ninja, ninjutsu: true, ninjutsuCost: '{2}{U}{B}', v90Ninjutsu: true,
  }), false);
  assert.equal(attacker.zone, 'battlefield');
  assert.equal(ninja.zone, 'hand');
  f.g.step = 'blockers';
  assert.ok(f.g.activatableList(f.a).some(row => row.card === ninja && row.ninjutsu),
    'the same granted ability becomes legal once blockers have been declared');
});

test('an unblocked vigilant attacker can tap to Springleaf Drum before paying the ninjutsu return cost', async () => {
  const f = table();
  const attacker = f.put("Thassa's Oracle");
  const ninja = f.put("Yuriko, the Tiger's Shadow", 'command');
  ninja.commander = true;
  f.a.commanders.push(ninja);
  f.put('Brave the Sands');
  const drum = f.put('Springleaf Drum');
  const swamp = f.put('Swamp');
  let activated = false;
  f.attackers = (p, q) => p === f.a ? [{card: attacker, target: f.b}] : [];
  f.cards = (p, q) => q.aiHint?.kind === 'ninjutsuReturn' ? [attacker] : undefined;
  f.priority = (p, q) => {
    if (p !== f.a || f.g.step !== 'blockers' || activated) return {kind: 'pass'};
    assert.equal(attacker.tapped, false, 'vigilance leaves the attacker available to tap for mana');
    const entry = q.acts.find(row => row.card === ninja && row.ninjutsu);
    assert.ok(entry, 'the separate return cost does not require the attacker to remain untapped');
    activated = true;
    return {kind: 'activate', entry};
  };
  await f.g.combatPhase(f.a);
  assert.equal(activated, true);
  assert.equal(attacker.zone, 'hand');
  assert.equal(ninja.zone, 'battlefield');
  assert.equal(drum.tapped, true);
  assert.equal(swamp.tapped, true);
  assert.equal(f.b.life, 39);
  stable(f, 'vigilant attacker pays one mana tap and the ninjutsu return');
});

test('one vigilant attacker cannot pay the tap costs of two Springleaf Drums', () => {
  const f = table();
  const attacker = f.put("Thassa's Oracle");
  const ninja = f.put("Yuriko, the Tiger's Shadow", 'command');
  ninja.commander = true;
  f.put('Brave the Sands');
  f.put('Springleaf Drum');
  f.put('Springleaf Drum');
  f.g.phase = 'combat';
  f.g.step = 'blockers';
  attacker.attacking = f.b;
  f.g.combat = {attackers: [attacker], defenders: new Map()};
  assert.equal(f.g.activatableList(f.a).some(row => row.card === ninja && row.ninjutsu), false);
  assert.equal(attacker.tapped, false);
  stable(f, 'one reserved attacker is still only one untapped resource');
});

for (const spareCard of [false, true]) test(`Skirge Familiar ${spareCard ? 'uses another hand card' : 'cannot discard the Ninja'} to fund ninjutsu`, async () => {
  const f = table();
  const attacker = f.put('Changeling Outcast');
  const ninja = f.put("Yuriko, the Tiger's Shadow", 'hand');
  const familiar = f.put('Skirge Familiar');
  const island = f.put('Island');
  const donor = spareCard ? f.put('Forest', 'hand') : null;
  f.g.phase = 'combat';
  f.g.step = 'blockers';
  attacker.tapped = true;
  attacker.attacking = f.b;
  f.g.combat = {attackers: [attacker], defenders: new Map()};
  f.cards = (p, q) => q.aiHint?.kind === 'ninjutsuReturn' ? [attacker] : undefined;
  const entry = f.g.activatableList(f.a).find(row => row.card === ninja && row.ninjutsu);
  assert.equal(!!entry, spareCard);
  assert.equal(await f.g.activateAbility(f.a, entry || {card: ninja, ninjutsu: true, ninjutsuCost: '{U}{B}'}), spareCard);
  assert.equal(ninja.zone, spareCard ? 'battlefield' : 'hand');
  assert.equal(attacker.zone, spareCard ? 'hand' : 'battlefield');
  assert.equal(island.tapped, spareCard);
  assert.equal(familiar.zone, 'battlefield');
  if (donor) assert.equal(donor.zone, 'graveyard');
  stable(f, 'the revealed Ninja is reserved against mana discard costs');
});
