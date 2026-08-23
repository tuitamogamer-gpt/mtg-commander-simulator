import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataPath = path.join(root, 'src', 'data.js');
const intakePath = path.join(root, 'reports', 'new-deck-intake.json');
const oraclePath = path.join(root, 'reports', 'new-deck-oracle.json');

function loadRawData() {
  const sandbox = {};
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(fs.readFileSync(dataPath, 'utf8'), { filename: dataPath }).runInContext(sandbox);
  return structuredClone(sandbox.MTG.RAW_DATA);
}

const raw = loadRawData();
const intake = JSON.parse(fs.readFileSync(intakePath, 'utf8'));
const oracle = JSON.parse(fs.readFileSync(oraclePath, 'utf8'));
if (oracle.notFound.length || oracle.found !== intake.totals.newUniqueCards) {
  throw new Error(`Oracle report incomplete: ${oracle.found}/${intake.totals.newUniqueCards}`);
}

const oracleByName = new Map(oracle.cards.map(card => [card.requestedName, card]));
let cardsAdded = 0;
for (const name of intake.newUniqueNames) {
  if (raw.cards[name]) continue;
  const row = oracleByName.get(name);
  if (!row) throw new Error(`Missing Oracle row: ${name}`);
  raw.cards[name] = row.raw;
  cardsAdded++;
}

let decksAdded = 0;
for (const deck of intake.decks) {
  const existing = raw.decks.find(candidate => candidate.name === deck.name);
  const next = {
    cards: deck.cards,
    name: deck.name,
    set: deck.set,
    commander: deck.commander,
  };
  if (existing) {
    if (JSON.stringify(existing) !== JSON.stringify(next)) throw new Error(`Deck already exists with different data: ${deck.name}`);
    continue;
  }
  raw.decks.push(next);
  decksAdded++;
}

const missing = raw.decks.flatMap(deck => deck.cards.filter(card => !raw.cards[card.name]).map(card => `${deck.name}: ${card.name}`));
if (missing.length) throw new Error(`Missing raw definitions:\n${missing.join('\n')}`);
for (const deck of intake.decks) {
  const total = deck.cards.reduce((sum, card) => sum + card.n, 0);
  if (total !== 100) throw new Error(`${deck.name}: ${total}/100 cards`);
}

const output = `'use strict';\nvar MTG = globalThis.MTG || (globalThis.MTG = {});\nMTG.RAW_DATA = ${JSON.stringify(raw)};\n`;
fs.writeFileSync(dataPath, output);
console.log(`Added raw cards: ${cardsAdded}`);
console.log(`Added decks: ${decksAdded}`);
console.log(`Raw cards: ${Object.keys(raw.cards).length}`);
console.log(`Raw decks: ${raw.decks.length}`);
