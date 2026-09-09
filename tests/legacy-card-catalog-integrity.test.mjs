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
  const starterNames=JSON.parse(fs.readFileSync(new URL('../reports/decks/precon-starter-2026-09-06/intake.json',import.meta.url),'utf8')).newNames;
  assert.equal(starterNames.length,61);
  const c21Names=JSON.parse(fs.readFileSync(new URL('../reports/decks/precon-c21-2026-09-06/intake.json',import.meta.url),'utf8')).newNames;
  assert.equal(c21Names.length,80);
  assert.deepEqual(intersection(c21Names,starterNames),[]);
  const c14Names=JSON.parse(fs.readFileSync(new URL('../reports/decks/precon-c14-2026-09-06/intake.json',import.meta.url),'utf8')).newNames;
  assert.equal(c14Names.length,65);
  assert.deepEqual(intersection(c14Names,[...starterNames,...c21Names]),[]);
  const c1516Names=JSON.parse(fs.readFileSync(new URL('../reports/decks/precon-c15-c16-2026-09-08/intake.json',import.meta.url),'utf8')).newNames;
  assert.equal(c1516Names.length,142);
  assert.deepEqual(intersection(c1516Names,[...starterNames,...c21Names,...c14Names]),[]);
  const c1719Names=JSON.parse(fs.readFileSync(new URL('../reports/decks/precon-c17-c19-2026-09-08/intake.json',import.meta.url),'utf8')).newNames;
  assert.equal(c1719Names.length,170);
  assert.deepEqual(intersection(c1719Names,[...starterNames,...c21Names,...c14Names,...c1516Names]),[]);
  const c1920Names=JSON.parse(fs.readFileSync(new URL('../reports/decks/precon-c19-c20-znc-2026-09-08/intake.json',import.meta.url),'utf8')).newNames;
  assert.equal(c1920Names.length,149);
  assert.deepEqual(intersection(c1920Names,[...starterNames,...c21Names,...c14Names,...c1516Names,...c1719Names]),[]);
  const zncKhcNames=JSON.parse(fs.readFileSync(new URL('../reports/decks/precon-znc-cmr-khc-2026-09-08/intake.json',import.meta.url),'utf8')).newNames;
  assert.equal(zncKhcNames.length,42);
  assert.deepEqual(intersection(zncKhcNames,[...starterNames,...c21Names,...c14Names,...c1516Names,...c1719Names,...c1920Names]),[]);
  const afcMicNames=JSON.parse(fs.readFileSync(new URL('../reports/decks/precon-afc-mic-2026-09-09/intake.json',import.meta.url),'utf8')).newNames;
  assert.equal(afcMicNames.length,92);
  assert.deepEqual(intersection(afcMicNames,[...starterNames,...c21Names,...c14Names,...c1516Names,...c1719Names,...c1920Names,...zncKhcNames]),[]);
  const vocNccNames=JSON.parse(fs.readFileSync(new URL('../reports/decks/precon-voc-ncc-2026-09-09/intake.json',import.meta.url),'utf8')).newNames;
  assert.equal(vocNccNames.length,165);
  assert.deepEqual(intersection(vocNccNames,[...starterNames,...c21Names,...c14Names,...c1516Names,...c1719Names,...c1920Names,...zncKhcNames,...afcMicNames]),[]);
  const legacyNames = Object.keys(legacyRaw.cards || {}).filter(name=>!starterNames.includes(name)&&!c21Names.includes(name)&&!c14Names.includes(name)&&!c1516Names.includes(name)&&!c1719Names.includes(name)&&!c1920Names.includes(name)&&!zncKhcNames.includes(name)&&!afcMicNames.includes(name)&&!vocNccNames.includes(name));
  const legacyNameSet = new Set(legacyNames);
  const digest = createHash('sha256').update([...legacyNames].sort().join('\n')).digest('hex');

  assert.equal(legacyNames.length, LEGACY_CARD_COUNT, 'pinned legacy raw-card count');
  assert.equal(legacyNameSet.size, LEGACY_CARD_COUNT, 'legacy raw names are unique');
  assert.equal(digest, LEGACY_NAME_DIGEST, 'pinned legacy card-name identity');

  for (const name of [...legacyNames,...starterNames,...c21Names,...c14Names,...c1516Names,...c1719Names,...c1920Names,...zncKhcNames,...afcMicNames,...vocNccNames]) {
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
  assert.deepEqual(intersection(starterNames,[...legacyNames,...genericNames,...sauronNames]),[], 'Starter additions reuse all existing names without duplication');
  assert.deepEqual(intersection(genericNames, sauronNames), [], 'generic Oracle and Sauron names are disjoint');

  assert.deepEqual(intersection(c14Names,[...legacyNames,...genericNames,...sauronNames]),[], 'C14 additions are disjoint from all existing catalog definitions');

  assert.deepEqual(intersection(c1516Names,[...legacyNames,...genericNames,...sauronNames]),[], 'C15/C16 additions reuse every existing name');

  assert.deepEqual(intersection(c1719Names,[...legacyNames,...genericNames,...sauronNames]),[], 'C17-C19 additions reuse every existing name');
  assert.deepEqual(intersection(zncKhcNames,[...legacyNames,...genericNames,...sauronNames]),[], 'ZNC/CMR/KHC additions reuse every existing name');
  assert.deepEqual(intersection(afcMicNames,[...legacyNames,...genericNames,...sauronNames]),[], 'AFC/MIC additions reuse every existing name');
  const runtimeNames = Object.keys(MTG.RAW_DATA.cards || {});
  const catalogNames = Object.keys(MTG.CARD_CATALOG || {});
  const expectedRuntimeUnion = [...legacyNames, ...starterNames, ...c21Names, ...c14Names, ...c1516Names, ...c1719Names, ...c1920Names, ...zncKhcNames, ...afcMicNames, ...vocNccNames, ...genericNames, ...sauronNames];
  assert.deepEqual(sortedUnique(runtimeNames), sortedUnique(expectedRuntimeUnion),
    'runtime raw cards are exactly legacy plus Starter, C21, C14, C15/C16, C17-C19 C19-C20/ZNC ZNC/CMR/KHC and AFC/MIC additions plus generic Oracle plus Sauron');
  assert.deepEqual(sortedUnique(catalogNames), sortedUnique(runtimeNames),
    'MTG.CARD_CATALOG is the exact runtime raw-card set');

  console.log(`LEGACY_CARD_CATALOG_INTEGRITY legacy=${legacyNames.length} ` +
    `generic=${genericNames.length} sauron=${sauronNames.length} runtime=${runtimeNames.length} sha256=${digest}`);
});
