// Additive v8 effect grammar. Every successful parse must retain the complete
// instruction; unsupported clauses and ambiguous references remain deferred.
import { extensionTarget as v7Target, extensionCount as v7Count } from './oracle-extensions-v7.mjs';
import { ORACLE_SUBTYPES } from './oracle-subtypes.mjs';
import { paymentLibraryEffect } from './oracle-v8-library.mjs';

const NUMBER = '(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|[0-9]+)';
const numbers = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const number = text => text.toUpperCase() === 'X' ? 'X' : numbers[text.toLowerCase()] ?? Number(text);
const escape = text => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const upper = text => text[0].toUpperCase() + text.slice(1);
const selfPattern = card => '(?:this (?:creature|artifact|enchantment|land|permanent|planeswalker|Vehicle|Equipment|Aura|token)|' + escape(card.name) +
  (card.name.match(/,| the /) ? '|' + escape(card.name.split(/,| the /)[0]) : '') + '|it)';
// These names are plain markers in CR 122.1, observed in the pinned Oracle
// source. Keyword, finality, hone, rad and player counters have separate rules.
const MARKER_COUNTERS = new Set(('age aim arrow awakening bait blight blaze blessing blood bloodstain book bounty bribery brick burden cage charge chorus coin collection component conqueror contested corruption corpse credit cube currency death delay depletion descent despair devotion discovery divinity doom dream echo egg elixir enlightened eon everything eyeball fade fate feather feeding fetch filibuster film fire flood foreshadow fungus fury fuse ghostform glyph gold growth harmony healing hit hope hour hourglass hunger ice impostor incarnation infection influence ingredient ingenuity invasion kick ki knowledge level lore luck magnet matrix midway mine mining nest net night oil omen ore page pain palliation petal petrification phylactery phyresis plague plan plot point polyp possession pressure prey pupa quest rejection rev rope rust saurian shell shred skewer sleep sleight slime slumber soul spite spore stash storage story study supply takeover task theft tide time tower training trap unity unlock velocity verse vitality vortex winch wish').split(' '));

function searchFilter(phrase, target) {
  const noun = phrase.trim().replace(/\bcards\b/g, 'card');
  if (/^cards?$/i.test(noun)) return null;
  if (/^basic land(?: card)?$/i.test(noun)) return { what: 'land', zone: 'graveyard', controller: 'you', basic: true };
  const union = noun.split(/,? and\/or |,? or /i);
  if (union.length > 1) {
    const alternatives = union.map(part => searchFilter(part.replace(/^(?:a|an) /i, ''), target));
    if (alternatives.every(Boolean)) return { what: 'card', zone: 'graveyard', controller: 'you', alternatives };
  }
  const color = /^(white|blue|black|red|green|colorless|multicolored|monocolored) (.+)$/i.exec(noun);
  if (color) {
    const base = /^card$/i.test(color[2]) ? { what: 'card', zone: 'graveyard', controller: 'you' } : searchFilter(color[2], target);
    if (base) return { ...base, color: color[1].toLowerCase() };
  }
  const singular = noun.replace(/ card$/i, '');
  const parsed = target('target ' + noun + ' from your graveyard') || target('target ' + singular + ' from your graveyard') ||
    target('target ' + noun) || target('target ' + singular);
  if (!parsed || parsed.zone === 'stack' || ['player', 'opponent', 'any'].includes(parsed.what)) return null;
  return { ...parsed, zone: 'graveyard', controller: 'you' };
}

function complete(body) {
  return body && Array.isArray(body.effects) && Array.isArray(body.targets);
}

// Additive activated costs whose exact object choice is made while paying the
// cost. Keep these descriptors separate from resolution payments: returning a
// land here happens before the ability reaches the Stack, and it may still be
// tapped for mana while mana abilities are paid.
export function extensionCost(text, helpers = {}, card = null) {
  const target = helpers.target || v7Target;
  const cost = {}; let special = null;
  for (const part of String(text).split(/,\s*/)) {
    if (part === '{T}' && !Object.hasOwn(cost, 'tap')) { cost.tap = true; continue; }
    if (/^(?:\{(?:\d+|X|[WUBRGC]|[WUBRG]\/[WUBRG]|[WUBRG]\/P|2\/[WUBRG])\})+$/.test(part) && !Object.hasOwn(cost, 'mana')) {
      cost.mana = part; continue;
    }
    const randomDiscard = new RegExp('^Discard (' + NUMBER + ') cards? at random$', 'i').exec(part);
    if (randomDiscard) {
      const n = number(randomDiscard[1]);
      if (special || !Number.isInteger(n) || n < 1) return null;
      cost.discardRandom = n; special = 'discardRandom'; continue;
    }
    const removeAndSacrifice = new RegExp('^Remove (' + NUMBER + ') (\\+1/\\+1|-1/-1|[a-z]+) counters? from this (creature|artifact|enchantment|land|permanent) and sacrifice it$', 'i').exec(part);
    if (removeAndSacrifice) {
      const n = number(removeAndSacrifice[1]), kind = removeAndSacrifice[2].toLowerCase();
      if (special || !Number.isInteger(n) || n < 1 || !['+1/+1', '-1/-1'].includes(kind) && !MARKER_COUNTERS.has(kind)) return null;
      cost.rmCounter = { kind, n }; cost.sacSelf = true; special = 'removeAndSacrifice'; continue;
    }
    const exert = /^Exert (.+)$/i.exec(part);
    if (exert) {
      const names = card ? [card.name, card.name.split(/,| the /)[0]] : [];
      const self = /^this creature$/i.test(exert[1]) || names.includes(exert[1]);
      if (special || !self || !card || !/Creature/.test(card.type_line || '')) return null;
      cost.exertSelf = true; special = 'exertSelf'; continue;
    }
    const returned = new RegExp('^Return (' + NUMBER + ') (.+?) you control to (?:(?:its|their) owner\\\'s hand|their owners\\\' hands)$', 'i').exec(part);
    if (!returned || special) return null;
    const n = number(returned[1]);
    if (!Number.isInteger(n) || n < 1) return null;
    const noun = singularNouns(returned[2]);
    const filter = target('target ' + noun + ' you control');
    if (!filter || filter.zone !== 'battlefield' || ['any', 'player', 'opponent'].includes(filter.what) ||
        filter.unbounded || (filter.max ?? 1) !== 1) return null;
    cost.returnFilter = filter; cost.returnN = n; special = 'returnFilter';
  }
  if (special === 'exertSelf' && !cost.tap) return null;
  return special ? cost : null;
}

function damageable(spec) {
  if (!spec || !['battlefield', 'player'].includes(spec.zone || 'battlefield')) return false;
  if (spec.alternatives) return spec.alternatives.every(damageable);
  return ['creature', 'planeswalker', 'battle', 'creature or planeswalker', 'player', 'opponent', 'player or planeswalker', 'any'].includes(spec.what);
}

const singularNouns = text => text.replace(/\b(creatures|artifacts|enchantments|lands|permanents|tokens|cards)\b/gi, word => word.slice(0, -1))
  .replace(/\b(Elves|Wolves|Dwarves|Allies)\b/gi, word => ({ elves: 'Elf', wolves: 'Wolf', dwarves: 'Dwarf', allies: 'Ally' })[word.toLowerCase()])
  .replace(/\b([A-Z][A-Za-z-]+)s\b/g, (word, base) => ORACLE_SUBTYPES.has(word) ? word : ORACLE_SUBTYPES.has(base) ? base : word);
function groupTarget(text, target) {
  let phrase = text.replace(/^(?:all |each )/i, ''), other = /^other /i.test(phrase);
  phrase = singularNouns(phrase.replace(/^other /i, '')).replace(/\b(Elves|Wolves|Dwarves|Allies)\b/g, word => ({ Elves: 'Elf', Wolves: 'Wolf', Dwarves: 'Dwarf', Allies: 'Ally' }[word]))
    .replace(/\b([A-Z][A-Za-z-]+)s\b/g, (word, base) => ORACLE_SUBTYPES.has(word) ? word : ORACLE_SUBTYPES.has(base) ? base : word)
    .replace(/^(?:Artifact|Creature|Enchantment|Land|Permanent|Planeswalker|Nonland|Nonartifact|Legendary|Nonlegendary|Nontoken|Token|Tapped|Untapped|Attacking|Blocking|White|Blue|Black|Red|Green|Colorless|Multicolored|Monocolored)\b/, word => word.toLowerCase())
    .replace(/ your opponents control$/i, ' an opponent controls').replace(/ on the battlefield$/i, '');
  const spec = target((other ? 'another ' : '') + 'target ' + phrase);
  return spec?.zone === 'battlefield' && !['player', 'opponent', 'any'].includes(spec.what) && !spec.unbounded && (spec.max ?? 1) === 1 ? spec : null;
}

function resolutionValue(text, helpers) {
  const life = /^the amount of life you (gained|lost) this turn$/i.exec(text);
  if (life) return { kind: 'turn-count', field: life[1].toLowerCase() === 'gained' ? 'lifeGained' : 'lifeLost' };
  if (/^the amount of life you gained$/i.test(text)) return { kind: 'event-amount' };
  if (new RegExp('^' + NUMBER + '$', 'i').test(text)) return number(text);
  return (helpers.count || v7Count)(text.replace(/^the number of /i, ''));
}

function resolutionPayment(card, text, helpers) {
  const target = helpers.target || v7Target;
  const alternatives = text.split(/ or (?=(?:pay|sacrifice|discard|exile|return|tap|put|remove|reveal)\b)/i);
  if (alternatives.length > 1) {
    const parsed = alternatives.map(phrase => resolutionPayment(card, phrase, helpers));
    if (parsed.every(row => row && !row.targets.length && row.payment.kind !== 'alternatives' && !row.payment.chooseX && row.payment.xValue === undefined)) return { payment: { kind: 'alternatives', choices: parsed.map(row => row.payment) }, targets: [] };
    return null;
  }
  const result = (payment, targets = []) => ({ payment, targets });
  const fixed = /^(?:pay) ((?:\{(?:\d+|[WUBRGC]|[WUBRG]\/[WUBRG]|2\/[WUBRG]|[WUBRG]\/P)\})+)$/i.exec(text);
  if (fixed) return result({ kind: 'mana', mana: fixed[1].toUpperCase() });
  const variable = /^pay ((?:\{(?:\d+|[WUBRGCX])\})+)(?:, where X is (less than or equal to )?(.+))?$/i.exec(text);
  if (variable && /\{X\}/i.test(variable[1]) && !/\{X\}/.test(card.mana_cost || '') && !/\{X\}[^.\n]*:/.test(card.oracle_text || '')) {
    const value = variable[3] ? resolutionValue(variable[3], helpers) : null;
    if (!variable[3] || value !== null && value !== undefined) return result({ kind: 'mana', mana: variable[1].toUpperCase(),
      ...(variable[3] && !variable[2] ? { xValue: value } : { chooseX: true, ...(value !== null ? { xMax: value } : {}) }) });
  }
  if (/^draw /i.test(text)) {
    const body = helpers.effect(card, upper(text) + '.');
    if (complete(body) && !body.optional && body.effects.length === 1 && body.effects[0].action === 'draw' && body.effects[0].who === 'you' && body.effects[0].n !== 'X') return result({ kind: 'draw', n: body.effects[0].n }, body.targets);
    if (/^draw cards equal to its power$/i.test(text) && !/Instant|Sorcery/.test(card.type_line) &&
        new RegExp('whenever (?:this (?:creature|permanent)|' + escape(card.name) + ') attacks, you may draw cards equal to its power', 'i').test(card.oracle_text || '')) {
      return result({ kind: 'draw', n: { kind: 'explicit-source-stat', stat: 'power' } });
    }
  }
  let m = new RegExp('^pay (' + NUMBER + ') life$', 'i').exec(text);
  if (m) return result({ kind: 'life', n: number(m[1]) });
  m = new RegExp('^pay life equal to ' + escape(card.name) + "'s (power|toughness)$", 'i').exec(text);
  if (m && card.name === '__OracleEventObject__') return result({ kind: 'life', n: { kind: 'event-card-stat', stat: m[1].toLowerCase() } });
  if (/^discard (?:your hand|all (?:the )?cards in your hand)$/i.test(text)) return result({ kind: 'discard', zone: 'hand', n: 'all', filter: { what: 'card', zone: 'graveyard', controller: 'you' } });
  m = new RegExp('^discard (' + NUMBER + ') (.+?)$', 'i').exec(text);
  if (m) {
    const filter = /^cards?$/i.test(m[2]) ? { what: 'card', zone: 'graveyard', controller: 'you' } : / cards?$/i.test(m[2]) && searchFilter(m[2], target);
    if (filter) return result({ kind: 'discard', zone: 'hand', filter, n: number(m[1]) });
  }
  m = new RegExp('^(sacrifice|return|tap) ' + selfPattern(card) + '( to its owner\\\'s hand)?$', 'i').exec(text);
  if (m && !/Instant|Sorcery/.test(card.type_line) && (m[1].toLowerCase() === 'return') === !!m[2]) return result({ kind: m[1].toLowerCase(), target: 'self', zone: 'battlefield', n: 1 });
  m = new RegExp('^sacrifice (another|' + NUMBER + ') (.+)$', 'i').exec(text);
  if (m) {
    const filter = target((m[1].toLowerCase() === 'another' ? 'another ' : '') + 'target ' + singularNouns(m[2]));
    if (filter?.zone === 'battlefield' && !['any', 'player', 'opponent'].includes(filter.what) && (filter.max ?? 1) === 1) return result({ kind: 'sacrifice', zone: 'battlefield', n: m[1].toLowerCase() === 'another' ? 1 : number(m[1]), filter });
  }
  m = new RegExp('^(return|tap) (another|' + NUMBER + ') (.+?)(?: to (?:its owner\\\'s|their owners\\\') hands?)?$', 'i').exec(text);
  if (m && / you control(?: to |$)/i.test(text) && (m[1].toLowerCase() !== 'return' || / to (?:its owner's|their owners') hands?$/i.test(text)) && (m[1].toLowerCase() !== 'tap' || /^untapped /i.test(m[3]))) {
    const filter = target((m[2].toLowerCase() === 'another' ? 'another ' : '') + 'target ' + singularNouns(m[3]));
    if (filter?.zone === 'battlefield' && !['any', 'player', 'opponent'].includes(filter.what)) return result({ kind: m[1].toLowerCase(), zone: 'battlefield', n: m[2].toLowerCase() === 'another' ? 1 : number(m[2]), filter });
  }
  m = /^(exile|return|tap) ((?:another |up to one (?:other )?)?target .+?)( to its owner's hand)?$/i.exec(text);
  if (m && (m[1].toLowerCase() === 'return') === !!m[3]) {
    const spec = target(m[2]);
    if (spec && ['battlefield', 'graveyard'].includes(spec.zone) && (spec.max ?? 1) === 1 && !spec.unbounded &&
        (m[1].toLowerCase() === 'exile' || spec.zone === 'battlefield' && spec.controller === 'you') &&
        (m[1].toLowerCase() !== 'tap' || /\buntapped\b/.test(m[2]))) return result({ kind: m[1].toLowerCase(), zone: spec.zone, target: 0, n: 1, filter: spec }, [spec]);
  }
  m = /^put ((?:up to one )?target .+?) on (?:the )?(top|bottom) of your library(?: in any order)?$/i.exec(text);
  if (m) {
    const spec = target(m[1]);
    if (spec?.zone === 'graveyard' && spec.controller === 'you' && (spec.max ?? 1) === 1 && !spec.unbounded) {
      return result({ kind: 'library', zone: 'graveyard', target: 0, n: 1, position: m[2].toLowerCase(), filter: spec }, [spec]);
    }
  }
  m = new RegExp('^remove (' + NUMBER + ') (\\+1/\\+1|-1/-1|charge|oil|time|age|lore|shield|stun) counters? from ((?:another )?target .+)$', 'i').exec(text);
  if (m) {
    const spec = target(m[3]);
    if (spec?.zone === 'battlefield' && (spec.max ?? 1) === 1 && !spec.unbounded && !['player', 'opponent', 'any'].includes(spec.what)) {
      return result({ kind: 'remove-counter', zone: 'battlefield', target: 0, n: number(m[1]), counter: m[2].toLowerCase(), filter: spec }, [spec]);
    }
  }
  m = new RegExp('^put (' + NUMBER + ') cards? (your opponents own|an opponent owns) from exile into (their owners\'|that player\'s) graveyards?$', 'i').exec(text);
  if (m) {
    const n = number(m[1]), sameOwner = m[2].toLowerCase() === 'an opponent owns';
    if (Number.isInteger(n) && n > 0 && (!sameOwner || m[3].toLowerCase() === "that player's")) return result({
      kind: 'process-exile', zone: 'exile', owner: 'opponent', n, ...(sameOwner && n > 1 ? { sameOwner: true } : {}),
    });
  }
  m = new RegExp('^exile (?:this card|' + escape(card.name) + ') from your graveyard$', 'i').exec(text);
  if (m) return result({ kind: 'exile', zone: 'graveyard', target: 'self', n: 1 });
  m = new RegExp('^(exile|reveal) (' + NUMBER + ') (.+?) from your (hand|graveyard)$', 'i').exec(text);
  if (m && (m[1].toLowerCase() !== 'reveal' || m[4].toLowerCase() === 'hand')) {
    const filter = /^cards?$/i.test(m[3]) ? { what: 'card', zone: 'graveyard', controller: 'you' } : / cards?$/i.test(m[3]) && searchFilter(m[3], target);
    if (filter) return result({ kind: m[1].toLowerCase(), zone: m[4].toLowerCase(), n: number(m[2]), filter });
  }
  m = new RegExp('^put (' + NUMBER + ') (.+?) from your hand on (?:the )?(top|bottom) of your library(?: in any order)?$', 'i').exec(text);
  if (m) {
    const filter = /^cards?$/i.test(m[2]) ? { what: 'card', zone: 'graveyard', controller: 'you' } : / cards?$/i.test(m[2]) && searchFilter(m[2], target);
    if (filter) return result({ kind: 'library', zone: 'hand', n: number(m[1]), position: m[3].toLowerCase(), filter });
  }
  m = new RegExp('^remove (' + NUMBER + ') (\\+1/\\+1|-1/-1|charge|oil|time|age|lore|shield|stun) counters? from ' + selfPattern(card) + '$', 'i').exec(text);
  if (m && !/Instant|Sorcery/.test(card.type_line)) return result({ kind: 'remove-counter', zone: 'battlefield', target: 'self', n: number(m[1]), counter: m[2].toLowerCase() });
  return null;
}

function paymentBody(card, text, payment, helpers) {
  const cardPayment = ['discard', 'sacrifice', 'return', 'exile', 'library', 'process-exile'].includes(payment.kind);
  const singularCard = cardPayment && payment.n === 1 && payment.target !== 'self';
  const quantityPayment = cardPayment || ['draw', 'life'].includes(payment.kind);
  let normalized = text, derived = null;
  const statReference = /(?:(?:its|that (?:card|creature|artifact|enchantment|land|permanent)'s|the (?:discarded|exiled|sacrificed|returned) (?:card|creature|artifact|enchantment|land|permanent)'s) (power|toughness|mana value)|the (power|toughness|mana value) of (?:it|that (?:card|creature|artifact|enchantment|land|permanent)|the (?:discarded|exiled|sacrificed|returned) (?:card|creature|artifact|enchantment|land|permanent)))/gi;
  const statMatches = [...text.matchAll(statReference)];
  if (statMatches.length) {
    if (!singularCard || /\bX\b/.test(text)) return null;
    const stats = new Set(statMatches.map(match => (match[1] || match[2]).toLowerCase()));
    if (stats.size !== 1) return null;
    const stat = [...stats][0]; derived = { kind: 'payment-stat', stat: stat === 'mana value' ? 'mv' : stat };
    normalized = normalized.replace(statReference, 'X');
  }
  if (/\bthat (?:many|much)\b/i.test(normalized)) {
    if (derived || !quantityPayment || /\bX\b/.test(text)) return null;
    derived = { kind: 'payment-count' }; normalized = normalized.replace(/\bthat (?:many|much)\b/gi, 'X');
  }
  if (derived) normalized = normalized
    .replace(/\b(draws?|discards?) cards equal to X\b/gi, '$1 X cards')
    .replace(/\b(gain|gains|lose|loses) life equal to X\b/gi, '$1 X life')
    .replace(/\bdeals damage equal to X to (.+)$/i, 'deals X damage to $1')
    .replace(/\bcreate a number of (.+?tokens) equal to X\b/i, 'create X $1');
  const paidCopy = /\b(?:a token|tokens) (?:that are |that's |that is )?(?:a |)cop(?:y|ies) of that card\b/i.test(text);
  let body;
  if (derived && /^(?:you )?discard X cards?$/i.test(normalized)) {
    body = { effects: [{ action: 'discard', who: 'you', n: derived }], targets: [], optional: false };
  } else if (derived && /^add (?:an amount of )?(\{[WUBRGC]\}) equal to X$/i.test(normalized)) {
    const symbol = /^add (?:an amount of )?(\{[WUBRGC]\}) equal to X$/i.exec(normalized)[1][1];
    body = { effects: [{ action: 'add-mana', produce: { [symbol]: 1 }, multiplier: derived }], targets: [], optional: false };
  } else {
    // This relative library threshold exists only inside Kethek's successful
    // one-creature sacrifice branch. The library parser deliberately refuses
    // the same prose without this lexical payment antecedent.
    body = payment.kind === 'sacrifice' && payment.n === 1
      ? paymentLibraryEffect(card, upper(normalized) + '.', helpers) || helpers.effect(card, upper(normalized) + '.')
      : helpers.effect(card, upper(normalized) + '.');
  }
  if (!complete(body) || body.optional) return null;
  if (derived) {
    if (/"X"/.test(JSON.stringify(body.targets))) return null;
    const bind = value => Array.isArray(value) ? value.map(bind) : value && typeof value === 'object'
      ? value.kind === 'signed' && value.value === 'X' ? { ...derived, ...(value.sign < 0 ? { multiply: -1 } : {}) }
        : Object.fromEntries(Object.entries(value).map(([key, item]) => [key, bind(item)]))
      : value === 'X' ? { ...derived } : value;
    body = { ...body, effects: body.effects.map(bind) };
    if (/"X"/.test(JSON.stringify(body.effects))) return null;
  }
  if (paidCopy) {
    if (!singularCard || body.targets.length || !body.effects.length) return null;
    let copies = 0;
    const bind = value => Array.isArray(value) ? value.map(bind) : value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).map(([key, item]) => {
        if (key === 'target' && item === 'event-card' && value.action === 'copy-token-v8') { copies++; return [key, { kind: 'paid-card', index: 0 }]; }
        return [key, bind(item)];
      })) : value;
    body = { ...body, effects: body.effects.map(bind) };
    if (copies !== 1) return null;
  }
  if (/\b(?:that (?:card|creature|artifact|enchantment|land|permanent)|the (?:discarded|exiled|sacrificed|returned) (?:card|creature|artifact|enchantment|land|permanent))\b/i.test(normalized) && !paidCopy) return null;
  return body;
}

export function resolutionCostEffect(card, line, helpers) {
  const m = /^(You may )?(.+?)\. If you (do|don't|do not), (.+)\.$/i.exec(line);
  if (!m) return null;
  const cost = resolutionPayment(card, m[2], helpers);
  if (!cost) return null;
  const limit = /^(.+)\. X can't be greater than (.+)$/i.exec(m[4]);
  if (limit) {
    const value = resolutionValue(limit[2], helpers);
    if (cost.payment.kind !== 'mana' || !cost.payment.chooseX || value === null || value === undefined) return null;
    cost.payment.xMax = value;
  }
  const parts = (limit ? limit[1] : m[4]).split(/\. (?:If you don't, |If you do not, |Otherwise, )/i);
  if (parts.length > 2 || parts.length > 1 && m[3].toLowerCase() !== 'do') return null;
  if (cost.payment.chooseX && (m[3].toLowerCase() !== 'do' || parts.length > 1)) return null;
  if (parts.slice(1).some(part => /\b(?:its (?:power|toughness|mana value)|that (?:card|creature|permanent)|that (?:many|much)|the (?:discarded|exiled|sacrificed|returned) (?:card|creature|permanent))\b/i.test(part))) return null;
  // A selected cost object needs an explicit binding for later references.
  // Never silently reinterpret the discarded/exiled card as the source.
  const parsed = parts.map((part, index) => index === 0 && m[3].toLowerCase() === 'do'
    ? paymentBody(card, part, cost.payment, helpers) : helpers.effect(card, upper(part) + '.'));
  if (!parsed.every(complete)) return null;
  // A value chosen only while resolving cannot retroactively define a
  // targeting restriction that had to be checked while stacking the object.
  if (cost.payment.chooseX && parsed.some(body => JSON.stringify(body.targets).includes('"X"'))) return null;
  if (JSON.stringify(parsed).includes('"kind":"sacrificed-stat"') && !(cost.payment.kind === 'sacrifice' && cost.payment.n === 1)) return null;
  const shift = (value, offset) => Array.isArray(value) ? value.map(item => shift(item, offset)) : value && typeof value === 'object'
    ? value.kind === 'paid-card' ? value
      : Object.fromEntries(Object.entries(value).map(([key, item]) => [key, ['target', 'otherTarget', 'sourceTarget', 'who', 'conditionTarget', 'index'].includes(key) && typeof item === 'number' ? item + offset : shift(item, offset)])) : value;
  const success = m[3].toLowerCase() === 'do';
  const targets = [...cost.targets], branches = parsed.map(body => {
    const effects = shift(body.effects, targets.length); targets.push(...body.targets); return { effects, optional: body.optional };
  });
  return { targets, optional: false, effects: [{ action: 'resolution-cost', payment: cost.payment, optional: !!m[1],
    effects: success ? branches[0].effects : [], ...(success && branches[0].optional ? { effectsOptional: true } : {}),
    ...(!success || branches[1] ? { elseEffects: branches[success ? 1 : 0].effects, ...(branches[success ? 1 : 0].optional ? { elseEffectsOptional: true } : {}) } : {}),
  }] };
}

export function extensionEffect(card, line, helpers) {
  if (typeof line !== 'string' || !line.endsWith('.')) return null;
  // "Sacrifice it unless <mana> was spent to cast it" is a printed condition on
  // how the spell was paid for, not an optional payment on resolution.
  const unlessSpent = /^Sacrifice (?:it|this (?:creature|artifact|enchantment|permanent))(?: unless|, unless) ((?:\{[WUBRGC]\})+) was spent to cast (?:it|this spell)\.$/i.exec(line);
  if (unlessSpent) {
    const colors = [...unlessSpent[1].matchAll(/\{([WUBRGC])\}/g)].map(match => match[1]);
    return { effects: [{ action: 'conditional', condition: { kind: 'not', condition: { kind: 'mana-spent', colors } },
      effects: [{ action: 'sacrifice-source' }] }], targets: [], optional: false };
  }
  // A transforming permanent swaps to its other printed face and keeps its
  // physical identity. Only the self reference is closed here.
  if (/^Transform (?:this (?:creature|artifact|enchantment|land|permanent|planeswalker|battle)|~)\.$/i.test(line)
    || (card?.name && new RegExp('^Transform ' + card.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\.$', 'i').test(line))) {
    return { effects: [{ action: 'transform-self' }], targets: [], optional: false };
  }
  // A printed hand reveal shows the cards to the table (or privately to you)
  // and changes no zone. Its only closed shapes are the whole hand and one
  // card taken at random.
  const handReveal = /^(?:(Target (?:opponent|player)) reveals their hand|Look at (target (?:opponent|player))'s hand)\.$/i.exec(line);
  if (handReveal) {
    const look = !!handReveal[2];
    const phrase = (handReveal[1] || handReveal[2]).toLowerCase();
    const spec = (helpers.target || v7Target)(phrase);
    if (spec) return { effects: [{ action: 'reveal-hand', who: 0, ...(look ? { look: true } : {}) }], targets: [spec], optional: false };
  }
  const randomReveal = /^(Target (?:opponent|player)) reveals a card at random from their hand\.$/i.exec(line);
  if (randomReveal) {
    const spec = (helpers.target || v7Target)(randomReveal[1].toLowerCase());
    if (spec) return { effects: [{ action: 'reveal-random-card', who: 0 }], targets: [spec], optional: false };
  }
  const resolutionCost = resolutionCostEffect(card, line, helpers);
  if (resolutionCost) return resolutionCost;
  let text = line.slice(0, -1), optional = false;
  if (/^you may /i.test(text)) { text = text.slice(8); optional = true; }
  const target = helpers.target || v7Target;
  const damageTarget = phrase => /^any target$/i.test(phrase)
    ? { what: 'any', zone: 'battlefield', controller: 'any', min: 1, max: 1 } : target(phrase);
  const count = helpers.count || v7Count;
  const result = (effects, targets = []) => ({ effects, targets, optional });
  const parse = candidate => helpers.effect(card, upper(candidate) + '.');

  // CR 508.4 supplies a defender choice for each creature created attacking.
  // Printed "that player" restrictions are a different binding and are not
  // discarded by this unqualified adapter.
  const attackingSuffix = /^(create .+?) (?:that's|that are) (tapped and )?attacking(, where X is .+)?$/i.exec(text);
  const attackingPrefix = new RegExp('^create (' + NUMBER + '|X) (tapped and )?attacking (.+)$', 'i').exec(text);
  if (attackingSuffix || attackingPrefix) {
    const normalized = attackingSuffix ? attackingSuffix[1] + (attackingSuffix[3] || '') : 'create ' + attackingPrefix[1] + ' ' + attackingPrefix[3];
    const body = parse(normalized), effect = body?.effects?.[0];
    if (complete(body) && !body.optional && !body.targets.length && body.effects.length === 1 &&
        effect.action === 'token-inline' && effect.token.types.includes('Creature')) {
      return result([{ ...effect, attacking: true, tapped: !!(attackingSuffix?.[2] || attackingPrefix?.[2] || effect.tapped) }]);
    }
  }

  const objectReference = phrase => {
    if (new RegExp('^' + selfPattern(card) + '$', 'i').test(phrase)) return { target: 'self', targets: [] };
    if (/^that (?:creature|artifact|enchantment|land|permanent|card|token)$/i.test(phrase)) return { target: 'event-card', targets: [] };
    const spec = target(phrase);
    return spec?.zone === 'battlefield' && !['any', 'player', 'opponent', 'player or planeswalker'].includes(spec.what) ? { target: 0, targets: [spec] } : null;
  };
  const delayedInstruction = candidate => {
    const timing = /^(.+?) (at end of combat|at the beginning of (?:the|your) next end step)$/i.exec(candidate);
    if (!timing) return null;
    let operation, reference, counter, n;
    let action = /^(destroy|exile|sacrifice) (.+)$/i.exec(timing[1]);
    if (action) { operation = action[1].toLowerCase(); reference = objectReference(action[2]); }
    else if ((action = /^return (.+?) to its owner's hand$/i.exec(timing[1]))) { operation = 'bounce'; reference = objectReference(action[1]); }
    else if ((action = new RegExp('^(put|remove) (' + NUMBER + ') (\\+1/\\+1|-1/-1|[a-z]+) counters? (on|from) (.+)$', 'i').exec(timing[1]))) {
      counter = action[3].toLowerCase();
      if (!['+1/+1', '-1/-1'].includes(counter) && !MARKER_COUNTERS.has(counter) || (action[1].toLowerCase() === 'put') !== (action[4].toLowerCase() === 'on')) return null;
      operation = action[1].toLowerCase() === 'put' ? 'counter' : 'remove-counter'; n = number(action[2]); reference = objectReference(action[5]);
    }
    if (!reference) return null;
    return { targets: reference.targets, effect: { action: 'delayed-object', target: reference.target, operation,
      on: /combat/i.test(timing[2]) ? 'endCombat' : 'endStep', ...(/your next/i.test(timing[2]) ? { your: true } : {}), ...(counter ? { counter, n } : {}) } };
  };
  const deferred = delayedInstruction(text);
  if (deferred) return result([deferred.effect], deferred.targets);

  // A token's delayed departure is bound to precisely the newly made tokens,
  // including replacements that make more than one. Never bind a free-standing
  // token pronoun to the source of the ability.
  const createdDelay = /^(Create .+?)\. ((?:Exile|Sacrifice) (?:it|them|that token|those tokens|the token|the tokens) (?:at end of combat|at the beginning of (?:the|your) next end step))$/i.exec(text);
  if (createdDelay) {
    const head = parse(createdDelay[1]), tail = delayedInstruction(createdDelay[2].replace(/^(Exile|Sacrifice) (?:it|them|that token|those tokens|the token|the tokens) /i, '$1 it '));
    if (complete(head) && !head.optional && !head.targets.length && head.effects.length === 1 && ['token-key', 'token-inline'].includes(head.effects[0].action) && tail) {
      return result([...head.effects, { ...tail.effect, target: 'created-tokens' }]);
    }
  }
  const combatRemoval = /^remove (.+?) from combat$/i.exec(text);
  if (combatRemoval) {
    const reference = objectReference(combatRemoval[1]);
    if (reference && (!reference.targets.length || reference.targets[0].what === 'creature')) return result([{ action: 'remove-from-combat', target: reference.target }], reference.targets);
  }
  const nextUntap = /^(.+?) (?:doesn't|don't) untap during (?:its controller's next untap step|their controllers' next untap steps)$/i.exec(text);
  if (nextUntap) {
    const reference = objectReference(nextUntap[1]);
    if (reference) return result([{ action: 'skip-next-untap', target: reference.target }], reference.targets);
  }
  const tapFreeze = /^(Tap .+?)\. (?:They|Those (?:creatures|artifacts|lands|permanents)) don't untap during their controllers?' next untap steps?$/i.exec(text);
  if (tapFreeze) {
    const head = parse(tapFreeze[1]), first = head?.effects?.[0];
    if (complete(head) && !head.optional && head.effects.length === 1) {
      if (first.action === 'tap') return result([first, { action: 'skip-next-untap', target: first.target }], head.targets);
      if (first.action === 'battlefield-group' && first.operation === 'tap' && !head.targets.length) return result([{
        action: 'group-sequence', filters: first.filters, effects: [{ action: 'tap', target: 'affected-group' }, { action: 'skip-next-untap', target: 'affected-group' }],
      }]);
    }
  }

  const marker = new RegExp('^(put|remove) (' + NUMBER + '|X) ([a-z]+) counters? (on|from) (.+)$', 'i').exec(text);
  if (marker && MARKER_COUNTERS.has(marker[3].toLowerCase()) && (marker[1].toLowerCase() === 'put') === (marker[4].toLowerCase() === 'on')) {
    const own = new RegExp('^' + selfPattern(card) + '$', 'i').test(marker[5]), spec = own ? null : target(marker[5]);
    if (own && !/Instant|Sorcery/.test(card.type_line) || spec?.zone === 'battlefield') return result([{
      action: marker[1].toLowerCase() === 'put' ? 'counter' : 'remove-counter', target: own ? 'self' : 0, counter: marker[3].toLowerCase(), n: number(marker[2]),
    }], spec ? [spec] : []);
    if (marker[1].toLowerCase() === 'put' && /^each /i.test(marker[5])) {
      const filter = groupTarget(marker[5], target);
      if (filter) return result([{ action: 'battlefield-group', operation: 'counter', filters: [filter], counter: marker[3].toLowerCase(), n: number(marker[2]) }]);
    }
  }

  let playerCounter = new RegExp('^(you|each player|each opponent|target player|target opponent|that player|its controller|its owner|defending player) gets? (' + NUMBER + '|X) poison counters?$', 'i').exec(text);
  if (playerCounter) {
    const subject = playerCounter[1].toLowerCase(), spec = /^target /.test(subject) ? target(subject) : null;
    const who = spec ? 0 : ({ 'that player': 'event-player', 'its controller': 'event-card-controller', 'its owner': 'event-card-owner', 'defending player': 'event-player' }[subject] || subject.replaceAll(' ', '-'));
    if (!/^target /.test(subject) || spec?.zone === 'player') return result([{ action: 'player-counter', who, counter: 'poison', n: number(playerCounter[2]) }], spec ? [spec] : []);
  }

  // These predicates share a single grammatical player subject. Repeating
  // that subject for parsing must not ask for a fresh target for each verb.
  const playerSequence = /^(you|each player|each opponent|target player|target opponent|that player|its controller|its owner) ((?:draws?|gains?|loses?|mills?|discards?|gets?) .+)$/i.exec(text);
  if (playerSequence && /,| and | then /i.test(playerSequence[2])) {
    const clauses = playerSequence[2].split(/,? (?:and |then )(?=(?:draws?|gains?|loses?|mills?|discards?|gets?)\b)|, (?=(?:draws?|gains?|loses?|mills?|discards?|gets?)\b)/i);
    if (clauses.length > 1) {
      const bodies = clauses.map(clause => parse(playerSequence[1] + ' ' + clause));
      const sameTargets = (first, second) => first.length === second.length && first.every((spec, index) => {
        const other = second[index];
        return spec.zone === 'player' && other.zone === 'player' && spec.what === other.what && (spec.min ?? 1) === (other.min ?? 1) && (spec.max ?? 1) === (other.max ?? 1) && (spec.controller || 'any') === (other.controller || 'any');
      });
      if (bodies.every(body => complete(body) && !body.optional && body.effects.length === 1 && ['draw', 'gain-life', 'lose-life', 'mill', 'discard', 'player-counter'].includes(body.effects[0].action)) &&
          bodies.every(body => sameTargets(body.targets, bodies[0].targets) && body.effects[0].who === bodies[0].effects[0].who)) {
        return result(bodies.flatMap(body => body.effects), bodies[0].targets);
      }
    }
  }

  // A following "they" or "each of them" retains the initial set of
  // affected objects. It never re-selects a group after the first effect.
  const groupSequence = /^(.+?)\. ((?:They\b|Put\b|Untap them\b|Tap them\b).*)$/i.exec(text);
  if (groupSequence) {
    const head = parse(groupSequence[1]), first = head?.effects?.[0];
    if (complete(head) && !head.optional && !head.targets.length && head.effects.length === 1 && first.action === 'battlefield-group' && ['tap', 'untap', 'pump', 'counter'].includes(first.operation)) {
      const clauses = groupSequence[2].split(/\. /), effects = [{ ...first, action: first.operation, target: 'affected-group' }];
      delete effects[0].operation; delete effects[0].filters;
      let valid = true;
      for (const clause of clauses) {
        const normalized = clause.replace(/^They (gain|have|get) /i, (_, verb) => 'Target creature ' + ({ gain: 'gains', have: 'has', get: 'gets' }[verb.toLowerCase()]) + ' ')
          .replace(/^(Put .+ on) each of them$/i, '$1 target creature').replace(/^(Untap|Tap) them$/i, '$1 target creature');
        if (normalized === clause) { valid = false; break; }
        const body = parse(normalized);
        if (!complete(body) || body.optional || body.targets.length !== 1 || body.effects.some(effect => !['tap', 'untap', 'pump', 'counter', 'base-pt', 'cant-block-until-eot', 'unblockable-until-eot'].includes(effect.action) || effect.target !== 0) || /"kind":"target-(?:stat|count)"/.test(JSON.stringify(body.effects))) { valid = false; break; }
        effects.push(...body.effects.map(effect => ({ ...effect, target: 'affected-group' })));
      }
      if (valid) return result([{ action: 'group-sequence', filters: first.filters, effects }]);
    }
  }

  const grouped = /^(.+?) (gain|have|get) (.+)$/i.exec(text);
  if (grouped) {
    const spec = groupTarget(grouped[1], target), body = spec && parse('Target creature ' + ({ gain: 'gains', have: 'has', get: 'gets' }[grouped[2].toLowerCase()]) + ' ' + grouped[3]);
    if (complete(body) && !body.optional && body.targets.length === 1 && body.effects.length === 1 && body.effects[0].action === 'pump' && body.effects[0].target === 0) {
      const effect = { ...body.effects[0], action: 'battlefield-group', operation: 'pump', filters: [spec] }; delete effect.target;
      return result([effect]);
    }
  }

  const groupCounterX = /^put X (\+1\/\+1|-1\/-1|charge) counters on (each .+)$/i.exec(text);
  if (groupCounterX) {
    const body = parse('put one ' + groupCounterX[1] + ' counter on ' + groupCounterX[2]);
    if (complete(body) && body.effects.length === 1 && (body.effects[0].action === 'counter-group' || body.effects[0].action === 'battlefield-group' && body.effects[0].operation === 'counter')) {
      return { ...body, optional, effects: [{ ...body.effects[0], n: 'X' }] };
    }
  }

  if (/^then /i.test(text)) {
    const body = parse(text.slice(5));
    if (complete(body)) return { ...body, optional: optional || body.optional };
  }
  if (!/Instant|Sorcery/.test(card.type_line) && new RegExp('^return ' + selfPattern(card) + ' to (?:its owner\\\'s|your) hand$', 'i').test(text)) {
    // Non-targeted source returns still lock the originating battlefield
    // incarnation. A stolen permanent always goes to its owner's hand.
    if (/ to your hand$/i.test(text)) return null;
    return result([{ action: 'bounce', target: 'self' }]);
  }

  let sacrificeValue = /^(.+?) equal to (?:the (power|toughness|mana value) of the sacrificed (?:creature|artifact|permanent)|the sacrificed (?:creature|artifact|permanent)'s (power|toughness|mana value))$/i.exec(text);
  if (sacrificeValue) {
    const head = sacrificeValue[1].replace(/draw cards$/i, 'draw 1 card').replace(/draws cards$/i, 'draws 1 card').replace(/(gain|gains|lose|loses) life$/i, '$1 1 life');
    const body = head !== sacrificeValue[1] && parse(head), stat = (sacrificeValue[2] || sacrificeValue[3]).toLowerCase();
    if (complete(body) && body.effects.length === 1 && ['draw', 'gain-life', 'lose-life'].includes(body.effects[0].action)) return { ...body, optional: optional || body.optional,
      effects: [{ ...body.effects[0], n: { kind: 'sacrificed-stat', stat: stat === 'mana value' ? 'mv' : stat } }] };
  }

  let aggregate = /^(.+?)(?:\. You| and you) gain life equal to the (?:total )?life lost this way$/i.exec(text);
  if (aggregate) {
    const loss = parse(aggregate[1]);
    if (complete(loss) && !loss.optional && loss.effects.length === 1 && loss.effects[0].action === 'lose-life') return result([
      ...loss.effects, { action: 'gain-life', who: 'you', n: { kind: 'life-lost' } },
    ], loss.targets);
  }
  const destroyedType = (head, quality) => {
    if (!complete(head) || head.optional || head.effects.length !== 1) return false;
    const effect = head.effects[0];
    const filters = effect.action === 'destroy' && typeof effect.target === 'number' ? [head.targets[effect.target]]
      : effect.action === 'battlefield-group' && effect.operation === 'destroy' ? effect.filters : null;
    const matches = spec => quality === 'permanent' || spec.alternatives ? (quality === 'permanent' || spec.alternatives.every(matches)) : spec.what === quality;
    return filters?.length > 0 && filters.every(matches);
  };
  aggregate = /^(.+?)\. (.+?) for each (permanent|creature|artifact|enchantment|land) destroyed this way$/i.exec(text);
  if (aggregate) {
    const destruction = parse(aggregate[1]), following = parse(aggregate[2]);
    if (destroyedType(destruction, aggregate[3].toLowerCase()) && complete(following) && !following.optional && !following.targets.length && following.effects.length === 1 &&
        ['draw', 'gain-life', 'lose-life', 'mill', 'counter', 'token-inline'].includes(following.effects[0].action) && typeof following.effects[0].n === 'number') {
      return result([...destruction.effects, { ...following.effects[0], n: { kind: 'destroyed-count', multiply: following.effects[0].n } }], destruction.targets);
    }
  }
  aggregate = /^(.+?)\. (Create .+?), where X is the number of (permanents|creatures|artifacts|enchantments|lands) destroyed this way$/i.exec(text);
  if (aggregate) {
    const destruction = parse(aggregate[1]), token = parse(aggregate[2]);
    if (destroyedType(destruction, aggregate[3].toLowerCase().slice(0, -1)) && complete(token) && !token.optional && !token.targets.length && token.effects.length === 1 &&
        token.effects[0].action === 'token-inline' && token.effects[0].token?.power === 'X' && token.effects[0].token?.toughness === 'X' && !token.effects[0].token.operations) return result([
      ...destruction.effects, { ...token.effects[0], token: { ...token.effects[0].token, power: { kind: 'destroyed-count' }, toughness: { kind: 'destroyed-count' } } },
    ], destruction.targets);
  }

  // Oracle's repeated "you" does not change the subject of the individual
  // life/draw instructions. Preserve the entire sentence for the old parser.
  if (/^you /i.test(text)) {
    const normalized = text.replace(/((?:,? and|,? then)) you (?=(?:draw|gain|lose|mill|discard)\b)/gi, '$1 ');
    if (normalized !== text) {
      const body = parse(normalized);
      if (complete(body)) return { ...body, optional: optional || body.optional };
    }
  }

  // A hidden-zone search is one complete instruction. Search choices remain
  // non-targeted, and the revealed or named filter is never dropped.
  let m = new RegExp('^search your library for (up to ' + NUMBER + '|' + NUMBER + '|X|up to X) (.+?)(?:, | and )' +
    '(?:reveal (?:it|them|that card|those cards)(?:, | and ))?' +
    'put (?:it|them|that card|those cards) (into your hand|into your graveyard|onto the battlefield(?: tapped)?)' +
    '(?:, then shuffle(?: your library)?|\\. Then shuffle(?: your library)?)$', 'i').exec(text);
  if (m) {
    const quantity = m[1].replace(/^up to /i, ''), n = number(quantity), noun = m[2];
    const named = /^cards? named (.+)$/i.exec(noun);
    const filter = named ? null : searchFilter(noun, target);
    const unrestricted = /^cards?$/i.test(noun);
    // A named lookup must not absorb a failed reveal/exile instruction into
    // the name. Comma-bearing names stay deferred until explicitly resolved.
    const name = named && !/[,;\n]| or | and |\. /i.test(named[1]) ? named[1] : null;
    // Ordinary unqualified search requires finding as many cards as possible;
    // "up to" on that search needs a separate runtime minimum descriptor.
    if ((!unrestricted && !filter && !name) || (/^up to /i.test(m[1]) && unrestricted)) return null;
    if (m[3].startsWith('onto') && unrestricted) return null;
    if (filter && filter.zone !== 'graveyard') return null;
    return result([{ action: 'search-library', what: 'card', n, maxMv: null,
      ...(filter ? { filter } : {}), ...(name ? { name } : {}),
      destination: m[3].includes('hand') ? 'hand' : m[3].includes('graveyard') ? 'graveyard' : 'battlefield',
      tapped: m[3].endsWith(' tapped'), reveal: /, reveal | and reveal /i.test(text) }]);
  }

  // The same complete search may spell out the identified card as the direct
  // object. Do not replace pronouns in arbitrary text or conditional branches.
  if (/^search your library for /i.test(text)) {
    const normalized = text
      .replace(/, put that card (into your hand|onto the battlefield(?: tapped)?), then shuffle$/i, ', put it $1, then shuffle')
      .replace(/, reveal that card, put it /i, ', reveal it, put it ')
      .replace(/, then shuffle your library$/i, ', then shuffle');
    if (normalized !== text) {
      const body = parse(normalized);
      if (complete(body)) return { ...body, optional: optional || body.optional };
    }
  }

  // X's definition may be printed between the search/inspection and its
  // remaining instructions. Move only that complete definition, retaining
  // the closed ordinary value parser and every following instruction.
  m = /^(look at the top X cards of your library|reveal the top X cards of your library), where X is ([^.]+)\. (.+)$/i.exec(text);
  if (m) {
    const body = parse(m[1] + '. ' + m[3] + ', where X is ' + m[2]);
    if (complete(body)) return { ...body, optional: optional || body.optional };
  }
  m = /^(search your library for up to X .+?), where X is ([^.]+)\. (Put (?:those cards|them) .+)$/i.exec(text);
  if (m) {
    const body = parse(m[1] + ', ' + m[3][0].toLowerCase() + m[3].slice(1) + ', where X is ' + m[2]);
    if (complete(body)) return { ...body, optional: optional || body.optional };
  }
  m = new RegExp('^search your library for (any number of|up to ' + NUMBER + '|' + NUMBER + ') (.+?), exile (?:it|them|those cards), then shuffle(?: your library)?$', 'i').exec(text);
  if (m) {
    const unrestricted = /^cards?$/i.test(m[2]), filter = unrestricted ? null : searchFilter(m[2], target);
    if ((unrestricted || filter) && !(unrestricted && /^(?:any number|up to)/i.test(m[1]))) {
      return result([{ action: 'search-library', what: 'card', ...(filter ? { filter } : {}), maxMv: null,
        n: m[1].toLowerCase() === 'any number of' ? { kind: 'count', zone: 'library', what: 'card', controller: 'you' } : number(m[1].replace(/^up to /i, '')),
        destination: 'exile', reveal: false }]);
    }
  }

  // A target's characteristic is read on resolution. The actual target still
  // participates in cast legality and the usual all-targets-illegal rule.
  m = /^((?:destroy|exile|return) target .+?)\. (?:You )?(draw cards|gain life|lose life) equal to its (power|toughness|mana value)$/i.exec(text);
  if (m) {
    const removal = parse(m[1]);
    if (complete(removal) && removal.effects.length === 1 && removal.targets.length === 1 &&
        ['destroy', 'exile', 'bounce'].includes(removal.effects[0].action) && removal.effects[0].target === 0 &&
        removal.targets[0].zone === 'battlefield' && (removal.targets[0].max ?? 1) === 1 && !removal.targets[0].unbounded) {
      return result([...removal.effects, {
        action: m[2].toLowerCase().startsWith('draw') ? 'draw' : m[2].toLowerCase().startsWith('gain') ? 'gain-life' : 'lose-life',
        who: 'you', n: { kind: 'target-stat', target: 0, stat: m[3].toLowerCase() === 'mana value' ? 'mv' : m[3].toLowerCase() },
      }], removal.targets);
    }
  }
  m = /^(?:you )?(draw cards|gain life|lose life) equal to (?:the (power|toughness|mana value) of (target .+?)|(target .+?)'s (power|toughness|mana value))$/i.exec(text);
  if (m) {
    const spec = target(m[3] || m[4]), stat = m[2] || m[5];
    if (spec?.zone === 'battlefield' && (spec.max ?? 1) === 1 && !spec.unbounded) return result([{
      action: m[1].toLowerCase().startsWith('draw') ? 'draw' : m[1].toLowerCase().startsWith('gain') ? 'gain-life' : 'lose-life',
      who: 'you', n: { kind: 'target-stat', target: 0, stat: stat.toLowerCase() === 'mana value' ? 'mv' : stat.toLowerCase() },
    }], [spec]);
  }

  // One damage instruction can contain several recipients. Keep it as one
  // batch so lifelink, shield counters and damage-trigger conditions observe
  // the complete simultaneous event, including legal shared targets.
  m = new RegExp('^' + selfPattern(card) + ' deals (' + NUMBER + '|X) damage to (.+?) and (' + NUMBER + '|X) damage to (.+)$', 'i').exec(text);
  if (m) {
    const targets = [];
    const recipient = phrase => {
      if (/^you$/i.test(phrase)) return 'you';
      if (/^(?:itself|this creature|this artifact|this permanent)$/i.test(phrase) && !/Instant|Sorcery/.test(card.type_line)) return 'self';
      const other = /^any other target$/i.test(phrase), spec = damageTarget(other ? 'any target' : phrase);
      if (!damageable(spec)) return null;
      if (other) spec.differentFromPrevious = true;
      targets.push(spec); return targets.length - 1;
    };
    const first = recipient(m[2]), second = recipient(m[4]);
    if (first !== null && second !== null) return result([{ action: 'damage-batch', hits: [
      { target: first, n: number(m[1]) }, { target: second, n: number(m[3]) },
    ] }], targets);
  }
  m = new RegExp('^' + selfPattern(card) + ' deals (' + NUMBER + '|X) damage to each opponent and each (.+?) they control$', 'i').exec(text);
  if (m) {
    const filters = m[2].split(/,? and |, /i).map(noun => target('target ' + noun + ' an opponent controls'));
    if (filters.length && filters.every(damageable)) return result([{ action: 'damage-batch', hits: [
      { filters, players: 'each-opponent', n: number(m[1]) },
    ] }]);
  }
  m = /^each creature deals damage to itself equal to its (power|toughness)$/i.exec(text);
  if (m) return result([{ action: 'damage-batch', hits: [
    { filters: [target('target creature')], selfDamageStat: m[1].toLowerCase() },
  ] }]);
  m = /^(target .+?) deals damage equal to its (power|toughness) to (.+)$/i.exec(text);
  if (m) {
    const source = target(m[1]), other = /^(?:any other|another|other) target /i.test(m[3]);
    const recipient = damageTarget(m[3].replace(/^any other target$/i, 'any target').replace(/^(?:another|other) target /i, 'target '));
    if (source?.zone === 'battlefield' && source.what === 'creature' && (source.max ?? 1) === 1 && !source.unbounded && damageable(recipient)) {
      if (other) { delete recipient.excludeSelf; recipient.differentFromPrevious = true; }
      return result([{ action: 'damage-batch', hits: [
        { sourceTarget: 0, target: 1, n: { kind: 'target-stat', target: 0, stat: m[2].toLowerCase() } },
      ] }], [source, recipient]);
    }
  }
  m = /^choose (target creature you control) and (target creature an opponent controls)\. Each of those creatures deals damage equal to its (power|toughness) to the other$/i.exec(text);
  if (m) return result([{ action: 'damage-batch', hits: [
    { sourceTarget: 0, target: 1, n: { kind: 'target-stat', target: 0, stat: m[3].toLowerCase() } },
    { sourceTarget: 1, target: 0, n: { kind: 'target-stat', target: 1, stat: m[3].toLowerCase() } },
  ] }], [target(m[1]), target(m[2])]);
  m = /^(.+)\. You gain life equal to the damage dealt this way$/i.exec(text);
  if (m) {
    const damage = parse(m[1]);
    if (complete(damage) && !damage.optional && damage.effects.length === 1 &&
        (['damage', 'damage-batch'].includes(damage.effects[0].action) ||
         damage.effects[0].action === 'battlefield-group' && damage.effects[0].operation === 'damage')) {
      return result([...damage.effects, { action: 'gain-life', who: 'you', n: { kind: 'damage-dealt' } }], damage.targets);
    }
  }

  // "Itself" is the selected damage source and recipient. Reusing bite keeps
  // deathtouch, lifelink, protection and indestructible in normal damage paths.
  m = /^(target .+?) deals damage to itself equal to its (power|toughness)$/i.exec(text);
  if (m) {
    const spec = target(m[1]);
    if (spec?.zone === 'battlefield' && spec.what === 'creature' && (spec.max ?? 1) === 1 && !spec.unbounded) {
      return result([{ action: 'bite', target: 0, otherTarget: 0, stat: m[2].toLowerCase(), multiplier: 1 }], [spec]);
    }
  }

  // Each owner orders their moved cards on resolution (CR 401.4). Target
  // selection order is not a substitute for this separate ordering decision.
  m = new RegExp('^(?:return|put) ((?:(?:up to )?' + NUMBER + ' |any number of )?target .+?) (?:to|on) (?:the )?(top|bottom) of (your|its owner\\\'s) library(?: in any order)?$', 'i').exec(text);
  if (m) {
    const spec = target(m[1]);
    if (spec && ['graveyard', 'battlefield'].includes(spec.zone) &&
        (m[3] !== 'your' || spec.controller === 'you' || spec.owner === 'you')) {
      return result([{ action: 'move-to-library', target: 0, bottom: m[2].toLowerCase() === 'bottom',
        ...((spec.max ?? 1) > 1 || spec.unbounded ? { ownerOrders: true } : {}) }], [spec]);
    }
  }
  m = new RegExp('^put ' + selfPattern(card) + ' on (?:the )?(top|bottom) of its owner\\\'s library$', 'i').exec(text);
  if (m && !/Instant|Sorcery/.test(card.type_line)) return result([{ action: 'move-to-library', target: 'self', bottom: m[1].toLowerCase() === 'bottom' }]);

  // Complete top-library selection wording. All unselected cards have an
  // explicit destination; a missing suffix never becomes a supported effect.
  m = new RegExp('^(look at|reveal) the top (' + NUMBER + '|X) cards? of your library\\. ' +
    '(You may put|Put) (' + NUMBER + ') (?:of (?:them|those cards)|cards? from among them) into your hand' +
    '(?: and (?:put )?the (rest|other)|\\. Put the (rest|other)(?: of the cards)?) ' +
    '(into your graveyard|on the bottom of your library(?: in (any|a random) order)?)$', 'i').exec(text);
  if (m && (!(m[5] === 'other' || m[6] === 'other') || typeof number(m[2]) === 'number' && number(m[2]) - number(m[4]) === 1)) return result([{ action: 'look-select', n: number(m[2]), what: 'card', max: number(m[4]),
    required: m[3].toLowerCase() === 'put', revealAll: m[1].toLowerCase() === 'reveal',
    rest: m[7].startsWith('into') ? 'graveyard' : 'bottom', random: m[8] === 'a random' }]);
  m = new RegExp('^(look at|reveal) the top (' + NUMBER + '|X) cards? of your library\\. You may reveal (?:a|an) (.+?) card from among (?:them|those cards) and put (?:it|that card) into your hand\\. Put the rest(?: of (?:those |the )?cards)? on the bottom of your library in (any|a random) order$', 'i').exec(text);
  if (m) {
    const filter = searchFilter(m[3] + ' card', target);
    if (filter) return result([{ action: 'look-select', n: number(m[2]), what: 'card', filter, max: 1,
      required: false, revealAll: m[1].toLowerCase() === 'reveal', reveal: true, rest: 'bottom', random: m[4] === 'a random' }]);
  }
  if (/^(look at|reveal) the top /i.test(text)) {
    const normalized = text.replace(/one of those cards/gi, 'one of them').replace(/from among (?:those|the revealed) cards/gi, 'from among them')
      .replace(/the rest of (?:those|the revealed) cards/gi, 'the rest')
      .replace(/\. You may reveal (a|an) (.+?) card from among them\. If you do, put it into your hand\. Put the rest /i,
        '. You may reveal $1 $2 card from among them and put it into your hand. Put the rest ');
    if (normalized !== text) {
      const body = parse(normalized);
      if (complete(body)) return { ...body, optional: optional || body.optional };
    }
  }

  // Generalized existing numeric-count actions use the same closed selector
  // hook as the v8 permanent parser. Never infer a player from an unbound "they".
  const actionFor = verb => ({ draw: 'draw', gain: 'gain-life', lose: 'lose-life', mill: 'mill', discard: 'discard' })[verb.toLowerCase().replace(/s$/, '')];
  const matchingUnit = (verb, unit) => /^(?:gain|lose)/i.test(verb) ? unit.toLowerCase() === 'life' : /^cards?$/i.test(unit);
  m = new RegExp('^(each player|each opponent|target player|target opponent) (draws|gains|loses|mills|discards) (' + NUMBER + ') (cards?|life) for each (.+)$', 'i').exec(text);
  if (m && matchingUnit(m[2], m[4])) {
    const relative = m[5].replace(/ they control$/i, ' you control').replace(/\btheir (hand|graveyard)$/i, 'your $1');
    const value = relative !== m[5] ? count(relative) : null;
    const targeted = /^target /i.test(m[1]), spec = targeted ? target(m[1].toLowerCase()) : null;
    if (value && (!targeted || spec?.zone === 'player')) return result([{
      action: actionFor(m[2]), who: targeted ? 0 : m[1].toLowerCase().replace(' ', '-'),
      n: { kind: 'affected-player-count', count: value, multiply: number(m[3]) },
    }], targeted ? [spec] : []);
  }
  m = new RegExp('^(?:you )?(draw|gain|lose|mill|discard) (' + NUMBER + ') (cards?|life) for each (.+?) (target opponent|target player) controls$', 'i').exec(text);
  if (m && matchingUnit(m[1], m[3])) {
    const value = count(m[4] + ' you control'), spec = target(m[5].toLowerCase());
    if (value && spec?.zone === 'player') return result([{
      action: actionFor(m[1]), who: 'you', n: { kind: 'target-count', target: 0, count: value, multiply: number(m[2]) },
    }], [spec]);
  }
  m = new RegExp('^(?:you )?(draw (' + NUMBER + ') cards?|gain (' + NUMBER + ') life|lose (' + NUMBER + ') life|mill (' + NUMBER + ') cards?) for each (.+)$', 'i').exec(text);
  if (m) {
    const value = count(m[6]);
    if (value) return result([{ action: m[2] ? 'draw' : m[3] ? 'gain-life' : m[4] ? 'lose-life' : 'mill', who: 'you',
      n: { ...value, multiply: (value.multiply ?? 1) * number(m[2] || m[3] || m[4] || m[5]) } }]);
  }

  // CR 608.2c: fully independent imperative clauses execute in written order.
  // Only split around a complete recognized instruction, never around a
  // replacement, a condition, a hidden-zone selection, or a quoted ability.
  if (!/["“”]|\b(?:if|unless|where|instead|as though|when|whenever)\b/i.test(text) &&
      !/^(?:search|look at|reveal) /i.test(text)) {
    for (const join of text.matchAll(/,? (?:then|and) |, (?=(?:you |each player |each opponent |target |draw |gain |lose |mill |discard |put |tap |untap |sacrifice |exile |return |create ))/gi)) {
      const first = text.slice(0, join.index), second = text.slice(join.index + join[0].length);
      // A trailing "for each" after "and" may qualify the entire preceding
      // phrase. A complete count before a comma/then has an explicit end.
      if (/\bfor each\b/i.test(second) && /^,? and /i.test(join[0])) continue;
      const left = parse(first), right = parse(second);
      if (complete(left) && complete(right)) {
        // Multiple damage recipients need the simultaneous damage batch,
        // rather than two independently replaced damage instructions.
        const damages = effect => effect.action === 'damage' || effect.action === 'damage-batch' || effect.action === 'battlefield-group' && effect.operation === 'damage';
        if (left.effects.some(damages) && right.effects.some(damages)) continue;
        const body = parse(first + '. ' + upper(second));
        if (complete(body)) return { ...body, optional: optional || body.optional };
      }
    }
  }
  return null;
}

export function modalOperation(card, text, parseEffect) {
  const match = /^Choose one or more —\n((?:• [^\n]+(?:\n|$))+)$/i.exec(text);
  if (!match) return null;
  const labels = match[1].trimEnd().split('\n').map(line => line.slice(2));
  if (labels.length < 2) return null;
  const bodies = labels.map(label => parseEffect(card, label));
  if (bodies.some(body => !complete(body) || body.optional || !body.effects.length)) return null;
  return { kind: 'spell-modal-generic', choose: { min: 1, max: labels.length },
    modes: labels.map((label, index) => ({ label, body: bodies[index] })), contract: 'spell-modal-generic-effect' };
}

const MANA = /^(?:\{(?:\d+|X|[WUBRGC]|[WUBRG]\/[WUBRG]|[WUBRG]\/P|2\/[WUBRG])\})+$/;

export function extensionLine(card, line, helpers) {
  const storageMana = /^\{T\}, Remove any number of storage counters from this (?:land|creature): Add \{([WUBRGC])\} for each storage counter removed this way\.$/.exec(line);
  if (storageMana && /(?:^| )Land(?: |$)/.test(card.type_line || '')) {
    const color = storageMana[1];
    return { kind: 'mana-source', activationCost: { tap: true, removeManaCounters: { kind: 'storage' } },
      produce: [{ [color]: 1 }], storageCounterMana: { kind: 'storage', color }, contract: 'mana-source' };
  }
  // The storage lands spend their counters through an X-shaped removal that
  // pays for exactly the mana it adds, split freely between two printed colors.
  const storageSplit = /^((?:\{[^}]+\})+), Remove X storage counters from this (?:land|creature): Add X mana in any combination of \{([WUBRGC])\} and\/or \{([WUBRGC])\}\.$/.exec(line);
  if (storageSplit && MANA.test(storageSplit[1]) && storageSplit[2] !== storageSplit[3] &&
    /(?:^| )Land(?: |$)/.test(card.type_line || '')) {
    const colors = [storageSplit[2], storageSplit[3]];
    return { kind: 'mana-source', activationCost: { mana: storageSplit[1], removeManaCounters: { kind: 'storage' } },
      produce: colors.map(color => ({ [color]: 1 })), storageCounterMana: { kind: 'storage', colors },
      contract: 'mana-source' };
  }
  const modal = /^([^\n]+?[:,] )choose one —\n((?:• [^\n]+(?:\n|$))+)$/i.exec(line);
  if (modal && helpers.line) {
    const labels = modal[2].trimEnd().split('\n').map(part => part.slice(2));
    if (labels.length < 2 || labels.some(label => /^if\b/i.test(label))) return null;
    // Parse every printed mode with its real event prefix. This retains event
    // object bindings and intervening conditions without inventing a fallback
    // trigger for an unknown header. A condition beginning a mode itself has
    // different timing and is deliberately excluded from this adapter.
    const children = labels.map(label => helpers.line(card, modal[1] + label));
    if (children.some(child => !['generic-trigger', 'generic-ability'].includes(child?.kind) || child.optional || child.from ||
        child.v4Body || child.modalBody || !complete(child) || !child.effects.length)) return null;
    // Mode-dependent mana ability classification and X-dependent target
    // selection need their own announcement proofs before this adapter can
    // include them. Ordinary fixed-cost battlefield activations are closed.
    if (children[0].kind === 'generic-ability' && children.some(child => child.stackMana ||
        /"action":"add-mana"|"threshold":"X"/.test(JSON.stringify(child)))) return null;
    const metadata = children.map(({ effects, targets, optional, ...meta }) => meta);
    if (metadata.some(meta => JSON.stringify(meta) !== JSON.stringify(metadata[0]))) return null;
    return { ...metadata[0], effects: [], targets: [], optional: false,
      modalBody: { choose: { min: 1, max: 1 }, modes: children.map((child, index) => ({
        label: labels[index], body: { effects: child.effects, targets: child.targets, optional: false },
      })) } };
  }
  return null;
}
