// Closed additive grammar; complete v13 definitions remain frozen.
import * as v13 from './oracle-extensions-v13.mjs';
import {modifierOperation as additionalCost} from './oracle-v8-additional-costs.mjs';
import {resolutionPayment,resolutionCostEffect} from './oracle-v8-effects.mjs';
export * from './oracle-extensions-v13.mjs';
export function normalizeCard(card){
  if(/\b(?:Instant|Sorcery)\b/.test(card.type_line||''))card={...card,oracle_text:(card.oracle_text||'').split('"').map((part,index)=>index%2?part:part.replace(/\b(?:This|this) spell deals\b/g,card.name+' deals')).join('"')};
  const name=card.name?.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  if(name)card={...card,oracle_text:(card.oracle_text||'').replace(new RegExp('('+name+' deals [0-9]+ damage to target [^.]+\\.) It deals ([0-9]+) damage to that creature instead if ([^.]+)\\.','g'),(whole,first,n,condition)=>first+' If '+condition+', '+card.name+' deals '+n+' damage to that creature instead.')};
  return v13.normalizeCard(card);
}
export function extensionCondition(text,h){
  if(text==='this spell was cast using teamwork'||text==="this spell's additional cost was paid"||text==='evidence was collected'||/^a (?:Dragon|Hero) was beheld$/.test(text))return {kind:'cast-flag-v10',flag:'oracleOptionalCostV14'};
  return v13.extensionCondition(text,h);
}
const body=(effects,targets=[])=>({effects,targets,optional:false});
const complete=parsed=>parsed&&!parsed.optional&&!parsed.v4Body&&Array.isArray(parsed.targets)&&Array.isArray(parsed.effects);
const upper=text=>text[0].toUpperCase()+text.slice(1);
function disjointTriggers(operations){
  if(!operations.every(operation=>operation?.kind==='generic-trigger'))return false;
  const group=event=>['cast','castIS','castCreature','castNonCreature'].includes(event)?'cast':['etb','landPlayed'].includes(event)?'entry':['dies','lto','c14EnteredGraveyard'].includes(event)?'graveyard-entry':['attacks','attackersDeclared'].includes(event)?'attacks':/damage/i.test(event)?'damage':event;
  const left=new Set([operations[0].event].flat().map(group));return ![operations[1].event].flat().some(event=>left.has(group(event)));
}
function paymentV14(card,phrase,h){
  phrase=phrase[0].toLowerCase()+phrase.slice(1);
  const blight=/^blight ([1-9][0-9]*)$/.exec(phrase);
  if(blight)return {payment:{kind:'blight-v14',zone:'battlefield',n:1,countersV14:Number(blight[1]),filter:{what:'creature',zone:'battlefield',controller:'you'}},targets:[]};
  phrase=phrase.replace(/ or ((?:\{[WUBRGC0-9]+\})+|[0-9]+ life)$/,' or pay $1');
  const alternatives=phrase.split(/ or (?=(?:pay|sacrifice|discard|exile|return|tap|put|remove|has)\b)/);
  if(alternatives.length>1){const costs=alternatives.map(part=>paymentV14(card,part,h));if(costs.every(cost=>cost&&!cost.targets.length&&cost.payment.kind!=='alternatives'))return {payment:{kind:'alternatives',choices:costs.map(cost=>cost.payment)},targets:[]};return null;}
  const damage=/^has (.+?) deal ([0-9]+) damage to (?:them|you)$/.exec(phrase);
  if(damage&&['this creature','this artifact','this enchantment','this permanent',card.name,card.name.split(',')[0]].includes(damage[1]))return {payment:{kind:'damage-v14',n:Number(damage[2])},targets:[]};
  const manaLife=/^pay ((?:\{[0-9WUBRGC]+\})+) and ([0-9]+) life$/.exec(phrase);
  if(manaLife)return {payment:{kind:'mana',mana:manaLife[1],lifeV14:Number(manaLife[2])},targets:[]};
  const counted=/^pay \{([0-9]+)\} for each (.+)$/.exec(phrase);
  if(counted){const count=h.count(counted[2]);if(count)return {payment:{kind:'mana',mana:'{X}',xValue:{...count,multiply:(count.multiply||1)*Number(counted[1])}},targets:[]};}
  if(phrase==='exile all cards from your graveyard')return {payment:{kind:'exile',zone:'graveyard',n:'all',filter:{what:'card',zone:'graveyard',controller:'you'}},targets:[]};
  const returnCard=/^(?:return (.+?) from your graveyard to your hand|put (.+?) from your graveyard on the (top|bottom) of your library)$/.exec(phrase);
  if(returnCard){const noun=(returnCard[1]||returnCard[2]).replace(/^(?:a|an|one) /,''),target=h.target('target '+noun+' from your graveyard');if(target?.zone==='graveyard'&&(target.max||1)===1)return {payment:{kind:returnCard[1]?'return':'library',zone:'graveyard',n:1,filter:target,...(returnCard[3]?{position:returnCard[3]}:{})},targets:[]};}
  if(phrase==='exile the top creature card of your graveyard')return {payment:{kind:'exile',zone:'graveyard',n:1,topmostV14:true,filter:{what:'creature',zone:'graveyard',controller:'you'}},targets:[]};
  return resolutionPayment(card,phrase,h);
}
function unlessEffect(card,line,h){
  const match=/^(.+?) unless (you|they|that player|its controller|that creature's controller|that spell's controller|any player) (.+)\.$/i.exec(line);
  if(!match||/ unless |\. |["\n]/.test(match[3]))return null;
  const parsed=h.effect(card,upper(match[1])+'.');if(!complete(parsed))return null;
  let prefix=[];
  if(parsed.effects.length>1){
    const boundary=match[1].lastIndexOf('. '),before=boundary>=0?h.effect(card,upper(match[1].slice(0,boundary))+'.'):null;
    if(!complete(before)||!before.effects.length||before.effects.length>=parsed.effects.length||JSON.stringify(before.effects)!==JSON.stringify(parsed.effects.slice(0,before.effects.length))||JSON.stringify(before.targets)!==JSON.stringify(parsed.targets.slice(0,before.targets.length)))return null;
    prefix=before.effects;
  }
  const phrase=match[3].replace(/\b(pays|sacrifices|discards|exiles|returns|taps|puts|removes|reveals)\b/g,word=>word.slice(0,-1)).replace(/\btheir\b/g,'your').replace(/\bthey control\b/g,'you control');
  let cost=paymentV14(card,phrase,h);
  const xMana=/^pay ((?:\{(?:[0-9]+|[WUBRGCX])\})+)$/.exec(phrase);
  if(xMana&&xMana[1].includes('{X}')&&/\{X\}/.test((card.mana_cost||'')+' '+(card.oracle_text||'')))cost={payment:{kind:'mana',mana:xMana[1],xValue:{kind:'cast-x-v14'}},targets:[]};
  if(!cost||cost.targets.length||cost.payment.chooseX||/"chooseX"|"target":\d/.test(JSON.stringify(cost.payment)))return null;
  let who;
  if(match[2]==='you')who='you';
  else if(match[2]==='any player')who='any-player-v14';
  else if(parsed.targets.length===1){const target=parsed.targets[0];who=target.zone==='player'||['player','opponent'].includes(target.what)?0:{kind:'target-controller',index:0};}
  else if(parsed.targets.length===0){
    if(/controller$/.test(match[2])){
      const encoded=JSON.stringify(parsed.effects);
      if(encoded.includes('"event-stack-v10"')||encoded.includes('"event-card"'))who='event-card-controller';
      else if(encoded.includes('"attached-host"'))who='attached-host-controller';
    }else{
      const refs=[...new Set(parsed.effects.map(effect=>effect.who).filter(Boolean))];
      if(refs.length===1&&['each-player','each-opponent','event-player','event-card-controller'].includes(refs[0]))who=refs[0];
    }
  }
  if(who===undefined)return null;
  if(parsed.targets.length===1&&cost.payment.kind!=='mana'){
    const exclude=payment=>payment.kind==='alternatives'?{...payment,choices:payment.choices.map(exclude)}:payment.filter?.excludeSelf?{...payment,filter:{...payment.filter,excludeSelf:false,excludeTargetV14:0}}:payment;
    cost.payment=exclude(cost.payment);
  }
  return body([...prefix,{action:'unless-cost-v14',who,payment:cost.payment,effects:parsed.effects.slice(prefix.length)}],parsed.targets);
}
const temporary=new Set(['pump','pump-group','animate','base-pt','grant-operation','remove-keywords-v9','change-characteristics-v8','characteristics-v8','combat-restriction','cant-block-until-eot','unblockable-until-eot','scale-pt','switch-pt','prevent-damage','protection','prevent-combat','disable-abilities-v8']);

export function modifierOperation(card,line,h){
  const optional=/^As an additional cost to cast this spell, you may (.+)\.$/.exec(line);
  if(optional&&(!card.layout||card.layout==='normal')&&!/\b(?:Convoke|Improvise|Delve|Kicker|Multikicker|Buyback|Replicate|Offspring|Squad|Splice|Bargain)\b/.test(card.oracle_text||'')){
    let payment=null,match;
    if((match=/^blight ([1-9][0-9]*)$/.exec(optional[1])))payment={kind:'blight',n:Number(match[1])};
    else if((match=/^collect evidence ([1-9][0-9]*)$/.exec(optional[1])))payment={kind:'evidence',n:Number(match[1])};
    else if((match=/^behold an? (Dragon|Hero)$/.exec(optional[1]))){const object=additionalCost(card,'As an additional cost to cast this spell, discard a '+match[1]+' card.')?.costs?.[0]?.object;if(object)payment={kind:'behold',object};}
    if(payment)return {kind:'mechanic-optional-cost-v14',payment,contract:'mechanic-optional-cost-v14'};
  }
  const teamwork=/^Teamwork ([1-9][0-9]*)$/.exec(line);
  if(teamwork&&(!card.layout||card.layout==='normal')&&!/\b(?:Convoke|Improvise|Delve|Kicker|Multikicker|Buyback|Replicate|Offspring|Squad|Splice|Bargain)\b/.test(card.oracle_text||''))return {kind:'mechanic-optional-cost-v14',payment:{kind:'teamwork',n:Number(teamwork[1])},contract:'mechanic-optional-cost-v14'};
  const morph=/^Morph—(.+)\.$/.exec(line);
  if(morph){const costs=additionalCost(card,'As an additional cost to cast this spell, '+morph[1][0].toLowerCase()+morph[1].slice(1)+'.')?.costs;
    if(costs?.length===1&&costs[0].kind==='sacrifice'&&costs[0].quantity.min===costs[0].quantity.max)return {kind:'mechanic-morph-cost-v8',label:morph[1],costs,contract:'mechanic-morph-cost-v8'};
  }
  return v13.modifierOperation(card,line,h);
}

export function modalOperation(card,text,parseEffect,parseModal){
  if(/^(?:Teamwork [1-9][0-9]*(?: \(|\n|$)|As an additional cost to cast this spell, you may blight [1-9][0-9]*\.)/m.test(card.oracle_text||'')&&/^Choose one\. If (?:this spell was cast using teamwork|this spell's additional cost was paid), choose both instead\.\n/.test(text)){
    const parsed=parseModal(card,text.replace(/^Choose one\. If (?:this spell was cast using teamwork|this spell's additional cost was paid), choose both instead\./,'Choose one —'),parseEffect);
    if(parsed?.kind==='spell-modal-generic'&&parsed.modes.length===2)return {...parsed,optionalCostModesV14:true};
  }
  return v13.modalOperation(card,text,parseEffect,parseModal);
}

export function normalizeManaOperation(operation){
  const safeCost=operation.kind==='generic-ability'&&operation.loyalty===undefined&&!operation.from&&!operation.optional&&!operation.sorceryOnly&&!operation.beforeAttackersOnly&&!operation.oncePerObject&&!operation.targets?.length&&Object.keys(operation.cost||{}).every(key=>['tap','mana','life','sacSelf','sacWhat','sacOther','sacFilter','sacN','rmCounter'].includes(key))&&!operation.cost?.mana?.includes('{X}');
  if(safeCost&&operation.effects?.length===1&&operation.effects[0].action==='conditional'&&Object.keys(operation.cost||{}).every(key=>key==='tap')){
    const condition=operation.effects[0];
    if(condition.conditionTarget===undefined&&condition.effects?.length===1&&condition.elseEffects?.length===1&&[condition.effects[0],condition.elseEffects[0]].every(effect=>effect.action==='add-mana'&&!effect.restriction&&!effect.multiplier)&&!/(?:event-|sacrific|target-stat|tapped|source-counters)/.test(JSON.stringify(condition.condition))){
      const variants=[condition.effects[0],condition.elseEffects[0]].map(effect=>effect.choices||[effect.produce]);
      return {kind:'mana-source',activationCost:operation.cost,produce:variants[0],conditionalProduceV14:{condition:condition.condition,otherwise:variants[1]},...(operation.activationCondition?{condition:operation.activationCondition}:{}),contract:'mana-source'};
    }
  }
  if(safeCost&&operation.effects?.length===2&&operation.effects[0].action==='add-mana'){
    const tail=operation.effects[1],condition=tail.condition;
    if(tail.action==='conditional'&&tail.conditionTarget===undefined&&!tail.elseEffects&&tail.effects?.length===1&&tail.effects[0].action==='sacrifice-source'&&condition?.kind==='not'&&condition.condition?.kind==='source-quality'&&condition.condition.filter?.hasCounter){
      const effect=operation.effects[0];return {kind:'mana-source',activationCost:operation.cost,produce:effect.choices||[effect.produce],afterEffects:[tail],...(effect.multiplier?{multiplier:effect.multiplier}:{}),contract:'mana-source'};
    }
  }
  return v13.normalizeManaOperation(operation);
}

export function extensionTarget(text,h){
  const numericList=/^(target .+?) with (mana value|power|toughness) ([0-9]+(?:, [0-9]+)*,? or [0-9]+)$/.exec(text);
  if(numericList){const values=numericList[3].split(/,? or |, /).map(Number),targets=values.map(n=>h.target(numericList[1]+' with '+numericList[2]+' '+n));if(targets.every(Boolean))return {...targets[0],stat:undefined,threshold:undefined,comparison:undefined,alternatives:targets};}
  const zone=/ (from|in) (your|an opponent's|a player's) (hand|exile)$/.exec(text);
  if(zone){const base=h.target(text.slice(0,zone.index)+' '+zone[1]+' '+zone[2]+' graveyard');if(base?.zone==='graveyard')return {...base,zone:zone[3]};}
  return v13.extensionTarget(text,h);
}

export function extensionEffect(card,line,h){
  const joinedMove=/^(Destroy|Exile|Return) (.+?) and all (Auras|Equipment|permanents) attached to (?:it|them|that creature)( to their owners' hands)?\.$/.exec(line);
  if(joinedMove&&(joinedMove[1]==='Return')===!!joinedMove[4]){
    const main=h.effect(card,joinedMove[1]+' '+joinedMove[2]+(joinedMove[1]==='Return'?" to its owner's hand.":'.'));
    const filter=h.target('target '+({Auras:'Aura',Equipment:'Equipment',permanents:'permanent'})[joinedMove[3]]);
    if(complete(main)&&main.effects.length===1&&['destroy','exile','bounce'].includes(main.effects[0].action)&&filter?.zone==='battlefield')return body([{action:'battlefield-group',operation:main.effects[0].action,filters:[filter],target:main.effects[0].target,attachedToV12:true,includeHostV14:true}],main.targets);
  }
  const destroyHosts=/^(Destroy|Exile) all creatures and all (Auras|Equipment|permanents) attached to creatures\.$/.exec(line);
  if(destroyHosts){const host=h.target('target creature'),filter=h.target('target '+({Auras:'Aura',Equipment:'Equipment',permanents:'permanent'})[destroyHosts[2]]);if(host&&filter)return body([{action:'battlefield-group',operation:destroyHosts[1].toLowerCase(),filters:[host,{...filter,attachedHost:host}]}]);}
  if(line==="Each player's life total becomes the number of creatures they control.")return body([{action:'player-sequence-v9',who:'each-player',effects:[{action:'set-life-v9',who:0,n:{kind:'target-count',target:0,count:h.count('creatures you control')}}]}]);
  if(line==="Each player's life total becomes the lowest life total among all players.")return body([{action:'set-life-v9',who:'each-player',n:{kind:'lowest-life-v14'}}]);
  const keep=/^(Target player|Target opponent|You) chooses? (a|one|two|three|X|[0-9]+) cards? in (?:their|your) hand and discards? the rest\.$/i.exec(line);
  if(keep){const actor=keep[1].toLowerCase(),n=({a:1,one:1,two:2,three:3})[keep[2]]??(keep[2]==='X'?'X':Number(keep[2]));return body([{action:'discard-except-v14',who:actor==='you'?'you':0,n}],actor==='you'?[]:[h.target(actor)]);}
  const keepAfterDraw=/^(Draw [^.]+ cards?), then choose (X|[0-9]+) cards? in your hand and discard the rest\.$/.exec(line);
  if(keepAfterDraw){const first=h.effect(card,keepAfterDraw[1]+'.'),last=h.effect(card,'You choose '+keepAfterDraw[2]+' cards in your hand and discard the rest.');if(complete(first)&&complete(last)&&!first.targets.length&&!last.targets.length)return body([...first.effects,...last.effects]);}
  const repeatPower=/^Until end of turn, double (target creature)'s power (X|[0-9]+) times\.$/.exec(line);
  if(repeatPower){const parsed=h.effect(card,'Double the power of '+repeatPower[1]+' until end of turn.');if(complete(parsed)&&parsed.effects.length===1&&parsed.effects[0].action==='scale-pt')return {...parsed,effects:[{...parsed.effects[0],exponentV14:repeatPower[2]==='X'?'X':Number(repeatPower[2])}]};}
  const replacement=/^([^\n]+?\.) If (this spell was cast using teamwork|this spell's additional cost was paid|evidence was collected), instead (.+?\.)(?: (.+))?$/.exec(line);
  if(replacement){const ordinary=h.effect(card,replacement[1]+(replacement[4]?' '+replacement[4]:'')),alternative=h.effect(card,upper(replacement[3])+(replacement[4]?' '+replacement[4]:''));if(complete(ordinary)&&complete(alternative)&&ordinary.targets.length===alternative.targets.length)return {...ordinary,optionalBodyV14:alternative};}
  const targetReplacement=/^Choose (target .+?)\. If this spell was cast using teamwork, instead choose (target .+?)\. (.+)$/.exec(line);
  if(targetReplacement){const compile=target=>h.effect(card,targetReplacement[3]==='Return the chosen card to the battlefield.'?'Return '+target+' to the battlefield.':'Choose '+target+'. '+targetReplacement[3]),ordinary=compile(targetReplacement[1]),alternative=compile(targetReplacement[2]);if(complete(ordinary)&&complete(alternative)&&ordinary.targets.length===alternative.targets.length)return {...ordinary,optionalBodyV14:alternative};}
  const alternateStats=/^(Until end of turn, .+ becomes an? .+ with base power and toughness [0-9]+\/[0-9]+\.) If (.+), it has base power and toughness ([0-9]+)\/([0-9]+) until end of turn instead\.$/.exec(line);
  if(alternateStats){const first=h.effect(card,alternateStats[1]),condition=h.condition(alternateStats[2]);if(complete(first)&&condition&&first.effects.length===1&&first.effects[0].action==='animate')return body([{action:'conditional',condition,effects:[{...first.effects[0],power:Number(alternateStats[3]),toughness:Number(alternateStats[4])}],elseEffects:first.effects}],first.targets);}
  const reflexiveBlight=/^You may blight ([1-9][0-9]*)\. When you do, (.+)$/.exec(line);
  if(reflexiveBlight){const parsed=h.effect(card,reflexiveBlight[2]);if(complete(parsed))return body([{action:'reflexive-cost',cost:{zone:'battlefield',action:'blight-v14',n:1,countersV14:Number(reflexiveBlight[1]),filter:{what:'creature',zone:'battlefield',controller:'you'}},reflexiveBody:parsed}]);}
  const paid=resolutionCostEffect(card,line,h,paymentV14);if(paid)return paid;
  const namedDamage=/^(.+?) deals ([0-9]+) damage to (target .+?)\. It deals ([0-9]+) damage to that creature instead if (.+)\.$/.exec(line);
  if(namedDamage&&namedDamage[1]===card.name){const parsed=h.effect(card,card.name+' deals '+namedDamage[2]+' damage to '+namedDamage[3]+'. If '+namedDamage[5]+', '+card.name+' deals '+namedDamage[4]+' damage to that creature instead.');if(complete(parsed))return parsed;}
  if(/\. Also (?:put|draw|gain|destroy|exile|return|tap|untap) /.test(line)){const parsed=h.effect(card,line.replace(/\. Also ([a-z])/g,(text,first)=>'. '+first.toUpperCase()));if(complete(parsed))return parsed;}
  const alsoDamage=/^(.+?) deals ([0-9]+) damage to target creature\. If (.+?), it also deals ([0-9]+) damage to that creature's controller\.$/.exec(line);
  if(alsoDamage&&alsoDamage[1]===card.name){const parsed=h.effect(card,alsoDamage[1]+' deals '+alsoDamage[2]+' damage to target creature. If '+alsoDamage[3]+', '+card.name+' deals '+alsoDamage[4]+' damage to its controller.');if(complete(parsed))return parsed;}
  const repeat=/^Repeat the following process (X|[0-9]+) times\. (.+)$/.exec(line),twice=/^(.+) Repeat this process once\.$/.exec(line);
  if(repeat||twice){const parsed=h.effect(card,repeat?repeat[2]:twice[1]);if(complete(parsed)&&parsed.effects.every(effect=>effect.action==='unless-cost-v14'&&effect.effects.length===1&&effect.effects[0].action==='lose-life'&&typeof effect.effects[0].n==='number'))return body([{action:'repeat-v14',n:repeat?(repeat[1]==='X'?'X':Number(repeat[1])):2,effects:parsed.effects}],parsed.targets);}
  const paidBranch=/^(.+ unless .+)\. If they do, (.+)\.$/.exec(line);
  if(paidBranch){const main=unlessEffect(card,paidBranch[1]+'.',h),paid=h.effect(card,upper(paidBranch[2])+'.');if(main&&main.effects.length===1&&complete(paid)&&!paid.targets.length)return {...main,effects:[{...main.effects[0],paidEffectsV14:paid.effects}]};}
  if(line.includes(' unless ')){const parsed=unlessEffect(card,line,h);if(parsed)return parsed;}
  const duration=/^(?:Until your next turn, (.+)|(.+?) until your next turn)\.$/i.exec(line);
  if(duration&&!/["\n]/.test(line)){
    const text=(duration[1]||duration[2]),parsed=h.effect(card,text+' until end of turn.');
    if(complete(parsed)&&parsed.effects.every(effect=>temporary.has(effect.action)||effect.action==='battlefield-group'&&effect.operation==='pump'))return {...parsed,effects:parsed.effects.map(effect=>({...effect,durationV14:'next-turn'}))};
  }
  const statConditional=/^(.+\.) If it had (mana value|power|toughness) ([0-9]+)( or (less|greater))?, (.+)$/.exec(line);
  if(statConditional){const parsed=h.effect(card,statConditional[1]+' If its '+statConditional[2]+' was '+statConditional[3]+' or '+(statConditional[5]||'less')+', '+statConditional[6]);if(parsed&&statConditional[5])return parsed;}
  const randomHand=/^Return (one|two|three|[0-9]+) cards? at random from your graveyard to your hand\.$/.exec(line);
  if(randomHand)return body([{action:'zone-random-v14',who:'you',zone:'graveyard',destination:'hand',n:({one:1,two:2,three:3})[randomHand[1]]??Number(randomHand[1])}]);
  const ownerChoice=/^Put (target card from (?:your|a|an opponent's) graveyard) on your choice of the top or bottom of its owner's library\.$/.exec(line);
  if(ownerChoice){const target=h.target(ownerChoice[1]);if(target?.zone==='graveyard')return body([{action:'owner-library-choice',target:0,chooserV14:'you',fromV14:'graveyard'}],[target]);}
  return v13.extensionEffect(card,line,h);
}
export function extensionLine(card,line,h){
  const selfScale=/^((?:When|Whenever) this creature (?:enters|attacks|attacks alone|blocks|dies)), (double|triple) its (power|toughness|power and toughness) until end of turn\.$/.exec(line);
  if(selfScale){const parsed=h.line(card,selfScale[1]+', '+selfScale[2]+' the '+selfScale[3]+' of this creature until end of turn.');if(parsed?.kind==='generic-trigger')return parsed;}
  if(line==="You may cast this spell as though it had flash if it's cast using teamwork."&&/^Teamwork [1-9][0-9]*(?: \(|\n|$)/m.test(card.oracle_text||''))return {kind:'optional-cost-flash-v14',contract:'generic-continuous-effect'};
  const teamworkCast=/^Whenever you cast a spell using teamwork, (.+)$/.exec(line);
  if(teamworkCast){const parsed=h.effect(card,teamworkCast[1]);if(complete(parsed))return {kind:'generic-trigger',event:'cast',eventFilter:{kind:'qualified-cast-v8',controller:'you',target:{what:'spell',zone:'stack'},optionalCostV14:'teamwork'},...parsed,contract:'generic-trigger-effect'};}
  const teamworkTap=/^Whenever (.+?) becomes tapped to pay a teamwork cost, (.+)$/.exec(line);
  if(teamworkTap&&[card.name,card.name.split(',')[0],'this creature'].includes(teamworkTap[1])){const parsed=h.effect(card,teamworkTap[2].replace(/\bher\b/g,'this creature'));if(complete(parsed))return {kind:'generic-trigger',event:'teamworkPaidV14',eventFilter:'self',...parsed,contract:'generic-trigger-effect'};}
  if(!/This ability triggers|for the first time|When you do|Whenever you do/.test(line)){
    const joined=/^((?:When|Whenever) .+?)(?: and | or )((?:when|whenever) .+?), (.+)$/.exec(line);
    if(joined){const operations=[h.line(card,joined[1]+', '+joined[3]),h.line(card,upper(joined[2])+', '+joined[3])];if(disjointTriggers(operations))return {kind:'operation-bundle',operations,contract:'closed-permanent-clauses'};}
    const shared=/^Whenever (you|an opponent|a player) (cast|casts) or (copy|copies) (.+?), (.+)$/.exec(line);
    if(shared){const operations=[shared[2],shared[3]].map(verb=>h.line(card,'Whenever '+shared[1]+' '+verb+' '+shared[4]+', '+shared[5]));if(disjointTriggers(operations))return {kind:'operation-bundle',operations,contract:'closed-permanent-clauses'};}
    const alternatives=/^(When|Whenever) (.+?) or ((?:a|an|another|one or more) .+?), (.+)$/.exec(line);
    if(alternatives){const operations=[alternatives[2],alternatives[3]].map(header=>h.line(card,alternatives[1]+' '+header+', '+alternatives[4]));if(disjointTriggers(operations))return {kind:'operation-bundle',operations,contract:'closed-permanent-clauses'};}
  }
  const matrix=/^Activated abilities of (artifacts|creatures|enchantments|lands)( and (artifacts|creatures|enchantments|lands))? can't be activated unless they're mana abilities\.$/.exec(line);
  if(matrix){const filters=[matrix[1],matrix[3]].filter(Boolean).map(noun=>h.target('target '+noun.slice(0,-1)));if(filters.every(target=>target?.zone==='battlefield'))return {kind:'generic-static',scope:'filtered-permanents',filters,nonmanaDisabledV14:true,contract:'generic-continuous-effect'};}
  const attached=/^(Enchanted|Equipped) (creature|permanent|artifact|land)(?: (can't attack, block, or crew Vehicles|can't attack or block)(?:, and its|\. Its)|'s) activated abilities can't be activated unless they're mana abilities\.$/.exec(line);
  if(attached)return {kind:'attachment-grant',power:0,toughness:0,keywords:[],nonmanaDisabledV14:true,...(attached[3]?{cantAttack:true,cantBlock:true,...(attached[3].includes('crew')?{cantCrewV14:true}:{})}:{}) ,contract:'attachment-continuous-effect'};
  const crew=/^(Enchanted|Equipped) (creature|permanent) can't attack, block, or crew Vehicles\.$/.exec(line);
  if(crew)return {kind:'attachment-grant',power:0,toughness:0,keywords:[],cantAttack:true,cantBlock:true,cantCrewV14:true,contract:'attachment-continuous-effect'};
  if(line==='This creature is all colors.')return {kind:'characteristic-color-v14',colors:['W','U','B','R','G'],contract:'characteristic-color-v14'};
  return v13.extensionLine(card,line,h);
}
