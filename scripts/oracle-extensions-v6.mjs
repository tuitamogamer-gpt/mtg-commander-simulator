// Version 6 is deliberately independent of the frozen version 5 grammar.
// Every accepted clause has an explicit runtime descriptor; unknown suffixes
// and ambiguous pronouns remain unsupported.
import { parseOracleSpellV4, parseOracleAdditionalCosts } from './oracle-spell-v4.mjs';
import { ORACLE_SUBTYPES, ORACLE_SUBTYPE_TYPES } from './oracle-subtypes.mjs';
const NUM = '(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|[0-9]+)';
const amount = value => ({ a:1, an:1, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10 }[value.toLowerCase()] ?? Number(value));
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const TYPES = '(?:artifact or enchantment|artifact or creature|artifact or land|creature or planeswalker|instant or sorcery|nonland permanent|permanent|creature|artifact|enchantment|land|planeswalker|card)';

export function modifierOperation(card,line) {
  const alternate=/^(Surge|Spectacle) ((?:\{(?:\d+|[WUBRGC])\})+)$/.exec(line);
  if(alternate)return {kind:'mechanic-'+alternate[1].toLowerCase(),cost:alternate[2],contract:'mechanic-'+alternate[1].toLowerCase()};
  const leading=/^If (.+?), this spell costs (.+)\.$/.exec(line);
  if(leading)return modifierOperation(card,'This spell costs '+leading[2]+' if '+leading[1]+'.');
  const cost='((?:\\{(?:\\d+|[WUBRGC])\\})+)';
  let discount=/^This spell costs \{(\d+)\} less to cast (for each|if) (.+)\.$/.exec(line);
  if(discount){const multiplier=discount[2]==='for each'?extensionCount(discount[3]):null,condition=discount[2]==='if'?extensionCondition(discount[3]):null;if(multiplier||condition)return {kind:'cost-modifier',self:true,amount:-Number(discount[1]),...(multiplier?{multiplier}:{condition}),contract:'generic-cost-modification'};}
  if(line.startsWith('As an additional cost to cast this spell, ')){
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
    else if((m=new RegExp('^Discard ('+NUM+') (.+?) cards?$','i').exec(part))){const filter=extensionTarget('target '+m[2]+' card from your graveyard');if(!filter)return null;cost.discardFilter=filter;cost.discard=amount(m[1]);extended=true;}
    else if((m=/^Sacrifice (?:a|an|another) (creature|artifact|enchantment|land|token|[A-Z][a-z]+)$/.exec(part))&&(!/^[A-Z]/.test(m[1])||ORACLE_SUBTYPES.has(m[1]))){cost.sacWhat=m[1];if(part.startsWith('Sacrifice another '))cost.sacOther=true;extended=true;}
    else if((m=new RegExp('^Sacrifice ('+NUM+') (.+)$').exec(part))){const noun=m[2].replace(/\b(creatures|artifacts|enchantments|lands|tokens)\b/g,word=>word.slice(0,-1)).replace(/\b([A-Z][a-z]+)s\b/g,(word,base)=>ORACLE_SUBTYPES.has(base)?base:word);const filter=extensionTarget('target '+noun);if(!filter||filter.zone!=='battlefield')return null;cost.sacFilter=filter;cost.sacN=amount(m[1]);extended=true;}
    else if((m=new RegExp('^Exile ('+NUM+') (.+?) from your graveyard$').exec(part))){const filter=extensionTarget('target '+m[2].replace(/ cards$/,' card')+' from your graveyard');if(!filter)return null;cost.exileFilter=filter;cost.exileFromGY=amount(m[1]);extended=true;}
    else if((m=new RegExp('^Remove ('+NUM+') (\\+1/\\+1|-1/-1|charge|time|storage|ki|quest|spore|fuse|page|verse|bounty|muster|ice|age) counters? from (?:this creature|this artifact|this enchantment|this land|this permanent)$','i').exec(part))){cost.rmCounter={kind:m[2],n:amount(m[1])};extended=true;}
    else return null;
  }
  return extended?cost:null;
}

function selfPattern(card, pronoun=false) {
  return '(?:this (?:creature|artifact|enchantment|land|permanent|Vehicle|Equipment|Aura)|'+escape(card.name)+
    (card.name.match(/,| the /)?'|'+escape(card.name.split(/,| the /)[0]):'')+(pronoun?'|it|he|him|she|her':'')+')';
}

function extendedTarget(phrase) {
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
  const counterFilter=/ with (?:a|one or more) (\+1\/\+1|-1\/-1|charge) counters? on it$/.exec(phrase);
  if(counterFilter){const target=extensionTarget(phrase.slice(0,counterFilter.index));return target?{...target,hasCounter:counterFilter[1]}:null;}
  const relativeKeyword=/^(target .+?) (you control|an opponent controls) with(out)? (flying|defender|deathtouch|lifelink|vigilance|haste)$/.exec(phrase);
  if(relativeKeyword){const target=extensionTarget(relativeKeyword[1]+' '+relativeKeyword[2]);return target?{...target,[relativeKeyword[3]?'withoutKeyword':'withKeyword']:relativeKeyword[4]}:null;}
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
    const type=ORACLE_SUBTYPE_TYPES[subtype[2]]||'creature';
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
  if(/^(you|players|opponents)\b/i.test(phrase))return null;
  const shared=/ (you control|your opponents control)$/.exec(phrase);
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

function extendedEffect(card,line,helpers) {
  if(!line.endsWith('.'))return null;
  let text=line.slice(0,-1),optional=false;
  if(/^you may /i.test(text)){text=text.slice(8);optional=true;}
  const result=(effects,targets=[])=>({effects,targets,optional});
  const self=selfPattern(card,true);
  let m;
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
  if(m){const head=helpers.effect(card,m[1]+', where X is '+m[2]+'.'),tail=helpers.effect(card,m[3]+'.');if(head&&tail&&!head.optional&&!tail.optional){const offset=head.targets.length,antecedent=head.effects.at(-1)?.target,refers=typeof antecedent==='number'&&/\b(?:it|that creature|that permanent)\b/i.test(m[3])&&!/\bthis /i.test(m[3]),shift=object=>Array.isArray(object)?object.map(shift):object&&typeof object==='object'?Object.fromEntries(Object.entries(object).map(([key,value])=>[key,key==='target'&&value==='self'&&refers?antecedent:['target','otherTarget','who'].includes(key)&&typeof value==='number'?value+offset:shift(value)])):object;return result([...head.effects,...tail.effects.map(shift)],[...head.targets,...tail.targets]);}}
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
  m=new RegExp('^(that player|its controller|that (?:creature|artifact|land|permanent)\'s controller) (draws|gains|loses|mills|discards) ('+NUM+') (cards?|life)$','i').exec(text);
  if(m&&(['gains','loses'].includes(m[2].toLowerCase())===(m[4].toLowerCase()==='life')))return result([{action:({draws:'draw',gains:'gain-life',loses:'lose-life',mills:'mill',discards:'discard'})[m[2].toLowerCase()],who:m[1].toLowerCase()==='that player'?'event-player':'event-card-controller',n:amount(m[3])}]);
  m=new RegExp('^'+self+' deals ('+NUM+') damage to (that player|its controller|that (?:creature|artifact|land|permanent)\'s controller)$','i').exec(text);
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
  m=/^(return) (all .+?) to their owners' hands$/i.exec(text);
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
  m=/^counter (target .+ spell)$/i.exec(text);
  if(m){const target=extensionTarget(m[1]);if(target?.zone==='stack')return result([{action:'counter-spell',target:0}],[target]);}
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
  const unblockable=/^(?:Enchanted|Equipped) creature (?:gets ([+-]\d+)\/([+-]\d+) and )?can't be blocked(?: and has (.+))?\.$/.exec(line);
  if(unblockable){const keywords=unblockable[3]?helpers.keywordList(unblockable[3]):[];if(keywords)return {kind:'attachment-grant',power:Number(unblockable[1]||0),toughness:Number(unblockable[2]||0),keywords,unblockable:true,contract:'attachment-continuous-effect'};}
  const keywordEntry=new RegExp('^'+self+' enters with (?:a|an) (flying|double strike|first strike|deathtouch|lifelink|trample|vigilance|menace|reach|hexproof|indestructible|shield) counter on it\\.$','i').exec(line);
  if(keywordEntry)return {kind:'enters-with-counters',n:1,counter:keywordEntry[1],contract:'permanent-enters-with-counters'};
  const globalGrant=/^(.+?) (?:has|have) "(.+)"\.?$/.exec(line);
  if(globalGrant&&!globalGrant[2].includes(card.name)&&!globalGrant[1].match(/^(Enchanted|Equipped)/)){
    const filters=new RegExp('^'+self+'$','i').test(globalGrant[1])?null:groupSelectors(globalGrant[1]),child=extensionLine({...card,name:'__GrantedPermanent__'},globalGrant[2],helpers);
    if((filters||new RegExp('^'+self+'$','i').test(globalGrant[1]))&&child&&['generic-trigger','generic-ability'].includes(child.kind)&&!child.from&&!JSON.stringify(child).includes('"action":"add-mana"'))return {...base,scope:filters?'filtered-permanents':'self',...(filters?{filters}:{}),grantedOperation:child};
  }
  const selfStatic=new RegExp('^'+self+' (?:gets ([+-]\\d+)/([+-]\\d+)(?: and has (.+))?|has (.+))\\.$','i').exec(line);
  if(selfStatic){const keywords=helpers.keywordList(selfStatic[3]||selfStatic[4]||'');if(keywords)return {...base,scope:'self',power:Number(selfStatic[1]||0),toughness:Number(selfStatic[2]||0),keywords};}
  const attackRestriction=new RegExp('^'+self+" can't (attack|block|attack or block) unless (.+)\\.$",'i').exec(line);
  if(attackRestriction){const condition=extensionCondition(attackRestriction[2]);if(condition)return {...base,scope:'self',condition:{kind:'not',condition},cantAttack:attackRestriction[1].includes('attack'),cantBlock:attackRestriction[1].includes('block')};}
  const conditionalStatic=/^(?:As long as (.+?), (.+)|(.+?) as long as (.+))\.$/.exec(line);
  if(conditionalStatic){const condition=extensionCondition(conditionalStatic[1]||conditionalStatic[4]),body=(conditionalStatic[2]||conditionalStatic[3]).replace(/^it (gets|has)/i,'this creature $1');const parsed=condition&&extensionLine(card,body[0].toUpperCase()+body.slice(1)+'.',helpers);if(parsed&&['generic-static','cost-modifier'].includes(parsed.kind))return {...parsed,condition};}
  const defender=new RegExp('^'+self+" can attack as though it didn't have defender\\.$",'i').exec(line);
  if(defender)return {...base,scope:'self',defenderCanAttack:true};
  const modifier=modifierOperation(card,line);if(modifier)return modifier;
  const grant=/^(?:Enchanted|Equipped) (?:creature|permanent|artifact|land) gets ([+-]\d+)\/([+-]\d+) for each (.+?)(?: and has (.+))?\.$/.exec(line);
  if(grant){const multiplier=grant[3]==='of its colors'?{kind:'host-colors'}:extensionCount(grant[3]),keywords=grant[4]?helpers.keywordList(grant[4]):[];if(multiplier&&keywords)return {kind:'attachment-grant',power:Number(grant[1]),toughness:Number(grant[2]),multiplier,keywords,contract:'attachment-continuous-effect'};}
  const quoted=/^(?:Enchanted|Equipped) (?:creature|permanent|artifact|land) has "(.+)"\.?$/.exec(line);
  if(quoted&&!quoted[1].includes(card.name)){
    const operation=extensionLine({...card,name:'__GrantedPermanent__'},quoted[1],helpers);
    if(operation&&['generic-trigger','generic-ability'].includes(operation.kind)&&!JSON.stringify(operation).includes('"action":"add-mana"'))return {kind:'attachment-operation',operation,contract:'attachment-granted-operation'};
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
  m=/^exile the top (?:(one|two|three|four|five|six|seven|eight|nine|ten|\d+) )?cards? of your library\. (?:(Until (?:the )?end of (?:your next turn|turn)), you may (play|cast) (?:that card|those cards)|You may (play|cast) (?:that card|those cards) this turn)$/i.exec(text);
  if(m)return result([{action:'impulse',n:m[1]?amount(m[1]):1,spellsOnly:(m[3]||m[4]).toLowerCase()==='cast',nextOwnTurn:!!m[2]&&/your next turn/i.test(m[2])}]);
  m=/^exile (target .+?)(?:, then return|\. Return) (?:it|that card) to the battlefield( tapped)? under (its owner's|your) control( at the beginning of the next end step)?$/i.exec(text);
  if(m) {const target=extensionTarget(m[1]);if(target?.zone==='battlefield')return result([{action:'blink',target:0,tapped:!!m[2],controller:m[3]==='your'?'you':'owner',delayed:!!m[4]}],[target]);}
  m=/^target (opponent|player) reveals their hand\. You choose a (nonland|noncreature|noncreature, nonland|nonland, noncreature|creature|artifact|enchantment|instant or sorcery) card from it\. That player discards that card$/i.exec(text);
  if(m)return result([{action:'reveal-hand-discard',target:0,what:m[2].toLowerCase()}],[{what:m[1].toLowerCase(),min:1}]);
  m=new RegExp('^'+self+' deals damage equal to (its power|its toughness|the number of .+?) to (any target|target .+|each opponent)$','i').exec(text);
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
  const sequence=text.replace(/,? then (?=(?:you )?(?:draw|gain|lose|mill|scry|surveil|create|put|return|tap|untap|exile|destroy|add|discard)\b)/gi,'. ')
    .replace(/,? and (?=(?:you )?(?:draw|gain|lose|mill|scry|surveil|create|put|return|tap|untap|exile|destroy|add|discard)\b)/gi,'. ')
    .replace(/\. ([a-z])/g,(_,letter)=>'. '+letter.toUpperCase());
  if(!optional && sequence!==text && helpers.effect) {
    const parsed=helpers.effect(card,sequence+'.');
    if(parsed)return {...parsed,optional:optional||parsed.optional};
  }
  return null;
}

export function extensionLine(card, line, helpers) {
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
    const restriction=/ Activate only (?:if (.+)|during your turn)\.$/.exec(body);
    const activationCondition=restriction?extensionCondition(restriction[1]||"it's your turn"):null;
    if(restriction&&!activationCondition)return null;
    if(restriction)body=body.slice(0,restriction.index);
    const onceEachTurn=/ Activate only once each turn\.$/i.test(body);
    const sorceryOnly=/ Activate only as a sorcery\.$/i.test(body);
    body=body.replace(/ Activate only (?:once each turn|as a sorcery)\.$/i,'');
    const parsed=helpers.effect(card,body)||extensionV4Body(card,body);
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
  let extended;
  const conditions=text.split(/ and /).map(part=>part.trim());
  if(conditions.length>1){const parsed=conditions.map(extensionCondition);if(parsed.every(Boolean))return {kind:'all',conditions:parsed};}
  extended=new RegExp('^you control (?:('+NUM+') or more |(?:a|an|another) )(.+)$').exec(text);
  if(extended){const noun=extended[2].replace(/\b(creatures|artifacts|lands|enchantments|permanents)\b/g,word=>word.slice(0,-1)),target=extensionTarget('target '+noun+' you control');if(target)return {kind:'count-comparison',count:{kind:'count',zone:'battlefield',what:'permanent',filters:[target],other:/^you control another /.test(text)},min:extended[1]?amount(extended[1]):1};}
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
