import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M = loadEngine();

async function paidPosition() {
  const g = new M.Game({seed: 101026157, paced: false, difficulty: 'hard', maxTurns: 30});
  const a = g.addPlayer('Native ramp strategist', {}, null, true), b = g.addPlayer('Native Craw attacker', {}, null, false);
  const f = {g, a, b, choices: {}};
  const human = p => { p.controller = {decide: async (_game, q) => {
    if (q.type === 'priority') return f.choices.priority?.(p, q) ?? {kind: 'pass'};
    if (q.type === 'chooseTargets') return q.candidates.includes(f.choices.target)
      ? [f.choices.target] : q.candidates.slice(0, q.min ?? 1);
    if (q.type === 'chooseCards') return q.from.slice(0, q.aiHint?.kind === 'searchBasic' ? 1 : q.min || 0);
    if (q.type === 'chooseOption') return q.options.find(row => row.key === 'yes')?.key ?? q.options[0]?.key;
    if (q.type === 'chooseMulti') return q.options.slice(0, q.min || 0).map(row => row.key);
    if (q.type === 'chooseX') return q.min ?? 0;
    if (q.type === 'chooseManaSources') return {cards: q.suggested};
    if (q.type === 'orderTriggers') return q.triggers;
    if (q.type === 'scry') return {top: q.cards, bottom: []};
    if (q.type === 'main') return {kind: 'done'};
    if (q.type === 'attackers') return f.choices.attackers?.(p, q) ?? [];
    if (q.type === 'blockers') return f.choices.blockers?.(p, q) ?? [];
    if (['cardReveal', 'combatReview'].includes(q.type)) return null;
    throw Error('Unhandled native sacrifice question: ' + q.type);
  }}; };
  human(a); human(b);
  f.put = (name, zone = 'hand', p = a) => {
    assert.ok(M.DEFS[name], 'actual registered definition: ' + name);
    const card = new M.CardInst(M.DEFS[name], p); card.zone = zone;
    if (zone === 'battlefield') { card.sick = false; g.battlefield.push(card); } else p[zone].push(card);
    g.recalc(); return card;
  };
  f.cast = async (name, p = a) => {
    const card = f.put(name, 'hand', p), offer = g.castableList(p).find(row => row.card === card);
    assert.ok(offer, 'native paid offer: ' + name);
    assert.equal(await g.castSpell(p, card, {from: offer.from, alt: offer.alt}), true);
    assert.equal(g.stack.length, 0); assert.equal(g.pendingTriggers.length, 0); return card;
  };
  g.turnPlayer = a; g.turnNo = 9; g.phase = 'main1'; g.step = 'main'; g.speedFactor = 0;
  for (const player of [a, b]) {
    for (let i = 0; i < 20; i++) f.put('Forest', 'library', player);
    for (let i = 0; i < 6; i++) f.put('Forest', 'battlefield', player);
  }
  const source = await f.cast('Sakura-Tribe Elder');
  g.turnNo++; await g.runBeginningPhase(a); assert.equal(source.sick, false);
  g.turnPlayer = b; g.phase = 'main1'; g.step = 'main';
  const threat = await f.cast('Craw Wurm', b); await g.tap(threat);
  a.life = 4; g.turnPlayer = a; g.phase = 'main2'; g.step = 'main';
  f.choices.attackers = (p, q) => p === b && q.eligible.includes(threat) ? [{card: threat, target: a}] : [];
  f.attack = async () => { g.turnPlayer = b; g.turnNo++; await g.runBeginningPhase(b); await g.combatPhase(b); };
  f.clean = () => {
    assert.equal((g.aiDecisionLog || []).some(row => row.fallback), false);
    assert.equal(g.stack.length + g.pendingTriggers.length, 0); assertGameStateInvariants(g, 'native sacrifice defense');
  };
  return {...f, source, threat};
}

test('legal human Sakura hold control survives an actual next-turn Craw Wurm attack', async () => {
  const f = await paidPosition();
  f.choices.blockers = (p, q) => p === f.a && q.potential.includes(f.source) ? [{blocker: f.source, attacker: f.threat}] : [];
  await f.g.mainPhase(f.a); await f.attack();
  assert.equal(f.a.lost, false); assert.equal(f.a.life, 4); assert.equal(f.source.zone, 'graveyard'); f.clean();
});

test('AI keeps paid Sakura as its only next-turn blocker instead of sacrificing it for an extra basic', async t => {
  const f = await paidPosition(); f.a.controller = new M.AIController(f.a, {difficulty: 'hard', style: 'balanced'});
  await f.g.mainPhase(f.a);
  t.diagnostic(JSON.stringify({sourceZone: f.source.zone, ownLands: f.g.lands(f.a).length,
    chosen: f.g.aiDecisionLog.map(row => row.chosen)}));
  await f.attack(); assert.equal(f.a.lost, false); assert.equal(f.a.life, 4);
  assert.equal(f.source.zone, 'graveyard'); f.clean();
});

test('AI may sacrifice paid Sakura for its actual basic after the native nontrampling block is declared', async () => {
  const f = await paidPosition(), bot = new M.AIController(f.a, {difficulty: 'hard', style: 'balanced'});
  const landCount = f.g.lands(f.a).length; let used = false;
  f.choices.blockers = (p, q) => p === f.a && q.potential.includes(f.source) ? [{blocker: f.source, attacker: f.threat}] : [];
  f.choices.priority = async (p, q) => {
    if (p !== f.a || f.g.phase !== 'combat' || f.g.step !== 'blockers' || !f.source.blocking) return {kind: 'pass'};
    const action = await bot.decide(f.g, q); if (action.kind === 'activate' && action.entry.card === f.source) used = true;
    return action;
  };
  await f.attack(); assert.equal(used, true); assert.equal(f.a.lost, false); assert.equal(f.a.life, 4);
  assert.equal(f.source.zone, 'graveyard'); assert.equal(f.g.lands(f.a).length, landCount + 1); f.clean();
});

for (const role of ['human', 'ai']) test(`${role} keeps the declared Sakura blocker when paid Rancor makes its removal lethal`, async () => {
  const f = await paidPosition(), bot = new M.AIController(f.a, {difficulty: 'hard', style: 'balanced'});
  f.g.turnPlayer = f.b; f.g.phase = 'main1'; f.g.step = 'main';
  f.put('Forest', 'battlefield', f.b); f.choices.target = f.threat;
  const rancor = await f.cast('Rancor', f.b);
  assert.equal(rancor.attachedTo, f.threat.iid); assert.equal(f.threat.kw('trample'), true);
  assert.equal(f.threat.power, 8); f.a.life = 8;
  f.choices.blockers = (p, q) => p === f.a && q.potential.includes(f.source)
    ? [{blocker: f.source, attacker: f.threat}] : [];
  if (role === 'ai') f.choices.priority = async (p, q) => p === f.a && f.g.step === 'blockers' &&
    f.source.blocking ? bot.decide(f.g, q) : {kind: 'pass'};
  await f.attack(); assert.equal(f.a.lost, false); assert.equal(f.a.life, 1);
  assert.equal(f.source.zone, 'graveyard'); f.clean();
});

test('AI sacrifices paid Sakura for a real basic in response to paid opposing Swords', async () => {
  const f = await paidPosition(), bot = new M.AIController(f.a, {difficulty: 'hard', style: 'balanced'});
  const lands = f.g.lands(f.a).length;
  f.g.turnPlayer = f.b; f.g.phase = 'main1'; f.g.step = 'main';
  f.put('Plains', 'battlefield', f.b); f.choices.target = f.source;
  f.choices.priority = async (p, q) => p === f.a && f.g.stack.some(row =>
    row.card?.name === 'Swords to Plowshares') ? bot.decide(f.g, q) : {kind: 'pass'};
  const swords = await f.cast('Swords to Plowshares', f.b);
  assert.equal(swords.castMeta.manaSpent, 1); assert.equal(f.source.zone, 'graveyard');
  assert.equal(swords.zone, 'graveyard'); assert.equal(f.g.lands(f.a).length, lands + 1);
  assert.equal(f.a.life, 4); f.clean();
});
