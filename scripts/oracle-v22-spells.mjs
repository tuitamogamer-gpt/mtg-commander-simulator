// Additive spell systems; each accepted form retains every printed instruction.
const N='(?:one|two|three|four|five|six|seven|eight|nine|ten|[0-9]+)',number=value=>({one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10}[value]??Number(value));
const body=(effects,targets=[])=>targets.every(Boolean)?{effects,targets,optional:false}:null;
const complete=value=>value&&!value.optional&&!value.v4Body&&Array.isArray(value.targets)&&Array.isArray(value.effects);
const map=(value,fn)=>Array.isArray(value)?value.map(v=>map(v,fn)):value&&typeof value==='object'?fn(Object.fromEntries(Object.entries(value).map(([k,v])=>[k,map(v,fn)]))):value;
// A resolution choice prepends its own permanent before the outer spell targets.
// Preserve that local slot while shifting references to announced spell targets.
const offset=(value,n,local=0)=>Array.isArray(value)?value.map(item=>offset(item,n,local)):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,(['target','who','otherTarget','sourceTarget','conditionTarget'].includes(key)||key==='index'&&['target-controller','target-owner','locked-player'].includes(value.kind))&&typeof item==='number'?item<local?item:item+n:offset(item,n,local+(value.action==='choose-source-v20'&&key==='effects'?1:0))])):value;
export function extensionTarget(text,h){
 const total=new RegExp('^((?:up to '+N+'|any number of|'+N+') target .+? cards?) with total mana value ([0-9]+) or less( from (?:your|a|an opponent\'s) graveyard)$').exec(text);
 if(total){const base=h.target(total[1]+total[3]);if(base?.zone==='graveyard')return {...base,groupV22:{test:'total-mana-value',max:Number(total[2])}};}
 const shared=new RegExp('^((?:'+N+') target creature cards) that share a creature type( from (?:your|a|an opponent\'s) graveyard)$').exec(text);
 if(shared){const base=h.target(shared[1]+shared[2]);if(base?.zone==='graveyard')return {...base,groupV22:{test:'shared-creature-type'}};}
 const named=new RegExp('^((?:up to '+N+'|any number of|'+N+') target .+? cards?) with different names( from (?:your|a|an opponent\'s) graveyard)$').exec(text);
 if(named){const base=h.target(named[1]+named[2]);if(base?.zone==='graveyard')return {...base,groupV22:{test:'different-names'}};}
 const mv=new RegExp('^((?:up to '+N+'|any number of|'+N+'|X) target .+? cards?) with different mana values( from (?:your|a|an opponent\'s) graveyard)$').exec(text);
 if(mv){const base=h.target(mv[1]+mv[2]);if(base?.zone==='graveyard')return {...base,groupV22:{test:'different-mana-values'}};}
 return null;
}
export function extensionEffect(card,line,h){
 if(line==="Put three +1/+1 counters on a Cave you control. It becomes a 0/0 Elemental creature with haste. It's still a land.")return body([{action:'choose-source-v20',filter:{what:'land',zone:'battlefield',controller:'you',min:1,subtype:'Cave'},effects:[{action:'counter',target:0,counter:'+1/+1',n:3},{action:'animate',target:0,power:0,toughness:0,types:['Creature'],subtypes:['Elemental'],keywords:['haste'],colors:null,retainTypes:true,temporary:false}]}]);
 const partition=/^Search your library( and graveyard)? for up to four (creature cards|land cards|cards) with different names( that each have mana value X or less)? and reveal them\. (Target opponent|An opponent) chooses two of those cards\. (Put the chosen cards into your graveyard and the rest into your hand\. (?:Then )?[Ss]huffle|Put the chosen cards into your graveyard and the rest onto the battlefield tapped, then shuffle|Shuffle the chosen cards into your library and put the rest onto the battlefield)\.(?: Exile (.+)\.)?$/.exec(line);
 if(partition){
  if(!!partition[1]!==!!partition[3]||partition[1]&&partition[2]!=='creature cards'||partition[1]&&partition[4]!=='An opponent'||partition[6]&&partition[6]!==card.name)return null;
  const filter=h.target('target '+partition[2].replace(/cards$/,'card')+' from your graveyard');if(filter)return body([{action:'partition-search-v22',filter,max:4,graveyard:!!partition[1],mvX:!!partition[3],opponent:partition[4]==='Target opponent'?0:'choose',chosen:partition[5].startsWith('Shuffle')?'library':'graveyard',rest:partition[5].includes('into your hand')?'hand':'battlefield',tapped:partition[5].includes('battlefield tapped'),...(partition[6]?{exileSource:true}:{})}],partition[4]==='Target opponent'?[h.target('target opponent')]:[]);
 }
 const graveAll=/^Return (?:to the battlefield all permanent cards in your graveyard that were put there from the battlefield this turn|to your hand all cards in your graveyard that you cycled or discarded this turn)\.$/.exec(line);
 if(graveAll){const filter=h.target(line.includes('permanent cards')?'target permanent card from your graveyard that were put there from the battlefield this turn':'target card from your graveyard that you cycled or discarded this turn');if(filter)return body([{action:'grave-all-return-v22',filter,destination:line.includes('battlefield all')?'battlefield':'hand'}]);}
 const brought=/^Choose (up to two target permanent cards in your graveyard that were put there from the battlefield this turn)\. Return them to the battlefield tapped\.$/.exec(line);
 if(brought)return body([{action:'grave-group-return-v22',target:0,destination:'battlefield',tapped:true,controller:'you'}],[h.target(brought[1])]);
 const counters=/^Return (up to two target creature cards with total mana value 3 or less from your graveyard) to the battlefield\. Put a deathtouch counter on either of them\. (?:Then )?put a menace counter on either of them\.$/i.exec(line);
 if(counters)return body([{action:'grave-return-choice-counters-v22',target:0,counters:['deathtouch','menace']}],[h.target(counters[1])]);
 const entryCounter=/^Return (target .+? card(?: with mana value [0-9]+ or less)? from your graveyard) to the battlefield with (?:a|an) (finality|flying|indestructible|hexproof|deathtouch|menace) counter(?: and (?:a|an) (finality|flying|indestructible|hexproof|deathtouch|menace) counter)? on it\.$/.exec(line);
 if(entryCounter)return body([{action:'reanimate',target:0,controller:'you',additionalCountersV9:Object.fromEntries([entryCounter[2],entryCounter[3]].filter(Boolean).map(counter=>[counter,1]))}],[h.target(entryCounter[1])]);
 if(line==='Create a 2/2 Citizen creature token that\'s all colors.')return body([{action:'token-inline',who:'you',n:1,token:{name:'Citizen',types:['Creature'],subtypes:['Citizen'],power:'2',toughness:'2',colors:['W','U','B','R','G'],keywords:[]}}]);
 if(line==='Choose artifact or enchantment. Destroy all permanents of the chosen type.'){
  const options=['artifact','enchantment'].map(key=>({key,label:key,effects:h.effect(card,'Destroy all '+key+'s.')?.effects}));if(options.every(option=>option.effects))return body([{action:'choice-table-v20',kind:'permanent type',options}]);
 }
 if(line==='Choose an artifact or creature you control. Create a token that\'s a copy of it.'){
  const parsed=h.effect(card,'Create a token that\'s a copy of target artifact or creature you control.');if(complete(parsed)&&parsed.targets.length===1)return body([{action:'choose-source-v20',filter:parsed.targets[0],effects:parsed.effects}]);
 }
 if(line==='Return each nonland, nontoken permanent to its owner\'s hand.')return body([{action:'battlefield-group',operation:'bounce',filters:[{what:'nonland permanent',zone:'battlefield',controller:'any',min:1,nontoken:true}]}]);
 const choice=new RegExp('^Return (up to '+N+'|any number of|a) (creature|permanent|artifact|enchantment|land|) ?cards?(?: with (total mana value ([0-9]+) or less|different mana values))? from your graveyard to (your hand|the battlefield)( tapped)?(?:\\. Put '+card.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+' on the bottom of its owner\'s library)?\\.$').exec(line);
 if(choice){const filter=h.target('target '+(choice[2]?choice[2]+' ':'')+'card from your graveyard');if(filter){const max=choice[1]==='any number of'?null:choice[1]==='a'?1:number(choice[1].slice(6)),group=choice[3]==='different mana values'?{test:'different-mana-values'}:choice[4]?{test:'total-mana-value',max:Number(choice[4])}:null;return body([{action:'grave-choice-v22',filter,min:choice[1]==='a'?1:0,max,destination:choice[5]==='your hand'?'hand':'battlefield',tapped:!!choice[6],...(group?{group}:{}),...(line.includes(' on the bottom of its owner')?{bottomSource:true}:{})}]);}}
 if(line==='Choose a creature card with mana value 1 in your graveyard, then do the same for creature cards with mana value 2 and 3. Return those cards to the battlefield.')return body([{action:'grave-mana-trio-v22'}]);
 if(line==='Return a creature card from your graveyard to the battlefield, then return another creature card from your graveyard to your hand.')return body([{action:'grave-choice-v22',filter:{what:'creature',zone:'graveyard',controller:'you',min:1},min:1,max:1,destination:'battlefield'},{action:'grave-choice-v22',filter:{what:'creature',zone:'graveyard',controller:'you',min:1},min:1,max:1,destination:'hand'}]);
 const returned=/^Return (.+?target .+?cards? (?:with .+? )?from (?:your|a|an opponent's) graveyard) to (your hand|the battlefield)( tapped)?(?: under (your|its owner's|their owners') control)?\.(?: Put (?:a|one) (\+1\/\+1|-1\/-1) counter on each of them\.)?$/.exec(line);
 if(returned){const target=h.target(returned[1]);if(target?.groupV22){const effect=returned[2]==='your hand'?{action:'bounce',target:0}:{action:'reanimate',target:0,controller:returned[4]==='your'?'you':'owner',tapped:!!returned[3]};return body([effect,...(returned[5]?[{action:'counter',target:0,counter:returned[5],n:1}]:[])],[target]);}}
 return null;
}
export function modalOperation(card,text,parseEffect){
 if(!/\b(?:Instant|Sorcery)\b/.test(card.type_line||''))return null;
 const repeat=new RegExp('^Choose (up to )?('+N+')\\. You may choose the same mode more than once\\.\\n(• .+(?:\\n• .+)+)$').exec(text),season=/^Choose up to five \{P\} worth of modes\. You may choose the same mode more than once\.\n((?:\{P\}){1,3} — .+(?:\n(?:\{P\}){1,3} — .+)+)$/.exec(text);
 if(!repeat&&!season)return null;
 const raw=(repeat?repeat[3]:season[1]).split('\n').map(line=>{const parts=/^((?:\{P\})+) — (.+)$/.exec(line);return {label:parts?parts[2]:line.slice(2),weight:parts?parts[1].length/3:1};}),maximum=repeat?number(repeat[2]):5,minimum=repeat&&!repeat[1]?maximum:0;
 if(raw.length>4||maximum>5)return null;
 const parsed=raw.map(mode=>({...mode,body:parseEffect(card,mode.label)}));if(parsed.some(mode=>!complete(mode.body)))return null;
 const plans=[];
 function visit(index,remaining,chosen){if(index===parsed.length){const spent=maximum-remaining;if(spent>=minimum)plans.push(chosen);return;}for(let n=0;n*parsed[index].weight<=remaining;n++)visit(index+1,remaining-n*parsed[index].weight,[...chosen,...Array(n).fill(index)]);}
 visit(0,maximum,[]);
 return {kind:'spell-modal-generic',choose:{min:1,max:1},modes:plans.map(indices=>{const targets=[],effects=[];for(const i of indices){effects.push(...offset(parsed[i].body.effects,targets.length));targets.push(...parsed[i].body.targets);}return {label:indices.length?indices.map(i=>parsed[i].label).join(' '):'Choose no modes',body:body(effects,targets),printedModesV22:indices};}),contract:'spell-repeat-modes-v22'};
}
