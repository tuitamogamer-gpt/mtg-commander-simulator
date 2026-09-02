// Additive v8 grammar. Each clause must be fully consumed by an exact parser.
// Earlier whole-card compiler results are frozen in import-oracle-batch.mjs.
import * as v5 from './oracle-extensions-v5.mjs';
import * as v6 from './oracle-extensions-v6.mjs';
import * as v7 from './oracle-extensions-v7.mjs';
import * as core from './oracle-v8-core.mjs';
import * as effects from './oracle-v8-effects.mjs';
import * as permanents from './oracle-v8-permanents.mjs';
import * as linked from './oracle-v8-linked.mjs';
import * as copies from './oracle-v8-copies.mjs';
import * as control from './oracle-v8-control.mjs';
import * as library from './oracle-v8-library.mjs';
import * as entwine from './oracle-v8-entwine.mjs';
import * as splice from './oracle-v8-splice.mjs';
import * as costs from './oracle-v8-costs.mjs';
import * as mayhem from './oracle-v8-mayhem.mjs';
import { ORACLE_SUBTYPES } from './oracle-subtypes.mjs';

const NUM = '(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+)';
const number = value => ({a:1,an:1,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10}[value] ?? Number(value));
const KEYWORDS = new Set(['flying','reach','first strike','double strike','deathtouch','lifelink','trample','haste','vigilance','menace','defender','indestructible','hexproof','shroud','flash','prowess','shadow','fear','intimidate','skulk','horsemanship','wither']);
function singular(text) {
  return text.replace(/\b(creatures|artifacts|enchantments|lands|permanents|planeswalkers|cards|tokens)\b/g, word => word.slice(0,-1))
    .replace(/\b([A-Z][A-Za-z-]+)s\b/g,(word,base)=>ORACLE_SUBTYPES.has(word)?word:ORACLE_SUBTYPES.has(base)?base:word)
    .replace(/\b(Elves|Wolves|Dwarves|Allies)\b/g,word=>({Elves:'Elf',Wolves:'Wolf',Dwarves:'Dwarf',Allies:'Ally'}[word]));
}

export const normalizeAbilityWords = v7.normalizeAbilityWords;
export const normalizeTokenOperations = v7.normalizeTokenOperations;
export const eventReferenceAllowed = permanents.eventReferenceAllowed;
export const needsCopyRecompile = (card,frozen)=>copies.needsRecompile(card,frozen)||library.needsRecompile(card,frozen);
// CR 605.1a (August 2026): moving a card to/from a library in either
// costs or effects disqualifies an activated ability from being a mana ability.
export function normalizeManaOperations(operations) {
  const libraryMove=node=>!!node&&typeof node==='object'&&(node.mill>0||['draw','mill','loot','wheel','search','look-select','library-select-v8','library-zone-shuffle-v8','library-search-v8','exile-top','move-to-library','shuffle-graveyard','hand-to-library'].includes(node.action)||Object.values(node).some(value=>Array.isArray(value)?value.some(libraryMove):libraryMove(value)));
  return operations.map(operation=>{
    if(operation.kind==='generic-ability'&&operation.effects?.some(effect=>effect.action==='add-mana')&&libraryMove(operation))return {...operation,stackMana:true};
    // Exert is part of Oasis Ritualist's mana-ability activation cost. The
    // frozen v7 normalizer correctly rejects unknown cost keys, so preserve
    // that boundary and extend only its closed mana-source shape here.
    if(operation.kind==='generic-ability'&&operation.cost?.exertSelf&&operation.cost.tap&&
      operation.loyalty===undefined&&!operation.from&&!operation.optional&&!operation.sorceryOnly&&
      !operation.beforeAttackersOnly&&!operation.oncePerObject&&!operation.targets?.length&&
      operation.effects?.length&&operation.effects[0].action==='add-mana'){
      const afterEffects=operation.effects.slice(1);
      const supportedAfter=afterEffects.every(effect=>(['draw','gain-life','lose-life'].includes(effect.action)&&
        ['you','each-opponent','each-player'].includes(effect.who)&&typeof effect.n==='number')||
        (effect.action==='damage'&&effect.target==='you'&&typeof effect.n==='number')||
        (effect.action==='skip-next-untap'&&effect.target==='self'));
      const supportedCost=Object.keys(operation.cost).every(key=>
        ['tap','mana','life','sacSelf','sacWhat','sacOther','sacFilter','sacN','rmCounter','exertSelf'].includes(key));
      if(supportedAfter&&supportedCost&&!operation.cost.mana?.includes('{X}')){
        const effect=operation.effects[0];
        return {kind:'mana-source',activationCost:operation.cost,produce:effect.choices||[effect.produce],
          ...(effect.multiplier?{multiplier:effect.multiplier}:{}),
          ...(effect.restriction?{restriction:effect.restriction}:{}),
          ...(afterEffects.length?{afterEffects}:{}),
          ...(operation.activationCondition?{condition:operation.activationCondition}:{}),
          ...(operation.onceEachTurn?{onceEachTurn:true}:{}),contract:'mana-source'};
      }
    }
    // Tapping other untapped permanents you control is an ordinary additional
    // cost of a printed mana ability (Survivors' Encampment, Jaspera Sentinel).
    // The frozen v7 normalizer rejects unknown cost keys, so this closed shape
    // is normalized here instead.
    if(operation.kind==='generic-ability'&&operation.cost?.tapFilter&&
      operation.loyalty===undefined&&!operation.from&&!operation.optional&&!operation.sorceryOnly&&
      !operation.beforeAttackersOnly&&!operation.oncePerObject&&!operation.targets?.length&&
      operation.effects?.length===1&&operation.effects[0].action==='add-mana'&&
      Number.isInteger(operation.cost.tapN)&&operation.cost.tapN>0&&
      operation.cost.tapFilter.zone==='battlefield'&&operation.cost.tapFilter.controller==='you'&&
      Object.keys(operation.cost).every(key=>['tap','mana','tapFilter','tapN'].includes(key))&&
      !operation.cost.mana?.includes('{X}')){
      const effect=operation.effects[0];
      return {kind:'mana-source',activationCost:operation.cost,produce:effect.choices||[effect.produce],
        ...(effect.multiplier?{multiplier:effect.multiplier}:{}),
        ...(effect.restriction?{restriction:effect.restriction}:{}),
        ...(operation.activationCondition?{condition:operation.activationCondition}:{}),
        ...(operation.onceEachTurn?{onceEachTurn:true}:{}),contract:'mana-source'};
    }
    // A printed mana ability may end by marking its own source with a counter
    // and, on the depletion lands, sacrificing it once the last counter is
    // gone. The frozen v7 tail list cannot be widened, so this closed
    // self-referential shape is normalized here instead. Both tails stay off
    // the Stack: no target, no choice and no zone change beyond the source.
    const selfCounterTail=effect=>
      (effect.action==='counter'&&effect.target==='self'&&typeof effect.counter==='string'&&
        typeof effect.n==='number'&&effect.n>0)||
      (effect.action==='conditional'&&!effect.elseEffects&&
        effect.condition?.kind==='count-comparison'&&effect.condition.count?.kind==='source-counters'&&
        Array.isArray(effect.effects)&&effect.effects.length===1&&
        effect.effects[0].action==='sacrifice-source');
    if(operation.kind==='generic-ability'&&operation.loyalty===undefined&&!operation.from&&!operation.optional&&
      !operation.sorceryOnly&&!operation.beforeAttackersOnly&&!operation.oncePerObject&&!operation.targets?.length&&
      operation.effects?.length>1&&operation.effects[0].action==='add-mana'&&
      operation.effects.slice(1).every(selfCounterTail)&&
      Object.keys(operation.cost||{}).every(key=>['tap','mana','life','sacSelf','sacWhat','sacOther','sacFilter','sacN','rmCounter'].includes(key))&&
      !operation.cost?.mana?.includes('{X}')){
      const effect=operation.effects[0];
      return {kind:'mana-source',activationCost:operation.cost,produce:effect.choices||[effect.produce],
        ...(effect.multiplier?{multiplier:effect.multiplier}:{}),
        ...(effect.restriction?{restriction:effect.restriction}:{}),
        afterEffects:operation.effects.slice(1),
        ...(operation.activationCondition?{condition:operation.activationCondition}:{}),
        ...(operation.onceEachTurn?{onceEachTurn:true}:{}),contract:'mana-source'};
    }
    return v7.normalizeManaOperations([operation])[0];
  });
}

export function extensionTarget(text) {
  if(text==='target opponent or planeswalker')return {what:'player or planeswalker',zone:'battlefield',controller:'any',excludeYou:true,min:1};
  const chosenX=/^(.+?) with (mana value|power|toughness) X(?: or (less|greater))?( from (?:your|a|an opponent's) graveyard)?$/.exec(text);
  if(chosenX){const base=extensionTarget(chosenX[1]+(chosenX[4]||''));if(base)return {...base,stat:chosenX[2]==='mana value'?'mv':chosenX[2],comparison:chosenX[3]||'equal',threshold:'X'};}
  // A shared noun applies to every color in an adjective union.
  // Splitting before the noun would admit arbitrary red/white cards here.
  const colorUnion=/^((?:another |up to one )?target) ((?:white|blue|black|red|green)(?:(?:, or |, | or )(?:white|blue|black|red|green))+) (.+)$/.exec(text);
  if(colorUnion){const base=extensionTarget(colorUnion[1]+' '+colorUnion[3]);if(base){const colors={white:'W',blue:'U',black:'B',red:'R',green:'G'};return {...base,colorsAny:colorUnion[2].split(/, or |, | or /).map(color=>colors[color])};}}
  const eventOwner=/^(.+?) (?:that player controls|that player's graveyard)$/.exec(text);
  if(eventOwner){const base=extensionTarget(eventOwner[1]+(text.endsWith('graveyard')?' a graveyard':''));if(base)return {...base,controller:'event-player'};}
  const damaged=/^(.+?) that (?:was|were) dealt damage this turn$/.exec(text);
  if(damaged){const base=extensionTarget(damaged[1]);if(base?.zone==='battlefield')return {...base,damagedThisTurn:true};}
  const spellOrigin=/^(.+? spell)(?: that was)? cast from (?:a |your |an opponent's )?(graveyard|exile|hand)$/.exec(text);
  if(spellOrigin){const base=extensionTarget(spellOrigin[1]);if(base?.zone==='stack')return {...base,castFrom:spellOrigin[2]};}
  const prior = core.baseTarget(text) || v6.extensionTarget?.(text) || v5.extensionTarget?.(text);
  if (prior) return prior;
  const normalized = text.replace(/ you don't control\b/g,' an opponent controls').replace(/, nonland\b/g,' nonland');
  if (normalized !== text) return extensionTarget(normalized);
  let match = /^((?:another |up to one )?target) (non)?(white|blue|black|red|green|colorless|multicolored|monocolored) (card from (?:your|a|an opponent's) graveyard)$/.exec(text);
  if(match){const target=extensionTarget(match[1]+' '+match[4]);if(target&&(!match[2]||['white','blue','black','red','green'].includes(match[3])))return {...target,[match[2]?'notColor':'color']:match[3]};}
  match=/^((?:another |up to one )?target) (.+? or .+?) from (your|a|an opponent's) graveyard$/.exec(text);
  if(match&&!/\btarget\b/.test(match[2])){
    const alternatives=match[2].split(/, or |, | or /).map(noun=>extensionTarget('target '+noun+(noun.endsWith('card')?'':' card')+' from '+match[3]+' graveyard'));
    if(alternatives.length>1&&alternatives.every(target=>target?.zone==='graveyard'))return {what:'card',zone:'graveyard',controller:match[3]==='your'?'you':match[3]==='a'?'any':'opponent',min:match[1].includes('up to one')?0:1,alternatives};
  }
  match = /^(.*?target .+?) with(out)? (.+?)( from (?:your|a|an opponent's) graveyard)?$/.exec(text);
  if (match && KEYWORDS.has(match[3])) {
    const target = extensionTarget(match[1] + (match[4] || ''));
    if (target?.zone === 'battlefield') return {...target,[match[2]?'withoutKeyword':'withKeyword']:match[3]};
  }
  match = /^(.*?target .+?) with (?:no|a|an) (\+1\/\+1|-1\/-1|[a-z]+) counters?(?: on it)?$/.exec(text);
  if (match) {
    const target = extensionTarget(match[1]);
    if (target?.zone === 'battlefield') return {...target,[text.includes(' with no ')?'withoutCounter':'hasCounter']:match[2]};
  }
  match = /^(.*?target .+?) with (mana value|power|toughness) (less|greater) than (\d+)$/.exec(text);
  if (match) {
    const target = extensionTarget(match[1]);
    if (target) return {...target,stat:match[2]==='mana value'?'mv':match[2],comparison:match[3],threshold:Number(match[4])+(match[3]==='less'?-1:1)};
  }
  return null;
}
export function extensionCount(text) {
  const eventCounter=/^(\+1\/\+1|-1\/-1|[a-z]+) counters? on that (?:creature|permanent)$/.exec(text);
  if(eventCounter)return {kind:'event-card-counters',counter:eventCounter[1]};
  const prior = core.baseCount(text) || v6.extensionCount?.(text) || v5.extensionCount?.(text);
  if (prior) return prior;
  let normalized=text.replace(/^each /,'').replace(/^(attacking|blocking) creature$/,'$1 creatures');
  normalized=normalized.replace(/^(creature|artifact|enchantment|land|permanent|card|spell) (you control|your opponents control|that died this turn|in your graveyard|in your hand)(?= |$)/,'$1s $2');
  if (normalized !== text) return extensionCount(normalized);
  let match=/^(Aura|Equipment|permanent)s? attached to (?:it|this creature|this artifact|this permanent)$/.exec(text);
  if(match)return {kind:'source-attachments',what:match[1]};
  if(/^poison counters? your opponents have$/.test(text))return {kind:'opponent-poison-total'};
  if(text==='opponents you have')return {kind:'opponent-count'};
  match=/^different (power|toughness|mana values?) among creatures you control$/.exec(text);
  if(match)return {kind:'count',zone:'battlefield',what:'creature',unique:match[1].startsWith('mana')?'mana-values':match[1]};
  match=/^(.+?) (you control|your opponents control|on the battlefield)$/.exec(text);
  if(match){
    const target=extensionTarget('target '+singular(match[1])+(match[2]==='you control'?' you control':match[2]==='your opponents control'?' an opponent controls':''));
    if(target?.zone==='battlefield')return {kind:'count',zone:'battlefield',what:'permanent',filters:[target],controller:match[2]==='you control'?'you':match[2]==='your opponents control'?'opponents':'all'};
  }
  match=/^(.+?) in (your hand|your graveyard|all graveyards|your opponents' graveyards)$/.exec(text);
  if(match){
    const zone=match[2]==='your hand'?'hand':'graveyard',noun=singular(match[1]);
    const target=extensionTarget('target '+noun+(noun.endsWith('card')?'':' card')+' from a graveyard');
    if(target)return {kind:'count',zone,what:'card',filters:[{...target,controller:'any'}],controller:match[2].startsWith('your opponents')?'opponents':match[2]==='all graveyards'?'all':'you'};
  }
  return null;
}
export function extensionCondition(text) {
  const opponentCount=new RegExp('^an opponent controls ('+NUM+') or more (.+)$').exec(text);
  if(opponentCount){
    const count=extensionCount(opponentCount[2]+' you control');
    if(count?.kind==='count'&&count.zone==='battlefield'&&!count.aggregate&&!count.unique)return {kind:'opponent-count-range',count,min:number(opponentCount[1])};
  }
  const prior = core.baseCondition(text) || v6.extensionCondition?.(text) || v5.extensionCondition?.(text);
  if (prior) return prior;
  const normalized=text.replace(/^an opponent controls (?:a|an) /,'your opponents control a ').replace(/^you control at least /,'you control ');
  if(text==="you have the city's blessing")return {kind:'city-blessing'};
  if(/^you control (?:it|this creature|this artifact|this enchantment|this permanent)$/.test(text))return {kind:'source-controlled'};
  let match=/^an opponent controls (more|fewer) (.+) than you$/.exec(text);
  if(match){const count=extensionCount(match[2]+' you control');if(count)return {kind:'opponent-comparison',count,comparison:match[1]==='more'?'greater':'less',each:false};}
  match=/^you control (more|fewer) (.+) than (?:each|an) opponent$/.exec(text);
  if(match){const count=extensionCount(match[2]+' you control');if(count)return {kind:'opponent-comparison',count,comparison:match[1]==='more'?'less':'greater',each:text.includes('each opponent')};}
  match=/^(?:an opponent has (more|less) (life|cards in hand) than you|you have (more|less) (life|cards in hand) than (each|an) opponent)$/.exec(text);
  if(match){const measure=match[2]||match[4],greater=(match[1]||match[3])==='more';return {kind:'opponent-comparison',count:measure==='life'?{kind:'life-total'}:{kind:'count',zone:'hand',what:'card'},comparison:(match[1]?greater:!greater)?'greater':'less',each:match[5]==='each'};}
  match=/^your life total is (greater than|greater than or equal to|less than|less than or equal to) your starting life total$/.exec(text);
  if(match)return {kind:'starting-life',comparison:match[1].startsWith('greater')?'greater':'less',offset:match[1].includes('equal')?0:match[1].startsWith('greater')?1:-1};
  match=/^you have at least (\d+) life more than your starting life total$/.exec(text);
  if(match)return {kind:'starting-life',comparison:'greater',offset:Number(match[1])};
  match=new RegExp('^(?:it|this creature|this artifact|this permanent) has ('+NUM+') or (more|fewer) (\\+1/\\+1|-1/-1|[a-z]+) counters? on it$').exec(text);
  if(match)return {kind:'count-comparison',count:{kind:'source-counters',counter:match[3]},[match[2]==='more'?'min':'max']:number(match[1])};
  match=new RegExp('^you control exactly ('+NUM+') (.+)$').exec(text);
  if(match){const count=extensionCount(match[2]+' you control');if(count)return {kind:'count-comparison',count,min:number(match[1]),max:number(match[1])};}
  match=new RegExp('^(?:it|this creature|this artifact|this permanent) is (?:a|an) (.+)$').exec(text);
  if(match){const filters=match[1].split(' or ').map(noun=>extensionTarget('target '+noun.replace(/^(?:a|an) /,'')));if(filters.every(filter=>filter?.zone==='battlefield'))return filters.length===1?{kind:'source-quality',filter:filters[0]}:{kind:'any',conditions:filters.map(filter=>({kind:'source-quality',filter}))};}
  match=/^creatures you control have total power (\d+) or (?:greater|more)$/.exec(text);
  if(match)return {kind:'count-comparison',count:{kind:'creature-total-power'},min:Number(match[1])};
  match=new RegExp('^a library has ('+NUM+') or (more|fewer) cards in it$').exec(text);
  if(match)return {kind:'player-zone-count',players:'all',zone:'library',[match[2]==='more'?'min':'max']:number(match[1])};
  match=new RegExp('^(you|your opponents) control (?:(?:a|an|another) |('+NUM+') or more )(.+)$').exec(normalized);
  if(match){const count=extensionCount(match[3]+(match[1]==='you'?' you control':' your opponents control'));if(count)return {kind:'count-comparison',count:{...count,...(normalized.includes(' another ')?{other:true}:{})},min:match[2]?number(match[2]):1};}
  match=new RegExp('^you control ('+NUM+') or fewer (.+)$').exec(text);
  if(match){const count=extensionCount(match[2]+' you control');if(count)return {kind:'count-comparison',count,max:number(match[1])};}
  match=/^(?:it|this creature|this artifact|this enchantment|this land|this permanent) (?:isn't|is not) (attacking or blocking|attacking|blocking|tapped|untapped)$/.exec(text);
  if(match){const conditions=match[1].split(' or ').map(status=>({kind:'not',condition:{kind:'source-status',status}}));return conditions.length===1?conditions[0]:{kind:'all',conditions};}
  return null;
}
export function extensionCost(text, card = null) {
  const previous = core.baseCost(text) || v6.extensionCost(text);
  if (previous) return previous;
  const effectCost = effects.extensionCost(text, { target: extensionTarget }, card);
  if (effectCost) return effectCost;
  const cost = {};
  for (const part of String(text).split(/,\s*/)) {
    let key, value;
    if (part === '{T}') { key = 'tap'; value = true; }
    else if (/^(?:\{(?:\d+|X|[WUBRGC]|[WUBRG]\/[WUBRG]|[WUBRG]\/P|2\/[WUBRG])\})+$/.test(part)) { key = 'mana'; value = part; }
    else if (/^Pay \d+ life$/i.test(part)) { key = 'life'; value = Number(part.match(/\d+/)[0]); }
    else return null;
    if (Object.hasOwn(cost, key)) return null;
    cost[key] = value;
  }
  return Object.keys(cost).length ? cost : null;
}
export function modifierOperation(card, line, helpers = {}) {
  // Strive and Harmonize are printed cost modifiers whose whole behaviour the
  // engine already executes; only their declaration was missing. The "Strive —"
  // label is an ability word and is stripped before parsing, so the printed
  // rule arrives without it.
  const strive=/^(?:Strive — )?This spell costs ((?:\{[^}]+\})+) more to cast for each target beyond the first\.$/.exec(line);
  if(strive&&/\b(?:Instant|Sorcery)\b/.test(card.type_line||''))return {kind:'mechanic-strive-v8',cost:strive[1],contract:'mechanic-strive-v8'};
  const harmonize=/^Harmonize ((?:\{[^}]+\})+)$/.exec(line);
  if(harmonize&&/\b(?:Instant|Sorcery)\b/.test(card.type_line||''))return {kind:'mechanic-harmonize-v8',cost:harmonize[1],contract:'mechanic-harmonize-v8'};
  const mayhemOperation=mayhem.extensionLine(card,line);
  if(mayhemOperation)return mayhemOperation;
  const wardLife=new RegExp('^Ward—Pay ('+NUM+') life\\.$').exec(line);
  if(wardLife&&!/\b(?:Instant|Sorcery)\b/.test(card.type_line))return {kind:'mechanic-ward-v8',payment:{kind:'life',n:number(wardLife[1])},contract:'mechanic-ward-v8'};
  if(line==='Ward—Discard a card.'&&!/\b(?:Instant|Sorcery)\b/.test(card.type_line))return {kind:'mechanic-ward-v8',payment:{kind:'discard',n:1},contract:'mechanic-ward-v8'};
  if(line==='Ascend')return {kind:'mechanic-ascend',contract:'mechanic-ascend'};
  // Combat-qualified groups must be parsed before the generic adjective
  // modifier. Otherwise "Attacking creatures" loses its live combat filter.
  if(/^(?:Other )?(?:[Aa]ttacking|[Bb]locking) creatures\b/.test(line)){
    const combat=permanents.modifierOperation(card,line,helpersFor(helpers));
    if(combat)return combat;
  }
  return costs.modifierOperation(card,line,helpersFor(helpers)) || core.baseModifier(card, line) || v6.modifierOperation(card, line) || permanents.modifierOperation(card, line, helpersFor(helpers)) || null;
}
export function characteristicOperation(card, line, helpers = {}) {
  return core.baseCharacteristic(card, line) || v6.characteristicOperation(card, line) || v5.characteristicOperation(card, line) || permanents.characteristicOperation(card, line, helpersFor(helpers)) || null;
}
export function modalOperation(card, text, parseEffect) {
  const parseModal = (source, body, parser) => core.baseModal(source, body, parser) || v6.modalOperation(source, body, parser) || effects.modalOperation(source, body, parser) || null;
  return entwine.modalOperation(card, text, parseEffect, parseModal) || parseModal(card, text, parseEffect);
}
function helpersFor(helpers, card = null) {
  return { ...helpers, target: extensionTarget, count: extensionCount, value:core.extensionValue, condition: extensionCondition, cost: text => extensionCost(text, card), normalizeOperations:normalizeManaOperations, line: (card,line)=>extensionLine(card,line,helpers) };
}
export function extensionEffect(card, line, helpers) {
  if(card.name&&!card.name.startsWith('__OracleEvent')&&!line.includes('"')){
    const self=card.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const normalized=line.replace(new RegExp('((?:\\+1/\\+1|-1/-1|[a-z]+) counters? on )'+self+'(?=[.,]|$)','g'),'$1this permanent');
    if(normalized!==line)return extensionEffect(card,normalized,helpers);
  }
  const context = helpersFor(helpers, card);
  const body=effects.resolutionCostEffect(card,line,context) || linked.extensionEffect(card, line, context) || copies.extensionEffect(card, line, context) || library.extensionEffect(card,line,context) || core.baseEffect(card, line, context) || v6.extensionEffect(card, line, context) || v5.extensionEffect(card, line, context) || effects.extensionEffect(card, line, context) || null;
  if(!body)return null;
  return {...body,effects:body.effects.map(effect=>{
    const index=typeof effect.target==='number'?effect.target:effect.who;
    if(!['damage','draw','mill','gain-life','lose-life'].includes(effect.action)||typeof index!=='number'||!['player','opponent'].includes(body.targets[index]?.what))return effect;
    const bind=value=>Array.isArray(value)?value.map(bind):value&&typeof value==='object'?value.kind==='target-count'&&value.target==='event-player'?{...value,target:index}:Object.fromEntries(Object.entries(value).map(([key,child])=>[key,bind(child)])):value;
    return {...effect,n:bind(effect.n)};
  })};
}
export function linkedEffect(card, line, helpers) { return linked.extensionEffect(card, line, helpersFor(helpers, card)); }
export function libraryEffect(card,line,helpers){return library.extensionEffect(card,line,helpersFor(helpers, card));}
export function resolutionCostEffect(card,line,helpers){return effects.resolutionCostEffect(card,line,helpersFor(helpers, card));}
export function extensionLine(card, line, helpers) {
  const context = helpersFor(helpers, card);
  const priority=permanents.priorityLine(card,line,context);
  if(priority!==undefined)return priority;
  // Cycling is a printed hand ability, not a battlefield rule: the creature and
  // artifact templates already accept it, so the same closed shape is offered
  // to the remaining permanent templates here.
  const cycling=/^Cycling ((?:\{[^}]+\})+)$/.exec(line);
  if(cycling&&!/\b(?:Instant|Sorcery)\b/.test(card.type_line||''))return {kind:'cycling',cost:cycling[1],contract:'cycling-ability'};
  return splice.extensionLine(card,line) || costs.modifierOperation(card,line,context) || control.extensionLine(card,line,context) || linked.extensionLine(card, line, context) || copies.extensionLine(card, line, context) || mayhem.extensionLine(card,line,context) || core.baseLine(card, line, context) || v6.extensionLine(card, line, context) || v5.extensionLine(card, line, context) || effects.extensionLine(card, line, context) || permanents.extensionLine(card, line,context) || null;
}
