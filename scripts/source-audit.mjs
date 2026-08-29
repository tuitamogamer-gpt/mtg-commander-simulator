import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = path.join(root, 'index.html');
const appPath = path.join(root, 'src', 'app.js');
const dataPath = path.join(root, 'src', 'data.js');
const oracleImportDir = path.join(root, 'reports', 'oracle-import');
export const EXCLUDED_DECKS = new Set(['Blame Game']);

function readOracleBatchReports() {
  if (!fs.existsSync(oracleImportDir)) return [];
  return fs.readdirSync(oracleImportDir)
    .filter(name => name.endsWith('.json'))
    .sort()
    .map(name => JSON.parse(fs.readFileSync(path.join(oracleImportDir, name), 'utf8')))
    .map(report => report && report.batch && Array.isArray(report.batch.cards) ? report.batch : report)
    .filter(batch => batch && batch.id && Array.isArray(batch.cards));
}

function readAppModules() {
  if (!fs.existsSync(appPath)) return null;
  const entry = fs.readFileSync(appPath, 'utf8');
  const imports = [...entry.matchAll(/import ['"](.+?)['"];?/g)].map(match => match[1]);
  if (!imports.length) return entry;
  return imports.map(specifier => fs.readFileSync(path.resolve(path.dirname(appPath), specifier), 'utf8')).join('\n');
}

export function readSource() {
  if (fs.existsSync(appPath) && fs.existsSync(dataPath)) {
    return `${readAppModules()}\n${fs.readFileSync(dataPath, 'utf8')}`;
  }
  return fs.readFileSync(indexPath, 'utf8');
}

export function extractMainScript(source = readSource()) {
  if (fs.existsSync(appPath)) return readAppModules();
  const matches = [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
  if (!matches.length) throw new Error('index.html nema inline script.');
  return matches.map(match => match[1]).join('\n');
}

export function extractRawData(source = readSource()) {
  const marker = 'MTG.RAW_DATA = ';
  const start = source.indexOf(marker);
  const htmlEnd = source.indexOf(';\n</script>', start);
  const end = htmlEnd >= 0 ? htmlEnd : source.lastIndexOf(';');
  if (start < 0 || end < 0) throw new Error('MTG.RAW_DATA nije pronađen.');
  return JSON.parse(source.slice(start + marker.length, end));
}

function scriptAssignments(source) {
  return [...source.matchAll(/SC\[(?:'([^']+)'|"([^"]+)")\]\s*=/g)]
    .map(match => ({ name: match[1] || match[2], index: match.index }));
}

export function auditSource(source = readSource()) {
  const raw = extractRawData(source);
  const oracleBatches = readOracleBatchReports();
  const assignments = scriptAssignments(source);
  const counts = new Map();
  for (const assignment of assignments) counts.set(assignment.name, (counts.get(assignment.name) || 0) + 1);
  for (const batch of oracleBatches) {
    for (const entry of batch.cards || []) {
      const name = entry.raw && entry.raw.name;
      if (!name) continue;
      counts.set(name, (counts.get(name) || 0) + 1);
      if (!raw.cards[name]) raw.cards[name] = entry.raw;
    }
  }

  const simplified = new Set();
  for (let i = 0; i < assignments.length; i++) {
    const current = assignments[i];
    const end = assignments[i + 1]?.index ?? source.indexOf('// ===== autoscript.js', current.index);
    if (source.slice(current.index, end > current.index ? end : undefined).includes('simplified:')) simplified.add(current.name);
  }

  const allDeckRows = raw.decks.map(deck => {
    const total = deck.cards.reduce((sum, card) => sum + card.n, 0);
    const unique = new Set(deck.cards.map(card => card.name));
    const missingDefinitions = [...unique].filter(name => !raw.cards[name]);
    const simplifiedCards = [...unique].filter(name => simplified.has(name));
    return { name: deck.name, commander: deck.commander, total, unique: unique.size, missingDefinitions, simplifiedCards };
  });

  const deckRows = allDeckRows.filter(deck => !EXCLUDED_DECKS.has(deck.name));
  const activeNames = new Set(raw.decks.filter(deck => !EXCLUDED_DECKS.has(deck.name)).flatMap(deck => deck.cards.map(card => card.name)));
  const allSimplifiedCards = [...simplified].sort();
  return {
    sourceBytes: Buffer.byteLength(source),
    sourceLines: source.split('\n').length,
    rawCardCount: Object.keys(raw.cards).length,
    oracleBatches: oracleBatches.map(batch => ({
      id: batch.id,
      sequence: batch.sequence,
      count: (batch.cards || []).length,
      sourceUpdatedAt: batch.source && batch.source.bulkUpdatedAt,
    })),
    deckRows, excludedDeckRows: allDeckRows.filter(deck => EXCLUDED_DECKS.has(deck.name)),
    duplicateScripts: [...counts].filter(([, count]) => count > 1).map(([name, count]) => ({ name, count })),
    simplifiedCards: allSimplifiedCards.filter(name => activeNames.has(name)),
    inactiveSimplifiedCards: allSimplifiedCards.filter(name => !activeNames.has(name)),
    allSimplifiedCards,
  };
}
