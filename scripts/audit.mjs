import { auditSource } from './source-audit.mjs';

const report = auditSource();
console.log(`Source: ${report.sourceLines} linija · ${report.sourceBytes} bytes`);
console.log(`Raw definicije: ${report.rawCardCount} · Deckovi: ${report.deckRows.length}`);
if (report.excludedDeckRows.length) console.log(`Izbačeni deckovi: ${report.excludedDeckRows.map(deck => deck.name).join(', ')}`);
for (const deck of report.deckRows) {
  const flags = [];
  if (deck.total !== 100) flags.push(`BROJ=${deck.total}`);
  if (deck.missingDefinitions.length) flags.push(`NEMA DEFINICIJE=${deck.missingDefinitions.join(', ')}`);
  if (deck.simplifiedCards.length) flags.push(`SIMPLIFIED=${deck.simplifiedCards.length}`);
  console.log(`${flags.length ? '⚠' : '✓'} ${deck.name}: ${deck.total} karata · ${deck.unique} jedinstvenih${flags.length ? ` · ${flags.join(' · ')}` : ''}`);
}
console.log(`Duplicate SC registracije: ${report.duplicateScripts.length}`);
console.log(`Označene simplified karte: ${report.simplifiedCards.length}`);
console.log(`Označene simplified karte izvan aktivnog seta: ${report.inactiveSimplifiedCards.length}`);

const fatal = report.deckRows.some(deck => deck.total !== 100 || deck.missingDefinitions.length);
if (fatal) process.exitCode = 1;
