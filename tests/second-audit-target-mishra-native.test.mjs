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
    if (q.type === 'attackers') return f.attackers?.(p, q) ?? [];
    if (q.type === 'blockers') return [];
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


test('actual paid Mishra meld announces its modal discard target across all three opponents', async () => {
  const f = table(), mishra = f.put('Mishra, Claimed by Gix', 'hand');
  let mana = f.lands(['Swamp', 'Mountain', 'Forest', 'Forest']); await cast(f, mishra); assert.ok(mana.every(card => card.tapped));
  const dragon = f.put('Phyrexian Dragon Engine', 'hand'); mana = f.lands(['Forest', 'Forest', 'Forest']); await cast(f, dragon); assert.ok(mana.every(card => card.tapped));
  const haste = f.put('Mass Hysteria', 'hand'), red = f.lands(['Mountain'])[0]; await cast(f, haste); assert.equal(red.tapped, true);
  assert.equal(mishra.kw('haste'), true); assert.equal(dragon.kw('haste'), true);
  const hand = ['Island', 'Swamp', 'Mountain'].map(name => f.put(name, 'hand', f.c));
  f.attackers = (p, q) => {assert.ok(q.eligible.includes(mishra)); assert.ok(q.eligible.includes(dragon)); return [{card: mishra, target: f.b}, {card: dragon, target: f.b}];};
  const modeOffers = []; let selectedMode;
  f.option = (p, q) => {
    modeOffers.push(q.options.map(row => row.label).join(' | '));
    const mode = q.options.find(row => /Opponent discards two/.test(row.label) && /Deal three damage/.test(row.label) && /Create Powerstones/.test(row.label));
    if (mode) {selectedMode = mode.key; return mode.key;}
  };
  let opponentOffers;
  f.targets = (p, q) => {
    if (q.candidates.includes(f.c)) {
      const players = q.candidates.filter(row => row instanceof M.Player);
      if (players.length === 3) opponentOffers = players.map(row => row.idx);
      return [f.c];
    }
  };
  await f.g.combatPhase(f.a);
  assert.ok(selectedMode, 'actual Mishra mode offers: ' + modeOffers.join(' ; '));
  assert.deepEqual([...opponentOffers], [f.b.idx, f.c.idx, f.d.idx]);
  assert.equal(mishra.name, 'Mishra, Lost to Phyrexia'); assert.equal(dragon.zone, 'merged');
  assert.equal(f.c.hand.length, 1); assert.equal(hand.filter(card => card.zone === 'graveyard').length, 2);
  assert.equal(f.c.life, 35); assert.equal(f.d.life, 38);
  const powerstones = f.g.bf().filter(card => card.ctrl === f.a && card.isToken && /powerstone/i.test(card.name));
  assert.equal(powerstones.length, 2, 'native created tokens: ' + f.g.bf().filter(card => card.isToken).map(card => card.name).join(', '));
  assert.ok(powerstones.every(card => card.is('Artifact')));
  assert.equal(f.g.stack.length, 0); assert.equal(f.g.pendingTriggers.length, 0);
  assertGameStateInvariants(f.g, 'paid Mishra modal opponent target'); assertRecalculationStable(f.g, 'paid Mishra modal opponent target');
});
