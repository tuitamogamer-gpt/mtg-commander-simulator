import test from 'node:test';
import assert from 'node:assert/strict';
import {table, paidCast, stable} from './helpers/second-audit-combat-fixtures.mjs';

for (const modelName of ['Sol Ring', 'Giant Spider']) test(`paid Mirrorform copying ${modelName} respects the attacker's resulting type`, async () => {
  const f = table();
  const attacker = f.put('Raging Goblin', 'hand');
  f.lands(['Mountain']);
  await paidCast(f, f.a, attacker);
  const version = attacker.zoneVersion;
  const model = f.put(modelName, 'hand', f.b);
  f.lands(modelName === 'Sol Ring' ? ['Forest'] : Array(4).fill('Forest'), f.b);
  f.g.turnPlayer = f.b;
  await paidCast(f, f.b, model);
  f.g.turnPlayer = f.a;
  const mirror = f.put('Mirrorform', 'hand');
  const lands = f.lands(Array(6).fill('Island'));
  f.targets = (_p, q) => q.src === mirror ? [model] : undefined;
  f.attackers = p => p === f.a ? [{card: attacker, target: f.b}] : [];
  let cast = false, observed;
  f.priority = (p, q) => {
    if (!cast && p === f.a && f.g.combat?.attackers.includes(attacker)) {
      const row = q.casts.find(row => row.card === mirror);
      assert.ok(row, 'Mirrorform is offered after native attacker declaration');
      cast = true;
      return {kind: 'cast', card: mirror, from: row.from, alt: row.alt};
    }
    if (cast && mirror.zone === 'graveyard' && f.g.step === 'attackers') {
      observed = {creature: attacker.is('Creature'), attacking: attacker.attacking === f.b,
        retained: f.g.combat.attackers.includes(attacker)};
    }
    return {kind: 'pass'};
  };
  await f.g.combatPhase(f.a);
  assert.equal(cast, true);
  assert.equal(mirror.zone, 'graveyard');
  assert.equal(lands.filter(card => card.tapped).length, 6, 'six native Islands pay the printed cost');
  assert.equal(attacker.name, modelName);
  assert.equal(attacker.zoneVersion, version, 'copying preserves the battlefield incarnation');
  assert.ok(attacker.owner === f.a && attacker.ctrl === f.a, 'copying preserves ownership and control');
  const creature = modelName === 'Giant Spider';
  assert.deepEqual(observed, {creature, attacking: creature, retained: creature});
  assert.equal(f.b.life, creature ? 38 : 40, 'only a copy that remains a creature deals combat damage');
  assert.equal(f.c.life, 40);
  assert.equal(f.d.life, 40);
  stable(f, 'native Mirrorform combat copy');
});
