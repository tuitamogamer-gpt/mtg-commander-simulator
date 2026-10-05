import test from 'node:test';
import assert from 'node:assert/strict';
import {M, setup, card, body, play, settle} from './helpers/c21-fixtures.mjs';

// A save writes a face-down permanent's kind and rebuilds its face from that
// kind, so every special face-down kind must be described by the kind alone.

function roundTrip(f) {
  assert.deepEqual(Array.from(M.gameStateSnapshotBlockers(f.game)), []);
  const snapshot = M.captureGameState(f.game);
  assert.ok(snapshot);
  const fresh = setup('human').game;
  M.restoreGameState(fresh, JSON.parse(JSON.stringify(snapshot)));
  assert.equal(M.gameStateFingerprint(fresh), M.gameStateFingerprint(f.game));
  return fresh;
}

test('a face-down Cyberman stays a pumped Cyberman artifact creature after a save', async () => {
  const f = setup('human'), bears = body(f, f.b);
  card(f, 'The Cyber-Controller', 'battlefield', f.b);
  await play(f, 'Cyber Conversion');
  assert.ok(bears.faceDown && bears.is('Artifact') && bears.hasSub('Cyberman'));
  assert.equal(bears.power, 3, "The Cyber-Controller pumps its controller's other artifact creatures");
  const fresh = roundTrip(f);
  const restored = fresh.byIid(bears.iid);
  assert.ok(restored.faceDown && restored.is('Artifact') && restored.hasSub('Cyberman'));
  assert.equal(restored.power, 3);
  assert.equal(restored.toughness, 3);
  assert.equal(fresh.faceUpCosts(restored).length, 0, 'a Cyberman still cannot be turned up for its mana cost');
});

test("Yedora's face-down Forest stays a land after a save", async () => {
  const f = setup('human'), bears = body(f);
  await play(f, 'Yedora, Grave Gardener');
  await f.game.destroy(bears);
  await settle(f.game);
  assert.ok(bears.faceDown && bears.is('Land') && bears.hasSub('Forest') && !bears.is('Creature'));
  const fresh = roundTrip(f);
  const restored = fresh.byIid(bears.iid);
  assert.ok(restored.faceDown && restored.is('Land') && restored.hasSub('Forest'));
  assert.ok(!restored.is('Creature'), 'not a face-down 2/2 creature');
  assert.equal(fresh.faceUpCosts(restored).length, 0);
});
