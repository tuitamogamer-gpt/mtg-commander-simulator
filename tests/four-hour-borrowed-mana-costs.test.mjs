import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M = loadEngine();
function fixture() {
  const game = new M.Game({seed: 10102026, paced: false}); game.speedFactor = 0;
  const f = {game, cage: null, hasteTarget: null};
  const decide = async (_g, q) => {
    if (q.type === 'priority') return {kind: 'pass'};
    if (q.type === 'chooseTargets') return f.hasteTarget && q.candidates.includes(f.hasteTarget) ? [f.hasteTarget] : q.candidates.slice(0, q.min || 0);
    if (q.type === 'chooseCards') return f.cage && q.from.includes(f.cage) ? [f.cage] : q.from.slice(0, q.min || 0);
    if (q.type === 'chooseOption') return q.options.find(o => o.key === 'yes')?.key || q.options[0]?.key;
    if (q.type === 'orderTriggers') return q.triggers;
    return null;
  };
  const me = game.addPlayer('Borrower', {}, {decide}, false), rival = game.addPlayer('Rival', {}, {decide}, false);
  game.turnPlayer = me; game.turnNo = 9; game.phase = 'main1'; game.step = 'main';
  const put = (name, zone = 'battlefield') => {
    assert.ok(M.DEFS[name], `native definition: ${name}`);
    const card = new M.CardInst(M.DEFS[name], me); card.zone = zone; card.ctrl = me; card.sick = false;
    (zone === 'battlefield' ? game.battlefield : me[zone]).push(card); game.recalc(); return card;
  };
  for (const p of [me, rival]) for (let i = 0; i < 16; i++) {
    const card = new M.CardInst(M.DEFS.Forest, p); card.zone = 'library'; p.library.push(card);
  }
  const settled = async () => {
    let limit = 40;
    while ((game.stack.length || game.pendingTriggers.length) && limit--) {
      await game.flushTriggers(); if (game.stack.length) await game.resolveTop();
    }
    assert.ok(limit > 0); assertGameStateInvariants(game);
  };
  const equipHaste = async (greaves, target) => {
    f.hasteTarget = target;
    const equip = game.activatableList(me).find(e => e.card === greaves && e.equip);
    assert.ok(equip); assert.equal(await game.activateAbility(me, equip), true); await settled();
    f.hasteTarget = null;
    assert.equal(greaves.attachedTo, target.iid); assert.equal(target.kw('haste'), true);
  };
  return Object.assign(f, {me, put, settled, equipHaste});
}

for (const previouslyActivated of [false, true])
test(`Mairsil: a paid Chemister draw ability remains usable after caging a donor ${previouslyActivated ? 'previously cast and activated' : 'directly from hand'}`, async () => {
  const f = fixture(), chemister = f.put('Mercurial Chemister', 'hand');
  const greaves = f.put('Lightning Greaves', 'hand'), greavesPayment = [f.put('Wastes'), f.put('Wastes')];
  assert.equal(await f.game.castSpell(f.me, greaves, {from: 'hand'}), true); await f.settled();
  assert.ok(greavesPayment.every(c => c.tapped));
  if (previouslyActivated) {
    const payment = [f.put('Island'), f.put('Mountain'), f.put('Wastes'), f.put('Wastes'), f.put('Wastes')];
    assert.equal(await f.game.castSpell(f.me, chemister, {from: 'hand'}), true); await f.settled();
    assert.ok(payment.every(c => c.tapped)); await f.equipHaste(greaves, chemister);
    const island = f.put('Island'), before = f.me.hand.length;
    const draw = f.game.activatableList(f.me).find(e => e.card === chemister && e.ability?.cost?.mana === '{U}');
    assert.ok(draw, 'native donor ability is offered');
    assert.equal(await f.game.activateAbility(f.me, draw), true); await f.settled();
    assert.equal(island.tapped, true); assert.equal(chemister.tapped, true); assert.equal(f.me.hand.length, before + 2);
    const damnation = f.put('Damnation', 'hand'), killPayment = [f.put('Swamp'), f.put('Swamp'), f.put('Wastes'), f.put('Wastes')];
    assert.equal(await f.game.castSpell(f.me, damnation, {from: 'hand'}), true); await f.settled();
    assert.ok(killPayment.every(c => c.tapped)); assert.equal(chemister.zone, 'graveyard');
  }
  f.cage = chemister;
  const mairsil = f.put('Mairsil, the Pretender', 'hand');
  const payment = [f.put('Island'), f.put('Swamp'), f.put('Mountain'), f.put('Wastes')];
  assert.equal(await f.game.castSpell(f.me, mairsil, {from: 'hand'}), true); await f.settled();
  assert.ok(payment.every(c => c.tapped)); assert.equal(chemister.zone, 'exile'); assert.equal(chemister.counters.cage, 1);
  await f.equipHaste(greaves, mairsil);
  const island = f.put('Island'), before = f.me.hand.length;
  const draw = f.game.activatableList(f.me).find(e => e.card === mairsil && e.ability?.cost?.mana === '{U}');
  assert.ok(draw, 'native inherited ability is offered');
  assert.equal(await f.game.activateAbility(f.me, draw), true); await f.settled();
  assert.equal(island.tapped, true); assert.equal(mairsil.tapped, true); assert.equal(f.me.hand.length, before + 2);
  const reversal = f.put('Dramatic Reversal', 'hand');
  const remainingBlue = [f.put('Island'), f.put('Island'), f.put('Island')]; f.put('Wastes');
  assert.equal(await f.game.castSpell(f.me, reversal, {from: 'hand'}), true); await f.settled();
  assert.equal(mairsil.tapped, false);
  assert.ok(remainingBlue.some(c => !c.tapped));
  assert.equal(f.game.canPayMana(f.me, M.parseCost('{U}'), {card: mairsil, isAbility: true}), true,
    'an untapped native Island funds U independently of the already-used ability eligibility');
  assert.equal(f.game.activatableList(f.me).some(e => e.card === mairsil && e.ability?.label === draw.ability.label), false,
    'the native borrowed ability retains its once-per-turn use limit after a paid untap spell');
});
