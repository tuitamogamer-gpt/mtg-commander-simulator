import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractRawData } from './source-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'reports', 'oracle-import', 'sauron-dark-lord-moxfield.json');
const outputPath = path.join(root, 'src', 'oracle-batches', 'sauron-dark-lord.js');
const reportPath = path.join(root, 'reports', 'oracle-import', 'sauron-dark-lord-cards.json');
const write = process.argv.includes('--write');
const refresh = process.argv.includes('--refresh');
const USER_AGENT = 'MTGcodexMoxfieldDeckImporter/0.1 (local development)';
const SUPERTYPES = new Set(['Legendary', 'Basic', 'Snow', 'World', 'Ongoing']);
const CARD_TYPES = new Set(['Creature', 'Artifact', 'Enchantment', 'Instant', 'Sorcery', 'Land', 'Planeswalker', 'Battle', 'Kindred', 'Tribal']);

function parseTypeLine(typeLine) {
  const [left = '', right = ''] = String(typeLine || '').split(/\s+—\s+/, 2);
  const words = left.split(/\s+/).filter(Boolean);
  return {
    super: words.filter(word => SUPERTYPES.has(word)),
    types: words.filter(word => CARD_TYPES.has(word)),
    subtypes: right.split(/\s+/).filter(Boolean),
  };
}

function rawCard(card) {
  const parsed = parseTypeLine(card.type_line);
  const raw = {
    name: card.name,
    cost: card.mana_cost || null,
    super: parsed.super,
    types: parsed.types,
    subtypes: parsed.subtypes,
    oracle: card.oracle_text || '',
    _ci: card.color_identity || [],
    _oracleId: card.oracle_id,
    _scryfallId: card.id,
    _layout: card.layout,
    _set: card.set,
    _collectorNumber: card.collector_number,
    _rarity: card.rarity,
  };
  if (card.power !== undefined) raw.power = String(card.power);
  if (card.toughness !== undefined) raw.toughness = String(card.toughness);
  if (Array.isArray(card.produced_mana)) raw._produced = card.produced_mana;
  return raw;
}

function catalogCard(card) {
  return {
    typeLine: card.type_line,
    colorIdentity: card.color_identity || [],
    colors: card.colors || [],
    keywords: card.keywords || [],
    commanderLegality: card.legalities && card.legalities.commander || 'unknown',
    set: card.set,
    setName: card.set_name,
    collectorNumber: card.collector_number,
    rarity: card.rarity,
    releasedAt: card.released_at,
    scryfallUri: card.scryfall_uri,
  };
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const rows = Object.values(manifest.sections).flat();
const total = rows.reduce((sum, row) => sum + row.quantity, 0);
if (total !== manifest.deck.mainboardCount || total !== 100) throw new Error(`Deck manifest has ${total} cards, expected 100.`);

const requestedNames = [...new Set(rows.map(row => row.resolvedName || row.name))];
const baseData = extractRawData(fs.readFileSync(path.join(root, 'src', 'data.js'), 'utf8'));
const missingNames = requestedNames.filter(name => !baseData.cards[name]);
const response = await fetch('https://api.scryfall.com/cards/collection', {
  method: 'POST',
  headers: { 'content-type': 'application/json', accept: 'application/json', 'user-agent': USER_AGENT },
  body: JSON.stringify({ identifiers: missingNames.map(name => ({ name })) }),
});
if (!response.ok) throw new Error(`Scryfall collection: HTTP ${response.status} ${await response.text()}`);
const payload = await response.json();
if (payload.not_found && payload.not_found.length) throw new Error(`Scryfall did not resolve: ${JSON.stringify(payload.not_found)}`);
const byName = new Map((payload.data || []).map(card => [card.name, card]));
for (const name of missingNames) if (!byName.has(name)) throw new Error(`Missing Scryfall card: ${name}`);

// The collection endpoint may choose an MTGO-only printing for an old card
// whose Oracle identity also has paper printings (Library of Leng is one such
// case). Keep the Oracle identity, but select a real paper printing so image,
// set and collector metadata remain useful to the client.
for (const name of missingNames) {
  const card = byName.get(name);
  if (card.games?.includes('paper')) continue;
  const query = encodeURIComponent(`!\"${name}\" game:paper`);
  const paperResponse = await fetch(`https://api.scryfall.com/cards/search?q=${query}&unique=prints&order=released`, {
    headers: { accept: 'application/json', 'user-agent': USER_AGENT },
  });
  if (!paperResponse.ok) throw new Error(`Scryfall paper-print search for ${name}: HTTP ${paperResponse.status}`);
  const paperPayload = await paperResponse.json();
  const paperCard = (paperPayload.data || []).find(entry => entry.name === name && entry.games?.includes('paper'));
  if (!paperCard) throw new Error(`${name} has no paper printing.`);
  byName.set(name, paperCard);
}

const generatedAt = new Date().toISOString();
const cards = missingNames.map((name, index) => {
  const card = byName.get(name);
  if (!card.games?.includes('paper')) throw new Error(`${name} is not a paper card.`);
  if (card.legalities?.commander !== 'legal') throw new Error(`${name} is not Commander legal (${card.legalities?.commander}).`);
  return {
    position: index + 1,
    oracleId: card.oracle_id,
    scryfallId: card.id,
    semanticClass: 'manual-deck-semantic',
    // Complex cards are certified by their explicit manual interaction
    // contracts, not by pretending every Scryfall keyword is a standalone
    // central keyword implementation.
    implementedKeywords: [],
    rulesCore: card.oracle_text || '',
    raw: rawCard(card),
    catalog: catalogCard(card),
  };
});

const batch = {
  schemaVersion: 1,
  id: 'moxfield-sauron-dark-lord',
  sequence: 'deck-001',
  generatedAt,
  source: {
    provider: 'Scryfall',
    endpoint: 'https://api.scryfall.com/cards/collection',
    deckProvider: 'Moxfield',
    deckUrl: manifest.deck.url,
    deckPublicId: manifest.deck.publicId,
  },
  selectionPolicy: {
    games: ['paper'],
    commanderLegality: 'legal',
    names: 'All cards missing from the engine for the exact 100-card Moxfield mainboard.',
    semanticClasses: ['manual-deck-semantic'],
    note: 'Every entry requires an explicit implementation in scripts-sauron.js and focused player/AI interaction tests.',
  },
  cards,
};
const report = {
  schemaVersion: 1,
  generatedAt,
  deck: manifest.deck,
  occurrenceCount: total,
  uniqueCount: requestedNames.length,
  alreadyInEngine: requestedNames.filter(name => baseData.cards[name]),
  importedCount: cards.length,
  importedNames: cards.map(entry => entry.raw.name),
  batch,
};

console.log(`${manifest.deck.name}: ${total} cards, ${requestedNames.length} unique.`);
console.log(`Already in engine: ${report.alreadyInEngine.length}; targeted Oracle import: ${cards.length}.`);
if (write || refresh) {
  if (!refresh && (fs.existsSync(outputPath) || fs.existsSync(reportPath))) throw new Error('Sauron generated outputs already exist.');
  fs.writeFileSync(outputPath, `// Generated by scripts/import-moxfield-deck-oracle.mjs --write.\n'use strict';\nvar MTG = globalThis.MTG || (globalThis.MTG = {});\nMTG.registerOracleBatch(${JSON.stringify(batch, null, 2)});\n`);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Wrote ${path.relative(root, outputPath)}`);
  console.log(`Wrote ${path.relative(root, reportPath)}`);
}
