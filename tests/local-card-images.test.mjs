import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadEngine } from './helpers/load-engine.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeFiles = ['src/modules/ui.js', 'src/modules/main.js', 'src/modules/multiplayer-ui.js'];
const faceName = name => String(name || '').split(' // ')[0];

test('runtime card art uses local WebP except the explicit API fallback list', () => {
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
  assert.equal(typeof MTG.cardImageAPIURL, 'function');
  for(const name of expected){
    const image=MTG.cardImageURL(name);
    if(MTG.CARD_IMAGE_MISSING.includes(name))assert.match(image,/^https:\/\/api\.scryfall\.com\//);
    else{assert.notEqual(image,MTG.CARD_IMAGE_PLACEHOLDER,name+': canonical card or token name retains its local art');assert.match(image,/^\.\/assets\/cards\/.+\.webp$/);}
  }
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

  for (const name of MTG.CARD_IMAGE_MISSING) {
    const url = new URL(MTG.cardImageURL(name));
    assert.equal(url.origin + url.pathname, MTG.CARD_IMAGE_API_BASE);
    assert.equal(url.searchParams.get('format'), 'image');
    assert.equal(url.searchParams.get('version'), 'normal');
    assert.equal(url.searchParams.get('fuzzy'), name);
  }
  assert.match(MTG.cardImageURL('Sol Ring'), /^\.\/assets\/cards\/.+\.webp$/);
  const oracleImage = new URL(MTG.cardImageURL('A.I.M. Bot'));
  assert.equal(oracleImage.origin + oracleImage.pathname, `${MTG.CARD_IMAGE_ID_API_BASE}${MTG.CARD_CATALOG['A.I.M. Bot'].scryfallId}`);
  assert.equal(oracleImage.searchParams.get('format'), 'image');
  assert.equal(oracleImage.searchParams.get('version'), 'normal');

  const failedAPIImage = {
    src: MTG.cardImageURL(MTG.CARD_IMAGE_MISSING[0]),
    getAttribute(name) { return name === 'src' ? this.src : null; },
    removeAttribute() {},
    classList: { add() {} },
  };
  MTG.imgFail(failedAPIImage);
  assert.equal(failedAPIImage.src, MTG.CARD_IMAGE_PLACEHOLDER);
  assert.equal(failedAPIImage._apiFallback, true);
  assert.equal(failedAPIImage._failed, undefined);

  const failedOracleImage = {
    src: MTG.cardImageURL('A.I.M. Bot'),
    getAttribute(name) { return name === 'src' ? this.src : null; },
    removeAttribute() {},
    classList: { add() {} },
  };
  MTG.imgFail(failedOracleImage);
  assert.equal(failedOracleImage.src, MTG.CARD_IMAGE_PLACEHOLDER);
  assert.equal(failedOracleImage._apiFallback, true);
});

test('browser renderers contain no ad hoc Scryfall image URL', () => {
  for (const relative of runtimeFiles) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    assert.doesNotMatch(source, /api\.scryfall\.com|cards\.scryfall\.io/);
    assert.match(source, /cardImageURL/);
  }
});

test('Amass creates Orc and Zombie Armies with local art that survives later amass', async () => {
  const MTG = loadEngine();
  for (const kind of ['Orc', 'Zombie']) {
    const game = new MTG.Game({ seed: 31831, paced: false });
    const player = game.addPlayer('Army image check', { name: 'Sauron import' }, null, false);
    const army = await MTG.E.amass(game, player, 2, kind);
    const asset = MTG.cardImageURL(army.name);
    assert.notEqual(asset, MTG.CARD_IMAGE_PLACEHOLDER, `${army.name} must not show the card back`);
    assert.match(asset, /^\.\/assets\/cards\/.+\.webp$/);
    assert.ok(fs.statSync(path.join(root, asset.slice(2))).size > 100);
    assert.equal(army.counters['+1/+1'], 2);

    const otherKind = kind === 'Orc' ? 'Zombie' : 'Orc';
    const sameArmy = await MTG.E.amass(game, player, 1, otherKind);
    assert.equal(sameArmy, army);
    assert.equal(game.creatures(player).length, 1);
    assert.equal(army.hasSub(otherKind), true);
    assert.equal(army.counters['+1/+1'], 3);
    assert.equal(MTG.cardImageURL(army.name), asset);
  }
});
