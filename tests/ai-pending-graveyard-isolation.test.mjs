import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {aiIsolationFingerprint} from './helpers/run-ai-adversarial-games.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M = loadEngine();

function fixture() {
  const g = new M.Game({seed: 101343, paced: false}), f = {g};
  const decide = async (_game, q) => {
    if (q.type === 'priority') return {kind: 'pass'};
    if (q.type === 'main') return {kind: 'done'};
    if (q.type === 'chooseTargets') return f.target && q.candidates.includes(f.target) ? [f.target] : q.candidates.slice(0, q.min || 0);
    if (q.type === 'chooseCards') return q.from.slice(0, q.min || 0);
    if (q.type === 'chooseOption') return q.options[0]?.key;
    if (q.type === 'chooseManaSources') return {cards: q.suggested};
    if (q.type === 'orderTriggers') return q.triggers;
    if (q.type === 'scry') return {top: q.cards, bottom: []};
    throw Error('Unhandled graveyard-isolation choice: ' + q.type);
  };
  [f.a, f.b, f.c] = ['You', 'AI Wolf', 'AI Raven'].map((name, i) => g.addPlayer(name, {name: 'Graveyard lifecycle isolation'}, {decide}, i > 0));
  g.turnPlayer = f.a; g.turnNo = 6; g.phase = 'main1'; g.step = 'main';
  g._prioritySessionActive = true;
  f.add = (name, zone = 'battlefield', player = f.a) => {
    const card = new M.CardInst(M.DEFS[name], player);
    card.zone = zone; card.sick = false;
    if (zone === 'battlefield') g.battlefield.push(card); else player[zone].push(card);
    g.recalc(); return card;
  };
  for (const player of g.players) for (let n = 0; n < 6; n++) f.add('Forest', 'library', player);
  f.opt = f.add('Opt', 'hand', f.b);
  f.responseLand = f.add('Island', 'battlefield', f.b);
  return f;
}

async function settle(game) {
  for (let n = 0; game.stack.length && n < 30; n++) await game.resolveTop();
  assert.equal(game.stack.length, 0); assert.equal(game.pendingTriggers.length, 0);
}

async function cast(f, card, player = f.a) {
  const entry = f.g.castableList(player).find(row => row.card === card);
  assert.ok(entry, 'the printed spell is legal and payable');
  assert.equal(await f.g.castSpell(player, card, {from: entry.from, alt: entry.alt}), true);
}

async function response(f, spell = f.opt) {
  const before = aiIsolationFingerprint(f.g), clock = M.currentOracleTimestamp();
  assert.ok(f.g.castableList(f.b).some(row => row.card === spell));
  const result = await M.simulateAction(f.g, {kind: 'cast', card: spell, from: 'hand'}, {playerId: f.b.idx, seed: 101344});
  assert.equal(result.applied, true, result.error?.stack); assert.equal(result.error, null);
  assert.equal(aiIsolationFingerprint(f.g), before, 'search cannot change live entry history, players or physical zones');
  assert.equal(M.currentOracleTimestamp(), clock);
  assert.equal(spell.zone, 'hand'); assert.equal(f.responseLand.tapped, false);
  assert.equal(result.state.byIid(spell.iid).zone, 'graveyard');
  assertGameStateInvariants(result.state, 'cloned graveyard lifecycle resolution');
  return result.state;
}

async function creature(f, name) {
  const card = f.add(name, 'hand');
  f.add('Swamp'); f.add('Forest'); f.add('Wastes');
  await cast(f, card); await settle(f.g);
  assert.equal(card.zone, 'battlefield');
  return card;
}

async function steal(f, card) {
  f.target = card;
  const ray = f.add('Ray of Command', 'hand', f.c);
  const lands = Array.from({length: 4}, () => f.add('Island', 'battlefield', f.c));
  await cast(f, ray, f.c); await f.g.resolveTop();
  assert.ok(lands.every(land => land.tapped));
  assert.equal(card.ctrl, f.c); f.target = null;
}

for (const [name, counter] of [['Butcher Ghoul', '+1/+1'], ['Safehold Elite', '-1/-1']]) {
  for (const scenario of ['ordinary death', 'stolen at death', 'opponent-copied return']) test(`${name}: pending ${scenario} returns only the cloned creature to its physical owner`, async () => {
    const f = fixture(), card = await creature(f, name);
    if (scenario === 'stolen at death') await steal(f, card);
    const controllerAtDeath = card.ctrl;
    assert.equal(await f.g.sacrifice(controllerAtDeath, card), true);
    await f.g.flushTriggers();
    const trigger = f.g.stack.at(-1);
    assert.equal(trigger.ctrl, controllerAtDeath);
    if (scenario === 'opponent-copied return') assert.ok(await f.g.copyStackAbility(trigger, f.c));
    const entriesBefore = f.a.turnState.permanentEntries.length;
    const clone = await response(f), returned = clone.byIid(card.iid);
    assert.equal(returned.zone, 'battlefield');
    assert.equal(returned.owner, clone.players[f.a.idx]);
    assert.equal(returned.ctrl, clone.players[f.a.idx], 'Persist and Undying return under the owner, including copied opponent abilities');
    assert.equal(returned.counters[counter], 1);
    assert.equal(clone.players[f.a.idx].turnState.permanentEntries.length, entriesBefore + 1);
    assert.equal(f.a.turnState.permanentEntries.length, entriesBefore);
    assert.equal(card.zone, 'graveyard');
    await settle(f.g);
    assert.equal(card.zone, 'battlefield'); assert.equal(card.ctrl, f.a);
    assert.equal(card.counters[counter], 1);
    assert.equal(f.a.turnState.permanentEntries.length, entriesBefore + 1, 'the actual return happens exactly once');
    assertGameStateInvariants(f.g);
  });

  test(`${name}: old death trigger ignores a graveyard incarnation that left and returned`, async () => {
    const f = fixture(), card = await creature(f, name);
    await f.g.sacrifice(f.a, card); await f.g.flushTriggers();
    await f.g.move(card, 'exile'); await f.g.move(card, 'graveyard');
    const clone = await response(f);
    assert.equal(clone.byIid(card.iid).zone, 'graveyard');
    await settle(f.g);
    assert.equal(card.zone, 'graveyard'); assertGameStateInvariants(f.g);
  });
}

async function unearth(f) {
  const card = f.add('Dregscape Zombie', 'graveyard'), land = f.add('Swamp');
  const entry = f.g.activatableList(f.a).find(row => row.card === card && row.gyAbility);
  assert.ok(entry);
  assert.equal(await f.g.activateAbility(f.a, entry), true);
  assert.equal(land.tapped, true, 'native Unearth pays its printed black mana');
  await settle(f.g);
  assert.equal(card.zone, 'battlefield'); assert.equal(card.meta.unearth, true);
  return card;
}

async function cleanup(f) {
  f.g.phase = 'end'; f.g.step = 'endStep';
  await f.g.emit('endStep', {player: f.a}); await f.g.flushTriggers();
  assert.ok(f.g.stack.some(row => row.name.includes('Unearth exile')));
}

for (const scenario of ['ordinary cleanup', 'stolen creature', 'opponent-copied cleanup']) test(`Unearth ${scenario} exiles the simulated incarnation and later the actual card`, async () => {
  const f = fixture(), card = await unearth(f);
  if (scenario === 'stolen creature') await steal(f, card);
  await cleanup(f);
  if (scenario === 'opponent-copied cleanup') assert.ok(await f.g.copyStackAbility(f.g.stack.at(-1), f.c));
  const clone = await response(f), exiled = clone.byIid(card.iid);
  assert.equal(exiled.zone, 'exile');
  assert.ok(clone.players[f.a.idx].exile.includes(exiled));
  assert.equal(card.zone, 'battlefield');
  await settle(f.g);
  assert.equal(card.zone, 'exile'); assert.equal(card.owner, f.a);
  assert.ok(f.a.exile.includes(card)); assertGameStateInvariants(f.g);
});

for (const beforeTrigger of [true, false]) test(`Unearth ignores a blinked incarnation after a paid Ephemerate ${beforeTrigger ? 'before' : 'after'} its cleanup is queued`, async () => {
  const f = fixture(), card = await unearth(f);
  if (!beforeTrigger) await cleanup(f);
  f.target = card;
  const blink = f.add('Ephemerate', 'hand'); f.add('Plains');
  await cast(f, blink); await f.g.resolveTop(); f.target = null;
  assert.equal(card.zone, 'battlefield'); assert.equal(!!card.meta.unearth, false);
  if (beforeTrigger) await cleanup(f);
  const clone = await response(f);
  assert.equal(clone.byIid(card.iid).zone, 'battlefield');
  await settle(f.g);
  assert.equal(card.zone, 'battlefield'); assertGameStateInvariants(f.g);
});

test('a native Stifle response counters pending Unearth while its already-paid activation cost remains spent', async () => {
  const f = fixture(), card = f.add('Dregscape Zombie', 'graveyard'), land = f.add('Swamp');
  const entry = f.g.activatableList(f.a).find(row => row.card === card && row.gyAbility);
  assert.ok(entry);
  assert.equal(await f.g.activateAbility(f.a, entry), true);
  assert.equal(land.tapped, true); assert.equal(card.zone, 'graveyard');
  const stifle = f.add('Stifle', 'hand', f.b);
  const clone = await response(f, stifle);
  assert.equal(clone.byIid(card.iid).zone, 'graveyard');
  assert.equal(!!clone.byIid(card.iid).meta.unearth, false);
  assert.equal(card.zone, 'graveyard');
  await cast(f, stifle, f.b); await settle(f.g);
  assert.equal(card.zone, 'graveyard'); assert.equal(land.tapped, true);
  assert.equal(stifle.zone, 'graveyard'); assertGameStateInvariants(f.g);
});

test('native Encore cleanup remains isolated and sacrifices its own exact token cohort', async () => {
  const f = fixture(), card = f.add('Impulsive Pilferer', 'graveyard');
  const lands = [f.add('Mountain'), f.add('Wastes'), f.add('Wastes'), f.add('Wastes')];
  const entry = f.g.activatableList(f.a).find(row => row.card === card && row.gyAbility);
  assert.ok(entry); assert.equal(await f.g.activateAbility(f.a, entry), true);
  assert.ok(lands.every(land => land.tapped));
  await settle(f.g);
  const tokens = f.g.bf().filter(token => token.isToken && token.name === card.name);
  assert.equal(card.zone, 'exile'); assert.equal(tokens.length, 2);
  f.g.phase = 'end'; f.g.step = 'endStep';
  await f.g.emit('endStep', {player: f.a}); await f.g.flushTriggers();
  assert.ok(f.g.stack.some(row => row.name === 'Sacrifice temporary tokens'));
  const clone = await response(f);
  assert.equal(clone.bf().some(token => tokens.some(original => original.iid === token.iid)), false);
  assert.equal(clone.bf().filter(token => token.isToken && token.hasSub('Treasure')).length, 2);
  assert.ok(tokens.every(token => f.g.bf().includes(token)));
  await settle(f.g);
  assert.ok(tokens.every(token => token.zone === 'ceased'));
  assert.equal(f.g.bf().filter(token => token.isToken && token.hasSub('Treasure')).length, 2);
  assertGameStateInvariants(f.g);
});
