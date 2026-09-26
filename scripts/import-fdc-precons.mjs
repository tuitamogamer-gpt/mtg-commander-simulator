import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {loadEngine} from '../tests/helpers/load-engine.mjs';
import {extractRawData} from './source-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const sourceDir = path.join(root, 'reports/decks/precon-fdc-2026-09-26');
export const outputDir = path.join(root, 'output/precon-fdc-2026-09-26');
export const precons = [
  {name: 'Calling All Angels', commander: 'Giada, Font of Hope', slug: 'calling-all-angels', file: 'CallingAllAngels_FDC', moxfield: 'STCkf8pBDE-Xxi1hgsZKiQ'},
  {name: 'Keen Engineering', commander: 'Sai, Master Thopterist', slug: 'keen-engineering', file: 'KeenEngineering_FDC', moxfield: '80zkHrncgEKyre0fMIJbng'},
  {name: 'Wretched Ranks', commander: 'Ghoulcaller Gisa', slug: 'wretched-ranks', file: 'WretchedRanks_FDC', moxfield: 'EFXjDyGIrkitAxoiL2NS0g'},
  {name: 'Reign of Dragons', commander: 'Lathliss, Dragon Queen', slug: 'reign-of-dragons', file: 'ReignOfDragons_FDC', moxfield: 'tsKfnd0haUax0CLKMHWVHQ'},
  {name: 'Tramplesaurus Rex', commander: 'Ghalta, Primal Hunger', slug: 'tramplesaurus-rex', file: 'TramplesaurusRex_FDC', moxfield: 'm_jqtk3F6EOQiq1gytJFJg'},
];
const official = 'https://magic.wizards.com/en/news/announcements/foundations-commander-decklists';
const headers = {Accept: 'application/json,text/html', 'User-Agent': 'MTGCommanderSimulator/0.1 (precon import)'};
const sha = x => crypto.createHash('sha256').update(x).digest('hex');
const write = (file, x) => fs.writeFileSync(file, JSON.stringify(x, null, 2) + '\n');
const counts = cards => {
  const result = new Map();
  for (const c of cards) result.set(c.name, (result.get(c.name) || 0) + c.n);
  return JSON.stringify([...result].sort(([a], [b]) => a.localeCompare(b)));
};
async function get(url) {
  const response = await fetch(url, {headers});
  if (!response.ok) throw Error(url + ' HTTP ' + response.status);
  return response.text();
}
async function sources() {
  const html = await get(official);
  fs.writeFileSync(outputDir + '/official.html', html);
  const sections = new Map([...html.matchAll(/<deck-list\b[^>]*deck-title="([^"]+)"[^>]*>\s*<main-deck>(.*?)<\/main-deck>/gs)].map(m => [m[1], m[2]]));
  const decks = [];
  for (const row of precons) {
    const segment = sections.get(row.name);
    if (!segment) throw Error('Official list missing: ' + row.name);
    const cards = segment.trim().split(/\r?\n/).map(line => {
      const m = line.trim().match(/^(?:(\d+)\s+)?(.+)$/);
      // Wizards appends a presentation/printing identifier to some basic lands.
      return {n: Number(m[1] || 1), name: m[2].replace(/\s+\[[A-Za-z0-9_-]+\]$/, '')};
    });
    const mtgjson = 'https://mtgjson.com/api/v5/decks/' + row.file + '.json';
    const text = await get(mtgjson), json = JSON.parse(text);
    fs.writeFileSync(outputDir + '/' + row.file + '.json', text);
    const expected = [...json.data.commander, ...json.data.mainBoard].map(c => ({n: c.count, name: c.name}));
    if (cards.reduce((n, c) => n + c.n, 0) !== 100 || counts(cards) !== counts(expected)) throw Error('Wizards / MTGJSON mismatch: ' + row.name);
    if (json.data.commander.length !== 1 || json.data.commander[0].name !== row.commander) throw Error('Commander mismatch: ' + row.name);
    const exported = 'Commander\n1 ' + row.commander + '\n\nDeck\n' + cards.filter(c => c.name !== row.commander).map(c => c.n + ' ' + c.name).join('\n') + '\n';
    fs.writeFileSync(sourceDir + '/' + row.slug + '.txt', exported);
    decks.push({name: row.name, commander: row.commander, set: 'FDC', cards, source: {
      provider: 'Wizards, independently compared with MTGJSON', official, mtgjson,
      moxfield: 'https://moxfield.com/decks/' + row.moxfield,
      releaseDate: '2026-10-02', mtgjsonSnapshot: json.meta.date,
      officialHtmlSha256: sha(html), mtgjsonSha256: sha(text), export: row.slug + '.txt', sha256: sha(exported),
    }});
  }
  write(sourceDir + '/decklists.json', {retrievedOn: '2026-09-26', decks});
}
async function oracle() {
  const decks = JSON.parse(fs.readFileSync(sourceDir + '/decklists.json')).decks;
  const names = [...new Set(decks.flatMap(d => d.cards.map(c => c.name)))], all = [];
  for (let i = 0; i < names.length; i += 75) {
    const r = await fetch('https://api.scryfall.com/cards/collection', {method: 'POST', headers: {...headers, 'Content-Type': 'application/json'}, body: JSON.stringify({identifiers: names.slice(i, i + 75).map(name => ({name}))})});
    if (!r.ok) throw Error('Scryfall HTTP ' + r.status);
    const result = await r.json();
    if (result.not_found?.length) throw Error('Scryfall missing: ' + JSON.stringify(result.not_found));
    all.push(...result.data);
    await new Promise(resolve => setTimeout(resolve, 120));
  }
  write(outputDir + '/scryfall-full.json', all);
  const supers = new Set(['Legendary', 'Basic', 'Snow', 'World', 'Ongoing']);
  const cards = all.map(c => {
    if (c.layout !== 'normal' && c.layout !== 'saga') throw Error('Review layout ' + c.layout + ': ' + c.name);
    const [left, right = ''] = c.type_line.split(' — '), parts = left.split(' ');
    const raw = {name: c.name, cost: c.mana_cost || null, super: parts.filter(x => supers.has(x)), types: parts.filter(x => !supers.has(x)), subtypes: right.split(' ').filter(Boolean), oracle: c.oracle_text, _ci: c.color_identity};
    for (const stat of ['power', 'toughness', 'loyalty']) if (c[stat] !== undefined) raw[stat] = String(c[stat]);
    if (c.produced_mana) raw._produced = c.produced_mana;
    return {requestedName: c.name, oracleId: c.oracle_id, scryfallId: c.id, canonicalName: c.name, layout: c.layout, keywords: c.keywords, colorIdentity: c.color_identity, commanderLegality: c.legalities.commander, raw};
  });
  write(sourceDir + '/oracle.json', {generatedAt: new Date().toISOString(), source: 'https://api.scryfall.com/cards/collection', requested: names.length, found: cards.length, notFound: [], cards});
}
export function buildIntake(M = loadEngine()) {
  const source = JSON.parse(fs.readFileSync(sourceDir + '/decklists.json'));
  const oracle = new Map(JSON.parse(fs.readFileSync(sourceDir + '/oracle.json')).cards.map(c => [c.requestedName, c]));
  const decks = source.decks.map(row => {
    const text = fs.readFileSync(sourceDir + '/' + row.source.export, 'utf8');
    if (sha(text) !== row.source.sha256) throw Error('Export changed: ' + row.name);
    const exported = text.split(/\r?\n/).map(line => line.match(/^(\d+) (.+)$/)).filter(Boolean).map(m => ({n: Number(m[1]), name: m[2]}));
    if (counts(exported) !== counts(row.cards)) throw Error('Pinned list mismatch: ' + row.name);
    const colors = oracle.get(row.commander).colorIdentity;
    const cards = row.cards.map(c => {
      const record = oracle.get(c.name);
      if (!record) throw Error('Missing Oracle: ' + c.name);
      if (c.n > 1 && !record.raw.super.includes('Basic')) throw Error('Duplicate nonbasic: ' + c.name);
      if (!record.colorIdentity.every(k => colors.includes(k))) throw Error('Color identity: ' + c.name);
      return {...c, sec: c.name === row.commander ? 'Commander' : ['Creature', 'Planeswalker', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Land'].find(t => record.raw.types.includes(t))};
    });
    if (cards.reduce((n, c) => n + c.n, 0) !== 100) throw Error('Deck size: ' + row.name);
    return {name: row.name, set: row.set, commander: row.commander, cards, source: row.source};
  });
  const names = [...new Set(decks.flatMap(d => d.cards.map(c => c.name)))].sort();
  return {decks, names, oracle, newNames: names.filter(n => !M.DEFS[n]), reusedNames: names.filter(n => M.DEFS[n])};
}
async function main() {
  fs.mkdirSync(sourceDir, {recursive: true});
  fs.mkdirSync(outputDir, {recursive: true});
  if (process.argv.includes('--sources')) await sources();
  if (process.argv.includes('--oracle')) await oracle();
  const M = loadEngine(), i = buildIntake(M);
  const result = {retrievedOn: '2026-09-26', baselineCards: Object.keys(M.DEFS).length, baselineDecks: Object.keys(M.DECKS).length, uniqueCards: i.names.length, reusedCards: i.reusedNames.length, newCards: i.newNames.length, newNames: i.newNames,
    decks: i.decks.map(d => ({name: d.name, commander: d.commander, cards: d.cards.reduce((n, c) => n + c.n, 0)}))};
  if (process.argv.includes('--write')) {
    for (const n of i.newNames) if (!M.SCRIPTS[n] || M.SCRIPTS[n].autoScripted || M.SCRIPTS[n].simplified) throw Error('Native implementation missing: ' + n);
    const file = path.join(root, 'src/data.js'), raw = extractRawData(fs.readFileSync(file, 'utf8'));
    for (const n of i.newNames) {
      const r = i.oracle.get(n);
      raw.cards[n] = {...r.raw, _oracleId: r.oracleId, _scryfallId: r.scryfallId, _layout: r.layout, _commanderLegality: r.commanderLegality};
    }
    for (const {source, ...deck} of i.decks) {
      const old = raw.decks.find(d => d.name === deck.name);
      if (old && JSON.stringify(old) !== JSON.stringify(deck)) throw Error('Existing deck differs: ' + deck.name);
      if (!old) raw.decks.push(deck);
    }
    fs.writeFileSync(file, "'use strict';\nvar MTG = globalThis.MTG || (globalThis.MTG = {});\nMTG.RAW_DATA = " + JSON.stringify(raw) + ';\n');
    if (!fs.existsSync(sourceDir + '/intake.json')) write(sourceDir + '/intake.json', result);
  }
  write(outputDir + '/preflight.json', result);
  console.log(JSON.stringify(result, null, 2));
  if (process.argv.includes('--show-new')) for (const n of i.newNames) console.log(JSON.stringify(i.oracle.get(n).raw));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
