// Additive complete-card grammar. The importer preserves successful v9
// descriptors before enabling these parsers; unknown clauses remain rejected.
import * as v9 from './oracle-extensions-v9.mjs';
import {ORACLE_SUBTYPES,ORACLE_SUBTYPE_TYPES} from './oracle-subtypes.mjs';
const escape = text => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const self = card => '(?:it|this (?:creature|permanent|artifact|enchantment|land|token)|' + escape(card.name) + ')';
const body = (effects, targets = [], optional = false) => ({effects, targets, optional});
const pluralTypes=new Map([...ORACLE_SUBTYPES].flatMap(type=>[[type+'s',type],...(type.endsWith('f')?[[type.slice(0,-1)+'ves',type]]:[]),...(type.endsWith('y')?[[type.slice(0,-1)+'ies',type]]:[])]));
for(const [plural,singular] of Object.entries({Elves:'Elf',Dwarves:'Dwarf',Werewolves:'Werewolf',Wolves:'Wolf',Pegasi:'Pegasus',Oxen:'Ox',Octopuses:'Octopus',Fungi:'Fungus',Heroes:'Hero'}))pluralTypes.set(plural,singular);
const singularTypes=text=>text.replace(/\b[A-Z][a-z]+\b/g,word=>ORACLE_SUBTYPES.has(word)?word:pluralTypes.get(word)||word);
const keywords=new Set(['flying','first strike','double strike','deathtouch','lifelink','trample','haste','vigilance','menace','reach','defender','indestructible','hexproof','shroud','flash','prowess','shadow','fear','intimidate','skulk','horsemanship','wither','infect','persist','undying','phasing']);
function sourceQualitiesV10(text,h){
  text=text.replace(/each color/g,'white, blue, black, red, and green').replace(/\b(artifacts|creatures|enchantments|lands|planeswalkers)\b/g,w=>w.slice(0,-1));
  const parts=text.split(/,? and |, /),filters=parts.map(part=>h.target('target '+part+(/^(?:white|blue|black|red|green|colored|monocolored|multicolored|colorless|snow)$/.test(part)?' permanent':'')));
  return filters.length&&filters.every(filter=>filter?.zone==='battlefield')?filters:null;
}
keywords.add('flanking');

export const dayNight = v9.dayNight;
export const printedParagraphs = true;
export const snowMana = true;
export const grantableKeywords = v9.grantableKeywords;
export function normalizeManaOperation(operation){
  const tail=effect=>['gain-life','lose-life'].includes(effect.action)&&['you','each-player','each-opponent'].includes(effect.who)&&typeof effect.n==='number'||effect.action==='conditional'&&effect.effects?.length&&effect.effects.every(tail)&&(effect.elseEffects||[]).every(tail);
  if(operation.kind!=='generic-ability'||operation.loyalty!==undefined||operation.from||operation.optional||operation.sorceryOnly||operation.beforeAttackersOnly||operation.oncePerObject||operation.targets?.length||!operation.effects?.length||operation.effects[0].action!=='add-mana'||operation.effects.length<2||!operation.effects.slice(1).every(tail)||Object.keys(operation.cost||{}).some(key=>!['tap','mana','life','sacSelf','sacWhat','sacOther','sacFilter','sacN','rmCounter'].includes(key))||operation.cost?.mana?.includes('{X}'))return null;
  const effect=operation.effects[0];return {kind:'mana-source',activationCost:operation.cost,produce:effect.choices||[effect.produce],...(effect.multiplier?{multiplier:effect.multiplier}:{}),...(effect.restriction?{restriction:effect.restriction}:{}),afterEffects:operation.effects.slice(1),...(operation.activationCondition?{condition:operation.activationCondition}:{}),...(operation.onceEachTurn?{onceEachTurn:true}:{}),contract:'mana-source'};
}
export function modalOperation(card,text,parseEffect,parseModal){
  if(!/\b(?:Instant|Sorcery)\b/.test(card.type_line||''))return null;
  const lines=String(text||'').split('\n'),mana=/^(?:\{(?:\d+|[WUBRGC])\})+$/;
  const cleave=/^Cleave (\S+)$/.exec(lines[0]);
  if(cleave&&mana.test(cleave[1])){
    const printed=lines.slice(1).join(' '),ordinary=parseEffect(card,printed.replace(/[\[\]]/g,'')),cut=parseEffect(card,printed.replace(/\[[^\[\]]+\]/g,'').replace(/ +([.,])/g,'$1').replace(/ {2,}/g,' ').trim());
    if(printed.includes('[')&&ordinary&&cut&&!ordinary.optional&&!cut.optional&&!ordinary.v4Body&&!cut.v4Body&&ordinary.targets.length===cut.targets.length&&!/"(?:dividedAmount|division|distribute)"/.test(JSON.stringify([ordinary,cut])))return {kind:'spell-generic',...ordinary,cleaveCostV10:cleave[1],cleaveBodyV10:cut,contract:'spell-generic-effect'};
    return null;
  }
  if(lines[0]==='Spree'){
    const modes=lines.slice(1).map(line=>/^\+ (\S+) — (.+)$/.exec(line));
    if(modes.length<2||modes.some(mode=>!mode||!mana.test(mode[1])))return null;
    const parsed=parseModal(card,'Choose one or more —\n'+modes.map(mode=>'• '+mode[2]).join('\n'),parseEffect);
    if(parsed?.kind!=='spell-modal-generic'||parsed.modes.length!==modes.length)return null;
    return {...parsed,modes:parsed.modes.map((mode,index)=>({...mode,tierCostV10:modes[index][1]}))};
  }
  const escalate=/^Escalate (\S+)$/.exec(lines[0]);
  if(escalate&&mana.test(escalate[1])){
    const parsed=parseModal(card,lines.slice(1).join('\n'),parseEffect);
    if(parsed?.kind==='spell-modal-generic'&&parsed.choose.min===1&&parsed.choose.max>1)return {...parsed,escalateCostV10:escalate[1]};
  }
  return null;
}
export function extensionTarget(text,h){
  if(text==='target player who lost life this turn')return {what:'player',zone:'players',controller:'any',min:1,lostLifeThisTurnV10:true};
  const stat=/^(.+?) with (power|toughness|mana value) (less than or equal to|greater than or equal to|equal to|less than|greater than) (.+?)( from (?:your|a|an opponent's) graveyard)?$/.exec(text);
  if(stat&&!/^its |^their /.test(stat[4])){
    const base=h.target(stat[1]+(stat[5]||'')),value=h.value?.(stat[4]);
    if(base&&['battlefield','graveyard'].includes(base.zone)&&value!==null&&value!==undefined&&!JSON.stringify(value).includes('event-card-stat')){const strict=['less than','greater than'].includes(stat[3]),threshold=strict?{kind:'sum',values:[value,stat[3]==='less than'?-1:1]}:value;return {...base,stat:stat[2]==='mana value'?'mv':stat[2],threshold,comparison:stat[3].startsWith('less')?'less':stat[3].startsWith('greater')?'greater':'equal'};}
  }
  const toxic=/^(.+?) with(out)? toxic$/.exec(text);
  if(toxic){const base=h.target(toxic[1]);if(base?.zone==='battlefield')return {...base,hasToxicV10:!toxic[2]};}
  const single=/^(target .+?) with a single target$/.exec(text);
  if(single){const base=h.target(single[1]);if(base?.zone==='stack')return {...base,singleTargetV10:true};}
  if(text==='target spell or ability')return {what:'permanent',zone:'stack',controller:'any',min:1,alternatives:[h.target('target spell'),h.target('target activated or triggered ability')]};
  const targetsSelf=/^(target (?:.+? )?spell) that targets this (?:creature|permanent)$/.exec(text);
  if(targetsSelf){const base=h.target(targetsSelf[1]);if(base?.zone==='stack')return {...base,targetsSourceV10:true};}
  const dealt=/^(.+?) dealt damage this turn$/.exec(text);
  if(dealt){const base=h.target(dealt[1]);if(base?.zone==='battlefield')return {...base,damagedThisTurn:true};}
  if(text==='target outlaw')return {what:'creature',zone:'battlefield',controller:'any',min:1,alternatives:['Assassin','Mercenary','Pirate','Rogue','Warlock'].map(subtype=>({what:'creature',zone:'battlefield',controller:'any',subtype}))};
  if(/^(?:another )?target unblocked /.test(text)){const base=h.target(text.replace(/\bunblocked /,''));if(base?.zone==='battlefield')return {...base,unblockedV10:true};}
  const basic=/\b(basic|nonbasic) land\b/.exec(text);
  if(basic){const base=h.target(text.replace(basic[0],'land'));if(base&&['battlefield','graveyard'].includes(base.zone))return {...base,[basic[1]]:true};}
  if(/\bnonblocking\b/.test(text)){const base=h.target(text.replace(/\bnonblocking,? ?/,''));if(base?.zone==='battlefield')return {...base,excludedFiltersV10:[...(base.excludedFiltersV10||[]),{what:'creature',zone:'battlefield',controller:'any',blocking:true}]};}
  const chosen=/^(.+?) of the chosen color(.*)$/.exec(text);
  if(chosen){const base=h.target(chosen[1]+chosen[2]);if(base&&['battlefield','stack','graveyard'].includes(base.zone)&&!base.colorsAny)return {...base,chosenColorV10:true};}
  const counter=/^(.+?) with (?:a|an|one or more)? ?([+][0-9]+\/[+][0-9]+|-[0-9]+\/-[0-9]+|[a-z]+) counters?(?: on (?:it|them))?$/.exec(text);
  if(counter){const base=h.target(counter[1]);if(base?.zone==='battlefield')return {...base,hasCounter:counter[2]};}
  const unequal=/^(.+?) whose power and toughness (?:aren't|are not) equal$/.exec(text);
  if(unequal){const base=h.target(unequal[1]);if(base?.zone==='battlefield')return {...base,excludedFiltersV10:[...(base.excludedFiltersV10||[]),{what:'creature',zone:'battlefield',equalStatsV9:true}]};}
  const battle=/^((?:up to one |another )?target )battle( card from (?:your|a|an opponent's) graveyard| you control| an opponent controls)?$/.exec(text);
  if(battle){const base=h.target(battle[1]+'permanent'+(battle[2]||''));if(base)return {...base,what:'battle'};}
  const keyword=/^(.+?) with(out)? ([a-z ]+)$/.exec(text);
  if(keyword&&keywords.has(keyword[3])){const base=h.target(keyword[1]);if(base&&base.zone!=='stack')return {...base,[keyword[2]?'withoutKeyword':'withKeyword']:keyword[3]};}
  const either=/^((?:up to one |another )?target )(.+?)( card from (?:your|a|an opponent's) graveyard| you control| an opponent controls)?$/.exec(text);
  if(either&&/ or /.test(either[2])&&!/\b(?:with|without|that|you|opponent|controls|owns|from)\b/.test(either[2])){
    const alternatives=either[2].split(/, or |, | or /).map(noun=>h.target(either[1]+noun+(either[3]||'')));
    if(alternatives.length>1&&alternatives.every(filter=>filter&&['battlefield','graveyard'].includes(filter.zone)&&filter.zone===alternatives[0].zone))
      return {what:alternatives[0].zone==='battlefield'?'permanent':'card',zone:alternatives[0].zone,controller:alternatives.every(filter=>filter.controller===alternatives[0].controller)?alternatives[0].controller:'any',min:alternatives[0].min,alternatives};
  }
  const singular=singularTypes(text);if(singular!==text){const parsed=h.target(singular);if(parsed)return parsed;}
  const control=text.replace(/ you don't control\b/g,' an opponent controls').replace(/ you do not control\b/g,' an opponent controls');if(control!==text){const parsed=h.target(control);if(parsed)return parsed;}
  const negative=/^(.+?) that (?:isn't|is not) (enchanted|equipped|modified|a token|a commander)$/.exec(text);
  if(negative){const base=h.target(negative[1]),excluded=h.target('target '+negative[2].replace(/^a /,'')+(/^(?:enchanted|equipped|modified)$/.test(negative[2])?' permanent':''));if(base?.zone==='battlefield'&&excluded?.zone==='battlefield')return {...base,excludedFiltersV10:[...(base.excludedFiltersV10||[]),excluded]};}
  const prior=v9.extensionTarget(text,h);if(prior)return prior;
  const combat=/^(.+?) that's attacking or blocking$/.exec(text);
  if(combat){const base=h.target(combat[1]);if(base?.zone==='battlefield')return {...base,attackingOrBlocking:true};}
  const dynamic=/^(.+?) with (power|toughness|mana value) (?:greater than or equal to|at least) your life total$/.exec(text);
  if(dynamic){const base=h.target(dynamic[1]);if(base?.zone==='battlefield')return {...base,stat:dynamic[2]==='mana value'?'mv':dynamic[2],threshold:{kind:'life-total'},comparison:'greater'};}
  const union=/^target (.+, .+(?:,? or .+))( you control| an opponent controls)?$/.exec(text);
  if(union){const alternatives=union[1].split(/, or |, | or /).map(part=>h.target('target '+part+(union[2]||'')));
    if(alternatives.length>1&&alternatives.every(filter=>filter?.zone==='battlefield'))return {what:'permanent',zone:'battlefield',controller:alternatives.every(filter=>filter.controller===alternatives[0].controller)?alternatives[0].controller:'any',min:1,max:1,alternatives};}
  const types=/^(target (?:creature|permanent)(?: you control)?) that's (.+)$/.exec(text);
  if(types){const names=types[2].split(/, or |, | or /).map(part=>part.replace(/^(?:a|an) /,''));
    if(names.length>1&&names.every(type=>ORACLE_SUBTYPES.has(type))){const base=h.target(types[1]);if(base)return {...base,alternatives:names.map(subtype=>({...base,subtype}))};}}
  return null;
}
export function extensionValue(text,h){
  const observed=/^(?:that (?:creature|permanent|artifact|card)'s (power|toughness|mana value)|the (power|toughness|mana value) of that (?:creature|permanent|artifact|card))$/.exec(text);
  if(observed)return {kind:'event-card-stat',stat:(observed[1]||observed[2])==='mana value'?'mv':observed[1]||observed[2]};
  if(/^(?:that spell's mana value|the mana value of that spell)$/.test(text))return {kind:'event-spell-mv-v10'};
  const actor=text.replace(/ they control$/," that player controls");if(actor!==text)return h.value(actor);
  const sourceNoun=text.replace(/\bthis (?:Aura|Equipment|Vehicle|Spacecraft|Saga|planeswalker|battle|token)\b/g,'this permanent');if(sourceNoun!==text)return h.value(sourceNoun);
  const times=/^(four|five|six|seven|eight|nine|ten) times (.+)$/.exec(text);if(times){const value=h.value(times[2]);if(value!==null&&value!==undefined)return {kind:'sum',values:[value],multiply:({four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10})[times[1]]};}
  if(/^(?:the number of )?colors? of mana spent to cast (?:this spell|this creature|this permanent|it)$/.test(text))return {kind:'paid-colors'};
  const pronoun=text.replace(/\btheir (hand|graveyard|library)\b/g,"that player's $1");if(pronoun!==text)return h.value(pronoun);
  if(text==='the number of times you descended this turn')return {kind:'turn-count',field:'descended'};
  if(/^the (?:amount of )?mana spent to cast (?:this spell|this creature|this permanent)$/.test(text))return {kind:'cast-mana-spent-v10'};
  if(/^the (?:amount of )?mana spent to cast that spell$/.test(text))return {kind:'event-mana-spent-v10'};
  const arithmetic=/^(.+?) (plus|minus) (.+)$/.exec(text);
  if(arithmetic){const left=h.value(arithmetic[1]),right=h.value(arithmetic[3]);if(left!==null&&left!==undefined&&right!==null&&right!==undefined)return arithmetic[2]==='plus'?{kind:'sum',values:[left,right]}:{kind:'difference-v10',left,right};}
  if(/^the number of /.test(text))return h.count(text.slice(14));
  if(/^the greatest /.test(text))return h.count(text);
  return null;
}
export function extensionCount(text,h){
  if(/^creatures? that attacked this turn$/.test(text))return {kind:'attacked-creature-count-v10'};
  const sourceNoun=text.replace(/\bthis (?:Aura|Equipment|Vehicle|Spacecraft|Saga|planeswalker|battle|token)\b/g,'this permanent');if(sourceNoun!==text)return h.count(sourceNoun);
  if(/^colors? of mana spent to cast (?:this spell|this creature|this permanent|it)$/.test(text))return {kind:'paid-colors'};
  if(text==='cards you own in exile')return {kind:'count',zone:'exile',what:'card',controller:'you'};
  const counters=/^(?:the number of )?([+-][0-9]+\/[+-][0-9]+|[a-z]+) counters on (.+)$/.exec(text);
  if(counters){const count=h.count(counters[2]);if(count?.kind==='count'&&count.zone==='battlefield')return {...count,counterTotalV10:counters[1]};}
  const chroma=/^(white|blue|black|red|green) mana symbols in the mana costs of cards in your graveyard$/.exec(text);
  if(chroma)return {kind:'count',zone:'graveyard',what:'card',controller:'you',chromaV10:({white:'W',blue:'U',black:'B',red:'R',green:'G'})[chroma[1]]};
  const max=/^(?:the )?greatest (mana value|power|toughness|power and\/or toughness) among (.+)$/.exec(text);
  if(max){const count=h.count(max[2]);if(count?.kind==='count')return {...count,maxV10:max[1]==='mana value'?'mv':max[1]==='power and/or toughness'?'pt':max[1]};}
  const typal=/^creatures you control that are (.+)$/.exec(text);
  if(typal){const types=singularTypes(typal[1]).split(/,? and\/or |,? or |, /);if(types.length>1&&types.every(type=>ORACLE_SUBTYPES.has(type)))return {kind:'count',zone:'battlefield',what:'creature',controller:'you',filters:types.map(subtype=>({what:'creature',zone:'battlefield',controller:'you',subtype}))};}
  const prior=v9.extensionCount(text,h);if(prior)return prior;
  // Counts use the same fully parsed permanent qualities as target selection,
  // but do not target and therefore ignore shroud/hexproof at resolution.
  const noun=singularTypes(text).replace(/\b(creatures|artifacts|enchantments|lands|permanents|planeswalkers|battles|tokens)\b/g,word=>word.slice(0,-1)).replace(/ on the battlefield$/,'').replace(/ your opponents control$/,' an opponent controls');
  const filter=h.target((noun.startsWith('other ')?'another target '+noun.slice(6):'target '+noun));
  if(filter?.zone==='battlefield'&&['any','you','opponent'].includes(filter.controller))return {kind:'count',zone:'battlefield',what:'permanent',controller:'all',filters:[filter]};
  return null;
}
export function extensionCondition(text,h){
  if(/^(?:it was|it is|it's|this spell was|this creature was) bargained$/.test(text))return {kind:'cast-flag-v10',flag:'oracleBargainV10'};
  if(text==='a nonland permanent left the battlefield this turn or a spell was warped this turn')return {kind:'void-v10'};
  const eventMana=/^(one|two|three|four|five|six|seven|eight|nine|ten|[0-9]+) or more mana was spent to cast that spell$/.exec(text);
  if(eventMana)return {kind:'value-comparison-v10',value:{kind:'event-mana-spent-v10'},min:({one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10}[eventMana[1]]??Number(eventMana[1]))};
  const quality=/^(?:it is|it's|this creature is|this permanent is) (?:a|an) (.+)$/.exec(text);
  if(quality){const filter=h.target('target '+quality[1]);if(filter?.zone==='battlefield')return {kind:'source-quality',filter};}
  if(/^you(?:'ve| have)? committed a crime this turn$/.test(text))return {kind:'v8-live-condition',test:'crime-turn'};
  const presence=/^you control (a|an|one or more|no) (.+)$/.exec(text);
  if(presence){const filter=h.target('target '+singularTypes(presence[2]).replace(/\b(creatures|artifacts|lands|enchantments|permanents|planeswalkers)\b/g,word=>word.slice(0,-1))+' you control');
    if(filter?.zone==='battlefield')return {kind:'count-comparison',count:{kind:'count',zone:'battlefield',what:'permanent',controller:'you',filters:[filter]},[presence[1]==='no'?'max':'min']:presence[1]==='no'?0:1};
  }
  if(/^(?:it|this creature) has toxic$/.test(text))return {kind:'source-quality',filter:{what:'creature',zone:'battlefield',controller:'any',hasToxicV10:true}};
  if(text==="it's night"||text==='it is night'||text==="it's day"||text==='it is day')return {kind:'day-night-state-v10',state:text.endsWith('night')?'night':'day'};
  if(text==='it escaped'||text==='this creature escaped')return {kind:'cast-flag-v10',flag:'escape'};
  if(/^(?:it is|it's) your turn$/.test(text))return {kind:'your-turn'};
  if(/^(?:it is|it's) not your turn$/.test(text))return {kind:'not-your-turn'};
  if(/^(?:it is|it's) your upkeep$/.test(text))return {kind:'your-phase',phase:'upkeep'};
  if(/^you cast this (?:creature|permanent|artifact|enchantment)$/.test(text))return {kind:'source-was-cast'};
  const castFrom=/^you cast (?:it|this creature|this permanent|this artifact|this enchantment) from your (hand|graveyard)$/.exec(text);
  if(castFrom)return {kind:'cast-origin',from:castFrom[1]};
  if(text==='you had a land enter the battlefield under your control this turn')return {kind:'turn-stat',field:'landsEntered',min:1};
  const expanded=text.replace(/^(?:it's|this creature's) /,'it is ');if(expanded!==text){const result=h.condition(expanded);if(result)return result;}
  const keyword=/^(?:it|this creature|this permanent) has (.+)$/.exec(text);
  if(keyword&&keywords.has(keyword[1]))return {kind:'source-quality',filter:{what:'permanent',zone:'battlefield',controller:'any',withKeyword:keyword[1]}};
  if(text==='you have max speed'||text==='your speed is 4')return {kind:'player-speed-v10',min:4};
  if(text==='you attacked this turn')return {kind:'turn-stat',field:'attacked',min:1};
  if(text==='you have the initiative')return {kind:'player-progress-v10',test:'initiative'};
  if(text==="you've completed a dungeon"||text==='you have completed a dungeon')return {kind:'player-progress-v10',test:'dungeon'};
  const notType=/^(?:it|this creature|this permanent) (?:isn't|is not) (?:a|an) (.+)$/.exec(text);
  if(notType){const filter=h.target('target '+notType[1]);if(filter?.zone==='battlefield')return {kind:'not',condition:{kind:'source-quality',filter}};}
  return v9.extensionCondition(text,h);
}
export const characteristicOperation = v9.characteristicOperation;
export function extensionCost(text,h,card){
  const waterbend=/^[Ww]aterbend \{(\d+)\}(, \{T\})?$/.exec(text);
  if(waterbend)return {mana:'{'+waterbend[1]+'}',waterbendV10:Number(waterbend[1]),...(waterbend[2]?{tap:true}:{})};
  const mana=/^((?:\{(?:[0-9]+|X|[WUBRGCS]|[WUBRG]\/P|[WUBRG]\/[WUBRG]|2\/[WUBRG])\})+)(, .+)?$/.exec(text);
  if(mana&&mana[1].includes('{S}')&&h?.cost){
    const translated=mana[1].replaceAll('{S}','{C}'),parsed=h.cost(translated+(mana[2]||''));
    if(parsed?.mana===translated)return {...parsed,mana:mana[1]};
  }
  return v9.extensionCost(text,h,card);
}
export function modifierOperation(card,line,h){
  const prevention=/^(Damage|Combat damage|Damage that would be dealt by this creature|Combat damage that would be dealt by creatures you control) can't be prevented\.$/.exec(line);
  if(prevention)return {kind:'damage-prevention-rule-v10',self:prevention[1].includes('this creature'),combat:prevention[1].startsWith('Combat'),yourCreatures:prevention[1].includes('creatures you control'),contract:'damage-prevention-rule-v10'};
  if(line==='Bargain')return {kind:'mechanic-bargain-v10',contract:'mechanic-bargain-v10'};
  if(line==="You may cast this spell as though it had flash. If you cast it any time a sorcery couldn't have been cast, the controller of the permanent it becomes sacrifices it at the beginning of the next cleanup step.")return {kind:'generic-static',scope:'self',power:0,toughness:0,keywords:['flash'],flashCleanupV10:true,contract:'continuous-layer'};
  if(card.oraclePrepareV10&&new RegExp('^'+self(card)+' enters prepared\\.$','i').test(line))return {kind:'mechanic-enters-prepared-v10',contract:'prepare-entry-v10'};
  const namedFlash=new RegExp('^'+escape(card.name)+' has flash as long as (.+)\\.$').exec(line);
  if(namedFlash)return modifierOperation(card,'This spell has flash as long as '+namedFlash[1]+'.',h);
  const flash=/^(?:This spell has flash as long as |You may cast this spell as though it had flash if )(.+)\.$/.exec(line)||/^(?:As long as |If )(.+), you may cast this spell as though it had flash\.$/.exec(line);
  if(flash&&!/\bX\b|\bit targets\b|\bcast using\b/.test(flash[1])){const condition=h.condition(flash[1]),parsed=condition?{kind:'generic-static',scope:'self',power:0,toughness:0,keywords:['flash'],condition,contract:'generic-continuous-effect'}:h.line(card,'This creature has flash as long as '+flash[1]+'.');if(parsed?.kind==='generic-static'&&parsed.condition)return {...parsed,castTimingV10:true};}
  if(line==='Changeling')return {kind:'mechanic-changeling',contract:'mechanic-changeling'};
  if(line==='Wither'&&/\b(?:Instant|Sorcery)\b/.test(card.type_line))return {kind:'mechanic-printed-keywords-v10',keywords:['wither'],contract:'mechanic-printed-keywords-v10'};
  const warp=/^Warp ((?:\{(?:[0-9]+|X|[WUBRGC]|[WUBRG]\/[WUBRG])\})+)$/.exec(line);
  if(warp&&/\b(?:Creature|Artifact|Enchantment)\b/.test(card.type_line)&&!/\b(?:Instant|Sorcery|Land)\b/.test(card.type_line))return {kind:'mechanic-warp',cost:warp[1],contract:'mechanic-warp'};
  const equipOther=/^Equip—(.+)\.$/.exec(line);
  if(equipOther&&/\bEquipment\b/.test(card.type_line)){
    const cost=h.cost(equipOther[1]);if(cost&&Object.keys(cost).every(key=>['mana','energy','discard'].includes(key)))return {kind:'generic-ability',oracleEquip:true,label:line,cost,targets:[h.target('target creature you control')],effects:[{action:'attach-source',target:0}],sorceryOnly:true,contract:'generic-activated-effect'};
  }
  const playerRule=/^(You|Players|Your opponents) can't (play lands|search libraries)\.$/.exec(line);
  if(playerRule)return {kind:'mechanic-player-rule-v10',rule:playerRule[2]==='play lands'?'no-land':'no-search',players:({You:'you',Players:'all','Your opponents':'opponents'})[playerRule[1]],contract:'mechanic-player-rule-v10'};
  if(line==="You can't lose the game and your opponents can't win the game.")return {kind:'mechanic-player-rule-v10',rule:'no-lose-win',players:'you',contract:'mechanic-player-rule-v10'};
  const skipStep=/^(Skip your|Players skip their|Each player skips their) (untap|upkeep|draw) steps?\.$/.exec(line);
  if(skipStep)return {kind:'mechanic-player-rule-v10',rule:'skip-'+skipStep[2],players:skipStep[1]==='Skip your'?'you':'all',contract:'mechanic-player-rule-v10'};
  const otherUntap=/^Untap (.+) during each (?:other player's|opponent's) untap step\.$/.exec(line);
  if(otherUntap){
    const who=otherUntap[1],isSelf=new RegExp('^'+self(card)+'$','i').test(who),parsed=isSelf?{kind:'generic-static',scope:'self',power:0,toughness:0,keywords:[],contract:'continuous-layer'}:h.line(card,who+' have vigilance.');
    if(parsed?.kind==='generic-static')return {...parsed,keywords:[],otherUntapV10:true};
  }
  const artifactCycle=/^Artifact landcycling ((?:\{(?:[0-9]+|[WUBRGC])\})+)$/.exec(line);
  if(artifactCycle)return {kind:'mechanic-typecycling',subtype:'artifact land',cost:artifactCycle[1],contract:'mechanic-typecycling'};
  const protection=/^Protection from (.+)$/i.exec(line),hexproof=/^Hexproof from (.+)$/i.exec(line);
  if(protection){const filters=sourceQualitiesV10(protection[1],h);if(filters)return {kind:'protection-static',own:true,qualities:[{kind:'filters',filters}],keywords:[],power:0,toughness:0,contract:'protection-static'};}
  if(hexproof){const filters=sourceQualitiesV10(hexproof[1],h);if(filters)return {kind:'generic-static',scope:'self',power:0,toughness:0,keywords:[],hexproofFiltersV10:filters,contract:'continuous-layer'};}
  const equipChoices=/^Equip (\{[^.]+\}) or (\{[^.]+\})$/.exec(line);
  if(equipChoices&&/\bEquipment\b/.test(card.type_line)){
    const operations=equipChoices.slice(1).map(mana=>({kind:'generic-ability',oracleEquip:true,label:'Equip '+mana,cost:{mana},targets:[h.target('target creature you control')],effects:[{action:'attach-source',target:0}],sorceryOnly:true,contract:'generic-activated-effect'}));
    if(equipChoices.slice(1).every(mana=>/^(?:\{(?:[0-9]+|[WUBRGC])\})+$/.test(mana)))return {kind:'operation-bundle',operations,contract:'closed-permanent-clauses'};
  }
  if(line==='Prowess')return {kind:'mechanic-prowess-v10',contract:'mechanic-prowess-v10'};
  const crewBonus=/^This (?:creature|token) (saddles Mounts and crews Vehicles|crews Vehicles) as though its power were ([0-9]+) greater\.$/i.exec(line);
  if(crewBonus)return {kind:'mechanic-saddle-crew-power-v10',bonus:Number(crewBonus[2]),saddle:crewBonus[1].startsWith('saddles'),contract:'mechanic-saddle-crew-power-v10'};
  if(/^This creature crews Vehicles using its toughness rather than its power\.$/.test(line))return {kind:'mechanic-saddle-crew-power-v10',toughness:true,contract:'mechanic-saddle-crew-power-v10'};
  const saddle=/^Saddle ([0-9]+)$/.exec(line);
  if(saddle&&!/\b(?:Instant|Sorcery)\b/.test(card.type_line))return {kind:'mechanic-saddle-v10',n:Number(saddle[1]),contract:'mechanic-saddle-v10'};
  const equip=/^Equip ((?:\{(?:[0-9]+|[WUBRGC])\})+)\.? Activate only once each turn\.$/.exec(line);
  if(equip&&/\bEquipment\b/.test(card.type_line))return {kind:'generic-ability',oracleEquip:true,label:line,cost:{mana:equip[1]},targets:[h.target('target creature you control')],effects:[{action:'attach-source',target:0}],sorceryOnly:true,onceEachTurn:true,contract:'generic-activated-effect'};
  const deck=new RegExp('^A deck can have (any number of|up to (one|two|three|four|five|six|seven|eight|nine|ten|[0-9]+)) cards named '+escape(card.name)+'\\.$').exec(line);
  if(deck)return {kind:'mechanic-deck-limit-v10',limit:deck[1]==='any number of'?'all':({one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10}[deck[2]]??Number(deck[2])),contract:'mechanic-deck-limit-v10'};
  if(line==='Start your engines!'&&!/\b(?:Instant|Sorcery)\b/.test(card.type_line))return {kind:'mechanic-start-engines-v10',contract:'mechanic-start-engines-v10'};
  const mutate=/^Mutate ((?:\{(?:[0-9]+|[WUBRGC]|[WUBRG]\/[WUBRG])\})+)$/.exec(line);
  if(mutate&&/\bCreature\b/.test(card.type_line))return {kind:'mechanic-mutate-v10',cost:mutate[1],contract:'mechanic-mutate-v10'};
  return v9.modifierOperation(card,line,h);
}
export function extensionLine(card,line,h) {
  const landColors=/^\{T\}: Add one mana of any (type|color) that a (basic )?land you control could produce\.$/.exec(line);
  if(landColors)return {kind:'mana-source',activationCost:{tap:true},produce:['W','U','B','R','G',...(landColors[1]==='type'?['C']:[])].map(color=>({[color]:1})),produceFromLandsV10:{basic:!!landColors[2]},contract:'mana-source'};
  const manaBonus=/^Whenever (enchanted land is tapped for mana, its controller adds an additional|a player taps a land for mana, that player adds|you tap a land for mana, add|a Forest is tapped for mana, its controller adds an additional|you tap a creature for mana, add an additional) (.+)\.$/.exec(line);
  if(manaBonus){
    const value=manaBonus[2],same=value==='one mana of any type that land produced',any=/^(one|two|three|four|\d+) mana (?:of any color|in any combination of colors)$/.exec(value),fixed=/^(?:\{[WUBRGC]\})+$/.test(value)?Object.fromEntries([...new Set([...value.matchAll(/\{([WUBRGC])\}/g)].map(m=>m[1]))].map(color=>[color,[...value.matchAll(new RegExp('\\{'+color+'\\}','g'))].length])):null;
    if(same||any||fixed)return {kind:'mana-bonus-v10',attached:manaBonus[1].startsWith('enchanted'),all:manaBonus[1].startsWith('a player')||manaBonus[1].startsWith('a Forest'),filter:h.target('target '+(manaBonus[1].startsWith('a Forest')?'Forest land':manaBonus[1].startsWith('you tap a creature')?'creature':'land')),...(same?{same:true}:any?{any:({one:1,two:2,three:3,four:4}[any[1]]??Number(any[1]))}:{fixed}),contract:'mana-bonus-v10'};
  }
  if(new RegExp('^When '+self(card)+" dies, if it was a creature, return it to the battlefield under its owner's control\\. It's an enchantment\\.$",'i').test(line))return {kind:'generic-trigger',event:'dies',eventFilter:'self',condition:{kind:'source-quality',filter:{what:'creature',zone:'battlefield',controller:'any'}},effects:[{action:'reanimate',target:'event-card',controller:'owner',entryAnimationV10:{types:['Enchantment'],subtypes:[],keywords:[],retainTypes:false,retainAllSubtypes:false,temporary:false}}],targets:[],optional:false,contract:'generic-trigger-effect'};
  const counterChain=/^((?:When|Whenever) .+?), (put (?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+) [^.]+? counters? on this (?:creature|permanent|artifact|enchantment)\. (?:Then )?[Ii]f (?:it|this (?:creature|permanent|artifact|enchantment)) has .+)$/.exec(line);
  if(counterChain){const event=h.line(card,counterChain[1]+', draw a card.'),effect=h.effect(card,counterChain[2]);if(event?.kind==='generic-trigger'&&effect&&!effect.optional&&!effect.v4Body&&!effect.targets.length&&!/"event-/.test(JSON.stringify(effect)))return {...event,...effect};}
  const prototype=/^Prototype ((?:\{(?:\d+|[WUBRGC])\})+) — (\d+)\/(\d+)$/.exec(line);
  if(prototype&&/Artifact Creature/.test(card.type_line||''))return {kind:'mechanic-prototype-v10',cost:prototype[1],power:prototype[2],toughness:prototype[3],contract:'mechanic-prototype-v10'};
  const combinedType=/^((?:Enchanted|Equipped) (?:creature|artifact|land|permanent)) (.+?)(?:,? and is|, is) (.+)\.$/.exec(line);
  if(combinedType){
    const child=h.line(card,combinedType[1]+' '+combinedType[2].replace(/, (has|have) /g,' and $1 ')+'.'),type=h.line(card,combinedType[1]+' is '+combinedType[3]+'.');
    if(child&&['attachment-grant','generic-static','base-pt-static'].includes(child.kind)&&type?.kind==='v8-type-static'&&type.attached)return {...type,kind:'v8-layered-static',operation:child,contract:'continuous-layered-characteristics'};
  }
  const typedRestriction=/^((?:Enchanted|Equipped) creature) is (.+?) and (can't attack or block|can't attack|can't block)\.$/.exec(line);
  if(typedRestriction){const type=h.line(card,typedRestriction[1]+' is '+typedRestriction[2]+'.'),child=h.line(card,typedRestriction[1]+' '+typedRestriction[3]+'.');if(type?.kind==='v8-type-static'&&child?.kind==='attachment-grant')return {...type,kind:'v8-layered-static',operation:child,contract:'continuous-layered-characteristics'};}
  const typed=/^(.+?) (?:is|are) (?:an? )?(?:(white|blue|black|red|green) )?([A-Z][A-Za-z -]+?)( in addition to (?:its|their) other (?:creature )?(?:colors and )?types)?\.$/.exec(line);
  if(typed){
    const types=singularTypes(typed[3]).split(' '),base=h.line(card,typed[1]+' are blue.');
    if(base?.kind==='v8-type-static'&&!base.own&&types.every(type=>ORACLE_SUBTYPES.has(type)&&!ORACLE_SUBTYPE_TYPES[type]))return {...base,change:{[typed[4]?'addCreatureTypes':'replaceCreatureTypesV10']:types,...(typed[2]?{[typed[4]?.includes('colors and')?'addColorsV10':'colors']:[{white:'W',blue:'U',black:'B',red:'R',green:'G'}[typed[2]]]}:{})}};
  }
  const supertype=/^(.+?) (?:is|are) (legendary|basic)\.$/.exec(line);
  if(supertype){const base=h.line(card,supertype[1]+' are blue.');if(base?.kind==='v8-type-static'&&!base.own)return {...base,change:{addSuperV10:[supertype[2][0].toUpperCase()+supertype[2].slice(1)]}};}
  const powerUp=/^Power-up — (.+)$/.exec(line);
  if(powerUp){const parsed=h.line(card,powerUp[1]),simple=/^(?:\{(?:\d+|X|[WUBRGC])\})*$/;if(parsed?.kind==='generic-ability'&&!parsed.from&&simple.test(card.mana_cost||'')&&simple.test(parsed.cost?.mana||''))return {...parsed,powerUp:true,oncePerObject:true};return null;}
  const damageIf=/^((?:When|Whenever) .+? is dealt (?:combat |noncombat )?damage), if (.+?), (.+)$/.exec(line);
  if(damageIf){const condition=h.condition(damageIf[2]),parsed=condition&&h.line(card,damageIf[1]+', '+damageIf[3]);if(parsed?.kind==='generic-trigger'&&!parsed.condition)return {...parsed,condition};}
  const counterCast=/^((?:When|Whenever) (?:you cast|an opponent casts|a player casts) .+? spell), (.+)\.$/.exec(line);
  if(counterCast&&/\bcounter (?:it|that spell)\b/i.test(counterCast[2])){
    const parsed=h.line(card,counterCast[1].replace(/^When /,'Whenever ')+', draw a card.'),effect=h.effect(card,counterCast[2].replace(/\bcounter it\b/gi,'counter that spell')+'.');
    if(parsed?.kind==='generic-trigger'&&parsed.event==='cast'&&effect&&!effect.v4Body)return {...parsed,...effect};
  }
  const numericGrant=/\b(toxic|firebending|frenzy|poisonous) ([1-9][0-9]*)(?=\.| as long as )/.exec(line);
  if(numericGrant&&/\b(?:has|have)\b/.test(line)){
    const parsed=h.line(card,line.replace(numericGrant[0],'flying'));
    if(parsed&&['generic-static','attachment-grant'].includes(parsed.kind)){
      const n=Number(numericGrant[2]),kind=numericGrant[1],keywords=(parsed.keywords||[]).filter(k=>k!=='flying'||line.includes('flying'));
      if(kind==='toxic')return {...parsed,keywords,toxicV10:n};
      const operation=kind==='poisonous'?h.line(card,'Whenever this creature deals combat damage to a player, that player gets '+n+' poison counters.'):h.line(card,kind[0].toUpperCase()+kind.slice(1)+' '+n);
      if(operation?.kind==='generic-trigger')return parsed.kind==='attachment-grant'&&!parsed.condition?{kind:'operation-bundle',operations:[{...parsed,keywords},{kind:'attachment-operation',operation,contract:'attachment-granted-operation'}],contract:'closed-permanent-clauses'}:parsed.kind==='generic-static'?{...parsed,keywords,grantedOperation:operation}:null;
    }
  }
  const selfFlash=new RegExp('^'+escape(card.name)+' has flash as long as (.+)\\.$').exec(line);
  if(selfFlash)return modifierOperation(card,'This spell has flash as long as '+selfFlash[1]+'.',h);
  if(line.includes('flash')){const flash=modifierOperation(card,line,h);if(flash?.kind==='generic-static')return flash;}
  const costQuality=/^Each spell you cast that's (.+?) costs (.+)\.$/.exec(line);
  if(costQuality){const parsed=h.line(card,costQuality[1][0].toUpperCase()+costQuality[1].slice(1)+' spells you cast cost '+costQuality[2]+'.');if(parsed?.kind==='cost-modifier')return parsed;}
  const tokenBlock=/^(.+? can't be blocked by )tokens\.$/.exec(line);
  if(tokenBlock)return h.line(card,tokenBlock[1]+'token creatures.');
  const lure=/^All creatures able to block (this creature|enchanted creature|equipped creature) do so\.$/.exec(line);
  if(lure){const parsed=h.line(card,lure[1][0].toUpperCase()+lure[1].slice(1)+' gets +0/+0.');if(parsed&&['generic-static','attachment-grant'].includes(parsed.kind))return {...parsed,lure:true};}
  const escaped=/^When this creature enters, sacrifice it unless it escaped\.$/.exec(line);
  if(escaped)return {kind:'generic-trigger',event:'etb',eventFilter:'self',condition:{kind:'not',condition:{kind:'cast-flag-v10',flag:'escape'}},targets:[],effects:[{action:'sacrifice-source'}],contract:'generic-trigger-effect'};
  const observed=/^(?:When|Whenever) (another |an? )?(.+?) (enters|dies|leaves the battlefield|attacks|blocks), (.+)$/.exec(line);
  if(observed&&!observed[1]&&/^(?:enchanted|equipped) creature$/.test(observed[2])){
    let parsed;
    const variable=/^(.+), where X is its (power|toughness|mana value)\.$/.exec(observed[4]);
    if(variable){const base=h.effect(card,variable[1]+'.'),bind=node=>node==='X'?{kind:'bound-x-v10'}:Array.isArray(node)?node.map(bind):node&&typeof node==='object'?Object.fromEntries(Object.entries(node).map(([key,value])=>[key,bind(value)])):node;
      if(base&&!base.optional&&!base.v4Body&&!JSON.stringify(base.targets).includes('"X"'))parsed={...base,effects:[{action:'with-x-v10',value:{kind:'event-card-stat',stat:variable[2]==='mana value'?'mv':variable[2]},effects:bind(base.effects)}]};
    }
    if(observed[3]==='dies'&&observed[4]==="return it to the battlefield tapped under its owner's control.")parsed=h.effect(card,"Return that card to the battlefield tapped under its owner's control.");
    const ordeal=/^put a (\+1\/\+1) counter on it\. (?:Then )?if it has (three|four|five|[0-9]+) or more \1 counters on it, sacrifice this Aura\.$/i.exec(observed[4]);
    if(ordeal&&/\bAura\b/.test(card.type_line))parsed=body([{action:'counter',target:'event-card',counter:ordeal[1],n:1},{action:'conditional',conditionTarget:'event-card',condition:{kind:'count-comparison',count:{kind:'source-counters',counter:ordeal[1]},min:({three:3,four:4,five:5}[ordeal[2]]??Number(ordeal[2]))},effects:[{action:'sacrifice-source'}]}]);
    if(parsed&&!JSON.stringify(parsed).includes('unbound-object-v10'))return {kind:'generic-trigger',event:({enters:'etb',dies:'dies','leaves the battlefield':'lto',attacks:'attacks',blocks:'blocks'})[observed[3]],eventFilter:{kind:'v8-event',subject:'attached'},...parsed,contract:'generic-trigger-effect'};
  }
  if(observed&&observed[1]){const target=h.target('target '+observed[2]);if(target?.zone==='battlefield'&&(target.enchanted||target.equipped)){
    const parsed=h.effect(card,observed[4]),attached=!observed[1]&&/^(?:enchanted|equipped) (?:creature|permanent|artifact|land)$/.test(observed[2]);if(parsed&&!JSON.stringify(parsed).includes('unbound-object-v10'))return {kind:'generic-trigger',event:({enters:'etb',dies:'dies','leaves the battlefield':'lto',attacks:'attacks',blocks:'blocks'})[observed[3]],eventFilter:attached?{kind:'attached-object'}:{kind:'filtered-object',target,another:observed[1]==='another '},...parsed,contract:'generic-trigger-effect'};
  }}
  const groupStatic=/^((?:All |Other |Each )?[^.:]+?) (have|has|get|gets) (.+)\.$/.exec(line);
  if(groupStatic&&/^(?:[Uu]nblocked |[Ss]now |[Nn]onsnow )/.test(groupStatic[1])){
    const noun=singularTypes(groupStatic[1].replace(/^(?:All |Other |Each )/,'').replace(/^(Unblocked|Snow|Nonsnow)/,word=>word.toLowerCase())).replace(/\bcreatures\b/,'creature');
    const target=h.target('target '+noun),parsed=h.line(card,'This creature '+({'have':'has','get':'gets'}[groupStatic[2]]||groupStatic[2])+' '+groupStatic[3]+'.');
    if(target?.zone==='battlefield'&&parsed?.kind==='generic-static'&&parsed.scope==='self')return {...parsed,scope:'filtered-permanents',filters:[target],excludeSelf:groupStatic[1].startsWith('Other ')};
  }
  if(/\bLand\b/.test(card.type_line)){const kws=h.keywordList(line);if(kws?.length)return {kind:'generic-static',scope:'self',power:0,toughness:0,keywords:kws,contract:'continuous-layer'};}
  const staticIf=/^(.+? (?:has|have|gets|get) [^.]+?) if ([^.]+)\.$/.exec(line);
  if(staticIf&&h.condition(staticIf[2])){const parsed=h.line(card,staticIf[1]+' as long as '+staticIf[2]+'.');if(parsed&&['generic-static','attachment-grant','v8-layered-static'].includes(parsed.kind))return parsed;}
  const prefixSelf=/^When (.+?) dies, return this card to your hand\.$/.exec(line);
  if(prefixSelf&&card.name.startsWith(prefixSelf[1]+','))return h.line(card,'When this creature dies, return this card from your graveyard to your hand.');
  const also=/^This (?:creature|permanent) is also (?:a|an) (.+)\.$/.exec(line);
  if(also){const types=also[1].split(/,? and |, /);if(types.length>1&&types.every(type=>ORACLE_SUBTYPES.has(type)))return {kind:'characteristic-subtypes-v10',types,contract:'characteristic-subtypes-v10'};}
  if(line.includes('cycling ')&&line.includes(', ')){
    const pieces=line.split(', '),operations=pieces.map(piece=>v9.modifierOperation(card,piece[0].toUpperCase()+piece.slice(1),h));
    if(operations.length>1&&operations.every(op=>op?.kind==='mechanic-typecycling'))return {kind:'operation-bundle',operations,contract:'closed-permanent-clauses'};
  }
  const giftSelf=/^((?:When|Whenever) this (creature|permanent|artifact|enchantment) enters(?: from a graveyard)?, )((?:target opponent|target player) gains control of )it\.$/i.exec(line);
  if(giftSelf)return h.line(card,giftSelf[1]+giftSelf[3]+'this '+giftSelf[2]+'.');
  const deathHand=/^((?:When|Whenever) .+? dies, )return this card to your hand\.$/i.exec(line);
  if(deathHand){const parsed=h.line(card,deathHand[1]+'return this card from your graveyard to your hand.');if(parsed?.kind==='generic-trigger'&&parsed.eventFilter==='self')return {...parsed,effects:parsed.effects.map(effect=>effect.action==='return-grave-source'?{...effect,action:'return-dead-source-v10'}:effect)};}
  const prefixedQuality=/^(.+?)[,;] ((?:protection|hexproof) from .+)$/i.exec(line);
  if(prefixedQuality){const keywords=h.keywordList(prefixedQuality[1]),rule=modifierOperation(card,prefixedQuality[2],h);if(keywords&&rule)return {kind:'operation-bundle',operations:[{kind:'generic-static',scope:'self',power:0,toughness:0,keywords,contract:'continuous-layer'},rule],contract:'closed-permanent-clauses'};}
  const limited=/^(.+?) Activate no more than (twice|three times|four times) each turn\.$/.exec(line);
  if(limited){const parsed=h.line(card,limited[1]);if(parsed?.kind==='generic-ability'&&!parsed.onceEachTurn&&!parsed.oncePerObject&&!parsed.from)return {...parsed,maxEachTurnV10:({twice:2,'three times':3,'four times':4})[limited[2]]};}
  const granted=/\b(prowess|mentor|training|battle cry|afterlife [1-9][0-9]*|bushido [1-9][0-9]*|renown [1-9][0-9]*)\.$/.exec(line);
  if(granted&&/\b(?:has|have)\b/.test(line)){
    const parsed=h.line(card,line.slice(0,granted.index)+'flying.'),numbered=/^(afterlife|bushido|renown) ([0-9]+)$/.exec(granted[1]),kind=numbered?numbered[1]:granted[1]==='prowess'?'prowess-v10':granted[1].replace(' ','-');
    if(parsed&&['generic-static','attachment-grant'].includes(parsed.kind))return {...parsed,keywords:(parsed.keywords||[]).filter(k=>k!=='flying'||/\bflying\b/.test(line)),grantedMechanicV9:{kind:'mechanic-'+kind,...(numbered?{n:Number(numbered[2])}:{}),contract:'mechanic-'+kind}};
  }
  const activationBan=/^Activated abilities of (.+?) can't be activated\.$/.exec(line);
  if(activationBan){const filters=activationBan[1].split(/,? and |, /).map(noun=>h.target('target '+noun.replace(/\b(artifacts|creatures|enchantments|lands|planeswalkers)\b/g,w=>w.slice(0,-1)).replace(/ your opponents control$/,' an opponent controls')));if(filters.length>1&&filters.every(filter=>filter?.zone==='battlefield'))return {kind:'generic-static',scope:'filtered-permanents',filters,activationDisabled:true,contract:'generic-continuous-effect'};}
  const landType=/^All (Plains|Islands|Swamps|Mountains|Forests) are (Plains|Islands|Swamps|Mountains|Forests)\.$/.exec(line);
  if(landType)return {kind:'v8-land-types',filters:[{what:'land',zone:'battlefield',controller:'any',min:1,subtype:landType[1]==='Plains'?'Plains':landType[1].slice(0,-1)}],types:[landType[2]==='Plains'?'Plains':landType[2].slice(0,-1)],retain:false,contract:'continuous-basic-land-types'};
  if(/^You control enchanted creature\.$/.test(line)&&/\bBestow /m.test(card.oracle_text||''))return {kind:'aura-control-v8',contract:'aura-control-v8'};
  const selfPronoun=/^((?:When|Whenever) (this (?:creature|permanent|artifact|enchantment)|equipped creature|enchanted creature) (?:attacks(?: alone)?|blocks|dies|leaves the battlefield|deals (?:combat )?damage(?: to (?:a player|an opponent))?), )(.+)$/.exec(line);
  if(selfPronoun&&/\bit\b/.test(selfPronoun[3])&&!/\b(?:target|create|choose|reveal|look|exile|return|draw)\b/.test(selfPronoun[3])){
    const parsed=h.line(card,selfPronoun[1]+selfPronoun[3].replace(/\bit\b/g,selfPronoun[2]));if(parsed)return parsed;
  }
  const selfTap=/^([^:]+: This (?:creature|permanent) [^.]+\.) (Tap|Untap) it\.$/.exec(line);
  if(selfTap&&!/\btarget\b/.test(selfTap[1])){const parsed=h.line(card,selfTap[1]+' '+selfTap[2]+' this creature.');if(parsed)return parsed;}
  const saddled=/^((?:When|Whenever) .+?) attacks while saddled, (.+)$/.exec(line);
  if(saddled){const effect=/\b(?:target|that|create|search|look|reveal|choose|exile|return|draw)\b/i.test(saddled[2])?saddled[2]:saddled[2].replace(/\bit\b/gi,'this creature');const parsed=h.line(card,saddled[1]+' attacks, '+effect);if(parsed?.kind==='generic-trigger'&&parsed.event==='attacks'&&parsed.eventFilter==='self')return {...parsed,eventFilter:{kind:'saddled-v10',base:'self'}};}
  const selfAnimation=/^This artifact is (?:a|an) ([0-9]+)\/([0-9]+) ((?:[A-Z][a-z]+ )*)artifact creature(?: with ([a-z ,]+))? as long as (.+)\.$/.exec(line);
  if(selfAnimation&&/\bArtifact\b/.test(card.type_line)){
    const types=selfAnimation[3].trim().split(' ').filter(Boolean),keywords=selfAnimation[4]?h.keywordList(selfAnimation[4]):[],condition=h.condition(selfAnimation[5]);
    if(types.every(type=>ORACLE_SUBTYPES.has(type))&&keywords&&condition)return {kind:'v8-layered-static',own:true,change:{creatureV9:true,addCreatureTypes:types},condition,operation:{kind:'base-pt-static',power:Number(selfAnimation[1]),toughness:Number(selfAnimation[2]),keywords},contract:'continuous-layered-characteristics'};
  }
  const additionalStats=/^(.+? gets?) an additional ([+-][0-9]+\/[+-][0-9]+)(.+)\.$/.exec(line);
  if(additionalStats)return h.line(card,additionalStats[1]+' '+additionalStats[2]+additionalStats[3]+'.');
  const forcedOnly=/^(.+?) (attacks?|blocks?) each combat if able\.$/.exec(line);
  if(forcedOnly){const parsed=h.line(card,forcedOnly[1]+' gets +0/+0.');if(parsed&&['generic-static','attachment-grant'].includes(parsed.kind))return {...parsed,...(forcedOnly[2].startsWith('attack')?{mustAttack:true}:{combatRule:{kind:'required-block'}})};}
  const animation=/^(.+?) (?:is|are) ([0-9]+)\/([0-9]+) creatures? that (?:is|are) still lands?\.$/.exec(line);
  if(animation){const base=h.line(card,animation[1]+' are blue.');if(base?.kind==='v8-type-static'&&!base.own)return {...base,kind:'v8-layered-static',change:{creatureV9:true},operation:{kind:'base-pt-static',power:Number(animation[2]),toughness:Number(animation[3]),keywords:[]},contract:'continuous-layered-characteristics'};}
  const extraType=/^(.+?) (?:is|are) (?:an? )?(artifact|enchantment)s? in addition to (?:its|their) other types\.$/.exec(line);
  if(extraType){const base=h.line(card,extraType[1]+' are blue.');if(base?.kind==='v8-type-static'&&!base.own)return {...base,change:{addTypesV10:[extraType[2][0].toUpperCase()+extraType[2].slice(1)]}};}
  const snowType=/^(.+?) (?:is|are) (no longer )?snow\.$/.exec(line);
  if(snowType){const base=h.line(card,snowType[1]+' are blue.');if(base?.kind==='v8-type-static'&&!base.own)return {...base,change:{[snowType[2]?'removeSuperV10':'addSuperV10']:['Snow']}};}
  const entryAttach=/^When this Equipment enters, attach it to (target .+)\.$/.exec(line);
  if(entryAttach&&/\bEquipment\b/.test(card.type_line)){const target=h.target(entryAttach[1]);if(target?.zone==='battlefield')return {kind:'generic-trigger',event:'etb',eventFilter:'self',targets:[target],effects:[{action:'attach-source',target:0}],optional:false,contract:'generic-trigger-effect'};}
  const selfEvents=new RegExp('^(?:When|Whenever) '+self(card)+' (enters|dies|attacks|blocks|leaves the battlefield|becomes tapped|becomes untapped) or (enters|dies|attacks|blocks|leaves the battlefield|becomes tapped|becomes untapped), (.+)$','i').exec(line);
  if(selfEvents&&selfEvents[1]!==selfEvents[2]){const operations=selfEvents.slice(1,3).map(event=>h.line(card,(/^(enters|dies)$/.test(event)?'When':'Whenever')+' this creature '+event+', '+selfEvents[3]));if(operations.every(op=>op?.kind==='generic-trigger'))return {kind:'operation-bundle',operations,contract:'closed-permanent-clauses'};}
  const choice=/^(.+?: )((?:this creature|this permanent) gets )([+-][0-9]+\/[+-][0-9]+) or ([+-][0-9]+\/[+-][0-9]+) until end of turn\.$/i.exec(line);
  if(choice)return h.line(card,choice[1]+'Choose one —\n• '+choice[2]+choice[3]+' until end of turn.\n• '+choice[2]+choice[4]+' until end of turn.');
  const forced=/^(.+?) (?:has|have) (.+) and (attacks?|blocks?) each combat if able\.$/.exec(line);
  if(forced){const base=h.line(card,forced[1]+(line.includes(' have ')?' have ':' has ')+forced[2]+'.');if(base&&['generic-static','attachment-grant'].includes(base.kind))return {...base,...(forced[3].startsWith('attack')?{mustAttack:true}:{combatRule:{kind:'required-block'}})};}
  const forcedStats=/^(.+? gets? [+-][0-9]+\/[+-][0-9]+) and blocks? each combat if able\.$/.exec(line);
  if(forcedStats){const base=h.line(card,forcedStats[1]+'.');if(base&&['generic-static','attachment-grant'].includes(base.kind))return {...base,combatRule:{kind:'required-block'}};}
  const entry=new RegExp('^'+self(card)+' enters with X ([+-][0-9]+/[+-][0-9]+|[a-z]+) counters on it\\.$','i').exec(line);
  if(entry&&/\{X\}/.test(card.mana_cost||'')&&!/Instant|Sorcery/.test(card.type_line))return {kind:'enters-with-counters',counter:entry[1],n:'X',contract:'permanent-enters-with-counters'};
  if(/As .+ enters, choose a color\./i.test(card.oracle_text||'')){
    const cast=/^Whenever (you cast|a player casts|an opponent casts) a spell of the chosen color, (.+)$/.exec(line);
    if(cast){const parsed=h.effect(card,cast[2]);if(parsed)return {kind:'generic-trigger',event:'cast',eventFilter:{kind:'your-filtered-cast',what:'card',controller:cast[1]==='you cast'?'you':cast[1]==='a player casts'?'any':'opponent',chosenColorV10:true},...parsed,contract:'generic-trigger-effect'};}
    const protect=/^(.+?) (?:has|have) protection from the chosen color\.( This effect doesn't remove this Aura\.)?$/.exec(line);
    if(protect){const base=h.line(card,protect[1]+' '+(line.includes(' have ')?'have':'has')+' protection from blue.');if(base?.kind==='protection-static')return {...base,qualities:[{kind:'chosen-color-v10'}],...(protect[2]?{retainSourceAuraV9:true}:{})};}
    const color=/^(.+?) (?:is|are) the chosen color\.$/.exec(line);
    if(color){const own=/^this (?:creature|permanent|artifact|enchantment)$/i.test(color[1]);const base=own?{kind:'v8-type-static',own:true,change:{},contract:'continuous-characteristic-type'}:h.line(card,color[1]+' are blue.');if(base?.kind==='v8-type-static')return {...base,change:{chosenColorV10:true}};}
  }
  const doubleEvent=/^((?:When|Whenever) .+?) and (when(?:ever)? .+?), (.+)$/.exec(line);
  if(doubleEvent){
    const operations=doubleEvent.slice(1,3).map(prefix=>h.line(card,prefix.replace(/^[a-z]/,c=>c.toUpperCase()).replace(/\bit\b/g,card.name)+', '+doubleEvent[3]));
    if(operations.every(operation=>operation?.kind==='generic-trigger'))return {kind:'operation-bundle',operations,contract:'closed-permanent-clauses'};
  }
  const unlocked=/^Whenever you fully unlock a Room, (.+)$/.exec(line);
  if(unlocked){const parsed=h.effect(card,unlocked[1]);if(parsed&&!parsed.v4Body&&!/event-card|event-player/.test(JSON.stringify(parsed)))return {kind:'generic-trigger',event:'unlockDoor',eventFilter:{kind:'observation-v9',fullyUnlockedV10:true},...parsed,contract:'generic-trigger-effect'};}
  const group=/^((?:All |Other |Each |Each other )?[^.:]+?)( (?:get|gets|have|has) .+)$/s.exec(line);
  if(group){const singular=singularTypes(group[1]);if(singular!==group[1]){const parsed=h.line(card,singular+group[2]);if(parsed)return parsed;}}
  // Prowess is a triggered ability; granting its name must add the actual
  // trigger, including an additional instance on a creature that already has it.
  const prowess=/^(.+?) (have|has) prowess\.$/.exec(line);
  if(prowess)return h.line(card,prowess[1]+' '+prowess[2]+' "Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn."');
  if(line.startsWith('Max speed — ')){
    const parsed=h.line(card,line.slice('Max speed — '.length));if(!parsed)return null;
    const operation=h.normalizeOperations([parsed])[0];
    const speed={kind:'player-speed-v10',min:4};
    if(['generic-trigger','mana-source'].includes(operation.kind)||operation.kind==='generic-ability'&&!operation.from)
      return {kind:'generic-static',scope:'self',condition:speed,grantedOperation:operation,contract:'generic-continuous-effect'};
    const key=operation.kind==='generic-ability'?'activationCondition':['generic-static','cost-modifier'].includes(operation.kind)?'condition':null;
    if(key)return {...operation,[key]:operation[key]?{kind:'all',conditions:[operation[key],speed]}:speed};
    return null;
  }
  const mutation=new RegExp('^Whenever '+self(card)+' mutates, (.+)$','i').exec(line);
  if(mutation){const parsed=h.effect(card,mutation[1]);if(parsed&&!parsed.v4Body)return {kind:'generic-trigger',event:'mutated',eventFilter:'self',...parsed,contract:'generic-trigger-effect'};}
  const typal=/^(Each other creature you control|Each creature you control|Each creature) that's (.+?) (gets [+-][0-9]+\/[+-][0-9]+(?: and has .+)?|has .+)\.$/.exec(line);
  if(typal){const target=h.target('target creature'+(typal[1].includes('you control')?' you control':'')+" that's "+typal[2]),operation=h.line(card,'This creature '+typal[3]+'.');
    if(target&&operation?.kind==='generic-static'&&operation.scope==='self')return {...operation,scope:'filtered-permanents',filters:[target],excludeSelf:typal[1].includes('other')};}
  // "It" in another permanent's arrival trigger names that entering object.
  // Preserve the intervening-if check and its caster through resolution.
  const arrival=/^((?:When|Whenever) .+? enters), if you cast it, (.+)$/.exec(line);
  if (arrival) {
    const parsed=h.line(card,arrival[1]+', '+arrival[2]);
    if(parsed?.kind==='generic-trigger'&&parsed.event==='etb'&&!parsed.condition)
      return {...parsed,condition:{kind:'event-cast-v10',by:'you'}};
  }
  return v9.extensionLine(card,line,h);
}
export function extensionEffect(card, line, h) {
  const lostLife=/^Target player who lost life this turn loses ([0-9]+) life\.$/.exec(line);
  if(lostLife)return body([{action:'lose-life',who:0,n:Number(lostLife[1])}],[h.target('target player who lost life this turn')]);
  if(line==="Damage can't be prevented this turn.")return body([{action:'no-prevention-v10'}]);
  const unpreventable=/^(.+ deals .+ damage [^.]+)\. The damage can't be prevented\.$/.exec(line);
  if(unpreventable){const parsed=h.effect(card,unpreventable[1]+'.');if(parsed&&!parsed.v4Body&&parsed.effects.length===1&&parsed.effects[0].action==='damage')return {...parsed,effects:[{...parsed.effects[0],cantBePreventedV10:true}]};}
  const uncounterable=/^Target spell can't be countered\.$/.test(line);
  if(uncounterable)return body([{action:'uncounterable-spell-v10',target:0}],[h.target('target spell')]);
  const nextUncounterable=/^The next (creature spell|instant or sorcery spell|spell) you cast this turn can't be countered\.$/.exec(line);
  if(nextUncounterable)return body([{action:'next-uncounterable-v10',quality:nextUncounterable[1]==='creature spell'?'creature':nextUncounterable[1]==='spell'?'all':'instant-sorcery'}]);
  const attach=new RegExp('^Attach this Aura to (target (?:creature|artifact|enchantment|land|permanent))( other than enchanted (?:creature|permanent))?\\.$','i').exec(line);
  if(attach){const filter=h.target(attach[1].toLowerCase());if(filter?.zone==='battlefield')return body([{action:'attach-source',target:0}],[{...filter,...(attach[2]?{notAttachedHostV10:true}:{})}]);}
  const host=/\b(enchanted|equipped) (creature|permanent|artifact|enchantment|land)\b/i.exec(line);
  if(host&&!/\btarget\b/i.test(line)&&!line.includes('"')&&[...line.matchAll(/\b(?:enchanted|equipped) (?:creature|permanent|artifact|enchantment|land)\b/gi)].length===1){
    const translated=line.replace(host[0],'target '+host[2]),parsed=h.effect(card,translated);
    if(parsed&&!parsed.v4Body&&parsed.targets.length===1&&parsed.targets[0].zone==='battlefield'&&!parsed.optional&&parsed.effects.every(effect=>['bounce','return-to-hand','destroy','exile','tap','untap','regenerate','pump','animate','base-pt','move-to-library'].includes(effect.action)&&effect.target===0))return body(parsed.effects.map(effect=>({...effect,target:'attached-host'})));
  }
  const shuffleHost=/^(Enchanted (?:creature|permanent))'s owner shuffles it into their library\.$/.exec(line);
  if(shuffleHost)return h.effect(card,'Shuffle '+shuffleHost[1].toLowerCase()+" into its owner's library.");
  const each=/^Each (other )?(creature|artifact|land|enchantment|permanent)(.*?) (gets|gains) (.+)$/i.exec(line);
  if(each){const parsed=h.effect(card,'All '+(each[1]||'')+each[2]+'s'+each[3]+' '+(each[4]==='gets'?'get':'gain')+' '+each[5]);if(parsed)return parsed;}
  const createdGrant=/^(Create .+)\. (It|They) (gets?|gains?) (.+ until end of turn)\.$/i.exec(line);
  if(createdGrant){
    const parsed=h.effect(card,createdGrant[1]+'.'),grant=h.effect(card,'Target creature '+(createdGrant[3].startsWith('get')?'gets':'gains')+' '+createdGrant[4]+'.');
    if(parsed&&!parsed.optional&&!parsed.v4Body&&!parsed.targets.length&&grant&&!grant.optional&&grant.targets.length===1&&grant.effects.length===1&&grant.effects[0].action==='pump'){
      const copy=structuredClone(parsed);let effects=copy.effects;
      while(effects.length===1&&effects[0].action==='with-x-v10')effects=effects[0].effects;
      const creation=effects.at(-1);
      if(['token-inline','token-key','copy-token-v8'].includes(creation?.action)&&(createdGrant[2].toLowerCase()==='they'||creation.n===1)){effects.push({...grant.effects[0],target:'created-tokens'});return copy;}
    }
  }
  const equalAmount=/^((?:You|Each player|Each opponent|Target player|Target opponent|That player|Its controller|That creature's controller) (?:may )?)(gains?|loses?) life equal to (.+)\.$/i.exec(line);
  const equalDraw=/^((?:You|Each player|Each opponent|Target player|Target opponent|That player|Its controller) (?:may )?)draws? (?:a number of )?cards equal to (.+)\.$/i.exec(line);
  if(equalAmount||equalDraw){const value=h.value(equalAmount?equalAmount[3]:equalDraw[2]),parsed=value!==null&&value!==undefined&&h.effect(card,equalAmount?equalAmount[1]+equalAmount[2]+' 1 life.':equalDraw[1]+'draw a card.');if(parsed&&!parsed.v4Body&&parsed.effects.length===1&&['gain-life','lose-life','draw'].includes(parsed.effects[0].action))return {...parsed,effects:[{...parsed.effects[0],n:value}]};}
  const hand=/^(You may )?Put (a|an|one|two|three|four|five|six|seven|eight|nine|ten|[0-9]+|any number of|up to (?:one|two|three|four|five|six|seven|eight|nine|ten|[0-9]+)) (.+?) cards? from your hand onto the battlefield( tapped)?\.$/i.exec(line);
  if(hand){const filter=h.target('target '+hand[3]+' card from your graveyard'),word=hand[2].replace(/^up to /,'').toLowerCase(),n=word==='any number of'?'all':({a:1,an:1,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10}[word]??Number(word));if(filter?.zone==='graveyard'&&!(n===1&&!filter.stat&&!filter.alternatives)&&['creature','artifact','enchantment','land','planeswalker','battle','permanent'].includes(filter.what))return body([{action:'zone-select',zone:'hand',destination:'battlefield',who:'you',n,upTo:!!hand[1]||/^(?:any|up to)/i.test(hand[2]),tapped:!!hand[4],filter:{...filter,zone:'hand'}}]);}
  const grave=/^Exile (?:(?:all cards from )?(all graveyards|your graveyard|all opponents' graveyards)|any number of target players' graveyards)\.$/i.exec(line);
  if(grave){const target=grave[1]?null:{what:'player',zone:'players',controller:'any',min:0,unbounded:true};return body([{action:'zone-select',zone:'graveyard',destination:'exile',who:target?0:grave[1]==='your graveyard'?'you':grave[1]==="all opponents' graveyards"?'each-opponent':'each-player',n:'all',filter:{what:'card',zone:'graveyard',controller:'you',min:1}}],target?[target]:[]);}
  const eachPrefix=/^For each (.+?), (.+)\.$/i.exec(line);
  if(eachPrefix){
    const count=h.value('the number of '+eachPrefix[1]),parsed=count&&h.effect(card,eachPrefix[2]+'.');
    if(parsed&&!parsed.optional&&!parsed.v4Body&&!parsed.targets.length&&parsed.effects.length===1&&['token-key','token-inline','draw','gain-life','lose-life','counter'].includes(parsed.effects[0].action)&&typeof parsed.effects[0].n==='number')return {...parsed,effects:[{...parsed.effects[0],n:{kind:'sum',values:[count],multiply:parsed.effects[0].n}}]};
  }
  const eachSuffix=/^(.+?) for each (.+)\.$/i.exec(line);
  if(eachSuffix){const value=h.value('the number of '+eachSuffix[2]),parsed=value&&h.effect(card,eachSuffix[1]+'.');if(parsed&&!parsed.optional&&!parsed.v4Body&&parsed.effects.length===1&&['token-key','token-inline','draw','gain-life','lose-life','counter'].includes(parsed.effects[0].action)&&typeof parsed.effects[0].n==='number')return {...parsed,effects:[{...parsed.effects[0],n:{kind:'sum',values:[value],multiply:parsed.effects[0].n}}]};}
  const twoSelfCounters=new RegExp('^Put (.+? counters?) and (.+? counters?) on '+self(card)+'\\.$','i').exec(line);
  if(twoSelfCounters){const first=h.effect(card,'Put '+twoSelfCounters[1]+' on this creature.'),second=h.effect(card,'Put '+twoSelfCounters[2]+' on this creature.');if(first?.effects.length===1&&second?.effects.length===1&&[first,second].every(parsed=>!parsed.targets.length&&parsed.effects[0].action==='counter'&&parsed.effects[0].target==='self'))return body([...first.effects,...second.effects]);}
  const restrictedMana=/^(Add (?:\{[WUBRGC]\})+)\. This mana can't be spent to cast a nonartifact spell\.$/i.exec(line);
  if(restrictedMana){const parsed=h.effect(card,restrictedMana[1]+'.');if(parsed?.effects.length===1&&parsed.effects[0].action==='add-mana')return {...parsed,effects:[{...parsed.effects[0],restriction:{spell:h.target('target artifact spell'),abilities:true}}]};}
  const kinship=/^You may look at the top card of your library\. If it shares a creature type with this creature, you may reveal it\. If you do, (.+)$/i.exec(line);
  if(kinship){const parsed=h.effect(card,kinship[1][0].toUpperCase()+kinship[1].slice(1));if(parsed&&!parsed.optional&&!parsed.v4Body&&!parsed.targets.length&&!/event-|unbound-object/.test(JSON.stringify(parsed.effects)))return body([{action:'kinship-v10',effects:parsed.effects}]);}
  const radiance=/(target (creature|enchantment)) and each other \2 that shares a color with it/i.exec(line);
  if(radiance){
    const normalized=line.replace(radiance[0],radiance[1]).replace(/Those creatures get /,'It gets ').replace(/Those creatures gain /,'It gains ').replace(/\bget (?=[+-])/g,'gets ').replace(/\bgain (?=[a-z])/g,'gains ');
    const parsed=h.effect(card,normalized);
    if(parsed&&!parsed.optional&&!parsed.v4Body&&parsed.targets.length===1&&parsed.effects.every(effect=>['damage','destroy','pump','prevent-next','tap','untap','unblockable-until-eot'].includes(effect.action)&&effect.target===0))return body([{action:'radiance-v10',target:0,what:radiance[2].toLowerCase(),effects:parsed.effects}],parsed.targets);
  }
  const conditionalStat=/^((?:Exile|Destroy|Gain control of) target .+?) if its (power|toughness|mana value) is (less than or equal to|greater than or equal to) (.+)\.$/i.exec(line);
  if(conditionalStat){const parsed=h.effect(card,conditionalStat[1]+'.'),value=h.value(conditionalStat[4]);if(parsed&&!parsed.optional&&!parsed.v4Body&&parsed.targets.length===1&&value!==null&&value!==undefined)return body([{action:'with-x-v10',value,effects:[{action:'conditional',conditionTarget:0,condition:{kind:'source-stat-comparison',stat:conditionalStat[2]==='mana value'?'mv':conditionalStat[2],comparison:conditionalStat[3].startsWith('less')?'less':'greater',threshold:{kind:'bound-x-v10'}},effects:parsed.effects}]}],parsed.targets);}
  if(!line.includes('"')){
    const replaced=/^(.+)\. If ([^,.]+), (?:instead (.+)|(.+) instead)\.$/.exec(line);
    if(replaced){
      const condition=h.condition(replaced[2]),ordinary=h.effect(card,replaced[1]+'.'),alternative=h.effect(card,(replaced[3]||replaced[4])+'.');
      const complete=parsed=>parsed&&!parsed.optional&&!parsed.v4Body&&parsed.effects?.length&&parsed.targets?.length<=1;
      if(condition&&complete(ordinary)&&complete(alternative)){
        let changed=alternative.effects,compatible=JSON.stringify(ordinary.targets)===JSON.stringify(alternative.targets);
        if(ordinary.targets.length===1&&!alternative.targets.length){
          const player=['player','opponent'].includes(ordinary.targets[0].what),reference=player?'event-player':'event-card';
          const serialized=JSON.stringify(changed);
          if(serialized.includes('"'+reference+'"')&&!/"(?:operation|grantedOperation)":/.test(serialized)){
            const bind=node=>node===reference?0:Array.isArray(node)?node.map(bind):node&&typeof node==='object'?Object.fromEntries(Object.entries(node).map(([key,value])=>[key,bind(value)])):node;
            changed=bind(changed);compatible=true;
          }
        }
        if(compatible&&!JSON.stringify(changed).includes('unbound-object-v10'))return body([{action:'conditional',condition,effects:changed,elseEffects:ordinary.effects}],ordinary.targets);
      }
    }
    const unless=/^(.+?)(?:\. (.+?))? unless (.+)\.$/.exec(line);
    if(unless){
      const condition=h.condition(unless[3]);
      if(condition?.kind==='value-comparison-v10'){
        const prefix=unless[2]?h.effect(card,unless[1]+'.'):body([]),tail=h.effect(card,(unless[2]||unless[1])+'.');
        if(prefix&&!prefix.optional&&!prefix.v4Body&&tail&&!tail.optional&&!tail.v4Body&&!tail.targets.length)return body([...prefix.effects,{action:'conditional',condition:{kind:'not',condition},effects:tail.effects}],prefix.targets);
      }
    }
  }
  if(card.oraclePrepareV10&&new RegExp('^'+self(card)+' becomes prepared\\.$','i').test(line))return body([{action:'prepare-v10',target:'self'}]);
  const severalRules=/^(Create [^"\n]+? creature tokens?)(?: with )([^"\n]*)("[^\n]+")\.$/i.exec(line);
  if(severalRules){const quotes=[...severalRules[3].matchAll(/"([^"\n]+)"/g)],joins=severalRules[3].replace(/"[^"\n]+"/g,'');
    if(quotes.length>1&&quotes.length<=4&&/^(?:\s|,|and)*$/.test(joins)){
      const prefix=severalRules[2].replace(/,? and $|, $/,'').trim(),parsed=h.effect(card,severalRules[1]+(prefix?' with '+prefix:'')+'.');
      if(parsed&&!parsed.optional&&!parsed.targets.length&&parsed.effects.length===1&&parsed.effects[0].action==='token-inline'){
        const token=parsed.effects[0].token,tokenCard={name:'Oracle created token',layout:'normal',type_line:token.types.join(' ')+' — '+token.subtypes.join(' '),mana_cost:'',oracle_text:quotes.map(match=>match[1]).join('\n')};
        const operations=quotes.map(match=>{const rule=match[1].replace(/this token/gi,'this creature').replace(/,$/,'.');return h.line(tokenCard,rule.endsWith('.')?rule:rule+'.');});
        if(operations.every(op=>op&&['generic-trigger','generic-ability','generic-static'].includes(op.kind)&&!JSON.stringify(op).includes('unbound-object-v10')))return {...parsed,effects:[{...parsed.effects[0],token:{...token,oracle:tokenCard.oracle_text,operations:h.normalizeOperations(operations)}}]};
      }
    }
  }
  if(/^Counter that spell\.$/i.test(line))return body([{action:'counter-spell',target:'event-stack-v10'}]);
  const actorMana=/^(That player|Its controller) adds? (.+)\.$/i.exec(line);
  if(actorMana){const parsed=h.effect(card,'Add '+actorMana[2]+'.');if(parsed?.effects.length===1&&parsed.effects[0].action==='add-mana'&&!parsed.targets.length&&!parsed.optional)return {...parsed,effects:[{...parsed.effects[0],who:actorMana[1].toLowerCase()==='that player'?'event-player':'event-card-controller'}]};}
  const actorToken=/^(That player|Its controller) creates? (.+)\.$/i.exec(line);
  if(actorToken){const parsed=h.effect(card,'Create '+actorToken[2]+'.');if(parsed?.effects.length===1&&['token-inline','token-key'].includes(parsed.effects[0].action)&&!parsed.targets.length&&!parsed.optional)return {...parsed,effects:[{...parsed.effects[0],who:actorToken[1].toLowerCase()==='that player'?'event-player':'event-card-controller'}]};}
  const sacrificeAmount=/^(?:You )?[Ss]acrifice X (.+)\.$/.exec(line);
  if(sacrificeAmount){const filter=h.target('target '+singularTypes(sacrificeAmount[1]).replace(/\b(creatures|permanents|artifacts|enchantments|lands|tokens)\b/g,word=>word.slice(0,-1))+' you control');if(filter?.zone==='battlefield')return body([{action:'choose-permanents',operation:'sacrifice',who:'you',n:'X',filter}]);}
  const amountEvent=/\bthat (?:much|many)\b/.test(line)&&!/["\n]|\b(?:if|instead|equal|where)\b/.test(line);
  if(amountEvent){const parsed=h.effect(card,line.replace(/\bthat (?:much|many)\b/g,'X'));
    if(parsed&&!parsed.optional&&!parsed.v4Body&&!JSON.stringify(parsed.targets).includes('"X"')&&parsed.effects.every(effect=>['damage','gain-life','lose-life','draw','choose-permanents','counter'].includes(effect.action)||effect.action==='battlefield-group'&&effect.operation==='damage')){const bind=node=>node==='X'?{kind:'event-amount'}:Array.isArray(node)?node.map(bind):node&&typeof node==='object'?Object.fromEntries(Object.entries(node).map(([key,value])=>[key,bind(value)])):node;return {...parsed,effects:bind(parsed.effects)};}
  }
  const actorChain=/^(Target opponent|Target player|Each opponent|Each player) (sacrifices? [^,.]+), (discards? [^,.]+), and (loses? [^,.]+ life)\.$/i.exec(line);
  if(actorChain){const pieces=actorChain.slice(2).map(piece=>h.effect(card,actorChain[1]+' '+piece+'.')),targeted=/^target /i.test(actorChain[1]);if(pieces.every(piece=>piece&&!piece.optional&&!piece.v4Body&&(targeted?piece.targets.length===1&&piece.targets[0].what===pieces[0].targets[0].what&&piece.targets[0].zone==='player'&&(piece.targets[0].max??1)===1&&!piece.targets[0].condition:piece.targets.length===0)))return {...pieces[0],effects:pieces.flatMap(piece=>piece.effects)};}
  const numericGrant=/\b(toxic|firebending|frenzy|poisonous) ([1-9][0-9]*)(?= until end of turn\.)/.exec(line);
  if(numericGrant&&/\bgains?\b/.test(line)){
    const parsed=h.effect(card,line.replace(numericGrant[0],'flying'));
    if(parsed?.effects.length===1&&(parsed.effects[0].action==='pump'||parsed.effects[0].action==='battlefield-group'&&parsed.effects[0].operation==='pump')){
      const n=Number(numericGrant[2]),kind=numericGrant[1],effect={...parsed.effects[0],keywords:(parsed.effects[0].keywords||[]).filter(k=>k!=='flying'||line.includes('flying'))};
      if(kind==='toxic')return {...parsed,effects:[{...effect,toxicV10:n}]};
      const operation=kind==='poisonous'?h.line(card,'Whenever this creature deals combat damage to a player, that player gets '+n+' poison counters.'):h.line(card,kind[0].toUpperCase()+kind.slice(1)+' '+n);
      if(operation?.kind==='generic-trigger')return {...parsed,effects:[effect,{action:'grant-operation',...(effect.filters?{filters:effect.filters}:{target:effect.target}),operation,keywords:[]}]};
    }
  }
  const redirect=/^Change the target of (target (?:spell|activated ability|spell or ability) with a single target)\.$/i.exec(line);
  if(redirect){const target=h.target(redirect[1].toLowerCase());if(target?.zone==='stack')return body([{action:'retarget-single-v10',target:0}],[target]);}
  const skip=/^(You skip your|Skip your|Target player skips their|Target opponent skips their|That player skips their) next (?:(one|two|three|[0-9]+) )?(turns?|untap steps?|draw steps?|combat phases?)( this turn)?\.$/i.exec(line);
  if(skip){const actor=skip[1].toLowerCase(),target=actor.startsWith('target ')?h.target(actor.startsWith('target opponent')?'target opponent':'target player'):null;return body([{action:'skip-v10',who:target?0:actor.startsWith('that player')?'event-player':'you',phase:skip[3].split(' ')[0].replace(/s$/,''),n:({one:1,two:2,three:3}[skip[2]]??Number(skip[2]||1)),thisTurn:!!skip[4]}],target?[target]:[]);}
  const poisonCounter=/^Counter target spell if its controller is poisoned\.$/i.exec(line);
  if(poisonCounter)return body([{action:'counter-spell',target:0}],[{...h.target('target spell'),controllerConditionV10:{kind:'player-poison-v9',min:1}}]);
  const lower=line.replace(/^(Snow|Nonsnow|Unblocked|Attacking|Blocking|Enchanted|Equipped|Modified)(?= creatures?\b)/,word=>word.toLowerCase());
  if(lower!==line){const parsed=h.effect(card,lower);if(parsed)return parsed;}
  const manifest=/^(its controller|that player|target player|target opponent) manifests? dread\.$/i.exec(line);
  if(manifest){const actor=manifest[1].toLowerCase(),target=actor.startsWith('target ')?h.target(actor):null;return body([{action:'face-down',kind:'manifest-dread',n:1,who:target?0:actor==='that player'?'event-player':'event-card-controller'}],target?[target]:[]);}
  const exileGrave=/^(Target player|Target opponent|Each player|Each opponent) exiles? (a|one|two|three|four|five|[0-9]+) cards? from their graveyard\.$/i.exec(line);
  if(exileGrave){const actor=exileGrave[1].toLowerCase(),target=actor.startsWith('target ')?h.target(actor):null;return body([{action:'zone-select',zone:'graveyard',who:target?0:actor.replace(' ','-'),filter:{what:'card',zone:'graveyard',controller:'you'},n:({a:1,one:1,two:2,three:3,four:4,five:5}[exileGrave[2]]??Number(exileGrave[2])),destination:'exile'}],target?[target]:[]);}
  const twice=/^Put twice X ([^.]*) counters on (.+)\.$/i.exec(line);
  if(twice){const parsed=h.effect(card,'Put X '+twice[1]+' counters on '+twice[2]+'.');if(parsed?.effects.length===1&&parsed.effects[0].action==='counter')return {...parsed,effects:[{...parsed.effects[0],n:{kind:'sum',values:['X','X']}}]};}
  const incubation=/^Incubate X twice, where X is (.+)\.$/i.exec(line);
  if(incubation){const parsed=h.effect(card,'Incubate X, where X is '+incubation[1]+'.');if(parsed&&!parsed.optional&&!parsed.targets.length&&parsed.effects.length===1&&parsed.effects[0].action==='with-x-v10'){const effect=parsed.effects[0];return {...parsed,effects:[{...effect,effects:[...effect.effects,...structuredClone(effect.effects)]}]};}}
  const extraLand=/^You may play (an|one|(?:up to )?(?:two|three|four|five|[0-9]+)) additional lands? this turn\.$/i.exec(line);
  if(extraLand){const word=extraLand[1].toLowerCase().replace(/^up to /,'');return body([{action:'additional-land-v10',who:'you',n:({an:1,one:1,two:2,three:3,four:4,five:5}[word]??Number(word))}]);}
  const noCreatures=/^(Target player|Target opponent|You|Your opponents|That player|Defending player) can't cast creature spells this turn\.$/i.exec(line);
  if(noCreatures){const parsed=h.effect(card,line.replace('creature spells','noncreature spells'));if(parsed?.effects.length===1&&parsed.effects[0].action==='no-cast-v9')return {...parsed,effects:[{...parsed.effects[0],quality:'creature'}]};}
  const playerRule=/^(You|Players|Your opponents|Target player|Target opponent) can't (play lands|search libraries) this turn\.$/i.exec(line);
  if(playerRule){const actor=playerRule[1].toLowerCase(),target=actor.startsWith('target ')?h.target(actor):null;return body([{action:'player-rule-v10',rule:playerRule[2]==='play lands'?'no-land':'no-search',who:target?0:({you:'you',players:'each-player','your opponents':'each-opponent'})[actor]}],target?[target]:[]);}
  const gift=new RegExp('^(target opponent|target player|that player) gains control of ('+self(card)+')\\.$','i').exec(line);
  if(gift){const target=gift[1].toLowerCase()==='that player'?null:h.target(gift[1].toLowerCase());return body([{action:'give-control-v9',target:gift[2].toLowerCase()==='it'?'unbound-object-v10':'self',who:target?0:'event-player'}],target?[target]:[]);}
  const handMove=/^(Put|Shuffle) (a|one|two|three|four|five|[0-9]+) cards? from your hand (on top of your library|on the bottom of your library|into your library)( in any order)?\.$/i.exec(line);
  if(handMove&&(handMove[1].toLowerCase()==='shuffle')===(handMove[3].toLowerCase()==='into your library'))return body([{action:'hand-library-v10',who:'you',n:({a:1,one:1,two:2,three:3,four:4,five:5}[handMove[2].toLowerCase()]??Number(handMove[2])),placement:handMove[1].toLowerCase()==='shuffle'?'shuffle':handMove[3].includes('bottom')?'bottom':'top'}]);
  const prowessToken=/^(Create .+? creature tokens?) with ((?:[^.]+,? and )?)prowess\.$/i.exec(line);
  if(prowessToken){const prefix=prowessToken[2].replace(/,? and $/,'').trim(),parsed=h.effect(card,prowessToken[1]+(prefix?' with '+prefix:'')+'.');if(parsed?.effects.length===1&&parsed.effects[0].action==='token-inline'&&!parsed.targets.length){const effect=parsed.effects[0];return {...parsed,effects:[{...effect,token:{...effect.token,oracle:(prefix?prefix+', ':'')+'prowess',operations:[{kind:'mechanic-prowess-v10',contract:'mechanic-prowess-v10'}]}}]};}}
  const numericToken=/^(Create .+? creature tokens? with )(.*?\b)(toxic|firebending|frenzy|afterlife) ([1-9][0-9]*)(.*)\.$/i.exec(line);
  if(numericToken&&!numericToken[2].includes('"')&&!/\b(?:toxic|firebending|frenzy|afterlife)\b/.test(numericToken[5])){
    const kind=numericToken[3].toLowerCase(),n=Number(numericToken[4]),mechanic=kind==='toxic'?{kind:'mechanic-toxic',n,contract:'mechanic-toxic'}:h.line(card,kind[0].toUpperCase()+kind.slice(1)+' '+n);
    const parsed=h.effect(card,numericToken[1]+numericToken[2]+'flying'+numericToken[5]+'.');
    if(mechanic&&parsed?.effects.length===1&&parsed.effects[0].action==='token-inline'&&!parsed.targets.length){const effect=parsed.effects[0],token=effect.token;
      return {...parsed,effects:[{...effect,token:{...token,keywords:(token.keywords||[]).filter(k=>k!=='flying'||/\bflying\b/.test(numericToken[2]+numericToken[5])),oracle:numericToken[2]+kind+' '+n+numericToken[5],operations:[...(token.operations||[]),mechanic]}}]};
    }
  }
  const ownShuffle=new RegExp('^'+self(card)+"'s owner shuffles it into their library\\.$",'i').exec(line);
  if(ownShuffle)return body([{action:'move-to-library',target:'self',shuffleAfter:true}]);
  const landChoice=/^(target land(?: you control| an opponent controls)?) becomes (the basic land type of your choice|a Plains|an Island|a Swamp|a Mountain|a Forest)( until end of turn)?\.$/i.exec(line);
  if(landChoice){const target=h.target(landChoice[1].toLowerCase()),parsed=h.effect(card,'Target land becomes '+landChoice[2]+(landChoice[3]||'')+'.');if(target&&parsed?.effects.length===1&&parsed.effects[0].action==='set-basic-land-types-v8')return {...parsed,targets:[target]};}
  if(/^you lose the game\.$/i.test(line))return body([{action:'lose-game-v10',who:'you'}]);
  const pact=/^At the beginning of your next upkeep, pay ((?:\{(?:[0-9]+|[WUBRGC])\})+)\. If you don't, you lose the game\.$/i.exec(line);
  if(pact)return body([{action:'delay-v10',on:'upkeep',your:true,effects:[{action:'unless-cost',who:'you',payment:{kind:'mana',mana:pact[1]},effects:[{action:'lose-game-v10',who:'you'}]}]}]);
  const future=/^(.+?) at the beginning of (the|your) next (end step|upkeep)\.$/i.exec(line);
  if(future){const parsed=h.effect(card,future[1]+'.');if(parsed&&!parsed.optional&&!parsed.targets.length&&parsed.effects.every(effect=>['draw','discard','gain-life','lose-life','mill'].includes(effect.action)&&effect.who==='you'&&typeof effect.n==='number'))return body([{action:'delay-v10',on:future[3]==='upkeep'?'upkeep':'endStep',your:future[2]==='your',effects:parsed.effects}]);}
  const conditionalDamage=/^(.+?) deals ([^.]+?) damage to (target [^.]+?)\. (?:It|\1) deals ([^.]+?) damage instead if ([^.]+)\.$/.exec(line);
  if(conditionalDamage){
    const first=h.effect(card,conditionalDamage[1]+' deals '+conditionalDamage[2]+' damage to '+conditionalDamage[3]+'.'),n=h.value(conditionalDamage[4]);
    let condition=h.condition(conditionalDamage[5]),conditionTarget;
    const quality=/^that target is (.+)$/.exec(conditionalDamage[5]);
    if(quality){const filter=h.target('target '+quality[1].replace(/ and\/or /g,' or ')+' permanent');if(filter?.zone==='battlefield'){condition={kind:'source-quality',filter};conditionTarget=0;}}
    if(first&&!first.optional&&first.effects.length===1&&first.effects[0].action==='damage'&&first.targets.length===1&&condition&&n!==null&&n!==undefined)
      return body([{action:'conditional',condition,...(conditionTarget!==undefined?{conditionTarget}:{}),effects:[{...first.effects[0],n}],elseEffects:first.effects}],first.targets);
  }
  const biteTail=/^([^\n.]+)\. (?:Then )?[Ii]t deals damage equal to its (power|toughness) to ([^\n.]+)\.$/.exec(line);
  if(biteTail){
    const first=h.effect(card,biteTail[1]+'.'),last=h.effect(card,'Target creature you control deals damage equal to its '+biteTail[2]+' to '+biteTail[3]+'.');
    if(first&&!first.optional&&!first.v4Body&&first.targets.length===1&&first.targets[0].what==='creature'&&(first.targets[0].max??1)===1&&last?.effects.length===1&&last.effects[0].action==='bite'&&last.targets.length===2)
      return body([...first.effects,last.effects[0]],[first.targets[0],last.targets[1]]);
  }
  const chosenExile=/^(target opponent|target player|each opponent|each player) exiles? (a|an) (creature|enchantment|artifact|land|nonland permanent|permanent|creature or planeswalker) they control( with the greatest mana value among creatures and planeswalkers they control| and their graveyard)?\.$/i.exec(line);
  if(chosenExile){
    const actor=chosenExile[1].toLowerCase(),target=actor.startsWith('target ')?h.target(actor):null,filter=h.target('target '+chosenExile[3].toLowerCase()),greatest=chosenExile[4]?.startsWith(' with');
    if(filter?.zone==='battlefield'&&(!greatest||chosenExile[3]==='creature or planeswalker')){
      const who=target?0:actor.replace(' ','-'),effects=[{action:'choose-permanents',operation:'exile',who,n:1,filter,...(greatest?{greatestManaValueV10:true}:{})}];
      if(chosenExile[4]===' and their graveyard')effects.push({action:'zone-select',zone:'graveyard',destination:'exile',who,n:'all',filter:{what:'card',zone:'graveyard',controller:'you',min:1}});
      return body(effects,target?[target]:[]);
    }
  }
  const chosenReturn=/^(each player|each opponent|target player|target opponent) returns (a|an|one|two|three|four|five|[0-9]+) (.+?) they control to (?:its owner's hand|their owners' hands)\.$/i.exec(line);
  if(chosenReturn){
    const filter=h.target('target '+chosenReturn[3].replace(/\b(creatures|artifacts|lands|enchantments|permanents)\b/g,word=>word.slice(0,-1))+' you control'),actor=chosenReturn[1].toLowerCase(),target=actor.startsWith('target ')?h.target(actor):null;
    if(filter?.zone==='battlefield')return body([{action:'choose-permanents',operation:'bounce',who:target?0:actor.replace(' ','-'),n:({a:1,an:1,one:1,two:2,three:3,four:4,five:5}[chosenReturn[2].toLowerCase()]??Number(chosenReturn[2])),filter}],target?[target]:[]);
  }
  const groupAnimation=/^((?:All |Other |Each )?[^.]+?) become ([^.]+)\.(?: (They're|They are) still (lands|artifacts)\.)?$/i.exec(line);
  if(groupAnimation&&!/target|\byou\b.*\bmay\b/.test(groupAnimation[1])){
    const scope=h.line(card,groupAnimation[1]+' are blue.');
    const parsed=h.effect(card,'Target land becomes '+groupAnimation[2].replace(/ creatures\b/,' creature')+'.'+(groupAnimation[3]?" It's still a "+groupAnimation[4].slice(0,-1)+'.':''));
    if(scope?.kind==='v8-type-static'&&scope.filters&&parsed?.effects.length===1&&parsed.effects[0].action==='animate'&&parsed.targets.length===1){const {target,...effect}=parsed.effects[0];return body([{...effect,filters:scope.filters}]);}
  }
  const quoted=/^(create .+? creature tokens?(?: named [^.\n"]+)?)(?: with |\. (?:It has|They have) )(.*?)"([^"\n]+)"\.?$/i.exec(line);
  if(quoted){
    const prefix=quoted[2].replace(/,? and $|, $/,'').trim();
    const base=h.effect(card,quoted[1]+(prefix?' with '+prefix:'')+'.');
    if(base&&!base.optional&&!base.targets.length&&base.effects.length===1&&base.effects[0].action==='token-inline'){
      const token=base.effects[0].token,tokenCard={name:'Oracle created token',layout:'normal',type_line:token.types.join(' ')+' — '+token.subtypes.join(' '),mana_cost:'',oracle_text:quoted[3]};
      const rule=quoted[3].replace(/this token/gi,'this creature').replace(/,$/,'.'),operation=h.line(tokenCard,rule.endsWith('.')?rule:rule+'.');
      const compiled=operation||modifierOperation(tokenCard,rule.endsWith('.')?rule:rule+'.',h);
      if(compiled&&['generic-trigger','generic-ability','generic-static','mechanic-saddle-crew-power-v10'].includes(compiled.kind)&&!JSON.stringify(compiled).includes('unbound-object-v10'))return body([{...base.effects[0],token:{...token,oracle:quoted[3],operations:h.normalizeOperations([compiled])}}]);
    }
  }
  const followup=/^([^.\n]+)\. If ([^,.\n]+), (.+)\.$/.exec(line);
  if(followup&&!/\binstead\b/.test(followup[3])){
    const first=h.effect(card,followup[1]+'.');
    if(first&&!first.optional&&!first.v4Body&&first.targets.length===1&&(first.targets[0].max??1)===1&&first.effects.length===1&&['destroy','exile','bounce','return-to-hand','counter-spell','damage','pump'].includes(first.effects[0].action)){
      let condition=null;
      const stat=/^its (mana value|power|toughness) (?:was|is) ([0-9]+) or (less|greater)$/.exec(followup[2]);
      if(stat&&!(first.effects[0].action==='pump'&&stat[1]!=='mana value'&&/\bis\b/.test(followup[2])))condition={kind:'source-stat-comparison',stat:stat[1]==='mana value'?'mv':stat[1],threshold:Number(stat[2]),comparison:stat[3],past:true};
      if(/^you controlled that (?:permanent|creature|artifact|enchantment|land)$/.test(followup[2]))condition={kind:'source-controller-v10'};
      const quality=/^(?:it|that (?:creature|permanent|artifact|enchantment|land|Equipment|spell)) (?:was|is) (.+)$/.exec(followup[2]);
      if(quality){
        const noun=quality[1].replace(/^an? /,''),base=first.targets[0].zone==='stack'?noun.replace(/ spell$/,''):noun;
        const qualifiers=/^(?:(?:white|blue|black|red|green|colorless|multicolored|legendary|nonlegendary|basic|nonbasic|token|nontoken)(?: or |, |,? or )?)+$/.test(base);
        const filter=h.target('target '+base+(qualifiers?' permanent':''));if(filter?.zone==='battlefield')condition={kind:'source-quality',filter};
      }
      if(condition){
        const text=followup[3].replace(/\b(?:that (?:creature|permanent|land)'s|the land's|her) controller\b/g,'its controller');
        const last=h.effect(card,text+'.');
        if(last&&!last.optional&&!last.v4Body&&!last.targets.length){
          const bind=node=>node==='event-card'?0:node==='event-card-controller'?{kind:'target-controller',index:0}:node==='event-card-owner'?{kind:'target-owner',index:0}:node?.kind==='source-stat'&&/\bits (?:power|toughness|mana value)\b/.test(text)?{kind:'target-stat',target:0,stat:node.stat}:Array.isArray(node)?node.map(bind):node&&typeof node==='object'?Object.fromEntries(Object.entries(node).map(([key,child])=>[key,bind(child)])):node;
          const effects=bind(last.effects);
          if(!/event-|unbound-object/.test(JSON.stringify(effects)))return body([...first.effects,{action:'conditional',condition,conditionTarget:0,targetSnapshotV10:true,effects}],first.targets);
        }
      }
    }
  }
  // A single instruction may declare an X shared by several coordinated
  // effects. Capture it once, before any of those effects change its inputs.
  const variableTail=/^((?:[^\n."]|"[^"\n]*")+, where X is [^\n."]+\.) (If X [^\n]+\.)$/.exec(line);
  if(variableTail){
    const first=h.effect(card,variableTail[1]),tail=h.effect(card,variableTail[2]);
    if(first?.effects.length===1&&first.effects[0].action==='with-x-v10'&&tail&&!tail.optional&&!tail.v4Body&&!tail.targets.length){
      const bind=node=>node==='X'?{kind:'bound-x-v10'}:node?.kind==='x-range'?{...node,kind:'count-comparison',count:{kind:'bound-x-v10'}}:Array.isArray(node)?node.map(bind):node&&typeof node==='object'?Object.fromEntries(Object.entries(node).map(([key,child])=>[key,bind(child)])):node;
      if(!/"(?:grantedOperation|operations|cost|modes|modalBody)"/.test(JSON.stringify(tail.effects)))return {...first,effects:[{...first.effects[0],effects:[...first.effects[0].effects,...bind(tail.effects)]}]};
    }
  }
  const variable=/^((?:[^\n."]|"[^"\n]*")+), where X is ([^\n."]+)\.$/i.exec(line);
  if(variable&&/\bX\b/.test(variable[1])){
    const parsed=h.effect(card,variable[1]+'.');
    if(parsed&&!parsed.optional&&!parsed.v4Body&&!JSON.stringify(parsed.targets).includes('"X"')){
      let value=h.value(variable[2]);
      const relative=/^the number of (.+?) (in their (hand|graveyard|library)|they control)$/.exec(variable[2]);
      if(relative&&parsed.targets.length===1&&['player','opponent'].includes(parsed.targets[0].what)){
        const count=h.count(relative[1]+(relative[3]?' in your '+relative[3]:' you control'));if(count)value={kind:'target-count',target:0,count};
      }
      if(/^(?:that spell's mana value|the mana value of that spell)$/.test(variable[2])&&!parsed.targets.some(target=>target.zone==='stack'))value={kind:'event-spell-mv-v10'};
      if(value&&value!=='X'){
        const shadowed=node=>!!node&&typeof node==='object'&&(Object.entries(node).some(([key,child])=>['operation','grantedOperation','operations','cost','activationCost','modes','modalBody'].includes(key)&&JSON.stringify(child).includes('"X"')||shadowed(child)));
        const bind=node=>node==='X'?{kind:'bound-x-v10'}:node==='-X'?{kind:'signed',value:{kind:'bound-x-v10'},sign:-1}:Array.isArray(node)?node.map(bind):node&&typeof node==='object'?Object.fromEntries(Object.entries(node).map(([key,child])=>[key,bind(child)])):node;
        if(!shadowed(parsed.effects))return body([{action:'with-x-v10',value,effects:bind(parsed.effects)}],parsed.targets);
      }
    }
  }
  const doubleDamage=/^(.+?) deals ([0-9]+) damage to (target .+?) and ([0-9]+) damage to (?:that creature's|its) controller\.$/i.exec(line);
  if(doubleDamage){const first=h.effect(card,doubleDamage[1]+' deals '+doubleDamage[2]+' damage to '+doubleDamage[3]+'.');if(first&&!first.optional&&first.targets.length===1&&first.targets[0].zone==='battlefield'&&first.targets[0].what==='creature'&&first.effects.length===1&&first.effects[0].action==='damage')return body([{action:'damage-batch',hits:[{target:0,n:Number(doubleDamage[2])},{target:{kind:'target-controller',index:0},n:Number(doubleDamage[4])}]}],first.targets);}
  const selfDamage=new RegExp('^('+self(card)+') (gets [+-][0-9]+/[+-][0-9]+ until end of turn) and (deals [0-9]+ damage to you)\\.$','i').exec(line);
  if(selfDamage){const first=h.effect(card,selfDamage[1]+' '+selfDamage[2]+'.'),last=h.effect(card,selfDamage[1]+' '+selfDamage[3]+'.');if(first&&last&&!first.targets.length&&!last.targets.length&&!first.optional&&!last.optional&&!first.v4Body&&!last.v4Body)return body([...first.effects,...last.effects]);}
  const turnTail=/^(.+)\. If (it's your turn|it is your turn|it's not your turn|it is not your turn), ([^.\n]+)\.$/.exec(line);
  if(turnTail){
    const before=h.effect(card,turnTail[1]+'.'),after=h.effect(card,turnTail[3]+'.'),condition=h.condition(turnTail[2]);
    if(before&&after&&condition&&!before.optional&&!after.optional&&!before.v4Body&&!after.v4Body&&!after.targets.length&&!/event-card|event-player|"target":"self"/.test(JSON.stringify(after.effects)))
      return {...before,effects:[...before.effects,{action:'conditional',condition,effects:after.effects}]};
  }
  const tokenAttach=/^(Create [^.]+? creature token(?: with [^.]+?)?)(?:, then|\. Then) attach this Equipment to (?:it|that token)\.$/i.exec(line);
  if(tokenAttach&&/\bEquipment\b/.test(card.type_line)){
    const created=h.effect(card,tokenAttach[1]+'.');
    if(created&&!created.optional&&!created.targets.length&&created.effects.length===1&&['token-key','token-inline'].includes(created.effects[0].action)&&created.effects[0].n===1)
      return {...created,effects:[...created.effects,{action:'attach-source',target:'created-tokens',chooseOneV9:true}]};
  }
  const faceAttach=/^(Manifest dread|(?:Manifest|Cloak) the top card of your library), then attach this Equipment to (?:it|that creature)\.$/i.exec(line);
  if(faceAttach&&/\bEquipment\b/.test(card.type_line)){const parsed=h.effect(card,faceAttach[1]+'.');if(parsed?.effects?.length===1&&parsed.effects[0].action==='face-down')return {...parsed,effects:[{...parsed.effects[0],attachSourceV10:true}]};}
  const handAttach=/^You may put an? (.+?) card from your hand onto the battlefield( tapped)? and attach this Equipment to it\.$/i.exec(line);
  if(handAttach&&/\bEquipment\b/.test(card.type_line)){
    const parsed=h.effect(card,'Put a '+handAttach[1]+' card from your hand onto the battlefield'+(handAttach[2]||'')+'.');
    if(parsed?.effects?.length===1&&parsed.effects[0].action==='put-from-hand')return {...parsed,optional:true,effects:[{...parsed.effects[0],attachSourceV10:true}]};
  }
  const previous = v9.extensionEffect(card, line, h);
  if (previous) return previous;
  const optionalGrant=/^You may have (.+?) (get|gain) (.+ until end of turn)\.$/i.exec(line);
  if(optionalGrant){const text=optionalGrant[1]+' '+optionalGrant[2]+' '+optionalGrant[3]+'.',parsed=h.effect(card,text);if(parsed&&!parsed.optional)return {...parsed,optional:true};}
  const combatTail=/^(.+?) (gets? [+-][0-9]+\/[+-][0-9]+|gains? [a-z ,'-]+|becomes? [a-z ]+) until end of turn and (can't be blocked|can't block|attacks|blocks|must be blocked|can block any number of creatures) this turn( if able)?\.$/i.exec(line);
  if(combatTail&&/^(?:Each |All )/i.test(combatTail[1])){
    const first=h.effect(card,combatTail[1]+' '+combatTail[2]+' until end of turn.'),last=h.effect(card,combatTail[1]+' '+combatTail[3]+' this turn'+(combatTail[4]||'')+'.');
    if(first&&!first.targets.length&&!first.optional&&last&&!last.targets.length&&!last.optional)return body([...first.effects,...last.effects]);
  }
  if(combatTail&&h.target(combatTail[1])?.zone==='battlefield'){
    const parsed=h.effect(card,combatTail[1]+' '+combatTail[2]+' until end of turn. It '+combatTail[3]+' this turn'+(combatTail[4]||'')+'.');
    if(parsed)return parsed;
  }
  const air=/^(you may )?airbend (.+)\.$/i.exec(line);
  if(air){
    const target=h.target(air[2]),reference=/^this (?:creature|permanent|artifact|enchantment)$/.test(air[2])?'self':/^that (?:creature|permanent)$/.test(air[2])?'event-card':air[2]==='it'?'unbound-object-v10':null;
    if(target?.zone==='battlefield'||reference)return body([{action:'airbend-v10',target:target?0:reference}],target?[target]:[],!!air[1]);
  }
  const earth=/^(?:you )?earthbend ([0-9]+|X)(?:, where X is (.+))?\.$/i.exec(line);
  if(earth){
    const n=earth[2]?h.value(earth[2]):earth[1].toUpperCase()==='X'?h.value('X'):Number(earth[1]);
    if(n!==null&&n!==undefined)return body([{action:'earthbend-v10',target:0,n}],[h.target('target land you control')]);
  }
  if(/^You (?!may\b)/i.test(line)){
    const parsed=h.effect(card,line.slice(4));if(parsed)return parsed;
  }
  const repeat=/^(investigate|proliferate|populate|venture into the dungeon) (twice|three times|four times|five times|six times)\.$/i.exec(line);
  if(repeat){const parsed=h.effect(card,repeat[1]+'.'),n=({twice:2,'three times':3,'four times':4,'five times':5,'six times':6})[repeat[2].toLowerCase()];
    if(parsed&&!parsed.optional&&!parsed.targets.length&&!parsed.v4Body)return body(Array.from({length:n},()=>structuredClone(parsed.effects)).flat());
  }
  const optionalFight=/^you may have (.+?) fight (another target creature|target creature(?: you don't control| an opponent controls)?)\.$/i.exec(line);
  if(optionalFight){const parsed=h.effect(card,optionalFight[1]+' fights '+optionalFight[2]+'.');if(parsed?.effects.length===1&&parsed.effects[0].action==='fight')return {...parsed,optional:true};}
  const choice=/^Choose a creature type(?: other than (Wall))?\. (.+)$/.exec(line);
  if(choice&&!/["\n]/.test(choice[2])){
    const marker=['Aetherborn','Brushwagg','Camarid','Dreadnought'].find(type=>!String(card.oracle_text||'').includes(type));
    if(marker){const normalized=choice[2]
      .replace(/(permanents?|creatures?|creature cards?)( you control)? of (?:that|the chosen) type/g,(_,noun,owner)=>marker+' '+noun+(owner||''))
      .replace(/(permanents?|creatures?|creature cards?) of the chosen type( you control)?/g,(_,noun,owner)=>marker+' '+noun+(owner||''))
      .replace(/(becomes?) (?:the chosen type|that type)/g,'$1 an '+marker);
      if(normalized!==choice[2]&&!/chosen type|that type/.test(normalized)){
        const parsed=h.effect(card,normalized);
        if(parsed&&!parsed.optional&&!parsed.v4Body&&!JSON.stringify(parsed.targets).includes(marker)){
          const encode=value=>value===marker?{kind:'chosen-subtype-v10'}:Array.isArray(value)?value.map(encode):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,child])=>[key,encode(child)])):value;
          const effects=encode(parsed.effects);
          if(JSON.stringify(effects).includes('chosen-subtype-v10'))return body([{action:'choose-subtype-v10',exclude:choice[1]?[choice[1]]:[],effects}],parsed.targets);
        }
      }
    }
  }
  const referredDamage=new RegExp('^'+self(card)+' deals ([^.]+?) damage to (?:it|that (?:creature|permanent|planeswalker))\\.$','i').exec(line);
  if(referredDamage){const parsed=h.effect(card,card.name+' deals '+referredDamage[1]+' damage to target creature.');
    if(parsed?.effects.length===1&&parsed.effects[0].action==='damage'&&parsed.targets.length===1)return body([{...parsed.effects[0],target:'unbound-object-v10'}]);}
  const referredAfterValue=new RegExp('^'+self(card)+' deals damage to (?:it|that (?:creature|permanent|planeswalker)) equal to ([^.]+)\\.$','i').exec(line);
  if(referredAfterValue)return h.effect(card,card.name+' deals damage equal to '+referredAfterValue[1]+' to it.');
  // These single-clause object pronouns must be bound by the sequence
  // compiler to its preceding announced target. Unbound uses are rejected.
  if (!/["\n]|\.\s/.test(line) && /\b(?:it|its)\b/i.test(line)) {
    const normalized=line.replace(/\bits\b/gi,"this permanent's").replace(/\bit\b/gi,'this permanent');
    const parsed=h.effect(card,normalized);
    if(parsed&&!parsed.targets.length&&!parsed.v4Body&&parsed.effects.every(effect=>effect.target==='self'&&!effect.effects&&!effect.n?.kind))
      return {...parsed,effects:parsed.effects.map(effect=>({...effect,target:'unbound-object-v10'}))};
  }
  const keywordCounter=/^Put (a|one|two|three|[0-9]+) (flying|first strike|double strike|deathtouch|hexproof|indestructible|lifelink|menace|reach|trample|vigilance) counters? on (target .+)\.$/i.exec(line);
  if(keywordCounter){const filter=h.target(keywordCounter[3]);if(filter?.zone==='battlefield')return body([{action:'counter',target:0,counter:keywordCounter[2].toLowerCase(),n:({a:1,one:1,two:2,three:3}[keywordCounter[1].toLowerCase()]??Number(keywordCounter[1]))}],[filter]);}
  const sharedCounters=/^Put (.+? counters?) and (.+? counters?) on (target .+)\.$/i.exec(line);
  if(sharedCounters) {
    const first=h.effect(card,'Put '+sharedCounters[1]+' on '+sharedCounters[3]+'.');
    const second=h.effect(card,'Put '+sharedCounters[2]+' on '+sharedCounters[3]+'.');
    if(first?.effects.length===1&&second?.effects.length===1&&first.effects[0].action==='counter'&&second.effects[0].action==='counter'&&first.targets.length===1&&second.targets.length===1&&first.effects[0].target===0&&second.effects[0].target===0)
      return {...first,effects:[...first.effects,...second.effects]};
  }
  const separateCounters=/^Put (.+? counters?) on (target .+?) and (.+? counters?) on (another target .+|up to one target .+)\.$/i.exec(line);
  if(separateCounters) {
    const first=h.effect(card,'Put '+separateCounters[1]+' on '+separateCounters[2]+'.');
    const second=h.effect(card,'Put '+separateCounters[3]+' on '+separateCounters[4].replace(/^another /,'')+'.');
    if(first?.effects.length===1&&second?.effects.length===1&&first.effects[0].action==='counter'&&second.effects[0].action==='counter'&&first.targets.length===1&&second.targets.length===1)
      return body([...first.effects,{...second.effects[0],target:1}],[...first.targets,{...second.targets[0],...(separateCounters[4].startsWith('another ')?{differentFromPrevious:true}:{})}]);
  }
  const actor = /^(that player|defending player|its controller|its owner|that (?:card|creature|permanent)'s (?:controller|owner)) (sacrifices|draws|discards|mills|gains|loses) (.+)\.$/i.exec(line);
  if (actor && !/\b(?:you|your|their|if|unless|may)\b|["\n]/i.test(actor[3])) {
    const who = actor[1].toLowerCase() === 'that player' ? 'event-player' : actor[1].toLowerCase() === 'defending player' ? 'combat-defender-v9' : actor[1].endsWith('owner') ? 'event-card-owner' : 'event-card-controller';
    const parsed = h.effect(card, 'You ' + actor[2].toLowerCase().slice(0, -1) + ' ' + actor[3] + '.');
    if (parsed && !parsed.v4Body && !parsed.targets.length && !parsed.optional && parsed.effects.every(effect => effect.who === 'you')) {
      return {...parsed, effects: parsed.effects.map(effect => ({...effect, who}))};
    }
  }
  const removal = new RegExp('^(destroy|exile) ' + self(card) + '\\.$', 'i').exec(line);
  if (removal) return body([{action: removal[1].toLowerCase(), target: /^(?:destroy|exile) it\.$/i.test(line)?'unbound-object-v10':'self'}]);
  const chosenCounter=/^put (.+? counters?) on (?:a|an) (.+? you control)\.$/i.exec(line);
  if (chosenCounter) {
    const parsed=h.effect(card,'Put '+chosenCounter[1]+' on target '+chosenCounter[2]+'.');
    const effect=parsed?.effects?.[0],filter=parsed?.targets?.[0];
    if(parsed?.effects.length===1&&effect.action==='counter'&&effect.target===0&&parsed.targets.length===1&&filter.zone==='battlefield')
      return body([{action:'choose-permanents',operation:'counter-v10',who:'you',n:1,filter,counter:effect.counter,counterN:effect.n}]);
  }
  const powerstone = /^(you may )?create (a|one|two|three|four|five|[0-9]+) (tapped )?Powerstone tokens?\.$/i.exec(line);
  if (powerstone) return body([{action:'token-inline',who:'you',n:({a:1,one:1,two:2,three:3,four:4,five:5}[powerstone[2].toLowerCase()] ?? Number(powerstone[2])),tapped:!!powerstone[3],token:{name:'Powerstone',super:[],types:['Artifact'],subtypes:['Powerstone'],colors:[],keywords:[],oracle:"{T}: Add {C}. This mana can't be spent to cast a nonartifact spell.",operations:[{kind:'mana-source',activationCost:{tap:true},produce:[{C:1}],restriction:{spell:h.target('target artifact spell'),abilities:true},contract:'mana-source'}]}}],[],!!powerstone[1]);
  const duration = /^Until end of turn, (.+)\.$/i.exec(line);
  if (duration) {
    const parsed = h.effect(card, duration[1] + ' until end of turn.');
    if (parsed) return parsed;
  }
  // Reuse the existing sequential-effect binder, including locked target
  // identities. A condition or optional payment owns its whole following
  // instruction and must be parsed by its dedicated grammar first.
  if (!/["\n]|\b(?:if|unless|may|when|whenever)\b/i.test(line)) {
    const normalized = line.replace(/, then ([a-z])/g, (_, initial) => '. ' + initial.toUpperCase())
      .replace(/ and (you (?:draw|gain|lose|mill|scry)|it (?:gains|gets))\b/g, (_, phrase) => '. ' + phrase[0].toUpperCase() + phrase.slice(1));
    if (normalized !== line) {
      const parsed = h.effect(card, normalized);
      if (parsed) return parsed;
    }
  }
  return null;
}

export function normalizeCard(card) {
  if(card.layout==='prototype')return normalizeCard({...card,layout:'normal'});
  if(card.layout==='mutate')return normalizeCard({...card,layout:'normal'});
  const previous = v9.normalizeCard(card);
  if (card.layout !== 'normal') {
    if(card.card_faces?.length===2&&['modal_dfc','transform','adventure','split','prepare'].includes(card.layout))
      return {...previous,card_faces:card.card_faces.map(face=>({...face,oracle_text:normalizeCard({...card,...face,layout:'normal',card_faces:undefined}).oracle_text}))};
    return previous;
  }
  let text = previous.oracle_text || '';
  text=text.split('\n').map(line=>{
    if(!/\bLegendary\b/.test(card.type_line||'')||!/^Power-up — |^(?:When|Whenever) (?:this (?:creature|permanent)|[^,]+) (?:enters|dies|attacks|blocks|is dealt damage|deals damage)/.test(line))return line;
    return line.replace(/\b(?:his|her) (power|toughness|mana value)\b/g,"this creature's $1").replace(/\b(?:He|She) (?=fights|deals|becomes|gets|gains|loses)/g,'This creature ').replace(/\b(?:he|she) (?=fights|deals|becomes|gets|gains|loses)/g,'this creature ');
  }).join('\n');
  text=text.replace(/\bthis Spacecraft\b/g,'this artifact').replace(/\bThis Spacecraft\b/g,'This artifact');
  // CR 201.5c: a legendary card may use its shortened name as a self-reference.
  // Recognize grammatical source references, while keeping named-card searches,
  // partner names and names of other cards intact.
  if(card.name.includes(',')&&/\bLegendary\b/.test(card.type_line||'')&&!/\b(?:Instant|Sorcery)\b/.test(card.type_line)){
    const short=card.name.split(',')[0];
    text=text.replace(new RegExp('(?<![A-Za-z0-9])'+escape(short)+'(?![A-Za-z0-9])','g'),(name,offset)=>{
      const before=text.slice(0,offset),after=text.slice(offset+name.length);
      if(text.slice(offset).startsWith(card.name)||/\b(?:named|partner with|melds with) $/i.test(before)||/^, [A-Z]/.test(after))return name;
      const subject=/^(?:'s\b| (?:enters|leaves|dies|attacks|blocks|becomes?|deals|gets|has|is|isn't|can't|can |gains|loses|fights|assigns|or |and ))/i.test(after);
      const object=/\b(?:on|from|to|with|than|as|into|under|sacrifice|exile|destroy|return|tap|untap|and) $/i.test(before);
      return subject||object?card.name:name;
    });
  }
  text=text.replace(/," where X is /g,'", where X is ');
  text=text.replace(/(When this creature enters, (?:if you cast it, )?(?:you may )?create [^.\n]+? tokens? that (?:is a copy|are copies) of )it\./gi,'$1this creature.');
  text=text.replace(/(Whenever (?:an opponent|a player) sacrifices? [^,\n]+, [^.\n]+? deals [^,\n]+? damage to )them\./g,'$1that player.');
  // Here "It" still denotes the damage source, not the target. Make that
  // antecedent explicit before the general target-source safety check.
  text=text.replace(new RegExp('((This (?:creature|artifact|enchantment|permanent)|'+escape(card.name)+') deals [^.\\n]+\\. )It (deals [^.\\n]+ damage instead if [^.\\n]+\\.)','g'),'$1$2 $3');
  if(/\{S\}/.test(card.mana_cost||'')&&text.trim()==='({S} can be paid with one mana from a snow source.)')text='';
  if(/\bPlaneswalker\b/.test(card.type_line)&&card.name.includes(' ')){
    const short=card.name.split(' ')[0],rest=card.name.slice(short.length);
    text=text.replace(new RegExp('\\b'+escape(short)+'(?![\\w]|'+escape(rest)+')','g'),(match,offset)=>/named $/.test(text.slice(0,offset))?match:card.name);
  }
  text=text.replace(/(This (?:creature|artifact|enchantment|land|permanent)) enters tapped (?:and )?with ([^.\n]+ counters? on it)\./g,'$1 enters tapped.\n$1 enters with $2.');
  text=text.replace(/^(Equip (?:\{[0-9WUBRGC]+\})+)\. (Activate only once each turn\.)$/gm,'$1 $2');
  // Each candidate target is tested independently against all opponents.
  text = text.replace(/(\btarget [^.\n,]+?) your opponents control\b/g, '$1 an opponent controls');
  text = text.replace(/(\btarget [^.\n,]+?) your opponents own\b/g, '$1 an opponent owns');
  text = text.replace(/\bspells you control can't be countered\./g,"spells you cast can't be countered.");
  text = text.replace(/^Instant and sorcery spells( you cast)? can't be countered\.$/gm,"Instant or sorcery spells$1 can't be countered.");
  text = text.replace(/^(Nongreen|Nonwhite|Nonblue|Nonblack|Nonred|Enchanted|Equipped|Modified)(?= creatures)/gm,word=>word.toLowerCase());
  text = text.replace(/\. Then,? ([a-z])/g,(_,initial)=>'. '+initial.toUpperCase()).replace(/\. Then,? /g,'. ');
  text = text.replace(/\. Each of them (gets|gains) /g,(_,verb)=>'. They '+(verb==='gets'?'get':'gain')+' ');
  text = text.replace(/\. (Untap|Tap) those creatures\./g,'. $1 them.');
  // A full sentence ending in a quoted granted ability needs an outside
  // boundary for the existing sequence tokenizer. The quoted rule is intact.
  text = text.replace(/\."(?=\s+[A-Z]|$)/gm, '.".');
  text = text.replace(/At the beginning of each player's upkeep, /g, 'At the beginning of each upkeep, ');
  text = text.replace(/At the beginning of each player's end step, /g, 'At the beginning of each end step, ');
  // CR 701.17: a player chooses which of their permanents to sacrifice.
  // Newer Oracle wording spells this out; removing that redundant suffix
  // preserves the sacrificing player's ordinary selection prompt.
  text = text.replace(/(\bsacrifices? [^.\n,]+?) of (?:their|your) choice\b/g, '$1');
  text = text.replace(/the sacrificed (?:enchantment|land|planeswalker|Equipment)'s (power|toughness|mana value)\b/g,"the sacrificed permanent's $1");
  // CR 201.5: a card's name in its own rules refers to that object. Keep
  // explicit named-card comparisons intact while using the common source
  // noun understood by the closed primitive parsers.
  if(!/\b(?:Instant|Sorcery)\b/.test(card.type_line)){
    const type=['Creature','Artifact','Enchantment','Land'].find(type=>new RegExp('\\b'+type+'\\b').test(card.type_line));
    const noun='this '+(type?.toLowerCase()||'permanent');
    text=text.replace(new RegExp('(?<![A-Za-z0-9])'+escape(card.name)+'(?![A-Za-z0-9])','g'),(name,offset)=>/\bnamed $/i.test(text.slice(0,offset))?name:(offset===0||/[.!?]\s*$/.test(text.slice(0,offset))||text[offset-1]==='\n'?noun[0].toUpperCase()+noun.slice(1):noun));
  }
  return text === previous.oracle_text ? previous : {...previous, oracle_text: text};
}
