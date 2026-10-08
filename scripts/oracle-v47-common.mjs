const body=(effects,targets=[])=>({effects,targets,optional:false});
const effect=(mode,extra={})=>({action:'common-effects-v47',mode,...extra});
const rule=mode=>({kind:'common-rule-v47',mode,contract:'generic-continuous-effect'});
const trigger=(event,eventFilter,b,extra={})=>b&&({kind:'generic-trigger',event,eventFilter,...b,...extra,contract:'generic-trigger-effect'});
export function extensionLine(card,line,h){
 if(line==="Artifacts and creatures entering the battlefield don't cause abilities to trigger.")return {kind:'entry-trigger-suppression-v19',types:['Artifact','Creature'],contract:'entry-trigger-suppression-v19'};
 if(line==='Instant and sorcery spells you control have split second.')return rule('split-second');
 if(line==="During combat, players can't cast spells or activate abilities that aren't mana abilities.")return rule('combat-silence');
 if(line==='Whenever a creature you control attacks a player alone, it gains double strike until end of turn.'){
  const op=h.line(card,'Whenever a creature you control attacks alone, it gains double strike until end of turn.');return op&&{...op,eventTestV47:'attacks-player'};
 }
 if(line==='This creature gets +2/+0 for every seven cards in your graveyard.')return {kind:'generic-static',scope:'self',power:2,toughness:0,keywords:[],multiplier:{kind:'sevens-in-graveyard-v47'},contract:'generic-continuous-effect'};
 if(line==="When this creature dies, if it isn't a token, create a token that's a copy of it.")return h.line(card,"When this creature dies, if it isn't a token, create a token that's a copy of this creature.");
 if(line==='Whenever one or more opponents are dealt noncombat damage, creatures you control get +1/+0 until end of turn.')return trigger('oracleDamageBatch',{kind:'damage-event-v8',source:{kind:'any'},recipient:{kind:'an opponent'},combat:false,bind:'recipient'},h.effect(card,'Creatures you control get +1/+0 until end of turn.'));
 if(line==='Whenever you cast a spell that targets an opponent or a creature an opponent controls, put a +1/+1 counter on this creature.')return trigger('cast','your-cast',h.effect(card,'Put a +1/+1 counter on this creature.'),{eventTestV47:'opponent-target'});
 if(line==='Whenever you cast an Equipment spell or a spell that targets a creature you control, draw a card. This ability triggers only once each turn.')return trigger('cast','your-cast',h.effect(card,'Draw a card.'),{eventTestV47:'equipment-or-own-target',onceEachTurn:true});
 return null;
}
export function extensionEffect(card,text,h){
 if(text==='Remove up to three counters from another target creature or planeswalker.'){
  const b=h.effect(card,'Remove up to three counters from target creature.');return b&&{...b,targets:[{...h.target('target creature or planeswalker'),excludeSelf:true}]};
 }
 if(text==="Destroy target creature. If it wasn't attacking, its controller draws a card.")return body([effect('destroy-nonattacker',{target:0})],[h.target('target creature')]);
 if(text==='Target planeswalker you control deals damage equal to its loyalty to target creature or planeswalker an opponent controls.')return body([effect('loyalty-damage',{source:0,target:1})],[h.target('target planeswalker you control'),h.target('target creature or planeswalker an opponent controls')]);
 if(card.name==='Stinging Vitriol'&&text==='Stinging Vitriol deals 2 damage to target opponent. That player reveals their hand. You choose a nonland card from it. They discard that card.'){
  const b=h.effect(card,'Target opponent reveals their hand. You choose a nonland card from it. That player discards that card.');return b&&{...b,effects:[{action:'damage',target:0,n:2},...b.effects]};
 }
 return null;
}
