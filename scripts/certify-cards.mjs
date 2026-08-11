import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEngine } from '../tests/helpers/load-engine.mjs';
import { auditSource } from './source-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportDir = path.join(root, 'reports');
const strict = process.argv.includes('--strict');
const MTG = loadEngine();
const sourceAudit = auditSource();
const duplicates = new Set(sourceAudit.duplicateScripts.map(row => row.name));

function issuesFor(name) {
  const def = MTG.DEFS[name];
  const script = MTG.SCRIPTS[name];
  const issues = [];
  if (!def) return ['Nema finalnu definiciju'];
  if (!script) issues.push('Nema eksplicitni card script');
  if (def.simplified) issues.push(`Pojednostavljeno: ${def.simplified}`);
  if (duplicates.has(name)) issues.push('Više SC registracija; posljednja tiho prepisuje raniju');

  const types = def.types || [];
  const oracle = def.oracle || '';
  const isSpell = types.includes('Instant') || types.includes('Sorcery');
  if (isSpell && !def.resolve && !def.modes && !def.roomHalves && !def.adventure) {
    issues.push('Spell nema izvršivu resolve/modes putanju');
  }
  if (types.includes('Land') && /\{T\}:\s*Add/i.test(oracle) && !def.mana) {
    issues.push('Land proizvodi manu u Oracle tekstu, ali nema mana putanju');
  }
  if ((def.subtypes || []).includes('Equipment') && /Equip/i.test(oracle) && def.equip === undefined && !def.attachGrant) {
    issues.push('Equipment nema equip/attach putanju');
  }
  if ((def.subtypes || []).includes('Aura') && /Enchant (creature|permanent|player|opponent)/i.test(oracle) && !def.auraTarget && !def.isPlayerAura) {
    issues.push('Aura nema legalnu attach metu');
  }
  return issues;
}

const decks = [];
for (const deck of Object.values(MTG.DECKS)) {
  const cards = [];
  const seen = new Set();
  for (const entry of deck.cards) {
    if (seen.has(entry.name)) continue;
    seen.add(entry.name);
    const issues = issuesFor(entry.name);
    cards.push({ name: entry.name, copies: entry.n, status: issues.length ? 'FAIL' : 'PASS', issues });
  }
  decks.push({
    name: deck.name,
    commander: deck.commander,
    cardCount: deck.cards.reduce((sum, entry) => sum + entry.n, 0),
    uniqueCards: cards.length,
    passed: cards.filter(card => card.status === 'PASS').length,
    failed: cards.filter(card => card.status === 'FAIL').length,
    cards,
  });
}

const report = {
  generatedAt: new Date().toISOString(),
  policy: 'Svaki deck i svaka jedinstvena karta se navode zasebno. Aggregate smoke nije zamjena za ovaj izvještaj.',
  excludedDecks: [{ name: 'Blame Game', reason: 'Izbačen iz proizvoda zbog necertifikovane političke/goad i damage-redirection jezgre.' }],
  totals: {
    decks: decks.length,
    cardEntries: decks.reduce((sum, deck) => sum + deck.uniqueCards, 0),
    passed: decks.reduce((sum, deck) => sum + deck.passed, 0),
    failed: decks.reduce((sum, deck) => sum + deck.failed, 0),
  },
  decks,
};

fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(path.join(reportDir, 'card-certification.json'), JSON.stringify(report, null, 2) + '\n');

const md = [];
md.push('# Card-by-card certifikacija');
md.push('');
md.push(`Generisano: ${report.generatedAt}`);
md.push('');
md.push(`Aktivni deckovi: **${report.totals.decks}** · provjere po decku: **${report.totals.cardEntries}** · PASS: **${report.totals.passed}** · FAIL: **${report.totals.failed}**`);
md.push('');
md.push('`Blame Game` je namjerno izbačen iz proizvoda; raw definicije ostaju jer se dio karata dijeli sa drugim deckovima.');
for (const deck of decks) {
  md.push('');
  md.push(`## ${deck.name}`);
  md.push('');
  md.push(`Commander: **${deck.commander}** · 100 karata · ${deck.uniqueCards} jedinstvenih · PASS ${deck.passed} · FAIL ${deck.failed}`);
  md.push('');
  md.push('| Status | Karta | Nalaz |');
  md.push('|---|---|---|');
  for (const card of deck.cards) {
    const issue = card.issues.length ? card.issues.join('; ') : 'Eksplicitna skripta i strukturna izvršna putanja postoje.';
    md.push(`| ${card.status === 'PASS' ? 'PASS' : 'FAIL'} | ${card.name.replace(/\|/g, '\\|')} | ${issue.replace(/\|/g, '\\|')} |`);
  }
}
md.push('');
fs.writeFileSync(path.join(reportDir, 'card-certification.md'), md.join('\n'));

console.log(`Deckovi: ${report.totals.decks}`);
console.log(`Card/deck provjere: ${report.totals.cardEntries}`);
console.log(`PASS: ${report.totals.passed} · FAIL: ${report.totals.failed}`);
for (const deck of decks.filter(deck => deck.failed)) console.log(`FAIL ${deck.name}: ${deck.failed}`);
if (strict && report.totals.failed) process.exitCode = 1;
