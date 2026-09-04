import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import readline from 'node:readline';
import { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { extractRawData } from './source-audit.mjs';
import { parseOracleSpellV4 } from './oracle-spell-v4.mjs';
import { extensionEffect as v5Effect, extensionLine as v5Line, characteristicOperation as v5Characteristic } from './oracle-extensions-v5.mjs';
import { extensionEffect as v6Effect, extensionLine as v6Line, characteristicOperation as v6Characteristic, extensionCost as v6Cost, modifierOperation as v6Modifier, modalOperation as v6Modal } from './oracle-extensions-v6.mjs';
import * as v7 from './oracle-extensions-v7.mjs';
import * as v8 from './oracle-extensions-v8.mjs';
import {compileFaces} from './oracle-v8-faces.mjs';
import {compileLeveler} from './oracle-v8-levels.mjs';

// Parsing is synchronous. Preserve existing v4 descriptors verbatim before
// trying the additive grammar, so an extension cannot rewrite old manifests.
let extensionsActive = 0;
let compilerParseCache = null;
function memoizedParse(kind,card,value,parse) {
  const cache=extensionsActive===8&&compilerParseCache;
  if(!cache)return parse();
  // Scope memoization to one whole-card compilation. Copy cached descriptors:
  // composing clauses remaps target indices and must never mutate another use.
  let fingerprint=cache.cards.get(card);
  if(!fingerprint){fingerprint=JSON.stringify(card);cache.cards.set(card,fingerprint);}
  const key=kind+'\0'+fingerprint+'\0'+String(value);
  if(cache.values.has(key))return structuredClone(cache.values.get(key));
  if(cache.active.has(key))return null;
  cache.active.add(key);
  try{const result=parse();cache.values.set(key,structuredClone(result));return result;}
  finally{cache.active.delete(key);}
}
const currentExtensions = () => extensionsActive === 8 ? v8 : v7;
const extensionEffect = (...args) => extensionsActive >= 7 ? currentExtensions().extensionEffect(...args) : extensionsActive === 6 ? v6Effect(...args) : extensionsActive ? v5Effect(...args) : null;
const extensionLine = (...args) => extensionsActive >= 7 ? currentExtensions().extensionLine(...args) : extensionsActive === 6 ? v6Line(...args) : extensionsActive ? v5Line(...args) : null;
const characteristicOperation = (...args) => extensionsActive >= 7 ? currentExtensions().characteristicOperation(...args,{keywordList,effect:closedGenericEffectSequence}) : extensionsActive === 6 ? v6Characteristic(...args) : v5Characteristic(...args);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(root, 'src', 'oracle-batches');
const reportDir = path.join(root, 'reports', 'oracle-import');
const statePath = path.join(reportDir, 'state.json');
const BULK_INDEX_URL = 'https://api.scryfall.com/bulk-data';
const DEFAULT_LIMIT = 100;
const SEMANTIC_COMPILER_VERSION = 8;
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
  if(extensionsActive>=6&&allowed===GRANTABLE_KEYWORDS)allowed=new Set([...IMPLEMENTED_KEYWORDS].filter(keyword=>keyword!=='prowess'));
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
  if (!match) {
    if (!extensionsActive) return null;
    const extended = /^(.+): Add (.+)\.$/.exec(line);
    if (!extended) return null;
    const cost = genericActivatedCost(extended[1]);
    if (!cost || !(cost.tap || extensionsActive>=6&&cost.sacSelf) || Object.keys(cost).some(key => !['tap','mana','life','sacSelf'].includes(key))) return null;
    const base = parseManaLine('{T}: Add ' + extended[2] + '.');
    return base ? Object.assign(base, { activationCost: cost }) : null;
  }
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
  const choices = match[2].replace(/,\s+or\s+/gi, ' or ').replace(/,\s*/g, ' or ').split(/\s+or\s+/i);
  for (const choice of choices) {
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
  if (!subtypes.length || !subtypes.every(word=>/^[A-Z][A-Za-z-]*$/.test(word))) return null;
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
  if(extensionsActive>=6){const operation=(extensionsActive>=7?currentExtensions().modifierOperation:v6Modifier)(card,line,{keywordList,effect:closedGenericEffectSequence});if(operation)return operation;}
  if(extensionsActive>=6&&/^(Delve|Improvise|Affinity for artifacts)$/.test(line)){
    const mechanic=line==='Affinity for artifacts'?'affinity-artifacts':line.toLowerCase();
    return {kind:'mechanic-'+mechanic,contract:'mechanic-'+mechanic};
  }
  if(extensionsActive&&line==='Retrace')return {kind:'mechanic-retrace',cost:card.mana_cost,contract:'mechanic-retrace'};
  const foretell=extensionsActive&&/^Foretell ((?:\{(?:\d+|[WUBRGC])\})+)$/.exec(line);
  if(foretell)return {kind:'mechanic-foretell',cost:foretell[1],contract:'mechanic-foretell'};
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

// Compiler v4 deliberately expands through a small declarative effect model
// instead of treating an Oracle prefix as implementation.  Every accepted
// line below maps the complete line to one closed runtime operation; unknown
// riders and conditions continue to fail closed.
function genericTarget(what, options = {}) {
  return Object.assign({ what, zone: 'battlefield', controller: 'any', min: 1, max: 1 }, options);
}

function genericTrigger(event, effects, options = {}) {
  return Object.assign({
    kind: 'generic-trigger', event, effects, targets: [], optional: false,
    contract: 'generic-trigger-effect',
  }, options);
}

function genericAbility(cost, effects, options = {}) {
  return Object.assign({
    kind: 'generic-ability', cost, effects, targets: [], sorceryOnly: false,
    contract: 'generic-activated-effect',
  }, options);
}

function genericStatic(scope, options = {}) {
  // A multiword creature descriptor is not one literal subtype. Keep the
  // recorded payload stable, but certify only the compound whose AND matcher
  // is covered by the runtime; unknown compound filters must fail closed.
  const descriptor = String(options.subtype || '').trim();
  if (/\s/.test(descriptor) && descriptor.toLowerCase() !== 'eldrazi spawn') return null;
  return Object.assign({
    kind: 'generic-static', scope, power: 0, toughness: 0, keywords: [],
    contract: 'generic-continuous-effect',
  }, options);
}

function expandedMechanicOperation(line) {
  const exact = {
    Myriad: 'myriad', Infect: 'infect', Exalted: 'exalted', Flanking: 'flanking',
    'Battle cry': 'battle-cry', Mentor: 'mentor', Training: 'training', Riot: 'riot',
    Unleash: 'unleash', Evolve: 'evolve', Extort: 'extort', Delve: 'delve',
    Improvise: 'improvise', 'Affinity for artifacts': 'affinity-artifacts',
    Devoid: 'devoid', "This spell can't be countered.": 'uncounterable',
  };
  if (exact[line]) {
    return { kind: 'mechanic-' + exact[line], contract: 'mechanic-' + exact[line] };
  }
  let match = /^(Afterlife|Bushido|Renown|Bloodthirst|Toxic) ([1-5])$/i.exec(line);
  if (match) {
    const mechanic = match[1].toLowerCase();
    return { kind: 'mechanic-' + mechanic, n: Number(match[2]), contract: 'mechanic-' + mechanic };
  }
  match = /^(Plains|Island|Swamp|Mountain|Forest|Basic land)cycling (\{\d+\})$/i.exec(line);
  if (match) {
    return {
      kind: 'mechanic-typecycling', subtype: match[1], cost: match[2],
      contract: 'mechanic-typecycling',
    };
  }
  return null;
}

function genericActivatedCost(value) {
  const source = String(value || '').trim();
  if (!source) return null;
  if(extensionsActive>=6){const extra=(extensionsActive>=7?currentExtensions().extensionCost:v6Cost)(source);if(extra)return extra;}
  const cost = {};
  for (const part of source.split(/,\s*/)) {
    if (part === '{T}') cost.tap = true;
    else if (validManaSequence(part)) cost.mana = part;
    else if (/^Pay (\d+) life$/i.test(part)) cost.life = Number(/^Pay (\d+) life$/i.exec(part)[1]);
    else if (/^Discard a card$/i.test(part)) cost.discard = 1;
    else if (/^Sacrifice (?:this creature|this artifact|this land)$/i.test(part)) cost.sacSelf = true;
    else if (/^Sacrifice another creature$/i.test(part)) { cost.sacCreature = true; cost.sacOther = true; }
    else if (/^Sacrifice a creature$/i.test(part)) cost.sacCreature = true;
    else if (/^Sacrifice an artifact$/i.test(part)) cost.sacWhat = 'artifact';
    else if (/^Sacrifice an enchantment$/i.test(part)) cost.sacWhat = 'enchantment';
    else if (/^Sacrifice a land$/i.test(part)) cost.sacWhat = 'land';
    else if (/^Remove a (\+1\/\+1|-1\/-1) counter from (?:this creature|this artifact)$/i.test(part)) {
      const counter = /^Remove a (\+1\/\+1|-1\/-1)/i.exec(part)[1];
      cost.rmCounter = { kind: counter, n: 1 };
    }
    else return null;
  }
  return cost;
}

const GENERIC_NUMBER = '(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+)';

function genericNumber(value) {
  const words = { eight: 8, nine: 9, ten: 10 };
  return words[String(value || '').toLowerCase()] || numberWord(value);
}

function closedGenericEffect(card, value) {
  return memoizedParse('effect',card,value,()=>closedGenericEffectCore(card,value));
}
function closedGenericEffectCore(card, value) {
  if(extensionsActive>=7&&String(value||'').trim().endsWith('"'))value=String(value).trim()+'.';
  if(extensionsActive===8){const priority=v8.resolutionCostEffect(card,value,{keywordList,effect:closedGenericEffectSequence})||v8.linkedEffect(card,value,{keywordList,effect:closedGenericEffectSequence});if(priority)return priority;}
  let text = String(value || '').trim();
  if (!text.endsWith('.')) return null;
  text = text.slice(0, -1);
  let optional = false;
  if (/^you may /i.test(text)) {
    optional = true;
    text = text.replace(/^you may /i, '');
  }
  const self = '(?:it|this (?:creature|artifact|enchantment|land|permanent)|' + escapeRegExp(card.name) + ')';
  let match = new RegExp('^(?:you )?draw (' + GENERIC_NUMBER + ') cards?$', 'i').exec(text);
  if (match) return { effects: [{ action: 'draw', who: 'you', n: genericNumber(match[1]) }], targets: [], optional };
  match = new RegExp('^(?:you )?(gain|lose) (' + GENERIC_NUMBER + ') life$', 'i').exec(text);
  if (match) return {
    effects: [{ action: match[1].toLowerCase() === 'gain' ? 'gain-life' : 'lose-life', who: 'you', n: genericNumber(match[2]) }],
    targets: [], optional,
  };
  match = new RegExp('^each opponent loses (' + GENERIC_NUMBER + ') life and you gain (' + GENERIC_NUMBER + ') life$', 'i').exec(text);
  if (match) return {
    effects: [
      { action: 'lose-life', who: 'each-opponent', n: genericNumber(match[1]) },
      { action: 'gain-life', who: 'you', n: genericNumber(match[2]) },
    ],
    targets: [], optional,
  };
  match = new RegExp('^each opponent loses (' + GENERIC_NUMBER + ') life$', 'i').exec(text);
  if (match) return {
    effects: [{ action: 'lose-life', who: 'each-opponent', n: genericNumber(match[1]) }],
    targets: [], optional,
  };
  match = new RegExp('^target opponent loses (' + GENERIC_NUMBER + ') life and you gain (' + GENERIC_NUMBER + ') life$', 'i').exec(text);
  if (match) return {
    effects: [
      { action: 'lose-life', who: 0, n: genericNumber(match[1]) },
      { action: 'gain-life', who: 'you', n: genericNumber(match[2]) },
    ],
    targets: [genericTarget('opponent', { zone: 'player' })], optional,
  };
  match = new RegExp('^each player loses (' + GENERIC_NUMBER + ') life$', 'i').exec(text);
  if (match) return {
    effects: [{ action: 'lose-life', who: 'each-player', n: genericNumber(match[1]) }],
    targets: [], optional,
  };
  match = new RegExp('^each opponent discards (' + GENERIC_NUMBER + '|a) cards?$', 'i').exec(text);
  if (match) return {
    effects: [{ action: 'discard-each-opponent', n: genericNumber(match[1]) }],
    targets: [], optional,
  };
  if (/^draw a card, then discard a card$/i.test(text)) {
    return {
      effects: [
        { action: 'draw', who: 'you', n: 1 },
        { action: 'discard', who: 'you', n: 1 },
      ],
      targets: [], optional,
    };
  }
  match = new RegExp('^' + self + ' deals (' + GENERIC_NUMBER + '|X) damage to (any target|target creature(?: or planeswalker)?|target attacking or blocking creature|target opponent|target player(?: or planeswalker)?|each opponent)$', 'i').exec(text);
  if (match) {
    const targetText = match[2].toLowerCase();
    const n = match[1].toUpperCase() === 'X' ? 'X' : genericNumber(match[1]);
    if (targetText === 'each opponent') {
      return { effects: [{ action: 'damage', target: 'each-opponent', n }], targets: [], optional };
    }
    const attackingOrBlocking = targetText.includes('attacking or blocking');
    const what = targetText.replace(/^target /, '').replace(/^attacking or blocking /, '');
    return {
      effects: [{ action: 'damage', target: 0, n }],
      targets: [genericTarget(what === 'any target' ? 'any' : what, {
        zone: what.includes('player') || what === 'any' ? 'any' : 'battlefield',
        attackingOrBlocking,
      })],
      optional,
    };
  }
  match = new RegExp('^put (' + GENERIC_NUMBER + ') (\\+1\\/\\+1|-1\\/-1) counters? on (?:' + self + ')$', 'i').exec(text);
  if (match) return {
    effects: [{ action: 'counter', target: 'self', counter: match[2], n: genericNumber(match[1]) }],
    targets: [], optional,
  };
  match = new RegExp('^put (' + GENERIC_NUMBER + ') (\\+1\\/\\+1|-1\\/-1) counters? on (another )?(?:up to one )?target creature( you control| an opponent controls)?$', 'i').exec(text);
  if (match) return {
    effects: [{ action: 'counter', target: 0, counter: match[2], n: genericNumber(match[1]) }],
    targets: [genericTarget('creature', {
      controller: match[4] ? (/you control/i.test(match[4]) ? 'you' : 'opponent') : 'any',
      excludeSelf: !!match[3],
      min: /up to one/i.test(text) ? 0 : 1,
    })],
    optional,
  };
  match = new RegExp('^put (' + GENERIC_NUMBER + ') (\\+1\\/\\+1|-1\\/-1) counters? on each (?:other )?creature you control$', 'i').exec(text);
  if (match) return {
    effects: [{
      action: 'counter-group',
      who: /each other/i.test(text) ? 'your-other-creatures' : 'your-creatures',
      counter: match[2],
      n: genericNumber(match[1]),
    }],
    targets: [], optional,
  };
  match = new RegExp('^' + self + ' gets ([+-]\\d+)\\/([+-]\\d+)(?: and gains? (.+))? until end of turn$', 'i').exec(text);
  if (match) {
    const keywords = match[3] ? keywordList(match[3]) : [];
    if (match[3] && !keywords) return null;
    return {
      effects: [{ action: 'pump', target: 'self', power: Number(match[1]), toughness: Number(match[2]), keywords }],
      targets: [], optional,
    };
  }
  match = /^target creature( you control| an opponent controls)? gets ([+-]\d+)\/([+-]\d+)(?: and gains? (.+))? until end of turn$/i.exec(text);
  if (match) {
    const keywords = match[4] ? keywordList(match[4]) : [];
    if (match[4] && !keywords) return null;
    return {
      effects: [{ action: 'pump', target: 0, power: Number(match[2]), toughness: Number(match[3]), keywords }],
      targets: [genericTarget('creature', {
        controller: match[1] ? (/you control/i.test(match[1]) ? 'you' : 'opponent') : 'any',
      })],
      optional,
    };
  }
  match = /^(creatures you control|other creatures you control|attacking creatures you control) get ([+-]\d+)\/([+-]\d+)(?: and gain (.+))? until end of turn$/i.exec(text);
  if (match) {
    const keywords = match[4] ? keywordList(match[4]) : [];
    if (match[4] && !keywords) return null;
    return {
      effects: [{
        action: 'pump-group',
        who: /^attacking/i.test(match[1]) ? 'your-attacking-creatures' :
          /^other/i.test(match[1]) ? 'your-other-creatures' : 'your-creatures',
        power: Number(match[2]), toughness: Number(match[3]), keywords,
      }],
      targets: [], optional,
    };
  }
  match = /^(scry|surveil) ([1-5])$/i.exec(text);
  if (match) return {
    effects: [{ action: match[1].toLowerCase(), who: 'you', n: Number(match[2]) }],
    targets: [], optional,
  };
  match = /^investigate(?: (twice|three times))?$/i.exec(text);
  if (match) return {
    effects: [{ action: 'investigate', who: 'you', n: match[1] === 'twice' ? 2 : match[1] ? 3 : 1 }],
    targets: [], optional,
  };
  if (/^proliferate$/i.test(text)) return { effects: [{ action: 'proliferate', who: 'you' }], targets: [], optional };
  if (/^you become the monarch$/i.test(text)) return { effects: [{ action: 'monarch', who: 'you' }], targets: [], optional };
  if (new RegExp('^' + self + ' connives$', 'i').test(text)) {
    return { effects: [{ action: 'connive', target: 'self' }], targets: [], optional };
  }
  if (new RegExp('^' + self + ' explores$', 'i').test(text)) {
    return { effects: [{ action: 'explore', target: 'self' }], targets: [], optional };
  }
  if (new RegExp('^(?:return )?' + self + " to its owner's hand$", 'i').test(text)) {
    return { effects: [{ action: 'return-source-to-hand' }], targets: [], optional };
  }
  if (new RegExp('^sacrifice ' + self + '$', 'i').test(text)) {
    return { effects: [{ action: 'sacrifice-source' }], targets: [], optional };
  }
  match = /^(destroy|exile) (?:up to one )?target (creature(?: an opponent controls)?|artifact|enchantment|artifact or enchantment|land|nonland permanent(?: an opponent controls)?|permanent)$/i.exec(text);
  if (match) {
    const controller = /opponent controls/i.test(match[2]) ? 'opponent' : 'any';
    const what = match[2].replace(/ an opponent controls/i, '').toLowerCase();
    return {
      effects: [{ action: match[1].toLowerCase(), target: 0 }],
      targets: [genericTarget(what, { controller, min: /up to one/i.test(text) ? 0 : 1 })],
      optional,
    };
  }
  match = /^return (another )?(?:up to one )?target (creature|artifact|enchantment|nonland permanent|permanent)( an opponent controls| you control)? to its owner's hand$/i.exec(text);
  if (match) return {
    effects: [{ action: 'bounce', target: 0 }],
    targets: [genericTarget(match[2].toLowerCase(), {
      controller: match[3] ? (/you control/i.test(match[3]) ? 'you' : 'opponent') : 'any',
      excludeSelf: !!match[1],
      min: /up to one/i.test(text) ? 0 : 1,
    })],
    optional,
  };
  match = /^return target (creature|artifact|instant or sorcery|permanent|land) card from your graveyard to your hand$/i.exec(text);
  if (match) return {
    effects: [{ action: 'move-to-hand', target: 0 }],
    targets: [genericTarget(match[1].toLowerCase(), { zone: 'graveyard', controller: 'you' })],
    optional,
  };
  match = /^(tap|untap) (?:up to one )?target (creature|artifact|land|permanent)( an opponent controls| you control)?$/i.exec(text);
  if (match) return {
    effects: [{ action: match[1].toLowerCase(), target: 0 }],
    targets: [genericTarget(match[2].toLowerCase(), {
      controller: match[3] ? (/you control/i.test(match[3]) ? 'you' : 'opponent') : 'any',
      min: /up to one/i.test(text) ? 0 : 1,
    })],
    optional,
  };
  match = /^target (player|opponent) (mills|discards) (a|one|two|three|four|five|six|seven|eight|nine|ten|\d+) cards?$/i.exec(text);
  if (match) return {
    effects: [{ action: match[2].toLowerCase() === 'mills' ? 'mill' : 'discard', who: 0, n: genericNumber(match[3]) }],
    targets: [genericTarget(match[1].toLowerCase(), { zone: 'player' })],
    optional,
  };
  match = /^target creature( an opponent controls)? can't block this turn$/i.exec(text);
  if (match) return {
    effects: [{ action: 'cant-block-until-eot', target: 0 }],
    targets: [genericTarget('creature', { controller: match[1] ? 'opponent' : 'any' })],
    optional,
  };
  const token = spellTokenOperation(text + '.');
  if (token && token.kind === 'spell-token') {
    return {
      effects: [token.tokenKey
        ? { action: 'token-key', who: 'you', n: token.n, tokenKey: token.tokenKey }
        : { action: 'token-inline', who: 'you', n: token.n, token: token.token }],
      targets: [], optional,
    };
  }
  return extensionEffect(card, value, { keywordList, effect: closedGenericEffectSequence });
}

function closedGenericEffectSequence(card, value) {
  return memoizedParse('sequence',card,value,()=>closedGenericEffectSequenceCore(card,value));
}
function closedGenericEffectSequenceCore(card, value) {
  if(extensionsActive>=7&&/your choice of/.test(value)){const choice=extensionEffect(card,value,{keywordList,effect:closedGenericEffectSequence});if(choice)return choice;}
  const direct = closedGenericEffect(card, value);
  const unboundContinuation=(parsed,text)=>extensionsActive===8&&parsed?.targets?.length&&/"event-(?:card|player|card-controller|card-owner)"/.test(JSON.stringify(parsed))&&/\.\s+(?:That (?:card|creature|artifact|enchantment|land|permanent|player)\b|It\b|Its\b)/.test(text);
  if (direct&&!unboundContinuation(direct,value)) return direct;
  let clauses = String(value || '').trim().split(/(?<=\.)\s+(?=[A-Z])/);
  if (clauses.length < 2) return null;
  if(extensionsActive===8){
    // Selection instructions often occupy several sentences. Consume the
    // longest complete closed block, then bind continuations between blocks.
    const blocks=[];
    for(let start=0;start<clauses.length;){
      let end=start+1;
      for(let candidate=clauses.length;candidate>start+1;candidate--){
        // Do not let a preceding multi-sentence block swallow the only
        // target-producing clause for a following pronoun. The continuation
        // must be parsed next to that clause so it can retain the locked set.
        const next=clauses[candidate];
        if(next&&/^(?:They\b|Those (?:cards|creatures|artifacts|enchantments|lands|permanents)\b|(?:Untap|Tap|Goad|Suspect) (?:them|those\b)|Put .+ on each of (?:them|those\b))/i.test(next))continue;
        const block=clauses.slice(start,candidate).join(' '),parsed=closedGenericEffect(card,block);if(parsed&&!unboundContinuation(parsed,block)){end=candidate;break;}
      }
      blocks.push(clauses.slice(start,end).join(' '));start=end;
    }
    clauses=blocks;
  }
  const merged = { effects: [], targets: [], optional: false };
  for (const rawClause of clauses) {
    const previousTarget=merged.effects.at(-1)?.target??merged.effects.at(-1)?.who;
    const previousSpec=typeof previousTarget==='number'?merged.targets[previousTarget]:null;
    // A bounded target descriptor stores its chosen objects as one locked
    // group. Printed plural continuations apply to that same group and do not
    // announce a second target set. Normalize only closed imperative forms to
    // a source-shaped clause, then reuse the existing target-reference binder.
    const pluralReference=extensionsActive===8&&previousSpec?.zone==='battlefield'&&
      ((previousSpec.max??1)>1||previousSpec.unbounded)&&/^(?:They\b|Those (?:creatures|artifacts|enchantments|lands|permanents)\b|(?:Untap|Tap|Goad|Suspect) (?:them|those (?:creatures|artifacts|enchantments|lands|permanents))\b|Put .+ on each of (?:them|those (?:creatures|artifacts|enchantments|lands|permanents))\b)/i.test(rawClause);
    const pluralClause=pluralReference?rawClause
      .replace(/^They each (get|gain) /i,(_,verb)=>'This creature '+(verb.toLowerCase()==='get'?'gets ':'gains '))
      .replace(/^They (get|gain) /i,(_,verb)=>'This creature '+(verb.toLowerCase()==='get'?'gets ':'gains '))
      .replace(/^They (can(?:not|'t)?|have|lose) /i,(_,verb)=>'This creature '+verb.toLowerCase()+' ')
      .replace(/^Those (?:creatures|artifacts|enchantments|lands|permanents) /i,'This creature ')
      .replace(/^(Untap|Tap|Goad|Suspect) (?:them|those (?:creatures|artifacts|enchantments|lands|permanents))/i,'$1 this creature')
      .replace(/^(Put .+) on each of (?:them|those (?:creatures|artifacts|enchantments|lands|permanents))(?=\.$|$)/i,'$1 on this creature'):rawClause;
    const refersToTarget=extensionsActive&&typeof previousTarget==='number'&&previousSpec?.max!==0&&(pluralReference||
      (extensionsActive===8?/\b(?:it|its|that card|that creature|that artifact|that enchantment|that land|that permanent)\b/i:extensionsActive>=7?/\b(?:it|that creature|that artifact|that enchantment|that land|that permanent)\b/i:/\b(?:it|that creature|that permanent)\b/i).test(rawClause)&&
      !/\bthis (?:creature|artifact|land|enchantment|permanent)\b/i.test(rawClause));
    const referenceClause=extensionsActive===8?pluralClause.replace(/\bthat (?:card|creature|artifact|enchantment|land|permanent)'s\b/gi,'its'):pluralClause;
    const normalizedClause=refersToTarget?referenceClause.replace(extensionsActive===8?/\bthat (?:card|creature|artifact|enchantment|land|permanent)\b/gi:extensionsActive>=7?/\bthat (?:creature|artifact|enchantment|land|permanent)\b/gi:/\bthat (?:creature|permanent)\b/gi,'it'):rawClause;
    const clause = normalizedClause.endsWith('.') ? normalizedClause : normalizedClause + '.';
    // A library selection owns its internal "that card" references. Preserve
    // that closed block and bind only its outer library owner below.
    const parsed = extensionsActive===8&&v8.libraryEffect(card,rawClause,{keywordList,effect:closedGenericEffectSequence})||closedGenericEffect(card, clause);
    if (!parsed || parsed.optional && extensionsActive<7) return null;
    if(parsed.optional){parsed.effects=[{action:'optional-payment',payment:{},effects:parsed.effects}];parsed.optional=false;}
    if(extensionsActive>=7&&typeof previousTarget==='number'){
      const previousSpec=merged.targets[previousTarget],playerTarget=['player','opponent'].includes(previousSpec?.what);
      const map=value=>extensionsActive===8&&value?.action==='install-trigger-v8'?value:Array.isArray(value)?value.map(map):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,
        ['target','who'].includes(key)&&item==='event-player'&&playerTarget?{kind:'locked-player',index:previousTarget}:
        ['target','who'].includes(key)&&['event-card-controller','event-card-owner'].includes(item)&&!playerTarget?{kind:item==='event-card-owner'?'target-owner':'target-controller',index:previousTarget}:map(item)])):value;
      parsed.effects=parsed.effects.map(map);
    }
    const previousEffect = merged.effects.at(-1);
    const followsTokenCreation = previousEffect &&
      ['token-key', 'token-inline'].includes(previousEffect.action);
    const tokenCounterReference = followsTokenCreation && new RegExp(
      '^put (' + GENERIC_NUMBER + ') (\\+1\\/\\+1|-1\\/-1) counters? on it\\.$', 'i').test(clause);
    // A pronoun after creating a token refers to that created object, not the
    // permanent whose ability is resolving.  Only this closed follow-up is
    // supported; other token-pronoun continuations must remain fail-closed.
    if (followsTokenCreation && /\bit\b/i.test(clause) && !tokenCounterReference) return null;
    const offset = merged.targets.length;
    // A binding created above already names an absolute target index, so the
    // clause offset must not be applied to it a second time.
    const boundKinds=['locked-player','target-controller','target-owner'];
    const remapValue=value=>extensionsActive===8&&value?.action==='install-trigger-v8'?value:Array.isArray(value)?value.map(remapValue):value&&typeof value==='object'?(boundKinds.includes(value.kind)?value:Object.fromEntries(Object.entries(value).map(([key,item])=>[key,['target','sourceTarget','otherTarget','who','index','conditionTarget'].includes(key)&&typeof item==='number'?item+offset:remapValue(item)]))):value;
    if(extensionsActive>=7&&offset&&/^up to one other target /i.test(clause)&&parsed.targets.length===1){delete parsed.targets[0].excludeSelf;parsed.targets[0].differentFromPrevious=true;}
    for (const effect of parsed.effects) {
      const adjusted = { ...effect };
      if(extensionsActive===8){if(adjusted.n)adjusted.n=remapValue(adjusted.n);if(adjusted.hits)adjusted.hits=remapValue(adjusted.hits);if(adjusted.payment)adjusted.payment=remapValue(adjusted.payment);}
      if(extensionsActive>=7&&refersToTarget&&/\bit deals\b/i.test(clause)&&adjusted.action==='damage'){
        if(adjusted.n?.kind!=='source-stat'||typeof adjusted.target!=='number')return null;
        adjusted.action='bite';adjusted.stat=adjusted.n.stat;adjusted.multiplier=1;
        adjusted.otherTarget=adjusted.target;adjusted.target='self';delete adjusted.n;
        if(/\b(?:another|other) target\b/.test(clause)){delete parsed.targets[adjusted.otherTarget].excludeSelf;parsed.targets[adjusted.otherTarget].differentFromPrevious=true;}
      }
      if(extensionsActive===8&&refersToTarget&&adjusted.action==='become-copy-v8'&&effect.target==='self'&&typeof effect.otherTarget==='number'&&/copy of (?:another|other) target\b/i.test(rawClause)){
        delete parsed.targets[effect.otherTarget].excludeSelf;parsed.targets[effect.otherTarget].differentFromPrevious=true;
      }
      if(refersToTarget && adjusted.target==='self') adjusted.target=previousTarget;
      if(extensionsActive===8&&refersToTarget&&adjusted.n?.kind==='source-stat')adjusted.n={...adjusted.n,kind:'target-stat',target:previousTarget};
      if(extensionsActive>=7&&refersToTarget&&adjusted.action==='conditional'&&adjusted.conditionTarget===undefined&&JSON.stringify(adjusted.condition).includes('"source-'))adjusted.conditionTarget=previousTarget;
      if (tokenCounterReference && adjusted.action === 'counter' && adjusted.target === 'self') {
        adjusted.target = 'created-tokens';
      }
      if (typeof adjusted.target === 'number' && !(refersToTarget && (effect.target==='self'||adjusted.action==='bite'&&effect.action==='damage'))) adjusted.target += offset;
      if (typeof adjusted.who === 'number') adjusted.who += offset;
      if(extensionsActive>=6){
        if(typeof adjusted.otherTarget==='number')adjusted.otherTarget+=offset;
        const remap=effect=>{
          const result={...effect};
          if(refersToTarget&&result.target==='self')result.target=previousTarget;
          else if(typeof result.target==='number')result.target+=offset;
          if(typeof result.otherTarget==='number')result.otherTarget+=offset;
          if(typeof result.conditionTarget==='number')result.conditionTarget+=offset;
          if(typeof result.who==='number')result.who+=offset;
          if(extensionsActive===8){if(result.n)result.n=remapValue(result.n);if(result.hits)result.hits=remapValue(result.hits);if(result.payment)result.payment=remapValue(result.payment);}
          if(result.effects)result.effects=result.effects.map(remap);
          if(result.elseEffects)result.elseEffects=result.elseEffects.map(remap);
          return result;
        };
        if(adjusted.effects)adjusted.effects=adjusted.effects.map(remap);
        if(adjusted.elseEffects)adjusted.elseEffects=adjusted.elseEffects.map(remap);
      }
      if(extensionsActive===8&&typeof previousTarget==='number'&&/\b(?:it|that card|that creature|that permanent)\b/i.test(rawClause)){
        const bindCopy=value=>{
          if(Array.isArray(value))return value.map(bindCopy);
          if(!value||typeof value!=='object')return value;
          if(value.action==='install-trigger-v8')return value;
          if(value.action==='become-copy-v8'&&['copy-reference','event-card'].includes(value.otherTarget))return {...value,otherTarget:{kind:'resolved-target',index:previousTarget}};
          return Object.fromEntries(Object.entries(value).map(([key,child])=>[key,bindCopy(child)]));
        };
        merged.effects.push(bindCopy(adjusted));
      }else merged.effects.push(adjusted);
    }
    merged.targets.push(...parsed.targets);
  }
  return merged;
}

function genericEventOperation(card, line) {
  const subject = selfSubject(card, 'creature');
  const patterns = [
    { event: 'etb', filter: 'self', re: new RegExp('^When ' + subject + ' enters, (.+)$', 'i') },
    { event: 'dies', filter: 'self', re: new RegExp('^When ' + subject + ' dies, (.+)$', 'i') },
    { event: 'attacks', filter: 'self', re: new RegExp('^Whenever ' + subject + ' attacks, (.+)$', 'i') },
    { event: 'combatDamageToPlayer', filter: 'self', re: new RegExp('^Whenever ' + subject + ' deals combat damage to a player, (.+)$', 'i') },
    { event: 'becomesBlocked', filter: 'self-attacker', re: new RegExp('^Whenever ' + subject + ' becomes blocked, (.+)$', 'i') },
    { event: 'blocks', filter: 'self-blocker', re: new RegExp('^Whenever ' + subject + ' blocks, (.+)$', 'i') },
    { event: 'becameTapped', filter: 'self-card', re: new RegExp('^Whenever ' + subject + ' becomes tapped, (.+)$', 'i') },
    { event: 'turnedFaceUp', filter: 'self-card', re: new RegExp('^When ' + subject + ' is turned face up, (.+)$', 'i') },
    { event: 'upkeep', filter: 'your-upkeep', re: /^At the beginning of your upkeep, (.+)$/i },
    { event: 'endStep', filter: 'your-end-step', re: /^At the beginning of your end step, (.+)$/i },
    { event: 'beginCombat', filter: 'your-combat', re: /^At the beginning of combat on your turn, (.+)$/i },
    { event: 'etb', filter: 'another-your-creature', re: /^Whenever another creature you control enters, (.+)$/i },
    { event: 'dies', filter: 'another-your-creature', re: /^Whenever another creature you control dies, (.+)$/i },
    { event: 'etb', filter: 'another-your-artifact', re: /^Whenever another artifact you control enters, (.+)$/i },
    { event: 'castNonCreature', filter: 'your-cast', re: /^Whenever you cast a noncreature spell, (.+)$/i },
    { event: 'castIS', filter: 'your-cast', re: /^Whenever you cast an instant or sorcery spell, (.+)$/i },
    { event: 'draw', filter: 'your-draw', re: /^Whenever you draw a card, (.+)$/i },
  ];
  for (const pattern of patterns) {
    const match = pattern.re.exec(line);
    if (!match) continue;
    const parsed = closedGenericEffectSequence(card, match[1]);
    if (!parsed) return null;
    if(extensionsActive>=6&&['another-your-creature','another-your-artifact'].includes(pattern.filter)){
      // In these clauses, bare "it/its" refers to the event's permanent.
      // Explicit "this creature" and locked target references keep their identity.
      const eventTarget=/\bon it\b|^it (?:gets|gains|loses)\b/i.test(match[1])&&!/\btarget\b/i.test(match[1]);
      const eventStat=/\bits (?:power|toughness)\b/i.test(match[1]);
      const eventSource=/^it deals /i.test(match[1]);
      const bind=value=>Array.isArray(value)?value.map(bind):value&&typeof value==='object'?{...Object.fromEntries(Object.entries(value).map(([key,item])=>[key,
        key==='target'&&item==='self'&&eventTarget?'event-card':key==='kind'&&item==='source-stat'&&eventStat?'event-card-stat':bind(item)])),...(extensionsActive>=7&&value.action==='conditional'&&value.conditionTarget===undefined&&value.condition?.kind==='source-quality'&&/\bIf (?:it |it's |that creature )/.test(match[1])?{conditionTarget:'event-card'}:{})}:value;
      parsed.effects=parsed.effects.map(effect=>({...bind(effect),...(eventSource&&effect.action==='damage'?{source:'event-card'}:{})}));
    }
    if(extensionsActive>=6&&/^if /i.test(match[1])&&parsed.effects.length===1&&parsed.effects[0].action==='conditional'){
      return genericTrigger(pattern.event,parsed.effects[0].effects,{targets:parsed.targets,optional:parsed.optional,eventFilter:pattern.filter,condition:parsed.effects[0].condition});
    }
    return genericTrigger(pattern.event, parsed.effects, {
      targets: parsed.targets,
      optional: parsed.optional,
      eventFilter: pattern.filter,
    });
  }
  return null;
}

function expandedCreatureLine(card, line) {
  if(extensionsActive===8&&/^(?:Other )?(?:[Aa]ttacking|[Bb]locking) creatures\b/.test(line))return extensionLine(card,line,{keywordList,effect:closedGenericEffectSequence});
  const mechanic = expandedMechanicOperation(line);
  if (mechanic) return mechanic;
  const genericEvent = genericEventOperation(card, line);
  if (genericEvent) return genericEvent;
  const subject = selfSubject(card, 'creature');
  let match = new RegExp('^When ' + subject +
    ' enters, put (a|one|two|three) \\+1\\/\\+1 counters? on (up to one )?target creature( you control)?\\.$', 'i').exec(line);
  if (match) {
    return genericTrigger('etb', [{ action: 'counter', target: 0, counter: '+1/+1', n: numberWord(match[1]) }], {
      targets: [genericTarget('creature', { controller: match[3] ? 'you' : 'any', min: match[2] ? 0 : 1 })],
    });
  }
  match = new RegExp('^When ' + subject +
    ' enters, (?:up to one )?target creature( an opponent controls)? gets ([+-]\\d+)\\/([+-]\\d+) until end of turn\\.$', 'i').exec(line);
  if (match) {
    return genericTrigger('etb', [{ action: 'pump', target: 0, power: Number(match[2]), toughness: Number(match[3]), keywords: [] }], {
      targets: [genericTarget('creature', { controller: match[1] ? 'opponent' : 'any', min: /^When .*up to one/i.test(line) ? 0 : 1 })],
    });
  }
  match = new RegExp('^When ' + subject +
    ' enters, (you may )?(destroy|exile) (up to one )?target (creature(?: an opponent controls)?|artifact|enchantment|land|nonland permanent(?: an opponent controls)?)\\.$', 'i').exec(line);
  if (match) {
    const controller = /opponent controls/i.test(match[4]) ? 'opponent' : 'any';
    const what = match[4].replace(/ an opponent controls/i, '').toLowerCase();
    return genericTrigger('etb', [{ action: match[2].toLowerCase(), target: 0 }], {
      optional: !!match[1], targets: [genericTarget(what, { controller, min: match[1] || match[3] ? 0 : 1 })],
    });
  }
  match = new RegExp('^When ' + subject +
    " enters, (you may )?return (up to one )?(?:other )?target (creature|permanent|nonland permanent|artifact|enchantment)( an opponent controls| you control)? to its owner's hand\\.$", 'i').exec(line);
  if (match) {
    const controller = match[4] ? (/opponent/i.test(match[4]) ? 'opponent' : 'you') : 'any';
    return genericTrigger('etb', [{ action: 'bounce', target: 0 }], {
      optional: !!match[1], targets: [genericTarget(match[3].toLowerCase(), {
        controller,
        min: match[1] || match[2] ? 0 : 1,
        ...(/\bother target\b/i.test(line) ? { excludeSelf: true } : {}),
      })],
    });
  }
  match = new RegExp('^When ' + subject +
    ' enters, (you may )?tap (up to one )?target creature( an opponent controls)?(?: and put a stun counter on it)?\\.$', 'i').exec(line);
  if (match) {
    const effects = [{ action: 'tap', target: 0 }];
    if (/stun counter/i.test(line)) effects.push({ action: 'counter', target: 0, counter: 'stun', n: 1 });
    return genericTrigger('etb', effects, {
      optional: !!match[1], targets: [genericTarget('creature', {
        controller: match[3] ? 'opponent' : 'any', min: match[1] || match[2] ? 0 : 1,
      })],
    });
  }
  match = new RegExp('^When ' + subject +
    ' enters, (?:you )?draw (a|one|two|three) cards?(?: and (?:you )?lose (\\d+) life)?\\.$', 'i').exec(line);
  if (match) {
    const effects = [{ action: 'draw', who: 'you', n: numberWord(match[1]) }];
    if (match[2]) effects.push({ action: 'lose-life', who: 'you', n: Number(match[2]) });
    return genericTrigger('etb', effects);
  }
  match = new RegExp('^When ' + subject +
    ' enters, (you may )?(?:target player )?mills? (one|two|three|four|five|\\d+) cards?\\.$', 'i').exec(line);
  if (match) {
    const targeted = /target player/i.test(line);
    return genericTrigger('etb', [{ action: 'mill', who: targeted ? 0 : 'you', n: numberWord(match[2]) }], {
      optional: !!match[1], targets: targeted ? [genericTarget('player', { zone: 'player', min: match[1] ? 0 : 1 })] : [],
    });
  }
  if (new RegExp('^When ' + subject + ' enters, investigate\\.$', 'i').test(line)) {
    return genericTrigger('etb', [{ action: 'investigate', who: 'you', n: 1 }]);
  }
  if (new RegExp('^When ' + subject + ' enters, proliferate\\.$', 'i').test(line)) {
    return genericTrigger('etb', [{ action: 'proliferate', who: 'you' }]);
  }
  if (new RegExp('^When ' + subject + ' enters, you become the monarch\\.$', 'i').test(line)) {
    return genericTrigger('etb', [{ action: 'monarch', who: 'you' }]);
  }
  match = new RegExp('^When ' + subject +
    ' enters, creatures you control get ([+-]\\d+)\\/([+-]\\d+)(?: and gain (.+))? until end of turn\\.$', 'i').exec(line);
  if (match) {
    const keywords = match[3] ? keywordList(match[3]) : [];
    if (match[3] && !keywords) return null;
    return genericTrigger('etb', [{ action: 'pump-group', who: 'your-creatures', power: Number(match[1]), toughness: Number(match[2]), keywords }]);
  }
  match = new RegExp('^When ' + subject + ' dies, (you may )?draw a card\\.$', 'i').exec(line);
  if (match) return genericTrigger('dies', [{ action: 'draw', who: 'you', n: 1 }], { optional: !!match[1] });
  match = new RegExp('^When ' + subject + ' dies, create (a|one|two|three) (Treasure|Food|Clue) tokens?\\.$', 'i').exec(line);
  if (match) return genericTrigger('dies', [{ action: 'token-key', who: 'you', n: numberWord(match[1]), tokenKey: match[2].toLowerCase() }]);
  if (new RegExp('^When ' + subject + " dies, return it to its owner's hand\\.$", 'i').test(line)) {
    return genericTrigger('dies', [{ action: 'return-source-to-hand' }]);
  }
  match = new RegExp('^When ' + subject + ' dies, (?:you may )?destroy target (land|artifact|enchantment)\\.$', 'i').exec(line);
  if (match) return genericTrigger('dies', [{ action: 'destroy', target: 0 }], { targets: [genericTarget(match[1].toLowerCase())] });
  if (new RegExp('^When ' + subject + ' dies, each opponent discards a card\\.$', 'i').test(line)) {
    return genericTrigger('dies', [{ action: 'discard-each-opponent', n: 1 }]);
  }
  match = new RegExp('^When ' + subject + ' dies, put a \\+1\\/\\+1 counter on target creature you control\\.$', 'i').exec(line);
  if (match) return genericTrigger('dies', [{ action: 'counter', target: 0, counter: '+1/+1', n: 1 }], {
    targets: [genericTarget('creature', { controller: 'you' })],
  });
  match = new RegExp('^When ' + subject +
    ' dies, target creature an opponent controls gets (-\\d+)\\/(-\\d+) until end of turn\\.$', 'i').exec(line);
  if (match) return genericTrigger('dies', [{ action: 'pump', target: 0, power: Number(match[1]), toughness: Number(match[2]), keywords: [] }], {
    targets: [genericTarget('creature', { controller: 'opponent' })],
  });
  match = new RegExp('^When ' + subject +
    ' dies, return another target (artifact|creature) card from your graveyard to your hand\\.$', 'i').exec(line);
  if (match) return genericTrigger('dies', [{ action: 'move-to-hand', target: 0 }], {
    targets: [genericTarget(match[1].toLowerCase(), {
      zone: 'graveyard', controller: 'you', excludeSelf: true,
    })],
  });
  match = new RegExp('^When ' + subject + ' dies, each opponent loses (\\d+) life and you gain (\\d+) life\\.$', 'i').exec(line);
  if (match) return genericTrigger('dies', [
    { action: 'lose-life', who: 'each-opponent', n: Number(match[1]) },
    { action: 'gain-life', who: 'you', n: Number(match[2]) },
  ]);
  match = new RegExp('^When ' + subject + ' dies, (?:it|' + escapeRegExp(card.name) + ') deals (\\d+) damage to any target\\.$', 'i').exec(line);
  if (match) return genericTrigger('dies', [{ action: 'damage', target: 0, n: Number(match[1]) }], {
    targets: [genericTarget('any', { zone: 'any' })],
  });
  match = new RegExp('^Whenever ' + subject +
    ' deals (combat )?damage to (a player|an opponent), (you may )?draw a card\\.$', 'i').exec(line);
  if (match) return genericTrigger(match[1] ? 'combatDamageToPlayer' : 'damageToPlayer', [{ action: 'draw', who: 'you', n: 1 }], {
    optional: !!match[3],
    ...(match[2].toLowerCase() === 'an opponent' ? { opponentOnly: true } : {}),
  });
  if (new RegExp('^Whenever ' + subject +
    ' deals combat damage to a player, put a \\+1\\/\\+1 counter on (?:it|' + escapeRegExp(card.name) + ')\\.$', 'i').test(line)) {
    return genericTrigger('combatDamageToPlayer', [{ action: 'counter', target: 'self', counter: '+1/+1', n: 1 }]);
  }
  if (new RegExp('^Whenever ' + subject +
    ' deals combat damage to a player, that player discards a card\\.$', 'i').test(line)) {
    return genericTrigger('combatDamageToPlayer', [{ action: 'discard-damaged-player', n: 1 }]);
  }
  match = new RegExp('^Whenever ' + subject + ' attacks, scry ([1-3])\\.$', 'i').exec(line);
  if (match) return genericTrigger('attacks', [{ action: 'scry', who: 'you', n: Number(match[1]) }]);
  match = new RegExp('^Whenever ' + subject + ' attacks, (?:you may )?tap target creature(?: defending player controls)?\\.$', 'i').exec(line);
  if (match) return genericTrigger('attacks', [{ action: 'tap', target: 0 }], {
    targets: [genericTarget('creature', { controller: /defending player/i.test(line) ? 'defending-player' : 'any' })],
  });
  match = new RegExp('^Landfall — Whenever a land you control enters, ' + subject +
    ' gets \\+(\\d+)\\/\\+(\\d+) until end of turn\\.$', 'i').exec(line);
  if (match) return genericTrigger('landfall', [{ action: 'pump', target: 'self', power: Number(match[1]), toughness: Number(match[2]), keywords: [] }]);
  if (new RegExp('^Landfall — Whenever a land you control enters, put a \\+1\\/\\+1 counter on ' + subject + '\\.$', 'i').test(line)) {
    return genericTrigger('landfall', [{ action: 'counter', target: 'self', counter: '+1/+1', n: 1 }]);
  }
  match = new RegExp('^Landfall — Whenever a land you control enters, ' + subject +
    ' deals (\\d+) damage to each opponent\\.$', 'i').exec(line);
  if (match) return genericTrigger('landfall', [{ action: 'damage', target: 'each-opponent', n: Number(match[1]) }]);
  if (new RegExp('^Whenever you gain life, put a \\+1\\/\\+1 counter on ' + subject + '\\.$', 'i').test(line)) {
    return genericTrigger('lifeGain', [{ action: 'counter', target: 'self', counter: '+1/+1', n: 1 }]);
  }
  if (/^Whenever you gain life, each opponent loses 1 life\.$/i.test(line)) {
    return genericTrigger('lifeGain', [{ action: 'lose-life', who: 'each-opponent', n: 1 }]);
  }
  match = new RegExp('^' + subject + ' enters with (a|one|two|three|X) (\\+1\\/\\+1|-1\\/-1) counters? on it\\.$', 'i').exec(line);
  if (match) return { kind: 'enters-with-counters', counter: match[2], n: match[1].toUpperCase() === 'X' ? 'X' : numberWord(match[1]), contract: 'permanent-enters-with-counters' };

  match = /^(.+): (.+)$/.exec(line);
  if (match) {
    const cost = genericActivatedCost(match[1]);
    let effect = match[2];
    if (cost) {
      const onceEachTurn = / Activate only once each turn\.$/i.test(effect);
      const sorceryOnly = / Activate only as a sorcery\.$/i.test(effect);
      const beforeAttackersOnly = / Activate only during your turn, before attackers are declared\.$/i.test(effect);
      if (beforeAttackersOnly && !extensionsActive) return null;
      effect = effect.replace(/ Activate only once each turn\.$/i, '')
        .replace(/ Activate only as a sorcery\.$/i, '')
        .replace(/ Activate only during your turn, before attackers are declared\.$/i, '');
      const genericEffect = closedGenericEffectSequence(card, effect);
      if (genericEffect) {
        return genericAbility(cost, genericEffect.effects, {
          targets: genericEffect.targets,
          sorceryOnly,
          onceEachTurn,
          ...(beforeAttackersOnly ? { beforeAttackersOnly: true } : {}),
        });
      }
      let result = new RegExp('^' + subject + ' gets ([+-]\\d+)\\/([+-]\\d+) until end of turn\\.(?: Activate only once each turn\\.)?$', 'i').exec(effect);
      if (result) return genericAbility(cost, [{ action: 'pump', target: 'self', power: Number(result[1]), toughness: Number(result[2]), keywords: [] }], { onceEachTurn: /once each turn/i.test(effect) });
      result = /^Tap target (creature|artifact|land|permanent)\.(?: Activate only during your turn, before attackers are declared\.)?$/i.exec(effect);
      if (result) return genericAbility(cost, [{ action: 'tap', target: 0 }], { targets: [genericTarget(result[1].toLowerCase())], sorceryOnly: /only during your turn/i.test(effect) });
      result = /^Untap target (creature|artifact|land|permanent)\.$/i.exec(effect);
      if (result) return genericAbility(cost, [{ action: 'untap', target: 0 }], { targets: [genericTarget(result[1].toLowerCase())] });
      result = new RegExp('^' + subject + ' deals (\\d+) damage to (any target|target player or planeswalker|each opponent)\\.(?: Activate only during your turn, before attackers are declared\\.)?$', 'i').exec(effect);
      if (result) return genericAbility(cost, [{ action: 'damage', target: result[2].toLowerCase() === 'each opponent' ? 'each-opponent' : 0, n: Number(result[1]) }], {
        targets: result[2].toLowerCase() === 'each opponent' ? [] : [genericTarget(result[2].toLowerCase(), { zone: 'any' })],
        sorceryOnly: /only during your turn/i.test(effect),
      });
      result = /^Target creature( you control)? gets ([+-]\d+)\/([+-]\d+)(?: and gains? (.+))? until end of turn\.$/i.exec(effect);
      if (result) {
        const keywords = result[4] ? keywordList(result[4]) : [];
        if (!result[4] || keywords) return genericAbility(cost, [{ action: 'pump', target: 0, power: Number(result[2]), toughness: Number(result[3]), keywords }], {
          targets: [genericTarget('creature', { controller: result[1] ? 'you' : 'any' })],
        });
      }
      result = /^Target creature( you control)? gains? (.+) until end of turn\.$/i.exec(effect);
      if (result) {
        const keywords = keywordList(result[2]);
        if (keywords) return genericAbility(cost, [{ action: 'pump', target: 0, power: 0, toughness: 0, keywords }], {
          targets: [genericTarget('creature', { controller: result[1] ? 'you' : 'any' })],
        });
      }
      result = /^Draw a card(?:, then discard a card)?\.$/i.exec(effect);
      if (result) return genericAbility(cost, /then discard/i.test(effect)
        ? [{ action: 'draw', who: 'you', n: 1 }, { action: 'discard', who: 'you', n: 1 }]
        : [{ action: 'draw', who: 'you', n: 1 }]);
      result = /^You gain (\d+) life\.$/i.exec(effect);
      if (result) return genericAbility(cost, [{ action: 'gain-life', who: 'you', n: Number(result[1]) }]);
      result = /^Destroy target (artifact|enchantment|artifact or enchantment)\.$/i.exec(effect);
      if (result) return genericAbility(cost, [{ action: 'destroy', target: 0 }], { targets: [genericTarget(result[1].toLowerCase())] });
      result = /^Exile target card from a graveyard\.$/i.exec(effect);
      if (result) return genericAbility(cost, [{ action: 'exile', target: 0 }], { targets: [genericTarget('card', { zone: 'graveyard' })] });
    }
  }

  // Multi-block, exact blocker-count, attacks/blocks-alone, and lure clauses
  // need declaration-wide combat legality primitives. Keep them outside the
  // certified queue until those rules exist; accepting an inert static would
  // make both deck import and the interaction audit lie.
  if (new RegExp('^' + subject + ' can block an additional creature each combat\\.$', 'i').test(line)) return extensionsActive===8 ? extensionLine(card,line,{keywordList,effect:closedGenericEffectSequence}) : null;
  if (new RegExp('^' + subject + ' can block any number of creatures\\.$', 'i').test(line)) return extensionsActive===8 ? extensionLine(card,line,{keywordList,effect:closedGenericEffectSequence}) : null;
  match = new RegExp('^' + subject + " can\\'t be blocked by creatures with power (\\d+) or less\\.$", 'i').exec(line);
  if (match) return genericStatic('self', { evasionMaxBlockerPower: Number(match[1]) });
  if (new RegExp('^' + subject + " can\\'t be blocked by more than one creature\\.$", 'i').test(line)) return extensionsActive===8 ? extensionLine(card,line,{keywordList,effect:closedGenericEffectSequence}) : null;
  if (new RegExp('^' + subject + " can\\'t attack or block alone\\.$", 'i').test(line)) return extensionsActive===8 ? extensionLine(card,line,{keywordList,effect:closedGenericEffectSequence}) : null;
  if (new RegExp('^' + subject + ' must be blocked if able\\.$', 'i').test(line)) return null;
  if (new RegExp('^' + subject + " can\\'t be blocked except by creatures with flying\\.$", 'i').test(line)) return genericStatic('self', { blockedOnlyByFlying: true });
  if (new RegExp('^' + subject + " doesn't untap during your untap step\\.$", 'i').test(line)) {
    return { kind: 'doesnt-untap', contract: 'untap-step-restriction' };
  }
  match = /^(Other )?(?:([A-Za-z][A-Za-z -]+) )?creatures you control get ([+-]\d+)\/([+-]\d+)\.$/i.exec(line);
  if (match) {
    return genericStatic(match[1] ? 'your-other-creatures' : 'your-creatures', {
      subtype: match[2] ? match[2].trim() : null,
      power: Number(match[3]),
      toughness: Number(match[4]),
    });
  }
  match = /^(Other )?(?:([A-Za-z][A-Za-z -]+) )?creatures you control have (.+)\.$/i.exec(line);
  if (match) {
    const keywords = keywordList(match[3]);
    if (keywords) return genericStatic(match[1] ? 'your-other-creatures' : 'your-creatures', {
      subtype: match[2] ? match[2].trim() : null,
      keywords,
    });
  }
  match = new RegExp('^During your turn, ' + subject + ' gets ([+-]\\d+)\\/([+-]\\d+)\\.$', 'i').exec(line);
  if (match) return genericStatic('self', {
    power: Number(match[1]), toughness: Number(match[2]), yourTurnOnly: true,
  });
  match = new RegExp('^During your turn, ' + subject + ' has (.+)\\.$', 'i').exec(line);
  if (match) {
    const keywords = keywordList(match[1]);
    if (keywords) return genericStatic('self', { keywords, yourTurnOnly: true });
  }
  return extensionLine(card, line, {
    keywordList, cost: genericActivatedCost, effect: closedGenericEffectSequence,
  });
}

function expandedPermanentLine(card, line) {
  const normalized = String(line || '').replace(
    /\bthis (?:artifact|enchantment|land|Aura|Equipment|Vehicle)\b/gi,
    match => match[0] === 'T' ? 'This creature' : 'this creature'
  );
  return expandedCreatureLine(card, normalized);
}

function permanentLines(rulesCore) {
  const lines=rulesCore?rulesCore.split('\n'):[];
  if(!extensionsActive)return lines;
  const result=[];
  for(const line of lines) {
    if(line.startsWith('• ')&&result.length&&/choose one —/i.test(result.at(-1))) result[result.length-1]+='\n'+line;
    else result.push(line);
  }
  return result;
}

function creatureSemantics(card, rulesCore) {
  if (!/^-?\d+$/.test(String(card.power)) || !/^-?\d+$/.test(String(card.toughness))) {
    if(!extensionsActive)return {reason:'dynamic-power-toughness'};
    const characteristics=rulesCore.split('\n').map(line=>characteristicOperation(card,line)).filter(Boolean);
    for(const stat of ['power','toughness']) {
      if(/^-?\d+$/.test(String(card[stat])))continue;
      if(!/^(?:\*|\d+\+\*|\*\+\d+)$/.test(String(card[stat]))||!characteristics.some(op=>op[stat]))return {reason:'dynamic-power-toughness'};
    }
  }
  if (!String(card.oracle_text || '').trim()) {
    return { semanticClass: 'vanilla', implementedKeywords: [], implementation: [], oracleContracts: [], rulesCore: '' };
  }
  if (!rulesCore) return { reason: 'reminder-only-oracle' };

  const implementedKeywords = [];
  const implementation = [];
  const subject = selfSubject(card, 'creature');
  for (const line of permanentLines(rulesCore)) {
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
    if (new RegExp('^' + subject + ' must be blocked if able\\.$', 'i').test(line)) {
      implementation.push({ kind: 'must-be-blocked', contract: 'must-be-blocked-static' });
      continue;
    }
    if (new RegExp('^All creatures able to block ' + subject + ' do so\\.$', 'i').test(line)) {
      implementation.push({ kind: 'lure', contract: 'lure-static' });
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
    const expanded = expandedCreatureLine(card, line);
    if (expanded) {
      implementation.push(expanded);
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
  for (const line of rulesCore ? permanentLines(rulesCore) : []) {
    const keywords = keywordLine(line);
    if (extensionsActive && keywords && keywords.every(keyword => keyword === 'indestructible' || keyword === 'hexproof' || keyword === 'shroud')) {
      implementation.push(genericStatic('self', { keywords }));
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
    match = new RegExp('^' + subject + ' enters tapped unless you control (two|three) or (more|fewer) other lands\\.$', 'i').exec(line);
    if (match) {
      implementation.push({
        kind: 'conditional-enters-tapped',
        condition: 'other-land-count',
        threshold: numberWord(match[1]),
        comparison: match[2].toLowerCase(),
        contract: 'conditional-land-entry',
      });
      continue;
    }
    match = new RegExp('^' + subject + ' enters tapped unless (?:you|a player) (?:has|have) (\\d+) or less life\\.$', 'i').exec(line);
    if (match) {
      implementation.push({
        kind: 'conditional-enters-tapped',
        condition: 'life-at-most',
        threshold: Number(match[1]),
        anyPlayer: /a player/i.test(line),
        contract: 'conditional-land-entry',
      });
      continue;
    }
    if (new RegExp('^' + subject + ' enters tapped unless you have two or more opponents\\.$', 'i').test(line)) {
      implementation.push({
        kind: 'conditional-enters-tapped',
        condition: 'opponents-at-least',
        threshold: 2,
        contract: 'conditional-land-entry',
      });
      continue;
    }
    match = new RegExp('^As ' + subject + " enters, you may pay (\\d+) life\\. If you don't, it enters tapped\\.$", 'i').exec(line);
    if (match) {
      implementation.push({
        kind: 'conditional-enters-tapped',
        condition: 'pay-life',
        life: Number(match[1]),
        contract: 'conditional-land-entry',
      });
      continue;
    }
    const expanded = expandedPermanentLine(card, line);
    if (expanded) {
      implementation.push(expanded);
      continue;
    }
    return { reason: 'land-needs-explicit-semantics' };
  }
  if(extensionsActive>=7)implementation.splice(0,implementation.length,...currentExtensions().normalizeManaOperations(implementation));
  if (extensionsActive<7 && !implementation.some(operation => operation.kind === 'mana-source') &&
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
  if (!implementation.some(operation => operation.kind === 'mana-source') && extensionsActive<6) {
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
  for (const line of permanentLines(rulesCore)) {
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
    const expanded = expandedPermanentLine(card, line);
    if (expanded) {
      implementation.push(expanded);
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
  for (const line of permanentLines(rulesCore)) {
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
    const expanded = expandedPermanentLine(card, line);
    if (expanded) {
      implementation.push(expanded);
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
  for (const line of permanentLines(rulesCore)) {
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
    if (crew && ['power','toughness'].every(stat=>/^-?\d+$/.test(String(card[stat])) || extensionsActive===8&&implementation.some(op=>op.kind==='characteristic-pt'&&op[stat]))) {
      implementation.push({ kind: 'crew', n: Number(crew[1]), contract: 'crew-ability' });
      continue;
    }
    const expanded = expandedPermanentLine(card, line);
    if (expanded) {
      implementation.push(expanded);
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
  for (const line of permanentLines(rulesCore)) {
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
    const expanded = expandedPermanentLine(card, line);
    if (expanded) {
      implementation.push(expanded);
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
  if (operation.kind === 'spell-generic') return operation.targets.length > 0;
  return ['spell-counter', 'spell-destroy', 'spell-exile', 'spell-damage', 'spell-pump',
    'spell-bounce', 'spell-discard', 'spell-mill', 'spell-graveyard-return',
    'spell-counter-on-creature', 'spell-tap', 'spell-untap'].includes(operation.kind) &&
    !(operation.kind === 'spell-damage' && operation.what === 'each opponent');
}

function spellSemantics(card, rulesCore) {
  if (!rulesCore) return { reason: 'spell-needs-explicit-semantics' };
  if(extensionsActive>=7&&/^Overload /m.test(rulesCore)){
    const lines=rulesCore.split('\n'),overloads=lines.filter(line=>line.startsWith('Overload '));
    const cost=overloads.length===1&&/^Overload ((?:\{(?:\d+|X|[WUBRGC])\})+)$/.exec(overloads[0]);
    if(!cost)return {reason:'overload-cost-needs-semantics'};
    const modifiers=[],body=[];
    for(const line of lines.filter(line=>line!==overloads[0])){const modifier=spellModifierOperation(card,line);if(modifier)modifiers.push(modifier);else body.push(line);}
    const text=body.join(' '),normal=closedGenericEffectSequence(card,text),overloaded=closedGenericEffectSequence(card,text.replace(/\btarget\b/gi,'each'));
    if(!normal||normal.optional||!normal.targets.length||!overloaded||overloaded.optional||overloaded.targets.length)return {reason:'overload-body-needs-complete-semantics'};
    const operation={kind:'spell-generic',...normal,overload:cost[1],overloadedBody:overloaded,contract:'spell-overload-effect'};
    return {semanticClass:'spell-template',implementedKeywords:[],implementation:[...modifiers,operation],oracleContracts:[...new Set([...modifiers.map(row=>row.contract),operation.contract])],rulesCore};
  }
  const v4Fallback = () => {
    const modifiers = [];
    const bodyLines = [];
    for (const line of rulesCore.split('\n')) {
      const modifier = spellModifierOperation(card, line);
      if (modifier) modifiers.push(modifier);
      else bodyLines.push(line);
    }
    if (!bodyLines.length) return { reason: 'spell-needs-explicit-semantics' };
    const parsed = parseOracleSpellV4(card, bodyLines.join('\n'));
    if (!parsed.ok) {
      if(!extensionsActive)return {reason:'spell-needs-explicit-semantics'};
      const modal=extensionsActive>=6&&(extensionsActive>=7?currentExtensions().modalOperation:v6Modal)(card,bodyLines.join('\n'),closedGenericEffectSequence);
      if(modal)return {semanticClass:'spell-template',implementedKeywords:[],implementation:[...modifiers,modal],oracleContracts:[...new Set([...modifiers.map(operation=>operation.contract),modal.contract])],rulesCore};
      const generic=closedGenericEffectSequence(card,bodyLines.join(' '));
      if(!generic||generic.optional||generic.effects.some(effect=>effect.target==='self')) return { reason: 'spell-needs-explicit-semantics' };
      return {semanticClass:'spell-template',implementedKeywords:[],implementation:[...modifiers,{kind:'spell-generic',...generic,contract:'spell-generic-effect'}],oracleContracts:[...new Set([...modifiers.map(operation=>operation.contract),'spell-generic-effect'])],rulesCore};
    }
    return {
      semanticClass: 'spell-v4-template',
      implementedKeywords: [],
      implementation: [...modifiers, {
        kind: 'spell-v4',
        parserVersion: parsed.parserVersion,
        additionalCosts: parsed.additionalCosts,
        targets: parsed.targets,
        effects: parsed.effects,
        operations: parsed.operations,
        contract: 'spell-v4-closed-ast',
      }],
      oracleContracts: [...new Set([...modifiers.map(operation => operation.contract), 'spell-v4-closed-ast'])],
      rulesCore,
    };
  };
  const implementation = [];
  for (const line of rulesCore.split('\n')) {
    const operation = spellLineOperation(card, line) || spellModifierOperation(card, line);
    if (!operation) return v4Fallback();
    implementation.push(operation);
  }
  if (implementation.filter(spellOperationNeedsTarget).length > 1) {
    return v4Fallback();
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

function semanticClassCore(card) {
  if(extensionsActive===8&&['modal_dfc','transform'].includes(card.layout))return compileFaces(card,{compile:face=>semanticClass(face,{compilerVersion:8}),raw:rawCard});
  if(extensionsActive===8&&card.layout==='leveler')return compileLeveler(card,{compile:band=>semanticClass(band,{compilerVersion:8})});
  if(extensionsActive>=7&&/^Backup \d+/m.test(stripReminderText(card.oracle_text||''))){
    if(!card.type_line.includes('Creature')||card.layout!=='normal')return {reason:'backup-needs-normal-creature'};
    const text=stripReminderText(card.oracle_text),lines=text.split('\n').filter(Boolean),backup=line=>/^Backup \d+$/.test(line),plain=lines.filter(line=>!backup(line));
    if(lines.some(line=>line.startsWith('Backup ')&&!backup(line)))return {reason:'unsupported-backup-suffix'};
    const base=semanticClass({...card,oracle_text:plain.join('\n')},{compilerVersion:extensionsActive});if(!base.semanticClass)return {reason:'backup-other-rules-unsupported'};
    const operations=[];
    for(const [index,line]of lines.entries())if(backup(line)){
      const below=semanticClass({...card,oracle_text:lines.slice(index+1).filter(row=>!backup(row)).join('\n')},{compilerVersion:extensionsActive});
      if(!below.semanticClass||(below.implementation||[]).some(op=>!['generic-ability','generic-trigger','mana-source'].includes(op.kind)))return {reason:'backup-grant-needs-semantics'};
      operations.push({kind:'generic-trigger',event:'etb',eventFilter:'self',targets:[{what:'creature',zone:'battlefield',controller:'any',min:1}],effects:[{action:'backup',target:0,n:Number(line.slice(7)),keywords:below.implementedKeywords,operations:below.implementation}],contract:'generic-trigger-effect'});
    }
    return {...base,implementation:[...base.implementation,...operations],oracleContracts:[...new Set([...base.oracleContracts,'generic-trigger-effect'])],rulesCore:text};
  }
  if(extensionsActive>=7&&card.layout==='saga'){
    const text=stripReminderText(card.oracle_text||''),lines=text.split('\n').filter(Boolean),chapters=[],other=[];
    const roman=['I','II','III','IV','V','VI','VII','VIII','IX','X'];
    if(!/\bEnchantment\b/.test(card.type_line)||!/\bSaga\b/.test(card.type_line))return {reason:'unsupported-saga-type'};
    for(const line of lines){
      const match=/^([IVX]+(?:, [IVX]+)*) — (.+)$/.exec(line);
      if(!match){other.push(line);continue;}
      const body=closedGenericEffectSequence(card,currentExtensions().normalizeAbilityWords(match[2]));
      if(!body)return {reason:'saga-chapter-needs-complete-semantics'};
      for(const numeral of match[1].split(', ')){
        const number=roman.indexOf(numeral)+1;
        if(!number||chapters[number-1])return {reason:'unsupported-saga-chapter-number'};
        chapters[number-1]={...body};
      }
    }
    if(!chapters.length||Array.from(chapters).some(chapter=>!chapter))return {reason:'unsupported-saga-chapter-sequence'};
    const base=semanticClass({...card,layout:'normal',oracle_text:other.join('\n')},{compilerVersion:extensionsActive});
    if(!base.semanticClass)return {reason:'saga-other-rules-unsupported'};
    const operation={kind:'saga-chapters',chapters,contract:'saga-chapters'};
    return {...base,implementation:[...base.implementation,operation],oracleContracts:[...base.oracleContracts,operation.contract],rulesCore:text};
  }
  if(extensionsActive>=7&&card.layout==='split'){
    if(card.card_faces?.length!==2||card.card_faces.some(face=>!['Instant','Sorcery'].includes(face.type_line)||!validateManaCost(face.mana_cost)))return {reason:'unsupported-split-faces'};
    const faces=[];let fuse=false;
    for(const [index,face]of card.card_faces.entries()){
      const lines=stripReminderText(face.oracle_text).split('\n'),aftermath=lines.includes('Aftermath');
      fuse=fuse||lines.includes('Fuse');
      if(aftermath&&index!==1)return {reason:'unsupported-aftermath-position'};
      const body=closedGenericEffectSequence({...card,...face},currentExtensions().normalizeAbilityWords(lines.filter(line=>!['Fuse','Aftermath'].includes(line)).join(' ')));
      if(!body||body.optional||body.effects.some(effect=>effect.target==='self'))return {reason:'split-needs-complete-face-semantics'};
      faces.push({key:index===0?'left':'right',name:face.name,cost:face.mana_cost,types:[face.type_line],aftermath,...body});
    }
    if(fuse&&faces.some(face=>face.aftermath))return {reason:'unsupported-fuse-aftermath'};
    return {semanticClass:'spell-template',implementedKeywords:[],implementation:[{kind:'split-faces',faces,fuse,contract:'split-casting'}],oracleContracts:['split-casting'],rulesCore:card.card_faces.map(face=>face.name+': '+stripReminderText(face.oracle_text)).join('\n')};
  }
  if(extensionsActive>=7&&card.layout==='adventure'){
    if(card.card_faces?.length!==2)return {reason:'invalid-adventure-faces'};
    const [front,back]=card.card_faces;
    if(!/Creature|Artifact|Enchantment/.test(front.type_line)||/Land|Instant|Sorcery/.test(front.type_line)||!/^(Instant|Sorcery) — Adventure$/.test(back.type_line))return {reason:'unsupported-adventure-face-types'};
    const frontCard={...card,...front,layout:'normal',card_faces:undefined},backCard={...card,...back,layout:'normal',card_faces:undefined};
    const primary=semanticClass(frontCard,{compilerVersion:extensionsActive});
    const body=validateManaCost(back.mana_cost)&&closedGenericEffectSequence(backCard,stripReminderText(back.oracle_text));
    if(!primary.semanticClass||!body||body.optional||body.effects.some(effect=>effect.target==='self'))return {reason:'adventure-needs-complete-face-semantics'};
    const operation={kind:'adventure-face',name:back.name,cost:back.mana_cost,types:[back.type_line.split(' — ')[0]],...body,contract:'adventure-casting'};
    return {...primary,semanticClass:front.type_line.includes('Creature')?'creature-template':'permanent-template',implementation:[...primary.implementation,operation],oracleContracts:[...primary.oracleContracts,operation.contract],rulesCore:stripReminderText(front.oracle_text)+'\nAdventure — '+back.name+': '+stripReminderText(back.oracle_text)};
  }
  if (!validateManaCost(card.mana_cost)) return { reason: 'unsupported-mana-cost' };
  if (card.layout !== 'normal') return { reason: 'complex-layout' };
  const parsed = parseTypeLine(card.type_line);
  let rulesCore = stripReminderText(card.oracle_text || '');
  if(extensionsActive>=7)rulesCore=currentExtensions().normalizeAbilityWords(rulesCore);
  // Most current Oracle text uses "this creature" rather than its printed
  // name. Keep those identical grammars reusable by the RegExp compiler,
  // without changing the source card or any normalized report fields.
  const shortName=extensionsActive>=6?card.name.split(/,| the /)[0]:card.name.split(',')[0];
  const legendaryAlias=extensionsActive===8&&parsed.super.includes('Legendary')?card.name.split(/,| of | the /)[0]:null;
  if (card.name!=='Clowning Around' && !rulesCore.toLowerCase().includes(shortName.toLowerCase()) && !(legendaryAlias&&rulesCore.toLowerCase().includes(legendaryAlias.toLowerCase()))) card = { ...card, name: '__OracleSelf__' };
  if (extensionsActive>=7&&parsed.types.includes('Planeswalker')) {
    if(!/^\d+$/.test(String(card.loyalty)))return {reason:'unsupported-loyalty-value'};
    const result=artifactSemantics(card,parsed,rulesCore);
    return result.semanticClass?{...result,semanticClass:'permanent-template'}:result;
  }
  if (parsed.types.includes('Creature')) return creatureSemantics(card, rulesCore);
  if (parsed.types.includes('Land')) return landSemantics(card, rulesCore);
  if (parsed.types.includes('Instant') || parsed.types.includes('Sorcery')) return spellSemantics(card, rulesCore);
  if (parsed.types.includes('Artifact')) return artifactSemantics(card, parsed, rulesCore);
  if (parsed.types.includes('Enchantment')) return enchantmentSemantics(card, parsed, rulesCore);
  return { reason: 'noncreature-needs-explicit-semantics' };
}

export function semanticClass(card, { compilerVersion = SEMANTIC_COMPILER_VERSION, memoize = true } = {}) {
  if(![4,5,6,7,8].includes(compilerVersion))throw new Error('Unsupported semantic compiler version: '+compilerVersion);
  // Freeze every successful v7 descriptor before considering the additive v8 grammar.
  if(compilerVersion===8){
    const frozen=semanticClass(card,{compilerVersion:7,memoize});
    const needsStatBinding=/\btarget\b[\s\S]*\bits (?:power|toughness|mana value)\b/i.test(card.oracle_text||'')&&JSON.stringify(frozen.implementation||[]).includes('"kind":"source-stat"');
    if(frozen.semanticClass&&!needsStatBinding&&!v8.needsCopyRecompile(card,frozen))return frozen;
  }
  const previous = extensionsActive;
  const previousCache=compilerParseCache;
  try {
    let result;
    if(compilerVersion===8){
      extensionsActive=8;
      compilerParseCache=memoize?{cards:new WeakMap(),values:new Map(),active:new Set()}:null;
      result=semanticClassCore(card);
    }else{
      extensionsActive = 0;
      const existing = semanticClassCore(card);
      if (existing.semanticClass || compilerVersion===4) return existing;
      extensionsActive = 5;
      result=semanticClassCore(card);
      if (!result.semanticClass && compilerVersion >= 6) {
        extensionsActive = 6;
        result = semanticClassCore(card);
      }
      const needsTargetBinding=(result.implementation||[]).some(operation=>operation.targets?.length&&/"event-(?:card|player|card-controller|card-owner)"/.test(JSON.stringify(operation)))&&/\. (?:That (?:artifact|enchantment|land|player|spell|card)\b|Its (?:controller|owner)\b)/.test(card.oracle_text||'');
      if (compilerVersion >= 7 && (!result.semanticClass || needsTargetBinding || (result.implementation||[]).some(operation=>operation.kind==='generic-ability'&&JSON.stringify(operation).includes('"action":"add-mana"')))) {
        extensionsActive = compilerVersion;
        result = semanticClassCore(card);
      }
    }
    if(extensionsActive===8&&result.implementation){
      const flatten=operations=>operations.flatMap(operation=>operation.kind==='operation-bundle'?flatten(operation.operations):[operation]);
      result.implementation=flatten(result.implementation);
    }
    if(extensionsActive>=7&&result.implementation){result.implementation=currentExtensions().normalizeManaOperations(result.implementation);result.oracleContracts=[...new Set(result.implementation.map(operation=>operation.contract))];}
    if(compilerVersion>=7&&result.implementation)result.implementation=currentExtensions().normalizeTokenOperations(result.implementation);
    const operations=result.implementation||[];
    // A revealed/selected card is not the source of its revealing ability.
    // The closed library primitive has no exported selected-card binding yet;
    // reject a following implicit source reference instead of silently using
    // the original permanent (for example, a newly revealed Demon's power).
    if(extensionsActive===8){
      const unsupportedCounterPayment=node=>!!node&&typeof node==='object'&&(
        node.kind==='mana-source'&&!!node.activationCost?.oracleCounterPayment||
        node.kind==='generic-ability'&&!!node.from&&!!node.cost?.oracleCounterPayment||
        Object.values(node).some(value=>Array.isArray(value)?value.some(unsupportedCounterPayment):unsupportedCounterPayment(value)));
      if(operations.some(unsupportedCounterPayment))return {reason:'counter-payment-needs-supported-activation-zone'};
      // A quoted/granted ability starts its own resolution scope. Its source
      // references do not refer to a card selected by the granting effect.
      const isolated=new Set(['operation','grantedOperation','modes','modalBody']);
      const implicit=node=>{
        if(typeof node==='string')return ['event-card','event-card-controller','event-card-owner'].includes(node);
        return !!node&&typeof node==='object'&&(
          ['source-stat','source-counters','source-attachments','event-card-stat','event-card-counters'].includes(node.kind)||
          node.action==='conditional'&&node.condition?.kind==='source-quality'&&node.conditionTarget===undefined||
          Object.entries(node).some(([key,value])=>!isolated.has(key)&&(Array.isArray(value)?value.some(implicit):implicit(value))));
      };
      const selects=node=>!!node&&typeof node==='object'&&(
        node.action==='library-select-v8'||node.action==='library-search-v8'||node.action==='search-own-zones-v8'||
        Object.entries(node).some(([key,value])=>!isolated.has(key)&&(Array.isArray(value)?value.some(selects):selects(value))));
      const unbound=nodes=>{
        if(!Array.isArray(nodes))return false;
        let selected=false;
        for(const node of nodes||[]){
          if(selected&&implicit(node))return true;
          if(selects(node))selected=true;
        }
        return false;
      };
      // Visit every execution list, including modal bodies and nested grants.
      // A selected card inside a conditional also affects later instructions
      // in the surrounding list, even when that branch might not be taken.
      const invalidScope=node=>!!node&&typeof node==='object'&&(
        unbound(node.effects)||unbound(node.elseEffects)||
        Object.values(node).some(value=>Array.isArray(value)?value.some(invalidScope):invalidScope(value)));
      if(operations.some(invalidScope))return {reason:'library-selected-reference-needs-binding'};
    }
    // Every complete face has already passed these binding checks in its own
    // scope. A trigger on one face cannot lend its event or X to the other.
    if(extensionsActive===8&&operations.length===1&&operations[0].kind==='double-faced-v8')return result;
    if(extensionsActive>=7&&operations.some(op=>op.kind==='generic-static'&&JSON.stringify(op.condition||{}).includes('"kind":"source-stat-comparison"')&&(op.power||op.toughness||op.grantedOperation)))return {reason:'power-dependent-continuous-layer-needs-semantics'};
    if(extensionsActive>=7&&operations.some(op=>op.kind==='generic-trigger'&&!['self','self-card','self-combat'].includes(op.eventFilter)&&JSON.stringify(op.condition||{}).includes('"implicit":true')))return {reason:'event-stat-condition-needs-binding'};
    if(extensionsActive>=7)for(const op of operations)if(JSON.stringify(op).includes('"action":"return-grave-source"')){
      if(op.kind==='generic-ability'&&!op.from&&!op.onceEachTurn&&Object.keys(op.cost||{}).every(key=>['mana','discard','discardFilter','tapFilter','tapN','sacWhat','sacOther','sacFilter','sacN','exileFilter','exileFromGY'].includes(key))){op.from='graveyard';op.retainGraveSource=true;}
      if(op.kind==='generic-trigger'&&!['self','self-card','self-combat'].includes(op.eventFilter))op.zone='graveyard';
      else if(op.kind!=='generic-ability'||op.from!=='graveyard')return {reason:'graveyard-return-needs-zone-scope'};
    }
    if(extensionsActive>=7&&operations.some(op=>!['spell-generic','spell-modal-generic','adventure-face','split-faces'].includes(op.kind)&&JSON.stringify(op).includes('"action":"exile-resolving-spell"')))return {reason:'self-exile-outside-spell-resolution'};
    // Target-as-damage-source continuations need an explicit source binding.
    if(extensionsActive>=7 && /\bthen it deals|\. It deals/i.test(card.oracle_text||'')&&!JSON.stringify(operations).includes('"action":"bite"'))return {reason:'unbound-target-damage-source'};
    if (extensionsActive >= 6 && operations.some(op => op.kind === 'generic-ability' &&
      JSON.stringify(op).includes('"action":"add-mana"')&&!(extensionsActive===8&&op.stackMana))) {
      return {reason:'mana-ability-needs-explicit-semantics'};
    }
    // In creature arrival/death triggers, "its power/toughness" refers to
    // that event's creature, which need not be the ability's source.
    for (const operation of operations) {
      if (operation.kind !== 'generic-trigger' || !['etb', 'dies'].includes(operation.event) ||
          !(['any-creature', 'another-creature', 'your-creature', 'another-your-creature'].includes(operation.eventFilter) ||
            ['your-subtype','filtered-object'].includes(operation.eventFilter?.kind))) continue;
      for (const effect of operation.effects || []) {
        if (effect.action === 'gain-life' && effect.n?.kind === 'source-stat') effect.n.kind = 'event-card-stat';
      }
    }
    if(operations.filter(op=>['mechanic-unearth','mechanic-embalm','mechanic-eternalize','mechanic-grave-return-self','mechanic-encore-v8'].includes(op.kind)||op.kind==='mechanic-zone-keyword-cost-v8'&&op.keyword==='eternalize'||op.kind==='generic-ability'&&op.from==='graveyard').length>1)return {reason:'conflicting-graveyard-abilities'};
    if(operations.filter(op=>op.kind==='generic-ability'&&op.from==='hand').length>1)return {reason:'conflicting-hand-abilities'};
    if(operations.filter(op=>op.kind==='cycling'||op.kind==='mechanic-zone-keyword-cost-v8'&&op.keyword==='cycling').length>1)return {reason:'conflicting-cycling-costs'};
    const bindingScopes=[];
    const addScope=op=>{
      const strip=value=>Array.isArray(value)?value.map(strip):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([key,child])=>{
        if(value.action==='grant-operation'&&key==='operation'||extensionsActive===8&&value.action==='install-trigger-v8'&&key==='trigger'){addScope(child);return false;}return true;
      }).map(([key,child])=>[key,strip(child)])):value;
      bindingScopes.push(strip(op));
    };
    if(extensionsActive>=7)operations.forEach(addScope);else bindingScopes.push(...operations);
    const boundEvents=operation=>{
      if(operation.kind==='attachment-operation')return boundEvents(operation.operation);
      if(operation.grantedOperation)return boundEvents(operation.grantedOperation);
      const encoded=JSON.stringify(operation);
      if(/"event-(?:player|card|card-controller|card-owner|card-stat|card-counters)"/.test(encoded)&&operation.kind!=='generic-trigger')return false;
      if(extensionsActive===8&&['v8-event','damage-event-v8'].includes(operation.eventFilter?.kind))return (!['event-card-stat','event-card-counters','event-card-owner'].some(kind=>encoded.includes('"'+kind+'"'))||v8.eventReferenceAllowed(operation,'event-card'))&&['event-player','event-card','event-card-controller'].every(reference=>!encoded.includes('"'+reference+'"')||v8.eventReferenceAllowed(operation,reference));
      if(encoded.includes('"event-player"')&&![operation.event].flat().every(event=>['cast','draw','upkeep','endStep','damageToPlayer','combatDamageToPlayer',...(extensionsActive===8?['drawStep','precombatMain','beginCombat']:[]),...(extensionsActive>=7&&operation.eventFilter==='self-unblocked'?['blockersDeclared']:[])].includes(event)))return false;
      if(/"event-card(?:-controller)?"/.test(encoded)&&![operation.event].flat().every(event=>['etb','dies','lto','cast','castIS','castNonCreature','castCreature','attacks','blocks','becameTapped','becameUntapped','turnedFaceUp',...(extensionsActive>=7?['combatDamageToPlayer',...(operation.eventFilter?.kind==='self-creature-combat'?['becomesBlockedByCreature']:[])]:[])].includes(event)))return false;
      return true;
    };
    if(bindingScopes.some(operation=>!boundEvents(operation)))return {reason:'unbound-event-reference'};
    if(extensionsActive===8&&JSON.stringify(operations).includes('"copy-reference"'))return {reason:'unbound-copy-reference'};
    if(extensionsActive===8&&bindingScopes.some(operation=>!v8.boundStackCopyReferences(operation)))return {reason:'unbound-stack-copy-reference'};
    if(extensionsActive===8){
      const xTargetsBound=operation=>{
        if(operation.kind==='attachment-operation')return xTargetsBound(operation.operation);
        if(operation.grantedOperation)return xTargetsBound(operation.grantedOperation);
        const printedX=/\{X\}/.test(card.mana_cost||'');
        const allowed=['spell-generic','spell-modal-generic'].includes(operation.kind)?printedX:
          operation.kind==='generic-ability'?!operation.from&&/\{X\}/.test(operation.cost?.mana||''):
          operation.kind==='generic-trigger'&&operation.event==='etb'&&operation.eventFilter==='self'&&printedX;
        const checkBody=body=>{
          const {targets=[],...other}=body;
          if(/"threshold":"X"|"targetCountX":true/.test(JSON.stringify(other)))return false;
          return !/"threshold":"X"|"targetCountX":true/.test(JSON.stringify(targets))||allowed;
        };
        if(operation.kind==='spell-modal-generic')return operation.modes.every(mode=>checkBody(mode.body));
        return checkBody(operation);
      };
      if(bindingScopes.some(operation=>!xTargetsBound(operation)))return {reason:'unbound-target-X'};
      const oneSacrifice=cost=>!!cost&&((cost.sacSelf?1:0)+((cost.sacWhat||cost.sacCreature||cost.sacFilter)?(cost.sacN??1):0)===1);
      const additional=operations.filter(op=>op.kind==='mechanic-additional-costs').flatMap(op=>op.costs||[]).filter(cost=>cost.kind==='sacrifice');
      const spellSacrifice=additional.length===1&&additional[0].quantity?.min===1&&additional[0].quantity?.max===1;
      const boundSacrifice=(value,bound=false)=>{
        if(Array.isArray(value))return value.every(child=>boundSacrifice(child,bound));
        if(!value||typeof value!=='object')return true;
        if(value.kind==='sacrificed-stat')return bound;
        if(value.kind==='generic-ability')bound=oneSacrifice(value.cost);
        else if(['spell-generic','spell-modal-generic'].includes(value.kind))bound=spellSacrifice;
        else if(value.kind==='generic-trigger')bound=false;
        let childBound=bound;
        if(value.action==='resolution-cost'&&value.payment?.kind==='sacrifice')childBound=value.payment.n===1;
        if(value.action==='optional-sacrifice')childBound=(value.n??1)===1;
        if(value.action==='reflexive-cost'&&value.cost?.action==='sacrifice')childBound=value.cost.n===1;
        return Object.entries(value).every(([key,child])=>boundSacrifice(child,
          value.action==='grant-operation'&&key==='operation'||key==='operations'&&value.types?false:
          key==='effects'||key==='reflexiveBody'?childBound:bound));
      };
      if(bindingScopes.some(operation=>!boundSacrifice(operation)))return {reason:'unbound-sacrificed-stat'};
      const boundPayment=(value,bound=false)=>{
        if(Array.isArray(value))return value.every(child=>boundPayment(child,bound));
        if(!value||typeof value!=='object')return true;
        if(['payment-stat','payment-count'].includes(value.kind))return bound;
        if(['generic-trigger','generic-ability'].includes(value.kind))bound=false;
        return Object.entries(value).every(([key,child])=>boundPayment(child,
          value.action==='resolution-cost'&&key==='effects'?true:
          value.action==='resolution-cost'&&key==='elseEffects'?false:
          value.action==='grant-operation'&&key==='operation'?false:bound));
      };
      if(bindingScopes.some(operation=>!boundPayment(operation)))return {reason:'unbound-payment-value'};
    }
    // Event amounts only exist on damage events. Never accept an inert
    // "that much life" outside the closed antecedent that defines it.
    const amountBound=op=>op.kind==='attachment-operation'?amountBound(op.operation):op.grantedOperation?amountBound(op.grantedOperation):!JSON.stringify(op).includes('"kind":"event-amount"')||op.kind==='generic-trigger'&&(extensionsActive===8&&['v8-event','damage-event-v8'].includes(op.eventFilter?.kind)?v8.eventReferenceAllowed(op,'event-amount'):[op.event].flat().every(event=>['damageToPlayer','dealtDamage','combatDamageToPlayer','lifeGain'].includes(event)));
    if(bindingScopes.some(op=>!amountBound(op)))return {reason:'unbound-event-amount'};
    if(extensionsActive>=6&&JSON.stringify(operations).includes('"X"')&&!/\{X\}|pay X life/i.test((card.mana_cost||'')+' '+(card.oracle_text||'')+(extensionsActive>=7?(card.card_faces||[]).map(face=>(face.mana_cost||'')+' '+(face.oracle_text||'')).join(' '):'')))return {reason:'unbound-X'};
    return result;
  } finally { extensionsActive = previous;compilerParseCache=previousCache; }
}

function rawCard(card) {
  if(card.layout==='split'&&card.card_faces?.length===2)card={...card,mana_cost:card.card_faces.map(face=>face.mana_cost).join(''),type_line:[...new Set(card.card_faces.map(face=>face.type_line))].join(' '),oracle_text:card.card_faces.map(face=>face.name+': '+face.oracle_text).join('\n')};
  if(['adventure','modal_dfc','transform'].includes(card.layout)&&card.card_faces?.length===2)card={...card,...card.card_faces[0],name:card.name};
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
    ...(['adventure','split','modal_dfc','transform'].includes(card.layout)?{aliases:card.card_faces.map(face=>face.name)}:{}),
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

export async function fetchOracleCardsFromGzip(sourceFile, bulk, expectedSha256 = '') {
  const absolute = path.resolve(String(sourceFile || ''));
  if (!sourceFile || !fs.existsSync(absolute)) {
    throw new Error(`Pinned Oracle source file does not exist: ${absolute}`);
  }
  if (!bulk || bulk.type !== 'oracle_cards' || !bulk.id || !bulk.updated_at) {
    throw new Error('Pinned Oracle source requires oracle_cards type, bulk ID, and updated timestamp.');
  }
  if (!/^[a-f0-9]{64}$/i.test(expectedSha256)) {
    throw new Error('Pinned Oracle source requires --source-sha256 with exactly 64 hexadecimal characters.');
  }

  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(absolute)) hash.update(chunk);
  const actualSha256 = hash.digest('hex');
  if (actualSha256 !== expectedSha256.toLowerCase()) {
    throw new Error(`Pinned Oracle source SHA-256 mismatch: got ${actualSha256}, expected ${expectedSha256.toLowerCase()}.`);
  }

  const input = fs.createReadStream(absolute).pipe(createGunzip());
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  const cards = [];
  for await (const line of lines) {
    if (line.trim()) cards.push(JSON.parse(line));
  }
  return { bulk: { ...bulk, sha256: actualSha256 }, cards };
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

// Consecutive batches share the same pinned feed. Cache only identical full
// source rows and compiler versions, and clone descriptors so callers cannot
// mutate a later plan through an earlier report.
const planSemanticCache=new WeakMap();
function planSemantics(card,compilerVersion){
  const fingerprint=JSON.stringify(card),cached=planSemanticCache.get(card);
  if(cached?.fingerprint===fingerprint&&cached.compilerVersion===compilerVersion)return structuredClone(cached.result);
  const result=semanticClass(card,{compilerVersion});
  planSemanticCache.set(card,{fingerprint,compilerVersion,result:structuredClone(result)});
  return result;
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
  compilerVersion = SEMANTIC_COMPILER_VERSION,
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
    if (legacyNames.has(card.name)||(compilerVersion>=7&&card.layout==='adventure'&&legacyNames.has(card.card_faces?.[0]?.name))||(compilerVersion===8&&['modal_dfc','transform'].includes(card.layout)&&card.card_faces?.some(face=>legacyNames.has(face.name)))) {
      addReason(deferredByReason, deferredExamples, 'already-in-legacy-engine', card);
      continue;
    }
    if (selectionIds.has(card.oracle_id) || selectionNames.has(card.name)) {
      addReason(deferredByReason, deferredExamples, 'already-imported-batch', card);
      continue;
    }
    const semantics = planSemantics(card,compilerVersion);
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
      ...(bulk.sha256 ? { bulkSha256: bulk.sha256 } : {}),
    },
    selectionPolicy: {
      games: ['paper'],
      commanderLegality: 'legal',
      sort: 'English card name, then Oracle ID',
      semanticClasses: [
        'vanilla', 'keyword-only', 'creature-template', 'land-mana-template', 'spell-template',
        'spell-v4-template',
        'permanent-template', 'artifact-template', 'enchantment-template', 'equipment-template',
        'aura-template', 'vehicle-template',
      ],
      note: 'Every non-reminder Oracle line must exactly match a central keyword or a closed executable template. Prefix/partial autoscripting is never certification.',
      compilerVersion,
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
    compilerVersion,
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
  const sourceFile = argValue(args, 'source-file', '');
  let loader = dependencies.fetchOracleCards;
  if (!loader && sourceFile) {
    const sourceUpdatedAt = argValue(args, 'source-updated-at', '');
    const sourceBulkId = argValue(args, 'source-bulk-id', '');
    const sourceSha256 = argValue(args, 'source-sha256', '');
    if (!sourceUpdatedAt || !sourceBulkId) {
      throw new Error('Pinned Oracle source requires --source-updated-at and --source-bulk-id.');
    }
    const pinnedBulk = {
      type: 'oracle_cards',
      id: sourceBulkId,
      name: 'Oracle Cards',
      updated_at: sourceUpdatedAt,
      description: state.source && state.source.bulkDescription ||
        'Pinned Scryfall Oracle Cards JSONL snapshot.',
    };
    loader = () => fetchOracleCardsFromGzip(
      path.isAbsolute(sourceFile) ? sourceFile : path.join(workspaceRoot, sourceFile),
      pinnedBulk,
      sourceSha256,
    );
  }
  loader ||= fetchOracleCards;
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
