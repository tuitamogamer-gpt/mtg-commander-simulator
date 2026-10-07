// Verify or refresh the seven manually implemented cards from the exact pinned
// feed. Reuses the generic importer's field normalization, never its classifier.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchOracleCardsFromGzip, rawCard, catalogCard, stripReminderText } from './import-oracle-batch.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
assert.ok(args.every(arg => arg === '--write' || arg.startsWith('--source-file=')), 'Expected --source-file=<pinned gzip> [--write]');
const sourceArgs = args.filter(arg => arg.startsWith('--source-file='));
assert.equal(sourceArgs.length, 1, 'Exactly one --source-file is required; no network fallback');
const reportPath = path.join(root, 'reports/oracle-import/commander-staples-cards.json');
const modulePath = path.join(root, 'src/oracle-batches/commander-staples.js');
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const source = JSON.parse(fs.readFileSync(path.join(root, 'reports/oracle-import/state.json'), 'utf8')).source;
const pin = report.batch.source.pinnedSnapshot;
for (const key of ['bulkType', 'bulkId', 'bulkUpdatedAt', 'bulkSha256']) assert.equal(pin[key], source[key], key);
const { cards } = await fetchOracleCardsFromGzip(sourceArgs[0].slice('--source-file='.length), {
  type: pin.bulkType, id: pin.bulkId, updated_at: pin.bulkUpdatedAt,
}, pin.bulkSha256);
assert.equal(report.batch.cards.length, 7);
assert.equal(new Set(report.batch.cards.map(row => row.oracleId)).size, 7);
const evidence = [];
for (const row of report.batch.cards) {
  const matches = cards.filter(card => card.oracle_id === row.oracleId);
  assert.equal(matches.length, 1, `${row.raw.name}: unique pinned Oracle ID`);
  const card = matches[0];
  assert.equal(card.name, row.raw.name);
  assert.ok(card.games.includes('paper'));
  assert.equal(card.legalities.commander, 'legal');
  const expected = { scryfallId: card.id, rulesCore: stripReminderText(card.oracle_text), raw: rawCard(card), catalog: catalogCard(card) };
  if (args.includes('--write')) Object.assign(row, expected);
  for (const [field, value] of Object.entries(expected)) assert.deepEqual(row[field], value, `${card.name}: ${field}`);
  evidence.push({ name: card.name, oracleId: card.oracle_id, scryfallId: card.id,
    sourceRowSha256: createHash('sha256').update(JSON.stringify(card)).digest('hex') });
}
const moduleSource = () => '// Source fields verified by scripts/sync-commander-staples-source.mjs.\n' +
  "'use strict';\nvar MTG = globalThis.MTG || (globalThis.MTG = {});\n" +
  'MTG.registerOracleBatch(' + JSON.stringify(report.batch, null, 2) + ');\n';
if (args.includes('--write')) {
  report.batch.source = { ...source, pinnedSnapshot: pin, verifiedAgainstPinnedSnapshot: true };
  report.provenance = {
    oracleText: 'All raw fields and catalog metadata match the SHA-256-verified pinned Scryfall oracle_cards snapshot exactly, including reminder text.',
    requiredVerification: 'Completed by scripts/sync-commander-staples-source.mjs; rerun without --write to verify the pinned snapshot and runtime/report parity.',
    oracleIds: 'Verified by unique Oracle ID in the pinned snapshot.',
    scryfallIds: 'All seven print IDs come from the pinned snapshot; runtime images use those exact print IDs.',
    catalogMetadata: 'Complete source metadata, including print, set, rarity, release date, colors, keywords, and produced mana.',
    catalogExport: 'Regenerated from the same pinned snapshot with scripts/export-card-catalog.mjs after this verification.',
    implementation: 'src/modules/scripts-commander-staples.js',
    tests: 'tests/commander-staples.test.mjs',
  };
  report.verification = { verifiedAt: new Date().toISOString(), sourceRows: cards.length,
    compressedSha256: pin.bulkSha256, cards: evidence };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(modulePath, moduleSource());
}
assert.equal(report.batch.source.verifiedAgainstPinnedSnapshot, true);
assert.equal(report.verification.compressedSha256, pin.bulkSha256);
assert.equal(report.verification.sourceRows, cards.length);
assert.deepEqual(report.verification.cards, evidence);
assert.equal(fs.readFileSync(modulePath, 'utf8'), moduleSource(), 'Runtime/report byte parity');
console.log(JSON.stringify({ ok: true, verifiedCards: evidence.length, sourceSha256: pin.bulkSha256 }));
