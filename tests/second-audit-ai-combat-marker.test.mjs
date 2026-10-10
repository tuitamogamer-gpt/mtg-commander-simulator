import test from 'node:test';
import assert from 'node:assert/strict';
import {M, table, paidCast, stable} from './helpers/second-audit-combat-fixtures.mjs';

for (const overWalker of [true, false]) {
  test(`native AI ${overWalker ? 'blocks lethal Thrasta overflow' : 'preserves its blocker against destinationless ordinary trample'} after paid Jace bounce`, async t => {
    const f = table(101026179);
    const attacker = f.put(overWalker ? "Thrasta, Tempest's Roar" : 'Colossal Dreadmaw', 'hand');
    const processor = f.put('Phyrexian Processor', 'hand', f.b);
    const walker = f.put('Jace Beleren', 'hand', f.b);
    const blocker = f.put('Ornithopter', 'hand', f.b);
    const bounce = f.put('Into the Roil', 'hand', f.b);
    f.lands(Array(24).fill('Forest'));
    f.lands([...Array(16).fill('Island'), ...Array(8).fill('Forest')], f.b);
    f.x = (p, q) => q.card === processor ? 34 : q.min || 0;
    f.g.turnPlayer = f.b;
    await paidCast(f, f.b, processor); assert.equal(f.b.life, 6);
    await paidCast(f, f.b, walker); await paidCast(f, f.b, blocker);
    f.g.turnPlayer = f.a;
    f.main = (p, q) => {
      if (p === f.a && q.phase === 'main1' && attacker.zone === 'hand') {
        const row = q.casts.find(entry => entry.card === attacker); assert.ok(row);
        return {kind: 'cast', card: attacker, from: row.from, alt: row.alt};
      }
      return {kind: 'done'};
    };
    f.attackers = (p, q) => p === f.a && f.a.turnsStarted === 2 && q.eligible.includes(attacker)
      ? [{card: attacker, target: walker}] : [];
    let bounced = false, blockQuestions = 0, assignments = [];
    f.targets = (p, q) => q.src === bounce && q.candidates.includes(walker) ? [walker] : undefined;
    f.priority = (p, q) => {
      if (!bounced && p === f.b && f.g.step === 'attackers' && f.g.combat?.attackers.includes(attacker)) {
        const row = q.casts.find(entry => entry.card === bounce); assert.ok(row);
        bounced = true; return {kind: 'cast', card: bounce, from: row.from, alt: row.alt};
      }
      return {kind: 'pass'};
    };
    const bot = new M.AIController(f.b, {difficulty: 'hard', style: 'balanced'});
    f.blockers = async (p, q) => {
      if (p !== f.b || !q.attackers.includes(attacker)) return [];
      blockQuestions++;
      assert.ok(q.potential.includes(blocker));
      assignments = await bot.decide(f.g, q); return assignments;
    };
    await f.g.runTurn(); for (let turn = 0; turn < 4; turn++) await f.g.runTurn();
    t.diagnostic(JSON.stringify({overWalker, blockQuestions, blocked: assignments.length,
      life: f.b.life, lost: f.b.lost, blockerZone: blocker.zone,
      chosen: (f.g.aiDecisionLog || []).map(row => row.chosen)}));
    assert.equal(bounced, true); assert.equal(walker.zone, 'hand');
    assert.equal(bounce.castMeta.manaSpent, 4, 'the actual controller pays the optional printed kicker');
    assert.equal(blockQuestions, 1);
    assert.equal(f.b.lost, false); assert.equal(f.b.life, overWalker ? 1 : 6);
    assert.equal(assignments.length, overWalker ? 1 : 0);
    if (overWalker) assert.equal(assignments[0].blocker === blocker, true);
    assert.equal(blocker.zone, overWalker ? 'graveyard' : 'battlefield');
    assert.equal((f.g.aiDecisionLog || []).some(row => row.fallback), false);
    stable(f, 'native AI removed destination ' + overWalker);
  });
}
