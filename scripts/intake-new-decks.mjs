import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'src', 'data.js');
const reportPath = path.join(root, 'reports', 'new-deck-intake.json');

export const DECK_SOURCES = [
  {
    name: 'Quandrix Unlimited',
    set: 'SOC',
    commander: 'Zimone, Infinite Analyst',
    moxfield: 'https://moxfield.com/decks/gGtJmNlez06i3p6Kved35g',
    mirror: 'https://www.precondecklist.com/deck/2026-soc-quandrix2',
  },
  {
    name: 'Dance of the Elements',
    set: 'ECC',
    commander: 'Ashling, the Limitless',
    moxfield: 'https://moxfield.com/decks/6G3OF7b3iU6qH4q_6lHVBw',
    mirror: 'https://www.precondecklist.com/deck/2026-ecc-ashling',
  },
  {
    name: 'World Shaper',
    set: 'EOC',
    commander: 'Hearthhull, the Worldseed',
    moxfield: 'https://moxfield.com/decks/z4iIQoHd4ECI0GNv5H1u3g',
    mirror: 'https://www.precondecklist.com/deck/2025-eoc-worldshaper',
  },
  {
    name: 'Limit Break',
    set: 'FIC',
    commander: 'Cloud, Ex-SOLDIER',
    moxfield: 'https://moxfield.com/decks/VW_xog8_F024oGmzaJ9t7Q',
    mirror: 'https://www.precondecklist.com/deck/2025-fic-seven',
  },
  {
    name: 'Temur Roar',
    set: 'TDC',
    commander: 'Ureni of the Unwritten',
    moxfield: 'https://moxfield.com/decks/dp8QKvCr3EqGF9-qu5Zzfg',
    mirror: 'https://www.precondecklist.com/deck/2025-tdm-temur',
  },
  {
    name: 'Sultai Arisen',
    set: 'TDC',
    commander: 'Teval, the Balanced Scale',
    moxfield: 'https://moxfield.com/decks/ckpy_1FNIEiFMXqyA6NbYQ',
    mirror: 'https://www.precondecklist.com/deck/2025-tdm-sultai',
  },
  {
    name: 'Jeskai Striker',
    set: 'TDC',
    commander: 'Shiko and Narset, Unified',
    moxfield: 'https://moxfield.com/decks/90IaIz_OaUyg1oE7a2OQsw',
    mirror: 'https://www.precondecklist.com/deck/2025-tdm-jeskai',
  },
];

const SECTION_NAMES = {
  commander: 'Commander',
  commanders: 'Commander',
  creature: 'Creature',
  creatures: 'Creature',
  instant: 'Instant',
  instants: 'Instant',
  sorcery: 'Sorcery',
  sorceries: 'Sorcery',
  artifact: 'Artifact',
  artifacts: 'Artifact',
  enchantment: 'Enchantment',
  enchantments: 'Enchantment',
  land: 'Land',
  lands: 'Land',
  planeswalker: 'Planeswalker',
  planeswalkers: 'Planeswalker',
  battle: 'Battle',
  battles: 'Battle',
};

function decodeHtml(value) {
  return value
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

export function parsePreconHtml(html) {
  const tokens = [...html.matchAll(
    /<div class="deckheader">\s*([^<]+?)\s*-\s*\d+\s*<\/div>|<li class="cardname">\s*<a\b[^>]*>([\s\S]*?)<\/a>/gi,
  )];
  let section = null;
  const cards = [];
  for (const token of tokens) {
    if (token[1]) {
      section = SECTION_NAMES[decodeHtml(token[1]).toLowerCase()] || null;
      continue;
    }
    if (!section || !token[2]) continue;
    let name = decodeHtml(token[2]);
    let n = 1;
    const quantity = /\s+x(\d+)$/i.exec(name);
    if (quantity) {
      n = Number(quantity[1]);
      name = name.slice(0, quantity.index).trim();
    }
    cards.push({ n, name, sec: section });
  }
  return cards;
}

function loadRawData() {
  const sandbox = {};
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(fs.readFileSync(sourcePath, 'utf8'), { filename: sourcePath }).runInContext(sandbox);
  return sandbox.MTG.RAW_DATA;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'user-agent': 'MTG Commander Simulator deck certification/1.0',
    },
  });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}

export async function buildIntake() {
  const raw = loadRawData();
  const existingNames = new Set(Object.keys(raw.cards));
  const seen = new Set();
  const decks = [];
  for (const source of DECK_SOURCES) {
    const cards = parsePreconHtml(await fetchText(source.mirror));
    const total = cards.reduce((sum, card) => sum + card.n, 0);
    if (total !== 100) throw new Error(`${source.name}: parsed ${total}, expected 100`);
    if (!cards.some(card => card.name === source.commander)) {
      throw new Error(`${source.name}: selected Moxfield commander ${source.commander} is absent`);
    }
    const unique = [...new Set(cards.map(card => card.name))];
    const missing = unique.filter(name => !existingNames.has(name));
    missing.forEach(name => seen.add(name));
    decks.push({ ...source, total, unique: unique.length, missing: missing.length, cards, missingNames: missing });
  }
  return {
    generatedAt: new Date().toISOString(),
    baseline: { decks: raw.decks.length - 1, rawCards: Object.keys(raw.cards).length },
    totals: {
      decks: decks.length,
      occurrences: decks.reduce((sum, deck) => sum + deck.total, 0),
      deckUniqueChecks: decks.reduce((sum, deck) => sum + deck.unique, 0),
      newUniqueCards: seen.size,
    },
    decks,
    newUniqueNames: [...seen].sort((a, b) => a.localeCompare(b)),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = await buildIntake();
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Decks: ${report.totals.decks}`);
  console.log(`Occurrences: ${report.totals.occurrences}`);
  console.log(`Deck-unique checks: ${report.totals.deckUniqueChecks}`);
  console.log(`New unique cards: ${report.totals.newUniqueCards}`);
  for (const deck of report.decks) {
    console.log(`${deck.name}: ${deck.total} cards, ${deck.unique} unique, ${deck.missing} new`);
  }
  console.log(`Wrote ${path.relative(root, reportPath)}`);
}
