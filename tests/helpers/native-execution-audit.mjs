import assert from 'node:assert/strict';
import { assertGameStateInvariants, assertRecalculationStable } from './game-state-invariants.mjs';

export function nativeCatalogNames(MTG) {
  const generic = new Set(MTG.ORACLE_BATCHES.flatMap(batch => batch.cards)
    .filter(entry => entry.semanticClass !== 'manual-deck-semantic').map(entry => entry.raw.name));
  return Object.keys(MTG.DEFS).filter(name => !generic.has(name)).sort();
}

function choose(trace) {
  return { decide: async (_game, query) => {
    trace.push(query.type);
    const minimum = Math.max(0, query.min ?? query.count ?? 0);
    if (query.type === 'priority') return { kind: 'pass' };
    if (query.type === 'chooseTargets') return query.candidates.slice(0, minimum);
    if (query.type === 'chooseCards') return query.from.slice(0, minimum);
    if (query.type === 'chooseOption') return query.options.find(option => option.key === 'yes')?.key ?? query.options[0]?.key;
    if (query.type === 'chooseMulti') return query.options.slice(0, minimum).map(option => option.key);
    if (query.type === 'chooseX') return Math.max(minimum, Math.min(1, query.max ?? 1));
    if (query.type === 'orderTriggers') return query.triggers || query.items || [];
    if (query.type === 'bottomCards') return (query.cards || []).slice(0, minimum);
    if (query.type === 'scry') return { top: query.cards.slice(), bottom: [] };
    if (['attackers', 'blockers', 'combatReview'].includes(query.type)) return [];
    return null;
  } };
}

function put(MTG, game, player, name, zone) {
  assert.ok(MTG.DEFS[name], `native audit fixture exists: ${name}`);
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.zone = zone;
  card.sick = false;
  if (zone === 'battlefield') game.battlefield.push(card);
  else player[zone].push(card);
  return card;
}

async function settle(game) {
  let transitions = 0;
  while (game.stack.length || game.pendingTriggers.length) {
    assert.ok(transitions++ < 150, 'native cast/entry triggers did not settle within 150 Stack transitions');
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
  }
  await game.checkSBA();
  return transitions;
}

// Broad runtime smoke, not an Oracle-meaning proof: a fixed real-card board
// supplies common target/cost categories without changing the subject's rules.
// A missing legal offer is reported as a prerequisite gap, never a pass.
export async function auditNativeCard(MTG, name, role) {
  const trace = [];
  const game = new MTG.Game({ seed: 18484, paced: false, maxTurns: 30 });
  const players = ['Audit player', 'Opponent B', 'Opponent C'].map(label => game.addPlayer(label, { name: label }, choose(trace), false));
  const [player, opponent] = players;
  if (role === 'ai') {
    player.isAI = true;
    player.controller = new MTG.AIController(player, { difficulty: 'hard', style: 'balanced' });
  }
  game.turnPlayer = player;
  game.turnNo = 8;
  game.phase = 'main1';
  game.step = 'main';
  game.priorityRound = async () => {};
  game.revealToHuman = async () => {};
  game.reviewGlobalEffectWithHuman = async () => {};
  game.reviewCombatWithHuman = async () => {};
  for (const owner of players) {
    owner.colorIdentity = ['W', 'U', 'B', 'R', 'G'];
    for (const color of Object.keys(owner.pool)) owner.pool[color] = 20;
    for (let i = 0; i < 32; i++) put(MTG, game, owner, ['Forest', 'Grizzly Bears', 'Divination', 'Sol Ring'][i % 4], 'library');
    for (const card of ['Forest', 'Island', 'Swamp', 'Mountain', 'Plains', 'Wastes', 'Grizzly Bears', 'Wind Drake', 'Sol Ring', 'Glorious Anthem']) put(MTG, game, owner, card, 'battlefield');
    for (const card of ['Forest', 'Grizzly Bears', 'Divination', 'Sol Ring', 'Pacifism']) put(MTG, game, owner, card, 'graveyard');
    for (const card of ['Forest', 'Grizzly Bears', 'Divination', 'Sol Ring']) put(MTG, game, owner, card, 'hand');
  }
  const prerequisites = [];
  const extra = (card, owner, zone, reason) => { put(MTG, game, owner, card, zone); prerequisites.push(reason); };
  if (['Entrancing Melody', 'Stolen by the Fae'].includes(name)) extra('Llanowar Elves', opponent, 'battlefield', 'Mana value 1 creature for the declared X=1.');
  if (name === 'Despark') extra('Colossal Dreadmaw', opponent, 'battlefield', 'Permanent with mana value at least 4.');
  if (name === 'Victimize') extra('Llanowar Elves', player, 'graveyard', 'Second creature card in your graveyard.');
  if (name === 'Back in Town') extra('Ragavan, Nimble Pilferer', player, 'graveyard', 'Pirate outlaw in your graveyard.');
  if (name === 'Ultimate Nullification') extra('Aunt May', player, 'battlefield', 'Legendary creature for the actual additional sacrifice cost.');
  if (name === 'Rakdos, Lord of Riots') { await game.loseLife(opponent, 1, 'Native cast prerequisite'); prerequisites.push('Opponent actually lost life this turn.'); }
  game.recalc();
  const subject = put(MTG, game, player, name, 'hand');
  const oracle = subject.def.oracle || '';
  const incomingSpell = /counter target (?:\w+ )*spell/i.test(oracle) ||
    ((subject.is('Instant') || subject.is('Sorcery')) && /\btarget (?:[a-z/-]+(?:,)? ){0,7}spell\b/i.test(oracle));
  if (incomingSpell) {
    const spell = put(MTG, game, opponent, 'Lightning Bolt', 'hand');
    const controller = opponent.controller;
    opponent.controller = { decide: async (g, q) => q.type === 'chooseTargets'
      ? q.candidates.filter(card => card.zone === 'battlefield' && card.ctrl === player).slice(0, q.min ?? 1)
      : controller.decide(g, q) };
    game.turnPlayer = opponent;
    assert.equal(await game.castSpell(opponent, spell, { from: 'hand' }), true, 'Incoming Lightning Bolt is actually cast');
    opponent.controller = controller;
    game.turnPlayer = player;
    prerequisites.push('Actual opponent Lightning Bolt targets a permanent you control.');
  }
  const complete = async (action, manaSpent, transitions = 0) => {
    transitions += await settle(game);
    assertGameStateInvariants(game, `${name}/${role}/resolved`);
    assertRecalculationStable(game, `${name}/${role}/resolved`);
    assert.equal(game.aiDecisionLog?.some(row => row.fallback) || false, false, `${name}/${role}: AI fallback`);
    assert.equal(game._decisionFallbacks || 0, 0, `${name}/${role}: malformed controller answer`);
    return { name, role, status: 'runtime-smoke-pass', action, zone: subject.zone, manaSpent, transitions, prerequisites, queryTypes: [...new Set(trace)] };
  };
  const execute = async () => {
    const beforeMana = Object.values(player.pool).reduce((a, b) => a + b, 0);
    if (name === 'Ancestral Vision') {
      const suspended = game.activatableList(player).find(row => row.card === subject && row.suspend);
      assert.ok(suspended, 'Actual Suspend special action is available');
      assert.equal(await game.activateAbility(player, suspended), true);
      const manaSpent = beforeMana - Object.values(player.pool).reduce((a, b) => a + b, 0);
      assert.equal(manaSpent, 1); assert.equal(subject.zone, 'exile'); assert.equal(subject.meta.suspended, 4);
      let transitions = 0, draining = false, upkeeps = 0;
      game.priorityRound = async () => {
        if (draining) return;
        draining = true;
        try { transitions += await settle(game); } finally { draining = false; }
      };
      game.mainPhase = async () => {};
      game.combatPhase = async () => {};
      for (let turns = 0; subject.zone === 'exile' && turns < 12; turns++) {
        if (game.turnPlayer === player) upkeeps++;
        await game.runTurn();
      }
      assert.equal(upkeeps, 4); assert.equal(subject.zone, 'graveyard', 'Four actual upkeeps cast and resolve the suspended spell');
      prerequisites.push('Paid Suspend special action followed by four actual own upkeeps.');
      return complete('suspend-then-cast', manaSpent, transitions);
    }
    const land = game.playableLands(player).includes(subject);
    const offers = land ? [] : game.castableList(player).filter(row => row.card === subject);
    if (!land && !offers.length) {
      assertGameStateInvariants(game, `${name}/${role}/unoffered`);
      return { name, role, status: 'prerequisite-gap', reason: 'No legal cast/land offer on the common fixture board.', queryTypes: [...new Set(trace)] };
    }
    const offer = offers.find(row => !row.alt) || offers[0];
    const accepted = land ? await game.playLand(player, subject) : await game.castSpell(player, subject, { from: offer.from, ...(offer.alt ? { alt: offer.alt } : {}), xVal: 1 });
    if (!accepted) return { name, role, status: 'choice-gap', reason: 'Offered action declined or lacked prerequisites after the fixed controller choices.', queryTypes: [...new Set(trace)] };
    return complete(land ? 'play-land' : 'cast', beforeMana - Object.values(player.pool).reduce((a, b) => a + b, 0));
  };
  if (name === 'Take the Bait') {
    let result, attempted = false;
    const controller = opponent.controller;
    opponent.controller = { decide: async (g, q) => q.type === 'attackers'
      ? [{ card: q.eligible.find(card => card.name === 'Grizzly Bears'), target: player }]
      : controller.decide(g, q) };
    game.turnPlayer = opponent;
    game.priorityRound = async () => {
      if (attempted || game.step !== 'attackers' || !game.combat?.attackers.length) return;
      attempted = true; prerequisites.push('Actual opponent combat after declaring an attacker.'); result = await execute();
    };
    await game.combatPhase(opponent);
    assert.ok(attempted, 'Actual opponent combat supplies a legal cast window');
    assertGameStateInvariants(game, `${name}/${role}/combat-finished`);
    return result;
  }
  return execute();
}

export async function auditNativeCatalog(MTG, names = nativeCatalogNames(MTG)) {
  const results = [];
  for (const name of names) for (const role of ['human', 'ai']) {
    if (process.env.NATIVE_AUDIT_PROGRESS) console.error(`[native-audit] ${results.length + 1}/${names.length * 2} ${name}/${role}`);
    try { results.push(await auditNativeCard(MTG, name, role)); }
    catch (error) { results.push({ name, role, status: 'error', error: error.stack || error.message }); }
  }
  return { schema: 'native-runtime-smoke/v1', cards: names.length, results,
    counts: Object.fromEntries(['runtime-smoke-pass', 'prerequisite-gap', 'choice-gap', 'error'].map(status => [status, results.filter(row => row.status === status).length])),
    limitation: 'Common-board cast/land and entry-trigger smoke, with explicitly reported card-specific prerequisites and Ancestral Vision Suspend/upkeep smoke. Activated abilities, all modes and card-specific semantic correctness require dedicated tests. Gaps are not passing coverage.' };
}
