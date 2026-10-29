import test from 'node:test';
import assert from 'node:assert/strict';
import {M, setup, card, body, settle, fuel} from './helpers/c21-fixtures.mjs';

const ctx = (f, src, you = f.a) => ({g: f.game, src, you, sourceZoneVersion: src.zoneVersion});

test('Assimilation preserves a charged Federation Spacecraft and its Station ability after control changes', async () => {
  const f = setup(), source = card(f, 'Sol Ring');
  const ship = card(f, 'U.S.S. Defiant, Tough Little Ship', 'battlefield', f.b);
  f.game.addCounters(ship, 'charge', 5);
  const before = {power: ship.power, toughness: ship.toughness, version: ship.zoneVersion};
  await M.StarTrek.assimilate(ctx(f, source), ship);
  await settle(f.game);
  assert.equal(ship.ctrl, f.a);
  assert.equal(ship.owner, f.b);
  assert.equal(ship.zoneVersion, before.version);
  assert.equal(ship.counters.charge, 5);
  assert.equal(ship.counters['+1/+1'], 1);
  assert.equal(ship.power, before.power + 1);
  assert.equal(ship.toughness, before.toughness + 1);
  assert.ok(ship.hasSub('Spacecraft') && ship.hasSub('Borg'));
  assert.ok(ship.is('Artifact') && ship.is('Creature') && ship.kw('flying') && ship.kw('hexproof'));

  f.game.removeCounters(ship, 'charge', 5);
  assert.ok(ship.is('Creature'), 'assimilation keeps the ship a creature below its Station threshold');
  assert.equal(ship.kw('flying'), false);
  assert.equal(ship.kw('hexproof'), false);
  const crew = body(f);
  f.decide = (p, q) => q.type === 'chooseCards' && q.from.includes(crew) ? [crew] : undefined;
  fuel(f.a);
  const entry = f.game.activatableList(f.a).find(e => e.card === ship);
  assert.ok(entry, 'the new controller can still activate Station');
  assert.equal(await f.game.activateAbility(f.a, entry), true);
  await settle(f.game);
  assert.equal(ship.counters.charge, 2);
  assert.equal(crew.tapped, true);
});

for (const name of ['U.S.S. Defiant, Tough Little Ship', 'Type-03 Borg Vessel', "K't'inga-Class Battle Cruiser", 'Shuttlecraft Galileo']) {
  test(name + ': pending Station uses the crew’s current power after both permanents change controller', async () => {
    const f = setup(), ship = card(f, name), crew = body(f), source = card(f, 'Sol Ring', 'battlefield', f.b);
    f.decide = (p, q) => q.type === 'chooseCards' && q.from.includes(crew) ? [crew] : undefined;
    fuel(f.a);
    const entry = f.game.activatableList(f.a).find(e => e.card === ship);
    assert.ok(entry);
    assert.equal(await f.game.activateAbility(f.a, entry), true);
    assert.equal(crew.tapped, true);
    assert.equal(ship.counters.charge || 0, 0);
    await M.StarTrek.assimilate(ctx(f, source, f.b), ship);
    await M.StarTrek.assimilate(ctx(f, source, f.b), crew);
    assert.equal(ship.ctrl, f.b);
    assert.equal(crew.ctrl, f.b);
    assert.equal(crew.power, 3);
    await settle(f.game);
    assert.equal(ship.counters.charge, 3, 'control changes do not cancel the original Station activation');
  });
}

test('Officers hitting two opponents trigger Janeway twice and Picard seek out only once', async () => {
  const f = setup('human', 2), janeway = card(f, 'Captain Janeway, Endgame');
  card(f, 'Jean-Luc Picard, Luminary');
  const riker = card(f, 'Commander William Riker'), ship = card(f, 'U.S.S. Stargazer, Here and There');
  f.decide = (p, q) => q.type === 'chooseTargets' ? [riker, ship].filter(c => q.candidates.includes(c)).slice(0, q.max) : undefined;
  await f.game.damageBatch([{src: janeway, target: f.b, n: 3}, {src: riker, target: f.others[1], n: 3}], {combat: true});
  await settle(f.game);
  assert.equal(f.a.hand.length, 2);
  assert.equal(f.game.creatures(f.a).filter(c => c.isToken && c.hasSub('Officer')).length, 2);
  assert.equal(riker.counters['+1/+1'], 1);
  assert.equal(ship.counters.charge, 2);
});
