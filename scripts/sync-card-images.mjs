import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadEngine } from '../tests/helpers/load-engine.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cardsDir = path.join(root, 'assets', 'cards');
const artDir = path.join(cardsDir, 'art');
const manifestPath = path.join(root, 'src', 'card-images.js');
const force = process.argv.includes('--force');
const API_HEADERS = {
  Accept: 'application/json;q=0.9,*/*;q=0.8',
  'User-Agent': 'MTGCommanderSimulator/0.1 (local card image sync)',
};

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const faceName = name => String(name || '').split(' // ')[0];
const keyFor = value => String(value || '').normalize('NFKD').toLowerCase();
const sortedObject = map => Object.fromEntries([...map].sort(([a], [b]) => a.localeCompare(b)));

function slug(name) {
  const readable = String(name).normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 72) || 'card';
  const hash = crypto.createHash('sha256').update(String(name)).digest('hex').slice(0, 10);
  return `${readable}-${hash}.webp`;
}

function aliases(card) {
  return [card && card.name, ...(card && card.card_faces || []).map(face => face.name)]
    .filter(Boolean).flatMap(name => [name, faceName(name)]);
}

function imageURI(card, variant) {
  return card && card.image_uris && card.image_uris[variant]
    || card && card.card_faces && card.card_faces[0] && card.card_faces[0].image_uris && card.card_faces[0].image_uris[variant]
    || null;
}

let lastApiRequest = 0;
async function scryfall(url, options = {}) {
  const elapsed = Date.now() - lastApiRequest;
  if (elapsed < 110) await wait(110 - elapsed);
  lastApiRequest = Date.now();
  let response;
  for (let attempt = 1; attempt <= 4; attempt++) {
    response = await fetch(url, { ...options, headers: { ...API_HEADERS, ...(options.headers || {}) } });
    if (response.ok) return response.json();
    if (response.status !== 429 && response.status < 500) break;
    await wait(400 * attempt);
  }
  const detail = response ? `${response.status} ${response.statusText}` : 'no response';
  throw new Error(`Scryfall request failed (${detail}): ${url}`);
}

async function resolveNamedCards(names) {
  const found = new Map();
  const notFound = new Set();
  const list = [...names];
  for (let offset = 0; offset < list.length; offset += 75) {
    const batch = list.slice(offset, offset + 75);
    const result = await scryfall('https://api.scryfall.com/cards/collection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifiers: batch.map(name => ({ name })) }),
    });
    const batchCards = new Map();
    for (const card of result.data || []) {
      for (const alias of aliases(card)) batchCards.set(keyFor(alias), card);
    }
    for (const name of batch) {
      const card = batchCards.get(keyFor(name));
      if (card) found.set(name, card);
      else notFound.add(name);
    }
    process.stdout.write(`\rResolved card metadata: ${Math.min(offset + batch.length, list.length)}/${list.length}`);
  }
  process.stdout.write('\n');
  return { found, notFound };
}

async function resolveTokenPrints(tokenPrints) {
  const found = new Map();
  for (const [name, print] of tokenPrints) {
    try {
      found.set(name, await scryfall(`https://api.scryfall.com/cards/${print}`));
    } catch (error) {
      process.stderr.write(`Token metadata missing for ${name} (${print}): ${error.message}\n`);
    }
  }
  return found;
}

async function runFFmpeg(args, input) {
  await new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], { stdio: ['pipe', 'ignore', 'pipe'] });
    const errors = [];
    child.stderr.on('data', chunk => errors.push(chunk));
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error(Buffer.concat(errors).toString() || `ffmpeg exited ${code}`)));
    if (input) child.stdin.end(input);
    else child.stdin.end();
  });
}

async function ensurePlaceholder() {
  const target = path.join(cardsDir, 'card-back.webp');
  if (!force && fs.existsSync(target) && fs.statSync(target).size > 100) return;
  await runFFmpeg([
    '-f', 'lavfi', '-i', 'color=c=0x0b0e12:s=488x680',
    '-vf', 'drawbox=x=16:y=16:w=456:h=648:color=0xb77835:t=4,drawbox=x=34:y=34:w=420:h=612:color=0x222a31:t=3',
    '-frames:v', '1', '-c:v', 'libwebp', '-quality', '82', '-compression_level', '6', '-y', target,
  ]);
}

async function fetchBytes(url) {
  let response;
  for (let attempt = 1; attempt <= 4; attempt++) {
    response = await fetch(url, { headers: API_HEADERS });
    if (response.ok) return Buffer.from(await response.arrayBuffer());
    if (response.status !== 429 && response.status < 500) break;
    await wait(400 * attempt);
  }
  throw new Error(`Image download failed (${response && response.status}): ${url}`);
}

async function writeWebP(source, target) {
  if (!force && fs.existsSync(target) && fs.statSync(target).size > 100) return false;
  const bytes = await fetchBytes(source);
  const temporary = `${target}.tmp.webp`;
  try {
    await runFFmpeg(['-i', 'pipe:0', '-frames:v', '1', '-c:v', 'libwebp', '-quality', '78', '-compression_level', '6', '-preset', 'picture', '-y', temporary], bytes);
    await fsp.rename(temporary, target);
  } catch (error) {
    await fsp.rm(temporary, { force: true });
    throw error;
  }
  return true;
}

async function mapPool(items, concurrency, worker) {
  let cursor = 0;
  const runners = Array.from({ length: concurrency }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

function manifestSource(cardPaths, artPaths, missing) {
  const cards = JSON.stringify(sortedObject(cardPaths), null, 2);
  const art = JSON.stringify(sortedObject(artPaths), null, 2);
  const unavailable = JSON.stringify(missing, null, 2);
  const missingComment = missing.length
    ? `// ${missing.length} flavor-name prints are resolved through Scryfall at runtime; API failures use the local card back.\n`
    : '';
  return `'use strict';\nvar MTG = globalThis.MTG || (globalThis.MTG = {});\n\n` +
    `// Generated by \u0060npm run sync:card-images\u0060. Do not edit by hand.\n` +
    `${missingComment}MTG.CARD_IMAGE_PATHS = Object.freeze(${cards});\n` +
    `MTG.CARD_ART_PATHS = Object.freeze(${art});\n` +
    `MTG.CARD_IMAGE_MISSING = Object.freeze(${unavailable});\n` +
    `MTG.CARD_IMAGE_PLACEHOLDER = './assets/cards/card-back.webp';\n\n` +
    `MTG.CARD_IMAGE_API_BASE = 'https://api.scryfall.com/cards/named';\n` +
    `MTG.CARD_IMAGE_ID_API_BASE = 'https://api.scryfall.com/cards/';\n` +
    `MTG.CARD_IMAGE_REMOTE_BASES = Object.freeze([MTG.CARD_IMAGE_API_BASE, MTG.CARD_IMAGE_ID_API_BASE]);\n` +
    `MTG.cardImageAPIURL = function (name) {\n` +
    `  return MTG.CARD_IMAGE_API_BASE + '?format=image&version=normal&fuzzy=' + encodeURIComponent(String(name || ''));\n` +
    `};\n\n` +
    `MTG.cardImageAPIURLById = function (id, variant) {\n` +
    `  const version = variant === 'art' ? 'art_crop' : 'normal';\n` +
    `  return MTG.CARD_IMAGE_ID_API_BASE + encodeURIComponent(String(id || '')) + '?format=image&version=' + version;\n` +
    `};\n\n` +
    "MTG.cardImageURL = function (name, variant) {\n" +
    "  const face = String(name || '').split(' // ')[0];\n" +
    "  const defaultToken = face.endsWith(' Token') && !MTG.CARD_CATALOG?.[face] && !MTG.DEFS?.[face];\n" +
    "  const tokenType = defaultToken ? face.slice(0, -6) : face;\n" +
    "  const imageFace = MTG.CARD_IMAGE_PATHS[face] ? face : tokenType === 'Phyrexian Germ' && !MTG.CARD_IMAGE_PATHS[tokenType] ? 'Germ' : tokenType;\n" +
    "  const local = variant === 'art'\n" +
    "    ? MTG.CARD_ART_PATHS[imageFace] || MTG.CARD_IMAGE_PATHS[imageFace]\n" +
    "    : MTG.CARD_IMAGE_PATHS[imageFace];\n" +
    "  if (local === MTG.CARD_IMAGE_PLACEHOLDER && MTG.CARD_IMAGE_MISSING.includes(face)) {\n" +
    "    return MTG.cardImageAPIURL(face);\n" +
    "  }\n" +
    "  if (local) return local;\n" +
    "  const catalog = MTG.CARD_CATALOG && MTG.CARD_CATALOG[face];\n" +
    "  if (catalog && catalog.engineBatch && catalog.scryfallId) {\n" +
    "    return MTG.cardImageAPIURLById(catalog.scryfallId, variant);\n" +
    "  }\n" +
    "  return MTG.CARD_IMAGE_PLACEHOLDER;\n" +
    "};\n";
}

async function main() {
  const MTG = loadEngine();
  const activeNames = new Set();
  const commanders = new Set();
  for (const deck of Object.values(MTG.DECKS)) {
    commanders.add(faceName(deck.commander));
    activeNames.add(faceName(deck.commander));
    for (const card of deck.cards || []) activeNames.add(faceName(card.name));
  }
  const tokenNames = new Set(Object.values(MTG.TOKENS || {}).map(token => token && token.name).filter(Boolean).map(faceName));
  const tokenPrints = new Map(Object.entries(MTG.TOKEN_IMG || {}).filter(([name]) => tokenNames.has(name)));
  const names = new Set([...activeNames, ...tokenNames]);
  const namedLookups = new Set([...names].filter(name => !tokenPrints.has(name)));

  await fsp.mkdir(artDir, { recursive: true });
  await ensurePlaceholder();
  console.log(`Inventory: ${activeNames.size} cards, ${tokenNames.size} token names, ${commanders.size} commander crops.`);

  const { found: namedCards, notFound } = await resolveNamedCards(namedLookups);
  const tokenCards = await resolveTokenPrints(tokenPrints);
  const resolved = new Map(namedCards);
  for (const [name, card] of tokenCards) resolved.set(name, card);
  const missing = [...names].filter(name => !resolved.has(name) || !imageURI(resolved.get(name), 'normal')).sort();
  const cardPaths = new Map();
  const artPaths = new Map();
  const jobs = [];

  for (const name of [...names].sort()) {
    const card = resolved.get(name);
    const source = imageURI(card, 'normal');
    if (!source) {
      cardPaths.set(name, './assets/cards/card-back.webp');
      continue;
    }
    const filename = slug(name);
    cardPaths.set(name, `./assets/cards/${filename}`);
    jobs.push({ name, source, target: path.join(cardsDir, filename) });
  }
  for (const name of [...commanders].sort()) {
    const card = resolved.get(name);
    const source = imageURI(card, 'art_crop') || imageURI(card, 'normal');
    if (!source) {
      artPaths.set(name, cardPaths.get(name) || './assets/cards/card-back.webp');
      continue;
    }
    const filename = slug(name);
    artPaths.set(name, `./assets/cards/art/${filename}`);
    jobs.push({ name: `${name} art`, source, target: path.join(artDir, filename) });
  }

  let completed = 0;
  let downloaded = 0;
  const failures = [];
  await mapPool(jobs, 6, async job => {
    try {
      if (await writeWebP(job.source, job.target)) downloaded++;
    } catch (error) {
      failures.push(`${job.name}: ${error.message}`);
      const isArt = job.target.startsWith(`${artDir}${path.sep}`);
      if (isArt) artPaths.set(job.name.replace(/ art$/, ''), cardPaths.get(job.name.replace(/ art$/, '')) || './assets/cards/card-back.webp');
      else cardPaths.set(job.name, './assets/cards/card-back.webp');
    }
    completed++;
    if (completed % 25 === 0 || completed === jobs.length) {
      process.stdout.write(`\rProcessed WebP assets: ${completed}/${jobs.length} (${downloaded} downloaded)`);
    }
  });
  process.stdout.write('\n');

  await fsp.writeFile(manifestPath, manifestSource(cardPaths, artPaths, [...new Set([...missing, ...failures.map(line => line.split(':')[0])])].sort()));
  console.log(`Manifest: ${cardPaths.size} card/token paths, ${artPaths.size} art paths.`);
  if (notFound.size || missing.length) console.log(`Unavailable names (${missing.length}): ${missing.join(', ') || 'none'}`);
  if (failures.length) {
    console.error(`Failed conversions (${failures.length}):\n${failures.join('\n')}`);
    process.exitCode = 1;
  }
}

await main();
