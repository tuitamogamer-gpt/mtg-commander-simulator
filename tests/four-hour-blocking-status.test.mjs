import test from 'node:test';
import assert from 'node:assert/strict';
import {table, paidCast, stable} from './helpers/second-audit-combat-fixtures.mjs';

for (const responseName of ['Cloudshift', 'Unsummon']) test(`Ride Down still targets a blocker after paid ${responseName} removes its attacker`, async () => {
  const f = table(), attacker = f.put('Grizzly Bears'), blocker = f.put('Hill Giant', 'battlefield', f.b);
  const response = f.put(responseName, 'hand'), ride = f.put('Ride Down', 'hand');
  const lands = f.lands([responseName === 'Cloudshift' ? 'Plains' : 'Island', 'Plains', 'Mountain']);
  let stage = 0;
  f.attackers = p => p === f.a ? [{card: attacker, target: f.b}] : [];
  f.blockers = p => p === f.b ? [{blocker, attacker}] : [];
  f.priority = (p, q) => {
    if (p !== f.a || f.g.step !== 'blockers') return {kind: 'pass'};
    if (stage === 0 && attacker.blockedBy.includes(blocker)) {
      const row = q.casts.find(row => row.card === response);
      assert.ok(row); stage = 1;
      return {kind: 'cast', card: response, from: row.from, alt: row.alt, quickTargets: [attacker]};
    }
    if (stage === 1 && response.zone === 'graveyard') {
      stage = 2;
      assert.ok(blocker.blocking, 'CR 509.1g: the creature remains blocking after its attacker leaves combat');
      assert.equal(f.g.byIid(blocker.blocking) == null, true, 'blocking status must not identify the attacker’s new object');
      assert.equal(attacker.attacking, null);
      const row = q.casts.find(row => row.card === ride);
      assert.ok(row, 'Ride Down is still a legal paid response');
      return {kind: 'cast', card: ride, from: row.from, alt: row.alt, quickTargets: [blocker]};
    }
    return {kind: 'pass'};
  };
  await f.g.combatPhase(f.a);
  assert.equal(stage, 2);
  assert.equal(blocker.zone, 'graveyard');
  assert.equal(ride.zone, 'graveyard');
  assert.equal(attacker.zone, responseName === 'Cloudshift' ? 'battlefield' : 'hand');
  assert.equal(attacker.kw('trample'), false, 'the attacker’s new object does not inherit Ride Down’s effect');
  assert.ok(lands.every(card => card.tapped), 'both spells pay with actual lands');
  assert.equal(f.b.life, 40);
  stable(f, responseName + ' leaves a legal blocking target');
});

test('a surviving blocker keeps its status through end-combat priority and clears it afterward', async () => {
  const f = table(), attacker = f.put('Grizzly Bears'), blocker = f.put('Hill Giant', 'battlefield', f.b);
  const blink = f.put('Cloudshift', 'hand'); f.lands(['Plains']);
  let cast = false, endSeen = false;
  f.attackers = p => p === f.a ? [{card: attacker, target: f.b}] : [];
  f.blockers = p => p === f.b ? [{blocker, attacker}] : [];
  f.priority = (p, q) => {
    if (p !== f.a) return {kind: 'pass'};
    if (f.g.step === 'blockers' && !cast && attacker.blockedBy.includes(blocker)) {
      const row = q.casts.find(row => row.card === blink); assert.ok(row); cast = true;
      return {kind: 'cast', card: blink, from: row.from, alt: row.alt, quickTargets: [attacker]};
    }
    if (f.g.step === 'endCombat') {
      endSeen = true;
      assert.ok(blocker.blocking);
      assert.equal(f.g.snapshot(blocker).blocking, true);
      assert.equal(f.g.byIid(blocker.blocking) == null, true);
    }
    return {kind: 'pass'};
  };
  await f.g.combatPhase(f.a);
  assert.equal(cast && endSeen, true);
  assert.equal(blocker.blocking, null);
  assert.equal(attacker.damage, 0, 'the blocker cannot damage the blinked attacker’s new object');
  assert.equal(blocker.damage, 0);
  stable(f, 'blocking status ends with combat');
});

test('a blocker that itself blinks loses blocking status and cannot be targeted by Ride Down', async () => {
  const f = table(), attacker = f.put('Grizzly Bears'), blocker = f.put('Hill Giant', 'battlefield', f.b);
  const blink = f.put('Cloudshift', 'hand', f.b), ride = f.put('Ride Down', 'hand');
  f.lands(['Plains'], f.b); f.lands(['Plains', 'Mountain']);
  let cast = false, checked = false;
  f.attackers = p => p === f.a ? [{card: attacker, target: f.b}] : [];
  f.blockers = p => p === f.b ? [{blocker, attacker}] : [];
  f.priority = (p, q) => {
    if (f.g.step !== 'blockers') return {kind: 'pass'};
    if (p === f.b && !cast && attacker.blockedBy.includes(blocker)) {
      const row = q.casts.find(row => row.card === blink); assert.ok(row); cast = true;
      return {kind: 'cast', card: blink, from: row.from, alt: row.alt, quickTargets: [blocker]};
    }
    if (p === f.a && blink.zone === 'graveyard') {
      checked = true; assert.equal(blocker.blocking, null);
      assert.equal(q.casts.some(row => row.card === ride), false);
      assert.equal(attacker.wasBlocked, true);
    }
    return {kind: 'pass'};
  };
  await f.g.combatPhase(f.a);
  assert.equal(cast && checked, true);
  assert.equal(ride.zone, 'hand'); assert.equal(f.b.life, 40);
  stable(f, 'blinked blocker is a new nonblocking object');
});

test('a multi-blocker retains its remaining attacker and deals damage only to that object', async () => {
  const f = table(), first = f.put('Grizzly Bears'), second = f.put('Grizzly Bears');
  const blocker = f.put('Palace Guard', 'battlefield', f.b), blink = f.put('Cloudshift', 'hand');
  f.lands(['Plains']); let cast = false, checked = false;
  f.attackers = p => p === f.a ? [first, second].map(card => ({card, target: f.b})) : [];
  f.blockers = p => p === f.b ? [first, second].map(attacker => ({blocker, attacker})) : [];
  f.priority = (p, q) => {
    if (p !== f.a || f.g.step !== 'blockers') return {kind: 'pass'};
    if (!cast && first.blockedBy.includes(blocker)) {
      assert.ok(second.blockedBy.includes(blocker));
      const row = q.casts.find(row => row.card === blink); assert.ok(row); cast = true;
      return {kind: 'cast', card: blink, from: row.from, alt: row.alt, quickTargets: [first]};
    }
    if (blink.zone === 'graveyard') {
      checked = true;
      assert.equal(blocker.blocking, second.iid);
      assert.equal(f.g.byIid(blocker.blocking), second);
      assert.ok(second.blockedBy.includes(blocker));
    }
    return {kind: 'pass'};
  };
  await f.g.combatPhase(f.a);
  assert.equal(cast && checked, true);
  assert.equal(first.damage, 0); assert.equal(second.damage, 1); assert.equal(blocker.damage, 2);
  assert.equal(blocker.blocking, null); assert.equal(f.b.life, 40);
  stable(f, 'multi-blocker keeps a current combat partner');
});

test('Balduvian Warlord reassigns one blocker without erasing another blocker’s status', async () => {
  const f = table(), first = f.put('Grizzly Bears'), second = f.put('Grizzly Bears');
  const orphan = f.put('Hill Giant', 'battlefield', f.b), moved = f.put('Hill Giant', 'battlefield', f.b);
  const warlord = f.put('Balduvian Warlord'), blink = f.put('Cloudshift', 'hand');
  f.lands(['Plains']); let stage = 0;
  f.attackers = p => p === f.a ? [first, second].map(card => ({card, target: f.b})) : [];
  f.blockers = p => p === f.b ? [{blocker: orphan, attacker: first}, {blocker: moved, attacker: second}] : [];
  f.targets = (p, q) => q.candidates.includes(moved) ? [moved] : q.candidates.slice(0, q.min || 0);
  f.priority = (p, q) => {
    if (p !== f.a || f.g.step !== 'blockers') return {kind: 'pass'};
    if (stage === 0 && first.blockedBy.includes(orphan)) {
      const row = q.casts.find(row => row.card === blink); assert.ok(row); stage = 1;
      return {kind: 'cast', card: blink, from: row.from, alt: row.alt, quickTargets: [first]};
    }
    if (stage === 1 && blink.zone === 'graveyard') {
      assert.equal(orphan.blocking, true);
      const entry = q.acts.find(row => row.card === warlord); assert.ok(entry); stage = 2;
      return {kind: 'activate', entry};
    }
    if (stage === 2 && !f.g.stack.length) {
      stage = 3; assert.equal(warlord.tapped, true);
      assert.equal(orphan.blocking, true, 'reassigning another blocker does not remove this creature from combat');
      assert.equal(moved.blocking, second.iid);
    }
    return {kind: 'pass'};
  };
  await f.g.combatPhase(f.a);
  assert.equal(stage, 3); assert.equal(orphan.blocking, null);
  assert.equal(first.damage, 0); assert.equal(orphan.damage, 0);
  stable(f, 'Warlord preserves unrelated blocking status');
});

for (const alone of [true, false]) test(`Norika offers a paid graveyard enchantment only after attacking ${alone ? 'alone' : 'with another creature'}`, async () => {
  const f = table(), norika = f.put('Norika Yamazaki, the Poet', 'hand');
  const enchantment = f.put('Bloodchief Ascension', 'graveyard'), ally = f.put('Grizzly Bears');
  const lands = f.lands(['Plains', 'Plains', 'Plains', 'Swamp']);
  await paidCast(f, f.a, norika); norika.sick = false;
  f.attackers = p => p === f.a ? [norika, ...alone ? [] : [ally]].map(card => ({card, target: f.b})) : [];
  f.targets = (p, q) => q.candidates.includes(enchantment) ? [enchantment] : q.candidates.slice(0, q.min || 0);
  await f.g.combatPhase(f.a); f.g.phase = 'main2'; f.g.step = 'main';
  const row = f.g.castableList(f.a).find(row => row.card === enchantment);
  assert.equal(!!row, alone);
  if (alone) {
    assert.equal(row.alt.emry, true);
    await paidCast(f, f.a, enchantment);
    assert.equal(enchantment.zone, 'battlefield');
    assert.ok(lands.every(card => card.tapped));
  } else assert.equal(enchantment.zone, 'graveyard');
  stable(f, 'Norika uses the native graveyard cast offer');
});
