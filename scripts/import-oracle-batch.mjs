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
  'hexproof', 'shroud', 'flash', 'prowess', 'forestwalk', 'wither', 'fear',
  'intimidate', 'skulk', 'shadow', 'horsemanship', 'plainswalk', 'islandwalk',
  'swampwalk', 'mountainwalk',
]);
const TOKEN_KEYWORDS = new Set([...IMPLEMENTED_KEYWORDS].filter(keyword => keyword !== 'prowess'));
const COLOR_WORDS = Object.freeze({ white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' });

function argValue(args, name, fallback) {
  const prefix = `--${name}=`;
  const value = args.find(arg => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function readState(file = statePath, io = fs) {
  if (!io.existsSync(file)) return {
    schemaVersion: 1,
    strategy: 'commander-legal-paper-semantic-queue-v2',
    batchSize: DEFAULT_LIMIT,
    batches: [],
    importedOracleIds: [],
    importedNames: [],
  };
  return JSON.parse(io.readFileSync(file, 'utf8'));
}

function batchNumberFrom(state, args = []) {
  const requested = Number(argValue(args, 'batch', ''));
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

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^\x24{}()|[\]\\]/g, '\\$&');
}

function selfSubject(card, kind) {
  return '(?:This ' + kind + '|' + escapeRegExp(card.name) + ')';
}

function keywordLine(line) {
  const parts = String(line || '').split(/\s*[,;]\s*/)
    .map(part => part.trim().toLowerCase())
    .filter(Boolean);
  if (!parts.length || !parts.every(part => IMPLEMENTED_KEYWORDS.has(part) || /^ward \{\d+\}$/.test(part))) return null;
  return parts;
}

function numberWord(value) {
  return ({ a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 }[String(value).toLowerCase()] || Number(value) || 0);
}

function parseManaLine(line) {
  const match = /^\{T\}: Add (.+)\.$/i.exec(line);
  if (!match) return null;
  if (/^one mana of any color$/i.test(match[1])) {
    return { kind: 'mana-source', produce: [{ ANY: true, n: 1 }], contract: 'mana-source' };
  }
  const produce = [];
  for (const choice of match[1].split(/\s+or\s+/i)) {
    const symbols = [...choice.matchAll(/\{([WUBRGC])\}/g)].map(entry => entry[1]);
    if (!symbols.length || choice.replace(/\{[WUBRGC]\}/g, '').trim()) return null;
    const option = {};
    for (const symbol of symbols) option[symbol] = (option[symbol] || 0) + 1;
    produce.push(option);
  }
  return produce.length ? { kind: 'mana-source', produce, contract: 'mana-source' } : null;
}

function tokenOperation(card, line) {
  const pattern = '^When ' + selfSubject(card, 'creature') +
    ' enters, create (a|an|one|two|three) (\\d+)\\/(\\d+) (.+?) creature tokens?(?: with (.+))?\\.$';
  const match = new RegExp(pattern, 'i').exec(line);
  if (!match) return null;
  const descriptor = match[4].trim().split(/\s+/);
  const colors = descriptor.filter(word => COLOR_WORDS[word.toLowerCase()]).map(word => COLOR_WORDS[word.toLowerCase()]);
  const artifact = descriptor.some(word => word.toLowerCase() === 'artifact');
  const enchantment = descriptor.some(word => word.toLowerCase() === 'enchantment');
  const subtypes = descriptor.filter(word =>
    !COLOR_WORDS[word.toLowerCase()] &&
    !['and', 'colorless', 'artifact', 'enchantment'].includes(word.toLowerCase()));
  if (!subtypes.length) return null;
  const keywords = match[5]
    ? match[5].split(/\s*(?:,| and )\s*/i).map(value => value.trim().toLowerCase()).filter(Boolean)
    : [];
  if (!keywords.every(keyword => TOKEN_KEYWORDS.has(keyword))) return null;
  return {
    kind: 'etb-token',
    n: numberWord(match[1]),
    token: {
      name: subtypes.join(' '),
      super: [],
      types: [...(artifact ? ['Artifact'] : []), ...(enchantment ? ['Enchantment'] : []), 'Creature'],
      subtypes,
      power: match[2],
      toughness: match[3],
      colors,
      keywords,
    },
    contract: 'etb-token-creation',
  };
}

function creatureSemantics(card, rulesCore) {
  if (!/^-?\d+$/.test(String(card.power)) || !/^-?\d+$/.test(String(card.toughness))) {
    return { reason: 'dynamic-power-toughness' };
  }
  if (!String(card.oracle_text || '').trim()) {
    return { semanticClass: 'vanilla', implementedKeywords: [], implementation: [], oracleContracts: [], rulesCore: '' };
  }
  if (!rulesCore) return { reason: 'reminder-only-oracle' };

  const implementedKeywords = [];
  const implementation = [];
  const subject = selfSubject(card, 'creature');
  for (const line of rulesCore.split('\n')) {
    const keywords = keywordLine(line);
    if (keywords) {
      implementedKeywords.push(...keywords);
      continue;
    }
    const mana = parseManaLine(line);
    if (mana) {
      implementation.push(mana);
      continue;
    }
    if (new RegExp('^' + subject + " can't block\\.$", 'i').test(line)) {
      implementation.push({ kind: 'cant-block', contract: 'cant-block-static' });
      continue;
    }
    if (new RegExp('^' + subject + ' attacks each combat if able\\.$', 'i').test(line)) {
      implementation.push({ kind: 'must-attack', contract: 'must-attack-static' });
      continue;
    }
    let match = new RegExp('^When ' + subject + ' enters, draw a card\\.$', 'i').exec(line);
    if (match) {
      implementation.push({ kind: 'etb-draw', n: 1, contract: 'etb-draw' });
      continue;
    }
    match = new RegExp('^When ' + subject + ' enters, you gain (\\d+) life\\.$', 'i').exec(line);
    if (match) {
      implementation.push({ kind: 'etb-life-gain', n: Number(match[1]), contract: 'etb-life-gain' });
      continue;
    }
    match = new RegExp('^When ' + subject + ' dies, draw a card\\.$', 'i').exec(line);
    if (match) {
      implementation.push({ kind: 'dies-draw', n: 1, contract: 'dies-draw' });
      continue;
    }
    match = new RegExp('^When ' + subject + ' enters, (scry|surveil) ([1-3])\\.$', 'i').exec(line);
    if (match) {
      implementation.push({ kind: 'etb-' + match[1].toLowerCase(), n: Number(match[2]), contract: 'etb-library-selection' });
      continue;
    }
    const token = tokenOperation(card, line);
    if (token) {
      implementation.push(token);
      continue;
    }
    return { reason: 'oracle-needs-explicit-semantics' };
  }
  return {
    semanticClass: implementation.length ? 'creature-template' : 'keyword-only',
    implementedKeywords: [...new Set(implementedKeywords)],
    implementation,
    oracleContracts: [...new Set(implementation.map(operation => operation.contract))],
    rulesCore,
  };
}

function landSemantics(card, rulesCore) {
  const implementation = [];
  const subject = selfSubject(card, 'land');
  for (const line of rulesCore ? rulesCore.split('\n') : []) {
    const mana = parseManaLine(line);
    if (mana) {
      implementation.push(mana);
      continue;
    }
    if (new RegExp('^' + subject + ' enters(?: the battlefield)? tapped\\.$', 'i').test(line)) {
      implementation.push({ kind: 'enters-tapped', contract: 'land-enters-tapped' });
      continue;
    }
    let match = new RegExp('^When ' + subject + ' enters(?: the battlefield)?, you gain 1 life\\.$', 'i').exec(line);
    if (match) {
      implementation.push({ kind: 'etb-life-gain', n: 1, contract: 'etb-life-gain' });
      continue;
    }
    match = new RegExp('^When ' + subject + ' enters(?: the battlefield)?, scry 1\\.$', 'i').exec(line);
    if (match) {
      implementation.push({ kind: 'etb-scry', n: 1, contract: 'etb-library-selection' });
      continue;
    }
    return { reason: 'land-needs-explicit-semantics' };
  }
  if (!implementation.some(operation => operation.kind === 'mana-source') &&
      Array.isArray(card.produced_mana) && card.produced_mana.length) {
    const colors = card.produced_mana.filter(color => /^[WUBRGC]$/.test(color));
    if (colors.length) {
      implementation.push({
        kind: 'mana-source',
        produce: colors.map(color => ({ [color]: 1 })),
        contract: 'mana-source',
      });
    }
  }
  if (!implementation.some(operation => operation.kind === 'mana-source')) {
    return { reason: 'land-needs-explicit-semantics' };
  }
  return {
    semanticClass: 'land-mana-template',
    implementedKeywords: [],
    implementation,
    oracleContracts: [...new Set(implementation.map(operation => operation.contract))],
    rulesCore,
  };
}

function spellSemantics(card, rulesCore) {
  if (!rulesCore || rulesCore.includes('\n')) return { reason: 'spell-needs-explicit-semantics' };
  const source = selfSubject(card, 'spell');
  let match = /^(?:You )?Draw (a|one|two|three|four|five|six|seven) cards?\.$/i.exec(rulesCore);
  let operation = match && { kind: 'spell-draw', n: numberWord(match[1]), contract: 'spell-draw' };
  if (!operation && /^Counter target spell\.$/i.test(rulesCore)) {
    operation = { kind: 'spell-counter', contract: 'spell-counter' };
  }
  if (!operation) {
    match = /^(Destroy|Exile) target (creature or planeswalker|artifact or enchantment|nonland permanent|permanent|creature|artifact|enchantment|planeswalker|land)\.(?: It can't be regenerated\.)?$/i.exec(rulesCore);
    if (match) {
      operation = {
        kind: 'spell-' + match[1].toLowerCase(),
        what: match[2].toLowerCase(),
        noRegen: /can't be regenerated/i.test(rulesCore),
        contract: 'spell-' + match[1].toLowerCase(),
      };
    }
  }
  if (!operation) {
    match = new RegExp('^' + source +
      ' deals (\\d+|X) damage to (any target|target creature or planeswalker|target creature|target player or planeswalker|target opponent|target player|each opponent)\\.$', 'i').exec(rulesCore);
    if (match) {
      operation = {
        kind: 'spell-damage',
        n: match[1] === 'X' ? 'X' : Number(match[1]),
        what: match[2].toLowerCase(),
        contract: 'spell-damage',
      };
    }
  }
  if (!operation) {
    match = /^Target creature gets ([+-]\d+)\/([+-]\d+) until end of turn(?: and gains? (flying|trample|deathtouch|lifelink|haste|vigilance|menace|reach|first strike|double strike) until end of turn)?\.$/i.exec(rulesCore);
    if (match) {
      operation = {
        kind: 'spell-pump',
        power: Number(match[1]),
        toughness: Number(match[2]),
        keywords: match[3] ? [match[3].toLowerCase()] : [],
        contract: 'spell-pump',
      };
    }
  }
  if (!operation) {
    match = /^Creatures you control get ([+-]\d+)\/([+-]\d+) until end of turn(?: and gain (flying|trample|deathtouch|lifelink|haste|vigilance|menace|reach|first strike|double strike) until end of turn)?\.$/i.exec(rulesCore);
    if (match) {
      operation = {
        kind: 'spell-team-pump',
        power: Number(match[1]),
        toughness: Number(match[2]),
        keywords: match[3] ? [match[3].toLowerCase()] : [],
        contract: 'spell-team-pump',
      };
    }
  }
  if (!operation) {
    match = /^You gain (\d+) life\.$/i.exec(rulesCore);
    if (match) operation = { kind: 'spell-life-gain', n: Number(match[1]), contract: 'spell-life-gain' };
  }
  if (!operation) {
    match = /^Return target (creature|nonland permanent|permanent) to its owner's hand\.$/i.exec(rulesCore);
    if (match) operation = { kind: 'spell-bounce', what: match[1].toLowerCase(), contract: 'spell-bounce' };
  }
  if (!operation) {
    match = /^Target (opponent|player) discards? (a|one|two|three) cards?\.$/i.exec(rulesCore);
    if (match) {
      operation = {
        kind: 'spell-discard',
        what: match[1].toLowerCase(),
        n: numberWord(match[2]),
        contract: 'spell-discard',
      };
    }
  }
  if (!operation) {
    match = /^Target player mills (one|two|three|four|five|six|seven|eight|nine|ten|\d+) cards?\.$/i.exec(rulesCore);
    const words = { eight: 8, nine: 9, ten: 10 };
    if (match) {
      operation = {
        kind: 'spell-mill',
        n: words[match[1].toLowerCase()] || numberWord(match[1]),
        contract: 'spell-mill',
      };
    }
  }
  if (!operation) return { reason: 'spell-needs-explicit-semantics' };
  return {
    semanticClass: 'spell-template',
    implementedKeywords: [],
    implementation: [operation],
    oracleContracts: [operation.contract],
    rulesCore,
  };
}

export function validateManaCost(manaCost) {
  const source = String(manaCost || '');
  if (!source) return true;
  const symbols = [...source.matchAll(/\{([^}]+)\}/g)].map(match => match[1]);
  if (!symbols.length || symbols.map(symbol => `{${symbol}}`).join('') !== source) return false;
  return symbols.every(symbol =>
    /^\d+$/.test(symbol) || symbol === 'X' || /^[WUBRGC]$/.test(symbol) ||
    /^[WUBRG]\/P$/.test(symbol) || /^[WUBRG]\/[WUBRG]$/.test(symbol) ||
    /^[WUBRG]{2}$/.test(symbol) || /^2\/[WUBRG]$/.test(symbol));
}

export function semanticClass(card) {
  if (!validateManaCost(card.mana_cost)) return { reason: 'unsupported-mana-cost' };
  if (card.layout !== 'normal') return { reason: 'complex-layout' };
  const parsed = parseTypeLine(card.type_line);
  const rulesCore = stripReminderText(card.oracle_text || '');
  if (parsed.types.includes('Creature')) return creatureSemantics(card, rulesCore);
  if (parsed.types.includes('Land')) return landSemantics(card, rulesCore);
  if (parsed.types.includes('Instant') || parsed.types.includes('Sorcery')) return spellSemantics(card, rulesCore);
  return { reason: 'noncreature-needs-explicit-semantics' };
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
  if (card.loyalty !== undefined) raw.loyalty = String(card.loyalty);
  if (card.defense !== undefined) raw.defense = String(card.defense);
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

export function collectReservedOracleCards(reports) {
  const names = new Set();
  const ids = new Set();
  for (const report of reports || []) {
    const batch = report && report.batch && Array.isArray(report.batch.cards) ? report.batch : report;
    if (!batch || !Array.isArray(batch.cards)) continue;
    for (const entry of batch.cards) {
      if (entry && entry.raw && entry.raw.name) names.add(entry.raw.name);
      if (entry && entry.oracleId) ids.add(entry.oracleId);
    }
  }
  return { names, ids };
}

function reservedOracleCards(directory = reportDir, io = fs) {
  if (!io.existsSync(directory)) return collectReservedOracleCards([]);
  const reports = io.readdirSync(directory)
    .filter(name => name.endsWith('.json') && name !== 'state.json')
    .map(file => JSON.parse(io.readFileSync(path.join(directory, file), 'utf8')));
  return collectReservedOracleCards(reports);
}

export function runtimeBatch(report) {
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

export function moduleSource(report) {
  const payload = JSON.stringify(runtimeBatch(report), null, 2);
  return `// Generated by npm run import:oracle-batch -- --write. Do not edit by hand.\n` +
    `'use strict';\n` +
    `var MTG = globalThis.MTG || (globalThis.MTG = {});\n` +
    `MTG.registerOracleBatch(${payload});\n`;
}

export function validateLimit(value) {
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new Error('--limit must be an integer from 1 to 500.');
  }
  return limit;
}

export function createImportPlan({
  cards,
  bulk,
  state,
  baseNames,
  reservations,
  limit = DEFAULT_LIMIT,
  sequence,
  acceptNewSnapshot = false,
  generatedAt = new Date().toISOString(),
}) {
  const selectedLimit = validateLimit(limit);
  const currentState = state || {
    schemaVersion: 1,
    strategy: 'commander-legal-paper-semantic-queue-v2',
    batches: [],
    importedOracleIds: [],
    importedNames: [],
  };
  const selectedSequence = Number(sequence);
  if (!Number.isInteger(selectedSequence) || selectedSequence < 1) {
    throw new Error('Oracle batch sequence must be a positive integer.');
  }
  const id = batchId(selectedSequence);
  if ((currentState.batches || []).some(batch => batch.id === id || Number(batch.sequence) === selectedSequence)) {
    throw new Error(`${id} already exists in Oracle import state.`);
  }

  const previousSnapshot = currentState.source && currentState.source.bulkUpdatedAt;
  if (previousSnapshot && previousSnapshot !== bulk.updated_at && !acceptNewSnapshot) {
    throw new Error(
      'Scryfall Oracle snapshot changed from ' + previousSnapshot + ' to ' + bulk.updated_at +
      '. Review the new queue and rerun with --accept-new-snapshot.'
    );
  }

  const importedIds = new Set(currentState.importedOracleIds || []);
  const importedNames = new Set(currentState.importedNames || []);
  const reserved = reservations || collectReservedOracleCards([]);
  const selectionIds = new Set([...importedIds, ...(reserved.ids || [])]);
  const selectionNames = new Set([...importedNames, ...(reserved.names || [])]);
  const legacyNames = baseNames instanceof Set ? baseNames : new Set(baseNames || []);
  const deferredByReason = {};
  const deferredExamples = {};
  const supported = [];
  let paperCards = 0;
  let commanderLegalCards = 0;

  for (const card of cards || []) {
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
    if (legacyNames.has(card.name)) {
      addReason(deferredByReason, deferredExamples, 'already-in-legacy-engine', card);
      continue;
    }
    if (selectionIds.has(card.oracle_id) || selectionNames.has(card.name)) {
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
  const chosen = supported.slice(0, selectedLimit);
  if (chosen.length !== selectedLimit) {
    throw new Error(`Only ${chosen.length} cards match the certified semantic subset; requested ${selectedLimit}.`);
  }

  const report = {
    schemaVersion: 1,
    id,
    sequence: selectedSequence,
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
      semanticClasses: ['vanilla', 'keyword-only', 'creature-template', 'land-mana-template', 'spell-template'],
      note: 'Every non-reminder Oracle line must exactly match a central keyword or a closed executable template. Prefix/partial autoscripting is never certification.',
    },
    catalogSummary: {
      oracleRows: (cards || []).length,
      paperCards,
      commanderLegalCards,
      legacyEngineCards: legacyNames.size,
      readyForThisCompiler: supported.length,
      selected: chosen.length,
      selectedBySemanticClass: Object.fromEntries(Object.entries(chosen.reduce((counts, entry) => {
        counts[entry.semantics.semanticClass] = (counts[entry.semantics.semanticClass] || 0) + 1;
        return counts;
      }, {})).sort()),
      deferredByReason: Object.fromEntries(Object.entries(deferredByReason).sort()),
      deferredExamples: Object.fromEntries(Object.entries(deferredExamples).sort()),
      nextReadyNames: supported.slice(selectedLimit, selectedLimit + 12).map(entry => entry.card.name),
    },
    cards: chosen.map(({ card, semantics }, index) => ({
      position: index + 1,
      oracleId: card.oracle_id,
      scryfallId: card.id,
      semanticClass: semantics.semanticClass,
      implementedKeywords: semantics.implementedKeywords,
      implementation: semantics.implementation || [],
      oracleContracts: semantics.oracleContracts || [],
      rulesCore: semantics.rulesCore,
      raw: rawCard(card),
      catalog: catalogCard(card),
    })),
  };

  const nextState = {
    schemaVersion: 1,
    strategy: 'commander-legal-paper-semantic-queue-v2',
    batchSize: selectedLimit,
    updatedAt: generatedAt,
    source: report.source,
    batches: [...(currentState.batches || []), {
      id,
      sequence: selectedSequence,
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

  return { id, sequence: selectedSequence, report, nextState };
}

export function writeImportPlanAtomic({ modulePath, reportPath, statePath: outputStatePath, report, nextState }, options = {}) {
  const io = options.fs || fs;
  const beforeStep = options.beforeStep || (() => {});
  io.mkdirSync(path.dirname(modulePath), { recursive: true });
  io.mkdirSync(path.dirname(reportPath), { recursive: true });
  io.mkdirSync(path.dirname(outputStatePath), { recursive: true });
  if (io.existsSync(modulePath) || io.existsSync(reportPath)) {
    throw new Error(`${report.id} output already exists.`);
  }

  const nonce = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const moduleTemp = path.join(path.dirname(modulePath), `.${path.basename(modulePath)}.${nonce}.tmp`);
  const reportTemp = path.join(path.dirname(reportPath), `.${path.basename(reportPath)}.${nonce}.tmp`);
  const stateTemp = path.join(path.dirname(outputStatePath), `.${path.basename(outputStatePath)}.${nonce}.tmp`);
  const temps = [moduleTemp, reportTemp, stateTemp];
  let modulePromoted = false;
  let reportPromoted = false;
  const safeUnlink = file => {
    try { if (io.existsSync(file)) io.unlinkSync(file); } catch { /* preserve the original failure */ }
  };

  try {
    beforeStep('write-module-temp');
    io.writeFileSync(moduleTemp, moduleSource(report), { encoding: 'utf8', flag: 'wx' });
    beforeStep('write-report-temp');
    io.writeFileSync(reportTemp, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    beforeStep('write-state-temp');
    io.writeFileSync(stateTemp, `${JSON.stringify(nextState, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });

    beforeStep('rename-module');
    io.renameSync(moduleTemp, modulePath);
    modulePromoted = true;
    beforeStep('rename-report');
    io.renameSync(reportTemp, reportPath);
    reportPromoted = true;
    beforeStep('rename-state');
    io.renameSync(stateTemp, outputStatePath);
  } catch (error) {
    if (reportPromoted) safeUnlink(reportPath);
    if (modulePromoted) safeUnlink(modulePath);
    throw error;
  } finally {
    for (const temp of temps) safeUnlink(temp);
  }
}

export async function runOracleImport(args = process.argv.slice(2), dependencies = {}) {
  const io = dependencies.fs || fs;
  const workspaceRoot = dependencies.root || root;
  const outputSourceDir = path.join(workspaceRoot, 'src', 'oracle-batches');
  const outputReportDir = path.join(workspaceRoot, 'reports', 'oracle-import');
  const outputStatePath = path.join(outputReportDir, 'state.json');
  const selectedLimit = validateLimit(argValue(args, 'limit', String(DEFAULT_LIMIT)));
  const state = readState(outputStatePath, io);
  const sequence = batchNumberFrom(state, args);
  const id = batchId(sequence);
  if ((state.batches || []).some(batch => batch.id === id || Number(batch.sequence) === sequence)) {
    throw new Error(`${id} already exists in Oracle import state.`);
  }

  const modulePath = path.join(outputSourceDir, `batch-${String(sequence).padStart(4, '0')}.js`);
  const reportPath = path.join(outputReportDir, `batch-${String(sequence).padStart(4, '0')}.json`);
  if (args.includes('--write') && (io.existsSync(modulePath) || io.existsSync(reportPath))) {
    throw new Error(`${id} output already exists.`);
  }

  const baseData = extractRawData(io.readFileSync(path.join(workspaceRoot, 'src', 'data.js'), 'utf8'));
  const reservations = reservedOracleCards(outputReportDir, io);
  const loader = dependencies.fetchOracleCards || fetchOracleCards;
  const { bulk, cards } = await loader();
  const generatedAt = dependencies.now ? dependencies.now() : new Date().toISOString();
  const plan = createImportPlan({
    cards,
    bulk,
    state,
    baseNames: new Set(Object.keys(baseData.cards)),
    reservations,
    limit: selectedLimit,
    sequence,
    acceptNewSnapshot: args.includes('--accept-new-snapshot'),
    generatedAt,
  });
  const logger = dependencies.console || console;
  logger.log(`Source: ${bulk.name} updated ${bulk.updated_at}`);
  logger.log(`Oracle rows: ${cards.length} · paper: ${plan.report.catalogSummary.paperCards} · Commander legal: ${plan.report.catalogSummary.commanderLegalCards}`);
  logger.log(`Certified subset available: ${plan.report.catalogSummary.readyForThisCompiler}`);
  logger.log(`Batch ${id}: ${plan.report.cards.length} cards (${plan.report.cards[0].raw.name} → ${plan.report.cards.at(-1).raw.name})`);
  logger.log(`Deferred: ${JSON.stringify(plan.report.catalogSummary.deferredByReason)}`);

  if (args.includes('--write')) {
    writeImportPlanAtomic({ modulePath, reportPath, statePath: outputStatePath, ...plan }, {
      fs: io,
      beforeStep: dependencies.beforeWriteStep,
    });
    logger.log(`Wrote ${path.relative(workspaceRoot, modulePath)}`);
    logger.log(`Wrote ${path.relative(workspaceRoot, reportPath)}`);
    logger.log(`Wrote ${path.relative(workspaceRoot, outputStatePath)}`);
  }
  return plan;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runOracleImport();
}
