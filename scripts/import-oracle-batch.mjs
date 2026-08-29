import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { extractRawData } from './source-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(root, 'src', 'oracle-batches');
const reportDir = path.join(root, 'reports', 'oracle-import');
const statePath = path.join(reportDir, 'state.json');
const BULK_INDEX_URL = 'https://api.scryfall.com/bulk-data';
const DEFAULT_LIMIT = 100;
const USER_AGENT = 'MTGcodexOracleImporter/0.1 (local development)';

const SUPERTYPES = new Set(['Legendary', 'Basic', 'Snow', 'World', 'Ongoing']);
const CARD_TYPES = new Set(['Creature', 'Artifact', 'Enchantment', 'Instant', 'Sorcery', 'Land', 'Planeswalker', 'Battle', 'Kindred', 'Tribal']);
const IMPLEMENTED_KEYWORDS = new Set([
  'flying', 'first strike', 'double strike', 'deathtouch', 'lifelink', 'trample',
  'haste', 'vigilance', 'menace', 'reach', 'defender', 'indestructible',
  'hexproof', 'shroud', 'flash', 'prowess', 'forestwalk', 'wither',
]);

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.find(arg => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function readState() {
  if (!fs.existsSync(statePath)) return {
    schemaVersion: 1,
    strategy: 'commander-legal-paper-semantic-queue-v1',
    batchSize: DEFAULT_LIMIT,
    batches: [],
    importedOracleIds: [],
    importedNames: [],
  };
  return JSON.parse(fs.readFileSync(statePath, 'utf8'));
}

function batchNumberFrom(state) {
  const requested = Number(argValue('batch', ''));
  if (Number.isInteger(requested) && requested > 0) return requested;
  return Math.max(0, ...state.batches.map(batch => Number(batch.sequence) || 0)) + 1;
}

function batchId(sequence) {
  return `oracle-${String(sequence).padStart(4, '0')}`;
}

function stripReminderText(text) {
  let output = '';
  let depth = 0;
  for (const character of String(text || '')) {
    if (character === '(') {
      depth += 1;
      continue;
    }
    if (character === ')' && depth > 0) {
      depth -= 1;
      continue;
    }
    if (depth === 0) output += character;
  }
  return output.split('\n').map(line => line.trim()).filter(Boolean).join('\n');
}

function parseTypeLine(typeLine) {
  const [left = '', right = ''] = String(typeLine || '').split(/\s+—\s+/, 2);
  const words = left.split(/\s+/).filter(Boolean);
  return {
    super: words.filter(word => SUPERTYPES.has(word)),
    types: words.filter(word => CARD_TYPES.has(word)),
    subtypes: right.split(/\s+/).filter(Boolean),
  };
}

function semanticClass(card) {
  if (card.layout !== 'normal') return { reason: 'complex-layout' };
  const parsed = parseTypeLine(card.type_line);
  if (!parsed.types.includes('Creature')) return { reason: 'noncreature-needs-explicit-semantics' };
  if (!/^-?\d+$/.test(String(card.power)) || !/^-?\d+$/.test(String(card.toughness))) {
    return { reason: 'dynamic-power-toughness' };
  }

  const oracle = String(card.oracle_text || '');
  if (!oracle.trim()) return { semanticClass: 'vanilla', implementedKeywords: [], rulesCore: '' };

  const rulesCore = stripReminderText(oracle);
  if (!rulesCore) return { reason: 'reminder-only-oracle' };
  const parts = rulesCore.split('\n')
    .flatMap(line => line.split(/\s*[,;]\s*/))
    .map(part => part.trim().toLowerCase())
    .filter(Boolean);
  const implementedKeywords = [];
  for (const part of parts) {
    if (IMPLEMENTED_KEYWORDS.has(part)) {
      implementedKeywords.push(part);
      continue;
    }
    if (/^ward \{\d+\}$/.test(part)) {
      implementedKeywords.push(part);
      continue;
    }
    return { reason: 'oracle-needs-explicit-semantics' };
  }
  return {
    semanticClass: 'keyword-only',
    implementedKeywords: [...new Set(implementedKeywords)],
    rulesCore,
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
    power: String(card.power),
    toughness: String(card.toughness),
    _ci: card.color_identity || [],
    _oracleId: card.oracle_id,
    _scryfallId: card.id,
    _layout: card.layout,
    _set: card.set,
    _collectorNumber: card.collector_number,
    _rarity: card.rarity,
  };
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

async function fetchOracleCards() {
  const headers = {
    'user-agent': USER_AGENT,
    accept: 'application/json;q=0.9,*/*;q=0.8',
  };
  const indexResponse = await fetch(BULK_INDEX_URL, { headers });
  if (!indexResponse.ok) throw new Error(`Scryfall bulk index: HTTP ${indexResponse.status}`);
  const index = await indexResponse.json();
  const bulk = (index.data || []).find(entry => entry.type === 'oracle_cards');
  if (!bulk || !bulk.jsonl_download_uri) throw new Error('Scryfall Oracle Cards bulk feed is unavailable.');

  const dataResponse = await fetch(bulk.jsonl_download_uri, { headers });
  if (!dataResponse.ok || !dataResponse.body) {
    throw new Error(`Scryfall Oracle Cards download: HTTP ${dataResponse.status}`);
  }
  const input = Readable.fromWeb(dataResponse.body).pipe(createGunzip());
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  const cards = [];
  for await (const line of lines) {
    if (line.trim()) cards.push(JSON.parse(line));
  }
  return { bulk, cards };
}

function addReason(stats, examples, reason, card) {
  stats[reason] = (stats[reason] || 0) + 1;
  if (!examples[reason]) examples[reason] = [];
  if (examples[reason].length < 8) examples[reason].push(card.name);
}

function runtimeBatch(report) {
  return {
    schemaVersion: report.schemaVersion,
    id: report.id,
    sequence: report.sequence,
    generatedAt: report.generatedAt,
    source: report.source,
    selectionPolicy: report.selectionPolicy,
    cards: report.cards,
  };
}

function moduleSource(report) {
  const payload = JSON.stringify(runtimeBatch(report), null, 2);
  return `// Generated by npm run import:oracle-batch -- --write. Do not edit by hand.\n` +
    `'use strict';\n` +
    `var MTG = globalThis.MTG || (globalThis.MTG = {});\n` +
    `MTG.registerOracleBatch(${payload});\n`;
}

const write = process.argv.includes('--write');
const limit = Number(argValue('limit', String(DEFAULT_LIMIT)));
if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error('--limit must be an integer from 1 to 500.');

const state = readState();
const sequence = batchNumberFrom(state);
const id = batchId(sequence);
if (state.batches.some(batch => batch.id === id)) throw new Error(`${id} already exists in Oracle import state.`);
const baseData = extractRawData(fs.readFileSync(path.join(root, 'src', 'data.js'), 'utf8'));
const baseNames = new Set(Object.keys(baseData.cards));

const { bulk, cards } = await fetchOracleCards();
const importedIds = new Set(state.importedOracleIds || []);
const importedNames = new Set(state.importedNames || []);
const deferredByReason = {};
const deferredExamples = {};
const supported = [];
let paperCards = 0;
let commanderLegalCards = 0;

for (const card of cards) {
  if (!card.games || !card.games.includes('paper')) {
    addReason(deferredByReason, deferredExamples, 'not-paper', card);
    continue;
  }
  paperCards += 1;
  if (!card.legalities || card.legalities.commander !== 'legal') {
    addReason(deferredByReason, deferredExamples, 'not-commander-legal', card);
    continue;
  }
  commanderLegalCards += 1;
  if (baseNames.has(card.name)) {
    addReason(deferredByReason, deferredExamples, 'already-in-legacy-engine', card);
    continue;
  }
  if (importedIds.has(card.oracle_id) || importedNames.has(card.name)) {
    addReason(deferredByReason, deferredExamples, 'already-imported-batch', card);
    continue;
  }
  const semantics = semanticClass(card);
  if (!semantics.semanticClass) {
    addReason(deferredByReason, deferredExamples, semantics.reason, card);
    continue;
  }
  supported.push({ card, semantics });
}

supported.sort((left, right) => left.card.name.localeCompare(right.card.name, 'en', { sensitivity: 'base' }) ||
  left.card.oracle_id.localeCompare(right.card.oracle_id));
const chosen = supported.slice(0, limit);
if (chosen.length !== limit) throw new Error(`Only ${chosen.length} cards match the certified semantic subset; requested ${limit}.`);

const generatedAt = new Date().toISOString();
const report = {
  schemaVersion: 1,
  id,
  sequence,
  generatedAt,
  source: {
    provider: 'Scryfall',
    endpoint: BULK_INDEX_URL,
    bulkType: bulk.type,
    bulkId: bulk.id,
    bulkUpdatedAt: bulk.updated_at,
    bulkDescription: bulk.description,
  },
  selectionPolicy: {
    games: ['paper'],
    commanderLegality: 'legal',
    sort: 'English card name, then Oracle ID',
    semanticClasses: ['vanilla', 'keyword-only'],
    note: 'Only cards whose complete non-reminder Oracle text is implemented by existing central keyword rules are certified in this batch.',
  },
  catalogSummary: {
    oracleRows: cards.length,
    paperCards,
    commanderLegalCards,
    legacyEngineCards: baseNames.size,
    readyForThisCompiler: supported.length,
    selected: chosen.length,
    deferredByReason: Object.fromEntries(Object.entries(deferredByReason).sort()),
    deferredExamples: Object.fromEntries(Object.entries(deferredExamples).sort()),
    nextReadyNames: supported.slice(limit, limit + 12).map(entry => entry.card.name),
  },
  cards: chosen.map(({ card, semantics }, index) => ({
    position: index + 1,
    oracleId: card.oracle_id,
    scryfallId: card.id,
    semanticClass: semantics.semanticClass,
    implementedKeywords: semantics.implementedKeywords,
    rulesCore: semantics.rulesCore,
    raw: rawCard(card),
    catalog: catalogCard(card),
  })),
};

console.log(`Source: ${bulk.name} updated ${bulk.updated_at}`);
console.log(`Oracle rows: ${cards.length} · paper: ${paperCards} · Commander legal: ${commanderLegalCards}`);
console.log(`Certified subset available: ${supported.length}`);
console.log(`Batch ${id}: ${chosen.length} cards (${chosen[0].card.name} → ${chosen.at(-1).card.name})`);
console.log(`Deferred: ${JSON.stringify(report.catalogSummary.deferredByReason)}`);

if (write) {
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.mkdirSync(reportDir, { recursive: true });
  const modulePath = path.join(sourceDir, `batch-${String(sequence).padStart(4, '0')}.js`);
  const reportPath = path.join(reportDir, `batch-${String(sequence).padStart(4, '0')}.json`);
  if (fs.existsSync(modulePath) || fs.existsSync(reportPath)) throw new Error(`${id} output already exists.`);

  const nextState = {
    schemaVersion: 1,
    strategy: 'commander-legal-paper-semantic-queue-v1',
    batchSize: limit,
    updatedAt: generatedAt,
    source: report.source,
    batches: [...state.batches, {
      id,
      sequence,
      generatedAt,
      sourceUpdatedAt: bulk.updated_at,
      count: chosen.length,
      firstName: chosen[0].card.name,
      lastName: chosen.at(-1).card.name,
    }],
    importedOracleIds: [...importedIds, ...chosen.map(entry => entry.card.oracle_id)].sort(),
    importedNames: [...importedNames, ...chosen.map(entry => entry.card.name)].sort((a, b) => a.localeCompare(b, 'en')),
    nextReadyNames: report.catalogSummary.nextReadyNames,
  };

  fs.writeFileSync(modulePath, moduleSource(report));
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(statePath, `${JSON.stringify(nextState, null, 2)}\n`);
  console.log(`Wrote ${path.relative(root, modulePath)}`);
  console.log(`Wrote ${path.relative(root, reportPath)}`);
  console.log(`Wrote ${path.relative(root, statePath)}`);
}
