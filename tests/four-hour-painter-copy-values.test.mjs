import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants, assertRecalculationStable} from './helpers/game-state-invariants.mjs';

const M = loadEngine();

// Actual cards, actual mana sources, and the normal native priority pipeline.
// The fixture establishes the initial game position; controllers choose only
// actions/targets offered by the live engine. No rule helpers are installed.
function table() {
  const g = new M.Game({seed: 10102671, paced: false, maxTurns: 10});
  const players = ['Caster', 'Opponent', 'Third', 'Fourth'].map(name =>
    g.addPlayer(name, {name: 'Target resolution audit'}, null, false));
  const [a, b, c, d] = players;
  const f = {g, a, b, c, d, players, questions: [], castEvents: [], responses: [], copies: [], entries: []};
  for (const p of players) p.controller = {decide: async (game, q) => {
    f.questions.push({p, q});
    if (q.type === 'priority') {
      const answer = f.priority?.(p, q) || {kind: 'pass'};
      if (answer.kind !== 'pass') f.responses.push({p, answer});
      return answer;
    }
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
    if (q.type === 'attackers') return f.attackers?.(p, q) ?? [];
    if (q.type === 'blockers') return [];
    throw Error('Unhandled audit choice: ' + q.type);
  }};
  g.turnPlayer = a; g.turnNo = 6; g.phase = 'main1'; g.step = 'main'; g.speedFactor = 0;
  const emit = g.emit.bind(g);
  g.emit = async (event, data, ...rest) => {
    if (event === 'cast') f.castEvents.push(data);
    if (event === 'spellCopied') f.copies.push(data.so);
    if (event === 'etb' && data.card?.isToken) f.entries.push({card: data.card, owner: data.card.owner.idx, controller: data.card.ctrl.idx});
    return emit(event, data, ...rest);
  };
  f.put = (name, zone = 'battlefield', owner = a) => {
    assert.ok(M.DEFS[name], 'native definition: ' + name);
    const card = new M.CardInst(M.DEFS[name], owner);
    card.zone = zone; card.sick = false;
    if (zone === 'battlefield') g.battlefield.push(card);
    else owner[zone].push(card);
    g.recalc();
    return card;
  };
  f.lands = (names, p = a) => names.map(name => f.put(name, 'battlefield', p));
  for (const p of players) for (let n = 0; n < 12; n++) f.put('Forest', 'library', p);
  return f;
}

async function cast(f, p, card, predicate = () => true) {
  const row = f.g.castableList(p).find(row => row.card === card && predicate(row));
  assert.ok(row, 'native cast offer for ' + card.name);
  assert.equal(await f.g.castSpell(p, card, {from: row.from, alt: row.alt}), true);
  assert.equal(f.g.stack.length, 0);
  assert.equal(f.g.pendingTriggers.length, 0);
  assertGameStateInvariants(f.g, card.name);
  assertRecalculationStable(f.g, card.name);
}


test('Ramos counts both colors of an actually paid Shock while a native blue Painter remains active', async () => {
  const f = table(), ramos = f.put('Ramos, Dragon Engine'), painter = f.put("Painter's Servant", 'hand');
  f.option = (player, q) => q.options.some(row => row.key === 'U') ? 'U' : undefined;
  const painterLands = f.lands(['Forest', 'Forest']);
  await cast(f, f.a, painter);
  assert.ok(painterLands.every(card => card.tapped));
  assert.equal(painter.meta.painterV88, 'U');
  const before = ramos.counters['+1/+1'] || 0;
  const shock = f.put('Shock', 'hand'), lands = f.lands(['Mountain']);
  f.targets = (player, q) => q.candidates.includes(f.b) ? [f.b] : undefined;
  await cast(f, f.a, shock);
  assert.ok(lands.every(card => card.tapped));
  assert.equal(shock.zone, 'graveyard');
  assert.equal(f.b.life, 38);
  const live = Array.from(shock.colors).sort();
  console.log(JSON.stringify({printedColors:shock.castMeta.spellColors, liveColors:live, counterGain:(ramos.counters['+1/+1']||0)-before}));
  assert.deepEqual(live, ['R', 'U']);
  assert.equal((ramos.counters['+1/+1'] || 0) - before, 2, 'Ramos counts both colors of the red and blue Shock at its actual cast');
});

test('native permanent spell copy does not copy Painter colors after a paid Lightning Bolt removes Painter', async () => {
  const f = table(), painter = f.put("Painter's Servant", 'hand');
  f.option = (player, q) => q.options.some(row => row.key === 'U') ? 'U' : undefined;
  const painterLands = f.lands(['Forest', 'Forest']);
  await cast(f, f.a, painter);
  assert.ok(painterLands.every(card => card.tapped));
  assert.equal(painter.meta.painterV88, 'U');
  const ring = f.put('Sol Ring', 'hand', f.b), litho = f.put('Lithoform Engine', 'battlefield', f.b);
  f.g.turnPlayer = f.b;
  const lands = f.lands(Array(5).fill('Forest'), f.b);
  let copied = false;
  f.priority = (player, q) => {
    if (player !== f.b || copied || !q.stack.some(so => so.card === ring && !so.isCopy)) return;
    const entry = q.acts.find(row => row.card === litho && row.ability?.label.toLowerCase().includes('permanent spell'));
    if (entry) {copied = true; return {kind:'activate', entry};}
  };
  f.targets = (player, q) => {
    const target = q.candidates.find(row => row.kind === 'spell' && row.card === ring && !row.isCopy);
    return target ? [target] : undefined;
  };
  await cast(f, f.b, ring);
  assert.equal(copied, true); assert.equal(litho.tapped, true);
  assert.ok(lands.every(card => card.tapped));
  const token = f.g.bf().find(card => card.isToken && card.name === 'Sol Ring');
  assert.ok(token);
  assert.deepEqual(Array.from(ring.colors), ['U']);
  assert.deepEqual(Array.from(token.colors), ['U']);
  const bolt = f.put('Lightning Bolt', 'hand', f.b), mountain = f.lands(['Mountain'], f.b)[0];
  f.priority = undefined;
  f.targets = (player, q) => q.candidates.includes(painter) ? [painter] : undefined;
  await cast(f, f.b, bolt);
  assert.equal(mountain.tapped, true);assert.equal(bolt.zone, 'graveyard');
  assert.equal(painter.zone, 'graveyard');
  console.log(JSON.stringify({physicalColors:Array.from(ring.colors),tokenColors:Array.from(token.colors),copiedOverride:token.def.colorsOverride}));
  assert.deepEqual(Array.from(ring.colors), []);
  assert.deepEqual(Array.from(token.colors), [], 'CR707.2: Painter color effects are not copiable values of a resolving permanent spell copy');
});
