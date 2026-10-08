const body=(effects,targets=[])=>({effects,targets,optional:false});
const effect=(mode,extra={})=>({action:'common-effects-v52',mode,...extra});
const trigger=(event,eventFilter,b,extra={})=>b&&({kind:'generic-trigger',event,eventFilter,...b,...extra,contract:'generic-trigger-effect'});
const ability=(cost,b,extra={})=>cost&&b&&({kind:'generic-ability',cost,...b,...extra,contract:'generic-activated-effect'});
export function extensionLine(card,line,h){
 if(line==='{4}, {T}: Attach target Aura attached to a creature to another creature.')return ability({mana:'{4}',tap:true},body([effect('move-aura',{target:0,hostTypes:['Creature']})],[{...h.target('target Aura'),attachedHost:h.target('target creature')}]));
 if(line==='When this creature enters, you may put an Aura card from your hand onto the battlefield attached to this creature.')return trigger('etb','self',body([effect('hand-aura')]));
 if(line==='{W}, {T}: Put target Aura card from a graveyard onto the battlefield under your control attached to a creature you control.')return ability({mana:'{W}',tap:true},body([effect('grave-aura',{target:0})],[h.target('target Aura card from a graveyard')]));
 if(line==='When this creature dies, you may exile it. If you do, return any number of target Spirit cards from your graveyard to your hand.')return trigger('dies','self',body([effect('exile-return-spirits',{target:0})],[{...h.target('target Spirit card from your graveyard'),min:0,max:99}]),{optional:true});
 if(line==='When this creature dies, choose a creature type. Shuffle all creature cards of that type from your graveyard into your library.')return trigger('dies','self',body([effect('shuffle-chosen-type')]));
 if(/^Sacrifice this (?:Aura|enchantment|creature): Destroy all non-Wall creatures blocking enchanted creature\.$/.test(line))return ability({sacSelf:true},body([effect('destroy-blockers',{target:'attached-host'})]));
 if(/^At the beginning of your upkeep, sacrifice this (?:creature|artifact) unless you pay its mana cost\.$/.test(line))return trigger('upkeep','your-upkeep',body([effect('upkeep-mana-cost')]));
 if(line==="At the beginning of your upkeep, enchanted creature deals 1 damage to its owner.")return trigger('upkeep','your-upkeep',body([effect('host-damage-owner',{target:'attached-host'})]));
 if(line==="{1}, {T}: Return target creature you control and each Aura attached to it to their owners' hands. Activate only during your turn.")return ability({mana:'{1}',tap:true},body([effect('bounce-with-auras',{target:0})],[h.target('target creature you control')]),{activationCondition:h.condition("it's your turn")});
 if(line==="{2}{U}, {T}: Put this creature and target creature on top of their owners' libraries, then those players shuffle their libraries.")return ability({mana:'{2}{U}',tap:true},body([effect('self-target-shuffle',{target:0})],[h.target('target creature')]));
 if(line==="{2}: Target player mills a card. This creature gets +X/+X until end of turn, where X is the milled card's mana value.")return ability({mana:'{2}'},body([effect('mill-pump',{target:0})],[h.target('target player')]));
 if(/^\{3\}, \{T\}, Sacrifice this (?:artifact|creature): It deals 3 damage to target creature\. If a Werewolf is dealt damage this way, destroy it\.$/.test(line))return ability({mana:'{3}',tap:true,sacSelf:true},body([effect('damage-werewolf',{target:0})],[h.target('target creature')]));
 if(line==='When this creature enters, each opponent may put an artifact or enchantment card onto the battlefield from their hand.')return trigger('etb','self',body([effect('opponent-hand-permanent')]));
 if(line==="When this creature dies, put up to one other target card from a graveyard on the bottom of its owner's library.")return trigger('dies','self',body([{action:'move-to-library',target:0,bottom:true}],[{...h.target('target card from a graveyard'),excludeSelf:true,min:0}]));
 if(line==="Whenever this creature attacks, defending player may pay {4}. If that player doesn't, this creature can't be blocked this turn.")return trigger('attacks','self',body([effect('pay-or-unblockable')]));
 if(line==='Whenever this creature attacks, defending player sacrifices a creature with the least power among creatures they control.')return trigger('attacks','self',body([effect('defender-least-power')]));
 if(line==="{2}{G}, {T}, Discard two cards: All lands target player controls become 3/3 creatures until end of turn. They're still lands.")return ability(h.cost('{2}{G}, {T}, Discard two cards'),body([effect('animate-lands',{target:0})],[h.target('target player')]));
 if(line==='{T}: Creatures you control gain protection from the colors of target permanent you control until end of turn.')return ability({tap:true},body([effect('colors-protection',{target:0})],[h.target('target permanent you control')]));
 if(line==='When this creature enters, earthbend X, where X is the amount of mana spent to cast her.'){const op=h.line(card,'When this creature enters, earthbend 1.');return op&&{...op,effects:op.effects.map(e=>e.action==='earthbend-v10'?{...e,n:{kind:'cast-mana-spent-v10'}}:e)};}
 if(line==='Whenever a Vehicle you control attacks, That Vehicle gains first strike until end of turn.')return trigger('attacks',{kind:'v8-event',target:h.target('target Vehicle you control')},body([{action:'pump',target:'event-card',power:0,toughness:0,keywords:['first strike']}]));
 if(line==='Whenever a Vehicle you control attacks, Untap this creature.')return trigger('attacks',{kind:'v8-event',target:h.target('target Vehicle you control')},body([{action:'untap',target:'self'}]));
 if(line==='At the beginning of your upkeep, sacrifice this creature unless you remove a counter from a permanent you control.')return trigger('upkeep','your-upkeep',body([effect('remove-counter-upkeep')]));
 if(line==='When this creature enters, sacrifice it unless you sacrifice any number of creatures with total power 12 or greater.')return trigger('etb','self',body([effect('sacrifice-power')]));
 if(/^When this creature enters, any player may sacrifice two creatures(?: of their choice)?\. If a player does, sacrifice this creature\.$/.test(line))return trigger('etb','self',body([effect('player-sacrifice-two')]));
 if(line==='As this creature enters, sacrifice any number of permanents. This creature enters with that many +1/+1 counters on it.')return {kind:'common-entry-v52',mode:'sacrifice-counters',contract:'permanent-entry-replacement'};
 if(line==="As this land enters, you may reveal a Goblin card from your hand. If you don't, this land enters tapped.")return {kind:'common-entry-v52',mode:'reveal-Goblin',contract:'permanent-entry-replacement'};
 if(line==="{T}: Add {C} for each Urza's land you control. Activate only if you control three or more artifacts.")return {kind:'mana-source',activationCost:{tap:true},produce:[{C:1}],multiplier:{kind:'urza-lands-v52'},condition:h.condition('you control three or more artifacts'),contract:'mana-source'};
 return null;
}
export function modifierOperation(card,line,h){return extensionLine(card,line,h);}
export function extensionEffect(card,text,h){
 if(text==='Attach target Aura attached to a creature or land to another permanent of that type.')return body([effect('move-aura',{target:0,hostTypes:['Creature','Land']})],[{...h.target('target Aura'),attachedHost:h.target('target creature or land')}]);
 if(text==="Gain control of target Aura that's attached to a permanent. Attach it to another permanent it can enchant.")return body([effect('move-aura',{target:0,gainControl:true})],[{...h.target('target Aura'),attachedHost:h.target('target permanent')}]);
 if(text==="Until end of turn, each creature you control becomes a black Shade and gains \"{B}: This creature gets +1/+1 until end of turn.\".")return body([effect('black-shade')]);
 if(text==='Reveal any number of cards in your hand. You gain 2 life for each green mana symbol in those cards\' mana costs.')return body([effect('reveal-chroma')]);
 if(text==="Put any number of target artifact cards from target player's graveyard on top of their library in any order.")return body([effect('grave-library-order',{target:1})],[h.target('target player'),{...h.target('target artifact card from a graveyard'),min:0,max:99,ownerPlayerV17:{target:0}}]);
 if(text==='Prevent all combat damage that would be dealt this turn. You may look at each face-down creature that\'s attacking or blocking.'){const fog=h.effect(card,'Prevent all combat damage that would be dealt this turn.');return fog&&{...fog,effects:[...fog.effects,effect('look-combat-faces')]};}
 return null;
}
