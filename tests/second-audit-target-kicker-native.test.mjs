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


test('actual paid ordinary and three-times kicked spells count each paid kicker once for Saproling Infestation', async () => {
  const f = table(), infestation = f.put('Saproling Infestation', 'hand'), enchantmentMana = f.lands(['Forest', 'Forest']);
  await cast(f, infestation); assert.ok(enchantmentMana.every(c => c.tapped));
  const target = f.put('Colossus of Akros', 'battlefield', f.b);
  f.targets = (p, q) => q.candidates.includes(target) ? [target] : undefined;
  let kicking = false;
  f.option = (p, q) => q.aiHint?.kind === 'kicker' ? (kicking ? 'yes' : 'no') : undefined;
  const ordinary = f.put('Burst Lightning', 'hand'), red = f.lands(['Mountain'])[0];
  await cast(f, ordinary); assert.equal(red.tapped, true); assert.equal(ordinary.castMeta.kicked, false);
  assert.equal(f.g.creatures(f.a).filter(c => c.isToken && c.hasSub('Saproling')).length, 0);
  kicking = true;
  const kicked = f.put('Burst Lightning', 'hand'), kickerMana = f.lands(['Mountain', 'Forest', 'Forest', 'Forest', 'Forest']);
  await cast(f, kicked); assert.ok(kickerMana.every(c => c.tapped)); assert.equal(kicked.castMeta.kicked, true);
  assert.equal(f.g.creatures(f.a).filter(c => c.isToken && c.hasSub('Saproling')).length, 1);
  const chalice = f.put('Everflowing Chalice', 'hand'), repeatedMana = f.lands(['Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest']);
  f.x = (p, q) => q.aiHint?.kind === 'squad' ? 3 : undefined;
  await cast(f, chalice); assert.ok(repeatedMana.every(c => c.tapped)); assert.equal(chalice.counters.charge, 3);
  assert.equal(f.g.creatures(f.a).filter(c => c.isToken && c.hasSub('Saproling')).length, 4);
  assertGameStateInvariants(f.g, 'actual multikicker payments'); assertRecalculationStable(f.g, 'actual multikicker payments');
});
