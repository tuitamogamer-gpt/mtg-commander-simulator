import test from 'node:test';
import assert from 'node:assert/strict';
import {M, table, paidCast, paidAbility, stable} from './helpers/second-audit-combat-fixtures.mjs';

for (const departed of [false, true]) test(`native Chandra upkeep emblem deals damage with its planeswalker ${departed ? 'gone' : 'present'}`, async () => {
  const f = table();
  f.lands(Array(6).fill('Mountain'));
  const chandra = await paidCast(f, f.a, f.put('Chandra, Awakened Inferno', 'hand'));
  await paidAbility(f, f.a, chandra, ability => ability.loyalty === 2);
  const emblem = f.b.emblems[0];
  assert.equal(emblem.name, 'Chandra, Awakened Inferno Emblem');
  assert.equal(emblem.source, chandra);
  assert.equal(f.g.bf().includes(emblem), false);
  if (departed) {
    f.lands(Array(3).fill('Swamp'));
    f.targets = (_p, q) => q.candidates.includes(chandra) ? [chandra] : undefined;
    await paidCast(f, f.a, f.put("Hero's Downfall", 'hand'));
    assert.equal(chandra.zone, 'graveyard');
  }
  f.g.turnPlayer = f.b;
  await f.g.runTurn();
  assert.equal(f.b.life, 39);
  assert.equal(f.c.life, 40);
  assert.equal(f.d.life, 40);
  assert.ok(f.events.some(row => row.event === 'damageToPlayer' && row.data.src === emblem && row.data.n === 1));
  stable(f, 'native non-card emblem damage');
});

test('native Chandra cast emblem damages a creature as an independent command-zone source', async () => {
  const f = table();
  f.lands(Array(5).fill('Forest'));
  await paidCast(f, f.a, f.put('Doubling Season', 'hand'));
  f.lands(['Mountain', 'Mountain', 'Wastes', 'Wastes']);
  const chandra = await paidCast(f, f.a, f.put('Chandra, Torch of Defiance', 'hand'));
  assert.equal(chandra.counters.loyalty, 8);
  await paidAbility(f, f.a, chandra, ability => ability.loyalty === -7);
  const emblem = f.a.emblems[0];
  assert.equal(emblem.name, 'Chandra, Torch of Defiance Emblem');
  f.g.turnPlayer = f.b;
  f.lands(Array(6).fill('Forest'), f.b);
  const victim = await paidCast(f, f.b, f.put('Colossal Dreadmaw', 'hand', f.b));
  f.g.turnPlayer = f.a;
  f.lands(['Wastes']);
  f.targets = (_p, q) => q.candidates.includes(victim) ? [victim] : undefined;
  await paidCast(f, f.a, f.put('Sol Ring', 'hand'));
  assert.equal(victim.zone, 'battlefield');
  assert.equal(victim.damage, 5);
  assert.ok(f.events.some(row => row.event === 'dealtDamage' && row.data.src === emblem && row.data.target === victim));
  stable(f, 'native emblem creature damage');
});

for (const mode of ['player', 'planeswalker', 'departed source']) test(`The Fallen retains native damage history for ${mode}`, async () => {
  const f = table();
  let defender = f.b;
  if (mode === 'planeswalker') {
    f.g.turnPlayer = f.b;
    f.lands(Array(3).fill('Island'), f.b);
    defender = await paidCast(f, f.b, f.put('Jace Beleren', 'hand', f.b));
    f.g.turnPlayer = f.a;
  }
  f.lands(Array(5).fill('Swamp'));
  const fallen = await paidCast(f, f.a, f.put('The Fallen', 'hand'));
  f.lands(['Mountain', 'Mountain', 'Wastes']);
  await paidCast(f, f.a, f.put('Hammer of Purphoros', 'hand'));
  const version = fallen.zoneVersion;
  f.attackers = p => p === f.a ? [{card: fallen, target: defender}] : [];
  await f.g.combatPhase(f.a);
  assert.equal(fallen.meta.v94FallenDamage.version, version);
  assert.equal(fallen.meta.v94FallenDamage.rows.length, 1);
  assert.equal(fallen.meta.v94FallenDamage.rows[0].card, defender);
  if (mode === 'planeswalker') assert.equal(defender.counters.loyalty, 1);
  else assert.equal(f.b.life, 38);
  let bounced = false;
  if (mode === 'departed source') {
    const bounce = f.put('Unsummon', 'hand', f.b);
    f.lands(['Island'], f.b);
    f.targets = (_p, q) => q.src === bounce ? [fallen] : undefined;
    f.priority = (p, q) => {
      if (p !== f.b || bounced || !f.g.stack.some(row => row.kind === 'trigger' && row.srcCard === fallen)) return {kind: 'pass'};
      const offer = q.casts.find(row => row.card === bounce);
      assert.ok(offer);
      bounced = true;
      return {kind: 'cast', card: bounce, from: offer.from, alt: offer.alt};
    };
  }
  f.attackers = () => [];
  f.g.turnPlayer = f.a;
  await f.g.runTurn();
  if (mode === 'planeswalker') assert.equal(defender.zone, 'graveyard');
  else assert.equal(f.b.life, 37);
  assert.equal(f.c.life, 40);
  if (mode === 'departed source') {
    assert.equal(bounced, true);
    assert.equal(fallen.zone, 'hand');
    const damage = f.events.findLast(row => row.event === 'damageToPlayer' && row.data.src?.name === 'The Fallen');
    assert.ok(damage.data.src instanceof M.CardInst, 'the departed source view retains card identity');
    assert.equal(damage.data.src.zoneVersion, version);
  }
  stable(f, 'The Fallen card and last-known source history');
});

test('Seraph still remembers a creature it damaged and returns it at the end step', async () => {
  const f = table();
  f.lands(Array(7).fill('Plains'));
  const seraph = await paidCast(f, f.a, f.put('Seraph', 'hand'));
  f.lands(['Mountain', 'Mountain', 'Wastes']);
  await paidCast(f, f.a, f.put('Hammer of Purphoros', 'hand'));
  f.g.turnPlayer = f.b;
  f.lands(Array(3).fill('Island'), f.b);
  const victim = await paidCast(f, f.b, f.put('Wind Drake', 'hand', f.b));
  f.g.turnPlayer = f.a;
  f.attackers = p => p === f.a ? [{card: seraph, target: f.b}] : [];
  f.blockers = p => p === f.b ? [{blocker: victim, attacker: seraph}] : [];
  await f.g.combatPhase(f.a);
  assert.equal(victim.zone, 'graveyard');
  await f.g.runEndStepV90(f.a);
  assert.equal(victim.zone, 'battlefield');
  assert.equal(victim.ctrl, f.a);
  assert.equal(victim.owner, f.b);
  stable(f, 'Seraph card-source damage history');
});

test('Wolverine still receives its end-step counter after damaging another creature', async () => {
  const f = table();
  f.lands(['Mountain', 'Forest', 'Wastes']);
  const wolverine = await paidCast(f, f.a, f.put('Wolverine, Best There Is', 'hand'));
  f.lands(['Mountain', 'Mountain', 'Wastes']);
  await paidCast(f, f.a, f.put('Hammer of Purphoros', 'hand'));
  f.g.turnPlayer = f.b;
  const victim = await paidCast(f, f.b, f.put('Memnite', 'hand', f.b));
  f.g.turnPlayer = f.a;
  f.attackers = p => p === f.a ? [{card: wolverine, target: f.b}] : [];
  f.blockers = p => p === f.b ? [{blocker: victim, attacker: wolverine}] : [];
  await f.g.combatPhase(f.a);
  assert.equal(victim.zone, 'graveyard');
  assert.equal(wolverine.zone, 'battlefield');
  assert.equal(wolverine.counters['+1/+1'] || 0, 0);
  assert.ok(f.events.some(row => row.event === 'dealtDamage' && row.data.src === wolverine && row.data.target === victim && row.data.n === 4));
  await f.g.runEndStepV90(f.a);
  assert.equal(wolverine.counters['+1/+1'], 1);
  stable(f, 'Wolverine card-source damage history');
});
