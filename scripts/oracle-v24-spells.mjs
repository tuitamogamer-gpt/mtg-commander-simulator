// Staged additive casting grammar. The frozen v23 compiler is untouched.
const MANA='(?:\\{(?:[0-9]+|[WUBRGC])\\})+',N='(?:a|an|one|two|three|four|[1-9][0-9]*)';
const amount=value=>({a:1,an:1,one:1,two:2,three:3,four:4}[value]??Number(value));
const body=(effects,targets=[])=>targets.every(Boolean)?{effects,targets,optional:false}:null;
export function modifierOperation(card,line,h){
 if(card.layout&&card.layout!=='normal')return null;
 const dual=new RegExp('^Kicker ('+MANA+') and/or ('+MANA+')\\.?$').exec(line);
 if(dual&&dual[1]!==dual[2])return {kind:'mechanic-dual-kicker-v24',costs:dual.slice(1),contract:'mechanic-dual-kicker-v24'};
 const march=/^As an additional cost to cast this spell, you may exile any number of (white|blue|black|red|green) cards from your hand\. This spell costs \{2\} less to cast for each card exiled this way\.$/.exec(line);
 if(march)return {kind:'mechanic-hand-exile-reduction-v24',color:({white:'W',blue:'U',black:'B',red:'R',green:'G'})[march[1]],reduction:2,contract:'mechanic-hand-exile-reduction-v24'};
 const aggregate=/^As an additional cost to cast this spell, (?:you may )?sacrifice (any number of Spirits|any number of creatures)\.$/.exec(line);
 if(aggregate)return {kind:'mechanic-aggregate-cost-v24',all:aggregate[1].startsWith('all'),filter:h.target('target '+(aggregate[1].includes('Spirits')?'Spirit creature':aggregate[1].includes('permanents')?'permanent':'creature')+' you control'),discardAll:aggregate[1].includes('discard'),contract:'mechanic-aggregate-cost-v24'};
 const repeated=new RegExp('^As an additional cost to cast this spell, you may pay ('+MANA+') any number of times\.$').exec(line);
 if(repeated)return {kind:'mechanic-repeat-mana-v24',cost:repeated[1],contract:'mechanic-repeat-mana-v24'};
 return null;
}
export function extensionLine(card,line,h){return modifierOperation(card,line,h)||permanentOperation(card,line,h);}
export function extensionCondition(text){
 const kicked=new RegExp('^(?:it|this creature|this spell|this enchantment) was kicked with its ('+MANA+') kicker$').exec(text);
 if(kicked)return {kind:'dual-kicker-cost-v24',cost:kicked[1]};
 if(/^(?:it|this creature|this spell|this enchantment) was kicked twice$/.test(text))return {kind:'dual-kicker-count-v24',min:2};
 return null;
}
export function extensionCount(text){
 if(/^the number of times (?:this spell|this creature|this enchantment|it) was kicked$/.test(text))return {kind:'paid-times'};
 return null;
}
export function permanentOperation(card,line,h){
 const entry=new RegExp('^If this creature was kicked with its ('+MANA+') kicker, it enters with ('+N+') \\+1/\\+1 counters? on it and with (flying|first strike|trample|"Pay 3 life: Regenerate this creature\\."|"Whenever this creature deals damage, you gain that much life\\.")\\.?$').exec(line);
 if(entry){
  const simple=!entry[3].startsWith('"');
  return {kind:'dual-kicker-entry-v24',cost:entry[1],counters:amount(entry[2]),keywords:simple?[entry[3]]:[],...(!simple?{ability:entry[3].startsWith('"Pay')?'regenerate-life3':'damage-life'}:{}),contract:'dual-kicker-entry-v24'};
 }
 if(line==='This creature enters with two +1/+1 counters on it for each time it was kicked.')return {kind:'enters-with-counters',counter:'+1/+1',n:{kind:'sum',values:[{kind:'paid-times'},{kind:'paid-times'}]},contract:'permanent-enters-with-counters'};
 if(line==='As this creature enters, mill three cards for each time it was kicked.')return {kind:'dual-kicker-entry-mill-v24',n:3,contract:'dual-kicker-entry-mill-v24'};
 return null;
}
export function extensionEffect(card,line,h){
 const count={kind:'additional-count-v24',payment:'sacrifice'},power={kind:'additional-power-v24'},tapCount={kind:'additional-count-v24',payment:'tap'};
 if(line===card.name+' deals damage to any target equal to the total power of the sacrificed creatures.')return body([{action:'damage',target:0,n:power}],[{what:'any',zone:'battlefield',controller:'any',min:1}]);
 if(line===card.name+' deals damage to any target equal to three times the number of creatures tapped this way.')return body([{action:'damage',target:0,n:{kind:'sum',values:[tapCount,tapCount,tapCount]}}],[{what:'any',zone:'battlefield',controller:'any',min:1}]);
 if(line==='Target creature gets +3/+0 until end of turn. For each Spirit sacrificed this way, that creature gets an additional +3/+0 until end of turn.')return body([{action:'pump',target:0,power:{kind:'sum',values:[3,count,count,count]},toughness:0}],[h.target('target creature')]);
 if(line==='Target creature gets +2/+2 until end of turn for each creature sacrificed this way.')return body([{action:'pump',target:0,power:{kind:'sum',values:[count,count]},toughness:{kind:'sum',values:[count,count]}}],[h.target('target creature')]);
 if(line==='Target player loses 2 life plus 2 life for each Spirit sacrificed this way. You gain that much life.'){const n={kind:'sum',values:[2,count,count]};return body([{action:'lose-life',who:0,n},{action:'gain-life',who:'you',n}],[h.target('target player')]);}
 if(line==='Create an X/X blue and black Zombie creature token with menace, where X is the total power of the sacrificed creatures.'){const parsed=h.effect(card,'Create a 1/1 blue and black Zombie creature token with menace.');if(parsed?.effects?.length===1&&parsed.effects[0].action==='token-inline')return body([{...parsed.effects[0],token:{...parsed.effects[0].token,power,toughness:power}}]);}
 if(line==='You gain 3 life plus an additional 3 life for each additional {1}{G} you paid.'){const count={kind:'additional-count-v24',payment:'repeat-mana'};return body([{action:'gain-life',who:'you',n:{kind:'sum',values:[3,count,count,count]}}]);}
 if(line==='Up to X target creatures phase out.')return body([{action:'phase-out-v8',target:0}],[{...h.target('target creature'),min:0,max:0,upToXTargetV24:true}]);
 if(line==='Choose up to X creatures and/or planeswalkers you control, where X is the number of times this spell was kicked. Those permanents phase out.')return body([{action:'dual-kicker-phase-v24',filter:h.target('target creature or planeswalker you control')}]);
 if(line===card.name+" deals X damage to target creature. If this spell was kicked with its {2}{R} kicker, it deals X damage to that creature's controller. If this spell was kicked with its {3}{U} kicker, you draw X cards.")return body([{action:'damage',target:0,n:'X'},{action:'dual-kicker-bonus-v24',cost:'{2}{R}',effects:[{action:'damage',target:{kind:'target-controller',index:0},n:'X'}]},{action:'dual-kicker-bonus-v24',cost:'{3}{U}',effects:[{action:'draw',who:'you',n:'X'}]}],[h.target('target creature')]);
 if(line==='You gain 3 life for each time it was kicked.')return body([{action:'gain-life',who:'you',n:{kind:'sum',values:[{kind:'paid-times'},{kind:'paid-times'},{kind:'paid-times'}]}}]);
 if(line==='Tap target untapped creature and that creature deals damage equal to its power to its controller.')return body([{action:'tap-self-hit-v24',target:0}],[h.target('target untapped creature')]);
 if(line==='Choose target creature with mana value less than X. Search your library for a creature card with the same name as that creature, put it onto the battlefield tapped, then shuffle.')return body([{action:'search-target-name-v24',target:0}],[{...h.target('target creature'),stat:'mv',comparison:'less',threshold:'X',strictXTargetV24:true}]);
 return null;
}
export function finalizeCompilation(card,result){
 if(!result.semanticClass)return result;
 const ops=result.implementation||[],text=JSON.stringify(ops),dual=ops.find(op=>op.kind==='mechanic-dual-kicker-v24');
 const nodes=[];const visit=node=>{if(!node||typeof node!=='object')return;nodes.push(node);for(const value of Object.values(node))if(Array.isArray(value))value.forEach(visit);else visit(value);};ops.forEach(visit);
 for(const node of nodes){
  if(['dual-kicker-cost-v24','dual-kicker-entry-v24','dual-kicker-bonus-v24'].includes(node.kind||node.action)&&(!dual||!dual.costs.includes(node.cost)))return {reason:'unbound-dual-kicker-cost-v24'};
  if(['dual-kicker-count-v24','dual-kicker-phase-v24','dual-kicker-entry-mill-v24'].includes(node.kind||node.action)&&!dual)return {reason:'unbound-dual-kicker-count-v24'};
  if(node.kind==='additional-power-v24'&&!ops.some(op=>op.kind==='mechanic-aggregate-cost-v24'))return {reason:'unbound-additional-payment-v24'};
  if(node.kind==='additional-count-v24'&&!ops.some(op=>node.payment==='sacrifice'?op.kind==='mechanic-aggregate-cost-v24':node.payment==='tap'?op.kind==='mechanic-tap-cost-v20':node.payment==='repeat-mana'?op.kind==='mechanic-repeat-mana-v24'&&op.cost==='{1}{G}':false))return {reason:'unbound-additional-payment-v24'};
 }
 return result;
}
