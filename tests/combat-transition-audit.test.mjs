import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { loadEngine } from './helpers/load-engine.mjs';
import { put } from './helpers/oracle-v8-fixtures.mjs';
import { assertGameStateInvariants } from './helpers/game-state-invariants.mjs';

const M = loadEngine(), UI = { ...M }, evidence = [];
runInNewContext(readFileSync(new URL('../src/modules/ui.js', import.meta.url), 'utf8'), {
  MTG: UI, document: { readyState: 'loading', addEventListener() {} },
  window: { addEventListener() {} },
});

// Use the native combat and priority loops, the human UI controller, printed
// spells, and untapped lands. Tests can select actions only when actually
// offered; combat flags and damage are never inserted by the fixture.
function table({ defending = false } = {}) {
  const game = new M.Game({ seed: 127156, paced: false });
  const basic = { decide: async (_g, q) => {
    if (q.type === 'priority') return { kind: 'pass' };
    if (q.type === 'chooseTargets') return q.candidates.slice(0, q.min || 0);
    if (q.type === 'chooseCards') return q.from.slice(0, q.min || 0);
    if (q.type === 'chooseOption') return q.options.find(row => row.key === 'yes')?.key || q.options[0]?.key;
    if (q.type === 'orderTriggers') return q.triggers;
    if (q.type === 'scry') return { top: q.cards, bottom: [] };
    if (q.type === 'chooseX') return q.min || 0;
    if (['attackers', 'blockers', 'combatReview'].includes(q.type)) return [];
    return null;
  } };
  const a = game.addPlayer('A', { name: 'A' }, basic, false);
  const others = Array.from({ length: 3 }, (_, i) => game.addPlayer('Opponent ' + i, { name: 'Opponent ' + i }, basic, false));
  const b = others[0], f = { game, a, b, others };
  for (const p of game.players) for (let i = 0; i < 30; i++) put(M, game, p, 'Forest', 'library');
  game.turnNo = 4;
  game.revealToHuman = async () => {};
  game.reviewGlobalEffectWithHuman = async () => {};
  game.paced = false; game.speedFactor = 0; game.turnPlayer = defending ? b : a;
  const decisions = [], windows = [], hits = [], snapshots = [];
  const ui = Object.assign(Object.create(UI.UI.prototype), {
    game, me: a, prioMode: 'full', manaMode: 'auto', pendings: [],
    focusDecisionView() {}, scrollPromptIntoView() {},
    render() {
      if (this.react) { this.takeReactWindow(); return; }
      const pending = this.pending;
      if (!pending) return;
      const q = pending.q;
      let answer;
      if (q.type === 'priority') {
        windows.push({ step: game.step, q });
        answer = f.priority?.(q) || { kind: 'pass' };
        if (answer.kind !== 'pass') decisions.push({ step: game.step, answer });
      } else if (q.type === 'main') answer = { kind: 'pass' };
      else if (q.type === 'attackers') answer = f.attackers?.(q) || [];
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
  const prior = b.controller.decide.bind(b.controller);
  b.controller.decide = (g, q) => q.type === 'attackers' ? f.opposingAttackers?.(q) || []
    : q.type === 'blockers' ? f.opposingBlockers?.(q) || [] : prior(g, q);
  const emit = game.emit.bind(game);
  game.emit = async (event, data, ...rest) => {
    if (event === 'damageToPlayer' && !game._damageEventQueue) hits.push({ step: game.step, src: data.src.name, player: data.player.name, n: data.n });
    if (event === 'combatDamageDone') snapshots.push({ step: game.step, cards: game.bf().map(c => ({
      iid: c.iid, name: c.name, ctrl: c.ctrl.name, attacking: c.attacking?.name || null,
      blocking: c.blocking, blockedBy: c.blockedBy.map(b => b.iid), damage: c.damage,
    })) });
    return emit(event, data, ...rest);
  };
  return Object.assign(f, { ui, decisions, windows, hits, snapshots,
    add: (name, owner = a, zone = 'battlefield') => put(M, game, owner, name, zone),
  });
}

function castAt(f, actions) {
  const remaining = actions.slice();
  let selectedTargets = [];
  f.chooseTargets = q => {
    const targets = selectedTargets.filter(card => q.candidates.includes(card));
    return targets.length ? targets : q.candidates.slice(0, q.min || 0);
  };
  f.priority = q => {
    const action = remaining[0];
    const entry = action && f.game.step === action.step && q.casts.find(row => row.card === action.card);
    if (!entry) return { kind: 'pass' };
    remaining.shift();
    selectedTargets = action.targets || [];
    action.before?.();
    return { kind: 'cast', card: entry.card, from: entry.from, alt: entry.alt, quickTargets: action.targets };
  };
  return remaining;
}

async function play(f, title, fullTurn = false) {
  if (fullTurn) await f.game.runTurn();
  else await f.game.combatPhase(f.game.turnPlayer);
  assert.equal(f.game.stack.length, 0);
  assert.equal(f.game.pendingTriggers.length, 0);
  assertGameStateInvariants(f.game, title);
  evidence.push({ title, nativeFullTurn: fullTurn, combatPhases: f.a.turnState.combatPhaseCount || f.b.turnState.combatPhaseCount,
    actions: f.decisions.map(d => ({ step: d.step, kind: d.answer.kind, card: d.answer.card?.name })),
    playerLife: f.game.players.map(p => ({ name: p.name, life: p.life })), hits: f.hits,
    snapshots: f.snapshots });
}

for (const defending of [false, true]) {
  test(`a first-strike ${defending ? 'blocker' : 'attacker'} with negative power cannot deal normal damage after a pump`, async t => {
    const f = table({ defending }), knight = f.add('Youthful Knight');
    const attacker = defending ? f.add('Grizzly Bears', f.b) : knight;
    const islands = [f.add('Island'), f.add('Island'), f.add('Island')], forest = f.add('Forest');
    const befuddle = f.add('Befuddle', f.a, 'hand'), growth = f.add('Giant Growth', f.a, 'hand');
    if (defending) { f.opposingAttackers = () => [{ card: attacker, target: f.a }]; f.blockers = () => [{ blocker: knight, attacker }]; }
    else f.attackers = () => [{ card: knight, target: f.b }];
    const remaining = castAt(f, [{ card: befuddle, step: 'blockers', targets: [knight] },
      { card: growth, step: 'firstStrike', targets: [knight], before: () => assert.equal(knight.power, -2) }]);
    await play(f, t.name);
    assert.equal(remaining.length, 0, 'both actions are available through actual priority questions');
    assert.equal(knight.power, 1);
    assert.equal(knight.zone, 'battlefield');
    assert.equal(f.b.life, 40);
    assert.equal(f.a.life, 40);
    assert.equal(attacker.damage, 0, 'the first striker assigns nothing in the second step');
    assert.ok([...islands, forest].every(card => card.tapped));
    assert.equal(befuddle.zone, 'graveyard'); assert.equal(growth.zone, 'graveyard');
  });
}

test('a first striker with exactly zero power cannot deal normal damage after a pump', async t => {
  const f = table(), attacker = f.add('Tundra Wolves');
  const lands = [f.add('Island'), f.add('Forest')];
  const distraction = f.add('Fleeting Distraction', f.a, 'hand'), growth = f.add('Giant Growth', f.a, 'hand');
  f.attackers = () => [{ card: attacker, target: f.b }];
  const remaining = castAt(f, [{ card: distraction, step: 'blockers', targets: [attacker] },
    { card: growth, step: 'firstStrike', targets: [attacker], before: () => assert.equal(attacker.power, 0) }]);
  await play(f, t.name);
  assert.equal(remaining.length, 0); assert.ok(lands.every(card => card.tapped));
  assert.equal(attacker.power, 3); assert.equal(f.b.life, 40);
});

for (const trampling of [false, true]) {
  test(`gaining control removes an opposing blocker before ${trampling ? 'trample' : 'ordinary'} damage`, async t => {
    const f = table(), attacker = f.add(trampling ? 'Colossal Dreadmaw' : 'Grizzly Bears');
    const blocker = f.add('Grizzly Bears', f.b), ray = f.add('Ray of Command', f.a, 'hand');
    const lands = Array.from({ length: 4 }, () => f.add('Island'));
    f.attackers = () => [{ card: attacker, target: f.b }];
    f.opposingBlockers = () => [{ blocker, attacker }];
    const remaining = castAt(f, [{ card: ray, step: 'blockers', targets: [blocker] }]);
    await play(f, t.name);
    assert.equal(remaining.length, 0); assert.ok(lands.every(card => card.tapped));
    assert.equal(blocker.ctrl === f.a, true); assert.equal(blocker.zone, 'battlefield');
    assert.equal(attacker.zone, 'battlefield');
    assert.equal(blocker.damage, 0); assert.equal(attacker.damage, 0);
    assert.equal(f.b.life, trampling ? 34 : 40);
    assert.equal(ray.zone, 'graveyard');
    const snapshot = f.snapshots.find(row => row.step === 'damage');
    assert.equal(snapshot.cards.find(card => card.iid === attacker.iid).blockedBy.length, 0);
  });
}

for (const trampling of [false, true]) {
  test(`a blinked blocker is a new object before ${trampling ? 'trample' : 'ordinary'} damage`, async t => {
    const f = table({ defending: true }), attacker = f.add(trampling ? 'Colossal Dreadmaw' : 'Grizzly Bears', f.b);
    const blocker = f.add('Grizzly Bears'), blink = f.add('Momentary Blink', f.a, 'hand');
    const lands = [f.add('Plains'), f.add('Island')], version = blocker.zoneVersion;
    f.opposingAttackers = () => [{ card: attacker, target: f.a }];
    f.blockers = () => [{ blocker, attacker }];
    const remaining = castAt(f, [{ card: blink, step: 'blockers', targets: [blocker] }]);
    await play(f, t.name);
    assert.equal(remaining.length, 0); assert.ok(lands.every(card => card.tapped));
    assert.equal(blocker.zoneVersion, version + 2); assert.equal(blocker.sick, true);
    assert.equal(blocker.zone, 'battlefield'); assert.equal(attacker.zone, 'battlefield');
    assert.equal(blocker.damage, 0); assert.equal(attacker.damage, 0);
    assert.equal(f.a.life, trampling ? 34 : 40);
  });
}

for (const trampling of [false, true]) {
  test(`a returned-to-hand blocker preserves blocked status for ${trampling ? 'trample' : 'ordinary'} damage`, async t => {
    const f = table({ defending: true }), attacker = f.add(trampling ? 'Colossal Dreadmaw' : 'Grizzly Bears', f.b);
    const blocker = f.add('Grizzly Bears'), bounce = f.add('Unsummon', f.a, 'hand'), land = f.add('Island');
    f.opposingAttackers = () => [{ card: attacker, target: f.a }]; f.blockers = () => [{ blocker, attacker }];
    const remaining = castAt(f, [{ card: bounce, step: 'blockers', targets: [blocker] }]);
    await play(f, t.name);
    assert.equal(remaining.length, 0); assert.equal(land.tapped, true);
    assert.equal(blocker.zone, 'hand'); assert.equal(attacker.zone, 'battlefield');
    assert.equal(attacker.damage, 0); assert.equal(f.a.life, trampling ? 34 : 40);
  });
}

test('an attacker gained during blockers stops attacking its new controller', async t => {
  const f = table({ defending: true }), attacker = f.add('Grizzly Bears', f.b), blocker = f.add('Grizzly Bears');
  const ray = f.add('Ray of Command', f.a, 'hand'), lands = Array.from({ length: 4 }, () => f.add('Island'));
  f.opposingAttackers = () => [{ card: attacker, target: f.a }]; f.blockers = () => [{ blocker, attacker }];
  const remaining = castAt(f, [{ card: ray, step: 'blockers', targets: [attacker] }]);
  await play(f, t.name);
  assert.equal(remaining.length, 0); assert.ok(lands.every(card => card.tapped));
  assert.equal(attacker.ctrl === f.a, true); assert.equal(attacker.zone, 'battlefield'); assert.equal(blocker.zone, 'battlefield');
  assert.equal(attacker.damage, 0); assert.equal(blocker.damage, 0); assert.equal(f.a.life, 40);
  const snapshot = f.snapshots.find(row => row.step === 'damage');
  assert.equal(snapshot.cards.find(card => card.iid === blocker.iid).blocking, null);
});

test('an ordinary simultaneous 2/2 combat still trades both creatures', async t => {
  const f = table(), attacker = f.add('Grizzly Bears'), blocker = f.add('Grizzly Bears', f.b);
  f.attackers = () => [{ card: attacker, target: f.b }]; f.opposingBlockers = () => [{ blocker, attacker }];
  await play(f, t.name);
  assert.equal(attacker.zone, 'graveyard'); assert.equal(blocker.zone, 'graveyard'); assert.equal(f.b.life, 40);
});

test('gaining first strike after that step still allows a regular creature its normal damage', async t => {
  const f = table(), knight = f.add('Youthful Knight'), bear = f.add('Grizzly Bears');
  const fury = f.add('Kindled Fury', f.a, 'hand'), land = f.add('Mountain');
  f.attackers = () => [{ card: knight, target: f.b }, { card: bear, target: f.b }];
  const remaining = castAt(f, [{ card: fury, step: 'firstStrike', targets: [bear], before: () => assert.equal(f.b.life, 38) }]);
  await play(f, t.name);
  assert.equal(remaining.length, 0); assert.equal(land.tapped, true);
  assert.equal(f.b.life, 35); assert.equal(bear.kw('first strike'), true);
});

for (const firstStriker of ['Youthful Knight', 'Fencing Ace']) {
  test(`${firstStriker} losing its strike ability after first damage does not deal normal damage`, async t => {
    const f = table(), attacker = f.add(firstStriker), frog = f.add('Turn to Frog', f.a, 'hand');
    const lands = [f.add('Island'), f.add('Island')];
    f.attackers = () => [{ card: attacker, target: f.b }];
    const remaining = castAt(f, [{ card: frog, step: 'firstStrike', targets: [attacker] }]);
    await play(f, t.name);
    assert.equal(remaining.length, 0); assert.ok(lands.every(card => card.tapped));
    assert.equal(attacker.power, 1); assert.equal(attacker.kw('first strike'), false); assert.equal(attacker.kw('double strike'), false);
    assert.equal(f.b.life, firstStriker === 'Youthful Knight' ? 38 : 39);
  });
}

test('a first striker gaining double strike between steps deals damage in both steps', async t => {
  const f = table(), attacker = f.add('Youthful Knight'), rage = f.add('Temur Battle Rage', f.a, 'hand');
  const lands = [f.add('Mountain'), f.add('Mountain')];
  f.attackers = () => [{ card: attacker, target: f.b }];
  const remaining = castAt(f, [{ card: rage, step: 'firstStrike', targets: [attacker] }]);
  await play(f, t.name);
  assert.equal(remaining.length, 0); assert.ok(lands.every(card => card.tapped));
  assert.equal(attacker.kw('double strike'), true); assert.equal(f.b.life, 36);
  assert.deepEqual(f.hits.map(hit => hit.n), [2, 2]);
});

test('a zero-power double striker pumped after the first step can deal normal damage', async t => {
  const f = table(), attacker = f.add('Samut, Voice of Dissent');
  const lands = [f.add('Island'), f.add('Island'), f.add('Island'), f.add('Forest')];
  const befuddle = f.add('Befuddle', f.a, 'hand'), growth = f.add('Giant Growth', f.a, 'hand');
  f.attackers = () => [{ card: attacker, target: f.b }];
  const remaining = castAt(f, [{ card: befuddle, step: 'blockers', targets: [attacker] },
    { card: growth, step: 'firstStrike', targets: [attacker], before: () => assert.equal(f.b.life, 40) }]);
  await play(f, t.name);
  assert.equal(remaining.length, 0); assert.ok(lands.every(card => card.tapped));
  assert.equal(attacker.power, 2); assert.equal(f.b.life, 38);
});

for (const trampling of [false, true]) {
  test(`phasing removes a blocker before ${trampling ? 'trample' : 'ordinary'} damage without a zone change`, async t => {
    const f = table({ defending: true }), attacker = f.add(trampling ? 'Colossal Dreadmaw' : 'Grizzly Bears', f.b);
    const blocker = f.add('Grizzly Bears'), slip = f.add('Slip Out the Back', f.a, 'hand'), land = f.add('Island');
    const version = blocker.zoneVersion;
    f.opposingAttackers = () => [{ card: attacker, target: f.a }]; f.blockers = () => [{ blocker, attacker }];
    const remaining = castAt(f, [{ card: slip, step: 'blockers', targets: [blocker] }]);
    await play(f, t.name);
    assert.equal(remaining.length, 0); assert.equal(land.tapped, true);
    assert.equal(blocker.zone, 'battlefield'); assert.equal(blocker.phasedOut, true); assert.equal(blocker.zoneVersion, version);
    assert.equal(blocker.blocking, null); assert.equal(attacker.damage, 0);
    assert.equal(f.a.life, trampling ? 34 : 40);
  });
}

test('a regenerated blocker leaves combat before the double striker deals normal damage', async t => {
  const f = table({ defending: true }), attacker = f.add('Samut, Voice of Dissent', f.b), blocker = f.add('Grizzly Bears');
  const regenerate = f.add('Regenerate', f.a, 'hand'), lands = [f.add('Forest'), f.add('Forest')];
  f.opposingAttackers = () => [{ card: attacker, target: f.a }]; f.blockers = () => [{ blocker, attacker }];
  const remaining = castAt(f, [{ card: regenerate, step: 'blockers', targets: [blocker] }]);
  await play(f, t.name);
  assert.equal(remaining.length, 0); assert.ok(lands.every(card => card.tapped));
  assert.equal(blocker.zone, 'battlefield'); assert.equal(blocker.tapped, true); assert.equal(blocker.damage, 0);
  assert.equal(blocker.regenShield, 0); assert.equal(attacker.damage, 0); assert.equal(f.a.life, 40);
});

test('a blocker of two attackers retains its remaining block when one attacker changes control', async t => {
  const f = table({ defending: true }), first = f.add('Grizzly Bears', f.b), second = f.add('Grizzly Bears', f.b);
  const blocker = f.add('Palace Guard'), ray = f.add('Ray of Command', f.a, 'hand');
  const lands = Array.from({ length: 4 }, () => f.add('Island'));
  f.opposingAttackers = () => [{ card: first, target: f.a }, { card: second, target: f.a }];
  f.blockers = () => [{ blocker, attacker: first }, { blocker, attacker: second }];
  const remaining = castAt(f, [{ card: ray, step: 'blockers', targets: [first] }]);
  await play(f, t.name);
  assert.equal(remaining.length, 0); assert.ok(lands.every(card => card.tapped));
  assert.equal(first.ctrl === f.a, true); assert.equal(first.damage, 0); assert.equal(second.damage, 1);
  assert.equal(blocker.damage, 2); assert.equal(blocker.zone, 'battlefield'); assert.equal(f.a.life, 40);
  const snapshot = f.snapshots.find(row => row.step === 'damage');
  assert.equal(snapshot.cards.find(card => card.iid === blocker.iid).blocking, second.iid);
  assert.equal(snapshot.cards.find(card => card.iid === first.iid).blockedBy.length, 0);
});

test('a blocker of two attackers retains its remaining block when the first striker blinks', async t => {
  const f = table(), first = f.add('Youthful Knight'), second = f.add('Grizzly Bears');
  const blocker = f.add('Palace Guard', f.b), blink = f.add('Momentary Blink', f.a, 'hand');
  const lands = [f.add('Plains'), f.add('Island')], version = first.zoneVersion;
  f.attackers = () => [{ card: first, target: f.b }, { card: second, target: f.b }];
  f.opposingBlockers = () => [{ blocker, attacker: first }, { blocker, attacker: second }];
  const remaining = castAt(f, [{ card: blink, step: 'firstStrike', targets: [first] }]);
  await play(f, t.name);
  assert.equal(remaining.length, 0); assert.ok(lands.every(card => card.tapped));
  assert.equal(first.zoneVersion, version + 2); assert.equal(first.zone, 'battlefield'); assert.equal(first.damage, 0);
  assert.equal(second.zone, 'battlefield'); assert.equal(second.damage, 1); assert.equal(blocker.zone, 'graveyard');
  assert.equal(f.b.life, 40);
});

test('Aurelia extra combat permits a blinked, previously blocked creature to attack and hit again', async t => {
  const f = table(), attacker = f.add('Grizzly Bears'), aurelia = f.add('Aurelia, the Warleader');
  const blocker = f.add('Grizzly Bears', f.b), blink = f.add('Momentary Blink', f.a, 'hand');
  f.add('Mass Hysteria'); f.add('Plains'); f.add('Island');
  f.attackers = q => [attacker, aurelia].filter(card => q.eligible.includes(card)).map(card => ({ card, target: f.b }));
  f.opposingBlockers = () => f.a.turnState.combatPhaseCount === 1 ? [{ blocker, attacker }] : [];
  const remaining = castAt(f, [{ card: blink, step: 'blockers', targets: [attacker] }]);
  await play(f, t.name, true);
  assert.equal(remaining.length, 0);
  assert.equal(f.a.turnState.combatPhaseCount, 2, 'the additional combat comes from Aurelia through native runTurn');
  assert.equal(attacker.zone, 'battlefield'); assert.equal(blocker.zone, 'battlefield');
  assert.equal(f.b.life, 32, 'Aurelia deals three twice and the new Bear deals two in the extra combat');
  assert.equal(f.hits.filter(hit => hit.src === 'Grizzly Bears').reduce((sum, hit) => sum + hit.n, 0), 2);
});

for (const position of ['attacking', 'blocking', 'blocking trample']) {
  test(`a devotion God that stops being a creature leaves combat while ${position}`, async t => {
    const defending = position !== 'attacking', f = table({ defending });
    const god = f.add('Thassa, God of the Sea'), djinn = f.add('Tempest Djinn');
    f.add('Faerie Seer'); const land = f.add('Island'), bounce = f.add('Unsummon', f.a, 'hand');
    assert.equal(f.game.devotion(f.a, ['U']), 5); assert.equal(god.is('Creature'), true);
    const attacker = defending ? f.add(position === 'blocking trample' ? 'Colossal Dreadmaw' : 'Grizzly Bears', f.b) : god;
    if (defending) { f.opposingAttackers = () => [{ card: attacker, target: f.a }]; f.blockers = () => [{ blocker: god, attacker }]; }
    else f.attackers = () => [{ card: god, target: f.b }];
    const remaining = castAt(f, [{ card: bounce, step: 'blockers', targets: [djinn] }]);
    await play(f, t.name);
    assert.equal(remaining.length, 0); assert.equal(land.tapped, true); assert.equal(djinn.zone, 'hand');
    assert.equal(god.is('Creature'), false); assert.equal(god.zone, 'battlefield');
    assert.equal(attacker.zone, 'battlefield'); assert.equal(attacker.damage, 0); assert.equal(god.damage, 0);
    assert.equal(f.b.life, 40); assert.equal(f.a.life, position === 'blocking trample' ? 34 : 40);
    const snapshot = f.snapshots.find(row => row.step === 'damage');
    assert.equal(snapshot.cards.find(card => card.iid === god.iid).attacking, null);
    assert.equal(snapshot.cards.find(card => card.iid === god.iid).blocking, null);
  });
}

test('a devotion God regaining creature status later in the same combat remains removed', async t => {
  const f = table(), god = f.add('Thassa, God of the Sea'), djinn = f.add('Tempest Djinn');
  f.add('Faerie Seer'); f.add('Vedalken Orrery');
  const lands = Array.from({ length: 4 }, () => f.add('Island'));
  const bounce = f.add('Unsummon', f.a, 'hand');
  assert.equal(god.is('Creature'), true);
  f.attackers = () => [{ card: god, target: f.b }];
  const remaining = castAt(f, [{ card: bounce, step: 'blockers', targets: [djinn] },
    { card: djinn, step: 'blockers', targets: [], before: () => assert.equal(god.is('Creature'), false) }]);
  await play(f, t.name);
  assert.equal(remaining.length, 0); assert.ok(lands.every(card => card.tapped));
  assert.equal(djinn.zone, 'battlefield'); assert.equal(djinn.sick, true); assert.equal(god.is('Creature'), true);
  assert.equal(f.b.life, 40);
});

test.after(() => {
  const output = new URL('../output/engine-gap-audit-2026-10-09/', import.meta.url);
  mkdirSync(output, { recursive: true });
  writeFileSync(new URL('combat-transitions.json', output), JSON.stringify({ scenarios: evidence }, null, 2) + '\n');
});
