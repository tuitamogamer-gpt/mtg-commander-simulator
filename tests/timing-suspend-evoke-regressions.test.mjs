import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function defaultDecision(game, query) {
  if (query.type === 'priority') return { kind: 'pass' };
  if (query.type === 'main') return { kind: 'done' };
  if (query.type === 'attackers' || query.type === 'blockers' || query.type === 'combatReview') return [];
  if (query.type === 'chooseOption') return query.options[0]?.key;
  if (query.type === 'chooseTargets') return query.candidates.slice(0, query.min || 0);
  if (query.type === 'chooseCards') return query.from.slice(0, query.min || 0);
  if (query.type === 'chooseX') return query.max;
  if (query.type === 'chooseMulti') return query.options.slice(0, query.min || 1).map(option => option.key);
  if (query.type === 'orderTriggers') return query.triggers;
  if (query.type === 'scry') return { top: query.cards.slice(), bottom: [] };
  return null;
}

function rulesGame(deciders = []) {
  const game = new MTG.Game({ seed: 240824, paced: false, maxTurns: 30 });
  const players = ['Player', 'Opponent'].map((name, index) => game.addPlayer(
    name,
    { name: `${name} deck` },
    { decide: async (g, query) => deciders[index] ? deciders[index](g, query) : defaultDecision(g, query) },
    index > 0,
  ));
  game.turnPlayer = players[0];
  game.turnNo = 8;
  game.phase = 'main1';
  game.step = 'main';
  return { game, players };
}

function inZone(player, name, zone) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.zone = zone;
  player[zone].push(card);
  return card;
}

function permanent(game, player, name) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.ctrl = player;
  card.zone = 'battlefield';
  card.sick = false;
  game.battlefield.push(card);
  game.recalc();
  return card;
}

test('Foretell is offered through priority throughout its controller turn, including combat with a nonempty stack', async () => {
  let priorityActions = [];
  const { game, players: [player, opponent] } = rulesGame([
    (g, query) => {
      if (query.type === 'priority') {
        priorityActions = query.acts.slice();
        return { kind: 'pass' };
      }
      return defaultDecision(g, query);
    },
  ]);
  const voyage = inZone(player, 'Haunting Voyage', 'hand');
  player.pool.C = 2;
  game.phase = 'combat';
  game.step = 'blockers';
  game.stack.push({ kind: 'trigger', name: 'Existing trigger', ctrl: opponent, ctx: { targets: [] }, run: async () => {} });

  await game.askPriorityAction(player);
  const foretell = priorityActions.find(entry => entry.card === voyage && entry.foretell);
  assert.ok(foretell, 'Foretell must be visible in an own-turn combat priority window');
  game.priorityState = { holder: player, consecutivePasses: 0, neededPasses: 2 };
  assert.equal(await game.activateAbility(player, foretell), true);
  game.priorityState = null;
  assert.equal(voyage.zone, 'exile');
  assert.equal(voyage.faceDown, true);

  const otherVoyage = inZone(player, 'Haunting Voyage', 'hand');
  player.pool.C = 2;
  game.turnPlayer = opponent;
  assert.equal(game.activatableList(player, true).some(entry => entry.card === otherVoyage && entry.foretell), false,
    'Foretell is unavailable during another player turn');
});

test('Suspend follows the card cast timing and remains a special action on an opponent turn', async () => {
  let priorityActions = [];
  const { game, players: [player, opponent] } = rulesGame([
    (g, query) => {
      if (query.type === 'priority') {
        priorityActions = query.acts.slice();
        return { kind: 'pass' };
      }
      return defaultDecision(g, query);
    },
  ]);
  const sentence = inZone(player, 'Suspended Sentence', 'hand');
  const vision = inZone(player, 'Ancestral Vision', 'hand');
  player.pool.B = 1;
  player.pool.C = 1;
  player.pool.U = 1;
  game.turnPlayer = opponent;
  game.phase = 'combat';
  game.step = 'attackers';
  game.stack.push({ kind: 'trigger', name: 'Combat trigger', ctrl: opponent, ctx: { targets: [] }, run: async () => {} });

  await game.askPriorityAction(player);
  const suspend = priorityActions.find(entry => entry.card === sentence && entry.suspend);
  assert.ok(suspend, 'An instant may be suspended while its owner has priority on an opponent turn');
  assert.equal(priorityActions.some(entry => entry.card === vision && entry.suspend), false,
    'A sorcery may not be suspended when it could not be cast');
  game.priorityState = { holder: player, consecutivePasses: 0, neededPasses: 2 };
  assert.equal(await game.activateAbility(player, suspend), true);
  game.priorityState = null;
  assert.equal(sentence.zone, 'exile');
  assert.equal(sentence.meta.suspended, 3);
  assert.equal(game.stack.length, 1, 'Suspend itself does not use the stack');
});

test('Suspend upkeep uses two respondable triggers before the mandatory free cast', async () => {
  const timeline = [];
  let vision;
  const recorder = (g, query) => {
    if (query.type === 'priority') {
      const top = query.stack[query.stack.length - 1];
      if (top) timeline.push({ kind: 'priority', name: top.name, counter: vision.meta.suspended, zone: vision.zone });
      return { kind: 'pass' };
    }
    if (query.type === 'chooseOption' && query.aiHint?.kind === 'suspendCast') {
      assert.fail('the last-counter Suspend cast is mandatory, not a Yes/No choice');
    }
    return defaultDecision(g, query);
  };
  const { game, players: [player, opponent] } = rulesGame([recorder, recorder]);
  vision = inZone(player, 'Ancestral Vision', 'exile');
  vision.meta.suspended = 1;
  // Legal instant responses force askPriorityAction to expose both trigger
  // windows to the controllers instead of taking its no-actions fast path.
  inZone(player, 'Consider', 'hand');
  inZone(opponent, 'Consider', 'hand');
  permanent(game, player, 'Island');
  permanent(game, opponent, 'Island');
  for (let i = 0; i < 12; i++) {
    inZone(player, 'Island', 'library');
    inZone(opponent, 'Mountain', 'library');
  }

  await game.runTurn();

  const removeIndex = timeline.findIndex(event => event.kind === 'priority' && /Suspend: remove a time counter/.test(event.name));
  const castIndex = timeline.findIndex(event => event.kind === 'priority' && /Suspend: cast/.test(event.name));
  const spellIndex = timeline.findIndex(event => event.kind === 'priority' && event.name === 'Ancestral Vision');
  assert.ok(removeIndex >= 0, 'the time-counter trigger received priority before resolving');
  assert.equal(timeline[removeIndex].counter, 1, 'the counter remains until its trigger resolves');
  assert.ok(castIndex > removeIndex, 'removing the last counter created a separate cast trigger');
  assert.equal(timeline[castIndex].counter, 0);
  assert.ok(spellIndex > castIndex, 'the mandatory free cast then becomes a separate respondable spell');
  assert.equal(vision.zone, 'graveyard');
  assert.equal(vision.castMeta.alt.free, true);
});

test('a casting prohibition makes the mandatory Suspend cast fail and leaves the card in exile', async () => {
  const seen = [];
  const blocked = (g, query) => {
    if (query.type === 'priority') {
      const top = query.stack[query.stack.length - 1];
      if (top) seen.push(top.name);
      return { kind: 'pass' };
    }
    return defaultDecision(g, query);
  };
  const { game, players: [player, opponent] } = rulesGame([blocked, blocked]);
  const vision = inZone(player, 'Ancestral Vision', 'exile');
  vision.meta.suspended = 1;
  player.cantCastUntilTurnStart = 99;
  inZone(opponent, 'Consider', 'hand');
  permanent(game, opponent, 'Island');
  for (let i = 0; i < 4; i++) {
    inZone(player, 'Island', 'library');
    inZone(opponent, 'Mountain', 'library');
  }

  await game.runTurn();

  assert.ok(seen.some(name => /Suspend: remove a time counter/.test(name)));
  assert.ok(seen.some(name => /Suspend: cast/.test(name)));
  assert.equal(vision.meta.suspended, 0);
  assert.equal(vision.zone, 'exile');
  assert.equal(vision.castMeta, null);
});

test('a copy of an evoked permanent spell enters, triggers, and receives its own Evoke sacrifice', async () => {
  const { game, players: [player, opponent] } = rulesGame();
  game.priorityRound = async () => {};
  const target = permanent(game, opponent, 'Arcane Signet');
  const breaker = inZone(player, 'Foundation Breaker', 'hand');
  player.pool.G = 1;
  player.pool.C = 1;
  const evoke = breaker.def.altCosts.find(option => option.evoke);

  assert.equal(await game.castSpell(player, breaker, { alt: evoke, from: 'hand' }), true);
  const original = game.stack.find(item => item.kind === 'spell' && item.card === breaker && !item.isCopy);
  assert.ok(original);
  const copy = await game.copySpell(original, player);
  assert.equal(copy.castOpts.evoke, true, 'the spell copy retains the paid Evoke choice');

  await game.resolveTop();
  const tokenCopy = game.battlefield.find(card => card.isToken && card.name === 'Foundation Breaker');
  assert.ok(tokenCopy, 'the copied permanent spell first enters as a token');
  assert.ok(game.stack.some(item => /Destroy artifact\/enchantment/.test(item.name)), 'its ETB ability triggered');
  assert.ok(game.stack.some(item => /Evoke sacrifice/.test(item.name)), 'the token has a normal Evoke sacrifice trigger');

  const top = game.stack[game.stack.length - 1];
  assert.match(top.name, /Evoke sacrifice/, 'the controller may order Evoke above the ETB trigger');
  await game.resolveTop();
  assert.equal(tokenCopy.zone, 'ceased', 'the evoked token copy is sacrificed when its trigger resolves');
  await game.resolveTop();
  assert.equal(target.zone, 'graveyard', 'the ETB trigger still resolves after its source was sacrificed');
  assert.ok(game.stack.includes(original), 'the original evoked permanent spell remains independently on the stack');
});
