// Closed, additive spell clauses. References below bind only to the targets
// announced by the complete instruction that supplies their antecedent.
import {extensionCondition as parseCondition} from './oracle-extensions-v8.mjs';
const body=(effects,targets=[])=>targets.every(Boolean)?{effects,targets,optional:false}:null;
const complete=p=>p&&!p.optional&&!p.v4Body&&Array.isArray(p.targets)&&p.targets.every(Boolean)&&Array.isArray(p.effects);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const numbers={a:1,an:1,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10};
const number=x=>numbers[x]??(/^\d+$/.test(x)?Number(x):x);
const sentence=x=>x[0].toUpperCase()+x.slice(1).replace(/\.$/,'')+'.';
const plural=x=>x.replace(/\b(cards|creatures|artifacts|enchantments|permanents|lands|planeswalkers|tokens)\b/g,s=>s.slice(0,-1));
function map(node,fn){return Array.isArray(node)?node.map(x=>map(x,fn)):node&&typeof node==='object'?fn(Object.fromEntries(Object.entries(node).map(([k,v])=>[k,map(v,fn)]))):node;}
function refs(effects,from,to){return map(effects,node=>Object.fromEntries(Object.entries(node).map(([key,value])=>[key,['target','who','otherTarget','sourceTarget','conditionTarget'].includes(key)&&value===from?to:key==='index'&&['target-controller','target-owner','locked-player'].includes(node.kind)&&value===from?to:value])));}
function bound(effects,index,{stats=false}={}){
 return map(effects,node=>{
  if(['event-card-stat','source-stat'].includes(node.kind)&&stats)return {kind:'target-stat',target:index,stat:node.stat};
  return Object.fromEntries(Object.entries(node).map(([key,value])=>[key,['target','who','otherTarget','sourceTarget','conditionTarget'].includes(key)?['event-card','unbound-object-v10'].includes(value)?index:value==='event-card-controller'?{kind:'target-controller',index}:value==='event-card-owner'?{kind:'target-owner',index}:value:value]));
 });
}
const unbound=x=>/"(?:event-[^"]*|unbound-object-v10)"/.test(JSON.stringify(x));
export function normalizeCard(card){
 // Preserve subtype capitalization while making the quantity grammatical.
 const normalized=text=>String(text||'').replace(/(^|\n|\. )([Aa]ny number of target [^.]+?) (gain|get|lose) /g,(_all,prefix,targets,verb)=>prefix+'Each of '+targets[0].toLowerCase()+targets.slice(1)+' '+({gain:'gains',get:'gets',lose:'loses'}[verb])+' ');
 return {...card,oracle_text:normalized(card.oracle_text),...(card.card_faces?{card_faces:card.card_faces.map(face=>({...face,oracle_text:normalized(face.oracle_text)}))}:{})};
}

export function modalOperation(card,text,parseEffect,parseModal){
 if(!/\b(?:Instant|Sorcery)\b/.test(card.type_line||''))return null;
 const match=/^Choose one\. If (.+?), (?:you may )?choose (both|two|one or more|any number) instead\.\n(• .+(?:\n• .+)+)$/.exec(text);
 if(!match)return null;
 const conditionText=match[1].replace(/ as you cast this spell$/,''),condition=parseCondition(conditionText)||(/^an opponent has eight or more cards in their graveyard$/.test(conditionText)?{kind:'spell-mode-condition-v21',test:'opponent-graveyard',min:8}:null);
 const parsed=parseModal(card,'Choose one —\n'+match[3],(source,line)=>{
  const scaled=/^(Target player|Target opponent) creates an X\/X (white|blue|black|red|green|colorless) ([A-Z][A-Za-z -]+) creature token, where X is the number of cards in their hand\.$/.exec(line);
  if(scaled){const token=parseEffect(source,'Create an X/X '+scaled[2]+' '+scaled[3]+' creature token.');if(complete(token)&&!token.targets.length&&token.effects.length===1&&token.effects[0].action==='token-inline'){const size={kind:'count',zone:'hand',what:'card',controller:'you'};return body([{action:'player-or-controller-v21',target:0,asActor:true,effects:map(token.effects,node=>Object.fromEntries(Object.entries(node).map(([key,value])=>[key,['power','toughness'].includes(key)&&value==='X'?size:value])))}],[{what:scaled[1]==='Target opponent'?'opponent':'player',zone:'player',controller:'any',min:1}]);}}
  return parseEffect(source,line);
 });
 if(!condition||parsed?.kind!=='spell-modal-generic'||parsed.modes.some(mode=>!complete(mode.body)))return null;
 if(match[2]==='both'&&parsed.modes.length!==2)return null;
 const maximum=['both','two'].includes(match[2])?2:parsed.modes.length;
 const plans=[];for(let bits=1;bits<2**parsed.modes.length;bits++){const indices=parsed.modes.flatMap((_,i)=>bits&(2**i)?[i]:[]);if(indices.length<=maximum)plans.push(indices);}
 if(parsed.modes.length>4)return null;
 const modes=plans.map(indices=>{const targets=[],effects=[];for(const i of indices){const mode=parsed.modes[i];
   effects.push(...map(mode.body.effects,node=>Object.fromEntries(Object.entries(node).map(([key,value])=>[key,['target','who','otherTarget','sourceTarget','conditionTarget'].includes(key)&&typeof value==='number'?value+targets.length:key==='index'&&['target-controller','target-owner','locked-player'].includes(node.kind)&&typeof value==='number'?value+targets.length:value]))));targets.push(...mode.body.targets);}
  return {label:indices.map(i=>parsed.modes[i].label).join(' '),body:body(effects,targets),...(indices.length>1?{castConditionV21:condition}:{}),printedModesV21:indices};});
 return {...parsed,modes,contract:'spell-conditional-modes-v21'};
}

// Compile both complete spell bodies before changing target announcements.
// Costs and independent paragraphs belong to both branches and are retained.
export function compileWholeCard(card,h){
 if(card.layout!=='normal'||!/^((?:Instant|Sorcery))(?: — .+)?$/.test(card.type_line||'')||card.oracleKickerBranchesV21)return null;
 const core=h.stripReminderText(card.oracle_text||''),lines=core.split('\n'),costs=lines.filter(line=>/^Kicker(?: |—)/.test(line));
 if(costs.length!==1||!core.includes('If this spell was kicked,'))return null;
 const text=lines.filter(line=>line!==costs[0]).join(' ');if((text.match(/If this spell was kicked,/g)||[]).length!==1)return null;
 const replacement=/^(.+?\.) If this spell was kicked, (?:instead (.+?)|(.+?) instead)\.(.*)$/.exec(text),extra=/^(.+?\.) If this spell was kicked, (.+?)(\.(?: .*)?)$/.exec(text);
 let ordinaryText,kickedText;
 if(replacement){ordinaryText=replacement[1]+replacement[4];let alternate=replacement[2]||replacement[3];const original=/^(?:Destroy|Exile|Tap|Untap) (target (creature|artifact|enchantment|land|planeswalker|permanent))\b/.exec(replacement[1]);if(original)alternate=alternate.replace(new RegExp('\\bthat '+original[2]+'\\b','g'),original[1]);kickedText=sentence(alternate)+replacement[4];}
 else if(extra){ordinaryText=extra[1]+extra[3].slice(1);kickedText=extra[1]+' '+sentence(extra[2])+extra[3].slice(1);}
 else return null;
 const normalize=text=>text.replace(/^It deals /,card.name+' deals ').replace(/\. It deals /g,'. '+card.name+' deals ').replace(/\b[Ii]t also deals /g,card.name+' deals ');
 ordinaryText=normalize(ordinaryText);kickedText=normalize(kickedText);
 const compile=text=>h.compileCurrent({...card,oracleKickerBranchesV21:true,oracle_text:costs[0]+'\n'+text});
 const ordinary=compile(ordinaryText),kicked=compile(kickedText);
 if(!ordinary?.semanticClass||!kicked?.semanticClass)return null;
 const split=result=>({bodies:result.implementation.filter(op=>/^spell-/.test(op.kind)),modifiers:result.implementation.filter(op=>!/^spell-/.test(op.kind))});
 const a=split(ordinary),b=split(kicked);
 if(!a.bodies.length||!b.bodies.length||[...a.bodies,...b.bodies].some(op=>op.kind==='spell-modal-generic')||!same(a.modifiers,b.modifiers))return null;
 // The frozen simple parser attaches a trailing stat adjective only to the
 // last member of a type union. A freshly compiled branch must apply the
 // printed adjective to every member before it can be certified.
 const qualify=(text,part)=>{const stat=/\btarget (?:creature|artifact|enchantment|land|planeswalker|battle),? or (?:creature|artifact|enchantment|land|planeswalker|battle) with (mana value|power|toughness) ([0-9]+)(?: or (less|greater))?/.exec(text);if(stat&&(text.match(/\btarget\b/g)||[]).length===1&&part.bodies.reduce((n,op)=>n+(op.targets?.length||0),0)===1){const qualification={stat:stat[1]==='mana value'?'mv':stat[1],threshold:Number(stat[2]),comparison:stat[3]||'equal'};part.bodies=part.bodies.map(op=>op.targets?{...op,targets:op.targets.map(target=>({...target,...qualification,...(target.alternatives?{alternatives:target.alternatives.map(alt=>({...alt,...qualification}))}:{})}))}:op);}};
 qualify(ordinaryText,a);qualify(kickedText,b);
 const operation={kind:'spell-kicker-branches-v21',ordinary:{implementation:a.bodies,oracleContracts:a.bodies.map(op=>op.contract),implementedKeywords:[]},kicked:{implementation:b.bodies,oracleContracts:b.bodies.map(op=>op.contract),implementedKeywords:[]},contract:'spell-kicker-branches-v21'};
 return {semanticClass:'spell-template',implementedKeywords:[],implementation:[...a.modifiers,operation],oracleContracts:[...new Set([...a.modifiers.map(op=>op.contract),operation.contract])],rulesCore:core};
}

export function extensionTarget(text,h){
 const ranged=/^any number of target (.+)$/.exec(text);
 if(ranged){const base=h.target('target '+plural(ranged[1]));if(base)return {...base,min:0,max:null,unbounded:true};}
 const unionStat=/^(target )((?:creature|artifact|enchantment|land|planeswalker|battle),? or (?:creature|artifact|enchantment|land|planeswalker|battle))( with (?:mana value|power|toughness) (?:[0-9]+|X)(?: or (?:less|greater))?)( from (?:your|a|an opponent's) graveyard)?$/.exec(text);
 if(unionStat){const alternatives=unionStat[2].split(/,? or /).map(noun=>h.target('target '+noun+unionStat[3]+(unionStat[4]||'')));if(alternatives.every(Boolean))return {what:'permanent',zone:unionStat[4]?'graveyard':'battlefield',controller:unionStat[4]?.includes('your')?'you':unionStat[4]?.includes('opponent')?'opponent':'any',min:1,alternatives};}
 const listed=/^(target )((?:artifact|creature|enchantment|land|planeswalker|battle)(?:, (?:artifact|creature|enchantment|land|planeswalker|battle))+),? or (artifact|creature|enchantment|land|planeswalker|battle)( you control| an opponent controls)?$/.exec(text);
 if(listed){const alternatives=[...listed[2].split(', '),listed[3]].map(type=>h.target('target '+type+(listed[4]||'')));if(alternatives.every(Boolean))return {...h.target('target permanent'+(listed[4]||'')),alternatives};}
 const each=/^(.*?target .+? cards?) each with (power|toughness|mana value) (X|[0-9]+) or (less|greater)( from (?:your|a|an opponent's) graveyard)$/.exec(text);
 if(each){const base=h.target(each[1]+each[5]);if(base?.zone==='graveyard')return {...base,stat:each[2]==='mana value'?'mv':each[2],threshold:number(each[3]),comparison:each[4]};}
 const noComma=/^(target .+?),? (?:that's|that is) (.+)$/.exec(text);
 if(noComma&&/^(?:red or green|black or red|white or blue)$/.test(noComma[2])){const colors=noComma[2].split(' or '),base=h.target(noComma[1]),alternatives=colors.map(color=>h.target(noComma[1].replace(/^target /,'target '+color+' ')));if(base&&alternatives.every(Boolean))return {...base,alternatives};}
 const combat=/^(target )attacking, blocking, or tapped creature$/.exec(text);
 if(combat){const alternatives=['attacking','blocking','tapped'].map(status=>h.target('target '+status+' creature'));if(alternatives.every(Boolean))return {...h.target('target creature'),alternatives};}
 return null;
}

export function extensionValue(text,h){
 if(text==='the number of nontoken creatures that died this turn')return {kind:'spell-count-v21',test:'nontoken-died'};
 if(text==='the number of other spells you\'ve cast this turn')return {kind:'difference-v10',left:{kind:'turn-count',field:'spellsCast'},right:1};
 return null;
}

export function extensionEffect(card,line,h){
 const actorToken=/^(Target player|Target opponent) creates (.+?tokens?), where X is the number of cards in their hand\.$/.exec(line);
 if(actorToken){const target=h.target(actorToken[1].toLowerCase()),parsed=h.effect(card,'Create '+actorToken[2]+', where X is the number of cards in your hand.');if(target&&complete(parsed)&&!parsed.targets.length&&parsed.effects.every(e=>['token-key','token-inline'].includes(e.action)))return body([{action:'player-or-controller-v21',target:0,asActor:true,effects:parsed.effects}],[target]);}
 const handGift=/^(.+?\.) (?:Its controller|That player|That permanent's controller) may put (a|an) (permanent|creature|artifact|enchantment|land) card from their hand onto the battlefield\.$/.exec(line);
 if(handGift){const first=h.effect(card,handGift[1]);if(complete(first)&&first.targets.length===1&&first.targets[0].zone==='battlefield'){const filter=h.target('target '+handGift[3]+' card from your hand');if(filter)return body([...first.effects,{action:'zone-select',zone:'hand',who:{kind:'target-controller',index:0},filter,n:1,upTo:true,destination:'battlefield',tapped:false}],first.targets);}}
 const entryCounters=/^((?:Return|Put) (target .+? card from (?:your|a|an opponent's) graveyard) (?:to|onto) the battlefield(?: under (your|its owner's) control)?)\.\s*(?:Spell mastery — )?If (.+?), that creature enters with (a|an|one|two|three|[0-9]+)(?: additional)? (\+1\/\+1|-1\/-1) counters? on it\.$/.exec(line);
 if(entryCounters){const target=h.target(entryCounters[2]),condition=h.condition(entryCounters[4]);if(target?.zone==='graveyard'&&condition){const plain={action:'reanimate',target:0,controller:entryCounters[3]==='your'?'you':'owner',tapped:false},extra={...plain,additionalCountersV9:{[entryCounters[6]]:number(entryCounters[5])}};return body([{action:'conditional',condition,effects:[extra],elseEffects:[plain]}],[target]);}}
 const spentGroups=/^(.+?) if (\{[WUBRG]\}) was spent to cast this spell, and (.+?) if (\{[WUBRG]\}) was spent to cast this spell\.$/.exec(line);
 if(spentGroups){const effects=[];for(const [text,color]of [[spentGroups[1],spentGroups[2]],[spentGroups[3],spentGroups[4]]]){const parsed=h.effect(card,sentence(text)),condition=h.condition(color+' was spent to cast this spell');if(!complete(parsed)||parsed.targets.length||parsed.effects.some(e=>!['pump-group','battlefield-group'].includes(e.action))||!condition)return null;effects.push({action:'conditional',condition,effects:parsed.effects});}return body(effects);}
 const anyPump=/^(?:Each of )?([Aa]ny number of target (.+?)) (gains?|gets?|loses?) (.+)\.$/.exec(line);
 if(anyPump){const target=h.target(anyPump[1][0].toLowerCase()+anyPump[1].slice(1)),verb=anyPump[3].replace(/s$/,''),parsed=h.effect(card,'Target '+plural(anyPump[2])+' '+({gain:'gains',get:'gets',lose:'loses'}[verb])+' '+anyPump[4]+'.');if(target&&complete(parsed)&&parsed.targets.length===1)return {...parsed,targets:[target]};}
 const anotherDamage=/^(.+?) deals (X|[0-9]+) damage to another target(?: (.+?))?\.$/.exec(line);
 if(anotherDamage&&[card.name,'This spell'].includes(anotherDamage[1])){const target=anotherDamage[3]?h.target('target '+anotherDamage[3]):{what:'any',zone:'battlefield',controller:'any',min:1};if(target)return body([{action:'damage',target:0,n:number(anotherDamage[2])}],[{...target,differentFromPrevious:true}]);}
 const destroyIfValue=/^Destroy (target .+?) if its (mana value|power|toughness) is ([0-9]+) or (less|greater)\.$/.exec(line);
 if(destroyIfValue){const target=h.target(destroyIfValue[1]);if(target?.zone==='battlefield')return body([{action:'conditional',condition:{kind:'spell-target-condition-v21',test:'stat',stat:destroyIfValue[2]==='mana value'?'mv':destroyIfValue[2],threshold:Number(destroyIfValue[3]),comparison:destroyIfValue[4]},conditionTarget:0,effects:[{action:'destroy',target:0}]}],[target]);}
 const simpleToken=/^Create (a|an|one|two|three|four|five|six|seven|eight|nine|ten|[0-9]+|X) (tapped )?(Map|Powerstone) tokens?\.$/.exec(line);
 if(simpleToken){const token=simpleToken[3]==='Map'?{name:'Map',types:['Artifact'],subtypes:['Map'],colors:[],keywords:[],oracle:'{1}, {T}, Sacrifice this artifact: Target creature you control explores. Activate only as a sorcery.',operations:[{kind:'generic-ability',cost:{mana:'{1}',tap:true,sacSelf:true},targets:[h.target('target creature you control')],effects:[{action:'explore',target:0}],optional:false,sorceryOnly:true,onceEachTurn:false,contract:'generic-activated-effect'}]}:null;return body([{action:token?'token-inline':'token-key',who:'you',n:number(simpleToken[1]),tapped:!!simpleToken[2],...(token?{token}:{tokenKey:'bomPowerstone'})}]);}
 // Scalar/token instructions use exactly the printed controller/owner. The
 // surrounding target-sequence compiler supplies the locked object reference.
 const actor=/^(Its controller|Its owner|That creature's controller|That permanent's controller|That player) (creates?|investigates?|surveils?|scries?) (.+)\.$/.exec(line);
 if(actor){const who=actor[1]==='That player'?'event-player':actor[1]==='Its owner'?'event-card-owner':'event-card-controller',verb=actor[2].replace(/s$/,''),parsed=h.effect(card,sentence((verb==='create'?'Create ':verb==='investigate'?'Investigate ':verb==='surveil'?'Surveil ':'Scry ')+actor[3]));if(complete(parsed)&&!parsed.targets.length&&!unbound(parsed.effects)&&parsed.effects.every(e=>['token-key','token-inline','investigate','surveil','scry'].includes(e.action)))return body(parsed.effects.map(e=>({...e,who})));}
 const justInvestigate=/^(Its controller|Its owner|That player) investigates\.$/.exec(line);
 if(justInvestigate){const parsed=h.effect(card,'Investigate.');if(complete(parsed)&&!parsed.targets.length)return body(parsed.effects.map(e=>({...e,who:justInvestigate[1]==='That player'?'event-player':justInvestigate[1]==='Its owner'?'event-card-owner':'event-card-controller'})));}

 // Oracle's "also" does not alter target announcements or ordering.
 const also=line.replace(/\b(It|That creature|That permanent|Those creatures) also (gets?|gains?|loses?) /g,'$1 $2 ').replace(/\b(you|each opponent|each player) also (gain|gains|draw|draws|lose|loses|discard|discards) /g,'$1 $2 ');
 if(also!==line){const parsed=h.effect(card,also);if(complete(parsed))return parsed;}

 const controllerTokens=/^(.+?\.) (Its controller|Its owner|That creature's controller|That permanent's controller) (.+)$/.exec(line);
 if(controllerTokens){const first=h.effect(card,controllerTokens[1]),last=h.effect(card,controllerTokens[2]+' '+controllerTokens[3]);if(complete(first)&&first.targets.length===1&&complete(last)&&!last.targets.length){const effects=bound(last.effects,0,{stats:true});if(!unbound(effects))return body([...first.effects,...effects],first.targets);}}

 const statFirst=/^(?:You )?(gain|lose) life equal to (target .+?)'s (power|toughness|mana value)\.(?: (.+))?$/i.exec(line);
 if(statFirst){const target=h.target(statFirst[2]),tail=statFirst[4]?h.effect(card,statFirst[4]):body([]);if(target&&complete(tail)&&!tail.targets.length){const effects=bound(tail.effects,0,{stats:true});if(!unbound(effects))return body([{action:statFirst[1].toLowerCase()==='gain'?'gain-life':'lose-life',who:'you',n:{kind:'target-stat',target:0,stat:statFirst[3]==='mana value'?'mv':statFirst[3]}},...effects],[target]);}}
 const drawStat=/^Draw cards equal to the (power|toughness|mana value) of (target .+?)\.$/.exec(line);
 if(drawStat){const target=h.target(drawStat[2]);if(target)return body([{action:'draw',who:'you',n:{kind:'target-stat',target:0,stat:drawStat[1]==='mana value'?'mv':drawStat[1]}}],[target]);}

 // A choice prefix is a targeting instruction, and both creatures remain
 // announced even when an optional condition does not give the first a bonus.
 const duel=/^Choose (target creature you control) and (target creature (?:you don't control|an opponent controls))\. (?:(If .+?\.) )?(Those creatures fight each other|The creature you control deals damage equal to its power to the creature (?:you don't control|an opponent controls)|The chosen creatures fight each other)\.$/.exec(line);
 if(duel){const targets=[h.target(duel[1]),h.target(duel[2])];let effects=[];
  if(duel[3]){const text=duel[3].replace(/\bthe (?:chosen )?creature you control\b/g,'that creature'),parsed=h.effect(card,text);if(!complete(parsed)||parsed.targets.length)return null;effects=bound(parsed.effects,0,{stats:true});effects=effects.map(e=>e.action==='conditional'&&e.conditionTarget===undefined&&/^If (?:it|that creature)/.test(text)?{...e,conditionTarget:0}:e);if(unbound(effects))return null;}
  return body([...effects,duel[4].includes('fight')?{action:'fight',target:0,otherTarget:1}:{action:'bite',target:0,otherTarget:1,stat:'power'}],targets);
 }
 const counterDuel=/^Put (a|one|two|three|[0-9]+) (\+1\/\+1|-1\/-1) counters? on (target creature you control)(?: if (.+?))?\. It fights (target creature (?:you don't control|an opponent controls))\.$/.exec(line);
 if(counterDuel){const condition=counterDuel[4]&&h.condition(counterDuel[4]),counter={action:'counter',target:0,counter:counterDuel[2],n:number(counterDuel[1])};if(!counterDuel[4]||condition)return body([condition?{action:'conditional',condition,conditionTarget:0,effects:[counter]}:counter,{action:'fight',target:0,otherTarget:1}],[h.target(counterDuel[3]),h.target(counterDuel[5])]);}

 const eachGrave=/^Each player returns (?:each|all) (.+? cards?) from their graveyard to the battlefield( tapped)?(?: with (?:an additional )?(\+1\/\+1|-1\/-1) counter on (?:it|each of them))?\.$/.exec(line);
 if(eachGrave){const filter=h.target('target '+plural(eachGrave[1])+' from a graveyard');if(filter?.zone==='graveyard')return body([{action:eachGrave[3]?'grave-return-counters-v21':'zone-select',who:'each-player',zone:'graveyard',filter,n:'all',destination:'battlefield',controller:'owner',tapped:!!eachGrave[2],...(eachGrave[3]?{additionalCounters:{[eachGrave[3]]:1}}:{})}]);}

 const controllerDiscard=/^(.+?) deals (X|[0-9]+) damage to (target (?:opponent|player) or planeswalker)\. That player or that planeswalker's controller discards (X|[0-9]+) cards\.$/.exec(line);
 if(controllerDiscard&&[card.name,'This spell'].includes(controllerDiscard[1]))return body([{action:'damage',target:0,n:number(controllerDiscard[2])},{action:'player-or-controller-v21',target:0,effects:[{action:'discard',who:0,n:number(controllerDiscard[4])}]}],[h.target(controllerDiscard[3])]);
 const playerBurn=/^(.+?) deals (X|[0-9]+) damage to (target player or planeswalker) and (X|[0-9]+) damage to each creature that player or that planeswalker's controller controls\.$/.exec(line);
 if(playerBurn&&[card.name,'This spell'].includes(playerBurn[1]))return body([{action:'damage-controller-batch-v21',target:0,n:number(playerBurn[2]),groupN:number(playerBurn[4]),filter:h.target('target creature')}],[h.target(playerBurn[3])]);
 const moveCounters=/^(Move (?:any number of|one|a|all) (?:\+1\/\+1|-1\/-1|[a-z]+) counters? from target .+? onto) another target (.+?) with the same controller\.$/.exec(line);
 if(moveCounters){const parsed=h.effect(card,moveCounters[1]+' another target '+moveCounters[2]+'.');if(complete(parsed)&&parsed.targets.length===2&&parsed.effects.length===1&&parsed.effects[0].action==='move-counters-v8')return {...parsed,targets:[parsed.targets[0],{...parsed.targets[1],sameControllerAsV20:0}]};}

 const conditionalBurn=/^(.+?\.) If (.+?), (.+?) also deals (X|[0-9]+) damage to that creature's controller\.$/.exec(line);
 if(conditionalBurn&&[card.name,'This spell'].includes(conditionalBurn[3])){const first=h.effect(card,conditionalBurn[1]),condition=h.condition(conditionalBurn[2]);if(complete(first)&&first.targets.length===1&&condition)return body([...first.effects,{action:'conditional',condition,effects:[{action:'damage',target:{kind:'target-controller',index:0},n:number(conditionalBurn[4])}]}],first.targets);}
 const simpleStatDamage=/^(.+?) deals (X|[0-9]+) damage to each (.+?) and (X|[0-9]+) damage to each (.+?)\.$/.exec(line);
 if(simpleStatDamage&&[card.name,'This spell'].includes(simpleStatDamage[1])){const filters=[h.target('target '+plural(simpleStatDamage[3])),h.target('target '+plural(simpleStatDamage[5]))];if(filters.every(f=>f?.zone==='battlefield'))return body([{action:'damage-batch',hits:filters.map((filter,i)=>({filters:[filter],n:number(simpleStatDamage[i?4:2])}))}]);}

 const replaceOriginalNoun=/^(.+?\.) If (.+?), (destroy|exile|return|tap|untap) the (creature|artifact|permanent|enchantment|land) instead\.$/.exec(line);
 if(replaceOriginalNoun){const first=h.effect(card,replaceOriginalNoun[1]),condition=h.condition(replaceOriginalNoun[2]);if(complete(first)&&first.targets.length===1&&condition&&['destroy','exile','tap','untap'].includes(replaceOriginalNoun[3]))return body([{action:'conditional',condition,effects:[{action:replaceOriginalNoun[3],target:0}],elseEffects:first.effects}],first.targets);}

 const snapshotHand=/^Shuffle all cards from your graveyard into your library\. (Target player|Target opponent) mills that many cards\.$/.exec(line);
 if(snapshotHand){const first=h.effect(card,'Shuffle your graveyard into your library.');if(complete(first)&&!first.targets.length)return body([{action:'snapshot-amount-v20',value:h.count('cards in your graveyard'),effects:[...first.effects,{action:'mill',who:0,n:{kind:'snapshot-amount-v20'}}]}],[h.target(snapshotHand[1].toLowerCase())]);}

 const zeroAlternative=/^Destroy (target .+?) if it has the least power or is tied for least power among creatures on the battlefield\.$/.exec(line);
 if(zeroAlternative){const target=h.target(zeroAlternative[1]);if(target?.zone==='battlefield')return body([{action:'conditional',condition:{kind:'spell-target-condition-v21',test:'least-power'},conditionTarget:0,effects:[{action:'destroy',target:0}]}],[target]);}

 // Replacement clauses retain an identical announcement. A new target or a
 // changed target restriction must use a dedicated casting implementation.
 const replaced=/^(.+?\.) If (.+?), (?:instead (.+)|(.+) instead)\.$/.exec(line);
 if(replaced&&!/["\n]/.test(line)){const condition=h.condition(replaced[2]),first=h.effect(card,replaced[1]);let tail=replaced[3]||replaced[4];
  if(condition&&complete(first)&&first.targets.length<=1){
   tail=tail.replace(/^it deals /,card.name+' deals ').replace(/\bthat player\b/g,'target player');
   const damage=/^(.+?) deals (twice )?(X|[0-9]+)(?: damage)?(?: to (?:that creature|that permanent|that permanent or player|that player))?$/.exec(tail);
   let last=damage&&[card.name,'This spell'].includes(damage[1])&&first.effects.length===1&&first.effects[0].action==='damage'?body([{...first.effects[0],n:damage[2]?{kind:'sum',values:[number(damage[3]),number(damage[3])]}:number(damage[3])}],first.targets):h.effect(card,sentence(tail));
   if(complete(last)){if(!last.targets.length)last={...last,effects:bound(last.effects,0,{stats:true})};if(!unbound(last.effects)&&(same(first.targets,last.targets)||!last.targets.length))return body([{action:'conditional',condition,effects:last.effects,elseEffects:first.effects}],first.targets);}
  }
 }

 // Group conditionals re-select their printed controller group when executed.
 // No instruction here promises a snapshot of the earlier affected objects.
 const groupTail=/^(.+?\.) If (.+?), (.+?)(?: those creatures| them)\.$/.exec(line);
 if(groupTail&&!/["\n]/.test(line)){const first=h.effect(card,groupTail[1]),condition=h.condition(groupTail[2]);if(complete(first)&&!first.targets.length&&first.effects.length===1&&condition){const effect=first.effects[0],filters=effect.action==='battlefield-group'?effect.filters:effect.action==='pump-group'?[h.target(effect.who==='your-creatures'?'target creature you control':effect.who==='opponent-creatures'?'target creature an opponent controls':'target creature')]:null,operation=groupTail[3].toLowerCase();if(filters&&['tap','untap','goad'].includes(operation))return body([...first.effects,{action:'conditional',condition,effects:[{action:'battlefield-group',operation,filters}]}]);}}
 return null;
}
