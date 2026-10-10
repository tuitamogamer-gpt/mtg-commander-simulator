import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M = loadEngine();
function fixture(seed = 10102026) {
  const game = new M.Game({seed, paced: false}); game.speedFactor = 0;
  const f = {game, pick: null};
  const decide = async (g, q) => {
    const chosen = f.pick?.(g, q); if (chosen !== undefined) return chosen;
    if (q.type === 'priority') return {kind: 'pass'};
    if (q.type === 'main') return {kind: 'done'};
    if (['attackers', 'blockers', 'combatReview'].includes(q.type)) return [];
    if (q.type === 'chooseOption') return q.options[0]?.key;
    if (q.type === 'chooseCards') return q.from.slice(0, q.min || 0);
    if (q.type === 'chooseTargets') return q.candidates.slice(0, q.min || 0);
    if (q.type === 'orderTriggers') return q.triggers;
    if (q.type === 'scry') return {top: q.cards, bottom: []};
    if (q.type === 'chooseX') return q.min || 0;
    return null;
  };
  f.me = game.addPlayer('Native caster', {name: 'Interface proof'}, {decide}, false);
  f.rival = game.addPlayer('Native opponent', {name: 'Interface proof'}, {decide}, false);
  game.turnPlayer = f.me; game.turnIdx = 0; game.turnNo = 9; game.phase = 'main1'; game.step = 'main';
  f.put = (name, zone = 'battlefield', owner = f.me) => {
    assert.ok(M.DEFS[name], name); const card = new M.CardInst(M.DEFS[name], owner);
    card.zone = zone; card.sick = false;
    (zone === 'battlefield' ? game.battlefield : owner[zone]).push(card); game.recalc(); return card;
  };
  for (const p of [f.me, f.rival]) for (let i = 0; i < 16; i++) f.put('Island', 'library', p);
  f.settle = async () => {
    let limit = 40;
    while ((game.stack.length || game.pendingTriggers.length) && limit--) {
      await game.flushTriggers(); if (game.stack.length) await game.resolveTop();
    }
    assert.ok(limit > 0); assertGameStateInvariants(game);
  };
  return f;
}

test('Certification interface: paid Lightning Storm offers its real stack ability to an opponent with a land', async () => {
  const f = fixture(), storm = f.put('Lightning Storm', 'hand');
  const payment = [f.put('Mountain'), f.put('Mountain'), f.put('Wastes')];
  const land = f.put('Forest', 'hand', f.rival); let activated = false;
  assert.equal(f.game.activatableList(f.rival).some(e => e.v88PriorityAction?.kind === 'lightning'), false);
  f.pick = (g, q) => {
    if (q.type === 'priority' && q.player === f.rival && !activated) {
      const entry = g.activatableList(f.rival).find(e => e.v88PriorityAction?.kind === 'lightning');
      if (entry) {
        assert.equal(g.activatableList(f.me).some(e => e.v88PriorityAction?.kind === 'lightning'), false,
          'the actual stack ability is absent for a player without a land to discard');
        activated = true; return {kind: 'activate', entry};
      }
    }
    if (q.type === 'chooseCards' && q.from.includes(land)) return [land];
    if (q.type === 'chooseOption' && /new target for Lightning Storm/.test(q.prompt || '')) return 'no';
    if (q.type === 'chooseTargets' && q.candidates.includes(f.rival)) return [f.rival];
  };
  assert.equal(await f.game.castSpell(f.me, storm, {from: 'hand'}), true); await f.settle();
  assert.equal(activated, true); assert.equal(land.zone, 'graveyard');
  assert.equal(f.rival.life, 35); assert.equal(storm.zone, 'graveyard');
  assert.ok(payment.every(c => c.tapped));
  assert.equal(f.game.activatableList(f.rival).some(e => e.v88PriorityAction?.kind === 'lightning'), false);
});

test("Certification interface: native Urza's Saga chapters grant offered mana and a paid Construct activation", async () => {
  const f = fixture(), saga = f.put("Urza's Saga", 'hand'), ring = f.put('Sol Ring', 'hand');
  assert.equal(await f.game.playLand(f.me, saga), true); await f.settle();
  assert.equal(saga.counters.lore, 1);
  const mana = f.game.manaSources(f.me).find(e => e.card === saga);
  assert.ok(mana); assert.equal(await f.game.activateManaSource(f.me, mana, mana.produce[0]), true);
  assert.equal(f.me.pool.C, 1);
  assert.equal(await f.game.castSpell(f.me, ring, {from: 'hand'}), true); await f.settle();
  assert.equal(f.me.pool.C, 0); assert.equal(ring.zone, 'battlefield');
  await f.game.runTurn(); await f.settle();
  assert.equal(saga.counters.lore, 2);
  const entry = f.game.activatableList(f.me).find(e => e.card === saga && e.ability?.cost?.mana === '{2}');
  assert.ok(entry); assert.equal(await f.game.activateAbility(f.me, entry), true); await f.settle();
  const token = f.game.creatures(f.me).find(c => c.isToken && c.hasSub('Construct'));
  assert.ok(token); assert.equal(token.power, 2); assert.equal(token.toughness, 2);
  assert.equal(saga.tapped, true); assert.equal(ring.tapped, true);
});

test('Certification interface: paid Command Performance earns and spends tickets on an actual activated sticker', async t => {
  const sheet = 'Carnival Elephant Meteor';
  const sheets = [sheet, ...Array.from(M.OracleV87.sheets.keys()).filter(n => n !== sheet).slice(0, 9)];
  let f;
  for (let seed = 1; seed <= 32; seed++) {
    const candidate = fixture(seed); candidate.game.initializeAuxiliaryV87(candidate.me, {stickers: sheets});
    if (candidate.me.availableStickerSheetsV87.includes(sheet)) {f = candidate; t.diagnostic(`native auxiliary selection seed ${seed}`); break;}
  }
  assert.ok(f); assert.equal(sheets.length, 10);
  const bear = f.put('Grizzly Bears', 'hand'); const bearPayment = [f.put('Forest'), f.put('Wastes')];
  assert.equal(await f.game.castSpell(f.me, bear, {from: 'hand'}), true); await f.settle();
  assert.ok(bearPayment.every(c => c.tapped));
  const spell = f.put('Command Performance', 'hand'), payment = [f.put('Island'), f.put('Wastes')];
  let chosenModes = 0;
  f.pick = (_g, q) => {
    if (q.type === 'chooseOption' && q.options.some(o => o.key === '2' && /tickets/i.test(o.label))) {chosenModes++; return '2';}
    if (q.type === 'chooseOption' && q.options.some(o => o.key === '3' && /sticker/i.test(o.label))) {chosenModes++; return '3';}
    if (q.type === 'chooseCards' && q.from.includes(bear)) return [bear];
    if (q.type === 'chooseOption' && q.options.some(o => o.key === sheet + ':6')) return sheet + ':6';
  };
  assert.equal(f.me.counters.ticket || 0, 0);
  assert.equal(await f.game.castSpell(f.me, spell, {from: 'hand'}), true); await f.settle();
  assert.equal(chosenModes, 2); assert.ok(payment.every(c => c.tapped));
  assert.equal(f.me.counters.ticket, 0); assert.equal(bear.meta.stickersV87.length, 1);
  assert.equal(bear.meta.stickersV87[0].sheet, sheet); assert.equal(bear.meta.stickersV87[0].index, 6);
  const entry = f.game.activatableList(f.me).find(e => e.card === bear && e.ability?.cost?.sacSelf);
  assert.ok(entry); const hand = f.me.hand.length, library = f.me.library.length;
  assert.equal(await f.game.activateAbility(f.me, entry), true); await f.settle();
  assert.equal(bear.zone, 'graveyard'); assert.equal(f.me.hand.length, hand + 2); assert.equal(f.me.library.length, library - 2);
});
