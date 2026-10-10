import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M = loadEngine();

function table({difficulty = 'hard', style = 'balanced'} = {}) {
  const g = new M.Game({seed: 101026121, paced: false, difficulty, maxTurns: 30});
  const a = g.addPlayer('AI strategist', {name: 'Native strategy audit'}, null, true);
  const b = g.addPlayer('Opponent', {name: 'Native strategy opponent'}, null, false);
  const f = {g, a, b, choices: {}};
  f.installHuman = p => { p.controller = {decide: async (game, q) => {
    if (q.type === 'priority') return f.choices.priority?.(p, q) ?? {kind: 'pass'};
    if (q.type === 'chooseTargets') return f.choices.targets?.(p, q) ?? q.candidates.slice(0, q.min ?? 1);
    if (q.type === 'chooseCards') return f.choices.cards?.(p, q) ?? q.from.slice(0, q.min || 0);
    if (q.type === 'chooseOption') return f.choices.option?.(p, q) ?? q.options.find(r => r.key === 'yes')?.key ?? q.options[0]?.key;
    if (q.type === 'chooseMulti') return q.options.slice(0, q.min || 0).map(r => r.key);
    if (q.type === 'chooseX') return q.min ?? 0;
    if (q.type === 'chooseManaSources') return {cards: q.suggested};
    if (q.type === 'orderTriggers') return q.triggers;
    if (q.type === 'scry') return {top: q.cards, bottom: []};
    if (q.type === 'main') return {kind: 'done'};
    if (q.type === 'attackers') return f.choices.attackers?.(p, q) ?? [];
    if (q.type === 'blockers') return f.choices.blockers?.(p, q) ?? [];
    if (['cardReveal', 'combatReview'].includes(q.type)) return null;
    throw Error('Unhandled native strategy question: ' + q.type);
  }}; };
  f.installHuman(a); f.installHuman(b);
  f.bot = () => { a.controller = new M.AIController(a, {difficulty, style}); return a.controller; };
  g.turnPlayer = a; g.turnNo = 9; g.phase = 'main1'; g.step = 'main'; g.speedFactor = 0;
  f.put = (name, zone = 'hand', p = a) => {
    assert.ok(M.DEFS[name], 'actual registered definition: ' + name);
    const c = new M.CardInst(M.DEFS[name], p); c.zone = zone;
    if (zone === 'battlefield') { c.sick = false; g.battlefield.push(c); } else p[zone].push(c);
    g.recalc(); return c;
  };
  f.lands = (names, p = a) => names.map(name => f.put(name, 'battlefield', p));
  f.cast = async (name, p = a) => {
    const c = f.put(name, 'hand', p), offer = g.castableList(p).find(r => r.card === c);
    assert.ok(offer, 'native paid offer: ' + name + ' ' + c.def.cost);
    assert.equal(await g.castSpell(p, c, {from: offer.from, alt: offer.alt}), true);
    assert.equal(g.stack.length, 0); assert.equal(g.pendingTriggers.length, 0);
    return c;
  };
  f.clean = () => {
    assert.equal((g.aiDecisionLog || []).some(r => r.fallback), false);
    assert.equal(g.stack.length, 0); assert.equal(g.pendingTriggers.length, 0);
    assertGameStateInvariants(g, 'native AI strategy');
  };
  for (const p of [a, b]) for (let i = 0; i < 12; i++) f.put('Forest', 'library', p);
  return f;
}

for (const reserveMana of [0, 4]) {
  test(`custom reserve ${reserveMana} chooses a native main action with an actual held answer`, async t => {
    const key = M.registerAISkill({...JSON.parse(JSON.stringify(M.aiSkillTemplate())),
      id: 'second-audit-reserve-' + reserveMana, baseStyle: 'balanced',
      profileMultipliers: {}, roleBonuses: {}, reserveMana});
    const f = table({style: key}), lands = f.lands(Array(5).fill('Forest'));
    const signet = f.put('Arcane Signet'), answer = f.put('Beast Within');
    f.bot();
    const q = {type: 'main', player: f.a, casts: f.g.castableList(f.a),
      acts: f.g.activatableList(f.a), lands: f.g.playableLands(f.a), phase: f.g.phase};
    const decision = await f.a.controller.decide(f.g, q);
    t.diagnostic(JSON.stringify({reserveMana, chosen: decision.kind,
      heldRoles: M.inferCardSemantics(answer.def).roles,
      manaRows: f.g.manaSources(f.a, null).map(r => ({name: r.card.name, produce: r.produce})),
      style: f.a.aiStyle, skill: M.getAIStyleSkill(f.a.aiStyle),
      considered: f.a.controller.lastV2Decision.consideredActions}));
    assert.equal(decision.kind, reserveMana ? 'done' : 'cast');
    if (!reserveMana) {
      assert.equal(decision.card === signet, true);
      assert.equal(await f.g.performAction(f.a, decision), true);
      assert.equal(signet.zone, 'battlefield');
      assert.equal(lands.filter(c => c.tapped).length, 2);
    } else {
      assert.equal(signet.zone, 'hand'); assert.equal(lands.some(c => c.tapped), false);
      assert.equal(f.g.canPayMana(f.a, f.g.spellCost(f.a, answer), {card: answer}), true);
    }
    f.clean();
  });
}

test('paid Chromatic Lantern grants mana choices without doubling the custom reserve budget', async () => {
  const key = M.registerAISkill({...JSON.parse(JSON.stringify(M.aiSkillTemplate())),
    id: 'second-audit-lantern-reserve', baseStyle: 'balanced',
    profileMultipliers: {}, roleBonuses: {}, reserveMana: 4});
  const f = table({style: key}); f.lands(Array(3).fill('Forest'));
  const lantern = await f.cast('Chromatic Lantern');
  for (const c of f.g.lands(f.a)) await f.g.untap(c);
  f.lands(['Forest']);
  const physicalSources = [lantern, ...f.g.lands(f.a)];
  assert.equal(physicalSources.length, 5);
  assert.ok(f.g.manaSources(f.a).length > physicalSources.length, 'printed and actual granted abilities remain distinct choices');
  f.put('Arcane Signet'); f.put('Beast Within'); f.bot();
  const decision = await f.a.controller.decide(f.g, {type: 'main', player: f.a,
    casts: f.g.castableList(f.a), acts: f.g.activatableList(f.a), lands: [], phase: 'main1'});
  assert.equal(decision.kind, 'done');
  assert.equal(physicalSources.some(c => c.tapped), false);
  f.clean();
});

test('public AI view reports actual opponent mana capacity after paid Chromatic Lantern', async () => {
  const f = table(); f.g.turnPlayer = f.b;
  f.lands(Array(3).fill('Forest'), f.b);
  const lantern = await f.cast('Chromatic Lantern', f.b);
  for (const c of f.g.lands(f.b)) await f.g.untap(c);
  f.lands(['Forest'], f.b);
  assert.equal(f.g.bf().filter(c => c.ctrl === f.b).length, 5);
  assert.equal(lantern.zone, 'battlefield');
  const view = M.createBotPlayerView(f.g, f.a.idx);
  assert.equal(view.players.find(p => p.id === f.b.idx).openMana, 5);
  f.put('Lotus Petal', 'hand', f.b);
  const hiddenView = M.createBotPlayerView(f.g, f.a.idx);
  const opponentRow = hiddenView.players.find(p => p.id === f.b.idx);
  assert.equal(opponentRow.openMana, 5, 'an opponent hand is not a public mana producer');
  assert.equal(Object.hasOwn(opponentRow, 'hand'), false);
  assert.equal(JSON.stringify(hiddenView).includes('Lotus Petal'), false);
  const ownView = M.createBotPlayerView(f.g, f.b.idx);
  assert.equal(ownView.players.find(p => p.id === f.b.idx).openMana, 5);
  assert.equal(ownView.players.find(p => p.id === f.b.idx).hand.some(c => c.name === 'Lotus Petal'), true);
  f.clean();
});

for (const difficulty of ['easy', 'normal', 'hard']) {
  test(`${difficulty} keeps its paid Wind Drake available for next-turn Shivan Dragon`, async t => {
    const f = table({difficulty});
    f.lands(['Plains', 'Plains', 'Mountain', 'Mountain', 'Island', 'Island', 'Island', 'Forest']);
    const vessel = await f.cast('Inspirit, Flagship Vessel');
    for (const c of f.g.lands(f.a)) await f.g.untap(c);
    const guard = await f.cast('Wind Drake');
    f.g.turnPlayer = f.b; f.g.phase = 'main1';
    f.lands(['Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain'], f.b);
    const threat = await f.cast('Shivan Dragon', f.b);
    await f.g.tap(threat); // A currently tapped opponent untaps before the AI's next turn.
    f.a.life = 4; f.g.turnPlayer = f.a; f.g.phase = 'main2'; f.g.step = 'main';
    f.bot();
    const liveFlags = [guard.sick, guard.tapped, threat.sick, threat.tapped];
    M.stationPlan(f.g, vessel, f.a);
    assert.deepEqual([guard.sick, guard.tapped, threat.sick, threat.tapped], liveFlags,
      'future readiness never changes the live objects');
    t.diagnostic(JSON.stringify({guard: guard.name, threat: threat.name,
      station: M.stationPlan(f.g, vessel, f.a), threatSick: threat.sick,
      threatTapped: threat.tapped, guardFlying: guard.kw('flying'), threatFlying: threat.kw('flying'),
      attackLegal: f.g.canAttackAtAll(threat) && f.g.canAttackTarget(threat, f.a),
      blockLegal: f.g.canBlock(guard, threat), power: threat.power,
      damage: f.g.dmgAmount(threat, 'normal'), guardStats: [guard.power, guard.toughness]},
      (key, value) => key === 'picks' ? value.map(c => c.iid) : value));
    await f.g.mainPhase(f.a);
    assert.equal(guard.tapped, false, 'the only legal flyer blocker is retained');
    assert.equal(vessel.counters.charge || 0, 0);
    f.clean();
  });
}

for (const [guardName, threatName, vow] of [
  ['Grizzly Bears', 'Shivan Dragon', false],
  ['Wind Drake', 'Wall of Swords', false],
  ['Wind Drake', 'Shivan Dragon', true],
]) {
  test(`Station still progresses with ${guardName} versus ${threatName}${vow ? ' bound by paid Vow of Flight' : ''}`, async () => {
    const f = table();
    f.lands(['Plains', 'Mountain', 'Island', 'Island', 'Island', 'Forest', 'Forest', 'Forest']);
    const vessel = await f.cast('Inspirit, Flagship Vessel');
    for (const c of f.g.lands(f.a)) await f.g.untap(c);
    const guard = await f.cast(guardName);
    f.g.turnPlayer = f.b; f.g.phase = 'main1';
    f.lands(['Plains', 'Plains', 'Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain'], f.b);
    const threat = await f.cast(threatName, f.b);
    await f.g.tap(threat);
    f.g.turnPlayer = f.a; f.g.phase = 'main1';
    if (vow) {
      for (const c of f.g.lands(f.a)) await f.g.untap(c);
      f.choices.targets = (p, q) => q.candidates.includes(threat) ? [threat] : q.candidates.slice(0, q.min ?? 1);
      await f.cast('Vow of Flight');
      for (const c of f.g.lands(f.a)) await f.g.untap(c);
      const jace = await f.cast('Jace Beleren');
      assert.equal(f.g.canAttackTarget(threat, f.a), false);
      assert.equal(f.g.canAttackTarget(threat, jace), false, 'printed planeswalker attack restriction remains');
    }
    f.a.life = 3; f.g.phase = 'main2'; f.g.step = 'main';
    const flags = [guard.sick, guard.tapped, threat.sick, threat.tapped];
    const plan = M.stationPlan(f.g, vessel, f.a);
    assert.ok(plan.score > 0, 'tapping this creature adds no lethal exposure');
    assert.deepEqual([guard.sick, guard.tapped, threat.sick, threat.tapped], flags);
    f.bot(); await f.g.mainPhase(f.a);
    assert.equal(guard.tapped, true); assert.equal(vessel.counters.charge, guard.power);
    f.clean();
  });
}

for (const producer of ['Crystal Vein', 'Undiscovered Paradise', 'Rain of Filth']) {
  test(`native resource alternatives remain usable with ${producer}`, async () => {
    const key = M.registerAISkill({...JSON.parse(JSON.stringify(M.aiSkillTemplate())),
      id: 'second-alt-' + producer.toLowerCase().replaceAll(' ', '-'),
      baseStyle: 'balanced', profileMultipliers: {}, roleBonuses: {}, reserveMana: 4});
    const f = table({style: key});
    if (producer === 'Rain of Filth') {
      f.lands(['Swamp']);
      f.lands(Array(3).fill('Forest'));
      await f.cast('Rain of Filth');
    } else {
      f.lands(Array(producer === 'Crystal Vein' ? 4 : 5).fill('Forest'));
      const land = f.put(producer);
      assert.equal(await f.g.playLand(f.a, land), true);
      assert.equal(land.zone, 'battlefield');
    }
    const signet = f.put('Arcane Signet'); f.put('Beast Within'); f.bot();
    const decision = await f.a.controller.decide(f.g, {type: 'main', player: f.a,
      casts: f.g.castableList(f.a), acts: f.g.activatableList(f.a), lands: [], phase: 'main1'});
    assert.equal(decision.kind, 'cast'); assert.equal(decision.card === signet, true);
    assert.equal(await f.g.performAction(f.a, decision), true);
    assert.equal(signet.zone, 'battlefield');
    assert.equal(f.g.canPayMana(f.a, M.parseCost('{4}')), true);
    f.clean();
  });
}

test('custom reserve counts the two mana produced by a genuinely paid Sol Ring', async t => {
  const key = M.registerAISkill({...JSON.parse(JSON.stringify(M.aiSkillTemplate())),
    id: 'second-audit-ring-reserve', baseStyle: 'balanced', profileMultipliers: {}, roleBonuses: {}, reserveMana: 4});
  const f = table({style: key}); f.lands(['Plains']);
  const ring = await f.cast('Sol Ring');
  const forests = f.lands(Array(4).fill('Forest'));
  const signet = f.put('Arcane Signet'); f.put('Beast Within'); f.bot();
  const decision = await f.a.controller.decide(f.g, {type: 'main', player: f.a,
    casts: f.g.castableList(f.a), acts: f.g.activatableList(f.a), lands: [], phase: 'main1'});
  assert.equal(decision.kind, 'cast'); assert.equal(decision.card === signet, true);
  const performed = await f.g.performAction(f.a, decision);
  t.diagnostic(JSON.stringify({performed, ringTapped: ring.tapped,
    forestsTapped: forests.filter(c => c.tapped).length, signetZone: signet.zone,
    choices: f.a.controller.lastV2Decision.consideredActions, logs: f.g.log.slice(-10)}));
  assert.equal(performed, true);
  assert.equal(f.g.canPayMana(f.a, M.parseCost('{4}')), true, 'four actual mana remain available after the native cast');
  assert.equal(ring.zone, 'battlefield'); assert.equal(forests.length, 4);
  f.clean();
});

for (const ownTurn of [false, true]) {
  test(`paid Smothering Tithe tax ${ownTurn ? 'preserves the developing AI\'s Divination mana' : 'uses spare opposing-turn mana'}`, async () => {
    const f = table();
    f.g.turnPlayer = f.b;
    const titheMana = f.lands(Array(4).fill('Plains'), f.b);
    const tithe = await f.cast('Smothering Tithe', f.b);
    assert.equal(tithe.zone, 'battlefield'); assert.equal(titheMana.every(c => c.tapped), true);
    const mana = f.lands(Array(ownTurn ? 3 : 4).fill('Island'));
    f.put('Divination'); f.bot();
    f.g.turnPlayer = ownTurn ? f.a : f.b; f.g.phase = ownTurn ? 'draw' : 'end'; f.g.step = ownTurn ? 'draw' : 'end';
    await f.g.draw(f.a, 1);
    await f.g.flushTriggers(); await f.g.priorityRound(f.g.turnPlayer);
    const treasures = f.g.bf().filter(c => c.ctrl === f.b && c.hasSub('Treasure'));
    assert.equal(treasures.length, ownTurn ? 1 : 0);
    assert.equal(mana.filter(c => c.tapped).length, ownTurn ? 0 : 2);
    f.clean();
  });
}
