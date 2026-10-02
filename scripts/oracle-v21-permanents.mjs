// Closed permanent compositions. Each branch consumes every printed clause.
import {ORACLE_SUBTYPES,ORACLE_SUBTYPE_TYPES} from './oracle-subtypes.mjs';
const bundle = operations => operations.length && operations.every(Boolean)
  ? {kind:'operation-bundle',operations,contract:'closed-permanent-clauses'} : null;
const complete = op => op && !op.optional && !op.v4Body && Array.isArray(op.effects) && Array.isArray(op.targets);

// The central trigger model selects one announced mode. A printed choice of
// two modes is represented by an explicit combination, preserving independent
// target slots and the original order of its two effect programs.
const targetKeys = new Set(['target','who','otherTarget','sourceTarget','conditionTarget','redirectTarget']);
function offsetTargets(node, offset) {
  if (Array.isArray(node)) return node.map(value => offsetTargets(value, offset));
  if (!node || typeof node !== 'object') return node;
  return Object.fromEntries(Object.entries(node).map(([key,value]) => [key,
    (targetKeys.has(key) || key==='index' && ['target-controller','target-owner','locked-player'].includes(node.kind)) && Number.isInteger(value) ? value + offset : offsetTargets(value, offset)]));
}
function combinedBody(children) {
  const effects=[], targets=[];
  for (const child of children) {
    effects.push(...offsetTargets(child.effects, targets.length));
    targets.push(...child.targets);
  }
  return {effects,targets,optional:false};
}

export function compileWholeCard(card,h) {
  if(card.oracleModalPreparedV21 || card.layout !== 'normal' || /\b(?:Instant|Sorcery)\b/.test(card.type_line||'')) return null;
  const lines=h.stripReminderText(card.oracle_text||'').split('\n'), rules=[];
  for(let i=0;i<lines.length;i++) {
    const match=/^(.+?[, :] )[Cc]hoose (up to one|one or more|one or both|two)(?: —|\. Each mode must target a different player\.)$/.exec(lines[i]);
    if(!match || !/^(?:When |Whenever |At )/.test(match[1])) continue;
    const labels=[];let j=i+1;
    while(lines[j]?.startsWith('• ')){labels.push(lines[j].slice(2));j++;}
    if(labels.length<2 || labels.length>4) return null;
    rules.push({header:match[1],choice:match[2],differentPlayers:lines[i].endsWith('Each mode must target a different player.'),labels});
    lines[i]=match[1]+'choose one —';
  }
  if(!rules.length)return null;
  const compiled=h.compileCurrent({...card,oracle_text:lines.join('\n'),oracleModalPreparedV21:rules});
  if(!compiled.semanticClass)return null;
  return {...compiled,rulesCore:h.stripReminderText(card.oracle_text||'')};
}

export function extensionLine(card,line,h) {
  if(card.oracleModalPreparedV21) {
    const rule=card.oracleModalPreparedV21.find(rule=>line===rule.header+'choose one —\n'+rule.labels.map(label=>'• '+label).join('\n'));
    if(rule) {
      const children=rule.labels.map(label=>h.line({...card,oracleModalPreparedV21:undefined},rule.header+label));
      if(children.some(child=>child?.kind!=='generic-trigger'||!complete(child)||child.modalBody||!child.effects.length))return null;
      const metadata=children.map(({effects,targets,optional,...meta})=>meta);
      if(metadata.some(meta=>JSON.stringify(meta)!==JSON.stringify(metadata[0])))return null;
      const plans=[];
      for(let mask=1;mask<2**children.length;mask++) {
        const indices=children.map((_,index)=>index).filter(index=>mask&(1<<index));
        if(rule.choice==='up to one'&&indices.length!==1 || rule.choice==='two'&&indices.length!==2 || rule.choice==='one or both'&&children.length!==2)continue;
        plans.push(indices);
      }
      if(!plans.length)return null;
      const modes=plans.map(indices=>({label:indices.map(index=>rule.labels[index]).join(' '),body:combinedBody(indices.map(index=>children[index]))}));
      if(rule.differentPlayers){
        if(children.some(child=>child.targets.length!==1||!['player','opponent'].includes(child.targets[0].what)||child.targets[0].min!==1||child.targets[0].max!==undefined&&child.targets[0].max!==1))return null;
        for(const mode of modes)for(let index=1;index<mode.body.targets.length;index++)mode.body.targets[index]={...mode.body.targets[index],differentFromAllPrevious:true};
      }
      return {...metadata[0],effects:[],targets:[],optional:false,modalBody:{choose:{min:1,max:1},modes},...(rule.choice==='up to one'?{permanentOptionalModalV21:true}:{})};
    }
  }
  const auraDefense=/^(Enchanted|Equipped) creature can't attack you( or planeswalkers you control)?\.$/.exec(line);
  if(auraDefense)return {kind:'attachment-grant',power:0,toughness:0,keywords:[],cantAttackSourceController:true,includePlaneswalkers:!!auraDefense[2],contract:'attachment-continuous-effect'};
  const attachedUntap=/^(Enchanted|Equipped) (creature|permanent|artifact|land) (loses all abilities and )?doesn't untap during its controller's untap step\.$/.exec(line);
  if(attachedUntap){
    const restriction={kind:'attachment-grant',power:0,toughness:0,keywords:[],skipUntap:true,contract:'attachment-continuous-effect'};
    return attachedUntap[3]?bundle([{kind:'v8-ability-loss-static',attached:true,keywords:[],contract:'continuous-ability-removal'},restriction]):restriction;
  }
  const attachedLoss=/^(?:Enchanted|Equipped) (?:creature|permanent|artifact|land) loses all abilities\.$/.test(line);
  if(attachedLoss)return {kind:'v8-ability-loss-static',attached:true,keywords:[],contract:'continuous-ability-removal'};
  const conditionalLoss=/^As long as enchanted (?:creature|permanent|artifact|land) (.+?), (?:it|enchanted (?:creature|permanent|artifact|land)) loses all abilities\.$/.exec(line);
  if(conditionalLoss){const condition=h.condition('this permanent '+conditionalLoss[1]);if(condition)return {kind:'v8-ability-loss-static',attached:true,keywords:[],condition,conditionSubject:'affected',permanentAttachedLossV21:true,contract:'continuous-ability-removal'};}
  const auraEnters=/^When this (?:Aura|enchantment) enters, (.+)$/.exec(line);
  if(auraEnters&&/\bAura\b/.test(card.type_line||'')){
    const conditional=/^if enchanted (creature|permanent) (.+?), tap it\.$/.exec(auraEnters[1]);
    if(conditional){const condition=h.condition('this permanent '+conditional[2]);if(condition)return {kind:'generic-trigger',event:'etb',eventFilter:'self',effects:[{action:'tap',target:'attached-host'}],targets:[],optional:false,condition:{kind:'permanent-attached-condition-v21',condition},permanentAuraEtbV21:true,contract:'generic-trigger-effect'};}
    if(/^tap enchanted (?:creature|permanent) and remove (?:it from combat|all counters from it)\.$/.test(auraEnters[1])||/^tap enchanted creature\. It deals damage to you equal to its power\.$/.test(auraEnters[1])){
      const body=h.effect(card,auraEnters[1][0].toUpperCase()+auraEnters[1].slice(1));if(complete(body))return {kind:'generic-trigger',event:'etb',eventFilter:'self',...body,permanentAuraEtbV21:true,contract:'generic-trigger-effect'};
    }
  }
  const eventComparison=/^((?:When|Whenever) .+? (?:enters(?: or dies)?|dies)), if (that creature's .+?), (.+)$/.exec(line);
  if(eventComparison){
    const condition=eventCondition(eventComparison[2]),base=h.line(card,eventComparison[1]+', '+eventComparison[3]),operations=base?.kind==='operation-bundle'?base.operations:[base];
    if(condition?.test==='stat-vs-source'&&operations.length&&operations.every(op=>op?.kind==='generic-trigger'&&['etb','dies'].includes(op.event)&&op.eventFilter?.kind==='filtered-object'&&op.eventFilter.target?.what==='creature'&&!op.condition)){
      const children=operations.map(op=>({...op,condition}));return children.length===1?children[0]:bundle(children);
    }
  }
  const laterComparison=/^((?:When|Whenever) .+? enters), (.+?)\. (?:Then )?[Ii]f (that creature's .+?), (.+)$/.exec(line);
  if(laterComparison){
    const condition=eventCondition(laterComparison[3]),base=h.line(card,laterComparison[1]+', '+laterComparison[2]+'.'),tail=h.effect(card,laterComparison[4]);
    if(condition?.test==='stat-vs-source'&&base?.kind==='generic-trigger'&&base.event==='etb'&&base.eventFilter?.kind==='filtered-object'&&base.eventFilter.target?.what==='creature'&&!base.condition&&complete(base)&&complete(tail)&&!tail.targets.length)return {...base,effects:[...base.effects,{action:'conditional',condition,effects:tail.effects}]};
  }
  const magecraftComparison=/^(?:Magecraft — )?(Whenever you cast or copy an instant or sorcery spell), (.+?)\. If (that spell has mana value .+?), (.+)$/.exec(line);
  if(magecraftComparison){
    const condition=eventCondition(magecraftComparison[3]),base=h.line(card,magecraftComparison[1]+', '+magecraftComparison[2]+'.'),tail=h.effect(card,magecraftComparison[4]);
    if(condition?.test==='spell-mana-range'&&base?.kind==='generic-trigger'&&JSON.stringify(base.event)===JSON.stringify(['cast','spellCopied'])&&base.eventFilter?.kind==='magecraft'&&!base.condition&&complete(base)&&complete(tail)&&!tail.targets.length)return {...base,effects:[...base.effects,{action:'conditional',condition,effects:tail.effects}]};
  }
  const quoteGrant=/^(Enchanted|Equipped) creature (?:(?:gets ([+-][0-9]+)\/([+-][0-9]+),? (?:and )?)?has )(?:(.+?),? and )?"([^"\n]+)"(?:,? and is a ([A-Z][a-z]+) in addition to its other types)?\.?$/.exec(line);
  if(quoteGrant&&(quoteGrant[2]||quoteGrant[4]||quoteGrant[6])){
    const noun=quoteGrant[1]+' creature',keywordText=quoteGrant[4]?.replace(/, $/,''),keywords=keywordText?h.keywordList(keywordText):[];
    const text=quoteGrant[5].replace(/,$/,'.'),grant=h.line(card,noun+' has "'+text+'".');
    if(keywords&&grant?.kind==='attachment-operation'&&['generic-trigger','generic-ability','mana-source'].includes(grant.operation?.kind)){
      const child={kind:'attachment-grant',power:Number(quoteGrant[2]||0),toughness:Number(quoteGrant[3]||0),keywords,grantedOperation:grant.operation,contract:'attachment-continuous-effect'};
      if(!quoteGrant[6])return child;
      const type=h.line(card,noun+' is a '+quoteGrant[6]+' in addition to its other types.');
      if(type?.kind==='v8-type-static')return {...type,kind:'v8-layered-static',operation:child,permanentQuotedGrantV21:true,contract:'continuous-layered-characteristics'};
    }
  }
  const reversedForm=/^(During your turn, |During turns other than yours, |As long as .+?, )(this (?:artifact|enchantment|permanent|land) is an? )([0-9]+)\/([0-9]+) ((?:[A-Z][a-z]+ )*)artifact creature with ([a-z ,]+)\.$/.exec(line);
  if(reversedForm)return h.line(card,reversedForm[1]+reversedForm[2]+reversedForm[5]+'artifact creature with '+reversedForm[3]+'/'+reversedForm[4]+' and '+reversedForm[6]+'.');
  const sourceForm=/^(During your turn, |During turns other than yours, |As long as (.+?), )(?:this (?:creature|artifact|enchantment|permanent|land) is|it's) (?:a |an )?((?:[A-Z][a-z]+ )+)(?:artifact )?creature with (?:base power and toughness )?([0-9]+)\/([0-9]+)(?: and ([a-z ,']+))?\.$/.exec(line)
    || /^(During your turn, |During turns other than yours, |As long as (.+?), )(?:this (?:creature|artifact|enchantment|permanent|land) is|it's) (?:a |an )?((?:[A-Z][a-z]+ )+)with base power and toughness ([0-9]+)\/([0-9]+)(?: and ([a-z ,']+))?\.$/.exec(line);
  if(sourceForm){
    const condition=sourceForm[1]==='During your turn, '?{kind:'your-turn'}:sourceForm[1]==='During turns other than yours, '?{kind:'not',condition:{kind:'your-turn'}}:h.condition(sourceForm[2]);
    const subtypes=sourceForm[3].trim().split(' '),tail=sourceForm[6],keywords=!tail||tail==="can't be blocked"?[]:h.keywordList(tail);
    if(condition&&keywords&&subtypes.every(type=>ORACLE_SUBTYPES.has(type)&&!ORACLE_SUBTYPE_TYPES[type]&&h.target('target '+type+' creature'))){
      const change={replaceCreatureTypesV10:subtypes,...(/ artifact creature with /.test(line)?{creatureV9:true}:{})};
      const base={kind:'v8-layered-static',own:true,change,condition,operation:{kind:'base-pt-static',power:Number(sourceForm[4]),toughness:Number(sourceForm[5]),keywords,subtypes:[]},permanentFormV21:true,contract:'continuous-layered-characteristics'};
      return tail==="can't be blocked"?bundle([base,{...base,operation:{kind:'generic-static',power:0,toughness:0,keywords:[],unblockable:true}}]):base;
    }
  }
  const handLimit=/^Your maximum hand size is (one|two|three|four|five|six|seven|eight|nine|ten|[0-9]+)\.$/.exec(line);
  if(handLimit)return {kind:'permanent-hand-size-set-v21',n:({one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10}[handLimit[1]]??Number(handLimit[1])),contract:'generic-continuous-effect'};
  const handCount=/^Your maximum hand size is equal to (.+)\.$/.exec(line);
  if(handCount){const count=h.count(handCount[1].replace(/^the number of /,''));if(count)return {kind:'permanent-hand-size-set-v21',count,contract:'generic-continuous-effect'};}
  const landCondition=/^As long as (.+?), you may play (an|one|two|three|[0-9]+) additional lands? on each of your turns\.$/.exec(line);
  if(landCondition){const condition=h.condition(landCondition[1]);if(condition)return {kind:'mechanic-additional-land',n:({an:1,one:1,two:2,three:3}[landCondition[2]]??Number(landCondition[2])),condition,permanentLandConditionV21:true,contract:'mechanic-additional-land'};}
  const sacrificeSource=/^Whenever you sacrifice this creature or another creature, (.+)$/.exec(line);
  if(sacrificeSource)return h.line(card,'Whenever you sacrifice a creature, '+sacrificeSource[1]);
  // These finite clauses share a subject and independent continuous effects.
  // Quotes, conditional suffixes and target pronouns are excluded from this
  // composition so one clause cannot capture another clause's lexical scope.
  const compound=/^(Enchanted creature|Equipped creature|This creature) (gets [+-]\d+\/[+-]\d+), has ([a-z ,]+), and (can't attack you or planeswalkers you control|can't attack you|can't be blocked|can't attack|can't block)\.$/.exec(line);
  if(compound) {
    const subject=compound[1], keywords=h.keywordList(compound[3]);
    if(!keywords)return null;
    return bundle([h.line(card,subject+' '+compound[2]+'.'),h.line(card,subject+' has '+compound[3]+'.'),h.line(card,subject+' '+compound[4]+'.')]);
  }
  const ownOrAnother=/^(?:When|Whenever) this creature or another (.+?) you control (enters|dies|attacks|becomes tapped|becomes untapped), (.+)$/.exec(line);
  if(ownOrAnother) {
    const other=h.line(card,'Whenever another '+ownOrAnother[1]+' you control '+ownOrAnother[2]+', '+ownOrAnother[3]);
    const own=h.line(card,'Whenever this creature '+ownOrAnother[2]+', '+ownOrAnother[3]);
    if(own?.kind==='generic-trigger'&&other?.kind==='generic-trigger'&&JSON.stringify(own.effects)===JSON.stringify(other.effects)&&JSON.stringify(own.targets)===JSON.stringify(other.targets)&&!own.modalBody&&!other.modalBody) {
      // The same entry can only satisfy one branch: the second filter excludes
      // the source. This therefore emits exactly one trigger for one event.
      return bundle([own,other]);
    }
  }
  const combatDeath=/^When this creature dies during combat, (.+)$/.exec(line);
  if(combatDeath) {
    const op=h.line(card,'When this creature dies, '+combatDeath[1]);
    if(op?.kind==='generic-trigger')return {...op,permanentDuringCombatV20:true};
  }
  const eachDamage=/^Whenever (?:this creature|a .+?) deals combat damage to a creature, destroy that creature\. It can't be regenerated\.$/.test(line);
  if(eachDamage) {
    const op=h.line(card,line.replace(" It can't be regenerated.",''));
    if(complete(op)&&op.kind==='generic-trigger'&&op.effects.some(effect=>effect.action==='destroy'))return {...op,effects:op.effects.map(effect=>effect.action==='destroy'?{...effect,noRegen:true}:effect)};
  }
  return null;
}

export function extensionEffect(card,line,h){
  const attachedTap=/^Tap enchanted (creature|permanent) and remove (it from combat|all counters from it)\.$/.exec(line);
  if(attachedTap&&/\bAura\b/.test(card.type_line||'')){
    const tap=h.effect(card,'Tap enchanted '+attachedTap[1]+'.'),tail=h.effect(card,attachedTap[2]==='it from combat'?'Remove target '+attachedTap[1]+' from combat.':'Remove all counters from target '+attachedTap[1]+'.');
    if(complete(tap)&&complete(tail)&&tap.targets.length===0&&tail.targets.length===1&&tail.effects.every(effect=>['remove-from-combat','remove-counters-v8'].includes(effect.action)&&effect.target===0))return {effects:[...tap.effects,...tail.effects.map(effect=>({...effect,target:'attached-host'}))],targets:[],optional:false};
  }
  if(line==='Tap enchanted creature. It deals damage to you equal to its power.'&&/\bAura\b/.test(card.type_line||''))return {effects:[{action:'tap',target:'attached-host'},{action:'bite',target:'attached-host',otherTarget:'you',stat:'power'}],targets:[],optional:false};
  const another=/^Put another (.+?) counter on (this creature|this artifact|this enchantment|this permanent|target creature|target permanent)\.$/.exec(line);
  if(another)return h.effect(card,'Put a '+another[1]+' counter on '+another[2]+'.');
  const choice=/^Choose ([a-z ,]+)\. (This creature|Creatures you control|Other creatures you control|All creatures|Target creature) (?:gain|gains) that ability until end of turn\.$/.exec(line);
  if(!choice)return null;
  const labels=choice[1].split(/,? or |, /),keywords=labels.map(label=>h.keywordList(label));
  if(labels.length<2||labels.length>5||keywords.some(list=>list?.length!==1))return null;
  const programs=labels.map((label,index)=>h.effect(card,choice[2]+(choice[2].endsWith('creature')?' gains ':' gain ')+label+' until end of turn.'));
  if(programs.some(program=>!complete(program)||program.effects.some(effect=>!['pump','pump-group'].includes(effect.action)&&!(effect.action==='battlefield-group'&&effect.operation==='pump'))))return null;
  if(programs.some(program=>JSON.stringify(program.targets)!==JSON.stringify(programs[0].targets)))return null;
  return {effects:[{action:'permanent-keyword-choice-v21',choices:labels,programs:programs.map(program=>({effects:program.effects}))}],targets:programs[0].targets,optional:false};
}

function eventCondition(text){
  const stats=/^that creature's (power|toughness|mana value) is (greater|less) than this creature's(?: (power|toughness|mana value))?$/.exec(text);
  if(stats){const stat=value=>value==='mana value'?'mv':value;return {kind:'permanent-event-condition-v21',test:'stat-vs-source',stat:stat(stats[1]),comparison:stats[2],sourceStat:stat(stats[3]||stats[1])};}
  const range=/^that spell has mana value ([0-9]+) or (greater|less)$/.exec(text);
  if(range)return {kind:'permanent-event-condition-v21',test:'spell-mana-range',threshold:Number(range[1]),comparison:range[2]};
  return null;
}
