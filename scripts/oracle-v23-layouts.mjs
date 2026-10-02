const escape=text=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const quantity=text=>({one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10}[text]??Number(text));
const nouns=card=>[card.name,card.name.split(',')[0],'this card','this spell','this creature','this permanent'];
const N='(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|[0-9]+|X)';
const number=text=>text==='X'?'X':({eleven:11,twelve:12,twenty:20}[text]??quantity(text));
const complete=body=>body&&!body.v4Body&&!body.optional&&Array.isArray(body.effects)&&body.effects.length&&Array.isArray(body.targets);
const copy=value=>structuredClone(value);
const cardFilter=(text,h)=>{const phrase=text.replace(/\bcards\b/g,'card'),filter=h.target('target '+phrase+' from your graveyard');return filter?.zone==='graveyard'?filter:null;};
function inspectConditional(card,line,h){
 // The alternative is an entire library program. Resolve the cast/board
 // condition before inspecting any card, rather than running both choices.
 const suffix=/^(.+?Put (?:one|two) of (?:them|those cards) into your hand and the rest on the bottom of your library in (?:any|a random) order\.) If (.+?), (?:instead )?put (each|two) of (?:them|those cards) into your hand(?: instead)?(?: and the rest on the bottom of your library in (?:any|a random) order)?\.$/.exec(line);
 const kicked=/^((?:Look at|Reveal) the top .+?cards of your library(?:, where X is .+?)?\.) Put one of those cards into your hand\. If (.+?), put two of those cards into your hand instead\. Put the rest on the bottom of your library in (any|a random) order\.$/.exec(line);
 const trailing=/^(.+?Put one of (?:them|those cards) into your hand and the rest on the bottom of your library in any order\.) Put each of those cards into your hand instead if (.+?)\.$/.exec(line);
 let first,second,condition;
 if(suffix){condition=h.condition(suffix[2]);first=h.effect(card,suffix[1]);second=h.effect(card,suffix[1].replace(/Put (one|two) of (them|those cards) into your hand and the rest on the bottom of your library in (any|a random) order\.$/,'Put '+(suffix[3]==='each'?'all':'two')+' of those cards into your hand'+(suffix[3]==='each'?'': ' and the rest on the bottom of your library in '+(/a random order\.$/.test(suffix[1])?'a random':'any')+' order')+'.'));}
 if(kicked){condition=h.condition(kicked[2]);first=h.effect(card,kicked[1]+' Put one of those cards into your hand and the rest on the bottom of your library in '+kicked[3]+' order.');second=h.effect(card,kicked[1]+' Put two of those cards into your hand and the rest on the bottom of your library in '+kicked[3]+' order.');}
 if(trailing){condition=h.condition(trailing[2]);first=h.effect(card,trailing[1]);second=h.effect(card,trailing[1].replace(/Put one of (them|those cards) into your hand and the rest on the bottom of your library in any order\.$/,'Put all of those cards into your hand.'));}
 if(condition&&complete(first)&&complete(second)&&!first.targets.length&&!second.targets.length)return {targets:[],effects:[{action:'conditional',condition,effects:second.effects,elseEffects:first.effects}]};
 return null;
}
export function extensionEffect(card,line,h){
 const inspected={kind:'inspected-stat-v23',stat:'mv'};
 const vapors=new RegExp('^Reveal the top ('+N+') cards of your library and put one of them into your hand\\. You gain life equal to that card\'s mana value\\. Put all other cards revealed this way into your graveyard\\.$').exec(line);
 if(vapors)return {targets:[],effects:[{action:'library-followup-v23',n:number(vapors[1]),visibility:'reveal',selectedDestination:'hand',rest:'graveyard',followup:[{action:'gain-life',who:'you',n:inspected}]}]};
 const life=/^Reveal the top card of your library and put (?:that card|it) into your hand\. (You lose life|Each opponent loses life) equal to its mana value\.( You may repeat this process any number of times\.)?$/.exec(line);
 if(life)return {targets:[],effects:[{action:'library-followup-v23',n:1,visibility:'reveal',selectedDestination:'hand',rest:'stay',repeat:!!life[2],followup:[{action:'lose-life',who:life[1]==='You lose life'?'you':'each-opponent',n:inspected}]}]};
 if(line==='Look at the top card of your library. You may reveal that card and put it into your hand. If you do, you lose life equal to its mana value.')return {targets:[],effects:[{action:'library-followup-v23',n:1,visibility:'look',selectedDestination:'hand',selectedReveal:true,optionalSelection:true,rest:'stay',followup:[{action:'lose-life',who:'you',n:inspected}]}]};
 const selfDamage=new RegExp('^Reveal the top card of your library and put (?:that card|it) into your hand\\. ('+nouns(card).map(escape).join('|')+') deals damage to (?:himself|itself|this planeswalker) equal to that card\'s mana value\\.$').exec(line);
 if(selfDamage)return {targets:[],effects:[{action:'library-followup-v23',n:1,visibility:'reveal',selectedDestination:'hand',rest:'stay',followup:[{action:'damage',target:'self',n:inspected}]}]};
 const untilDamage=new RegExp('^Choose (any target|target creature)\\. Reveal cards from the top of your library until you reveal a nonland card\\. (?:('+nouns(card).map(escape).join('|')+') deals damage equal to that card\'s mana value to that permanent or player|(That creature) gets \\+X/-X until end of turn, where X is that card\'s mana value)\\. Put (?:the nonland card into your hand and the rest|all cards revealed this way) on the bottom of your library in any order\\.$').exec(line);
 if(untilDamage){const target=untilDamage[1]==='any target'?h.effect(card,card.name+' deals 1 damage to any target.')?.targets?.[0]:h.target(untilDamage[1]),filter=cardFilter('nonland card',h);if(target&&filter)return {targets:[target],effects:[{action:'library-followup-v23',until:filter,visibility:'reveal',selectedDestination:untilDamage[2]?'hand':'stay',afterFollowup:true,rest:'bottom',followup:untilDamage[2]?[{action:'damage',target:0,n:inspected}]:[{action:'pump',target:0,power:inspected,toughness:{kind:'signed',sign:-1,value:inspected},keywords:[]}]}]};}
 if(line==="Reveal cards from the top of your library until you reveal a nonland card. This creature gets +X/+0 until end of turn, where X is that card's mana value. Put the revealed cards on the bottom of your library in any order.")return {targets:[],effects:[{action:'library-followup-v23',until:cardFilter('nonland card',h),visibility:'reveal',selectedDestination:'stay',afterFollowup:true,rest:'bottom',followup:[{action:'pump',target:'self',power:inspected,toughness:0,keywords:[]}]}]};
 const conditional=inspectConditional(card,line,h);if(conditional)return conditional;
 const triple=/^Look at the top three cards of your library\. Put one of those cards into your hand, one into your graveyard, and one on the bottom of your library\.$/.exec(line);
 if(triple)return {targets:[],effects:[{action:'library-select-v8',n:3,visibility:'look',selections:[{max:1,required:true,destination:'hand',reveal:false},{max:1,required:true,destination:'graveyard',reveal:false}],rest:{destination:'bottom',random:false}}]};
 const dual=new RegExp('^(Look at|Reveal) the top ('+N+') cards of your library\\. You may put a (.+? card) and/or a (.+? card) from among them into your hand\\. Put the rest (into your graveyard|on the bottom of your library in (?:any|a random) order)\\.$').exec(line);
 if(dual){const filters=[cardFilter(dual[3],h),cardFilter(dual[4],h)];if(filters.every(Boolean))return {targets:[],effects:[{action:'library-dual-select-v23',n:number(dual[2]),visibility:dual[1]==='Reveal'?'reveal':'look',filters,rest:dual[5]==='into your graveyard'?'graveyard':dual[5].endsWith('a random order')?'bottom-random':'bottom'}]};}
 if(line==='Reveal the top X plus one cards of your library. Choose a creature card and/or a land card from among them. Put those cards into your hand and the rest on the bottom of your library in a random order. If X is 5 or more, instead put the chosen cards onto the battlefield or into your hand and the rest on the bottom of your library in a random order.')return {targets:[],effects:[{action:'library-dual-select-v23',n:{kind:'sum',values:['X',1]},visibility:'reveal',filters:[cardFilter('creature card',h),cardFilter('land card',h)],rest:'bottom-random',required:true,destinationChoiceMinX:5}]};
 const time=/^(Remove|Put) (one|two|three|four|five|six|seven|eight|nine|ten|[0-9]+) time counters? (from|on) (target permanent(?: with a time counter on it)? or suspended card)\.$/.exec(line);
 if(time&&(time[1]==='Remove')===(time[3]==='from')){const target=extensionTarget(time[4],h);if(target)return {targets:[target],effects:[{action:'time-counter-v23',target:0,n:quantity(time[2]),remove:time[1]==='Remove'}]};}
 if(line==="Until your next turn, creatures can't attack you.")return {targets:[],effects:[{action:'prevent-attack-player-v23',duration:'next-turn'}]};
 const suspend=new RegExp('^Exile ('+nouns(card).map(escape).join('|')+') with (one|two|three|four|five|six|seven|eight|nine|ten|[0-9]+) time counters? on it\\.$').exec(line);
 if(suspend&&/^Suspend (?:[1-9][0-9]*|X)—/m.test(h.stripReminderText?.(card.oracle_text)||card.oracle_text||''))return {targets:[],effects:[{action:'self-resuspend-v23',n:quantity(suspend[2])}]};
 const spell=/^That spell deals (.+?) damage to (.+)\.$/i.exec(line);
 if(spell){const parsed=h.effect(card,card.name+' deals '+spell[1]+' damage to '+spell[2]+'.');if(parsed&&!parsed.v4Body&&!parsed.optional&&parsed.effects.every(e=>e.action==='damage'&&!e.sourceTarget))return {...parsed,effects:parsed.effects.map(e=>({...e,source:'event-card'}))};}
 return null;
}
export function extensionLine(card,line,h){
 const last=/^When the last time counter is removed from this card while it's exiled, (.+)$/.exec(line);
 if(last){const trigger=h.line(card,'When the last time counter is removed from '+card.name+', '+last[1]);if(trigger?.kind==='generic-trigger'&&trigger.event==='countersRemoved'&&trigger.effects?.length&&!trigger.v4Body)return {...trigger,zone:'exile'};}
 if(line==='Cumulative upkeep {S}')return {kind:'mechanic-cumulative-upkeep',cost:'{S}',contract:'mechanic-cumulative-upkeep'};
 return null;
}
export function modifierOperation(...args){return extensionLine(...args);}
export function extensionCost(text,h){
 const groups=/^(.*?)Sacrifice a (white|blue|black|red|green) creature, a (white|blue|black|red|green) creature, and a (white|blue|black|red|green) creature$/.exec(text);
 if(!groups)return null;
 const prefix=groups[1].replace(/, $/,''),cost=prefix?h.cost(prefix):{};
 const filters=groups.slice(2).map(color=>h.target('target '+color+' creature you control'));
 if(!cost||Object.keys(cost).some(key=>!['mana','tap'].includes(key))||!filters.every(Boolean))return null;
 return {...cost,oracleSacrificeGroupsV23:filters};
}
export function extensionTarget(text,h){
 const match=/^target permanent( with a time counter on it)? or suspended card$/.exec(text);
 if(!match)return null;
 const battlefield=h.target('target permanent');
 if(!battlefield)return null;
 return {what:'card',zone:'mixed-v18',controller:'any',min:1,alternatives:[{...battlefield,...(match[1]?{hasCounter:'time'}:{})},{what:'card',zone:'exile',controller:'any',suspendedV20:true,min:1}]};
}
export function finalizeCompilation(card,result){
 if(!result.semanticClass)return result;
 const visit=value=>{if(!value||typeof value!=='object')return;if(value.kind==='mechanic-suspend')value.optionalV23=true;for(const child of Object.values(value))if(Array.isArray(child))child.forEach(visit);else if(child&&typeof child==='object')visit(child);};
 visit(result.implementation);return result;
}
export function normalizeCard(card){return card;}
export function compileWholeCard(){return null;}
