// Additive closed grammar. Complete v11 definitions remain frozen by the importer.
import * as v11 from './oracle-extensions-v11.mjs';
import {ORACLE_SUBTYPES, ORACLE_SUBTYPE_TYPES} from './oracle-subtypes.mjs';
export * from './oracle-extensions-v11.mjs';
export const transformationEventsV12=true;
const walks=['snow landwalk','snow forestwalk','snow swampwalk','snow islandwalk','snow plainswalk','snow mountainwalk','desertwalk','artifact landwalk'];
export const grantableKeywords=[...v11.grantableKeywords,...walks];
export function normalizeCard(card){
  const normalized=v11.normalizeCard(card);
  const text=(normalized.oracle_text||'').replace(/^Soulshift ([0-9]+), soulshift ([0-9]+)$/gm,'Soulshift $1\nSoulshift $2')
    .replace(/Whenever this creature deal combat damage /g,'Whenever this creature deals combat damage ');
  return {...normalized,oracle_text:text};
}
const body=(effects,targets=[])=>({effects,targets,optional:false});
const complete=p=>p&&!p.optional&&!p.v4Body&&Array.isArray(p.targets)&&Array.isArray(p.effects);
const colors={white:'W',blue:'U',black:'B',red:'R',green:'G'};
const numbers={a:1,an:1,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,twenty:20};
const number=text=>numbers[text]??Number(text);
const quantity='(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|[0-9]+|X)';
const convertingWhen=new Set();
const singular=text=>text.replace(/\b(creatures|artifacts|enchantments|lands|permanents|planeswalkers|battles|tokens|cards)\b/gi,word=>word.slice(0,-1))
  .replace(/\b(Elves|Wolves|Dwarves|Allies)\b/g,word=>({Elves:'Elf',Wolves:'Wolf',Dwarves:'Dwarf',Allies:'Ally'}[word]))
  .replace(/\b([A-Z][A-Za-z-]+)s\b/g,(word,base)=>ORACLE_SUBTYPES.has(word)?word:ORACLE_SUBTYPES.has(base)?base:word);
const canonicalNoun=text=>singular(text).replace(/^(?:Creature|Artifact|Enchantment|Land|Permanent|Planeswalker|Battle|Token|Commander|Snow|Nonsnow|Legendary|Nonlegendary|Nontoken|Colorless|Multicolored|Monocolored|Tapped|Untapped|Attacking|Blocking|Modified|Enchanted|Equipped|White|Blue|Black|Red|Green|Nonwhite|Nonblue|Nonblack|Nonred|Nongreen|Nonartifact|Nonland)\b/,word=>word.toLowerCase());
function scope(card,noun,h){
  if(/^this (?:creature|artifact|enchantment|land|permanent)$/i.test(noun)&&!/(?:Instant|Sorcery)/.test(card.type_line))return {target:'self',targets:[]};
  if(/^(?:enchanted|equipped) (?:creature|artifact|enchantment|land|permanent)$/i.test(noun)&&/\b(?:Aura|Equipment)\b/.test(card.type_line))return {target:'attached-host',targets:[]};
  const target=h.target(noun.replace(/^[A-Z]/,c=>c.toLowerCase()).replace(/ each$/,''));
  if(target?.zone==='battlefield')return {target:0,targets:[target]};
  if(/\btarget\b|\b(?:it|that|this)\b/i.test(noun))return null;
  const filter=h.target('target '+canonicalNoun(noun.replace(/^(?:Each |All )/,'')));
  return filter?.zone==='battlefield'?{filters:[filter],targets:[]}:null;
}
function outsideQuotes(text,expression){
  const parts=[];let start=0,quoted=false;
  for(let i=0;i<text.length;i++){
    if(text[i]==='"')quoted=!quoted;
    if(quoted)continue;
    const match=expression.exec(text.slice(i));
    if(match?.index===0){parts.push(text.slice(start,i));i+=match[0].length-1;start=i+1;}
  }
  parts.push(text.slice(start));return parts;
}
function bindTarget(value,target){
  if(Array.isArray(value))return value.map(child=>bindTarget(child,target));
  if(!value||typeof value!=='object')return value;
  return Object.fromEntries(Object.entries(value).map(([key,child])=>[key,key==='operation'?child:
    ['target','conditionTarget','sourceTarget','otherTarget','who'].includes(key)&&child===0?target:bindTarget(child,target)]));
}
function supportedGrant(operation){
  return operation?.kind==='generic-trigger'&&!operation.from&&!operation.zone&&![].concat(operation.event).some(event=>/mana/i.test(event)||event==='abilityActivated')||
    operation?.kind==='generic-ability'&&!operation.from&&operation.loyalty===undefined&&!operation.effects?.some(effect=>effect.action==='add-mana');
}
export function extensionTarget(text,h){
  const blocked=/^(.*?target )blocked (creatures?)(.*)$/.exec(text);
  if(blocked){const parsed=h.target(blocked[1]+blocked[2]+blocked[3]);if(parsed?.zone==='battlefield')return {...parsed,blockedV12:true};}
  const paired=/^(target .+?) blocking or blocked by this creature$/.exec(text);
  if(paired){const parsed=h.target(paired[1]);if(parsed?.zone==='battlefield')return {...parsed,combatPartnerV12:true};}
  const nonhistoric=/^(target .+?) that(?:'s| is) not historic$/.exec(text);
  if(nonhistoric){const parsed=h.target(nonhistoric[1]),excluded=h.target('target historic permanent');if(parsed?.zone==='battlefield'&&excluded)return {...parsed,excludedFiltersV10:[...(parsed.excludedFiltersV10||[]),excluded]};}
  const lands=/^(.*?target )land creatures?(.*)$/.exec(text);
  if(lands){const parsed=h.target(lands[1]+'creature'+lands[2]);if(parsed?.zone==='battlefield'&&!parsed.alsoType)return {...parsed,alsoType:'Land'};}
  const sharedController=text.replace(/ each opponent controls$/,' an opponent controls');
  if(sharedController!==text){const parsed=h.target(sharedController);if(parsed)return parsed;}
  const canonical=text.replace(/\bCommander creatures?\b/g,'commander creature');
  if(canonical!==text){const parsed=h.target(canonical);if(parsed)return parsed;}
  return v11.extensionTarget(text,h);
}
export function extensionCount(text,h){
  const relative=/^(.+?) (defending player|that player|its controller|its owner) controls$/.exec(text);
  if(relative){const count=h.count(relative[1]+' you control');if(count?.kind==='count'&&count.zone==='battlefield')return {kind:'target-count',target:({'defending player':'combat-defender-v9','that player':'event-player','its controller':'event-card-controller','its owner':'event-card-owner'})[relative[2]],count};}
  const types=/^card types? among (.+)$/.exec(text);
  if(types){const count=h.count(types[1]);if(count?.kind==='count'&&count.zone!=='battlefield')return {...count,unique:'types'};}
  return v11.extensionCount(text,h);
}
export function extensionCondition(text,h){
  const anyControl=/^any player controls (?:a|an) (.+)$/.exec(text);
  if(anyControl){const filter=h.target('target '+anyControl[1]);if(filter?.zone==='battlefield'&&filter.controller==='any')return {kind:'count-comparison',count:{kind:'count',zone:'battlefield',what:'permanent',controller:'all',filters:[filter]},min:1};}
  const history=/^(you|an opponent) (gained|lost) life last turn$/.exec(text);
  if(history)return {kind:'last-turn-v12',players:history[1]==='you'?'you':'opponents',field:history[2]==='gained'?'lifeGained':'lifeLost',min:1};
  if(text==='you had another creature enter the battlefield under your control last turn')return {kind:'last-turn-v12',players:'you',field:'anotherCreatureEntered',min:1};
  const count=/^there (?:is|are) (a|an|one|two|three|four|five|six|seven|eight|nine|ten|twenty|[0-9]+)( or (more|fewer))? (.+)$/.exec(text);
  if(count){const value=h.count(count[4]);if(value)return {kind:'count-comparison',count:value,...(count[3]==='more'?{min:number(count[1])}:count[3]==='fewer'?{max:number(count[1])}:{min:number(count[1]),max:number(count[1])})};}
  if(text==='no opponent has more life than that player')return {kind:'defender-max-life-v12'};
  return v11.extensionCondition(text,h);
}
export function extensionEffect(card,line,h){
  // Trigger and modal bodies start in lower case in printed Oracle text.
  // Standalone instruction parsers consume the identical capitalized clause.
  if(/^[a-z]/.test(line)){const parsed=h.effect(card,line[0].toUpperCase()+line.slice(1));if(parsed)return parsed;}
  const optional=/^You may ((?:draw|gain|lose|mill|discard|exile|return|look|reveal|search|create|put|remove|tap|untap|sacrifice|destroy|regenerate|goad|suspect|connive|investigate|populate|proliferate|scry|surveil|incubate|amass|manifest|cloak)\b[^.]+\.)$/.exec(line);
  if(optional&&!/["\n]|\b(?:if|unless|instead)\b/.test(optional[1])){const parsed=h.effect(card,optional[1]);if(complete(parsed))return {...parsed,optional:true};}
  const explicitYou=/^You ((?:draw|gain|lose|mill|discard|exile|return|look|reveal|search|create|put|remove|tap|untap|sacrifice|destroy|regenerate|goad|suspect|connive|investigate|populate|proliferate|scry|surveil|incubate|amass|manifest|cloak)\b.+)$/.exec(line);
  if(explicitYou){const parsed=h.effect(card,explicitYou[1]);if(parsed)return parsed;}
  const tokenActor=/^(That player|Defending player|Each opponent|Each player|Target player|Target opponent) creates? (.+)\.$/.exec(line);
  if(tokenActor&&!/["\n]|\. /.test(line)){
    const parsed=h.effect(card,'Create '+tokenActor[2]+'.');
    if(complete(parsed)&&!parsed.targets.length&&parsed.effects.length&&parsed.effects.every(effect=>['token-key','token-inline','predefined-token-v8'].includes(effect.action)&&effect.who==='you')){
      const who=({'That player':'event-player','Defending player':'combat-defender-v9','Each opponent':'each-opponent','Each player':'each-player'})[tokenActor[1]]??0;
      return body(parsed.effects.map(effect=>({...effect,who})),who===0?[h.target(tokenActor[1].toLowerCase())]:[]);
    }
  }
  const attachedGroup=/^(Destroy|Exile|Return) all (.+?) attached to (target (?:creature|land|permanent))( to their owners' hands)?\.$/.exec(line);
  if(attachedGroup&&(attachedGroup[1]==='Return')===!!attachedGroup[4]){
    const filters=attachedGroup[2].split(/,? and |, /).map(noun=>h.target('target '+canonicalNoun(noun))),target=h.target(attachedGroup[3]);
    if(target?.zone==='battlefield'&&filters.length&&filters.every(filter=>filter?.zone==='battlefield'&&filter.controller==='any'))return body([{action:'battlefield-group',operation:attachedGroup[1]==='Return'?'bounce':attachedGroup[1].toLowerCase(),filters,target:0,attachedToV12:true}],[target]);
  }
  const actorGroup=/^(Destroy|Exile|Tap|Untap|Regenerate) all (.+?) (its controller|its owner|that player|defending player) controls\.$/.exec(line);
  if(actorGroup){const parsed=h.effect(card,actorGroup[1]+' all '+actorGroup[2]+' target player controls.');if(complete(parsed)&&parsed.targets.length===1&&parsed.targets[0].what==='player'&&parsed.effects.every(effect=>effect.action==='battlefield-group'&&effect.target===0))return body(bindTarget(parsed.effects,({'its controller':'event-card-controller','its owner':'event-card-owner','that player':'event-player','defending player':'combat-defender-v9'})[actorGroup[3]]));}
  const group=/^(Destroy|Exile|Tap|Untap|Regenerate) (?:all|each) (.+?)( except for commanders)?\.$/.exec(line);
  if(group&&!/["\n]|\. /.test(line)){
    let noun=canonicalNoun(group[2]),filter;
    const qualified=/^(.+?) and (.+?) (with (?:mana value|power|toughness) .+)$/.exec(noun);
    if(qualified){const alternatives=[qualified[1],qualified[2]].map(part=>h.target('target '+part+' '+qualified[3]));if(alternatives.every(target=>target?.zone==='battlefield'))filter={what:'permanent',zone:'battlefield',controller:'any',alternatives};}
    else filter=h.target('target '+noun.replace(/,? and (?:all )?|, /g,' or '));
    if(filter?.zone==='battlefield')return body([{action:'battlefield-group',operation:group[1].toLowerCase(),filters:[{...filter,...(group[3]?{excludedFiltersV10:[...(filter.excludedFiltersV10||[]),h.target('target commander')]}:{})}]}]);
  }
  const repeated=/^(.+?) for each ([^.]+)\.$/.exec(line);
  if(repeated&&!/["\n]|\. /.test(line)){
    const count=h.count(repeated[2]),parsed=count&&h.effect(card,repeated[1]+'.'),effect=parsed?.effects?.[0];
    if(complete(parsed)&&parsed.effects.length===1&&effect.action==='pump'&&[effect.power,effect.toughness].every(value=>typeof value==='number')&&!effect.multiplier&&!effect.keywords?.length)return {...parsed,effects:[{...effect,multiplier:count}]};
    if(complete(parsed)&&parsed.effects.length===1&&typeof effect.n==='number'&&effect.n>0&&(['draw','gain-life','lose-life','mill','discard','choose-permanents','token-key','token-inline','counter','damage','investigate','populate'].includes(effect.action)||effect.action==='battlefield-group'&&['counter','damage'].includes(effect.operation)))
      return {...parsed,effects:[{...effect,n:{...count,multiply:(count.multiply??1)*effect.n}}]};
  }
  const coordinatedGroup=/^(Destroy|Exile|Tap|Untap|Regenerate) (all .+?) and all (.+)\.$/.exec(line);
  if(coordinatedGroup&&!/["\n]|\. /.test(line)){
    const parsed=h.effect(card,coordinatedGroup[1]+' '+coordinatedGroup[2]+' or '+coordinatedGroup[3]+'.');
    if(complete(parsed)&&!parsed.targets.length&&parsed.effects.length===1&&parsed.effects[0].action==='battlefield-group')return parsed;
  }
  const redraw=new RegExp('^Discard (any number of|up to '+quantity+') cards?, then draw that many cards(?: plus ('+quantity+'))?\\.$').exec(line);
  if(redraw){const limit=redraw[1]==='any number of'?'all':number(redraw[1].slice(6));if(limit==='all'||Number.isSafeInteger(limit))return body([{action:'discard-redraw-v12',who:'you',max:limit,bonus:redraw[2]?number(redraw[2]):0}]);}
  const groupCounters=/^Put (.+? counters?) on (?:each|all) (.+)\.$/.exec(line);
  if(groupCounters&&!/["\n]|\. /.test(line)){
    const noun=canonicalNoun(groupCounters[2]),parsed=h.effect(card,'Put '+groupCounters[1]+' on '+(noun.startsWith('other ')?'another target '+noun.slice(6):'target '+noun)+'.');
    if(complete(parsed)&&parsed.targets.length===1&&parsed.targets[0].zone==='battlefield'&&parsed.effects.every(effect=>effect.action==='counter'&&effect.target===0))
      return body(parsed.effects.map(({action,target,...effect})=>({action:'battlefield-group',operation:'counter',filters:parsed.targets,...effect})));
  }
  const eachDamage=/^(.+? deals (?:[0-9]+|X|damage equal to [^.]+?) (?:damage )?to )each (.+?) and each (.+)\.$/.exec(line);
  if(eachDamage&&!/["\n]/.test(line)){
    const parsed=h.effect(card,eachDamage[1]+'each '+eachDamage[2]+' or '+eachDamage[3]+'.');
    if(complete(parsed)&&!parsed.targets.length&&parsed.effects.length===1&&parsed.effects[0].action==='battlefield-group'&&parsed.effects[0].operation==='damage')return parsed;
  }
  const actor=/^(That player|Defending player|Its controller|Its owner|That (?:card|creature|permanent)'s (?:controller|owner)) (discards their hand|exiles the top (?:[0-9]+|one|two|three|four|five|six|seven|eight|nine|ten) cards? of their library)\.$/.exec(line);
  if(actor){
    const who=actor[1]==='That player'?'event-player':actor[1]==='Defending player'?'combat-defender-v9':actor[1].endsWith('owner')?'event-card-owner':'event-card-controller';
    const parsed=h.effect(card,'Target player '+actor[2]+'.');
    if(complete(parsed)&&parsed.targets.length===1&&parsed.effects.every(effect=>['discard-hand','exile-top'].includes(effect.action)&&effect.who===0))return body(bindTarget(parsed.effects,who));
  }
  const look=/^Look at (that player's|defending player's|its controller's|its owner's) hand\.$/.exec(line);
  if(look)return body([{action:'reveal-hand',look:true,who:look[1]==="that player's"?'event-player':look[1]==="defending player's"?'combat-defender-v9':look[1]==="its owner's"?'event-card-owner':'event-card-controller'}]);
  const abilityMana=/^(You may )?[Aa]dd ((?:\{[0-9WUBRGC]+\})+)\. This mana can't be spent to cast spells\.$/.exec(line);
  if(abilityMana){const parsed=h.effect(card,'Add '+abilityMana[2]+'.');if(complete(parsed)&&!parsed.targets.length&&parsed.effects.length===1&&parsed.effects[0].action==='add-mana')return {...parsed,optional:!!abilityMana[1],effects:[{...parsed.effects[0],restriction:{abilities:true}}]};}
  const repeatEvent=/^(Investigate|Populate) that many times\.$/.exec(line);
  if(repeatEvent)return body([{action:repeatEvent[1].toLowerCase(),who:'you',n:{kind:'event-amount'}}]);
  const connive=new RegExp('^(.+?) connives? ('+quantity+')\\.$').exec(line);
  if(connive){const subject=scope(card,connive[1],h);if(subject&&!subject.filters)return body([{action:'connive',target:subject.target,n:connive[2]==='X'?'X':number(connive[2])}],subject.targets);}
  const hostileSearch=new RegExp("^Search (target player's|target opponent's) library for (up to )?("+quantity+") (.+?)(?: and |, )(exile (?:it|them)|put (?:it|them|that card|those cards) (?:onto the battlefield( tapped)? under your control|into that player's graveyard))\\. (?:That player|The player) shuffles\\.$").exec(line);
  if(hostileSearch){
    const noun=singular(hostileSearch[4]),unrestricted=noun==='card',filter=!unrestricted&&h.target('target '+noun+' from your graveyard');
    const destination=hostileSearch[5].startsWith('exile')?'exile':hostileSearch[5].includes('battlefield')?'battlefield':'graveyard';
    if((unrestricted||filter?.zone==='graveyard')&&(destination!=='battlefield'||filter&&['creature','artifact','enchantment','land','planeswalker','battle','permanent'].includes(filter.what)))return body([{action:'library-search-v8',who:0,n:hostileSearch[3]==='X'?'X':number(hostileSearch[3]),upTo:!!hostileSearch[2],...(unrestricted?{unrestricted:true}:{filter}),reveal:false,placements:[{n:'all',destination,tapped:!!hostileSearch[6]}]}],[h.target(hostileSearch[1].slice(0,-2))]);
  }
  const mechanicGrant=/^(?:Until end of turn, )?(.+?) gains? (exalted|flanking|afflict [1-9][0-9]*|prowess|mentor|training|battle cry|afterlife [1-9][0-9]*|bushido [1-9][0-9]*|renown [1-9][0-9]*)(?: until end of turn)?\.$/.exec(line);
  if(mechanicGrant&&(/^Until end of turn, /.test(line)||/ until end of turn\.$/.test(line))){
    const subject=scope(card,mechanicGrant[1],h);
    const template=h.line({...card,type_line:'Creature'},'This creature has '+mechanicGrant[2]+'.');
    if(subject&&template?.grantedMechanicV9){const {targets,...affected}=subject;return body([{action:'grant-operation',...affected,operation:template.grantedMechanicV9}],targets);}
  }
  if(line==='It becomes night.'||line==='It becomes day.')return body([{action:'day-night-v12',state:line.includes('night')?'night':'day'}]);
  const untapGroup=/^(.+?) (you control|target player controls|target opponent controls) don't untap during (your|their|that player's) next untap step\.$/.exec(line);
  if(untapGroup&&(untapGroup[2]==='you control')===(untapGroup[3]==='your')){
    const filter=h.target('target '+canonicalNoun(untapGroup[1]).replace(/,? and |, /g,' or '));
    if(filter?.zone==='battlefield')return body([{action:'skip-untap-group-v12',who:untapGroup[2]==='you control'?'you':0,filters:[filter]}],untapGroup[2]==='you control'?[]:[h.target(untapGroup[2].slice(0,-9))]);
  }
  // A following "it" retains the first instruction's announced object, while
  // self references inside the granted ability still refer to its recipient.
  const sentences=outsideQuotes(line,/^\. (?=[A-Z])/);
  if(sentences.length===2&&/^It (?:gets|gains|loses|becomes|has) /.test(sentences[1])){
    const first=h.effect(card,sentences[0]+'.');
    const last=h.effect(card,sentences[1].replace(/^It /,'This creature '));
    if(complete(first)&&!first.targets.length&&first.effects.length===1&&first.effects[0].target==='self'&&['counter','pump','untap','tap'].includes(first.effects[0].action)&&complete(last)&&!last.targets.length)
      return body([...first.effects,...last.effects]);
  }
  if(sentences.length===2&&line.includes('"')&&!/\b(?:it|its|that|those|them|they)\b/.test(sentences[1].split('"')[0])){
    const first=h.effect(card,sentences[0]+'.'),last=h.effect(card,sentences[1]);
    if(complete(first)&&!first.targets.length&&complete(last)&&!JSON.stringify(last.effects).includes('unbound-object'))return body([...first.effects,...last.effects],last.targets);
  }
  if(sentences.length===2&&/^Until end of turn, (?:it|that creature|that permanent) /.test(sentences[1])){
    const first=h.effect(card,sentences[0]+'.');
    const follow=h.effect(card,sentences[1].replace(/^Until end of turn, (?:it|that creature|that permanent) /,'Until end of turn, target creature '));
    if(complete(first)&&first.targets.length===1&&first.targets[0].zone==='battlefield'&&complete(follow)&&follow.targets.length===1&&follow.effects.every(effect=>['pump','grant-operation','animate','characteristics-v8','base-pt'].includes(effect.action)))return body([...first.effects,...follow.effects],first.targets);
  }
  // Split coordinated verbs only outside quoted rules text. Each instruction
  // keeps a single announced subject, even when that subject is several cards.
  const shared=/^(?:Until end of turn, )?(.+?) ((?:gets?|gains?|loses?|becomes?|has|have) .+?)(?: until end of turn)?\.?$/.exec(line);
  if(shared&&(/^Until end of turn, /.test(line)||/ until end of turn\.?$/.test(line))){
    const clauses=outsideQuotes(shared[2],/^(?:, (?:and )?| and )(?=(?:gets?|gains?|loses?|becomes?|has|have) )/);
    if(clauses.length>1){
      const subject=scope(card,shared[1],h);
      const pieces=subject&&!subject.filters&&clauses.map(clause=>h.effect(card,'Target creature '+clause.replace(/\.$/,'')+' until end of turn.'));
      if(Array.isArray(pieces)&&pieces.every(piece=>complete(piece)&&piece.targets.length===1&&piece.effects.every(effect=>['pump','base-pt','animate','characteristics-v8','change-characteristics-v8','grant-operation','remove-keywords-v9'].includes(effect.action))))
        return body(pieces.flatMap(piece=>bindTarget(piece.effects,subject.target)),subject.targets);
    }
  }
  const temporary=line.replace(/^Until end of turn, (.+?)\.?$/,'$1 until end of turn.');
  const animation=/^(.+?) becomes? (?:a |an )?([A-Za-z -]+?)(?: with base power and toughness ([0-9]+)\/([0-9]+))?( in addition to (?:its|their) other (?:colors and types|types|colors))? until end of turn\.$/.exec(temporary);
  if(animation&&!/["\n]/.test(line)){
    const affected=scope(card,animation[1],h),words=singular(animation[2]).replace(/Time Lord/g,'Time_Lord').split(' ').filter(word=>word!=='and');
    const typeWords={artifact:'Artifact',enchantment:'Enchantment',creature:'Creature',land:'Land',planeswalker:'Planeswalker'};
    if(affected&&words.length&&words.every(word=>colors[word]||word==='colorless'||typeWords[word]||ORACLE_SUBTYPES.has(word.replace('Time_Lord','Time Lord')))){
      const types=words.filter(word=>typeWords[word]).map(word=>typeWords[word]),subtypes=words.filter(word=>ORACLE_SUBTYPES.has(word.replace('Time_Lord','Time Lord'))).map(word=>word.replace('Time_Lord','Time Lord'));
      const colorWords=words.filter(word=>colors[word]||word==='colorless'),retained=!!animation[5];
      const {targets,...subject}=affected;
      if((!animation[3]||types.includes('Creature')||subtypes.length)&&!(colorWords.includes('colorless')&&colorWords.length>1)&&subtypes.every(type=>!ORACLE_SUBTYPE_TYPES[type]))
        return body([{action:'animate',...subject,types,subtypes,keywords:[],...(animation[3]?{power:Number(animation[3]),toughness:Number(animation[4])}:{}),...(colorWords.length?{colors:colorWords.filter(word=>word!=='colorless').map(word=>colors[word]),retainColors:retained&&animation[5].includes('colors')}:{}),retainTypes:retained||!types.length||types.includes('Artifact')&&types.includes('Creature'),retainAllSubtypes:retained||!subtypes.length,replaceCreatureSubtypes:!retained&&subtypes.length>0,temporary:true}],targets);
    }
  }
  // Keywords and a quoted ability share the same objects and duration. Compile
  // the quoted body in its own source scope; its targets are chosen on use.
  const grant=/^(?:Until end of turn, )?(.+?) gains? (?:([^"]+?) and )?"([^"\n]+)"(?: until end of turn)?\.?$/.exec(line);
  if(grant&&(/^Until end of turn, /.test(line)||/ until end of turn\.?$/.test(line))&&!grant[3].includes(card.name)){
    const subject=scope(card,grant[1],h),keywords=grant[2]?h.keywordList(grant[2].replace(/,\s*$/,'')):[];
    const operation=subject&&h.line({...card,name:'__GrantedPermanentV12__'},grant[3].replace(/\.?$/,'.'));
    if(subject&&keywords&&supportedGrant(operation)){
      const {targets,...affected}=subject;
      return body([{action:'grant-operation',...affected,operation,keywords}],targets);
    }
  }
  // Reuse a shared announced target for a pump followed by a quoted grant.
  const pumpGrant=/^(?:Until end of turn, )?(.+?) gets? ([+-][0-9]+)\/([+-][0-9]+)(?:,| and) gains? (.+?)(?: until end of turn)?\.?$/.exec(line);
  if(pumpGrant&&pumpGrant[4].includes('"')&&(/^Until end of turn, /.test(line)||/ until end of turn\.?$/.test(line))){
    const pump=h.effect(card,pumpGrant[1]+' gets '+pumpGrant[2]+'/'+pumpGrant[3]+' until end of turn.');
    const grant=h.effect(card,'Until end of turn, '+pumpGrant[1]+' gains '+pumpGrant[4].replace(/\.$/,'')+'.');
    if(complete(pump)&&complete(grant)&&JSON.stringify(pump.targets)===JSON.stringify(grant.targets))return body([...pump.effects,...grant.effects],pump.targets);
  }
  return v11.extensionEffect(card,line,h);
}
export function extensionLine(card,line,h){
  const soulshifts=/^Soulshift ([0-9]+), soulshift ([0-9]+)$/.exec(line);
  if(soulshifts){const operations=soulshifts.slice(1).map(n=>h.line(card,'Soulshift '+n));if(operations.every(operation=>operation?.kind==='mechanic-soulshift'))return {kind:'operation-bundle',operations,contract:'closed-permanent-clauses'};}
  const commander=/^((?:When|Whenever) )your commander (enters|attacks|enters or attacks), (.+)$/.exec(line);
  if(commander){const parsed=h.line(card,commander[1]+'a commander you own '+commander[2]+', '+commander[3]);if(parsed)return parsed;}
  const separate=/^((?:When|Whenever) [^,]+?) and (when(?:ever)? [^,]+?), (.+)$/.exec(line);
  if(separate){
    const operations=[h.line(card,separate[1]+', '+separate[3]),h.line(card,separate[2][0].toUpperCase()+separate[2].slice(1)+', '+separate[3])];
    if(operations.every(operation=>operation?.kind==='generic-trigger')&&!([].concat(operations[0].event).some(event=>[].concat(operations[1].event).includes(event))))return {kind:'operation-bundle',operations,contract:'closed-permanent-clauses'};
  }
  const eventUnion=/^Whenever (.+?) or (.+?) (enters|dies|attacks|blocks|becomes tapped|leaves the battlefield), (.+)$/.exec(line);
  if(eventUnion&&!/["\n]|\bor\b/.test(eventUnion[1]+eventUnion[2])){
    const parts=[eventUnion[1],eventUnion[2]].map(subject=>h.line(card,'Whenever '+subject+' '+eventUnion[3]+', '+eventUnion[4]));
    if(parts.every(part=>part?.kind==='generic-trigger'&&typeof part.event==='string')&&parts[0].event===parts[1].event&&parts.every(part=>!part.zone&&!part.oncePerBatch)&&JSON.stringify({...parts[0],eventFilter:null})===JSON.stringify({...parts[1],eventFilter:null}))return {...parts[0],eventFilter:{kind:'either',clauses:parts.map(part=>({event:part.event,eventFilter:part.eventFilter}))}};
  }
  const graveExit=/^Whenever (?:a|an) (.+? card) leaves (your|an opponent's|a player's) graveyard, (.+)$/.exec(line);
  if(graveExit){const filter=h.target('target '+graveExit[1]+' from a graveyard'),parsed=h.effect(card,graveExit[3]);if(filter?.zone==='graveyard'&&parsed&&!/"event-|"self"|"unbound-object/.test(JSON.stringify(parsed.effects)))return {kind:'generic-trigger',event:'cardLeftGraveyard',eventFilter:{kind:'grave-exit-v12',target:filter,owner:graveExit[2]==='your'?'you':graveExit[2]==="an opponent's"?'opponent':'any'},...parsed,contract:'generic-trigger-effect'};}
  const foreignCast=/^Whenever (you cast|an opponent casts|a player casts) (.+? spell) from (a graveyard|a library|their graveyard|their library), (.+)$/.exec(line);
  if(foreignCast){const parsed=h.line(card,'Whenever '+foreignCast[1]+' '+foreignCast[2]+' from your '+(foreignCast[3].includes('graveyard')?'graveyard':'library')+', '+foreignCast[4]);if(parsed?.kind==='generic-trigger'&&parsed.eventFilter?.kind==='qualified-cast-v8')return {...parsed,eventFilter:{...parsed.eventFilter,zoneOwner:foreignCast[3].startsWith('a ')?'any':'caster'}};}
  const prohibit=/^(You|Your opponents|Players) can't cast (?:([a-zA-Z -]+?) )?spells(?: from (graveyards|libraries|exile|graveyards or libraries|graveyards or exile|anywhere other than their hands))?\.$/.exec(line);
  if(prohibit){const filter=h.target('target '+(prohibit[2]?prohibit[2]+' ':'')+'spell');if(filter?.zone==='stack')return {kind:'casting-prohibition-v9',players:({You:'you','Your opponents':'opponents',Players:'all'})[prohibit[1]],filterV12:filter,...(prohibit[3]?{fromV12:prohibit[3]==='anywhere other than their hands'?['not-hand']:prohibit[3].replaceAll('graveyards','graveyard').replaceAll('libraries','library').split(' or ')}:{}),contract:'casting-prohibition-v9'};}
  if(walks.includes(line.toLowerCase()))return {kind:'generic-static',scope:'self',keywords:[line.toLowerCase()],contract:'continuous-layer'};
  const search=/^Whenever (you search|an opponent searches|a player searches) (?:your|their) library, (.+)$/.exec(line);
  if(search){const parsed=h.effect(card,search[2]);if(parsed)return {kind:'generic-trigger',event:'searchedLibrary',eventFilter:{kind:'observation-v9',controller:search[1].startsWith('you')?'you':search[1].startsWith('an opponent')?'opponent':'any'},...parsed,contract:'generic-trigger-effect'};}
  const returned=/^Whenever (a permanent|this creature or another creature) is returned to (your|a player's) hand(?: from the battlefield)?, (.+)$/.exec(line);
  if(returned){const parsed=h.effect(card,returned[3]);if(parsed)return {kind:'generic-trigger',event:'lto',eventFilter:{kind:'observation-v9',target:h.target('target '+(returned[1].includes('creature')?'creature':'permanent')),destination:'hand',graveOwner:returned[2]==='your'?'you':'any'},...parsed,contract:'generic-trigger-effect'};}
  const notDied=/^Whenever (.+?) (leaves?) the battlefield without dying, (.+)$/.exec(line);
  if(notDied){const parsed=h.line(card,'Whenever '+notDied[1]+' '+notDied[2]+' the battlefield, '+notDied[3]);if(parsed?.kind==='generic-trigger'&&parsed.event==='lto')return {...parsed,eventFilter:{kind:'not-died-v12',base:parsed.eventFilter}};}
  const battleAttack=/^Whenever this creature attacks a battle, (.+)$/.exec(line);
  if(battleAttack){const text=battleAttack[1].replace(/^(double|triple) its (power|toughness|power and toughness) /,'$1 the $2 of this creature '),parsed=h.line(card,'Whenever this creature attacks, '+text);if(parsed?.kind==='generic-trigger'&&parsed.event==='attacks')return {...parsed,eventFilter:{kind:'attack-battle-v12',base:parsed.eventFilter}};}
  const transformed=/^Whenever (a permanent you control|a creature you control) transforms into (?:a|an) (.+?), (.+)$/.exec(line);
  if(transformed){
    const target=h.target('target '+transformed[1].slice(2)),quality=ORACLE_SUBTYPES.has(transformed[2])?{what:'permanent',zone:'battlefield',controller:'any',subtype:transformed[2]}:h.target('target '+transformed[2]);
    let parsed=h.effect(card,transformed[3]);
    if(parsed?.effects.length===1&&parsed.effects[0].action==='counter'&&parsed.effects[0].target==='unbound-object-v10'&&!parsed.targets.length)parsed={...parsed,effects:[{...parsed.effects[0],target:'event-card'}]};
    if(target?.zone==='battlefield'&&quality?.zone==='battlefield'&&parsed)return {kind:'generic-trigger',event:'transformed',eventFilter:{kind:'transformed-quality-v12',target,quality},...parsed,contract:'generic-trigger-effect'};
  }
  const damageMinimum=/^((?:When|Whenever) .+? (?:is dealt|deals)) ([1-9][0-9]*) or more (combat |noncombat )?damage(.*)$/.exec(line);
  if(damageMinimum){const parsed=h.line(card,damageMinimum[1]+' '+(damageMinimum[3]||'')+'damage'+damageMinimum[4]);if(parsed?.kind==='generic-trigger'&&['dealtDamage','damageToPlayer','combatDamageToPlayer'].includes(parsed.event))return {...parsed,eventFilter:{kind:'damage-minimum-v12',base:parsed.eventFilter,n:Number(damageMinimum[2])}};}
  const combatDeath=/^When this creature dies during combat, (.+)$/.exec(line);
  if(combatDeath){const parsed=h.line(card,'When this creature dies, '+combatDeath[1]);if(parsed?.kind==='generic-trigger'&&parsed.event==='dies')return {...parsed,eventFilter:{kind:'during-combat-v12',base:parsed.eventFilter}};}
  const faceUp=/^Whenever this creature or another (permanent|creature you control|permanent you control) is turned face up, (.+)$/.exec(line);
  if(faceUp){const parsed=h.effect(card,faceUp[2]);if(parsed)return {kind:'generic-trigger',event:'turnedFaceUp',eventFilter:{kind:'filtered-object',target:h.target('target '+faceUp[1])},...parsed,contract:'generic-trigger-effect'};}
  const ring=/^Whenever the Ring tempts you, (.+)$/.exec(line);
  if(ring){const parsed=h.effect(card,ring[1]);if(parsed&&!/"event-/.test(JSON.stringify(parsed)))return {kind:'generic-trigger',event:'ringTempted',eventFilter:{kind:'observed-player-v8'},...parsed,contract:'generic-trigger-effect'};}
  const draw=/^Whenever (you draw your|a player draws their) (first or second|second|third) card (each turn|during their turn), (.+)$/.exec(line);
  if(draw){const parsed=h.effect(card,draw[4]);if(parsed)return {kind:'generic-trigger',event:'draw',eventFilter:{kind:'draw-ordinal-v12',who:draw[1].startsWith('you')?'you':'any',ordinals:draw[2]==='first or second'?[1,2]:[draw[2]==='second'?2:3],ownTurn:draw[3]==='during their turn'},...parsed,contract:'generic-trigger-effect'};}
  // "When" and "Whenever" have the same trigger timing. Keep every other
  // word intact while allowing the closed observation grammars to read both.
  const whenKey=card.name+'\0'+line;
  if(/^When /.test(line)&&!convertingWhen.has(whenKey)){
    convertingWhen.add(whenKey);
    try{const parsed=h.line(card,line.replace(/^When /,'Whenever '));if(parsed?.kind==='generic-trigger')return parsed;}finally{convertingWhen.delete(whenKey);}
  }
  const playerAttack=/^Whenever this creature attacks a player, (.+)$/.exec(line);
  if(playerAttack){const parsed=h.line(card,'Whenever this creature attacks, '+playerAttack[1]);if(parsed?.kind==='generic-trigger'&&parsed.event==='attacks')return {...parsed,eventFilter:{kind:'attack-player-v12',base:parsed.eventFilter}};}
  // The first colon belongs to the activated ability; colons inside a quoted
  // granted ability do not divide the outer payment from its effect.
  const activated=/^([^":\n]+): (.+)$/.exec(line);
  if(activated&&activated[2].includes('"')){
    const restriction=/ (Activate only [^.]+\.)$/.exec(activated[2]);
    const text=restriction?activated[2].slice(0,restriction.index):activated[2];
    const template=h.line(card,activated[1]+': Draw a card.'+(restriction?' '+restriction[1]:''));
    const parsed=h.effect(card,text);
    if(template?.kind==='generic-ability'&&complete(parsed))return {...template,...parsed};
  }
  const triggered=/^((?:When|Whenever|At the beginning of) [^,\n]+), (?!if )(.+)$/.exec(line);
  if(triggered&&/\bits (?:controller|owner) controls\b/.test(triggered[2])&&!triggered[2].includes('"')){
    const template=h.line(card,triggered[1]+', draw a card.'),parsed=h.effect(card,triggered[2]);
    if(template?.kind==='generic-trigger'&&['etb','dies','lto','attacks','becameTapped'].includes(template.event)&&complete(parsed)&&parsed.effects.every(effect=>effect.action==='battlefield-group'))return {...template,...parsed};
  }
  if(triggered&&triggered[2].includes('"')){
    const template=h.line(card,triggered[1]+', draw a card.'),parsed=h.effect(card,triggered[2]);
    if(template?.kind==='generic-trigger'&&complete(parsed))return {...template,...parsed};
  }
  const quoted=/^([^"\n]+?) (have|has) "([^"\n]+)"\.?$/.exec(line);
  if(quoted){
    const prefix=/^(?:Enchanted|Equipped) (?:creature|artifact|enchantment|land|permanent)$/.test(quoted[1])?quoted[1]:canonicalNoun(quoted[1]);
    if(prefix!==quoted[1]){const parsed=h.line(card,prefix+' '+quoted[2]+' "'+quoted[3]+'".');if(parsed)return parsed;}
  }
  return v11.extensionLine(card,line,h);
}
