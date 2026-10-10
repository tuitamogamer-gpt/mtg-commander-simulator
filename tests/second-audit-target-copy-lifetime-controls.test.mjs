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


async function copyBear(f, recipient, bear) {
  const spell = f.put('Cytoshape', 'hand'), mana = f.lands(['Island', 'Forest', 'Forest']);
  f.targets = (p, q) => q.candidates.includes(recipient) ? [recipient] : undefined;
  f.cards = (p, q) => q.prompt?.includes('become a copy') && q.from.includes(bear) ? [bear] : undefined;
  await cast(f, spell); assert.ok(mana.every(card => card.tapped)); assert.equal(recipient.name, 'Grizzly Bears');
}
async function humanMoonmist(f, recipient) {
  const selection = f.put('Unnatural Selection', 'hand'), mana = f.lands(['Island', 'Forest']);
  await cast(f, selection); assert.ok(mana.every(card => card.tapped));
  f.targets = (p, q) => q.candidates.includes(recipient) ? [recipient] : undefined;
  f.option = (p, q) => q.options.some(row => row.key === 'Human') ? 'Human' : undefined;
  const payment = f.lands(['Forest'])[0], entry = f.g.activatableList(f.a).find(row => row.card === selection && !row.manaAbility);
  assert.ok(entry); assert.equal(await f.g.activateAbility(f.a, entry), true); assert.equal(payment.tapped, true); assert.equal(recipient.hasSub('Human'), true);
  const spell = f.put('Moonmist', 'hand'), green = f.lands(['Forest', 'Forest']); await cast(f, spell); assert.ok(green.every(card => card.tapped));
  assert.equal(recipient.name, 'Grizzly Bears');
}
async function cleanup(f) {await f.g.runEndStepV90(f.a); await f.g.runCleanupPhaseV80(f.a); assert.equal(f.g.stack.length, 0); assert.equal(f.g.pendingTriggers.length, 0);}

test('native paid temporary copy on a single-faced creature expires to its own printed definition', async () => {
  const f = table(), recipient = f.put('Faerie Seer'), bear = f.put('Grizzly Bears');
  await copyBear(f, recipient, bear); assert.equal(recipient.kw('flying'), false);
  await cleanup(f); assert.equal(recipient.name, 'Faerie Seer'); assert.equal(recipient.kw('flying'), true); assert.equal(recipient.isCopyOf, null);
  assertGameStateInvariants(f.g, 'ordinary single-faced copy expiry'); assertRecalculationStable(f.g, 'ordinary single-faced copy expiry');
});

test('paid copied Glasspool retains its independent Keeper copy when a later temporary Bear copy expires after a physical turn', async () => {
  const f = table(), model = f.put('Bloodline Keeper // Lord of Lineage'), bear = f.put('Grizzly Bears');
  const mimic = f.put('Glasspool Mimic // Glasspool Shore', 'hand'), mana = f.lands(['Island', 'Forest', 'Forest']);
  f.cards = (p, q) => q.prompt?.includes('copy as this enters') && q.from.includes(model) ? [model] : undefined;
  await cast(f, mimic); assert.ok(mana.every(card => card.tapped)); assert.equal(mimic.name, 'Bloodline Keeper');
  await copyBear(f, mimic, bear); await humanMoonmist(f, mimic); assert.equal(mimic.oracleFace, 'back');
  await cleanup(f); assert.equal(mimic.oracleFace, 'back'); assert.equal(mimic.name, 'Bloodline Keeper'); assert.equal(mimic.kw('flying'), true);
  assert.equal(mimic.zone, 'battlefield'); assert.ok(mimic.isCopyOf); assert.equal(mimic.hasSub('Human'), false);
  assertGameStateInvariants(f.g, 'independent copy under temporary layer'); assertRecalculationStable(f.g, 'independent copy under temporary layer');
});

test('paid bounce and recast clear a transformed temporary copy without retaining its old face or copy layer', async () => {
  const f = table(), keeper = f.put('Bloodline Keeper // Lord of Lineage'), bear = f.put('Grizzly Bears'), version = keeper.zoneVersion;
  await copyBear(f, keeper, bear); await humanMoonmist(f, keeper); assert.equal(keeper.oracleFace, 'back');
  const bounce = f.put('Unsummon', 'hand'), blue = f.lands(['Island'])[0]; await cast(f, bounce); assert.equal(blue.tapped, true);
  assert.equal(keeper.zone, 'hand'); assert.equal(keeper.oracleFace, 'front'); assert.equal(keeper.name, 'Bloodline Keeper'); assert.equal(keeper.zoneVersion, version + 1);
  const mana = f.lands(['Swamp', 'Swamp', 'Forest', 'Forest']); await cast(f, keeper); assert.ok(mana.every(card => card.tapped));
  assert.equal(keeper.oracleFace, 'front'); assert.equal(keeper.name, 'Bloodline Keeper'); assert.equal(keeper.zoneVersion, version + 2); assert.equal(keeper.isCopyOf, null);
  await cleanup(f); assert.equal(keeper.name, 'Bloodline Keeper'); assert.equal(keeper.oracleTransformCount, 0);
  assertGameStateInvariants(f.g, 'copy source departure and recast'); assertRecalculationStable(f.g, 'copy source departure and recast');
});

for (const order of ['under', 'over']) test('paid temporary Bear copy expiry reveals the transformed merged Keeper component ' + order, async () => {
  const f = table(), keeper = f.put('Bloodline Keeper // Lord of Lineage'), bear = f.put('Grizzly Bears');
  const heron = f.put('Dreamtail Heron', 'hand'), mana = f.lands(['Island', 'Forest', 'Forest', 'Forest']);
  f.targets = (p, q) => q.candidates.includes(keeper) ? [keeper] : undefined;
  f.option = (p, q) => q.aiHint?.kind === 'mutateOrder' ? order : undefined;
  await cast(f, heron, row => !!row.alt?.mutate); assert.ok(mana.every(card => card.tapped));
  await copyBear(f, keeper, bear); await humanMoonmist(f, keeper);
  const component = keeper.mutateState.components.find(row => row.card === keeper); assert.equal(component.oracleFace, 'back');
  await cleanup(f); assert.equal(component.oracleFace, 'back'); assert.equal(keeper.name, order === 'under' ? 'Lord of Lineage' : 'Dreamtail Heron');
  assert.equal(keeper.kw('flying'), true); assert.equal(keeper.mutateState.components.length, 2); assert.equal(keeper.hasSub('Human'), false);
  assertGameStateInvariants(f.g, 'temporary merged copy expiry'); assertRecalculationStable(f.g, 'temporary merged copy expiry');
});
