import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadEngine } from './helpers/load-engine.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeFiles = ['src/modules/ui.js', 'src/modules/main.js', 'src/modules/multiplayer-ui.js'];
const faceName = name => String(name || '').split(' // ')[0];

test('all runtime card art uses the local hardcoded manifest', () => {
  const MTG = loadEngine();
  const expected = new Set();
  const commanders = new Set();
  for (const deck of Object.values(MTG.DECKS)) {
    commanders.add(faceName(deck.commander));
    expected.add(faceName(deck.commander));
    for (const card of deck.cards || []) expected.add(faceName(card.name));
  }
  for (const token of Object.values(MTG.TOKENS || {})) if (token && token.name) expected.add(faceName(token.name));

  assert.equal(typeof MTG.cardImageURL, 'function');
  assert.deepEqual([...expected].filter(name => !MTG.CARD_IMAGE_PATHS[name]), []);
  assert.deepEqual([...commanders].filter(name => !MTG.CARD_ART_PATHS[name]), []);
  assert.equal(Object.keys(MTG.CARD_IMAGE_PATHS).length, expected.size);
  assert.deepEqual(
    Object.entries(MTG.CARD_IMAGE_PATHS).filter(([, asset]) => asset === MTG.CARD_IMAGE_PLACEHOLDER).map(([name]) => name).sort(),
    [...MTG.CARD_IMAGE_MISSING].sort(),
  );

  const localPaths = new Set([
    ...Object.values(MTG.CARD_IMAGE_PATHS),
    ...Object.values(MTG.CARD_ART_PATHS),
    MTG.CARD_IMAGE_PLACEHOLDER,
  ]);
  for (const assetPath of localPaths) {
    assert.match(assetPath, /^\.\/assets\/cards\/.+\.webp$/);
    const absolute = path.join(root, assetPath.slice(2));
    const bytes = fs.readFileSync(absolute);
    assert.ok(bytes.length > 100, `${assetPath} is empty`);
    assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF', `${assetPath} is not RIFF WebP`);
    assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP', `${assetPath} is not WebP`);
  }
});

test('browser modules contain no runtime Scryfall image API URL', () => {
  for (const relative of runtimeFiles) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    assert.doesNotMatch(source, /api\.scryfall\.com|cards\.scryfall\.io/);
    assert.match(source, /cardImageURL/);
  }
});
