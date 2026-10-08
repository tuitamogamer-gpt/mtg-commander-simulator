const body=(effects,targets=[])=>({effects,targets,optional:false});
const trigger=(event,eventFilter,b,extra={})=>b&&({kind:'generic-trigger',event,eventFilter,...b,...extra,contract:'generic-trigger-effect'});
const effect=(mode,extra={})=>({action:'common-effects-v40',mode,...extra});
const bundle=operations=>operations.every(Boolean)?{kind:'operation-bundle',operations,contract:'closed-permanent-clauses'}:null;
export function normalizeCard(card){
  let text=card.oracle_text;
  if(card.name==='Choking Vines')text=text.replace('Choking Vines deals','This spell deals');
  if(card.name==='Ragost, Deft Gastronaut')text=text.replace('Artifacts you control are Foods in addition to their other types and have "{2}, {T}, Sacrifice this artifact: You gain 3 life."','Artifacts you control are Foods in addition to their other types.\nArtifacts you control have "{2}, {T}, Sacrifice this artifact: You gain 3 life."');
  if(card.name==="Drizzt Do'Urden")text=text.replace('on Drizzt','on this creature');
  return text===card.oracle_text?card:{...card,oracle_text:text};
}
export function extensionCondition(text,h){
  if(text==='you have fewer than eight cards in hand')return {kind:'count-comparison',count:{kind:'count',zone:'hand',what:'card'},max:7};
  if(text==="you didn't play a card from exile this turn")return {kind:'no-exile-play-v40'};
  if(text==='his sneak cost was paid')return h.condition('its sneak cost was paid');
  return null;
}
export function extensionEffect(card,text,h){
  if(text==='Put a +1/+1 counter on each creature you control and a loyalty counter on each planeswalker you control.')return h.effect(card,'Put a +1/+1 counter on each creature you control. Put a loyalty counter on each planeswalker you control.');
  if(text==='Choose target creature that player controls. The player sacrifices that creature.')return body([{action:'sacrifice-target-v8',target:0}],[h.target('target creature that player controls')]);
  if(text==='Draw cards equal to the difference.'&&card.name==='Doctor Octopus, Master Planner')return body([{action:'draw',who:'you',n:{kind:'hand-shortfall-v38',n:8}}]);
  if(text==='Put that card on top of your library.'&&card.name==='Mortuary')return body([{action:'move-to-library',target:'event-card'}]);
  if(text==='Exile it, then shuffle all creature cards from your graveyard into your library.')return body([{action:'exile',target:'event-card'},effect('shuffle-grave-creatures')]);
  if(text==='Draw a card. If it entered from your library or was cast from your library, draw two cards instead.')return body([effect('fblthp-draw')]);
  if(text==='Draw a card if its power is 3 or greater. Otherwise, put two +1/+1 counters on it.')return body([effect('tribute')]);
  if(text==='Put a +1/+1 counter on that creature and a +1/+1 counter on this creature.'||text==='Put a +1/+1 counter on it and a +1/+1 counter on this creature.')return body([{action:'counter',target:'event-card',counter:'+1/+1',n:1},{action:'counter',target:'self',counter:'+1/+1',n:1}]);
  if(text==='That player sacrifices a creature and loses 10 life.')return h.effect(card,'That player sacrifices a creature. That player loses 10 life.');
  if(text==='Investigate for each opponent who lost life this turn.')return body([{action:'investigate',n:{kind:'opponents-lost-life-v40'},who:'you'}]);
  if(text==='Return target Equipment card from your graveyard to the battlefield attached to this creature.')return body([effect('reanimate-equipment',{target:0})],[h.target('target Equipment card from your graveyard')]);
  if(text==="It deals 1 damage to the player or planeswalker it's attacking.")return body([{action:'damage',target:'event-defender-v18',n:1}]);
  if(text==='The attacking player gains control of this artifact and untaps it.')return body([{action:'give-control-v9',target:'self',who:'event-card-controller'},{action:'untap',target:'self'}]);
  if(text==='Another target creature attacking the same player or planeswalker gains flying until end of turn.')return body([{action:'pump',target:0,power:0,toughness:0,keywords:['flying']}],[{...h.target('target attacking creature'),excludeSelf:true,v20:{kind:'same-defender-v40'}}]);
  if(text==="It deals that much damage to any target that isn't a Dragon.")return body([{action:'damage',target:0,n:{kind:'event-amount'},source:'event-card'}],[{...h.effect(card,'This creature deals 1 damage to any target.').targets[0],v20:{kind:'not-dragon-v40'}}]);
  if(text==='Create a colorless snow artifact token named Icy Manalith with "{T}: Add one mana of any color.".')return h.effect(card,text.slice(0,-1));
  if(text==='You may cast target artifact card from your graveyard this turn.')return body([effect('graveyard-permission',{target:0})],[h.target('target artifact card from your graveyard')]);
  if(text==='You may exile it. You may play that card from exile this turn.')return body([effect('exile-permission')]);
  if(text==='You may add an amount of {C} equal to the number of creatures you control that share a creature type with it.')return {...body([effect('shared-type-mana')]),optional:true};
  return null;
}
export function extensionLine(card,line,h){
  if(line==='Artifacts you control are Foods in addition to their other types.')return {kind:'artifact-food-types-v40',contract:'generic-continuous-effect'};
  if(line==='Whenever this creature deals combat damage to a player, choose target creature that player controls. The player sacrifices that creature.')return {...h.line(card,'Whenever this creature deals combat damage to a player, draw a card.'),...body([effect('target-controller-sacrifice',{target:0})],[{...h.target('target creature'),controller:'event-player'}])};
  if(line==='Whenever one or more Warriors you control attack a player, target creature that player controls becomes a Coward.'){
    const b=h.effect(card,'Target creature that player controls becomes a Coward.');return {...h.line(card,'Whenever one or more Warriors you control attack a player, draw a card.'),...b,targets:b.targets.map(t=>({...t,controller:'defending-player'}))};
  }
  if(line==='At the beginning of your end step, if you have fewer than eight cards in hand, draw cards equal to the difference.')return trigger('endStep','your-end-step',body([{action:'draw',who:'you',n:{kind:'hand-shortfall-v38',n:8}}]),{condition:{kind:'count-comparison',count:{kind:'count',zone:'hand',what:'card'},max:7}});
  if(line==='Whenever a creature you own dies, put that card on top of your library.')return {...h.line(card,'Whenever a creature you own dies, draw a card.'),...body([{action:'move-to-library',target:'event-card'}])};
  if(line==='Whenever a creature you control enters, draw a card if its power is 3 or greater. Otherwise, put two +1/+1 counters on it.')return {...h.line(card,'Whenever a creature you control enters, draw a card.'),...body([effect('tribute')])};
  if(line==='Whenever a creature you control becomes blocked, you may exile it. You may play that card from exile this turn.')return {...h.line(card,'Whenever a creature you control becomes blocked, draw a card.'),...body([effect('exile-permission')])};
  if(line==="Whenever a Dragon you control is dealt damage, it deals that much damage to any target that isn't a Dragon.")return {...h.line(card,'Whenever a Dragon you control is dealt damage, draw a card.'),...body([{action:'damage',target:0,n:{kind:'event-amount'},source:'event-card'}],[{...h.effect(card,'This creature deals 1 damage to any target.').targets[0],v20:{kind:'not-dragon-v40'}}])};
  if(line==='Whenever one or more creature cards are put into your graveyard from anywhere, put that many +1/+1 counters on this creature.')return {...h.line(card,'Whenever one or more creature cards are put into your graveyard from anywhere, draw a card.'),...body([{action:'counter',target:'self',counter:'+1/+1',n:{kind:'grave-creature-count-v40'}}])};
  if(line==='{3}, {T}: Create a colorless snow artifact token named Icy Manalith with "{T}: Add one mana of any color.".')return {...h.line(card,'{3}, {T}: Draw a card.'),...body([{action:'token-inline',who:'you',n:1,token:{name:'Icy Manalith',super:['Snow'],types:['Artifact'],subtypes:[],colors:[],keywords:[],oracle:'{T}: Add one mana of any color.',operations:[{kind:'mana-source',produce:['W','U','B','R','G'].map(c=>({[c]:1})),activationMana:null,contract:'mana-source'}]}}])};
  if(line==='If at least three mana of the same color was spent to cast this spell, this creature enters with a +1/+1 counter on it.')return {kind:'enters-with-counters',n:1,counter:'+1/+1',condition:{kind:'paid-three-same-color-v40'},contract:'permanent-enters-with-counters'};
  if(line==='Whenever this creature and/or one or more other Vampires you control enter, create a Blood token. This ability triggers only once each turn.')return trigger('etb','each-upkeep',h.effect(card,'Create a Blood token.'),{eventTestV40:'self-or-own-vampire',onceEachTurn:true});
  if(line==='Whenever an opponent discards a card or mills one or more cards, put a +1/+1 counter on each Advisor you control.')return bundle(['discarded','cardsMilledV40'].map(event=>trigger(event,'each-upkeep',h.effect(card,'Put a +1/+1 counter on each Advisor you control.'),{eventTestV40:'opponent-player'})));
  if(line==='Whenever another card is put into your graveyard from anywhere, target opponent gains control of this enchantment.')return trigger('cardToGraveyard','each-upkeep',h.effect(card,'Target opponent gains control of this enchantment.'),{eventTestV40:'own-other-grave'});
  if(line==="Whenever you're dealt combat damage, the attacking player gains control of this artifact and untaps it.")return trigger('oracleDamageHit',{kind:'damage-event-v8',source:{kind:'source',controller:'any'},recipient:{kind:'you'},combat:true,bind:'source'},h.effect(card,'The attacking player gains control of this artifact and untaps it.'));
  if(line==='Whenever you scry, if this creature is tapped, you may untap it. Do this only once each turn.')return trigger('scry','your-player',{...body([{action:'untap',target:'self'}]),optional:true},{condition:{kind:'source-status',status:'tapped'},onceEachTurn:true,onceGroup:line});
  if(line==='At the beginning of your upkeep, if enchanted Equipment is attached to a creature, destroy that creature.')return trigger('upkeep','your-upkeep',body([effect('destroy-equipment-host')]),{eventTestV40:'equipment-attached',interveningV40:true});
  if(line==="Whenever a creature dies, if it had power greater than this creature's power, put a number of +1/+1 counters on this creature equal to the difference.")return trigger('dies',{kind:'filtered-object',target:h.target('target creature')},body([effect('drizzt-counters')]),{eventTestV40:'died-greater-power'});
  if(line==="Creatures with power less than the number of Islands you control can't block this creature.")return {kind:'generic-static',scope:'self',blockerFilters:[{...h.target('target creature'),v20:{kind:'power-less-islands-v40'}}],contract:'generic-continuous-effect'};
  if(line==='During your turn, you and this creature have hexproof.')return bundle([{kind:'generic-static',scope:'self',yourTurnOnly:true,keywords:['hexproof'],contract:'generic-continuous-effect'},{kind:'player-hexproof-v40',contract:'generic-continuous-effect'}]);
  if(line==='During your turn, this creature and enchantment creatures you control have trample, lifelink, and ward {2}.')return {kind:'generic-static',scope:'filtered-permanents',yourTurnOnly:true,filters:[{...h.target('target creature you control'),v20:{kind:'self-or-enchantment-v40'}}],keywords:['trample','lifelink'],wardV9:{mana:'{2}'},contract:'generic-continuous-effect'};
  return null;
}
export function repairFrozenCompilation(card,result){
  if(card.name!=='Doctor Octopus, Master Planner')return null;
  const transform=node=>Array.isArray(node)?node.map(transform):node&&typeof node==='object'?node.kind==='hand-shortfall-v38'?{...node,n:8}:Object.fromEntries(Object.entries(node).map(([k,v])=>[k,transform(v)])):node;
  return {...result,implementation:transform(result.implementation)};
}
