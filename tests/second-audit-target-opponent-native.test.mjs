import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants, assertRecalculationStable} from './helpers/game-state-invariants.mjs';

const M = loadEngine();

function table(seed = 101026101) {
  const g = new M.Game({seed, paced: false, maxTurns: 12});
  const players = ['Caster', 'First opponent', 'Chosen opponent', 'Fourth'].map(name =>
    g.addPlayer(name, {name: 'Second native targets audit'}, null, false));
  const [a, b, c, d] = players, f = {g, a, b, c, d, players, questions: []};
  for (const p of players) p.controller = {decide: async (game, q) => {
    f.questions.push({p, q});
    if (q.type === 'priority') return f.priority?.(p, q) ?? {kind: 'pass'};
    if (q.type === 'chooseTargets') return f.targets?.(p, q) ?? q.candidates.slice(0, q.min || 0);
    if (q.type === 'chooseCards') return f.cards?.(p, q) ?? q.from.slice(0, q.min || 0);
    if (q.type === 'chooseOption') return f.option?.(p, q) ?? q.options.find(row => row.key === 'yes')?.key ?? q.options[0]?.key;
    if (q.type === 'chooseMulti') return q.options.slice(0, q.min || 0).map(row => row.key);
    if (q.type === 'chooseX') return f.x?.(p, q) ?? q.min ?? 0;
    if (q.type === 'chooseManaSources') return {cards: q.suggested};
    if (q.type === 'orderTriggers') return q.triggers;
    if (q.type === 'scry') return {top: q.cards, bottom: []};
    if (q.type === 'main') return {kind: 'done'};
    if (['cardReveal', 'combatReview'].includes(q.type)) return null;
    if (['attackers', 'blockers'].includes(q.type)) return [];
    throw Error('Unhandled second native targets choice: ' + q.type);
  }};
  g.turnPlayer = a; g.turnNo = 8; g.phase = 'main1'; g.step = 'main'; g.speedFactor = 0;
  f.put = (name, zone = 'battlefield', owner = a) => {
    assert.ok(M.DEFS[name], 'actual registered card: ' + name);
    const card = new M.CardInst(M.DEFS[name], owner);
    card.zone = zone; card.sick = false;
    if (zone === 'battlefield') g.battlefield.push(card); else owner[zone].push(card);
    g.recalc(); return card;
  };
  f.lands = (names, p = a) => names.map(name => f.put(name, 'battlefield', p));
  for (const p of players) for (let i = 0; i < 12; i++) f.put('Forest', 'library', p);
  return f;
}

async function cast(f, card, predicate = () => true, p = f.a) {
  const row = f.g.castableList(p).find(row => row.card === card && predicate(row));
  assert.ok(row, 'actual paid cast offer: ' + card.name);
  assert.equal(await f.g.castSpell(p, card, {from: row.from, alt: row.alt}), true);
  assert.equal(f.g.stack.length, 0); assert.equal(f.g.pendingTriggers.length, 0);
  assertGameStateInvariants(f.g, card.name); assertRecalculationStable(f.g, card.name);
}


test('paid Cosmic Cube seventh native plan counter offers every opponent and schedules the selected third seat', async () => {
  const f = table(), cube = f.put('Construct a Cosmic Cube', 'hand');
  const payment = f.lands(['Swamp', 'Forest', 'Forest']); await cast(f, cube);
  assert.ok(payment.every(card => card.tapped)); assert.equal(cube.counters.plan || 0, 0);
  f.targets = (p, q) => q.spec?.what === 'proliferate' && q.candidates.includes(cube) ? [cube] : undefined;
  for (let i = 0; i < 2; i++) {
    const draw = f.put('Opt', 'hand'), mana = f.lands(['Island'])[0];
    await cast(f, draw); assert.equal(mana.tapped, true);
  }
  assert.equal(cube.counters.plan, 1); assert.equal(f.g.creatures(f.a).filter(card => card.isToken && card.hasSub('Villain')).length, 1);
  let chosen = false;
  f.targets = (p, q) => {
    if (q.spec?.what === 'proliferate' && q.candidates.includes(cube)) return [cube];
    if (q.candidates.includes(f.c)) {
      assert.equal(p.idx, f.a.idx);
      assert.deepEqual(Array.from(q.candidates, player => player.idx), [f.b.idx, f.c.idx, f.d.idx]);
      chosen = true; return [f.c];
    }
    return undefined;
  };
  for (let i = 0; i < 6; i++) {
    const plan = f.put('Contentious Plan', 'hand'), mana = f.lands(['Island', 'Forest']);
    await cast(f, plan); assert.ok(mana.every(card => card.tapped));
    if (i < 5) {assert.equal(cube.zone, 'battlefield'); assert.equal(cube.counters.plan, i + 2); assert.equal(chosen, false);}
  }
  assert.equal(cube.zone, 'graveyard'); assert.equal(chosen, true);
  assert.deepEqual(Array.from(f.g.c1516TurnControls, row => ({subject: row.subject, controller: row.controller})), [{subject: f.c.idx, controller: f.a.idx}]);
  assertGameStateInvariants(f.g, 'paid seventh plan native reflexive targeting'); assertRecalculationStable(f.g, 'paid seventh plan native reflexive targeting');
});


test('paid Dominion Bracelet grants an opponent target to the equipped creature and uses the actual power discount', async () => {
  const f = table(), bear = f.put('Grizzly Bears'), bracelet = f.put('The Dominion Bracelet', 'hand');
  const castMana = f.lands(['Forest', 'Forest']); await cast(f, bracelet); assert.ok(castMana.every(card => card.tapped));
  const equipMana = f.lands(['Forest'])[0];
  f.targets = (p, q) => q.candidates.includes(bear) ? [bear] : undefined;
  const equip = f.g.activatableList(f.a).find(row => row.card === bracelet && row.equip);
  assert.ok(equip); assert.equal(await f.g.activateAbility(f.a, equip), true); assert.equal(equipMana.tapped, true);
  assert.equal(bracelet.attachedTo, bear.iid); assert.equal(bear.power, 3);
  const payment = f.lands(Array.from({length: 11}, () => 'Wastes'));
  assert.equal(f.g.activatableList(f.a).some(row => row.card === bear && row.ability?.oracleBraceletV87), false,
    '15 minus actual power3 requires12 mana');
  payment.push(f.lands(['Wastes'])[0]);
  let chosen = false;
  f.targets = (p, q) => {
    if (!q.candidates.includes(f.c)) return undefined;
    assert.equal(p.idx, f.a.idx);
    assert.deepEqual(Array.from(q.candidates, player => player.idx), [f.b.idx, f.c.idx, f.d.idx]);
    chosen = true; return [f.c];
  };
  const ability = f.g.activatableList(f.a).find(row => row.card === bear && row.ability?.oracleBraceletV87);
  assert.ok(ability); assert.equal(await f.g.activateAbility(f.a, ability), true);
  assert.equal(chosen, true); assert.ok(payment.every(card => card.tapped)); assert.equal(bracelet.zone, 'exile');
  assert.equal(bear.zone, 'battlefield'); assert.equal(bear.power, 2);
  assert.deepEqual(Array.from(f.g.c1516TurnControls, row => ({subject: row.subject, controller: row.controller})), [{subject: f.c.idx, controller: f.a.idx}]);
  assertGameStateInvariants(f.g, 'native equipment-granted opponent target'); assertRecalculationStable(f.g, 'native equipment-granted opponent target');
});
