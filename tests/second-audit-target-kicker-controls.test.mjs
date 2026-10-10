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


test('actual paid sticker kicker remains a separate payment when a creature is also multikicked twice', async () => {
  const f = table(), infestation = f.put('Saproling Infestation', 'hand'), enchantmentMana = f.lands(['Forest', 'Forest']);
  await cast(f, infestation); assert.ok(enchantmentMana.every(c => c.tapped));
  const picker = f.put('Wicker Picker', 'hand'), pickerMana = f.lands(['Forest', 'Forest', 'Forest']);
  await cast(f, picker); assert.ok(pickerMana.every(c => c.tapped));
  f.x = (p, q) => q.aiHint?.kind === 'squad' ? 2 : /^Sticker kicker/.test(q.prompt || '') ? 1 : undefined;
  const wolf = f.put('Wolfbriar Elemental', 'hand'), mana = f.lands(['Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest']);
  await cast(f, wolf); assert.ok(mana.every(c => c.tapped));
  assert.equal(f.g.creatures(f.a).filter(c => c.isToken && c.hasSub('Wolf')).length, 2);
  assert.equal(f.g.creatures(f.a).filter(c => c.isToken && c.hasSub('Saproling')).length, 3);
  assertGameStateInvariants(f.g, 'distinct sticker and multikicker costs'); assertRecalculationStable(f.g, 'distinct sticker and multikicker costs');
});

test('actual paid two distinct Thornscape kicker costs each produce one native Saproling trigger', async () => {
  const f = table(), infestation = f.put('Saproling Infestation', 'hand'), enchantmentMana = f.lands(['Forest', 'Forest']);
  await cast(f, infestation); assert.ok(enchantmentMana.every(c => c.tapped));
  const artifact = f.put('Arcane Signet', 'battlefield', f.b), creature = f.put('Faerie Seer', 'battlefield', f.b);
  f.option = (p, q) => q.aiHint?.kind === 'kicker' ? 'yes' : undefined;
  f.targets = (p, q) => q.candidates.includes(artifact) ? [artifact] : q.candidates.includes(creature) ? [creature] : undefined;
  const spell = f.put('Thornscape Battlemage', 'hand'), mana = f.lands(['Forest', 'Forest', 'Forest', 'Mountain', 'Plains']);
  await cast(f, spell); assert.ok(mana.every(c => c.tapped)); assert.equal(artifact.zone, 'graveyard'); assert.equal(creature.zone, 'graveyard');
  assert.equal(f.g.creatures(f.a).filter(c => c.isToken && c.hasSub('Saproling')).length, 2);
  assertGameStateInvariants(f.g, 'two actually paid distinct kickers'); assertRecalculationStable(f.g, 'two actually paid distinct kickers');
});
