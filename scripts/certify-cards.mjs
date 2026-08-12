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

function oracleWithoutReminder(text) {
  return String(text || '').replace(/\([^()]*(?:\([^()]*\)[^()]*)*\)/g, ' ');
}

function activatedOracleLines(oracle) {
  return oracleWithoutReminder(oracle).split('\n').filter(line => {
    const value = line.trim();
    return /^(?:\{[^}]+\}(?:,\s*)?)+[^:]*:/.test(value) ||
      /^(?:Sacrifice|Discard|Tap)\b[^:]*:/.test(value);
  });
}

function activatedPaths(def) {
  const mana = Array.isArray(def.mana) ? def.mana.length : def.mana ? 1 : 0;
  return mana + (def.abilities || []).length + (def.opponentAbilities || []).length +
    (def.handAbility ? 1 : 0) + (def.gyAbility ? 1 : 0) + (def.cycling ? 1 : 0) +
    (def.equip !== undefined ? 1 : 0) + (def.grantMana ? 1 : 0);
}

function issuesFor(name) {
  const def = MTG.DEFS[name];
  const script = MTG.SCRIPTS[name];
  const issues = [];
  if (!def) return ['Nema finalnu definiciju'];
  if (!script) issues.push('Nema eksplicitni card script');
  if (def.autoScripted) issues.push('Koristi heuristički autoscript umjesto eksplicitne implementacije');
  if (def.simplified) issues.push(`Pojednostavljeno: ${def.simplified}`);
  if (duplicates.has(name)) issues.push('Više SC registracija; posljednja tiho prepisuje raniju');

  const types = def.types || [];
  const oracle = def.oracle || '';
  const isSpell = types.includes('Instant') || types.includes('Sorcery');
  if (isSpell && !def.resolve && !def.modes && !def.roomHalves && !def.adventure && !def.rulesOnlySpell) {
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
  const oracleActivated = activatedOracleLines(oracle).length;
  const implementedActivated = activatedPaths(def);
  if (oracleActivated > implementedActivated) {
    issues.push(`Oracle ima ${oracleActivated} aktiviranih sposobnosti, izvršnih putanja je ${implementedActivated}`);
  }
  if (types.includes('Planeswalker')) {
    const oracleLoyalty = oracle.split('\n').filter(line => /^\s*\[[+−-]?\d+\]/.test(line)).length;
    const scriptedLoyalty = (def.abilities || []).filter(ability => ability.loyalty !== undefined).length;
    if (oracleLoyalty !== scriptedLoyalty) issues.push(`Planeswalker ima ${oracleLoyalty} Oracle loyalty sposobnosti, skriptovano ${scriptedLoyalty}`);
  }
  if (/beginning of your first main phase/i.test(oracle) && !(def.triggers || []).some(t => t.on === 'precombatMain')) {
    issues.push('First-main trigger nije vezan za precombatMain događaj');
  }
  if (/beginning of your second main phase/i.test(oracle) && !(def.triggers || []).some(t => t.on === 'postcombatMain')) {
    issues.push('Second-main trigger nije vezan za postcombatMain događaj');
  }
  if (/legend rule.{0,20}doesn.t apply to creatures you control/i.test(oracle) && !def.ignoreLegendRuleCreatures) {
    issues.push('Izuzetak od legend rule nije povezan sa SBA provjerom');
  }
  if (/look at the top card of your library any time/i.test(oracle) && !def.revealOwnTop) {
    issues.push('Nema privatni prikaz vršne karte biblioteke');
  }
  if (/first activated ability of an artifact/i.test(oracle) && !def.firstArtifactAbilityDiscount) {
    issues.push('Nema praćenje prvog artifact activation popusta');
  }
  if (script && script.statics && script.statics.some(entry => entry.apply && /=>\s*\{\s*\}/.test(String(entry.apply)))) {
    issues.push('Sadrži praznu/no-op static implementaciju');
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

const activeNames = new Set(decks.flatMap(deck => deck.cards.map(card => card.name)));
const rawCards = Object.keys(MTG.RAW_DATA.cards).sort().map(name => {
  const issues = issuesFor(name);
  return { name, active: activeNames.has(name), status: issues.length ? 'FAIL' : 'PASS', issues };
});
const inactiveCards = rawCards.filter(card => !card.active);

const report = {
  generatedAt: new Date().toISOString(),
  policy: 'Svaki deck i svaka jedinstvena karta se navode zasebno. Aggregate smoke nije zamjena za ovaj izvještaj.',
  excludedDecks: [{ name: 'Blame Game', reason: 'Izbačen iz proizvoda zbog necertifikovane političke/goad i damage-redirection jezgre.' }],
  totals: {
    decks: decks.length,
    cardDeckChecks: decks.reduce((sum, deck) => sum + deck.uniqueCards, 0),
    passedCardDeckChecks: decks.reduce((sum, deck) => sum + deck.passed, 0),
    failedCardDeckChecks: decks.reduce((sum, deck) => sum + deck.failed, 0),
    uniqueCards: new Set(decks.flatMap(deck => deck.cards.map(card => card.name))).size,
    uniquePassed: new Set(decks.flatMap(deck => deck.cards.filter(card => card.status === 'PASS').map(card => card.name))).size,
    uniqueFailed: new Set(decks.flatMap(deck => deck.cards.filter(card => card.status === 'FAIL').map(card => card.name))).size,
    rawCards: rawCards.length,
    rawPassed: rawCards.filter(card => card.status === 'PASS').length,
    rawFailed: rawCards.filter(card => card.status === 'FAIL').length,
    inactiveRawCards: inactiveCards.length,
    inactiveRawPassed: inactiveCards.filter(card => card.status === 'PASS').length,
    inactiveRawFailed: inactiveCards.filter(card => card.status === 'FAIL').length,
  },
  decks,
  inactiveCards,
};

fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(path.join(reportDir, 'card-certification.json'), JSON.stringify(report, null, 2) + '\n');

const md = [];
md.push('# Card-by-card certifikacija');
md.push('');
md.push(`Generisano: ${report.generatedAt}`);
md.push('');
md.push(`Aktivni deckovi: **${report.totals.decks}** · stvarno jedinstvenih karata: **${report.totals.uniqueCards}** · card/deck provjere: **${report.totals.cardDeckChecks}**`);
md.push('');
md.push(`Jedinstvene karte — PASS: **${report.totals.uniquePassed}** · FAIL: **${report.totals.uniqueFailed}** · card/deck pojave — PASS: **${report.totals.passedCardDeckChecks}** · FAIL: **${report.totals.failedCardDeckChecks}**`);
md.push('');
md.push(`Cijela raw baza — PASS: **${report.totals.rawPassed}/${report.totals.rawCards}** · FAIL: **${report.totals.rawFailed}**. Od toga je **${report.totals.inactiveRawCards}** karata samo u izbačenom \`Blame Game\` decku.`);
md.push('');
md.push('`Blame Game` je namjerno izbačen iz proizvoda; njegove jedinstvene raw karte provjerene su strukturno ispod, ali cijeli deck nije dio aktivnog gameplay/release gatea.');
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
md.push('## Raw karte izvan aktivnog proizvoda');
md.push('');
md.push('| Status | Karta | Nalaz |');
md.push('|---|---|---|');
for (const card of inactiveCards) {
  const issue = card.issues.length ? card.issues.join('; ') : 'Eksplicitna skripta i strukturna izvršna putanja postoje; karta nije u aktivnom deck setu.';
  md.push(`| ${card.status} | ${card.name.replace(/\|/g, '\\|')} | ${issue.replace(/\|/g, '\\|')} |`);
}
md.push('');
fs.writeFileSync(path.join(reportDir, 'card-certification.md'), md.join('\n'));

console.log(`Deckovi: ${report.totals.decks}`);
console.log(`Jedinstvene karte: ${report.totals.uniqueCards}`);
console.log(`Card/deck provjere: ${report.totals.cardDeckChecks}`);
console.log(`Jedinstveni PASS: ${report.totals.uniquePassed} · FAIL: ${report.totals.uniqueFailed}`);
console.log(`Card/deck PASS: ${report.totals.passedCardDeckChecks} · FAIL: ${report.totals.failedCardDeckChecks}`);
console.log(`Raw baza PASS: ${report.totals.rawPassed}/${report.totals.rawCards} · FAIL: ${report.totals.rawFailed}`);
console.log(`Izvan aktivnog seta PASS: ${report.totals.inactiveRawPassed}/${report.totals.inactiveRawCards} · FAIL: ${report.totals.inactiveRawFailed}`);
for (const deck of decks.filter(deck => deck.failed)) console.log(`FAIL ${deck.name}: ${deck.failed}`);
if (strict && report.totals.rawFailed) process.exitCode = 1;
