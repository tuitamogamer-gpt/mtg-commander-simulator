import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';
import { put } from './helpers/oracle-v8-fixtures.mjs';
import { assertGameStateInvariants } from './helpers/game-state-invariants.mjs';

const M = loadEngine();

function position() {
  const controller = { decide: async (game, q) => {
    if (q.type === 'priority') return { kind: 'pass' };
    if (q.type === 'chooseTargets') return q.candidates.slice(0, q.min || 0);
    if (q.type === 'chooseCards') return q.from.slice(0, q.min || 0);
    if (q.type === 'chooseOption') return q.options.find(option => option.key === 'yes')?.key || q.options[0]?.key;
    if (q.type === 'orderTriggers') return q.triggers;
    return null;
  } };
  const game = new M.Game({ seed: 91, paced: false });
  const a = game.addPlayer('A', { name: 'A' }, controller, false);
  const b = game.addPlayer('B', { name: 'B' }, controller, false);
  game.turnPlayer = a;
  game.turnNo = 4;
  game.phase = 'main1';
  game.step = 'main';
  return { game, a, b };
}

function activationCondition(card) {
  const ability = card.def.abilities.find(ability => ability.oracleOperation?.activationCondition);
  assert.ok(ability, `${card.name}: actual compiled activation condition`);
  return { ability, node: ability.oracleOperation.activationCondition };
}

test('live version-prefix conditions have registered handlers, including false results', () => {
  const rows = [];
  for (const [name, def] of Object.entries(M.DEFS)) {
    const seen = new Set();
    function visit(value) {
      if (!value || typeof value !== 'object' || seen.has(value)) return;
      seen.add(value);
      for (const [key, child] of Object.entries(value)) {
        if (/condition/i.test(key) && /^v(?:[2-9]\d)-/.test(child?.kind || '')) rows.push({ name, node: child });
        visit(child);
      }
    }
    visit(def);
  }
  assert.deepEqual([...new Set(rows.map(row => row.node.kind))].sort(), [
    'v91-attacked', 'v91-blockers', 'v91-combat',
  ], 'bounded census of the live compiled catalog');
  for (const row of rows) {
    const { game, a } = position();
    const source = put(M, game, a, row.name);
    const handlerResults = M.OracleV20.handlers.map(handler => handler.condition?.(game, source, row.node, a, undefined, M.OracleV20.helpers))
      .filter(result => result !== undefined);
    assert.equal(handlerResults.length, 1, `${row.name}: exactly one registered handler recognizes the condition`);
    assert.equal(handlerResults[0], false, `${row.name}: the ordinary main-phase position is illegal`);
    assert.equal(M.OracleV20.helpers.genericCondition(game, source, row.node, a), false,
      `${row.name}: recognized false must not become an unknown-condition exception`);
  }
});

test('Najeela condition is available during either player\'s combat and illegal in every noncombat phase', () => {
  const { game, a, b } = position();
  const source = put(M, game, a, 'Najeela, the Blade-Blossom');
  const { ability } = activationCondition(source);
  for (const turnPlayer of [a, b]) {
    game.turnPlayer = turnPlayer;
    for (const phase of ['beginning', 'upkeep', 'draw', 'main1', 'main2', 'end', 'cleanup']) {
      game.phase = phase;
      assert.equal(ability.cond(game, source, a), false, `${turnPlayer.name}: ${phase}`);
    }
    game.phase = 'combat';
    for (const step of ['begin', 'attackers', 'blockers', 'firstStrike', 'damage', 'endCombat']) {
      game.step = step;
      assert.equal(ability.cond(game, source, a), true, `${turnPlayer.name}: combat ${step}`);
    }
  }
  assertGameStateInvariants(game, 'Najeela condition');
});

test('Zemo activation appears only after its own native attack event and expires on the next turn', async () => {
  const { game, a, b } = position();
  const source = put(M, game, a, 'Baron Helmut Zemo');
  const other = put(M, game, a, 'Grizzly Bears');
  for (const name of ['Lich', 'Phyrexian Obliterator', 'Necropotence', "Geralf's Messenger", 'Dark Ritual']) put(M, game, a, name, 'graveyard');
  const offered = () => game.activatableList(a).some(entry => entry.card === source);
  assert.equal(offered(), false);
  game.phase = 'combat';
  game.step = 'attackers';
  await game.emit('attacks', { card: other, player: a, target: b });
  assert.equal(offered(), false, 'another attacker cannot satisfy Zemo\'s printed condition');
  await game.emit('attacks', { card: source, player: a, target: b });
  assert.equal(offered(), true, 'the normal event records Zemo\'s own attack');
  game.phase = 'main2';
  game.step = 'main';
  assert.equal(offered(), true, 'the printed permission lasts for this turn');
  game.turnNo += 1;
  assert.equal(offered(), false, 'a previous turn\'s attack does not satisfy the condition');
  assertGameStateInvariants(game, 'Zemo attack restriction');
});

test('Jarkeld executes the blocked-attacker exchange only during the blockers priority window', async () => {
  const { game, a, b } = position();
  const source = put(M, game, a, 'General Jarkeld');
  const attackers = [put(M, game, a, 'Grizzly Bears'), put(M, game, a, 'Centaur Courser')];
  const blockers = [put(M, game, b, 'Grizzly Bears'), put(M, game, b, 'Centaur Courser')];
  for (const [index, attacker] of attackers.entries()) {
    attacker.attacking = b;
    attacker.wasBlocked = true;
    attacker.blockedBy = [blockers[index]];
    blockers[index].blocking = attacker.iid;
  }
  game.combat = { attackers, defenders: new Map([[b, attackers]]), declaredAttackTargets: [b], blockersDeclared: true, hadAttackers: true };
  const offered = () => game.activatableList(a).find(entry => entry.card === source);
  for (const [phase, step] of [['main1', 'main'], ['combat', 'begin'], ['combat', 'attackers'], ['combat', 'damage'], ['main2', 'main']]) {
    game.phase = phase;
    game.step = step;
    assert.equal(offered(), undefined, `${phase}/${step}: no illegal exchange action`);
  }
  game.phase = 'combat';
  game.step = 'blockers';
  const entry = offered();
  assert.ok(entry, 'a valid blocked-attacker pair makes the native activation available');
  const resolutions = [];
  const resolveTop = game.resolveTop.bind(game);
  game.resolveTop = async (...args) => {
    const top = game.stack.at(-1);
    if (top?.srcCard === source) resolutions.push(top);
    return resolveTop(...args);
  };
  assert.equal(await game.activateAbility(a, entry, [attackers]), true);
  assert.equal(source.tapped, true, 'pay the printed tap cost');
  assert.equal(resolutions.length, 1, 'the activation resolves through the native stack');
  assert.equal(attackers[0].blockedBy[0], blockers[1]);
  assert.equal(attackers[1].blockedBy[0], blockers[0]);
  assert.equal(blockers[0].blocking, attackers[1].iid, 'each blocker retains the native attacker-id link');
  assert.equal(blockers[1].blocking, attackers[0].iid);
  assert.equal(game.stack.length, 0);
  assertGameStateInvariants(game, 'Jarkeld blocker exchange');
});

test('Jarkeld preserves shared blockers and an untouched multi-block assignment', async () => {
  const { game, a, b } = position();
  const source = put(M, game, a, 'General Jarkeld');
  const attackers = ['Grizzly Bears', 'Centaur Courser', 'Hill Giant'].map(name => put(M, game, a, name));
  const first = put(M, game, b, 'Grizzly Bears');
  const second = put(M, game, b, 'Centaur Courser');
  const shared = put(M, game, b, 'Palace Guard');
  const multiple = put(M, game, b, 'Palace Guard');
  assert.equal(game.blockerCapacity(shared), Infinity, 'use the real card\'s unlimited blocking ability');
  assert.equal(game.blockerCapacity(multiple), Infinity);
  attackers[0].blockedBy = [first, shared, multiple];
  attackers[1].blockedBy = [second, shared];
  attackers[2].blockedBy = [multiple];
  for (const attacker of attackers) { attacker.attacking = b; attacker.wasBlocked = true; }
  first.blocking = shared.blocking = multiple.blocking = attackers[0].iid;
  second.blocking = attackers[1].iid;
  game.combat = { attackers, defenders: new Map([[b, attackers]]), declaredAttackTargets: [b], blockersDeclared: true, hadAttackers: true };
  game.phase = 'combat';
  game.step = 'blockers';
  const entry = game.activatableList(a).find(entry => entry.card === source);
  assert.ok(entry);
  assert.equal(await game.activateAbility(a, entry, [attackers.slice(0, 2)]), true);
  assert.equal(source.tapped, true);
  assert.equal(attackers[0].blockedBy.includes(second), true);
  assert.equal(attackers[0].blockedBy.includes(first), false);
  assert.equal(attackers[1].blockedBy.includes(first), true);
  assert.equal(attackers[1].blockedBy.includes(second), false);
  assert.equal(attackers[0].blockedBy.includes(shared), true, 'a blocker shared by both targets remains assigned to both');
  assert.equal(attackers[1].blockedBy.includes(shared), true);
  assert.equal(attackers[1].blockedBy.includes(multiple), true, 'exchange only the affected assignment');
  assert.equal(attackers[0].blockedBy.includes(multiple), false);
  assert.equal(attackers[2].blockedBy.length, 1, 'leave the third attacker\'s assignment intact');
  assert.equal(attackers[2].blockedBy[0], multiple);
  assert.equal(shared.blocking, attackers[0].iid);
  assert.equal(multiple.blocking, attackers[1].iid);
  for (const blocker of [first, second, shared, multiple]) {
    assert.equal(typeof blocker.blocking, 'number', 'retain the native representative attacker-id link');
    assert.ok(attackers.some(attacker => attacker.iid === blocker.blocking && attacker.blockedBy.includes(blocker)));
  }
  assert.equal(game.stack.length, 0);
  assertGameStateInvariants(game, 'Jarkeld multi-block exchange');
});

test('Jarkeld target search safely rejects fresh unblocked attackers among valid blocked targets', () => {
  const { game, a, b } = position();
  const source = put(M, game, a, 'General Jarkeld');
  const unblocked = put(M, game, a, 'Grizzly Bears');
  const idle = put(M, game, a, 'Ornithopter');
  const blocked = ['Centaur Courser', 'Hill Giant'].map(name => put(M, game, a, name));
  const blockers = ['Grizzly Bears', 'Centaur Courser'].map(name => put(M, game, b, name));
  unblocked.attacking = b;
  assert.equal(unblocked.wasBlocked, undefined, 'a fresh native CardInst has no blocked-history flag yet');
  for (const [index, attacker] of blocked.entries()) {
    attacker.attacking = b;
    attacker.wasBlocked = true;
    attacker.blockedBy = [blockers[index]];
    blockers[index].blocking = attacker.iid;
  }
  game.combat = { attackers: [unblocked, ...blocked], defenders: new Map([[b, [unblocked, ...blocked]]]), declaredAttackTargets: [b], blockersDeclared: true, hadAttackers: true };
  game.phase = 'combat';
  game.step = 'blockers';
  const spec = source.def.abilities[0].targets[0];
  assert.equal(spec.filter(game, unblocked, a, source), false,
    'a recognized predicate must return false for an undefined blocked-history flag');
  assert.equal(spec.filter(game, idle, a, source), false);
  assert.equal(spec.filter(game, blockers[0], a, source), false);
  assert.deepEqual([...game.legalTargets(spec, source, a)], blocked,
    'irrelevant candidates do not interrupt the native target search');
  assert.ok(game.activatableList(a).some(entry => entry.card === source),
    'the valid pair remains available with an unblocked attacker also on the board');
  unblocked.wasBlocked = false;
  assert.equal(spec.filter(game, unblocked, a, source), false, 'an explicit false flag is also illegal');
  blocked[1].wasBlocked = false;
  blocked[1].blockedBy = [];
  blockers[1].blocking = null;
  assert.equal(game.activatableList(a).some(entry => entry.card === source), false,
    'one blocked attacker is insufficient; the fix must not invent a second target');
  assertGameStateInvariants(game, 'Jarkeld mixed target candidates');
});

test('suffix conditions retain their false result and unknown conditions still fail closed', () => {
  const { game, a, b } = position();
  const source = put(M, game, a, 'Eladamri, Korvecdal');
  const condition = source.def.abilities.map(ability => ability.oracleOperation?.activationCondition)
    .find(node => node?.kind === 'your-turn-v85');
  assert.ok(condition, 'native Eladamri activation uses the existing suffix namespace');
  assert.equal(M.OracleV20.helpers.genericCondition(game, source, condition, a), true);
  game.turnPlayer = b;
  assert.equal(M.OracleV20.helpers.genericCondition(game, source, condition, a), false);
  for (const kind of ['v91-unrecognized-audit-condition', 'unrecognized-audit-condition-v91', 'unrecognized-audit-condition']) {
    assert.throws(() => M.OracleV20.helpers.genericCondition(game, source, { kind }, a), /Unknown Oracle static condition:/,
      `${kind}: dispatch must not invent permission for an unrecognized condition`);
  }
});
