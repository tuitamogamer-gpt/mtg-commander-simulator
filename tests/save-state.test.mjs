import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

// A save that writes the board down, instead of replaying every decision the
// player ever made onto a fresh engine. The replay format broke whenever the
// rules engine or the AI changed; a board does not care.

const MTG = loadEngine();
const decks = () => Object.keys(MTG.DECKS);

function soloSetup(index, seed) {
  const names = decks();
  const picks = [0, 1, 2, 3].map(offset => names[(index * 5 + offset * 3) % names.length]);
  return {
    humanDeck: picks[0], aiDecks: picks.slice(1),
    aiStyles: ['balanced', 'balanced', 'balanced'],
    difficulty: 'normal', seed, maxTurns: 30, paced: false,
  };
}

test('a game snapshot restores to exactly the same board', { timeout: 300_000 }, async () => {
  let taken = 0;
  let blocked = 0;
  let identical = 0;
  const problems = [];
  for (let index = 0; index < 4; index++) {
    const setup = soloSetup(index, 1200 + index);
    const game = MTG.newGame(setup);
    const snapshots = [];
    game.onTurnCheckpoint = () => {
      const snapshot = MTG.captureGameState(game);
      if (snapshot) snapshots.push({ snapshot, fingerprint: MTG.gameStateFingerprint(game) });
      else blocked++;
    };
    await game.start();
    taken += snapshots.length;
    for (const { snapshot, fingerprint } of snapshots) {
      const fresh = MTG.newGame(setup);
      try {
        // through JSON, exactly as a stored save would travel
        MTG.restoreGameState(fresh, JSON.parse(JSON.stringify(snapshot)));
        if (MTG.gameStateFingerprint(fresh) === fingerprint) identical++;
        else problems.push(`turn ${snapshot.turnNo}: the restored board differs`);
      } catch (error) {
        problems.push(`turn ${snapshot.turnNo}: ${error.message}`);
      }
    }
  }
  assert.ok(taken > 80, `too few snapshots to prove anything: ${taken}`);
  assert.ok(taken / (taken + blocked) > 0.9,
    `a snapshot must be possible at almost every turn boundary (${taken} of ${taken + blocked})`);
  assert.deepEqual(problems.slice(0, 10), [], problems.slice(0, 10).join('\n'));
  assert.equal(identical, taken, 'every restored board must match the one that was saved');
});

test('a restored game keeps playing to a finish', { timeout: 300_000 }, async () => {
  for (let index = 0; index < 3; index++) {
    const setup = soloSetup(index, 1500 + index);
    const game = MTG.newGame(setup);
    let snapshot = null;
    game.onTurnCheckpoint = () => {
      if (game.turnNo >= 8 && !snapshot) snapshot = MTG.captureGameState(game);
    };
    await game.start();
    assert.ok(snapshot, 'the fixture must reach a saveable turn boundary');

    const resumed = MTG.newGame(setup);
    MTG.restoreGameState(resumed, JSON.parse(JSON.stringify(snapshot)));
    assert.equal(resumed.turnNo, snapshot.turnNo, 'the resumed game starts where the save ended');
    resumed.maxTurns = snapshot.turnNo + 25;
    await MTG.resumeGame(resumed);
    assert.ok(resumed.turnNo > snapshot.turnNo, 'the resumed game advances');
    assert.ok(resumed.gameOver, 'and reaches an ending');
  }
});

test('a snapshot is refused while anything unsaveable is in play', async () => {
  const setup = soloSetup(1, 1700);
  const game = MTG.newGame(setup);
  await game.start();
  const [player] = game.players;
  game.stack.push({ kind: 'ability', name: 'probe', ctrl: player, targets: [], run: async () => {} });
  assert.equal(MTG.canSnapshotGameState(game), false, 'a non-empty stack blocks a snapshot');
  assert.match(MTG.gameStateSnapshotBlockers(game).join(' '), /stack/);
  assert.equal(MTG.captureGameState(game), null, 'and no snapshot is produced');
  game.stack.length = 0;
  game.untilEffects.push({ expires: 'eot', kind: 'probe', apply: () => {} });
  assert.equal(MTG.captureGameState(game), null, 'a lasting effect blocks a snapshot too');
  game.untilEffects.length = 0;
  assert.ok(MTG.captureGameState(game), 'and a clean board can be saved again');
});

test('the account checkpoint carries the board and stays small', { timeout: 120_000 }, async () => {
  const setup = soloSetup(2, 1800);
  const game = MTG.newGame(setup);
  let snapshot = null;
  game.onTurnCheckpoint = () => { if (game.turnNo >= 10 && !snapshot) snapshot = MTG.captureGameState(game); };
  await game.start();
  assert.ok(snapshot, 'the fixture must reach a saveable turn boundary');

  const saveSetup = {
    deck: setup.humanDeck, commanders: [], ai: 3, aiDecks: setup.aiDecks,
    aiStyles: setup.aiStyles, difficulty: 'normal', manaMode: 'auto', prioMode: 'end',
    seed: String(setup.seed), createdAt: new Date().toISOString(),
  };
  const payload = MTG.buildAccountSave(game, saveSetup, [], 'match-test', snapshot);
  const wire = JSON.stringify(payload);
  assert.ok(payload.state, 'the checkpoint carries the board');
  assert.ok(wire.length < 400_000, `a checkpoint must stay small enough to store (${wire.length} bytes)`);
  MTG.validateAccountSave(JSON.parse(wire));

  const fresh = MTG.newGame(setup);
  MTG.restoreGameState(fresh, JSON.parse(wire).state);
  assert.equal(fresh.turnNo, snapshot.turnNo);
  assert.equal(fresh.battlefield.length, snapshot.cards.filter(card => card.zone === 'battlefield').length);
});

test('an older checkpoint without a board still validates', () => {
  const legacy = {
    schema: 'commander-save/v1', mode: 'solo', matchId: 'legacy', createdAt: new Date().toISOString(),
    setup: {
      deck: decks()[0], commanders: [], ai: 1, aiDecks: [decks()[1]], aiStyles: ['balanced'],
      aiCustomSkills: [], aiRandomCommanders: false, sumPartnerDamage: false, diplomacyEnabled: false,
      difficulty: 'normal', manaMode: 'auto', prioMode: 'end', seed: '5',
    },
    decisions: [],
    summary: { deck: decks()[0], commanders: [], turn: 3, decisionCount: 0 },
  };
  assert.doesNotThrow(() => MTG.validateAccountSave(legacy), 'replay-only saves keep working');
});
