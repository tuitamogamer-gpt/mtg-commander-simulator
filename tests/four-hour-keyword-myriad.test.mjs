import test from 'node:test';
import assert from 'node:assert/strict';
import {M, table, paidCast, stable} from './helpers/second-audit-combat-fixtures.mjs';

test('a native Warchief Giant myriad trigger can be countered before any copies enter', async () => {
  const f = table();
  const giant = f.put('Warchief Giant', 'hand');
  const stifle = f.put('Stifle', 'hand', f.b);
  f.lands(['Mountain', 'Mountain', 'Wastes', 'Wastes', 'Wastes']);
  f.put('Island', 'battlefield', f.b);
  await paidCast(f, f.a, giant);
  let responded = false;
  f.attackers = p => p === f.a ? [{card: giant, target: f.b}] : [];
  f.targets = (p, q) => p === f.b && q.src === stifle ?
    [q.candidates.find(row => row.kind === 'trigger' && row.srcCard === giant && /myriad/i.test(row.name))].filter(Boolean) : undefined;
  f.priority = (p, q) => {
    if (p !== f.b || responded) return {kind: 'pass'};
    const trigger = f.g.stack.find(row => row.kind === 'trigger' && row.srcCard === giant && /myriad/i.test(row.name));
    if (!trigger) return {kind: 'pass'};
    assert.equal(f.events.some(row => row.event === 'etb' && row.data.card.isToken && row.data.card.name === giant.name), false,
      'copies wait until the triggered ability resolves');
    const row = q.casts.find(row => row.card === stifle);
    assert.ok(row);
    responded = true;
    return {kind: 'cast', card: stifle, from: row.from, alt: row.alt};
  };
  await f.g.combatPhase(f.a);
  assert.equal(responded, true, 'myriad must appear as a real counterable attack trigger');
  assert.equal(stifle.zone, 'graveyard');
  assert.equal(f.events.filter(row => row.event === 'etb' && row.data.card.isToken && row.data.card.name === giant.name).length, 0);
  assert.equal(f.b.life, 35);
  assert.equal(f.c.life, 40);
  assert.equal(f.d.life, 40);
  stable(f, 'native countered keyword myriad');
});

test('Wulfgar doubles the native keyword myriad trigger before token creation', async () => {
  const f = table();
  const giant = f.put('Warchief Giant', 'hand');
  f.lands(['Mountain', 'Mountain', ...Array(3).fill('Wastes')]);
  await paidCast(f, f.a, giant);
  const wulfgar = f.put('Wulfgar of Icewind Dale', 'hand');
  f.lands(['Mountain', 'Forest', ...Array(3).fill('Wastes')]);
  await paidCast(f, f.a, wulfgar);
  let triggers = 0;
  f.attackers = p => p === f.a ? [{card: giant, target: f.b}] : [];
  f.priority = () => {
    triggers = Math.max(triggers, f.g.stack.filter(row => row.kind === 'trigger' && row.srcCard === giant && /myriad/i.test(row.name)).length);
    return {kind: 'pass'};
  };
  await f.g.combatPhase(f.a);
  assert.equal(triggers, 2);
  assert.equal(f.events.filter(row => row.event === 'etb' && row.data.card.isToken && row.data.card.name === giant.name).length, 4);
  assert.equal(f.b.life, 35);
  assert.equal(f.c.life, 30);
  assert.equal(f.d.life, 30);
  stable(f, 'keyword attack triggers use the native multiplier rules');
});

test('generic myriad copies the departed Clone incarnation after a paid bounce', async () => {
  const f = table();
  const giant = f.put('Warchief Giant', 'hand', f.b);
  f.lands(['Mountain', 'Mountain', ...Array(3).fill('Wastes')], f.b);
  f.g.turnPlayer = f.b;
  await paidCast(f, f.b, giant);
  const clone = f.put('Clone', 'hand');
  f.lands(Array(4).fill('Island'));
  f.cards = (_p, q) => q.from.includes(giant) ? [giant] : undefined;
  f.g.turnPlayer = f.a;
  await paidCast(f, f.a, clone);
  assert.equal(clone.name, 'Warchief Giant');
  const version = clone.zoneVersion;
  const bounce = f.put('Into the Roil', 'hand', f.c);
  f.lands(['Island', 'Island'], f.c);
  let responded = false;
  const copies = [];
  const emit = f.g.emit.bind(f.g);
  f.g.emit = async (event, data, ...args) => {
    if (event === 'etb' && data.card.isToken) copies.push(data.card.name);
    return emit(event, data, ...args);
  };
  f.attackers = p => p === f.a ? [{card: clone, target: f.b}] : [];
  f.targets = (_p, q) => q.src === bounce ? [clone] : undefined;
  f.priority = (p, q) => {
    if (p !== f.c || responded || !f.g.stack.some(row => row.kind === 'trigger' && row.srcCard === clone)) return {kind: 'pass'};
    const row = q.casts.find(row => row.card === bounce);
    assert.ok(row);
    responded = true;
    return {kind: 'cast', card: bounce, from: row.from, alt: row.alt};
  };
  await f.g.combatPhase(f.a);
  assert.equal(responded, true);
  assert.equal(clone.zone, 'hand');
  assert.equal(clone.name, 'Clone');
  assert.equal(clone.battlefieldLKI.get(version).def.name, 'Warchief Giant');
  assert.deepEqual(copies, ['Warchief Giant', 'Warchief Giant']);
  stable(f, 'keyword myriad retains its departed source incarnation');
});

test('myriad copies for different opponents enter simultaneously', async () => {
  const f = table();
  const champion = f.put('Champion of Lambholt', 'hand');
  f.lands(['Forest', 'Forest', 'Wastes']);
  await paidCast(f, f.a, champion);
  const hammer = f.put('Hammer of Purphoros', 'hand');
  f.lands(['Mountain', 'Mountain', 'Wastes']);
  await paidCast(f, f.a, hammer);
  const blade = f.put('Blade of Selves', 'hand');
  f.lands(Array(6).fill('Wastes'));
  await paidCast(f, f.a, blade);
  f.targets = (_p, q) => q.candidates.includes(champion) ? [champion] : undefined;
  const equip = f.g.activatableList(f.a).find(row => row.card === blade && row.equip !== undefined);
  assert.ok(equip);
  assert.equal(await f.g.activateAbility(f.a, equip), true);
  f.attackers = p => p === f.a ? [{card: champion, target: f.b}] : [];
  let counters;
  f.priority = () => {
    if (f.g.step === 'blockers') counters = Array.from(f.g.bf()
      .filter(card => card.isToken && card.name === champion.name),
    card => card.counters['+1/+1'] || 0);
    return {kind: 'pass'};
  };
  await f.g.combatPhase(f.a);
  assert.deepEqual(counters, [1, 1], 'each Champion sees the other token enter');
  stable(f, 'myriad simultaneous co-entrants');
});

for (const mode of ['Blade of Selves', 'Blade and Legion Loyalty', 'ability loss and restoration']) test(`native myriad instances survive ${mode}`, async () => {
  const f = table();
  const giant = f.put('Warchief Giant', 'hand');
  f.lands(['Mountain', 'Mountain', ...Array(3).fill('Wastes')]);
  await paidCast(f, f.a, giant);
  const blade = f.put('Blade of Selves', 'hand');
  f.lands(Array(6).fill('Wastes'));
  await paidCast(f, f.a, blade);
  f.targets = (p, q) => q.candidates.includes(giant) ? [giant] : undefined;
  const equip = f.g.activatableList(f.a).find(row => row.card === blade && row.equip !== undefined);
  assert.ok(equip);
  assert.equal(await f.g.activateAbility(f.a, equip), true);
  assert.equal(blade.attachedTo, giant.iid);
  if (mode === 'Blade and Legion Loyalty') {
    f.lands(['Plains', 'Plains', ...Array(6).fill('Wastes')]);
    await paidCast(f, f.a, f.put('Legion Loyalty', 'hand'));
  }
  if (mode === 'ability loss and restoration') {
    f.lands(['Island', 'Wastes']);
    const dress = await paidCast(f, f.a, f.put('Dress Down', 'hand'));
    assert.equal(giant.kw('myriad'), false);
    assert.equal(giant.cur.kw.myriadInstances, 0, 'losing all abilities clears every instance');
    f.lands(['Forest', 'Wastes']);
    f.targets = (p, q) => q.candidates.includes(dress) ? [dress] : undefined;
    await paidCast(f, f.a, f.put('Naturalize', 'hand'));
    assert.equal(giant.kw('myriad'), true);
  }
  const instances = mode === 'Blade and Legion Loyalty' ? 3 : 2;
  assert.equal(giant.cur.kw.myriadInstances, instances);
  f.g.recalc();
  assert.equal(giant.cur.kw.myriadInstances, instances, 'recalculation does not accumulate instances');
  const clone = M.cloneGameForAISimulation(f.g, 41823);
  assert.equal(clone.byIid(giant.iid).cur.kw.myriadInstances, instances);
  const snapshot = M.captureGameState(f.g);
  assert.ok(snapshot, M.gameStateSnapshotBlockers(f.g).join(', '));
  const resumed = table();
  M.restoreGameState(resumed.g, JSON.parse(JSON.stringify(snapshot)));
  assert.equal(resumed.g.bf().find(card => card.name === giant.name).cur.kw.myriadInstances, instances);
  const tokenInstances = [];
  const emit = f.g.emit.bind(f.g);
  f.g.emit = async (event, data, ...args) => {
    if (event === 'etb' && data.card.isToken && data.card.name === giant.name) tokenInstances.push(data.card.cur.kw.myriadInstances);
    return emit(event, data, ...args);
  };
  let triggers = 0;
  f.attackers = p => p === f.a ? [{card: giant, target: f.b}] : [];
  f.priority = () => {
    triggers = Math.max(triggers, f.g.stack.filter(row => row.kind === 'trigger' && row.srcCard === giant && /myriad/i.test(row.name)).length);
    return {kind: 'pass'};
  };
  await f.g.combatPhase(f.a);
  assert.equal(triggers, instances);
  assert.equal(tokenInstances.length, instances * 2);
  assert.ok(tokenInstances.every(count => count === (mode === 'Blade and Legion Loyalty' ? 2 : 1)),
    'copies retain printed myriad and receive active global grants, without copying Equipment grants');
  stable(f, 'every instance of myriad triggers separately');
});
