import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M = loadEngine();
function fixture() {
  const game = new M.Game({seed: 10102026, paced: false}); game.speedFactor = 0;
  const f = {game, cage: null};
  const decide = async (_g, q) => {
    if (q.type === 'priority') return {kind: 'pass'};
    if (q.type === 'chooseCards') return f.cage && q.from.includes(f.cage) ? [f.cage] : q.from.slice(0, q.min || 0);
    if (q.type === 'chooseTargets') return q.candidates.slice(0, q.min || 0);
    if (q.type === 'chooseOption') return q.options.find(o => o.mana?.R === 1)?.key || q.options.find(o => o.key === 'yes')?.key || q.options[0]?.key;
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
  for (const [name, count] of [['Plains', 3], ['Swamp', 12], ['Island', 4], ['Mountain', 4], ['Wastes', 5]])
    for (let i = 0; i < count; i++) put(name);
  const settle = async () => {
    let remaining = 40;
    while ((game.stack.length || game.pendingTriggers.length) && remaining--) {
      await game.flushTriggers(); if (game.stack.length) await game.resolveTop();
    }
    assert.ok(remaining > 0); assertGameStateInvariants(game);
  };
  const cast = async (card, manaValue) => {
    const spent = me.turnState.manaSpentOnSpells;
    assert.equal(await game.castSpell(me, card, {from: 'hand'}), true, `native paid ${card.name}`); await settle();
    assert.equal(me.turnState.manaSpentOnSpells - spent, manaValue);
  };
  const activate = async card => {
    const entry = game.activatableList(me).find(e => e.card === card && e.manaAbility &&
      e.manaSource.extraCost.mana === '{B}' && e.manaSource.extraCost.life === 1);
    assert.ok(entry, 'the native B/life mana ability is actually offered');
    const life = me.life, swamps = game.lands(me).filter(c => c.hasSub('Swamp')).length, red = me.pool.R || 0;
    assert.equal(entry.manaSource.extraCost.life, 1);
    assert.equal(await game.activateAbility(me, entry), true); await settle();
    assert.equal(me.life, life - 1, 'the printed one-life mana cost is paid once');
    assert.equal(game.lands(me).filter(c => c.hasSub('Swamp')).length, swamps - 1, 'Drought adds exactly one paid Swamp sacrifice');
    assert.equal(me.pool.R, red + 1, 'the chosen native red mana is produced');
  };
  return Object.assign(f, {me, put, cast, activate, settle});
}

for (const previouslyActivated of [false, true])
test(`Mairsil: Drought preserves the printed Blood Celebrant mana cost inherited ${previouslyActivated ? 'after actual donor activation' : 'directly from hand'}`, async () => {
  const f = fixture(), donor = f.put('Blood Celebrant', 'hand');
  if (previouslyActivated) await f.cast(donor, 1);
  const drought = f.put('Drought', 'hand'); await f.cast(drought, 4); assert.equal(drought.zone, 'battlefield');
  if (previouslyActivated) {
    await f.activate(donor);
    const damnation = f.put('Damnation', 'hand'), swamps = f.game.lands(f.me).filter(c => c.hasSub('Swamp')).length;
    await f.cast(damnation, 4); assert.equal(donor.zone, 'graveyard');
    assert.equal(f.game.lands(f.me).filter(c => c.hasSub('Swamp')).length, swamps - 2, 'Drought adds two Swamp sacrifices to the printed BB spell');
  }
  f.cage = donor;
  const borrower = f.put('Mairsil, the Pretender', 'hand'), swamps = f.game.lands(f.me).filter(c => c.hasSub('Swamp')).length;
  await f.cast(borrower, 4); assert.equal(donor.zone, 'exile'); assert.equal(donor.counters.cage, 1);
  assert.equal(f.game.lands(f.me).filter(c => c.hasSub('Swamp')).length, swamps - 1);
  await f.activate(borrower);
  assert.equal(f.game.activatableList(f.me).some(e => e.card === borrower && e.manaAbility &&
    e.manaSource.extraCost.mana === '{B}' && e.manaSource.extraCost.life === 1), false,
  'the inherited native mana ability retains Mairsil’s once-per-turn limit');
});
