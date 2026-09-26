import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import crypto from 'node:crypto';
import {loadEngine} from '../tests/helpers/load-engine.mjs';
import {buildIntake, sourceDir} from './import-fdc-precons.mjs';

const baseline = 'e24aa5ac14adfda448e5d83a1587d1e8c903d69a';
const sha = x => crypto.createHash('sha256').update(x).digest('hex');
const git = (...a) => execFileSync('git', a, {encoding: 'utf8', maxBuffer: 30_000_000});
const old = {}, now = {};
vm.runInNewContext(git('show', baseline + ':src/data.js'), old);
vm.runInNewContext(fs.readFileSync('src/data.js', 'utf8'), now);
for (const [n, c] of Object.entries(old.MTG.RAW_DATA.cards)) assert.equal(JSON.stringify(now.MTG.RAW_DATA.cards[n]), JSON.stringify(c), n);
for (const d of old.MTG.RAW_DATA.decks) assert.equal(JSON.stringify(now.MTG.RAW_DATA.decks.find(x => x.name === d.name)), JSON.stringify(d), d.name);
vm.runInNewContext(git('show', baseline + ':src/card-images.js'), old);
vm.runInNewContext(fs.readFileSync('src/card-images.js', 'utf8'), now);
for (const key of ['CARD_IMAGE_PATHS', 'CARD_ART_PATHS']) for (const [n, p] of Object.entries(old.MTG[key])) assert.equal(now.MTG[key][n], p, n);
assert.equal(git('diff', '--name-only', '--diff-filter=DMRTUXB', baseline, '--', 'assets').trim(), '', 'previously tracked artwork or video changed');
const dataSha = sha(fs.readFileSync('src/data.js'));
execFileSync(process.execPath, ['scripts/import-fdc-precons.mjs', '--write'], {stdio: 'pipe', maxBuffer: 5_000_000});
assert.equal(sha(fs.readFileSync('src/data.js')), dataSha, 'idempotent raw data');
const M = loadEngine(), intake = buildIntake(M);
const oracle = JSON.parse(fs.readFileSync(sourceDir + '/oracle.json')).cards;
const images = JSON.parse(fs.readFileSync(sourceDir + '/images.json'));
const initial = JSON.parse(fs.readFileSync(sourceDir + '/intake.json'));
for (const name of initial.newNames) {
  const record = oracle.find(r => r.requestedName === name);
  for (const [key, value] of Object.entries(record.raw)) assert.equal(JSON.stringify(M.RAW_DATA.cards[name][key]), JSON.stringify(value), name + ' ' + key);
  assert.equal(M.CARD_CATALOG[name].oracleId, record.oracleId, name);
}
for (const r of images.added) assert.equal(sha(fs.readFileSync(r.relative)), r.sha256, r.name);
for (const name of intake.names) assert.ok(fs.existsSync(M.CARD_IMAGE_PATHS[name]), name + ' local art');
const result = {
  baseline, passed: true, originalPhysicalCards: 500, uniqueNames: intake.names.length,
  sourceLists: intake.decks.map(d => ({name: d.name, total: d.cards.reduce((n, c) => n + c.n, 0), independentSources: [d.source.official, d.source.mtgjson], exportSha256: d.source.sha256})),
  existingRawDefinitionsPreserved: Object.keys(old.MTG.RAW_DATA.cards).length,
  existingRawDeckRecordsPreserved: old.MTG.RAW_DATA.decks.length,
  nativeRawDefinitions: Object.keys(now.MTG.RAW_DATA.cards).length,
  existingImageMappingsPreserved: Object.keys(old.MTG.CARD_IMAGE_PATHS).length,
  existingCommanderCropsPreserved: Object.keys(old.MTG.CARD_ART_PATHS).length,
  existingTrackedAssetsUnchanged: true, addedWebPFiles: images.addedCount,
  allNewImageDigestsMatch: true, allNewOracleDefinitionsMatch: true, idempotentDataSha256: dataSha,
  current: {decks: Object.keys(M.DECKS).length, definitions: Object.keys(M.DEFS).length, eligible: Object.values(M.CARD_CATALOG).filter(c => c.deckImportEligible).length},
};
fs.writeFileSync(sourceDir + '/source-validation.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
