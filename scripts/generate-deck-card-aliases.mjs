import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import {fileURLToPath} from 'node:url';
import {createGunzip} from 'node:zlib';
import {loadEngine} from '../tests/helpers/load-engine.mjs';

// Naming metadata only: this never creates a card or certifies gameplay.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const options = new Map(process.argv.slice(2).map(argument => {
  const match = /^--(source-file|printing-source-file)=(.+)$/.exec(argument);
  assert.ok(match, `Unknown argument: ${argument}`);
  return [match[1], match[2]];
}));
assert.ok(options.get('source-file') && options.get('printing-source-file'),
  'Usage: node scripts/generate-deck-card-aliases.mjs --source-file=oracle.jsonl.gz --printing-source-file=default.jsonl.gz');
const state = JSON.parse(fs.readFileSync(path.join(root, 'reports/oracle-import/state.json'), 'utf8'));
const source = state.source;
assert.equal(source.paperAvailability?.bulkType, 'default_cards');
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const nonDeckLayouts = new Set(['art_series', 'token', 'double_faced_token', 'emblem', 'planar', 'scheme', 'vanguard']);
const key = value => String(value || '').normalize('NFKC')
  .replace(/[\u2018\u2019\u02bc]/g, "'").replace(/[\u2013\u2014]/g, '-')
  .replace(/\s*\/{1,2}\s*/g, ' // ').replace(/\s+/g, ' ').trim().toLocaleLowerCase('en-US');
async function readBulk(file, expectedHash, consume) {
  const hash = createHash('sha256');
  const input = fs.createReadStream(path.resolve(root, file));
  input.on('data', chunk => hash.update(chunk));
  let count = 0;
  for await (const line of readline.createInterface({input: input.pipe(createGunzip()), crlfDelay: Infinity})) {
    if (!line.trim()) continue;
    consume(JSON.parse(line));
    count++;
  }
  assert.equal(hash.digest('hex'), expectedHash, `${file}: pinned source SHA-256 mismatch`);
  return count;
}

const identities = new Map();
const sourceNames = new Map(), sourceFaces = new Map();
const indexSource = (index, name, identity) => {
  const rows = index.get(name) || [];
  if (!rows.includes(identity)) rows.push(identity);
  index.set(name, rows);
};
const oracleRows = await readBulk(options.get('source-file'), source.bulkSha256, card => {
  assert.ok(card.oracle_id && !identities.has(card.oracle_id), 'Oracle IDs must be unique');
  const names = [card.name, ...(card.card_faces || []).map(face => face.name)];
  const identity = {name: card.name, oracleId: card.oracle_id,
    deckCard: !nonDeckLayouts.has(card.layout),
    commanderLegality: card.legalities?.commander || 'not_legal',
    faceNames: (card.card_faces || []).map(face => face.name),
    names: new Set(names), games: new Set(), proofs: new Map()};
  identities.set(card.oracle_id, identity);
  indexSource(sourceNames, card.name, identity);
  for (const face of card.card_faces || []) indexSource(sourceFaces, face.name, identity);
});
let printingsWithoutOracleIdentity = 0;
const printingRows = await readBulk(options.get('printing-source-file'), source.paperAvailability.bulkSha256, card => {
  const record = (oracleId, alias, field) => {
    const identity = identities.get(oracleId);
    if (!identity || !alias) return;
    identity.names.add(alias);
    (card.games || []).forEach(game => identity.games.add(game));
    const proof = {scryfallId: card.id, field, lang: card.lang, games: card.games || []};
    const previous = identity.proofs.get(alias);
    if (!previous || compare(proof.scryfallId, previous.scryfallId) < 0) identity.proofs.set(alias, proof);
  };
  if (card.oracle_id) {
    if (!identities.has(card.oracle_id)) printingsWithoutOracleIdentity++;
    for (const object of [card, ...(card.card_faces || [])]) {
      for (const field of ['name', 'flavor_name', 'printed_name']) record(card.oracle_id, object[field], field);
    }
    if (card.card_faces?.length === 2) {
      for (const field of ['flavor_name', 'printed_name']) {
        if (card.card_faces.some(face => face[field]))
          record(card.oracle_id, card.card_faces.map(face => face[field] || face.name).join(' // '), `card_faces.${field}`);
      }
    }
  } else {
    for (const face of card.card_faces || []) {
      if (!identities.has(face.oracle_id)) printingsWithoutOracleIdentity++;
      for (const field of ['name', 'flavor_name', 'printed_name']) record(face.oracle_id, face[field], `card_faces.${field}`);
    }
  }
});

const MTG = loadEngine();
const runtime = new Map();
const nativeSource = name => {
  // Art cards and tokens can share a printed canonical name with a playable
  // card. Match the existing catalog's paper Commander universe first.
  const playable = rows => rows?.filter(row => row.commanderLegality === 'legal' && row.games.has('paper'));
  for (const rows of [playable(sourceNames.get(name)), playable(sourceFaces.get(name)), sourceNames.get(name), sourceFaces.get(name)]) {
    if (rows?.length) return rows.length === 1 ? rows[0] : null;
  }
  return null;
};
for (const entry of Object.values(MTG.CARD_CATALOG)) {
  // Names must match a complete, exact source name; ambiguous names are not
  // accepted for native definitions without stored IDs.
  const identity = entry.oracleId ? identities.get(entry.oracleId) : nativeSource(entry.name);
  if (!identity) continue;
  const entries = runtime.get(identity.oracleId) || [];
  entries.push(entry);
  runtime.set(identity.oracleId, entries);
}
const cards = [], unavailable = [], evidence = [];
for (const identity of [...identities.values()].sort((a, b) => compare(a.name, b.name))) {
  const entries = runtime.get(identity.oracleId);
  if (!entries?.length) {
    unavailable.push({name: identity.name, oracleId: identity.oracleId,
      ...(!identity.deckCard ? {deckCard: false} : {}),
      commanderLegality: identity.commanderLegality, games: [...identity.games].sort(compare),
      aliases: [...identity.names].filter(name => name !== identity.name).sort(compare)});
    continue;
  }
  const entry = entries.find(entry => entry.name === identity.name)
    || entries.find(entry => entry.name === identity.faceNames[0])
    || entries.sort((a, b) => compare(a.name, b.name))[0];
  const aliases = [...new Set([...identity.names, ...entries.map(entry => entry.name)])]
    .filter(name => key(name) !== key(entry.name)).sort(compare);
  if (!aliases.length) continue;
  const nativeIdentities = entries.filter(entry => !entry.oracleId)
    .map(entry => ({name: entry.name, manaCost: entry.manaCost, typeLine: entry.typeLine}));
  cards.push({name: entry.name, oracleId: identity.oracleId, aliases,
    ...(entries.length > 1 ? {runtimeNames: entries.map(entry => entry.name).sort(compare)} : {}),
    ...(nativeIdentities.length ? {nativeIdentities} : {})});
  for (const alias of aliases) evidence.push({name: entry.name, oracleId: identity.oracleId, alias,
    ...(identity.proofs.get(alias) || {field: 'oracle_cards.name'})});
}
const aliasIdentities = new Map();
for (const row of [...cards, ...unavailable.filter(row => row.deckCard !== false)]) for (const alias of row.aliases) {
  const ids = aliasIdentities.get(key(alias)) || new Set();
  ids.add(row.oracleId);
  aliasIdentities.set(key(alias), ids);
}
// Unavailable standalone names can collide with an available split/adventure
// face or flavor title (for example Ancestral Recall). Do not choose a card
// merely because only one of those proven identities has gameplay support.
for (const row of unavailable.filter(row => row.deckCard !== false)) {
  const ids = aliasIdentities.get(key(row.name));
  if (ids) ids.add(row.oracleId);
}
const collisions = [...aliasIdentities].filter(([, ids]) => ids.size > 1)
  .map(([alias, ids]) => ({alias, oracleIds: [...ids].sort(compare)})).sort((a, b) => compare(a.alias, b.alias));
const provenance = {provider: 'Scryfall', oracle: {bulkId: source.bulkId, updatedAt: source.bulkUpdatedAt, sha256: source.bulkSha256},
  printings: {bulkId: source.paperAvailability.bulkId, updatedAt: source.paperAvailability.bulkUpdatedAt, sha256: source.paperAvailability.bulkSha256},
  scope: 'Every name field present in all pinned default_cards rows, regardless of their language or paper/Arena/MTGO game; this selected-printing bulk is not the exhaustive all_cards feed. Names are joined only by proven Oracle identity.'};
const counts = {oracleRows, printingRows, printingsWithoutOracleIdentity, representedOracleIds: runtime.size,
  runtimeCardsWithAliases: cards.length, runtimeAliasNames: cards.reduce((n, row) => n + row.aliases.length, 0),
  identitiesWithMultipleRuntimeNames: cards.filter(row => row.runtimeNames).length,
  unavailableOracleIds: unavailable.length, ambiguousAliasKeys: collisions.length};
const generated = {schemaVersion: 1, source: provenance, counts, cards, unavailable};
const js = "// Generated by scripts/generate-deck-card-aliases.mjs; naming metadata grants no gameplay support.\n'use strict';\nvar MTG = globalThis.MTG || (globalThis.MTG = {});\nMTG.DECK_CARD_ALIASES = " + JSON.stringify(generated, null, 2) + ';\n';
fs.writeFileSync(path.join(root, 'src/modules/deck-card-aliases.js'), js);
fs.mkdirSync(path.join(root, 'reports/deck-import'), {recursive: true});
fs.writeFileSync(path.join(root, 'reports/deck-import/name-aliases-2026-10-09.json'), JSON.stringify({schemaVersion: 1, source: provenance, counts, collisions, evidence}, null, 2) + '\n');
console.log(JSON.stringify(counts, null, 2));
