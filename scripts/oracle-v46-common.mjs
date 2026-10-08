const body=(effects,targets=[])=>({effects,targets,optional:false});
const effect=(mode,extra={})=>({action:'common-effects-v46',mode,...extra});
const trigger=(event,eventFilter,b,extra={})=>b&&({kind:'generic-trigger',event,eventFilter,...b,...extra,contract:'generic-trigger-effect'});
const checked=(op,eventTestV46)=>op&&({...op,eventTestV46});
const bundle=operations=>operations.every(Boolean)?{kind:'operation-bundle',operations,contract:'closed-permanent-clauses'}:null;
export function normalizeCard(card){let text=card.oracle_text;if(card.name==='Justice, Vance Astrovik')text=text.replace('nonland, nontoken permanent','nontoken nonland permanent');return text===card.oracle_text?card:{...card,oracle_text:text};}
export function extensionCondition(text){
 const m=/^there (?:is|are) exactly (one|three) tide counters? on this (?:creature|enchantment|permanent)$/.exec(text);if(m){const n=m[1]==='one'?1:3;return {kind:'count-comparison',count:{kind:'source-counters',counter:'tide'},min:n,max:n};}
 if(text==="you've rolled three or more dice this turn")return {kind:'dice-count-v46',min:3};
 return null;
}
export function extensionLine(card,line,h){
 if(line==='Each player may play an additional land during each of their turns.')return {kind:'additional-land-all-v46',contract:'generic-continuous-effect'};
 if(line==="Whenever a land is tapped for mana, return it to its owner's hand.")return trigger('tappedForMana','each-upkeep',body([effect('return-event')]),{eventTestV46:'land'});
 let m=/^Enchanted planeswalker has "([+−-]\d+): (.+)"\.$/.exec(line);
 if(m){const b=h.effect(card,m[2]);if(b)return {kind:'attachment-operation',operation:{kind:'generic-ability',cost:{},loyalty:Number(m[1].replace('−','-')),sorceryOnly:true,...b,contract:'generic-activated-effect'},contract:'attachment-granted-operation'};}
 m=/^Whenever you activate a loyalty ability of enchanted planeswalker, (.+)$/.exec(line);
 if(m)return checked(trigger('abilityActivated',{kind:'stack-copy-activation-v8',attached:true,loyalty:true},h.effect(card,m[1])),'own-activation');
 m=/^Whenever this creature attacks (the player with the most life or tied for most life|while you have the most life or are tied for most life), (.+)$/.exec(line);
 if(m)return checked(h.line(card,'Whenever this creature attacks, '+m[2]),m[1].startsWith('the player')?'defender-most-life':'own-most-life');
 if(line==='Whenever a creature deals damage to this creature, this creature deals that much damage to that creature.')return trigger('oracleDamageHit',{kind:'damage-event-v8',source:{kind:'filtered',target:h.target('target creature')},recipient:{kind:'self'},bind:'source'},body([{action:'damage',target:'event-card',n:{kind:'event-amount'}}]));
 if(line==='Whenever a creature deals damage to enchanted planeswalker, destroy that creature.')return trigger('oracleDamageHit',{kind:'damage-event-v8',source:{kind:'filtered',target:h.target('target creature')},recipient:{kind:'attached'},bind:'source'},body([{action:'destroy',target:'event-card'}]));
 if(line==="Whenever a spell deals damage to this creature, this creature deals that much damage to that spell's controller.")return trigger('oracleDamageHit',{kind:'damage-event-v8',source:{kind:'filtered',target:h.target('target card from a graveyard'),spell:true},recipient:{kind:'self'},bind:'source'},body([{action:'damage',target:'event-card-controller',n:{kind:'event-amount'}}]));
 if(line==='When enchanted creature becomes tapped or is dealt damage, destroy it.')return bundle([trigger('becameTapped','each-upkeep',body([effect('destroy-event')]),{eventTestV46:'attached'}),h.line(card,'Whenever enchanted creature is dealt damage, destroy that creature.')]);
 if(line==='Whenever combat damage is dealt to you, remove an indestructible counter from this creature.')return trigger('oracleDamageToObject',{kind:'damage-event-v8',source:{kind:'source',controller:'any'},recipient:{kind:'you'},bind:'recipient',combat:true},h.effect(card,'Remove an indestructible counter from this creature.'));
 if(line==="Whenever this creature deals combat damage to a player, if it doesn't have an indestructible counter on it, put an indestructible counter on it."){const op=h.line(card,'Whenever this creature deals combat damage to a player, put an indestructible counter on this creature.');return op&&{...op,condition:{kind:'count-comparison',count:{kind:'source-counters',counter:'indestructible'},max:0}};}
 if(line==="Whenever another nonland permanent you control is returned to its owner's hand, put a +1/+1 counter on this creature.")return trigger('lto',{kind:'observation-v9',target:{...h.target('target nonland permanent you control'),excludeSelf:true},destination:'hand'},h.effect(card,'Put a +1/+1 counter on this creature.'));
 m=/^Whenever there are four or more tide counters on this (creature|enchantment), remove all tide counters from it\.$/.exec(line);
 if(m)return {kind:'state-trigger-v8',state:{kind:'count-comparison',count:{kind:'source-counters',counter:'tide'},min:4},trigger:trigger('state','self',body([{action:'remove-counter',target:'self',counter:'tide',n:{kind:'source-counters',counter:'tide'}}])),contract:'state-trigger-v8'};
 if(line==='Cast this spell only if no permanents named Tidal Influence are on the battlefield.')return {kind:'casting-restriction-v8',condition:{kind:'no-named-permanent-v46',name:'Tidal Influence'},contract:'casting-restriction-v8'};
 if(line==='Whenever you roll a die, put a +1/+1 counter on this creature.')return trigger('dieRolledV46','each-upkeep',h.effect(card,'Put a +1/+1 counter on this creature.'),{eventTestV46:'own-die'});
 if(line==='Whenever you roll your third die each turn, put a +1/+1 counter on this creature.')return trigger('dieRolledV46','each-upkeep',h.effect(card,'Put a +1/+1 counter on this creature.'),{eventTestV46:'third-die'});
 if(line==='Whenever you roll a 1 or 2, put that many +1/+1 counters on this creature.')return trigger('dieRolledV46','each-upkeep',body([{action:'counter',target:'self',counter:'+1/+1',n:{kind:'die-value-v46'}}]),{eventTestV46:'small-die'});
 if(line==='When this creature phases out or leaves the battlefield, mill three cards.')return bundle([trigger('oraclePhasedOutV44','self',h.effect(card,'Mill three cards.')),h.line(card,'When this creature leaves the battlefield, mill three cards.')]);
 if(line==='Whenever this creature or another Spirit you control becomes the target of a spell, it phases out.')return trigger('targeted','each-upkeep',body([effect('phase-event')]),{eventTestV46:'targeted-own-spirit'});
 if(line==='Whenever this creature or another Spirit you control phases in, create a tapped 1/1 white Spirit creature token with flying.')return trigger('oraclePhasedInV17','each-upkeep',h.effect(card,'Create a tapped 1/1 white Spirit creature token with flying.'),{eventTestV46:'own-spirit'});
 if(line==='Whenever a creature dealt damage by enchanted creature this turn dies, put a +1/+1 counter on that creature.')return trigger('dies',{kind:'v8-event',damageByThisTurn:'attached',target:h.target('target creature')},body([{action:'counter',target:'attached-host',counter:'+1/+1',n:1}]));
 if(line==='Whenever another creature you control dies or is put into exile, put a +1/+1 counter on this creature and you gain 1 life.'){
  const b=h.effect(card,'Put a +1/+1 counter on this creature. You gain 1 life.');return bundle([trigger('dies',{kind:'v8-event',target:h.target('target creature you control'),subject:'another'},b),trigger('lto',{kind:'observation-v9',target:{...h.target('target creature you control'),excludeSelf:true},destination:'exile'},b)]);
 }
 if(line==='When this creature dies or is put into exile while its power is 4 or greater, destroy up to one target nonland permanent.'){
  const b=h.effect(card,'Destroy up to one target nonland permanent.');return bundle([trigger('dies','self',b,{eventTestV46:'source-power-four'}),trigger('lto',{kind:'observation-v9',self:true,destination:'exile'},b,{eventTestV46:'source-power-four'})]);
 }
 if(line==='Whenever enchanted creature deals combat damage to defending player, you may destroy target artifact that player controls.')return trigger('oracleDamageHit',{kind:'damage-event-v8',source:{kind:'attached'},recipient:{kind:'a player'},combat:true,bind:'recipient'},h.effect(card,'You may destroy target artifact that player controls.'),{eventTestV46:'damaged-defender'});
 if(line==='Whenever you cast a spell during your turn other than your first spell that turn, create a 2/2 blue and black Zombie Rogue creature token.')return trigger('cast',{kind:'v8-event',player:'you',castMinimumOrdinal:2,casterTurn:true},h.effect(card,'Create a 2/2 blue and black Zombie Rogue creature token.'));
 if(line==='Whenever you cast a noncreature spell with one or more blue mana symbols in its mana cost, create that many 1/1 blue Merfolk creature tokens.')return trigger('cast','each-upkeep',body([effect('blue-symbol-tokens')]),{eventTestV46:'blue-noncreature'});
 if(line==='Fortified land has indestructible.')return {kind:'attachment-grant',power:0,toughness:0,keywords:['indestructible'],contract:'attachment-continuous-effect'};
 if(line==='Whenever fortified land becomes tapped, target creature gets +1/+1 until end of turn.')return trigger('becameTapped','each-upkeep',h.effect(card,'Target creature gets +1/+1 until end of turn.'),{eventTestV46:'attached'});
 if(line==='Fortify {3}')return {kind:'generic-ability',cost:{mana:'{3}'},sorceryOnly:true,...body([effect('fortify',{target:0})],[h.target('target land you control')]),contract:'generic-activated-effect'};
 return null;
}
export function modifierOperation(card,line,h){if(line==='Cast this spell only if no permanents named Tidal Influence are on the battlefield.')return extensionLine(card,line,h);return null;}
export function extensionEffect(card,text){
 if(text==="Until your next upkeep, this creature can't phase out.")return body([effect('prevent-phase',{target:'self'})]);
 if(text==='Roll a six-sided die.')return body([effect('roll-die')]);
 return null;
}
