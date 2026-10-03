// Additive spell clauses. Rules are compiled; runtime never interprets Oracle prose.
const esc=x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const complete=x=>x&&!x.v4Body&&!x.optional&&Array.isArray(x.effects)&&Array.isArray(x.targets)&&x.targets.every(Boolean);
const targetView=t=>t?.what==='any'&&t.zone==='battlefield'&&t.alternatives?.length&&t.alternatives.every(a=>!['player','opponent','any','any target'].includes(a.what))?{...t,what:'permanent'}:t;
const body=(effects,targets=[])=>targets.every(Boolean)?{effects,targets:targets.map(targetView),optional:false}:null;
const cond=(condition,effects,elseEffects=[])=>({action:JSON.stringify(condition).includes('-v26')?'conditional-v26':'conditional',condition,effects,elseEffects});
const paid=(colors,min=1)=>({kind:'mana-spent',colors,min});
const stat=(target,value)=>({kind:'target-stat',target,stat:value});
const saved=(filter,multiplier=1)=>({kind:'cast-cohort-v26',filter,multiplier});
const costValue=(payment,stat)=>({kind:'paid-object-values-v26',payment,stat});
export function extensionCondition(text,h){
 const cohort=/^you controlled (?:a|an) (Faerie|Mount|modified creature) as you cast this spell$/.exec(text);
 if(cohort)return {kind:'value-comparison-v10',value:saved(h.target('target '+(cohort[1]==='modified creature'?'modified creature':cohort[1]+' creature')+' you control')),min:1};
 if(text==='the sacrificed artifact was legendary')return {kind:'paid-object-quality-v26',payment:'sacrifice',legendary:true};
 return null;
}
export function extensionLine(card,line,h){
 const override=/^(?:(?:Raid — )?If you attacked this turn, instead |(?:Threshold — )?If there are seven or more cards in your graveyard, instead ).+ deals (5|6) damage to that permanent or player and the damage can't be prevented\.$/.exec(line);
 if(override)return {kind:'spell-damage-override-v26',condition:override[1]==='5'?{kind:'attacked'}:{kind:'graveyard-count',min:7},n:Number(override[1]),contract:'spell-damage-override-v26'};
 const rule=/^(?:Hellbent — |Spell mastery — )?If (X is 5 or more|you have no cards in hand|there are two or more instant and\/or sorcery cards in your graveyard), this spell can't be countered(?: and the damage can't be prevented)?\.$/.exec(line);
 if(rule){const condition=rule[1]==='X is 5 or more'?{kind:'x-range',min:5}:rule[1]==='you have no cards in hand'?{kind:'hand-count',n:0}:{kind:'count-comparison',count:{kind:'count',zone:'graveyard',what:'instant or sorcery'},min:2};if(condition)return {kind:'spell-conditional-rules-v26',condition,uncounterable:true,unpreventable:line.includes('damage'),contract:'spell-conditional-rules-v26'};}
 if(line==='You may cast this spell as though it had flash if X is 3 or less.')return {kind:'spell-x-flash-v26',max:3,contract:'spell-x-flash-v26'};
 return null;
}
export function modifierOperation(card,line,h){return extensionLine(card,line,h);}
export function extensionEffect(card,line,h){
 const self=esc(card.name);
 if(/^You gain X life if \{G\} was spent to cast this spell and X life if \{W\} was spent to cast this spell\.$/.test(line))return body([cond(paid(['G']),[{action:'gain-life',who:'you',n:'X'}]),cond(paid(['W']),[{action:'gain-life',who:'you',n:'X'}])]);
 if(line==="Target player can't play lands this turn if {R} was spent to cast this spell and can't cast creature spells this turn if {W} was spent to cast this spell.")return body([cond(paid(['R']),[{action:'player-rule-v10',rule:'no-land',who:0}]),cond(paid(['W']),[{action:'no-cast-v9',quality:'creature',who:0}])],[h.target('target player')]);
 if(line==='Creatures your opponents control lose flying until end of turn if {G} was spent to cast this spell, and creatures you control gain flying until end of turn if {U} was spent to cast this spell.')return body([cond(paid(['G']),[{action:'battlefield-group',operation:'pump',filters:[h.target('target creature an opponent controls')],power:0,toughness:0,keywords:[],removeKeywordsV18:['flying']}]),cond(paid(['U']),[{action:'pump-group',who:'your-creatures',power:0,toughness:0,keywords:['flying']}])]);
 if(line==='Create two 1/1 white Kithkin Soldier creature tokens if {W} was spent to cast this spell. Counter up to one target creature spell if {U} was spent to cast this spell.'){
  const tokens=h.effect(card,'Create two 1/1 white Kithkin Soldier creature tokens.'),target=h.target('target creature spell');if(complete(tokens)&&!tokens.targets.length&&target)return body([cond(paid(['W']),tokens.effects),cond(paid(['U']),[{action:'counter-spell',target:0}])],[{...target,min:0,max:1}]);
 }
 if(line==='If {B} was spent to cast this spell, you may have target creature get -3/-3 until end of turn. If {G} was spent to cast this spell, you may have target creature get +3/+3 until end of turn.')return body([cond(paid(['B']),[{action:'optional-effects-v26',effects:[{action:'pump',target:0,power:-3,toughness:-3}]}]),cond(paid(['G']),[{action:'optional-effects-v26',effects:[{action:'pump',target:1,power:3,toughness:3}]}])],[h.target('target creature'),h.target('target creature')]);
 if(line===card.name+" deals 4 damage to target player or planeswalker. The damage can't be prevented. If that player or that planeswalker's controller would gain life this turn, that player gains no life instead.")return body([{action:'damage',target:0,n:4,cantBePreventedV10:true},{action:'recipient-life-prohibition-v26',target:0}],[h.target('target player or planeswalker')]);
 if(line==='Creatures you control get +2/+1 until end of turn. If this spell was kicked, those creatures also gain trample until end of turn.')return body([cond({kind:'kicked'},[{action:'pump-group',who:'your-creatures',power:2,toughness:1,keywords:['trample']}],[{action:'pump-group',who:'your-creatures',power:2,toughness:1}])]);
 if(line==='Prevent the next 2 damage that would be dealt to any target this turn. If this spell was kicked, prevent the next 4 damage that would be dealt to that permanent or player this turn instead.'){
  const base=h.effect(card,'Prevent the next 2 damage that would be dealt to any target this turn.');if(complete(base))return body([cond({kind:'kicked'},base.effects.map(e=>({...e,n:4})),base.effects)],base.targets);
 }
 if(line==="Target creature can't block this turn. If this spell was kicked, gain control of that creature until end of turn, untap it, and it gains haste until end of turn."){
  const first=h.effect(card,"Target creature can't block this turn."),second=h.effect(card,'Untap target creature and gain control of it until end of turn. That creature gains haste until end of turn.');if(complete(first)&&complete(second))return body([...first.effects,cond({kind:'kicked'},second.effects)],first.targets);
 }
 if(line==="Counter target spell. If {B} was spent to cast this spell, that spell's controller mills X cards, where X is the spell's mana value.")return body([{action:'counter-spell',target:0},cond(paid(['B']),[{action:'mill',who:{kind:'target-controller',index:0},n:stat(0,'mv')}])],[h.target('target spell')]);
 const fury=new RegExp('^Prevent all combat damage that would be dealt by (target attacking or blocking creature) this turn\\. If \\{R\\} was spent to cast this spell, '+self+' deals damage to that creature\'s controller equal to the creature\'s power\\.$').exec(line);
 if(fury){const first=h.effect(card,'Prevent all combat damage that would be dealt by target attacking or blocking creature this turn.');if(complete(first)&&first.targets.length===1)return body([...first.effects,cond(paid(['R']),[{action:'damage',target:{kind:'target-controller',index:0},n:stat(0,'power')}])],first.targets);}
 if(line==='Target creature gets -X/-X until end of turn. That creature gets an additional -3/-3 until end of turn if you controlled a Faerie as you cast this spell.')return body([{action:'pump-signed-v26',target:0,power:{kind:'signed',sign:-1,value:'X'},toughness:{kind:'signed',sign:-1,value:'X'}},cond({kind:'value-comparison-v10',value:saved(h.target('target Faerie creature you control')),min:1},[{action:'pump',target:0,power:-3,toughness:-3}])],[h.target('target creature')]);
 if(line==='Target creature gets -2/-2 until end of turn. It gets an additional -1/-1 until end of turn for each modified creature you controlled as you cast this spell.'){
  const n={kind:'negative-cast-cohort-v26',filter:h.target('target modified creature you control')};return body([{action:'pump-signed-v26',target:0,power:{kind:'sum',values:[-2,n]},toughness:{kind:'sum',values:[-2,n]}}],[h.target('target creature')]);
 }
 const replaced=new RegExp('^'+self+' deals (2|X) damage to (target attacking or blocking creature|target creature or planeswalker)\\. '+self+' deals 4 damage to that creature instead if you controlled a Mount as you cast this spell\\.$').exec(line);
 const modified=new RegExp('^'+self+' deals X damage to (target creature or planeswalker)\\. If you controlled a modified creature as you cast this spell, it deals X plus 2 damage instead\\.$').exec(line);
 if(replaced||modified){const target=h.target(replaced?.[2]||modified[1]),filter=h.target('target '+(replaced?'Mount creature':'modified creature')+' you control');return body([cond({kind:'value-comparison-v10',value:saved(filter),min:1},[{action:'damage',target:0,n:replaced?4:{kind:'sum',values:['X',2]}}],[{action:'damage',target:0,n:replaced?2:'X'}])],[target]);}
 const exiled=new RegExp('^'+self+' deals damage equal to the exiled card\'s (power|mana value) to (target creature|each creature and each planeswalker)\\.$').exec(line);
 if(exiled){const n=costValue('exileGraveyard',exiled[1]==='power'?'power':'mv');return exiled[2]==='target creature'?body([{action:'damage',target:0,n}],[h.target('target creature')]):body([{action:'battlefield-group',operation:'damage',filters:[h.target('target creature or planeswalker')],n}]);}
 const draconic=new RegExp('^'+self+' deals X damage to each non-Dragon creature, where X is the exiled card\'s mana value\\. If a creature dealt damage this way would die this turn, exile it instead\\.$').exec(line);
 if(draconic)return body([{action:'battlefield-group',operation:'damage',filters:[h.target('target non-Dragon creature')],n:costValue('exileGraveyard','mv'),exileDamagedThisTurn:true}]);
 const discarded=new RegExp('^'+self+' deals damage equal to the total mana value of the discarded cards to each of up to X target creatures and/or planeswalkers\\.$').exec(line);
 if(discarded)return body([{action:'damage',target:0,n:costValue('discard','mv')}],[{...h.target('target creature or planeswalker'),min:0,max:0,upToXTargetV24:true}]);
 if(line==='Create two tapped Powerstone tokens. If the sacrificed artifact was legendary, draw a card.'){
  const token=h.effect(card,'Create two tapped Powerstone tokens.');if(complete(token)&&!token.targets.length)return body([...token.effects,cond({kind:'paid-object-quality-v26',payment:'sacrifice',legendary:true},[{action:'draw',who:'you',n:1}])]);
 }
 if(line==='Tap target untapped creature you control. If you do, add an amount of {C} equal to that creature\'s mana value.')return body([{action:'tap-mana-v26',target:0,stat:'mv'}],[h.target('target untapped creature you control')]);
 if(line==='Exile target creature. Put X +1/+1 counters on a commander creature you control, where X is the power of the creature exiled this way.')return body([{action:'exile',target:0},{action:'untargeted-counters-v26',filter:{...h.target('target creature you control'),commanderV26:true},n:stat(0,'power'),counter:'+1/+1'}],[h.target('target creature')]);
 if(line==='Draw cards equal to the mana value of target artifact or creature you control. An opponent gains control of that permanent.')return body([{action:'draw',who:'you',n:stat(0,'mv')},{action:'opponent-control-v26',target:0}],[h.target('target artifact or creature you control')]);
 if(line==='Target creature gets +2/+2 until end of turn. If it\'s paired with a creature, that creature also gets +2/+2 until end of turn.')return body([{action:'pump',target:0,power:2,toughness:2},{action:'pump-pair-v26',target:0,power:2,toughness:2}],[h.target('target creature')]);
 const splash=new RegExp('^'+self+' deals X damage to (target player or planeswalker) and each creature that player or that planeswalker\'s controller controls\\.$').exec(line);
 if(splash)return body([{action:'controller-damage-batch-v26',target:0,n:'X',groupN:'X'}],[h.target(splash[1])]);
 const fear=new RegExp('^'+self+' deals X damage to (target creature) and 1 damage to each other creature with the same controller\\.$').exec(line);
 if(fear)return body([{action:'controller-damage-batch-v26',target:0,n:'X',groupN:1,other:true}],[h.target('target creature')]);
 const curse=new RegExp('^'+self+' deals 2 damage to each creature for each Aura attached to that creature\\.$').exec(line);
 if(curse)return body([{action:'attached-aura-damage-v26',n:2}]);
 if(line==="Each enchantment deals 2 damage to its controller, then each Aura attached to a creature deals 2 damage to the creature it's attached to.")return body([{action:'enchantments-damage-v26',n:2}]);
 const redcap=new RegExp('^'+self+' deals 4 damage to (target creature or planeswalker)\\. If a nonred permanent is dealt damage this way, you sacrifice a land\\.$').exec(line);
 if(redcap)return body([{action:'damage-rider-v26',target:0,n:4,recipientNonred:true,rider:'sacrifice-land'}],[h.target(redcap[1])]);
 const heated=new RegExp('^'+self+' deals 6 damage to (target creature)\\. You may exile a card from your graveyard\\. If you do, '+self+' also deals 2 damage to that creature\'s controller\\.$').exec(line);
 if(heated)return body([{action:'damage',target:0,n:6},{action:'optional-grave-exile-damage-v26',target:0,n:2}],[h.target(heated[1])]);
 return null;
}
export function finalizeCompilation(card,result){
 if(!result.semanticClass)return result;
 if(result.implementation.some(o=>o.kind==='spell-damage-override-v26'||o.kind==='spell-conditional-rules-v26'&&o.unpreventable))result.implementation=result.implementation.map(o=>o.kind==='spell-damage'&&o.what==='any target'?{kind:'spell-generic',effects:[{action:'damage',target:0,n:o.n}],targets:[{what:'any',zone:'battlefield',controller:'any',min:1,max:1}],optional:false,contract:'spell-generic-effect'}:o);
 const nodes=[],walk=x=>{if(!x||typeof x!=='object')return;nodes.push(x);for(const y of Object.values(x))Array.isArray(y)?y.forEach(walk):walk(y);};walk(result.implementation);
 const burn=result.implementation.find(o=>o.kind==='spell-conditional-rules-v26'&&o.unpreventable);if(burn){const replace=x=>{if(Array.isArray(x))return x.map(replace);if(x&&typeof x==='object'){if(x.action==='damage')return cond(burn.condition,[{...x,cantBePreventedV10:true}],[x]);return Object.fromEntries(Object.entries(x).map(([k,v])=>[k,replace(v)]));}return x;};result.implementation=result.implementation.map(o=>o===burn?o:replace(o));}
 const override=result.implementation.find(o=>o.kind==='spell-damage-override-v26');if(override){const replace=x=>{if(Array.isArray(x))return x.map(replace);if(x&&typeof x==='object'){if(x.action==='damage')return cond(override.condition,[{...x,n:override.n,cantBePreventedV10:true}],[x]);return Object.fromEntries(Object.entries(x).map(([k,v])=>[k,replace(v)]));}return x;};result.implementation=result.implementation.map(o=>o===override?o:replace(o));}
 const costNodes=nodes.filter(n=>n.kind==='paid-object-values-v26'||n.kind==='paid-object-quality-v26');
 if(costNodes.length){const costs=result.implementation.filter(o=>o.kind==='mechanic-additional-costs').flatMap(o=>o.costs||[]);for(const n of costNodes){const selected=costs.filter(c=>c.kind===n.payment);if(selected.length!==1)return {reason:'Unsupported unbound additional-cost value',unsupported:card.oracle_text};n.costId='captured-v26-'+n.payment;selected[0].id=n.costId;}result.implementation.push({kind:'spell-payment-values-v26',costs:[...new Set(costNodes.map(n=>n.costId))],contract:'spell-payment-values-v26'});}
 const cohorts=nodes.filter(n=>n.kind==='cast-cohort-v26'||n.kind==='negative-cast-cohort-v26');if(cohorts.length)result.implementation.push({kind:'spell-casting-cohorts-v26',filters:[...new Map(cohorts.map(n=>[JSON.stringify(n.filter),n.filter])).values()],contract:'spell-casting-cohorts-v26'});
 result.oracleContracts=[...new Set([...(result.oracleContracts||[]),...result.implementation.map(o=>o.contract).filter(Boolean)])];
 return result;
}
