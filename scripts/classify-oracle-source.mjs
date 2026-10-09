// Checkpoint complete source-row classifications before planning an import.
// Shards use disjoint cards and atomic cache records; no catalog files change.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {semanticClass, fetchOracleCardsFromGzip, collectReservedOracleCards, LATEST_SEMANTIC_COMPILER_VERSION} from './import-oracle-batch.mjs';
import {extractRawData} from './source-audit.mjs';
import {createOracleCompilerCache} from './oracle-compiler-cache.mjs';
import {inPaperCommanderUniverse, loadPaperAvailabilityFromGzip, validatePaperAvailability} from './oracle-paper-universe.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const option = (name, fallback = '') => process.argv.slice(2).find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const compilerVersion = Number(option('compiler-version', '31'));
const part = Number(option('part', '0')), parts = Number(option('parts', '1'));
if (!Number.isInteger(compilerVersion) || compilerVersion < 4 || compilerVersion > LATEST_SEMANTIC_COMPILER_VERSION) throw Error('Use a supported compiler version, 4–' + LATEST_SEMANTIC_COMPILER_VERSION + '.');
if (!Number.isInteger(parts) || parts < 1 || !Number.isInteger(part) || part < 0 || part >= parts) throw Error('Invalid classification shard.');
const reportDirectory = path.join(root, 'reports/oracle-import');
const state = JSON.parse(fs.readFileSync(path.join(reportDirectory, 'state.json'), 'utf8'));
const recordedPaperSource = state.source?.paperAvailability;
const paperSourceFile = option('paper-source-file');
let paperAvailability = {};
if (paperSourceFile) {
  paperAvailability = await loadPaperAvailabilityFromGzip(paperSourceFile, {
    type: 'default_cards', id: option('paper-source-bulk-id', recordedPaperSource?.bulkId || ''),
    updated_at: option('paper-source-updated-at', recordedPaperSource?.bulkUpdatedAt || ''),
  }, option('paper-source-sha256', recordedPaperSource?.bulkSha256 || ''));
} else if (process.argv.slice(2).some(arg => /^--paper-source-(?:sha256|bulk-id|updated-at)=/.test(arg))) {
  throw new Error('Pinned paper-availability source requires --paper-source-file.');
}
const {paperOracleIds, paperSource} = paperAvailability;
validatePaperAvailability(paperOracleIds, paperSource, recordedPaperSource);
const {cards, bulk} = await fetchOracleCardsFromGzip(option('source-file'), {
  type: 'oracle_cards', id: option('source-bulk-id'), updated_at: option('source-updated-at'),
}, option('source-sha256'));
const reports = fs.readdirSync(reportDirectory).filter(name => name.endsWith('.json') && name !== 'state.json')
  .map(name => JSON.parse(fs.readFileSync(path.join(reportDirectory, name), 'utf8')));
const reserved = collectReservedOracleCards(reports);
const excludedIds = new Set([...state.importedOracleIds, ...reserved.ids]);
const excludedNames = new Set([...state.importedNames, ...reserved.names,
  ...Object.keys(extractRawData(fs.readFileSync(path.join(root, 'src/data.js'), 'utf8')).cards)]);
const pending = cards.filter(card => inPaperCommanderUniverse(card, paperOracleIds)
  && !excludedIds.has(card.oracle_id) && !excludedNames.has(card.name));
const cache = createOracleCompilerCache({directory: option('classification-cache', path.join(root, 'output/oracle-classifier')), compilerVersion});
const classificationCaches = new Map([[compilerVersion, cache]]);
if (compilerVersion > 10) classificationCaches.set(compilerVersion - 1, createOracleCompilerCache({directory: option('classification-cache', path.join(root, 'output/oracle-classifier')), compilerVersion: compilerVersion - 1}));
let completed = 0, reused = 0, ready = 0;
const progress = () => console.log(JSON.stringify({part, parts, completed, total: Math.ceil(Math.max(0, pending.length - part) / parts), reused, ready, compilerVersion, sourceSha256: bulk.sha256, ...(paperSource ? {paperSourceSha256: paperSource.bulkSha256} : {}), compilerFingerprint: cache.fingerprint}));
progress();
for (let i = part; i < pending.length; i += parts) {
  const card = pending[i];
  let result = cache.get(card);
  if (result) reused++;
  else result = semanticClass(card, {compilerVersion, classificationCaches});
  completed++; if (result.semanticClass) ready++;
  if (completed % 25 === 0) progress();
}
progress();
