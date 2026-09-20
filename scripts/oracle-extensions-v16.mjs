// Closed additions. Successful v15 definitions remain frozen.
import * as v15 from './oracle-extensions-v15.mjs';
import {extensionEffect as dividedDamage} from './oracle-v8-divided-damage.mjs';
import {ORACLE_SUBTYPES,ORACLE_SUBTYPE_TYPES} from './oracle-subtypes.mjs';
export * from './oracle-extensions-v15.mjs';
const body=(effects,targets=[])=>({effects,targets,optional:false});
const complete=p=>p&&!p.optional&&!p.v4Body&&Array.isArray(p.targets)&&Array.isArray(p.effects);
const singular=text=>text.replace(/\b(creatures|artifacts|enchantments|lands|permanents|cards|tokens|Mountains|Forests|Islands|Swamps|Spirits)\b/g,word=>word.slice(0,-1));
const shift=(node,n)=>Array.isArray(node)?node.map(child=>shift(child,n)):node&&typeof node==='object'?Object.fromEntries(Object.entries(node).map(([key,value])=>[key,['target','who','otherTarget','conditionTarget'].includes(key)&&typeof value==='number'?value+n:shift(value,n)])):node;
const bindResult=node=>node==='X'?{kind:'result-count-v16'}:Array.isArray(node)?node.map(bindResult):node&&typeof node==='object'?Object.fromEntries(Object.entries(node).map(([key,value])=>[key,bindResult(value)])):node;
const marker='Aetherborn';
const numberWords={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10};
const bundle=operations=>({kind:'operation-bundle',operations,contract:'closed-permanent-clauses'});
const chosenEntry=card=>/^As [^.\n]+ enters, choose a creature type\./m.test(card.oracle_text||'');
function typeText(text){return text
  .replace(/(creature cards?|creatures?|permanents?|spells?|cards?)( you control| you cast)? of (?:the chosen|that) (?:creature )?type/g,(_,noun,owner)=>marker+' '+noun+(owner||''))
  .replace(/(?:the chosen|that) creature type/g,marker)
  .replace(/(?:the chosen|that) type/g,marker);}
const bindType=node=>node===marker?{kind:'chosen-subtype-v16'}:Array.isArray(node)?node.map(bindType):node&&typeof node==='object'?Object.fromEntries(Object.entries(node).map(([key,value])=>[key,bindType(value)])):node;
export function extensionTarget(text,h){
  if(text==='any target that was dealt damage this turn')return {what:'any',zone:'battlefield',min:1,damagedThisTurn:true};
  const cycling=/^(.*target (?:creature )?cards?) with cycling( from (?:your|an opponent's|a) graveyard)$/.exec(text);
  if(cycling){const parsed=h.target(cycling[1]+cycling[2]);if(parsed?.zone==='graveyard')return {...parsed,cyclingV16:true};}
  if(/of the chosen (?:creature )?type/.test(text)){const parsed=h.target(typeText(text));if(parsed)return bindType(parsed);}
  return v15.extensionTarget(text,h);
}
export function extensionCount(text,h){
  const died=/^([A-Z][A-Za-z'-]+) that died this turn$/.exec(text);
  if(died&&ORACLE_SUBTYPES.has(died[1])&&!ORACLE_SUBTYPE_TYPES[died[1]])return {kind:'died-count',what:'creature',subtypeV16:died[1]};
  if(/^cards? named [^.]+ in each graveyard$/.test(text))return h.count(text.replace(/^card /,'cards ').replace(/ in each graveyard$/,' in all graveyards'));
  if(/of the chosen (?:creature )?type/.test(text)){const parsed=h.count(typeText(text));if(parsed)return bindType(parsed);}
  return v15.extensionCount(text,h);
}
export function extensionLine(card,line,h){
  const played=/^When(?:ever)? you play a card, (.+)$/.exec(line);
  if(played){const operations=['Whenever you cast a spell, ','Whenever you play a land, '].map(prefix=>h.line(card,prefix+played[1]));if(operations.every(op=>op?.kind==='generic-trigger')&&operations[0].event==='cast'&&operations[1].event==='landPlayed')return bundle(operations);}
  const ward=/^Ward—(.+)\.$/.exec(line);
  if(ward&&!/\b(?:Instant|Sorcery)\b/.test(card.type_line||'')){
    let payment;
    if(ward[1]==='Discard a card at random')payment={kind:'discard',zone:'hand',n:1,randomV16:true,filter:{what:'card',zone:'hand',controller:'you'}};
    else if(!/^(?:Pay [0-9]+ life|Discard a card)$/.test(ward[1])){
      let phrase=ward[1][0].toLowerCase()+ward[1].slice(1);phrase=phrase.replace(/^((?:\{[0-9WUBRGC]+\})+), Pay ([0-9]+) life$/,'pay $1 and $2 life');
      const parsed=h.effect(card,'Sacrifice this creature unless you '+phrase+'.');
      if(complete(parsed)&&!parsed.targets.length&&parsed.effects.length===1&&['unless-cost','unless-cost-v14'].includes(parsed.effects[0].action)&&parsed.effects[0].who==='you')payment=parsed.effects[0].payment;
    }
    if(payment&&!/"(?:chooseX|xValue|target)"/.test(JSON.stringify(payment)))return {kind:'mechanic-ward-v8',payment:{kind:'resolution-v16',cost:payment,label:ward[1]},contract:'mechanic-ward-v8'};
  }
  const escaped=String(card.name).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const tax=new RegExp('^Spells your opponents cast that target (this (?:creature|permanent)|'+escaped+'|a creature or planeswalker you control|one or more commanders you control) cost \\{([1-9][0-9]*)\\} more to cast\\.$').exec(line);
  if(tax){const own=tax[1].startsWith('this ')||tax[1]===card.name,filter=own?null:h.target('target '+tax[1].replace(/^a |^one or more /,'').replace(/commanders/,'commander'));if(own||filter?.zone==='battlefield')return {kind:'spell-target-tax-v16',n:Number(tax[2]),...(own?{own:true}:{filter}),contract:'spell-target-tax-v16'};}
  const limit=/^Each player can't cast more than one (noncreature|non-Phyrexian) spell each turn\.$/.exec(line);
  if(limit)return {kind:'spell-limit-v8',players:'all',max:1,qualityV16:limit[1],contract:'spell-limit-v8'};
  const turnTax=/^Each spell costs \{([1-9][0-9]*)\} more to cast except during its controller's turn\.$/.exec(line);
  if(turnTax)return {kind:'cost-modifier',target:{what:'card',zone:'battlefield',controller:'any'},controller:'all',amount:Number(turnTax[1]),castTurnV16:'other',contract:'generic-cost-modification'};
  const equip=/^Equip costs you pay cost \{([1-9][0-9]*)\} less\.$/.exec(line);
  if(equip)return h.line(card,'Equip abilities you activate cost {'+equip[1]+'} less to activate.');
  const variable=/^(.+?) gets? ([+-](?:X|[0-9]+))\/([+-](?:X|[0-9]+)), where X is (.+)\.$/.exec(line);
  if(variable&&[variable[2],variable[3]].filter(n=>n.endsWith('X')).length===1&&[variable[2],variable[3]].some(n=>!n.endsWith('X')&&Number(n)!==0)){
    const dynamic=h.line(card,variable[1]+' gets '+(variable[2].endsWith('X')?variable[2]:'+0')+'/'+(variable[3].endsWith('X')?variable[3]:'+0')+', where X is '+variable[4]+'.');
    const fixed=h.line(card,variable[1]+' gets '+(variable[2].endsWith('X')?'+0':variable[2])+'/'+(variable[3].endsWith('X')?'+0':variable[3])+'.');
    if(dynamic&&fixed&&['generic-static','attachment-grant'].includes(dynamic.kind)&&dynamic.kind===fixed.kind)return bundle([dynamic,fixed]);
  }
  const double=/^Double all damage that (creature sources you control|sources you control of the chosen type) would deal\.$/.exec(line);
  if(double){
    const noun=double[1].startsWith('creature')?'a creature you control':'a '+marker+' you control';
    const parsed=h.line(card,'If '+noun+' would deal damage to a permanent or player, it deals twice that much damage to that permanent or player instead.');
    if(parsed?.kind==='v8-replacement'&&(double[1].startsWith('creature')||chosenEntry(card)&&!String(card.oracle_text).includes(marker)))return double[1].startsWith('creature')?parsed:bindType(parsed);
  }
  const life=/^If (a player|an opponent) would gain life, that player (gains no life|loses that much life) instead\.$/.exec(line);
  if(life)return {kind:'v8-replacement',event:'lifegain',playersV16:life[1]==='a player'?'all':'opponents',...(life[2].startsWith('loses')?{loseV16:true}:{}),transform:{set:0},contract:'ordered-replacement-effect'};
  const animation=/^(.+?) (?:is|are) (?:a |an )?([0-9]+\/[0-9]+ .*?creatures?(?: with [^.]+)?)(?:\. (?:They're|They are|It's|It is)| that (?:are|is)) still (?:lands|a land)\.$/.exec(line);
  if(animation){
    const attached=/^Enchanted (?:land|Forest|Island|Mountain|Plains|Swamp)$/.test(animation[1]),filter=attached?null:h.target('target '+singular(animation[1].replace(/^Lands/,'lands')));
    const parsed=h.effect(card,'Target land becomes a '+animation[2].replace(/\bcreatures\b/,'creature')+". It's still a land.");
    const effect=parsed?.effects?.[0];
    if((attached||filter?.zone==='battlefield'&&filter.what==='land')&&complete(parsed)&&parsed.effects.length===1&&effect.action==='animate'&&typeof effect.power==='number'&&typeof effect.toughness==='number'&&!effect.allCreatureTypes){
      return {kind:'v8-layered-static',...(attached?{attached:true}:{filters:[filter]}),change:{creatureV9:true,...(effect.subtypes.length?{addCreatureTypes:effect.subtypes}:{}),...(effect.colors?{colors:effect.colors}:{})},operation:{kind:'base-pt-static',power:effect.power,toughness:effect.toughness,keywords:effect.keywords,subtypes:[],contract:'continuous-base-pt'},contract:'continuous-layered-characteristics'};
    }
  }
  if(/^As [^.\n]+ enters, choose a creature type\.$/.test(line))return {kind:'chosen-subtype-entry-v16',contract:'as-enters-subtype-choice-v16'};
  if(chosenEntry(card)&&line==='This creature is the chosen type in addition to its other types.')return {kind:'v8-type-static',own:true,change:{addCreatureTypes:[{kind:'chosen-subtype-v16'}]},contract:'continuous-characteristic-type'};
  if(chosenEntry(card)&&!String(card.oracle_text).includes(marker)&&/chosen (?:creature )?type/.test(line)&&!/["\n]/.test(line)){
    const parsed=h.line(card,typeText(line));if(parsed&&JSON.stringify(parsed).includes(marker))return bindType(parsed);
  }
  return v15.extensionLine(card,line,h);
}
export function extensionEffect(card,line,h){
  const reveal=/^(Target player|Target opponent|Each player|Each opponent) reveals? the top card of their library\.$/.exec(line);
  if(reveal){const actor=reveal[1].toLowerCase(),targeted=actor.startsWith('target ');return body([{action:'reveal-top-v16',who:targeted?0:actor.replace(' ','-'),n:1}],targeted?[h.target(actor)]:[]);}
  const exiled=/^(Exile [^.]+\.) For each (creature|artifact|enchantment|land|permanent) exiled this way, its controller creates (.+)\.$/.exec(line);
  if(exiled){const primary=h.effect(card,exiled[1]),token=h.effect(card,'Create '+exiled[3]+'.');if(complete(primary)&&primary.effects.length===1&&primary.effects[0].action==='exile'&&complete(token)&&!token.targets.length&&token.effects.length===1&&['token-key','token-inline'].includes(token.effects[0].action))return body([{action:'with-card-results-v8',event:'exile',effects:primary.effects,clauses:[{action:'result-each-v16',filter:{what:exiled[2],zone:'graveyard',controller:'any'},effects:token.effects.map(effect=>({...effect,who:'result-controller-v16'}))}]}],primary.targets);}
  const eachColor=/^For each color, return up to one target (creature )?card of that color from your graveyard to your hand\.$/.exec(line);
  if(eachColor){const effects=[],targets=[];for(const color of ['white','blue','black','red','green']){const parsed=h.effect(card,'Return up to one target '+color+' '+(eachColor[1]||'')+'card from your graveyard to your hand.');if(!complete(parsed)||parsed.targets.length!==1)return null;effects.push(...shift(parsed.effects,targets.length));targets.push(...parsed.targets);}return body(effects,targets);}
  const unless=/^Unless (target player|target opponent) pays ([^,]+), that player (.+)\.$/.exec(line);
  if(unless)return h.effect(card,unless[1][0].toUpperCase()+unless[1].slice(1)+' '+unless[3]+' unless they pay '+unless[2]+'.');
    const manaCount=/^Add ((?:\{[WUBRGC]\})+) for each (.+)\.$/.exec(line);
  if(manaCount){const count=h.count(manaCount[2]);if(count)return body([{action:'add-mana',produce:[...manaCount[1].matchAll(/\{([WUBRGC])\}/g)].reduce((pool,m)=>(pool[m[1]]=(pool[m[1]]||0)+1,pool),{}),multiplier:count}]);}
  if(/^You may distribute /.test(line)){const parsed=h.effect(card,line.replace(/^You may distribute /,'Distribute '));if(complete(parsed)&&parsed.effects[0]?.action==='divided-counters-v16')return {...parsed,optional:true};}
  const distributed=/^Distribute (one|two|three|four|five|six|seven|eight|nine|ten|[0-9]+|X) (\+1\/\+1|-1\/-1) counters? among (.+)\.$/.exec(line);
  if(distributed){const n=numberWords[distributed[1]]??distributed[1],parsed=dividedDamage(card,card.name+' deals '+n+' damage divided as you choose among '+distributed[3]+'.',h);if(parsed&&parsed.targets[0]?.zone==='battlefield'&&!['any','player','opponent'].includes(parsed.targets[0].what))return body(parsed.effects.map(effect=>({...effect,action:'divided-counters-v16',counter:distributed[2]})),parsed.targets);}
  const another=/^Sacrifice another (.+)\.$/.exec(line);
  if(another){const filter=h.target('another target '+another[1]+' you control');if(filter?.zone==='battlefield')return body([{action:'choose-permanents',who:'you',operation:'sacrifice',n:1,filter}]);}
  if(/^You may tap any number of /.test(line))return h.effect(card,line.replace(/^You may tap /,'Tap '));
  if(chosenEntry(card)&&!String(card.oracle_text).includes(marker)&&/chosen (?:creature )?type/.test(line)&&!/["\n]/.test(line)){
    const parsed=h.effect(card,typeText(line));if(complete(parsed)&&JSON.stringify(parsed).includes(marker))return bindType(parsed);
  }
  const anySac=/^Sacrifice any number of (.+?)(?: you control)?\.$/.exec(line);
  if(anySac){const filter=h.target('target '+singular(anySac[1]).replace(/,? and\/or /g,' or ')+' you control');if(filter?.zone==='battlefield')return body([{action:'choose-permanents',who:'you',operation:'sacrifice',n:'all',upTo:true,filter}]);}
  const tap=/^Tap any number of (untapped [^.]+ you control)\.$/.exec(line);
  if(tap){const filter=h.target('target '+singular(tap[1]));if(filter?.zone==='battlefield')return body([{action:'choose-permanents',who:'you',operation:'tap',n:'all',upTo:true,filter}]);}
  const tapped=/^(Tap any number of [^.]+)\. (.+?) for each (creature|artifact|land|permanent) tapped this way\.$/.exec(line);
  if(tapped){const primary=h.effect(card,tapped[1]+'.'),parsed=h.effect(card,tapped[2]+'.');
    if(complete(primary)&&primary.effects.length===1&&complete(parsed)&&parsed.effects.length===1&&!parsed.targets.length){
      const effect=parsed.effects[0],scalars=['draw','gain-life','token-key','token-inline'];
      if(scalars.includes(effect.action)&&Number.isSafeInteger(effect.n)||effect.action==='pump'&&typeof effect.power==='number'&&typeof effect.toughness==='number'){
        const scaled=effect.action==='pump'?{...effect,power:{kind:'product-v16',left:effect.power,right:{kind:'result-count-v16'}},toughness:{kind:'product-v16',left:effect.toughness,right:{kind:'result-count-v16'}}}:{...effect,n:{kind:'product-v16',left:effect.n,right:{kind:'result-count-v16'}}};
        return body([{action:'with-card-results-v8',event:'tap-v16',effects:primary.effects.map(e=>({...e,captureTapV16:true})),clauses:[{action:'result-bound-v16',filter:{what:tapped[3],zone:'graveyard',controller:'any'},effects:[scaled]}]}]);
      }
    }
  }
  const destroyed=/^(Destroy [^.]+\.(?: They can't be regenerated\.)?) For each (creature|artifact|enchantment|land|permanent) destroyed this way, its controller creates (.+)\.$/.exec(line);
  if(destroyed){const primary=h.effect(card,destroyed[1]),token=h.effect(card,'Create '+destroyed[3]+'.');
    if(complete(primary)&&primary.effects.length===1&&(primary.effects[0].action==='destroy'||primary.effects[0].action==='battlefield-group'&&primary.effects[0].operation==='destroy')&&complete(token)&&!token.targets.length&&token.effects.length===1&&['token-inline','token-key'].includes(token.effects[0].action))return body([{action:'with-card-results-v8',event:'destroy-v16',effects:primary.effects.map(e=>({...e,captureDestroyedV16:true})),clauses:[{action:'result-each-v16',filter:{what:destroyed[2],zone:'graveyard',controller:'any'},effects:token.effects.map(e=>({...e,who:'result-controller-v16'}))}]}],primary.targets);
  }
  const sacrificeThen=/^(Sacrifice [^.]+?)(?:, then |\. )(.+)\.$/.exec(line);
  if(sacrificeThen&&!/\bX\b/.test(sacrificeThen[2])&&/that (?:many|much)/.test(sacrificeThen[2])){
    const primary=h.effect(card,sacrificeThen[1]+'.');
    if(complete(primary)&&!primary.targets.length&&primary.effects.length===1&&primary.effects[0].action==='choose-permanents'&&primary.effects[0].operation==='sacrifice'){
      const tail=sacrificeThen[2].replace(/^([a-z])/,s=>s.toUpperCase()).replace(/that (?:many|much)/g,'X');
      const mana=/^Add X (\{[WUBRGC]\})$/.exec(tail);
      const parsed=mana?body([{action:'add-mana',produce:{[mana[1][1]]:1},multiplier:'X'}]):h.effect({...card,mana_cost:(card.mana_cost||'')+'{X}'},tail+'.');
      if(complete(parsed)&&!JSON.stringify(parsed.targets).includes('X')&&/"X"/.test(JSON.stringify(parsed.effects))){
        return body([{action:'with-card-results-v8',event:'sacrifice',effects:primary.effects,clauses:[{action:'result-bound-v16',filter:{what:'permanent',zone:'graveyard',controller:'any'},effects:bindResult(parsed.effects)}]}],parsed.targets);
      }
    }
  }
  const chosen=/^(Target opponent|Target player) chooses a (.+?) they control\. (Destroy|Exile|Return) that (?:creature|permanent|artifact|enchantment|land)( to its owner's hand)?\.$/.exec(line);
  if(chosen&&(chosen[3]==='Return')===!!chosen[4]){const filter=h.target('target '+chosen[2]);if(filter?.zone==='battlefield')return body([{action:'choose-permanents',who:0,operation:chosen[3]==='Return'?'bounce':chosen[3].toLowerCase(),n:1,filter}],[h.target(chosen[1].toLowerCase())]);}
  return v15.extensionEffect(card,line,h);
}
