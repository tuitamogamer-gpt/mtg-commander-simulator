// Closed additional casting costs using the existing transactional v4 cost
// runtime. Unknown costs and variable quantities never become placeholders.
import {ORACLE_SUBTYPES} from './oracle-subtypes.mjs';
const WORDS = {a:1, an:1, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10};
const NUMBER = '(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|[1-9][0-9]*)';
const TYPES = new Map(['Artifact','Creature','Enchantment','Land','Planeswalker','Battle'].map(type => [type.toLowerCase(),type]));
const SUBTYPES=new Map([...ORACLE_SUBTYPES].map(type=>[type.toLowerCase(),type]));
const COLORS={white:'W',blue:'U',black:'B',red:'R',green:'G'};
const quantity = value => {
  const n=WORDS[value] ?? Number(value);
  return Number.isSafeInteger(n) && n > 0 ? {min:n,max:n} : null;
};

function permanentObject(phrase,kind='permanent') {
  const qualifier={};
  phrase=phrase.toLowerCase().replace(/\belves\b/g,'elf').replace(/\bdwarves\b/g,'dwarf').replace(/\bwolves\b/g,'wolf');
  while(true) {
    const match=/^(nontoken|nonland|noncreature|nonartifact|white|blue|black|red|green|basic|snow|legendary) (.+)$/.exec(phrase);
    if(!match)break;
    const [_,word,rest]=match;
    if(word==='nontoken') {if(qualifier.nontoken)return null;qualifier.nontoken=true;}
    else if(word.startsWith('non')) {(qualifier.notTypes||=[]).push(TYPES.get(word.slice(3)));}
    else if(COLORS[word]) {(qualifier.colors||=[]).push(COLORS[word]);}
    else {(qualifier.supertypes||=[]).push(word[0].toUpperCase()+word.slice(1));}
    phrase=rest;
  }
  if(Object.values(qualifier).some(value=>Array.isArray(value)&&new Set(value).size!==value.length))return null;
  const add=object=>Object.keys(qualifier).length?{...object,qualifier:{...qualifier,...object.qualifier}}:object;
  const allowedTypes=kind==='card'?new Map([...TYPES,['instant','Instant'],['sorcery','Sorcery'],['kindred','Kindred']]):TYPES;
  if(kind==='card' && phrase==='card')return add({kind:'card'});
  if(kind==='card')phrase=phrase.replace(/ card$/,'');
  const normalized=phrase.replace(/\b(artifacts|creatures|enchantments|lands|planeswalkers|battles|permanents)\b/g, word=>word.slice(0,-1));
  if(normalized==='permanent')return add({kind,types:[...TYPES.values()],typeMatch:'any'});
  const union=normalized.split(' or ');
  if(union.length>1) {
    if(new Set(union).size!==union.length || !union.every(type=>allowedTypes.has(type)))return null;
    return add({kind,types:union.map(type=>allowedTypes.get(type)),typeMatch:'any'});
  }
  const intersection=normalized.split(' ');
  if(new Set(intersection).size===intersection.length && intersection.every(type=>TYPES.has(type)))
    return add({kind,types:intersection.map(type=>TYPES.get(type)),...(intersection.length>1?{typeMatch:'all'}:{})});
  // A subtype can occur on Kindred noncreatures too. Test the printed subtype
  // directly rather than assuming every Goblin is a creature.
  const subtypeWords=intersection.map(word=>SUBTYPES.get(word)||SUBTYPES.get(word.replace(/s$/,'')));
  if(subtypeWords.every(Boolean))return add({kind,...(kind==='permanent'?{types:[...TYPES.values()],typeMatch:'any'}:{}),qualifier:{...qualifier,subtypes:subtypeWords}});
  if(kind==='card' && ['instant','sorcery','kindred'].includes(normalized))return add({kind,types:[normalized[0].toUpperCase()+normalized.slice(1)]});
  // Retain the exact old spellings above; no stripping of an unknown adjective.
  return null;
}

function atom(text) {
  let match=new RegExp('^sacrifice ('+NUMBER+') (.+)$').exec(text);
  if(match) {
    const count=quantity(match[1]),object=permanentObject(match[2]);
    return count && object ? {kind:'sacrifice',quantity:count,object} : null;
  }
  match=new RegExp('^discard ('+NUMBER+') (?:(.+) )?cards?$').exec(text);
  if(match) {
    const count=quantity(match[1]),object=permanentObject(match[2]?match[2]+' card':'card','card');
    return count && object ? {kind:'discard',quantity:count,object} : null;
  }
  match=new RegExp('^pay ('+NUMBER+') life$').exec(text);
  if(match) {
    const count=quantity(match[1]);
    return count ? {kind:'payLife',amount:{kind:'number',value:count.min}} : null;
  }
  match=new RegExp('^exile ('+NUMBER+') (?:(.+) )?cards? from your (graveyard|hand)$').exec(text);
  if(match) {
    const count=quantity(match[1]);
    if(!count)return null;
    const object=permanentObject(match[2]?match[2]+' card':'card','card');
    if(!object)return null;
    return {kind:match[3]==='hand'?'exileHand':'exileGraveyard',quantity:count,object};
  }
  match=new RegExp('^return ('+NUMBER+') (.+) you control to (?:its owner\'s hand|their owners\' hands|their owner\'s hand)$').exec(text);
  if(match) {
    const count=quantity(match[1]),object=permanentObject(match[2]);
    return count && object ? {kind:'returnPermanent',quantity:count,object} : null;
  }
  return null;
}

function clause(text) {
  const direct=atom(text);
  if(direct)return direct;
  // Separate complete cost actions, never the nouns inside a type union.
  const separators=[...text.matchAll(/ (and|or) (?=sacrifice |discard |pay |exile |return )/g)];
  if(separators.length!==1)return null;
  const separator=separators[0],left=atom(text.slice(0,separator.index)),right=atom(text.slice(separator.index+separator[0].length));
  if(!left || !right)return null;
  if(separator[1]==='or')return {kind:'choice',choose:{min:1,max:1},options:[left,right]};
  // Multiple costs from one zone need a joint matching planner; the existing
  // runtime reserves greedily, so do not declare that new shape as supported.
  if(left.kind===right.kind || ['sacrifice','returnPermanent'].includes(left.kind)&&['sacrifice','returnPermanent'].includes(right.kind) ||
    ['discard','exileHand'].includes(left.kind)&&['discard','exileHand'].includes(right.kind))return null;
  return {kind:'sequence',costs:[left,right]};
}

export function modifierOperation(card,line) {
  if(card?.layout && card.layout!=='normal')return null;
  const match=/^As an additional cost to cast this spell, (.+)\.$/.exec(line);
  if(!match)return null;
  const parsed=clause(match[1]);
  if(!parsed)return null;
  let sequence=0;
  const ids=node=>({id:'cost-'+(++sequence),...node,
    ...(node.options?{options:node.options.map(ids)}:{}),
    ...(node.costs?{costs:node.costs.map(ids)}:{})});
  return {kind:'mechanic-additional-costs',costs:[ids(parsed)],contract:'mechanic-additional-costs'};
}
