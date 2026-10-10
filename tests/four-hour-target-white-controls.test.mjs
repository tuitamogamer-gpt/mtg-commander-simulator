import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants, assertRecalculationStable} from './helpers/game-state-invariants.mjs';

const M = loadEngine();

function table() {
  const g = new M.Game({seed: 10102674, paced: false, maxTurns: 10});
  const players = ['White control', 'Caster', 'Copy creator', 'Recipient'].map(name => g.addPlayer(name, {name: 'Native source color controls'}, null, false));
  const [a, b, c, d] = players, f = {g, a, b, c, d, copies: []};
  for (const p of players) p.controller = {decide: async (game, q) => {
    if (q.type === 'priority') return f.priority?.(p, q) || {kind: 'pass'};
    if (q.type === 'chooseTargets') return f.targets?.(p, q) ?? q.candidates.slice(0, q.min || 0);
    if (q.type === 'chooseCards') return q.from.slice(0, q.min || 0);
    if (q.type === 'chooseOption') return f.option?.(p, q) ?? q.options.find(row => row.key === 'yes')?.key ?? q.options[0]?.key;
    if (q.type === 'chooseMulti') return q.options.slice(0, q.min || 0).map(row => row.key);
    if (q.type === 'chooseX') return q.min ?? 0;
    if (q.type === 'chooseManaSources') return {cards: q.suggested};
    if (q.type === 'orderTriggers') return q.triggers;
    if (q.type === 'scry') return {top: q.cards, bottom: []};
    if (q.type === 'main') return {kind: 'done'};
    if (['cardReveal', 'combatReview'].includes(q.type)) return null;
    if (['attackers', 'blockers'].includes(q.type)) return [];
    throw Error('Unhandled native source color choice: ' + q.type);
  }};
  g.turnPlayer = a; g.turnNo = 6; g.phase = 'main1'; g.step = 'main'; g.speedFactor = 0;
  const emit = g.emit.bind(g);
  g.emit = async (event, data, ...rest) => {
    if (event === 'spellCopied') f.copies.push(data.so);
    return emit(event, data, ...rest);
  };
  f.put = (name, zone = 'battlefield', p = a) => {
    assert.ok(M.DEFS[name], 'native definition: ' + name);
    const card = new M.CardInst(M.DEFS[name], p);
    card.zone = zone; card.sick = false;
    if (zone === 'battlefield') g.battlefield.push(card); else p[zone].push(card);
    g.recalc(); return card;
  };
  f.lands = (names, p = a) => names.map(name => f.put(name, 'battlefield', p));
  for (const p of players) for (let n = 0; n < 12; n++) f.put('Forest', 'library', p);
  return f;
}

for (const route of ['printed red', 'paid white replacement', 'paid white original and printed red copy']) {
test(`native Torbran respects Eight-and-a-Half-Tails source colors: ${route}`, async () => {
  const f = table(), tails = f.put('Eight-and-a-Half-Tails'), shock = f.put('Shock', 'hand', f.b);
  f.put('Torbran, Thane of Red Fell', 'battlefield', f.b);
  const shockMana = f.lands(['Mountain'], f.b), whiteMana = f.lands(['Forest']);
  const whiten = route !== 'printed red', copied = route.endsWith('copy');
  const reverberate = copied ? f.put('Reverberate', 'hand', f.c) : null;
  const copyMana = copied ? f.lands(['Mountain', 'Mountain'], f.c) : [];
  if (copied) f.put('Torbran, Thane of Red Fell', 'battlefield', f.c);
  f.option = (p, q) => q.aiHint?.kind === 'newTargets' ? 'no' : undefined;
  let activated = false, copyCast = false, whiteSeen = false;
  f.priority = (p, q) => {
    const original = q.stack.find(row => row.card === shock && !row.isCopy);
    if (whiten && p === f.a && !activated && original) {
      const entry = q.acts.find(row => row.card === tails && row.ability?.label === 'A spell or permanent becomes white');
      if (entry) {activated = true; return {kind: 'activate', entry};}
    }
    if (activated && original && shock.castMeta.spellColors.includes('W')) {
      whiteSeen = true;
      assert.deepEqual(Array.from(shock.colors), ['W'], 'the replacement array changes the original current source color');
      if (copied && p === f.c && !copyCast) {
        const offer = q.casts.find(row => row.card === reverberate);
        if (offer) {copyCast = true; return {kind: 'cast', card: reverberate, from: offer.from, alt: offer.alt};}
      }
    }
  };
  f.targets = (p, q) => q.src?.iid === shock.iid ? [f.d]
    : q.src?.iid === tails.iid || q.src?.iid === reverberate?.iid
      ? [q.candidates.find(row => row.kind === 'spell' && row.card === shock && !row.isCopy)] : undefined;
  const offer = f.g.castableList(f.b).find(row => row.card === shock);
  assert.ok(offer, 'native paid Shock offer');
  assert.equal(await f.g.castSpell(f.b, shock, {from: offer.from, alt: offer.alt}), true);
  assert.equal(activated, whiten); assert.equal(whiteSeen, whiten); assert.equal(copyCast, copied);
  assert.ok(shockMana.every(card => card.tapped));
  assert.equal(whiteMana[0].tapped, whiten);
  assert.ok(copyMana.every(card => card.tapped));
  assert.equal(f.d.life, copied ? 34 : whiten ? 38 : 36);
  assert.equal(f.copies.length, copied ? 1 : 0);
  if (copied) assert.deepEqual(Array.from(f.copies[0].spellColors), ['R'], 'continuous white replacement is not copied');
  assert.equal(f.g.stack.length, 0); assert.equal(f.g.pendingTriggers.length, 0);
  assertGameStateInvariants(f.g, route); assertRecalculationStable(f.g, route);
});
}
