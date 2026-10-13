import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const M = loadEngine();

function table() {
  const controller = { decide: async (_game, request) => {
    if (request.type === 'chooseOption') return request.options.find(option => option.key === 'yes')?.key || request.options[0]?.key;
    if (request.type === 'orderTriggers') return request.triggers;
    return { kind: 'pass' };
  } };
  const game = new M.Game({ seed: 2026, paced: false });
  const player = game.addPlayer('Researcher owner', M.DECKS['Deep Clue Sea'], controller, false);
  const rival = game.addPlayer('Rival', M.DECKS['Quick Draw'], controller, true);
  game.turnPlayer = player;
  game.turnNo = 8;
  game.phase = 'end';
  game.step = 'end';
  player.turnsStarted = 3;
  const spell = new M.CardInst(M.DEFS.Brainstorm, player);
  spell.zone = 'hand';
  player.hand.push(spell);
  return { game, player, rival, spell };
}

async function firstPriorityOfNextTurn(game, player) {
  const boundary = Symbol('first priority reached');
  const originalPriority = game.priorityRound;
  game.turnPlayer = player;
  game.priorityRound = async () => { throw boundary; };
  try {
    await assert.rejects(game.runTurn(), error => error === boundary);
  } finally {
    game.priorityRound = originalPriority;
  }
  assert.equal(game.phase, 'upkeep', 'probe the first native priority window before drawing or taking later actions');
}

test('Innocuous Researcher casting lock survives JSON Continue and expires at the next own turn', async () => {
  const { game, player, rival, spell } = table();
  const researcher = new M.CardInst(M.DEFS['Innocuous Researcher'], player);
  researcher.zone = 'battlefield';
  researcher.sick = false;
  game.battlefield.push(researcher);
  game.recalc();
  assert.equal(game.canCastTiming(player, spell), true);
  await game.emit('endStep', { player });
  await game.flushTriggers();
  while (game.stack.length || game.pendingTriggers.length) {
    if (game.stack.length) await game.resolveTop();
    await game.flushTriggers();
  }
  assert.equal(player.cantCastUntilTurnStart, 4, 'the actual optional end-step trigger creates the restriction');
  assert.equal(game.canCastTiming(player, spell), false);
  game.turnPlayer = rival;
  const snapshot = M.captureGameState(game);
  assert.ok(snapshot, M.gameStateSnapshotBlockers(game).join(', '));
  assert.equal(snapshot.players[0].cantCastUntilTurnStart, 4);
  const restored = table().game;
  M.restoreGameState(restored, JSON.parse(JSON.stringify(snapshot)));
  const restoredPlayer = restored.players[0];
  const restoredSpell = restored.byIid(spell.iid);
  assert.equal(M.gameStateFingerprint(restored), M.gameStateFingerprint(game));
  assert.equal(restored.canCastTiming(restoredPlayer, restoredSpell), false);
  delete restoredPlayer.cantCastUntilTurnStart;
  assert.notEqual(M.gameStateFingerprint(restored), M.gameStateFingerprint(game), 'the fingerprint must notice a missing casting restriction');
  restoredPlayer.cantCastUntilTurnStart = 4;

  await firstPriorityOfNextTurn(restored, restored.players[1]);
  assert.equal(restoredPlayer.turnsStarted, 3);
  assert.equal(restored.canCastTiming(restoredPlayer, restoredSpell), false, 'the rival turn does not end the restriction');
  await firstPriorityOfNextTurn(restored, restoredPlayer);
  assert.equal(restoredPlayer.turnsStarted, 4);
  assert.equal(restored.canCastTiming(restoredPlayer, restoredSpell), true, 'the next own turn expires the saved restriction naturally');
});

test('older snapshots without a casting lock still restore and clear an unrelated target lock', () => {
  const { game, spell } = table();
  const snapshot = M.captureGameState(game);
  assert.ok(snapshot);
  assert.equal(Object.hasOwn(snapshot.players[0], 'cantCastUntilTurnStart'), false);
  const restored = table().game;
  restored.players[0].cantCastUntilTurnStart = 99;
  M.restoreGameState(restored, JSON.parse(JSON.stringify(snapshot)));
  assert.equal(restored.players[0].cantCastUntilTurnStart, undefined);
  assert.equal(restored.canCastTiming(restored.players[0], restored.byIid(spell.iid)), true);
  snapshot.players[0].cantCastUntilTurnStart = 0;
  M.restoreGameState(restored, JSON.parse(JSON.stringify(snapshot)));
  assert.equal(restored.players[0].cantCastUntilTurnStart, 0);
  assert.equal(restored.canCastTiming(restored.players[0], restored.byIid(spell.iid)), true);
});

test('invalid saved casting restrictions fail before changing the target table', () => {
  const snapshot = JSON.parse(JSON.stringify(M.captureGameState(table().game)));
  const restored = table().game;
  const before = M.gameStateFingerprint(restored);
  for (const invalid of [null, -1, 0.5, '4', false, {}, [4], Number.MAX_SAFE_INTEGER + 1]) {
    snapshot.players[0].cantCastUntilTurnStart = invalid;
    assert.throws(() => M.restoreGameState(restored, snapshot), /invalid player casting restriction/);
    assert.equal(M.gameStateFingerprint(restored), before);
  }
});
