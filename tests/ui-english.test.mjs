import assert from 'node:assert/strict';
import test from 'node:test';
import { loadEngine } from './helpers/load-engine.mjs';

test('presentation layer translates core game prompts and logs into English', () => {
  const MTG = loadEngine();
  const samples = new Map([
    ['Igra počinje. Redoslijed: You → AI Zmaj.', 'The game begins. Turn order: You → AI Dragon.'],
    ['You zadržava 7 karata.', 'You keeps 7 cards.'],
    ['——— Potez 4: AI Vuk ———', '——— Turn 4: AI Wolf ———'],
    ['Odbaci do 7 u ruci (2)', 'Discard down to 7 cards in hand (2)'],
    ['Coven: izaberi bilo koji broj stvorenja, ali svako mora imati različitu snagu.',
      'Coven: choose any number of creatures, but each must have different power.'],
  ]);

  for (const [source, expected] of samples) assert.equal(MTG.uiText(source), expected);
});

test('discard localization does not get corrupted by the cast translation', () => {
  const MTG = loadEngine();
  assert.equal(MTG.uiText('Odbaci kartu'), 'Discard card');
  assert.equal(MTG.uiText('Baci spell'), 'Cast spell');
});
