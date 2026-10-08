const body=(effects,targets=[])=>({effects,targets,optional:false});
const effect=(mode,extra={})=>({action:'common-effects-v48',mode,...extra});
const rule=(mode,extra={})=>({kind:'common-rule-v48',mode,...extra,contract:'generic-continuous-effect'});
const trigger=(event,eventFilter,b,extra={})=>b&&({kind:'generic-trigger',event,eventFilter,...b,...extra,contract:'generic-trigger-effect'});
export function extensionLine(card,line,h){
 const rules={
  "If an opponent would mill one or more cards, they mill twice that many cards instead.":'double-opponent-mill',
  "Players can cast spells and activate abilities only during their own turns.":'own-turn-actions',
  "During combat, players can't cast instant spells or activate abilities that aren't mana abilities.":'combat-instants',
  "Players can't cast spells from graveyards or activate abilities of cards in graveyards.":'graveyard-actions',
  "Enchanted creature's controller can't cast creature spells.":'attached-creature-cast',
  'Unlock costs you pay cost {1} less.':'unlock-discount',
  'Commander creatures you own have "Creature tokens you control get +2/+2.".':'commander-token-anthem',
  'Commander creatures you own have menace and "This creature gets +X/+0, where X is the number of creature cards in your graveyard.".':'commander-grave-power',
 };
 if(rules[line])return rule(rules[line]);
 if(line==='This creature has first strike during your turn.')return {kind:'generic-static',scope:'self',power:0,toughness:0,keywords:['first strike'],yourTurnOnly:true,contract:'generic-continuous-effect'};
 let m=/^This (?:artifact|Equipment|creature) can be attached only to a creature with (power|toughness) (\d+) or greater\.$/i.exec(line);if(m)return rule('attachment-minimum',{stat:m[1],min:Number(m[2])});
 if(line==='Each other Samurai creature you control gets +1/+1 for each point of bushido it has.')return rule('bushido-anthem');
 if(line==="As long as this creature is attacking, it gets +X/+0, where X is the number of lands defending player controls.")return rule('defending-lands');
 if(line==="Creatures you control that are enchanted get +1/+1 and can't be blocked except by creatures with defender.")return rule('enchanted-evasion');
 if(line==="Whenever a source deals damage to this creature, that source's controller sacrifices that many permanents.")return trigger('oracleDamageHit',{kind:'damage-event-v8',source:{kind:'source',controller:'any'},recipient:{kind:'self'},bind:'source'},body([{action:'choose-permanents',who:'event-card-controller',operation:'sacrifice',n:{kind:'event-amount'},filter:h.target('target permanent you control')}]));
 if(line==="Whenever this creature attacks and isn't blocked, it assigns no combat damage this turn and defending player loses 2 life.")return trigger('blockersDeclared','self-unblocked',body([{action:'no-combat-assignment-v19'},{action:'lose-life',who:'event-player',n:2}]));
 if(line==="Whenever this creature attacks and isn't blocked, you may draw a card. If you do, this creature assigns no combat damage this turn.")return {...trigger('blockersDeclared','self-unblocked',body([{action:'draw',who:'you',n:1},{action:'no-combat-assignment-v19'}])),optional:true};
 m=/^When this creature enters, if (at least three mana of the same color was spent to cast it|mana from a Treasure was spent to cast it), (.+)$/.exec(line);
 if(m)return trigger('etb','self',h.effect(card,m[2]),{condition:{kind:m[1].startsWith('at least')?'adamant-any-v48':'treasure-mana-v48'}});
 if(line==='Whenever this Vehicle attacks, target creature that crewed it this turn explores.'||line==='Whenever this creature attacks, target creature that crewed it this turn explores.')return trigger('attacks','self',body([{action:'explore',target:0}],[{...h.target('target creature'),v20:{kind:'crew-member-v48'}}]));
 if(line==='Whenever this creature attacks while saddled, put a +1/+1 counter on target creature that saddled it this turn.')return trigger('attacks','self',body([{action:'counter',target:0,counter:'+1/+1',n:1}],[{...h.target('target creature'),v20:{kind:'saddle-member-v48'}}]),{eventFilter:{kind:'saddled-v10',base:'self'}});
 return null;
}
export function modifierOperation(card,line,h){
 if(line==="If your life total is less than your starting life total, this spell costs {X} less to cast, where X is the difference.")return {kind:'cost-modifier',self:true,amount:-1,multiplier:{kind:'life-shortfall-v48'},contract:'generic-cost-modification'};
 if(line==="Instant and sorcery spells you cast cost {1} less to cast for each time you've cast a commander from the command zone this game.")return rule('commander-spell-discount');
 return extensionLine(card,line,h);
}
export function extensionEffect(card,text,h){
 if(text==="Until your next upkeep, target permanent can't phase out.")return body([{action:'common-effects-v46',mode:'prevent-phase',target:0}],[h.target('target permanent')]);
 let m=/^(Another target creature you control|Target creature you control|Each creature you control) gains? (haste and )?myriad until end of turn\.$/.exec(text);
 if(m){const targets=m[1].startsWith('Each')?[]:[{...h.target('target creature you control'),...(m[1].startsWith('Another')?{excludeSelf:true}:{})}],keywords=[...(m[2]?['haste']:[]),'myriad'];return body([targets.length?{action:'pump',target:0,power:0,toughness:0,keywords}:{action:'battlefield-group',operation:'pump',power:0,toughness:0,keywords,filters:[h.target('target creature you control')]}],targets);}
 if(text==='Remove up to five counters from target artifact, creature, planeswalker, or opponent.')return body([effect('remove-counters',{target:0,max:5})],[{what:'any',zone:'battlefield',controller:'any',min:1,v20:{kind:'counter-object-v48'}}]);
 if(text==="Each opponent can't cast instant or sorcery spells during that player's next turn.")return body([effect('next-turn-spell-ban')]);
 if(text==='Take an extra turn after this one. Skip the untap step of that turn.')return body([effect('extra-turn',{skipUntap:true})]);
 if(text==="Take an extra turn after this one. At the beginning of that turn's end step, you lose the game.")return body([effect('extra-turn',{lose:true})]);
 if(text==='Return target creature card from your graveyard to the battlefield tapped and attacking.')return body([effect('reanimate-attacking',{target:0})],[h.target('target creature card from your graveyard')]);
 m=/^(Choose target (Wall creature|creature)\.|Regenerate target creature\.) At this turn's next end of combat, destroy all creatures that (blocked or were blocked by it|were blocked by that creature) this turn\.$/.exec(text);
 if(m)return body([...(m[1].startsWith('Regenerate')?[{action:'regenerate',target:0}]:[]),effect('delayed-destroy-partners',{target:0,onlyBlocked:m[3]==='were blocked by that creature'})],[h.target(m[2]==='Wall creature'?'target Wall creature':'target creature')]);
 return null;
}
