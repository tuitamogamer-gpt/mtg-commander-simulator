import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M = loadEngine();
function fixture() {
  const game = new M.Game({seed: 10102026, paced: false}); game.speedFactor = 0;
  const seenSpells = [];
  const decide = async (g, q) => {
    if (q.type === 'priority') {
      for (const so of g.stack) if (so.kind === 'spell' && so.card.zone === 'stack')
        seenSpells.push({card: so.card, isNinja: so.card.hasSub('Ninja')});
      return {kind: 'pass'};
    }
    if (q.type === 'chooseOption') return q.options.some(o => o.key === 'Ninja') ? 'Ninja' : q.options[0]?.key;
    if (q.type === 'chooseTargets') return q.candidates.slice(0, q.min || 0);
    if (q.type === 'chooseCards') return q.from.slice(0, q.min || 0);
    if (q.type === 'orderTriggers') return q.triggers;
    return null;
  };
  const me = game.addPlayer('Changeling payer', {}, {decide}, false), rival = game.addPlayer('Rival', {}, {decide}, false);
  game.turnPlayer = me; game.turnNo = 9; game.phase = 'main1'; game.step = 'main';
  const put = (name, zone = 'battlefield') => {
    assert.ok(M.DEFS[name], `native definition: ${name}`);
    const card = new M.CardInst(M.DEFS[name], me); card.zone = zone; card.ctrl = me; card.sick = false;
    (zone === 'battlefield' ? game.battlefield : me[zone]).push(card); game.recalc(); return card;
  };
  for (const p of [me, rival]) for (let i = 0; i < 12; i++) {
    const card = new M.CardInst(M.DEFS.Forest, p); card.zone = 'library'; p.library.push(card);
  }
  const settled = async () => {
    let limit = 30;
    while ((game.stack.length || game.pendingTriggers.length) && limit--) {
      await game.flushTriggers(); if (game.stack.length) await game.resolveTop();
    }
    assert.ok(limit > 0); assertGameStateInvariants(game);
  };
  const castPrinted = async name => {
    const card = put(name, 'hand');
    const payment = name === 'Changeling Outcast' ? [put('Swamp')] : [put('Plains'), put('Wastes'), put('Wastes')];
    assert.equal(await game.castSpell(me, card, {from: 'hand'}), true); await settled();
    assert.ok(payment.every(c => c.tapped)); return card;
  };
  return {game, me, put, settled, castPrinted, seenSpells};
}

for (const name of ['Changeling Outcast', 'Mirror Entity']) {
  test(`${name}: printed changeling applies to a paid creature spell and every outside zone`, async () => {
    const f = fixture(), card = f.put(name, 'hand'), grave = f.put(name, 'graveyard'), land = f.put('Unclaimed Territory', 'hand');
    const wasNinjaInHand = card.hasSub('Ninja'), wasNinjaInGrave = grave.hasSub('Ninja');
    assert.equal(await f.game.playLand(f.me, land), true);
    const row = f.game.manaSources(f.me).find(s => s.card === land && s.m.restrict), color = name === 'Changeling Outcast' ? 'B' : 'W';
    assert.ok(row); assert.equal(await f.game.activateManaSource(f.me, row, row.produce[0], null, [color]), true);
    const generic = name === 'Mirror Entity' ? [f.put('Wastes'), f.put('Wastes')] : [];
    const offered = f.game.castableList(f.me).some(e => e.card === card && !e.alt);
    assert.equal(await f.game.castSpell(f.me, card, {from: 'hand'}), true);
    assert.ok(f.seenSpells.some(row => row.card === card && row.isNinja), 'native priority sees the changeling creature spell on the stack');
    await f.settled(); assert.equal(card.zone, 'battlefield'); assert.equal(card.hasSub('Ninja'), true);
    assert.ok(generic.every(c => c.tapped)); assert.equal(offered, true);
    assert.equal(wasNinjaInHand, true); assert.equal(wasNinjaInGrave, true);
  });
  test(`${name}: paid Ixidron removes the printed changeling characteristics face down`, async () => {
    const f = fixture(), card = await f.castPrinted(name), ixidron = f.put('Ixidron', 'hand');
    const payment = [f.put('Island'), f.put('Island'), f.put('Wastes'), f.put('Wastes'), f.put('Wastes')];
    assert.equal(card.hasSub('Ninja'), true);
    assert.equal(await f.game.castSpell(f.me, ixidron, {from: 'hand'}), true); await f.settled();
    assert.ok(payment.every(c => c.tapped)); assert.equal(card.faceDown, true);
    assert.equal(card.is('Creature'), true); assert.equal(card.hasSub('Ninja'), false); assert.equal(card.hasSub('Shapeshifter'), false);
  });
  test(`${name}: paid Dress Down removes printed battlefield changeling while the graveyard card retains it`, async () => {
    const f = fixture(), card = await f.castPrinted(name), grave = f.put(name, 'graveyard'), dress = f.put('Dress Down', 'hand');
    const payment = [f.put('Island'), f.put('Wastes')];
    assert.equal(card.hasSub('Ninja'), true);
    assert.equal(await f.game.castSpell(f.me, dress, {from: 'hand'}), true); await f.settled();
    assert.ok(payment.every(c => c.tapped)); assert.equal(card.cur.abilitiesDisabled, true);
    assert.equal(card.hasSub('Ninja'), false); assert.equal(card.hasSub('Shapeshifter'), true); assert.equal(grave.hasSub('Ninja'), true);
  });
}
