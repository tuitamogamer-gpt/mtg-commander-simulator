// Closed inspected cohorts retain every choice, qualification and follow-up.
import {extensionEffect as libraryEffect,libraryFilter} from './oracle-v8-library.mjs';
import {compileFaces} from './oracle-v8-faces.mjs';
const N='(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|[0-9]+|X)';
const escape=text=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const closed=body=>body&&!body.optional&&!body.v4Body&&body.effects?.length&&Array.isArray(body.targets);
const body=effect=>({targets:[],effects:[effect],optional:false});
function quality(text,h){
 const normalized=text.replace(/\bcards\b/g,'card').replace(/ and\/or /g,' or ').replace(/\bor an? /g,'or '),direct=libraryFilter(normalized,h)?.filter;
 if(direct)return direct;
 if(normalized==='card with {X} in its mana cost')return {what:'card',zone:'graveyard',controller:'you',min:1,hasXManaV25:true};
 if(normalized==='card that has an Adventure'||normalized==='card that have an Adventure')return {what:'card',zone:'graveyard',controller:'you',min:1,hasAdventureV25:true};
 if(normalized==='creature card with an even mana value')return {...quality('creature card',h),evenMVV25:true};
 // Enumerated alternative card qualities are independently admitted; an "or"
 // inside a comparison remains part of that comparison.
 const suffix=/^(.*?)( (?:creature |permanent )?card(?: with .+)?)$/.exec(normalized);
 if(suffix&&/, | or /.test(suffix[1])&&!/\bwith\b/.test(suffix[1])){
  const parts=suffix[1].split(/,? or |, /).filter(Boolean);
  if(parts.length>1&&parts.length<=8){const alternatives=parts.map(part=>quality(part+suffix[2],h));if(alternatives.every(Boolean))return {what:'card',zone:'graveyard',controller:'you',min:1,alternatives};}
 }
 const pieces=normalized.split(' or ');
 if(pieces.length>1&&pieces.length<=8&&pieces.every(p=>/\bcard\b/.test(p))){const alternatives=pieces.map(p=>quality(p,h));if(alternatives.every(Boolean))return {what:'card',zone:'graveyard',controller:'you',min:1,alternatives};}
 return null;
}
function native(card,line,h){return libraryEffect(card,line,{...h,target:text=>{
 const match=/^target (.+?) from your graveyard$/.exec(text);
 return h.target(text)??(match?quality(match[1],{...h,target:t=>h.target(t)}):null);
}});}
const program=(parsed,modify)=>closed(parsed)&&!parsed.targets.length&&parsed.effects.length===1&&parsed.effects[0].action==='library-select-v8'?body(modify({...parsed.effects[0],action:'library-program-v25'})):null;
export function extensionEffect(card,line,h){
 const category=/^(Look at|Reveal) the top (one|two|three|four|five|six|seven|eight|nine|ten|[0-9]+) cards of your library\. For each (color pair|card type), (choose a card that's exactly those colors from among them|you may put a card of that type from among the revealed cards into your hand)\. (?:Put the chosen cards into your hand and|Put) the rest on the bottom of your library in a random order\.$/.exec(line);
 const history=/^Reveal the top (one|two|three|four|five|six|seven|eight|nine|ten|[0-9]+) cards of your library\. For each card type among noncreature spells you've cast this turn, you may put a card of that type from among the revealed cards into your hand\. Put the rest on the bottom of your library in a random order\.$/.exec(line);
 if(history){const n={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10}[history[1]]??Number(history[1]);return body({action:'library-category-v25',n,visibility:'reveal',category:'cast-noncreature-types',required:false,rest:'bottom-random'});}
 if(category&&(category[3]==='color pair')===category[4].startsWith('choose')){const n={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10}[category[2]]??Number(category[2]);return body({action:'library-category-v25',n,visibility:category[1].toLowerCase(),category:category[3]==='color pair'?'color-pair':'card-type',required:category[3]==='color pair',rest:'bottom-random'});}
 const triple=/^Look at the top (one|two|three|four|five|six|seven|eight|nine|ten|[0-9]+) cards of your library\. You may reveal an? (.+? card), an? (.+? card), and\/or an? (.+? card) from among them and put them into your hand\. Put the rest on the bottom of your library in a random order\.$/.exec(line);
 if(triple){const filters=triple.slice(2).map(text=>quality(text,h));if(filters.every(Boolean)){const n={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10}[triple[1]]??Number(triple[1]);return body({action:'library-program-v25',n,visibility:'look',selections:filters.map(filter=>({filter,max:1,required:false,destination:'hand',reveal:true})),rest:{destination:'bottom',random:true}});}}
 // Separate singular objects permit one card for each quality. A single
 // “creature and/or land card” instead denotes one union-qualified object.
 const pair=/^((?:Look at|Reveal) the top (?:one|two|three|four|five|six|seven|eight|nine|ten|[0-9]+|X) cards of your library\.|Reveal that many cards from the top of your library\.) You may put an? (.+? card) and\/or an? (.+? card) from among them (into your hand|onto the battlefield(?: tapped)?)\. Put the rest (into your graveyard|on the bottom(?: of your library)? in (?:any|a random) order)\.$/.exec(line);
 if(pair){const filters=[quality(pair[2],h),quality(pair[3],h)],prefix=pair[1].startsWith('Reveal that many')?'Reveal the top X cards of your library.':pair[1],parsed=native(card,prefix+' You may put a '+pair[2]+' from among them '+pair[4]+'. Put the rest '+pair[5]+'.',h);if(filters.every(Boolean)&&closed(parsed)&&!parsed.targets.length&&parsed.effects.length===1&&parsed.effects[0].action==='library-select-v8')return body({...parsed.effects[0],action:'library-program-v25',...(pair[1].startsWith('Reveal that many')?{n:{kind:'event-amount'}}:{}),selections:filters.map(filter=>({...parsed.effects[0].selections[0],filter}))});return null;}
 const damageCards=/^Reveal that many cards from the top of your library\. (.+)$/.exec(line);
 if(damageCards){const parsed=native(card,'Reveal the top X cards of your library. '+damageCards[1],h);if(closed(parsed)&&!parsed.targets.length&&parsed.effects.length===1&&parsed.effects[0].action==='library-select-v8')return body({...parsed.effects[0],n:{kind:'event-amount'}});}
 const milled=new RegExp('^(Shuffle your library, then )?(?:Mill|mill) (a card|('+N+') cards)(?:, then |\\. (?:Then |then )?)(You may |you may )?(?:Put|put|Return|return) (a|an|one|two|three|four|five|[0-9]+|up to (?:one|two|three|four|five|[0-9]+)|any number of|all|each) (.+?) (?:from among (?:the milled cards|the cards milled this way)|milled this way) (into your hand|to your hand|onto the battlefield(?: tapped)?|on top of your library)(?: under your control)?\\.(.*)$').exec(line);
 if(milled){const filter=quality(milled[6],h),count=t=>({a:1,an:1,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,twenty:20}[t]??(t==='X'?'X':Number(t))),maximum=/^(all|each|any number of)$/.test(milled[5])?'all':count(milled[5].replace(/^up to /,'')),tail=milled[8];
  let elseEffects,lessonLife,haste,delayed;
  if(tail===' If you don\'t, put a +1/+1 counter on this creature.'||tail===' If you can\'t, create a Treasure token.'){const parsed=h.effect(card,tail.startsWith(' If you can')?'Create a Treasure token.':'Put a +1/+1 counter on this creature.');if(!closed(parsed)||parsed.targets.length)return null;elseEffects=parsed.effects;}
  else if(tail===' You gain 2 life if a Lesson card is milled this way.')lessonLife=2;
  else if(tail===" They gain haste. At the beginning of the next end step, return those creatures to their owner's hand."){haste=true;delayed='hand';}
  else if(tail)return null;
  if(filter&&maximum!==undefined)return body({action:'mill-cohort-v25',who:'you',n:milled[2]==='a card'?1:count(milled[3]),filter,max:maximum,required:!milled[4]&&!/^up to |^any number of/.test(milled[5]),destination:milled[7].includes('battlefield')?'battlefield':milled[7].includes('library')?'top':'hand',tapped:milled[7].endsWith(' tapped'),shuffle:!!milled[1],...(elseEffects?{elseEffects}:{}),...(lessonLife?{lessonLife}:{}),...(haste?{haste,delayed}:{})});
 }
 const eachMilled=/^Each player mills (one|two|three|four|five|[0-9]+) cards\. Put (a|an) (.+? card(?: with .+?)?) from among the milled cards onto the battlefield under your control\.$/.exec(line);
 if(eachMilled){const filter=quality(eachMilled[3],h),n={one:1,two:2,three:3,four:4,five:5}[eachMilled[1]]??Number(eachMilled[1]);if(filter)return body({action:'mill-cohort-v25',who:'each-player',n,filter,max:1,required:true,destination:'battlefield'});}
 const counters=/^Choose up to one target creature\. Put a \+1\/\+1 counter and a counter from among (.+) on it\.$/.exec(line);
 if(counters){const choices=counters[1].replace(/, or /,', ').split(', ').flatMap(p=>p.split(' or '));if(choices.length>=2&&choices.length<=10&&new Set(choices).size===choices.length&&choices.every(k=>['flying','first strike','double strike','deathtouch','haste','hexproof','indestructible','lifelink','menace','reach','trample','vigilance'].includes(k))){const parsed=h.effect(card,'Put a +1/+1 counter on up to one target creature.');if(closed(parsed)&&parsed.targets.length===1)return {...parsed,effects:[...parsed.effects,{action:'counter-choice-v25',target:0,choices}]};}}
 const front=/^Exile (.+?), then return (?:it|him|her|that card) to the battlefield (?:\(front face up\)|front face up)(?: under (your|its owner's) control)?\.$/.exec(line);
 if(front&&card.oracleTransformFacesV20&&[card.name,card.name.split(',')[0],'this Saga','this creature','this permanent','this enchantment'].includes(front[1]))return body({action:'return-front-source-v25',controller:front[2]==='your'?'you':'owner'});
 const choice=/^Choose land or nonland\. (Reveal cards from the top of your library until you reveal a card of the chosen kind\. Put that card into your hand and the rest on the bottom of your library in a random order\.)$/.exec(line);
 if(choice)return body({action:'library-kind-until-v25',choices:['land','nonland'],destination:'hand',rest:'bottom-random'});
 const pluralUntil=/^(Reveal cards from the top of your library until you reveal (one|two|three|four|five|six|[0-9]+) (.+? cards))\. Put the (.+? cards) revealed this way (into your hand|onto the battlefield(?: tapped)?), then put the rest of the revealed cards on the bottom of your library in (any|a random) order\.$/.exec(line);
 if(pluralUntil&&pluralUntil[3]===pluralUntil[4])return native(card,pluralUntil[1]+'. Put all '+pluralUntil[4]+' revealed this way '+pluralUntil[5]+' and the rest on the bottom of your library in '+pluralUntil[6]+' order.',h);
 const surge=/^(Destroy target permanent an opponent controls\.) Its controller reveals cards from the top of their library until they reveal a permanent card that shares a card type with that permanent\. They put that card onto the battlefield and the rest on the bottom of their library in a random order\.$/.exec(line);
 if(surge){const prefix=h.effect(card,surge[1]),filter=quality('permanent card',h);if(closed(prefix)&&prefix.targets.length===1&&prefix.effects.length===1&&prefix.effects[0].action==='destroy'&&filter)return {targets:prefix.targets,effects:[...prefix.effects,{action:'library-program-v25',who:{kind:'target-controller',index:0},chooser:'owner',until:{n:1,filter,sharesTargetTypeV25:0},visibility:'reveal',selections:[{filter,max:'all',required:true,destination:'battlefield',sharesTargetTypeV25:0}],rest:{destination:'bottom',random:true}}]};}
 const oracle=/^((?:Look at|Reveal) the top X cards of your library, where X is your devotion to (white|blue|black|red|green)\. Put up to one of them on top of your library and the rest on the bottom of your library in a random order)\. If X is greater than or equal to the number of cards in your library, you win the game\.$/.exec(line);
 if(oracle)return program(native(card,oracle[1]+'.',h),e=>({...e,winLibraryAtMostV25:e.n}));
 const entered=new RegExp('^((?:Look at|Reveal) the top .+?\\. You may put .+? onto the battlefield)( tapped)? and attacking( that player)?\\.( (?:It|That creature) gains (indestructible|hexproof|haste) until end of turn\\.)? Put the rest(?: of the cards)? on the bottom of your library in (any|a random) order\\.$').exec(line);
 if(entered){const parsed=native(card,entered[1]+(entered[2]||'')+'. Put the rest on the bottom of your library in '+entered[6]+' order.',h);return program(parsed,e=>({...e,selections:e.selections.map(s=>({...s,attackingV25:entered[3]?'event-player':'choose',...(entered[5]?{keywordsV25:[entered[5]]}:{})}))}));}
 const counter=/^((?:Look at|Reveal) the top .+?\. You may put .+? onto the battlefield)( tapped)? with (a|an|one|two|three|four|five|[0-9]+) (\+1\/\+1|shield|flying|vigilance|trample|haste|lifelink|deathtouch|finality) counters? on (?:it|them)\. Put the rest on the bottom of your library in (any|a random) order\.$/.exec(line);
 if(counter){const n={a:1,an:1,one:1,two:2,three:3,four:4,five:5}[counter[3]]??Number(counter[3]),parsed=native(card,counter[1]+(counter[2]||'')+'. Put the rest on the bottom of your library in '+counter[5]+' order.',h);return program(parsed,e=>({...e,selections:e.selections.map(s=>({...s,additionalCountersV25:{[counter[4]]:n}}))}));}
 const follow=/^((?:Look at|Reveal) the top .+?\. You may reveal .+? from among them and put (?:it|them|that card|those cards) into your hand)\. If (it's legendary|it is legendary), you gain ([0-9]+) life\. Put the rest on the bottom of your library in (any|a random) order\.$/.exec(line);
 if(follow){const parsed=native(card,follow[1]+'. Put the rest on the bottom of your library in '+follow[4]+' order.',h);return program(parsed,e=>({...e,selectedLegendaryLifeV25:Number(follow[3])}));}
 const taste=/^((?:Look at|Reveal) the top .+?\. Put one of them into your hand and the rest into your graveyard)\. You gain life equal to the greatest power among creature cards put into your graveyard this way\.$/.exec(line);
 if(taste)return program(native(card,taste[1]+'.',h),e=>({...e,graveyardGreatestPowerLifeV25:true}));
 const madcap=new RegExp('^(Reveal cards from the top of your library until you reveal an? .+? card\\. Put that card onto the battlefield and the rest on the bottom of your library in (?:any|a random) order)\\. ('+[card.name,card.name.split(',')[0],'this creature','this artifact','this spell'].map(escape).join('|')+') deals damage to you equal to the number of cards revealed this way\\.$').exec(line);
 if(madcap)return program(native(card,madcap[1]+'.',h),e=>({...e,revealedCountDamageV25:true}));
 const fallback=/^((?:Look at|Reveal) the top .+?\. You may put a .+? card from among them onto the battlefield(?: tapped)?)\. If you don't, put a card from among them into your hand\. Put the rest on the bottom of your library in (any|a random) order\.$/.exec(line);
 if(fallback)return program(native(card,fallback[1]+'. Put the rest on the bottom of your library in '+fallback[2]+' order.',h),e=>({...e,fallbackHandV25:true}));
 const dynamic=/^((?:Look at|Reveal) the top .+?\.) You may reveal (?:a|an) (.+? card) from among them and put (?:it|that card) into your hand\. If (.+?), you may instead reveal (two|three|[0-9]+) (.+? cards) from among them and put them into your hand\. Put the rest on the bottom of your library in (any|a random) order\.$/.exec(line);
 if(dynamic){const condition=h.condition(dynamic[3]),first=native(card,dynamic[1]+' You may reveal a '+dynamic[2]+' from among them and put it into your hand. Put the rest on the bottom of your library in '+dynamic[6]+' order.',h),second=native(card,dynamic[1]+' You may reveal '+dynamic[4]+' '+dynamic[5]+' from among them and put them into your hand. Put the rest on the bottom of your library in '+dynamic[6]+' order.',h);if(condition&&closed(first)&&closed(second)&&!first.targets.length&&!second.targets.length)return {targets:[],effects:[{action:'conditional',condition,effects:second.effects,elseEffects:first.effects}]};}
 // Canonical native descriptors gain bounded unions and literal X mana-symbol
 // qualifications; their ordinary destinations remain the established runtime.
 const supplemental=native(card,line,h);
 if(closed(supplemental)&&supplemental.effects.some(e=>JSON.stringify(e).includes('hasXManaV25')))return program(supplemental,e=>e);
 return supplemental;
}
export function extensionLine(card,line,h){
 const granted=/^(Equipment|Vehicles) you control have (equip ((?:\{(?:[0-9]+|[WUBRGC])\})+)|crew ([0-9]+))\.$/.exec(line);
 if(granted&&(granted[1]==='Equipment')===(!!granted[3]))return {kind:'grant-native-activation-v25',subtype:granted[1]==='Equipment'?'Equipment':'Vehicle',ability:granted[1]==='Equipment'?'equip':'crew',cost:granted[3]||Number(granted[4]),contract:'grant-native-activation-v25'};
 const cub=/^(?:[A-Za-z' -]+ — )?Whenever this creature attacks a player who controls (one|two|three|four|five|six|seven|eight|nine|ten|[0-9]+) or more lands, (.+)$/.exec(line);
 if(cub){const parsed=h.line(card,'Whenever this creature attacks, '+cub[2]),minimum={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10}[cub[1]]??Number(cub[1]);if(parsed?.kind==='generic-trigger'&&closed(parsed))return {...parsed,eventFilter:{kind:'attack-player-land-count-v25',min:minimum},contract:'attack-player-land-count-v25'};}
 return null;
}
export function extensionTarget(){return null;}
export function extensionCost(){return null;}
export function compileWholeCard(card,h){
 if(card.layout!=='transform'||card.card_faces?.length!==2||!card.card_faces.some(f=>/front face up/.test(f.oracle_text||'')))return null;
 return compileFaces(card,{...h,compile:face=>h.compile({...face,layout:/\bSaga\b/.test(face.type_line)?'saga':'normal',oracleTransformFacesV20:true,oracleTransformNameV20:face.name}),dayNight:true,allowLandTransition:true,allowModalTransform:true});
}
export function modifierOperation(...args){return extensionLine(...args);}
export function normalizeCard(card){const face=f=>({...f,oracle_text:String(f.oracle_text||'').replace(/\(front face up\)/g,'front face up')});return {...face(card),...(card.card_faces?{card_faces:card.card_faces.map(face)}:{})};}
export function finalizeCompilation(card,result){return result;}
