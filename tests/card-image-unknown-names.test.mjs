// Drawing a card face asks for its image. A name the catalog does not know
// ("Face-down card", "Hidden card", a token without its own art) used to be
// looked up again for every face drawn, and each lookup lists every catalog
// name. It is looked up once, until the catalog itself is replaced.
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';

const MTG = loadEngine();
function countLookups(run) {
  const original = MTG.resolveDeckCardName; let lookups = 0;
  MTG.resolveDeckCardName = function (name) { lookups++; return original.call(this, name); };
  try { run(); } finally { MTG.resolveDeckCardName = original; }
  return lookups;
}

test('a name the catalog does not know is looked up once, not for every face drawn', () => {
  const names = ['Face-down card', 'Hidden card', 'No Such Creature Token'];
  const lookups = countLookups(() => {
    for (const name of names) {
      const first = MTG.cardImageURL(name);
      assert.equal(first, MTG.CARD_IMAGE_PLACEHOLDER, `${name} has no picture of its own`);
      for (let draw = 0; draw < 50; draw++) assert.equal(MTG.cardImageURL(name), first);
    }
  });
  assert.equal(lookups, names.length);
});

test('a printing alias still finds its card, and is also looked up once', () => {
  const [canonical, entry] = Object.entries(MTG.CARD_CATALOG).find(([name, row]) =>
    (row.aliases || []).some(alias => !MTG.CARD_CATALOG[alias] && MTG.resolveDeckCardName(alias) === name));
  const alias = entry.aliases.find(alias => !MTG.CARD_CATALOG[alias] && MTG.resolveDeckCardName(alias) === canonical);
  const lookups = countLookups(() => {
    for (let draw = 0; draw < 20; draw++) assert.equal(MTG.cardImageCatalogName(alias), canonical);
  });
  assert.ok(lookups <= 1, `${lookups} lookups for ${alias}`);
});

test('a replaced catalog is read again', () => {
  const name = 'Another Unknown Token';
  assert.equal(countLookups(() => { MTG.cardImageCatalogName(name); MTG.cardImageCatalogName(name); }), 1);
  const catalog = MTG.CARD_CATALOG;
  try {
    MTG.CARD_CATALOG = {...catalog};
    assert.equal(countLookups(() => { MTG.cardImageCatalogName(name); MTG.cardImageCatalogName(name); }), 1, 'the new catalog is asked once');
  } finally { MTG.CARD_CATALOG = catalog; }
});
