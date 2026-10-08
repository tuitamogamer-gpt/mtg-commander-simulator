const body=(effects,targets=[])=>({effects,targets,optional:false});
const pair=(target,otherTarget,duration='eot')=>({action:'require-block-v34',target,otherTarget,duration});
const capacity=(target,n)=>({action:'combat-restriction',target,duration:'eot',restriction:{combatRule:{kind:'block-capacity',additional:n}}});
const pump=(target,power,toughness,keywords=[])=>({action:'pump',target,power,toughness,keywords});
const event=(on,test,b)=>({kind:'generic-trigger',event:on,eventFilter:{kind:'combat-event-v34',test},...b,contract:'generic-trigger-effect'});

export function extensionEffect(card,text,h){
  if(text==='Target creature blocks target creature this turn if able.')return body([pair(0,1)],[h.target('target creature'),h.target('target creature')]);
  if(text==='Put a +1/+1 counter on target creature you control. Another target creature blocks it this turn if able.')return body([{action:'counter',target:0,counter:'+1/+1',n:1},pair(1,0)],[h.target('target creature you control'),{...h.target('target creature'),differentFromPrevious:true}]);
  if(text==='Target creature gets +7/+7 until end of turn. Up to one other target creature blocks it this turn if able.')return body([pump(0,7,7),pair(1,0)],[h.target('target creature'),{...h.target('target creature'),differentFromPrevious:true,min:0,max:1}]);
  if(text==='Untap target creature. It gets +2/+2 until end of turn and can block an additional creature this turn.')return body([{action:'untap',target:0},pump(0,2,2),capacity(0,1)],[h.target('target creature')]);
  if(text==='Target creature defending player controls gets +3/+0 until end of turn. That creature can block up to two additional creatures this turn.')return body([pump(0,3,0),capacity(0,2)],[{...h.target('target creature'),v20:{kind:'defending-player-v34'}}]);
  if(text==="Target creature an opponent controls blocks this turn if able. Untap that creature. Other creatures that player controls can't block this turn.")return body([{action:'combat-restriction',target:0,duration:'eot',restriction:{combatRule:{kind:'required-block'}}},{action:'untap',target:0},{action:'other-blockers-v34',target:0}],[h.target('target creature an opponent controls')]);
  if(text==="Put this creature and each creature blocking or blocked by it on top of their owners' libraries, then those players shuffle.")return body([{action:'combat-cohort-library-v34'}]);
  if(text==='Until end of turn, target creature gets +4/+4 and gains trample, wither, and "When this creature attacks, target creature blocks it this turn if able."')return body([pump(0,4,4,['trample','wither']),{action:'grant-operation',target:0,operation:{kind:'generic-trigger',event:'attacks',eventFilter:'self',...body([pair(0,'self')],[h.target('target creature')]),contract:'generic-trigger-effect'}}],[h.target('target creature')]);
  return null;
}

export function extensionLine(card,line,h){
  if(line==='When this creature attacks, up to one target creature defending player controls blocks it this combat if able.')return {kind:'generic-trigger',event:'attacks',eventFilter:'self',...body([pair(0,'self','combat')],[{...h.target('target creature defending player controls'),min:0,max:1}]),contract:'generic-trigger-effect'};
  if(line==='Landfall — Whenever a land you control enters, you may have target creature block this creature this turn if able.'||line==='Whenever a land you control enters, you may have target creature block this creature this turn if able.'){
    const base=h.line(card,'Whenever a land you control enters, draw a card.');if(base)return {...base,...body([pair(0,'self')],[h.target('target creature')]),optional:true};
  }
  if(line==="Whenever this creature attacks the player with the most life or tied for most life, it can't be blocked this turn.")return event('attacks','highest-life-defender',body([{action:'unblockable-until-eot',target:'self'}]));
  if(line==="Whenever this creature and another creature attack different players, this creature can't be blocked this combat.")return event('attackersDeclared','different-players',body([{action:'unblockable-until-eot',target:'self',duration:'combat'}]));
  if(line==='Whenever this creature blocks two or more creatures, it gains first strike until end of turn.')return event('blockersDeclared','blocked-two',body([pump('self',0,0,['first strike'])]));
  if(/^(?:Whenever Rashka|Whenever this creature) blocks one or more black creatures, (?:Rashka|this creature) gets \+1\/\+2 until end of turn\.$/.test(line))return event('blockersDeclared','blocked-black',body([pump('self',1,2)]));
  if(line==='Whenever a creature blocks a black or red creature, the blocking creature gets +1/+1 until end of turn.')return {kind:'generic-trigger',event:'blocks',eventFilter:{kind:'v8-event',field:'blocker'},combatTestV34:'black-red-attacker',...body([pump('event-card',1,1)]),contract:'generic-trigger-effect'};
  if(line==='As long as this creature is monstrous, it has reach and can block an additional ninety-nine creatures each combat.')return {kind:'generic-static',scope:'self',power:0,toughness:0,keywords:['reach'],combatRule:{kind:'block-capacity',additional:99},condition:{kind:'creature-upgrade-state-v8',state:'monstrous'},contract:'generic-continuous-effect'};
  return null;
}
