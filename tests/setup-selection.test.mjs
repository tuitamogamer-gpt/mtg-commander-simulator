import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

test('selected AI decks stay assigned to their seats while random seats are filled uniquely', () => {
  const MTG = loadEngine();
  const picks = MTG.selectAIDecks(
    'Doom Prevails',
    3,
    ['', 'Turtle Power', 'Elven Council'],
    MTG.mulberry32(42),
  );

  assert.equal(picks.length, 3);
  assert.equal(picks[1], 'Turtle Power');
  assert.equal(picks[2], 'Elven Council');
  assert.equal(new Set(['Doom Prevails', ...picks]).size, 4);
});

test('invalid and duplicate AI selections fall back to distinct built-in decks', () => {
  const MTG = loadEngine();
  const picks = MTG.selectAIDecks(
    'Doom Prevails',
    3,
    ['Doom Prevails', 'Turtle Power', 'Turtle Power'],
    MTG.mulberry32(7),
  );

  assert.equal(picks[1], 'Turtle Power');
  assert.equal(new Set(['Doom Prevails', ...picks]).size, 4);
  assert.ok(picks.every(name => MTG.DECKS[name] && !MTG.DECKS[name].custom));
});
