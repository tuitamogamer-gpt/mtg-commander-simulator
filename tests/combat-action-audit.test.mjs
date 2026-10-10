import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { loadEngine } from './helpers/load-engine.mjs';
import { context, put } from './helpers/oracle-v8-fixtures.mjs';
import { assertGameStateInvariants } from './helpers/game-state-invariants.mjs';

const M = loadEngine();
const UI = { ...M };
runInNewContext(readFileSync(new URL('../src/modules/ui.js', import.meta.url), 'utf8'), {
  MTG: UI,
  document: { readyState: 'loading', addEventListener() {} },
  window: { addEventListener() {} },
});

// Run every combat and priority method normally, including the UI controller's
// automatic answers and reaction protocol. Action selection can happen only if
// a real prompt offers the entry. Sources are normal untapped permanents, with
// no artificial floating mana.
function table({ defending = false, mode = 'end' } = {}) {
  const f = context(M, 'human', 3);
  const { game, a, b } = f;
  delete game.priorityRound;
  game.paced = false;
  game.speedFactor = 0;
  game.turnPlayer = defending ? b : a;
  const windows = [], questions = [], activated = [], hits = [];
  const ui = Object.assign(Object.create(UI.UI.prototype), {
    game, me: a, prioMode: mode, manaMode: 'auto', pendings: [],
    focusDecisionView() {}, scrollPromptIntoView() {},
    render() {
      if (this.react) {
        windows.push({ step: game.step, q: this.react.q, reaction: true });
        this.takeReactWindow();
        return;
      }
      const pending = this.pending;
      if (!pending) return;
      const q = pending.q;
      questions.push({ step: game.step, q });
      let answer;
      if (q.type === 'priority') {
        windows.push({ step: game.step, q });
        answer = f.priority?.(q) || { kind: 'pass' };
        if (answer.kind !== 'pass') activated.push({ step: game.step, answer });
      } else if (q.type === 'attackers') answer = f.attackers?.(q) || [];
      else if (q.type === 'blockers') answer = f.blockers?.(q) || [];
      else if (q.type === 'chooseCards') answer = f.chooseCards?.(q) || q.from.slice(0, q.min || 0);
      else if (q.type === 'chooseTargets') answer = f.chooseTargets?.(q) || q.candidates.slice(0, q.min || 0);
      else if (q.type === 'chooseOption') answer = q.options.find(row => row.key === 'yes')?.key || q.options[0]?.key;
      else if (q.type === 'orderTriggers') answer = q.triggers;
      else if (q.type === 'scry') answer = { top: q.cards, bottom: [] };
      else if (q.type === 'chooseX') answer = q.min || 0;
      else if (q.type === 'combatReview') answer = [];
      else answer = null;
      this.resolvePending(answer);
    },
  });
  a.controller = ui.controllerFor(a);
  const emit = game.emit.bind(game);
  game.emit = async (event, data, ...rest) => {
    if (event === 'damageToPlayer' && !game._damageEventQueue) hits.push({ step: game.step, src: data.src, player: data.player, n: data.n });
    return emit(event, data, ...rest);
  };
  Object.assign(f, { ui, windows, questions, activated, hits,
    add: (name, owner = a, zone = 'battlefield') => put(M, game, owner, name, zone),
  });
  return f;
}

function oneActivation(f, card, step, predicate, targets) {
  let done = false;
  f.priority = q => {
    const entry = q.acts.find(row => row.card === card && predicate(row));
    if (!done && f.game.step === step && entry) {
      done = true;
      return { kind: 'activate', entry, ...(targets ? { targets } : {}) };
    }
    return { kind: 'pass' };
  };
}

async function play(f) {
  await f.game.combatPhase(f.game.turnPlayer);
  assert.equal(f.game.stack.length, 0);
  assert.equal(f.game.pendingTriggers.length, 0);
  assertGameStateInvariants(f.game);
}

for (const mode of ['end', 'full', 'off']) {
  test(`${mode}: a Vehicle can be crewed in beginning of combat and then attack`, async () => {
    const f = table({ mode }), vehicle = f.add("Smuggler's Copter"), donor = f.add('Grizzly Bears');
    if (mode === 'off') f.ui.holdNext = true; // ACTIONS explicitly requests this one window.
    donor.sick = true; // Crew uses a tap cost, not the donor's tap-symbol ability.
    oneActivation(f, vehicle, 'begin', row => row.crew);
    f.chooseCards = q => q.aiHint?.kind === 'crew' ? [donor] : undefined;
    f.attackers = q => q.eligible.includes(vehicle) ? [{ card: vehicle, target: f.b }] : [];
    await play(f);
    assert.ok(f.windows.some(row => row.step === 'begin' && row.q.acts.some(entry => entry.card === vehicle && entry.crew)));
    assert.equal(f.activated.length, 1);
    assert.equal(donor.tapped, true);
    assert.equal(vehicle.meta.crewedTurn, f.game.turnNo);
    assert.equal(f.b.life, 37);
    assert.ok(f.hits.some(row => row.src === vehicle && row.player === f.b && row.n === 3));
    assert.equal(Object.values(f.a.pool).reduce((n, value) => n + value, 0), 0);
  });
}

test('combat crew pays Suppression Field from actual untapped lands before becoming an attacker', async () => {
  const f = table(), vehicle = f.add("Smuggler's Copter"), donor = f.add('Grizzly Bears');
  const lands = [f.add('Island'), f.add('Island')];
  f.add('Suppression Field', f.b);
  oneActivation(f, vehicle, 'begin', row => row.crew);
  f.chooseCards = q => q.aiHint?.kind === 'crew' ? [donor] : undefined;
  f.attackers = q => q.eligible.includes(vehicle) ? [{ card: vehicle, target: f.b }] : [];
  await play(f);
  assert.equal(f.activated.length, 1);
  assert.equal(donor.tapped, true);
  assert.deepEqual(lands.map(card => card.tapped), [true, true]);
  assert.equal(Object.values(f.a.pool).reduce((n, value) => n + value, 0), 0);
  assert.equal(f.b.life, 37);
});

test('default profile: a Vehicle can be crewed on the opposing turn before declaring blockers', async () => {
  const f = table({ defending: true }), vehicle = f.add("Smuggler's Copter"), donor = f.add('Grizzly Bears');
  const attacker = f.add('Wind Drake', f.b);
  const prior = f.b.controller.decide.bind(f.b.controller);
  f.b.controller.decide = (g, q) => q.type === 'attackers' ? [{ card: attacker, target: f.a }] : prior(g, q);
  oneActivation(f, vehicle, 'attackers', row => row.crew);
  f.chooseCards = q => q.aiHint?.kind === 'crew' ? [donor] : undefined;
  f.blockers = q => q.potential.includes(vehicle) ? [{ blocker: vehicle, attacker }] : [];
  await play(f);
  assert.ok(f.windows.some(row => row.step === 'attackers' && row.q.acts.some(entry => entry.card === vehicle && entry.crew)));
  assert.equal(f.activated.length, 1);
  assert.equal(donor.tapped, true);
  assert.equal(vehicle.zone, 'battlefield');
  assert.equal(attacker.zone, 'graveyard');
  assert.equal(f.a.life, 40, 'the crewed Vehicle prevents the opposing attack damage');
});

for (const unavailable of ['tapped donor', 'insufficient power', 'disabled activation', 'unpaid ability tax']) {
  test(`crew is not offered with ${unavailable}`, async () => {
    const f = table(), vehicle = f.add("Smuggler's Copter"), donor = f.add('Grizzly Bears');
    if (unavailable === 'tapped donor') donor.tapped = true;
    if (unavailable === 'insufficient power') {
      await f.game.move(donor, 'graveyard');
      f.add('Ornithopter');
    }
    if (unavailable === 'disabled activation') {
      const needle = f.add('Pithing Needle', f.b, 'hand');
      const prior = f.b.controller.decide.bind(f.b.controller);
      f.b.controller.decide = (g, q) => q.type === 'chooseOption' && q.prompt?.startsWith('Pithing Needle:')
        ? vehicle.name : prior(g, q);
      await f.game.putPermanentOntoBattlefield(needle, f.b);
      assert.ok(M.OracleV22Permanents.selected(needle).includes(vehicle.name));
    }
    if (unavailable === 'unpaid ability tax') f.add('Suppression Field', f.b);
    f.game.recalc();
    f.attackers = () => [];
    await play(f);
    assert.equal(f.windows.some(row => row.q.acts.some(entry => entry.card === vehicle && entry.crew)), false);
    assert.equal(vehicle.meta.crewedTurn, undefined);
  });
}

for (const support of ['Leonin Shikari', 'Brass Squire']) {
  test(`default profile: ${support} can attach Equipment after blockers before first-strike damage`, async () => {
    const f = table(), attacker = f.add('Fencing Ace'), equipment = f.add('Bonesplitter'), enabler = f.add(support);
    const blocker = f.add('Grizzly Bears', f.b), land = f.add('Plains');
    f.attackers = () => [{ card: attacker, target: f.b }];
    const prior = f.b.controller.decide.bind(f.b.controller);
    f.b.controller.decide = (g, q) => q.type === 'blockers' ? [{ blocker, attacker }] : prior(g, q);
    if (support === 'Leonin Shikari') oneActivation(f, equipment, 'blockers', row => row.equip, [attacker]);
    else oneActivation(f, enabler, 'blockers', row => !!row.ability, [equipment, attacker]);
    await play(f);
    assert.equal(f.activated.length, 1);
    assert.equal(equipment.attachedTo, attacker.iid);
    assert.equal(attacker.zone, 'battlefield');
    assert.equal(blocker.zone, 'graveyard', 'Equipment boosts first-strike damage before the blocker can deal damage');
    assert.equal(f.b.life, 40, 'a blocked nontrampling creature does not hit the player');
    if (support === 'Leonin Shikari') assert.equal(land.tapped, true);
    else {
      assert.equal(enabler.tapped, true);
      assert.equal(land.tapped, false);
    }
  });
}

test('ordinary equip retains sorcery timing during combat', async () => {
  const f = table(), attacker = f.add('Fencing Ace'), equipment = f.add('Bonesplitter');
  f.add('Plains');
  f.attackers = () => [{ card: attacker, target: f.b }];
  await play(f);
  assert.equal(f.windows.some(row => row.q.acts.some(entry => entry.card === equipment && entry.equip)), false);
  assert.equal(equipment.attachedTo, null);
  assert.equal(f.b.life, 38);
});

test('default profile: an instant can change normal damage after first-strike damage has resolved', async () => {
  const f = table(), attacker = f.add('Fencing Ace'), land = f.add('Forest'), spell = f.add('Giant Growth', f.a, 'hand');
  let cast = false;
  f.attackers = () => [{ card: attacker, target: f.b }];
  f.priority = q => {
    const entry = q.casts.find(row => row.card === spell);
    if (!cast && f.game.step === 'firstStrike' && entry) {
      assert.equal(f.b.life, 39, 'first-strike damage has happened before this priority window');
      cast = true;
      return { kind: 'cast', card: spell, from: entry.from, alt: entry.alt, quickTargets: [attacker] };
    }
    return { kind: 'pass' };
  };
  await play(f);
  assert.equal(cast, true);
  assert.equal(land.tapped, true);
  assert.equal(spell.zone, 'graveyard');
  assert.deepEqual(f.hits.filter(row => row.src === attacker).map(row => row.n), [1, 4]);
  assert.equal(f.b.life, 35);
});

test('default profile: tapping a prospective blocker after attackers prevents its block', async () => {
  const f = table(), attacker = f.add('Grizzly Bears'), tapper = f.add('Icy Manipulator'), blocker = f.add('Grizzly Bears', f.b);
  const land = f.add('Island');
  f.attackers = () => [{ card: attacker, target: f.b }];
  const prior = f.b.controller.decide.bind(f.b.controller);
  f.b.controller.decide = (g, q) => q.type === 'blockers'
    ? (q.potential.includes(blocker) ? [{ blocker, attacker }] : []) : prior(g, q);
  oneActivation(f, tapper, 'attackers', row => !!row.ability, [blocker]);
  await play(f);
  assert.equal(f.activated.length, 1);
  assert.equal(tapper.tapped, true);
  assert.equal(land.tapped, true);
  assert.equal(blocker.tapped, true);
  assert.equal(attacker.zone, 'battlefield');
  assert.equal(blocker.zone, 'battlefield');
  assert.equal(f.b.life, 38);
});
