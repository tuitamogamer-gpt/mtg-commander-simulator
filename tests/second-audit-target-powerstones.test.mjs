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


async function paidUntap(f, token) {
  const spell = f.put('Twiddle', 'hand'), blue = f.lands(['Island'])[0];
  f.targets = (p, q) => q.candidates.includes(token) ? [token] : undefined;
  f.option = (p, q) => q.options.find(row => /^untap$/i.test(row.key) || /^untap\b/i.test(row.label))?.key;
  await cast(f, spell); assert.equal(blue.tapped, true); assert.equal(token.tapped, false);
}

test('paid Brothers War native first chapter creates two tapped canonical Powerstones with restricted spell payments', async () => {
  const f = table(), saga = f.put("The Brothers' War", 'hand'), mana = f.lands(['Mountain', 'Forest', 'Forest', 'Forest']);
  await cast(f, saga); assert.ok(mana.every(card => card.tapped)); assert.equal(saga.counters.lore, 1);
  const tokens = f.g.bf().filter(card => card.ctrl === f.a && card.isToken && /powerstone/i.test(card.name));
  assert.equal(tokens.length, 2); assert.ok(tokens.every(card => card.is('Artifact') && !card.is('Creature') && card.tapped));
  for (const token of tokens) await paidUntap(f, token);
  const blue = f.lands(['Island'])[0], forbidden = f.put('Divination', 'hand');
  assert.equal(f.g.castableList(f.a).some(row => row.card === forbidden), false);
  assert.equal(await f.g.castSpell(f.a, forbidden, {from: 'hand'}), false);
  assert.equal(forbidden.zone, 'hand'); assert.equal(blue.tapped, false); assert.ok(tokens.every(card => !card.tapped));
  const artifact = f.put('Chromatic Lantern', 'hand'); await cast(f, artifact);
  assert.equal(artifact.zone, 'battlefield'); assert.equal(blue.tapped, true); assert.ok(tokens.every(card => card.tapped));
  assertGameStateInvariants(f.g, 'canonical Powerstone restricted payments'); assertRecalculationStable(f.g, 'canonical Powerstone restricted payments');
});

test('paid Wreck Hunter printed Powerstone creation remains a valid direct-definition control with native restricted payments', async () => {
  const f = table(), victim = f.put('Ornithopter', 'battlefield', f.b), shock = f.put('Shock', 'hand'), red = f.lands(['Mountain'])[0];
  f.targets = (p, q) => q.candidates.includes(victim) ? [victim] : undefined;
  await cast(f, shock); assert.equal(red.tapped, true); assert.equal(victim.zone, 'graveyard');
  const hunter = f.put('Wreck Hunter', 'hand'), mana = f.lands(['Swamp', 'Swamp']);
  f.targets = (p, q) => q.candidates.includes(f.b) ? [f.b] : undefined;
  await cast(f, hunter); assert.ok(mana.every(card => card.tapped));
  const tokens = f.g.bf().filter(card => card.ctrl === f.a && card.isToken && /powerstone/i.test(card.name));
  assert.equal(tokens.length, 1); const token = tokens[0]; assert.equal(token.is('Artifact'), true); assert.equal(token.is('Creature'), false); assert.equal(token.tapped, true);
  await paidUntap(f, token);
  const green = f.lands(['Forest'])[0], forbidden = f.put('Grizzly Bears', 'hand');
  assert.equal(f.g.castableList(f.a).some(row => row.card === forbidden), false);
  assert.equal(await f.g.castSpell(f.a, forbidden, {from: 'hand'}), false);
  assert.equal(forbidden.zone, 'hand'); assert.equal(green.tapped, false); assert.equal(token.tapped, false);
  const artifact = f.put('Arcane Signet', 'hand'); await cast(f, artifact);
  assert.equal(artifact.zone, 'battlefield'); assert.equal(green.tapped, true); assert.equal(token.tapped, true);
  assertGameStateInvariants(f.g, 'direct native Powerstone definition'); assertRecalculationStable(f.g, 'direct native Powerstone definition');
});
