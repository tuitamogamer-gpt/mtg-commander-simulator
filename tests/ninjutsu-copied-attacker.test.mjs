import test from 'node:test';
import assert from 'node:assert/strict';
import {M, table, stable} from './helpers/second-audit-combat-fixtures.mjs';
import {aiIsolationFingerprint} from './helpers/run-ai-adversarial-games.mjs';

// Cast the printed cards and play two actual turns for the attacking player.
// Controllers choose offered actions; copy effects, payments, zone changes,
// combat, priority and Yuriko's trigger use the native engine throughout.
for (const [kind, sourceZone, aiClone, response] of [
  ['Mockingbird copy', 'hand', false], ['ordinary attacker', 'hand', false], ['Mockingbird copy', 'command', false],
  ['Mockingbird copy', 'hand', true], ['ordinary attacker', 'hand', true], ['Mockingbird copy', 'command', true],
  ['Mockingbird copy', 'hand', true, true], ['ordinary attacker', 'hand', true, true], ['Mockingbird copy', 'command', true, true],
]) {
  test(`Yuriko ninjutsu from ${sourceZone} returns a paid ${kind} and deals combat damage${aiClone ? response ? ' after AI response simulation' : ' after AI snapshot resolution' : ''}`, async () => {
    const f = table(10111036);
    f.a.name = 'You';
    f.b.name = 'AI Wolf';
    f.c.name = 'AI Raven';
    const copied = kind === 'Mockingbird copy';
    const attacker = f.put(copied ? 'Mockingbird' : 'Colossal Dreadmaw', 'hand');
    const dragon = f.put('Hellkite Tyrant', 'battlefield', f.b);
    const yuriko = f.put("Yuriko, the Tiger's Shadow", sourceZone);
    yuriko.commander = true;
    yuriko.cmdCasts = 3;
    f.a.commanders.push(yuriko);
    f.lands([...Array(6).fill(copied ? 'Island' : 'Forest'), 'Island', 'Swamp']);
    const opt = response ? f.put('Opt', 'hand', f.b) : null;
    const responseLand = response ? f.lands(['Island'], f.b)[0] : null;
    let activated = false, revealed, entryState, paymentState, simulated = false;
    f.x = () => 5;
    f.cards = (p, q) => {
      if (q.source === attacker && q.prompt === 'Choose a permanent or card to copy as this enters') {
        assert.ok(q.from.includes(dragon), 'six spent mana permits copying Hellkite Tyrant');
        return [dragon];
      }
      if (q.aiHint?.kind === 'ninjutsuReturn') return [attacker];
      return undefined;
    };
    f.main = (p, q) => {
      if (p === f.a && f.a.turnsStarted === 1 && attacker.zone === 'hand') {
        const offered = q.casts.find(row => row.card === attacker);
        assert.ok(offered, 'the original attacker has a native payable casting action');
        return {kind: 'cast', card: attacker, from: offered.from, alt: offered.alt};
      }
      return {kind: 'done'};
    };
    f.attackers = (p, q) => p === f.a && f.a.turnsStarted === 2 && q.eligible.includes(attacker)
      ? [{card: attacker, target: f.c}] : [];
    f.priority = async (p, q) => {
      if (aiClone && activated && !simulated && p === f.b && f.g.stack.some(row => row.srcCard === yuriko && row.name.endsWith('Ninjutsu'))) {
        simulated = true;
        const before = aiIsolationFingerprint(f.g), clock = M.currentOracleTimestamp();
        let clone;
        if (response) {
          assert.ok(q.casts.some(row => row.card === opt), 'an opponent has a legal payable response to the pending ninjutsu');
          // Observers are test-only closures, so expose the native emitter to
          // the production simulation rather than copying the fixture log.
          const observer = f.g.emit;
          f.g.emit = M.Game.prototype.emit;
          let simulation;
          try {
            simulation = await M.simulateAction(f.g, {kind: 'cast', card: opt, from: 'hand'}, {playerId: f.b.idx, seed: 10111037});
          } finally {
            f.g.emit = observer;
          }
          assert.equal(simulation.error, null);
          assert.equal(simulation.applied, true);
          assert.equal(simulation.usedRulesEngine, true);
          clone = simulation.state;
          assert.equal(clone.byIid(opt.iid).zone, 'graveyard', 'the native simulated response pays, draws and resolves');
          assert.equal(opt.zone, 'hand', 'the live response card is preserved');
          assert.equal(responseLand.tapped, false, 'only the simulated mana source is tapped');
        } else {
          clone = M.cloneGameForAISimulation(f.g, 10111037);
          clone.emit = M.Game.prototype.emit;
          for (const player of clone.players) player.controller = {decide: async (game, query) => {
            if (query.type === 'priority') return {kind: 'pass'};
            if (query.type === 'chooseCards') return query.from.slice(0, query.min || 0);
            if (query.type === 'chooseOption') return query.options[0]?.key;
            return null;
          }};
          assert.equal(clone.stack.at(-1).ctx.src, clone.byIid(yuriko.iid));
          await clone.resolveTop();
        }
        const cloneYuriko = clone.byIid(yuriko.iid);
        assert.notEqual(cloneYuriko, yuriko);
        assert.equal(yuriko.zone, sourceZone, 'AI snapshot resolution cannot move the live hand or commander card');
        assert.equal(f.a[sourceZone].includes(yuriko), true, 'live source remains in its actual zone until real resolution');
        assert.equal(aiIsolationFingerprint(f.g), before, 'AI snapshot resolution leaves the entire live game unchanged');
        assert.equal(M.currentOracleTimestamp(), clock, 'AI snapshot does not consume the live effect clock');
        assert.equal(cloneYuriko.zone, 'battlefield');
        assert.equal(clone.battlefield.includes(cloneYuriko), true);
        assert.equal(clone.battlefield.includes(yuriko), false, 'the snapshot only contains cloned cards');
        assert.equal(cloneYuriko.tapped, true);
        assert.equal(cloneYuriko.attacking, clone.players.find(player => player.idx === f.c.idx));
        stable({g: clone}, 'independently resolved ninjutsu AI snapshot');
      }
      if (activated && !entryState && yuriko.zone === 'battlefield') entryState = {
        tapped: yuriko.tapped, attacking: yuriko.attacking,
        inCombat: f.g.combat?.attackers.includes(yuriko), step: f.g.step,
      };
      if (!activated && p === f.a && f.g.step === 'blockers' && f.g.combat?.attackers.includes(attacker)) {
        assert.equal(attacker.name, copied ? 'Hellkite Tyrant' : 'Colossal Dreadmaw');
        assert.equal(attacker.attacking, f.c);
        assert.equal(attacker.wasBlocked, false);
        const offered = q.acts.find(row => row.card === yuriko && row.ninjutsu);
        assert.ok(offered, 'the actual hand or command card offers printed {U}{B} ninjutsu');
        assert.equal(offered.ninjutsuCost, '{U}{B}');
        revealed = f.put('Cultivate', 'library');
        paymentState = f.a.pool.U + f.a.pool.B + f.g.bf().filter(card => card.ctrl === f.a && card.is('Land') && !card.tapped).length;
        activated = true;
        return {kind: 'activate', entry: offered};
      }
      return {kind: 'pass'};
    };

    await f.g.runTurn();
    assert.equal(attacker.zone, 'battlefield');
    assert.equal(attacker.name, copied ? 'Hellkite Tyrant' : 'Colossal Dreadmaw');
    assert.ok(f.casts.some(row => row.card === attacker), 'the printed attacker was actually cast');
    if (copied) {
      assert.equal(attacker.hasSub('Dragon'), true);
      assert.equal(attacker.hasSub('Bird'), true);
      assert.equal(attacker.kw('flying'), true);
      assert.equal(attacker.power, 6);
      assert.equal(attacker.toughness, 5);
    }
    stable(f, 'native attacker cast and optional copying');
    for (let n = 0; n < 4; n++) await f.g.runTurn();

    assert.equal(activated, true);
    assert.equal(simulated, aiClone);
    assert.deepEqual(entryState, {tapped: true, attacking: f.c, inCombat: true, step: 'blockers'},
      'Yuriko enters tapped and attacking the same player before combat damage');
    assert.equal(attacker.zone, 'hand');
    assert.equal(attacker.name, copied ? 'Mockingbird' : 'Colossal Dreadmaw');
    assert.equal(attacker.def, M.DEFS[copied ? 'Mockingbird' : 'Colossal Dreadmaw'], 'a returned copy restores its printed definition');
    assert.equal(attacker.isCopyOf, null);
    assert.equal(f.a.hand.includes(attacker), true);
    assert.equal(yuriko.zone, 'battlefield');
    assert.equal(f.g.battlefield.includes(yuriko), true);
    assert.equal(f.a.hand.includes(yuriko), false);
    assert.equal(f.a.command.includes(yuriko), false);
    assert.equal(yuriko.tapped, true);
    assert.equal(yuriko.cmdCasts, 3, 'ninjutsu is an ability and does not increase commander casting tax');
    assert.equal(paymentState, 8, 'the actual activation starts with eight available lands');
    assert.equal(f.g.bf().filter(card => card.ctrl === f.a && card.is('Land') && card.tapped).length, 2, 'printed ninjutsu pays exactly {U}{B}');
    assert.equal(revealed.zone, 'hand');
    assert.equal(f.a.hand.includes(revealed), true, 'Yuriko resolves her actual reveal-and-draw trigger');
    assert.equal(f.c.life, 36, 'defending player loses one combat damage and three life to Cultivate');
    assert.equal(f.b.life, 37);
    assert.equal(f.d.life, 37);
    assert.equal(f.a.life, 40);
    assert.equal(f.events.filter(row => row.event === 'combatDamageToPlayer' && row.data.card === yuriko).length, 1);
    assert.equal(f.g.stack.length, 0);
    assert.equal(f.g.pendingTriggers.length, 0);
    stable(f, `resolved ${kind} ninjutsu from ${sourceZone}`);
  });
}

test('ordinary hand ninjutsu resolves its cloned source and preserves the live hand card', async () => {
  const f = table(10111038);
  const attacker = f.put('Grizzly Bears');
  const ninja = f.put('Ninja of the Deep Hours', 'hand');
  const drawn = f.a.library.at(-1);
  f.lands(['Island', 'Island']);
  f.g.phase = 'combat';
  f.g.step = 'blockers';
  f.g.combat = {attackers: [attacker], blockersDeclared: true};
  attacker.attacking = f.c;
  f.g.recordCombatDestination(attacker);
  assert.equal(!!ninja.def.c1719CommanderNinjutsu, false, 'ordinary ninjutsu requires its source in the ability controller hand');
  f.cards = (p, q) => q.aiHint?.kind === 'ninjutsuReturn' ? [attacker] : undefined;
  let projected = false;
  f.priority = async (p, q) => {
    if (!projected && p === f.b && f.g.stack.some(row => row.srcCard === ninja && row.name.endsWith('Ninjutsu'))) {
      projected = true;
      const before = aiIsolationFingerprint(f.g);
      const clone = M.cloneGameForAISimulation(f.g, 10111039);
      clone.emit = M.Game.prototype.emit;
      for (const player of clone.players) player.controller = {decide: async () => ({kind: 'pass'})};
      const clonedNinja = clone.byIid(ninja.iid);
      assert.notEqual(clonedNinja, ninja);
      await clone.resolveTop();
      assert.equal(clonedNinja.zone, 'battlefield', 'the cloned hand membership guard permits its own ordinary Ninja');
      assert.equal(clone.battlefield.includes(clonedNinja), true);
      assert.equal(clone.battlefield.includes(ninja), false);
      assert.equal(clonedNinja.tapped, true);
      assert.equal(clonedNinja.attacking, clone.players.find(player => player.idx === f.c.idx));
      assert.equal(ninja.zone, 'hand');
      assert.equal(f.a.hand.includes(ninja), true);
      assert.equal(aiIsolationFingerprint(f.g), before);
      stable({g: clone}, 'ordinary hand ninjutsu AI snapshot');
    }
    return {kind: 'pass'};
  };
  const action = f.g.activatableList(f.a).find(row => row.card === ninja && row.ninjutsu);
  assert.ok(action, 'ordinary printed {1}{U} ninjutsu is payable');
  assert.equal(await f.g.activateAbility(f.a, action), true);
  assert.equal(projected, true);
  assert.equal(attacker.zone, 'hand');
  assert.equal(ninja.zone, 'battlefield');
  assert.equal(ninja.tapped, true);
  assert.equal(ninja.attacking, f.c);
  assert.equal(f.g.combat.attackers.includes(ninja), true);
  assert.equal(f.a.hand.includes(ninja), false);
  await f.g.combatDamage(f.a, 'normal');
  await f.g.flushTriggers();
  await f.g.priorityRound(f.a);
  assert.equal(f.c.life, 38);
  assert.equal(drawn.zone, 'hand', 'the actual Ninja combat-damage draw trigger still resolves');
  assert.equal(f.g.stack.length, 0);
  assert.equal(f.g.pendingTriggers.length, 0);
  stable(f, 'ordinary hand ninjutsu after AI snapshot and actual combat damage');
});
