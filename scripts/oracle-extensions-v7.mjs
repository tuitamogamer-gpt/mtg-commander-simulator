// Version 7 starts from the frozen v6 grammar. Earlier versions are tried first.
// Every accepted clause has an explicit runtime descriptor; unknown suffixes
// and ambiguous pronouns remain unsupported.
import { parseOracleSpellV4, parseOracleAdditionalCosts } from './oracle-spell-v4.mjs';
import { ORACLE_SUBTYPES } from './oracle-subtypes.mjs';
import flavorWords from './oracle-flavor-words.json' with {type:'json'};
const NUM = '(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|[0-9]+)';
const amount = value => ({ a:1, an:1, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10 }[value.toLowerCase()] ?? Number(value));
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const TYPES = '(?:artifact or enchantment|artifact or creature|artifact or land|creature or planeswalker|instant or sorcery|nonland permanent|permanent|creature|artifact|enchantment|land|planeswalker|instant|sorcery|card)';

// CR 207.2c/d: ability/flavor words are labels, not rules. Keep a closed,
// sourced list; real keywords such as Forecast, Exhaust and Max speed must
// retain their meaning even if a third-party catalog misclassifies them.
const ABILITY_WORDS=['Adamant','Addendum','Alliance','Battalion','Bloodrush','Celebration','Channel','Chroma','Cohort','Constellation','Converge',"Council's dilemma",'Coven','Delirium','Descend 4','Descend 8','Disappear','Domain','Eerie','Eminence','Enrage','Fateful hour','Fathomless descent','Ferocious','Flurry','Formidable','Grandeur','Hellbent','Heroic','Imprint','Infusion','Inspired','Join forces','Kinship','Landfall','Lieutenant','Magecraft','Metalcraft','Morbid','Opus','Pack tactics','Paradox','Parley','Radiance','Raid','Rally','Renew','Repartee','Revolt','Secret council','Spell mastery','Strive','Survival','Sweep','Tempting offer','Threshold','Undergrowth','Valiant','Vivid','Void','Will of the council','Corrupted'];
const wordKey=word=>word.replace(/[’‘]/g,"'").toLowerCase();
const WORD_LABELS=new Set([...ABILITY_WORDS,...flavorWords.words].map(wordKey));
export function normalizeAbilityWords(text){
  return text.replace(/^(• )?([^\n]+?) — /gm,(all,bullet,label)=>WORD_LABELS.has(wordKey(label))?(bullet||''):all);
}

export function normalizeTokenOperations(value) {
  if(Array.isArray(value))return value.map(normalizeTokenOperations);
  if(!value||typeof value!=='object')return value;
  const result=Object.fromEntries(Object.entries(value).map(([key,item])=>[key,normalizeTokenOperations(item)]));
  if(result.action==='token-inline'){
    const token=result.token,extra=(token.subtypes||[]).filter(type=>['artifact','enchantment'].includes(type));
    if(extra.length){token.types=[...new Set([...(token.types||['Creature']),...extra.map(type=>type[0].toUpperCase()+type.slice(1))])];token.subtypes=token.subtypes.filter(type=>!extra.includes(type));token.name=token.name.replace(/ (?:artifact|enchantment)(?= |$)/g,'');}
  }
  return result;
}

export function normalizeManaOperations(operations) {
  return operations.map(operation=>{
    if(operation.kind!=='generic-ability'||operation.loyalty!==undefined||operation.from||operation.optional||operation.sorceryOnly||operation.beforeAttackersOnly||operation.oncePerObject||operation.targets?.length||!operation.effects?.length||operation.effects[0].action!=='add-mana')return operation;
    const afterEffects=operation.effects.slice(1);
    if(afterEffects.some(effect=>!((['draw','gain-life','lose-life'].includes(effect.action)&&['you','each-opponent','each-player'].includes(effect.who)&&typeof effect.n==='number')||(effect.action==='damage'&&effect.target==='you'&&typeof effect.n==='number')||(effect.action==='skip-next-untap'&&effect.target==='self'))))return operation;
    if(Object.keys(operation.cost||{}).some(key=>!['tap','mana','life','sacSelf','sacWhat','sacOther','sacFilter','sacN','rmCounter'].includes(key)))return operation;
    if(operation.cost?.mana?.includes('{X}'))return operation;
    const effect=operation.effects[0];
    return {kind:'mana-source',activationCost:operation.cost,produce:effect.choices||[effect.produce],...(effect.multiplier?{multiplier:effect.multiplier}:{}),...(effect.restriction?{restriction:effect.restriction}:{}),...(afterEffects.length?{afterEffects}:{}),...(operation.activationCondition?{condition:operation.activationCondition}:{}),...(operation.onceEachTurn?{onceEachTurn:true}:{}),contract:'mana-source'};
  });
}

function grantedOperation(operation){
  if(!operation)return null;
  const normalized=normalizeManaOperations([operation])[0];
  if(normalized.kind==='mana-source')return normalized.activationCost?.tap&&Object.keys(normalized.activationCost).every(key=>key==='tap')&&!normalized.onceEachTurn?normalized:null;
  return JSON.stringify(operation).includes('"action":"add-mana"')?null:operation;
}

export function modifierOperation(card,line) {
  const affinity=/^Affinity for (.+)$/.exec(line);
  if(affinity){const multiplier=extensionCount(affinity[1]+' you control');if(multiplier)return {kind:'cost-modifier',self:true,amount:-1,multiplier,contract:'generic-cost-modification'};}
  const replicate=/^Replicate ((?:\{(?:\d+|[WUBRGC])\})+)$/.exec(line);
  if(replicate&&replicate[1]!=='{0}'&&/Instant|Sorcery/.test(card.type_line))return {kind:'mechanic-replicate',cost:replicate[1],contract:'mechanic-replicate'};
  if(line==='Ravenous'&&card.type_line.includes('Creature'))return {kind:'mechanic-ravenous',contract:'mechanic-ravenous'};
  if(line==='You may play lands from your graveyard.')return {kind:'mechanic-graveyard-lands',contract:'mechanic-graveyard-lands'};
  const free=/^If (.+), you may cast this spell without paying its mana cost\.$/.exec(line);
  if(free){const condition=extensionCondition(free[1]);if(condition)return {kind:'mechanic-conditional-alternative',condition,free:true,contract:'mechanic-conditional-alternative'};}
  const fire=/^Firebending (\d+|X)(?:, where X is (.+)\.)?$/.exec(line);
  if(fire){const n=fire[1]==='X'&&fire[2]?extensionValue(fire[2]):fire[1]!=='X'?Number(fire[1]):null;if(n!==null&&n!==false)return {kind:'generic-trigger',event:'attacks',eventFilter:'self',effects:[{action:'combat-mana',n}],targets:[],contract:'generic-trigger-effect'};}
  if(line==='You have hexproof.')return {kind:'mechanic-player-hexproof',contract:'mechanic-player-hexproof'};
  const extraLand=new RegExp('^You may play (an|'+NUM+') additional lands? on each of your turns\\.$').exec(line);
  if(extraLand)return {kind:'mechanic-additional-land',n:extraLand[1]==='an'?1:amount(extraLand[1]),contract:'mechanic-additional-land'};
  const frenzy=/^Frenzy (\d+)$/.exec(line);
  if(frenzy)return {kind:'generic-trigger',event:'blockersDeclared',eventFilter:'self-unblocked',effects:[{action:'pump',target:'self',power:Number(frenzy[1]),toughness:0,keywords:[]}],targets:[],contract:'generic-trigger-effect'};
  if(line==='Dethrone')return {kind:'mechanic-dethrone',contract:'mechanic-dethrone'};
  const combat=/^(Rampage|Mobilize) (\d+)$/.exec(line);
  if(combat)return {kind:'mechanic-'+combat[1].toLowerCase(),n:Number(combat[2]),contract:'mechanic-'+combat[1].toLowerCase()};
  const paid=/^(Blitz|Warp|Squad) ((?:\{(?:\d+|[WUBRGC])\})+)$/.exec(line);
  if(paid&&/Creature|Artifact|Enchantment/.test(card.type_line)&&!/Instant|Sorcery|Land/.test(card.type_line)&&!(paid[1]==='Squad'&&paid[2]==='{0}'))return {kind:'mechanic-'+paid[1].toLowerCase(),cost:paid[2],contract:'mechanic-'+paid[1].toLowerCase()};
  const duration=/^(Fading|Vanishing)(?: (\d+))?$/.exec(line);
  if(duration&&(duration[2]!==undefined||duration[1]==='Vanishing')&&!/Instant|Sorcery|Land/.test(card.type_line))return {kind:'mechanic-'+duration[1].toLowerCase(),...(duration[2]!==undefined?{n:Number(duration[2])}:{}),contract:'mechanic-'+duration[1].toLowerCase()};
  const upkeep=/^Cumulative upkeep ((?:\{(?:\d+|[WUBRGC])\})+)$/.exec(line);
  if(upkeep)return {kind:'mechanic-cumulative-upkeep',cost:upkeep[1],contract:'mechanic-cumulative-upkeep'};
  const buyback=/^Buyback ((?:\{(?:\d+|[WUBRGC])\})+)$/.exec(line);
  if(buyback&&/Instant|Sorcery/.test(card.type_line))return {kind:'mechanic-buyback',cost:buyback[1],contract:'mechanic-buyback'};
  if(line==='Split second'&&/Instant|Sorcery/.test(card.type_line))return {kind:'mechanic-split-second',contract:'mechanic-split-second'};
  if(line==='Jump-start'&&/Instant|Sorcery/.test(card.type_line))return {kind:'mechanic-jump-start',cost:card.mana_cost,contract:'mechanic-jump-start'};
  const madness=/^Madness ((?:\{(?:\d+|X|[WUBRGC])\})+)$/.exec(line);
  if(madness)return {kind:'mechanic-madness',cost:madness[1],contract:'mechanic-madness'};
  const alternate=/^(Surge|Spectacle) ((?:\{(?:\d+|[WUBRGC])\})+)$/.exec(line);
  if(alternate)return {kind:'mechanic-'+alternate[1].toLowerCase(),cost:alternate[2],contract:'mechanic-'+alternate[1].toLowerCase()};
  const leading=/^If (.+?), this spell costs (.+)\.$/.exec(line);
  if(leading)return modifierOperation(card,'This spell costs '+leading[2]+' if '+leading[1]+'.');
  const cost='((?:\\{(?:\\d+|[WUBRGC])\\})+)';
  const variableDiscount=/^This spell costs \{X\} less to cast, where X is (.+)\.$/.exec(line);
  if(variableDiscount){const multiplier=extensionValue(variableDiscount[1]);if(['count','max-stat','devotion','party','turn-count'].includes(multiplier?.kind))return {kind:'cost-modifier',self:true,amount:-1,multiplier,contract:'generic-cost-modification'};}
  if(/ less to cast as long as /.test(line))return modifierOperation(card,line.replace(' less to cast as long as ',' less to cast if '));
  const targetedDiscount=/^This spell costs \{(\d+)\} less to cast if it targets (?:a|an) (.+)\.$/.exec(line);
  if(targetedDiscount&&card.layout==='normal'&&/Instant|Sorcery/.test(card.type_line)){
    const targetCondition=extensionTarget('target '+targetedDiscount[2]);
    if(['battlefield','graveyard','stack'].includes(targetCondition?.zone))return {kind:'cost-modifier',self:true,targetCondition,amount:-Number(targetedDiscount[1]),contract:'generic-cost-modification'};
  }
  let discount=/^This spell costs \{(\d+)\} less to cast (for each|if) (.+)\.$/.exec(line);
  if(discount){const multiplier=discount[2]==='for each'?extensionCount(discount[3]):null,condition=discount[2]==='if'?extensionCondition(discount[3]):null;if(multiplier||condition)return {kind:'cost-modifier',self:true,amount:-Number(discount[1]),...(multiplier?{multiplier}:{condition}),contract:'generic-cost-modification'};}
  if(line.startsWith('As an additional cost to cast this spell, ')){
    const exile=new RegExp('^As an additional cost to cast this spell, exile ('+NUM+') (creature|artifact|enchantment|land|instant or sorcery)? ?cards? from your graveyard\\.$').exec(line);
    if(exile)return {kind:'mechanic-additional-costs',costs:[{id:'cost-1',kind:'exileGraveyard',quantity:{min:amount(exile[1]),max:amount(exile[1])},object:{kind:'card',...(exile[2]?{types:exile[2].split(' or ').map(type=>type[0].toUpperCase()+type.slice(1))}:{})}}],contract:'mechanic-additional-costs'};
    const sacrifice=/^As an additional cost to cast this spell, sacrifice (?:a|an) (land|enchantment)\.$/.exec(line);
    if(sacrifice)return {kind:'mechanic-additional-costs',costs:[{id:'cost-1',kind:'sacrifice',quantity:{min:1,max:1},object:{kind:'permanent',types:[sacrifice[1][0].toUpperCase()+sacrifice[1].slice(1)]}}],contract:'mechanic-additional-costs'};
    const costs=parseOracleAdditionalCosts(line);
    const variable=costs&&JSON.stringify(costs).includes('"kind":"variable"');
    const lifeX=variable&&costs.length===1&&costs[0].kind==='payLife'&&costs[0].amount.kind==='variable'&&!/\{X\}|\/P/.test(card.mana_cost||'');
    if(costs&&(!variable||lifeX))return {kind:'mechanic-additional-costs',costs,...(lifeX?{lifeX:true}:{}),contract:'mechanic-additional-costs'};
  }
  const cycling=/^(Plains|Island|Swamp|Mountain|Forest|Basic land)cycling ((?:\{(?:\d+|[WUBRGC])\})+)$/i.exec(line);
  if(cycling)return {kind:'mechanic-typecycling',subtype:cycling[1],cost:cycling[2],contract:'mechanic-typecycling'};
  let m=new RegExp('^(Kicker|Multikicker) '+cost+'$').exec(line);
  if(m&&!(m[1]==='Multikicker'&&m[2]==='{0}'))return {kind:'mechanic-'+m[1].toLowerCase(),cost:m[2],contract:'mechanic-'+m[1].toLowerCase()};
  m=new RegExp('^Escape—'+cost+', Exile ('+NUM+') other cards from your graveyard\\.$').exec(line);
  if(m)return {kind:'mechanic-escape',cost:m[1],n:amount(m[2]),contract:'mechanic-escape'};
  if(line==='You have no maximum hand size.')return {kind:'mechanic-no-max-hand',contract:'mechanic-no-max-hand'};
  return null;
}

export function modalOperation(card,text,parseEffect) {
  const match=/^Choose (one|two|one or both) —\n(• .+(?:\n• .+)+)$/.exec(text);
  if(!match)return null;
  const lines=match[2].split('\n').map(line=>line.slice(2));
  if(match[1]==='one or both'&&lines.length!==2)return null;
  const modes=lines.map(label=>({label,body:parseEffect(card,label)}));
  if(modes.some(mode=>!mode.body||mode.body.optional))return null;
  return {kind:'spell-modal-generic',choose:{min:match[1]==='two'?2:1,max:match[1]==='one'?1:2},modes,contract:'spell-modal-generic-effect'};
}

export function extensionCost(text) {
  const cost={};let extended=false;
  for(const part of text.split(/,\s*/)) {
    let m;
    if(part==='{T}')cost.tap=true;
    else if(/^(?:\{(?:\d+|X|[WUBRGC]|[WUBRG]\/[WUBRG]|[WUBRG]\/P)\})+$/.test(part))cost.mana=part;
    else if((m=/^Pay (\d+) life$/i.exec(part)))cost.life=Number(m[1]);
    else if((m=new RegExp('^Discard ('+NUM+') cards?$','i').exec(part))){cost.discard=amount(m[1]);extended=true;}
    else if(/^Sacrifice this (?:creature|artifact|enchantment|land|permanent)$/i.test(part)){cost.sacSelf=true;extended=true;}
    else if(/^Exile this (?:creature|artifact|enchantment|land|permanent)$/i.test(part)){cost.exileSelf=true;extended=true;}
    else if(/^Return this (?:creature|artifact|enchantment|land|permanent) to its owner's hand$/i.test(part)){cost.returnSelf=true;extended=true;}
    else if((m=new RegExp('^Tap ('+NUM+') (other )?untapped (.+?) you control$','i').exec(part))){const filters=groupSelectors(m[3]+' you control');if(filters?.length!==1)return null;cost.tapFilter={...filters[0],...(m[2]?{excludeSelf:true}:{})};cost.tapN=amount(m[1]);extended=true;}
    else if((m=new RegExp('^Discard ('+NUM+') (.+?) cards?$','i').exec(part))){const filter=extensionTarget('target '+m[2]+' card from your graveyard');if(!filter)return null;cost.discardFilter=filter;cost.discard=amount(m[1]);extended=true;}
    else if((m=/^Sacrifice (?:a|an|another) (creature|artifact|enchantment|land|token|[A-Z][a-z]+)$/.exec(part))&&(!/^[A-Z]/.test(m[1])||ORACLE_SUBTYPES.has(m[1]))){cost.sacWhat=m[1];if(part.startsWith('Sacrifice another '))cost.sacOther=true;extended=true;}
    else if((m=/^Sacrifice (?:a|an|another) (.+)$/.exec(part))){const filter=extensionTarget('target '+m[1]);if(!filter||filter.zone!=='battlefield')return null;cost.sacFilter=filter;cost.sacN=1;if(part.startsWith('Sacrifice another '))cost.sacOther=true;extended=true;}
    else if((m=new RegExp('^Sacrifice ('+NUM+') (.+)$').exec(part))){const noun=m[2].replace(/\b(creatures|artifacts|enchantments|lands|tokens)\b/g,word=>word.slice(0,-1)).replace(/\b([A-Z][a-z]+)s\b/g,(word,base)=>ORACLE_SUBTYPES.has(base)?base:word);const filter=extensionTarget('target '+noun);if(!filter||filter.zone!=='battlefield')return null;cost.sacFilter=filter;cost.sacN=amount(m[1]);extended=true;}
    else if((m=new RegExp('^Exile ('+NUM+') (.+?) from your graveyard$').exec(part))){const filter=extensionTarget('target '+m[2].replace(/ cards$/,' card')+' from your graveyard');if(!filter)return null;cost.exileFilter=filter;cost.exileFromGY=amount(m[1]);extended=true;}
    else if((m=/^Exile another (.+?) card from your graveyard$/.exec(part))){const filter=extensionTarget('another target '+m[1]+' card from your graveyard');if(!filter)return null;cost.exileFilter=filter;cost.exileFromGY=1;extended=true;}
    else if((m=new RegExp('^Remove ('+NUM+') (\\+1/\\+1|-1/-1|charge|time|storage|ki|quest|spore|fuse|page|verse|bounty|muster|ice|age) counters? from (?:this creature|this artifact|this enchantment|this land|this permanent)$','i').exec(part))){cost.rmCounter={kind:m[2],n:amount(m[1])};extended=true;}
    else return null;
  }
  if(cost.tapFilter&&Object.keys(cost).some(key=>!['mana','tap','tapFilter','tapN'].includes(key)))return null;
  return extended?cost:null;
}

function selfPattern(card, pronoun=false) {
  return '(?:this (?:creature|artifact|enchantment|land|permanent|planeswalker|Vehicle|Equipment|Aura|token)|'+escape(card.name)+
    (card.name.match(/,| the /)?'|'+escape(card.name.split(/,| the /)[0]):'')+(pronoun?'|it|he|him|she|her':'')+')';
}

function combatRestriction(card,text) {
  if(text==="can't block and can't be blocked")return {cantBlock:true,unblockable:true};
  const plain=/^can't (attack or block|attack|block|be blocked)$/.exec(text);
  if(plain)return plain[1]==='be blocked'?{unblockable:true}:{cantAttack:plain[1].includes('attack'),cantBlock:plain[1].includes('block')};
  if(text==='can block only creatures with flying')return {blockOnlyFlying:true};
  const block=/^can't (block or be blocked by|block) (.+)$/.exec(text);
  if(block){
    const relative=new RegExp('^creatures with power (greater|less) than '+selfPattern(card)+"'s power$").exec(block[2]);
    const filters=relative?null:groupSelectors(block[2]);
    if(relative||filters)return {...(relative?{relativeAttackerPower:relative[1]}:{attackerFilters:filters}),...(block[1]==='block or be blocked by'?{blockerFilters:filters}:{} )};
  }
  const evasion=/^can't be blocked (by|except by) (.+)$/.exec(text);
  if(evasion){const filters=groupSelectors(evasion[2].replace(/ and\/or /g,' and '));if(filters)return {blockerFilters:filters,blockOnly:evasion[1]==='except by'};}
  return null;
}

function protectionQualities(text){
  const colors={white:'W',blue:'U',black:'B',red:'R',green:'G'};
  const parts=text.split(/,? and (?:from )?|, (?:from )?/),qualities=parts.map(part=>{
    if(colors[part])return {kind:'color',value:colors[part]};
    if(part==='each color')return {kind:'colored'};
    if(['colorless','monocolored','multicolored'].includes(part))return {kind:part};
    const types={creatures:'Creature',artifacts:'Artifact',enchantments:'Enchantment',lands:'Land',planeswalkers:'Planeswalker',instants:'Instant',sorceries:'Sorcery','instant spells':'Instant','sorcery spells':'Sorcery'};
    if(types[part])return {kind:'type',value:types[part]};
    const subtype={Elves:'Elf',Dwarves:'Dwarf',Wolves:'Wolf'}[part]||part.replace(/s$/,'');
    if(ORACLE_SUBTYPES.has(subtype))return {kind:'subtype',value:subtype};
    const filters=groupSelectors(part);if(filters)return {kind:'filters',filters};
    return null;
  });
  return qualities.every(Boolean)?qualities:null;
}

function extendedTarget(phrase) {
  const controlledSpell=/^(target .*spell) (you control|an opponent controls)$/.exec(phrase);
  if(controlledSpell){const target=extensionTarget(controlledSpell[1]);if(target?.zone==='stack')return {...target,controller:controlledSpell[2]==='you control'?'you':'opponent'};}
  if(/ you own/.test(phrase)){const target=extensionTarget(phrase.replace(' you own',''));return target?{...target,owner:'you'}:null;}
  if(/\bcommander creature\b/i.test(phrase)){const target=extensionTarget(phrase.replace(/\bcommander creature\b/i,'creature'));return target?{...target,commander:true}:null;}
  const temporal=/ that (entered|attacked) this turn$/.exec(phrase);
  if(temporal){const target=extensionTarget(phrase.slice(0,temporal.index));return target?.zone==='battlefield'?{...target,[temporal[1]==='entered'?'enteredThisTurn':'attackedThisTurn']:true}:null;}
  const anyCounter=/ with (?:a counter|counters|one or more counters) on (?:it|them)$/.exec(phrase);
  if(anyCounter){const target=extensionTarget(phrase.slice(0,anyCounter.index));return target?.zone==='battlefield'?{...target,anyCounter:true}:null;}
  const rangeQuantity=/^(any number of |one or two |one, two, or three )(other )?target (.+)$/i.exec(phrase);
  if(rangeQuantity){const noun=rangeQuantity[3].replace(/\b(creatures|artifacts|enchantments|lands|permanents|planeswalkers|cards|spells)\b/g,word=>word.slice(0,-1)),target=extensionTarget((rangeQuantity[2]?'another ':'')+'target '+noun);if(target)return {...target,min:rangeQuantity[1]==='any number of '?0:1,...(rangeQuantity[1]==='any number of '?{unbounded:true,max:null}:{max:rangeQuantity[1]==='one or two '?2:3})};}
  const dynamic=/^((?:another |up to one )?target .+?) with (mana value|power|toughness) less than or equal to (.+?)( card from your graveyard| from your graveyard| from a graveyard| you control| an opponent controls)?$/.exec(phrase);
  if(dynamic)for(const [valueText,noun]of [[dynamic[3]+(dynamic[4]||''),dynamic[1]],[dynamic[3],dynamic[1]+(dynamic[4]||'')]]){const value=extensionValue(valueText),base=value&&extensionTarget(noun);if(base&&['count','devotion','party','max-stat','turn-count','life-total'].includes(value.kind))return {...base,stat:dynamic[2]==='mana value'?'mv':dynamic[2],threshold:value,comparison:'less'};}
  const cardUnion=/^((?:another |up to one )?target) (.+? card) or (?:an? )?(.+?)( from (?:your|a) graveyard)$/.exec(phrase);
  if(cardUnion){const alternatives=[cardUnion[2],cardUnion[3]].map(noun=>extensionTarget('target '+noun+cardUnion[4]));if(alternatives.every(Boolean))return {what:'card',zone:'graveyard',controller:'any',min:cardUnion[1].includes('up to one')?0:1,...(cardUnion[1].startsWith('another')?{excludeSelf:true}:{}),alternatives};return null;}
  if(/ and\/or /.test(phrase))return extensionTarget(phrase.replace(/,? and\/or /g,' or '));
  const otherCount=/^(up to )?(one|two|three|four|five|six|seven|eight|nine|ten|\d+) other target (.+)$/.exec(phrase);
  if(otherCount){const target=extensionTarget((otherCount[1]||'')+otherCount[2]+' target '+otherCount[3]);return target?{...target,excludeSelf:true}:null;}
  const cardArticle=/\b card or (?:a |an )?/.exec(phrase);
  if(cardArticle)return extensionTarget(phrase.replace(cardArticle[0],' or '));
  const basic=/\bbasic (Plains|Island|Swamp|Mountain|Forest)\b/.exec(phrase);
  if(basic){const target=extensionTarget(phrase.replace(basic[0],basic[1]));return target?{...target,basic:true}:null;}
  const subtypeCard=/^((?:another |up to one )?target) ([A-Z][A-Za-z-]+) card from (your|a) graveyard$/.exec(phrase);
  if(subtypeCard&&ORACLE_SUBTYPES.has(subtypeCard[2]))return {what:'card',zone:'graveyard',subtype:subtypeCard[2],controller:subtypeCard[3]==='your'?'you':'any',min:subtypeCard[1].includes('up to one')?0:1,...(subtypeCard[1].startsWith('another')?{excludeSelf:true}:{})};
  const conjunction=/\bnon(creature|land|artifact|enchantment), non(creature|land|artifact|enchantment) /.exec(phrase);
  if(conjunction){const target=extensionTarget(phrase.replace(conjunction[0],''));return target?{...target,excludedTypes:[conjunction[1],conjunction[2]].map(type=>type[0].toUpperCase()+type.slice(1))}:null;}
  const tokenPrefix=/\btoken (creature|artifact|enchantment|permanent)\b/.exec(phrase);
  if(tokenPrefix){const target=extensionTarget(phrase.replace(tokenPrefix[0],tokenPrefix[1]));return target?{...target,token:true}:null;}
  const order=/^(.*?target .+?) (you control|an opponent controls) with (.+)$/.exec(phrase);
  if(order)return extensionTarget(order[1]+' with '+order[3]+' '+order[2]);
  const trailingController=/^(.*?target .+?) with (.+) (you control|an opponent controls)$/.exec(phrase);
  if(trailingController){const target=extensionTarget(trailingController[1]+' with '+trailingController[2]);return target?{...target,controller:trailingController[3]==='you control'?'you':'opponent'}:null;}
  const exact=/ with (mana value|power|toughness) (\d+)$/.exec(phrase);
  if(exact){const target=extensionTarget(phrase.slice(0,exact.index));return target?{...target,stat:exact[1]==='mana value'?'mv':exact[1],threshold:Number(exact[2]),comparison:'equal'}:null;}
  const spellFilter=/^target (.+?) spell(?: with mana value (\d+)( or less| or greater)?)?$/.exec(phrase);
  if(spellFilter){const filter=extensionTarget('target '+spellFilter[1]+' card from your graveyard');if(filter){const clear=value=>Array.isArray(value)?value.map(clear):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,key==='controller'?'any':clear(item)])):value;return {...clear(filter),zone:'stack',controller:'any',what:'spell',spellFilter:clear(filter),...(spellFilter[2]?{stat:'mv',threshold:Number(spellFilter[2]),comparison:spellFilter[3]===' or less'?'less':spellFilter[3]?'greater':'equal'}:{})};}}
  const unionAny=/^((?:another |up to one )?target) (.+?)((?: card)? from (?:your|a) graveyard| you control| an opponent controls)?$/.exec(phrase);
  if(unionAny&&/ or /.test(unionAny[2])){
    const nouns=unionAny[2].split(/, or |, | or /),alternatives=nouns.map(noun=>extensionTarget('target '+noun+(unionAny[3]||'')));
    if(alternatives.every(Boolean)&&new Set(alternatives.map(t=>t.zone)).size===1)return {what:alternatives[0].zone==='graveyard'?'card':'permanent',zone:alternatives[0].zone,controller:'any',min:unionAny[1].includes('up to one')?0:1,...(unionAny[1].startsWith('another')?{excludeSelf:true}:{}),alternatives};
  }
  const subtypeUnion=/^((?:another |up to one )?target) (creature|artifact|enchantment|land|[A-Z][a-zA-Z-]+) or ([A-Z][a-zA-Z-]+)(.*)$/.exec(phrase);
  if(subtypeUnion&&ORACLE_SUBTYPES.has(subtypeUnion[3])){
    const alternatives=[subtypeUnion[2],subtypeUnion[3]].map(noun=>extensionTarget('target '+noun+subtypeUnion[4]));
    if(alternatives.every(Boolean)&&new Set(alternatives.map(t=>t.zone)).size===1)return {what:alternatives[0].zone==='graveyard'?'card':'permanent',zone:alternatives[0].zone,controller:'any',min:subtypeUnion[1].includes('up to one')?0:1,...(subtypeUnion[1].startsWith('another')?{excludeSelf:true}:{}),alternatives};
  }
  if(/^(another |up to one )?target (?:nontoken |nonland )?token$/.test(phrase))return {...extensionTarget(phrase.replace(/token$/,'permanent')),token:true};
  const union=/^((?:another |up to one )?target) ((?:artifact|creature|enchantment|land|planeswalker|instant|sorcery)(?:(?:, or |, | or )(?:artifact|creature|enchantment|land|planeswalker|instant|sorcery))+)(.*)$/.exec(phrase);
  if(union){const types=union[2].split(/, or |, | or /),suffix=union[3],shared=/^ (?:card|you control|an opponent controls|defending player controls|from )/.test(suffix),alternatives=types.map((type,index)=>extensionTarget('target '+type+(shared||index===types.length-1?suffix:'')));if(alternatives.every(Boolean)&&new Set(alternatives.map(t=>t.zone)).size===1)return {what:alternatives[0].zone==='graveyard'?'card':'permanent',zone:alternatives[0].zone,controller:'any',min:union[1].includes('up to one')?0:1,...(union[1].startsWith('another')?{excludeSelf:true}:{}),alternatives};}
  const compound=/^((?:another |up to one )?target) (enchanted creature|equipped creature|creature) or (enchantment creature|artifact creature|equipped creature|Vehicle)( you control| an opponent controls)?$/.exec(phrase);
  if(compound){const alternatives=[compound[2],compound[3]].map(noun=>extensionTarget('target '+noun+(compound[4]||'')));if(alternatives.every(Boolean))return {what:'permanent',zone:'battlefield',controller:'any',min:compound[1].includes('up to one')?0:1,alternatives};}
  if(/ from graveyards$/.test(phrase))return extensionTarget(phrase.replace(/ from graveyards$/,' from a graveyard'));
  if(/ you don't control/.test(phrase))return extensionTarget(phrase.replace(/ you don't control/g,' an opponent controls'));
  const counterFilter=/ with (?:a|one or more) (\+1\/\+1|-1\/-1|[a-z]+) counters? on (?:it|them)$/.exec(phrase);
  if(counterFilter){const target=extensionTarget(phrase.slice(0,counterFilter.index));return target?{...target,hasCounter:counterFilter[1]}:null;}
  const relativeKeyword=/^(target .+?) (you control|an opponent controls) with(out)? (flying|defender|deathtouch|lifelink|vigilance|haste|trample|first strike|double strike|reach|menace|hexproof|indestructible|shadow|fear|intimidate)$/.exec(phrase);
  if(relativeKeyword){const target=extensionTarget(relativeKeyword[1]+' '+relativeKeyword[2]);return target?{...target,[relativeKeyword[3]?'withoutKeyword':'withKeyword']:relativeKeyword[4]}:null;}
  const keyword=/^(target .+?) with(out)? (flying|defender|deathtouch|lifelink|vigilance|haste|trample|first strike|double strike|reach|menace|hexproof|indestructible|shadow|fear|intimidate)( (?:card )?from (?:your|a) graveyard)?$/.exec(phrase);
  if(keyword){const target=extensionTarget(keyword[1]+(keyword[4]||''));return target?{...target,[keyword[2]?'withoutKeyword':'withKeyword']:keyword[3]}:null;}
  const opponentGY=/ from an opponent's graveyard$/.test(phrase);
  if(opponentGY){const target=extensionTarget(phrase.replace(/ from an opponent's graveyard$/,' from a graveyard'));return target?{...target,controller:'opponent'}:null;}
  const nonCreatureSubtype=/^((?:another |up to one )?target) (non-)?([A-Z][a-z]+) (artifact|enchantment|land|creature)(.*)$/.exec(phrase);
  if(nonCreatureSubtype&&ORACLE_SUBTYPES.has(nonCreatureSubtype[3])){const target=extensionTarget(nonCreatureSubtype[1]+' '+nonCreatureSubtype[4]+nonCreatureSubtype[5]);return target?{...target,[nonCreatureSubtype[2]?'notSubtype':'subtype']:nonCreatureSubtype[3]}:null;}
  const normalized=phrase.replace(/^up to one other target /,'another up to one target ').replace(/^other target /,'another target ');
  if(normalized!==phrase)return extensionTarget(normalized);
  const spell=/^target (?:(noncreature|creature|artifact|enchantment|instant|sorcery|white|blue|black|red|green|nonwhite|nonblue|nonblack|nonred|nongreen|colorless|multicolored) )?spell$/.exec(phrase);
  if(spell)return {what:'spell',zone:'stack',min:1,spellQuality:spell[1]||'any'};
  const quantity=/^(up to )?(one|two|three|four|five|six|seven|eight|nine|ten|\d+) target (.+)$/.exec(phrase);
  if(quantity && !(quantity[1]&&quantity[2]==='one')) {
    const noun=quantity[3].replace(/\b(creatures|artifacts|enchantments|lands|permanents|planeswalkers|cards)\b/,m=>m.slice(0,-1));
    const target=extensionTarget('target '+noun),n=amount(quantity[2]);
    if(target && n>=1 && n<=10)return {...target,min:quantity[1]?0:n,max:n};
  }
  // Delegate one changed phrase to the ordinary parser, then retain the
  // additional restriction explicitly. No unparsed suffix can be accepted.
  for (const [pattern,field] of [
    [/\bsnow /,'snow'],[/\bnonsnow /,'nonsnow'],[/\bnonbasic /,'nonbasic'],
    [/\blegendary /,'legendary'],[/\benchanted /,'enchanted'],[/\bequipped /,'equipped'],
    [/ token(?= you control| an opponent controls|$)/,'token'],
  ]) {
    if (!pattern.test(phrase)) continue;
    const target=extensionTarget(phrase.replace(pattern,''));
    return target?{...target,[field]:true}:null;
  }
  const negativeColor=/\bnon(white|blue|red|green|colorless) /.exec(phrase);
  if(negativeColor){const target=extensionTarget(phrase.replace(negativeColor[0],''));return target?{...target,notColor:negativeColor[1]}:null;}
  const excludedType=/\bnon(creature|enchantment|land) /.exec(phrase);
  if(excludedType && !phrase.includes('nonland permanent')){const target=extensionTarget(phrase.replace(excludedType[0],''));return target?{...target,notType:excludedType[1][0].toUpperCase()+excludedType[1].slice(1)}:null;}
  const dualType=/\b(artifact|enchantment) creature\b/.exec(phrase);
  if(dualType){const target=extensionTarget(phrase.replace(dualType[0],'creature'));return target?{...target,alsoType:dualType[1][0].toUpperCase()+dualType[1].slice(1)}:null;}
  const colors=/\b(white|blue|black|red|green) or (white|blue|black|red|green) /.exec(phrase);
  if(colors){const target=extensionTarget(phrase.replace(colors[0],''));return target?{...target,colorsAny:[colors[1],colors[2]].map(c=>({white:'W',blue:'U',black:'B',red:'R',green:'G'}[c]))}:null;}
  const subtype=/\b(non-)?([A-Z][a-zA-Z-]+)(?: creature)?(?= card from | you control| an opponent controls| with |$)/.exec(phrase);
  if(subtype && ORACLE_SUBTYPES.has(subtype[2])) {
    const type={Gate:'land',Plains:'land',Island:'land',Swamp:'land',Mountain:'land',Forest:'land',Equipment:'artifact',Vehicle:'artifact',Spacecraft:'artifact',Food:'artifact',Clue:'artifact',Treasure:'artifact',Blood:'artifact',Map:'artifact',Gold:'artifact',Junk:'artifact',Powerstone:'artifact',Incubator:'artifact',Aura:'enchantment',Curse:'enchantment',Shrine:'enchantment',Saga:'enchantment'}[subtype[2]]||'creature';
    const target=extensionTarget(phrase.slice(0,subtype.index)+type+phrase.slice(subtype.index+subtype[0].length));
    if(target)return {...target,[subtype[1]?'notSubtype':'subtype']:subtype[2]};
  }
  const typeChoice=/^(another |up to one )?target (creature or land|enchantment or land|creature or artifact|creature or enchantment)(.*)$/.exec(phrase);
  if(typeChoice) {
    const target=extensionTarget((typeChoice[1]||'')+'target permanent'+typeChoice[3]);
    return target?{...target,what:typeChoice[2]}:null;
  }
  const player=/^target (player|opponent|player or planeswalker)$/.exec(phrase);
  if(player)return {what:player[1],min:1,zone:'player'};
  return null;
}

function groupSelectors(phrase) {
  phrase=phrase.replace(/your opponents control/g,'an opponent controls').replace(/\b([A-Z][a-z]+)s\b/g,(word,base)=>ORACLE_SUBTYPES.has(word)?word:ORACLE_SUBTYPES.has(base)?base:({Elves:'Elf',Wolves:'Wolf',Dwarves:'Dwarf',Allies:'Ally'}[word]||word));
  phrase=phrase.replace(/\bcreature tokens\b/gi,'token creatures').replace(/^(Attacking|Blocking|Tapped|Untapped|Nonland|Nontoken|Token|White|Blue|Black|Red|Green|Colorless|Multicolored|Nonartifact)\b/,word=>word.toLowerCase());
  if(/^(you|players|opponents)\b/i.test(phrase))return null;
  const shared=/ (you control|an opponent controls)$/.exec(phrase);
  if(shared&&!/control/.test(phrase.slice(0,shared.index))&&/ and |, /.test(phrase.slice(0,shared.index))){const list=phrase.slice(0,shared.index).replace(/^other /i,''),other=/^other /i.test(phrase);const parts=list.replace(/,? and /g,', ').split(', ');const groups=parts.map(part=>groupSelectors((other?'other ':'')+part+' '+shared[1]));if(groups.every(Boolean))return groups.flat();}
  const plurals={creatures:'creature',artifacts:'artifact',enchantments:'enchantment',lands:'land',permanents:'permanent',planeswalkers:'planeswalker',cards:'card'};
  const normalized=phrase.replace(/^(?:all|each) /i,'').replace(/\b(creatures|artifacts|enchantments|lands|permanents|planeswalkers|cards)\b/gi,m=>plurals[m.toLowerCase()]);
  const parts=normalized.replace(/, and /g,' and ').replace(/, /g,' and ').split(' and ');
  const filters=parts.map(part=>{
    const subtypePlural=!ORACLE_SUBTYPES.has(part)&&/^([A-Z][a-z]+)s$/.exec(part);
    const singular={Elve:'Elf',Wolve:'Wolf',Dwarve:'Dwarf',Allie:'Ally',Mercenarie:'Mercenary'};
    return extensionTarget((/^other /i.test(part)?'another target ':'target ')+(subtypePlural?(singular[subtypePlural[1]]||subtypePlural[1]):part.replace(/^other /i,'')));
  });
  return filters.length && filters.every(t=>t&&t.zone!=='graveyard'&&!['player','opponent','card'].includes(t.what))?filters:null;
}

function searchFilter(text) {
  const dynamic=/^(.+?)(?: card)? with (mana value|power|toughness) less than or equal to (.+)$/.exec(text);
  if(dynamic){const value=extensionValue(dynamic[3]),base=searchFilter(dynamic[1]);if(base&&value&&['count','devotion','party','max-stat','turn-count','life-total'].includes(value.kind))return {...base,stat:dynamic[2]==='mana value'?'mv':dynamic[2],threshold:value,comparison:'less'};}
  const union=/^(.+?) cards? or (?:an? )?(.+)$/.exec(text);
  if(union){const alternatives=[union[1],union[2].replace(/ cards?$/,'')].map(searchFilter);return alternatives.every(Boolean)?{what:'card',zone:'graveyard',controller:'you',alternatives}:null;}
  const stat=/^(.+?)(?: card)? with (mana value|power|toughness) (\d+)( or less| or greater)?$/.exec(text);
  if(stat){const filter=searchFilter(stat[1]);return filter?{...filter,stat:stat[2]==='mana value'?'mv':stat[2],threshold:Number(stat[3]),comparison:stat[4]===' or less'?'less':stat[4]?'greater':'equal'}:null;}

  const basic=/^basic (Plains|Island|Swamp|Mountain|Forest)(?:(?:, |, or | or )(?:Plains|Island|Swamp|Mountain|Forest))*$/.test(text);
  if(basic){const types=text.match(/Plains|Island|Swamp|Mountain|Forest/g);return {what:'land',zone:'graveyard',controller:'you',basic:true,alternatives:types.map(subtype=>({what:'land',subtype,basic:true}))};}
  const normalized=text.replace(/ card with /,' with ');
  return extensionTarget('target '+normalized+' card from your graveyard')||extensionTarget('target '+normalized+' from your graveyard');
}

function resolutionPayment(text){
  text=text.replace(/^(pays|discards|sacrifices|returns|taps)\b/,word=>word.slice(0,-1));
  const alternatives=text.split(/ or (?=pay |discard |sacrifice |return |tap )/);
  if(alternatives.length>1){const choices=alternatives.map(resolutionPayment);return choices.every(Boolean)?{kind:'alternatives',choices}:null;}
  let m=/^pay ((?:\{(?:\d+|[WUBRGC])\})+)$/.exec(text);if(m)return {kind:'mana',mana:m[1]};
  m=new RegExp('^pay ('+NUM+') life$').exec(text);if(m)return {kind:'life',n:amount(m[1])};
  m=new RegExp('^discard ('+NUM+') (cards?|.+? cards?)( at random)?$').exec(text);
  if(m){const filter=searchFilter(m[2].replace(/^cards?$/,'card').replace(/ cards?$/,''));if(filter)return {kind:'discard',zone:'hand',n:amount(m[1]),filter,random:!!m[3]};}
  m=new RegExp('^sacrifice (another|'+NUM+') (.+?)(?: of (?:your|their) choice)?$').exec(text);
  if(m){const noun=m[2].replace(/\b(creatures|artifacts|enchantments|lands|permanents)\b/g,word=>word.slice(0,-1)),filter=extensionTarget('target '+noun+' you control');if(filter?.zone==='battlefield')return {kind:'sacrifice',zone:'battlefield',n:m[1]==='another'?1:amount(m[1]),filter:{...filter,...(m[1]==='another'?{excludeSelf:true}:{})}};}
  m=new RegExp("^return (another|"+NUM+") (.+?) you control to (?:its owner's hand|their owners' hands)$").exec(text);
  if(m){const noun=m[2].replace(/\b(creatures|artifacts|enchantments|lands|permanents)\b/g,word=>word.slice(0,-1)),filter=extensionTarget('target '+noun+' you control');if(filter?.zone==='battlefield')return {kind:'return',zone:'battlefield',n:m[1]==='another'?1:amount(m[1]),filter:{...filter,...(m[1]==='another'?{excludeSelf:true}:{})}};}
  m=new RegExp('^tap ('+NUM+') untapped (.+?) you control$').exec(text);
  if(m){const filter=groupSelectors('untapped '+m[2]+' you control');if(filter?.length===1)return {kind:'tap',zone:'battlefield',n:amount(m[1]),filter:filter[0]};}
  return null;
}

function preventionOperation(card,text,temporary) {
  text=text.replace(/ damage that would be dealt this turn (to and dealt by|by|to) (.+)$/i,' damage that would be dealt $1 $2 this turn');
  const match=/^prevent all (combat |noncombat )?damage that would be dealt(?: (to and dealt by|by|to) (.+?))?( this turn)?$/i.exec(text);
  if(!match||!!match[4]!==temporary)return null;
  const direction=match[2]||'all',noun=match[3],combat=match[1]?.trim()||'any';
  if(!noun)return {action:'prevent-all',direction,combat};
  if(/^(?:enchanted|equipped) (?:creature|permanent)$/.test(noun))return {action:'prevent-all',direction,combat,target:'attached-host'};
  if(new RegExp('^'+selfPattern(card,true)+'$','i').test(noun))return {action:'prevent-all',direction,combat,target:'self'};
  if(noun==='you')return {action:'prevent-all',direction,combat,player:'you'};
  const target=extensionTarget(noun);
  if(target?.zone==='battlefield')return {action:'prevent-all',direction,combat,target:0,targetSpec:target};
  const own=/^you and (.+)$/.exec(noun),filters=groupSelectors(own?own[1]:noun);
  if(filters)return {action:'prevent-all',direction,combat,filters,...(own?{player:'you'}:{})};
  return null;
}

function extendedEffect(card,line,helpers) {
  if(line.endsWith('"'))line+='.';
  if(!line.endsWith('.'))return null;
  let text=line.slice(0,-1),optional=false;
  if(/^you may /i.test(text)){text=text.slice(8);optional=true;}
  const result=(effects,targets=[])=>({effects,targets,optional});
  const self=selfPattern(card,true);
  let m;
  const combatText=text.replace(/^Until end of turn, (.+)$/i,'$1 until end of turn').replace(/can't be blocked this turn (except by .+)$/,"can't be blocked $1 this turn");
  const choiceKeyword=/^(.+?) (?:(?:gets ([+-]\d+)\/([+-]\d+) and )?gains?) your choice of (.+) until end of turn$/i.exec(combatText);
  if(choiceKeyword){const target=extensionTarget(choiceKeyword[1]),own=new RegExp('^'+self+'$','i').test(choiceKeyword[1]),choices=choiceKeyword[4].split(/,? or |, /),keywords=choices.flatMap(choice=>helpers.keywordList(choice)||[]);if((own||target?.zone==='battlefield')&&keywords.length===choices.length&&keywords.length>1)return result([{action:'choose-keyword',target:target?0:'self',power:Number(choiceKeyword[2]||0),toughness:Number(choiceKeyword[3]||0),choices:keywords}],target?[target]:[]);}
  const combat=/^(.+?) (can't .+?|can block only .+?) (this turn|this combat|until end of turn)$/.exec(combatText);
  if(combat){
    const subject=combat[1],target=extensionTarget(subject),own=new RegExp('^'+self+'$','i').test(subject),filters=target||own?null:groupSelectors(subject);
    const restriction=combatRestriction(card,combat[2]);
    if((target?.zone==='battlefield'||own||filters)&&restriction)return result([{action:'combat-restriction',...(target||own?{target:target?0:'self'}:{filters}),restriction,duration:combat[3]==='this combat'?'combat':'eot'}],target?[target]:[]);
  }
  const tuck=/^(?:the owner of (target .+?)|(target .+?)'s owner) puts it on their choice of the top or bottom of their library$/i.exec(text);
  if(tuck){const target=extensionTarget(tuck[1]||tuck[2]);if(target?.zone==='battlefield')return result([{action:'owner-library-choice',target:0}],[target]);}
  const exileTop=new RegExp('^(?:(you|each opponent|each player|target opponent|target player) exiles?|exile) the top (?:(X|'+NUM+') cards|card) of (your library|their library|that player\\\'s library|each opponent\\\'s library|each player\\\'s library|target opponent\\\'s library|target player\\\'s library)(?:\\. (.+))?$','i').exec(text);
  if(exileTop){
    const phrase=exileTop[3].toLowerCase(),actor=(exileTop[1]||'').toLowerCase(),who=phrase==='your library'?'you':phrase==='their library'?actor:phrase==="that player's library"?'event-player':phrase.replace("'s library",'');
    const targeted=who.startsWith('target ');let permission;
    if(exileTop[4]){
      const tail=exileTop[4].replace(/, and you may spend mana as though it were mana of any color to cast (?:those spells|that spell)$/,'');
      const play=/^(?:Until (the end of your next turn|end of turn), you may (play|cast) (?:it|them|that card|those cards|spells from among those exiled cards)|You may (play|cast) (?:it|them|that card|those cards) (this turn|until the end of your next turn|until end of turn))$/.exec(tail);
      if(!play)return null;permission={spellsOnly:(play[2]||play[3])==='cast',nextOwnTurn:(play[1]||play[4]||'').includes('next turn'),anyColor:tail!==exileTop[4]};
    }
    if(['you','event-player','each player','each opponent','target player','target opponent'].includes(who))return result([{action:'exile-top',who:targeted?0:who.replace(' ','-'),n:exileTop[2]==='X'?'X':exileTop[2]?amount(exileTop[2]):1,...(permission?{permission}:{})}],targeted?[extensionTarget(who)]:[]);
  }
  const peek=new RegExp('^look at the top (card|('+NUM+') cards) of (your|target player\\\'s|target opponent\\\'s) library(?:\\. You may put that card into their graveyard)?$','i').exec(text);
  if(peek){const targeted=peek[3]!=='your';if(peek[1]==='card'||!text.includes('You may put'))return result([{action:'inspect-top',who:targeted?0:'you',n:peek[1]==='card'?1:amount(peek[2]),destination:text.includes('You may put')?'graveyard':null,optionalMove:true,reveal:false}],targeted?[extensionTarget(peek[3].replace("'s",''))]:[]);}
  const revealLife=/^reveal the top card of your library and put that card into your hand\. You lose life equal to its mana value$/i.exec(text);
  if(revealLife)return result([{action:'inspect-top',who:'you',n:1,reveal:true,destination:'hand',loseLife:'mana-value'}]);
  const peekFilter=/^(look at|reveal) the top card of your library\. If (?:it's|it is|that card is) (?:a|an) (.+?) card, (you may )?(reveal it and )?put it (into your hand|onto the battlefield(?: tapped)?)(?:\. (?:Otherwise, you may put that card|If you don't put the card (?:into your hand|onto the battlefield), you may put it) (on the bottom of your library|into your graveyard))?$/i.exec(text);
  if(peekFilter){const filter=searchFilter(peekFilter[2]);if(filter)return result([{action:'inspect-top',who:'you',n:1,reveal:peekFilter[1].toLowerCase()==='reveal',filter,revealSelected:!!peekFilter[4],optionalMove:!!peekFilter[3],destination:peekFilter[5].includes('hand')?'hand':'battlefield',tapped:peekFilter[5].endsWith(' tapped'),otherwise:peekFilter[6]?(peekFilter[6].includes('graveyard')?'graveyard':'bottom'):null}]);}
  const selectionText=text.replace(/\. Then put the rest/gi,'. Put the rest').replace(/ and the rest (into your graveyard|into your hand|on the bottom of your library)/gi,'. Put the rest $1').replace(/ and put the rest (into your graveyard|into your hand|on the bottom of your library)/gi,'. Put the rest $1');
  const selection=new RegExp('^(look at|reveal) the top ('+NUM+'|X) cards? of your library\\. (You may put|Put) (all|up to '+NUM+'|any number of|a|an|one) (.+?) (?:revealed this way|from among them) (into your hand|onto the battlefield(?: tapped)?)\\. Put the rest(?: of (?:the |those )?cards(?: revealed this way)?)? (into your graveyard|into your hand|on the bottom of your library in (any|a random) order)$','i').exec(selectionText);
  if(selection){
    const filter=searchFilter(selection[5].replace(/\bcards?\b ?/,'').trim()),quantity=selection[4].toLowerCase();
    if(filter)return result([{action:'look-select',n:selection[2]==='X'?'X':amount(selection[2]),what:'card',filter,max:['all','any number of'].includes(quantity)?'all':amount(quantity.replace(/^up to /,'')),required:quantity==='all'||selection[3]==='Put'&&!/^(up to|any number)/.test(quantity),destination:selection[6].includes('hand')?'hand':'battlefield',tapped:selection[6].endsWith(' tapped'),revealAll:selection[1].toLowerCase()==='reveal',rest:selection[7].includes('graveyard')?'graveyard':selection[7].includes('hand')?'hand':'bottom',random:selection[8]==='a random'}]);
  }
  if(/^Choose a color\. /i.test(text)&&text.includes('protection from the chosen color'))return helpers.effect(card,text.slice(16).replace('protection from the chosen color','protection from the color of your choice')+'.');
  const protection=/^(.+?) gains? protection from (.+) until end of turn$/i.exec(text.replace(/^Until end of turn, (.+)$/i,'$1 until end of turn'));
  if(protection){
    const target=extensionTarget(protection[1]),own=new RegExp('^'+self+'$','i').test(protection[1]),filters=target||own?null:groupSelectors(protection[1]);
    const choice=/^(?:(colorless|artifacts) or from )?the (color|card type) of (your|its controller's) choice$/.exec(protection[2]),qualities=choice?null:protectionQualities(protection[2]);
    if((target?.zone==='battlefield'||own||filters)&&(choice||qualities))return result([{action:'grant-protection',...(target||own?{target:target?0:'self'}:{filters}),...(choice?{choose:choice[2],chooser:choice[3]==='your'?'you':'controller',alternatives:choice[1]?protectionQualities(choice[1]):[]}:{qualities})}],target?[target]:[]);
  }
  const baseWording=text.replace(/^Until end of turn, (.+)$/i,'$1 until end of turn').replace(/^have (.+?)'s base power and toughness become /i,'$1 has base power and toughness ').replace(/^have the base power and toughness of (.+?) become /i,'$1 has base power and toughness ');
  const basePT=/^(.+?) (?:has|have) base power and toughness (\d+|X)\/(\d+|X)(?: until end of turn and gains? (.+?) until end of turn|(?: and gains? (.+?))?( until end of turn)?)$/i.exec(baseWording);
  if(basePT){
    const target=extensionTarget(basePT[1]),own=new RegExp('^'+self+'$','i').test(basePT[1]),filters=target||own?null:groupSelectors(basePT[1]),keywords=(basePT[4]||basePT[5])?helpers.keywordList(basePT[4]||basePT[5]):[];
    if((target?.zone==='battlefield'||own||filters)&&keywords)return result([{action:'base-pt',...(target||own?{target:target?0:'self'}:{filters}),power:basePT[2]==='X'?'X':Number(basePT[2]),toughness:basePT[3]==='X'?'X':Number(basePT[3]),keywords,temporary:!!basePT[4]||!!basePT[6]}],target?[target]:[]);
  }
  const animation=/^(.+?) becomes? (?:a |an )?(.+?) with base power and toughness (\d+)\/(\d+)(?: and gains? (.+?))?( in addition to its other types)?( until end of turn)?$/i.exec(baseWording);
  if(animation){
    const target=extensionTarget(animation[1]),own=new RegExp('^'+self+'$','i').test(animation[1]),filters=target||own?null:groupSelectors(animation[1]),words=animation[2].split(' ').filter(word=>word!=='and');
    const colors=words.filter(word=>['white','blue','black','red','green','colorless'].includes(word)),main=words.filter(word=>['artifact','enchantment','creature','creatures'].includes(word));
    const subs=words.filter(word=>!colors.includes(word)&&!main.includes(word)),keywords=animation[5]?helpers.keywordList(animation[5]):[];
    if((target?.zone==='battlefield'||own||filters)&&subs.every(type=>ORACLE_SUBTYPES.has(type))&&keywords)return result([{action:'animate',...(target||own?{target:target?0:'self'}:{filters}),power:Number(animation[3]),toughness:Number(animation[4]),types:[...new Set([...main.map(word=>word[0].toUpperCase()+word.slice(1).replace(/s$/,'')),'Creature'])],subtypes:subs,keywords,colors:colors.length?colors.filter(color=>color!=='colorless').map(color=>({white:'W',blue:'U',black:'B',red:'R',green:'G'}[color])):null,retainTypes:!!animation[6]||main.includes('artifact')||!main.length,retainAllSubtypes:!!animation[6],replaceCreatureSubtypes:!animation[6]&&subs.length>0,temporary:!!animation[7]}],target?[target]:[]);
  }
  const deathExile=/^(.+)\. If (that creature(?: or planeswalker)?|the creature an opponent controls|a creature(?: an opponent controls)?|a creature dealt damage this way) would die this turn, exile it instead$/i.exec(text);
  if(deathExile){
    const body=helpers.effect(card,deathExile[1]+'.');
    if(body&&!body.optional){
      const noun=deathExile[2].toLowerCase();
      if(noun==='a creature dealt damage this way'){
        const damage=body.effects.filter(effect=>effect.action==='damage'||effect.action==='battlefield-group'&&effect.operation==='damage');
        if(damage.length)return result(body.effects.map(effect=>damage.includes(effect)?{...effect,exileDamagedThisTurn:true}:effect),body.targets);
      }else if(noun.startsWith('a creature'))return result([...body.effects,{action:'death-exile',scope:noun.includes('opponent')?'opponents':'all'}],body.targets);
      else{const index=noun==='the creature an opponent controls'?body.targets.findIndex(target=>target.controller==='opponent'):body.targets.length===1?0:-1;
        if(index>=0&&body.targets[index].zone==='battlefield')return result([...body.effects,{action:'death-exile',target:index}],body.targets);
      }
    }
    return null;
  }
  if(new RegExp('^exile '+self+'$','i').test(text)&&!/Instant|Sorcery/.test(card.type_line))return result([{action:'exile-source'}]);
  const unless=/^(.+?) unless (you|they|that player|its controller|that creature's controller|that spell's controller) (.+)$/i.exec(text);
  if(unless&&!/^counter /i.test(text)&&!/ unless |\. /.test(unless[3])){
    const cost=resolutionPayment(unless[3]),body=cost&&helpers.effect(card,unless[1]+'.');
    if(body&&!body.optional){
      const targets=body.targets,actor=unless[2].toLowerCase(),playerTarget=targets.length===1&&['player','opponent'].includes(targets[0].what);
      const group=!targets.length&&/^each (opponent|player) /i.exec(unless[1]);
      const who=group&&['they','that player'].includes(actor)?'each-'+group[1].toLowerCase():actor==='you'?'you':playerTarget?0:actor.includes('controller')&&targets.length===1?{kind:'target-controller',index:0}:targets.length===0&&['they','that player'].includes(actor)?'event-player':null;
      if(who!==null)return result([{action:'unless-cost',who,payment:cost,effects:body.effects}],targets);
    }
  }
  const statWording=text.replace(/^(double|triple|switch) (.+?)'s (power and toughness|power|toughness) until end of turn$/i,'$1 the $3 of $2 until end of turn').replace(/^(double|triple|switch) its (power and toughness|power|toughness) until end of turn$/i,'$1 the $2 of it until end of turn');
  if(statWording!==text)return helpers.effect(card,statWording+'.');
  const alter=/^(double|triple|switch) the (power and toughness|power|toughness) of (.+?) until end of turn$/i.exec(text);
  if(alter&&!(alter[1].toLowerCase()==='switch'&&alter[2]!=='power and toughness')){
    const phrase=alter[3].replace(/^each of (any number of target )/i,'$1'),target=extensionTarget(phrase),own=new RegExp('^'+self+'$','i').test(phrase),filters=target||own?null:groupSelectors(phrase);
    if(target?.zone==='battlefield'||own||filters)return result([{action:alter[1].toLowerCase()==='switch'?'switch-pt':'scale-pt',...(target||own?{target:target?0:'self'}:{filters}),factor:alter[1].toLowerCase()==='triple'?3:2,power:alter[2].includes('power'),toughness:alter[2].includes('toughness')}],target?[target]:[]);
  }
  const doubledCounters=/^double the number of (each kind of counter|\+1\/\+1 counters|[a-z]+ counters) on (.+)$/i.exec(text);
  if(doubledCounters){const target=extensionTarget(doubledCounters[2]),own=new RegExp('^'+self+'$','i').test(doubledCounters[2]),filters=target||own?null:groupSelectors(doubledCounters[2]);if(target?.zone==='battlefield'||own||filters)return result([{action:'double-counters',counter:doubledCounters[1]==='each kind of counter'?'all':doubledCounters[1].replace(/ counters$/,''),...(target||own?{target:target?0:'self'}:{filters})}],target?[target]:[]);}
  const wheel=new RegExp('^(each player|each opponent|target player|target opponent|that player|you) discards? (?:all the cards in |all cards in )?(?:their|your) hand,? then draws? (that many|'+NUM+') cards$','i').exec(text);
  if(wheel){const actor=wheel[1].toLowerCase(),targeted=actor.startsWith('target ');return result([{action:'discard-hand-draw',who:targeted?0:actor==='that player'?'event-player':actor.replace(' ','-'),n:wheel[2].toLowerCase()==='that many'?'discarded':amount(wheel[2])}],targeted?[extensionTarget(actor)]:[]);}
  if(/^discard your hand,? then draw /i.test(text))return helpers.effect(card,'You '+text[0].toLowerCase()+text.slice(1)+'.');
  const have=/^have (it|this creature|target .+?) (deal|gain|lose|get) (.+)$/i.exec(text);
  if(optional&&have){const body=helpers.effect(card,have[1]+' '+have[2]+'s '+have[3]+'.');if(body&&!body.optional)return {...body,optional:true};}
  const revealed=/^target (opponent|player) reveals their hand\. You choose (?:a|an) (.+?) from it\. That player (discards that card|exiles that card|shuffles that card into their library)(?:\. (.+))?$/i.exec(text)
    ||/^target (opponent|player) reveals their hand\. You choose (?:a|an) (.+?) from it and (exile that card)(?:\. (.+))?$/i.exec(text);
  if(revealed){const filter=searchFilter(revealed[2].replace(/ card$/,''));if(filter){
    const body=result([{action:'reveal-hand-discard',target:0,what:'card',filter,destination:revealed[3].startsWith('discard')?'graveyard':revealed[3].startsWith('shuffle')?'library':'exile'}],[extensionTarget('target '+revealed[1])]);
    if(!revealed[4])return body;
    const tail=helpers.effect(card,revealed[4]+'.');
    if(tail&&!tail.optional&&!tail.targets.length&&!JSON.stringify(tail).includes('event-'))return {...body,effects:[...body.effects,...tail.effects]};
  }}
  m=new RegExp('^return this card from your graveyard to (your hand|the battlefield)( tapped)?(?: with ('+NUM+') (?:additional )?\\+1/\\+1 counters? on it)?$','i').exec(text);
  if(m&&!(m[1]==='your hand'&&(m[2]||m[3])))return result([{action:'return-grave-source',destination:m[1]==='your hand'?'hand':'battlefield',tapped:!!m[2],...(m[3]?{additionalCounters:{'+1/+1':amount(m[3])}}:{})}]);
  if(/Instant|Sorcery/.test(card.type_line)&&new RegExp('^exile '+selfPattern(card)+'$','i').test(text))return result([{action:'exile-resolving-spell'}]);
  if(/ until end of combat$/i.test(text)){
    const body=helpers.effect(card,text.replace(/ until end of combat$/i,' until end of turn')+'.');
    if(body&&body.effects.every(effect=>['pump','pump-group','battlefield-group','cant-block-until-eot','unblockable-until-eot'].includes(effect.action)))return {...body,effects:body.effects.map(effect=>({...effect,duration:'combat'}))};
  }
  const targetRange=/\b(any number of |one or two |one, two, or three )(other )?target ([^.]+?)(?= to | get | gets | gain | gains | until |$)/i.exec(text);
  if(targetRange&&((text.match(/\btarget\b/g)||[]).length===1)){
    const target=extensionTarget(targetRange[0]);
    if(target){const reduced=targetRange[0].replace(targetRange[1],targetRange[2]?'another ':'').replace(/other target/,'target').replace(/\b(creatures|artifacts|enchantments|lands|permanents|planeswalkers|cards|spells)\b/g,word=>word.slice(0,-1));const body=helpers.effect(card,text.replace(targetRange[0],reduced).replace(/to their owners' hands|to their owner's hand/g,"to its owner's hand").replace(/ each (get|gain) /g,' $1s ')+'.');if(body?.targets.length===1)return {...body,targets:[target]};}
  }
  const restricted=/^(add .+)\. Spend this mana only to (?:cast (?:a|an) (.+? spell)( or activate an ability)?|activate abilities)$/i.exec(text);
  if(restricted&&!/Instant|Sorcery/.test(card.type_line)){
    const body=helpers.effect(card,restricted[1]+'.'),filter=restricted[2]?extensionTarget('target '+restricted[2]):null;
    if(body?.effects.length===1&&body.effects[0].action==='add-mana'&&(!restricted[2]||filter?.zone==='stack'))return result([{...body.effects[0],restriction:{...(filter?{spell:filter}:{}),abilities:!restricted[2]||!!restricted[3]}}]);
  }
  m=/^(?:its|that (?:card|creature|artifact|enchantment|land|permanent|spell)'s) (owner|controller) creates (.+)$/i.exec(text);
  if(m){const body=helpers.effect(card,'Create '+m[2]+'.');if(body&&!body.optional&&body.effects.length===1&&['token-inline','token-key'].includes(body.effects[0].action))return result([{...body.effects[0],who:'event-card-'+m[1].toLowerCase()}]);}
  m=/^(you|target player|target opponent|each player|each opponent) (draws? cards|gains? life|loses? life|mills? cards) equal to (.+)$/i.exec(text);
  if(m){const value=extensionValue(m[3]),actor=m[1].toLowerCase(),targeted=actor.startsWith('target ');if(value)return result([{action:m[2].startsWith('draw')?'draw':m[2].startsWith('gain')?'gain-life':m[2].startsWith('lose')?'lose-life':'mill',who:targeted?0:actor.replace(' ','-'),n:value}],targeted?[extensionTarget(actor)]:[]);}
  m=/^draw cards equal to (.+)$/i.exec(text);
  if(m){const value=extensionValue(m[1]);if(value)return result([{action:'draw',who:'you',n:value}]);}
  m=new RegExp('^create ('+NUM+') (tapped )?(Lander|Mutagen) tokens?$','i').exec(text);
  if(m){const lander=m[3].toLowerCase()==='lander',name=lander?'Lander':'Mutagen';
    const operation={kind:'generic-ability',cost:{mana:lander?'{2}':'{1}',tap:true,sacSelf:true},sorceryOnly:!lander,targets:lander?[]:[extensionTarget('target creature')],effects:lander?[{action:'search-library',what:'basic land',maxMv:null,n:1,destination:'battlefield',tapped:true,reveal:false}]:[{action:'counter',target:0,counter:'+1/+1',n:1}],contract:'generic-activated-effect'};
    return result([{action:'token-inline',who:'you',n:amount(m[1]),tapped:!!m[2],token:{name,types:['Artifact'],subtypes:[name],colors:[],keywords:[],oracle:lander?'{2}, {T}, Sacrifice this token: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.':'{1}, {T}, Sacrifice this token: Put a +1/+1 counter on target creature. Activate only as a sorcery.',operations:[operation]}}]);
  }
  m=/^(target player|target opponent|each player|each opponent) creates (.+)$/i.exec(text);
  if(m){const body=helpers.effect(card,'Create '+m[2]+'.');if(body&&!body.optional&&!body.targets.length&&body.effects.every(effect=>['token-inline','token-key'].includes(effect.action))){const actor=m[1].toLowerCase(),targeted=actor.startsWith('target ');return result(body.effects.map(effect=>({...effect,who:targeted?0:actor.replace(' ','-')})),targeted?[extensionTarget(actor)]:[]);}}
  const playerSequence=/^(target player|target opponent|each player|each opponent|that player|you) (.+)$/i.exec(text);
  if(playerSequence){
    const parts=playerSequence[2].split(/,? (?:and|then) |, /),atom=new RegExp('^(draws?|gains?|loses?|mills?|discards?) ('+NUM+'|X) (cards?|life)$','i');
    if(parts.length>1){const parsed=parts.map(part=>atom.exec(part));if(parsed.every(Boolean)&&parsed.every(row=>/^(gain|lose)/i.test(row[1])===(row[3].toLowerCase()==='life'))){
      const actor=playerSequence[1].toLowerCase(),targeted=actor.startsWith('target '),who=targeted?0:actor==='that player'?'event-player':actor.replace(' ','-');
      return result(parsed.map(row=>({action:({draw:'draw',gain:'gain-life',lose:'lose-life',mill:'mill',discard:'discard'})[row[1].toLowerCase().replace(/s$/,'')],who,n:row[2]==='X'?'X':amount(row[2])})),targeted?[extensionTarget(actor)]:[]);
    }}
  }
  const prevention=preventionOperation(card,text,true);
  if(prevention){const {targetSpec,...effect}=prevention;return result([effect],targetSpec?[targetSpec]:[]);}
  const counterExile=/^(counter .+)\. If that spell is countered this way, exile it instead of putting it into its owner's graveyard$/i.exec(text);
  if(counterExile){const body=helpers.effect(card,counterExile[1]+'.');if(body&&!body.optional&&body.effects.length===1&&body.effects[0].action==='counter-spell')return {...body,effects:[{...body.effects[0],toZone:'exile'}]};}
  m=/^counter (target (?:.+ )?spell) unless its controller pays \{(X|\d+)\}(?: for each (.+))?$/i.exec(text);
  if(m){const target=extensionTarget(m[1]),count=m[3]&&extensionCount(m[3]);if(target?.zone==='stack'&&(!m[3]||count)&&!(count&&m[2]==='X'))return result([{action:'counter-spell',target:0,unlessGeneric:count?{...count,multiply:Number(m[2])}:m[2]==='X'?'X':Number(m[2])}],[target]);}
  m=new RegExp('^exile (.+?)(?:, then return|\\. Return) (?:it|that card|those cards|the exiled card|the exiled cards) to the battlefield( tapped)? under (its owner\'s|their owner\'s|their owners\'|your) control(?: with (?:a|an) (\\+1/\\+1|flying|vigilance|lifelink) counter on it)?( at the beginning of the next end step)?$','i').exec(text);
  if(m){const target=extensionTarget(m[1]),selfReference=new RegExp('^'+self+'$','i').test(m[1]);if(target?.zone==='battlefield'||selfReference)return result([{action:'blink',target:target?0:'self',tapped:!!m[2],controller:m[3]==='your'?'you':'owner',delayed:!!m[5],...(m[4]?{additionalCounters:{[m[4]]:1}}:{})}],target?[target]:[]);}
  m=/^exile (.+?)\. At the beginning of the next end step, return (?:it|that card) to the battlefield( tapped)? under (its owner's|your) control(?: with (?:a|an) (\+1\/\+1|flying|vigilance|lifelink) counter on it)?$/i.exec(text);
  if(m){const target=extensionTarget(m[1]);if(target?.zone==='battlefield')return result([{action:'blink',target:0,tapped:!!m[2],controller:m[3]==='your'?'you':'owner',delayed:true,...(m[4]?{additionalCounters:{[m[4]]:1}}:{})}],[target]);}
  m=new RegExp('^'+self+' deals ('+NUM+') damage to that creature(?: and ('+NUM+') damage to that creature\\\'s controller)?$','i').exec(text);
  if(m)return result([{action:'damage',target:'event-card',n:amount(m[1])},...(m[2]?[{action:'damage',target:'event-card-controller',n:amount(m[2])}]:[])]);
  // A replacement instruction selects one complete outcome. It must not
  // execute the ordinary effect before evaluating its "instead" condition.
  const replacement=/^([^.!?]+)\. If ([^,]+), ([^.!?]+) instead$/i.exec(text);
  if(replacement){
    const condition=extensionCondition(replacement[2]),base=helpers.effect(card,replacement[1]+'.');
    const supported=['creature-died','monarch','life','graveyard-count','graveyard-types','turn-stat','source-quality','permanent-count','has-permanent'];
    if(condition&&supported.includes(condition.kind)&&base&&!base.optional&&base.effects.length===1&&!base.effects[0].effects){
      const original=base.effects[0];let alternative=helpers.effect(card,replacement[3]+'.');
      const damage=new RegExp('^'+self+' deals ('+NUM+'|X) damage(?: to (?:it|that creature|that permanent|that creature or planeswalker))?$','i').exec(replacement[3]);
      if(original.action==='damage'&&damage)alternative={targets:[],effects:[{...original,n:damage[1]==='X'?'X':amount(damage[1])}]};
      if(alternative&&!alternative.optional&&alternative.effects.length===1&&!alternative.effects[0].effects){
        const sameTargets=JSON.stringify(alternative.targets)===JSON.stringify(base.targets);
        const pronoun=/\b(?:it|that creature|that permanent|that artifact|that enchantment|that land)\b/i.test(replacement[3])&&!/\bthis (?:creature|permanent|artifact|enchantment|land)\b/i.test(replacement[3]);
        if(sameTargets||!alternative.targets.length){
          const changed={...alternative.effects[0]};
          if(!sameTargets&&pronoun&&typeof original.target==='number'&&['self','event-card'].includes(changed.target))changed.target=original.target;
          if(changed.target==='event-card')return null;
          const targetCondition=typeof original.target==='number'&&/^(?:it |it's |that (?:creature|permanent|artifact|enchantment|land) )/.test(replacement[2]);
          return result([{action:'conditional',condition,...(targetCondition?{conditionTarget:original.target}:{}),effects:[changed],elseEffects:base.effects}],base.targets);
        }
      }
    }
  }
  m=/^((?:another |up to one )?target .+?) deals damage equal to (twice )?its (power|toughness) to (.+)$/i.exec(text);
  if(m){const source=extensionTarget(m[1]),recipient=extensionTarget(m[4]);if(source?.zone==='battlefield'&&source.what==='creature'&&recipient&&['battlefield','player',undefined].includes(recipient.zone)){if(/\b(?:another|other) target\b/.test(m[4])){delete recipient.excludeSelf;recipient.differentFromPrevious=true;}return result([{action:'bite',target:0,otherTarget:1,stat:m[3].toLowerCase(),multiplier:m[2]?2:1}],[source,recipient]);}}
  if(/\b(?:it|that creature|that artifact|that permanent) also (?:gains|gets)\b/i.test(text)){
    const body=helpers.effect(card,text.replace(/\b(it|that creature|that artifact|that permanent) also (gains|gets)\b/gi,'$1 $2')+'.');if(body)return {...body,optional:optional||body.optional};
  }
  const goad=/^(goad|suspect) (.+)$/i.exec(text);
  if(goad){const target=extensionTarget(goad[2]),filters=target?null:groupSelectors(goad[2]);if(target?.zone==='battlefield'||filters)return result([{action:goad[1].toLowerCase(),...(target?{target:0}:{filters})}],target?[target]:[]);}
  const reflexive=/^(.+?)\. When you do, (.+)$/.exec(text);
  if(optional&&reflexive){
    let cost=null,match;
    if((match=/^pay ((?:\{(?:\d+|[WUBRGC])\})+)$/.exec(reflexive[1])))cost={mana:match[1]};
    else if((match=new RegExp('^pay ('+NUM+') life$').exec(reflexive[1])))cost={life:amount(match[1])};
    else if((match=/^sacrifice (another|a|an) (.+)$/.exec(reflexive[1]))){const filter=extensionTarget((match[1]==='another'?'another ':'')+'target '+match[2]);if(filter?.zone==='battlefield')cost={zone:'battlefield',action:'sacrifice',filter,n:1};}
    else if((match=new RegExp('^discard ('+NUM+') (cards?|.+? cards?)$').exec(reflexive[1]))){const filter=searchFilter(match[2].replace(/^cards?$/,'card').replace(/ cards?$/,''));if(filter)cost={zone:'hand',action:'discard',filter,n:amount(match[1])};}
    else if((match=new RegExp('^exile ('+NUM+') (.+?) from your graveyard$').exec(reflexive[1]))){const filter=searchFilter(match[2].replace(/^cards?$/,'card').replace(/ cards?$/,''));if(filter)cost={zone:'graveyard',action:'exile',filter,n:amount(match[1])};}
    const body=cost&&helpers.effect(card,reflexive[2]+'.');
    if(body&&!JSON.stringify(body).includes('reflexive-cost'))return {optional:false,targets:[],effects:[{action:'reflexive-cost',cost,reflexiveBody:body}]};
  }
  // Equivalent Oracle phrasing with the same complete effect and selectors.
  const normalized=text.replace(/^Until end of turn, (.+)$/i,'$1 until end of turn')
    .replace(/, reveal that card, put it into your hand, then shuffle$/i,', reveal it, put it into your hand, then shuffle')
    .replace(/ on each of ((?:up to )?(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+) (?:other )?target )/i,' on $1');
  if(normalized!==text){const body=helpers.effect(card,normalized+'.');if(body)return {...body,optional:optional||body.optional};}
  m=new RegExp('^put ('+NUM+') (\\+1/\\+1|-1/-1|flying|first strike|double strike|deathtouch|lifelink|trample|vigilance|menace|reach|hexproof|indestructible|shield|stun|charge) counters? on (.+)$','i').exec(text);
  if(m){const target=extensionTarget(m[3]);if(target?.zone==='battlefield')return result([{action:'counter',target:0,n:amount(m[1]),counter:m[2]}],[target]);}
  m=/^return (.+?) to (your hand|their owners' hands|its owner's hand|the battlefield(?: tapped)?(?: under your control)?)$/i.exec(text);
  if(m){const target=extensionTarget(m[1]);if(target&&(m[2].includes('battlefield')?target.zone==='graveyard':true))return result([{action:m[2].includes('battlefield')?'reanimate':target.zone==='graveyard'?'move-to-hand':'bounce',target:0,...(m[2].includes('battlefield')?{tapped:m[2].includes('tapped'),controller:m[2].includes('your control')?'you':'owner'}:{})}],[target]);}
  m=new RegExp('^search your library for (?:up to )?('+NUM+') (.+?) cards, (reveal them, put them into your hand|put them onto the battlefield(?: tapped)?), then shuffle$','i').exec(text);
  if(m){const filter=searchFilter(m[2]);if(filter)return result([{action:'search-library',what:'card',filter,n:amount(m[1]),maxMv:null,destination:m[3].includes('hand')?'hand':'battlefield',tapped:m[3].endsWith(' tapped'),reveal:m[3].startsWith('reveal')}]);}
  m=new RegExp('^search your library for up to ('+NUM+') cards named ([^.]+?), reveal them, put them into your hand, then shuffle$','i').exec(text);
  if(m&&!/ or | and /.test(m[2]))return result([{action:'search-library',what:'card',name:m[2],n:amount(m[1]),maxMv:null,destination:'hand',reveal:true}]);
  m=new RegExp('^(look at|reveal) the top ('+NUM+') cards of your library\\. You may reveal (?:a|an) (.+?) card from among them and put it into your hand\\. Put the rest(?: of the cards)? (on the bottom of your library in (any|a random) order|into your graveyard)$','i').exec(text);
  if(m){const filter=searchFilter(m[3]);if(filter)return result([{action:'look-select',n:amount(m[2]),what:'card',filter,max:1,reveal:true,revealAll:m[1].toLowerCase()==='reveal',rest:m[4].includes('graveyard')?'graveyard':'bottom',random:m[5]==='a random'}]);}
  // Copy exceptions change copiable values. Later grants and delayed
  // instructions remain separate effects on the particular created objects.
  if(/^create /i.test(text)&&/ (?:a copy|copies) of /i.test(text)){
    let body=text,delayed=null,haste=false;
    const ending=/\. (Exile|Sacrifice) (?:it|them|that token|those tokens) at the beginning of the next end step$/i.exec(body);
    if(ending){delayed=ending[1].toLowerCase();body=body.slice(0,ending.index);}
    const grant=/\. (?:That token|Those tokens|It|They) gains? haste$/i.exec(body);
    if(grant){haste=true;body=body.slice(0,grant.index);}
    const head=new RegExp('^create ('+NUM+'|X) tokens? that(?:\\\'s| are) (?:a copy|copies) of ('+self+'|(?:another |up to one )?target .+?)(?:, except (.+))?$','i').exec(body);
    if(head){
      const target=extensionTarget(head[2]),exception=head[3];let nonlegendary=false,modPT,copyKeywords=[];
      const pt=exception&&/^(?:it is|it's|they are|they're) (?:a |each )?(\d+)\/(\d+)$/.exec(exception);
      if(pt)modPT=[Number(pt[1]),Number(pt[2])];
      else if(exception){const nonlegend=/^(?:it isn't|they aren't) legendary(?: and (?:it has|they have) (.+))?$/.exec(exception),kw=/^(?:it has|they have) (.+)$/.exec(exception);if(nonlegend){nonlegendary=true;copyKeywords=nonlegend[1]?helpers.keywordList(nonlegend[1]):[];}else if(kw)copyKeywords=helpers.keywordList(kw[1]);else copyKeywords=null;}
      const permanentTarget=target&&(target.zone==='battlefield'||target.zone==='graveyard'&&['creature','artifact','enchantment','land','planeswalker','permanent','nonland permanent'].includes(target.what));
      if(copyKeywords&&(permanentTarget||new RegExp('^'+self+'$','i').test(head[2])))return result([{action:'copy-token',target:target?0:'self',n:head[1]==='X'?'X':amount(head[1]),nonlegendary,...(modPT?{modPT}:{}),...(copyKeywords.length?{copyKeywords}:{}),...(haste?{haste:true}:{}),...(delayed?{delayed}:{})}],target?[target]:[]);
    }
  }
  m=new RegExp('^have ('+self+') deal (.+)$','i').exec(text);
  if(optional&&m){const body=helpers.effect(card,m[1]+' deals '+m[2]+'.');if(body&&!body.optional)return {...body,optional:true};}
  m=/^(create .+?\d+\/\d+ (?:(?:white|blue|black|red|green|colorless)(?: and |, )?)+ )([A-Z][a-zA-Z -]+?) (artifact|enchantment) creature (tokens?(?: with .+)?)$/i.exec(text);
  if(m&&m[2].split(' ').every(type=>ORACLE_SUBTYPES.has(type))){const body=helpers.effect(card,m[1]+m[3]+' '+m[2]+' creature '+m[4]+'.');if(body)return {...body,optional};}
  // The same closed target/group filters apply to pumps and keyword grants.
  // Preserve "another", colors, subtypes and controller restrictions.
  m=/^(.+?) (?:gets? (?:an additional )?([+-]\d+)\/([+-]\d+)(?: and gains? (.+?))?|gains? (.+?)) until end of turn$/i.exec(text);
  if(m){const target=extensionTarget(m[1]),filters=target?null:groupSelectors(m[1]),keywords=m[4]||m[5]?helpers.keywordList(m[4]||m[5]):[];if((target?.zone==='battlefield'||filters)&&keywords)return result([{action:target?'pump':'battlefield-group',...(target?{target:0}:{operation:'pump',filters}),power:Number(m[2]||0),toughness:Number(m[3]||0),keywords}],target?[target]:[]);}
  m=/^put ((?:another |up to one )?target .+?) onto the battlefield( tapped)?(?: under (your|its owner's) control)?$/i.exec(text);
  if(m){const target=extensionTarget(m[1]);if(target?.zone==='graveyard')return result([{action:'reanimate',target:0,tapped:!!m[2],controller:m[3]==='your'?'you':'owner'}],[target]);}
  m=new RegExp('^('+self+'|(?:another |up to one )?target .+?) fights ((?:another |up to one )?target .+)$','i').exec(text);
  if(m){const first=extensionTarget(m[1]),second=extensionTarget(m[2]);if((first?.what==='creature'||new RegExp('^'+self+'$','i').test(m[1]))&&second?.what==='creature'&&second.zone==='battlefield')return result([{action:'fight',target:first?0:'self',otherTarget:first?1:0}],first?[first,second]:[second]);}
  m=/^populate(?: (X|\d+) times)?$/i.exec(text);
  if(m)return result([{action:'populate',n:m[1]==='X'?'X':Number(m[1]||1)}]);
  m=/^bolster (X|\d+)$/i.exec(text);
  if(m)return result([{action:'bolster',n:m[1]==='X'?'X':Number(m[1])}]);
  m=/^support (\d+)$/i.exec(text);
  if(m)return result([{action:'counter',target:0,counter:'+1/+1',n:1}],[{what:'creature',zone:'battlefield',controller:'any',excludeSelf:true,min:0,max:Number(m[1])}]);
  if(/^manifest dread$/i.test(text))return result([{action:'face-down',kind:'manifest-dread',who:'you',n:1}]);
  m=new RegExp('^(manifest|cloak) the top (card|('+NUM+') cards) of your library$','i').exec(text);
  if(m)return result([{action:'face-down',kind:m[1].toLowerCase(),who:'you',n:m[3]?amount(m[3]):1}]);
  const grant=/^(?:Until end of turn, )?(.+?) gains? (?:(.*?) and )?"([^\"]+)"(?: until end of turn)?$/i.exec(text);
  if(grant&&(/^Until end of turn, /i.test(text)||/ until end of turn$/i.test(text))){
    const target=extensionTarget(grant[1]),filters=target?null:groupSelectors(grant[1]),keywords=grant[2]?helpers.keywordList(grant[2]):[];
    const child=grantedOperation(extensionLine({...card,name:'__GrantedPermanent__'},grant[3].replace(/\.?$/,'.'),{...helpers,cost:text=>extensionCost(text)||(/^(?:\{(?:\d+|[WUBRGC])\},? ?|\{T\},? ?)+$/.test(text)?{...(text.includes('{T}')?{tap:true}:{}),...(text.replace(/\{T\}|,| /g,'')?{mana:text.replace(/\{T\}|,| /g,'')}:{} )}:null)}));
    if((target?.zone==='battlefield'||filters)&&keywords&&child&&['generic-trigger','generic-ability','mana-source'].includes(child.kind)&&!child.from&&!child.v4Body&&!child.condition&&!child.activationCondition&&!Array.isArray(child.event)&&Object.keys(child.cost||{}).every(key=>['mana','tap','sacSelf'].includes(key)))return result([{action:'grant-operation',...(target?{target:0}:{filters}),operation:child,keywords}],target?[target]:[]);
  }
  m=/^create a number of (.+?) tokens? equal to (.+)$/i.exec(text);
  if(m){const n=extensionValue(m[2]),body=n&&helpers.effect(card,'Create a '+m[1]+' token.');if(body?.effects.length===1&&body.effects[0].action==='token-inline')return result([{...body.effects[0],n}]);}
  m=/^(scry|surveil) X$/i.exec(text);
  if(m)return result([{action:m[1].toLowerCase(),who:'you',n:'X'}]);
  m=/^(.+?) if (.+)$/i.exec(text);
  if(m&&!/^if /i.test(text)&&!m[1].includes('.')){const condition=extensionCondition(m[2]),body=condition&&helpers.effect(card,m[1]+'.');if(body&&!body.optional){const refers=body.targets.length===1&&/^it(?: is|'s) /i.test(m[2]);return result([{action:'conditional',condition,...(refers?{conditionTarget:0}:{}),effects:body.effects}],body.targets);}}
  m=/^counter (target .+? spell)\. If that spell is countered this way, exile it instead of putting it into its owner's graveyard$/i.exec(text);
  if(m){const target=extensionTarget(m[1]);if(target?.zone==='stack')return result([{action:'counter-spell',target:0,toZone:'exile'}],[target]);}
  const quoted=/^(create .+? creature tokens?)(?: with (.*?)|\. (?:It has|They have) (.*?))"([^"]+)"$/i.exec(text);
  if(quoted){
    const prefix=(quoted[2]||quoted[3]||'').replace(/,? and $|, $/,'').trim();
    const base=helpers.effect(card,quoted[1]+(prefix?' with '+prefix:'')+'.');
    if(base?.effects.length===1&&base.effects[0].action==='token-inline'){
      const token=base.effects[0].token,tokenCard={name:'__OracleToken__',type_line:token.types.join(' ')+' — '+token.subtypes.join(' '),mana_cost:''};
      const rule=quoted[4].replace(/this token/gi,'this creature'),complete=rule.endsWith('.')?rule:rule+'.';
      const cost=text=>extensionCost(text)||(/^(?:\{(?:\d+|[WUBRGC])\},? ?|\{T\},? ?)+$/.test(text)?{...(text.includes('{T}')?{tap:true}:{}),...(text.replace(/\{T\}|,| /g,'')?{mana:text.replace(/\{T\}|,| /g,'')}:{} )}:null);
      let operation=complete==="This creature can't block."?{kind:'generic-static',scope:'self',cantBlock:true,contract:'generic-continuous-effect'}:extensionLine(tokenCard,complete,{...helpers,cost});
      if(operation)operation=normalizeManaOperations([operation])[0];
      const allowed=operation&&(operation.kind==='mana-source'||operation.kind==='generic-ability'&&!operation.activationCondition&&Object.keys(operation.cost).every(key=>['tap','mana'].includes(key))&&operation.effects.every(effect=>['pump','draw','gain-life','counter'].includes(effect.action))||operation.kind==='generic-static'&&(operation.cantBlock||operation.unblockable||operation.blockOnlyFlying)||operation.kind==='generic-trigger'&&['dies','castNonCreature','landfall','endStep'].includes(operation.event)&&!operation.targets.length&&!operation.condition&&operation.effects.every(effect=>(['gain-life','draw','counter','pump','token-inline'].includes(effect.action)||effect.action==='damage'&&effect.target==='each-opponent')&&!effect.token?.operations));
      if(allowed)return {...base,optional,effects:[{...base.effects[0],token:{...token,oracle:quoted[4],operations:[operation]}}]};
    }
    return null;
  }
  m=/^search your library for (?:a|an) (.+?), (reveal it, put it into your hand|put it into your hand|put it onto the battlefield(?: tapped)?), then shuffle$/i.exec(text);
  if(m){const filter=searchFilter(m[1].replace(/ card$/,''));if(filter)return result([{action:'search-library',what:'card',filter,n:1,maxMv:null,destination:m[2].includes('hand')?'hand':'battlefield',tapped:m[2].endsWith(' tapped'),reveal:m[2].startsWith('reveal')}]);}
  m=new RegExp('^look at the top ('+NUM+') cards of your library\\. Put any number of (.+?) cards from among them onto the battlefield and the rest into your hand$','i').exec(text);
  if(m){const filter=searchFilter(m[2]);if(filter)return result([{action:'look-select',n:amount(m[1]),what:'card',filter,max:'all',destination:'battlefield',rest:'hand'}]);}
  m=new RegExp('^look at the top ('+NUM+') cards of your library\\. Put any number of (.+?) cards onto the battlefield and the rest into your hand$','i').exec(text);
  if(m){const filter=searchFilter(m[2]);if(filter)return result([{action:'look-select',n:amount(m[1]),what:'card',filter,max:'all',destination:'battlefield',rest:'hand'}]);}
  m=/^look at the top two cards of your library\. Put one of them into your hand and the other on the bottom of your library$/i.exec(text);
  if(m)return result([{action:'look-select',n:2,what:'card',required:true,rest:'bottom',random:false}]);
  m=new RegExp('^(look at|reveal) the top ('+NUM+') cards of your library\\. (You may put |Put )(a|an|any number of) (.+?) cards? from among them (into your hand|onto the battlefield(?: tapped)?)\\. Put the rest(?: of the cards)? (on the bottom of your library in (any|a random) order|into your graveyard|into your hand)$','i').exec(text);
  if(m){const filter=searchFilter(m[5]);if(filter)return result([{action:'look-select',n:amount(m[2]),what:'card',filter,max:m[4]==='any number of'?'all':1,required:m[3]==='Put '&&m[4]!=='any number of',destination:m[6].includes('hand')?'hand':'battlefield',tapped:m[6].endsWith(' tapped'),revealAll:m[1].toLowerCase()==='reveal',rest:m[7].includes('graveyard')?'graveyard':m[7].includes('hand')?'hand':'bottom',random:m[8]==='a random'}]);}
  m=new RegExp('^return (all|up to '+NUM+'|'+NUM+') (.+?) cards? from your graveyard to (your hand|the battlefield(?: tapped)?)$','i').exec(text);
  if(m){const filter=extensionTarget('target '+m[2]+' card from your graveyard');if(filter)return result([{action:'zone-select',who:'you',zone:'graveyard',filter,n:m[1]==='all'?'all':amount(m[1].replace(/^up to /,'')),upTo:m[1].startsWith('up to '),destination:m[3]==='your hand'?'hand':'battlefield',tapped:m[3].endsWith(' tapped')}]);}
  m=new RegExp('^(each player|each opponent|target player|target opponent) (?:returns|puts) (all|'+NUM+') (.+?) cards? from their graveyard (?:to|onto) (?:the battlefield|their hand)( tapped)?$','i').exec(text);
  if(m){const filter=extensionTarget('target '+m[3]+' card from your graveyard'),targeted=m[1].startsWith('target');if(filter)return result([{action:'zone-select',who:targeted?0:m[1].toLowerCase().replace(' ','-'),zone:'graveyard',filter,n:m[2]==='all'?'all':amount(m[2]),destination:text.includes('their hand')?'hand':'battlefield',tapped:!!m[4]}],targeted?[extensionTarget(m[1])]:[]);}
  m=/^exile (all cards from |all )?(your graveyard|all graveyards|target player's graveyard|target opponent's graveyard)$/i.exec(text);
  if(m){const target=m[2].startsWith('target'),who=m[2]==='your graveyard'?'you':m[2]==='all graveyards'?'each-player':0;return result([{action:'zone-select',zone:'graveyard',who,filter:{what:'card',zone:'graveyard',controller:'you',min:1},n:'all',destination:'exile'}],target?[extensionTarget(m[2].includes('opponent')?'target opponent':'target player')]:[]);}
  m=new RegExp('^add ('+NUM+') mana of any (one )?color$','i').exec(text);
  if(m){const n=amount(m[1]);return result([m[2]||n===1?{action:'add-mana',choices:['W','U','B','R','G'].map(color=>({[color]:n}))}:{action:'add-mana',produce:{ANY:true,n}}]);}
  m=/^add ((?:\{[WUBRGC]\})(?:(?:, |, or | or )\{[WUBRGC]\})+)$/i.exec(text);
  if(m)return result([{action:'add-mana',choices:m[1].match(/\{[WUBRGC]\}/g).map(symbol=>({[symbol[1]]:1}))}]);
  if(/^then /i.test(text))return helpers.effect(card,text.slice(5)+'.');
  m=/^(destroy|exile|tap|untap|regenerate) ((?:(?:another |up to one )?target .+?)(?:,? and (?:up to one other |another |up to one )?target .+)+)$/i.exec(text);
  if(m){const targets=m[2].split(/,? and (?=(?:up to one other |another |up to one )?target )/i).map(extensionTarget);if(targets.every(Boolean))return result(targets.map((_,target)=>({action:m[1].toLowerCase(),target})),targets);}
  m=/^(regenerate) (each .+)$/i.exec(text);
  if(m){const filters=groupSelectors(m[2]);if(filters)return result([{action:'battlefield-group',operation:'regenerate',filters}]);}
  m=/^(.+?) gets ([+-]\d+)\/([+-]\d+) until end of turn and (?:gains (.+?) until end of turn|can't (block|be blocked) this turn)$/i.exec(text);
  if(m){const head=helpers.effect(card,m[1]+' gets '+m[2]+'/'+m[3]+' until end of turn.'),tail=m[4]?helpers.effect(card,'It gains '+m[4]+' until end of turn.'):helpers.effect(card,"It can't "+m[5]+' this turn.');if(head&&tail&&head.effects.length===1&&head.effects[0].action==='pump'&&tail.effects.every(e=>e.target==='self'))return {...head,effects:[...head.effects,...tail.effects.map(e=>({...e,target:head.effects[0].target}))]};}
  m=/^(.+?) gains (.+?) until end of turn and can't (block|be blocked) this turn$/i.exec(text);
  if(m){const head=helpers.effect(card,m[1]+' gains '+m[2]+' until end of turn.');if(head&&head.effects.length===1&&head.effects[0].action==='pump')return {...head,effects:[...head.effects,{action:m[3]==='block'?'cant-block-until-eot':'unblockable-until-eot',target:head.effects[0].target}]};}
  m=new RegExp('^create (a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+) (?:X/X) (.+)$','i').exec(text);
  if(m){const body=helpers.effect(card,'Create '+m[1]+' 1/1 '+m[2]+'.');if(body?.effects.length===1&&body.effects[0].action==='token-inline')return {...body,effects:[{...body.effects[0],token:{...body.effects[0].token,power:'X',toughness:'X'}}]};}
  m=/^look at the top (one|two|three|four|five|six|seven|eight|nine|ten|\d+) cards of your library\. Put one of them into your hand and the rest on the bottom of your library in a random order$/i.exec(text);
  if(m)return result([{action:'look-select',n:amount(m[1]),what:'card',required:true,rest:'bottom',random:true}]);
  m=/^search your library for (?:a|an) (.+?) card, reveal it, then shuffle and put that card on top$/i.exec(text);
  if(m&&extensionSearchType(m[1]))return result([{action:'search-library',what:extensionSearchType(m[1]),n:1,destination:'library-top',reveal:true}]);
  m=/^search your library for a card named ([^,]+?), (reveal it, )?put (?:it|that card) (into your hand|onto the battlefield(?: tapped)?), then shuffle$/i.exec(text);
  if(m&&!/ or | and |\. /.test(m[1]))return result([{action:'search-library',what:'card',name:m[1],n:1,destination:m[3].includes('hand')?'hand':'battlefield',tapped:m[3].includes('tapped'),reveal:!!m[2]}]);
  m=new RegExp('^tap or untap ('+self+'|(?:another |up to one )?target .+)$','i').exec(text);
  if(m){const target=extensionTarget(m[1]);if(target?.zone==='battlefield'||new RegExp('^'+self+'$','i').test(m[1]))return {targets:target?[target]:[],optional:false,effects:[{action:'tap-or-untap',target:target?0:'self',may:optional}]};}
  m=new RegExp('^put ('+NUM+') (flying|double strike|first strike|deathtouch|lifelink|trample|vigilance|menace|reach|hexproof|indestructible|stun|shield) counters? on ('+self+'|(?:up to one )?target .+)$','i').exec(text);
  if(m){const target=extensionTarget(m[3]);if(target?.zone==='battlefield'||new RegExp('^'+self+'$','i').test(m[3]))return result([{action:'counter',target:target?0:'self',counter:m[2],n:amount(m[1])}],target?[target]:[]);}
  m=/^adapt (\d+)$/i.exec(text);
  if(m)return result([{action:'conditional',condition:{kind:'count-comparison',count:{kind:'source-counters',counter:'+1/+1'},max:0},effects:[{action:'counter',target:'self',counter:'+1/+1',n:Number(m[1])}]}]);
  if(/ until your next turn(?:,|$)/i.test(text)){
    const body=helpers.effect(card,text.replace(/ until your next turn/gi,' until end of turn')+'.');
    if(body&&body.effects.every(effect=>['pump','pump-group','battlefield-group','cant-block-until-eot','unblockable-until-eot'].includes(effect.action)))return {...body,effects:body.effects.map(effect=>({...effect,duration:'next-turn'}))};
  }
  m=new RegExp("^("+self+"|(?:another |up to one )?target .+?) becomes (?:a|an) (\\d+)/(\\d+) ((?:(?:white|blue|black|red|green|colorless)(?: and |, )?)* ?)((?:[A-Z][a-z-]+ )*)(artifact )?creature(?: with (.+?))?( until end of turn)?(?:\\. It's still a (?:land|artifact)| in addition to its other types)?$",'i').exec(text);
  if(m){if(/artifact $/i.test(m[5])){m[5]=m[5].replace(/artifact $/i,'');m[6]='artifact ';}const target=extensionTarget(m[1]),subtypes=m[5].trim()?m[5].trim().split(' '):[],keywords=m[7]?helpers.keywordList(m[7]):[];
    if((target||new RegExp('^'+self+'$','i').test(m[1]))&&subtypes.every(type=>ORACLE_SUBTYPES.has(type))&&keywords){const colors=m[4].match(/white|blue|black|red|green/gi)?.map(color=>({white:'W',blue:'U',black:'B',red:'R',green:'G'}[color.toLowerCase()]));return result([{action:'animate',target:target?0:'self',power:Number(m[2]),toughness:Number(m[3]),types:m[6]?['Artifact','Creature']:['Creature'],subtypes,keywords,colors:colors||(/colorless/i.test(m[4])?[]:null),retainTypes:!!m[6]||/still a|in addition/.test(text),temporary:!!m[8]}],target?[target]:[]);}
  }
  m=/^sacrifice (another|a|an) (.+?)\. If you do, (.+)$/i.exec(text);
  if(m&&optional){const filter=extensionTarget((m[1]==='another'?'another ':'')+'target '+m[2]),body=filter&&helpers.effect(card,m[3]+'.');if(filter?.zone==='battlefield'&&body&&!body.optional)return {...body,optional:false,effects:[{action:'optional-sacrifice',filter,n:1,effects:body.effects}]};}
  m=/^(.+?)(?: until end of turn)? for each (.+?)( until end of turn)?$/i.exec(text);
  if(m){const count=extensionCount(m[2]),body=count&&helpers.effect(card,m[1]+(m[3]||/ until end of turn for each /.test(text)?' until end of turn':'')+'.');if(body&&!body.optional&&body.effects.length===1){const effect=body.effects[0];if(['pump','pump-group','battlefield-group'].includes(effect.action)&&(!effect.operation||effect.operation==='pump'))return {...body,effects:[{...effect,multiplier:count}]};if(['draw','gain-life','lose-life','mill','counter'].includes(effect.action)&&typeof effect.n==='number')return {...body,effects:[{...effect,n:{...count,multiply:effect.n}}]};}}
  if(/ (?:gets? an additional|has .+ until end of turn)/i.test(text)){const normalized=text.replace(/gets? an additional /i,'gets ').replace(/ has (.+) until end of turn$/i,' gains $1 until end of turn');if(normalized!==text){const body=helpers.effect(card,normalized+'.');if(body)return body;}}
  m=/^(.+?), where X is ([^.]+)\. (.+)$/i.exec(text);
  if(m){const head=helpers.effect(card,m[1]+', where X is '+m[2]+'.'),tail=helpers.effect(card,m[3]+'.');if(head&&tail&&!head.optional&&!tail.optional){const offset=head.targets.length,antecedent=head.effects.at(-1)?.target,refers=typeof antecedent==='number'&&/\b(?:it|that creature|that permanent)\b/i.test(m[3])&&!/\bthis /i.test(m[3]),shift=object=>Array.isArray(object)?object.map(shift):object&&typeof object==='object'?Object.fromEntries(Object.entries(object).map(([key,value])=>[key,key==='target'&&value==='self'&&refers?antecedent:['target','otherTarget','who','conditionTarget'].includes(key)&&typeof value==='number'?value+offset:shift(value)])):object;return result([...head.effects,...tail.effects.map(shift)],[...head.targets,...tail.targets]);}}
  m=new RegExp('^exile ((?:another |up to one )?target .+?) until '+selfPattern(card)+' leaves the battlefield$','i').exec(text);
  if(m){const target=extensionTarget(m[1]);if(target?.zone==='battlefield')return result([{action:'exile-until-source-leaves',target:0}],[target]);}
  m=/^gain control of ((?:up to one )?target .+?)( until end of turn)?$/i.exec(text);
  if(m){const target=extensionTarget(m[1]);if(target?.zone==='battlefield')return result([{action:'gain-control',target:0,temporary:!!m[2]}],[target]);}
  m=new RegExp('^('+self+'|(?:another |up to one )?target .+?) (?:has|have) base power and toughness (\\d+)/(\\d+) until end of turn$','i').exec(text.replace(/^Until end of turn, (.+)$/i,'$1 until end of turn'));
  if(m){const target=extensionTarget(m[1]);if(target||new RegExp('^'+self+'$','i').test(m[1]))return result([{action:'base-pt',target:target?0:'self',power:Number(m[2]),toughness:Number(m[3])}],target?[target]:[]);}
  m=/^counter (target .+?spell) unless its controller pays ((?:\{(?:\d+|[WUBRGC])\})+)$/i.exec(text);
  if(m){const target=extensionTarget(m[1]);if(target?.zone==='stack')return result([{action:'counter-spell',target:0,unlessPay:m[2]}],[target]);}
  m=new RegExp('^(?:sacrifice '+self+' unless you pay|unless you pay) ((?:\\{(?:\\d+|[WUBRGC])\\})+)'+ '(?:, sacrifice '+self+')?$','i').exec(text);
  if(m&&/sacrifice/i.test(text))return result([{action:'sacrifice-unless-pay',target:'self',cost:m[1]}]);
  if(/^Until end of turn, /i.test(text)){const parsed=helpers.effect(card,text.slice(19)+' until end of turn.');if(parsed)return parsed;}
  m=new RegExp('^(that player|its (?:controller|owner)|that (?:card|spell|creature|artifact|enchantment|land|permanent)\'s (?:controller|owner)) (draws|gains|loses|mills|discards) ('+NUM+') (cards?|life)$','i').exec(text);
  if(m&&(['gains','loses'].includes(m[2].toLowerCase())===(m[4].toLowerCase()==='life')))return result([{action:({draws:'draw',gains:'gain-life',loses:'lose-life',mills:'mill',discards:'discard'})[m[2].toLowerCase()],who:m[1].toLowerCase()==='that player'?'event-player':m[1].endsWith('owner')?'event-card-owner':'event-card-controller',n:amount(m[3])}]);
  m=new RegExp('^'+self+' deals ('+NUM+') damage to (that player|its controller|that (?:card|spell|creature|artifact|enchantment|land|permanent)\'s controller)$','i').exec(text);
  if(m)return result([{action:'damage',target:m[2]==='that player'?'event-player':'event-card-controller',n:amount(m[1])}]);
  if(/\bthat (?:creature|artifact|land|permanent)\b/i.test(text)&&!/^target | target /i.test(text)&&!new RegExp(selfPattern(card,false),'i').test(text)){
    const rewritten=text.replace(/\bthat (?:creature|artifact|land|permanent)\b/gi,'__OracleEventObject__');
    const body=helpers.effect({...card,name:'__OracleEventObject__'},rewritten+'.');
    if(body&&!body.optional){const map=object=>Array.isArray(object)?object.map(map):object&&typeof object==='object'?Object.fromEntries(Object.entries(object).map(([key,value])=>[key,['target','otherTarget'].includes(key)&&value==='self'?'event-card':map(value)])):object;return {...body,effects:body.effects.map(map)};}
  }
  m=new RegExp('^(?:(you|each player|each opponent|target player|target opponent) )?sacrifices? ('+NUM+') (.+?)(?: of (?:their|your) choice)?$','i').exec(text);
  if(m){const noun=m[3].replace(/\b(creatures|artifacts|lands|enchantments|permanents|tokens)\b/g,word=>word.slice(0,-1));const filter=extensionTarget('target '+noun);const actor=(m[1]||'you').toLowerCase(),targeted=actor.startsWith('target ');if(filter&&filter.zone==='battlefield')return result([{action:'choose-permanents',operation:'sacrifice',n:amount(m[2]),filter,who:targeted?0:actor.replace(' ','-')}],targeted?[extensionTarget(actor)]:[]);}
  m=new RegExp('^return ('+NUM+') (.+?) you control to (?:its owner\'s|their owners\') hands?$','i').exec(text);
  if(m){const filter=extensionTarget('target '+m[2].replace(/\b(creatures|artifacts|lands|enchantments|permanents)\b/g,word=>word.slice(0,-1)));if(filter&&filter.zone==='battlefield')return result([{action:'choose-permanents',operation:'bounce',n:amount(m[1]),filter,who:'you'}]);}
  const signed=value=>/X/i.test(value)?{kind:'signed',value:'X',sign:value[0]==='-'?-1:1}:Number(value);
  m=new RegExp('^('+self+'|(?:another |up to one )?target .+?) gets ([+-](?:\\d+|X))/([+-](?:\\d+|X))(?: and gains? (.+))? until end of turn$','i').exec(text);
  if(m){const target=extensionTarget(m[1]),keywords=m[4]?helpers.keywordList(m[4]):[];if(keywords&&(target||new RegExp('^'+self+'$','i').test(m[1])))return result([{action:'pump',target:target?0:'self',power:signed(m[2]),toughness:signed(m[3]),keywords}],target?[target]:[]);}
  m=/^(?:you )?(draw|mill) X cards$/i.exec(text);
  if(m)return result([{action:m[1].toLowerCase(),who:'you',n:'X'}]);
  m=/^(scry|surveil) (X|\d+)$/i.exec(text);
  if(m)return result([{action:m[1].toLowerCase(),who:'you',n:m[2]==='X'?'X':Number(m[2])}]);
  m=new RegExp('^put X (\\+1/\\+1|-1/-1|charge) counters on ('+self+'|(?:another |up to one )?target .+)$','i').exec(text);
  if(m){const target=extensionTarget(m[2]);if(target||new RegExp('^'+self+'$','i').test(m[2]))return result([{action:'counter',target:target?0:'self',counter:m[1],n:'X'}],target?[target]:[]);}
  m=/^(.+?) get ([+-]X)\/([+-]X)(?: and gain (.+?))? until end of turn$/i.exec(text);
  if(m){const filters=groupSelectors(m[1]),keywords=m[4]?helpers.keywordList(m[4]):[];if(filters&&keywords)return result([{action:'battlefield-group',operation:'pump',filters,power:signed(m[2]),toughness:signed(m[3]),keywords}]);}
  m=new RegExp('^create ('+NUM+') tokens? that(?:\'s| are) (?:a copy|copies) of ('+self+'|target .+?)(?:, except (it isn\'t|they aren\'t) legendary)?$','i').exec(text);
  if(m){const target=/^target /i.test(m[2])?extensionTarget(m[2]):null;if(target?.zone==='battlefield'||new RegExp('^'+self+'$','i').test(m[2]))return result([{action:'copy-token',target:target?0:'self',n:amount(m[1]),nonlegendary:!!m[3]}],target?[target]:[]);}
  m=/^(return) ((?:all|each) .+?) to (?:their owners' hands|its owner's hand)$/i.exec(text);
  if(m){const filters=groupSelectors(m[2]);if(filters)return result([{action:'battlefield-group',operation:'bounce',filters}]);}
  m=/^(.+?) get ([+-]\d+)\/([+-]\d+)(?: and gain (.+?))? until end of turn$/i.exec(text);
  if(m){const filters=groupSelectors(m[1]),keywords=m[4]?helpers.keywordList(m[4]):[];if(filters&&keywords)return result([{action:'battlefield-group',operation:'pump',filters,power:Number(m[2]),toughness:Number(m[3]),keywords}]);}
  m=/^(.+?) gain (.+?) until end of turn$/i.exec(text);
  if(m){const filters=groupSelectors(m[1]),keywords=helpers.keywordList(m[2]);if(filters&&keywords)return result([{action:'battlefield-group',operation:'pump',filters,power:0,toughness:0,keywords}]);}
  m=new RegExp('^put ('+NUM+') (\\+1/\\+1|-1/-1|charge) counters? on (each .+)$','i').exec(text);
  if(m){const filters=groupSelectors(m[3]);if(filters)return result([{action:'battlefield-group',operation:'counter',filters,counter:m[2],n:amount(m[1])}]);}
  m=new RegExp('^'+self+' fights ((?:up to one )?target creature(?: you don\'t control| an opponent controls)?)$','i').exec(text);
  if(m){const target=extensionTarget(m[1]);if(target)return result([{action:'fight',target:'self',otherTarget:0}],[target]);}
  m=new RegExp('^remove ('+NUM+') (\\+1/\\+1|-1/-1|charge|time|stun) counters? from (target .+)$','i').exec(text);
  if(m){const target=extensionTarget(m[3]);if(target)return result([{action:'remove-counter',target:0,counter:m[2],n:amount(m[1])}],[target]);}
  m=/^tap ((?:up to )?(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+) target .+?)\. Those (?:creatures|permanents) don't untap during their controller's next untap step$/i.exec(text);
  if(m){const target=extensionTarget(m[1]);if(target)return result([{action:'tap',target:0},{action:'skip-next-untap',target:0}],[target]);}
  m=/^(.+?), where X is (.+)$/i.exec(text);
  if(m&&/\bX\b/.test(m[1])){let value=extensionValue(m[2]);const body=value&&helpers.effect(card,m[1]+'.');if(body&&!body.optional){if(value.kind==='source-stat'&&body.targets.length===1)value={kind:'target-stat',target:0,stat:value.stat};const replace=object=>object==='X'?structuredClone(value):Array.isArray(object)?object.map(replace):object&&typeof object==='object'?Object.fromEntries(Object.entries(object).map(([k,v])=>[k,replace(v)])):object;return {...body,effects:body.effects.map(replace)};}}
  m=/^create X (.+)$/i.exec(text);
  if(m){const body=helpers.effect(card,'Create one '+m[1]+'.');if(body?.effects.length===1&&['token-inline','token-key'].includes(body.effects[0].action))return result([{...body.effects[0],n:'X'}]);}
  m=/^create (.+?) for each (.+)$/i.exec(text);
  if(m){const count=extensionCount(m[2]),body=count&&helpers.effect(card,'Create '+m[1]+'.');if(body?.effects.length===1&&['token-inline','token-key'].includes(body.effects[0].action))return result([{...body.effects[0],n:{...count,multiply:body.effects[0].n}}]);}
  m=/^(?:you )?(draw|gain) (?:cards|life) equal to (.+)$/i.exec(text);
  if(m){const value=extensionValue(m[2]);if(value)return result([{action:m[1].toLowerCase()==='draw'?'draw':'gain-life',who:'you',n:value}]);}
  m=/^(?:you )?(draw|gain) that many (cards|life)$/i.exec(text);
  if(m&&((m[1].toLowerCase()==='gain')===(m[2]==='life')))return result([{action:m[1].toLowerCase()==='gain'?'gain-life':'draw',who:'you',n:{kind:'event-amount'}}]);
  m=new RegExp('^put (that many|'+NUM+') \\+1/\\+1 counters? on '+self+'$','i').exec(text);
  if(m)return result([{action:'counter',target:'self',counter:'+1/+1',n:m[1].toLowerCase()==='that many'?{kind:'event-amount'}:amount(m[1])}]);
  m=new RegExp('^(?:you )?draw (?:a card|one card) for each time '+self+' was kicked$','i').exec(text);
  if(m)return result([{action:'draw',who:'you',n:{kind:'paid-times'}}]);
  // These alternate word orders preserve the same complete action.
  m=new RegExp('^'+self+' deals damage to (any target|target .+?) equal to (.+)$','i').exec(text);
  if(m&&helpers.effect)return helpers.effect(card,card.name+' deals damage equal to '+m[2]+' to '+m[1]+'.');
  m=/^(?:you )?gain X plus (\d+) life$/i.exec(text);
  if(m)return result([{action:'gain-life',who:'you',n:{kind:'sum',values:['X',Number(m[1])]}}]);
  m=/^add (\{[WUBRGC]\}) for each (.+)$/i.exec(text);
  if(m){const count=extensionCount(m[2]);if(count)return result([{action:'add-mana',produce:{[m[1][1]]:1},multiplier:count}]);}
  m=/^look at the top (one|two|three|four|five|six|seven|eight|nine|ten|\d+) cards of your library\. Put one of them into your hand and the rest (into your graveyard|on the bottom of your library in any order)$/i.exec(text);
  if(m)return result([{action:'look-select',n:amount(m[1]),what:'card',required:true,rest:m[2].startsWith('into')?'graveyard':'bottom',random:false}]);
  m=/^if (.+?), (.+)$/i.exec(text);
  if(m){const condition=extensionCondition(m[1]),body=condition&&helpers.effect?.(card,m[2]+'.');if(body&&!body.optional)return result([{action:'conditional',condition,effects:body.effects}],body.targets);}
  m=/^counter (target .+)$/i.exec(text);
  if(m){const target=extensionTarget(m[1]);if(target?.zone==='stack')return result([{action:'counter-spell',target:0}],[target]);}
  m=/^counter each (.+)$/i.exec(text);
  if(m){const filter=extensionTarget('target '+m[1]);if(filter?.zone==='stack')return result([{action:'counter-spells',filter}]);}
  m=/^(destroy|exile|tap|untap) (all .+?)(?:\. (?:They|Those creatures|Those permanents) can't be regenerated)?$/i.exec(text);
  if(m) {
    const filters=groupSelectors(m[2]);
    if(filters)return result([{action:'battlefield-group',operation:m[1].toLowerCase(),filters,noRegen:/can't be regenerated/.test(text)}]);
  }
  m=new RegExp('^'+self+' deals ('+NUM+'|X) damage to (each .+)$','i').exec(text);
  if(m) {
    const players=/ and each player$/.test(m[2])||m[2]==='each player';
    const group=m[2].replace(/ and each player$/,'');
    const filters=group==='each player'?[]:groupSelectors(group);
    if(filters)return result([{action:'battlefield-group',operation:'damage',filters,players,n:m[1]==='X'?'X':amount(m[1])}]);
  }
  m=/^(target creature(?: you control)?) fights (target creature(?: you don't control| an opponent controls)?)$/i.exec(text);
  if(m) {
    const targets=[extensionTarget(m[1]),extensionTarget(m[2].replace("you don't control",'an opponent controls'))];
    if(targets.every(Boolean))return result([{action:'fight',target:0,otherTarget:1}],targets);
  }
  m=/^put ((?:up to one )?target .+?) (?:on (top|the bottom) of|into) (?:its owner's|your) library$/i.exec(text);
  if(m&&m[2]){const target=extensionTarget(m[1]);if(target)return result([{action:'move-to-library',target:0,bottom:m[2]==='the bottom'}],[target]);}
  m=new RegExp('^(target player|target opponent|each player|each opponent) (draws?|gains?|loses?|mills?|discards?) ('+NUM+'|X) (cards?|life)$','i').exec(text);
  if(m) {
    const verb=m[2].toLowerCase().replace(/s$/,'');
    if((['gain','lose'].includes(verb)) !== (m[4]==='life'))return null;
    const targeted=/^target /i.test(m[1]);
    const who=targeted?0:m[1].toLowerCase()==='each player'?'each-player':'each-opponent';
    return result([{action:verb==='gain'?'gain-life':verb==='lose'?'lose-life':verb,who,n:m[3]==='X'?'X':amount(m[3])}],targeted?[extensionTarget(m[1])]:[]);
  }
  m=new RegExp('^(?:you )?(gain|lose) (X) life$','i').exec(text);
  if(m)return result([{action:m[1].toLowerCase()+'-life',who:'you',n:'X'}]);
  m=new RegExp('^'+self+' deals ('+NUM+'|X) damage to you$','i').exec(text);
  if(m)return result([{action:'damage',target:'you',n:m[1]==='X'?'X':amount(m[1])}]);
  m=new RegExp('^(?:put|remove) ('+NUM+') (charge|time|storage|ki|quest|spore|fuse|page|verse|bounty|muster|ice|age) counters? (?:on|from) '+self+'$','i').exec(text);
  if(m)return result([{action:/^remove /i.test(text)?'remove-counter':'counter',target:'self',counter:m[2],n:amount(m[1])}]);
  m=new RegExp('^add ((?:\\{[WUBRGC]\\})+)$','i').exec(text);
  if(m) {
    const produce={};for(const [_,symbol]of m[1].matchAll(/\{([WUBRGC])\}/g))produce[symbol]=(produce[symbol]||0)+1;
    return result([{action:'add-mana',produce}]);
  }
  if(/^shuffle your library$/i.test(text))return result([{action:'shuffle-library'}]);
  m=/^(?:you )?discard your hand$/i.exec(text);
  if(m)return result([{action:'discard-hand',who:'you'}]);
  m=/^target (player|opponent) discards their hand$/i.exec(text);
  if(m)return result([{action:'discard-hand',who:0}],[extensionTarget('target '+m[1])]);
  m=/^(?:all |other |creatures you control |other creatures you control )/.exec(text);
  // Closed group pump and keyword forms, represented with existing scopes.
  m=/^(all creatures|other creatures|creatures you control|other creatures you control|attacking creatures you control|creatures your opponents control) gain (.+) until end of turn$/i.exec(text);
  if(m) {
    const keywords=helpers.keywordList(m[2]);
    const who={'all creatures':'all-creatures','other creatures':'all-other-creatures','creatures you control':'your-creatures','other creatures you control':'your-other-creatures','attacking creatures you control':'your-attacking-creatures','creatures your opponents control':'opponent-creatures'}[m[1].toLowerCase()];
    if(keywords)return result([{action:'pump-group',who,power:0,toughness:0,keywords}]);
  }
  m=/^(?:each )?(target (?:player|opponent)) loses (\d+) life and you gain (\d+) life$/i.exec(text);
  if(m)return result([{action:'lose-life',who:0,n:Number(m[2])},{action:'gain-life',who:'you',n:Number(m[3])}],[extensionTarget(m[1])]);
  m=new RegExp('^'+self+' gets ([+-]\\d+)/([+-]\\d+) until end of turn for each (.+)$','i').exec(text);
  if(m){const count=extensionCount(m[3]);if(count)return result([{action:'pump',target:'self',power:Number(m[1]),toughness:Number(m[2]),multiplier:count,keywords:[]}]);}
  m=new RegExp('^'+self+' gets ([+-]\\d+)/([+-]\\d+) for each (.+) until end of turn$','i').exec(text);
  if(m){const count=extensionCount(m[3]);if(count)return result([{action:'pump',target:'self',power:Number(m[1]),toughness:Number(m[2]),multiplier:count,keywords:[]}]);}
  return null;
}

function extendedLine(card,line,helpers) {
  const self=selfPattern(card),base={kind:'generic-static',contract:'generic-continuous-effect'};
  const noUntap=/^(.+?) (?:don't|doesn't) untap during (?:their controllers'|its controller's) untap steps?\.$/.exec(line);
  if(noUntap){const filters=groupSelectors(noUntap[1]);if(filters)return {...base,scope:'filtered-permanents',filters,cantUntap:true};}
  const entryCounter='(\\+1/\\+1|-1/-1|charge|time|storage|ki|quest|spore|fuse|page|verse|bounty|muster|ice|age)';
  const entry=new RegExp('^'+self+' enters( tapped(?: and)?)? with ('+NUM+'|X) '+entryCounter+' counters? on (?:it|him|her)(?:, where X is (.+)| for each (.+))?\\.$','i').exec(line);
  if(entry){let n=entry[2]==='X'?(entry[4]?extensionValue(entry[4]):'X'):amount(entry[2]);if(entry[5]){const count=entry[5]==='color of mana spent to cast it'?{kind:'paid-colors'}:extensionCount(entry[5]);n=count?{...count,multiply:amount(entry[2])}:null;}if(n!==null&&n!==false)return {kind:'enters-with-counters',counter:entry[3],n,...(entry[1]?{tapped:true}:{}),contract:'permanent-enters-with-counters'};}
  const equalEntry=new RegExp('^'+self+' enters with a number of '+entryCounter+' counters on it equal to (.+)\\.$','i').exec(line);
  if(equalEntry){const n=extensionValue(equalEntry[2]);if(n!==null)return {kind:'enters-with-counters',counter:equalEntry[1],n,contract:'permanent-enters-with-counters'};}
  const conditionalEntry=new RegExp('^(?:If (.+?), '+self+' enters|'+self+' enters) with ('+NUM+') '+entryCounter+' counters? on it(?: if (.+))?\\.$','i').exec(line);
  if(conditionalEntry){const condition=extensionCondition(conditionalEntry[1]||conditionalEntry[4]||'');if(condition)return {kind:'enters-with-counters',n:amount(conditionalEntry[2]),counter:conditionalEntry[3],condition,contract:'permanent-enters-with-counters'};}
  const tappedEntry=new RegExp('^(?:If (.+?), '+self+' enters tapped|'+self+' enters tapped (unless|if) (.+))\\.$','i').exec(line);
  if(tappedEntry){const condition=extensionCondition(tappedEntry[1]||tappedEntry[3]);if(condition)return {kind:'conditional-enters-tapped',condition:'generic',untappedCondition:tappedEntry[2]==='unless'?condition:{kind:'not',condition},contract:'conditional-permanent-entry'};}
  const ownCombat=new RegExp('^'+self+' (.+)\\.$','i').exec(line);
  if(ownCombat){const restriction=combatRestriction(card,ownCombat[1]);if(restriction)return {...base,scope:'self',...restriction};}
  const attachmentCombat=/^(?:Enchanted|Equipped) creature (?:(?:gets ([+-]\d+)\/([+-]\d+)(?:, has (.+?),)? and |has (.+?) and ))?(.+)\.$/.exec(line);
  if(attachmentCombat){const restriction=combatRestriction(card,attachmentCombat[5]),keywords=attachmentCombat[3]||attachmentCombat[4]?helpers.keywordList(attachmentCombat[3]||attachmentCombat[4]):[];if(restriction&&keywords)return {kind:'attachment-grant',contract:'attachment-continuous-effect',power:Number(attachmentCombat[1]||0),toughness:Number(attachmentCombat[2]||0),keywords,...restriction};}
  const groupCombat=/^(.+?) (can't .+|can block only .+)\.$/.exec(line);
  if(groupCombat){const filters=groupSelectors(groupCombat[1]),restriction=combatRestriction(card,groupCombat[2]);if(filters&&restriction)return {...base,scope:'filtered-permanents',filters,...restriction};}
  const defending=new RegExp('^'+self+" can't attack (unless|if) defending player controls (?:a|an) (.+)\\.$",'i').exec(line);
  if(defending){const filters=groupSelectors(defending[2]+' you control');if(filters)return {...base,scope:'self',defenderRule:{filters,require:defending[1]==='unless'}};}
  const defense=/^(.+?) can't attack you( or planeswalkers you control)?\.$/.exec(line);
  if(defense){const filters=groupSelectors(defense[1]);if(filters)return {...base,scope:'filtered-permanents',filters,cantAttackSourceController:true,includePlaneswalkers:!!defense[2]};}
  const prevention=line.endsWith('.')&&preventionOperation(card,line.slice(0,-1),false);
  if(prevention&&!prevention.targetSpec)return {kind:'damage-prevention',...prevention,contract:'damage-prevention'};
  const evasion=new RegExp('^'+self+" can't be blocked (by|except by) (.+)\\.$",'i').exec(line);
  if(evasion){
    const relative=/^creatures with (greater|lesser) power$/.exec(evasion[2]);
    if(relative)return {...base,scope:'self',relativeBlockerPower:relative[1],blockOnly:evasion[1]==='except by'};
    const filters=groupSelectors(evasion[2]);
    if(filters)return {...base,scope:'self',blockerFilters:filters,blockOnly:evasion[1]==='except by'};
  }
  const conditionalEvasion=new RegExp('^'+self+" can't be blocked (?:if|as long as) (.+)\\.$",'i').exec(line);
  if(conditionalEvasion){const condition=extensionCondition(conditionalEvasion[1]);if(condition)return {...base,scope:'self',unblockable:true,condition};}
  const unblockable=/^(?:Enchanted|Equipped) creature (?:gets ([+-]\d+)\/([+-]\d+) and )?can't be blocked(?: and has (.+))?\.$/.exec(line);
  if(unblockable){const keywords=unblockable[3]?helpers.keywordList(unblockable[3]):[];if(keywords)return {kind:'attachment-grant',power:Number(unblockable[1]||0),toughness:Number(unblockable[2]||0),keywords,unblockable:true,contract:'attachment-continuous-effect'};}
  const keywordEntry=new RegExp('^'+self+' enters with (?:a|an) (flying|double strike|first strike|deathtouch|lifelink|trample|vigilance|menace|reach|hexproof|indestructible|shield) counter on it\\.$','i').exec(line);
  if(keywordEntry)return {kind:'enters-with-counters',n:1,counter:keywordEntry[1],contract:'permanent-enters-with-counters'};
  const globalGrant=/^(.+?) (?:has|have) "(.+)"\.?$/.exec(line);
  if(globalGrant&&!globalGrant[2].includes(card.name)&&!globalGrant[1].match(/^(Enchanted|Equipped)/)){
    const filters=new RegExp('^'+self+'$','i').test(globalGrant[1])?null:groupSelectors(globalGrant[1]),child=grantedOperation(extensionLine({...card,name:'__GrantedPermanent__'},globalGrant[2],helpers));
    if((filters||new RegExp('^'+self+'$','i').test(globalGrant[1]))&&child&&['generic-trigger','generic-ability','mana-source'].includes(child.kind)&&!child.from)return {...base,scope:filters?'filtered-permanents':'self',...(filters?{filters}:{}),grantedOperation:child};
  }
  const selfStatic=new RegExp('^'+self+' (?:gets ([+-]\\d+)/([+-]\\d+)(?: and has (.+))?|has (.+))\\.$','i').exec(line);
  if(selfStatic){const keywords=selfStatic[3]||selfStatic[4]?helpers.keywordList(selfStatic[3]||selfStatic[4]):[];if(keywords)return {...base,scope:'self',power:Number(selfStatic[1]||0),toughness:Number(selfStatic[2]||0),keywords};}
  const attackRestriction=new RegExp('^'+self+" can't (attack|block|attack or block) (unless|if) (.+)\\.$",'i').exec(line);
  if(attackRestriction){const condition=extensionCondition(attackRestriction[3]);if(condition)return {...base,scope:'self',condition:attackRestriction[2]==='unless'?{kind:'not',condition}:condition,cantAttack:attackRestriction[1].includes('attack'),cantBlock:attackRestriction[1].includes('block')};}
  const conditionalStatic=/^(?:As long as (.+?), (.+)|(.+?) as long as (.+))\.$/.exec(line);
  if(conditionalStatic){const conditionText=conditionalStatic[1]||conditionalStatic[4],condition=extensionCondition(conditionText),body=(conditionalStatic[2]||conditionalStatic[3]).replace(/^it (gets|has)/i,'this creature $1');const parsed=condition&&extensionLine(card,body[0].toUpperCase()+body.slice(1)+'.',helpers);if(parsed&&['generic-static','cost-modifier'].includes(parsed.kind))return {...parsed,condition,...(parsed.scope&&parsed.scope!=='self'&&/^(?:it |it's |that creature )/.test(conditionText)?{conditionSubject:'affected'}:{})};}
  const defender=new RegExp('^'+self+" can attack as though it didn't have defender\\.$",'i').exec(line);
  if(defender)return {...base,scope:'self',defenderCanAttack:true};
  const modifier=modifierOperation(card,line);if(modifier)return modifier;
  const grant=/^(?:Enchanted|Equipped) (?:creature|permanent|artifact|land) gets ([+-]\d+)\/([+-]\d+) for each (.+?)(?: and has (.+))?\.$/.exec(line);
  if(grant){const multiplier=grant[3]==='of its colors'?{kind:'host-colors'}:extensionCount(grant[3]),keywords=grant[4]?helpers.keywordList(grant[4]):[];if(multiplier&&keywords)return {kind:'attachment-grant',power:Number(grant[1]),toughness:Number(grant[2]),multiplier,keywords,contract:'attachment-continuous-effect'};}
  const quoted=/^(?:Enchanted|Equipped) (?:creature|permanent|artifact|land) has "(.+)"\.?$/.exec(line);
  if(quoted&&!quoted[1].includes(card.name)){
    const operation=grantedOperation(extensionLine({...card,name:'__GrantedPermanent__'},quoted[1],helpers));
    if(operation&&['generic-trigger','generic-ability','mana-source'].includes(operation.kind))return {kind:'attachment-operation',operation,contract:'attachment-granted-operation'};
  }
  const combined=/^((?:Enchanted|Equipped) creature) gets ([+-]\d+)\/([+-]\d+) and has (?:(.+?) and )?"(.+)"\.?$/.exec(line);
  if(combined){const keywords=combined[4]?helpers.keywordList(combined[4]):[],child=extendedLine(card,combined[1]+' has "'+combined[5]+'".',helpers);if(keywords&&child)return {...child,grant:{power:Number(combined[2]),toughness:Number(combined[3]),keywords}};}
  const attachmentTrigger=/^Whenever (enchanted|equipped) (creature|permanent|land) (attacks|blocks|dies|becomes tapped|becomes untapped|deals combat damage to a player), (.+)$/.exec(line);
  if(attachmentTrigger){const body=helpers.effect(card,attachmentTrigger[4])||extensionV4Body(card,attachmentTrigger[4]);if(body&&!JSON.stringify(body).includes('"self"'))return {kind:'generic-trigger',event:{attacks:'attacks',blocks:'blocks',dies:'dies','becomes tapped':'becameTapped','becomes untapped':'becameUntapped','deals combat damage to a player':'combatDamageToPlayer'}[attachmentTrigger[3]],eventFilter:{kind:'attached-object'},...body,contract:'generic-trigger-effect'};}
  const removed=/^(?:Enchanted|Equipped) creature (?:has (.+?) and )?loses (flying|first strike|trample)\.$/.exec(line);
  if(removed){const keywords=removed[1]?helpers.keywordList(removed[1]):[];if(keywords)return {kind:'attachment-grant',power:0,toughness:0,keywords,removeKeywords:[removed[2]],contract:'attachment-continuous-effect'};}
  const costModifier=/^(.+?) spells( you cast| your opponents cast)? cost \{(\d+)\} (less|more) to cast\.$/.exec(line);
  if(costModifier){let subject=costModifier[1].replace(/^(Instant and sorcery|Artifact and enchantment)$/i,word=>word.toLowerCase().replace(' and ',' or ')).replace(/^(White|Blue|Black|Red|Green|Colorless|Multicolored|Noncreature)$/i,word=>word.toLowerCase()+' card');if(!ORACLE_SUBTYPES.has(subject))subject=subject[0].toLowerCase()+subject.slice(1);const target=extensionTarget('target '+subject);if(target)return {kind:'cost-modifier',target,controller:costModifier[2]===' you cast'?'you':costModifier[2]?'opponents':'all',amount:Number(costModifier[3])*(costModifier[4]==='less'?-1:1),contract:'generic-cost-modification'};}
  const suspend=/^Suspend (\d+)—((?:\{(?:\d+|[WUBRGC])\})+)$/.exec(line);
  if(suspend&&Number(suspend[1])>0)return {kind:'mechanic-suspend',n:Number(suspend[1]),cost:suspend[2],contract:'mechanic-suspend'};
  if(['Convoke','Cascade','Storm'].includes(line))return {kind:'mechanic-'+line.toLowerCase(),contract:'mechanic-'+line.toLowerCase()};
  if(line==='Devoid')return {kind:'mechanic-devoid',contract:'mechanic-devoid'};
  const counters=new RegExp('^'+self+' enters with ('+NUM+') (\\+1/\\+1|-1/-1|charge|time|storage|ki|quest|spore|fuse|page|verse|bounty|muster|ice|age) counters? on it\\.$','i').exec(line);
  if(counters)return {kind:'enters-with-counters',counter:counters[2],n:amount(counters[1]),contract:'permanent-enters-with-counters'};
  const conditionalCounters=new RegExp('^(?:If (.+?), '+self+' enters|'+self+' enters) with ('+NUM+') (?:additional )?\\+1/\\+1 counters? on it(?: if (.+))?\\.$','i').exec(line);
  if(conditionalCounters){const condition=extensionCondition(conditionalCounters[1]||conditionalCounters[3]||'');if(condition)return {kind:'enters-with-counters',counter:'+1/+1',n:amount(conditionalCounters[2]),condition,contract:'permanent-enters-with-counters'};}
  const kickedCounters=new RegExp('^'+self+' enters with ('+NUM+') additional \\+1/\\+1 counters? on it if it was kicked\\.$','i').exec(line);
  if(kickedCounters)return {kind:'enters-with-counters',counter:'+1/+1',n:amount(kickedCounters[1]),condition:{kind:'kicked'},contract:'permanent-enters-with-counters'};
  const multiCounters=new RegExp('^'+self+' enters with (?:a|an|one) \\+1/\\+1 counter on it for each time it was kicked\\.$','i').exec(line);
  if(multiCounters)return {kind:'enters-with-counters',counter:'+1/+1',n:{kind:'paid-times'},contract:'permanent-enters-with-counters'};
  const groupStatic=/^(.+?) (?:gets? ([+-]\d+)\/([+-]\d+)(?: and (?:has|have) (.+))?|(?:has|have) (.+)|can't (attack or block|attack|block)|lose (flying|first strike|trample))\.$/.exec(line);
  if(groupStatic) {
    const subject=groupStatic[1].replace(/^Other /,'').replace(/\b[Cc]reature tokens\b/,'token creatures');
    const filters=groupSelectors(subject),keywords=(groupStatic[4]||groupStatic[5])?helpers.keywordList(groupStatic[4]||groupStatic[5]):[];
    if(filters&&keywords)return {...base,scope:'filtered-permanents',filters,excludeSelf:/^Other /.test(groupStatic[1]),power:Number(groupStatic[2]||0),toughness:Number(groupStatic[3]||0),keywords,
      ...(groupStatic[6]?{cantAttack:groupStatic[6].includes('attack'),cantBlock:groupStatic[6].includes('block')}:{ }),...(groupStatic[7]?{removeKeywords:[groupStatic[7]]}:{})};
  }
  const evoke=/^Evoke ((?:\{(?:\d+|[WUBRGC])\})+)$/.exec(line);
  if(evoke)return {kind:'mechanic-evoke',cost:evoke[1],contract:'mechanic-evoke'};
  const echoDash=/^(Echo|Dash) ((?:\{(?:\d+|[WUBRGC])\})+)$/.exec(line);
  if(echoDash)return {kind:'mechanic-'+echoDash[1].toLowerCase(),cost:echoDash[2],contract:'mechanic-'+echoDash[1].toLowerCase()};
  const megamorph=/^Megamorph ((?:\{(?:\d+|[WUBRGC])\})+)$/.exec(line);
  if(megamorph)return {kind:'mechanic-megamorph',cost:megamorph[1],contract:'mechanic-megamorph'};
  const protection=/^(?:(.+), )?[Pp]rotection from (.+)$/.exec(line);
  if(protection) {
    const keywords=protection[1]?helpers.keywordList(protection[1]):[];
    const qualities=protection[2].split(/,? and (?:from )?|, (?:from )?/).map(quality=>{
      if(['white','blue','black','red','green'].includes(quality))return {kind:'color',value:{white:'W',blue:'U',black:'B',red:'R',green:'G'}[quality]};
      if(quality==='each color')return {kind:'colored'};
      if(['monocolored','multicolored'].includes(quality))return {kind:quality};
      if(['creatures','artifacts','enchantments','lands','planeswalkers','instants','sorceries'].includes(quality))return {kind:'type',value:{creatures:'Creature',artifacts:'Artifact',enchantments:'Enchantment',lands:'Land',planeswalkers:'Planeswalker',instants:'Instant',sorceries:'Sorcery'}[quality]};
      if(/^[A-Z][a-z]+s?$/.test(quality))return {kind:'subtype',value:{Elves:'Elf',Dwarves:'Dwarf',Wolves:'Wolf'}[quality]||quality.replace(/s$/,'')};
      return null;
    });
    if(keywords&&qualities.every(Boolean))return {...base,scope:'self',keywords,protectionQualities:qualities};
  }
  let m=/^(All |Other )?(?:([A-Z][a-z]+) creatures|creatures|([A-Z][a-z]+)s)( you control| your opponents control)? (?:get ([+-]\d+)\/([+-]\d+)(?: and have (.+))?|have (.+))\.$/i.exec(line);
  if(m) {
    const singular={Elve:'Elf',Wolve:'Wolf',Dwarve:'Dwarf',Allie:'Ally',Mercenarie:'Mercenary'};
    const subtype=m[2]||(singular[m[3]]||m[3])||null;
    if(subtype && !/^[A-Z][a-z]+$/.test(subtype) && !/^(white|blue|black|red|green|artifact|colorless|multicolored|token)$/i.test(subtype))return null;
    const keywords=(m[7]||m[8])?helpers.keywordList(m[7]||m[8]):[];
    if(!keywords)return null;
    const other=m[1]?.toLowerCase()==='other ';
    const scope=m[4]?.toLowerCase()===' you control'?(other?'your-other-creatures':'your-creatures'):m[4]?.toLowerCase()===' your opponents control'?'opponent-creatures':other?'all-other-creatures':'all-creatures';
    return {...base,scope,subtype,power:Number(m[5]||0),toughness:Number(m[6]||0),keywords};
  }
  // Abbreviated legendary names are source references in Oracle text.
  m=new RegExp('^'+self+' enters tapped\\.$','i').exec(line);
  if(m)return {kind:'enters-tapped',contract:'permanent-enters-tapped'};
  m=new RegExp('^'+self+" can't (block|be blocked)\\.$",'i').exec(line);
  if(m)return {kind:m[1]==='block'?'cant-block':'unblockable',contract:m[1]==='block'?'cant-block-static':'unblockable-static'};
  return null;
}

export function extensionTarget(phrase) {
  phrase=phrase.replace(/^Target /,'target ').replace(/^Another /,'another ').replace(/^Up to one /,'up to one ');
  const extended = extendedTarget(phrase);
  if (extended) return extended;
  let text = phrase.trim().toLowerCase();
  const spec = { what: 'creature', zone: 'battlefield', controller: 'any', min: 1 };
  if (text.startsWith('another ')) { spec.excludeSelf = true; text = text.slice(8); }
  if (text.startsWith('up to one ')) { spec.min = 0; text = text.slice(10); }
  if (!text.startsWith('target ')) return null;
  text = text.slice(7);
  if (text.endsWith(' from your graveyard')) { spec.zone = 'graveyard'; spec.controller = 'you'; text = text.slice(0, -20); }
  else if (text.endsWith(' from a graveyard')) { spec.zone = 'graveyard'; text = text.slice(0, -17); }
  const restriction = / with (mana value|power|toughness) (\d+) or (less|greater)$/.exec(text);
  if (restriction) {
    spec.stat = restriction[1] === 'mana value' ? 'mv' : restriction[1];
    spec.threshold = Number(restriction[2]); spec.comparison = restriction[3];
    text = text.slice(0, restriction.index);
  }
  if (text.endsWith(' you control')) { spec.controller = 'you'; text = text.slice(0,-12); }
  else if (text.endsWith(' an opponent controls')) { spec.controller = 'opponent'; text = text.slice(0,-21); }
  else if (text.endsWith(' defending player controls')) { spec.controller = 'defending-player'; text = text.slice(0,-26); }
  if (spec.zone === 'graveyard') text = text.replace(/ card$/, '');
  if(spec.zone==='graveyard'&&['power','toughness'].includes(spec.stat))return null;
  for (const [prefix,field] of [['attacking or blocking ','attackingOrBlocking'],['attacking ','attacking'],['blocking ','blocking'],['tapped ','tapped'],['untapped ','untapped'],['nonblack ','nonblack'],['nonartifact ','nonartifact'],['nonlegendary ','nonlegendary'],['nontoken ','nontoken']]) {
    if (text.startsWith(prefix)) { spec[field] = true; text = text.slice(prefix.length); }
  }
  const color=/^(white|blue|black|red|green|colorless|multicolored|monocolored) /.exec(text);
  if(color){spec.color=color[1];text=text.slice(color[0].length);}
  const keyword = / with(out)? (flying|defender)$/.exec(text);
  if (keyword) { spec[keyword[1] ? 'withoutKeyword' : 'withKeyword'] = keyword[2]; text = text.slice(0,keyword.index); }
  if (!new RegExp('^'+TYPES+'$').test(text)) return null;
  spec.what = text;
  return spec;
}

export function extensionEffect(card, line, helpers) {
  const extended = extendedEffect(card, line, helpers);
  if (extended) return extended;
  if (!line.endsWith('.')) return null;
  let text = line.slice(0,-1);
  let optional = false;
  if (/^you may /i.test(text)) { optional = true; text = text.slice(8); }
  const result = (effects, targets=[]) => ({ effects, targets, optional });
  let m;
  const self = selfPattern(card, true);
  if(new RegExp('^'+self+" doesn't untap during your next untap step$",'i').test(text))return result([{action:'skip-next-untap',target:'self'}]);
  m=/^exile the top (?:(one|two|three|four|five|six|seven|eight|nine|ten|\d+) )?cards? of your library\. (?:(Until (?:the )?end of (?:your next turn|turn)), you may (play|cast) (?:that card|those cards)|You may (play|cast) (?:that card|those cards) this turn)$/i.exec(text);
  if(m)return result([{action:'impulse',n:m[1]?amount(m[1]):1,spellsOnly:(m[3]||m[4]).toLowerCase()==='cast',nextOwnTurn:!!m[2]&&/your next turn/i.test(m[2])}]);
  m=/^exile (target .+?)(?:, then return|\. Return) (?:it|that card) to the battlefield( tapped)? under (its owner's|your) control( at the beginning of the next end step)?$/i.exec(text);
  if(m) {const target=extensionTarget(m[1]);if(target?.zone==='battlefield')return result([{action:'blink',target:0,tapped:!!m[2],controller:m[3]==='your'?'you':'owner',delayed:!!m[4]}],[target]);}
  m=/^target (opponent|player) reveals their hand\. You choose a (nonland|noncreature|noncreature, nonland|nonland, noncreature|creature|artifact|enchantment|instant or sorcery) card from it\. That player discards that card$/i.exec(text);
  if(m)return result([{action:'reveal-hand-discard',target:0,what:m[2].toLowerCase()}],[{what:m[1].toLowerCase(),min:1}]);
  m=new RegExp('^'+self+' deals damage equal to (.+?) to (any target|target .+|each opponent)$','i').exec(text);
  if(m) {
    const value=extensionValue(m[1]);
    const target=m[2]==='any target'?{what:'any',min:1}:extensionTarget(m[2]);
    if(value&&(target||m[2]==='each opponent'))return result([{action:'damage',n:value,target:target?0:'each-opponent'}],target?[target]:[]);
  }
  m=/^(?:you )?gain life equal to (its power|its toughness|the number of .+)$/i.exec(text);
  if(m) {const value=extensionValue(m[1]);if(value)return result([{action:'gain-life',who:'you',n:value}]);}
  if(/^you gain that much life$/i.test(text))return result([{action:'gain-life',who:'you',n:{kind:'event-amount'}}]);
  m=new RegExp('^(untap|tap|regenerate) '+self+'$','i').exec(text);
  if(m)return result([{action:m[1].toLowerCase(),target:'self'}]);
  m=new RegExp('^'+self+" can't (block|be blocked) this turn$",'i').exec(text);
  if(m)return result([{action:m[1]==='block'?'cant-block-until-eot':'unblockable-until-eot',target:'self'}]);
  m=/^((?:another |up to one )?target .+?)\. (?:That (?:creature|permanent)|It) doesn't untap during its controller's next untap step$/i.exec(text.replace(/^tap /i,''));
  if(m&&/^tap /i.test(text)) {const target=extensionTarget(m[1]);if(target)return result([{action:'tap',target:0},{action:'skip-next-untap',target:0}],[target]);}
  m=/^put (a|an) (.+?) card from your hand onto the battlefield( tapped)?$/i.exec(text);
  if(m&&extensionSearchType(m[2]))return result([{action:'put-from-hand',what:extensionSearchType(m[2]),tapped:!!m[3],n:1}]);
  m=/^search your library for (?:up to )?(one|two|three|four|five|six|seven|eight|nine|ten|\d+) (.+?) cards, (reveal them, put them into your hand|put them onto the battlefield(?: tapped)?), then shuffle$/i.exec(text);
  if(m&&extensionSearchType(m[2]))return result([{action:'search-library',what:extensionSearchType(m[2]),maxMv:null,n:amount(m[1]),destination:m[3].includes('hand')?'hand':'battlefield',tapped:m[3].includes('tapped'),reveal:m[3].includes('reveal')}]);
  m=/^search your library for a card, put (?:it|that card) into your hand, then shuffle$/i.exec(text);
  if(m)return result([{action:'search-library',what:'card',maxMv:null,n:1,destination:'hand',tapped:false,reveal:false}]);
  m = /^(?:you )?gain (\d+) life for each (.+)$/i.exec(text);
  if(m) {const count=extensionCount(m[2]);if(count)return result([{action:'gain-life',who:'you',n:{...count,multiply:Number(m[1])}}]);}
  m=/^draw (?:a|one) card for each (.+)$/i.exec(text);
  if(m){const count=extensionCount(m[1]);if(count)return result([{action:'draw',who:'you',n:count}]);}
  m = /^create (a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+) (tapped )?(\d+)\/(\d+) ((?:(?:white|blue|black|red|green|colorless|and|artifact|enchantment) )+)([A-Z][a-zA-Z -]*) creature tokens?(?: with (.+))?$/i.exec(text);
  if(m) {
    const keywords=m[7]?helpers.keywordList(m[7]):[];
    if(!keywords) return null;
    const words=m[5].toLowerCase().trim().split(/\s+/), colors={white:'W',blue:'U',black:'B',red:'R',green:'G'};
    return result([{action:'token-inline',who:'you',n:amount(m[1]),tapped:!!m[2],token:{name:m[6],power:m[3],toughness:m[4],subtypes:m[6].split(' '),colors:words.filter(w=>colors[w]).map(w=>colors[w]),types:[...(words.includes('artifact')?['Artifact']:[]),...(words.includes('enchantment')?['Enchantment']:[]),'Creature'],keywords}}]);
  }
  m=/^(?:look at|reveal) the top (one|two|three|four|five|six|seven|eight|nine|ten|\d+) cards? of your library\. You may (?:reveal (a|an) (.+?) card from among them and put it into your hand|put (a|an) (.+?) card from among them into your hand)\. Put the rest (?:on the bottom of your library in (any|a random) order|into your graveyard)$/i.exec(text);
  if(m) {
    const what=m[3]||m[5]; const descriptor=extensionSearchType(what);
    if(descriptor) return result([{action:'look-select',n:amount(m[1]),what:descriptor,revealAll:/^reveal/i.test(text),reveal:!!m[3],rest:/into your graveyard$/i.test(text)?'graveyard':'bottom',random:m[6]==='a random'}]);
  }
  m=/^look at the top (one|two|three|four|five|six|seven|eight|nine|ten|\d+) cards? of your library, then put them back in any order$/i.exec(text);
  if(m) return result([{action:'order-top',n:amount(m[1])}]);
  m=new RegExp('^(?:you may )?(pay (\\d+) life|pay ((?:\\{(?:\\d+|[WUBRGC])\\})+)|sacrifice '+self+'|discard a card)\\. If you do, (.+)$','i').exec(text);
  if(m && helpers.effect) {
    const body=helpers.effect(card,m[4]+'.');
    if(body&&!body.optional) return {effects:[{action:'optional-payment',payment:m[2]?{life:Number(m[2])}:m[3]?{mana:m[3]}:/^sacrifice/i.test(m[1])?{sacSelf:true}:{discard:1},effects:body.effects}],targets:body.targets,optional:false};
  }
  m=/^amass (Orcs |Zombies )?(\d+)$/i.exec(text);
  if(m) return result([{action:'amass',n:Number(m[2]),subtype:m[1]?.startsWith('Orcs')?'Orc':'Zombie'}]);
  if(/^the Ring tempts you$/i.test(text)) return result([{action:'ring-tempts'}]);
  if(/^learn$/i.test(text)) return result([{action:'learn'}]);
  m = new RegExp('^'+self+' gains? (.+) until end of turn$', 'i').exec(text);
  if (m) { const keywords = helpers.keywordList(m[1]); return keywords ? result([{action:'pump',target:'self',power:0,toughness:0,keywords}]) : null; }
  m = /^(?:Until end of turn, )?(target .+?) gains? (.+?)(?: until end of turn)?$/i.exec(text);
  if (m && (/^Until end of turn, /i.test(text) || / until end of turn$/i.test(text))) {
    const target = extensionTarget(m[1]), keywords = helpers.keywordList(m[2]);
    return target && keywords ? result([{action:'pump',target:0,power:0,toughness:0,keywords}],[target]) : null;
  }
  m = /^(destroy|exile|tap|untap|regenerate) ((?:(?:another |up to one )?target|(?:up to )?(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+) target) .+)$/i.exec(text);
  if (m) { const target=extensionTarget(m[2]); if(target) return result([{action:m[1].toLowerCase(),target:0}],[target]); }
  m = /^return ((?:another |up to one )?target .+?) to (your hand|its owner's hand|the battlefield(?: tapped)?(?: under your control)?)$/i.exec(text);
  if(m) {
    const target=extensionTarget(m[1]);
    if(target && (m[2].includes('battlefield') ? target.zone==='graveyard' : true)) return result([{
      action:m[2].includes('battlefield')?'reanimate':target.zone==='graveyard'?'move-to-hand':'bounce',target:0,
      ...(m[2].includes('battlefield')?{tapped:m[2].includes('tapped'),controller:m[2].includes('your control')?'you':'owner'}:{}),
    }],[target]);
  }
  m = new RegExp('^'+self+' deals ('+NUM+'|X) damage to (target .+)$','i').exec(text);
  if(m) { const target=extensionTarget(m[2]); if(target) return result([{action:'damage',target:0,n:m[1]==='X'?'X':amount(m[1])}],[target]); }
  m = /^((?:up to one )?target .+?) gets ([+-]\d+)\/([+-]\d+)(?: and gains? (.+))? until end of turn$/i.exec(text.replace(/^Until end of turn, (.+)$/i,'$1 until end of turn'));
  if(m) {
    const target=extensionTarget(m[1]), keywords=m[4]?helpers.keywordList(m[4]):[];
    if(target && keywords) return result([{action:'pump',target:0,power:Number(m[2]),toughness:Number(m[3]),keywords}],[target]);
  }
  m = new RegExp('^put ('+NUM+') (\\+1/\\+1|-1/-1|charge|stun) counters? on ((?:another |up to one )?target .+)$','i').exec(text);
  if(m) { const target=extensionTarget(m[3]); if(target) return result([{action:'counter',target:0,n:amount(m[1]),counter:m[2]}],[target]); }
  m = /^(target .+?) can't (block|be blocked) this turn$/i.exec(text);
  if(m) { const target=extensionTarget(m[1]); if(target) return result([{action:m[2]==='block'?'cant-block-until-eot':'unblockable-until-eot',target:0}],[target]); }
  m = /^(creatures your opponents control|all creatures|other creatures) get ([+-]\d+)\/([+-]\d+)(?: and gain (.+))? until end of turn$/i.exec(text);
  if(m) {
    const keywords=m[4]?helpers.keywordList(m[4]):[];
    if(keywords) return result([{action:'pump-group',who:m[1].toLowerCase().startsWith('creatures your')?'opponent-creatures':m[1].toLowerCase()==='all creatures'?'all-creatures':'all-other-creatures',power:Number(m[2]),toughness:Number(m[3]),keywords}]);
  }
  m = new RegExp('^(?:you )?mill ('+NUM+') cards?$','i').exec(text);
  if(m) return result([{action:'mill',who:'you',n:amount(m[1])}]);
  m = new RegExp('^(?:you )?discard ('+NUM+') cards?$','i').exec(text);
  if(m) return result([{action:'discard',who:'you',n:amount(m[1])}]);
  m = new RegExp('^search your library for (a|an) (.+?) card(?: with mana value (\\d+) or less)?, (reveal it, put it into your hand|put it onto the battlefield(?: tapped)?), then shuffle$','i').exec(text);
  if(m&&extensionSearchType(m[2])) return result([{action:'search-library',what:extensionSearchType(m[2]),maxMv:m[3]?Number(m[3]):null,destination:m[4].includes('hand')?'hand':'battlefield',tapped:m[4].includes('tapped'),reveal:m[4].includes('reveal'),n:1}]);
  m = /^attach (?:it|this Equipment|this creature) to (target creature you control)$/i.exec(text);
  if(m) return result([{action:'attach-source',target:0}],[extensionTarget(m[1])]);
  m = new RegExp('^prevent the next ('+NUM+') damage that would be dealt to (any target|target creature|target player) this turn$','i').exec(text);
  if(m) return result([{action:'prevent-next',target:0,n:amount(m[1])}],[m[2].toLowerCase()==='any target'?{what:'any',min:1}:m[2].toLowerCase()==='target player'?{what:'player',min:1}:extensionTarget(m[2])]);
  if(/^draw a card at the beginning of the next turn's upkeep$/i.test(text)) return result([{action:'draw-next-upkeep',n:1}]);
  // Conjunctions connect complete actions. Parse every resulting sentence;
  // never discard an unrecognized continuation or invent an antecedent.
  const sequence=text.replace(/,? then (?=(?:you )?(?:draw|gain|lose|mill|scry|surveil|create|put|return|tap|untap|exile|destroy|add|discard|double|triple|switch)\b)/gi,'. ')
    .replace(/,? and (?=(?:you )?(?:draw|gain|lose|mill|scry|surveil|create|put|return|tap|untap|exile|destroy|add|discard|double|triple|switch)\b)/gi,'. ')
    .replace(/\. ([a-z])/g,(_,letter)=>'. '+letter.toUpperCase());
  if(!optional && sequence!==text && helpers.effect) {
    const parsed=helpers.effect(card,sequence+'.');
    if(parsed)return {...parsed,optional:optional||parsed.optional};
  }
  return null;
}

export function extensionLine(card, line, helpers) {
  const protectionStatic=/^(?:As long as (.+?), )?(.+?) (?:gets? ([+-]\d+)\/([+-]\d+) and (?:has|have) |(?:has|have) )(?:(.+?) and )?protection from (.+?)(?: as long as (.+))?\.$/.exec(line);
  if(protectionStatic){
    const own=new RegExp('^'+selfPattern(card)+'$','i').test(protectionStatic[2]),attached=/^(Enchanted|Equipped) creature$/.test(protectionStatic[2]),filters=own||attached?null:groupSelectors(protectionStatic[2]),qualities=protectionQualities(protectionStatic[6]);
    const keywords=protectionStatic[5]?helpers.keywordList(protectionStatic[5].replace(/, $/,'')):[],condition=protectionStatic[1]||protectionStatic[7]?extensionCondition(protectionStatic[1]||protectionStatic[7]):null;
    if((own||attached||filters)&&qualities&&keywords&&(!(protectionStatic[1]||protectionStatic[7])||condition))return {kind:'protection-static',own,attached,filters,qualities,keywords,power:Number(protectionStatic[3]||0),toughness:Number(protectionStatic[4]||0),...(condition?{condition}:{}),contract:'protection-static'};
  }
  const continuousBase=/^(?:During your turn, |As long as (.+?), )?(.+?) (?:has|have) base power and toughness (\d+|X)\/(\d+|X)(?: and (?:has|have) (.+?))?(?: and are (.+?) in addition to their other types)?(?:, where X is (.+))?\.$/.exec(line);
  if(continuousBase){
    const own=new RegExp('^'+selfPattern(card)+'$','i').test(continuousBase[2]),attached=/^(Enchanted|Equipped) (creature|artifact)$/.test(continuousBase[2]),filters=own||attached?null:groupSelectors(continuousBase[2]);
    const keywords=continuousBase[5]?helpers.keywordList(continuousBase[5]):[],subtypes=continuousBase[6]?continuousBase[6].split(' ').map(word=>ORACLE_SUBTYPES.has(word)?word:word.slice(0,-1)):[];
    const value=continuousBase[7]?extensionValue(continuousBase[7]):null,condition=line.startsWith('During your turn, ')?{kind:'your-turn'}:continuousBase[1]?extensionCondition(continuousBase[1]):null;
    if((own||attached||filters)&&keywords&&subtypes.every(type=>ORACLE_SUBTYPES.has(type))&&(!continuousBase[1]||condition)&&(!continuousBase[3].includes('X')&&!continuousBase[4].includes('X')||value)&&!JSON.stringify(condition||{}).includes('source-stat'))return {kind:'base-pt-static',own,attached,filters,power:continuousBase[3]==='X'?value:Number(continuousBase[3]),toughness:continuousBase[4]==='X'?value:Number(continuousBase[4]),keywords,subtypes,...(condition?{condition}:{}),contract:'base-pt-static'};
  }
  const copyEntry=new RegExp('^(?:If (.+?), you|You) may have '+selfPattern(card)+' enter as a copy of (?:any|a|an) (.+?)(?:, except (.+))?\\.$','i').exec(line.endsWith('"')?line+'.':line);
  if(copyEntry){
    const condition=copyEntry[1]?extensionCondition(copyEntry[1]):null;
    const filter=extensionTarget('target '+copyEntry[2].replace(' on the battlefield','').replace(' in a graveyard',' from a graveyard').replace(' in your graveyard',' from your graveyard'));
    if(!filter||!['battlefield','graveyard'].includes(filter.zone)||copyEntry[1]&&!condition)return null;
    const modifications={};let tail=copyEntry[3]||'';
    const pt=/^it's (\d+)\/(\d+)$/.exec(tail);
    if(pt){modifications.power=Number(pt[1]);modifications.toughness=Number(pt[2]);tail='';}
    const types=/^it's (?:a |an )?(.+?) in addition to its other (?:creature )?types(?: and (.+))?$/.exec(tail);
    if(types){
      const words=types[1].split(' '),main=words.filter(word=>['artifact','enchantment','creature'].includes(word));
      const subs=words.filter(word=>!main.includes(word));if(subs.some(word=>!ORACLE_SUBTYPES.has(word)))return null;
      modifications.types=main.map(word=>word[0].toUpperCase()+word.slice(1));modifications.subtypes=subs;tail=types[2]||'';
    }
    const grant=/^(?:it )?has (.+)$/.exec(tail);
    if(grant){
      const quoted=/^"(.+)"$/.exec(grant[1]);
      if(quoted){const child=extensionLine(card,quoted[1],helpers);if(!['generic-ability','generic-trigger','mana-source'].includes(child?.kind))return null;modifications.operation=child;}
      else{const keywords=helpers.keywordList(grant[1]);if(!keywords)return null;modifications.keywords=keywords;}
      tail='';
    }
    if(tail)return null;
    return {kind:'copy-as-enters',filter,modifications,...(condition?{condition}:{}),contract:'copy-as-enters'};
  }
  const combined=/^(When .+? enters) and (whenever .+?), (.+)$/.exec(line)||/^(Whenever you cast .+?) or ((?:a|an) .+? you control enters), (.+)$/.exec(line);
  if(combined){
    const prefixes=[combined[1],/^(?:when|whenever) /i.test(combined[2])?combined[2][0].toUpperCase()+combined[2].slice(1):'Whenever '+combined[2]];
    const children=prefixes.map(prefix=>extensionLine(card,prefix+', '+combined[3],helpers));
    if(children.every(child=>child?.kind==='generic-trigger'&&!child.zone&&!child.condition&&!child.onceEachTurn)&&!JSON.stringify(children).includes('event-card')&&!JSON.stringify(children).includes('event-player')){
      const clauses=children.flatMap(child=>[].concat(child.event).map(event=>({event,eventFilter:child.eventFilter})));
      return {...children[0],event:[...new Set(clauses.map(clause=>clause.event))],eventFilter:{kind:'either',clauses}};
    }
    return null;
  }
  const qualifiedCast=/^Whenever you cast (?:a|an) (.*?spell)(?: with mana value (\d+)( or greater| or less)?)?( from anywhere other than your hand| from exile| from your graveyard)?, (.+)$/.exec(line);
  if(qualifiedCast&&(qualifiedCast[2]||qualifiedCast[4])){
    const target=extensionTarget('target '+qualifiedCast[1]);
    const body=target&&helpers.effect(card,qualifiedCast[5]);
    if(target?.zone==='stack'&&body)return {kind:'generic-trigger',event:'cast',eventFilter:{kind:'qualified-cast',target:{...target,...(qualifiedCast[2]?{stat:'mv',threshold:Number(qualifiedCast[2]),comparison:qualifiedCast[3]===' or greater'?'greater':qualifiedCast[3]===' or less'?'less':'equal'}:{})},...(qualifiedCast[4]?{from:qualifiedCast[4].includes('anywhere')?'not-hand':qualifiedCast[4].includes('exile')?'exile':'graveyard'}:{})},...body,contract:'generic-trigger-effect'};
  }
  const graveBatch=/^Whenever one or more (.+?) (leave your graveyard|are put into your graveyard from (your library|anywhere))( during your turn)?, (.+)$/.exec(line);
  if(graveBatch){
    const phrase=graveBatch[1].replace(/\bcards\b/g,'card'),filter=extensionTarget('target '+phrase+' from your graveyard'),body=filter&&helpers.effect(card,graveBatch[5]);
    if(body)return {kind:'generic-trigger',event:graveBatch[2]==='leave your graveyard'?'cardsLeftGraveyard':'cardsToGraveyard',eventFilter:{kind:'graveyard-batch',target:filter,...(graveBatch[3]==='your library'?{from:'library'}:{})},...body,...(graveBatch[4]?{condition:{kind:'your-turn'}}:{}),contract:'generic-trigger-effect'};
  }
  const attackBatch=/^Whenever one or more (.+?) you control attack, (.+)$/.exec(line);
  if(attackBatch){const filters=groupSelectors(attackBatch[1]+' you control'),body=filters&&helpers.effect(card,attackBatch[2]);if(body&&!/\bthey\b|\bthose creatures\b/i.test(attackBatch[2]))return {kind:'generic-trigger',event:'attackersDeclared',eventFilter:{kind:'attackers-batch',filters},...body,contract:'generic-trigger-effect'};}
  const combatBatch=/^Whenever one or more (.+?) you control deal combat damage to a player, (.+)$/.exec(line);
  if(combatBatch){const filters=groupSelectors(combatBatch[1]+' you control'),body=filters&&helpers.effect(card,combatBatch[2]);if(body&&!/\bthey\b|\bthose creatures\b/i.test(combatBatch[2]))return {kind:'generic-trigger',event:'combatDamageGroupToPlayer',eventFilter:{kind:'combat-damage-batch',filters},...body,contract:'generic-trigger-effect'};}
  if(line.endsWith('"'))line+='.';
  const numberedCast=/^Whenever you cast your (first|second|third) (?:(instant or sorcery|enchantment|creature|noncreature) )?spell (each turn|during each opponent's turn), (.+)$/.exec(line);
  if(numberedCast){const body=helpers.effect(card,numberedCast[4]);if(body)return {kind:'generic-trigger',event:'cast',eventFilter:{kind:'your-numbered-cast',n:{first:1,second:2,third:3}[numberedCast[1]],what:numberedCast[2]||'card',opponentsTurn:numberedCast[3]!== 'each turn'},...body,contract:'generic-trigger-effect'};}
  const historical=/^Whenever you cast a historic spell, (.+)$/.exec(line);
  if(historical){const body=helpers.effect(card,historical[1]);if(body)return {kind:'generic-trigger',event:'cast',eventFilter:{kind:'your-filtered-cast',what:'historic'},...body,contract:'generic-trigger-effect'};}
  const attack=/^Whenever you attack, (.+)$/.exec(line);
  if(attack){let text=attack[1],condition;const branch=/^if (.+?), (.+)$/.exec(text);if(branch){condition=extensionCondition(branch[1]);if(!condition)return null;text=branch[2];}const body=helpers.effect(card,text);if(body)return {kind:'generic-trigger',event:'attackersDeclared',eventFilter:'your-attackers',...body,...(condition?{condition}:{}),contract:'generic-trigger-effect'};}
  const cycling=/^(When you cycle this card|Whenever you cycle a card), (.+)$/.exec(line);
  if(cycling){const body=helpers.effect(card,cycling[2]);if(body&&!body.effects.some(effect=>effect.target==='self'))return {kind:'generic-trigger',event:'cycled',eventFilter:cycling[1].startsWith('When ')?'self':'your-player',...(cycling[1].startsWith('When ')?{zone:'cycling-source'}:{}),...body,contract:'generic-trigger-effect'};}
  const transmute=/^Transmute ((?:\{(?:\d+|[WUBRGC])\})+)$/.exec(line);
  if(transmute){
    const mv=[...(card.mana_cost||'').matchAll(/\{([^}]+)\}/g)].reduce((sum,match)=>sum+(/^\d+$/.test(match[1])?Number(match[1]):match[1]==='X'?0:match[1].startsWith('2/')?2:1),0);
    return {kind:'generic-ability',from:'hand',sorceryOnly:true,cost:{mana:transmute[1]},targets:[],effects:[{action:'search-library',what:'card',filter:{what:'card',zone:'graveyard',controller:'you',stat:'mv',threshold:mv,comparison:'equal'},maxMv:null,n:1,destination:'hand',reveal:true}],contract:'generic-activated-effect'};
  }
  const scavenge=/^Scavenge ((?:\{(?:\d+|[WUBRGC])\})+)$/.exec(line);
  if(scavenge)return {kind:'generic-ability',from:'graveyard',cost:{mana:scavenge[1],exileSelf:true},sorceryOnly:true,targets:[extensionTarget('target creature')],effects:[{action:'counter',target:0,counter:'+1/+1',n:{kind:'grave-source-power'}}],contract:'generic-activated-effect'};
  const graveActivation=/^(?:Renew — )?((?:\{(?:\d+|[WUBRGC])\})+), Exile this card from your graveyard: (.+)$/.exec(line);
  if(graveActivation){const sorceryOnly=/ Activate only as a sorcery\.$/.test(graveActivation[2]),body=helpers.effect(card,graveActivation[2].replace(/ Activate only as a sorcery\.$/,''));if(body&&!JSON.stringify(body).includes('source-stat'))return {kind:'generic-ability',from:'graveyard',cost:{mana:graveActivation[1],exileSelf:true},sorceryOnly,...body,contract:'generic-activated-effect'};return null;}
  const loyalty=/^([+−-]?\d+): (.+)$/.exec(line);
  if(loyalty&&card.type_line.includes('Planeswalker')){
    const body=helpers.effect(card,loyalty[2]);
    if(body)return {kind:'generic-ability',cost:{},loyalty:Number(loyalty[1].replace('−','-')),sorceryOnly:true,...body,contract:'generic-activated-effect'};
    return null;
  }

  const powerUp=/^Power-up — (.+)$/.exec(line);
  if(powerUp){
    const child=extensionLine(card,powerUp[1],helpers);
    const simple=/^(?:\{(?:\d+|X|[WUBRGC])\})*$/;
    if(child?.kind==='generic-ability'&&!child.from&&simple.test(card.mana_cost||'')&&simple.test(child.cost?.mana||''))return {...child,powerUp:true,oncePerObject:true};
    return null;
  }
  const limited=/^(Exhaust|Boast) — (.+)$/.exec(line);
  if(limited){const child=extensionLine(card,limited[2],helpers);if(child?.kind==='generic-ability'&&!child.from){return {...child,...(limited[1]==='Exhaust'?{oncePerObject:true}:{onceEachTurn:true,activationCondition:child.activationCondition?{kind:'all',conditions:[child.activationCondition,{kind:'source-attacked'}]}:{kind:'source-attacked'}})};}return null;}
  if(line==='Sunburst')return {kind:'enters-with-counters',counter:card.type_line.includes('Creature')?'+1/+1':'charge',n:{kind:'paid-colors'},contract:'permanent-enters-with-counters'};
  line=normalizeAbilityWords(line);
  line=line.replace(/^When (.+?) (attacks|blocks|becomes tapped|becomes untapped), /,'Whenever $1 $2, ');
  const sourceAlias=selfPattern(card);
  const sourceOrOther=new RegExp('^Whenever '+sourceAlias+' or another (.+?) (enters|dies|attacks|leaves the battlefield), (.+)$','i').exec(line);
  if(sourceOrOther){const target=extensionTarget('target '+sourceOrOther[1]),body=helpers.effect(card,sourceOrOther[3]);if(target?.zone==='battlefield'&&body)return {kind:'generic-trigger',event:{enters:'etb',dies:'dies',attacks:'attacks','leaves the battlefield':'lto'}[sourceOrOther[2]],eventFilter:{kind:'filtered-object',target,includeSelf:true},...body,contract:'generic-trigger-effect'};}
  const pairedSelf=new RegExp('^Whenever '+sourceAlias+' (enters or dies|enters or leaves the battlefield), (.+)$','i').exec(line);
  if(pairedSelf)return extensionLine(card,line.replace(/^Whenever /,'When '),helpers);
  if(/^Whenever you cast a spell, /.test(line)){const body=helpers.effect(card,line.slice('Whenever you cast a spell, '.length));if(body)return {kind:'generic-trigger',event:'cast',eventFilter:{kind:'your-filtered-cast',what:'card'},...body,contract:'generic-trigger-effect'};}
  const filteredCombat=/^Whenever (?:a|an) (.+?) (?:creature )?deals combat damage to a player, (.+)$/.exec(line);
  if(filteredCombat){const target=extensionTarget('target '+filteredCombat[1]),text=filteredCombat[2],body=target&&helpers.effect(card,text);if(target?.zone==='battlefield'&&body){
    const implicit=!/\btarget\b|\bthis (?:creature|permanent)\b/.test(text),map=value=>Array.isArray(value)?value.map(map):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,key==='target'&&item==='self'&&implicit?'event-card':key==='kind'&&item==='source-stat'&&implicit?'event-card-stat':map(item)])):value;
    return {kind:'generic-trigger',event:'combatDamageToPlayer',eventFilter:{kind:'filtered-object',target},...body,effects:body.effects.map(map),contract:'generic-trigger-effect'};
  }}
  // Cosmetic ability words have no rules meaning, but only remove the exact
  // known prefix, never any Oracle sentence following it.
  line=line.replace(/^(?:Landfall|Heroic|Raid|Threshold|Metalcraft|Delirium|Revolt|Morbid|Ferocious|Coven|Pack tactics|Rally|Alliance|Eerie|Survival|Flurry|Opus|Battalion|Formidable|Enrage|Magecraft|Corrupted|Constellation|Inspired|Hellbent|Kinship|Domain|Vivid|Adamant|Fateful hour|Renew|Channel|Bloodrush|Descend [48]|Fathomless descent|Undergrowth|Celebration|Beacon of Hope) — /,'');
  if(line.endsWith(' This ability triggers only once each turn.')){const child=extensionLine(card,line.replace(/ This ability triggers only once each turn\.$/,''),helpers);if(child?.kind==='generic-trigger')return {...child,onceEachTurn:true,onceGroup:line};}
  const kickedEntry=/^If this creature was kicked, it enters with (.+)\.$/.exec(line);
  if(kickedEntry)return extensionLine(card,'This creature enters with '+kickedEntry[1]+' if it was kicked.',helpers);
  const reinforce=/^Reinforce (\d+)—((?:\{(?:\d+|[WUBRGC])\})+)$/.exec(line);
  if(reinforce)return {kind:'generic-ability',from:'hand',cost:{mana:reinforce[2]},targets:[extensionTarget('target creature')],effects:[{action:'counter',target:0,counter:'+1/+1',n:Number(reinforce[1])}],contract:'generic-activated-effect'};
  const outlast=/^Outlast ((?:\{(?:\d+|[WUBRGC])\})+)$/.exec(line);
  if(outlast)return extensionLine(card,outlast[1]+', {T}: Put a +1/+1 counter on this creature. Activate only as a sorcery.',helpers);
  const extended = extendedLine(card, line, helpers);
  if (extended) return extended;
  const characteristic=characteristicOperation(card,line);
  if(characteristic)return characteristic;
  const self=selfPattern(card);
  const damagePlayer=new RegExp('^Whenever '+self+' deals (combat )?damage to (a player|an opponent), (.+)$','i').exec(line);
  if(damagePlayer){const body=helpers.effect(card,damagePlayer[3]);if(body)return {kind:'generic-trigger',event:damagePlayer[1]?'combatDamageToPlayer':'damageToPlayer',eventFilter:{kind:'source-damage-player',opponent:damagePlayer[2]==='an opponent'},...body,contract:'generic-trigger-effect'};}
  const unblocked=new RegExp('^Whenever '+self+" attacks and isn't blocked, (.+)$",'i').exec(line);
  if(unblocked){const body=helpers.effect(card,unblocked[1].replace(/\bdefending player\b/g,'that player'));if(body)return {kind:'generic-trigger',event:'blockersDeclared',eventFilter:'self-unblocked',...body,contract:'generic-trigger-effect'};}
  const combatOther=new RegExp('^Whenever '+self+' (blocks|becomes blocked by|blocks or becomes blocked by) (?:a|an) (.+?), (.+)$','i').exec(line);
  if(combatOther){const otherFilter=extensionTarget('target '+combatOther[2]),body=otherFilter&&helpers.effect(card,combatOther[3]);if(otherFilter?.zone==='battlefield'&&body)return {kind:'generic-trigger',event:combatOther[1]==='blocks'?'blocks':combatOther[1]==='becomes blocked by'?'becomesBlockedByCreature':['blocks','becomesBlockedByCreature'],eventFilter:{kind:'self-creature-combat',otherFilter},...body,contract:'generic-trigger-effect'};}
  const sacrificed=/^Whenever you sacrifice (another |a |an )(.+?)( during your turn)?, (.+)$/.exec(line);
  if(sacrificed){const target=extensionTarget('target '+sacrificed[2]),body=target&&helpers.effect(card,sacrificed[4]);if(target?.zone==='battlefield'&&body)return {kind:'generic-trigger',event:'sacrificed',eventFilter:{kind:'filtered-sacrifice',target,another:sacrificed[1]==='another '},...body,...(sacrificed[3]?{condition:{kind:'your-turn'}}:{}),contract:'generic-trigger-effect'};}
  const targeted=new RegExp('^Whenever ('+self+'|a creature you control) becomes the target of a spell or ability( an opponent controls)?, (.+)$','i').exec(line);
  if(targeted){const body=helpers.effect(card,targeted[3])||extensionV4Body(card,targeted[3]);if(body&&!JSON.stringify(body).includes('event-card-controller'))return {kind:'generic-trigger',event:'targeted',eventFilter:{kind:'targeted-object',self:targeted[1].toLowerCase()!=='a creature you control',opponent:!!targeted[2]},...body,contract:'generic-trigger-effect'};}
  const blocked=new RegExp('^Whenever '+self+' (blocks or becomes blocked|becomes blocked), (.+)$','i').exec(line);
  if(blocked){const body=helpers.effect(card,blocked[2])||extensionV4Body(card,blocked[2]);if(body&&!JSON.stringify(body).includes('event-card'))return {kind:'generic-trigger',event:blocked[1]==='becomes blocked'?'becomesBlocked':['blocks','becomesBlocked'],eventFilter:'self-block-combat',...body,contract:'generic-trigger-effect'};}
  const handActivation=/^((?:\{(?:\d+|X|[WUBRGC])\})+), Discard this card: (.+)$/.exec(line);
  if(handActivation){const parsed=helpers.effect(card,handActivation[2])||extensionV4Body(card,handActivation[2]);if(parsed)return {kind:'generic-ability',from:'hand',cost:{mana:handActivation[1]},...parsed,contract:'generic-activated-effect'};}
  const selfOrOther=new RegExp('^Whenever '+self+' or another (.+ you control) (enters|dies|attacks), (.+)$','i').exec(line);
  if(selfOrOther){const operation=extensionLine(card,'Whenever a '+selfOrOther[1]+' '+selfOrOther[2]+', '+selfOrOther[3],helpers);if(operation?.eventFilter?.kind==='filtered-object')return {...operation,eventFilter:{...operation.eventFilter,includeSelf:true}};}
  const twoEvents=new RegExp('^Whenever '+self+' (enters or attacks|attacks or dies), (.+)$','i').exec(line);
  if(twoEvents){const body=helpers.effect(card,twoEvents[2])||extensionV4Body(card,twoEvents[2]);if(body)return {kind:'generic-trigger',event:twoEvents[1].split(' or ').map(event=>event==='enters'?'etb':event),eventFilter:'self',...body,contract:'generic-trigger-effect'};}
  const objectEvent=/^(?:Whenever|When) (another )?(?:(?:a|an) )?(.+?) (enters|dies|attacks|blocks|becomes tapped|becomes untapped|is put into a graveyard from the battlefield), (.+)$/.exec(line);
  if(objectEvent){
    const target=extensionTarget('target '+objectEvent[2]);
    if(target&&target.zone==='battlefield'&&!target.enchanted&&!target.equipped){
      let body=objectEvent[4],condition;
      const conditional=/^if (.+?), (.+)$/.exec(body);
      if(conditional){condition=extensionCondition(conditional[1]);if(!condition)return null;body=conditional[2];}
      if(/^it /i.test(body))body=body.replace(/^it /i,'that creature ');
      if(/\bits\b/i.test(body)&&!/^you gain life equal to its (?:power|toughness)\.$/i.test(body)&&!/^its controller (?:draws|gains|loses|mills|discards) /i.test(body))return null;
      const parsed=helpers.effect(card,body)||extensionV4Body(card,body);
      if(parsed&&target.what==='land'&&/\bIf that land is /.test(body)){
        const bind=effect=>({...effect,...(effect.action==='conditional'&&effect.condition.kind==='source-quality'&&effect.condition.filter.what==='land'?{conditionTarget:'event-card'}:{}),...(effect.effects?{effects:effect.effects.map(bind)}:{}),...(effect.elseEffects?{elseEffects:effect.elseEffects.map(bind)}:{})});parsed.effects=parsed.effects.map(bind);
      }
      if(parsed)return {kind:'generic-trigger',event:({enters:'etb',dies:'dies',attacks:'attacks',blocks:'blocks','becomes tapped':'becameTapped','becomes untapped':'becameUntapped','is put into a graveyard from the battlefield':'dies'})[objectEvent[3]],eventFilter:{kind:'filtered-object',target,another:!!objectEvent[1]},...parsed,...(condition?{condition}:{}),contract:'generic-trigger-effect'};
    }
  }
  const eventRules=[
    ['scry','your-player',/^Whenever you scry, (.+)$/i],
    ['draw','your-player',/^Whenever you draw a card, (.+)$/i],
    [['attacks','blocks'],'self-combat',new RegExp('^Whenever '+self+' attacks or blocks, (.+)$','i')],
    ['dealtDamage','self-damaged',new RegExp('^Whenever '+self+' is dealt damage, (.+)$','i')],
    ['becameUntapped','self',new RegExp('^Whenever '+self+' becomes untapped, (.+)$','i')],
    ['countersPlaced',{kind:'source-counters',counter:'+1/+1'},new RegExp('^Whenever one or more \\+1/\\+1 counters are put on '+self+', (.+)$','i')],
    ['upkeep','each-upkeep',/^At the beginning of each player's upkeep, (.+)$/i],
    ['upkeep','opponent-player',/^At the beginning of each opponent's upkeep, (.+)$/i],
    ['endStep','opponent-player',/^At the beginning of each opponent's end step, (.+)$/i],
    ['draw','opponent-player',/^Whenever an opponent draws a card, (.+)$/i],
    ['draw','any-player',/^Whenever a player draws a card, (.+)$/i],
    [['cast','spellCopied'],{kind:'magecraft'},/^Whenever you cast or copy an instant or sorcery spell, (.+)$/i],
  ];
  for(const [event,eventFilter,re]of eventRules){const m=re.exec(line);if(!m)continue;const parsed=helpers.effect(card,m[1])||extensionV4Body(card,m[1]);if(parsed)return {kind:'generic-trigger',event,eventFilter,...parsed,contract:'generic-trigger-effect'};return null;}
  const foreignCast=/^Whenever (a player|an opponent) casts (?:a|an) (?:(white|blue|black|red|green|artifact|enchantment|creature|noncreature|multicolored|colorless|instant or sorcery|[A-Z][a-z]+) )?spell, (.+)$/.exec(line);
  if(foreignCast){const parsed=helpers.effect(card,foreignCast[3])||extensionV4Body(card,foreignCast[3]);if(parsed)return {kind:'generic-trigger',event:'cast',eventFilter:{kind:'your-filtered-cast',what:foreignCast[2]||'card',controller:foreignCast[1]==='a player'?'any':'opponent'},...parsed,contract:'generic-trigger-effect'};}
  const numbered=/^(Soulshift|Modular|Fabricate|Afflict|Dredge|Devour|Graft) (\d+)$/.exec(line);
  if(numbered) return {kind:'mechanic-'+numbered[1].toLowerCase(),n:Number(numbered[2]),contract:'mechanic-'+numbered[1].toLowerCase()};
  const offspring=/^Offspring ((?:\{(?:\d+|[WUBRGC])\})+)$/.exec(line);
  if(offspring) return {kind:'mechanic-offspring',cost:offspring[1],contract:'mechanic-offspring'};
  const zoneMechanic=/^(Unearth|Ninjutsu|Embalm|Eternalize|Foretell|Plot) ((?:\{(?:\d+|[WUBRGC])\})+)$/.exec(line);
  if(zoneMechanic)return {kind:'mechanic-'+zoneMechanic[1].toLowerCase(),cost:zoneMechanic[2],contract:'mechanic-'+zoneMechanic[1].toLowerCase()};
  const graveReturn=/^((?:\{(?:\d+|[WUBRGC])\})+): Return this card from your graveyard to your hand\.$/.exec(line);
  if(graveReturn)return {kind:'mechanic-grave-return-self',cost:graveReturn[1],contract:'mechanic-grave-return-self'};
  if(['Ingest','Living weapon','For Mirrodin!'].includes(line)) {
    const name={'Ingest':'ingest','Living weapon':'living-weapon','For Mirrodin!':'for-mirrodin'}[line];
    return {kind:'mechanic-'+name,contract:'mechanic-'+name};
  }
  const patterns=[
    ['etb','self',new RegExp('^When '+self+' enters, (.+)$','i')],
    ['lto','self',new RegExp('^When '+self+' leaves the battlefield, (.+)$','i')],
    [['etb','lto'],'self',new RegExp('^When '+self+' enters or leaves the battlefield, (.+)$','i')],
    ['becameTapped','self',new RegExp('^Whenever '+self+' becomes tapped, (.+)$','i')],
    ['dies','self',new RegExp('^When '+self+' dies, (.+)$','i')],
    [['etb','dies'],'self',new RegExp('^When '+self+' enters or dies, (.+)$','i')],
    [['damageToPlayer','dealtDamage'],'self-source',new RegExp('^Whenever '+self+' deals damage, (.+)$','i')],
    ['dies','self',new RegExp('^When '+self+' is put into a graveyard from the battlefield, (.+)$','i')],
    ['attacks','self',new RegExp('^Whenever '+self+' attacks, (.+)$','i')],
    ['targeted','self',new RegExp('^When '+self+' becomes the target of a spell or ability, (.+)$','i')],
    ['cast','your-spell-targets-self',new RegExp('^Whenever you cast a spell that targets '+self+', (.+)$','i')],
    ['combatDamageToPlayer','self',new RegExp('^Whenever '+self+' deals combat damage to a player, (.+)$','i')],
    ['turnedFaceUp','self',new RegExp('^When '+self+' is turned face up, (.+)$','i')],
    ['upkeep','your-upkeep',/^At the beginning of your upkeep, (.+)$/i],
    ['drawStep','your-draw-step',/^At the beginning of your draw step, (.+)$/i],
    ['upkeep','each-upkeep',/^At the beginning of each upkeep, (.+)$/i],
    ['endStep','each-end-step',/^At the beginning of (?:the|each) end step, (.+)$/i],
    ['endStep','your-end-step',/^At the beginning of your end step, (.+)$/i],
    ['beginCombat','your-combat',/^At the beginning of combat on your turn, (.+)$/i],
    ['landfall','your-landfall',/^Whenever a land you control enters, (.+)$/i],
    ['castIS','your-cast',/^Whenever you cast an instant or sorcery spell, (.+)$/i],
    ['castNonCreature','your-cast',/^Whenever you cast a noncreature spell, (.+)$/i],
    ['castCreature','your-cast',/^Whenever you cast a creature spell, (.+)$/i],
    ['lifeGain','your-life-gain',/^Whenever you gain life, (.+)$/i],
    ['draw','your-second-draw',/^Whenever you draw your second card each turn, (.+)$/i],
    ['etb','any-creature',/^Whenever a creature enters, (.+)$/i],
    ['etb','another-creature',/^Whenever another creature enters, (.+)$/i],
    ['etb','your-creature',/^Whenever a creature you control enters, (.+)$/i],
    ['etb','another-your-creature',/^Whenever another creature you control enters, (.+)$/i],
    ['dies','your-creature',/^Whenever a creature you control dies, (.+)$/i],
    ['dies','any-creature',/^Whenever a creature dies, (.+)$/i],
    ['dies','another-creature',/^Whenever another creature dies, (.+)$/i],
    ['cast',{kind:'your-subtype-cast',subtypes:['Spirit','Arcane']},/^Whenever you cast a Spirit or Arcane spell, (.+)$/i],
    ['discarded','your-draw',/^Whenever you (?:cycle or )?discard a card, (.+)$/i],
  ];
  const castType=/^Whenever you cast (?:a|an) (white|blue|black|red|green|multicolored|colorless|artifact|enchantment|[A-Z][a-z]+) spell, (.+)$/.exec(line);
  if(castType) {
    const parsed=helpers.effect(card,castType[2])||extensionV4Body(card,castType[2]);
    if(parsed)return {kind:'generic-trigger',event:'cast',eventFilter:{kind:'your-filtered-cast',what:castType[1]},...parsed,contract:'generic-trigger-effect'};
  }
  const tribal=new RegExp('^Whenever (?:'+self+' or )?(another )?([A-Z][a-z]+)(?: creature)? you control (enters|dies), (.+)$').exec(line);
  if(tribal) {
    const parsed=helpers.effect(card,tribal[4])||extensionV4Body(card,tribal[4]);
    if(parsed)return {kind:'generic-trigger',event:tribal[3]==='enters'?'etb':'dies',eventFilter:{kind:'your-subtype',subtype:tribal[2],another:!!tribal[1]&&!line.includes(' or ')},...parsed,contract:'generic-trigger-effect'};
  }
  for(const [event,eventFilter,re] of patterns) {
    const m=new RegExp(re.source,re.flags+'s').exec(line); if(!m) continue;
    let body=m[1],condition=null;
    const conditional=/^if (.+?), (.+)$/.exec(body);
    if(conditional) {condition=extensionCondition(conditional[1]);if(!condition)return null;body=conditional[2];}
    if(event==='drawStep')body=body.replace(/^draw an additional card\.$/i,'draw a card.');
    const parsed=helpers.effect(card,body)||extensionV4Body(card,body);

    if(parsed) return {kind:'generic-trigger',event,eventFilter,...parsed,...(condition?{condition}:{}),contract:'generic-trigger-effect'};
    return null;
  }
  const activated=/^(.+): (.+)$/.exec(line);
  if(activated) {
    const cost=helpers.cost(activated[1]); if(!cost) return null;
    let body=activated[2];
    const restriction=/ Activate only (?:if (.+)|during your (turn|upkeep))\.$/.exec(body);
    const activationCondition=restriction?extensionCondition(restriction[1]||"it's your "+restriction[2]):null;
    if(restriction&&!activationCondition)return null;
    if(restriction)body=body.slice(0,restriction.index);
    const onceEachTurn=/ Activate only once each turn\.$/i.test(body);
    const sorceryOnly=/ Activate only as a sorcery\.$/i.test(body);
    body=body.replace(/ Activate only (?:once each turn|as a sorcery)\.$/i,'');
    const parsed=helpers.effect(card,body)||extensionV4Body(card,body);
    if(parsed&&JSON.stringify(parsed).includes('"action":"return-grave-source"')){
      if(Object.keys(cost).some(key=>!['mana','discard','discardFilter','tapFilter','tapN','sacWhat','sacOther','sacFilter','sacN','exileFilter','exileFromGY'].includes(key))||onceEachTurn||JSON.stringify(parsed).includes('"action":"add-mana"'))return null;
      return {kind:'generic-ability',from:'graveyard',retainGraveSource:true,cost,...parsed,onceEachTurn,sorceryOnly,...(activationCondition?{activationCondition}:{}),contract:'generic-activated-effect'};
    }
    // Tapping arbitrary permanents for mana needs the mana resource planner;
    // keep that family closed until its simultaneous resource proof exists.
    if(cost.tapFilter&&JSON.stringify(parsed||{}).includes('"action":"add-mana"'))return null;
    if(parsed && (!parsed.v4Body||parsed.v4Body.operations[0].kind==='sequence') && !parsed.v4Body?.targets.some(target=>target.quantity.max===null)) return {kind:'generic-ability',cost,...parsed,onceEachTurn,sorceryOnly,...(activationCondition?{activationCondition}:{}),contract:'generic-activated-effect'};
  }
  let m=new RegExp('^'+self+' can\'t be blocked by creatures with power (\\d+) or greater\\.$','i').exec(line);
  if(m) return {kind:'generic-static',scope:'self',evasionMinBlockerPower:Number(m[1]),contract:'generic-continuous-effect'};
  m=new RegExp('^'+self+" can't be blocked by (artifact creatures|white creatures|blue creatures|black creatures|red creatures|green creatures|Walls)\\.$",'i').exec(line);
  if(m)return {kind:'generic-static',scope:'self',excludedBlockers:m[1].toLowerCase(),contract:'generic-continuous-effect'};
  if(new RegExp('^'+self+" can't be blocked except by creatures with flying or reach\\.$",'i').test(line))return {kind:'generic-static',scope:'self',blockedOnlyByFlyingOrReach:true,contract:'generic-continuous-effect'};
  m=/^(All ([A-Z][a-z]+) creatures|Creatures your opponents control|Other ([A-Z][a-z]+)s you control) get ([+-]\d+)\/([+-]\d+)\.$/.exec(line);
  if(m)return {kind:'generic-static',scope:m[1].startsWith('All ')?'all-creatures':m[1].startsWith('Other ')?'your-other-creatures':'opponent-creatures',subtype:m[2]||m[3]||null,power:Number(m[4]),toughness:Number(m[5]),contract:'generic-continuous-effect'};
  if(new RegExp('^Creatures with power less than '+self+"'s power can't block it\\.$",'i').test(line))return {kind:'generic-static',scope:'self',evasionLessThanOwnPower:true,contract:'generic-continuous-effect'};
  m=new RegExp('^As long as (.+), ('+self+' (?:gets?|has) .+)\\.$','i').exec(line);
  if(m)return extensionLine(card,m[2]+' as long as '+m[1]+'.',helpers);
  m=new RegExp('^'+self+' gets ([+-]\\d+)/([+-]\\d+) for each (.+)\\.$','i').exec(line);
  if(m) { const count=extensionCount(m[3]);if(count)return {kind:'generic-static',scope:'self',power:Number(m[1]),toughness:Number(m[2]),multiplier:count,contract:'generic-continuous-effect'}; }
  m=new RegExp('^'+self+' gets ([+-]\\d+)/([+-]\\d+)(?: and has (.+))? as long as (.+)\\.$','i').exec(line);
  if(m) {
    const condition=extensionCondition(m[4]); const keywords=m[3]?helpers.keywordList(m[3]):[];
    if(condition && keywords) return {kind:'generic-static',scope:'self',power:Number(m[1]),toughness:Number(m[2]),keywords,condition,contract:'generic-continuous-effect'};
  }
  m=new RegExp('^'+self+' has (.+) as long as (.+)\\.$','i').exec(line);
  if(m) { const condition=extensionCondition(m[2]),keywords=helpers.keywordList(m[1]); if(condition && keywords) return {kind:'generic-static',scope:'self',keywords,condition,contract:'generic-continuous-effect'}; }
  return null;
}

function extensionV4Body(card,text) {
  const optional=/^you may /i.test(text);
  const body=(optional?text.slice(8):text).replace(/\bthis (?:creature|artifact|enchantment|land) deals\b/gi,card.name+' deals');
  const parsed=parseOracleSpellV4(card,body.charAt(0).toUpperCase()+body.slice(1));
  // Casting costs and modal selection have different announcement timing.
  // This adapter accepts only an ordinary effect sequence, with no costs.
  if(!parsed.ok||parsed.additionalCosts.length) return null;
  const top=parsed.operations[0];
  if(top.kind!=='sequence'&&!(top.kind==='modal'&&top.choose.min===1&&top.choose.max===1))return null;
  if(optional&&parsed.effects.length!==1)return null;
  return {optional,targets:[],effects:[],v4Body:{kind:'spell-v4',parserVersion:4,additionalCosts:[],targets:parsed.targets,effects:parsed.effects,operations:parsed.operations}};
}

export function extensionCondition(text) {
  if(/^you cast (?:this spell|it) during your main phase$/.test(text))return {kind:'cast-main-phase'};
  const paid=/^((?:\{[WUBRGC]\})+) was spent to cast (?:this spell|it)$/.exec(text);
  if(paid)return {kind:'mana-spent',colors:[...paid[1].matchAll(/\{([WUBRGC])\}/g)].map(m=>m[1])};
  const adamant=new RegExp('^at least ('+NUM+') (white|blue|black|red|green|colorless) mana was spent to cast (?:this spell|it)$').exec(text);
  if(adamant)return {kind:'mana-spent',colors:[{white:'W',blue:'U',black:'B',red:'R',green:'G',colorless:'C'}[adamant[2]]],min:amount(adamant[1])};
  if(text==='no mana was spent to cast it')return {kind:'no-mana-spent'};
  if(text==="it wasn't cast")return {kind:'not',condition:{kind:'source-was-cast'}};
  text=text.replace(new RegExp('^you control at least ('+NUM+') '),'you control $1 or more ');
  const battlefieldExists=/^(?:there is (?:a|an) (.+?)|there's (another creature)|(?:a|an) (.+?) is) on the battlefield$/.exec(text);
  if(battlefieldExists){const noun=battlefieldExists[1]||battlefieldExists[2]||battlefieldExists[3],other=noun.startsWith('another '),filters=groupSelectors(noun.replace(/^another /,''));if(filters)return {kind:'count-comparison',count:{kind:'count',zone:'battlefield',what:'permanent',controller:'all',filters,...(other?{other:true}:{})},min:1};}
  const playerZone=new RegExp('^(an opponent|a player) has (no|'+NUM+')( or more| or fewer)? cards in (?:their (graveyard)|hand)$').exec(text);
  if(playerZone)return {kind:'player-zone-count',players:playerZone[1]==='an opponent'?'opponents':'all',zone:playerZone[4]?'graveyard':'hand',...(playerZone[3]===' or more'?{min:amount(playerZone[2])}:playerZone[3]===' or fewer'?{max:amount(playerZone[2])}:{min:playerZone[2]==='no'?0:amount(playerZone[2]),max:playerZone[2]==='no'?0:amount(playerZone[2])})};
  if(/^(?:it|this creature) is modified$/.test(text)||text==="it's modified")return {kind:'any',conditions:[{kind:'source-any-counter'},{kind:'source-status',status:'enchanted'},{kind:'source-status',status:'equipped'}]};
  if(text==='you own a card in exile')return {kind:'count-comparison',count:{kind:'count',zone:'exile',what:'card'},min:1};
  if(text==="it's your upkeep")return {kind:'your-phase',phase:'upkeep'};
  if(text==="it's your main phase")return {kind:'your-phase',phase:'main'};
  if(text==='you lost life this turn')return {kind:'turn-stat',field:'lifeLost',min:1};
  const eitherControl=/^you control (?:a|an) (.+?) or (?:a|an) (.+)$/.exec(text);
  if(eitherControl){const conditions=eitherControl.slice(1).map(noun=>extensionCondition('you control a '+noun));if(conditions.every(Boolean))return {kind:'any',conditions};}
  if(text.includes(' or ')){const conditions=text.split(' or ').map(extensionCondition);if(conditions.every(Boolean))return {kind:'any',conditions};}
  if(/^(?:you gained or lost life|you have gained or lost life) this turn$/.test(text))return {kind:'any',conditions:[{kind:'turn-stat',field:'lifeGained',min:1},{kind:'turn-stat',field:'lifeLost',min:1}]};
  if(text==='a creature died under your control this turn')return {kind:'turn-stat',field:'creaturesDiedUnder',min:1};
  if(text==='you have a full party')return {kind:'count-comparison',count:{kind:'party'},min:4};
  const exactCount=new RegExp('^you control exactly ('+NUM+') (.+)$').exec(text);
  if(exactCount){const count=extensionCount(exactCount[2]+' you control');if(count)return {kind:'count-comparison',count,min:amount(exactCount[1]),max:amount(exactCount[1])};}
  const manaValues=new RegExp('^there are ('+NUM+') or more mana values among cards in your graveyard$').exec(text);
  if(manaValues)return {kind:'count-comparison',count:{kind:'count',zone:'graveyard',what:'card',unique:'mana-values'},min:amount(manaValues[1])};
  const ownStat=/^(this (?:creature|artifact|permanent)'s|its) (power|toughness) (is|was) (\d+) or (greater|less)$/.exec(text);
  if(ownStat)return {kind:'source-stat-comparison',stat:ownStat[2],past:ownStat[3]==='was',implicit:ownStat[1]==='its',threshold:Number(ownStat[4]),comparison:ownStat[5]};
  if(/^(?:this creature|it|this spell) (?:wasn't|was not) kicked$/.test(text))return {kind:'not',condition:{kind:'kicked'}};
  if(/^(?:you cast it|it was cast)$/.test(text))return {kind:'source-was-cast'};
  if(/^you control (?:a|your) commander$/.test(text))return {kind:'control-commander'};
  if(/^(?:you're|you are) the monarch$/.test(text))return {kind:'monarch'};
  if(/^(?:it|this creature|this permanent) has (?:a|one or more) counters? on it$/.test(text))return {kind:'source-any-counter'};
  const quality=/^(?:it is|it's|this (?:creature|artifact|enchantment|land|permanent) is|that (?:creature|permanent|artifact|enchantment|land) is) (?:an? )?(.+)$/.exec(text);
  if(quality){const noun=/^(?:white|blue|black|red|green|colorless|multicolored|legendary|nonlegendary|token|nontoken)$/.test(quality[1])?quality[1]+' permanent':quality[1],filter=extensionTarget('target '+noun);if(filter?.zone==='battlefield')return {kind:'source-quality',filter};}
  const casts=new RegExp("^you(?:'ve| have) cast ("+NUM+') or more (spells|noncreature spells) this turn$').exec(text);
  if(casts)return {kind:'turn-stat',field:casts[2]==='spells'?'spellsCast':'nonCreatureSpells',min:amount(casts[1])};
  if(text==='a permanent left the battlefield under your control this turn')return {kind:'turn-stat',field:'permanentsLeftBattlefield',min:1};
  const sourceCounter=/^(?:it|this creature|this artifact|this permanent) has (?:a|one or more) (\+1\/\+1|-1\/-1|[a-z]+) counters? on it$/.exec(text);
  if(sourceCounter)return {kind:'count-comparison',count:{kind:'source-counters',counter:sourceCounter[1]},min:1};
  if(/^(?:it|this creature|this artifact|this enchantment|this land|this permanent) entered this turn$/.test(text))return {kind:'source-entry-turn'};
  if(text==='an opponent is poisoned')return {kind:'opponent-poison',min:1};
  const haveLife=/^you have (\d+) or (more|less) life$/.exec(text);
  if(haveLife)return {kind:'life',threshold:Number(haveLife[1]),comparison:haveLife[2]==='more'?'greater':'less'};
  const not=/^you (?:don't|do not) control (.+)$/.exec(text);
  if(not){const condition=extensionCondition('you control '+not[1]);return condition?{kind:'not',condition}:null;}
  const none=/^you control no (.+?)( other than this (?:creature|permanent))?$/.exec(text);
  if(none){const count=extensionCount(none[1]+' you control');if(count)return {kind:'count-comparison',count:{...count,...(none[2]?{other:true}:{})},max:0};}
  text=text.replace(/^you (gained|drawn) /,'you have $1 ');
  if(text==='you have gained life this turn')return {kind:'turn-stat',field:'lifeGained',min:1};
  const poison=new RegExp('^an opponent has ('+NUM+') or more poison counters$').exec(text);
  if(poison)return {kind:'opponent-poison',min:amount(poison[1])};
  text=text.replace(/^there are no (.+) in your graveyard$/,'there are zero $1 in your graveyard');
  const noGrave=/^there are (?:zero|no) (.+?) in your graveyard$/.exec(text);
  if(noGrave){const count=extensionCount(noGrave[1]+' in your graveyard');if(count)return {kind:'count-comparison',count,max:0};}
  const battlefieldCount=new RegExp('^there are ('+NUM+') or more (.+?) on the battlefield$').exec(text);
  if(battlefieldCount){const count=extensionCount(battlefieldCount[2]+' on the battlefield');if(count)return {kind:'count-comparison',count,min:amount(battlefieldCount[1])};}
  if(/^you(?:'ve| have) cast another spell this turn$/.test(text))return {kind:'turn-stat',field:'spellsCast',min:1};
  let extended;
  const conditions=text.split(/ and /).map(part=>part.trim());
  if(conditions.length>1){const parsed=conditions.map(extensionCondition);if(parsed.every(Boolean))return {kind:'all',conditions:parsed};}
  extended=new RegExp('^you control (?:('+NUM+') or more |(?:a|an|another) )(.+)$').exec(text);
  if(extended){const noun=extended[2].replace(/\b(creatures|artifacts|lands|enchantments|permanents)\b/g,word=>word.slice(0,-1)),other=/^other /.test(noun)||/^you control another /.test(text),target=extensionTarget('target '+noun.replace(/^other /,'')+' you control');if(target)return {kind:'count-comparison',count:{kind:'count',zone:'battlefield',what:'permanent',filters:[target],other},min:extended[1]?amount(extended[1]):1};}
  extended=new RegExp('^there (?:are ('+NUM+') or more|is (?:a|an)) (.+?) in your graveyard$').exec(text);
  if(extended){const count=extensionCount(extended[2]+' in your graveyard');if(count)return {kind:'count-comparison',count,min:extended[1]?amount(extended[1]):1};}
  extended=new RegExp('^you(?:\'ve| have) (gained|drawn) ('+NUM+') or more (?:life|cards) this turn$').exec(text);
  if(extended)return {kind:'turn-stat',field:extended[1]==='gained'?'lifeGained':'drewThisTurn',min:amount(extended[2])};
  extended=new RegExp('^you have ('+NUM+') or (fewer|more) cards in hand$').exec(text);
  if(extended)return {kind:'count-comparison',count:{kind:'count',zone:'hand',what:'card'},[extended[2]==='fewer'?'max':'min']:amount(extended[1])};
  extended=/^an opponent has (\d+) or (less|fewer) life$/.exec(text);
  if(extended)return {kind:'opponent-life',max:Number(extended[1])};
  if(/^(?:this creature|it|this spell) was kicked$/i.test(text))return {kind:'kicked'};
  text=text.replace(/^it's (attacking|blocking|tapped|untapped|enchanted|equipped)$/i,'it is $1');
  if(/^a creature died this turn$/i.test(text))return {kind:'creature-died'};
  if(/^you control three or more creatures with different powers$/i.test(text))return {kind:'coven'};
  if(/^you control no other creatures$/i.test(text))return {kind:'no-other-creatures'};
  if(/^you have no cards in hand$/i.test(text))return {kind:'hand-count',n:0};
  if(/^you have exactly one card in hand$/i.test(text))return {kind:'hand-count',n:1};
  if(/^you control creatures with total power 8 or greater$/i.test(text))return {kind:'formidable'};
  if(/^you attacked with creatures with total power 6 or greater this combat$/i.test(text))return {kind:'pack-tactics'};
  if(/^(?:this creature|it) is (attacking|blocking|tapped|untapped|enchanted|equipped)$/i.test(text))return {kind:'source-status',status:/(attacking|blocking|tapped|untapped|enchanted|equipped)$/i.exec(text)[1].toLowerCase()};
  let conditionMatch=/^you (?:have|control) (?:a|an|another) ([A-Z][a-z]+|artifact|creature|enchantment)(?: creature)?$/i.exec(text);
  if(conditionMatch)return {kind:'has-permanent',what:conditionMatch[1],other:/another /i.test(text)};
  conditionMatch=/^your life total is (\d+) or (less|greater)$/i.exec(text);
  if(conditionMatch)return {kind:'life',threshold:Number(conditionMatch[1]),comparison:conditionMatch[2]};
  conditionMatch=/^you control (one|two|three|four|five|six|seven|\d+) or more (tapped creatures|Gates|[A-Z][a-z]+s)$/.exec(text);
  if(conditionMatch)return {kind:'filtered-permanent-count',min:amount(conditionMatch[1]),what:conditionMatch[2]==='tapped creatures'?'creature':conditionMatch[2].slice(0,-1),tapped:conditionMatch[2]==='tapped creatures'};
  if(/^you cast it from your hand$/i.test(text)) return {kind:'cast-from-hand'};
  if(/^you attacked this turn$/i.test(text)) return {kind:'attacked'};
  if(/^an opponent lost life this turn$/i.test(text)) return {kind:'opponent-lost-life'};
  if(/^you control a creature with power 4 or greater$/i.test(text)) return {kind:'ferocious'};
  if(/^there are seven or more cards in your graveyard$/i.test(text)) return {kind:'graveyard-count',min:7};
  if(/^there are four or more card types among cards in your graveyard$/i.test(text)) return {kind:'graveyard-types',min:4};
  let m=new RegExp('^you control ('+NUM+') or more (artifacts|creatures|enchantments|lands)$','i').exec(text);
  if(m) return {kind:'permanent-count',type:m[2].slice(0,-1),min:amount(m[1])};
  m=/^you control (?:a|an) (Plains|Island|Swamp|Mountain|Forest)$/i.exec(text);
  if(m) return {kind:'land-subtype',subtype:m[1]};
  if(/^it's your turn$/i.test(text)) return {kind:'your-turn'};
  if(/^it's not your turn$/i.test(text)) return {kind:'not-your-turn'};
  return null;
}

function extensionValue(text) {
  text=text.replace("life you've gained this turn",'life you gained this turn');
  const sacrificed=/^the sacrificed (?:creature|permanent|artifact)'s (power|toughness|mana value)$/.exec(text);
  if(sacrificed)return {kind:'sacrificed-stat',stat:sacrificed[1]==='mana value'?'mv':sacrificed[1]};
  const total=/^the total (power|toughness|mana value) of (.+)$/.exec(text);
  if(total){const count=extensionCount(total[2]);if(count?.kind==='count')return {...count,aggregate:total[1]==='mana value'?'mv':total[1]};}
  const ownStat=/^this (?:creature|artifact|enchantment|land|permanent)'s (power|toughness|mana value)$/.exec(text);
  if(ownStat)return {kind:'explicit-source-stat',stat:ownStat[1]==='mana value'?'mv':ownStat[1]};
  const addition=new RegExp('^('+NUM+') plus (.+)$','i').exec(text)||new RegExp('^(.+) plus ('+NUM+')$','i').exec(text);
  if(addition){const left=extensionValue(addition[1]),right=extensionValue(addition[2]);if(left!==null&&right!==null)return {kind:'sum',values:[left,right]};}
  if(new RegExp('^'+NUM+'$','i').test(text))return amount(text);
  if(text==='the amount of life you gained this turn')return {kind:'turn-count',field:'lifeGained'};
  if(text==='the amount of life you lost this turn')return {kind:'turn-count',field:'lifeLost'};
  const scaled=/^(twice|three times) (.+)$/.exec(text);
  if(scaled){const value=extensionValue(scaled[2]);if(value)return {kind:'sum',values:Array.from({length:scaled[1]==='twice'?2:3},()=>value)};}
  if(/^your devotion to /.test(text))return extensionCount(text);
  if(text==='your life total')return {kind:'life-total'};
  const greatest=/^the greatest (power|toughness|mana value) among (.+)$/.exec(text);
  if(greatest){const filters=groupSelectors(greatest[2]);if(filters)return {kind:'max-stat',stat:greatest[1]==='mana value'?'mv':greatest[1],filters};}
  if(/^its (power|toughness)$/i.test(text))return {kind:'source-stat',stat:text.toLowerCase().slice(4)};
  if(/^the number of /i.test(text))return extensionCount(text.slice(14));
  return null;
}

export function extensionSearchType(text) {
  if(/^(?:Plains|Island|Swamp|Mountain|Forest)(?: or (?:Plains|Island|Swamp|Mountain|Forest))+$/.test(text))return text;
  if(/^(?:basic land|artifact or enchantment|artifact or creature|creature or land|instant or sorcery|land|creature|artifact|enchantment|instant|sorcery|permanent|nonland permanent|card)$/i.test(text)) return text;
  if(/^[A-Z][a-z]+(?: permanent)?$/.test(text)) return text;
  return null;
}

export function extensionCount(text) {
  if(text.startsWith('other ')){const count=extensionCount(text.slice(6));if(count?.zone==='battlefield')return {...count,other:true};}
  const genericCards=/^cards? in (all graveyards|your opponents' graveyards|your library|your opponents' hands)$/.exec(text);
  if(genericCards)return {kind:'count',zone:genericCards[1].includes('graveyard')?'graveyard':genericCards[1].includes('library')?'library':'hand',what:'card',controller:genericCards[1].startsWith('all')?'all':genericCards[1].startsWith('your opponents')?'opponents':'you'};
  text=text.replace(/^basic land type among lands you control$/,'basic land types among lands you control');
  const devotion=/^your devotion to (white|blue|black|red|green)(?: and (white|blue|black|red|green))?$/.exec(text);
  if(devotion)return {kind:'devotion',colors:[devotion[1],devotion[2]].filter(Boolean).map(color=>({white:'W',blue:'U',black:'B',red:'R',green:'G'}[color]))};
  if(text==='creatures in your party'||text==='creature in your party')return {kind:'party'};
  if(/^(?:spells you(?:'ve| have) cast|spells cast by you) this turn$/.test(text))return {kind:'turn-count',field:'spellsCast'};
  if(text==='cards you have drawn this turn'||text==="cards you've drawn this turn")return {kind:'turn-count',field:'drewThisTurn'};
  text=text.replace(/\bcreatures in your graveyard\b/,'creature cards in your graveyard');
  if(/^(attacking|blocking) creatures$/.test(text))return {kind:'count',zone:'battlefield',what:'creature',controller:'all',filters:[{what:'creature',zone:'battlefield',controller:'any',[text.split(' ')[0]]:true}]};
  if(text==='creatures that died this turn')return {kind:'died-count',what:'creature'};
  const counters=/^(\+1\/\+1|-1\/-1|[a-z]+) counters? on (?:it|this creature|this artifact|this enchantment|this land|this permanent)$/.exec(text);
  if(counters)return {kind:'source-counters',counter:counters[1]};
  text=text.replace(/\b([A-Z][A-Za-z-]+)s\b/g,(word,base)=>ORACLE_SUBTYPES.has(word)?word:ORACLE_SUBTYPES.has(base)?base:({Elves:'Elf',Wolves:'Wolf',Dwarves:'Dwarf',Allies:'Ally'}[word]||word));
  text=text.replace(/^instant and sorcery /,'instant or sorcery ');
  const named=/^cards named (.+) in (your graveyard|all graveyards)$/.exec(text);
  if(named)return {kind:'count',zone:'graveyard',what:'card',name:named[1],controller:named[2]==='your graveyard'?'you':'all'};
  let compound=/^(.+?) and (?:each )?(.+)$/.exec(text);
  if(compound){const values=[extensionCount(compound[1]),extensionCount(compound[2])];if(values.every(Boolean))return {kind:'sum',values};}
  const filtered=/^(.+?) (you control|your opponents control|on the battlefield)$/.exec(text);
  if(filtered){const filters=groupSelectors(filtered[1]+' '+(filtered[2]==='on the battlefield'?'':filtered[2]));if(filters)return {kind:'count',zone:'battlefield',what:'permanent',filters,controller:filtered[2]==='on the battlefield'?'all':filtered[2]==='you control'?'you':'opponents'};}
  let extended=/^(white|blue|black|red|green|colorless|multicolored|nonbasic) (permanents|creatures|lands) (you control|your opponents control|on the battlefield)$/.exec(text);
  if(extended)return {kind:'count',zone:'battlefield',what:extended[2].slice(0,-1),color:extended[1],controller:extended[3]==='you control'?'you':extended[3]==='your opponents control'?'opponents':'all'};
  extended=/^(artifact|creature|enchantment|land|[A-Z][a-z]+)s? on the battlefield$/.exec(text);
  if(extended)return {kind:'count',zone:'battlefield',what:extended[1],controller:'all'};
  extended=/^(permanent|creature|artifact|enchantment|land|instant or sorcery|[A-Z][a-z]+) cards? in (your graveyard|all graveyards|your opponents' graveyards)$/.exec(text);
  if(extended)return {kind:'count',zone:'graveyard',what:extended[1],controller:extended[2]==='your graveyard'?'you':extended[2]==='all graveyards'?'all':'opponents'};
  extended=/^card types among cards in (your graveyard|all graveyards|your opponents' graveyards)$/.exec(text);
  if(extended)return {kind:'count',zone:'graveyard',what:'card',unique:'types',controller:extended[1]==='your graveyard'?'you':extended[1]==='all graveyards'?'all':'opponents'};
  if(text==='basic land types among lands you control')return {kind:'count',zone:'battlefield',what:'land',unique:'basic-land-types'};
  if(text==='colors among permanents you control')return {kind:'count',zone:'battlefield',what:'permanent',unique:'colors'};
  let m=/^(other )?(artifact|creature|enchantment|land|[A-Z][a-z]+)s? you control$/.exec(text);
  if(m) return {kind:'count',zone:'battlefield',what:m[2],other:!!m[1]};
  m=/^(creature|artifact|enchantment|land|instant or sorcery) cards? in your graveyard$/.exec(text);
  if(m) return {kind:'count',zone:'graveyard',what:m[1]};
  if(/^cards? in your hand$/.test(text)) return {kind:'count',zone:'hand',what:'card'};
  if(/^cards? in your graveyard$/.test(text)) return {kind:'count',zone:'graveyard',what:'card'};
  return null;
}

export function characteristicOperation(card,line) {
  const name='(?:'+[card.name,card.name.split(',')[0]].map(escape).join('|')+')';
  const m=new RegExp('^(?:Domain — |Vivid — )?'+name+"'s (power and toughness are each|power is|toughness is) equal to (.+)\\.$").exec(line);
  if(!m)return null;
  let text=m[2],toughnessOffset=0;
  const pair=/^(.+) and its toughness is equal to that number plus (\d+)$/.exec(text);
  if(pair){if(m[1]!=='power is')return null;text=pair[1];toughnessOffset=Number(pair[2]);}
  let offset=0,multiply=1;
  const prefix=/^(\d+) plus (.+)$/.exec(text);if(prefix){offset=Number(prefix[1]);text=prefix[2];}
  if(text.startsWith('twice ')){multiply=2;text=text.slice(6);}
  let count=text==='your life total'?{kind:'life-total'}:text.startsWith('the number of ')?extensionCount(text.slice(14)):null;
  if(!count)return null;
  return {kind:'characteristic-pt',power:m[1]!=='toughness is',toughness:!!pair||m[1]!=='power is',count,multiply,offset,toughnessOffset,contract:'characteristic-power-toughness'};
}
