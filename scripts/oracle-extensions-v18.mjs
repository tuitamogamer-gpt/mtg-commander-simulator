// Closed additions. Successful v17 definitions remain frozen.
import * as v17 from './oracle-extensions-v17.mjs';
export * from './oracle-extensions-v17.mjs';
const body=(effects,targets=[])=>({effects,targets,optional:false});
const colorCodes={white:'W',blue:'U',black:'B',red:'R',green:'G'};
export function extensionCount(text,h){if(/^creatures? you attacked with this turn$/.test(text))return {...h.count('creatures that attacked this turn'),youV18:true};return v17.extensionCount(text,h);}
export function extensionCondition(text,h){
 if(text==='this creature dealt damage to an opponent this turn')return {kind:'source-hit-opponent-v18'};
 return v17.extensionCondition(text,h);
}
export function modifierOperation(card,line,h){
 if(line==='As an additional cost to cast this spell, discard a card at random.')return {kind:'mechanic-additional-costs',costs:[{id:'cost-1',kind:'discard',quantity:{min:1,max:1},object:{kind:'card'},randomV18:true}],contract:'mechanic-additional-costs'};
 if(line==='As an additional cost to cast this spell, put a -1/-1 counter on a creature you control.')return {kind:'mechanic-casting-choice-v8',requiredV18:true,options:[{kind:'blight',n:1}],contract:'mechanic-casting-choice-v8'};
 return v17.modifierOperation(card,line,h);
}
export function extensionLine(card,line,h){
 const exhaust=/^Exhaust — (.+)$/.exec(line);
 if(exhaust){const text=exhaust[1].replace('This Vehicle becomes an artifact creature. Put a +1/+1 counter on it.','This artifact becomes an artifact creature. Put a +1/+1 counter on this artifact.');const parsed=h.line(card,text);if(parsed?.kind==='generic-ability'&&!parsed.from)return {...parsed,exhaustV18:true,oncePerObject:true};return null;}
 const activated=/^Whenever you activate (?:an|a) (exhaust|boast) ability, (.+)$/.exec(line);
 if(activated){const parsed=h.effect(card,activated[2]);if(parsed)return {kind:'generic-trigger',event:'abilityActivated',eventFilter:{kind:'observation-v9',controller:'you',abilityKeywordV18:activated[1]},...parsed,contract:'generic-trigger-effect'};}
 const exhaustCost=/^Exhaust abilities of other permanents you control cost \{([1-9][0-9]*)\} less to activate\.$/.exec(line);
 if(exhaustCost)return {kind:'ability-cost-v18',filter:{...h.target('target permanent you control'),excludeSelf:true},ability:'exhaustV18',amount:-Number(exhaustCost[1]),contract:'ability-cost-v18'};
 const banned=/^Creatures your opponents control lose (trample|hexproof|flying|first strike|deathtouch) and can't have or gain \1\.$/.exec(line);
 if(banned)return {kind:'generic-static',scope:'filtered-permanents',filters:[h.target('target creature an opponent controls')],power:0,toughness:0,keywords:[],keywordBanV18:banned[1],contract:'generic-continuous-effect'};
 if(line==='If a player would draw a card, that player skips that draw instead.')return {kind:'draw-replacement-v8',mode:'skip-all-v18',contract:'ordered-draw-replacement'};
 const abilityCost=/^Activated abilities of (lands|artifact tokens) you control cost \{([1-9][0-9]*)\} less to activate\.$/.exec(line);
 if(abilityCost)return {kind:'ability-cost-v18',filter:h.target('target '+abilityCost[1].replace(/lands/,'land').replace(/tokens/,'token')+' you control'),amount:-Number(abilityCost[2]),contract:'ability-cost-v18'};
 const graveCost=/^Activated abilities of creature cards in your graveyard cost \{([1-9][0-9]*)\} less to activate\.$/.exec(line);
 if(graveCost)return {kind:'ability-cost-v18',filter:h.target('target creature card from your graveyard'),amount:-Number(graveCost[1]),contract:'ability-cost-v18'};
 const powerCost=/^Power-up abilities of other creatures you control cost \{([1-9][0-9]*)\} less to activate\.$/.exec(line);
 if(powerCost)return {kind:'ability-cost-v18',filter:{...h.target('target creature you control'),excludeSelf:true},ability:'powerUp',amount:-Number(powerCost[1]),contract:'ability-cost-v18'};
 const loyaltyCost=/^Loyalty abilities of planeswalkers your opponents control cost \{([1-9][0-9]*)\} more to activate\.$/.exec(line);
 if(loyaltyCost)return {kind:'ability-cost-v18',filter:h.target('target planeswalker an opponent controls'),ability:'loyalty',amount:Number(loyaltyCost[1]),contract:'ability-cost-v18'};
 const abilityTax=/^Activated abilities cost \{([1-9][0-9]*)\} more to activate unless they're mana abilities\.$/.exec(line);
 if(abilityTax)return {kind:'ability-cost-v18',ability:'nonmana',amount:Number(abilityTax[1]),contract:'ability-cost-v18'};
 const colors=/^\{T\}: Choose a color of a (permanent you control|card in your graveyard)\. Add one mana of that color\.$/.exec(line);
 if(colors||line==='{T}: Add one mana of any color among legendary creature cards in your graveyard.'){
  const filter=h.target('target '+(colors?(colors[1]==='card in your graveyard'?'card from your graveyard':colors[1]):'legendary creature card from your graveyard'));
  if(filter)return {kind:'mana-source',activationCost:{tap:true},produce:['W','U','B','R','G'].map(color=>({[color]:1})),produceFromCardsV18:filter,contract:'mana-source'};
 }
 const rules={'The "legend rule" doesn\'t apply.':'legend','Players can\'t activate planeswalkers\' loyalty abilities.':'loyalty','Each player can\'t draw more than one card each turn.':'draw-limit','Players don\'t lose unspent mana as steps and phases end.':'mana-all','If you would lose unspent mana, that mana becomes colorless instead.':'mana-colorless'};
 if(rules[line])return {kind:'rule-static-v18',rule:rules[line],contract:'rule-static-v18'};
 if(line==="This creature can't have counters put on it.")return {kind:'generic-static',scope:'self',power:0,toughness:0,keywords:[],counterBanV18:'all',contract:'generic-continuous-effect'};
 if(line==="Creatures your opponents control can't have +1/+1 counters put on them.")return {kind:'generic-static',scope:'filtered-permanents',filters:[h.target('target creature an opponent controls')],power:0,toughness:0,keywords:[],counterBanV18:'+1/+1',contract:'generic-continuous-effect'};
 if(line.includes('spells an opponent controls or abilities from')&&line.endsWith('sources an opponent controls.'))return h.line(card,line.replaceAll('an opponent controls','your opponents control'));
 const protectedSource=/^(This creature|Creatures you control|[^.]+?) can't be the targets? of (nongreen|white|blue|black|red|green) spells( your opponents control)? (?:or|and) abilities from \2 sources( your opponents control)?\.$/.exec(line);
 if(protectedSource&&(protectedSource[1]==='This creature'||protectedSource[1]==='Creatures you control'||protectedSource[1]===card.name)&&!!protectedSource[3]===!!protectedSource[4]){
  const group=protectedSource[1]==='Creatures you control';
  return {kind:'generic-static',scope:group?'filtered-permanents':'self',...(group?{filters:[h.target('target creature you control')],excludeSelf:false}:{}),power:0,toughness:0,keywords:[],targetRestrictionV18:{color:protectedSource[2]==='nongreen'?'G':colorCodes[protectedSource[2]],negate:protectedSource[2]==='nongreen',opponentsOnly:!!protectedSource[3]},contract:'generic-continuous-effect'};
 }
 const attack=/^(Whenever a creature you control with power ([0-9]+) or less attacks), this enchantment deals ([0-9]+) damage to the player or planeswalker that creature is attacking\.$/.exec(line);
 if(attack){const trigger=h.line(card,attack[1]+', draw a card.');if(trigger?.kind==='generic-trigger')return {...trigger,effects:[{action:'damage',target:'event-defender-v18',n:Number(attack[3])}]};}
 const damaged=/^At the beginning of each end step, if this creature dealt damage to an opponent this turn, put a \+1\/\+1 counter on it\.$/.test(line);
 if(damaged)return {kind:'generic-trigger',event:'endStep',eventFilter:'each-end-step',condition:{kind:'source-hit-opponent-v18'},effects:[{action:'counter',target:'self',counter:'+1/+1',n:1}],targets:[],optional:false,contract:'generic-trigger-effect'};
 if(line==='Other Villains you control are Heroes in addition to their other types.')return {kind:'v8-type-static',filters:[{...h.target('target Villain you control'),excludeSelf:true}],change:{addCreatureTypes:['Hero']},contract:'continuous-characteristic-type'};
 const battery=/^\{T\}, Remove any number of charge counters from this artifact: Add \{([WUBRGC])\}, then add an additional \{\1\} for each charge counter removed this way\.$/.exec(line);
 if(battery)return {kind:'mana-source',activationCost:{tap:true,removeManaCounters:{kind:'charge',baseV18:1}},produce:[{[battery[1]]:1}],storageCounterMana:{kind:'charge',color:battery[1],baseV18:1},contract:'mana-source'};
 return v17.extensionLine(card,line,h);
}
export function extensionTarget(text,h){
 if(text==='target player dealt damage by this creature this turn')return {...h.target('target player'),sourceDamagedPlayerV18:true};
 const mixed=/^target (spell or creature|spell or permanent)( with mana value ([0-9]+) or greater)?$/.exec(text);
 if(mixed){const tail=mixed[2]||'',branches=mixed[1].split(' or ').map(type=>h.target('target '+type+tail));if(branches.every(Boolean))return {what:'mixed-v18',zone:'mixed-v18',min:1,alternatives:branches};}
 return v17.extensionTarget(text,h);
}
export function extensionEffect(card,line,h){
 if(line==='Any number of target players each mill cards equal to the number of cards in their graveyard.')return body([{action:'player-sequence-v9',who:0,effects:[{action:'mill',who:0,n:{kind:'target-count',target:0,count:{kind:'count',zone:'graveyard',what:'card'}}}]}],[{...h.target('target player'),min:0,unbounded:true}]);
 if(line==='Attacking creatures with flying get -2/-2 and lose flying until end of turn.')return body([{action:'battlefield-group',operation:'pump',filters:[{...h.target('target creature with flying'),attacking:true}],power:-2,toughness:-2,keywords:[],removeKeywordsV18:['flying']}]);
 const colored=/^(Target (?:spell or permanent|spell|permanent|creature|instant or sorcery spell)) becomes (colorless|white|blue|black|red|green|the color of your choice|the color or colors of your choice)( until end of turn)?\.$/.exec(line);
 if(colored){const target=h.target(colored[1].toLowerCase());if(target)return body([{action:'color-v18',target:0,colors:colored[2]==='colorless'?[]:colored[2]==='the color of your choice'?'choose':colored[2]==='the color or colors of your choice'?'choose-many':[colorCodes[colored[2]]],temporary:!!colored[3]}],[target]);}
 if(line==='Two target players exchange life totals.')return body([{action:'exchange-life-v18',target:0}],[{...h.target('target player'),min:2,max:2}]);
 if(line==='You may have two target players exchange life totals.')return {...body([{action:'exchange-life-v18',target:0}],[{...h.target('target player'),min:2,max:2}]),optional:true};
 if(line==='Exchange life totals with target opponent.')return body([{action:'exchange-life-v18',target:0,withYou:true}],[h.target('target opponent')]);
 if(line==='If the difference between your life total and target player\'s life total is 5 or less, exchange life totals with that player.')return body([{action:'exchange-life-v18',target:0,withYou:true,maximumDifference:5}],[h.target('target player')]);
 if(line==='You may exchange life totals with target opponent. If you lost life this way, draw that many cards.')return {...body([{action:'exchange-life-v18',target:0,withYou:true,drawLost:true}],[h.target('target opponent')]),optional:true};
 if(line==='Two target players exchange life totals. You create an X/X colorless Horror artifact creature token, where X is the difference between those players\' life totals.')return body([{action:'exchange-life-v18',target:0,tokenDifference:true}],[{...h.target('target player'),min:2,max:2}]);
 if(line==='Simultaneously untap all tapped creatures and tap all untapped creatures.')return body([{action:'reverse-tap-v18'}]);
 if(line==='You gain hexproof until your next turn.')return body([{action:'player-hexproof-v18',duration:'untilTurnOf'}]);
 if(line==='Permanents enter tapped this turn.')return body([{action:'entry-tapped-v18'}]);
 if(line==='Tap all lands target player controls and that player loses all unspent mana.')return body([{action:'battlefield-group',operation:'tap',filters:[h.target('target land')],target:0},{action:'empty-mana-v18',target:0}],[h.target('target player')]);
 if(line==='Return all artifacts target player owns to their hand.')return body([{action:'battlefield-group',operation:'bounce',filters:[h.target('target artifact')],ownerPlayerV18:{target:0}}],[h.target('target player')]);
 if(line==='Counter up to four target spells and/or abilities.')return body([{action:'counter-spell',target:0}],[{...h.target('target spell or ability'),min:0,max:4}]);
 if(line==='Return up to X target instant and/or sorcery cards from your graveyard to your hand.')return body([{action:'move-to-hand',target:0}],[{...h.target('target instant or sorcery card from your graveyard'),min:0,max:0,targetCountX:true}]);
 if(line==='Any number of target opponents each discard their hands, then draw seven cards.')return body([{action:'player-sequence-v9',who:0,effects:[{action:'discard-hand',who:'sequence-player-v15'}]},{action:'player-sequence-v9',who:0,effects:[{action:'draw',who:'sequence-player-v15',n:7}]}],[{...h.target('target opponent'),min:0,unbounded:true}]);
 if(line==='Shuffle all creature cards from target player\'s graveyard into that player\'s library.')return body([{action:'library-zone-shuffle-v8',who:0,zones:['graveyard'],filterV18:h.target('target creature card from a graveyard')}],[h.target('target player')]);
 const blast=/^(.+) deals ([0-9]+) damage to target player and each creature that player controls\.$/.exec(line);
 if(blast&&[card.name,'this permanent','this creature','this enchantment','this artifact'].includes(blast[1]))return body([{action:'damage-batch',hits:[{target:0,n:Number(blast[2])},{filters:[h.target('target creature')],controllerPlayerV17:{target:0},n:Number(blast[2])}]}],[h.target('target player')]);
 if(line===card.name+' deals five times X damage to each of up to X targets.')return body([{action:'damage',target:0,n:{kind:'sum',values:['X','X','X','X','X']}}],[{...h.target('any target'),min:0,max:0,targetCountX:true}]);
 if(line==='Prevent all damage that would be dealt to you this turn by attacking creatures.')return body([{action:'prevent-all',direction:'to',combat:'any',player:'you',sourceFilters:[h.target('target attacking creature')]}]);
 if(line==='Counter all other spells. Draw a card for each spell countered this way.')return body([{action:'counter-spells',filter:h.target('target spell'),drawCounteredV18:true}]);
 const damaged=/^Target player dealt damage by this creature this turn loses ([0-9]+) life\.$/.exec(line);
 if(damaged)return body([{action:'lose-life',who:0,n:Number(damaged[1])}],[h.target('target player dealt damage by this creature this turn')]);
 if(line==="Mill a card, then draw cards equal to the milled card's mana value.")return body([{action:'with-card-results-v8',event:'mill',effects:[{action:'mill',who:'you',n:1}],clauses:[{action:'result-each-v16',filter:h.target('target card from a graveyard'),effects:[{action:'draw',who:'you',n:{kind:'result-stat-v18',stat:'mv'}}]}]}]);
 const returned=/^Return (target (?:spell or creature|spell or permanent)(?: with mana value [0-9]+ or greater)?) to its owner's hand\.$/.exec(line);
 if(returned){const target=h.target(returned[1]);if(target)return body([{action:'bounce',target:0}],[target]);}
 return v17.extensionEffect(card,line,h);
}
