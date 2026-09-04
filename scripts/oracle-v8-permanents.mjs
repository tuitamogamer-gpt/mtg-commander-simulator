// Additive version 8 permanent clauses. Every returned descriptor must use an
// existing engine contract; unrecognized clauses remain deferred.
import * as v5 from './oracle-extensions-v5.mjs';
import * as v6 from './oracle-extensions-v6.mjs';
import * as v7 from './oracle-extensions-v7.mjs';
import { ORACLE_SUBTYPES, ORACLE_SUBTYPE_TYPES } from './oracle-subtypes.mjs';
import { combatLine } from './oracle-v8-combat.mjs';
import {lossLine,lossEffect} from './oracle-v8-ability-loss.mjs';

const escape = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const NUMBER = '(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|twenty|[0-9]+)';
const number = value => ({a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twenty: 20}[value.toLowerCase()] ?? Number(value));
const continuous = {kind: 'generic-static', contract: 'generic-continuous-effect'};
const STATIC_KINDS = new Set(['generic-static', 'cost-modifier', 'base-pt-static', 'protection-static', 'attachment-grant', 'v8-type-static', 'v8-layered-static', 'attachment-operation']);
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
  const names = [...new Set([card.name, card.name.split(/,| the /)[0], ...(/\bLegendary\b/.test(card.type_line || '') ? [card.name.split(/,| of | the /)[0]] : [])])].filter(Boolean).map(escape);
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
  const normalized = text.replace(own, 'this creature').replace(new RegExp('(?<=counters on )'+sourcePattern(card)+'(?= this turn$)','gi'),'this creature')
    .replace(/^(?:he|she) (is|was|has|entered) /, 'it $1 ').replace(/^(?:he's|she's) /, "it's ");
  return primitive(helpers, 'condition', normalized) || extensionCondition(normalized, helpers);
}

// Additive spellings for existing live value predicates. These conditions do
// not invent history, bind an event player, or read a departed object's counters.
export function extensionCondition(text, helpers = {}) {
  const live = (test, fields = {}) => ({kind: 'v8-live-condition', test, ...fields});
  const commonColor = /^(white|blue|black|red|green) is the most common color among all permanents or is tied for most common$/.exec(text);
  if (commonColor) return live('most-common-color', {color: {white:'W',blue:'U',black:'B',red:'R',green:'G'}[commonColor[1]]});
  if (text === 'your life total is less than or equal to half your starting life total') return live('half-starting-life');
  const library = new RegExp('^a library has (' + NUMBER + ') or (more|fewer) cards in it$').exec(text);
  if (library) return {kind:'player-zone-count',players:'all',zone:'library',[library[2]==='more'?'min':'max']:number(library[1])};
  const singleGrave = new RegExp('^there are (' + NUMBER + ') or more cards in a single graveyard$').exec(text);
  if (singleGrave) return {kind:'player-zone-count',players:'all',zone:'graveyard',min:number(singleGrave[1])};
  const graveExists = /^(?:a|an) (.+?) card is in your graveyard$/.exec(text);
  if (graveExists) return primitive(helpers, 'condition', 'there is a ' + graveExists[1] + ' card in your graveyard');
  const graveBoth = /^(?:a|an) (.+?) card and (?:a|an) (.+?) card are in your graveyard$/.exec(text);
  if (graveBoth) {const conditions = graveBoth.slice(1).map(noun => primitive(helpers,'condition','there is a '+noun+' card in your graveyard'));if(conditions.every(Boolean))return {kind:'all',conditions};}
  const absentOpp = /^no opponent controls (?:a|an) (.+)$/.exec(text);
  if (absentOpp) {const count=primitive(helpers,'count',absentOpp[1]+' your opponents control');if(count?.zone==='battlefield')return {kind:'count-comparison',count,max:0};}
  if (text === 'you had another creature enter the battlefield under your control this turn') return {kind:'another-entry-turn',what:'creature'};
  const typedEntry = /^(?:(a|an|another) (artifact|land|[A-Z][a-z-]+)) entered the battlefield under your control this turn$/.exec(text);
  if(typedEntry&&(typedEntry[2]==='artifact'||typedEntry[2]==='land'||ORACLE_SUBTYPES.has(typedEntry[2])))return live('entry-turn',{
    ...(typedEntry[2]==='artifact'||typedEntry[2]==='land'?{type:typedEntry[2][0].toUpperCase()+typedEntry[2].slice(1)}:{type:'Creature',subtype:typedEntry[2]}),...(typedEntry[1]==='another'?{another:true}:{})});
  const sacrifice = /^you(?:'ve| have)? sacrificed (?:a|an) (permanent|artifact) this turn$/.exec(text);
  if(sacrifice)return live('sacrifice-turn',sacrifice[1]==='artifact'?{type:'Artifact'}:{});
  if(/^you(?:'ve| have)? put one or more \+1\/\+1 counters on a creature this turn$/.test(text))return live('counter-put-turn',{counter:'+1/+1'});
  if(/^you(?:'ve| have)? put one or more \+1\/\+1 counters on this creature this turn$/.test(text))return live('counter-put-turn',{counter:'+1/+1',self:true});
  const mixedEntry = /^you control (.+?) or ((?:a|an) (?:artifact|land) entered the battlefield under your control this turn)$/.exec(text);
  if(mixedEntry){const conditions=[primitive(helpers,'condition','you control '+mixedEntry[1]),extensionCondition(mixedEntry[2],helpers)];if(conditions.every(Boolean))return {kind:'any',conditions};}
  if (/^you(?:'ve| have)? committed a crime this turn$/.test(text)) return live('crime-turn');
  if (text === "you haven't cast a spell this turn") return {kind:'not',condition:{kind:'turn-stat',field:'spellsCast',min:1}};
  if (text === 'an opponent owns a card in exile') return {kind:'count-comparison',count:{kind:'count',zone:'exile',what:'card',controller:'opponents'},min:1};
  if (text === 'you own a card in exile that has an Adventure') return live('exile-adventure');
  const hostGraveCondition=new RegExp('^its controller has ('+NUMBER+') or more (creature cards|cards) in their graveyard$').exec(text);
  if(hostGraveCondition)return {kind:'count-comparison',count:{kind:'v8-permanent-count',test:'controller-graveyard',creatures:hostGraveCondition[2]==='creature cards',relative:true},min:number(hostGraveCondition[1])};
  const auraCount=new RegExp('^(?:it|this creature) is enchanted by (exactly )?('+NUMBER+') (or more )?Auras?$').exec(text);
  if(auraCount)return {kind:'count-comparison',count:{kind:'source-attachments',what:'Aura'},min:number(auraCount[2]),...(auraCount[1]?{max:number(auraCount[2])}:{})};
  const ownTotal = new RegExp('^(?:it|this creature|this artifact|this enchantment|this permanent) has ('+NUMBER+') or more counters on it$').exec(text);
  if (ownTotal) return live('source-counter-total',{min:number(ownTotal[1])});
  const namedCounters = new RegExp('^there are ('+NUMBER+') or (more|fewer) (\\+1/\\+1|-1/-1|[a-z]+) counters on this (?:creature|artifact|enchantment|land|permanent)$').exec(text);
  if (namedCounters) return {kind:'count-comparison',count:{kind:'source-counters',counter:namedCounters[3]},[namedCounters[2]==='more'?'min':'max']:number(namedCounters[1])};
  const totalCounters = new RegExp('^there are ('+NUMBER+') or more counters among creatures you control$').exec(text);
  if (totalCounters) return live('creature-counter-total',{min:number(totalCounters[1])});
  const counterCreature = new RegExp('^you control a creature with ('+NUMBER+') or more (\\+1/\\+1|-1/-1|[a-z]+) counters on it$').exec(text);
  if (counterCreature) return live('creature-counter-minimum',{counter:counterCreature[2],min:number(counterCreature[1])});
  const anyCounterCreature = /^a creature has (?:a|an) (\+1\/\+1|-1\/-1|[a-z]+) counter on it$/.exec(text);
  if(anyCounterCreature)return live('creature-counter-minimum',{counter:anyCounterCreature[1],min:1,anyPlayer:true});
  if (/^(?:it|this creature) is renowned$/.test(text)) return live('renowned');
  if (/^(?:it|this creature) is attacking alone$/.test(text)) return live('attacking-alone');
  const blockedBy = new RegExp('^('+NUMBER+') or more creatures are blocking (?:it|this creature)$').exec(text);
  if(blockedBy)return live('blocker-count',{min:number(blockedBy[1])});
  if(text==='its controller controls no other creatures')return live('controller-other-creatures',{max:0});
  if(text==='its controller controls another creature')return live('controller-other-creatures',{min:1});
  if(/^you control another .+ or (?:a|an) /.test(text)) {const parts=text.slice('you control '.length).split(/ or (?=a |an )/),conditions=parts.map(noun=>primitive(helpers,'condition','you control '+noun));if(conditions.every(Boolean))return {kind:'any',conditions};}
  if(text==='this creature is enchanted or equipped')return {kind:'any',conditions:[{kind:'source-status',status:'enchanted'},{kind:'source-status',status:'equipped'}]};
  const devotion = new RegExp('^(your devotion to (?:white|blue|black|red|green)(?: and (?:white|blue|black|red|green))?) is less than (' + NUMBER + ')$').exec(text);
  if (devotion) {
    const count = primitive(helpers, 'count', devotion[1]);
    if (count?.kind === 'devotion' && number(devotion[2]) > 0) return {kind: 'count-comparison', count, max: number(devotion[2]) - 1};
  }
  const walker = /^you control (?:a|an) ([A-Z][A-Za-z-]+) planeswalker$/.exec(text);
  if (walker && ORACLE_SUBTYPES.has(walker[1])) return {kind: 'count-comparison', count: {kind: 'count', zone: 'battlefield', what: 'planeswalker',
    filters: [{what: 'planeswalker', zone: 'battlefield', controller: 'you', subtype: walker[1]}]}, min: 1};
  const sharedControl = /^you control ((?:a|an) .+?) and ((?:a|an) .+)$/.exec(text);
  if (sharedControl) {
    const conditions = sharedControl.slice(1).map(noun => primitive(helpers, 'condition', 'you control ' + noun));
    if (conditions.every(Boolean)) return {kind: 'all', conditions};
  }
  const grave = new RegExp('^you have (' + NUMBER + ') or (more|fewer) (.+? cards) in your graveyard$').exec(text);
  if (grave) {
    const count = primitive(helpers, 'count', grave[3] + ' in your graveyard');
    if (count) return {kind: 'count-comparison', count, [grave[2] === 'more' ? 'min' : 'max']: number(grave[1])};
  }
  const fewerGrave = new RegExp('^there are fewer than (' + NUMBER + ') (.+? cards) in your graveyard$').exec(text);
  if (fewerGrave) {
    const count = primitive(helpers, 'count', fewerGrave[2] + ' in your graveyard');
    if (count && number(fewerGrave[1]) > 0) return {kind: 'count-comparison', count, max: number(fewerGrave[1]) - 1};
  }
  const absent = /^no (creatures|artifacts|enchantments|lands|permanents) are on the battlefield$/.exec(text);
  if (absent) return {kind: 'count-comparison', count: {kind: 'count', zone: 'battlefield', controller: 'all', what: absent[1].slice(0, -1)}, max: 0};
  if (/^you (?:didn't|did not) attack with a creature this turn$/.test(text)) return {kind: 'not', condition: {kind: 'attacked'}};
  if (/^you (?:didn't|did not) lose life this turn$/.test(text)) return {kind: 'not', condition: {kind: 'turn-stat', field: 'lifeLost', min: 1}};
  if (text === 'you discarded a card this turn') return {kind: 'turn-stat', field: 'discardedN', min: 1};
  if (text === 'a permanent you controlled left the battlefield this turn') return {kind: 'turn-stat', field: 'permanentsLeftBattlefield', min: 1};
  const noCounter = /^(?:it|this creature|this artifact|this enchantment|this land|this permanent) (?:has no|doesn't have (?:a|an)) (\+1\/\+1|-1\/-1|[a-z]+) counters? on it$/.exec(text)
    || /^there are no (\+1\/\+1|-1\/-1|[a-z]+) counters on (?:this creature|this artifact|this enchantment|this land|this permanent)$/.exec(text);
  if (noCounter) return {kind: 'not', condition: {kind: 'source-quality', filter: {what: 'permanent', zone: 'battlefield', controller: 'any', hasCounter: noCounter[1]}}};
  return null;
}

export function extensionCount(text, helpers = {}) {
  const descriptor=(test,fields={})=>({kind:'v8-permanent-count',test,...fields});
  if(/^counters? on (?:it|this creature|this artifact|this enchantment|this permanent)$/.test(text))return descriptor('source-counter-total');
  if(/^(?:Auras?|Equipment) and (?:Auras?|Equipment) attached to (?:it|this creature|this artifact|this permanent)$/.test(text)&&text.includes('Aura')&&text.includes('Equipment'))return descriptor('attachments',{relative:true});
  const shared=/^other creatures? (you control|on the battlefield) that shares? (?:at least one creature type|a creature type) with (?:it|this creature)$/.exec(text);
  if(shared)return descriptor('shared-creature-types',{controller:shared[1]==='you control'?'you':'all',other:true,relative:true});
  if(text==='of its colors')return descriptor('colors',{relative:true});
  if(text==='its mana value')return descriptor('mana-value',{relative:true});
  const symbols=/^(white|blue|black|red|green) mana symbols? in its mana cost$/.exec(text);
  if(symbols)return descriptor('mana-symbols',{color:{white:'W',blue:'U',black:'B',red:'R',green:'G'}[symbols[1]],relative:true});
  const counters=/^(\+1\/\+1|-1\/-1|[a-z]+) counters? on other creatures you control$/.exec(text);
  if(counters)return descriptor('creature-counters',{counter:counters[1],other:true});
  if(/^cards? with cycling in your graveyard$/.test(text))return descriptor('graveyard-cycling');
  if(/^times? you(?:'ve| have) cast your commander from the command zone this game$/.test(text))return descriptor('commander-casts');
  if(text==='the greatest mana value among your commanders')return descriptor('commander-mana-value');
  const graveCount=/^graveyards? with (\d+|seven) or more cards in (?:it|them)$/.exec(text);
  if(graveCount)return descriptor('graveyard-size-count',{min:graveCount[1]==='seven'?7:Number(graveCount[1])});
  if(text==='creatures that entered the battlefield under your control this turn')return descriptor('creature-entries');
  const hostGrave=/^(?:the number of )?(creature cards|cards) in its controller's graveyard$/.exec(text);
  if(hostGrave)return descriptor('controller-graveyard',{creatures:hostGrave[1]==='creature cards',relative:true});
  const singular=text.replace(/^other creature on the battlefield with /,'other creatures on the battlefield with ');
  if(singular!==text){const match=/^other creatures on the battlefield with (.+)$/.exec(singular),target=match&&primitive(helpers,'target','target creature with '+match[1]);if(target?.zone==='battlefield')return {kind:'count',zone:'battlefield',what:'creature',controller:'all',other:true,filters:[target]};}
  return null;
}

// Animation is a fixed characteristic-setting effect. Values are locked when
// it resolves; a later count change does not turn it into a CDA.
export function extensionEffect(card, line, helpers = {}) {
  const loss=lossEffect(card,line,helpers);if(loss)return loss;
  const destroyColors=/^Destroy (target (?:creature|planeswalker|creature or planeswalker))\. You gain (\d+) life for each of its colors\.$/.exec(line);
  if(destroyColors){const target=primitive(helpers,'target',destroyColors[1]);if(target?.zone==='battlefield')return {targets:[target],optional:false,effects:[{action:'destroy',target:0},{action:'gain-life',who:'you',n:{kind:'v8-target-permanent-count',target:0,count:{kind:'v8-permanent-count',test:'colors',relative:true},multiply:Number(destroyColors[2])}}]};}

  const capacity = new RegExp('^(' + sourcePattern(card) + ') can block an additional creature this turn\\.$', 'i').exec(line);
  if (capacity) return {targets: [], effects: [{action: 'combat-restriction', target: 'self', restriction: {combatRule: {kind: 'block-capacity', additional: 1}}, duration: 'eot'}]};
  let text = line.replace(/\.$/, ''), temporary = false, optional = false;
  if (/^Until end of turn, /i.test(text)) { temporary = true; text = text.replace(/^Until end of turn, /i, ''); }
  if (/^you may have /i.test(text)) { optional = true; text = text.replace(/^you may have /i, ''); }
  let retainAllSubtypes = false;
  const still = /(?:\. (?:It's|It is) still a (?:land|artifact)| that's still a land)$/.exec(text);
  if (still) { retainAllSubtypes = true; text = text.slice(0, -still[0].length); }
  let value = null;
  const where = /, where X is (.+)$/.exec(text);
  if (where) {
    const phrase = where[1].replace(new RegExp(sourcePattern(card) + "'s power$", 'i'), "this creature's power");
    value = primitive(helpers, 'value', phrase) || primitive(helpers, 'count', phrase.replace(/^the number of /, ''));
    if (!value || value === 'X') return null;
    text = text.slice(0, -where[0].length);
  }
  if (/ until end of turn$/i.test(text)) { if (temporary) return null; temporary = true; text = text.replace(/ until end of turn$/i, ''); }
  if (/ in addition to its other types$/i.test(text)) { retainAllSubtypes = true; text = text.replace(/ in addition to its other types$/i, ''); }
  // The suffix may precede the explicit duration in Oracle text.
  if (/ until end of turn$/i.test(text)) { if (temporary) return null; temporary = true; text = text.replace(/ until end of turn$/i, ''); }
  const match = /^(.+?) becomes? (?:a |an )?(?:(\d+|X)\/(\d+|X) )?(.+?)(?: with (.+?)| and gains? (.+?)| and loses (flying))?$/.exec(text);
  if (!match) return null;
  const own = new RegExp('^(?:' + sourcePattern(card) + '|it)$', 'i').test(match[1]);
  const target = own ? null : primitive(helpers, 'target', match[1]);
  if (!own && target?.zone !== 'battlefield' || own && /\b(?:Instant|Sorcery)\b/.test(card.type_line || '')) return null;
  const type = /^(?:(white|blue|black|red|green|colorless)(?: and (white|blue|black|red|green))? )?((?:[A-Z][a-z-]+ )*)(artifact )?creature$/.exec(match[4]);
  if (!type) return null;
  const subtypes = type[3].trim() ? type[3].trim().split(' ') : [];
  if (subtypes.some(subtype => !ORACLE_SUBTYPES.has(subtype) || ORACLE_SUBTYPE_TYPES[subtype])) return null;
  // Omitting P/T is exact for Vehicle animation, preserving its printed P/T.
  if (!match[2] && (!(own ? /\bVehicle\b/.test(card.type_line || '') : target?.subtype === 'Vehicle') || !type[4] || subtypes.length || type[1])) return null;
  if (where && (match[2] !== 'X' || match[3] !== 'X')) return null;
  if ((match[2] === 'X' || match[3] === 'X') && !value && !(own && String(card.oracle_text || '').split('\n').some(row => /^.*\{X\}[^:]*: /.test(row) && /becomes? an? X\/X/.test(row)))) return null;
  let keywordText = match[5] || match[6] || '', allCreatureTypes = false;
  if (/(?:^| and )all creature types$/.test(keywordText)) { allCreatureTypes = true; keywordText = keywordText.replace(/(?:^| and )all creature types$/, ''); }
  const hasInfect = keywordText.split(/,? and |, /).includes('infect');
  const restKeywords = hasInfect ? keywordText.split(/,? and |, /).filter(word => word !== 'infect').join(' and ') : keywordText;
  const keywords = restKeywords ? helpers.keywordList?.(restKeywords) : [];
  if (!keywords) return null;
  if (hasInfect) keywords.push('infect');
  const effect = {action: 'animate', target: own ? 'self' : 0,
    ...(match[2] ? {power: match[2] === 'X' ? value || 'X' : Number(match[2]), toughness: match[3] === 'X' ? value || 'X' : Number(match[3])} : {}),
    types: type[4] ? ['Artifact', 'Creature'] : ['Creature'], subtypes, keywords,
    colors: type[1] ? type[1] === 'colorless' ? [] : [type[1], type[2]].filter(Boolean).map(color => ({white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G'}[color])) : null,
    retainTypes: retainAllSubtypes || !!type[4], retainAllSubtypes, replaceCreatureSubtypes: !retainAllSubtypes && subtypes.length > 0,
    temporary, ...(allCreatureTypes ? {allCreatureTypes: true} : {}), ...(match[7] ? {removeKeywords: [match[7]]} : {})};
  return {targets: target ? [target] : [], optional, effects: [effect]};
}

function conditionEventHeader(card, prefix, parsed, helpers) {
  const self = sourcePattern(card);
  const cast = /^Whenever (you cast|an opponent casts|a player casts) (?:a|an) (.+? spell|spell)$/.exec(prefix);
  if (cast) {
    const target = primitive(helpers, 'target', 'target ' + cast[2]);
    return ['cast', 'castNonCreature'].includes(parsed.event) && target?.zone === 'stack' ? {event: 'cast', rule: {kind: 'v8-event', target,
      player: cast[1] === 'you cast' ? 'you' : cast[1].startsWith('an opponent') ? 'opponent' : 'any'}} : null;
  }
  if (prefix === 'Whenever you discard a card') return parsed.event === 'discarded' ? {event: 'discarded', rule: {kind: 'v8-event', player: 'you'}} : null;
  const eventNames = {enters: 'etb', dies: 'dies', attacks: 'attacks', 'leaves the battlefield': 'lto',
    'is turned face up': 'turnedFaceUp', 'deals combat damage to a player': 'combatDamageToPlayer'};
  const header = /^(?:When|Whenever) (.+?) (enters|dies|attacks|leaves the battlefield|is turned face up|deals combat damage to a player)$/.exec(prefix);
  if (!header) return null;
  const event = eventNames[header[2]];
  if (parsed.event !== event) return null;
  const own = new RegExp('^' + self + '$', 'i').test(header[1]);
  const attached = /^(enchanted|equipped) (creature|permanent)$/.test(header[1]);
  const joined = new RegExp('^' + self + ' or another creature you control$', 'i').test(header[1]);
  const target = own || attached ? null : primitive(helpers, 'target', 'target ' + (joined ? 'creature you control' : header[1].replace(/^(?:a|an|another) /, '')));
  if (!(own || attached || target?.zone === 'battlefield')) return null;
  return {event, rule: {kind: 'v8-event', ...(own || attached ? {subject: own ? 'self' : 'attached'} : {target,
    ...(/^another /.test(header[1]) ? {subject: 'another'} : {})})}};
}

function boundEventCondition(card, header, text, helpers) {
  const event = header.event, death = ['dies', 'lto'].includes(event), self = sourcePattern(card);
  const descriptor = (predicate, fields = {}) => ({kind: 'v8-event-condition', predicate, ...fields});
  if (event === 'cast') {
    if (text === 'that spell was kicked') return descriptor('cast-kicked');
    if (text === "it's not their turn") return descriptor('caster-not-turn');
    const spent = new RegExp('^at least (' + NUMBER + ') mana was spent to cast (?:it|that spell)$').exec(text);
    if (spent) return descriptor('cast-mana', {min: number(spent[1])});
    if (new RegExp('^the amount of mana spent to cast that spell is greater than ' + self + "'s power$", 'i').test(text)) return descriptor('cast-mana-vs-source-power');
  }
  if (death) {
    const counters = /^(?:it|that creature|that permanent) had (no |a |one or more )?(?:(\+1\/\+1|-1\/-1|[a-z]+) )?counters?(?: on it)?$/.exec(text);
    if (counters) return descriptor('past-counters', {...(counters[2] ? {counter: counters[2]} : {}), ...(counters[1] === 'no ' ? {max: 0} : {min: 1})});
    if (/^(?:it|that creature) wasn't blocking$/.test(text)) return descriptor('past-blocking', {negate: true});
    if (/^(?:it|that creature) was blocking$/.test(text)) return descriptor('past-blocking');
    if (/^(?:it|that creature|that permanent) was historic$/.test(text)) return descriptor('past-historic');
    const quality = /^(?:it|that creature|that permanent) was (.+)$/.exec(text);
    if (quality) {
      const noun = quality[1].replace(/^(?:a|an) /, '');
      const filter = primitive(helpers, 'target', 'target ' + (noun === 'historic' ? 'historic permanent' : noun));
      if (filter?.zone === 'battlefield') return descriptor('past-quality', {filter});
    }
    if (text === 'an Aura you controlled was attached to it') return descriptor('past-owned-aura');
  }
  if (['etb', 'turnedFaceUp', 'attacks', 'combatDamageToPlayer'].includes(event)) {
    if (/^(?:that creature|it) entered this turn$/.test(text)) return descriptor('entered-turn');
    const quality = /^(?:that creature|it) is (?:a|an) (.+)$/.exec(text) || /^(?:it's) (?:a|an) (.+)$/.exec(text);
    if (quality) { const filter = primitive(helpers, 'target', 'target ' + quality[1]); if (filter?.zone === 'battlefield') return descriptor('live-quality', {filter}); }
    const keyword = /^(?:it|that creature) (has|doesn't have) (.+)$/.exec(text);
    if (keyword) {
      const filter = primitive(helpers, 'target', 'target creature with ' + keyword[2]);
      if (filter?.withKeyword) return descriptor('live-keyword', {keyword: filter.withKeyword, ...(keyword[1] === "doesn't have" ? {negate: true} : {})});
    }
  }
  if (event === 'etb') {
    const stats = /^(?:that creature|it) is (\d+)\/(\d+)$/.exec(text);
    if (stats) return descriptor('live-stats', {power: Number(stats[1]), toughness: Number(stats[2])});
    if (new RegExp('^(?:it|that creature) has greater power or toughness than ' + self + '$', 'i').test(text) ||
      new RegExp("^(?:its|that creature's) power is greater than " + self + "'s power or (?:its|that creature's) toughness is greater than " + self + "'s toughness$", 'i').test(text)) return descriptor('greater-than-source');
  }
  return null;
}

function sourceCount(card, text, helpers) {
  const own = new RegExp('(?<![A-Za-z0-9])' + sourcePattern(card) + '(?![A-Za-z0-9])', 'gi');
  const normalized=text.replace(own,'this creature');
  const count=primitive(helpers,'count',normalized)||extensionCount(normalized,helpers);
  if(count)return count;
  const value=primitive(helpers,'value',normalized);
  return value&&['life-total','max-stat'].includes(value.kind)?value:null;
}

function composedTrigger(card, line, helpers) {
  const self = sourcePattern(card);
  const firstCombat = new RegExp('^Whenever ' + self + ' (attacks|deals combat damage to a player) for the first time each turn, (.+)$', 'i').exec(line);
  if (firstCombat) return objectTrigger(card, firstCombat[1] === 'attacks' ? 'attacks' : 'combatDamageToPlayer', {subject: 'self', firstThisTurn: true}, firstCombat[2], helpers);
  const another = new RegExp('^(When(?:ever)?) ' + self + ' or another (.+?) (enters|dies|attacks), (.+)$', 'i').exec(line);
  if (another) {
    const target = primitive(helpers, 'target', 'target ' + another[2]);
    if (target?.zone !== 'battlefield') return null;
    const event = {enters: 'etb', dies: 'dies', attacks: 'attacks'}[another[3]];
    const operations = [objectTrigger(card, event, {subject: 'self'}, another[4], helpers), objectTrigger(card, event, {subject: 'another', target}, another[4], helpers)];
    return operations.every(Boolean) ? bundle(operations) : null;
  }
  // "While" belongs to the trigger event. It is not an intervening-if
  // condition and is not checked a second time when the ability resolves.
  const whileEvent = new RegExp('^Whenever ' + self + ' (attacks|attacks or blocks) while (.+?), (.+)$', 'i').exec(line);
  if (whileEvent) {
    const condition = sourceCondition(card, whileEvent[2], helpers); if (!condition) return null;
    const events = whileEvent[1] === 'attacks' ? ['attacks'] : ['attacks', 'blocks'];
    const operations = events.map(event => objectTrigger(card, event, {subject: 'self', headerCondition: condition}, whileEvent[3], helpers));
    return operations.every(Boolean) ? operations.length === 1 ? operations[0] : bundle(operations) : null;
  }
  let clauses;
  const joined = /^(.+?) and (when(?:ever)? |at the beginning of )(.+?), (.+)$/i.exec(line);
  if (joined && /^(When|Whenever|At) /.test(joined[1])) {
    const right = joined[2] + joined[3];
    clauses = [joined[1] + ', ' + joined[4], right[0].toUpperCase() + right.slice(1) + ', ' + joined[4]];
  }
  const shared = /^(When(?:ever)?) (.+?) (enters|dies|attacks|blocks|deals combat damage to a player) or (enters|dies|attacks|blocks|leaves the battlefield|deals combat damage to a player), (.+)$/.exec(line);
  if (!clauses && shared) clauses = [shared[1] + ' ' + shared[2] + ' ' + shared[3] + ', ' + shared[5], shared[1] + ' ' + shared[2] + ' ' + shared[4] + ', ' + shared[5]];
  if (!clauses) return null;
  const parsed = clauses.map(text => readLine(card, text, helpers));
  const operations = parsed.flatMap(operation => operation?.kind === 'operation-bundle' ? operation.operations : [operation]);
  if (operations.some(operation => operation?.kind !== 'generic-trigger')) return null;
  // Two clauses on different engine events cannot overlap. Overlapping
  // same-event clauses need a single union predicate, not duplicated triggers.
  const events = operations.flatMap(operation => [].concat(operation.event));
  if (new Set(events).size !== events.length) return null;
  return bundle(operations);
}

function layeredStatic(card,line,helpers){
  if(/^(?:As long as|During|When|Whenever|At) /.test(line))return null;
  const self=sourcePattern(card),subject=text=>{
    const own=new RegExp('^'+self+'$','i').test(text),attached=/^(Enchanted|Equipped) (creature|artifact|enchantment|land|permanent)$/i.test(text),filters=own||attached?null:groupFilters(text,helpers);
    return own||attached||filters?{own,attached,filters}:null;
  };
  const typeOperation=(noun,change)=>{const scope=subject(noun);return scope?{kind:'v8-type-static',...scope,change,contract:'continuous-characteristic-type'}:null;};
  const combine=(type,operation)=>{
    const allowed=new Set(['kind','contract','scope','filters','own','attached','power','toughness','keywords','subtypes','grantedOperation','condition','conditionSubject']);
    if(!['generic-static','attachment-grant','base-pt-static'].includes(operation.kind)||Object.keys(operation).some(key=>!allowed.has(key))||operation.subtypes?.length)return null;
    const {kind,contract,change,...scope}=type,{condition,conditionSubject,...child}=operation;
    return {kind:'v8-layered-static',...scope,change,operation:child,...(condition?{condition,...(conditionSubject?{conditionSubject}:{})}:{}),contract:'continuous-layered-characteristics'};
  };
  const addType=/^(.+?),? and (?:is|are) (?:a |an )?([A-Z][a-z-]+) in addition to (?:its|their) other (?:creature )?types\.$/.exec(line);
  if(addType&&!ORACLE_SUBTYPES.has(addType[2])&&ORACLE_SUBTYPES.has(addType[2].slice(0,-1)))addType[2]=addType[2].slice(0,-1);
  if(addType&&ORACLE_SUBTYPES.has(addType[2])&&!ORACLE_SUBTYPE_TYPES[addType[2]]){
    const prefix=addType[1].replace(/,$/,'').replace(/, (has|have) /,' and $1 '),noun=/^(.+?) (?:gets?|has|have) /.exec(prefix)?.[1],child=noun&&readLine(card,prefix+'.',helpers),type=noun&&typeOperation(noun,{addCreatureTypes:[addType[2]]});
    if(type&&child&&STATIC_KINDS.has(child.kind))return combine(type,child);
  }
  const allTypes=/^(.+?) and (?:is|are) (?:all|every) creature types?\.$/.exec(line);
  if(allTypes){const noun=/^(.+?) (?:gets?|has|have) /.exec(allTypes[1])?.[1],child=noun&&readLine(card,allTypes[1].replace(/,$/,'').replace(/, (has|have) /,' and $1 ')+'.',helpers),type=noun&&typeOperation(noun,{allCreatureTypes:true});if(type&&child&&STATIC_KINDS.has(child.kind))return combine(type,child);}
  const color=/^(.+?) gets? ([+-]\d+)\/([+-]\d+), is (white|blue|black|red|green), (?:has (.+?), and |and )?has (.+)\.?$/.exec(line);
  if(color){const tail=color[6].replace(/\.$/,''),child=readLine(card,color[1]+' gets '+color[2]+'/'+color[3]+(color[5]?', has '+color[5]+',':'')+' and has '+tail+'.',helpers),type=typeOperation(color[1],{colors:[{white:'W',blue:'U',black:'B',red:'R',green:'G'}[color[4]]]});if(type&&child&&STATIC_KINDS.has(child.kind))return combine(type,child);}
  const base=/^(.+?) (?:has|have) base (?:(power) (\d+)|(toughness) (\d+)|power and toughness (\d+)\/(\d+))(?:,? (?:and )?(?:(?:has|have) )?(.+?))?(?:,? and (?:is|are) (?:a |an )?(.+?) in addition to (?:its|their) other (?:creature )?types)?\.$/.exec(line);
  if(base){const scope=subject(base[1]),keywords=base[8]?helpers.keywordList?.(base[8]):[],subtypes=base[9]?base[9].split(' ').map(word=>ORACLE_SUBTYPES.has(word)?word:word.slice(0,-1)):[];
    if(scope&&keywords&&subtypes.every(type=>ORACLE_SUBTYPES.has(type)&&!ORACLE_SUBTYPE_TYPES[type]))return {kind:'base-pt-static',...scope,...(base[2]?{power:Number(base[3])}:base[4]?{toughness:Number(base[5])}:{power:Number(base[6]),toughness:Number(base[7])}),keywords,subtypes,contract:'base-pt-static'};
  }
  return null;
}

function groupFilters(text, helpers) {
  if (/^(?:Enchanted|Equipped) (?:creature|artifact|enchantment|land|permanent)$/i.test(text)) return null;
  const landCreatures=/^(Other )?land creatures(?: (you control|your opponents control|an opponent controls))?$/i.exec(text);
  if(landCreatures)return [{what:'creature',alsoType:'Land',zone:'battlefield',controller:!landCreatures[2]?'any':landCreatures[2].toLowerCase()==='you control'?'you':'opponent',min:1,...(landCreatures[1]?{excludeSelf:true}:{})}];
  const outlaws=/^(Other )?outlaws (you control|your opponents control|an opponent controls)$/i.exec(text);
  if(outlaws)return ['Assassin','Mercenary','Pirate','Rogue','Warlock'].map(subtype=>({what:'creature',subtype,zone:'battlefield',controller:outlaws[2].toLowerCase()==='you control'?'you':'opponent',min:1,...(outlaws[1]?{excludeSelf:true}:{})}));
  const tokens=/^(Other )?(?:(Attacking|Blocking) )?(?:([A-Z][a-z-]+) )?tokens (you control|your opponents control|an opponent controls)$/i.exec(text);
  if(tokens&&(!tokens[3]||ORACLE_SUBTYPES.has(tokens[3])&&!ORACLE_SUBTYPE_TYPES[tokens[3]]))return [{what:'permanent',zone:'battlefield',controller:tokens[4].toLowerCase()==='you control'?'you':'opponent',min:1,token:true,...(tokens[1]?{excludeSelf:true}:{}),...(tokens[2]?{[tokens[2].toLowerCase()]:true}:{}),...(tokens[3]?{subtype:tokens[3]}:{})}];
  text=text.replace(/^(.+?) (you control|your opponents control|an opponent controls) that are (equipped|enchanted)$/i,'$3 $1 $2').replace(/^(.+?) that are (equipped|enchanted)$/i,'$2 $1');
  let phrase = text.replace(/ with (\+1\/\+1|-1\/-1|[a-z]+) counters on them$/, ' with one or more $1 counters on them').replace(/ counters on them$/, ' counters on it').replace(/^Other /, 'other ').replace(/^All /, '').replace(/^Each /, '')
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

// These headers use events already emitted by the turn runner. In particular,
// an attack declaration is distinct from a creature being put into combat.
function additionalObjectTriggers(card, line, helpers) {
  const self = sourcePattern(card);
  const attackDefender = /^Whenever you attack (a player or planeswalker|a player) with one or more (.+?), (.+)$/.exec(line);
  const attackingGroups = /^Whenever one or more (.+?) attack( you| a player)?, (.+)$/.exec(line)
    || (attackDefender ? [attackDefender[0], attackDefender[2] + ' you control', ' ' + attackDefender[1], attackDefender[3]] : null);
  if (attackingGroups) {
    let noun = attackingGroups[1], status;
    if (noun === 'suspected creatures you control') { noun = 'creatures you control'; status = 'suspected'; }
    if (noun === 'creatures that are enchanted by an Aura you control') { noun = 'creatures'; status = 'enchanted-by-you'; }
    const filters = groupFilters(noun, helpers);
    if (filters?.length === 1) {
      const defender = attackingGroups[2];
      const parsed = trigger(card, 'attackersDeclared', {kind: 'v8-event', target: filters[0],
        ...(defender === ' you' ? {declaredDefender: 'you'} : defender ? {...(attackDefender || / you control$/.test(noun) ? {player: 'you'} : {}), perDefender: defender === ' a player' ? 'player' : 'player-or-planeswalker'} : {}),
        ...(status ? {attackerStatus: status} : {})}, attackingGroups[3], helpers);
      // A group has no single event card; per-defender multiplication also
      // deliberately admits only effects which do not bind a defending player.
      if (parsed && !/"event-card(?:-stat|-controller|-counters)?"|"event-player"/.test(JSON.stringify(parsed))) return parsed;
    }
  }
  const attachedBattalion = new RegExp('^(?:When|Whenever) (?:enchanted|equipped) creature and at least (' + NUMBER + ') other creatures? attack, (.+)$', 'i').exec(line);
  if (attachedBattalion) {
    const minimum = number(attachedBattalion[1]);
    const parsed = minimum >= 1 && trigger(card, 'attackersDeclared', {kind: 'v8-event',
      attachedAttacking: true, minOtherThanAttached: minimum}, attachedBattalion[2], helpers);
    if (parsed && !/"event-card(?:-stat|-controller|-counters)?"|"event-player"/.test(JSON.stringify(parsed))) return parsed;
  }
  const castingTarget = /^Whenever you cast (?:a|an) (.+? spell|spell) that targets (.+?), (.+)$/.exec(line);
  if (castingTarget) {
    const spell = primitive(helpers, 'target', 'target ' + castingTarget[1]);
    const own = new RegExp('^' + self + '$', 'i').test(castingTarget[2]);
    const targets = own ? null : groupFilters(castingTarget[2].replace(/^(?:a|an|one or more) /, ''), helpers);
    const parsed = spell?.zone === 'stack' && (own || targets?.length === 1) && trigger(card, 'cast',
      {kind: 'v8-event', player: 'you', target: spell, ...(own ? {castTargetsSelf: true} : {castTarget: targets[0]})}, castingTarget[3], helpers);
    // This event binds the spell. A target named by the header is a predicate,
    // not a unique event object when that spell can have several targets.
    if (parsed && !/"event-card(?:-stat|-counters|-controller)?"/.test(JSON.stringify(parsed.effects))) return parsed;
    return null;
  }
  const ordinalCast = /^Whenever (you cast your|an opponent casts their|a player casts their) (first|second|third|fourth) spell (each turn|during their turn), (.+)$/.exec(line);
  if (ordinalCast) return trigger(card, 'cast', {kind: 'v8-event', player: ordinalCast[1].startsWith('you') ? 'you' : ordinalCast[1].startsWith('an opponent') ? 'opponent' : 'any',
    castOrdinal: {first: 1, second: 2, third: 3, fourth: 4}[ordinalCast[2]], ...(ordinalCast[3] === 'during their turn' ? {casterTurn: true} : {})}, ordinalCast[4], helpers);
  const laterCast = /^Whenever you cast a spell other than your first spell each turn, (.+)$/.exec(line);
  if (laterCast) return trigger(card, 'cast', {kind: 'v8-event', player: 'you', castMinimumOrdinal: 2}, laterCast[1], helpers);
  const kickedCast = /^Whenever you cast a kicked spell, (.+)$/.exec(line);
  if (kickedCast) return trigger(card, 'cast', {kind: 'v8-event', player: 'you', castKicked: true}, kickedCast[1], helpers);
  const adventureCast = /^Whenever you cast a creature spell that has an Adventure, (.+)$/.exec(line);
  if (adventureCast) return trigger(card, 'cast', {kind: 'v8-event', player: 'you', castAdventure: true}, adventureCast[1], helpers);
  const entryState = new RegExp('^(?:When|Whenever) ' + self + ' enters (tapped|untapped), (.+)$', 'i').exec(line);
  if (entryState) return objectTrigger(card, 'etb', {subject: 'self', enteredTapped: entryState[1].toLowerCase() === 'tapped'}, entryState[2], helpers);
  const received = /^(?:When|Whenever) (you're|you are|an opponent is|a player is) dealt (combat |noncombat )?damage, (.+)$/.exec(line);
  if (received) return objectTrigger(card, 'damageToPlayer', {
    player: received[1].startsWith('you') ? 'you' : received[1].startsWith('an opponent') ? 'opponent' : 'any',
    ...(received[2] ? {combat: received[2] === 'combat '} : {})}, received[3], helpers);

  const dealtToPlayer = /^(?:When|Whenever) (.+?) deals (combat |noncombat )?damage to (you|an opponent|one of your opponents|a player), (.+)$/.exec(line);
  if (dealtToPlayer) {
    const subjectText = dealtToPlayer[1];
    const own = new RegExp('^' + self + '$', 'i').test(subjectText);
    const attached = /^(?:enchanted|equipped) (?:creature|artifact|land|permanent)$/.test(subjectText);
    const genericSource = /\bsource(?: you control| an opponent controls)?$/.test(subjectText) ? replacementSource(card, subjectText, helpers) : null;
    const target = own || attached || genericSource ? null : primitive(helpers, 'target', 'target ' + subjectText.replace(/^(?:a|an|another) /, ''));
    if (own || attached || genericSource || target?.zone === 'battlefield' && !['player', 'opponent', 'any', 'player or planeswalker'].includes(target.what)) {
      // This event is one actual source-to-player hit, with both recipient and
      // source bindings. The unrestricted "deals damage" header is broader
      // and cannot be reconstructed by adding recipient-specific triggers.
      return objectTrigger(card, 'damageToPlayer', {
        ...(own ? {subject: 'self'} : attached ? {subject: 'attached'} : genericSource ? {
          ...(genericSource.filter ? {target: genericSource.filter} : {}), damageSourceController: genericSource.controller,
          ...(genericSource.another ? {subject: 'another'} : {}),
        } : {target, ...(/^another /.test(subjectText) ? {subject: 'another'} : {})}),
        player: dealtToPlayer[3] === 'you' ? 'you' : dealtToPlayer[3] === 'a player' ? 'any' : 'opponent',
        ...(dealtToPlayer[2] ? {combat: dealtToPlayer[2] === 'combat '} : {}),
      }, dealtToPlayer[4], helpers);
    }
  }

  const battalion = new RegExp('^(?:When|Whenever) ' + self + ' and at least (' + NUMBER + ') (?:other )?(.+?) attack, (.+)$', 'i').exec(line);
  if (battalion) {
    const filters = groupFilters(battalion[2], helpers);
    const minimum = number(battalion[1]);
    if (!filters || filters.length !== 1 || !Number.isSafeInteger(minimum) || minimum < 1) return null;
    // The printed source is counted separately, including when the other
    // attacking creatures have a specified type such as Warrior or Zombie.
    // A target or a newly created/moved object introduces another antecedent.
    // Do not silently turn its pronoun into a reference to the source.
    if (/\b(?:it|him|her)\b/i.test(battalion[3]) && /\b(?:target|create|return|exile|choose|token|hand|library|graveyard)\b/i.test(battalion[3])) return null;
    const body = battalion[3].replace(/\b(?:it|him|her)\b/gi, 'this creature');
    const parsed = trigger(card, 'attackersDeclared', {kind: 'v8-event', player: 'you',
      selfAttacking: true, subject: 'another', target: filters[0], minMatching: minimum}, body, helpers);
    return parsed && !/"event-card(?:-stat|-controller|-counters)?"/.test(JSON.stringify(parsed)) ? parsed : null;
  }

  const attacking = /^(?:When|Whenever) (?:a|an|another) (.+?) attacks (you or a planeswalker you control|you|one of your opponents), (.+)$/.exec(line);
  if (attacking) {
    const target = primitive(helpers, 'target', 'target ' + attacking[1]);
    if (target?.zone !== 'battlefield' || target.what !== 'creature' && !target.subtype) return null;
    return objectTrigger(card, 'attacks', {target,
      defender: attacking[2] === 'you' ? 'you' : attacking[2] === 'one of your opponents' ? 'opponent' : 'you-or-your-planeswalker',
      ...(/^(?:When|Whenever) another /.test(line) ? {subject: 'another'} : {})}, attacking[3], helpers);
  }

  const attached = /^(?:When|Whenever) (enchanted|equipped) (creature|artifact|enchantment|land|permanent) (enters|dies|attacks|blocks|attacks or blocks|leaves the battlefield|becomes tapped|becomes untapped|is dealt (?:combat )?damage), (.+)$/.exec(line);
  if (attached) {
    const events = {'enters': ['etb'], dies: ['dies'], attacks: ['attacks'], blocks: ['blocks'],
      'attacks or blocks': ['attacks', 'blocks'], 'leaves the battlefield': ['lto'],
      'becomes tapped': ['becameTapped'], 'becomes untapped': ['becameUntapped'],
      'is dealt damage': ['dealtDamage'], 'is dealt combat damage': ['dealtDamage']}[attached[3]];
    if (/\bits (?:power|toughness|mana value)\b/i.test(attached[4]) && /\btarget\b/i.test(attached[4])) return null;
    const hostStats = [...attached[4].matchAll(/\bits (power|toughness|mana value)\b/gi)].map(match => match[1] === 'mana value' ? 'mv' : match[1].toLowerCase());
    // The old library grammar calls an unqualified possessive a source stat.
    // Rebind only this closed host possessive; mixed source/host stat prose
    // and a newly granted ability need an independent lexical binding scope.
    if (hostStats.length && (new RegExp(self + "'s (?:power|toughness|mana value)", 'i').test(attached[4]) || attached[4].includes('"'))) return null;
    const body = attached[4];
    const bindHostStats = value => Array.isArray(value) ? value.map(bindHostStats)
      : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, child]) =>
        [key, key === 'kind' && ['source-stat', 'explicit-source-stat'].includes(child) && hostStats.includes(value.stat) ? 'event-card-stat' : bindHostStats(child)])) : value;
    const operations = events.map(event => bindHostStats(objectTrigger(card, event, {subject: 'attached',
      ...(event === 'blocks' ? {field: 'blocker'} : {}),
      ...(attached[3] === 'is dealt combat damage' ? {combat: true} : {})}, body, helpers)));
    // A departing Aura's own graveyard incarnation is not the observed host.
    // Returning it also needs an attachment choice on entry. That independent
    // zone-following contract is not implied by a host-death event binding.
    if (/"action":"return-grave-source"/.test(JSON.stringify(operations))) return null;
    if (operations.every(Boolean)) return operations.length === 1 ? operations[0] : bundle(operations);
    return null;
  }

  const joined = new RegExp('^(?:When|Whenever) ' + self + ' (enters or is turned face up|enters or attacks|enters or dies|attacks or dies|attacks or becomes tapped), (.+)$', 'i').exec(line);
  if (joined) {
    const events = joined[1].split(' or ').map(event => ({enters: 'etb', attacks: 'attacks', dies: 'dies', 'is turned face up': 'turnedFaceUp', 'becomes tapped': 'becameTapped'}[event]));
    const operations = events.map(event => objectTrigger(card, event, {subject: 'self'}, joined[2], helpers));
    if (operations.every(Boolean)) return operations.length === 1 ? operations[0] : bundle(operations);
  }

  const combined = new RegExp('^(?:When|Whenever) ' + self + ' enters and at the beginning of your (upkeep|end step), (.+)$', 'i').exec(line);
  if (combined) {
    const arrival = trigger(card, 'etb', 'self', combined[2], helpers);
    const phase = trigger(card, combined[1] === 'upkeep' ? 'upkeep' : 'endStep', 'your-player', combined[2], helpers);
    if (arrival && phase && !/"event-(?:player|card|amount)/.test(JSON.stringify([arrival, phase]))) return bundle([arrival, phase]);
  }

  // "You put" identifies the player applying the counter instruction, which
  // may differ from the controller of the permanent receiving the counters.
  const place = /^(?:When|Whenever) you put one or more (.+?) counters on (.+?), (.+)$/.exec(line);
  if (place) {
    const own = new RegExp('^' + self + '$', 'i').test(place[2]);
    const target = own ? null : primitive(helpers, 'target', 'target ' + place[2].replace(/^(?:a|an|another) /, ''));
    if (own || target?.zone === 'battlefield') return objectTrigger(card, 'countersPlaced', {
      counter: place[1], player: 'you', playerField: 'by', ...(own ? {subject: 'self'} : {target,
        ...(/^another /.test(place[2]) ? {subject: 'another'} : {})})}, place[3], helpers);
  }

  // These source references name printed permanent subtypes; no extra event
  // or subtype-dependent behavior is implied by the editorial wording.
  const subtypeSource = /^(?:When|Whenever) this (Class|Case|Spacecraft|Room|Saga|Mount) (enters|attacks|dies|becomes tapped|becomes untapped), (.+)$/.exec(line);
  if (subtypeSource && (card.type_line?.split(' — ')[1] || '').split(' ').includes(subtypeSource[1])) {
    const event = {enters: 'etb', attacks: 'attacks', dies: 'dies', 'becomes tapped': 'becameTapped', 'becomes untapped': 'becameUntapped'}[subtypeSource[2]];
    const body = subtypeSource[3].replace(new RegExp('\\bthis ' + subtypeSource[1] + '\\b', 'gi'), 'this permanent');
    return trigger(card, event, 'self', body, helpers);
  }
  return null;
}

function attachmentGrant(line, helpers) {
  const loss=/^(Enchanted|Equipped) (creature|artifact|enchantment|land|permanent) gets ([+-]\d+)\/([+-]\d+) and loses (.+)\.$/i.exec(line);
  if(loss){const removeKeywords=helpers.keywordList?.(loss[5]);if(removeKeywords)return {kind:'attachment-grant',power:Number(loss[3]),toughness:Number(loss[4]),keywords:[],removeKeywords,contract:'attachment-continuous-effect'};}
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
  if (/\bspell\b/.test(text)) {
    const union = /^(a .+? spell you control) or (a .+? you control)$/.exec(text);
    if (union) {
      const alternatives = union.slice(1).map(part => replacementSource(card, part, helpers));
      return alternatives.every(Boolean) ? {alternatives} : null;
    }
    const spell = /^a (?:(white|blue|black|red|green) )?(?:(instant or sorcery|instant|sorcery) )?spell(?: (you control|an opponent controls))?$/.exec(text);
    if (!spell) return null;
    const color = spell[1] ? spell[1] + ' ' : '';
    const controller = spell[3] === 'you control' ? 'you' : spell[3] ? 'opponent' : 'any';
    const filters = (spell[2] ? spell[2].split(' or ') : ['']).map(type => primitive(helpers, 'target', 'target ' + color + (type ? type + ' ' : '') + 'card from a graveyard'));
    if (!filters.every(Boolean)) return null;
    return {filter: filters.length === 1 ? {...filters[0], controller: 'any'} : {what: 'card', zone: 'graveyard', controller: 'any', alternatives: filters.map(filter => ({...filter, controller: 'any'}))}, controller, spellOnly: true};
  }
  let phrase = text.replace(/^(?:a|an|any) /, '');
  const another = phrase.startsWith('another ');
  phrase = phrase.replace(/^another /, '');
  const controller = / you control\b/.test(phrase) ? 'you' : / an opponent controls\b/.test(phrase) ? 'opponent' : 'any';
  phrase = phrase.replace(/ you control\b| an opponent controls\b/, '');
  const spellOnly = /\bspell\b/.test(phrase);
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
  if (/^you or (?:a|another) (.+?) you control$/.test(text)) {
    const match = /^you or (a|another) (.+?) you control$/.exec(text);
    const permanent = replacementRecipient(card, match[1] + ' ' + match[2] + ' you control', helpers);
    if (permanent?.permanents) return {players: 'you', permanents: permanent.permanents};
    return null;
  }
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
  const conditional = /^As long as (.+?), if (.+)$/.exec(line);
  if (conditional) {
    const condition = sourceCondition(card, conditional[1], helpers), child = replacementLine(card, 'If ' + conditional[2], helpers);
    return condition && child?.kind === 'v8-replacement' && child.event === 'damage' ? {...child, condition} : null;
  }
  const prevention = preventionLine(card, line, helpers);
  if (prevention) return prevention;
  const preventDamage = /^If (.+?) would deal (?:(combat|noncombat) )?damage to (.+?), prevent (?:(\d+) of that damage|that damage|half that damage, rounded up|all but (\d+) of that damage)(?: and put a (\+1\/\+1|-1\/-1) counter on (.+?))?\.$/i.exec(line);
  if (preventDamage) {
    const source = replacementSource(card, preventDamage[1], helpers), recipient = replacementRecipient(card, preventDamage[3], helpers);
    const own = preventDamage[7] && new RegExp('^' + sourcePattern(card) + '$', 'i').test(preventDamage[7]);
    if (source && recipient && (!preventDamage[6] || own && recipient.subject === 'self')) return {
      kind: 'v8-replacement', event: 'damage', source, recipient, prevent: true,
      transform: preventDamage[4] ? {add: -Number(preventDamage[4])} : preventDamage[5] ? {set: Number(preventDamage[5])} : /prevent half/.test(line) ? {divide: 2, round: 'down'} : {set: 0},
      ...(preventDamage[5] ? {minAmount: Number(preventDamage[5]) + 1} : {}),
      ...(preventDamage[2] ? {combat: preventDamage[2] === 'combat'} : {}),
      ...(preventDamage[6] ? {counterEffect: {operation: 'add', subject: 'self', counter: preventDamage[6], n: 1}} : {}),
      contract: 'ordered-replacement-effect',
    };
  }
  const spellPrevent = /^If (.+? spell) would deal damage to (a permanent or player), prevent (\d+) damage that spell would deal to that permanent or player\.$/.exec(line);
  if (spellPrevent) return replacementLine(card, 'If ' + spellPrevent[1] + ' would deal damage to ' + spellPrevent[2] + ', prevent ' + spellPrevent[3] + ' of that damage.', helpers);
  const capridor = /^If (combat|noncombat) damage would be dealt to (.+?), prevent that damage\. Put a (\+1\/\+1|-1\/-1) counter on (.+?) for each 1 damage prevented this way\.$/.exec(line);
  if (capridor) {
    const child = preventionLine(card, 'If damage would be dealt to ' + capridor[2] + ', prevent that damage. Put a ' + capridor[3] + ' counter on ' + capridor[4] + ' for each 1 damage prevented this way.', helpers);
    if (child) return {...child, combat: capridor[1] === 'combat'};
  }
  const attachedCounters = /^If (equipped creature|enchanted creature) would be dealt damage, prevent that damage and put that many (\+1\/\+1|-1\/-1) counters on it\.$/.exec(line);
  if (attachedCounters) return {kind: 'v8-replacement', event: 'damage', prevent: true,
    source: replacementSource(card, 'a source', helpers), recipient: {subject: 'attached'}, transform: {set: 0},
    counterEffect: {operation: 'add', subject: 'recipient', counter: attachedCounters[2], n: 'damage'}, contract: 'ordered-replacement-effect'};
  const tappedEntry = /^(.+?) enter(?:s)? tapped\.$/.exec(line);
  if (tappedEntry && !new RegExp('^' + sourcePattern(card) + '$', 'i').test(tappedEntry[1])) {
    const phrase = tappedEntry[1].replace('creatures played by your opponents', 'creatures your opponents control').replace('Creatures played by your opponents', 'Creatures your opponents control');
    let filters = groupFilters(phrase, helpers);
    if (!filters && / and |, /.test(phrase)) {
      const shared = / (you control|your opponents control|an opponent controls)$/.exec(phrase);
      const groups = (shared ? phrase.slice(0, shared.index) : phrase).replace(/,? and /g, ', ').split(', ')
        .map(part => groupFilters(part + (shared ? ' ' + shared[1] : ''), helpers));
      if (groups.every(Boolean)) filters = groups.flat();
    }
    if (filters) return {kind: 'v8-replacement', event: 'etbTapped', filters, tapped: true, contract: 'ordered-replacement-effect'};
  }
  const extraCounters = new RegExp('^((?:Each |Other |other ).+?) enters? with (?:an additional |(' + NUMBER + ') additional )(?:\\+1/\\+1) counters? on (?:it|them)\\.$').exec(line);
  if (extraCounters) {
    const filters = groupFilters(extraCounters[1], helpers);
    // The existing entry counter contract applies to creatures. Do not accept
    // Vehicle/noncreature recipients until their entry path handles counters.
    if (filters?.every(filter => filter.what === 'creature' || filter.subtype && !filter.types?.some(type => type !== 'Creature'))) {
      return {kind: 'v8-replacement', event: 'etbCounters', filters, n: extraCounters[2] ? number(extraCounters[2]) : 1, contract: 'ordered-replacement-effect'};
    }
  }
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
    if (!source || !recipient) return null;
    if (source.another && recipient.subject === 'attached') { delete source.another; source.anotherThanAttached = true; }
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
  // A leading condition scopes both halves of a joined anthem. Claim the
  // complete shape before the legacy split parser can leave the self half
  // unconditional.
  if(new RegExp('^As long as [^,]+, '+sourcePattern(card)+' gets [+-]\\d+/[+-]\\d+ and (?:other )?creatures you control (?:get|have) .+\\.$','i').test(line))return extensionLine(card,line,helpers);
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
  const loss=lossLine(card,line,helpers);if(loss)return loss;
  const layered=typeof helpers.keywordList==='function'&&layeredStatic(card,line,helpers);if(layered)return layered;

  const self = sourcePattern(card);
  if(!line.includes('"')&&!/^(?:When|Whenever|At|Until|If|As long as) /.test(line)){
    const also=line.replace(/^(.*?)(?: also) (get|have) /,'$1 $2 ');
    if(also!==line)return readLine(card,also,helpers);
    const joined=new RegExp('^('+self+') and (.+?) (get [+-]\\d+/[+-]\\d+(?: and have .+)?)\\.$','i').exec(line);
    if(joined){const first=readLine(card,joined[1]+' '+joined[3].replace(/^get /,'gets ').replace(' and have ',' and has ')+'.',helpers),second=readLine(card,'Other '+joined[2].replace(/^other /i,'')+' '+joined[3]+'.',helpers);if(first&&second&&STATIC_KINDS.has(first.kind)&&STATIC_KINDS.has(second.kind))return bundle([first,second]);}
    const paired=new RegExp('^('+self+' gets [+-]\\d+/[+-]\\d+) and ((?:other )?creatures you control (?:get|have) .+)\\.$','i').exec(line);
    if(paired){const pieces=paired.slice(1).map(text=>readLine(card,text[0].toUpperCase()+text.slice(1)+'.',helpers));if(pieces.every(piece=>STATIC_KINDS.has(piece?.kind)))return bundle(pieces);}
  }
  const combat = combatLine(card, line, {self, condition: text => sourceCondition(card, text, helpers), groupFilters: text => groupFilters(text, helpers), readLine: text => readLine(card, text, helpers)});
  if (combat) return combat;
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

  const graveStatic=new RegExp('^As long as (?:'+self+'|this card) is in your graveyard(?: and (.+?))?, (.+)\\.$','i').exec(line.endsWith('"')?line+'.':line);
  if(graveStatic){
    const condition=graveStatic[1]?sourceCondition(card,graveStatic[1],helpers):null;
    const child=readLine(card,graveStatic[2]+'.',helpers);
    const allowed=new Set(['kind','scope','filters','excludeSelf','subtype','power','toughness','keywords','grantedOperation','contract']);
    if((!graveStatic[1]||condition)&&child?.kind==='generic-static'&&child.scope!=='self'&&Object.keys(child).every(key=>allowed.has(key))&&(!child.grantedOperation||child.grantedOperation.kind==='mana-source'))return {kind:'v8-graveyard-static',operation:child,...(condition?{condition}:{}),contract:'graveyard-continuous-effect'};
  }

  const typeStatic = new RegExp('^As long as (.+?), (?:' + self + '|it) (isn\'t a creature|is an artifact creature)\\.$', 'i').exec(line.replace(/, it's an artifact creature\.$/, ', it is an artifact creature.'));
  if (typeStatic) {
    const condition = sourceCondition(card, typeStatic[1], helpers);
    if (condition?.kind === 'count-comparison' && ['devotion', 'source-counters'].includes(condition.count?.kind)) return {
      ...continuous, scope: 'self', power: 0, toughness: 0, keywords: [], condition,
      typeChange: typeStatic[2] === "isn't a creature" ? {remove: ['Creature']} : {add: ['Artifact', 'Creature']},
    };
  }

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
  const instead=/^((?:Enchanted|Equipped) creature) gets ([+-]\d+)\/([+-]\d+)\. It gets ([+-]\d+)\/([+-]\d+) instead as long as (.+)\.$/.exec(line);
  if(instead){const condition=sourceCondition(card,instead[6],helpers),affected=/^its controller /.test(instead[6]);if(condition){const descriptor=(power,toughness,cond)=>({kind:'attachment-grant',power:Number(power),toughness:Number(toughness),keywords:[],condition:cond,...(affected?{conditionSubject:'affected'}:{}),contract:'attachment-continuous-effect'});return bundle([descriptor(instead[2],instead[3],{kind:'not',condition}),descriptor(instead[4],instead[5],condition)]);}}
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
    const bodyOnly = readLine(card, intervening[1] + ', ' + intervening[3], helpers);
    const eventHeader = bodyOnly?.kind === 'generic-trigger' && conditionEventHeader(card, intervening[1], bodyOnly, helpers);
    const eventCondition = eventHeader && boundEventCondition(card, eventHeader, intervening[2], helpers);
    if (eventCondition) return {...bodyOnly, event: eventHeader.event, eventFilter: eventHeader.rule, condition: eventCondition};
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
      const explicitSelfReturn=new RegExp('^return '+self+" to its owner's hand\\.$",'i').test(text);
      if (/\bits\b/i.test(text) && !explicitSelfReturn && !/^its controller (?:draws|gains|loses|mills|discards) /i.test(text)) return null;
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

  const conditionLine=line.endsWith('"')?line+'.':line;
  // Only an outer clause can condition the grant. An "as long as" inside
  // the quote belongs to the granted ability, whose text must stay intact.
  const conditionMask=conditionLine.replace(/"[^"]*"/g,quote=>' '.repeat(quote.length));
  const conditional = /^(?:As long as (.+?), (.+)|(.+?) as long as (.+))\.$/.exec(conditionMask);
  if (conditional) {
    const leading=conditional[1]!==undefined;
    const text=leading?conditionLine.slice('As long as '.length,'As long as '.length+conditional[1].length):conditionLine.slice(conditional[3].length+' as long as '.length,-1);
    const bodyText=leading?conditionLine.slice('As long as '.length+conditional[1].length+2,-1):conditionLine.slice(0,conditional[3].length);
    const host = /^(enchanted|equipped) (creature|artifact|enchantment|land|permanent) /i.exec(text) || /^(enchanted|equipped) (creature|artifact|enchantment|land|permanent) /i.exec(bodyText);
    if (host) {
      const conditionText = text.replace(/^(?:enchanted|equipped) (?:creature|artifact|enchantment|land|permanent) /i, 'this creature ');
      const condition = sourceCondition(card, conditionText, helpers);
      const attachedText=bodyText.replace(/^it /i, host[1]+' '+host[2]+' ')+'.';
      const primitiveGrant=attachmentGrant(attachedText,helpers);
      const parsedGrant=!primitiveGrant&&attachedText.includes('"')?readLine(card,attachedText,helpers):null;
      const attached=primitiveGrant||(parsedGrant?.kind==='attachment-operation'?parsedGrant:null);
      if (condition && attached) return {...attached, condition,
        ...(/^(?:enchanted|equipped|it |it's |its controller )/i.test(text) || condition.kind==='v8-live-condition'&&condition.test==='controller-other-creatures' ? {conditionSubject: 'affected'} : {})};
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
    if ((own || attached || filters) && keywords && multiplier && !(attached && /\bit\b|\bits\b/.test(variable[6]) && !multiplier.relative)) {
      const stats = {power: variable[3].endsWith('X') ? variable[3][0] === '-' ? -1 : 1 : 0,
        toughness: variable[4].endsWith('X') ? variable[4][0] === '-' ? -1 : 1 : 0, multiplier, keywords};
      return attached ? {kind: 'attachment-grant', ...stats, ...(multiplier.relative?{multiplierSubject:'affected'}:{}), contract: 'attachment-continuous-effect'}
        : {...continuous, scope: own ? 'self' : 'filtered-permanents', ...(filters ? {filters} : {}), ...stats, ...(!own && (multiplier.other||multiplier.relative) ? {multiplierSubject: 'affected'} : {})};
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
    const attached = /^(Enchanted|Equipped) (creature|artifact|enchantment|land|permanent)$/i.test(counted[1]);
    const filters = own||attached ? null : groupFilters(counted[1], helpers);
    const multiplier = sourceCount(card, counted[4], helpers);
    const keywords = counted[5] ? helpers.keywordList?.(counted[5]) : [];
    if ((own || attached || filters) && multiplier && keywords) {
      const stats={power:Number(counted[2]),toughness:Number(counted[3]),multiplier,keywords,...(!own&&(multiplier.other||multiplier.relative)?{multiplierSubject:'affected'}:{})};
      return attached?{kind:'attachment-grant',...stats,contract:'attachment-continuous-effect'}:{...continuous,scope:own?'self':'filtered-permanents',...(filters?{filters}:{}),...stats};
    }
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
  // Existing v8 descriptors have precedence, just like the frozen v7 union.
  const additionalTrigger = additionalObjectTriggers(card, line, helpers);
  if (additionalTrigger) return additionalTrigger;
  const composed = composedTrigger(card, line, helpers);
  if (composed) return composed;
  const plural = new RegExp('^((?:When|Whenever) ' + self + ') (enter|attack|block)(?=,| or | and )', 'i').exec(line);
  if (plural) return readLine(card, line.replace(plural[0], plural[1] + ' ' + plural[2] + 's'), helpers);
  const pluralPair = new RegExp('^((?:When|Whenever) ' + self + ' (?:enters|attacks|blocks) or )' + '(enter|attack|block)(?=,)', 'i').exec(line);
  if (pluralPair) return readLine(card, line.replace(pluralPair[0], pluralPair[1] + pluralPair[2] + 's'), helpers);
  const namedSource = new RegExp('^((?:When|Whenever) )(' + self + ')(?= (?:enters|attacks|blocks|dies),)', 'i').exec(line);
  if (namedSource && !/^this /i.test(namedSource[2])) return readLine(card, line.replace(namedSource[0], namedSource[1] + 'this creature'), helpers);
  // The older paired-self-event parser canonicalizes in the other direction;
  // only these foreign/player prefixes need the additive Whenever grammar.
  if (/^When (?:you |an opponent |a player |(?:enchanted|equipped) creature deals )/.test(line)) return readLine(card, line.replace(/^When /, 'Whenever '), helpers);
  if(/^When (?:a|an|another) .+? enters, /.test(line)){const child=readLine(card,line.replace(/^When /,'Whenever '),helpers);if(child?.kind==='generic-trigger'&&child.event==='etb')return child;}
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
