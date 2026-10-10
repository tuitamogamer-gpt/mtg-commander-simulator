import fs from 'node:fs';
import path from 'node:path';
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
    if (q.type === 'chooseMulti') return f.multi?.(p, q) ?? q.options.slice(0, q.min || 0).map(row => row.key);
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


function localArt(token) {
  const image = M.cardImageURL(token.def.tokenImageName || token.name);
  assert.notEqual(image, M.CARD_IMAGE_PLACEHOLDER, token.name + ' has actual local canonical token art');
  assert.match(image, /^\.\/assets\/cards\/.+\.webp$/);
  const bytes = fs.readFileSync(path.resolve(image.slice(2)));
  assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP');
}

test('paid Judith instant trigger creates the actual red Imp with matching local death-trigger token art', async () => {
  const f = table(), judith = f.put('Judith, Carnage Connoisseur', 'hand');
  const mana = f.lands(['Swamp', 'Mountain', 'Forest', 'Forest', 'Forest']);
  await cast(f, judith); assert.ok(mana.every(card => card.tapped));
  const shock = f.put('Shock', 'hand'), red = f.lands(['Mountain'])[0];
  f.targets = (p, q) => q.candidates.includes(f.b) ? [f.b] : undefined;
  f.option = (p, q) => q.options.find(row => /Create an Imp/i.test(row.label))?.key;
  await cast(f, shock); assert.equal(red.tapped, true);
  const imp = f.g.creatures(f.a).find(card => card.isToken && card.hasSub('Imp'));
  assert.ok(imp); assert.equal(imp.power, 2); assert.equal(imp.toughness, 2);
  assert.deepEqual(Array.from(imp.colors), ['R']);
  assert.equal(imp.def.triggers.some(row => row.on === 'dies'), true);
  localArt(imp); assertGameStateInvariants(f.g, 'native Judith Imp art');
});

test('paid Niko entry creates native Shards with canonical local art and paid printed sacrifice ability', async () => {
  const f = table(), niko = f.put('Niko, Light of Hope', 'hand');
  const mana = f.lands(['Island', 'Island', 'Plains', 'Forest']);
  await cast(f, niko); assert.ok(mana.every(card => card.tapped));
  const shards = f.g.bf().filter(card => card.isToken && card.hasSub('Shard'));
  assert.equal(shards.length, 2); for (const shard of shards) {assert.equal(shard.is('Enchantment'), true); localArt(shard);}
  const source = shards[0], payment = f.lands(['Forest', 'Forest']), before = f.a.hand.length;
  const entry = f.g.activatableList(f.a).find(row => row.card === source && !row.manaAbility);
  assert.ok(entry); assert.equal(await f.g.activateAbility(f.a, entry), true);
  await f.g.flushTriggers(); await f.g.priorityRound(f.g.turnPlayer);
  assert.ok(payment.every(card => card.tapped)); assert.equal(source.zone, 'ceased');
  assert.equal(f.a.hand.length, before + 1);
  assertGameStateInvariants(f.g, 'native Niko Shard art and ability');
});

