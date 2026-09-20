// Closed additions. Successful v16 definitions remain frozen.
import * as v16 from './oracle-extensions-v16.mjs';
export * from './oracle-extensions-v16.mjs';
const body=(effects,targets=[])=>({effects,targets,optional:false});
const complete=p=>p&&!p.optional&&!p.v4Body&&Array.isArray(p.targets)&&Array.isArray(p.effects);
const numbers={a:1,an:1,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10};
const mapReference=(node,old,replacement)=>Array.isArray(node)?node.map(child=>mapReference(child,old,replacement)):node&&typeof node==='object'?Object.fromEntries(Object.entries(node).map(([key,value])=>[key,['target','who'].includes(key)&&value===old?replacement:mapReference(value,old,replacement)])):node;
export function extensionTarget(text,h){
 if(text==='target creature with disturb')return {...h.target('target creature'),hasMechanicV17:'disturb'};
 if(text==='target Spirit, creature with disturb, or enchantment')return {...h.target('target permanent'),alternatives:['target Spirit','target creature with disturb','target enchantment'].map(h.target)};
 const mechanic=/^(target (?:creature )?card) with (flashback|disturb)( from (?:your|a|an opponent's) graveyard)$/.exec(text);
 if(mechanic){const parsed=h.target(mechanic[1]+mechanic[3]);if(parsed)return {...parsed,hasMechanicV17:mechanic[2]};}
 if(text==='target creature with a morph ability')return {...h.target('target creature'),hasMechanicV17:'morph'};
 const adorned=/^(target creature)( you control| an opponent controls)? that(?:'s| is) enchanted or equipped$/.exec(text);
 if(adorned){const alternatives=['enchanted','equipped'].map(q=>h.target('target '+q+' creature'+(adorned[2]||'')));if(alternatives.every(Boolean))return {...h.target(adorned[1]+(adorned[2]||'')),alternatives};}
 const artifactAbility=/^(target (?:activated|triggered|activated or triggered) ability) from an artifact source$/.exec(text);
 if(artifactAbility){const parsed=h.target(artifactAbility[1]);if(parsed?.what==='stack-ability')return {...parsed,sourceQuality:'Artifact'};}
 const enchanted=/^(target .+?) enchanted player controls$/.exec(text);
 if(enchanted){const parsed=h.target(enchanted[1]);if(parsed?.zone==='battlefield')return {...parsed,enchantedControllerV17:true};}
 return v16.extensionTarget(text,h);
}
export function extensionCount(text,h){if(/^card named [^.]+ in /.test(text))return h.count(text.replace(/^card /,'cards '));return v16.extensionCount(text,h);}
export function extensionCondition(text,h){
 if(text==='enchanted creature is untapped')return {kind:'attached-untapped-v17'};
 const types=/^you control an? ((?:[A-Z][A-Za-z'-]+, )+[A-Z][A-Za-z'-]+,? or [A-Z][A-Za-z'-]+)$/.exec(text);
 if(types){const conditions=types[1].split(/,? or |, /).map(word=>h.condition('you control a '+word));if(conditions.every(Boolean))return {kind:'any',conditions};}
 if(text==="you've discarded a card this turn"||text==='you discarded a card this turn')return {kind:'count-comparison',count:{kind:'turn-count',field:'discardedN'},min:1};
 return v16.extensionCondition(text,h);
}
export function extensionLine(card,line,h){
 const phased=/^Whenever this creature phases in, (.+)$/.exec(line);
 if(phased){const parsed=h.effect(card,phased[1].replace(/^put /,'Put ').replace(/ on it\.$/,' on this creature.'));if(complete(parsed))return {kind:'generic-trigger',event:'oraclePhasedInV17',eventFilter:'self',...parsed,contract:'generic-trigger-effect'};}
 if(line==='Players play with their hands revealed.'||line==='Your opponents play with their hands revealed.'||line==='Play with your hand revealed.')return {kind:'hand-visibility-v17',players:line.startsWith('Players')?'all':line.startsWith('Your opponents')?'opponents':'you',contract:'hand-visibility-v17'};
 if(line==='Whenever this Equipment becomes attached to a creature, tap that creature.')return {kind:'generic-trigger',event:'attached',eventFilter:{kind:'attached-source-v17'},effects:[{action:'tap',target:'attachment-event-host-v17'}],targets:[],optional:false,contract:'generic-trigger-effect'};
 if(line==='At the beginning of each upkeep, if enchanted creature is untapped, tap it.')return {kind:'generic-trigger',event:'upkeep',eventFilter:'each-upkeep',condition:{kind:'attached-untapped-v17'},effects:[{action:'tap',target:'attached-host'}],targets:[],optional:false,contract:'generic-trigger-effect'};
 if(line.includes('You may choose new targets for that copy.'))return h.line(card,line.replace('You may choose new targets for that copy.','You may choose new targets for the copy.'));
 const guarded=/^(.+: .+\.) Activate only if (a creature died this turn)\.$/.exec(line);
 if(guarded){const parsed=h.line(card,guarded[1]),condition=h.condition(guarded[2]);if(parsed?.kind==='generic-ability'&&condition)return {...parsed,activationCondition:condition};}
 const bonus=/^(Equipped creature gets ([+-][0-9]+)\/([+-][0-9]+))\. If it's a ([A-Z][A-Za-z'-]+), it gets ([+-][0-9]+)\/([+-][0-9]+) instead\.$/.exec(line);
 if(bonus){const baseline=h.line(card,bonus[1]+'.'),p=Number(bonus[5])-Number(bonus[2]),t=Number(bonus[6])-Number(bonus[3]),added=h.line(card,'Equipped creature gets '+(p>=0?'+':'')+p+'/'+(t>=0?'+':'')+t+' as long as it is a '+bonus[4]+'.');if(baseline?.kind==='attachment-grant'&&added?.kind==='attachment-grant')return {kind:'operation-bundle',operations:[baseline,added],contract:'closed-permanent-clauses'};}
 const turnKeyword=/^Equipped creature has (.+) during your turn\. Otherwise, it has (.+)\.$/.exec(line);
 if(turnKeyword){const first=h.line(card,'Equipped creature has '+turnKeyword[1]+' as long as it is your turn.'),second=h.line(card,'Equipped creature has '+turnKeyword[2]+' as long as it is not your turn.');if(first?.kind==='attachment-grant'&&second?.kind==='attachment-grant')return {kind:'operation-bundle',operations:[first,second],contract:'closed-permanent-clauses'};}
 const typeCosts=/^((?:[A-Z][A-Za-z'-]+, )+[A-Z][A-Za-z'-]+,? and [A-Z][A-Za-z'-]+) spells you cast cost (\{[0-9]+\}) less to cast\.$/.exec(line);
 if(typeCosts){const rows=typeCosts[1].split(/,? and |, /).map(type=>h.line(card,type+' spells you cast cost '+typeCosts[2]+' less to cast.'));if(rows.every(row=>row?.kind==='cost-modifier'))return {...rows[0],target:{what:'card',zone:'battlefield',controller:'any',min:1,alternatives:rows.map(row=>row.target)}};}
 const kicked=/^Whenever (you kick|a player kicks|an opponent kicks) a spell, (.+)$/.exec(line);
 if(kicked){const parsed=h.effect(card,kicked[2].replace(/^you create /,'Create '));if(complete(parsed))return {kind:'generic-trigger',event:'cast',eventFilter:{kind:'qualified-cast-v8',controller:kicked[1]==='you kick'?'you':kicked[1]==='a player kicks'?'any':'opponent',target:h.target('target spell'),kickedV17:true},...parsed,contract:'generic-trigger-effect'};}
 if(line==="When enchanted creature is turned face up, destroy it. It can't be regenerated.")return {kind:'generic-trigger',event:'turnedFaceUp',eventFilter:{kind:'v8-event',field:'card',subject:'attached'},effects:[{action:'destroy',target:'event-card',noRegen:true}],targets:[],optional:false,contract:'generic-trigger-effect'};
 if(line==='You may cast this card from exile.')return {kind:'cast-self-exile-v17',contract:'cast-self-exile-v17'};
 if(line==='You may look at the top card of your library any time.')return {kind:'library-visibility-v17',scope:'private',contract:'library-visibility-v17'};
 if(line==='Play with the top card of your library revealed.')return {kind:'library-visibility-v17',scope:'public',contract:'library-visibility-v17'};
 if(line==='Players play with the top card of their libraries revealed.')return {kind:'library-visibility-v17',scope:'all',contract:'library-visibility-v17'};
 if(line==="This creature isn't legendary if it's a token.")return {kind:'v8-type-static',own:true,condition:{kind:'source-quality',filter:{what:'creature',zone:'battlefield',controller:'any',token:true,min:1}},change:{removeSuperV10:['Legendary']},contract:'continuous-characteristic-type'};
 const adorned=/^Whenever a creature you control that's enchanted or equipped attacks, (.+)$/.exec(line);
 if(adorned){const parsed=h.line(card,'Whenever an enchanted creature you control attacks, '+adorned[1]);if(parsed?.kind==='generic-trigger')return {...parsed,eventFilter:{...parsed.eventFilter,target:h.target("target creature you control that's enchanted or equipped")}};}
 const colors=/^Whenever you cast a spell that's ((?:white|blue|black|red|green)(?:, (?:white|blue|black|red|green))*(?:,? or (?:white|blue|black|red|green))), (.+)$/.exec(line);
 if(colors){const parsed=h.line(card,'Whenever you cast a spell, '+colors[2]);if(parsed?.kind==='generic-trigger'&&parsed.event==='cast')return {...parsed,eventFilter:{kind:'qualified-cast-v8',controller:'you',target:{...h.target('target spell'),colorsAny:colors[1].split(/,? or |, /).map(word=>({white:'W',blue:'U',black:'B',red:'R',green:'G'})[word])}}};}
 if(line==='Enchant player'||line==='Enchant opponent')return {kind:'aura-target',what:line.slice(8),targetV9:h.target('target '+line.slice(8)),contract:'aura-targeting'};
 const upkeep=/^At the beginning of enchanted player's (upkeep|draw step|end step), (.+)$/.exec(line);
 if(upkeep){const parsed=h.effect(card,upkeep[2].replace(/^that player /,'Target player ').replace(/ draws ([^.]+) additional cards\./,' draws $1 cards.'));if(complete(parsed)&&parsed.targets.length===1&&parsed.targets[0].zone==='player')return {kind:'generic-trigger',event:{upkeep:'upkeep','draw step':'drawStep','end step':'endStep'}[upkeep[1]],eventFilter:upkeep[1]==='upkeep'?'each-upkeep':'each-end-step',enchantedPlayerV17:true,effects:mapReference(parsed.effects,0,'event-player'),targets:[],optional:false,contract:'generic-trigger-effect'};}
 if(line==="Enchanted player can't cast more than one spell each turn.")return {kind:'spell-limit-v8',players:'enchanted-v17',max:1,contract:'spell-limit-v8'};
 const prey=/^Whenever a creature deals combat damage to enchanted player, (.+)$/.exec(line);
 if(prey){const parsed=h.line(card,'Whenever a creature deals combat damage to a player, '+prey[1]);if(parsed?.kind==='generic-trigger')return {...parsed,enchantedPlayerV17:true};}
 const untap=/^(As long as this (?:artifact|creature|enchantment|permanent) is untapped, )?(Players|players|You|you|Your opponents) can't untap more than (one|two|three) (permanent|land|nonbasic land|artifact|creature)s? during (?:their untap steps|your untap step)\.$/.exec(line);
 if(untap){const filter=h.target('target '+untap[4]);if(filter?.zone==='battlefield')return {kind:'untap-limit-v17',players:/you$/i.test(untap[2])?'you':untap[2]==='Your opponents'?'opponents':'all',n:numbers[untap[3]],filter,untapped:!!untap[1],contract:'untap-limit-v17'};}
 if(line==="Each player who has cast a nonartifact spell this turn can't cast additional nonartifact spells.")return {kind:'spell-limit-v8',players:'all',max:1,qualityV16:'nonartifact',contract:'spell-limit-v8'};
 const split=/^(Spells with flash you cast cost \{[0-9]+\} less to cast) and can't be countered\.$/.exec(line);
 if(split){const cost=h.line(card,split[1]+'.'),filter={what:'card',zone:'graveyard',controller:'any',withKeyword:'flash'};if(cost)return {kind:'operation-bundle',operations:[cost,{kind:'uncounterable-spells-v9',target:{what:'spell',zone:'stack',spellFilter:filter},controller:'you',contract:'uncounterable-spells-v9'}],contract:'closed-permanent-clauses'};}
 return v16.extensionLine(card,line,h);
}
export function extensionEffect(card,line,h){
 if(line==='Look at target face-down creature.')return body([{action:'look-face-v17',target:0}],[h.target('target face-down creature')]);
 if(line==='Destroy all Curses attached to you.')return body([{action:'destroy-player-auras-v17',who:'you',subtype:'Curse'}]);
 const remove=/^Remove up to (one|two|three|four|five|[0-9]+) counters? from (target permanent)\.$/.exec(line);
 if(remove)return body([{action:'remove-counters-v8',target:0,n:numbers[remove[1]]??Number(remove[1]),upToV17:true}],[h.target(remove[2])]);
 const delayedTurn=/^(Turn target face-down creature you control face up\.) At the beginning of the next end step, sacrifice it\.$/.exec(line);
 if(delayedTurn){const parsed=h.effect(card,delayedTurn[1]);if(complete(parsed))return {...parsed,effects:[{action:'delayed-objects-v8',effects:parsed.effects,capture:{kind:'subjects',target:0,from:'battlefield',zone:'battlefield',moved:false,index:0},operation:'sacrifice',event:'endStep'}]};}
 if(line.includes('You may choose new targets for that copy.'))return h.effect(card,line.replace('You may choose new targets for that copy.','You may choose new targets for the copy.'));
 if(line==='Target player exiles all cards with flashback from their graveyard.')return body([{action:'zone-select',zone:'graveyard',who:0,filter:{what:'card',zone:'graveyard',controller:'you',hasMechanicV17:'flashback'},n:'all',destination:'exile'}],[h.target('target player')]);
 const amass=/^Amass (Orcs|Zombies) X\.$/.exec(line);
 if(amass)return body([{action:'amass',n:'X',subtype:amass[1].slice(0,-1)}]);
 const discardAll=/^(Target player|Target opponent) reveals their hand and discards all (.+) cards\.$/.exec(line);
 if(discardAll){const filter=h.target('target '+discardAll[2]+' card from your graveyard');if(filter?.zone==='graveyard')return body([{action:'reveal-hand',who:0},{action:'discard-filtered-v17',who:0,filter}],[h.target(discardAll[1].toLowerCase())]);}
 const turned=/^Turn (this creature|target (?:face-down creature(?: (?:you control|an opponent controls))?|creature with a morph ability)) face (up|down)\.$/.exec(line);
 if(turned){const target=turned[1]==='this creature'?null:h.target(turned[1]);if(turned[1]==='this creature'||target)return body([{action:'turn-face-v17',target:target?0:'self',face:turned[2]}],target?[target]:[]);}
 const peeks=/^Look at the top card of each player's library\.$/.exec(line);
 if(peeks)return body([{action:'player-sequence-v9',who:'each-player',effects:[{action:'inspect-top',who:0,n:1,destination:null,optionalMove:true,reveal:false}]}]);
 const drawPeeks=/^(Draw (?:one|two|three|four|five|[0-9]+) cards?), then look at the top card of each player's library\.$/.exec(line);
 if(drawPeeks)return h.effect(card,drawPeeks[1]+'. Look at the top card of each player\'s library.');
 const reclaimed=/^Target player shuffles up to (one|two|three|four|five|[0-9]+) target cards? from their graveyard into their library\.$/.exec(line);
 if(reclaimed)return body([{action:'shuffle-targets-v17',who:0,target:1}],[h.target('target player'),{...h.target('target card from a graveyard'),min:0,max:numbers[reclaimed[1]]??Number(reclaimed[1]),ownerPlayerV17:{target:0}}]);
 const untapLand=/^(Target player|That player) untaps? a land they control\.$/.exec(line);
 if(untapLand)return body([{action:'choose-permanents',operation:'untap',who:untapLand[1]==='That player'?'event-player':0,n:1,filter:h.target('target land')}],untapLand[1]==='That player'?[]:[h.target('target player')]);
 const sacrificed=/^(Target player|Target opponent) discards a number of cards equal to the sacrificed creature's (power|toughness)\.$/.exec(line);
 if(sacrificed)return body([{action:'discard',who:0,n:{kind:'sacrificed-stat',stat:sacrificed[2]}}],[h.target(sacrificed[1].toLowerCase())]);
 const seized=/^Gain control of all (creatures|artifacts|enchantments|lands|permanents) (target opponent|target player) controls\.$/.exec(line);
 if(seized)return body([{action:'gain-control',filters:[h.target('target '+seized[1].slice(0,-1))],controllerPlayerV17:{target:0}}],[h.target(seized[2])]);
 const listIf=/^If (you control an? (?:[A-Z][A-Za-z'-]+, )+[A-Z][A-Za-z'-]+,? or [A-Z][A-Za-z'-]+), (.+)\.$/.exec(line);
 if(listIf){const condition=h.condition(listIf[1]),parsed=h.effect(card,listIf[2][0].toUpperCase()+listIf[2].slice(1)+'.');if(condition&&complete(parsed))return body([{action:'conditional',condition,effects:parsed.effects}],parsed.targets);}
 const sacrificeX=/^(Each player|Each opponent) sacrifices X (creatures|lands|artifacts|enchantments|permanents)\.$/.exec(line);
 if(sacrificeX)return body([{action:'choose-permanents',operation:'sacrifice',n:'X',filter:h.target('target '+sacrificeX[2].slice(0,-1)),who:sacrificeX[1]==='Each player'?'each-player':'each-opponent'}]);
 const relativeStat=/^(.+ deals )damage to (target creature) equal to the number of (.+) that creature's controller controls\.$/.exec(line);
 if(relativeStat){const count=h.count(relativeStat[3]+' you control'),parsed=h.effect(card,relativeStat[1]+'X damage to '+relativeStat[2]+'.');if(count&&complete(parsed)&&parsed.effects.length===1&&parsed.effects[0].action==='damage')return {...parsed,effects:[{...parsed.effects[0],n:{kind:'target-count',target:{kind:'target-controller',index:0},count}}]};}
 const handDifference=/^(Target creature gets [+-]X\/[+-]X until end of turn), where X is ([0-9]+) minus the number of cards in that creature's controller's hand\.$/.exec(line);
 if(handDifference){const parsed=h.effect(card,handDifference[1]+'.');if(complete(parsed)&&parsed.effects.length===1){const value={kind:'difference-v10',left:Number(handDifference[2]),right:{kind:'target-count',target:{kind:'target-controller',index:0},count:{kind:'count',zone:'hand',what:'card',controller:'you'}}};return {...parsed,effects:parsed.effects.map(e=>({...e,power:{...e.power,value},toughness:{...e.toughness,value}}))};}}
 const manyDiscard=/^Any number of target players each discard a number of cards equal to (.+)\.$/.exec(line);
 if(manyDiscard){const n=h.value(manyDiscard[1]);if(n!==null&&n!==undefined)return body([{action:'player-sequence-v9',who:0,effects:[{action:'discard',who:'sequence-player-v15',n}]}],[{...h.target('target player'),min:0,unbounded:true}]);}
 const mixedDamage=/^(.+ deals )([0-9]+|X) damage to (each attacking creature|target player) and ([0-9]+|X) damage to (you and each creature you control|each creature that player controls)\.$/.exec(line);
 if(mixedDamage){
  const n=value=>value==='X'?'X':Number(value),attacking=mixedDamage[3]==='each attacking creature';
  if(attacking&&mixedDamage[5]==='you and each creature you control')return body([{action:'damage-batch',hits:[{filters:[h.target('target attacking creature')],n:n(mixedDamage[2])},{target:'you',n:n(mixedDamage[4])},{filters:[h.target('target creature you control')],n:n(mixedDamage[4])}]}]);
  if(!attacking&&mixedDamage[5]==='each creature that player controls')return body([{action:'damage-batch',hits:[{target:0,n:n(mixedDamage[2])},{filters:[h.target('target creature')],controllerPlayerV17:{target:0},n:n(mixedDamage[4])}]}],[h.target('target player')]);
 }
 const extraBlue=/^(.+ deals )X damage to each creature with flying and 1 additional damage to each blue creature\.$/.exec(line);
 if(extraBlue)return body([{action:'damage-batch',hits:[{filters:[h.target('target creature with flying')],n:'X'},{filters:[h.target('target blue creature')],n:1}]}]);
 const pox=/^Each player loses ([0-9]+|X) life, discards (a card|X cards), sacrifices (a creature|X creatures), then sacrifices (a land|X lands)\.$/.exec(line);
 if(pox)return h.effect(card,'Each player loses '+pox[1]+' life. Each player discards '+pox[2]+'. Each player sacrifices '+pox[3]+'. Each player sacrifices '+pox[4]+'.');
 const ultimatum=/^(Target player gains [0-9]+ life), ([^.]+ deals [0-9]+ damage to any target), then you draw (one|two|three|four|five|six|seven) cards\.$/.exec(line);
 if(ultimatum)return h.effect(card,ultimatum[1]+'. '+ultimatum[2]+'. Draw '+ultimatum[3]+' cards.');
 const tokenEach=/^Create (a|an) (.+ creature token) for each (.+)\.$/.exec(line);
 if(tokenEach){const count=h.count(tokenEach[3]),parsed=h.effect(card,'Create X '+tokenEach[2]+'s.');if(count&&complete(parsed)&&parsed.effects.length===1&&['token-key','token-inline'].includes(parsed.effects[0].action))return {...parsed,effects:[{...parsed.effects[0],n:count}]};}
 const namedReturn=/^Return all cards named ([^.]+) from your graveyard to the battlefield\.$/.exec(line);
 if(namedReturn){const parsed=h.effect(card,'Return all creature cards from your graveyard to the battlefield.');if(complete(parsed)&&parsed.effects.length===1&&parsed.effects[0].action==='zone-select')return {...parsed,effects:[{...parsed.effects[0],filter:{what:'card',zone:'graveyard',controller:'you',name:namedReturn[1],min:1}}]};}
 if(line==='Draw cards equal to the number of cards target opponent discarded this turn.')return body([{action:'draw',who:'you',n:{kind:'target-count',target:0,count:{kind:'turn-count',field:'discardedN'}}}],[h.target('target opponent')]);
 if(line==='Target player loses life equal to the damage already dealt to that player this turn.')return body([{action:'lose-life',who:0,n:{kind:'target-count',target:0,count:{kind:'turn-count',field:'damageTaken'}}}],[h.target('target player')]);
 const additional=/^(.+\.) Creatures that are (green|white|blue|black|red) and\/or (green|white|blue|black|red) get an additional ([+-][0-9]+\/[+-][0-9]+) until end of turn\.$/.exec(line);
 if(additional)return h.effect(card,additional[1]+' '+additional[2][0].toUpperCase()+additional[2].slice(1)+' or '+additional[3]+' creatures get '+additional[4]+' until end of turn.');
 const optional=/^You may (attach|shuffle) (.+)\.$/.exec(line);
 if(optional){const parsed=h.effect(card,optional[1][0].toUpperCase()+optional[1].slice(1)+' '+optional[2]+'.');if(complete(parsed))return body([{action:'player-choice-v9',who:'you',effects:parsed.effects}],parsed.targets);}
 const eachMay=/^(Each player|Each opponent) may (put .+)\.$/.exec(line);
 if(eachMay){const parsed=h.effect(card,eachMay[2][0].toUpperCase()+eachMay[2].slice(1).replace(/\btheir\b/g,'your')+'.');if(complete(parsed)&&!parsed.targets.length&&parsed.effects.every(e=>['put-from-hand','put-on-top'].includes(e.action)))return body([{action:'player-choice-v9',who:eachMay[1]==='Each player'?'each-player':'each-opponent',effects:parsed.effects}]);}
 const hostileExile=/^(Target opponent|Target player) exiles (one|two|three|four|[0-9]+) cards? from their hand and loses ([0-9]+) life\.$/.exec(line);
 if(hostileExile){const parsed=h.effect(card,hostileExile[1]+' exiles '+hostileExile[2]+' cards from their hand.');if(complete(parsed)&&parsed.targets.length===1)return {...parsed,effects:[...parsed.effects,{action:'lose-life',who:0,n:Number(hostileExile[3])}]};}
 const handReveal=/^(Target opponent|Target player) loses ([0-9]+) life, then reveals a card at random from their hand\.$/.exec(line);
 if(handReveal)return body([{action:'lose-life',who:0,n:Number(handReveal[2])},{action:'reveal-random-card',who:0}],[h.target(handReveal[1].toLowerCase())]);
 const hostDamage=/^Enchanted creature deals ([0-9]+) damage to (target [^.]+)\.$/.exec(line);
 if(hostDamage){const parsed=h.effect(card,'This creature deals '+hostDamage[1]+' damage to '+hostDamage[2]+'.');if(complete(parsed)&&parsed.effects.length===1&&parsed.effects[0].action==='damage')return {...parsed,effects:[{...parsed.effects[0],source:'attached-host'}]};}
 if(line==="Players can't cast noncreature spells this turn.")return body([{action:'no-cast-v9',who:'each-player',quality:'noncreature'}]);
 const drained=/^(.+ loses? [^.]+ life(?: for each [^.]+)?)\. You gain that much life\.$/.exec(line);
 if(drained){const parsed=h.effect(card,drained[1]+'.');if(complete(parsed)&&parsed.effects.length===1&&parsed.effects[0].action==='lose-life')return {...parsed,effects:[...parsed.effects,{action:'gain-life',who:'you',n:{kind:'life-lost'}}]};}
 const damaged=/^(.+ deals [0-9]+ damage to )any target that was dealt damage this turn\.$/.exec(line);
 if(damaged){const parsed=h.effect(card,damaged[1]+'any target.');if(complete(parsed)&&parsed.targets.length===1&&parsed.effects.length===1&&parsed.effects[0].action==='damage')return {...parsed,targets:[{...parsed.targets[0],damagedThisTurn:true}]};}
 const looked=/^Look at (target player's|target opponent's) hand and choose (up to )?(X|a|one|two|three|four|five|[1-9][0-9]*) cards? from it(?:, where X is (.+))?\. That player discards (?:those cards|that card)\.$/.exec(line);
 if(looked){const n=looked[4]?h.value(looked[4]):looked[3]==='X'?'X':numbers[looked[3]]??Number(looked[3]);if(n!==null&&n!==undefined)return body([{action:'reveal-hand-discard',target:0,what:'card',lookV17:true,n,upToV17:!!looked[2]}],[h.target(looked[1].replace(/'s$/,''))]);}
 if(line==='Exile all graveyards.')return h.effect(card,'Exile all cards from all graveyards.');
 const upToDraw=/^(You|Target player|Target opponent|Each player|Each opponent) (?:may )?draws? up to (one|two|three|four|five|six|seven|[0-9]+) cards?\.$/.exec(line);
 if(upToDraw){const who=upToDraw[1].toLowerCase(),target=who.startsWith('target ')?h.target(who):null;return body([{action:'draw',who:target?0:who.replace(' ','-'),n:numbers[upToDraw[2]]??Number(upToDraw[2]),upToV17:true}],target?[target]:[]);}
 return v16.extensionEffect(card,line,h);
}
