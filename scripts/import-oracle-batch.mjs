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
const SEMANTIC_COMPILER_VERSION = 3;
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
const GRANTABLE_KEYWORDS = new Set([
  'flying', 'first strike', 'double strike', 'deathtouch', 'lifelink', 'trample',
  'haste', 'vigilance', 'menace', 'reach', 'indestructible', 'hexproof', 'shroud',
  'wither',
]);
const MANA_SEQUENCE = '(?:\\{(?:\\d+|X|[WUBRGC]|[WUBRG]\\/P|[WUBRG]\\/[WUBRG]|2\\/[WUBRG])\\})+';

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

function keywordList(value, allowed = GRANTABLE_KEYWORDS) {
  const normalized = String(value || '').trim().toLowerCase()
    .replace(/,?\s+and\s+/g, ',')
    .split(/\s*,\s*/)
    .map(part => part.trim())
    .filter(Boolean);
  return normalized.length && normalized.every(keyword => allowed.has(keyword)) ? normalized : null;
}

function validManaSequence(value) {
  const source = String(value || '');
  return new RegExp(`^${MANA_SEQUENCE}$`).test(source) && validateManaCost(source);
}

function numberWord(value) {
  return ({ a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 }[String(value).toLowerCase()] || Number(value) || 0);
}

function parseManaLine(line) {
  const match = new RegExp(`^(?:(${MANA_SEQUENCE}), )?\\{T\\}: Add (.+)\\.$`, 'i').exec(line);
  if (!match) return null;
  const activationMana = match[1] || null;
  if (activationMana && !validManaSequence(activationMana)) return null;
  if (/^one mana of any color$/i.test(match[2])) {
    return {
      kind: 'mana-source',
      produce: [{ ANY: true, n: 1 }],
      activationMana,
      contract: 'mana-source',
    };
  }
  const produce = [];
  for (const choice of match[2].split(/\s+or\s+/i)) {
    const symbols = [...choice.matchAll(/\{([WUBRGC])\}/g)].map(entry => entry[1]);
    if (!symbols.length || choice.replace(/\{[WUBRGC]\}/g, '').trim()) return null;
    const option = {};
    for (const symbol of symbols) option[symbol] = (option[symbol] || 0) + 1;
    produce.push(option);
  }
  return produce.length ? { kind: 'mana-source', produce, activationMana, contract: 'mana-source' } : null;
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

function cyclingOperation(line) {
  const match = new RegExp(`^Cycling (${MANA_SEQUENCE})$`, 'i').exec(line);
  if (!match || !validManaSequence(match[1])) return null;
  return { kind: 'cycling', cost: match[1], contract: 'cycling-ability' };
}

function spellModifierOperation(card, line) {
  const cycling = cyclingOperation(line);
  if (cycling) return cycling;

  let match = new RegExp(`^Flashback (${MANA_SEQUENCE})$`, 'i').exec(line);
  if (match && validManaSequence(match[1])) {
    return {
      kind: 'mechanic-flashback',
      cost: match[1],
      speed: String(card.type_line || '').includes('Instant') ? 'instant' : 'sorcery',
      contract: 'mechanic-flashback',
    };
  }
  match = new RegExp(`^Suspend (\\d+)[—-](${MANA_SEQUENCE})$`, 'i').exec(line);
  if (match && Number(match[1]) > 0 && validManaSequence(match[2])) {
    return {
      kind: 'mechanic-suspend', n: Number(match[1]), cost: match[2],
      contract: 'mechanic-suspend',
    };
  }
  if (/^Rebound$/i.test(line)) return { kind: 'mechanic-rebound', contract: 'mechanic-rebound' };
  if (/^Devoid$/i.test(line)) return { kind: 'mechanic-devoid', contract: 'mechanic-devoid' };
  if (/^This spell can't be countered\.$/i.test(line)) {
    return { kind: 'mechanic-uncounterable', contract: 'mechanic-uncounterable' };
  }
  if (/^(Convoke|Cascade|Storm)$/i.test(line)) {
    const mechanic = line.toLowerCase();
    return { kind: 'mechanic-' + mechanic, contract: 'mechanic-' + mechanic };
  }
  return null;
}

function protectionOperation(line) {
  const match = /^(?:This creature has )?Protection from (white|blue|black|red|green|artifacts)$/i.exec(line);
  if (!match) return null;
  return { kind: 'protection-from', from: match[1].toLowerCase(), contract: 'protection-static' };
}

function faceDownOperation(line) {
  const match = new RegExp(`^(Morph|Disguise) (${MANA_SEQUENCE})$`, 'i').exec(line);
  if (!match || !validManaSequence(match[2])) return null;
  const mechanic = match[1].toLowerCase();
  return {
    kind: 'mechanic-' + mechanic,
    cost: match[2],
    contract: 'mechanic-' + mechanic,
  };
}

function compositeCreatureLine(line) {
  const parts = String(line || '').split(/\s*[,;]\s*/).map(part => part.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const keywords = [];
  const operations = [];
  for (const part of parts) {
    const normalized = part.toLowerCase();
    if (IMPLEMENTED_KEYWORDS.has(normalized) || /^ward \{\d+\}$/.test(normalized)) {
      keywords.push(normalized);
      continue;
    }
    const protection = protectionOperation(part);
    if (protection) {
      operations.push(protection);
      continue;
    }
    const faceDown = faceDownOperation(part);
    if (faceDown) {
      operations.push(faceDown);
      continue;
    }
    return null;
  }
  return { keywords, operations };
}

function creatureActivatedOperation(card, line) {
  const subject = selfSubject(card, 'creature');
  let match = new RegExp(`^(${MANA_SEQUENCE}): ${subject} gets ([+-]\\d+)\\/([+-]\\d+) until end of turn\\.$`, 'i').exec(line);
  if (match && validManaSequence(match[1])) {
    return {
      kind: 'self-pump-ability',
      cost: match[1],
      power: Number(match[2]),
      toughness: Number(match[3]),
      contract: 'activated-ability-cost',
    };
  }
  match = new RegExp(`^(${MANA_SEQUENCE}): Regenerate ${subject}\\.$`, 'i').exec(line);
  if (match && validManaSequence(match[1])) {
    return { kind: 'self-regenerate-ability', cost: match[1], contract: 'activated-ability-cost' };
  }
  match = new RegExp(`^(${MANA_SEQUENCE}): ${subject} gains? (${[...GRANTABLE_KEYWORDS].map(escapeRegExp).join('|')}) until end of turn\\.$`, 'i').exec(line);
  if (match && validManaSequence(match[1])) {
    return {
      kind: 'self-keyword-ability',
      cost: match[1],
      keyword: match[2].toLowerCase(),
      contract: 'activated-ability-cost',
    };
  }
  return null;
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
    const composite = compositeCreatureLine(line);
    if (composite) {
      implementedKeywords.push(...composite.keywords);
      implementation.push(...composite.operations);
      continue;
    }
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
    const cycling = cyclingOperation(line);
    if (cycling) {
      implementation.push(cycling);
      continue;
    }
    const protection = protectionOperation(line);
    if (protection) {
      implementation.push(protection);
      continue;
    }
    const faceDown = faceDownOperation(line);
    if (faceDown) {
      implementation.push(faceDown);
      continue;
    }
    const activated = creatureActivatedOperation(card, line);
    if (activated) {
      implementation.push(activated);
      continue;
    }
    if (new RegExp('^' + subject + " can't block\\.$", 'i').test(line)) {
      implementation.push({ kind: 'cant-block', contract: 'cant-block-static' });
      continue;
    }
    if (new RegExp('^' + subject + ' enters tapped\\.$', 'i').test(line)) {
      implementation.push({ kind: 'enters-tapped', contract: 'permanent-enters-tapped' });
      continue;
    }
    if (new RegExp('^' + subject + " can't be blocked\\.$", 'i').test(line)) {
      implementation.push({ kind: 'unblockable', contract: 'unblockable-static' });
      continue;
    }
    if (new RegExp('^' + subject + ' can block only creatures with flying\\.$', 'i').test(line)) {
      implementation.push({ kind: 'flying-blocker-only', contract: 'flying-blocker-only-static' });
      continue;
    }
    if (/^(Persist|Undying|Changeling|Convoke|Cascade|Storm)$/i.test(line)) {
      const mechanic = line.toLowerCase();
      implementation.push({ kind: 'mechanic-' + mechanic, contract: 'mechanic-' + mechanic });
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
    match = new RegExp('^When ' + subject + ' enters, put a \\+1\\/\\+1 counter on (?:it|' + escapeRegExp(card.name) + ')\\.$', 'i').exec(line);
    if (match) {
      implementation.push({ kind: 'etb-counter-self', counter: '+1/+1', n: 1, contract: 'etb-counter-self' });
      continue;
    }
    match = new RegExp('^Whenever ' + subject + ' attacks, (?:it|' + escapeRegExp(card.name) + ') gets ([+-]\\d+)\\/([+-]\\d+) until end of turn\\.$', 'i').exec(line);
    if (match) {
      implementation.push({
        kind: 'attack-self-pump',
        power: Number(match[1]),
        toughness: Number(match[2]),
        contract: 'combat-trigger',
      });
      continue;
    }
    if (new RegExp('^Whenever ' + subject + ' deals combat damage to a player, draw a card\\.$', 'i').test(line)) {
      implementation.push({ kind: 'combat-damage-draw', n: 1, contract: 'combat-trigger' });
      continue;
    }
    match = new RegExp('^When ' + subject + ' enters, (you may )?discard a card\\. If you do, draw a card\\.$', 'i').exec(line);
    if (match) {
      implementation.push({
        kind: 'etb-loot', order: 'discard-draw', optional: !!match[1], contract: 'etb-loot',
      });
      continue;
    }
    if (new RegExp('^When ' + subject + ' enters, draw a card, then discard a card\\.$', 'i').test(line)) {
      implementation.push({ kind: 'etb-loot', order: 'draw-discard', optional: false, contract: 'etb-loot' });
      continue;
    }
    if (new RegExp('^When ' + subject + ' enters, create a Treasure token\\.$', 'i').test(line)) {
      implementation.push({ kind: 'etb-treasure', n: 1, contract: 'etb-treasure' });
      continue;
    }
    if (new RegExp('^When ' + subject + ' enters, each opponent discards a card\\.$', 'i').test(line)) {
      implementation.push({ kind: 'etb-each-opponent-discard', n: 1, contract: 'etb-each-opponent-discard' });
      continue;
    }
    match = new RegExp('^When ' + subject + ' dies, you gain (\\d+) life\\.$', 'i').exec(line);
    if (match) {
      implementation.push({ kind: 'dies-life-gain', n: Number(match[1]), contract: 'dies-life-gain' });
      continue;
    }
    if (new RegExp('^Whenever you cast a noncreature spell, put a \\+1\\/\\+1 counter on ' + subject + '\\.$', 'i').test(line)) {
      implementation.push({
        kind: 'noncreature-cast-counter-self', counter: '+1/+1', n: 1,
        contract: 'noncreature-cast-counter-self',
      });
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
    const cycling = cyclingOperation(line);
    if (cycling) {
      implementation.push(cycling);
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

function attachmentGrantOperation(line, prefix) {
  const subject = prefix === 'equipped' ? 'Equipped creature' : 'Enchanted (?:creature|permanent)';
  let match = new RegExp(`^${subject} gets ([+-]\\d+)\\/([+-]\\d+)(?: and has (.+))?\\.$`, 'i').exec(line);
  if (match) {
    const keywords = match[3] ? keywordList(match[3]) : [];
    if (match[3] && !keywords) return null;
    return {
      kind: 'attachment-grant',
      power: Number(match[1]),
      toughness: Number(match[2]),
      keywords,
      contract: 'attachment-continuous-effect',
    };
  }
  match = new RegExp(`^${subject} has (.+)\\.$`, 'i').exec(line);
  if (match) {
    const keywords = keywordList(match[1]);
    if (!keywords) return null;
    return {
      kind: 'attachment-grant',
      power: 0,
      toughness: 0,
      keywords,
      contract: 'attachment-continuous-effect',
    };
  }
  if (prefix === 'enchanted' && /^Enchanted creature can't attack or block\.$/i.test(line)) {
    return {
      kind: 'attachment-grant',
      power: 0,
      toughness: 0,
      keywords: [],
      cantAttack: true,
      cantBlock: true,
      contract: 'attachment-continuous-effect',
    };
  }
  if (prefix === 'enchanted' && /^Enchanted (?:creature|permanent) doesn't untap during its controller's untap step\.$/i.test(line)) {
    return {
      kind: 'attachment-grant',
      power: 0,
      toughness: 0,
      keywords: [],
      skipUntap: true,
      contract: 'attachment-continuous-effect',
    };
  }
  return null;
}

function auraTargetOperation(line) {
  const match = /^Enchant (creature you control|artifact or creature|creature|land|permanent|artifact|enchantment)$/i.exec(line);
  if (!match) return null;
  return { kind: 'aura-target', what: match[1].toLowerCase(), contract: 'aura-targeting' };
}

function equipmentSemantics(card, rulesCore) {
  if (!String(card.oracle_text || '').trim()) {
    return { semanticClass: 'permanent-template', implementedKeywords: [], implementation: [], oracleContracts: [], rulesCore: '' };
  }
  if (!rulesCore) return { reason: 'reminder-only-oracle' };
  const implementedKeywords = [];
  const implementation = [];
  for (const line of rulesCore.split('\n')) {
    const keywords = keywordLine(line);
    if (keywords) {
      implementedKeywords.push(...keywords);
      continue;
    }
    const grant = attachmentGrantOperation(line, 'equipped');
    if (grant) {
      implementation.push(grant);
      continue;
    }
    const equip = new RegExp(`^Equip (${MANA_SEQUENCE})$`, 'i').exec(line);
    if (equip && validManaSequence(equip[1])) {
      implementation.push({ kind: 'equipment-equip', cost: equip[1], contract: 'equipment-attach-ability' });
      continue;
    }
    const crew = /^Crew (\d+)$/i.exec(line);
    if (crew) {
      implementation.push({ kind: 'crew', n: Number(crew[1]), contract: 'crew-ability' });
      continue;
    }
    return { reason: 'noncreature-needs-explicit-semantics' };
  }
  return {
    semanticClass: 'equipment-template',
    implementedKeywords: [...new Set(implementedKeywords)],
    implementation,
    oracleContracts: [...new Set(implementation.map(operation => operation.contract))],
    rulesCore,
  };
}

function auraSemantics(card, rulesCore) {
  if (!rulesCore) return { reason: 'noncreature-needs-explicit-semantics' };
  const implementedKeywords = [];
  const implementation = [];
  for (const line of rulesCore.split('\n')) {
    const keywords = keywordLine(line);
    if (keywords) {
      implementedKeywords.push(...keywords);
      continue;
    }
    if (/^Convoke$/i.test(line)) {
      implementation.push({ kind: 'mechanic-convoke', contract: 'mechanic-convoke' });
      continue;
    }
    const target = auraTargetOperation(line);
    if (target) {
      implementation.push(target);
      continue;
    }
    const grant = attachmentGrantOperation(line, 'enchanted');
    if (grant) {
      implementation.push(grant);
      continue;
    }
    if (/^When this Aura enters, draw a card\.$/i.test(line)) {
      implementation.push({ kind: 'etb-draw', n: 1, contract: 'etb-draw' });
      continue;
    }
    if (/^When this Aura enters, tap enchanted creature\.$/i.test(line)) {
      implementation.push({ kind: 'aura-etb-tap', contract: 'aura-etb-tap' });
      continue;
    }
    return { reason: 'noncreature-needs-explicit-semantics' };
  }
  if (!implementation.some(operation => operation.kind === 'aura-target')) {
    return { reason: 'noncreature-needs-explicit-semantics' };
  }
  return {
    semanticClass: 'aura-template',
    implementedKeywords: [...new Set(implementedKeywords)],
    implementation,
    oracleContracts: [...new Set(implementation.map(operation => operation.contract))],
    rulesCore,
  };
}

function artifactSemantics(card, parsed, rulesCore) {
  if (parsed.subtypes.includes('Equipment')) return equipmentSemantics(card, rulesCore);
  if (!String(card.oracle_text || '').trim()) {
    return { semanticClass: 'permanent-template', implementedKeywords: [], implementation: [], oracleContracts: [], rulesCore: '' };
  }
  if (!rulesCore) return { reason: 'reminder-only-oracle' };
  const implementedKeywords = [];
  const implementation = [];
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
    const cycling = cyclingOperation(line);
    if (cycling) {
      implementation.push(cycling);
      continue;
    }
    if (/^This (?:artifact|Vehicle) enters tapped\.$/i.test(line)) {
      implementation.push({ kind: 'enters-tapped', contract: 'permanent-enters-tapped' });
      continue;
    }
    const crew = /^Crew (\d+)$/i.exec(line);
    if (crew && /^-?\d+$/.test(String(card.power)) && /^-?\d+$/.test(String(card.toughness))) {
      implementation.push({ kind: 'crew', n: Number(crew[1]), contract: 'crew-ability' });
      continue;
    }
    return { reason: 'noncreature-needs-explicit-semantics' };
  }
  return {
    semanticClass: parsed.subtypes.includes('Vehicle') ? 'vehicle-template' : 'artifact-template',
    implementedKeywords: [...new Set(implementedKeywords)],
    implementation,
    oracleContracts: [...new Set(implementation.map(operation => operation.contract))],
    rulesCore,
  };
}

function enchantmentSemantics(card, parsed, rulesCore) {
  if (parsed.subtypes.includes('Aura')) return auraSemantics(card, rulesCore);
  if (!String(card.oracle_text || '').trim()) {
    return { semanticClass: 'permanent-template', implementedKeywords: [], implementation: [], oracleContracts: [], rulesCore: '' };
  }
  if (!rulesCore) return { reason: 'reminder-only-oracle' };
  const implementedKeywords = [];
  const implementation = [];
  for (const line of rulesCore.split('\n')) {
    const keywords = keywordLine(line);
    if (keywords) {
      implementedKeywords.push(...keywords);
      continue;
    }
    let match = /^Creatures you control get ([+-]\d+)\/([+-]\d+)\.$/i.exec(line);
    if (match) {
      implementation.push({
        kind: 'controlled-creature-pump-static',
        power: Number(match[1]),
        toughness: Number(match[2]),
        contract: 'continuous-layer',
      });
      continue;
    }
    match = /^Attacking creatures you control get ([+-]\d+)\/([+-]\d+)\.$/i.exec(line);
    if (match) {
      implementation.push({
        kind: 'attacking-creature-pump-static',
        power: Number(match[1]),
        toughness: Number(match[2]),
        contract: 'continuous-layer',
      });
      continue;
    }
    if (/^All creatures have haste\.$/i.test(line)) {
      implementation.push({ kind: 'global-creature-keyword-static', keyword: 'haste', contract: 'continuous-layer' });
      continue;
    }
    return { reason: 'noncreature-needs-explicit-semantics' };
  }
  return {
    semanticClass: 'enchantment-template',
    implementedKeywords: [...new Set(implementedKeywords)],
    implementation,
    oracleContracts: [...new Set(implementation.map(operation => operation.contract))],
    rulesCore,
  };
}

function spellTokenOperation(line) {
  let match = /^Create (a|an|one|two|three|four|five|six|seven|\d+) (Treasure|Food|Clue|Blood) tokens?\.$/i.exec(line);
  if (match) {
    return {
      kind: 'spell-token',
      n: numberWord(match[1]),
      tokenKey: match[2].toLowerCase(),
      contract: 'spell-token-creation',
    };
  }
  match = /^Create (a|an|one|two|three|four|five|six|seven|\d+) (\d+)\/(\d+) (.+?) creature tokens?(?: with (.+))?\.$/i.exec(line);
  if (!match) return null;
  const descriptor = match[4].trim().split(/\s+/);
  const colors = descriptor.filter(word => COLOR_WORDS[word.toLowerCase()]).map(word => COLOR_WORDS[word.toLowerCase()]);
  const artifact = descriptor.some(word => word.toLowerCase() === 'artifact');
  const enchantment = descriptor.some(word => word.toLowerCase() === 'enchantment');
  const subtypes = descriptor.filter(word =>
    !COLOR_WORDS[word.toLowerCase()] &&
    !['and', 'colorless', 'artifact', 'enchantment'].includes(word.toLowerCase()));
  if (!subtypes.length) return null;
  const keywords = match[5] ? keywordList(match[5], TOKEN_KEYWORDS) : [];
  if (match[5] && !keywords) return null;
  return {
    kind: 'spell-token',
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
    contract: 'spell-token-creation',
  };
}

function removalDescriptor(value) {
  const normalized = String(value || '').toLowerCase();
  const direct = new Set([
    'creature or planeswalker', 'artifact or enchantment', 'nonland permanent',
    'permanent', 'creature', 'artifact', 'enchantment', 'planeswalker', 'land',
  ]);
  if (direct.has(normalized)) return { what: normalized };
  if (normalized === 'attacking creature') return { what: 'creature', attacking: true };
  if (normalized === 'blocking creature') return { what: 'creature', blocking: true };
  if (normalized === 'attacking or blocking creature') return { what: 'creature', attackingOrBlocking: true };
  if (normalized === 'tapped creature') return { what: 'creature', tapped: true };
  let match = /^creature with (power|toughness) (\d+) or (less|greater)$/.exec(normalized);
  if (match) {
    return {
      what: 'creature',
      stat: match[1],
      threshold: Number(match[2]),
      comparison: match[3],
    };
  }
  return null;
}

function spellLineOperation(card, line) {
  const source = selfSubject(card, 'spell');
  if (card.name === 'Clowning Around' && line ===
      'Create two 1/1 white Clown Robot artifact creature tokens, then roll a six-sided die. ' +
      'If the result is equal to or less than the number of Robots you control, create a 1/1 white Clown Robot artifact creature token.') {
    return {
      kind: 'spell-token-roll-threshold',
      n: 2,
      bonusN: 1,
      dieSides: 6,
      compareSubtype: 'Robot',
      token: {
        name: 'Clown Robot',
        super: [],
        types: ['Artifact', 'Creature'],
        subtypes: ['Clown', 'Robot'],
        power: '1',
        toughness: '1',
        colors: ['W'],
        keywords: [],
      },
      contract: 'spell-token-roll-threshold',
    };
  }
  let match = /^(?:You )?Draw (a|one|two|three|four|five|six|seven) cards?\.$/i.exec(line);
  if (match) return { kind: 'spell-draw', n: numberWord(match[1]), contract: 'spell-draw' };
  match = /^Draw (two|three|four|five|six|seven) cards, then discard (a|one|two|three) cards?\.$/i.exec(line);
  if (match) {
    return {
      kind: 'spell-draw-discard',
      draw: numberWord(match[1]),
      discard: numberWord(match[2]),
      contract: 'spell-draw-discard',
    };
  }
  match = /^Counter target (spell|creature spell|instant spell|sorcery spell)\.$/i.exec(line);
  if (match) {
    return { kind: 'spell-counter', spellType: match[1].toLowerCase(), contract: 'spell-counter' };
  }
  match = /^(Destroy|Exile) target (creature with (?:power|toughness) \d+ or (?:less|greater)|attacking or blocking creature|attacking creature|blocking creature|tapped creature|creature or planeswalker|artifact or enchantment|nonland permanent|permanent|creature|artifact|enchantment|planeswalker|land)\.(?: It can't be regenerated\.)?$/i.exec(line);
  if (match) {
    const descriptor = removalDescriptor(match[2]);
    if (descriptor) {
      return Object.assign({
        kind: 'spell-' + match[1].toLowerCase(),
        noRegen: /can't be regenerated/i.test(line),
        contract: 'spell-' + match[1].toLowerCase(),
      }, descriptor);
    }
  }
  match = new RegExp('^' + source +
    ' deals (\\d+|X) damage to (any target|target creature or planeswalker|target creature|target player or planeswalker|target opponent|target player|each opponent)\\.$', 'i').exec(line);
  if (match) {
    return {
      kind: 'spell-damage',
      n: match[1] === 'X' ? 'X' : Number(match[1]),
      what: match[2].toLowerCase(),
      contract: 'spell-damage',
    };
  }
  match = /^Target (attacking )?creature( you control| an opponent controls)? gets ([+-](?:\d+|X))\/([+-]\d+)(?: and gains? (.+))? until end of turn\.$/i.exec(line);
  if (match) {
    const keywords = match[5] ? keywordList(match[5]) : [];
    if (match[5] && !keywords) return null;
    const printedPower = match[3].toUpperCase();
    return {
      kind: 'spell-pump',
      power: printedPower === '+X' ? 'X' : printedPower === '-X' ? '-X' : Number(match[3]),
      toughness: Number(match[4]),
      keywords,
      controller: match[2] ? (match[2].toLowerCase().includes('you') ? 'you' : 'opponent') : 'any',
      attacking: !!match[1],
      contract: 'spell-pump',
    };
  }
  match = /^Target creature( you control)? gains? (.+) until end of turn\.$/i.exec(line);
  if (match) {
    const keywords = keywordList(match[2]);
    if (keywords) {
      return {
        kind: 'spell-pump', power: 0, toughness: 0, keywords,
        controller: match[1] ? 'you' : 'any', contract: 'spell-pump',
      };
    }
  }
  match = /^(Creatures you control|Attacking creatures) get ([+-]\d+)\/([+-]\d+)(?: and gain (.+))? until end of turn\.$/i.exec(line);
  if (match) {
    const keywords = match[4] ? keywordList(match[4]) : [];
    if (match[4] && !keywords) return null;
    return {
      kind: 'spell-team-pump',
      attackingOnly: /^Attacking/i.test(match[1]),
      controller: /^Creatures you control/i.test(match[1]) ? 'you' : 'any',
      power: Number(match[2]),
      toughness: Number(match[3]),
      keywords,
      contract: 'spell-team-pump',
    };
  }
  match = /^All creatures get ([+-]\d+)\/([+-]\d+) until end of turn\.$/i.exec(line);
  if (match) {
    return {
      kind: 'spell-global-pump', power: Number(match[1]), toughness: Number(match[2]),
      contract: 'spell-global-pump',
    };
  }
  match = /^You gain (\d+) life\.$/i.exec(line);
  if (match) return { kind: 'spell-life-gain', n: Number(match[1]), contract: 'spell-life-gain' };
  match = /^Return target (creature|nonland permanent|permanent) to its owner's hand\.$/i.exec(line);
  if (match) return { kind: 'spell-bounce', what: match[1].toLowerCase(), contract: 'spell-bounce' };
  match = /^Return target (creature|permanent|instant or sorcery|land) card from your graveyard to your hand\.$/i.exec(line);
  if (match) {
    return { kind: 'spell-graveyard-return', what: match[1].toLowerCase(), contract: 'graveyard-zone-change' };
  }
  match = /^Target (opponent|player) discards? (a|one|two|three) cards?\.$/i.exec(line);
  if (match) {
    return {
      kind: 'spell-discard', what: match[1].toLowerCase(), n: numberWord(match[2]), contract: 'spell-discard',
    };
  }
  match = /^Target player mills (one|two|three|four|five|six|seven|eight|nine|ten|\d+) cards?\.$/i.exec(line);
  if (match) {
    const words = { eight: 8, nine: 9, ten: 10 };
    return {
      kind: 'spell-mill', n: words[match[1].toLowerCase()] || numberWord(match[1]), contract: 'spell-mill',
    };
  }
  const token = spellTokenOperation(line);
  if (token) return token;
  match = /^Put (a|one|two|three|four|five|six|seven|\d+) \+1\/\+1 counters? on target creature( you control)?\.$/i.exec(line);
  if (match) {
    return {
      kind: 'spell-counter-on-creature', counter: '+1/+1', n: numberWord(match[1]),
      controller: match[2] ? 'you' : 'any', contract: 'spell-counter-on-permanent',
    };
  }
  if (/^Prevent all combat damage that would be dealt (?:this turn|to players this turn)\.$/i.test(line)) {
    return { kind: 'spell-fog', playersOnly: /to players/i.test(line), contract: 'spell-damage-prevention' };
  }
  match = /^(Tap|Untap) (target creature|target permanent|target land|up to two target creatures)\.$/i.exec(line);
  if (match) {
    return {
      kind: 'spell-' + match[1].toLowerCase(),
      what: match[2].toLowerCase(),
      count: /^up to two/i.test(match[2]) ? 2 : 1,
      upTo: /^up to/i.test(match[2]),
      contract: 'spell-tap-untap',
    };
  }
  match = /^(Scry|Surveil) ([1-3])\.$/i.exec(line);
  if (match) {
    return { kind: 'spell-' + match[1].toLowerCase(), n: Number(match[2]), contract: 'spell-library-selection' };
  }
  match = /^Add (one mana of any color|(?:\{[WUBRGC]\})+)\.$/i.exec(line);
  if (match) {
    if (/one mana/i.test(match[1])) return { kind: 'spell-add-mana', produce: { ANY: true, n: 1 }, contract: 'spell-add-mana' };
    const symbols = [...match[1].matchAll(/\{([WUBRGC])\}/g)].map(entry => entry[1]);
    const produce = {};
    for (const symbol of symbols) produce[symbol] = (produce[symbol] || 0) + 1;
    return { kind: 'spell-add-mana', produce, contract: 'spell-add-mana' };
  }
  match = /^Destroy all (creatures|artifacts|enchantments)\.(?: They can't be regenerated\.)?$/i.exec(line);
  if (match) {
    return {
      kind: 'spell-destroy-all', what: match[1].toLowerCase(),
      noRegen: /can't be regenerated/i.test(line), contract: 'spell-board-wipe',
    };
  }
  return null;
}

function spellOperationNeedsTarget(operation) {
  return ['spell-counter', 'spell-destroy', 'spell-exile', 'spell-damage', 'spell-pump',
    'spell-bounce', 'spell-discard', 'spell-mill', 'spell-graveyard-return',
    'spell-counter-on-creature', 'spell-tap', 'spell-untap'].includes(operation.kind) &&
    !(operation.kind === 'spell-damage' && operation.what === 'each opponent');
}

function spellSemantics(card, rulesCore) {
  if (!rulesCore) return { reason: 'spell-needs-explicit-semantics' };
  const implementation = [];
  for (const line of rulesCore.split('\n')) {
    const operation = spellLineOperation(card, line) || spellModifierOperation(card, line);
    if (!operation) return { reason: 'spell-needs-explicit-semantics' };
    implementation.push(operation);
  }
  if (implementation.filter(spellOperationNeedsTarget).length > 1) {
    return { reason: 'spell-needs-explicit-semantics' };
  }
  return {
    semanticClass: 'spell-template',
    implementedKeywords: [],
    implementation,
    oracleContracts: [...new Set(implementation.map(operation => operation.contract))],
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
  if (parsed.types.includes('Artifact')) return artifactSemantics(card, parsed, rulesCore);
  if (parsed.types.includes('Enchantment')) return enchantmentSemantics(card, parsed, rulesCore);
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
  expectedSnapshot = '',
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
  if (expectedSnapshot && expectedSnapshot !== bulk.updated_at) {
    throw new Error(
      'Scryfall Oracle snapshot is ' + bulk.updated_at + ', expected exactly ' + expectedSnapshot + '.'
    );
  }
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
  const sourceNames = new Set();
  const sourceOracleIds = new Set();
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
    if (sourceNames.has(card.name) || sourceOracleIds.has(card.oracle_id)) {
      addReason(deferredByReason, deferredExamples, 'duplicate-in-source-feed', card);
      continue;
    }
    sourceNames.add(card.name);
    sourceOracleIds.add(card.oracle_id);
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
      semanticClasses: [
        'vanilla', 'keyword-only', 'creature-template', 'land-mana-template', 'spell-template',
        'permanent-template', 'artifact-template', 'enchantment-template', 'equipment-template',
        'aura-template', 'vehicle-template',
      ],
      note: 'Every non-reminder Oracle line must exactly match a central keyword or a closed executable template. Prefix/partial autoscripting is never certification.',
      compilerVersion: SEMANTIC_COMPILER_VERSION,
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
    compilerVersion: SEMANTIC_COMPILER_VERSION,
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
    expectedSnapshot: argValue(args, 'expected-snapshot', ''),
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
