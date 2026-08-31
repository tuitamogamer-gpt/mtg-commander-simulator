import fs from 'node:fs';
import readline from 'node:readline';
import { createGunzip } from 'node:zlib';
import { semanticClass, collectReservedOracleCards } from './import-oracle-batch.mjs';
import { extractRawData } from './source-audit.mjs';

const sourcePath = process.argv[2];
const capacityOnly = process.argv.includes('--capacity-only');
if (!sourcePath) {
  throw new Error('Usage: node scripts/audit-oracle-capacity.mjs <oracle.jsonl.gz>');
}

const raw = extractRawData(fs.readFileSync(new URL('../src/data.js', import.meta.url), 'utf8'));
const state = JSON.parse(fs.readFileSync(new URL('../reports/oracle-import/state.json', import.meta.url), 'utf8'));
const reportDir = new URL('../reports/oracle-import/', import.meta.url);
const reserved = collectReservedOracleCards(fs.readdirSync(reportDir)
  .filter(name => name.endsWith('.json') && name !== 'state.json')
  .map(name => JSON.parse(fs.readFileSync(new URL(name, reportDir), 'utf8'))));
const excludedNames = new Set([...Object.keys(raw.cards), ...(state.importedNames || []), ...reserved.names]);

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
  return output.split('\n').map(line => line.trim()).filter(Boolean);
}

function cardGroup(card) {
  if (card.type_line.includes('Creature')) return 'creature';
  if (card.type_line.includes('Instant') || card.type_line.includes('Sorcery')) return 'spell';
  if (card.type_line.includes('Land')) return 'land';
  if (card.type_line.includes('Artifact')) return 'artifact';
  if (card.type_line.includes('Enchantment')) return 'enchantment';
  return 'other';
}

const reasonCounts = new Map();
const classCounts = new Map();
const operationCounts = new Map();
const keywordCounts = new Map();
const lineCounts = new Map();
const completeOracleCounts = new Map();
const singleMissingLineCounts = new Map();
const missingLineCardCounts = new Map();
const singleMissingPrefixCounts = new Map();
const singleMissingActionPrefixCounts = new Map();
const input = fs.createReadStream(sourcePath).pipe(createGunzip());
const lines = readline.createInterface({ input, crlfDelay: Infinity });

for await (const line of lines) {
  if (!line.trim()) continue;
  const card = JSON.parse(line);
  if (!card.games?.includes('paper') ||
      card.legalities?.commander !== 'legal' ||
      excludedNames.has(card.name) || reserved.ids.has(card.oracle_id)) continue;
  const semantics = semanticClass(card);
  if (semantics.semanticClass) {
    classCounts.set(semantics.semanticClass, (classCounts.get(semantics.semanticClass) || 0) + 1);
    for (const operation of semantics.implementation || []) {
      operationCounts.set(operation.kind, (operationCounts.get(operation.kind) || 0) + 1);
    }
    for (const keyword of semantics.implementedKeywords || []) {
      keywordCounts.set(keyword, (keywordCounts.get(keyword) || 0) + 1);
    }
    continue;
  }
  reasonCounts.set(semantics.reason, (reasonCounts.get(semantics.reason) || 0) + 1);
  if (capacityOnly) continue;
  if (![
    'oracle-needs-explicit-semantics',
    'spell-needs-explicit-semantics',
    'noncreature-needs-explicit-semantics',
    'land-needs-explicit-semantics',
  ].includes(semantics.reason)) continue;

  const group = cardGroup(card);
  const oracleLines = stripReminderText(card.oracle_text);
  const normalizedLines = oracleLines.map(text =>
    text.replaceAll(card.name, '<SELF>')
      .replace(/\b\d+\b/g, '#')
      .replace(/\{\d+\}/g, '{#}'));
  for (const text of normalizedLines) {
    const key = group + '|' + text;
    lineCounts.set(key, (lineCounts.get(key) || 0) + 1);
  }
  const completeKey = group + '|' + normalizedLines.join('\\n');
  completeOracleCounts.set(completeKey, (completeOracleCounts.get(completeKey) || 0) + 1);
  const missing = [];
  for (let index = 0; index < oracleLines.length; index++) {
    const lineSemantics = semanticClass({ ...card, oracle_text: oracleLines[index] });
    if (!lineSemantics.semanticClass) missing.push(group + '|' + normalizedLines[index]);
  }
  missingLineCardCounts.set(String(missing.length), (missingLineCardCounts.get(String(missing.length)) || 0) + 1);
  if (missing.length === 1) {
    singleMissingLineCounts.set(missing[0], (singleMissingLineCounts.get(missing[0]) || 0) + 1);
    const [groupName, text = ''] = missing[0].split('|', 2);
    const commaPrefix = text.includes(',') ? text.slice(0, text.indexOf(',') + 1) : '';
    const wordPrefix = text.split(/\s+/).slice(0, 6).join(' ');
    for (const prefix of new Set([commaPrefix, wordPrefix].filter(Boolean))) {
      const key = groupName + '|' + prefix;
      singleMissingPrefixCounts.set(key, (singleMissingPrefixCounts.get(key) || 0) + 1);
    }
    if (text.includes(',')) {
      const action = text.slice(text.indexOf(',') + 1).trim().split(/\s+/).slice(0, 7).join(' ');
      const key = groupName + '|' + commaPrefix + ' ' + action;
      singleMissingActionPrefixCounts.set(key, (singleMissingActionPrefixCounts.get(key) || 0) + 1);
    }
  }
}

function sortedObject(map) {
  return Object.fromEntries([...map].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])));
}

console.log(JSON.stringify({
  supported: [...classCounts.values()].reduce((sum, value) => sum + value, 0),
  supportedByClass: sortedObject(classCounts),
  supportedOperations: sortedObject(operationCounts),
  supportedKeywords: sortedObject(keywordCounts),
  deferredByReason: sortedObject(reasonCounts),
  deferredByIndividuallyMissingLines: sortedObject(missingLineCardCounts),
  topSingleMissingLines: [...singleMissingLineCounts]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 250)
    .map(([template, count]) => ({ count, template })),
  topSingleMissingPrefixes: [...singleMissingPrefixCounts]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 250)
    .map(([template, count]) => ({ count, template })),
  topSingleMissingActionPrefixes: [...singleMissingActionPrefixCounts]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 300)
    .map(([template, count]) => ({ count, template })),
  topDeferredLines: [...lineCounts]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 250)
    .map(([template, count]) => ({ count, template })),
  topDeferredCards: [...completeOracleCounts]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 150)
    .map(([template, count]) => ({ count, template })),
}, null, 2));
