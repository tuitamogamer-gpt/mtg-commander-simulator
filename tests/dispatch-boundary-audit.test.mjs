import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync, mkdirSync} from 'node:fs';
import {loadEngine} from './helpers/load-engine.mjs';
import {put} from './helpers/oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M = loadEngine();
const traces = [];

function position({payWhite = false} = {}) {
  const questions = [];
  const answer = q => q.type === 'priority' ? {kind: 'pass'}
    : q.type === 'chooseTargets' ? q.candidates.slice(0, q.min || 0)
      : q.type === 'chooseCards' ? q.from.slice(0, q.min || 0)
        : q.type === 'chooseOption' ? q.options.find(o => o.key === (payWhite ? 'yes' : 'no'))?.key || q.options[0]?.key
          : q.type === 'orderTriggers' ? q.triggers : null;
  const controller = {decide: async (game, q) => { questions.push(q); return answer(q); }};
  const game = new M.Game({seed: 1099026, paced: false});
  game.speedFactor = 0;
  const a = game.addPlayer('Ayesha controller', {name: 'A'}, controller, false);
  const b = game.addPlayer('Ability controller', {name: 'B'}, controller, false);
  game.turnPlayer = b; game.turnNo = 4; game.phase = 'main1'; game.step = 'main';
  const ayesha = put(M, game, a, 'Ayesha Tanaka');
  const windows = [];
  let responses = 0;
  a.controller = {decide: async (g, q) => {
    questions.push(q);
    if (q.type === 'priority') {
      const original = q.stack.find(so => so.srcCard !== ayesha && so.kind === 'ability');
      const entry = q.acts.find(entry => entry.card === ayesha);
      windows.push({stack: q.stack.map(so => ({kind: so.kind, source: (so.srcCard || so.card)?.name})), offered: !!entry});
      if (original && entry && !responses) {
        responses += 1;
        return {kind: 'activate', entry, targets: [[original]]};
      }
    }
    return answer(q);
  }};
  for (const p of [a, b]) for (let i = 0; i < 8; i++) put(M, game, p, 'Forest', 'library');
  return {game, a, b, ayesha, questions, windows, get responses() {return responses;}};
}

function finished(f, label) {
  assert.equal(f.game.stack.length, 0);
  assert.equal(f.game.pendingTriggers.length, 0);
  assertGameStateInvariants(f.game, label);
  traces.push({label, responses: f.responses, windows: f.windows});
}

for (const payWhite of [false, true]) {
  test(`Ayesha reaches a real Icy Manipulator ability and ${payWhite ? 'allows its controller to pay white' : 'counters when white is not paid'}`, async () => {
    const f = position({payWhite});
    const target = put(M, f.game, f.a, 'Grizzly Bears');
    const artifact = put(M, f.game, f.b, 'Icy Manipulator');
    const island = put(M, f.game, f.b, 'Island');
    const white = payWhite ? put(M, f.game, f.b, 'Plains') : null;
    const entry = f.game.activatableList(f.b).find(entry => entry.card === artifact && !entry.manaOnly);
    assert.ok(entry);
    assert.equal(await f.game.activateAbility(f.b, entry, [[target]]), true);
    assert.equal(f.responses, 1, 'the normal priority question exposes the legal artifact-ability response');
    assert.equal(f.ayesha.tapped, true, 'pay Ayesha\'s printed tap cost');
    assert.equal(artifact.tapped, true);
    assert.equal(island.tapped, true, 'pay Icy Manipulator\'s printed mana cost');
    assert.equal(target.tapped, payWhite, 'the original ability resolves only after its controller pays white');
    if (white) assert.equal(white.tapped, true, 'pay the actual white cost using an untapped Plains');
    finished(f, `Ayesha / Icy / ${payWhite ? 'paid' : 'unpaid'}`);
  });
}

test('Ayesha recognizes a sacrificed artifact source through the native stack source snapshot', async () => {
  const f = position();
  const target = put(M, f.game, f.a, 'Sol Ring');
  const artifact = put(M, f.game, f.b, "Dispeller's Capsule");
  const lands = ['Plains', 'Island', 'Island'].map(name => put(M, f.game, f.b, name));
  const entry = f.game.activatableList(f.b).find(entry => entry.card === artifact && !entry.manaOnly);
  assert.ok(entry);
  assert.equal(await f.game.activateAbility(f.b, entry, [[target]]), true);
  assert.equal(artifact.zone, 'graveyard', 'the original source leaves as a printed activation cost');
  assert.ok(lands.every(land => land.tapped));
  assert.equal(f.responses, 1, 'the artifact ability remains a valid target after its source leaves');
  assert.equal(target.zone, 'battlefield', 'the countered capsule does not destroy its target');
  assert.equal(f.ayesha.tapped, true);
  finished(f, 'Ayesha / sacrificed Capsule source');
});

test('Ayesha rejects a real nonartifact activated ability', async () => {
  const f = position();
  const target = put(M, f.game, f.a, 'Grizzly Bears');
  const source = put(M, f.game, f.b, 'Prodigal Pyromancer');
  const entry = f.game.activatableList(f.b).find(entry => entry.card === source && !entry.manaOnly);
  assert.ok(entry);
  assert.equal(await f.game.activateAbility(f.b, entry, [[target]]), true);
  assert.equal(f.responses, 0);
  assert.equal(f.ayesha.tapped, false);
  assert.equal(target.damage, 1, 'the valid creature ability resolves normally');
  finished(f, 'Ayesha / creature ability is excluded');
});

test('Ayesha rejects a real artifact triggered ability', async () => {
  const f = position();
  const source = put(M, f.game, f.b, 'Solemn Simulacrum', 'hand');
  await f.game.move(source, 'battlefield');
  await f.game.flushTriggers();
  assert.ok(f.game.stack.some(so => so.srcCard === source && so.kind === 'trigger'));
  await f.game.priorityRound(f.b);
  assert.ok(f.windows.some(window => window.stack.some(so => so.source === 'Solemn Simulacrum' && so.kind === 'trigger')));
  assert.equal(f.windows.some(window => window.offered), false, 'artifact ETB triggers do not satisfy activated-ability wording');
  assert.equal(f.ayesha.tapped, false);
  assert.equal(source.zone, 'battlefield', 'the artifact ETB source stays on the battlefield');
  finished(f, 'Ayesha / artifact trigger is excluded');
});

test('unknown predicate kinds still fail closed after recognized stack-target fixes', () => {
  const f = position();
  const target = put(M, f.game, f.a, 'Grizzly Bears');
  const spec = M.OracleV20.helpers.genericTargetSpec({what: 'creature', controller: 'any', zone: 'battlefield', v20: {kind: 'unknown-dispatch-boundary-v90'}}, [], 0);
  assert.throws(() => spec.filter(f.game, target, f.a, f.ayesha), /Unknown Oracle v20 target predicate/);
  finished(f, 'unknown predicates remain errors');
});

test('all live registered target predicates safely inspect ordinary native candidate pools', () => {
  const f = position();
  const names = ['Grizzly Bears', 'Sol Ring', 'Plains', 'Llanowar Elves', 'Ajani Goldmane', 'Pacifism', 'Lightning Bolt', 'Giant Growth'];
  for (const player of [f.a, f.b]) for (const zone of ['battlefield', 'graveyard', 'hand', 'exile']) for (const name of names) {
    if (zone === 'battlefield' && ['Lightning Bolt', 'Giant Growth'].includes(name)) continue;
    put(M, f.game, player, name, zone);
  }
  const descriptors = [];
  for (const [name, def] of Object.entries(M.DEFS)) {
    const seen = new Set();
    function visit(value) {
      if (!value || typeof value !== 'object' || seen.has(value)) return;
      seen.add(value);
      if (value.v20?.kind) descriptors.push({name, node: value});
      for (const child of Object.values(value)) visit(child);
    }
    visit(def);
  }
  const checked = new Set();
  for (const {name, node} of descriptors) {
    const key = JSON.stringify(node);
    if (checked.has(key)) continue;
    checked.add(key);
    assert.doesNotThrow(() => {
      const spec = M.OracleV20.helpers.genericTargetSpec(node, [], 0);
      f.game.legalTargets(spec, f.ayesha, f.a);
    }, `${name}: recognized ${node.v20.kind} must reject ordinary negative candidates without throwing`);
  }
  assert.ok(checked.size > 190, 'the census includes the live catalog rather than a hand-picked predicate');
  traces.push({label: 'native candidate pool predicate census', distinctDescriptors: checked.size, candidateCardNames: names,
    limitation: 'Smoke check with ordinary native candidates; does not certify every ability or prerequisite state.'});
  assertGameStateInvariants(f.game, 'native candidate predicate census');
});

test.after(() => {
  const path = new URL('../output/engine-gap-audit-2026-10-09/', import.meta.url);
  mkdirSync(path, {recursive: true});
  writeFileSync(new URL('dispatch-native-proof.json', path), JSON.stringify({nativeDefinitions: ['Ayesha Tanaka', 'Icy Manipulator', "Dispeller's Capsule", 'Prodigal Pyromancer', 'Solemn Simulacrum'], traces}, null, 2));
});
