import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import { extractRawData } from '../scripts/source-audit.mjs';
import { loadEngine } from './helpers/load-engine.mjs';

const LEGACY_CARD_COUNT = 1626;
const LEGACY_NAME_DIGEST = 'c8c58dd03e41d3e8caf1b8d57a4fd36591dabe910bc8a59450f4e430aa7100f5';

function sortedUnique(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, 'en'));
}

function intersection(left, right) {
  const rightSet = right instanceof Set ? right : new Set(right);
  return sortedUnique([...left].filter(value => rightSet.has(value)));
}

test('the complete pinned legacy card set remains represented exactly once in the runtime catalog', () => {
  const legacyRaw = extractRawData(fs.readFileSync(new URL('../src/data.js', import.meta.url), 'utf8'));
  const MTG = loadEngine();
  const legacyNames = Object.keys(legacyRaw.cards || {});
  const legacyNameSet = new Set(legacyNames);
  const digest = createHash('sha256').update([...legacyNames].sort().join('\n')).digest('hex');

  assert.equal(legacyNames.length, LEGACY_CARD_COUNT, 'pinned legacy raw-card count');
  assert.equal(legacyNameSet.size, LEGACY_CARD_COUNT, 'legacy raw names are unique');
  assert.equal(digest, LEGACY_NAME_DIGEST, 'pinned legacy card-name identity');

  for (const name of legacyNames) {
    const raw = legacyRaw.cards[name];
    const catalog = MTG.CARD_CATALOG[name];
    assert.ok(catalog, `${name}: present in MTG.CARD_CATALOG`);
    assert.ok(MTG.DEFS[name], `${name}: present in MTG.DEFS`);
    assert.equal(raw.name, name, `${name}: raw key and embedded name match`);
    assert.equal(catalog.name, name, `${name}: catalog preserves canonical name`);
    assert.equal(catalog.engineStatus, 'certified-legacy', `${name}: legacy engine status`);
    assert.equal(catalog.engineBatch, null, `${name}: not reclassified into an Oracle batch`);
    assert.equal(catalog.oracleText, raw.oracle || '', `${name}: legacy Oracle text parity`);
  }

  const batches = Array.from(MTG.ORACLE_BATCHES || []);
  const genericNames = batches
    .filter(batch => /^oracle-\d{4}$/.test(batch.id))
    .flatMap(batch => Array.from(batch.cards || [], entry => entry.raw.name));
  const sauronBatches = batches.filter(batch => batch.id === 'moxfield-sauron-dark-lord');
  assert.equal(sauronBatches.length, 1, 'one Sauron reservation batch');
  const sauronNames = Array.from(sauronBatches[0].cards || [], entry => entry.raw.name);

  assert.equal(new Set(genericNames).size, genericNames.length, 'generic Oracle names are unique');
  assert.equal(new Set(sauronNames).size, sauronNames.length, 'Sauron reservation names are unique');
  assert.deepEqual(intersection(legacyNames, genericNames), [], 'legacy and generic Oracle names are disjoint');
  assert.deepEqual(intersection(legacyNames, sauronNames), [], 'legacy and Sauron names are disjoint');
  assert.deepEqual(intersection(genericNames, sauronNames), [], 'generic Oracle and Sauron names are disjoint');

  const runtimeNames = Object.keys(MTG.RAW_DATA.cards || {});
  const catalogNames = Object.keys(MTG.CARD_CATALOG || {});
  const expectedRuntimeUnion = [...legacyNames, ...genericNames, ...sauronNames];
  assert.deepEqual(sortedUnique(runtimeNames), sortedUnique(expectedRuntimeUnion),
    'runtime raw cards are exactly legacy plus generic Oracle plus Sauron');
  assert.deepEqual(sortedUnique(catalogNames), sortedUnique(runtimeNames),
    'MTG.CARD_CATALOG is the exact runtime raw-card set');

  console.log(`LEGACY_CARD_CATALOG_INTEGRITY legacy=${legacyNames.length} ` +
    `generic=${genericNames.length} sauron=${sauronNames.length} runtime=${runtimeNames.length} sha256=${digest}`);
});
