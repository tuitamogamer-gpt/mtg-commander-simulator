import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {loadEngine} from '../tests/helpers/load-engine.mjs';
import {extractRawData} from './source-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const sourceDir = path.join(root, 'reports/decks/precon-trc-2026-10-29');
export const outputDir = path.join(root, 'output/precon-trc-2026-10-29');
export const releaseDate = '2026-11-13';
export const retrievedOn = '2026-10-29';
export const official = 'https://magic.wizards.com/en/news/announcements/star-trek-commander-decklists';
export const precons = [
  {name: 'We Are the Borg', commander: 'The Borg Queen', slug: 'we-are-the-borg', owner: 'borg', file: 'WeAreTheBorg_TRC'},
  {name: 'Federation Fleet', commander: 'Jean-Luc Picard, Luminary', slug: 'federation-fleet', owner: 'federation', file: 'FederationFleet_TRC'},
  {name: 'Landing Party', commander: 'Commander Spock', slug: 'landing-party', owner: 'landing', file: 'LandingParty_TRC'},
  {name: 'Klingon Fury', commander: 'Worf, Defiant Commander', slug: 'klingon-fury', owner: 'klingon', file: 'KlingonFury_TRC'},
];
export const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const supers = new Set(['Legendary', 'Basic', 'Snow', 'World', 'Ongoing']);
export function cardCounts(cards) {
  const counts = new Map();
  for (const card of cards) counts.set(card.name, (counts.get(card.name) || 0) + card.n);
  return JSON.stringify([...counts].sort(([a], [b]) => a.localeCompare(b)));
}
function decode(text) {
  return text.replace(/&(amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi, (all, entity) => {
    const named = {amp: '&', quot: '"', apos: "'", lt: '<', gt: '>'};
    return named[entity] ?? String.fromCodePoint(entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1)));
  });
}
export function parseOfficialDecklists(html) {
  const sections = new Map([...html.matchAll(/<deck-list\b[^>]*deck-title="([^"]+)"[^>]*>\s*<main-deck>(.*?)<\/main-deck>/gs)].map(m => [decode(m[1]), m[2]]));
  return precons.map(row => {
    const segment = sections.get(row.name);
    if (!segment) throw Error('Official list missing: ' + row.name);
    const cards = segment.trim().split(/\r?\n/).filter(line => line.trim()).map(line => {
      const match = decode(line.trim()).match(/^(?:(\d+)\s+)?(.+)$/);
      return {n: Number(match[1] || 1), name: match[2].replace(/\s+\[[A-Za-z0-9_-]+\]$/, '')};
    });
    if (cards[0].name !== row.commander || cards[0].n !== 1) throw Error('Official commander differs: ' + row.name);
    if (cards.reduce((sum, card) => sum + card.n, 0) !== 100) throw Error('Official deck size: ' + row.name);
    return {...row, cards};
  });
}

// Python's standard-library transport respects HTTPS_PROXY in the execution
// workspace. Request bodies travel on stdin, never through a shell command.
function request(url, body) {
  const program = `import json,sys,urllib.request,urllib.error\nr=json.load(sys.stdin)\nheaders={'Accept':'application/json,text/html','User-Agent':'MTGCommanderSimulator/0.1 (precon import)'}\nbody=None\nif r.get('body') is not None:\n headers['Content-Type']='application/json'\n body=json.dumps(r['body']).encode()\ntry:\n with urllib.request.urlopen(urllib.request.Request(r['url'],data=body,headers=headers),timeout=60) as response:\n  print(json.dumps({'status':response.status,'text':response.read().decode('utf-8')}))\nexcept urllib.error.HTTPError as error:\n print(json.dumps({'status':error.code,'text':error.read().decode('utf-8',errors='replace')}))\n`;
  const result = spawnSync('python3', ['-c', program], {input: JSON.stringify({url, body}), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024});
  if (result.error || result.status !== 0) throw Error('Source transport failed: ' + (result.error?.message || result.stderr));
  return JSON.parse(result.stdout);
}
async function sources() {
  const response = request(official);
  if (response.status !== 200) throw Error('Wizards HTTP ' + response.status);
  const html = response.text;
  fs.writeFileSync(sourceDir + '/official-decklists.html', html);
  fs.writeFileSync(outputDir + '/official.html', html);
  const decks = [];
  for (const row of parseOfficialDecklists(html)) {
    const mtgjson = 'https://mtgjson.com/api/v5/decks/' + row.file + '.json';
    const independent = request(mtgjson);
    let mtgjsonSnapshot;
    if (independent.status === 200) {
      const json = JSON.parse(independent.text);
      const expected = [...json.data.commander, ...json.data.mainBoard].map(c => ({n: c.count, name: c.name}));
      if (cardCounts(row.cards) !== cardCounts(expected)) throw Error('Wizards / MTGJSON mismatch: ' + row.name);
      if (json.data.commander.length !== 1 || json.data.commander[0].name !== row.commander) throw Error('MTGJSON commander mismatch: ' + row.name);
      mtgjsonSnapshot = json.meta.date;
      fs.writeFileSync(outputDir + '/' + row.file + '.json', independent.text);
    } else if (independent.status !== 404) throw Error('MTGJSON HTTP ' + independent.status);
    const exported = 'Commander\n1 ' + row.commander + '\n\nDeck\n' + row.cards.filter(c => c.name !== row.commander).map(c => c.n + ' ' + c.name).join('\n') + '\n';
    fs.writeFileSync(sourceDir + '/' + row.slug + '.txt', exported);
    decks.push({name: row.name, commander: row.commander, set: 'TRC', cards: row.cards, source: {
      provider: independent.status === 200 ? 'Wizards, independently compared with MTGJSON' : 'Wizards of the Coast',
      official, mtgjson, mtgjsonStatus: independent.status, mtgjsonSnapshot, releaseDate,
      independentDecklistStatus: independent.status === 200 ? 'Exact names and quantities match' : 'Not available: MTGJSON returned HTTP 404',
      officialHtmlSha256: sha(html), mtgjsonSha256: independent.status === 200 ? sha(independent.text) : undefined,
      export: row.slug + '.txt', sha256: sha(exported), oracleProvider: 'Scryfall',
    }});
  }
  write(sourceDir + '/decklists.json', {retrievedOn, decks});
}
export function normalizeOracle(card) {
  if (!['normal', 'saga'].includes(card.layout)) throw Error('Unreviewed layout: ' + card.name + ' (' + card.layout + ')');
  const [left, right = ''] = card.type_line.split(' — '), parts = left.split(' ');
  const raw = {name: card.name, cost: card.mana_cost || null, super: parts.filter(x => supers.has(x)), types: parts.filter(x => !supers.has(x)), subtypes: right.split(' ').filter(Boolean), oracle: card.oracle_text, _ci: card.color_identity};
  for (const stat of ['power', 'toughness', 'loyalty']) if (card[stat] !== undefined) raw[stat] = String(card[stat]);
  if (card.produced_mana) raw._produced = card.produced_mana;
  return {requestedName: card.name, oracleId: card.oracle_id, scryfallId: card.id, canonicalName: card.name, layout: card.layout,
    keywords: card.keywords, colorIdentity: card.color_identity, commanderLegality: card.legalities.commander, releasedAt: card.released_at,
    set: card.set, setName: card.set_name, collectorNumber: card.collector_number, rarity: card.rarity,
    scryfallUri: card.scryfall_uri, oracleSource: 'https://api.scryfall.com/cards/' + card.id, imageUris: card.image_uris || {}, allParts: card.all_parts || [], raw};
}
async function oracle() {
  const names = [...new Set(read(sourceDir + '/decklists.json').decks.flatMap(deck => deck.cards.map(card => card.name)))], all = [];
  for (let index = 0; index < names.length; index += 75) {
    const response = request('https://api.scryfall.com/cards/collection', {identifiers: names.slice(index, index + 75).map(name => ({name}))});
    if (response.status !== 200) throw Error('Scryfall HTTP ' + response.status);
    const result = JSON.parse(response.text);
    if (result.not_found?.length) throw Error('Scryfall missing: ' + JSON.stringify(result.not_found));
    all.push(...result.data);
    await new Promise(resolve => setTimeout(resolve, 125));
  }
  const cards = all.map(normalizeOracle);
  if (new Set(cards.map(card => card.canonicalName)).size !== names.length || names.some(name => !cards.some(card => card.canonicalName === name))) throw Error('Scryfall names differ from official lists');
  write(outputDir + '/scryfall-full.json', all);
  write(sourceDir + '/oracle.json', {generatedAt: new Date().toISOString(), source: 'https://api.scryfall.com/cards/collection', fullResponseSha256: sha(fs.readFileSync(outputDir + '/scryfall-full.json')), requested: names.length, found: cards.length, notFound: [], cards});
}
export function buildIntake(M = loadEngine()) {
  const source = read(sourceDir + '/decklists.json'), records = read(sourceDir + '/oracle.json');
  if (records.notFound.length || records.requested !== records.found || records.found !== records.cards.length) throw Error('Incomplete Oracle source');
  const oracle = new Map(records.cards.map(card => [card.requestedName, card]));
  if (oracle.size !== records.cards.length || new Set(records.cards.map(card => card.oracleId)).size !== records.cards.length) throw Error('Duplicate Oracle identities');
  const html = fs.readFileSync(sourceDir + '/official-decklists.html', 'utf8'), published = parseOfficialDecklists(html);
  if (source.decks.length !== precons.length) throw Error('Expected all four precons');
  const decks = source.decks.map((row, index) => {
    const expected = precons[index];
    if (row.name !== expected.name || row.commander !== expected.commander || row.set !== 'TRC') throw Error('Unexpected precon identity');
    if (row.source.official !== official || row.source.releaseDate !== releaseDate || row.source.officialHtmlSha256 !== sha(html)) throw Error('Official source metadata mismatch: ' + row.name);
    if (cardCounts(row.cards) !== cardCounts(published[index].cards)) throw Error('Published deck mismatch: ' + row.name);
    const exported = fs.readFileSync(sourceDir + '/' + row.source.export, 'utf8');
    if (sha(exported) !== row.source.sha256) throw Error('Export changed: ' + row.name);
    const exportedCards = exported.split(/\r?\n/).map(line => line.match(/^(\d+) (.+)$/)).filter(Boolean).map(m => ({n: Number(m[1]), name: m[2]}));
    if (cardCounts(exportedCards) !== cardCounts(row.cards)) throw Error('Export differs: ' + row.name);
    const commander = oracle.get(row.commander);
    if (!commander) throw Error('Missing commander Oracle: ' + row.commander);
    const counts = new Map(JSON.parse(cardCounts(row.cards)));
    const cards = row.cards.map(card => {
      const record = oracle.get(card.name);
      if (!record || record.canonicalName !== card.name || record.raw.name !== card.name || !record.oracleId || !record.scryfallId) throw Error('Missing Oracle identity: ' + card.name);
      if (!Number.isInteger(card.n) || card.n < 1) throw Error('Invalid quantity: ' + card.name);
      if (counts.get(card.name) > 1 && !record.raw.super.includes('Basic')) throw Error('Singleton violation: ' + card.name);
      if (!record.colorIdentity.every(color => commander.colorIdentity.includes(color))) throw Error('Color identity violation: ' + card.name);
      if (record.commanderLegality !== 'legal' && !(record.commanderLegality === 'not_legal' && record.releasedAt === releaseDate && ['trc', 'trk'].includes(record.set))) throw Error('Unreviewed Commander legality: ' + card.name);
      const sec = card.name === row.commander ? 'Commander' : ['Creature', 'Planeswalker', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Land'].find(type => record.raw.types.includes(type));
      if (!sec) throw Error('Unreviewed card type: ' + card.name);
      return {...card, sec};
    });
    if (cards.reduce((sum, card) => sum + card.n, 0) !== 100 || counts.get(row.commander) !== 1) throw Error('Deck size or commander count: ' + row.name);
    return {name: row.name, set: row.set, commander: row.commander, releaseDate, preview: true, cards, source: row.source};
  });
  const names = [...new Set(decks.flatMap(deck => deck.cards.map(card => card.name)))].sort();
  if (names.length !== oracle.size) throw Error('Oracle source contains unrelated cards');
  return {decks, names, oracle, newNames: names.filter(name => !M.DEFS[name]), reusedNames: names.filter(name => M.DEFS[name])};
}
export function rawOracle(record) {
  return {...record.raw, _oracleId: record.oracleId, _scryfallId: record.scryfallId, _layout: record.layout,
    _commanderLegality: record.commanderLegality, _releasedAt: record.releasedAt};
}
export function preserveBaseline(raw, initial = read(sourceDir + '/intake.json')) {
  const newNames = new Set(initial.newNames), newDecks = new Set(precons.map(deck => deck.name));
  const cards = Object.fromEntries(Object.entries(raw.cards).filter(([name]) => !newNames.has(name)));
  const decks = raw.decks.filter(deck => !newDecks.has(deck.name));
  if (Object.keys(cards).length !== initial.baselineRawCards || sha(JSON.stringify(cards)) !== initial.baselineRawCardsSha256) throw Error('Existing raw cards changed');
  if (decks.length !== initial.baselineDecks || sha(JSON.stringify(decks)) !== initial.baselineDecksSha256) throw Error('Existing precons changed');
  return {cards: Object.keys(cards).length, decks: decks.length};
}
export function registerImport(raw, M, intake = buildIntake(M), initial = read(sourceDir + '/intake.json')) {
  preserveBaseline(raw, initial);
  for (const name of initial.newNames) {
    if (!M.SCRIPTS[name] || M.SCRIPTS[name].autoScripted || M.SCRIPTS[name].simplified) throw Error('Native implementation missing: ' + name);
    const expected = rawOracle(intake.oracle.get(name));
    if (raw.cards[name] && JSON.stringify(raw.cards[name]) !== JSON.stringify(expected)) throw Error('Existing imported definition differs: ' + name);
    if (!raw.cards[name]) raw.cards[name] = expected;
  }
  for (const {source, ...deck} of intake.decks) {
    const existing = raw.decks.find(row => row.name === deck.name);
    if (existing && JSON.stringify(existing) !== JSON.stringify(deck)) throw Error('Existing imported precon differs: ' + deck.name);
    if (!existing) raw.decks.push(deck);
  }
  preserveBaseline(raw, initial);
  return raw;
}
async function main() {
  fs.mkdirSync(sourceDir, {recursive: true}); fs.mkdirSync(outputDir, {recursive: true});
  if (process.argv.includes('--sources')) await sources();
  if (process.argv.includes('--oracle')) await oracle();
  const M = loadEngine(), intake = buildIntake(M), file = path.join(root, 'src/data.js'), raw = extractRawData(fs.readFileSync(file, 'utf8'));
  const result = {retrievedOn, releaseDate, status: 'preview', baselineCards: Object.keys(M.DEFS).length,
    baselineRawCards: Object.keys(raw.cards).length, baselineDecks: raw.decks.length,
    baselineRawCardsSha256: sha(JSON.stringify(raw.cards)), baselineDecksSha256: sha(JSON.stringify(raw.decks)),
    uniqueCards: intake.names.length, reusedCards: intake.reusedNames.length, newCards: intake.newNames.length, newNames: intake.newNames,
    futureCommanderCards: intake.names.filter(name => intake.oracle.get(name).commanderLegality === 'not_legal'),
    decks: intake.decks.map(deck => ({name: deck.name, commander: deck.commander, cards: deck.cards.reduce((sum, card) => sum + card.n, 0)}))};
  if (!fs.existsSync(sourceDir + '/intake.json')) {
    if (result.baselineCards !== 32136 || result.baselineDecks !== 176 || result.newCards !== 137) throw Error('Unexpected initial intake; review baseline before recording');
    write(sourceDir + '/intake.json', result);
  }
  if (process.argv.includes('--write')) {
    registerImport(raw, M, intake);
    const serialized = "'use strict';\nvar MTG = globalThis.MTG || (globalThis.MTG = {});\nMTG.RAW_DATA = " + JSON.stringify(raw) + ';\n';
    if (fs.readFileSync(file, 'utf8') !== serialized) fs.writeFileSync(file, serialized);
  }
  write(outputDir + '/preflight.json', result);
  console.log(JSON.stringify({cards: result.uniqueCards, missingDefinitions: result.newCards, precons: result.decks, releaseDate, written: process.argv.includes('--write')}, null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
