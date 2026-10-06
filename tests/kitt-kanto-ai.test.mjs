import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {context, put, settle} from './helpers/oracle-v8-fixtures.mjs';

const M = loadEngine();

function fixture(mode = 'hard', opponents = 1) {
  const f = context(M, 'human', opponents);
  f.source = put(M, f.game, f.a, 'Kitt Kanto, Mayhem Diva');
  f.add = (name, power = 1, {player = f.a, sick = false, kws = []} = {}) => {
    const card = new M.CardInst({name, types: ['Creature'], subtypes: ['Citizen'],
      super: [], cost: '{1}', oracle: '', power: String(power),
      toughness: String(Math.max(1, power)), kws}, player);
    card.zone = 'battlefield'; card.ctrl = player; card.sick = sick;
    f.game.battlefield.push(card); f.game.recalc();
    return card;
  };
  f.citizen = f.add('Citizen helper');
  if (mode !== 'human') {
    f.a.isAI = true;
    const bot = new M.AIController(f.a, {difficulty: mode === 'legacy' ? 'hard' : mode,
      style: 'balanced'});
    // AIController has no useV2 switch. Exercise its legacy decisions directly
    // without changing the shared engine's V2 entry point.
    f.a.controller = mode === 'legacy' ? {decide: async (game, q) => {
      if (['chooseOption', 'chooseCards', 'chooseTargets'].includes(q.type)) return bot[q.type](game, q);
      if (q.type === 'orderTriggers') return q.triggers;
      return q.type === 'priority' ? {kind: 'pass'} : [];
    }} : bot;
  }
  f.combat = async (activePlayer = f.a) => {
    f.game.turnPlayer = activePlayer; f.game.phase = 'combat'; f.game.step = 'begin';
    await f.game.emit('beginCombat', {player: activePlayer});
    await settle(f.game);
    assert.equal(f.game.log.some(row => /AI V2 fallback/.test(row.msg)), false);
  };
  return f;
}

for (const mode of ['easy', 'normal', 'hard', 'legacy']) {
  test(`${mode}: Kitt preserves both attackers when they are the only creatures`, async () => {
    const f = fixture(mode);
    await f.combat();
    assert.equal(f.source.tapped, false);
    assert.equal(f.citizen.tapped, false);
    assert.equal(f.source.power, 3);
    assert.equal(f.source.kw('trample'), false);
  });

  test(`${mode}: Kitt declines when both available creatures have summoning sickness`, async () => {
    const f = fixture(mode);
    f.source.sick = true; f.citizen.sick = true;
    await f.combat();
    assert.equal(f.source.tapped, false);
    assert.equal(f.citizen.tapped, false);
    assert.equal(f.game.untilEffects.some(effect => effect.kind === 'goadCard'), false);
  });

  test(`${mode}: Kitt taps sick helpers and buffs the remaining ready attacker`, async () => {
    const f = fixture(mode);
    f.source.sick = true; f.citizen.sick = true;
    const attacker = f.add('Ready attacker', 6);
    await f.combat();
    assert.equal(f.source.tapped, true);
    assert.equal(f.citizen.tapped, true);
    assert.equal(attacker.tapped, false);
    assert.equal(attacker.power, 8);
    assert.equal(attacker.toughness, 8);
    assert.equal(attacker.kw('trample'), true);
    assert.ok(f.game.untilEffects.some(effect => effect.kind === 'goadCard' && effect.iid === attacker.iid));
  });

  test(`${mode}: Kitt keeps creatures untapped when the active player has no target`, async () => {
    const f = fixture(mode, 2);
    await f.combat(f.b);
    assert.equal(f.source.tapped, false);
    assert.equal(f.citizen.tapped, false);
  });

  test(`${mode}: Kitt does not spend blockers to buff the only opponent in a duel`, async () => {
    const f = fixture(mode);
    const enemy = f.add('Enemy attacker', 6, {player: f.b});
    await f.combat(f.b);
    assert.equal(f.source.tapped, false);
    assert.equal(f.citizen.tapped, false);
    assert.equal(enemy.power, 6);
    assert.equal(enemy.kw('trample'), false);
    assert.equal(f.game.untilEffects.some(effect => effect.kind === 'goadCard'), false);
  });

  test(`${mode}: Kitt can goad a multiplayer attacker toward another opponent`, async () => {
    const f = fixture(mode, 2);
    const enemy = f.add('Enemy flyer', 6, {player: f.b, kws: ['flying']});
    await f.combat(f.b);
    assert.equal(f.source.tapped, true);
    assert.equal(f.citizen.tapped, true);
    assert.equal(enemy.power, 8);
    assert.equal(enemy.kw('trample'), true);
    const destinations = f.game.legalDeclarationAttackTargets(enemy);
    assert.equal(destinations.includes(f.a), false);
    assert.equal(destinations.includes(f.others[1]), true);
  });

  test(`${mode}: Kitt preserves useful blockers on an opponent's turn`, async () => {
    const f = fixture(mode, 2);
    const enemy = f.add('Enemy attacker', 2, {player: f.b});
    await f.combat(f.b);
    assert.equal(f.source.tapped, false);
    assert.equal(f.citizen.tapped, false);
    assert.equal(enemy.power, 2);
  });

  test(`${mode}: Kitt declines when hexproof prevents targeting the enemy`, async () => {
    const f = fixture(mode, 2);
    const enemy = f.add('Hexproof flyer', 6, {player: f.b, kws: ['flying', 'hexproof']});
    await f.combat(f.b);
    assert.equal(f.source.tapped, false);
    assert.equal(f.citizen.tapped, false);
    assert.equal(enemy.power, 6);
  });

  test(`${mode}: Kitt does not rely on goad to force an attack tax payment`, async () => {
    const f = fixture(mode, 2);
    put(M, f.game, f.others[1], 'Ghostly Prison');
    const enemy = f.add('Enemy flyer', 6, {player: f.b, kws: ['flying']});
    await f.combat(f.b);
    assert.equal(f.source.tapped, false);
    assert.equal(f.citizen.tapped, false);
    assert.equal(enemy.power, 6);
  });

  test(`${mode}: Kitt does not pay again to goad an already diverted opponent`, async () => {
    const f = fixture(mode, 2);
    const enemy = f.add('Goaded flyer', 6, {player: f.b, kws: ['flying']});
    M.E.goad(f.game, enemy, f.a);
    await f.combat(f.b);
    assert.equal(f.source.tapped, false);
    assert.equal(f.citizen.tapped, false);
    assert.equal(enemy.power, 6);
  });
}

test('human may decline Kitt without tapping either creature', async () => {
  const f = fixture('human');
  f.a.controller = {decide: async (game, q) => q.type === 'chooseOption' ? 'no' : []};
  await f.combat();
  assert.equal(f.source.tapped, false);
  assert.equal(f.citizen.tapped, false);
});

test('human can tap sick creatures and target one of them after the payment', async () => {
  const f = fixture('human');
  f.source.sick = true; f.citizen.sick = true;
  let choseTarget = false;
  f.a.controller = {decide: async (game, q) => {
    if (q.type === 'chooseOption') return 'yes';
    if (q.type === 'chooseCards') return [f.source, f.citizen];
    if (q.type === 'chooseTargets') {
      choseTarget = true;
      assert.ok(f.source.tapped && f.citizen.tapped, 'the reflexive target is chosen after payment');
      assert.ok(q.candidates.includes(f.source), 'a tapped creature remains a legal target');
      return [f.source];
    }
    return [];
  }};
  await f.combat();
  assert.equal(choseTarget, true);
  assert.equal(f.source.power, 5);
  assert.equal(f.source.kw('trample'), true);
  assert.equal(f.source.tapped, true);
});

for (const invalid of ['incomplete', 'duplicate']) {
  test(`human ${invalid} payment cannot grant Kitt's reward`, async () => {
    const f = fixture('human');
    let targetRequests = 0;
    f.a.controller = {decide: async (game, q) => {
      if (q.type === 'chooseOption') return 'yes';
      if (q.type === 'chooseCards') return invalid === 'duplicate' ? [f.source, f.source] : [f.source];
      if (q.type === 'chooseTargets') { targetRequests++; return [f.source]; }
      return [];
    }};
    await f.combat();
    assert.equal(targetRequests, 0);
    assert.equal(f.source.tapped, false);
    assert.equal(f.citizen.tapped, false);
    assert.equal(f.source.power, 3);
    assert.equal(f.source.kw('trample'), false);
  });
}
