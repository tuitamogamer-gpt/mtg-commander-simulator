// Additive version 8 permanent clauses. Every returned descriptor must use an
// existing engine contract; unrecognized clauses remain deferred.
import * as v5 from './oracle-extensions-v5.mjs';
import * as v6 from './oracle-extensions-v6.mjs';
import * as v7 from './oracle-extensions-v7.mjs';
import { ORACLE_SUBTYPES } from './oracle-subtypes.mjs';

const escape = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const NUMBER = '(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|[0-9]+)';
const number = value => ({a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10}[value.toLowerCase()] ?? Number(value));
const continuous = {kind: 'generic-static', contract: 'generic-continuous-effect'};
const STATIC_KINDS = new Set(['generic-static', 'cost-modifier', 'base-pt-static', 'protection-static', 'attachment-grant']);
const bundle = operations => ({kind: 'operation-bundle', operations: operations.flatMap(operation => operation.kind === 'operation-bundle' ? operation.operations : [operation]), contract: 'closed-permanent-clauses'});
function conditioned(operation, condition, affected = false) {
  if (operation?.kind === 'operation-bundle') {
    const operations = operation.operations.map(child => conditioned(child, condition, affected));
    return operations.every(Boolean) ? bundle(operations) : null;
  }
  if (!STATIC_KINDS.has(operation?.kind)) return null;
  return {...operation, condition: operation.condition ? {kind: 'all', conditions: [operation.condition, condition]} : condition,
    ...(affected ? {conditionSubject: 'affected'} : {})};
}

// These are the data bindings exported by the typed runtime adapter. Do not
// infer a reference merely because an event has a similarly named payload key.
const CARD_EVENTS = new Set(['cardToGraveyard', 'cardLeftGraveyard', 'turnedFaceUp', 'cycled', 'discarded', 'landPlayed', 'sacrificed', 'dies', 'lto', 'etb', 'targeted', 'cast', 'countersPlaced', 'countersRemoved', 'dealtDamage', 'damageToPlayer', 'combatDamageToPlayer', 'becameTapped', 'becameUntapped', 'abilityActivated', 'attacks', 'blocks', 'becomesBlocked', 'becomesBlockedByCreature', 'draw']);
const PLAYER_EVENTS = new Set([...CARD_EVENTS, 'attackersDeclared', 'lifeGain', 'lifeLost', 'crime', 'scry']);
const AMOUNT_EVENTS = new Set(['countersPlaced', 'countersRemoved', 'dealtDamage', 'damageToPlayer', 'combatDamageToPlayer', 'lifeGain', 'lifeLost']);
export function eventReferenceAllowed(operation, reference) {
  const rule = operation?.eventFilter;
  if (rule?.kind !== 'v8-event') return false;
  const events = [].concat(operation.event);
  if (!events.length || events.some(event => !PLAYER_EVENTS.has(event))) return false;
  if (rule.lookBack === false && /"event-card-(?:stat|counters)"/.test(JSON.stringify(operation))) return false;
  if (reference === 'event-player') return true;
  if (reference === 'event-amount') return events.every(event => AMOUNT_EVENTS.has(event));
  if (reference !== 'event-card' && reference !== 'event-card-controller') return false;
  if (['player', 'opponent', 'any', 'any target', 'player or planeswalker', 'target player or planeswalker'].includes(rule.target?.what)) return false;
  return events.every(event => CARD_EVENTS.has(event) || event === 'attackersDeclared' && rule.totalMax === 1);
}

function sourcePattern(card) {
  const names = [...new Set([card.name, card.name.split(/,| the /)[0]])].filter(Boolean).map(escape);
  return '(?:this (?:creature|artifact|enchantment|land|permanent|planeswalker|Vehicle|Equipment|Aura|token)|' + names.join('|') + ')';
}

function primitive(helpers, name, text) {
  return (helpers[name] || v7['extension' + name[0].toUpperCase() + name.slice(1)])?.(text) || null;
}

function legacyLine(card, line, helpers) {
  return v7.extensionLine(card, line, helpers) || v6.extensionLine(card, line, helpers) || v5.extensionLine(card, line, helpers) || null;
}

function readLine(card, line, helpers) {
  return helpers.line ? helpers.line(card, line, helpers) : legacyLine(card, line, helpers) || extensionLine(card, line, helpers);
}

function sourceCondition(card, text, helpers) {
  const own = new RegExp('(?<![A-Za-z0-9])' + sourcePattern(card) + "(?='s | is | was | has | entered )", 'gi');
  return primitive(helpers, 'condition', text.replace(own, 'this creature').replace(/^(?:he|she) (is|was|has|entered) /, 'it $1 ').replace(/^(?:he's|she's) /, "it's "));
}

function sourceCount(card, text, helpers) {
  const own = new RegExp('(?<![A-Za-z0-9])' + sourcePattern(card) + '(?![A-Za-z0-9])', 'gi');
  return primitive(helpers, 'count', text.replace(own, 'this creature'));
}

function groupFilters(text, helpers) {
  if (/^(?:Enchanted|Equipped) (?:creature|artifact|enchantment|land|permanent)$/i.test(text)) return null;
  let phrase = text.replace(/^Other /, 'other ').replace(/^All /, '').replace(/^Each /, '')
    .replace(/your opponents control/g, 'an opponent controls')
    .replace(/\bcreature tokens\b/gi, 'token creatures');
  const shared = / (you control|an opponent controls)$/.exec(phrase);
  if (shared && / and |, /.test(phrase.slice(0, shared.index))) {
    const pieces = phrase.slice(0, shared.index).replace(/,? and /g, ', ').split(', ');
    const filters = pieces.map(piece => groupFilters(piece + ' ' + shared[1], helpers));
    if (filters.every(Boolean)) return filters.flat();
  }
  const plurals = {creatures: 'creature', artifacts: 'artifact', enchantments: 'enchantment', lands: 'land', permanents: 'permanent', planeswalkers: 'planeswalker'};
  phrase = phrase.replace(/\b(creatures|artifacts|enchantments|lands|permanents|planeswalkers)\b/gi, word => plurals[word.toLowerCase()])
    .replace(/\b(Elves|Wolves|Dwarves|Allies)\b/g, word => ({Elves: 'Elf', Wolves: 'Wolf', Dwarves: 'Dwarf', Allies: 'Ally'}[word]))
    .replace(/\b([A-Z][A-Za-z-]+)s\b/g, (word, singular) => ORACLE_SUBTYPES.has(singular) ? singular : word);
  if (!ORACLE_SUBTYPES.has(phrase.split(' ')[0])) phrase = phrase[0].toLowerCase() + phrase.slice(1);
  const target = primitive(helpers, 'target', (/^other /.test(phrase) ? 'another target ' : 'target ') + phrase.replace(/^other /, ''));
  return target?.zone === 'battlefield' && !['player', 'opponent', 'card'].includes(target.what) ? [target] : null;
}

function trigger(card, event, eventFilter, text, helpers, extra = {}) {
  let body = text;
  let condition;
  const branch = /^if (.+?), (.+)$/.exec(body);
  if (branch) {
    condition = sourceCondition(card, branch[1], helpers);
    if (!condition) return null;
    body = branch[2];
  }
  const parsed = helpers.effect?.(card, body);
  if (!parsed) return null;
  return {kind: 'generic-trigger', event, eventFilter, ...parsed, ...extra, ...(condition ? {condition} : {}), contract: 'generic-trigger-effect'};
}

function objectTrigger(card, event, rule, text, helpers, extra = {}) {
  let body = text;
  // The Hidden/Opal form names this permanent in its intervening condition,
  // then changes that same permanent's characteristics. Its pronoun does not
  // name the opponent's spell which caused the trigger.
  const sourceAnimation = new RegExp('^(if (' + sourcePattern(card) + ' is (?:a|an) [^,]+), )it (becomes .+)$', 'i').exec(body);
  if (sourceAnimation && sourceCondition(card, sourceAnimation[2], helpers)) body = sourceAnimation[1] + 'this permanent ' + sourceAnimation[3];
  const eventFreeze = /^tap that (creature|artifact|land|permanent)(?: and it|\. (?:It|That \1)) doesn't untap during its controller's next untap step\.$/i.exec(body);
  if (eventFreeze) body = body.replace(/\bit\b/gi, 'that ' + eventFreeze[1].toLowerCase());
  if (rule.sourceSelf && !eventFreeze && /\bits?\b/i.test(text)) return null;
  if (rule.subject !== 'self' && !rule.sourceSelf) {
    // "It" in these object-event clauses names the event object. An explicit
    // "this creature" or printed source name continues to name the source.
    body = body.replace(/\bit\b/gi, 'that creature');
  }
  if (['blocks', 'becomesBlocked', 'becomesBlockedByCreature'].includes(event) && (/^defending player\b/i.test(body) || /\bdamage to defending player\b/i.test(body))) {
    body = body.replace(/\bdefending player\b/gi, 'that player');
    rule = {...rule, playerField: 'defender'};
  }
  if (/^that (?:creature|artifact|permanent) deals /i.test(body)) {
    // The generic event-object alias normally rewrites affected targets, but
    // the *source* of damage is a separate binding (not the observing Aura).
    if (!new RegExp('^that (?:creature|artifact|permanent) deals ' + NUMBER + ' damage to .+\\.$', 'i').test(body)) return null;
    const parsed = trigger(card, event, {kind: 'v8-event', ...rule}, body.replace(/^that (?:creature|artifact|permanent)/i, 'this creature'), helpers, extra);
    if (!parsed || !parsed.effects.length || !parsed.effects.every(effect => effect.action === 'damage' && typeof effect.n === 'number')) return null;
    return {...parsed, effects: parsed.effects.map(effect => ({...effect, source: 'event-card'}))};
  }
  const parsed = trigger(card, event, {kind: 'v8-event', ...rule}, body, helpers, extra);
  if (parsed) return parsed;
  const removal = /^(destroy|exile|tap|untap) that (creature|artifact|enchantment|land|permanent)\.(?: (?:It|The creature|That creature) can't be regenerated\.)?(?: You gain life equal to that creature's (power|toughness)\.)?$/i.exec(body);
  if (removal) {
    const noRegen = /can't be regenerated/.test(body);
    if (noRegen && removal[1].toLowerCase() !== 'destroy' || removal[3] && removal[2] !== 'creature') return null;
    const child = helpers.effect?.(card, removal[1] + ' target ' + removal[2] + '.');
    if (child?.targets?.length === 1 && child.effects.length === 1 && child.effects[0].target === 0) {
      const effects = [{...child.effects[0], target: 'event-card', ...(noRegen ? {noRegen: true} : {})}];
      if (removal[3]) effects.push({action: 'gain-life', who: 'you', n: {kind: 'event-card-stat', stat: removal[3]}});
      return {kind: 'generic-trigger', event, eventFilter: {kind: 'v8-event', ...rule}, targets: [], effects, ...extra, contract: 'generic-trigger-effect'};
    }
  }
  return null;
}

function attachmentGrant(line, helpers) {
  const restricted = /^(Enchanted|Equipped) (creature|artifact|enchantment|land|permanent) (?:(?:gets|gets an additional) ([+-]\d+)\/([+-]\d+)(?:, has (.+?),)? and |has (.+?) and )can't (attack or block|attack|block|be blocked)\.$/i.exec(line);
  if (restricted) {
    const keywords = restricted[5] || restricted[6] ? helpers.keywordList?.(restricted[5] || restricted[6]) : [];
    if (!keywords) return null;
    return {kind: 'attachment-grant', power: Number(restricted[3] || 0), toughness: Number(restricted[4] || 0), keywords,
      ...(restricted[7] === 'be blocked' ? {unblockable: true} : {cantAttack: restricted[7].includes('attack'), cantBlock: restricted[7].includes('block')}), contract: 'attachment-continuous-effect'};
  }
  const noUntap = /^(Enchanted|Equipped) (creature|artifact|enchantment|land|permanent) doesn't untap during its controller's untap step\.$/i.exec(line);
  if (noUntap) return {kind: 'attachment-grant', power: 0, toughness: 0, keywords: [], skipUntap: true, contract: 'attachment-continuous-effect'};
  const match = /^(Enchanted|Equipped) (creature|artifact|enchantment|land|permanent) (?:(?:gets|gets an additional) ([+-]\d+)\/([+-]\d+)(?: and has (.+))?|has (.+)|can't (attack or block|attack|block|be blocked))\.$/i.exec(line);
  if (!match) return null;
  const keywords = match[5] || match[6] ? helpers.keywordList?.(match[5] || match[6]) : [];
  if (!keywords) return null;
  return {kind: 'attachment-grant', power: Number(match[3] || 0), toughness: Number(match[4] || 0), keywords,
    ...(match[7] === 'be blocked' ? {unblockable: true} : match[7] ? {cantAttack: match[7].includes('attack'), cantBlock: match[7].includes('block')} : {}), contract: 'attachment-continuous-effect'};
}

function replacementSource(card, text, helpers) {
  const self = sourcePattern(card);
  if (new RegExp('^' + self + '$', 'i').test(text)) return {subject: 'self'};
  if (/^(?:enchanted|equipped) (?:creature|permanent)$/i.test(text)) return {subject: 'attached'};
  let phrase = text.replace(/^(?:a|an|any) /, '');
  const another = phrase.startsWith('another ');
  phrase = phrase.replace(/^another /, '');
  const controller = / you control\b/.test(phrase) ? 'you' : / an opponent controls\b/.test(phrase) ? 'opponent' : 'any';
  phrase = phrase.replace(/ you control\b| an opponent controls\b/, '');
  const spellOnly = /\bspell\b/.test(phrase);
  // A delayed effect can refer to a spell card that has since changed zones.
  // Do not classify that card as a spell from its present zone alone.
  if (spellOnly) return null;
  phrase = phrase.replace(/\b(?:source|spell)\b/, 'card');
  if (!/\bcard\b/.test(phrase)) phrase += ' card';
  const filter = primitive(helpers, 'target', 'target ' + phrase + ' from a graveyard');
  if (!filter || filter.zone !== 'graveyard' || filter.max > 1) return null;
  return {filter: {...filter, controller: 'any'}, controller, ...(another ? {another: true} : {}), ...(spellOnly ? {spellOnly: true} : {})};
}

function replacementRecipient(card, text, helpers) {
  if (!text || text === 'a permanent or player' || text === 'a player or permanent') return {players: 'any', permanents: {what: 'permanent', zone: 'battlefield', controller: 'any'}};
  if (text === 'you') return {players: 'you'};
  if (text === 'a player') return {players: 'any'};
  if (text === 'an opponent') return {players: 'opponent'};
  if (text === 'an opponent or a permanent an opponent controls') return {players: 'opponent', permanents: {what: 'permanent', zone: 'battlefield', controller: 'opponent'}};
  if (new RegExp('^' + sourcePattern(card) + '$', 'i').test(text)) return {subject: 'self'};
  if (/^(?:enchanted|equipped) (?:creature|permanent)$/i.test(text)) return {subject: 'attached'};
  const filter = primitive(helpers, 'target', (text.startsWith('another ') ? 'another target ' : 'target ') + text.replace(/^(?:a|an|another) /, ''));
  return filter?.zone === 'battlefield' && !['player', 'opponent', 'any', 'player or planeswalker'].includes(filter.what) ? {permanents: filter} : null;
}

function replacementTailMatches(card, target, tail) {
  if (!tail) return true;
  if (!target) return false;
  if (new RegExp('^' + sourcePattern(card) + '$', 'i').test(target)) return new RegExp('^' + sourcePattern(card) + '$', 'i').test(tail);
  if (target === 'you' || /^(?:enchanted|equipped) /.test(target)) return tail === target;
  if (target === 'a player' || target === 'an opponent') return tail === 'that player';
  if (/permanent.*player|player.*permanent|opponent or a permanent/.test(target)) return ['that permanent or player', 'that player or permanent'].includes(tail);
  const type = /^(?:a|an) (?:non\w+ )?(creature|artifact|enchantment|land|planeswalker|permanent)\b/.exec(target)?.[1];
  return !!type && tail === 'that ' + type;
}

function preventionSource(card, text, helpers) {
  if (!text) return replacementSource(card, 'a source', helpers);
  if (/^sources(?: you control| an opponent controls)?$/.test(text)) return replacementSource(card, text.replace(/^sources/, 'a source'), helpers);
  if (/ sources(?: you control| an opponent controls)?$/.test(text)) return replacementSource(card, 'a ' + text.replace(/ sources/, ' source'), helpers);
  const filters = groupFilters(text, helpers);
  if (filters?.length !== 1) return null;
  const controller = filters[0].controller || 'any';
  return {filter: {...filters[0], controller: 'any'}, controller, permanentOnly: true};
}

function preventionLine(card, line, helpers) {
  const self = sourcePattern(card);
  const common = {kind: 'v8-replacement', event: 'damage', prevent: true, contract: 'ordered-replacement-effect'};
  const anySource = () => replacementSource(card, 'a source', helpers);

  const phantom = new RegExp('^If damage would be dealt to ' + self + '( while it has a \\+1/\\+1 counter on it)?, prevent that damage(?:\\. Remove| and remove) (a \\+1/\\+1 counter|that many \\+1/\\+1 counters) from (?:' + self + '|it)\\.$', 'i').exec(line);
  if (phantom) return {...common, source: anySource(), recipient: {subject: 'self'}, transform: {set: 0},
    ...(phantom[1] ? {requiresCounter: '+1/+1'} : {}),
    counterEffect: {operation: 'remove', subject: 'self', counter: '+1/+1', n: phantom[2].startsWith('a ') ? 1 : 'damage'}};

  const addition = new RegExp('^If damage would be dealt to ' + self + ', prevent that damage and put that many (\\+1/\\+1|-1/-1) counters on (?:' + self + '|it|him|her)\\.$', 'i').exec(line);
  if (addition) return {...common, source: anySource(), recipient: {subject: 'self'}, transform: {set: 0},
    counterEffect: {operation: 'add', subject: 'self', counter: addition[1], n: 'damage'}};

  const preventedCounters = new RegExp('^If damage would be dealt to (.+?), prevent that damage\\. Put a (\\+1/\\+1|-1/-1) counter on (' + self + '|that creature|it) for each 1 damage prevented this way\\.$', 'i').exec(line);
  if (preventedCounters) {
    const recipient = replacementRecipient(card, preventedCounters[1], helpers);
    const own = new RegExp('^' + self + '$', 'i').test(preventedCounters[3]);
    if (recipient && (own ? recipient.subject === 'self' : !!recipient.permanents)) return {...common, source: anySource(), recipient, transform: {set: 0},
      counterEffect: {operation: 'add', subject: own ? 'self' : 'recipient', counter: preventedCounters[2], n: 'prevented'}};
  }

  const limited = new RegExp('^If a source would deal (?:(\\d+) or (?:less|fewer) )?damage to (.+?), prevent (all but (\\d+) of |(\\d+) of )?that damage\\.$', 'i').exec(line);
  if (limited) {
    const recipient = replacementRecipient(card, limited[2], helpers);
    if (recipient) return {...common, source: anySource(), recipient,
      transform: limited[4] ? {set: Number(limited[4])} : limited[5] ? {add: -Number(limited[5])} : {set: 0},
      ...(limited[4] ? {minAmount: Number(limited[4]) + 1} : {}), ...(limited[1] ? {maxAmount: Number(limited[1])} : {})};
  }

  const both = /^Prevent all (combat )?damage that would be dealt to and dealt by (.+?)\.$/i.exec(line);
  if (both) {
    const recipient = replacementRecipient(card, both[2], helpers);
    const source = replacementSource(card, both[2], helpers);
    if (recipient?.subject && source?.subject) return bundle([
      {...common, source: anySource(), recipient, transform: {set: 0}, ...(both[1] ? {combat: true} : {})},
      {...common, source, recipient: replacementRecipient(card, '', helpers), transform: {set: 0}, ...(both[1] ? {combat: true} : {})},
    ]);
  }

  const outgoing = /^Prevent all (combat )?damage that would be dealt by (.+?)\.$/i.exec(line);
  if (outgoing) {
    const source = replacementSource(card, outgoing[2], helpers);
    if (source?.subject) return {...common, source, recipient: replacementRecipient(card, '', helpers), transform: {set: 0}, ...(outgoing[1] ? {combat: true} : {})};
  }
  const incoming = /^Prevent all (combat )?damage that would be dealt to (.+?)(?: by (.+?))?\.$/i.exec(line);
  if (incoming) {
    const source = preventionSource(card, incoming[3], helpers);
    const filters = /^(?:creatures|artifacts|lands|enchantments|permanents)\b/.test(incoming[2]) ? groupFilters(incoming[2], helpers) : null;
    const recipient = filters?.length === 1 ? {permanents: filters[0]} : replacementRecipient(card, incoming[2], helpers);
    if (source && recipient) return {...common, source, recipient, transform: {set: 0}, ...(incoming[1] ? {combat: true} : {})};
  }
  return null;
}

export function replacementLine(card, line, helpers = {}) {
  const prevention = preventionLine(card, line, helpers);
  if (prevention) return prevention;
  const life = new RegExp('^If you would gain life, you gain (twice that much life|triple that much life|that much life plus (' + NUMBER + ')) instead\\.$').exec(line);
  if (life) return {kind: 'v8-replacement', event: 'lifegain', transform: life[2] ? {add: number(life[2])} : {multiply: life[1].startsWith('twice') ? 2 : 3}, contract: 'ordered-replacement-effect'};

  const doubleToken = /^If (?:one or more tokens would be created under your control|an effect would create one or more tokens under your control), (?:it creates )?(twice|three times) that many of those tokens (?:are created )?instead\.$/.exec(line);
  if (doubleToken) return {kind: 'v8-replacement', event: 'createToken', factor: doubleToken[1] === 'twice' ? 2 : 3, contract: 'ordered-replacement-effect'};
  const tokenAppend = /^If one or more (creature |artifact )?tokens would be created under your control, those tokens plus (?:an additional |a )(.+? token) are created instead\.$/.exec(line);
  if (tokenAppend) {
    const parsed = helpers.effect?.(card, 'Create a ' + tokenAppend[2] + '.');
    const effect = parsed?.effects?.[0];
    if (parsed?.effects?.length === 1 && !parsed.targets?.length && !parsed.optional && ['token-key', 'token-inline'].includes(effect.action) && effect.n === 1 && (!effect.who || effect.who === 'you')) {
      return {kind: 'v8-replacement', event: 'createToken', ...(tokenAppend[1] ? {tokenType: tokenAppend[1].trim()[0].toUpperCase() + tokenAppend[1].trim().slice(1)} : {}),
        ...(effect.token ? {token: effect.token} : {tokenKey: effect.tokenKey || effect.key}), contract: 'ordered-replacement-effect'};
    }
  }

  const damage = new RegExp('^If (.+?) would deal (?:(combat|noncombat) )?(?:(' + NUMBER + ') or more )?damage(?: to (.+?))?, (?:it|that source|' + sourcePattern(card) + ') deals (.+) instead\\.$', 'i').exec(line);
  if (damage) {
    const source = replacementSource(card, damage[1], helpers), recipient = replacementRecipient(card, damage[4], helpers);
    // "another" on Equipment can mean another creature than the host, rather
    // than another object than the Equipment itself. Keep that form deferred.
    if (!source || !recipient || source.another && recipient.subject === 'attached') return null;
    const outcome = new RegExp('^(double that damage|triple that damage|twice that much damage|that much damage (plus|minus) (' + NUMBER + ')|(' + NUMBER + ') damage|half that damage, rounded down)(?:,? to (.+))?$', 'i').exec(damage[5]);
    if (!outcome || !replacementTailMatches(card, damage[4], outcome[5])) return null;
    const transform = outcome[2] ? {add: number(outcome[3]) * (outcome[2] === 'minus' ? -1 : 1)}
      : outcome[4] ? {set: number(outcome[4])}
      : outcome[1].startsWith('half') ? {divide: 2, round: 'down'}
      : {multiply: outcome[1].startsWith('triple') ? 3 : 2};
    return {kind: 'v8-replacement', event: 'damage', source, recipient, transform,
      ...(damage[2] ? {combat: damage[2] === 'combat'} : {}), ...(damage[3] ? {minAmount: number(damage[3])} : {}), contract: 'ordered-replacement-effect'};
  }
  return null;
}

// The legacy conditional parser can bind a trailing sentence to the wrong
// "as long as" clause. Claim only this structural shape before legacy parsing;
// undefined means outside our domain, null means this full shape is deferred.
export function priorityLine(card, line, helpers = {}) {
  // This sentence limits the immediately preceding triggered ability. Parse
  // that complete ability through the v8 union first, then attach the limit;
  // the frozen v7 recursive call cannot see newer v8 event/effect grammar.
  // Claim the exact suffix so malformed riders and nontrigger abilities stay
  // deferred instead of silently losing text.
  const onceEachTurn = /^(.*) This ability triggers only once each turn\.$/.exec(line);
  if (onceEachTurn) {
    const child = readLine(card, onceEachTurn[1], helpers);
    if (child?.kind !== 'generic-trigger' || child.onceEachTurn) return null;
    return {...child, onceEachTurn: true, onceGroup: line};
  }
  // A combat-state adjective is a predicate, never a creature subtype. Older
  // typal-static parsing may otherwise treat the word "Attacking" as a type.
  if (/^(?:Other )?(?:[Aa]ttacking|[Bb]locking) creatures\b/.test(line)) return extensionLine(card, line, helpers);
  // In an object-event body, "counters on it" names the event object. The
  // older generic count parser treats a bare "it" as the source instead.
  if (!line.includes('"') && /^(?:When|Whenever) (?:another |a |an ).+? (?:enters|dies|attacks|leaves the battlefield|becomes tapped|becomes untapped), .+\bcounters? on it\b/.test(line)) {
    return extensionLine(card, line, helpers);
  }
  if (!/^(?:When(?:ever)?|At|If|Until|Choose|Create|Return|Destroy|Exile|Sacrifice|Put|Deal|Draw|You)\b/.test(line) && !line.includes(':') && !line.includes('"') && line.split(/(?<=\.) (?=(?:This |this |Enchanted |Equipped |It |As long as |During ))/).length > 1) {
    return extensionLine(card, line, helpers);
  }
  return undefined;
}

export function extensionLine(card, line, helpers = {}) {
  const self = sourcePattern(card);
  const typeWords = String(card.type_line || '').split(' — ')[0].trim().split(/\s+/).filter(Boolean);
  const enchantmentCreature = typeWords.includes('Enchantment') && typeWords.includes('Creature');
  const bestow = /^Bestow ((?:\{(?:\d+|X|[WUBRGC]|[WUBRG]\/[WUBRG]|[WUBRG]\/P|2\/[WUBRG])\})+)$/.exec(line);
  if (bestow) {
    const cost = helpers.cost?.(bestow[1]);
    // Bestow is an alternative mana cost on an enchantment creature. Keep the
    // descriptor closed: no punctuation riders, collect-evidence additions or
    // wrong card types are silently accepted as this mechanic.
    if (!enchantmentCreature || !cost || Object.keys(cost).length !== 1 || cost.mana !== bestow[1]) return null;
    return {kind: 'mechanic-bestow', cost: bestow[1], contract: 'mechanic-bestow'};
  }
  const legendaryCreature = typeWords.includes('Legendary') && typeWords.includes('Creature');
  const partnerWithContext = typeWords.includes('Creature') || typeWords.includes('Legendary') && typeWords.includes('Planeswalker');
  const pairing = line === 'Partner' ? {variant: 'partner'}
    : line === 'Friends forever' ? {variant: 'named', label: 'Friends forever'}
    : line === 'Choose a Background' ? {variant: 'background'}
    : line === "Doctor's companion" ? {variant: 'doctorsCompanion'}
    : null;
  if (pairing) {
    if (!legendaryCreature) return null;
    return {kind: 'commander-pairing', ...pairing, contract: 'commander-pairing'};
  }
  const closedPartnerText = /^[\p{L}\p{N}][\p{L}\p{N}\s,'’.&:—–-]*$/u;
  const partnerWith = /^Partner with (.+)$/.exec(line);
  if (partnerWith) {
    const printedName = partnerWith[1];
    const linked = Array.isArray(card.all_parts) && card.all_parts.some(part => part?.name === printedName);
    if (!partnerWithContext || !closedPartnerText.test(printedName) || !linked) return null;
    return {kind: 'commander-pairing', variant: 'with', partnerName: printedName, search: true, contract: 'commander-pairing'};
  }
  const namedPartner = /^Partner\s*[—–-]\s*(.+)$/.exec(line);
  if (namedPartner) {
    const label = namedPartner[1];
    if (!legendaryCreature || !closedPartnerText.test(label)) return null;
    return {kind: 'commander-pairing', variant: 'named', label, contract: 'commander-pairing'};
  }
  const replacement = replacementLine(card, line, helpers);
  if (replacement) return replacement;

  const optionalUntap = new RegExp('^You may choose not to untap ' + self + ' during your untap step\\.$', 'i').exec(line);
  if (optionalUntap) return {...continuous, scope: 'self', power: 0, toughness: 0, keywords: [], optionalUntap: true};
  const noUntap = /^(.+?) (?:doesn't|don't) untap during (your untap step|its controller's untap step|their controllers' untap steps)(?: if (.+?))?\.$/i.exec(line);
  if (noUntap) {
    const own = new RegExp('^' + self + '$', 'i').test(noUntap[1]);
    const attached = /^(?:enchanted|equipped) (?:creature|artifact|enchantment|land|permanent)$/i.test(noUntap[1]);
    const filters = own || attached ? null : groupFilters(noUntap[1], helpers);
    const condition = noUntap[3] ? sourceCondition(card, noUntap[3], helpers) : null;
    const validStep = own ? noUntap[2] !== "their controllers' untap steps"
      : attached ? noUntap[2] === "its controller's untap step"
      : noUntap[2] === "their controllers' untap steps" || noUntap[2] === "its controller's untap step" && /^Each /.test(noUntap[1]) || noUntap[2] === 'your untap step' && / you control$/.test(noUntap[1]);
    if (validStep && (own || attached || filters) && (!noUntap[3] || condition)) return {
      ...(attached ? {kind: 'attachment-grant', contract: 'attachment-continuous-effect', skipUntap: true}
        : {...continuous, scope: own ? 'self' : 'filtered-permanents', ...(filters ? {filters} : {}), cantUntap: true}),
      power: 0, toughness: 0, keywords: [], ...(condition ? {condition, ...(!own && /^(?:it |it's |that creature )/.test(noUntap[3]) ? {conditionSubject: 'affected'} : {})} : {}),
    };
  }
  const combinedUntap = new RegExp('^(' + self + ') enters tapped and doesn\'t untap during your untap step\\.$', 'i').exec(line);
  if (combinedUntap) {
    const entering = readLine(card, combinedUntap[1] + ' enters tapped.', helpers);
    const resting = extensionLine(card, combinedUntap[1] + " doesn't untap during your untap step.", helpers);
    if (entering && resting) return bundle([entering, resting]);
  }
  const pumpUntap = /^(.+?) gets? ([+-]\d+)\/([+-]\d+) and (?:doesn't|don't) untap during (your untap step|its controller's untap step|their controllers' untap steps)\.$/.exec(line);
  if (pumpUntap) {
    const first = readLine(card, pumpUntap[1] + ' gets ' + pumpUntap[2] + '/' + pumpUntap[3] + '.', helpers);
    const second = extensionLine(card, pumpUntap[1] + " doesn't untap during " + pumpUntap[4] + '.', helpers);
    if (STATIC_KINDS.has(first?.kind) && second) return bundle([first, second]);
  }

  // A later static sentence has its own condition. Resolve sentence boundaries
  // before a leading "as long as" can accidentally capture the entire line.
  const sentences = line.split(/(?<=\.) (?=(?:This |this |Enchanted |Equipped |It |As long as |During ))/);
  if (sentences.length > 1 && !line.includes('"') && !line.includes(':') && !/^(?:When(?:ever)?|At|If|Until|Choose|Create|Return|Destroy|Exile|Sacrifice|Put|Deal|Draw|You)\b/.test(line)) {
    const attached = /^(Enchanted|Equipped) (creature|artifact|enchantment|land|permanent)\b/i.exec(sentences[0]);
    const operations = sentences.map((sentence, index) => {
      let text = sentence;
      if (index && attached) text = text.replace(/^It /, attached[0] + ' ').replace(/^As long as it's /, 'As long as ' + attached[0].toLowerCase() + ' is ').replace(/^As long as it (is|has|was) /, 'As long as ' + attached[0].toLowerCase() + ' $1 ');
      const child = readLine(card, text, helpers);
      return STATIC_KINDS.has(child?.kind) || child?.kind === 'operation-bundle' && child.operations.every(operation => STATIC_KINDS.has(operation.kind)) ? child : null;
    });
    return operations.every(Boolean) ? bundle(operations) : null;
  }

  // These are exact editorial synonyms. Keep every predicate/effect intact.
  if (line.startsWith('During turns other than yours, ')) return readLine(card, line.replace('During turns other than yours, ', "During each opponent's turn, "), helpers);
  if (/ gets an additional [+-]\d+\/[+-]\d+/.test(line)) return readLine(card, line.replace(' gets an additional ', ' gets '), helpers);
  const loneCreature = /^As long as you control exactly one creature, that creature (.+)$/.exec(line);
  if (loneCreature) return readLine(card, 'As long as you control exactly one creature, creatures you control ' + loneCreature[1].replace(/^gets /, 'get ').replace(/^has /, 'have '), helpers);

  const mustAttack = /^(.+?) attacks? each combat if able(?: unless (.+?))?\.$/.exec(line);
  if (mustAttack) {
    const own = new RegExp('^' + self + '$', 'i').test(mustAttack[1]);
    const filters = own ? null : groupFilters(mustAttack[1], helpers);
    const condition = mustAttack[2] ? sourceCondition(card, mustAttack[2], helpers) : null;
    if ((own || filters) && (!mustAttack[2] || condition)) return {...continuous, scope: own ? 'self' : 'filtered-permanents', ...(filters ? {filters} : {}), power: 0, toughness: 0, keywords: [], mustAttack: true, ...(condition ? {condition: {kind: 'not', condition}} : {})};
  }
  const pumpAttack = /^(.+?) gets? ([+-]\d+)\/([+-]\d+), (?:has|have) (.+?), and attacks? each combat if able\.$/.exec(line);
  if (pumpAttack) {
    const own = new RegExp('^' + self + '$', 'i').test(pumpAttack[1]);
    const filters = own ? null : groupFilters(pumpAttack[1], helpers), keywords = helpers.keywordList?.(pumpAttack[4]);
    if ((own || filters) && keywords) return {...continuous, scope: own ? 'self' : 'filtered-permanents', ...(filters ? {filters} : {}), power: Number(pumpAttack[2]), toughness: Number(pumpAttack[3]), keywords, mustAttack: true};
  }

  const otherwise = /^(.+?) Otherwise, (.+)$/.exec(line);
  if (otherwise) {
    const first = readLine(card, otherwise[1], helpers);
    const subject = /^(Enchanted|Equipped) (creature|artifact|enchantment|land|permanent)\b/i.exec(otherwise[1]);
    const text = otherwise[2].replace(/^it /i, subject ? subject[0] + ' ' : 'This creature ');
    const second = first?.condition && readLine(card, text[0].toUpperCase() + text.slice(1), helpers);
    const inverse = second && conditioned(second, {kind: 'not', condition: first.condition}, first.conditionSubject === 'affected');
    return STATIC_KINDS.has(first?.kind) && inverse ? bundle([first, inverse]) : null;
  }

  const once = /^(.*) This ability triggers only once each turn\.$/.exec(line);
  if (once) {
    const child = readLine(card, once[1], helpers);
    if (child?.kind === 'generic-trigger') return {...child, onceEachTurn: true, onceGroup: line};
    return null;
  }

  // Cast triggers live on the spell on the Stack, not on a battlefield object.
  // A copy placed on the Stack is not a cast and must never create this trigger.
  const castSelf = /^When you cast this spell, (.+)$/.exec(line);
  if (castSelf) {
    const parsed = trigger(card, 'cast', 'self', castSelf[1], helpers, {zone: 'stack'});
    // Generic cast triggers do not yet initialize the trigger's X from the
    // source spell. Keep those clauses closed until that capture is proved.
    return parsed && !JSON.stringify(parsed).includes('"X"') ? parsed : null;
  }

  const castCycle = new RegExp('^When you cast or cycle (?:this (?:spell|card)|' + self + '), (.+)$', 'i').exec(line);
  if (castCycle) {
    const cast = trigger(card, 'cast', 'self', castCycle[1], helpers, {zone: 'stack'});
    const cycle = trigger(card, 'cycled', 'self', castCycle[1], helpers, {zone: 'cycling-source'});
    if (cast && cycle && !/"X"|"event-card|"event-player|"self"/.test(JSON.stringify(cast.effects))) return bundle([cast, cycle]);
    return null;
  }

  // A card arriving in a graveyard is a new object. "From anywhere" also
  // includes the engine's battlefield-to-graveyard `dies` route.
  const graveArrival = /^(?:When|Whenever) (?:a|an) (.+? cards?) (?:is|are) put into (your|an opponent's|a player's) graveyard from (anywhere|your library|their library|a library), (.+)$/.exec(line);
  if (graveArrival) {
    const target = primitive(helpers, 'target', 'target ' + graveArrival[1].replace(/ cards$/, ' card') + ' from a graveyard');
    if (target?.zone === 'graveyard') return objectTrigger(card,
      graveArrival[3] === 'anywhere' ? ['cardToGraveyard', 'dies'] : 'cardToGraveyard',
      {target: {...target, controller: 'any', nontoken: true}, player: graveArrival[2] === 'your' ? 'you' : graveArrival[2] === "an opponent's" ? 'opponent' : 'any', playerField: 'owner', lookBack: false,
        ...(graveArrival[3] !== 'anywhere' ? {from: 'library'} : {})}, graveArrival[4], helpers);
  }
  const graveCard = /^(?:When|Whenever) a card is put into (your|an opponent's|a player's) graveyard from (anywhere|your library|their library|a library), (.+)$/.exec(line);
  if (graveCard) return objectTrigger(card,
    graveCard[2] === 'anywhere' ? ['cardToGraveyard', 'dies'] : 'cardToGraveyard',
    {target: {what: 'card', zone: 'graveyard', controller: 'any', nontoken: true}, player: graveCard[1] === 'your' ? 'you' : graveCard[1] === "an opponent's" ? 'opponent' : 'any', playerField: 'owner', lookBack: false,
      ...(graveCard[2] !== 'anywhere' ? {from: 'library'} : {})}, graveCard[3], helpers);

  const otherCycle = /^Whenever you cycle another card, (.+)$/.exec(line);
  if (otherCycle) return objectTrigger(card, 'cycled', {subject: 'another', player: 'you'}, otherCycle[1], helpers);
  const playerAction = /^Whenever (you|an opponent|a player) (draws? a card|gains? life|loses? life|commits? a crime|plays? a land|cycles? a card|discards? (?:a|an) (?:.+? )?card|scr(?:y|ies)), (.+)$/.exec(line);
  if (playerAction) {
    const action = playerAction[2], player = playerAction[1] === 'you' ? 'you' : playerAction[1] === 'an opponent' ? 'opponent' : 'any';
    const event = /^draw/.test(action) ? 'draw' : /^gain/.test(action) ? 'lifeGain' : /^lose/.test(action) ? 'lifeLost' : /^commit/.test(action) ? 'crime' : /^play/.test(action) ? 'landPlayed' : /^cycl/.test(action) ? 'cycled' : /^discard/.test(action) ? 'discarded' : 'scry';
    const discard = /^discards? (?:a|an) ((?:.+? )?card)$/.exec(action);
    const target = discard ? primitive(helpers, 'target', 'target ' + discard[1] + ' from a graveyard') : null;
    if (!discard || target?.zone === 'graveyard') return objectTrigger(card, event, {player, ...(target ? {target: {...target, controller: 'any'}} : {})}, playerAction[3], helpers);
  }

  const foreignCast = /^Whenever (an opponent|a player) casts (?:a|an) (.+? spell), (.+)$/.exec(line);
  if (foreignCast) {
    const target = primitive(helpers, 'target', 'target ' + foreignCast[2]);
    if (target?.zone === 'stack') return objectTrigger(card, 'cast', {target, player: foreignCast[1] === 'an opponent' ? 'opponent' : 'any'}, foreignCast[3], helpers);
  }

  const turnEvent = /^((?:When|Whenever) .+?) during (your turn|an opponent's turn), (.+)$/.exec(line);
  if (turnEvent) {
    const child = readLine(card, turnEvent[1] + ', ' + turnEvent[3], helpers);
    if (child?.kind === 'generic-trigger') {
      const condition = {kind: turnEvent[2] === 'your turn' ? 'your-turn' : 'not-your-turn'};
      return {...child, condition: child.condition ? {kind: 'all', conditions: [child.condition, condition]} : condition};
    }
  }

  const turned = /^Whenever (another |a |an )(.+?) is turned face up, (.+)$/.exec(line);
  if (turned) {
    const target = primitive(helpers, 'target', 'target ' + turned[2]);
    if (target?.zone === 'battlefield') return objectTrigger(card, 'turnedFaceUp', {target, ...(turned[1] === 'another ' ? {subject: 'another'} : {})}, turned[3], helpers);
  }

  const counterPlaced = /^Whenever one or more (.+?) counters are put on (.+?), (.+)$/.exec(line);
  if (counterPlaced) {
    const own = new RegExp('^' + self + '$', 'i').test(counterPlaced[2]);
    const targetText = counterPlaced[2].replace(/^(?:another|a|an) /, '');
    const target = own ? null : primitive(helpers, 'target', 'target ' + targetText);
    if (own || target?.zone === 'battlefield') return objectTrigger(card, 'countersPlaced', {counter: counterPlaced[1], ...(own ? {subject: 'self'} : {target, ...(/^another /.test(counterPlaced[2]) ? {subject: 'another'} : {})})}, counterPlaced[3], helpers);
  }
  const lastCounter = new RegExp('^When the last (.+?) counter is removed from ' + self + ', (.+)$', 'i').exec(line);
  if (lastCounter) return objectTrigger(card, 'countersRemoved', {subject: 'self', counter: lastCounter[1], zeroRemaining: true}, lastCounter[2], helpers);

  const targetEvent = /^(?:When|Whenever) (.+?) becomes the target of (a spell or ability|a spell|an instant or sorcery spell)( you control| an opponent controls)?, (.+)$/.exec(line);
  if (targetEvent) {
    const own = new RegExp('^' + self + '$', 'i').test(targetEvent[1]);
    const attached = /^(?:enchanted|equipped) (?:creature|permanent|artifact|land)$/i.test(targetEvent[1]);
    const target = own || attached ? null : primitive(helpers, 'target', 'target ' + targetEvent[1].replace(/^(?:a|an|another) /, ''));
    if (own || attached || target?.zone === 'battlefield') return objectTrigger(card, 'targeted', {
      ...(own || attached ? {subject: own ? 'self' : 'attached'} : {target, ...(/^another /.test(targetEvent[1]) ? {subject: 'another'} : {})}),
      ...(targetEvent[3] ? {player: targetEvent[3].includes('opponent') ? 'opponent' : 'you'} : {}),
      ...(targetEvent[2] === 'a spell or ability' ? {} : {spellOnly: true}), ...(targetEvent[2].startsWith('an instant') ? {instantSorceryOnly: true} : {})}, targetEvent[4], helpers);
  }

  const attackAlone = /^(?:When|Whenever) (.+?) attacks alone, (.+)$/.exec(line);
  if (attackAlone) {
    const own = new RegExp('^' + self + '$', 'i').test(attackAlone[1]);
    const target = own ? null : primitive(helpers, 'target', 'target ' + attackAlone[1].replace(/^(?:a|an|another) /, ''));
    if (own || target?.zone === 'battlefield') return objectTrigger(card, 'attackersDeclared', {totalMin: 1, totalMax: 1, ...(own ? {subject: 'self'} : {target})}, attackAlone[2], helpers);
  }
  const attackWith = new RegExp('^Whenever you attack with (' + NUMBER + ') or more (.+?), (.+)$').exec(line);
  if (attackWith) {
    const filters = groupFilters(attackWith[2], helpers);
    if (filters?.length === 1) {
      const body = objectTrigger(card, 'attackersDeclared', {player: 'you', target: filters[0], minMatching: number(attackWith[1])}, attackWith[3], helpers);
      if (body && !/"event-card(?:-stat|-controller)?"/.test(JSON.stringify(body))) return body;
    }
  }
  const tribalAttack = /^Whenever you attack with one or more (.+?), (.+)$/.exec(line);
  if (tribalAttack) return readLine(card, 'Whenever one or more ' + tribalAttack[1] + ' you control attack, ' + tribalAttack[2], helpers);

  const combatParticipant = '(' + self + '|(?:enchanted|equipped) creature)';
  const ownBlock = new RegExp('^(?:When|Whenever) ' + combatParticipant + ' blocks, (.+)$', 'i').exec(line);
  if (ownBlock) return objectTrigger(card, 'blocks', {field: 'blocker', subject: new RegExp('^' + self + '$', 'i').test(ownBlock[1]) ? 'self' : 'attached'}, ownBlock[2], helpers);
  const byCreature = new RegExp('^(?:When|Whenever) ' + combatParticipant + ' (blocks or becomes blocked by|blocks|becomes blocked by) (?:a|an) (.+?), (.+)$', 'i').exec(line);
  if (byCreature && !/\bits?\b/i.test(byCreature[4].replace(/(?:It|That creature|The creature) can't be regenerated\./i, ''))) {
    const target = primitive(helpers, 'target', 'target ' + byCreature[3]);
    if (target?.zone === 'battlefield' && (target.what === 'creature' || target.subtype)) {
      const own = new RegExp('^' + self + '$', 'i').test(byCreature[1]);
      const events = byCreature[2] === 'blocks' ? ['blocks'] : byCreature[2] === 'becomes blocked by' ? ['becomesBlockedByCreature'] : ['blocks', 'becomesBlockedByCreature'];
      const operations = events.map(event => objectTrigger(card, event, {
        field: event === 'blocks' ? 'attacker' : 'blocker', sourceField: event === 'blocks' ? 'blocker' : 'attacker', sourceSubject: own ? 'self' : 'attached', target,
      }, byCreature[4], helpers));
      if (operations.every(Boolean)) return operations.length === 1 ? operations[0] : bundle(operations);
    }
  }
  const blockedGroup = new RegExp('^(?:When|Whenever) ' + combatParticipant + ' becomes blocked by one or more (.+?), (.+)$', 'i').exec(line);
  if (blockedGroup) {
    const filters = groupFilters(blockedGroup[2], helpers);
    const own = new RegExp('^' + self + '$', 'i').test(blockedGroup[1]);
    if (filters?.length === 1) return objectTrigger(card, 'becomesBlocked', {field: 'attacker', subject: own ? 'self' : 'attached', blockerTarget: filters[0]}, blockedGroup[3], helpers);
  }
  const blocksBoth = new RegExp('^(?:When|Whenever) ' + combatParticipant + ' blocks or becomes blocked, (.+)$', 'i').exec(line);
  if (blocksBoth) {
    const own = new RegExp('^' + self + '$', 'i').test(blocksBoth[1]);
    const operations = ['blocks', 'becomesBlocked'].map(event => objectTrigger(card, event, {field: event === 'blocks' ? 'blocker' : 'attacker', subject: own ? 'self' : 'attached'}, blocksBoth[2], helpers));
    if (operations.every(Boolean)) return bundle(operations);
  }
  const blocked = /^(?:When|Whenever) (.+?) becomes blocked, (.+)$/i.exec(line);
  if (blocked) {
    const own = new RegExp('^' + self + '$', 'i').test(blocked[1]);
    const attached = /^(?:enchanted|equipped) creature$/i.test(blocked[1]);
    const target = own || attached || !/^(?:a|an|another) /.test(blocked[1]) ? null : primitive(helpers, 'target', 'target ' + blocked[1].replace(/^(?:a|an|another) /, ''));
    if (own || attached || target?.zone === 'battlefield' && !['player', 'opponent', 'any', 'player or planeswalker'].includes(target.what)) return objectTrigger(card, 'becomesBlocked', {field: 'attacker', ...(own || attached ? {subject: own ? 'self' : 'attached'} : {target, ...(/^another /.test(blocked[1]) ? {subject: 'another'} : {})})}, blocked[2], helpers);
  }

  const attachedDamage = /^Whenever (enchanted|equipped) (creature|permanent|artifact|land) deals (combat )?damage to (a player|an opponent), (.+)$/.exec(line);
  if (attachedDamage) return objectTrigger(card, attachedDamage[3] ? 'combatDamageToPlayer' : 'damageToPlayer', {attachedSource: true, ...(attachedDamage[4] === 'an opponent' ? {player: 'opponent'} : {})}, attachedDamage[5], helpers);
  const ownDamage = new RegExp('^Whenever ' + self + ' deals (combat )?damage to (?:a|an) (.+?), (.+)$', 'i').exec(line);
  if (ownDamage) {
    const target = primitive(helpers, 'target', 'target ' + ownDamage[2]);
    if (target?.zone === 'battlefield' && !['player', 'opponent', 'any', 'player or planeswalker', 'target player or planeswalker'].includes(target.what) && ownDamage[2] !== 'player or planeswalker') return objectTrigger(card, 'dealtDamage', {sourceSelf: true, target, ...(ownDamage[1] ? {combat: true} : {})}, ownDamage[3], helpers);
    if (ownDamage[2] === 'player or planeswalker') {
      const toPlayer = objectTrigger(card, ownDamage[1] ? 'combatDamageToPlayer' : 'damageToPlayer', {sourceSelf: true}, ownDamage[3], helpers);
      const toWalker = objectTrigger(card, 'dealtDamage', {sourceSelf: true, target: primitive(helpers, 'target', 'target planeswalker'), ...(ownDamage[1] ? {combat: true} : {})}, ownDamage[3], helpers);
      if (toPlayer && toWalker && !/"event-card|"event-player/.test(JSON.stringify([toPlayer.effects, toWalker.effects]))) return bundle([toPlayer, toWalker]);
    }
  }
  const damaged = new RegExp('^Whenever ' + self + ' is dealt (combat )?damage, (.+)$', 'i').exec(line);
  if (damaged) return objectTrigger(card, 'dealtDamage', {subject: 'self', ...(damaged[1] ? {combat: true} : {})}, damaged[2], helpers);

  const sacrificed = /^(?:When|Whenever) (you|an opponent|a player) sacrifices? (.+?), (.+)$/.exec(line);
  if (sacrificed) {
    const own = new RegExp('^' + self + '$', 'i').test(sacrificed[2]);
    const target = own ? null : primitive(helpers, 'target', 'target ' + sacrificed[2].replace(/^(?:a|an|another) /, ''));
    if (own || target?.zone === 'battlefield') return objectTrigger(card, 'sacrificed', {player: sacrificed[1] === 'you' ? 'you' : sacrificed[1] === 'an opponent' ? 'opponent' : 'any', ...(own ? {subject: 'self'} : {target, ...(/^another /.test(sacrificed[2]) ? {subject: 'another'} : {})})}, sacrificed[3], helpers);
  }

  const graveSelf = new RegExp('^(When|Whenever) (' + self + ') (enters or is put into a graveyard from the battlefield|is put into a graveyard from the battlefield), (.+)$', 'i').exec(line);
  if (graveSelf) return readLine(card, graveSelf[1] + ' ' + graveSelf[2] + (graveSelf[3].startsWith('enters') ? ' enters or dies, ' : ' dies, ') + graveSelf[4], helpers);

  const phases = [
    ['precombatMain', 'your-player', /^At the beginning of your (?:first|precombat) main phase, (.+)$/],
    ['beginCombat', 'any-player', /^At the beginning of each combat, (.+)$/],
    ['beginCombat', 'opponent-player', /^At the beginning of combat on each opponent's turn, (.+)$/],
    ['drawStep', 'any-player', /^At the beginning of each player's draw step, (.+)$/],
    ['drawStep', 'opponent-player', /^At the beginning of each opponent's draw step, (.+)$/],
    ['precombatMain', 'any-player', /^At the beginning of each player's (?:first|precombat) main phase, (.+)$/],
    ['precombatMain', 'opponent-player', /^At the beginning of each opponent's (?:first|precombat) main phase, (.+)$/],
  ];
  for (const [event, eventFilter, pattern] of phases) {
    const match = pattern.exec(line);
    if (match) return trigger(card, event, eventFilter, match[1], helpers);
  }

  const joinedSelf = new RegExp('^(?:When|Whenever) ' + self + ' (enters, attacks, or dies|enters, attacks, or leaves the battlefield|enters or becomes tapped|attacks or leaves the battlefield), (.+)$', 'i').exec(line);
  if (joinedSelf) {
    const events = joinedSelf[1].replace(/, or /g, ', ').replace(/ or /g, ', ').split(', ').map(event => ({enters: 'etb', attacks: 'attacks', dies: 'dies', 'leaves the battlefield': 'lto', 'becomes tapped': 'becameTapped'}[event]));
    if (events.every(Boolean)) return trigger(card, events, 'self', joinedSelf[2], helpers);
  }

  const joinedPhase = /^At the beginning of your upkeep and your end step, (.+)$/.exec(line);
  if (joinedPhase) return trigger(card, ['upkeep', 'endStep'], 'your-player', joinedPhase[1], helpers);

  // "When" and "Whenever" do not change a cast trigger's event condition.
  // Keep the spell's own cast case above separate from permanent observers.
  if (/^When you cast (?:a|an) /.test(line)) return readLine(card, line.replace(/^When /, 'Whenever '), helpers);

  // Reuse the old trigger prefix parser, while allowing the additive condition
  // parser to handle a completely consumed intervening-if clause.
  const intervening = /^((?:When|Whenever|At the beginning of) .+?), if (.+?), (.+)$/.exec(line);
  if (intervening) {
    const condition = sourceCondition(card, intervening[2], helpers);
    if (!condition) return null;
    const parsed = legacyLine(card, intervening[1] + ", if it's your turn, " + intervening[3], helpers);
    if (parsed?.kind === 'generic-trigger') return {...parsed, condition};
  }

  const qualifiedCast = /^Whenever you cast (?:a|an) (.+? spell), (.+)$/.exec(line);
  if (qualifiedCast) {
    const target = primitive(helpers, 'target', 'target ' + qualifiedCast[1]);
    if (target?.zone === 'stack') return trigger(card, 'cast', {kind: 'qualified-cast', target}, qualifiedCast[2], helpers);
  }

  const objectEvent = /^(?:When|Whenever) (another |a |an )(.+?) (enters|dies|attacks|blocks|leaves the battlefield|becomes tapped|becomes untapped), (.+)$/.exec(line);
  if (objectEvent) {
    const target = primitive(helpers, 'target', 'target ' + objectEvent[2]);
    if (target?.zone === 'battlefield' && !target.enchanted && !target.equipped) {
      let text = objectEvent[4];
      if (/^it /i.test(text)) text = text.replace(/^it /i, 'that creature ');
      // Explicit source references stay bound to the source. Ambiguous
      // possessives need independent event-card binding before admission.
      if (/\bits\b/i.test(text) && !/^its controller (?:draws|gains|loses|mills|discards) /i.test(text)) return null;
      const event = {enters: 'etb', dies: 'dies', attacks: 'attacks', blocks: 'blocks', 'leaves the battlefield': 'lto', 'becomes tapped': 'becameTapped', 'becomes untapped': 'becameUntapped'}[objectEvent[3]];
      if (/\bcounters? on it\b/.test(text) && CARD_EVENTS.has(event)) return objectTrigger(card, event,
        {target, ...(objectEvent[1] === 'another ' ? {subject: 'another'} : {})}, text, helpers);
      return trigger(card, event, {kind: 'filtered-object', target, another: objectEvent[1] === 'another '}, text, helpers);
    }
  }

  // Timing restrictions are separate from effects, and every suffix must be
  // recognized before an activation can be admitted.
  const activation = /^(.+): (.+) Activate only (.+)\.$/.exec(line);
  if (activation) {
    const restrictions = activation[3].split(/ and only /);
    const flags = {};
    const conditions = [];
    for (const restriction of restrictions) {
      if (restriction === 'as a sorcery') flags.sorceryOnly = true;
      else if (restriction === 'once each turn') flags.onceEachTurn = true;
      else if (/^during your (?:turn|upkeep)$/.test(restriction)) conditions.push({kind: restriction.endsWith('upkeep') ? 'your-phase' : 'your-turn', ...(restriction.endsWith('upkeep') ? {phase: 'upkeep'} : {})});
      else if (restriction.startsWith('if ')) {
        const condition = sourceCondition(card, restriction.slice(3), helpers);
        if (!condition) return null;
        conditions.push(condition);
      } else return null;
    }
    const parsed = readLine(card, activation[1] + ': ' + activation[2], helpers);
    if (parsed?.kind === 'generic-ability' && !parsed.from) return {...parsed, ...flags,
      ...(conditions.length ? {activationCondition: conditions.length === 1 ? conditions[0] : {kind: 'all', conditions}} : {})};
  }

  const duration = /^During (your turn|each opponent's turn), (.+)$/.exec(line);
  if (duration) {
    const attached = attachmentGrant(duration[2], helpers);
    if (attached) return {...attached, condition: {kind: duration[1] === 'your turn' ? 'your-turn' : 'not-your-turn'}};
    if (/^(?:enchanted|equipped) (?:creature|artifact|enchantment|land|permanent) /i.test(duration[2])) return null;
    const parsed = readLine(card, duration[2][0].toUpperCase() + duration[2].slice(1), helpers);
    const conditional = conditioned(parsed, {kind: duration[1] === 'your turn' ? 'your-turn' : 'not-your-turn'});
    if (conditional) return conditional;
  }

  const conditional = /^(?:As long as (.+?), (.+)|(.+?) as long as (.+))\.$/.exec(line);
  if (conditional) {
    const text = conditional[1] || conditional[4];
    const bodyText = conditional[2] || conditional[3];
    const host = /^(enchanted|equipped) (creature|artifact|enchantment|land|permanent) /i.exec(text) || /^(enchanted|equipped) (creature|artifact|enchantment|land|permanent) /i.exec(bodyText);
    if (host) {
      const conditionText = text.replace(/^(?:enchanted|equipped) (?:creature|artifact|enchantment|land|permanent) /i, 'this creature ');
      const condition = sourceCondition(card, conditionText, helpers);
      const attached = attachmentGrant(bodyText.replace(/^it /i, host[1] + ' ' + host[2] + ' ') + '.', helpers);
      if (condition && attached) return {...attached, condition,
        ...(/^(?:enchanted|equipped|it |it's )/i.test(text) ? {conditionSubject: 'affected'} : {})};
      return null;
    }
    const condition = sourceCondition(card, text, helpers);
    const body = bodyText.replace(/^(?:it|he|she) (gets|has|can|can't) /i, 'this creature $1 ');
    const parsed = condition && readLine(card, body[0].toUpperCase() + body.slice(1) + '.', helpers);
    const result = parsed && conditioned(parsed, condition, parsed.scope && parsed.scope !== 'self' && /^(?:it |it's |that creature )/.test(text));
    if (result) return result;
  }

  // A quoted activated/triggered ability belongs to its recipient. References
  // to the granting card inside the quote need a separate link and stay closed.
  const quoted = /^(.+?) (?:(?:gets? ([+-]\d+)\/([+-]\d+)(?:, (?:has|have) (.+?),)? and (?:has|have) )|(?:(?:has|have) ))(?:(.+?)(?:,? and) )?"([^"]+)"\.?$/.exec(line);
  if (quoted && !quoted[6].includes(card.name)) {
    const own = new RegExp('^' + self + '$', 'i').test(quoted[1]);
    const attached = /^(Enchanted|Equipped) (creature|artifact|enchantment|land|permanent)$/i.test(quoted[1]);
    const filters = own || attached ? null : groupFilters(quoted[1], helpers);
    const keywordText = [quoted[4], quoted[5]].filter(Boolean).join(', ');
    const keywords = keywordText ? helpers.keywordList?.(keywordText) : [];
    const child = (own || attached || filters) && keywords && readLine({...card, name: '__GrantedPermanent__'}, quoted[6].replace(/(?<!\.)$/, '.'), helpers);
    if (child && !child.from && ['generic-ability', 'generic-trigger', 'mana-source'].includes(child.kind)) {
      // Preserve the mana resource planner's explicit constraints on grants.
      const normalized = v7.normalizeManaOperations([child])[0];
      const granted = normalized.kind === 'mana-source'
        ? normalized.activationCost?.tap && Object.keys(normalized.activationCost).every(key => key === 'tap') && !normalized.onceEachTurn && normalized
        : !JSON.stringify(child).includes('"action":"add-mana"') && child;
      if (!granted) return null;
      const stats = {power: Number(quoted[2] || 0), toughness: Number(quoted[3] || 0), keywords};
      return attached ? {kind: 'attachment-operation', operation: granted, grant: stats, contract: 'attachment-granted-operation'}
        : {...continuous, scope: own ? 'self' : 'filtered-permanents', ...(filters ? {filters} : {}), ...stats, grantedOperation: granted};
    }
    // Static text in an attachment's quote uses the host for "this creature".
    // Do not flatten a quote containing "you": that means the host's controller.
    if (attached && child?.kind === 'generic-static' && child.scope === 'self' && !/\byou(?:r)?\b/.test(quoted[6])) {
      const allowed = new Set(['kind', 'scope', 'power', 'toughness', 'keywords', 'condition', 'cantAttack', 'cantBlock', 'unblockable', 'cantUntap', 'contract']);
      if (Object.keys(child).every(key => allowed.has(key))) {
        const {kind, scope, contract, ...grant} = child;
        const attachedGrant = {kind: 'attachment-grant', ...grant, ...(grant.condition ? {conditionSubject: 'affected'} : {}), contract: 'attachment-continuous-effect'};
        if ((quoted[2] || quoted[3] || keywords.length) && child.condition) return bundle([
          {kind: 'attachment-grant', power: Number(quoted[2] || 0), toughness: Number(quoted[3] || 0), keywords, contract: 'attachment-continuous-effect'}, attachedGrant]);
        return {...attachedGrant, power: Number(grant.power || 0) + Number(quoted[2] || 0), toughness: Number(grant.toughness || 0) + Number(quoted[3] || 0), keywords: [...keywords, ...(grant.keywords || [])]};
      }
    }
  }

  const variable = /^(.+?) (?:(?:has|have) (.+?) and )?gets? ([+-](?:X|0))\/([+-](?:X|0))(?: and (?:has|have) (.+?))?, where X is (.+)\.$/.exec(line);
  if (variable && /X/.test(variable[3] + variable[4])) {
    const own = new RegExp('^' + self + '$', 'i').test(variable[1]);
    const attached = /^(Enchanted|Equipped) (creature|artifact|enchantment|land|permanent)$/i.test(variable[1]);
    const filters = own || attached ? null : groupFilters(variable[1], helpers);
    const keywords = variable[2] || variable[5] ? helpers.keywordList?.([variable[2], variable[5]].filter(Boolean).join(', ')) : [];
    const multiplier = sourceCount(card, variable[6].replace(/^the number of /, ''), helpers);
    if ((own || attached || filters) && keywords && multiplier && !(attached && /\bit\b|\bits\b/.test(variable[6]))) {
      const stats = {power: variable[3].endsWith('X') ? variable[3][0] === '-' ? -1 : 1 : 0,
        toughness: variable[4].endsWith('X') ? variable[4][0] === '-' ? -1 : 1 : 0, multiplier, keywords};
      return attached ? {kind: 'attachment-grant', ...stats, contract: 'attachment-continuous-effect'}
        : {...continuous, scope: own ? 'self' : 'filtered-permanents', ...(filters ? {filters} : {}), ...stats, ...(!own && multiplier.other ? {multiplierSubject: 'affected'} : {})};
    }
  }

  const defenderPermission = /^(.+?) can attack as though (?:it|they) didn't have defender(?: and (?:it|they) can't be blocked)?\.$/.exec(line);
  if (defenderPermission) {
    const own = new RegExp('^' + self + '$', 'i').test(defenderPermission[1]);
    const filters = own ? null : groupFilters(defenderPermission[1], helpers);
    if (own || filters) return {...continuous, scope: own ? 'self' : 'filtered-permanents', ...(filters ? {filters} : {}), defenderCanAttack: true, ...(line.includes("can't be blocked") ? {unblockable: true} : {})};
  }

  const counted = new RegExp('^(' + self + '|.+?) gets? ([+-]\\d+)/([+-]\\d+) for each (.+?)(?: and (?:has|have) (.+))?\\.$', 'i').exec(line);
  if (counted) {
    const own = new RegExp('^' + self + '$', 'i').test(counted[1]);
    const filters = own ? null : groupFilters(counted[1], helpers);
    const multiplier = sourceCount(card, counted[4], helpers);
    const keywords = counted[5] ? helpers.keywordList?.(counted[5]) : [];
    if ((own || filters) && multiplier && keywords) return {...continuous, scope: own ? 'self' : 'filtered-permanents', ...(filters ? {filters} : {}), power: Number(counted[2]), toughness: Number(counted[3]), multiplier,
      ...(!own && multiplier.other ? {multiplierSubject: 'affected'} : {}), keywords};
  }

  const groups = /^(.+?) (?:gets? ([+-]\d+)\/([+-]\d+)(?: and (?:has|have) (.+))?|(?:has|have) (.+)|can't (attack or block|attack|block|be blocked))\.$/.exec(line);
  if (groups) {
    const own = new RegExp('^' + self + '$', 'i').test(groups[1]);
    const filters = own ? null : groupFilters(groups[1], helpers);
    const keywords = groups[4] || groups[5] ? helpers.keywordList?.(groups[4] || groups[5]) : [];
    if ((own || filters) && keywords) return {...continuous, scope: own ? 'self' : 'filtered-permanents', ...(filters ? {filters} : {}), power: Number(groups[2] || 0), toughness: Number(groups[3] || 0), keywords,
      ...(groups[6] === 'be blocked' ? {unblockable: true} : groups[6] ? {cantAttack: groups[6].includes('attack'), cantBlock: groups[6].includes('block')} : {})};
  }

  const restrictedStats = /^(.+?) (?:gets? ([+-]\d+)\/([+-]\d+)(?:, (?:has|have) (.+?),)?|(?:has|have) (.+?)) and can't (attack or block|attack|block|be blocked)\.$/.exec(line);
  if (restrictedStats) {
    const own = new RegExp('^' + self + '$', 'i').test(restrictedStats[1]);
    const filters = own ? null : groupFilters(restrictedStats[1], helpers);
    const keywords = restrictedStats[4] || restrictedStats[5] ? helpers.keywordList?.(restrictedStats[4] || restrictedStats[5]) : [];
    if ((own || filters) && keywords) return {...continuous, scope: own ? 'self' : 'filtered-permanents', ...(filters ? {filters} : {}), power: Number(restrictedStats[2] || 0), toughness: Number(restrictedStats[3] || 0), keywords,
      ...(restrictedStats[6] === 'be blocked' ? {unblockable: true} : {cantAttack: restrictedStats[6].includes('attack'), cantBlock: restrictedStats[6].includes('block')})};
  }

  const characteristic = characteristicOperation(card, line, helpers);
  if (characteristic) return characteristic;
  const attached = attachmentGrant(line, helpers);
  if (attached) return attached;
  // The older paired-self-event parser canonicalizes in the other direction;
  // only these foreign/player prefixes need the additive Whenever grammar.
  if (/^When (?:you |an opponent |a player |(?:enchanted|equipped) creature deals )/.test(line)) return readLine(card, line.replace(/^When /, 'Whenever '), helpers);
  if (!line.includes('"')) {
    const normalized = line.replace(/\bthis (?:Vehicle|Equipment|Aura|token|planeswalker|permanent|artifact|enchantment|land)\b/gi, 'this creature');
    if (normalized !== line) return readLine(card, normalized, helpers);
  }
  return null;
}

export function modifierOperation(card, line, helpers = {}) {
  if (/^(?:Other )?(?:[Aa]ttacking|[Bb]locking) creatures\b/.test(line)) return extensionLine(card, line, helpers);
  const discount = new RegExp('^This spell costs \\{(\\d+)\\} less to cast (for each|if) (.+)\\.$').exec(line);
  if (discount) {
    const multiplier = discount[2] === 'for each' ? sourceCount(card, discount[3], helpers) : null;
    const condition = discount[2] === 'if' ? sourceCondition(card, discount[3], helpers) : null;
    if (multiplier || condition) return {kind: 'cost-modifier', self: true, amount: -Number(discount[1]), ...(multiplier ? {multiplier} : {condition}), contract: 'generic-cost-modification'};
  }
  return null;
}

export function characteristicOperation(card, line, helpers = {}) {
  const match = new RegExp('^' + sourcePattern(card) + "'s (power and toughness are each|power is|toughness is) equal to (.+)\\.$", 'i').exec(line);
  if (!match) return null;
  let text = match[2];
  let offset = 0;
  let multiply = 1;
  let toughnessOffset = 0;
  const pair = /^(.+) and its toughness is equal to that number plus (\d+)$/.exec(text);
  if (pair) {
    if (match[1] !== 'power is') return null;
    text = pair[1];
    toughnessOffset = Number(pair[2]);
  }
  const leading = /^(\d+) plus (.+)$/.exec(text);
  if (leading) { offset = Number(leading[1]); text = leading[2]; }
  const trailing = /^(.+) (plus|minus) (\d+)$/.exec(text);
  if (trailing) { offset += Number(trailing[3]) * (trailing[2] === 'minus' ? -1 : 1); text = trailing[1]; }
  if (text.startsWith('twice ')) { multiply = 2; text = text.slice(6); }
  const count = text === 'your life total' ? {kind: 'life-total'} : sourceCount(card, text.replace(/^the number of /, ''), helpers);
  if (count) return {kind: 'characteristic-pt', power: match[1] !== 'toughness is', toughness: !!pair || match[1] !== 'power is', count, multiply, offset, toughnessOffset, contract: 'characteristic-power-toughness'};
  return null;
}
