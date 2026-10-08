const body=(effects,targets=[])=>({effects,targets,optional:false});
export function normalizeCard(card){
  const text=card.oracle_text.replace(/\[([+−-]\d+)\]:/g,'$1:');
  return text===card.oracle_text?card:{...card,oracle_text:text};
}
export function extensionLine(card,line,h){
  const m=/^Planeswalkers you control have "([+−-]\d+): (.+)"\.$/.exec(line);
  if(m){const text=m[2]==='This planeswalker deals 1 damage to each opponent and you gain 1 life.'?'This creature deals 1 damage to each opponent. You gain 1 life.':m[2];const b=h.effect(card,text);if(!b)return null;return {kind:'generic-static',scope:'filtered-permanents',filters:[h.target('target planeswalker you control')],grantedOperation:{kind:'generic-ability',cost:{},loyalty:Number(m[1].replace('−','-')),sorceryOnly:true,...b,contract:'generic-activated-effect'},contract:'generic-continuous-effect'};}
  if(line==="Planeswalkers you control aren't put into their owners' graveyards for having 0 loyalty.")return {kind:'zero-loyalty-v45',contract:'generic-continuous-effect'};
  const activation=/^Whenever you activate a loyalty ability, (if you removed two or more loyalty counters to activate it, )?(.+)$/.exec(line);
  if(activation){const b=h.effect(card,activation[2]);if(b)return {kind:'generic-trigger',event:'abilityActivated',eventFilter:{kind:'stack-copy-activation-v8',loyalty:true},...b,...(activation[1]?{loyaltyPaidV45:2}:{}),contract:'generic-trigger-effect'};}
  return null;
}
export function extensionEffect(card,text,h){
  if(card.name==='Violent Echoes')text=text.replace('Violent Echoes deals','This spell deals');
  let m=/^Empower Jace (\d+)\.$/.exec(text);
  if(m)return body([{action:'empower-jace-v45',n:Number(m[1])}]);
  m=/^Empower Jace X, where X is (the number of creatures you control|the number of Islands you control)\.$/.exec(text);
  if(m){const n=h.value(m[1]);if(n)return body([{action:'empower-jace-v45',n}]);}
  if(text==="Until end of turn, you may activate loyalty abilities of Jace planeswalkers you control on any player's turn any time you could cast an instant.")return body([{action:'jace-timing-v45'}]);
  if(text==='Exile all creatures. Empower Jace X, where X is the number of creatures exiled this way.')return body([{action:'exile-empower-v45'}]);
  if(text==='This spell deals 6 damage to target creature or planeswalker. If excess damage was dealt to that permanent this way, empower Jace X, where X is that excess damage.')return body([{action:'damage-empower-v45',target:0,n:6}],[h.target('target creature or planeswalker')]);
  return null;
}
