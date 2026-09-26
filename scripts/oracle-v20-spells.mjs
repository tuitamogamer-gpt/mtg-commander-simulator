// Closed spell compositions. All rewrites consume a complete printed clause.
import {extensionEffect as revealedEffectV8} from './oracle-v8-revealed.mjs';
const body=(effects,targets=[])=>targets.some(target=>!target)?null:({effects,targets,optional:false});
const complete=p=>p&&!p.optional&&!p.v4Body&&Array.isArray(p.targets)&&p.targets.every(Boolean)&&Array.isArray(p.effects);
const numbers={a:1,an:1,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10};
const number=x=>numbers[x]??(/^\d+$/.test(x)?Number(x):x);
const sameTargets=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const singular=x=>x.replace(/\b(cards|creatures|artifacts|enchantments|permanents|lands|planeswalkers|tokens)\b/g,s=>s.slice(0,-1));
const bind=(node,fn)=>Array.isArray(node)?node.map(x=>bind(x,fn)):node&&typeof node==='object'?fn(Object.fromEntries(Object.entries(node).map(([k,v])=>[k,bind(v,fn)]))):node;
const reftarget=(node,from,to)=>bind(node,x=>Object.fromEntries(Object.entries(x).map(([k,v])=>[k,['target','who','otherTarget','sourceTarget','conditionTarget'].includes(k)&&v===from?to:v])));

export function modalOperation(card,text,parseEffect,parseModal){
 if(!/\b(?:Instant|Sorcery)\b/.test(card.type_line||'')||!text.startsWith('Tiered\n'))return null;
 const lines=text.split('\n').slice(1),modes=lines.map(line=>/^• ((?:\{(?:[0-9]+|[WUBRGC])\})+) — (.+)$/.exec(line));
 if(modes.length<2||modes.some(m=>!m))return null;
 const parsed=parseModal(card,'Choose one —\n'+modes.map(m=>'• '+m[2]).join('\n'),parseEffect);
 if(parsed?.kind!=='spell-modal-generic'||parsed.modes.length!==modes.length)return null;
 return {...parsed,modes:parsed.modes.map((mode,i)=>({...mode,tierCostV10:modes[i][1]}))};
}

export function extensionTarget(text,h){
 if(text==='target Arcane spell')return {...h.target('target spell'),spellFilter:{what:'card',zone:'graveyard',controller:'any',subtype:'Arcane'}};
 const kindred=/^target kindred card from (your|a|an opponent's) graveyard$/.exec(text);
 if(kindred)return {what:'kindred',zone:'graveyard',controller:kindred[1]==='your'?'you':kindred[1]==="an opponent's"?'opponent':'any',min:1};
 const nonlegendary=/^(target )nonlegendary,? (.+)$/.exec(text);
 if(nonlegendary){const base=h.target(nonlegendary[1]+nonlegendary[2]);if(base&&['battlefield','graveyard'].includes(base.zone))return {...base,nonlegendary:true};}
 const noCounters=/^(target .+?) with no counters on it$/.exec(text);
 if(noCounters){const base=h.target(noCounters[1]);if(base?.zone==='battlefield')return {...base,v20:{kind:'no-counters-v20'}};}
 const graveStat=/^(.+?target .+? cards?) with (power|toughness) ([0-9]+)( or less| or greater)?( from (?:your|a|an opponent's) graveyard)$/.exec(text);
 if(graveStat){const base=h.target(graveStat[1]+graveStat[5]);if(base?.zone==='graveyard')return {...base,stat:graveStat[2],threshold:Number(graveStat[3]),comparison:graveStat[4]===' or less'?'less':graveStat[4]===' or greater'?'greater':'equal'};}
 const singularGrave=/^(target .+? card) with (power|toughness) ([0-9]+)( or less| or greater)?( from (?:your|a|an opponent's) graveyard)$/.exec(text);
 if(singularGrave){const base=h.target(singularGrave[1]+singularGrave[5]);if(base?.zone==='graveyard')return {...base,stat:singularGrave[2],threshold:Number(singularGrave[3]),comparison:singularGrave[4]===' or less'?'less':singularGrave[4]===' or greater'?'greater':'equal'};}
 return null;
}

export function extensionCount(text,h){
 if(text==='permanents you control that are creatures and/or Vehicles')return {kind:'count',zone:'battlefield',what:'permanent',controller:'you',filters:[h.target('target creature'),h.target('target Vehicle')]};
 return null;
}

export function extensionValue(text,h){
 const half=/^half (?:the number of )?(.+?), rounded (up|down)$/.exec(text);if(half){const value=h.value(half[1])??h.count(half[1]);if(value!==null&&value!==undefined)return {kind:'fraction-v9',value,denominator:2,round:half[2]};}
 return null;
}

export function extensionCondition(text,h){
 const exists=/^there is (?:a|an) (.+? card) in your graveyard$/.exec(text);
 if(exists){const count=h.count(exists[1].replace(/ card$/,' cards')+' in your graveyard');if(count)return {kind:'count-comparison',count,min:1};}
 return null;
}

export function extensionLine(card,line,h){
 const history=/^([^\n]+?[:,] )[Cc]hoose one that hasn't been chosen( this turn)? —\n((?:• [^\n]+(?:\n|$))+)$/i.exec(line);
 if(history){
  const labels=history[3].trimEnd().split('\n').map(s=>s.slice(2)),children=labels.map(label=>h.line(card,history[1]+label));
  if(children.length>=2&&children.every(c=>c?.kind==='generic-trigger'&&complete(c)&&!c.modalBody)){
   const metadata=children.map(({effects,targets,optional,...meta})=>meta);
   if(metadata.every(meta=>JSON.stringify(meta)===JSON.stringify(metadata[0])))return {...metadata[0],targets:[],effects:[],optional:false,modalBody:{choose:{min:1,max:1},modes:children.map((child,i)=>({label:labels[i],body:{targets:child.targets,effects:child.effects,optional:false}}))},modeHistoryV20:{scope:history[2]?'turn':'object',key:line}};
  }
 }
 const modal=/^([^\n]+?[:,] )[Cc]hoose (one or both|two) —\n((?:• [^\n]+(?:\n|$))+)$/i.exec(line);
 if(!modal)return null;
 const labels=modal[3].trimEnd().split('\n').map(s=>s.slice(2));
 if(labels.length<2||labels.length>4||modal[2].toLowerCase()==='one or both'&&labels.length!==2)return null;
 const plans=modal[2].toLowerCase()==='one or both'?[[0],[1],[0,1]]:labels.flatMap((_,i)=>labels.slice(i+1).map((__,j)=>[i,i+j+1]));
 const children=plans.map(plan=>h.line(card,modal[1]+plan.map(i=>labels[i]).join(' ')));
 if(children.some(c=>!['generic-trigger','generic-ability'].includes(c?.kind)||!complete(c)||c.from||c.modalBody||!c.effects.length))return null;
 const metadata=children.map(({effects,targets,optional,...meta})=>meta);
 if(metadata.some(meta=>JSON.stringify(meta)!==JSON.stringify(metadata[0])))return null;
 return {...metadata[0],targets:[],effects:[],optional:false,modalBody:{choose:{min:1,max:1},modes:children.map((c,i)=>({label:plans[i].map(j=>labels[j]).join(' '),body:{effects:c.effects,targets:c.targets,optional:false}}))}};
}

function bindPronouns(node,index,{player=false,created=false,stats=false}={}){
 if(Array.isArray(node))return node.map(x=>bindPronouns(x,index,{player,created,stats}));
 if(!node||typeof node!=='object')return node;
 if(node.action==='install-trigger-v8')return node;
 if(['event-card-stat','event-card-counters'].includes(node.kind)||stats&&node.kind==='source-stat')return node.kind.includes('counters')?{kind:'target-counters-v20',target:index,counter:node.counter}:{...node,kind:'target-stat',target:index};
 return Object.fromEntries(Object.entries(node).map(([key,value])=>{
  if(['operation','grantedOperation','trigger','modalBody','modes'].includes(key))return[key,value];
  if(['target','who','conditionTarget','sourceTarget','otherTarget'].includes(key)){
   if(['unbound-object-v10','event-card'].includes(value))return[key,index];
   if(value==='event-card-controller')return[key,{kind:'target-controller',index}];
   if(value==='event-card-owner')return[key,{kind:'target-owner',index}];
   if(value==='event-player'&&player)return[key,index];
  }
  return[key,bindPronouns(value,index,{player,created,stats})];
 }));
}

export function extensionEffect(card,line,h){
 const stunKicker=/^Tap (up to (?:two|three|four) target creatures)\. If this spell was kicked, put a stun counter on each of those creatures\.$/.exec(line);
 if(stunKicker){const first=h.effect(card,'Tap '+stunKicker[1]+'.'),condition=h.condition('this spell was kicked');if(complete(first)&&first.targets.length===1&&condition)return body([...first.effects,{action:'conditional',condition,effects:[{action:'counter',target:0,counter:'stun',n:1}]}],first.targets);}
 const subtypeDamage=/^(.+?) deals ([0-9]+) damage to (target .+?)\. If that permanent is (?:a|an) ([A-Za-z]+), \1 also deals ([0-9]+) damage to that permanent's controller\.$/.exec(line);
 if(subtypeDamage&&(subtypeDamage[1]===card.name||subtypeDamage[1]==='This spell')){const target=h.target(subtypeDamage[3]),condition=h.condition('this permanent is a '+subtypeDamage[4]);if(target?.zone==='battlefield'&&condition)return body([{action:'damage',target:0,n:Number(subtypeDamage[2])},{action:'conditional',condition,conditionTarget:0,effects:[{action:'damage',target:{kind:'target-controller',index:0},n:Number(subtypeDamage[5])}]}],[target]);}
 if(line==='Target player draws cards equal to half the number of cards in their library and loses half their life. Round up each time.')return body([{action:'draw',who:0,n:{kind:'fraction-v9',value:{kind:'target-count',target:0,count:{kind:'count',zone:'library',what:'card',controller:'you'}},denominator:2,round:'up'}},{action:'lose-life',who:0,n:{kind:'fraction-v9',value:{kind:'target-count',target:0,count:{kind:'life-total'}},denominator:2,round:'up'}}],[h.target('target player')]);
 const variable=/^(.+), where X is (.+)\.$/.exec(line);
 if(variable&&!line.includes('"')){let value=h.value(variable[2]);if(!value){const player=/^the number of (.+?) they control$/.exec(variable[2]);if(player){const count=h.count(player[1]+' you control');if(count)value={kind:'target-count',target:'event-player',count};}}
  let text=variable[1].replace(/, and you /g,'. You ').replace(/ and you /g,'. You ');const conjunct=/^(Target player draws X cards), (.+? deals X damage to any target), and you gain X life$/.exec(variable[1]);if(conjunct)text=conjunct[1]+'. '+conjunct[2]+'. You gain X life';
  if(value){const damage=/^(.+?) deals X damage to that player$/.exec(text),parsed=damage&&(damage[1]===card.name||/^[Tt]his (?:creature|artifact|enchantment|permanent|planeswalker)$/.test(damage[1]))?body([{action:'damage',target:'event-player',n:'X'}]):h.effect(card,text+'.');if(complete(parsed)&&!JSON.stringify(parsed.targets).includes('"X"')&&JSON.stringify(parsed.effects).includes('"X"')){
   const effects=JSON.parse(JSON.stringify(parsed.effects).replaceAll('"X"','{"kind":"bound-x-v10"}')),payment=effects.length===1&&effects[0];
   // The sacrificed creature does not exist as payment evidence until the
   // payment succeeds. Bind its captured stat inside that successful branch.
   if(value.kind==='event-card-stat'&&payment?.action==='resolution-cost'&&payment.payment.kind==='sacrifice'&&payment.payment.n===1&&payment.payment.filter.what==='creature')return body([{...payment,effects:[{action:'with-x-v10',value:{kind:'payment-stat',stat:value.stat},effects:payment.effects}]}],parsed.targets);
   return body([{action:'with-x-v10',value,effects}],parsed.targets);
  }}
 }
 const dieFailure=/^Roll a six-sided die\. If the result is ([1-5]) or less, you lose that much life\.$/.exec(line);
 if(dieFailure)return body([{action:'roll-table-v20',sides:6,branches:[{min:1,max:Number(dieFailure[1]),effects:[{action:'lose-life',who:'you',n:{kind:'snapshot-amount-v20'}}]},{min:Number(dieFailure[1])+1,max:6,effects:[]}]}]);
 const chooseAbility=/^(Target .+?) loses your choice of (.+?) until end of turn\.$/.exec(line);
 if(chooseAbility){const words=chooseAbility[2].split(/,? or |, /),options=words.map(word=>{const parsed=h.effect(card,chooseAbility[1]+' loses '+word+' until end of turn.');return complete(parsed)?{key:word,label:word,body:parsed}:null;});if(options.length>=2&&options.every(Boolean)&&options.every(option=>sameTargets(option.body.targets,options[0].body.targets)))return body([{action:'choice-table-v20',kind:'ability',options:options.map(option=>({key:option.key,label:option.label,effects:option.body.effects}))}],options[0].body.targets);}
 const parity=/^Choose odd or even\. (Destroy|Exile) each (other )?creature with mana value of the chosen quality\.$/.exec(line);
 if(parity)return body([{action:'choice-table-v20',kind:'parity',options:['odd','even'].map(key=>({key,label:key,effects:[{action:'parity-sweep-v20',parity:key,operation:parity[1].toLowerCase(),excludeSource:!!parity[2]}]}))}]);
 if(line==="Destroy all lands or all creatures. Creatures destroyed this way can't be regenerated.")return body([{action:'choice-table-v20',kind:'permanent type',options:['lands','creatures'].map(key=>({key,label:key,effects:[{action:'creature-no-regeneration-sweep-v20',filter:h.target('target '+key.slice(0,-1))}]}))}]);
 const combatAlternative=/^(.+?) deals ([0-9]+) damage to each attacking creature or \1 deals \2 damage to each blocking creature\.$/.exec(line);
 if(combatAlternative&&(combatAlternative[1]===card.name||combatAlternative[1]==='This spell'))return body([{action:'choice-table-v20',kind:'combat group',options:['attacking','blocking'].map(key=>({key,label:key,effects:[{action:'battlefield-group',operation:'damage',n:Number(combatAlternative[2]),filters:[h.target('target '+key+' creature')]}]}))}]);
 const consequenceBody=text=>{if(text.includes('"'))return null;text=text.replace(/\bthey\b/g,'that player').replace(/\bthat player (lose|discard|draw|create|gain|sacrifice)\b/g,'that player $1s').replace(/, then (you|that player) /g,'. $1 ').replace(/(?:,| and) (you|that player) /g,'. $1 ').replace(/(^|\. )you (sacrifice|tap) /g,'$1$2 ').replace(/(^|\. )([a-z])/g,(_,before,letter)=>before+letter.toUpperCase());const parsed=text.split('. ').map(part=>h.effect(card,part.endsWith('.')?part:part+'.'));if(parsed.some(part=>!complete(part)||part.targets.length))return null;return bind(parsed.flatMap(part=>part.effects),node=>Object.fromEntries(Object.entries(node).map(([key,value])=>[key,['target','who','otherTarget','conditionTarget'].includes(key)&&value==='event-player'?'result-player-v20':value])));};
 const failedDiscard=/^(Each opponent|Each player) discards a card\. For each (opponent|player) who can't, (.+)$/.exec(line);
 if(failedDiscard&&failedDiscard[1].toLowerCase()==='each '+failedDiscard[2]){const effects=consequenceBody(failedDiscard[3]);if(effects)return body([{action:'player-consequence-v20',who:failedDiscard[2]==='player'?'each-player':'each-opponent',first:'discard',n:1,effects}]);}
 const typedDiscard=/^(Each opponent|Each player) discards a card(?:\. (?:Then )?|, then )(?:each|Each) (opponent|player) who didn't discard (?:a|an) (.+? card) this way (.+)$/.exec(line);
 if(typedDiscard){const filter=h.target('target '+typedDiscard[3]+' from a graveyard'),effects=consequenceBody('That player '+typedDiscard[4]);if(filter&&effects)return body([{action:'player-consequence-v20',who:typedDiscard[1]==='Each player'?'each-player':'each-opponent',first:'discard',n:1,successFilter:filter,opponentsOnly:typedDiscard[2]==='opponent',effects}]);}
 const singleDiscard=/^(That player|Target player|Target opponent) discards a card( at random)?\. If (?:the player|that player|they) can't, (.+)$/.exec(line);
 if(singleDiscard){const effects=consequenceBody(singleDiscard[3]),event=singleDiscard[1]==='That player';if(effects)return body([{action:'player-consequence-v20',who:event?'event-player':0,first:'discard',n:1,random:!!singleDiscard[2],effects}],event?[]:[h.target(singleDiscard[1].toLowerCase())]);}
 const targetDiscard=/^Any number of target opponents each discard a card\. For each of those opponents who didn't discard (?:a|an) ((?:.+? )?card(?: with mana value [0-9]+ or greater)?), (.+)$/.exec(line);
 if(targetDiscard){const filter=targetDiscard[1]&&h.target('target '+targetDiscard[1]+' from a graveyard'),effects=consequenceBody(targetDiscard[2]);if(filter&&effects)return body([{action:'player-consequence-v20',who:0,first:'discard',n:1,successFilter:filter,effects}],[{...h.target('target opponent'),min:0,unbounded:true}]);}
 const discardedTokens=/^Each player discards all the cards in their hand, then creates that many (.+? tokens)\.$/.exec(line);
 if(discardedTokens){const parsed=h.effect(card,'Create X '+discardedTokens[1]+'.');if(complete(parsed)&&!parsed.targets.length&&parsed.effects.length===1&&['token-inline','token-key'].includes(parsed.effects[0].action))return body([{action:'player-consequence-v20',who:'each-player',first:'discard',n:'all',always:true,effects:[{...parsed.effects[0],who:'result-player-v20',n:{kind:'snapshot-amount-v20'}}]}]);}
 const failedSacrifice=/^(?:(Target player|Target opponent|That player) sacrifices|Sacrifice) (?:a |an )?(.+?)\. If (?:you|they|the player|that player) can't, (.+?)(?: (?:Then )?[Rr]epeat this process for an enchantment and a planeswalker\.)?$/.exec(line);
 if(failedSacrifice){const quality=failedSacrifice[2].replace(/ of their choice$/,'').replace(/^another /,'').replace(/ other than this creature$/,''),filter=quality==='nonland, nontoken permanent'?{...h.target('target nonland permanent'),nontoken:true}:h.target('target '+quality),effects=consequenceBody(failedSacrifice[3]);if(filter?.zone==='battlefield'&&effects){const who=!failedSacrifice[1]?'you':failedSacrifice[1]==='That player'?'event-player':0,targets=typeof who==='number'?[h.target(failedSacrifice[1].toLowerCase())]:[],filters=line.includes('repeat this process')||line.includes('Repeat this process')?[filter,h.target('target enchantment'),h.target('target planeswalker')]:[filter];if(filters.every(Boolean))return body(filters.map(filter=>({action:'player-consequence-v20',who,first:'sacrifice',n:1,filter,excludeSource:/^another | other than this creature$/.test(failedSacrifice[2]),effects})),targets);}}
 const declared=/^Choose (?:a|an) (?:(nonland|creature|artifact|nonartifact, nonland) )?card name( other than a basic land card name)?(?:\. |, then )(.+)$/.exec(line);
 if(declared){
  const quality=declared[2]?'not-basic-land':declared[1]||'any',tail=declared[3][0].toUpperCase()+declared[3].slice(1),make=(effect,targets=[])=>body([{action:'named-card-v20',quality,...effect}],targets);
  const revealMatch=/^(Reveal the top card of your library|Reveal a card at random from your hand|Target opponent reveals a card at random from their hand|That player reveals their hand)\. If (?:that card has the chosen name|a card with the chosen name is revealed this way), (.+)$/.exec(tail);
  if(revealMatch){const target=revealMatch[1].startsWith('Target'),who=target?0:revealMatch[1].startsWith('That player')?'event-player':'you',zone=revealMatch[1].includes('library')?'library':'hand',random=revealMatch[1].includes('random'),discard=/^that player discards it\.$/.test(revealMatch[2]),parsed=discard?body([{action:'named-discard-v20'}]):h.effect(card,revealMatch[2][0].toUpperCase()+revealMatch[2].slice(1));if(complete(parsed)&&(!target||!parsed.targets.length))return make({mode:'check',who,zone,random,all:revealMatch[1]==='That player reveals their hand',effects:parsed.effects},target?[h.target('target opponent')]:parsed.targets);}
  const damageSearch=/^(Target player|Target opponent) reveals their hand\. (.+?) deals ([0-9]+) damage to that player for each card with the chosen name revealed this way\. Search that player's graveyard, hand, and library for all cards with that name and exile them\. That player shuffles\.$/.exec(tail);
  if(damageSearch&&(damageSearch[2]===card.name||damageSearch[2]==='This spell'))return make({mode:'search',who:0,quantity:'all',beforeHandDamage:Number(damageSearch[3])},[h.target(damageSearch[1].toLowerCase())]);
  const search=/^Search (target opponent|target player)'s graveyard, hand, and library for (all|any number of|up to four) cards with (?:that|the chosen) name and exile them\. That player shuffles(?:, then (.+))?\.$/.exec(tail);
  if(search){let handReward;if(search[3]){const reward=h.effect(card,'That player '+search[3]+'.');if(complete(reward)&&!reward.targets.length&&reward.effects.length===1&&['draw','token-inline'].includes(reward.effects[0].action)){const parsed=h.effect(card,'That player '+search[3].replace(/ for each card exiled from their hand this way$/,'')+'.');if(complete(parsed)&&parsed.effects.length===1)handReward={...parsed.effects[0],who:'named-player-v20',n:{kind:'snapshot-amount-v20',multiply:parsed.effects[0].n}};}if(!handReward&&search[3]==='draws a card for each card exiled from their hand this way')handReward={action:'draw',who:'named-player-v20',n:{kind:'snapshot-amount-v20'}};if(!handReward&&search[3]==='creates a 2/2 black Zombie creature token for each card exiled from their hand this way'){const p=h.effect(card,'Create a 2/2 black Zombie creature token.');if(complete(p))handReward={...p.effects[0],who:'named-player-v20',n:{kind:'snapshot-amount-v20'}};}if(!handReward)return null;}
   return make({mode:'search',who:0,quantity:search[2]==='all'?'all':'optional',...(search[2]==='up to four'?{max:4}:{}),...(handReward?{handReward}:{})},[h.target(search[1])]);
  }
  const discard=/^(Target player|Target opponent|That player) reveals their hand(?: and discards |\. That player discards )(all cards|a card) with that name\.(?: If they can't, you draw a card\.)?$/.exec(tail);
  if(discard){const event=discard[1]==='That player';return make({mode:'discard',who:event?'event-player':0,all:discard[2]==='all cards',drawIfNone:tail.endsWith("If they can't, you draw a card.")},event?[]:[h.target(discard[1].toLowerCase())]);}
  const mill=/^(Target opponent|Target player) mills a card\. If a card with the chosen name was milled this way, (you draw a card|you gain life equal to its mana value)\.$/.exec(tail);
  if(mill)return make({mode:'mill',who:0,reward:mill[2].includes('gain life')?'life':'draw'},[h.target(mill[1].toLowerCase())]);
  const top=/^Reveal the top (four|seven) cards of your library and put all of them with that name into your hand\. (Exile the rest|Put the rest into your graveyard)\.$/.exec(tail);
  if(top)return make({mode:'top',n:number(top[1]),rest:top[2].startsWith('Exile')?'exile':'graveyard'});
  const until=/^(?:Exile the top (six) cards of your library, then r|R)eveal cards from the top of your library until you reveal a card with (?:that|the chosen) name(?:, then put that card into your hand\. Exile all other cards revealed this way, and you lose 1 life for each of the exiled cards|\. Put that card into your hand and exile all other cards revealed this way)\.$/.exec(tail);
  if(until)return make({mode:'until',prefixExile:until[1]?6:0,losePerExiled:tail.includes('you lose 1 life')});
  const tunnel=/^(Target player|Target opponent) reveals cards from the top of their library until a card with that name is revealed\. If it is, that player puts the rest of the revealed cards into their graveyard and puts the card with the chosen name on top of their library\. Otherwise, the player shuffles\.$/.exec(tail);
  if(tunnel)return make({mode:'tunnel',who:0},[h.target(tunnel[1].toLowerCase())]);
 }
 const randomCard=/^(Target opponent|Target player|That player) reveals a card at random from their hand(?:\. ?(.*)|, then (.+))$/i.exec(line);
 if(randomCard){const actor=randomCard[1],who=/^that player$/i.test(actor)?'event-player':0;let text=randomCard[2]||randomCard[3]||'';if(randomCard[3])text='That player '+text;text=text.replace(/^(.+?) deals damage equal to (.+?) to (that player)\.$/,'$1 deals damage to $3 equal to $2.');
  const parsed=text?revealedEffectV8(card,'Reveal the top card of your library. '+text,h):{targets:[],effects:[{action:'reveal-card-v8',clauses:[]}]};
  if(complete(parsed)&&parsed.effects.length===1&&parsed.effects[0].action==='reveal-card-v8'&&!JSON.stringify(parsed).includes('revealed-move-v8')){
   const shift=who===0?1:0,clauses=bind(parsed.effects[0].clauses,node=>Object.fromEntries(Object.entries(node).map(([key,value])=>[key,['target','who','otherTarget','conditionTarget'].includes(key)?typeof value==='number'?value+shift:value==='event-player'?'bound-reveal-player-v20':value:value])));
   return body([{action:'bound-reveal-v20',who,zone:'hand',random:true,clauses}],who===0?[h.target(actor.toLowerCase()),...parsed.targets]:parsed.targets);
  }
 }
 const peekConditional=/^(Look at|Reveal) the top card of your library\. If (?:it's|it is|that card is) (?:an? )?(.+?)(?: card)?, (you may )?(reveal (?:it|that card) and )?put (?:it|that card) (into your hand|onto the battlefield(?: tapped)?)(?:\. (?:Otherwise, |If you don't put (?:it|the card) (?:into your hand|onto the battlefield), )(you may )?put (?:it|that card) (on the bottom of your library|into your graveyard|into your hand))?\.$/i.exec(line);
 if(peekConditional){const filter=h.target('target '+peekConditional[2].replace(/ card$/,'')+' card from your graveyard');if(filter)return body([{action:'inspect-top-v20',filter,reveal:peekConditional[1].toLowerCase()==='reveal',optional:!!peekConditional[3],revealSelected:!!peekConditional[4],destination:peekConditional[5].includes('hand')?'hand':'battlefield',tapped:peekConditional[5].endsWith(' tapped'),...(peekConditional[7]?{otherwise:peekConditional[7].includes('bottom')?'bottom':peekConditional[7].includes('graveyard')?'graveyard':'hand',otherwiseOptional:!!peekConditional[6]}:{})}]);}
 const damageOrder=/^(.+?) deals damage equal to (.+?) to (any target|target [^.]+|each [^.]+|that player|you)\.$/.exec(line);
 if(damageOrder&&(damageOrder[1]===card.name||/^This (?:spell|creature|artifact|enchantment|planeswalker|permanent)$/.test(damageOrder[1]))){const parsed=h.effect(card,damageOrder[1]+' deals damage to '+damageOrder[3]+' equal to '+damageOrder[2]+'.');if(complete(parsed))return parsed;}
 const retarget=/^(?:You may choose new targets for|You may change (?:any targets|the targets) of) (target .+?spell|target spell|that spell)\.$/i.exec(line);
 if(retarget){const event=/^that spell$/i.test(retarget[1]),target=event?null:h.target(retarget[1].replace(/^Target /,'target '));if(event||target?.zone==='stack')return body([{action:'retarget-stack-v20',target:target?0:'event-stack-v10',optional:true}],target?[target]:[]);}
 const controlStack=/^Gain control of (target .+?spell|target spell|that spell)\. You may choose new targets for it\.$/i.exec(line);
 if(controlStack){const target=/^that spell$/i.test(controlStack[1])?null:h.target(controlStack[1].replace(/^Target /,'target '));if(target?.zone==='stack'||/^that spell$/i.test(controlStack[1]))return body([{action:'control-stack-v20',target:target?0:'event-stack-v10',retarget:true,optional:true}],target?[target]:[]);}
 const perPlayerTargets=/^For each (opponent|player), (.+)$/.exec(line);
 if(perPlayerTargets&&/\bup to one (?:other )?target\b/.test(perPlayerTargets[2])){
  let text=perPlayerTargets[2].replace(/up to one other target/g,'another target').replace(/up to one target/g,'target').replace(/ that player controls/g,perPlayerTargets[1]==='opponent'?' an opponent controls':'').replace(/^choose /i,'').replace(/\bthose creatures\b/g,'that creature').replace(/\bUntap them\b/g,'Untap that creature').replace(/\bThey gain\b/g,'It gains').replace(/\bEach of that creature\b/g,'That creature');
  const luminate=/^exile (target .+?) and that player gains life equal to its power\.$/i.exec(text);
  let parsed=luminate?body([{action:'exile',target:0},{action:'gain-life',who:'per-player-player-v20',n:{kind:'target-stat',target:0,stat:'power'}}],[h.target(luminate[1])]):h.effect(card,text[0].toUpperCase()+text.slice(1));
  if(complete(parsed)&&parsed.targets.length===1&&parsed.targets[0]?.zone==='battlefield'&&!/event-|unbound-object/.test(JSON.stringify(parsed))){
   const effects=bind(reftarget(parsed.effects,0,'per-player-subject-v20'),node=>node.kind?.startsWith('target-')&&node.index===0?{...node,index:'per-player-subject-v20'}:node);
   const threshold=/ with mana value ([0-9]+) or (less|greater)/.exec(perPlayerTargets[2]);
   return body([{action:'per-player-targets-v20',target:0,effects}],[{...parsed.targets[0],...(threshold?{stat:'mv',threshold:Number(threshold[1]),comparison:threshold[2]}:{}),min:0,onePerPlayerV20:perPlayerTargets[1]==='opponent'?'opponents':'all'}]);
  }
 }
 const tableChoice=/^(?:Choose a (color|card type)(?:, then|\.)|You may choose a (color|card type)\. If you do,) (.+)$/.exec(line);
 if(tableChoice){
  const kind=tableChoice[1]||tableChoice[2],choices=kind==='color'?['white','blue','black','red','green']:['artifact','battle','creature','enchantment','instant','kindred','land','planeswalker','sorcery'];
  const options=choices.map(choice=>{
   let text=tableChoice[3];
   if(kind==='card type'&&/^each player sacrifices a permanent (?:of their choice )?of (?:the chosen type|that type)\.$/i.test(text))return {key:choice,label:choice[0].toUpperCase()+choice.slice(1),...body(['instant','sorcery'].includes(choice)?[]:[{action:'choose-permanents',operation:'sacrifice',n:1,filter:{what:choice,zone:'battlefield',controller:'any',min:1},who:'each-player'}])};
   if(kind==='color')text=text.replace(/(permanents?|creatures?|cards?) of (?:the chosen color|that color)/g,(_,noun)=>choice+' '+noun).replace(/(?:the chosen color|that color)/g,choice);
   else text=text.replace(/cards? of (?:the chosen type|that type)/g,noun=>choice+' '+(noun.startsWith('cards ')?'cards':'card')).replace(/permanents? (?:of their choice )?of (?:the chosen type|that type)/g,noun=>choice+(noun.startsWith('permanents ')?'s':'')+(noun.includes('of their choice')?' of their choice':''));
   const parsed=h.effect(card,text[0].toUpperCase()+text.slice(1));return complete(parsed)?{key:choice,label:choice[0].toUpperCase()+choice.slice(1),...parsed}:null;
  });
  if(options.every(Boolean)&&options.every(option=>JSON.stringify(option.targets)===JSON.stringify(options[0].targets)))return body([{action:'choice-table-v20',kind,optional:!!tableChoice[2],options:options.map(({key,label,effects})=>({key,label,effects}))}],options[0].targets);
 }
 const stackFollow=/^(Counter target .+?\.) (.+?) deals (X|[0-9]+) damage to that spell's controller\.$/.exec(line);
 const stackStat=/^(Counter target .+?\.) (.+?) deals damage equal to that spell's (power|toughness|mana value) to its controller\.$/.exec(line);
 if(stackFollow||stackStat){const match=stackFollow||stackStat,head=h.effect(card,match[1]);if([card.name,'This spell'].includes(match[2])&&complete(head)&&head.targets.length===1&&head.targets[0].zone==='stack'){const damage={action:'damage',target:{kind:'target-controller',index:0},n:stackFollow?number(match[3]):{kind:'snapshot-amount-v20'}};return body(stackStat?[{action:'snapshot-amount-v20',value:{kind:'stack-stat-v20',target:0,stat:match[3]==='mana value'?'mv':match[3]},effects:[...head.effects,damage]}]:[...head.effects,damage],head.targets);}}
 const stackAmount=/^(.+?\.) (You (?:lose|gain) life equal to that spell's mana value|Discover X, where X is that spell's mana value)\.$/.exec(line);
 if(stackAmount){const head=h.effect(card,stackAmount[1]);if(complete(head)&&head.targets.length===1&&head.targets[0].zone==='stack')return body([...head.effects,{action:stackAmount[2].startsWith('Discover')?'discover-v9':stackAmount[2].startsWith('You lose')?'lose-life':'gain-life',who:'you',n:{kind:'target-stat',target:0,stat:'mv'}}],head.targets);}
 const playerZoneCount=/^(?:You )?(gain ([0-9]+) life|draw (?:a|one) card) for each (.+?) in (target player|target opponent)'s (hand|graveyard)\.$/i.exec(line);
 if(playerZoneCount){const count=h.count(playerZoneCount[3].replace(/\bcard$/,'cards')+' in your '+playerZoneCount[5]),target=h.target(playerZoneCount[4]);if(count&&target)return body([{action:playerZoneCount[2]?'gain-life':'draw',who:'you',n:{kind:'target-count',target:0,count,multiply:Number(playerZoneCount[2]||1)}}],[target]);}
 const libraryDepth=/^Put (target .+?) into its owner's library (third|fourth|fifth) from the top\.$/i.exec(line);
 if(libraryDepth){const target=h.target(libraryDepth[1]);if(target?.zone==='battlefield')return body([{action:'move-to-library',target:0,depthV9:{third:2,fourth:3,fifth:4}[libraryDepth[2]]}],[target]);}
 const selectionFilter=quality=>{
  const colors=/^(white|blue|black|red|green) or (white|blue|black|red|green) (.+? card)$/.exec(quality);if(colors){const filters=[colors[1],colors[2]].map(color=>h.target('target '+color+' '+colors[3]+' from a graveyard'));return filters.every(Boolean)?{...h.target('target card from a graveyard'),alternatives:filters}:null;}
  const exclusions=/^((?:non(?:creature|land|artifact|enchantment)(?:,? )?)+)cards?$/.exec(quality);if(exclusions){const excludedTypes=[...exclusions[1].matchAll(/non(creature|land|artifact|enchantment)/g)].map(m=>m[1][0].toUpperCase()+m[1].slice(1));return {...h.target('target card from a graveyard'),excludedTypes};}
  if(/, .+ or /.test(quality)){const parts=quality.replace(/,? or /g,', ').split(', '),filters=parts.map(part=>h.target('target '+part+(/\bcard\b/.test(part)?'':' card')+' from a graveyard'));if(filters.every(Boolean))return {...h.target('target card from a graveyard'),alternatives:filters};return null;}
  return h.target('target '+quality.replace(/, /g,' ').replace(/\b(?:a|an) card\b/g,'card')+' from a graveyard');
 };
 const choiceEffects=text=>{const parsed=h.effect(card,text[0].toUpperCase()+text.slice(1));if(!complete(parsed)||parsed.targets.length)return null;return bind(parsed.effects,node=>Object.fromEntries(Object.entries(node).map(([key,value])=>[key,['target','who','otherTarget','conditionTarget'].includes(key)&&value==='event-player'?'zone-choice-player-v20':value])));};
 const countPhrase=text=>{if(text==='the number of creatures in your party')return {kind:'party'};const plus=/^(one|two|three|[0-9]+) plus (.+)$/.exec(text);if(plus){const count=countPhrase(plus[2]);return count?{kind:'sum',values:[number(plus[1]),count]}:null;}return h.count(text.replace(/^the number of /,''));};
 const subset=/^(Target player|Target opponent|That player) reveals (three cards from their hand|a number of cards from their hand equal to (.+?))(?:\. You choose| and you choose) (one|two) of (?:them|those cards)\. That player discards (?:that card|those cards)\.(?: (?:Then if|If) that player has more cards in hand than you, return (.+?) to its owner's hand\.)?$/i.exec(line);
 if(subset){const n=subset[3]?countPhrase(subset[3]):3,actor=subset[1];if(n&&(!subset[5]||subset[5]===card.name))return body([{action:'hand-subset-v20',who:/^that player$/i.test(actor)?'event-player':0,revealN:n,selections:[{filter:h.target('target card from a graveyard'),n:number(subset[4])}],destination:'discard',returnSelfWhenMoreHand:!!subset[5]}],/^that player$/i.test(actor)?[]:[h.target(actor.toLowerCase())]);}
 const privateMany=/^Look at (target player|target opponent)'s hand and choose (two|three|[0-9]+) cards from it\. Put them on top of that player's library in any order\.$/i.exec(line);
 if(privateMany)return body([{action:'hand-subset-v20',who:0,look:true,selections:[{filter:h.target('target card from a graveyard'),n:number(privateMany[2])}],destination:'library'}],[h.target(privateMany[1])]);
 const twoQualities=/^(Target opponent|Target player) reveals their hand\. You choose from it (?:a|an) ((?:.+? )?card with mana value [0-9]+ or (?:less|greater)) and (?:a|an) ((?:.+? )?card with mana value [0-9]+ or (?:less|greater))\. That player discards those cards\.$/i.exec(line);
 if(twoQualities){const filters=[selectionFilter(twoQualities[2]),selectionFilter(twoQualities[3])];if(filters.every(Boolean))return body([{action:'hand-subset-v20',who:0,selections:filters.map(filter=>({filter,n:1})),destination:'discard'}],[h.target(twoQualities[1].toLowerCase())]);}
 const revealedMany=/^(Target player|Target opponent|That player) reveals their hand, you choose (two|three|[0-9]+) cards from it, then that player discards those cards\.$/i.exec(line);
 if(revealedMany){const event=/^that player$/i.test(revealedMany[1]);return body([{action:'hand-subset-v20',who:event?'event-player':0,selections:[{filter:h.target('target card from a graveyard'),n:number(revealedMany[2])}],destination:'discard'}],event?[]:[h.target(revealedMany[1].toLowerCase())]);}
 const discardCountChoice=/^(Target player|Target opponent) reveals their hand, then you choose a nonland card from it for each card discarded this way\. That player discards those cards\.$/i.exec(line);
 if(discardCountChoice)return body([{action:'hand-subset-v20',who:0,selections:[{filter:selectionFilter('nonland card'),n:{kind:'snapshot-amount-v20'}}],destination:'discard'}],[h.target(discardCountChoice[1].toLowerCase())]);
 const handCount=/^(?:Reveal any number of (.+?) (?:in|from) your hand|Discard any number of cards)(?:\. |, then )(.+)$/i.exec(line);
 if(handCount){
  const discard=!handCount[1],filter=discard?h.target('target card from a graveyard'):selectionFilter(singular(handCount[1])),verb=discard?'discarded':'revealed',suffix=new RegExp(', where X is the number of cards '+verb+' this way\\.$','i'),perCard=new RegExp(' for each card '+verb+' this way\\.$','i');let text=handCount[2],parsed;
  if(suffix.test(text)){parsed=h.effect(card,text.replace(suffix,'.'));if(complete(parsed)&&!JSON.stringify(parsed.targets).includes('"X"'))parsed={...parsed,effects:JSON.parse(JSON.stringify(parsed.effects).replaceAll('"X"','{"kind":"snapshot-amount-v20"}'))};else parsed=null;}
  else if(perCard.test(text)){
   const plain=text.replace(perCard,'.'),payment=/^(Counter target .+? unless its controller pays) \{([0-9]+)\}\.$/.exec(plain);
   parsed=h.effect(card,payment?payment[1]+' {X}.':plain[0].toUpperCase()+plain.slice(1));
   if(complete(parsed)&&parsed.effects.length===1){const effect=parsed.effects[0],count={kind:'snapshot-amount-v20'};
    if(payment)effect.unlessGeneric={...count,multiply:Number(payment[2])};
    else if(['gain-life','lose-life','draw','zone-select','token-key','token-inline'].includes(effect.action)&&typeof effect.n==='number')effect.n={...count,multiply:effect.n};
    else if(['battlefield-group','pump','add-mana'].includes(effect.action)&&!effect.multiplier)effect.multiplier=count;
    else parsed=null;
   }else parsed=null;
  }else if(/\bup to that many basic land cards\b/.test(text)){parsed=h.effect(card,text.replace('up to that many basic land cards','up to X basic land cards'));if(complete(parsed))parsed={...parsed,effects:JSON.parse(JSON.stringify(parsed.effects).replaceAll('"X"','{"kind":"snapshot-amount-v20"}'))};}
  else if(discard&&/for each card discarded this way/.test(text))parsed=h.effect(card,text);
  if(filter&&complete(parsed)&&JSON.stringify(parsed.effects).includes('snapshot-amount-v20'))return body([{action:'hand-count-v20',filter,discard,effects:parsed.effects}],parsed.targets);
 }
 const revealCount=/^(Target opponent|Target player|That player) reveals their hand(?:\. | and )(.+)$/i.exec(line);
 if(revealCount&&/\b(?:cards? .+? revealed this way|cards? revealed this way)\b/.test(revealCount[2])){
  const who=/^that player$/i.test(revealCount[1])?'event-player':0,text=revealCount[2].replace(/\b(?:that player|the player)\b/g,'target player').replace(/\brevealed this way\b/g,'in your hand'),parsed=h.effect(card,text[0].toUpperCase()+text.slice(1));
  if(complete(parsed)&&parsed.targets.every(target=>target.zone==='player')&&parsed.targets.length<=1&&parsed.effects.length===1){const effect=parsed.effects[0],count=effect.n;if(count?.kind==='count'&&count.zone==='hand'&&count.controller==='you')return body([{action:'reveal-hand',who},...reftarget([{...effect,n:{kind:'target-count',target:who,count}}],0,who)],who===0?[h.target(revealCount[1].toLowerCase())]:[]);}
 }
 const privatePick=/^Look at (target opponent)'s hand and choose a card from it\. Put that card on top of that player's library\.$/i.exec(line);
 if(privatePick)return body([{action:'zone-choice-v20',who:0,lookHand:true,selections:[{zone:'hand',filter:h.target('target card from a graveyard')}],optional:false,destination:'library'}],[h.target(privatePick[1])]);
 const privateExile=/^Look at (target opponent)'s hand\. You (may )?exile (?:a|an) (.+? card) from it until (?:this creature|this artifact|this enchantment) leaves the battlefield\.$/i.exec(line);
 if(privateExile){const filter=selectionFilter(privateExile[3]);if(filter)return body([{action:'zone-choice-v20',who:0,lookHand:true,selections:[{zone:'hand',filter}],optional:!!privateExile[2],destination:'exile',untilSourceLeaves:true}],[h.target(privateExile[1])]);}
 const handTop=/^(Target player|Target opponent) reveals their hand and the top card of their library\. You choose a card revealed this way\. That player puts the chosen card on the bottom of their library\.$/i.exec(line);
 if(handTop)return body([{action:'zone-choice-v20',who:0,revealHand:true,revealTop:1,selections:[{zone:'hand',filter:h.target('target card from a graveyard')},{zone:'library',top:1,filter:h.target('target card from a graveyard')}],optional:false,destination:'library',toBottom:true}],[h.target(handTop[1])]);
 line=line.replace(/^((?:Target opponent|Target player|That player) reveals their hand) and you (choose .+)$/i,'$1. You $2');
 const handHead=/^(Target opponent|Target player|That player) reveals their hand\. You (may )?choose (?:a|an) (.+?) from it\. (.+)$/i.exec(line);
 const mixedHand=/^(Target opponent|Target player) reveals their hand\. You choose (?:a|an) (.+?) from that player's graveyard or hand and exile it\.(?: (.+))?$/i.exec(line);
 const remorse=/^(Target opponent|Target player) reveals their hand\. You choose (?:a|an) (.+?) from it or a card from their graveyard\. Exile that card\.(?: (.+))?$/i.exec(line);
 if(handHead||mixedHand||remorse){
  const match=handHead||mixedHand||remorse,actor=match[1],who=/^that player$/i.test(actor)?'event-player':0,optional=!!handHead?.[2],quality=handHead?match[3]:match[2],filter=selectionFilter(quality);
  const movement=handHead&&/^(?:If you do, )?(?:(?:that player|they) (discards|exiles) (?:that card|it)|Exile that card)\.(?: (.+))?$/i.exec(match[4]);
  const lifeFirst=handHead&&/^You gain life equal to that creature card's toughness, then that player discards that card\.$/i.test(match[4]),untilLeaves=handHead&&/^Exile that card until (?:this creature|this artifact|this enchantment) leaves the battlefield\.$/i.test(match[4]),library=handHead&&/^That player puts that card into their library (third|fourth|fifth) from the top\.$/i.exec(match[4]);
  if(filter&&(!handHead||movement||lifeFirst||untilLeaves||library)){
   const destination=library?'library':lifeFirst||handHead&&movement?.[1]?.toLowerCase()==='discards'?'discard':'exile',tail=handHead?movement?.[2]:match[3],selections=[{zone:'hand',filter},...(!handHead?[{zone:'graveyard',filter:remorse?h.target('target card from a graveyard'):filter}]:[])];
   let follow={},valid=true;
   if(tail){
    const otherwise=/^(?:If you don't|Otherwise), (.+)$/.exec(tail),permission=/^You may cast that card for as long as it remains exiled(?:, and you may spend mana as though it were mana of any color to cast that spell)?\.$/.test(tail);
    const small=/^If the card's mana value is ([0-9]+) or less, (.+)$/.exec(tail),flash=/^If an instant card or a card with flash is exiled this way, (.+?) Otherwise, (.+)$/.exec(tail);
    if(otherwise&&optional){const effects=choiceEffects(otherwise[1]);if(effects)follow.elseEffects=effects;else valid=false;}
    else if(permission&&destination==='exile')follow.play={anyColor:tail.includes('any color')};
    else if(small||flash){const yes=choiceEffects((small||flash)[small?2:1]),no=flash&&choiceEffects(flash[2]);if(yes&&(!flash||no))follow.afterChoice={...(small?{mvMax:Number(small[1])}:{instantOrFlash:true}),effects:yes,...(no?{elseEffects:no}:{})};else valid=false;}
    else {const effects=choiceEffects(tail);if(effects&&!/event-|unbound-object/.test(JSON.stringify(effects)))follow.effects=effects;else valid=false;}
   }
   if(valid)return body([{action:'zone-choice-v20',who,revealHand:true,selections,optional,destination,...(lifeFirst?{beforeEffects:[{action:'gain-life',who:'you',n:{kind:'target-stat',target:'zone-choice-card-v20',stat:'toughness'}}]}:{}),...(untilLeaves?{untilSourceLeaves:true}:{}),...(library?{depthV9:{third:2,fourth:3,fifth:4}[library[1]]}:{}),...follow}],who===0?[h.target(actor.toLowerCase())]:[]);
  }
 }
 const ownChoice=/^(You may put|Put|Exile) (?:a|an) (.+? card) from your (hand or graveyard|graveyard or hand|hand)(?: onto the battlefield( tapped)?)?\.$/i.exec(line);
 if(ownChoice){const exile=ownChoice[1].toLowerCase()==='exile',filter=selectionFilter(ownChoice[2]);if(filter&&(exile||line.includes('onto the battlefield')))return body([{action:'zone-choice-v20',who:'you',selections:ownChoice[3].split(' or ').map(zone=>({zone,filter})),optional:ownChoice[1].startsWith('You'),destination:exile?'exile':'battlefield',tapped:!!ownChoice[4]}]);}
 if(line==='You get an emblem with "You have no maximum hand size.".')return body([{action:'hand-limit-emblem-v20'}]);
 const objectCondition=/^(.+?\.) (If (?:it(?:'s)?|that creature|that artifact|that permanent)\b.+)$/.exec(line);
 if(objectCondition){const head=h.effect(card,objectCondition[1]),tail=h.effect(card,objectCondition[2]);if(complete(head)&&complete(tail)&&head.targets.length===1&&head.targets[0].zone==='battlefield'&&!tail.targets.length&&tail.effects[0]?.action==='conditional'&&tail.effects[0].conditionTarget===undefined){let effects=bindPronouns(tail.effects,0);effects[0]={...effects[0],conditionTarget:0};if(/\bit becomes\b/.test(objectCondition[2]))effects=bind(effects,node=>node.action==='animate'&&node.target==='self'?{...node,target:0}:node);if(!/event-|unbound-object/.test(JSON.stringify(effects)))return body([...head.effects,...effects],head.targets);}}
 const counterVigilance=/^Put a \+1\/\+1 counter on each creature you control\. Those creatures gain (.+) until end of turn\.$/i.exec(line);
 if(counterVigilance){const keywords=h.keywordList(counterVigilance[1]);if(keywords?.length)return body([{action:'controller-group-v20',who:'you',filter:h.target('target creature'),effects:[{action:'counter',target:'controller-group-subject-v20',counter:'+1/+1',n:1},{action:'pump',target:'controller-group-subject-v20',power:0,toughness:0,keywords}]}]);}
 const exchangeHand=/^Exchange your hand and library, then shuffle\.(?: (.+))?$/.exec(line);
 if(exchangeHand){const after=exchangeHand[1]?h.effect(card,exchangeHand[1]):body([]);if(complete(after)&&!after.targets.length)return body([{action:'exchange-shuffle-v20',zones:['hand','library']},...after.effects]);}
 const handShuffle=/^(Shuffle (the cards|any number of cards) from your hand into your library|Each player shuffles the cards from their hand into their library), then draws? that many cards(?: plus (one|two|three|[0-9]+))?\.$/i.exec(line);
 const handBottom=/^(Put (the cards in|any number of cards from) your hand on the bottom of your library(?: in any order)?|That player puts the cards (?:from|in) their hand on the bottom of their library in any order), then draws? that many cards(?: plus (one|two|three|[0-9]+))?\.$/i.exec(line);
 const handExile=/^Exile all the cards from your hand, then draw that many cards\. Until the end of your next turn, you may play cards exiled this way\.$/i.test(line);
 if(handShuffle||handBottom||handExile){const match=handShuffle||handBottom;return body([{action:'hand-redraw-v20',who:handExile?'you':/^each/i.test(match[1])?'each-player':/^that/i.test(match[1])?'event-player':'you',selection:/^any/i.test(match?.[2]||'')?'any':'all',destination:handExile?'exile':handShuffle?'shuffle':'bottom',bonus:match?.[3]?number(match[3]):0,...(handExile?{playNextTurn:true}:{})}]);}
 const optional=/^You may ([^."\n]+)\.$/i.exec(line);
 if(optional){const parsed=h.effect(card,optional[1][0].toUpperCase()+optional[1].slice(1)+'.');if(complete(parsed)&&parsed.effects.length)return body([{action:'optional-effect-v20',effects:parsed.effects}],parsed.targets);}
 const namedToken=/^([Cc]reate .+? creature tokens?(?: with [^."\n]+?)?) named ([A-Z][A-Za-z0-9'-]*(?: (?:[A-Z][A-Za-z0-9'-]*|of|the|and|to))*)( that's tapped and attacking)?\.$/.exec(line);
 if(namedToken){const text=namedToken[3]?namedToken[1].replace(/^(Create \S+) /i,'$1 tapped and attacking '):namedToken[1],parsed=h.effect(card,text+'.');if(complete(parsed)&&!parsed.targets.length&&parsed.effects.length===1&&parsed.effects[0].action==='token-inline')return {...parsed,effects:[{...parsed.effects[0],token:{...parsed.effects[0].token,name:namedToken[2]}}]};}
 const searchDiscard=/^(Search your library for a card, put it into your hand), shuffle, then (discard a card at random)\.$/i.exec(line);
 if(searchDiscard){const parsed=h.effect(card,searchDiscard[1]+', then shuffle. Discard a card at random.');if(complete(parsed))return parsed;}
 const exileChoice=/^Exile the top (two|three|four|five|[0-9]+) cards of your library\. Choose one of them\. (?:Until (the end of your next turn|your next end step), you may play that card|You may play that card (this turn|until the end of your next turn))\.$/i.exec(line);
 if(exileChoice&&exileChoice[2]!=='your next end step')return body([{action:'exile-choice-v20',n:number(exileChoice[1].toLowerCase()),nextOwnTurn:!!exileChoice[2]||exileChoice[3]!=='this turn'}]);
 const futurePrefix=/^At the beginning of (the next end step|the next upkeep|your next upkeep), (.+)$/i.exec(line);
 const futureSuffix=/^((?:Draw|Create|Destroy all|Target player draws|Target opponent draws|You gain) [^.\n]+) at the beginning of (the next end step|the next turn's upkeep|your next upkeep)\.$/i.exec(line);
 if(futurePrefix||futureSuffix){
  const raw=futurePrefix?futurePrefix[2]:futureSuffix[1]+'.',when=futurePrefix?futurePrefix[1]:futureSuffix[2],parsed=h.effect(card,raw[0].toUpperCase()+raw.slice(1));
  if(complete(parsed)&&!/"(?:event-[^"]*|unbound-object-v10)"|delay-effect-v20/.test(JSON.stringify(parsed)))return body([{action:'delay-effect-v20',event:when.includes('end step')?'endStep':'upkeep',own:when.startsWith('your'),body:futurePrefix?parsed:{...parsed,targets:[]},captureTargets:!!futureSuffix}],futureSuffix?parsed.targets:[]);
 }
 const createdDelay=/^(.+?\.) (Sacrifice|Destroy|Exile) (it|them|that token|those tokens|the token|that creature) (?:at the beginning of (the next end step|the next cleanup step)|at end of combat)\.$/i.exec(line);
 if(createdDelay){
  const head=h.effect(card,createdDelay[1]);
  if(complete(head)){
   const created=head.effects.some(e=>['token-key','token-inline','copy-token-v8'].includes(e.action));
   if(created&&!head.targets.length||!created&&head.targets.length===1&&head.targets[0].zone==='battlefield')return body([...head.effects,{action:'delay-subject-v20',target:created?'created-tokens':0,operation:createdDelay[2].toLowerCase(),event:createdDelay[4]==='the next cleanup step'?'cleanupStep':createdDelay[4]?'endStep':'endCombat'}],head.targets);
  }
 }
 const lastingKeywords=/^(It|They|That creature|Those creatures|That token|Those tokens) gains? (.+)\.$/i.exec(line);
 if(lastingKeywords){const keywords=h.keywordList(lastingKeywords[2]);if(keywords?.length)return body([{action:'base-pt',target:'unbound-object-v10',keywords,temporary:false}]);}
 const selfLibrary=/^Put this (?:creature|artifact|enchantment|permanent) (?:on (top|the bottom) of|into) its owner's library\.$/i.exec(line);
 if(selfLibrary)return body([{action:'move-to-library',target:'self',...(selfLibrary[1]==='the bottom'?{bottom:true}:{})}]);
 const selfShuffle=/^(?:This (?:creature|artifact|enchantment|permanent)'s owner shuffles (?:it|this (?:creature|artifact|enchantment|permanent))|Shuffle this (?:creature|artifact|enchantment|permanent)) into (?:their|its owner's) library\.$/i.exec(line);
 if(selfShuffle)return body([{action:'move-to-library',target:'self',shuffleAfter:true}]);
 const targetShuffle=/^(Target player|Target opponent) shuffles(?: their library)?\.$/.exec(line);
 if(targetShuffle)return body([{action:'shuffle-library-v9',who:0}],[h.target(targetShuffle[1].toLowerCase())]);
 const controllerGroup=/^((?:[A-Z][a-z-]+ )?(?:[Cc]reatures|[Aa]rtifacts|[Ll]ands|[Pp]ermanents|[Ee]nchantments)) (target player|target opponent) controls (.+)$/.exec(line);
 const controllerVerb=/^(Tap|Untap|Exile|Destroy|Gain control of) all (.+?) (target player|target opponent) controls\.$/.exec(line);
 if(controllerGroup||controllerVerb){
  const who=h.target((controllerGroup||controllerVerb)[controllerGroup?2:3]);
  const text=controllerGroup?'Target '+singular(controllerGroup[1].toLowerCase())+' '+controllerGroup[3].replace(/^(get|gain|lose|attack)\b/,s=>s+'s').replace(/^are\b/,'is').replace(/\. (Untap|Tap) them\.$/,'. $1 that creature.'):(controllerVerb[1]+' target '+singular(controllerVerb[2]).replace(' and ',' or ')+'.');
  const parsed=h.effect(card,text);
  if(who&&complete(parsed)&&parsed.targets.length===1&&parsed.targets[0].zone==='battlefield'&&parsed.targets[0].controller==='any'&&parsed.effects.every(e=>['pump','tap','untap','combat-restriction','gain-control','exile','destroy','move-to-hand','base-pt','counter'].includes(e.action))&&!/target-stat|target-count|snapshot-amount-v20/.test(JSON.stringify(parsed.effects)))return body([{action:'controller-group-v20',who:0,filter:parsed.targets[0],effects:parsed.effects.map(e=>({...e,target:e.target===0?'controller-group-subject-v20':e.target}))}],[who]);
 }
 const removeCounters=/^Remove up to (one|two|three|four|five|[0-9]+) counters? from (target .+?)\.$/.exec(line);
 if(removeCounters){const target=h.target(removeCounters[2]);if(target?.zone==='battlefield')return body([{action:'remove-counters-v8',target:0,n:number(removeCounters[1]),upToV17:true}],[target]);}
 const graveX=/^Exile up to X target cards from graveyards\.$/.test(line);
 if(graveX)return body([{action:'exile',target:0}],[{...h.target('target card from a graveyard'),min:0,max:0,targetCountX:true}]);
 const untapGroup=/^Creatures don't untap during (target player|target opponent)'s next untap step\.$/.exec(line);
 if(untapGroup)return body([{action:'skip-untap-group-v12',who:0,filters:[h.target('target creature')]}],[h.target(untapGroup[1])]);
 if(line==='All creatures lose all abilities until end of turn.')return body([{action:'ability-loss-v8',keywords:[],temporary:true,filters:[h.target('target creature')]}]);
 const ownerLibrary=/^(Target .+?)'s owner (puts it on their choice of the top or bottom of their library|shuffles it into their library)\.$/.exec(line);
 if(ownerLibrary){const target=h.target(ownerLibrary[1][0].toLowerCase()+ownerLibrary[1].slice(1));if(target?.zone==='battlefield')return body([{action:ownerLibrary[2].startsWith('puts')?'owner-library-choice':'move-to-library',target:0,...(ownerLibrary[2].startsWith('shuffles')?{shuffleAfter:true}:{})}],[target]);}
 const halfZone=/^(Target player|Target opponent) (sacrifices half the creatures they control|discards half the cards in their hand), rounded (up|down)\.$/.exec(line);
 if(halfZone){const sacrifice=halfZone[2].startsWith('sacrifices'),n={kind:'fraction-v9',value:{kind:'target-count',target:0,count:h.count(sacrifice?'creatures you control':'cards in your hand')},denominator:2,round:halfZone[3]};return body([sacrifice?{action:'choose-permanents',who:0,operation:'sacrifice',filter:h.target('target creature'),n}:{action:'discard',who:0,n}],[h.target(halfZone[1].toLowerCase())]);}
 const redrawOpponent=/^Discard your hand, then draw cards equal to the number of cards in (target opponent|target player)'s hand\.$/.exec(line);
 if(redrawOpponent)return body([{action:'discard-hand',who:'you'},{action:'draw',who:'you',n:{kind:'target-count',target:0,count:h.count('cards in your hand')}}],[h.target(redrawOpponent[1])]);
 if(line==='Discard your hand, then draw cards equal to the number of cards discarded this way.')return body([{action:'discard-hand-draw',who:'you',n:'discarded'}]);
 const exploreTwice=/^(Target .+?) explores, then it explores again\.$/.exec(line);
 if(exploreTwice){const parsed=h.effect(card,exploreTwice[1]+' explores.');if(complete(parsed)&&parsed.effects.length===1&&parsed.effects[0].action==='explore')return {...parsed,effects:[{...parsed.effects[0],n:2}]};}
 const scryTarget=/^(Target player|Target opponent) scries (X|[0-9]+), then draws a card\.$/.exec(line);
 if(scryTarget)return body([{action:'scry',who:0,n:number(scryTarget[2])},{action:'draw',who:0,n:1}],[h.target(scryTarget[1].toLowerCase())]);
 const chosen=/^Choose (?:a|an) (.+? you control)\. (It .+)$/.exec(line);
 if(chosen){const filter=h.target('target '+chosen[1]),parsed=h.effect(card,chosen[2]);if(filter?.zone==='battlefield'&&complete(parsed)&&!parsed.targets.length){const effects=bindPronouns(parsed.effects,0,{stats:true});if(!/event-|unbound-object/.test(JSON.stringify(effects)))return body([{action:'choose-source-v20',filter,effects}]);}}
 const reflexive=/^Sacrifice this (?:creature|artifact|enchantment|permanent)\. When you do, (.+)$/.exec(line);
 if(reflexive){const parsed=h.effect(card,reflexive[1][0].toUpperCase()+reflexive[1].slice(1));if(complete(parsed)&&!JSON.stringify(parsed).includes('self-reflexive-v20'))return body([{action:'self-reflexive-v20',body:parsed}]);}
 const exileReflexive=/^Exile (target card from (?:your|a) graveyard)\. When a creature card is exiled this way, (.+)$/.exec(line);
 if(exileReflexive){const target=h.target(exileReflexive[1]),parsed=h.effect(card,exileReflexive[2][0].toUpperCase()+exileReflexive[2].slice(1));if(target&&complete(parsed))return body([{action:'exile-reflexive-v20',target:0,exileEffect:{action:'linked-exile',target:0,from:'graveyard',link:'permanent-abilities-v20'},body:parsed}],[target]);}
 const dice=/^(.*?)\b[Rr]oll a d20\. ((?:[0-9]+(?:[—–-][0-9]+)? \| ).+)$/.exec(line);
 if(dice){
  const header=dice[1],choice=/^Choose (target .+?), then $/.exec(header),selected=choice&&h.target(choice[1]);
  const first=selected?body([],[selected]):header?h.effect(card,header.trim()):body([]),parts=dice[2].split(/ (?=[0-9]+(?:[—–-][0-9]+)? \| )/),branches=[];
  let next=1,okay=complete(first)&&first.targets.length<=1;
  for(const part of parts){if(!okay)break;const m=/^([0-9]+)(?:[—–-]([0-9]+))? \| (.+)$/.exec(part);if(!m){okay=false;break;}const min=Number(m[1]),max=Number(m[2]||m[1]),parsed=h.effect(card,m[3]);if(min!==next||max<min||max>20||!complete(parsed)||parsed.targets.length){okay=false;break;}next=max+1;branches.push({min,max,effects:first.targets.length?bindPronouns(parsed.effects,0,{stats:true}):parsed.effects});}
  if(okay&&next===21)return body([...first.effects,{action:'roll-table-v20',sides:20,branches}],first.targets);
 }
 const rolledResult=/^Roll a (d20|six-sided die)\. (.+?)(?: equal to the result|, where X is the result)\.$/.exec(line);
 if(rolledResult){let text=rolledResult[2].replace(/^You create a number of /,'Create X ').replace(/^Draw cards$/,'Draw X cards').replace(/^You gain life$/,'You gain X life');const parsed=h.effect(card,text+'.');if(complete(parsed)&&!parsed.targets.length&&JSON.stringify(parsed.effects).includes('"X"'))return body([{action:'roll-value-v20',sides:rolledResult[1]==='d20'?20:6,effects:bind(parsed.effects,x=>x),valueEffectsV20:true}].map(e=>({...e,effects:JSON.parse(JSON.stringify(e.effects).replaceAll('"X"','{"kind":"snapshot-amount-v20"}'))})));}
 const delayedDeath=/^(?:(.+?\.) )?When (target creature(?: you control)?|that creature|it) dies( under your control)? this turn, (.+)$/.exec(line);
 if(delayedDeath){
  const head=delayedDeath[1]?h.effect(card,delayedDeath[1]):null,target=delayedDeath[2].startsWith('target ')?h.target(delayedDeath[2]):head?.targets?.[0];
  const tail=delayedDeath[4],returned=/^return (?:that card|it) to the battlefield under its owner's control\.$/i.test(tail);
  const exileGrave=/^exile its controller's graveyard\.$/i.test(tail),burnController=new RegExp('^'+card.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+' deals ([0-9]+) damage to the creature\'s controller\\.$').exec(tail);
  const parsed=returned?body([{action:'death-return-v20'}]):exileGrave?body([{action:'zone-select',who:{kind:'target-controller',index:0},zone:'graveyard',filter:h.target('target card from a graveyard'),n:'all',destination:'exile'}]):burnController?body([{action:'damage',target:{kind:'target-controller',index:0},n:Number(burnController[1])}]):h.effect(card,tail[0].toUpperCase()+tail.slice(1));
  if(target?.zone==='battlefield'&&(!head||complete(head)&&head.targets.length===1)&&complete(parsed)&&!parsed.targets.length){
   const effects=bindPronouns(parsed.effects,0,{stats:true});
   if(!/event-|unbound-object/.test(JSON.stringify(effects)))return body([...(head?.effects||[]),{action:'target-dies-v20',target:0,underYou:!!delayedDeath[3],effects}],head?.targets||[target]);
  }
 }
 const namedDelay=/^(.+?\.) (Sacrifice|Exile|Return) (?:that creature|it) (at the beginning of the next end step|to its owner's hand at the beginning of (?:the next|your next) end step)\.$/.exec(line);
 if(namedDelay){const head=h.effect(card,namedDelay[1]);if(complete(head)&&head.targets.length===1&&(head.targets[0].zone==='battlefield'||head.targets[0].zone==='graveyard'&&head.effects.some(e=>e.action==='reanimate'&&e.target===0)))return body([...head.effects,{action:'delay-subject-v20',target:0,operation:namedDelay[2].toLowerCase(),event:'endStep',player:namedDelay[3].includes('your next')?'you':undefined}],head.targets);}
 if(/^Then [a-zA-Z]/.test(line)){const text=line.slice(5),parsed=h.effect(card,text[0].toUpperCase()+text.slice(1));if(complete(parsed))return parsed;}
 // Oracle's comma-then has the same sequential semantics as two sentences.
 // Quoted abilities and library/search instructions own their commas.
 if(/, then /.test(line)&&!/["\n]/.test(line)&&!/^(?:Search|Look at|Reveal|Put|Return .* from|Target .* reveals)/.test(line)){
  const revised=line.replace(/, then ([a-z])/g,(_,first)=>'. '+first.toUpperCase());
  if(revised!==line){const parsed=h.effect(card,revised);if(complete(parsed)&&!JSON.stringify(parsed).includes('event-amount'))return parsed;}
 }
 const scalar=/^((?:Target player|Target opponent) (?:draws|gains|loses|mills|discards) .+?), then (.+)\.$/.exec(line);
 if(scalar&&!/that many/.test(line)){
  const parsed=h.effect(card,scalar[1]+'. '+scalar[2][0].toUpperCase()+scalar[2].slice(1)+'.');if(complete(parsed))return parsed;
 }
 const elapsed=/^(.+?)\. (Each other creature|Other creatures|Each creature|Creatures) that player controls (.+)\.$/.exec(line);
 if(elapsed){
  const head=h.effect(card,elapsed[1]+'.'),tail=h.effect(card,(elapsed[2].startsWith('Each')?'Each creature':'Creatures')+' you control '+elapsed[3]+'.');
  if(complete(head)&&head.targets.length===1&&head.effects.length&&complete(tail)&&!tail.targets.length&&tail.effects.length===1){
   const effect=tail.effects[0],target=head.targets[0],who=target.zone==='player'?0:{kind:'target-controller',index:0};
   if(['player','battlefield'].includes(target.zone)&&(effect.action==='pump-group'||effect.action==='battlefield-group'&&effect.operation==='pump'))return body([...head.effects,{action:'player-group-v20',who,excludeTarget:/other/.test(elapsed[2])?0:undefined,effect:effect.action==='pump-group'?{...effect,action:'battlefield-group',operation:'pump',filters:[h.target('target creature')]}:{...effect,filters:effect.filters.map(f=>({...f,controller:'any'}))}}],head.targets);
  }
 }
 const untapSteal=/^Untap (target .+?) and gain control of it until end of turn\. That creature gains haste until end of turn\.$/.exec(line);
 if(untapSteal){const target=h.target(untapSteal[1]);if(target?.zone==='battlefield')return body([{action:'untap',target:0},{action:'gain-control',target:0,temporary:true},{action:'pump',target:0,power:0,toughness:0,keywords:['haste']}],[target]);}
 const boundDamage=/^(Target creature(?: you control| an opponent controls)?) deals damage equal to its power to (another target creature that player controls)\.$/.exec(line);
 if(boundDamage)return body([{action:'bite',target:0,otherTarget:1,stat:'power'}],[h.target(boundDamage[1].toLowerCase()),{...h.target('target creature'),differentFromPrevious:true,sameControllerAsV20:0}]);
 const counterLife=/^Counter (target .+? spell)\. Its controller gains life equal to its mana value\.$/.exec(line);
 if(counterLife){const target=h.target(counterLife[1]);if(target?.zone==='stack')return body([{action:'counter-spell',target:0},{action:'gain-life',who:{kind:'target-controller',index:0},n:{kind:'target-stat',target:0,stat:'mv'}}],[target]);}
 const backlash=/^Tap (target untapped creature(?: you control)?)\. That creature deals damage equal to its power to its controller\.$/.exec(line);
 if(backlash)return body([{action:'tap',target:0},{action:'bite',target:0,otherTarget:{kind:'target-controller',index:0},stat:'power'}],[h.target(backlash[1])]);
 const controllerBurn=/^(.+) deals (X|[0-9]+) damage to (target .+?) and (X|[0-9]+) damage to that (?:creature|permanent)'s controller\.$/.exec(line);
 if(controllerBurn&&[card.name,'This creature','This artifact','This permanent'].includes(controllerBurn[1])){const target=h.target(controllerBurn[3]);if(target?.zone==='battlefield')return body([{action:'damage-batch',hits:[{target:0,n:number(controllerBurn[2])},{target:{kind:'target-controller',index:0},n:number(controllerBurn[4])}]}],[target]);}
 const statBurn=/^(.+) deals damage to target spell's controller equal to that spell's mana value\.$/.exec(line);
 if(statBurn&&[card.name,'This creature','This permanent'].includes(statBurn[1]))return body([{action:'damage',target:{kind:'target-controller',index:0},n:{kind:'target-stat',target:0,stat:'mv'}}],[h.target('target spell')]);
 const redraw=/^(Target player|Target opponent) draws cards equal to the number of cards in their hand, then discards that many cards\.$/.exec(line);
 if(redraw)return body([{action:'snapshot-amount-v20',value:{kind:'target-count',target:0,count:h.count('cards in your hand')},effects:[{action:'draw',who:0,n:{kind:'snapshot-amount-v20'}},{action:'discard',who:0,n:{kind:'snapshot-amount-v20'}}]}],[h.target(redraw[1].toLowerCase())]);
 const discardBonus=/^Discard all the cards in your hand, then draw that many cards plus (one|two|three|[0-9]+)\.$/.exec(line);
 if(discardBonus)return body([{action:'discard-hand-draw',who:'you',n:'discarded',adjustV15:number(discardBonus[1])}]);
 const resultWording=line.replace(/creature cards? put into (?:your|their) graveyard this way/g,'creature card milled this way');
 if(resultWording!==line&&/^.*\bmills? (?:X|a|one|two|three|four|five|six|seven|eight|nine|ten|[0-9]+) cards?\./i.test(line)){const parsed=h.effect(card,resultWording);if(complete(parsed))return parsed;}
 const returnKinds=/^Return (?:a|an) (.+?) card from your graveyard to your hand, then do the same for (.+)\.$/.exec(line);
 if(returnKinds){const types=[returnKinds[1],...returnKinds[2].split(/,? and |, /)],filters=types.map(type=>h.target('target '+type+' card from your graveyard'));if(filters.every(f=>f?.zone==='graveyard'))return body(filters.map(filter=>({action:'zone-select',who:'you',zone:'graveyard',filter,n:1,destination:'hand'})));}
 const graveTypes=/^Return (?:a|an) (.+?) card and (?:a|an) (.+?) card from your graveyard to your hand\.$/.exec(line);
 if(graveTypes){const filters=[graveTypes[1],graveTypes[2]].map(type=>h.target('target '+type+' card from your graveyard'));if(filters.every(f=>f?.zone==='graveyard'))return body(filters.map(filter=>({action:'zone-select',who:'you',zone:'graveyard',filter,n:1,destination:'hand'})));}
 const allGraves=/^Return all (.+? cards) from (?:all )?graveyards to (?:the battlefield( tapped)? under their owners' control|their owners' hands)\.$/.exec(line);
 if(allGraves){const filter=h.target('target '+singular(allGraves[1])+' from a graveyard');if(filter?.zone==='graveyard')return body([{action:'zone-select',who:'each-player',zone:'graveyard',filter,n:'all',destination:line.includes('battlefield')?'battlefield':'hand',controller:'owner',tapped:!!allGraves[2]}]);}
 const groupSplit=/^Return all creatures on the battlefield and all creature cards in graveyards to their owners' hands\.$/.test(line);
 if(groupSplit)return body([{action:'battlefield-group',operation:'bounce',filters:[h.target('target creature')]},{action:'zone-select',who:'each-player',zone:'graveyard',filter:h.target('target creature card from a graveyard'),n:'all',destination:'hand'}]);
 const lifeSac=/^(Target player|Target opponent) sacrifices a creature(?: of their choice)?, then gains life equal to that creature's toughness\.$/.exec(line);
 if(lifeSac)return body([{action:'sacrifice-stat-v20',who:0,filter:h.target('target creature'),stat:'toughness',effect:{action:'gain-life',who:0,n:{kind:'snapshot-amount-v20'}}}],[h.target(lifeSac[1].toLowerCase())]);
 const randomOrder=/^Return a card at random from your graveyard to your hand, then reorder your graveyard as you choose\.$/.test(line);
 if(randomOrder)return body([{action:'zone-random-v14',who:'you',zone:'graveyard',destination:'hand',n:1},{action:'order-graveyard-v20'}]);
 const chooseBite=/^Choose (?:a|an) (.+? you control)\. It deals damage equal to its (power|toughness) to (target .+?)\.$/.exec(line);
 if(chooseBite){const filter=h.target('target '+chooseBite[1]),target=h.target(chooseBite[3]);if(filter?.zone==='battlefield'&&target)return body([{action:'choose-source-v20',filter,effects:[{action:'bite',target:0,otherTarget:1,stat:chooseBite[2]}]}],[target]);}
 const chosenCounter=/^Put (.+? counters?) on (?:a|an) (.+? you control)\.(?: (.+))?$/.exec(line);
 if(chosenCounter){const filter=h.target('target '+chosenCounter[2]),first=filter&&h.effect(card,'Put '+chosenCounter[1]+' on target '+chosenCounter[2]+'.'),second=chosenCounter[3]?h.effect(card,chosenCounter[3]):body([]);
  if(filter?.zone==='battlefield'&&complete(first)&&first.targets.length===1&&first.effects.length===1&&first.effects[0].action==='counter'&&complete(second)&&!second.targets.length){const follow=bindPronouns(second.effects,0);if(!/event-|unbound-object/.test(JSON.stringify(follow)))return body([{action:'choose-source-v20',filter,effects:[...first.effects,...follow]}]);}
 }
 const eachHand=/^(Each player|Each opponent|Target player|Target opponent) reveals their hand(?: and|\.) (?:That player |They |You )?discards? all (.+? cards)\.$/.exec(line);
 if(eachHand){const target=eachHand[1].startsWith('Target')?h.target(eachHand[1].toLowerCase()):null,filter=h.target('target '+singular(eachHand[2])+' from your graveyard');if(filter){const who=target?0:eachHand[1]==='Each player'?'each-player':'each-opponent';return body([{action:'reveal-discard-v20',who,filter}],target?[target]:[]);}}
 const perPlayer=/^(Each opponent|Each player) sacrifices (?:a|an) (.+?) and (?:a|an) (.+?)(?: of their choice)?\.$/.exec(line);
 if(perPlayer){const filters=perPlayer.slice(2).map(quality=>h.target('target '+quality));if(filters.every(f=>f?.zone==='battlefield'))return body([{action:'sacrifice-categories-v20',who:perPlayer[1]==='Each player'?'each-player':'each-opponent',filters}]);}
 const groupPlayer=/^(Target player|Target opponent) sacrifices (?:a|an) (.+?) and (?:a|an) (.+?)(?: of their choice)?\.$/.exec(line);
 if(groupPlayer){const filters=groupPlayer.slice(2).map(quality=>h.target('target '+quality));if(filters.every(f=>f?.zone==='battlefield'))return body([{action:'sacrifice-categories-v20',who:0,filters}],[h.target(groupPlayer[1].toLowerCase())]);}
 const chosenNumber=/^Choose a number between ([0-9]+) and ([0-9]+)\. Each player sacrifices that many creatures(?: of their choice)?\.$/.exec(line);
 if(chosenNumber&&Number(chosenNumber[2])<=30)return body([{action:'choose-number-v20',min:Number(chosenNumber[1]),max:Number(chosenNumber[2]),effects:[{action:'choose-permanents',who:'each-player',operation:'sacrifice',filter:h.target('target creature'),n:{kind:'snapshot-amount-v20'}}]}]);
 const payEach=/^For each (creature|land|artifact|Spirit), (its controller sacrifices it unless they pay (X|[0-9]+) life|return it to its owner's hand unless that player pays (\{[0-9WUBRGC]+\}))\.$/.exec(line);
 if(payEach)return body([{action:'each-unless-v20',filter:h.target('target '+payEach[1]),payment:payEach[3]?{life:number(payEach[3])}:{mana:payEach[4]},operation:payEach[3]?'sacrifice':'bounce'}]);
 const anyPay=/^Unless any player pays (\{[0-9WUBRGC]+\}), (.+)\.$/.exec(line);
 if(anyPay){const parsed=h.effect(card,anyPay[2][0].toUpperCase()+anyPay[2].slice(1)+'.');if(complete(parsed))return {...parsed,effects:[{action:'any-pay-v20',cost:anyPay[1],effects:parsed.effects}]};}
 const theyDiscard=/^(.+? damage to each opponent)\. Those players each discard (one|two|three|[0-9]+) cards at random\.$/.exec(line);
 if(theyDiscard){const head=h.effect(card,theyDiscard[1]+'.');if(complete(head)&&!head.targets.length)return body([...head.effects,{action:'player-sequence-v9',who:'each-opponent',effects:[{action:'discard',who:0,n:number(theyDiscard[2]),random:true}]}]);}
 const multipleBite=/^(Up to two|Two) target creatures you control each deal damage equal to their power to (another target creature|target creature(?: an opponent controls)?)\.$/.exec(line);
 if(multipleBite)return body([{action:'multiple-bite-v20',target:0,otherTarget:1}],[{...h.target('target creature you control'),min:multipleBite[1]==='Two'?2:0,max:2},{...h.target(multipleBite[2].replace('another target','target')),differentFromPrevious:true}]);
 const manyVictims=/^(Target creature you control) deals damage equal to its power to each of (two|X) (?:other )?target creatures(?: and\/or planeswalkers)?\.$/.exec(line);
 if(manyVictims)return body([{action:'multiple-bite-v20',target:0,otherTarget:1}],[h.target('target creature you control'),{...h.target(line.includes('planeswalkers')?'target creature or planeswalker':'target creature'),differentFromPrevious:true,min:manyVictims[2]==='X'?0:2,max:manyVictims[2]==='X'?0:2,...(manyVictims[2]==='X'?{targetCountX:true}:{})}]);
 const targetSelf=/^Target creature deals damage (?:equal to its power to itself|to itself equal to its power)\.$/.test(line);
 if(targetSelf)return body([{action:'bite',target:0,otherTarget:0,stat:'power'}],[h.target('target creature')]);
 const sourceGroup=/^Choose (target creature(?: you control)?)\. It deals damage equal to its power to each other creature\.$/.exec(line);
 if(sourceGroup)return body([{action:'selected-group-damage-v20',target:0,filter:h.target('target creature'),excludeSource:true}],[h.target(sourceGroup[1])]);
 const mobBite=/^Choose (target creature you don't control)\. Each creature you control that's a (.+?) deals damage equal to its power to that creature\.$/.exec(line);
 if(mobBite){const filter=h.target('target '+mobBite[2].replace(/ a /g,' ')+' creature you control');if(filter)return body([{action:'selected-group-damage-v20',target:0,sources:filter}],[h.target(mobBite[1])]);}
 const allBite=/^Choose (target creature you don't control)\. Each creature you control deals (1 damage|damage equal to its power) to that creature\.$/i.exec(line);
 if(allBite)return body([{action:'selected-group-damage-v20',target:0,sources:h.target('target creature you control'),...(allBite[2]==='1 damage'?{n:1}:{})}],[h.target(allBite[1])]);
 const returnedStat=/^(Return target creature card from your graveyard to your hand)\. (.+?) deals damage to (any target|target .+?) equal to the power of the card returned this way\.$/.exec(line);
 if(returnedStat&&returnedStat[2]===card.name){const target=returnedStat[3]==='any target'?{what:'any',min:1}:h.target(returnedStat[3]);if(target)return body([{action:'move-to-hand',target:0},{action:'damage',target:1,n:{kind:'target-stat',target:0,stat:'power'}}],[h.target('target creature card from your graveyard'),target]);}
 const exileTokens=/^(Exile target creature card from (?:your|a) graveyard)\.(?: Then)? (Create .+?), where X is the exiled card's (power|toughness)\.$/.exec(line);
 if(exileTokens){const first=h.effect(card,exileTokens[1]+'.'),created=h.effect(card,exileTokens[2]+'.');if(complete(first)&&complete(created)&&first.targets.length===1&&!created.targets.length&&created.effects.length===1&&['token-inline','token-key'].includes(created.effects[0].action)&&created.effects[0].n==='X')return body([...first.effects,{...created.effects[0],n:{kind:'target-stat',target:0,stat:exileTokens[3]}}],first.targets);}
 const conditionalDraw=/^Draw a card\. If a graveyard has (?:twenty|20) or more cards in it, draw (?:three|3) cards instead\.$/.exec(line);
 if(conditionalDraw)return body([{action:'conditional',condition:{kind:'any-grave-size-v20',min:20},effects:[{action:'draw',who:'you',n:3}],elseEffects:[{action:'draw',who:'you',n:1}]}]);
 // The old sequence grammar already binds top-level pronouns. Nested
 // conditional effects require the same locked target, never a future event.
 const boundary=line.indexOf('. ');
 if(boundary>=0){
  const left=line.slice(0,boundary+1),right=line.slice(boundary+2);
  if(/\b(?:that (?:creature|card|permanent|artifact|land|enchantment)|those (?:creatures|tokens)|it|its|they|them)\b/i.test(right)&&!/["\n]/.test(line)&&!/^When(?:ever)?\b/.test(right)){
   const first=h.effect(card,left),second=h.effect(card,right);
   if(complete(first)&&complete(second)&&first.targets.length===1&&!second.targets.length&&first.effects.at(-1)?.target===0){
    const player=first.targets[0].zone==='player',encoded=JSON.stringify(second.effects);
    if(/event-card|unbound-object-v10/.test(encoded)){
     let effects=bindPronouns(second.effects,0,{player,stats:/\bits (?:power|toughness|mana value)\b/.test(right)&&! /\bthis (?:creature|artifact|enchantment|permanent)\b/.test(right)});
     effects=effects.map(e=>e.action==='conditional'&&e.conditionTarget===undefined&&/^If (?:it\b|it's\b|its\b|that )/.test(right)?{...e,conditionTarget:0}:e);
     if(!/event-card|unbound-object-v10/.test(JSON.stringify(effects)))return body([...first.effects,...effects],first.targets);
    }
   }
   if(complete(first)&&complete(second)&&!first.targets.length&&!second.targets.length&&first.effects.length===1&&['token-inline','token-key'].includes(first.effects[0].action)&&first.effects[0].who==='you'){
    const encoded=JSON.stringify(second.effects);
    if(/event-card|unbound-object-v10/.test(encoded)&&!/(?:controller|owner|stat|counters)"/.test(encoded))return body([...first.effects,...bindPronouns(second.effects,'created-tokens')]);
   }
  }
 }
 return null;
}

export function normalizeCard(card){
 const normalize=text=>String(text||'').replace(/\n(?=[0-9]+(?:[—–-][0-9]+)? \| )/g,' ');
 return {...card,oracle_text:normalize(card.oracle_text),...(card.card_faces?{card_faces:card.card_faces.map(face=>({...face,oracle_text:normalize(face.oracle_text)}))}:{})};
}
