const body=(effects,targets=[])=>({effects,targets,optional:false});
const effect=(mode,extra={})=>({action:'common-effects-v51',mode,...extra});
const trigger=(event,eventFilter,b,extra={})=>b&&({kind:'generic-trigger',event,eventFilter,...b,...extra,contract:'generic-trigger-effect'});
const ability=(cost,b,extra={})=>cost&&b&&({kind:'generic-ability',cost,...b,...extra,contract:'generic-activated-effect'});
export function extensionLine(card,line,h){
 if(line==='{2}{G}: Return this card from your graveyard or from exile to the battlefield tapped.'){
  const grave=h.line(card,'{2}{G}: Return this card from your graveyard to the battlefield tapped.');return grave?{kind:'operation-bundle',operations:[grave,{kind:'exile-return-v20',mana:'{2}{G}',tapped:true,sorceryOnly:false,contract:'generic-activated-effect'}],contract:'closed-permanent-clauses'}:null;
 }
 if(line==='{T}: Add {C}. If you control creatures named Mine Worker and Power Plant Worker, add {C}{C}{C} instead.')return {kind:'mana-source',activationCost:{tap:true},produce:[{C:1}],multiplier:{kind:'worker-mana-v51'},contract:'mana-source'};
 if(line==='{2}{U}, {T}: The controller of target instant or sorcery spell copies it. That player may choose new targets for the copy.')return ability({mana:'{2}{U}',tap:true},body([effect('copy-controller',{target:0})],[h.target('target instant or sorcery spell')]));
 if(line==="{1}{U}, {T}: Copy target spell you control that wasn't cast. You may choose new targets for the copy.")return ability({mana:'{1}{U}',tap:true},body([effect('copy',{target:0})],[{...h.target('target spell you control'),v20:{kind:'uncast-v51'}}]));
 if(line==='Whenever a creature enchanted player controls enters, that player loses 1 life and you gain 1 life.')return trigger('etb',{kind:'v8-event',target:h.target('target creature')},body([{action:'lose-life',who:'event-card-controller',n:1},{action:'gain-life',who:'you',n:1}]),{eventTestV51:'enchanted-player'});
 if(line==="When this creature dies, target player skips their next untap step. Tap up to five target permanents that player controls."){const b=h.effect(card,'Target player skips their next untap step.');return b?.targets.length===1?trigger('dies','self',body([...b.effects,{action:'tap',target:1}],[...b.targets,{...h.target('target permanent'),min:0,max:5,controlledByTargetV51:0}])):null;}
 if(line==='Whenever this creature deals combat damage to a player, unlock a locked door of up to one target Room you control.')return trigger('oracleDamageHit',{kind:'damage-event-v8',source:{kind:'self'},recipient:{kind:'a player'},combat:true,bind:'recipient'},body([effect('unlock',{target:0})],[{...h.target('target Room you control'),min:0}]));
 if(line==="At the beginning of your upkeep, for each player, this enchantment deals 1 damage to that player unless they pay {B} or {3}.")return trigger('upkeep','your-upkeep',body([effect('pay-or-damage')]));
 if(line==='When this creature dies, you may exile it. If you do, shuffle all creature cards from your graveyard into your library.')return trigger('dies','self',body([effect('exile-shuffle-creatures')]),{optional:true});
 if(line==='{U}: Regenerate this creature. Activate only if this creature blocked or was blocked by a blue creature this turn.')return ability({mana:'{U}'},h.effect(card,'Regenerate this creature.'),{activationCondition:{kind:'blue-combat-partner-v51'}});
 return null;
}
export function modifierOperation(card,line,h){
 if(line==="You may pay {3}{U} and tap an untapped artifact you control rather than pay this spell's mana cost.")return {kind:'mechanic-tap-cost-v20',n:1,filter:h.target('target artifact you control'),alternative:true,alternativeManaV51:'{3}{U}',contract:'mechanic-tap-cost-v20'};
 return extensionLine(card,line,h);
}
export function extensionEffect(card,text){
 if(text==='For each land, destroy that land unless any player pays 1 life.')return body([effect('lands-unless-life')]);
 if(/^For each creature, its controller sacrifices a permanent(?: of their choice)? unless they pay \{1\}\.$/.test(text))return body([effect('creatures-pay-sacrifice')]);
 return null;
}
