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


for (const stolen of [true, false]) test(`paid Lithoform permanent spell copy ${stolen ? 'retains its creator owner after Commandeer changes its controller' : 'retains its ordinary owner and controller'}`, async () => {
  const f = table(), ring = f.put('Sol Ring', 'hand', f.b), litho = f.put('Lithoform Engine', 'battlefield', f.b);
  const commandeer = stolen ? f.put('Commandeer', 'hand', f.c) : null;
  f.g.turnPlayer = f.b;
  const lands = [...f.lands(Array(5).fill('Forest'), f.b), ...(stolen ? f.lands(['Island', 'Island', ...Array(5).fill('Forest')], f.c) : [])];
  let copied = false, taken = false, copy;
  f.priority = (player, q) => {
    if (player === f.b && !copied && q.stack.some(so => so.card === ring && !so.isCopy)) {
      const entry = q.acts.find(row => row.card === litho && row.ability?.label.toLowerCase().includes('permanent spell'));
      if (entry) { copied = true; return {kind: 'activate', entry}; }
    }
    if (stolen && player === f.c && !taken && q.stack.some(so => so.card === ring && so.isCopy)) {
      const row = q.casts.find(row => row.card === commandeer && !row.alt?.oracleAlternativeCost);
      if (row) { taken = true; return {kind: 'cast', card: commandeer, from: row.from, alt: row.alt}; }
    }
  };
  f.targets = (player, q) => {
    const target = q.candidates.find(row => row.kind === 'spell' && row.card === ring && !!row.isCopy === (q.src?.iid === commandeer?.iid));
    return target ? [target] : undefined;
  };
  await cast(f, f.b, ring);
  copy = f.copies.find(so => so.card === ring);
  assert.equal(copied, true);
  assert.equal(taken, stolen);
  assert.equal(litho.tapped, true);
  assert.ok(lands.every(card => card.tapped), 'native Sol Ring 1, Lithoform 4, and full Commandeer 7 payments');
  if (stolen) assert.equal(commandeer.zone, 'graveyard');
  assert.equal(copy.owner?.idx, f.b.idx, 'CR 707.10: the copy is owned by its stack creator');
  assert.equal(copy.ctrl.idx, (stolen ? f.c : f.b).idx);
  const token = f.g.bf().find(card => card.isToken && card.name === 'Sol Ring');
  assert.ok(token);
  assert.equal(ring.owner.idx, f.b.idx);
  assert.equal(ring.ctrl.idx, f.b.idx);
  assert.equal(token.ctrl.idx, (stolen ? f.c : f.b).idx);
  assert.equal(token.owner.idx, f.b.idx, 'CR 608.3f: the same copy becomes a token without being created again');
  assert.deepEqual(f.entries.filter(entry => entry.card === token).map(entry => [entry.owner, entry.controller]), [[f.b.idx, (stolen ? f.c : f.b).idx]], 'owner and controller are correct when ETB is dispatched');
  assert.equal((stolen ? f.c : f.b).turnState.tokensCreated, 0, 'the spell copy token is not a token creation event');
});

test('paid Rite of Replication ordinary token copy is owned by its creating controller', async () => {
  const f = table(), bear = f.put('Grizzly Bears', 'battlefield', f.b), rite = f.put('Rite of Replication', 'hand', f.c);
  f.g.turnPlayer = f.c;
  const lands = f.lands(['Island', 'Island', 'Forest', 'Forest'], f.c);
  f.targets = (player, q) => q.candidates.includes(bear) ? [bear] : undefined;
  await cast(f, f.c, rite);
  assert.ok(lands.every(card => card.tapped), 'native Rite of Replication 2UU paid');
  assert.equal(rite.zone, 'graveyard');
  const token = f.g.bf().find(card => card.isToken && card.name === 'Grizzly Bears');
  assert.ok(token);
  assert.equal(bear.owner.idx, f.b.idx);
  assert.equal(bear.ctrl.idx, f.b.idx);
  assert.equal(token.owner.idx, f.c.idx, 'CR 111.2: the ordinary token copy is owned by its creator');
  assert.equal(token.ctrl.idx, f.c.idx);
  assert.deepEqual(f.entries.filter(entry => entry.card === token).map(entry => [entry.owner, entry.controller]), [[f.c.idx, f.c.idx]]);
  assert.equal(f.c.turnState.tokensCreated, 1);
});
