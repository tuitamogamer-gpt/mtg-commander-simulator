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
  const decisions = [], windows = [], hits = [], snapshots = [], combatHits = [], groups = [], coins = [];
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
      } else if (q.type === 'main') answer = f.main?.(q) || { kind: 'done' };
      else if (q.type === 'attackers') answer = f.attackers?.(q) || [];
      else if (q.type === 'blockers') answer = f.blockers?.(q) || [];
      else if (q.type === 'chooseCards') answer = f.chooseCards?.(q) || q.from.slice(0, q.min || 0);
      else if (q.type === 'chooseTargets') answer = f.chooseTargets?.(q) || q.candidates.slice(0, q.min || 0);
      else if (q.type === 'chooseOption') answer = f.chooseOption?.(q) ?? (q.options.find(row => row.key === 'yes')?.key || q.options[0]?.key);
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
    : q.type === 'blockers' ? f.opposingBlockers?.(q) || []
    : q.type === 'chooseCards' && f.opposingChooseCards ? f.opposingChooseCards(q)
    : q.type === 'main' && f.opposingMain ? f.opposingMain(q)
    : q.type === 'chooseTargets' && f.opposingChooseTargets ? f.opposingChooseTargets(q) : prior(g, q);
  const emit = game.emit.bind(game);
  game.emit = async (event, data, ...rest) => {
    if (event === 'coinFlipped') coins.push(data);
    if (event === 'combatDamageToPlayer') combatHits.push(data);
    if (event === 'combatDamageGroupToPlayer') groups.push(data);
    if (event === 'damageToPlayer' && !game._damageEventQueue) hits.push({ step: game.step, src: data.src.name, player: data.player.name, n: data.n });
    if (event === 'combatDamageDone') snapshots.push({ step: game.step, cards: game.bf().map(c => ({
      iid: c.iid, name: c.name, ctrl: c.ctrl.name, attacking: c.attacking?.name || null,
      blocking: c.blocking, blockedBy: c.blockedBy.map(b => b.iid), damage: c.damage,
    })) });
    return emit(event, data, ...rest);
  };
  return Object.assign(f, { ui, decisions, windows, hits, snapshots, combatHits, groups, coins,
    add: (name, owner = a, zone = 'battlefield') => put(M, game, owner, name, zone),
  });
}

function castAt(f, actions) {
  const remaining = actions.slice();
  let selectedTargets = [];
  f.chooseTargets = q => {
    if (q.quickTarget && q.candidates.includes(q.quickTarget)) return [q.quickTarget];
    const targets = selectedTargets.filter(card => q.candidates.includes(card));
    return targets.length ? targets.slice(0, q.max || targets.length) : q.candidates.slice(0, q.min || 0);
  };
  f.priority = q => {
    const action = remaining[0];
    const entry = action && f.game.step === action.step && q.casts.find(row => row.card === action.card);
    if (!entry) return { kind: 'pass' };
    remaining.shift();
    selectedTargets = action.targets || [];
    action.before?.();
    return { kind: 'cast', card: entry.card, from: entry.from, alt: entry.alt, quickTargets: action.targets, ...(action.xVal !== undefined ? { xVal: action.xVal } : {}) };
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
    playerLife: f.game.players.map(p => ({ name: p.name, life: p.life, poison: p.poison || 0 })), hits: f.hits,
    coins: f.coins.map(row => ({ source: row.source?.name, call: row.call, heads: row.heads, won: row.won })),
    snapshots: f.snapshots });
}


for (const floor of ['Worship', "Angel's Grace"]) {
  for (const unblockedFirst of [true, false]) {
    test(`${floor}: lifelink and life loss from the same combat event are simultaneous (${unblockedFirst ? 'unblocked' : 'blocked'} first)`, async t => {
      const f = table({ defending: true });
      const open = f.add('Grizzly Bears', f.b), blocked = f.add('Grizzly Bears', f.b);
      const lifelinker = f.add('Vampire Nighthawk');
      f.a.life = 1;
      f.opposingAttackers = () => (unblockedFirst ? [open, blocked] : [blocked, open]).map(card => ({ card, target: f.a }));
      f.blockers = () => [{ blocker: lifelinker, attacker: blocked }];
      let grace, land, remaining;
      if (floor === 'Worship') f.add(floor);
      else {
        grace = f.add(floor, f.a, 'hand'); land = f.add('Plains');
        remaining = castAt(f, [{ card: grace, step: 'blockers' }]);
      }
      await play(f, t.name);
      if (remaining) { assert.equal(remaining.length, 0); assert.equal(grace.zone, 'graveyard'); assert.equal(land.tapped, true); }
      assert.equal(f.a.life, 1, 'simultaneous two life gained and two lost leave life at one');
      assert.equal(lifelinker.zone, 'battlefield'); assert.equal(blocked.zone, 'graveyard');
      assert.equal(f.hits.reduce((n, hit) => n + hit.n, 0), 2);
    });
  }
}

test('Phyrexian Unlife evaluates all simultaneous incoming combat damage before life is reduced', async t => {
  const f = table({ defending: true }), one = f.add('Grizzly Bears', f.b), two = f.add('Grizzly Bears', f.b);
  f.add('Phyrexian Unlife'); f.a.life = 1;
  f.opposingAttackers = () => [one, two].map(card => ({ card, target: f.a }));
  await play(f, t.name);
  assert.equal(f.a.life, -3); assert.equal(f.a.poison || 0, 0);
  assert.equal(f.a.lost, false);
});


test('Reflect Damage creates combat recipient events for damage redirected from a blocking creature to a player', async t => {
  const f = table({ defending: true });
  const anowon = f.add('Anowon, the Ruin Thief', f.b), rogue = f.add("Oona's Blackguard", f.b);
  const blocker = f.add('Vampire Nighthawk'), reflect = f.add('Reflect Damage', f.a, 'hand');
  const lands = ['Mountain', 'Plains', 'Forest', 'Forest', 'Forest'].map(name => f.add(name));
  const initialLibrary = f.b.library.length;
  f.opposingAttackers = () => [{ card: rogue, target: f.a }];
  f.blockers = () => [{ blocker, attacker: rogue }];
  f.chooseOption = q => q.prompt === 'Choose a source of damage' ? q.options.find(row => row.card === rogue)?.key : undefined;
  const remaining = castAt(f, [{ card: reflect, step: 'blockers' }]);
  await play(f, t.name);
  assert.equal(remaining.length, 0); assert.equal(reflect.zone, 'graveyard'); assert.ok(lands.every(card => card.tapped));
  assert.equal(f.a.life, 42); assert.equal(f.b.life, 38); assert.equal(blocker.damage, 0);
  assert.equal(f.combatHits.length, 1); assert.equal(f.combatHits[0].player, f.b); assert.equal(f.combatHits[0].card, rogue);
  assert.equal(f.groups.length, 1); assert.equal(f.groups[0].player, f.b);
  assert.equal(f.b.library.length, initialLibrary - 2, 'Anowon receives the actual redirected player group and mills two');
  assert.equal(anowon.zone, 'battlefield');
});


for (const preventable of [true, false]) {
  test(`an animated creature planeswalker applies ${preventable ? 'prevented' : 'unpreventable'} damage to both creature and loyalty results`, async t => {
    const f = table(), gideon = f.add('Gideon of the Trials'), blocker = f.add('Grizzly Bears', f.b);
    // A planeswalker already on the table has its printed starting loyalty.
    gideon.counters.loyalty = Number(gideon.def.loyalty); f.game.recalc();
    f.game.phase = 'main1'; f.game.step = 'main';
    const ability = f.game.activatableList(f.a).find(row => row.card === gideon && row.ability === gideon.def.abilities[1]);
    assert.ok(ability); assert.equal(await f.game.activateAbility(f.a, ability), true);
    await f.game.priorityRound(f.a);
    assert.ok(gideon.is('Creature') && gideon.is('Planeswalker') && gideon.kw('indestructible'));
    f.attackers = () => [{ card: gideon, target: f.b }];
    f.opposingBlockers = () => [{ blocker, attacker: gideon }];
    let remaining, skull, lands;
    if (!preventable) {
      skull = f.add('Skullcrack', f.a, 'hand'); lands = [f.add('Mountain'), f.add('Forest')];
      remaining = castAt(f, [{ card: skull, step: 'blockers', targets: [f.b] }]);
    }
    await play(f, t.name);
    if (remaining) { assert.equal(remaining.length, 0); assert.ok(lands.every(c => c.tapped)); assert.equal(skull.zone, 'graveyard'); }
    assert.equal(gideon.zone, 'battlefield'); assert.equal(blocker.zone, 'graveyard');
    assert.equal(gideon.counters.loyalty, preventable ? 3 : 1);
    assert.equal(gideon.damage, preventable ? 0 : 2, 'a creature planeswalker receives marked damage as well as losing loyalty');
  });
}


test('an animated creature planeswalker receives infect counters and loyalty loss from one combat hit', async t => {
  const f = table(), gideon = f.add('Gideon of the Trials'), blocker = f.add('Flensermite', f.b);
  f.add('Questing Beast', f.b);
  gideon.counters.loyalty = Number(gideon.def.loyalty); f.game.recalc();
  f.game.phase = 'main1'; f.game.step = 'main';
  const action = f.game.activatableList(f.a).find(row => row.card === gideon && row.ability === gideon.def.abilities[1]);
  assert.ok(action); assert.equal(await f.game.activateAbility(f.a, action), true); await f.game.priorityRound(f.a);
  f.attackers = () => [{ card: gideon, target: f.b }]; f.opposingBlockers = () => [{ blocker, attacker: gideon }];
  await play(f, t.name);
  assert.equal(gideon.zone, 'battlefield'); assert.equal(gideon.counters.loyalty, 2);
  assert.equal(gideon.counters['-1/-1'], 1); assert.equal(gideon.damage, 0);
  assert.equal(f.b.life, 41, 'the Flensermite gains life once for its one hit');
});

test('a creature battle applies marked creature damage and defense removal together', async t => {
  const f = table({ defending: true }), attacker = f.add('Grizzly Bears', f.b);
  const battle = f.add('Invasion of Dominaria // Serra Faithkeeper'); battle.counters.defense = 4;
  f.add('Enchanted Evening'); f.add('Opalescence'); f.game.recalc();
  assert.ok(battle.is('Creature') && battle.is('Battle')); assert.equal(battle.toughness, 3);
  f.opposingAttackers = () => [{ card: attacker, target: f.a }]; f.blockers = () => [{ blocker: battle, attacker }];
  await play(f, t.name);
  assert.equal(battle.zone, 'battlefield'); assert.equal(attacker.zone, 'graveyard');
  assert.equal(battle.counters.defense, 2); assert.equal(battle.damage, 2);
});


for (const masako of [false, true]) {
  test(`${masako ? 'Masako permits' : 'ordinary combat excludes'} a tapped creature in the actual blocker declaration`, async t => {
    const f = table({ defending: true }), attacker = f.add('Grizzly Bears', f.b), blocker = f.add('Grizzly Bears');
    blocker.tapped = true;
    if (masako) f.add('Masako the Humorless');
    // Keep an ordinary untapped creature present so both native declarations run.
    f.add('Ornithopter'); f.game.recalc();
    f.opposingAttackers = () => [{ card: attacker, target: f.a }];
    let question;
    f.blockers = q => { question = q; return [{ blocker, attacker }]; };
    await play(f, t.name);
    assert.ok(question); assert.equal(question.potential.includes(blocker), masako);
    assert.equal(f.a.life, masako ? 40 : 38); assert.equal(blocker.zone, masako ? 'graveyard' : 'battlefield');
    assert.equal(attacker.zone, masako ? 'graveyard' : 'battlefield');
  });
}


test('losing Masako’s abilities before declaration removes permission to block with a tapped creature', async t => {
  const f = table({ defending: true }), attacker = f.add('Grizzly Bears', f.b), blocker = f.add('Grizzly Bears');
  blocker.tapped = true; f.add('Masako the Humorless'); f.add('Ornithopter');
  const dress = f.add('Dress Down', f.a, 'hand'), lands = [f.add('Island'), f.add('Forest')];
  f.opposingAttackers = () => [{ card: attacker, target: f.a }];
  let question; f.blockers = q => { question = q; return [{ blocker, attacker }]; };
  const remaining = castAt(f, [{ card: dress, step: 'begin' }]);
  await play(f, t.name);
  assert.equal(remaining.length, 0); assert.ok(lands.every(c => c.tapped)); assert.equal(dress.zone, 'battlefield');
  assert.ok(question); assert.equal(question.potential.includes(blocker), false); assert.equal(f.a.life, 38);
});

for (const preventedFirst of [true, false]) {
  test(`the CR120.4d Worship and Awe Strike example resolves one net life event (${preventedFirst ? 'prevented' : 'unprevented'} assignment first)`, async t => {
    const f = table({ defending: true }), prevented = f.add('Charging Monstrosaur', f.b), other = f.add('Charging Monstrosaur', f.b);
    f.add('Worship'); f.add('Ornithopter'); f.a.life = 2;
    const awe = f.add('Awe Strike', f.a, 'hand'), plains = f.add('Plains');
    f.opposingAttackers = () => (preventedFirst ? [prevented, other] : [other, prevented]).map(card => ({ card, target: f.a }));
    const remaining = castAt(f, [{ card: awe, step: 'blockers', targets: [prevented] }]);
    await play(f, t.name);
    assert.equal(remaining.length, 0); assert.equal(plains.tapped, true); assert.equal(awe.zone, 'graveyard');
    assert.equal(f.a.life, 2); assert.equal(f.a.lost, false); assert.equal(f.hits.length, 1); assert.equal(f.hits[0].n, 5);
  });
}

for (const protectedBlocker of [false, true]) {
  test(`trample and deathtouch assign lethal through ${protectedBlocker ? 'protection' : 'indestructible'}, while lifelink uses actual damage`, async t => {
    const f = table(), attacker = f.add(protectedBlocker ? 'Charging Monstrosaur' : 'Colossal Dreadmaw');
    const blocker = f.add(protectedBlocker ? 'Silver Knight' : 'Darksteel Sentinel', f.b), collar = f.add('Basilisk Collar'), pridemate = f.add("Ajani\'s Pridemate");
    const lands = [f.add('Wastes'), f.add('Wastes')]; f.game.phase = 'main1'; f.game.step = 'main';
    f.chooseTargets = q => q.candidates.includes(attacker) ? [attacker] : q.candidates.slice(0, q.min || 0);
    const equip = f.game.activatableList(f.a).find(row => row.card === collar && row.equip !== undefined);
    assert.ok(equip); assert.equal(await f.game.activateAbility(f.a, equip), true); await f.game.priorityRound(f.a);
    assert.equal(collar.attachedTo, attacker.iid); assert.ok(lands.every(c => c.tapped));
    f.attackers = () => [{ card: attacker, target: f.b }]; f.opposingBlockers = () => [{ blocker, attacker }];
    await play(f, t.name);
    assert.equal(attacker.zone, 'battlefield'); assert.equal(blocker.zone, 'battlefield');
    assert.equal(blocker.damage, protectedBlocker ? 0 : 1); assert.equal(f.b.life, protectedBlocker ? 36 : 35);
    assert.equal(f.a.life, protectedBlocker ? 44 : 46); assert.equal(blocker.deathtouched, false);
    assert.equal(pridemate.counters['+1/+1'], 1, 'one source produces one lifelink gain even when it damages two recipients');
  });
}

test('simultaneous lifelink saves a defender before lethal life-total state based actions', async t => {
  const f = table({ defending: true }), open = f.add('Grizzly Bears', f.b), blocked = f.add('Grizzly Bears', f.b), lifelinker = f.add('Vampire Nighthawk');
  f.a.life = 1; f.opposingAttackers = () => [open, blocked].map(card => ({ card, target: f.a }));
  f.blockers = () => [{ blocker: lifelinker, attacker: blocked }]; await play(f, t.name);
  assert.equal(f.a.life, 1); assert.equal(f.a.lost, false); assert.equal(lifelinker.zone, 'battlefield');
});


for (const preventedFirst of [true, false]) {
  test(`Phyrexian Unlife retains the pre-event life condition across simultaneous Awe Strike gains (${preventedFirst ? 'prevented' : 'unprevented'} assignment first)`, async t => {
    const f = table({ defending: true }), prevented = f.add('Charging Monstrosaur', f.b), other = f.add('Charging Monstrosaur', f.b);
    f.add('Phyrexian Unlife'); f.a.life = 0;
    const awe = f.add('Awe Strike', f.a, 'hand'), plains = f.add('Plains');
    f.opposingAttackers = () => (preventedFirst ? [prevented, other] : [other, prevented]).map(card => ({ card, target: f.a }));
    const remaining = castAt(f, [{ card: awe, step: 'blockers', targets: [prevented] }]);
    await play(f, t.name);
    assert.equal(remaining.length, 0); assert.equal(plains.tapped, true); assert.equal(awe.zone, 'graveyard');
    assert.equal(f.a.life, 5); assert.equal(f.a.poison, 5); assert.equal(f.a.lost, false);
    const shock = f.add('Shock', f.b, 'hand'), mountain = f.add('Mountain', f.b);
    assert.equal(await f.game.castSpell(f.b, shock, { from: 'hand', quickTargets: [f.a] }), true);
    await f.game.priorityRound(f.b);
    assert.equal(shock.zone, 'graveyard'); assert.equal(mountain.tapped, true);
    assert.equal(f.a.life, 3); assert.equal(f.a.poison, 5, 'a separate later damage event sees the gained life');
    assertGameStateInvariants(f.game, t.name + ': later Shock');

  });
}


test('two lifelink sources create two native life-gain triggers during the same damage step', async t => {
  const f = table(), one = f.add('Vampire Nighthawk'), two = f.add('Vampire Nighthawk'), pridemate = f.add("Ajani's Pridemate");
  f.attackers = () => [one, two].map(card => ({ card, target: f.b }));
  await play(f, t.name);
  assert.equal(f.a.life, 44); assert.equal(f.b.life, 36); assert.equal(pridemate.counters['+1/+1'], 2);
});


for (const call of ['heads', 'tails']) {
  test(`Impulsive Maneuvers’ native ${call} call modifies all recipients of the next combat damage event`, async t => {
    const f = table(), attacker = f.add('Colossal Dreadmaw'), blocker = f.add('Grizzly Bears', f.b);
    const maneuvers = f.add('Impulsive Maneuvers');
    f.chooseOption = q => q.aiHint?.kind === 'coinCall' ? call : undefined;
    f.attackers = () => [{ card: attacker, target: f.b }]; f.opposingBlockers = () => [{ blocker, attacker }];
    await play(f, t.name);
    const flip = f.coins.find(row => row.source === maneuvers); assert.ok(flip); assert.equal(flip.call, call);
    assert.equal(f.b.life, flip.won ? 32 : 40);
    assert.equal(blocker.zone, flip.won ? 'graveyard' : 'battlefield');
    assert.equal(attacker.damage, 2); assert.equal(attacker.zone, 'battlefield');
  });
}


for (const suppressed of [false, true]) {
  test(`Sidar Kondo’s printed blocking restriction ${suppressed ? 'ends after paid ability loss' : 'applies while active'}`, async t => {
    const f = table(), attacker = f.add('Grizzly Bears'), blocker = f.add('Grizzly Bears', f.b), sidar = f.add('Sidar Kondo of Jamuraa');
    f.attackers = () => [{ card: attacker, target: f.b }]; f.opposingBlockers = () => [{ blocker, attacker }];
    let remaining, dress, lands;
    if (suppressed) {
      dress = f.add('Dress Down', f.a, 'hand'); lands = [f.add('Island'), f.add('Forest')];
      remaining = castAt(f, [{ card: dress, step: 'begin' }]);
    }
    await play(f, t.name);
    if (remaining) { assert.equal(remaining.length, 0); assert.ok(lands.every(c => c.tapped)); assert.equal(sidar.cur.abilitiesDisabled, true); }
    assert.equal(f.b.life, suppressed ? 40 : 38);
    assert.equal(attacker.zone, suppressed ? 'graveyard' : 'battlefield'); assert.equal(blocker.zone, suppressed ? 'graveyard' : 'battlefield');
  });
}

for (const suppressed of [false, true]) {
  test(`Queen Mother Ramonda’s printed attack restriction ${suppressed ? 'ends after paid ability loss' : 'applies while active'}`, async t => {
    const f = table(), attacker = f.add('Grizzly Bears'), queen = f.add('Queen Mother Ramonda', f.b);
    await f.game.becomeMonarch(f.b, { source: queen });
    f.attackers = () => [{ card: attacker, target: f.b }];
    let remaining, lands;
    if (suppressed) {
      const dress = f.add('Dress Down', f.a, 'hand'); lands = [f.add('Island'), f.add('Forest')];
      remaining = castAt(f, [{ card: dress, step: 'begin' }]);
    }
    await play(f, t.name);
    if (remaining) { assert.equal(remaining.length, 0); assert.ok(lands.every(c => c.tapped)); assert.equal(queen.cur.abilitiesDisabled, true); }
    assert.equal(f.b.life, suppressed ? 38 : 40); assert.equal(f.game.monarch, suppressed ? f.a : f.b);
  });
}

for (const suppressed of [false, true]) {
  test(`Galactus’ printed attack destination restriction ${suppressed ? 'ends after paid ability loss' : 'applies while active'}`, async t => {
    const f = table(), attacker = f.add('Galactus, Devourer of Worlds');
    f.others[1].life = 50;
    f.attackers = () => [{ card: attacker, target: f.b }];
    let remaining, lands;
    if (suppressed) {
      const dress = f.add('Dress Down', f.a, 'hand'); lands = [f.add('Island'), f.add('Forest')];
      remaining = castAt(f, [{ card: dress, step: 'begin' }]);
    }
    await play(f, t.name);
    if (remaining) { assert.equal(remaining.length, 0); assert.ok(lands.every(c => c.tapped)); assert.equal(attacker.cur.abilitiesDisabled, true); }
    assert.equal(f.b.life, suppressed ? 40 - attacker.power : 40);
    if (!suppressed) assert.equal(f.others[1].life, 50 - attacker.power, 'the printed requirement instead forces a legal highest-life destination');
  });
}


for (const suppressed of [false, true]) {
  test(`Baldin’s printed toughness combat rule ${suppressed ? 'ends after paid ability loss' : 'applies while active'}`, async t => {
    const f = table(), attacker = f.add('Yoked Ox'), baldin = f.add('Baldin, Century Herdmaster');
    f.attackers = () => [{ card: attacker, target: f.b }];
    let remaining, lands;
    if (suppressed) {
      const dress = f.add('Dress Down', f.a, 'hand'); lands = [f.add('Island'), f.add('Forest')];
      remaining = castAt(f, [{ card: dress, step: 'begin' }]);
    }
    await play(f, t.name);
    if (remaining) { assert.equal(remaining.length, 0); assert.ok(lands.every(c => c.tapped)); assert.equal(baldin.cur.abilitiesDisabled, true); }
    assert.equal(f.b.life, suppressed ? 40 : 36);
  });
}

for (const suppressed of [false, true]) {
  test(`Assault Formation’s printed toughness combat rule ${suppressed ? 'ends after paid Song of the Dryads' : 'applies while active'}`, async t => {
    const f = table(), attacker = f.add('Yoked Ox'), formation = f.add('Assault Formation');
    f.attackers = () => [{ card: attacker, target: f.b }];
    if (suppressed) {
      const song = f.add('Song of the Dryads', f.a, 'hand'), lands = [f.add('Forest'), f.add('Forest'), f.add('Forest')];
      f.game.phase = 'main1'; f.game.step = 'main'; f.chooseTargets = q => q.candidates.includes(formation) ? [formation] : q.candidates.slice(0, q.min || 0);
      assert.ok(f.game.castableList(f.a).some(row => row.card === song));
      assert.equal(await f.game.castSpell(f.a, song, { from: 'hand', quickTargets: [formation] }), true); await f.game.priorityRound(f.a);
      assert.ok(lands.every(c => c.tapped)); assert.equal(song.attachedTo, formation.iid); assert.equal(formation.cur.abilitiesDisabled, true);
    }
    await play(f, t.name); assert.equal(f.b.life, suppressed ? 40 : 36);
  });
}

for (const suppressed of [false, true]) {
  test(`Elusive Otter’s restriction stays on its own active copy ${suppressed ? 'after paid Snakeform' : 'while active'}`, async t => {
    const f = table(), attacker = f.add('Elusive Otter'), other = f.add('Elusive Otter', f.others[1]), blocker = f.add('Ornithopter', f.b);
    f.attackers = () => [{ card: attacker, target: f.b }]; f.opposingBlockers = () => [{ blocker, attacker }];
    let remaining, lands;
    if (suppressed) {
      const snake = f.add('Snakeform', f.a, 'hand'); lands = Array.from({ length: 3 }, () => f.add('Forest'));
      remaining = castAt(f, [{ card: snake, step: 'begin', targets: [attacker] }]);
    }
    await play(f, t.name);
    assert.equal(other.cur.abilitiesDisabled, false);
    if (remaining) { assert.equal(remaining.length, 0); assert.ok(lands.every(c => c.tapped)); assert.equal(attacker.cur.abilitiesDisabled, true); }
    assert.equal(f.b.life, suppressed ? 40 : 39); assert.equal(blocker.zone, suppressed ? 'graveyard' : 'battlefield');
  });
}

for (const suppressed of [false, true]) {
  test(`Brazen Borrower’s restriction stays on its own active copy ${suppressed ? 'after paid Snakeform' : 'while active'}`, async t => {
    const f = table({ defending: true }), attacker = f.add('Grizzly Bears', f.b), blocker = f.add('Brazen Borrower'), other = f.add('Brazen Borrower', f.others[1]);
    f.opposingAttackers = () => [{ card: attacker, target: f.a }]; f.blockers = () => [{ blocker, attacker }];
    let remaining, lands;
    if (suppressed) {
      const snake = f.add('Snakeform', f.a, 'hand'); lands = Array.from({ length: 3 }, () => f.add('Forest'));
      remaining = castAt(f, [{ card: snake, step: 'begin', targets: [blocker] }]);
    }
    await play(f, t.name);
    assert.equal(other.cur.abilitiesDisabled, false);
    if (remaining) { assert.equal(remaining.length, 0); assert.ok(lands.every(c => c.tapped)); assert.equal(blocker.cur.abilitiesDisabled, true); }
    assert.equal(f.a.life, suppressed ? 40 : 38); assert.equal(blocker.zone, suppressed ? 'graveyard' : 'battlefield');
  });
}

test('An active Champion of Lambholt ignores another copy’s power after paid Snakeform', async t => {
  const f = table(), attacker = f.add('Grizzly Bears'), big = f.add('Champion of Lambholt'), small = f.add('Champion of Lambholt'), blocker = f.add('Grizzly Bears', f.b);
  const snake = f.add('Snakeform', f.a, 'hand'), growth = f.add('Giant Growth', f.a, 'hand');
  const lands = Array.from({ length: 4 }, () => f.add('Forest'));
  f.attackers = () => [{ card: attacker, target: f.b }]; f.opposingBlockers = () => [{ blocker, attacker }];
  const remaining = castAt(f, [{ card: snake, step: 'begin', targets: [big] }, { card: growth, step: 'begin', targets: [big] }]);
  await play(f, t.name);
  assert.equal(remaining.length, 0); assert.ok(lands.every(c => c.tapped));
  assert.equal(big.cur.abilitiesDisabled, true); assert.equal(big.power, 4); assert.equal(small.cur.abilitiesDisabled, false); assert.equal(small.power, 1);
  assert.equal(f.b.life, 40); assert.equal(attacker.zone, 'graveyard'); assert.equal(blocker.zone, 'graveyard');
});

for (const kind of ['replacement', 'deathtouch', 'combat-only toughness']) {
  test(`Paid Prey Upon uses simultaneous native fight snapshots (${kind})`, async t => {
    const f = table(), own = f.add(kind === 'deathtouch' ? 'Sedge Scorpion' : kind === 'combat-only toughness' ? 'Yoked Ox' : 'Grizzly Bears');
    const opposing = f.add(kind === 'replacement' ? 'Phytohydra' : kind === 'deathtouch' ? 'Colossal Dreadmaw' : 'Grizzly Bears', f.b);
    if (kind === 'combat-only toughness') f.add('Assault Formation');
    const prey = f.add('Prey Upon', f.a, 'hand'), forest = f.add('Forest');
    f.game.phase = 'main1'; f.game.step = 'main'; f.chooseTargets = q => {
      const chosen = [own, opposing].filter(card => q.candidates.includes(card));
      return chosen.slice(0, q.max || chosen.length);
    };
    assert.ok(f.game.castableList(f.a).some(row => row.card === prey));
    assert.equal(await f.game.castSpell(f.a, prey, { from: 'hand', quickTargets: [own, opposing] }), true);
    await f.game.priorityRound(f.a); await play(f, t.name);
    assert.equal(forest.tapped, true); assert.equal(prey.zone, 'graveyard');
    if (kind === 'replacement') { assert.equal(own.zone, 'battlefield'); assert.equal(own.damage, 1); assert.equal(opposing.counters['+1/+1'], 2); assert.equal(opposing.damage, 0); }
    else if (kind === 'deathtouch') { assert.equal(own.zone, 'graveyard'); assert.equal(opposing.zone, 'graveyard'); }
    else { assert.equal(own.damage, 2); assert.equal(opposing.damage, 0); assert.equal(own.zone, 'battlefield'); assert.equal(opposing.zone, 'battlefield'); }
  });
}

for (const suppressed of [false, true]) {
  test(`Loot’s native negative-power assignment ${suppressed ? 'resumes after paid Song of the Dryads removes Formation' : 'uses active Formation toughness'}`, async t => {
    const f = table(), attacker = f.add('Loot, the Anomaly'), formation = f.add('Assault Formation');
    f.attackers = () => [{ card: attacker, target: f.b }];
    if (suppressed) {
      const song = f.add('Song of the Dryads', f.a, 'hand'), lands = Array.from({ length: 3 }, () => f.add('Forest'));
      f.game.phase = 'main1'; f.game.step = 'main';
      f.chooseTargets = q => q.candidates.includes(formation) ? [formation] : q.candidates.slice(0, q.min || 0);
      assert.ok(f.game.castableList(f.a).some(row => row.card === song));
      assert.equal(await f.game.castSpell(f.a, song, { from: 'hand', quickTargets: [formation] }), true);
      await f.game.priorityRound(f.a);
      assert.ok(lands.every(c => c.tapped)); assert.equal(formation.cur.abilitiesDisabled, true);
    }
    await play(f, t.name);
    assert.equal(attacker.power, -2); assert.equal(attacker.cur.positiveDamagePowerV90, true);
    assert.equal(f.b.life, suppressed ? 38 : 36);
  });
}

for (const sameRecipient of [false, true]) {
  test(`Paid Captain’s Maneuver preserves one combat trigger per source and recipient (${sameRecipient ? 'merged recipient' : 'different recipients'})`, async t => {
    const f = table(), attacker = f.add('Charging Monstrosaur'), blocker = f.add('Grizzly Bears', f.b), toski = f.add('Toski, Bearer of Secrets');
    toski.tapped = true;
    const destination = sameRecipient ? f.b : f.others[1], maneuver = f.add("Captain's Maneuver", f.a, 'hand');
    const lands = [f.add('Plains'), f.add('Mountain'), f.add('Forest'), f.add('Forest')];
    f.attackers = () => [{ card: attacker, target: f.b }]; f.opposingBlockers = () => [{ blocker, attacker }];
    const remaining = castAt(f, [{ card: maneuver, step: 'blockers', targets: [blocker, destination], xVal: 2 }]);
    await play(f, t.name);
    assert.equal(remaining.length, 0); assert.equal(maneuver.zone, 'graveyard'); assert.ok(lands.every(c => c.tapped));
    assert.equal(blocker.zone, 'battlefield'); assert.equal(blocker.damage, 0); assert.equal(attacker.damage, 2);
    assert.equal(f.b.life, sameRecipient ? 35 : 37); assert.equal(f.others[1].life, sameRecipient ? 40 : 38);
    assert.equal(f.a.hand.length, sameRecipient ? 1 : 2, 'Toski draws once for each player damaged by this source in one event');
    assert.equal(f.combatHits.length, sameRecipient ? 1 : 2);
    if (sameRecipient) { assert.equal(f.combatHits[0].n, 5); assert.equal(f.groups.length, 1); assert.equal(f.groups[0].hits.length, 1); }
  });
}

for (const source of ['Colossal Dreadmaw', "Thrasta, Tempest's Roar"]) {
  for (const blocked of [false, true]) {
    test(`Native ${source} attacks a planeswalker ${blocked ? 'through a declared blocker' : 'unblocked'}`, async t => {
      const f = table({ defending: true }), attacker = f.add(source, f.b), walker = f.add('Gideon of the Trials'), blocker = f.add('Grizzly Bears');
      walker.counters.loyalty = 3; f.game.recalc();
      f.opposingAttackers = () => [{ card: attacker, target: walker }];
      if (blocked) f.blockers = () => [{ blocker, attacker }];
      await play(f, t.name);
      assert.equal(walker.zone, 'graveyard'); assert.equal(attacker.zone, 'battlefield');
      if (blocked) assert.equal(blocker.zone, 'graveyard');
      const spill = source === "Thrasta, Tempest's Roar" ? blocked ? 2 : 4 : 0;
      assert.equal(f.a.life, 40 - spill); assert.equal(f.b.life, 40);
      assert.equal(f.combatHits.length, spill ? 1 : 0);
      if (spill) { assert.equal(f.combatHits[0].player, f.a); assert.equal(f.combatHits[0].n, spill); }
    });
  }
}

for (const source of ['Colossal Dreadmaw', "Thrasta, Tempest's Roar"]) {
  test(`Native ${source} attacks its controller’s Battle protected by another seat`, async t => {
    const f = table({ defending: true }), attacker = f.add(source, f.b), battle = f.add('Invasion of Dominaria // Serra Faithkeeper', f.b), blocker = f.add('Grizzly Bears');
    battle.counters.defense = 4; battle.protector = f.a; f.game.recalc();
    assert.ok(f.game.legalAttackTargets(attacker).includes(battle));
    f.opposingAttackers = () => [{ card: attacker, target: battle }]; f.blockers = () => [{ blocker, attacker }];
    f.opposingChooseCards = q => q.from.includes(battle) ? [battle] : q.from.slice(0, q.min || 0);
    await play(f, t.name);
    assert.equal(blocker.zone, 'graveyard'); assert.equal(attacker.damage, 2);
    assert.equal(f.a.life, 40); assert.equal(f.b.life, 40); assert.equal(f.combatHits.length, 0);
    assert.equal(battle.zone, 'battlefield'); assert.equal(battle.name, 'Serra Faithkeeper'); assert.equal(battle.is('Creature'), true);
  });
}

test('Native Kaalia attack offers and puts a printed Angel into the same combat', async t => {
  const f = table(), kaalia = f.add('Kaalia of the Vast'), angel = f.add('Serra Angel', f.a, 'hand');
  f.attackers = () => [{ card: kaalia, target: f.b }];
  f.chooseCards = q => q.from.includes(angel) ? [angel] : q.from.slice(0, q.min || 0);
  await play(f, t.name);
  assert.equal(angel.zone, 'battlefield'); assert.equal(angel.tapped, true); assert.equal(f.b.life, 34);
  assert.equal(f.combatHits.filter(hit => hit.card === angel).length, 1);
});

test('Native Kaalia’s player-only attack trigger does not apply to a planeswalker', async t => {
  const f = table(), kaalia = f.add('Kaalia of the Vast'), angel = f.add('Serra Angel', f.a, 'hand'), walker = f.add('Gideon of the Trials', f.b);
  walker.counters.loyalty = 3; f.game.recalc();
  f.attackers = () => [{ card: kaalia, target: walker }]; f.chooseCards = q => q.from.includes(angel) ? [angel] : q.from.slice(0, q.min || 0);
  await play(f, t.name);
  assert.equal(angel.zone, 'hand'); assert.equal(f.b.life, 40); assert.equal(walker.counters.loyalty, 1);
});

test('Native Kaalia’s declared player destination survives a paid blink response', async t => {
  const f = table(), kaalia = f.add('Kaalia of the Vast'), angel = f.add('Serra Angel', f.a, 'hand'), blink = f.add('Cloudshift', f.a, 'hand'), plains = f.add('Plains');
  f.attackers = () => [{ card: kaalia, target: f.b }]; f.chooseCards = q => q.from.includes(angel) ? [angel] : q.from.slice(0, q.min || 0);
  const remaining = castAt(f, [{ card: blink, step: 'attackers', targets: [kaalia] }]);
  await play(f, t.name);
  assert.equal(remaining.length, 0); assert.equal(plains.tapped, true); assert.equal(blink.zone, 'graveyard');
  assert.equal(kaalia.zone, 'battlefield'); assert.equal(kaalia.sick, true); assert.equal(angel.zone, 'battlefield'); assert.equal(f.b.life, 36);
  assert.equal(f.combatHits.filter(hit => hit.card === kaalia).length, 0); assert.equal(f.combatHits.filter(hit => hit.card === angel).length, 1);
});

for (const destination of ['previous attacker', 'other player', 'previous attacker’s planeswalker', 'previous attacker’s Battle', 'after paid ability loss and defender grant']) {
  test(`Weathered Sentinels uses native previous-turn attack history (${destination})`, async t => {
    const f = table({ defending: true }), sentinel = f.add('Weathered Sentinels'), incoming = f.add('Grizzly Bears', f.b);
    f.opposingAttackers = () => [{ card: incoming, target: f.a }];
    // Run the three opposing turns in the native turn queue. B attacks A;
    // C and D do not. A's new turn must read only that actual history.
    for (let n = 0; n < 3; n++) await play(f, `${t.name}: preceding seat ${n}`, true);
    assert.equal(f.game.turnPlayer, f.a); assert.equal(f.a.life, 38);
    let target = destination === 'other player' ? f.others[1] : f.b, walker, lands;
    if (destination === 'previous attacker’s planeswalker') { walker = f.add('Gideon of the Trials', f.b); walker.counters.loyalty = 3; target = walker; f.game.recalc(); }
    let battle;
    if (destination === 'previous attacker’s Battle') { battle = f.add('Invasion of Dominaria // Serra Faithkeeper'); battle.counters.defense = 4; battle.protector = f.b; target = battle; f.game.recalc(); }
    if (destination === 'after paid ability loss and defender grant') {
      const snake = f.add('Snakeform', f.a, 'hand'), duty = f.add('Guard Duty', f.a, 'hand'); lands = [f.add('Plains'), f.add('Plains'), f.add('Plains'), f.add('Forest'), f.add('Forest'), f.add('Forest')];
      const actions = [snake, duty];
      f.main = q => { const card = actions[0], entry = q.casts.find(row => row.card === card); if (!entry) return { kind: 'done' }; actions.shift(); return { kind: 'cast', card, from: entry.from, alt: entry.alt, quickTargets: [sentinel] }; };
      f.chooseTargets = q => q.quickTarget && q.candidates.includes(q.quickTarget) ? [q.quickTarget] : q.candidates.includes(sentinel) ? [sentinel] : q.candidates.slice(0, q.min || 0);
      f.priority = () => { if (f.game.step === 'begin') { assert.equal(actions.length, 0); assert.equal(sentinel.cur.abilitiesDisabled, true); assert.equal(sentinel.kw('defender'), true); } return { kind: 'pass' }; };
    }
    f.attackers = () => {
      if (['other player', 'previous attacker’s planeswalker', 'previous attacker’s Battle'].includes(destination))
        assert.equal(f.game.legalAttackTargets(sentinel).includes(target), false);
      return [{ card: sentinel, target }];
    };
    await play(f, t.name, true);
    if (lands) assert.equal(lands.filter(c => c.tapped).length, 4);
    // The native declaration validator redirects an invalid raw choice to
    // the legal B player; the requested C/PW/Battle must receive no damage.
    assert.equal(f.b.life, destination === 'after paid ability loss and defender grant' ? 40 : 35); assert.equal(f.others[1].life, 40);
    if (walker) { assert.equal(walker.zone, 'battlefield'); assert.equal(walker.counters.loyalty, 3); }
    if (battle) { assert.equal(battle.zone, 'battlefield'); assert.equal(battle.counters.defense, 4); }
  });
}

test('Weathered Sentinels accepts another printed source’s unrestricted defender permission', async t => {
  const f = table(), sentinel = f.add('Weathered Sentinels'); f.add('Felothar the Steadfast');
  f.attackers = () => [{ card: sentinel, target: f.others[1] }];
  await play(f, t.name);
  assert.equal(f.others[1].life, 32, 'the native attack pump changes toughness to eight for Felothar assignment');
});

test('Weathered Sentinels can attack an unrelated player after paid Dress Down removes defender', async t => {
  const f = table(), sentinel = f.add('Weathered Sentinels'), dress = f.add('Dress Down', f.a, 'hand'), lands = [f.add('Island'), f.add('Forest')];
  f.attackers = () => [{ card: sentinel, target: f.others[1] }];
  const remaining = castAt(f, [{ card: dress, step: 'begin' }]);
  await play(f, t.name);
  assert.equal(remaining.length, 0); assert.ok(lands.every(c => c.tapped)); assert.equal(sentinel.cur.abilitiesDisabled, true); assert.equal(sentinel.kw('defender'), false);
  assert.equal(f.others[1].life, 38);
});

for (const kind of ['unpaid player', 'paid player', 'planeswalker']) {
  test(`Native Ghostly Prison declaration cost and Kaalia trigger (${kind})`, async t => {
    const f = table(), kaalia = f.add('Kaalia of the Vast'), angel = f.add('Serra Angel', f.a, 'hand'); f.add('Ghostly Prison', f.b);
    const lands = kind === 'paid player' ? [f.add('Wastes'), f.add('Wastes')] : [];
    let target = f.b, walker;
    if (kind === 'planeswalker') { walker = f.add('Gideon of the Trials', f.b); walker.counters.loyalty = 3; target = walker; f.game.recalc(); }
    f.attackers = () => [{ card: kaalia, target }]; f.chooseCards = q => q.from.includes(angel) ? [angel] : q.from.slice(0, q.min || 0);
    await play(f, t.name);
    if (kind === 'paid player') { assert.ok(lands.every(c => c.tapped)); assert.equal(f.b.life, 34); assert.equal(angel.zone, 'battlefield'); }
    else { assert.equal(f.b.life, 40); assert.equal(angel.zone, 'hand'); if (walker) assert.equal(walker.counters.loyalty, 1); else assert.equal(kaalia.tapped, false); }
  });
}

test('Weathered Sentinels reads the opponent’s actual last turn after a paid Time Warp', async t => {
  const f = table({ defending: true }), sentinel = f.add('Weathered Sentinels'), incoming = f.add('Grizzly Bears', f.b), warp = f.add('Time Warp', f.b, 'hand');
  const lands = Array.from({ length: 5 }, () => f.add('Island', f.b));
  f.opposingMain = q => { const entry = f.b.turnsStarted === 1 && q.casts.find(row => row.card === warp); return entry ? { kind: 'cast', card: warp, from: entry.from, alt: entry.alt, quickTargets: [f.b] } : { kind: 'done' }; };
  f.opposingChooseTargets = q => q.quickTarget && q.candidates.includes(q.quickTarget) ? [q.quickTarget] : q.candidates.includes(f.b) ? [f.b] : q.candidates.slice(0, q.min || 0);
  f.opposingAttackers = () => f.b.turnsStarted === 1 ? [{ card: incoming, target: f.a }] : [];
  await play(f, `${t.name}: first B turn`, true);
  assert.equal(warp.zone, 'graveyard'); assert.ok(lands.every(c => c.tapped)); assert.equal(f.game.turnPlayer, f.b); assert.equal(f.a.life, 38);
  for (let n = 0; n < 3; n++) await play(f, `${t.name}: extra B then C/D ${n}`, true);
  assert.equal(f.b.turnsStarted, 2); assert.equal(f.game.turnPlayer, f.a);
  f.attackers = () => [{ card: sentinel, target: f.b }];
  await play(f, t.name, true); assert.equal(f.b.life, 40);
});

test('A native Chronatog-skipped extra turn preserves the last actual attack for O-Kagachi', async t => {
  const f = table({ defending: true }), dragon = f.add('O-Kagachi, Vengeful Kami'), incoming = f.add('Grizzly Bears', f.b), atog = f.add('Chronatog', f.b), warp = f.add('Time Warp', f.b, 'hand');
  const lands = Array.from({ length: 5 }, () => f.add('Island', f.b)); let selectedAbility = false;
  f.opposingMain = q => {
    const cast = q.casts.find(row => row.card === warp);
    if (cast) return { kind: 'cast', card: warp, from: cast.from, alt: cast.alt, quickTargets: [f.b] };
    const entry = !selectedAbility && q.acts.find(row => row.card === atog && row.ability);
    if (entry) { selectedAbility = true; return { kind: 'activate', entry }; }
    return { kind: 'done' };
  };
  f.opposingChooseTargets = q => q.quickTarget && q.candidates.includes(q.quickTarget) ? [q.quickTarget] : q.candidates.includes(f.b) ? [f.b] : q.candidates.slice(0, q.min || 0);
  f.opposingAttackers = () => [{ card: incoming, target: f.a }];
  await play(f, `${t.name}: B pays for Warp and activates Chronatog`, true);
  assert.equal(selectedAbility, true); assert.equal(warp.zone, 'graveyard'); assert.ok(lands.every(c => c.tapped)); assert.equal(f.game.turnPlayer, f.b);
  assert.equal(f.b.turnsStarted, 1); assert.equal(f.a.life, 38);
  await play(f, `${t.name}: the extra B turn is actually skipped`, true);
  assert.equal(f.b.turnsStarted, 1); assert.equal(f.game.turnPlayer, f.others[1]);
  for (let n = 0; n < 2; n++) await play(f, `${t.name}: C/D turn ${n}`, true);
  f.attackers = () => [{ card: dragon, target: f.b }]; f.chooseTargets = q => q.candidates.includes(incoming) ? [incoming] : q.candidates.slice(0, q.min || 0);
  await play(f, t.name, true);
  assert.equal(f.b.life, 34); assert.equal(incoming.zone, 'exile', 'the printed O-Kagachi trigger sees the opponent’s last actual attacking turn');
});

test('Weathered Sentinels retains native acquired attack permission after a JSON checkpoint restore', async t => {
  const f = table({ defending: true }), sentinel = f.add('Weathered Sentinels'), incoming = f.add('Grizzly Bears', f.b);
  f.opposingAttackers = () => [{ card: incoming, target: f.a }];
  for (let n = 0; n < 3; n++) await play(f, `${t.name}: prior opponent turn ${n}`, true);
  const snapshot = M.captureGameState(f.game); assert.ok(snapshot, M.gameStateSnapshotBlockers(f.game).join(', '));
  const restored = table(); M.restoreGameState(restored.game, JSON.parse(JSON.stringify(snapshot)));
  const returned = restored.game.byIid(sentinel.iid); assert.ok(returned);
  assert.equal(restored.game.legalAttackTargets(returned).includes(restored.b), true);
  assert.equal(restored.game.legalAttackTargets(returned).includes(restored.others[1]), false);
  restored.attackers = () => [{ card: returned, target: restored.b }];
  await play(restored, t.name, true); assert.equal(restored.b.life, 35); assert.equal(restored.others[1].life, 40);
});

test('A Baldin manifested by paid Soul Summons has no printed toughness combat permission', async t => {
  const f = table(), ox = f.add('Yoked Ox'), baldin = f.add('Baldin, Century Herdmaster', f.a, 'library'), summons = f.add('Soul Summons', f.a, 'hand');
  const lands = [f.add('Plains'), f.add('Forest')]; f.game.phase = 'main1'; f.game.step = 'main';
  assert.ok(f.game.castableList(f.a).some(row => row.card === summons));
  assert.equal(await f.game.castSpell(f.a, summons, { from: 'hand' }), true); await f.game.priorityRound(f.a);
  assert.ok(lands.every(c => c.tapped)); assert.equal(summons.zone, 'graveyard'); assert.equal(baldin.zone, 'battlefield'); assert.equal(baldin.faceDown, true);
  f.attackers = () => [{ card: ox, target: f.b }]; await play(f, t.name); assert.equal(f.b.life, 40);
});

for (const extraTurn of [false, true]) {
  test(`Native Avenge ${extraTurn ? 'loses its discount after a paid nonattacking extra turn' : 'pays its discount after an actual attacking turn'}`, async t => {
    const f = table({ defending: true }), incoming = f.add('Grizzly Bears', f.b), avenge = f.add('Avenge', f.a, 'hand');
    const plains = Array.from({ length: 4 }, () => f.add('Plains'));
    let warp, islands;
    if (extraTurn) {
      warp = f.add('Time Warp', f.b, 'hand'); islands = Array.from({ length: 5 }, () => f.add('Island', f.b));
      f.opposingMain = q => { const entry = f.b.turnsStarted === 1 && q.casts.find(row => row.card === warp); return entry ? { kind: 'cast', card: warp, from: entry.from, alt: entry.alt, quickTargets: [f.b] } : { kind: 'done' }; };
      f.opposingChooseTargets = q => q.quickTarget && q.candidates.includes(q.quickTarget) ? [q.quickTarget] : q.candidates.includes(f.b) ? [f.b] : q.candidates.slice(0, q.min || 0);
    }
    f.opposingAttackers = () => f.b.turnsStarted === 1 ? [{ card: incoming, target: f.a }] : [];
    await play(f, `${t.name}: first actual B turn`, true);
    assert.equal(f.a.life, 38);
    if (extraTurn) { assert.equal(warp.zone, 'graveyard'); assert.ok(islands.every(c => c.tapped)); assert.equal(f.game.turnPlayer, f.b); }
    for (let n = 0; n < (extraTurn ? 3 : 2); n++) await play(f, `${t.name}: intervening turn ${n}`, true);
    assert.equal(f.game.turnPlayer, f.a); assert.equal(f.b.turnsStarted, extraTurn ? 2 : 1);
    f.main = q => { const entry = q.casts.find(row => row.card === avenge); return entry ? { kind: 'cast', card: avenge, from: entry.from, alt: entry.alt } : { kind: 'done' }; };
    await play(f, t.name, true);
    assert.equal(avenge.zone, extraTurn ? 'hand' : 'graveyard', 'four Plains cannot pay 4WW after the opponent’s last actual turn did not attack');
    assert.equal(plains.every(c => c.tapped), !extraTurn); assert.equal(incoming.zone, extraTurn ? 'battlefield' : 'graveyard'); assert.equal(f.a.life, extraTurn ? 38 : 39);
  });
}

test.after(() => {
  const path = new URL('../output/extended-engine-audit-2026-10-10/combat-damage/', import.meta.url);
  mkdirSync(path, { recursive: true });
  writeFileSync(new URL('native-combat-evidence.json', path), JSON.stringify(evidence, null, 2) + '\n');
});
