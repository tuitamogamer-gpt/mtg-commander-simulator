import assert from 'node:assert/strict';
import test from 'node:test';
import {M, table, paidCast, stable} from './helpers/second-audit-combat-fixtures.mjs';

for (const mode of ['planeswalker', 'bounce planeswalker', 'bounce Scurry', 'counter one myriad', 'Battle protector']) {
  test(`Scurry native myriad: ${mode}`, async t => {
    const f = table(101126300);
    const scurry = f.put('Scurry of Squirrels', 'hand');
    const battle = mode === 'Battle protector';
    const defender = f.put(battle ? 'Invasion of Dominaria // Serra Faithkeeper' : 'Jace Beleren', 'hand', f.b);
    const response = mode.startsWith('bounce') ? f.put('Into the Roil', 'hand', f.b)
      : mode === 'counter one myriad' ? f.put('Stifle', 'hand', f.b) : null;
    f.lands(Array(8).fill('Forest'));
    f.lands(Array(6).fill(battle ? 'Plains' : 'Island'), f.b);
    f.option = (_p, q) => q.prompt?.includes('choose its protector') ? String(f.c.idx) : undefined;
    f.g.turnPlayer = f.b;
    await paidCast(f, f.b, defender);
    f.g.turnPlayer = f.a;
    await paidCast(f, f.a, scurry);
    scurry.sick = false;
    assert.equal(scurry.kw('myriad'), false, 'two printed native triggers supply the two instances');
    assert.equal(defender.zone, 'battlefield');
    assert.ok((defender.counters[battle ? 'defense' : 'loyalty'] || 0) > 0);
    if (battle) assert.equal(defender.protector, f.c);

    let responded = false, offeredMyriad = 0;
    const tokenEntries = [];
    const emit = f.g.emit.bind(f.g);
    f.g.emit = async (event, data, ...args) => {
      if (event === 'etb' && data.card.isToken && data.card.name === 'Scurry of Squirrels') {
        tokenEntries.push({card: data.card, attacking: data.card.attacking});
      }
      return emit(event, data, ...args);
    };
    f.attackers = (p, q) => p === f.a && q.eligible.includes(scurry) ? [{card: scurry, target: defender}] : [];
    f.targets = (_p, q) => {
      if (q.src !== response) return undefined;
      const target = mode === 'bounce Scurry' ? scurry : mode === 'counter one myriad'
        ? q.candidates.find(row => row.kind === 'trigger' && row.srcCard === scurry && /Myriad/.test(row.name)) : defender;
      assert.ok(q.candidates.includes(target), 'real response offers the intended target');
      return [target];
    };
    f.priority = (p, q) => {
      const myriad = f.g.stack.filter(row => row.kind === 'trigger' && row.srcCard === scurry && /Myriad/.test(row.name));
      offeredMyriad = Math.max(offeredMyriad, myriad.length);
      if (response && p === f.b && !responded && myriad.length) {
        const row = q.casts.find(row => row.card === response);
        assert.ok(row, 'actual paid response is available before myriad resolves');
        responded = true;
        return {kind: 'cast', card: response, from: row.from, alt: row.alt};
      }
      return {kind: 'pass'};
    };
    await f.g.combatPhase(f.a);
    t.diagnostic(JSON.stringify({mode, offeredMyriad, copies: tokenEntries.length,
      recipients: tokenEntries.map(row => row.attacking?.name), responded}));
    assert.equal(offeredMyriad, 2, 'two printed myriad abilities are separate counterable triggers');
    assert.equal(responded, !!response);
    const expected = mode === 'counter one myriad' ? 2 : 4;
    assert.equal(tokenEntries.length, expected);
    const excluded = battle ? f.c : f.b;
    const others = f.players.filter(player => player !== f.a && player !== excluded);
    for (const player of others) assert.equal(tokenEntries.filter(row => row.attacking === player).length, expected / 2);
    assert.ok(tokenEntries.every(row => row.card.zone !== 'battlefield'), 'myriad copies leave at end of combat');
    assert.equal(f.events.filter(row => row.event === 'attacks' && row.data.card.isToken).length, 0);
    if (mode === 'bounce Scurry') assert.equal(scurry.zone, 'hand');
    if (mode === 'bounce planeswalker') assert.equal(defender.zone, 'hand');
    stable(f, 'native Scurry myriad: ' + mode);
  });
}

for (const name of ['Scurry of Squirrels', 'Warchief Giant']) {
  test(`${name}: native myriad offers the recipient's planeswalker but not their protected Battle`, async () => {
    const f = table(101126301);
    const source = f.put(name, 'hand');
    const walker = f.put('Jace Beleren', 'hand', f.c);
    const battle = f.put('Invasion of Dominaria // Serra Faithkeeper', 'hand', f.b);
    f.lands(Array(8).fill(name === 'Scurry of Squirrels' ? 'Forest' : 'Mountain'));
    f.lands(Array(6).fill('Island'), f.c);
    f.lands(Array(6).fill('Plains'), f.b);
    f.option = (_p, q) => q.prompt?.includes('choose its protector') ? String(f.c.idx) : undefined;
    f.g.turnPlayer = f.c;
    await paidCast(f, f.c, walker);
    f.g.turnPlayer = f.b;
    await paidCast(f, f.b, battle);
    assert.equal(battle.protector, f.c);
    f.g.turnPlayer = f.a;
    await paidCast(f, f.a, source);
    source.sick = false;

    const tokenEntries = [], offeredDestinations = [];
    const emit = f.g.emit.bind(f.g);
    f.g.emit = async (event, data, ...args) => {
      if (event === 'etb' && data.card.isToken && data.card.name === name) {
        tokenEntries.push(data.card.attacking);
      }
      return emit(event, data, ...args);
    };
    f.attackers = (p, q) => p === f.a && q.eligible.includes(source) ? [{card: source, target: f.b}] : [];
    f.option = (_p, q) => {
      if (q.aiHint?.kind !== 'attackDestination') return undefined;
      offeredDestinations.push(q.options.map(option => option.target));
      assert.equal(q.aiHint.restrictedDefender, f.c);
      assert.deepEqual(Array.from(q.options, option => option.target), [f.c, walker]);
      return q.options.find(option => option.target === walker).key;
    };
    await f.g.combatPhase(f.a);
    const instances = name === 'Scurry of Squirrels' ? 2 : 1;
    assert.equal(offeredDestinations.length, instances);
    assert.equal(tokenEntries.filter(target => target === walker).length, instances);
    assert.equal(tokenEntries.filter(target => target === f.d).length, instances);
    assert.ok(tokenEntries.every(target => target !== battle));
    stable(f, name + ' legal myriad destinations');
  });
}

for (const mode of ['bounce', 'blink']) test(`Scurry myriad copies the departed Clone incarnation after ${mode}`, async t => {
  const f = table(101126302);
  const original = f.put('Scurry of Squirrels', 'hand', f.b);
  const clone = f.put('Clone', 'hand');
  const bear = mode === 'blink' ? f.put('Runeclaw Bear', 'hand', f.b) : null;
  const responder = mode === 'blink' ? f.a : f.c;
  const response = f.put(mode === 'blink' ? 'Cloudshift' : 'Into the Roil', 'hand', responder);
  f.lands(Array(8).fill('Forest'), f.b);
  f.lands(Array(4).fill('Island'));
  if (mode === 'blink') f.lands(['Plains']);
  f.lands(Array(2).fill('Island'), f.c);
  f.g.turnPlayer = f.b;
  await paidCast(f, f.b, original);
  if (bear) await paidCast(f, f.b, bear);
  let responded = false;
  f.cards = (_p, q) => q.from.includes(original) ? [responded ? bear : original] : undefined;
  f.g.turnPlayer = f.a;
  await paidCast(f, f.a, clone);
  assert.equal(clone.name, original.name);
  assert.ok(clone.isCopyOf);
  const version = clone.zoneVersion;
  clone.sick = false;
  if (mode === 'bounce') f.cards = undefined;

  const entries = [];
  const emit = f.g.emit.bind(f.g);
  f.g.emit = async (event, data, ...args) => {
    if (event === 'etb' && data.card.isToken) entries.push({card: data.card, name: data.card.name});
    return emit(event, data, ...args);
  };
  f.attackers = (p, q) => p === f.a && q.eligible.includes(clone) ? [{card: clone, target: f.b}] : [];
  f.targets = (_p, q) => q.src === response ? [clone] : undefined;
  f.priority = (p, q) => {
    if (p === responder && !responded && f.g.stack.some(row => row.kind === 'trigger' && row.srcCard === clone && /Myriad/.test(row.name))) {
      const offer = q.casts.find(row => row.card === response);
      assert.ok(offer);
      responded = true;
      return {kind: 'cast', card: response, from: offer.from, alt: offer.alt};
    }
    return {kind: 'pass'};
  };
  await f.g.combatPhase(f.a);
  t.diagnostic(JSON.stringify({responded, source: clone.name, copies: entries.map(row => row.name)}));
  assert.equal(responded, true);
  assert.equal(clone.zone, mode === 'blink' ? 'battlefield' : 'hand');
  assert.equal(clone.name, mode === 'blink' ? 'Runeclaw Bear' : 'Clone');
  assert.ok(clone.zoneVersion > version);
  assert.equal(clone.battlefieldLKI.get(version).def.name, 'Scurry of Squirrels');
  assert.equal(entries.length, 4);
  assert.ok(entries.every(row => row.name === 'Scurry of Squirrels'));
  stable(f, 'departed Clone myriad');
});
