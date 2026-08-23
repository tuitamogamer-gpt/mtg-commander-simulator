import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const intakePath = path.join(root, 'reports', 'new-deck-intake.json');
const oraclePath = path.join(root, 'reports', 'new-deck-oracle.json');
const COLLECTION_URL = 'https://api.scryfall.com/cards/collection';
const BATCH_SIZE = 75;

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

function faceToRaw(face, fallbackName) {
  const parsed = parseTypeLine(face.type_line);
  const raw = {
    name: fallbackName || face.name,
    cost: face.mana_cost || '',
    super: parsed.super,
    types: parsed.types,
    subtypes: parsed.subtypes,
    oracle: face.oracle_text || '',
  };
  if (face.power !== undefined) raw.power = String(face.power);
  if (face.toughness !== undefined) raw.toughness = String(face.toughness);
  if (face.loyalty !== undefined) raw.loyalty = String(face.loyalty);
  return raw;
}

function scryfallToRaw(card, requestedName) {
  const faces = card.card_faces || [];
  const front = faces[0] || card;
  const raw = faceToRaw(front, requestedName);
  if (faces.length > 1) {
    raw.alt = faceToRaw(faces[1], faces[1].name);
    if (card.layout === 'adventure') raw.altMode = 'Adventure';
    else if (card.layout === 'split' || card.layout === 'aftermath' || card.layout === 'room') raw.altMode = 'Split';
    else if (card.layout === 'transform' || card.layout === 'modal_dfc') raw.altMode = 'Transform';
  }
  if (Array.isArray(card.color_identity)) raw._ci = card.color_identity;
  if (Array.isArray(card.produced_mana)) raw._produced = card.produced_mana;
  return raw;
}

async function fetchBatch(names) {
  const response = await fetch(COLLECTION_URL, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'user-agent': 'MTG Commander Simulator Oracle certification/1.0',
    },
    body: JSON.stringify({ identifiers: names.map(name => ({ name: name.split(' // ')[0] })) }),
  });
  if (!response.ok) throw new Error(`Scryfall collection: HTTP ${response.status} ${await response.text()}`);
  return response.json();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function fetchOracle(names) {
  const rows = [];
  const notFound = [];
  for (let index = 0; index < names.length; index += BATCH_SIZE) {
    const batch = names.slice(index, index + BATCH_SIZE);
    const payload = await fetchBatch(batch);
    const foundByExact = new Map();
    for (const card of payload.data || []) {
      foundByExact.set(card.name, card);
      for (const face of card.card_faces || []) foundByExact.set(face.name, card);
    }
    for (const name of batch) {
      const card = foundByExact.get(name) || foundByExact.get(name.split(' // ')[0]);
      if (!card) {
        notFound.push(name);
        continue;
      }
      rows.push({
        requestedName: name,
        oracleId: card.oracle_id,
        scryfallId: card.id,
        canonicalName: card.name,
        layout: card.layout,
        keywords: card.keywords || [],
        colorIdentity: card.color_identity || [],
        producedMana: card.produced_mana || [],
        raw: scryfallToRaw(card, name),
      });
    }
    if (index + BATCH_SIZE < names.length) await sleep(120);
  }
  return { rows, notFound };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const intake = JSON.parse(fs.readFileSync(intakePath, 'utf8'));
  const { rows, notFound } = await fetchOracle(intake.newUniqueNames);
  const keywordCounts = {};
  const layoutCounts = {};
  for (const row of rows) {
    layoutCounts[row.layout] = (layoutCounts[row.layout] || 0) + 1;
    for (const keyword of row.keywords) keywordCounts[keyword] = (keywordCounts[keyword] || 0) + 1;
  }
  const report = {
    generatedAt: new Date().toISOString(),
    source: COLLECTION_URL,
    requested: intake.newUniqueNames.length,
    found: rows.length,
    notFound,
    keywordCounts: Object.fromEntries(Object.entries(keywordCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
    layoutCounts: Object.fromEntries(Object.entries(layoutCounts).sort()),
    cards: rows,
  };
  fs.writeFileSync(oraclePath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Oracle cards: ${report.found}/${report.requested}`);
  console.log(`Not found: ${report.notFound.length}${report.notFound.length ? ` (${report.notFound.join(', ')})` : ''}`);
  console.log(`Layouts: ${JSON.stringify(report.layoutCounts)}`);
  console.log(`Keywords: ${JSON.stringify(report.keywordCounts)}`);
  console.log(`Wrote ${path.relative(root, oraclePath)}`);
  if (notFound.length) process.exitCode = 1;
}
