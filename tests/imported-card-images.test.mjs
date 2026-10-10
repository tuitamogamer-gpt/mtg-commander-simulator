import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function assertRemoteImage(name, canonicalName, { variant, back = false } = {}) {
  const image = MTG.cardImageURL(name, variant);
  assert.notEqual(image, MTG.CARD_IMAGE_PLACEHOLDER, `${name} must have card art`);
  const url = new URL(image);
  assert.equal(url.origin + url.pathname,
    `${MTG.CARD_IMAGE_ID_API_BASE}${MTG.CARD_CATALOG[canonicalName].scryfallId}`);
  assert.equal(url.searchParams.get('format'), 'image');
  assert.equal(url.searchParams.get('version'), variant === 'art' ? 'art_crop' : 'normal');
  if (back) assert.equal(url.searchParams.get('face'), 'back');
  else assert.notEqual(url.searchParams.get('face'), 'back');
  return image;
}

test('imported Consign // Oblivion shows its recorded printing in the opening hand', () => {
  const canonicalName = MTG.resolveDeckCardName('Consign // Oblivion');
  const card = new MTG.CardInst(MTG.DEFS[canonicalName], null);
  assert.equal(card.name, 'Consign // Oblivion');
  assertRemoteImage(card.name, canonicalName);
});

test('imported Fell the Profane resolves art from its runtime front-face name', () => {
  const canonicalName = MTG.resolveDeckCardName('Fell the Profane');
  const card = new MTG.CardInst(MTG.DEFS[canonicalName], null);
  assert.equal(canonicalName, 'Fell the Profane // Fell Mire');
  assert.equal(card.name, 'Fell the Profane');
  assert.equal(assertRemoteImage(card.name, canonicalName),
    assertRemoteImage(canonicalName, canonicalName));
});

test('Fell Mire selects the back of the same printing, including art crops', () => {
  const canonicalName = 'Fell the Profane // Fell Mire';
  const face = MTG.DEFS[canonicalName].oracleFaces.faces.find(face => face.key === 'back');
  const card = new MTG.CardInst(face.def, null);
  assert.equal(card.name, 'Fell Mire');
  assertRemoteImage(card.name, canonicalName, { back: true });
  assertRemoteImage(card.name, canonicalName, { variant: 'art', back: true });
});

test('both halves of a split card share its front printed image', () => {
  const canonicalName = 'Consign // Oblivion';
  const expected = assertRemoteImage(canonicalName, canonicalName);
  for (const name of ['Consign', 'Oblivion']) {
    assert.equal(assertRemoteImage(name, canonicalName), expected);
  }
});

test('imported multiface front art supports the art-crop variant', () => {
  assertRemoteImage('Consign // Oblivion', 'Consign // Oblivion', { variant: 'art' });
  assertRemoteImage('Fell the Profane', 'Fell the Profane // Fell Mire', { variant: 'art' });
});

test('transforming imported cards show the corresponding physical face', () => {
  const canonicalName = 'Ambitious Farmhand // Seasoned Cathar';
  assertRemoteImage('Ambitious Farmhand', canonicalName);
  assertRemoteImage('Seasoned Cathar', canonicalName, { back: true });
});

test('adventure names use the single printed card image', () => {
  const canonicalName = 'Animating Faerie // Bring to Life';
  const expected = assertRemoteImage(canonicalName, canonicalName);
  for (const name of ['Animating Faerie', 'Bring to Life']) {
    assert.equal(assertRemoteImage(name, canonicalName), expected);
  }
});

test('single-face imported cards retain their recorded normal and art images', () => {
  assertRemoteImage('A.I.M. Bot', 'A.I.M. Bot');
  assertRemoteImage('A.I.M. Bot', 'A.I.M. Bot', { variant: 'art' });
});

test('local precon and token art still takes precedence', () => {
  for (const name of ['Sol Ring', 'Abaddon the Despoiler']) {
    assert.equal(MTG.cardImageURL(name), MTG.CARD_IMAGE_PATHS[name]);
    assert.equal(MTG.cardImageURL(name, 'art'), MTG.CARD_ART_PATHS[name] || MTG.CARD_IMAGE_PATHS[name]);
  }
  assert.equal(MTG.cardImageURL('Phyrexian Germ Token'), MTG.CARD_IMAGE_PATHS['Phyrexian Germ']);
  assert.equal(MTG.cardImageURL('Phyrexian Germ Token', 'art'), MTG.CARD_IMAGE_PATHS['Phyrexian Germ']);
});

test('unknown cards retain the placeholder', () => {
  for (const name of ['Unknown imported card', '', null]) {
    assert.equal(MTG.cardImageURL(name), MTG.CARD_IMAGE_PLACEHOLDER);
    assert.equal(MTG.cardImageURL(name, 'art'), MTG.CARD_IMAGE_PLACEHOLDER);
  }
});

test('a face requested before the card catalog loads resolves after initialization', () => {
  const source = fs.readFileSync(new URL('../src/card-images.js', import.meta.url), 'utf8');
  const images = {};
  vm.runInNewContext(source, { MTG: images });
  assert.equal(images.cardImageURL('Fell the Profane'), images.CARD_IMAGE_PLACEHOLDER);
  Object.assign(images, {
    CARD_CATALOG: MTG.CARD_CATALOG,
    DEFS: MTG.DEFS,
    DECK_CARD_ALIASES: MTG.DECK_CARD_ALIASES,
    resolveDeckCardName: MTG.resolveDeckCardName,
  });
  assert.equal(images.cardImageURL('Fell the Profane'), MTG.cardImageURL('Fell the Profane'));
  assert.notEqual(images.cardImageURL('Fell the Profane'), images.CARD_IMAGE_PLACEHOLDER);
});

test('cached image aliases follow refreshed import identity rules', () => {
  const aliases = MTG.DECK_CARD_ALIASES;
  const expected = assertRemoteImage('Consign', 'Consign // Oblivion');
  try {
    // A refreshed printing registry can reveal that a previously unique face
    // name also belongs to an unavailable identity and is now ambiguous.
    MTG.DECK_CARD_ALIASES = {
      ...aliases,
      unavailable: [...aliases.unavailable, {
        name: 'Consign', aliases: [], deckCard: true,
        oracleId: MTG.CARD_CATALOG['A.I.M. Bot'].oracleId,
      }],
    };
    assert.equal(MTG.resolveDeckCardName('Consign'), null);
    assert.equal(MTG.cardImageURL('Consign'), MTG.CARD_IMAGE_PLACEHOLDER);
  } finally {
    MTG.DECK_CARD_ALIASES = aliases;
  }
  assert.equal(MTG.cardImageURL('Consign'), expected);
});

test('regenerating the image manifest preserves imported face resolution', () => {
  // Evaluate only the pure source generator, without starting image downloads.
  const generator = fs.readFileSync(new URL('../scripts/sync-card-images.mjs', import.meta.url), 'utf8');
  const start = generator.indexOf('function manifestSource(');
  const end = generator.indexOf('\nasync function main()', start);
  assert.ok(start >= 0 && end > start);
  const manifestSource = vm.runInNewContext(`(${generator.slice(start, end)})`, {
    sortedObject: map => Object.fromEntries([...map].sort(([a], [b]) => a.localeCompare(b))),
  });
  const source = manifestSource(new Map(Object.entries(MTG.CARD_IMAGE_PATHS)),
    new Map(Object.entries(MTG.CARD_ART_PATHS)), [...MTG.CARD_IMAGE_MISSING]);
  const images = {
    CARD_CATALOG: MTG.CARD_CATALOG,
    DEFS: MTG.DEFS,
    DECK_CARD_ALIASES: MTG.DECK_CARD_ALIASES,
    resolveDeckCardName: MTG.resolveDeckCardName,
  };
  vm.runInNewContext(source, { MTG: images });
  for (const name of ['Consign // Oblivion', 'Consign', 'Oblivion', 'Fell the Profane // Fell Mire',
    'Fell the Profane', 'Fell Mire', 'Ambitious Farmhand', 'Seasoned Cathar',
    'Animating Faerie', 'Bring to Life', 'A.I.M. Bot', 'Sol Ring', 'Abaddon the Despoiler',
    'Phyrexian Germ Token', 'Unknown imported card']) {
    for (const variant of [undefined, 'art']) {
      assert.equal(images.cardImageURL(name, variant), MTG.cardImageURL(name, variant), `${name}: ${variant}`);
    }
  }
});
