const body=(effects,targets=[])=>({effects,targets,optional:false});
const effect=(mode,extra={})=>({action:'common-effects-v49',mode,...extra});
const trigger=(event,eventFilter,b,extra={})=>b&&({kind:'generic-trigger',event,eventFilter,...b,...extra,contract:'generic-trigger-effect'});
export function extensionLine(card,line,h){
 let first=/^Reveal the first card you draw each turn\. Whenever you reveal a (creature|basic land) card this way, draw a card\.$/.exec(line);if(first)return {kind:'operation-bundle',operations:[extensionLine(card,'Reveal the first card you draw each turn.',h),extensionLine(card,'Whenever you reveal a '+first[1]+' card this way, draw a card.',h)],contract:'closed-permanent-clauses'};
 if(line==='Whenever an opponent draws a card, this creature deals 1 damage to them.')return trigger('draw',{kind:'v8-event',player:'opponent'},body([{action:'damage',target:'event-player',n:1}]));
 if(line==='Whenever you attack while you control a creature with power 4 or greater, you draw a card and lose 1 life.')return trigger('attackersDeclared','your-attackers',body([{action:'draw',who:'you',n:1},{action:'lose-life',who:'you',n:1}]),{eventTestV49:'ferocious'});
 if(line==='At the beginning of your end step, you draw X cards and lose X life, where X is your speed.')return trigger('endStep','your-end-step',body([{action:'draw',who:'you',n:{kind:'speed-v49'}},{action:'lose-life',who:'you',n:{kind:'speed-v49'}}]));
 if(line==='At the beginning of your upkeep, draw a card if you control the creature with the greatest toughness or tied for the greatest toughness.')return trigger('upkeep','your-upkeep',body([effect('greatest-toughness')]));
 if(line==='At the beginning of your end step, if you have fewer than ten cards in hand, draw cards equal to the difference.')return trigger('endStep','your-end-step',body([{action:'draw',who:'you',n:{kind:'hand-shortfall-v38',n:10}}]),{condition:{kind:'count-comparison',count:{kind:'count',zone:'hand',what:'card'},max:9}});
 if(line==='Whenever you cast a noncreature spell, you may draw X cards, where X is the amount of mana spent to cast that spell. If you do, discard two cards.')return trigger('cast',{kind:'v8-event',player:'you',target:h.target('target noncreature spell')},body([{action:'draw',who:'you',n:{kind:'event-mana-spent-v10'}},{action:'discard',who:'you',n:2}]),{optional:true});
 if(line==='Whenever this creature attacks, you may discard your hand. If you do, draw a card for each player being attacked.')return trigger('attacks','self',body([effect('discard-hand-attacked')]),{optional:true});
 if(line==='Whenever a Vehicle you control enters, draw a card if it has flying. Otherwise, put a flying counter on it.')return trigger('etb',{kind:'v8-event',target:h.target('target Vehicle you control')},body([effect('vehicle-flying')]));
 if(line==='Whenever another creature you control dies, draw a card if it was attacking. Otherwise, this creature deals 1 damage to each opponent.')return trigger('dies',{kind:'v8-event',subject:'another',target:h.target('target creature you control')},body([effect('attacking-death')]));
 if(line==="When this creature enters, destroy up to one other target creature. If that creature wasn't dealt damage this turn, its controller draws two cards.")return trigger('etb','self',body([effect('destroy-undamaged',{target:0})],[{...h.target('target creature'),excludeSelf:true,min:0,max:1}]));
 if(line==="When a player casts a spell, sacrifice this enchantment. If you do, each of that player's opponents draws three cards.")return trigger('cast','each-upkeep',body([effect('sacrifice-caster-opponents')]));
 if(line==='Whenever a player casts a spell, they may pay {1}. If the player does, they draw a card at the beginning of the next end step.')return trigger('cast','each-upkeep',body([effect('pay-delayed-draw')]));
 if(line==='Whenever this creature deals damage to an opponent, that player discards a card at random. If the player does, they draw a card.')return trigger('oracleDamageHit',{kind:'damage-event-v8',source:{kind:'self'},recipient:{kind:'an opponent'},bind:'recipient'},body([effect('random-discard-draw')]));
 if(line==='When this creature enters, you may have it deal 2 damage to another creature you control. If you do, draw a card.')return trigger('etb','self',body([effect('damage-own-draw')]));
 if(line==='Reveal the first card you draw each turn.')return {kind:'reveal-first-draw-v49',contract:'generic-continuous-effect'};
 let m=/^Whenever you reveal a (creature|basic land) card this way, draw a card\.$/.exec(line);
 if(m)return trigger('revealedFirstDrawV49','each-upkeep',body([{action:'draw',who:'you',n:1}]),{eventTestV49:'revealed-'+m[1]});
 if(line==='Whenever this creature attacks, defending player may have you draw a card. If they do, untap this creature and remove it from combat.')return trigger('attacks','self',body([effect('defender-draw-remove')]));
 if(line==='At the beginning of your upkeep, target opponent mills three cards, then you draw a card for each land card put into their graveyard this way.')return trigger('upkeep','your-upkeep',body([effect('mill-lands-draw',{target:0})],[h.target('target opponent')]));
 if(line==="At the beginning of your upkeep, target opponent may exile a card from their graveyard. If that player doesn't, you may draw a card.")return trigger('upkeep','your-upkeep',body([effect('opponent-exile-or-draw',{target:0})],[h.target('target opponent')]));
 if(line==='When this creature leaves the battlefield, you and another target player each draw a card.')return trigger('lto','self',body([{action:'draw',who:'you',n:1},{action:'draw',who:0,n:1}],[{...h.target('target player'),controller:'opponent'}]));
 if(line==='Whenever you attack, if a Pirate and a Vehicle attacked this combat, draw three cards, then discard two cards.')return trigger('attackersDeclared','your-attackers',body([{action:'draw',who:'you',n:3},{action:'discard',who:'you',n:2}]),{condition:{kind:'pirate-vehicle-attacked-v49'}});
 if(line==='Whenever a Zombie you control enters, put a +1/+1 counter on it for each other Zombie that entered the battlefield under your control this turn.')return trigger('etb',{kind:'v8-event',target:h.target('target Zombie you control')},body([effect('zombie-entry-counters')]));
 return null;
}
export function extensionEffect(card,text,h){
 if(text==='Target player draws a card, then discards a card. If that player discards an artifact card this way, untap this creature.')return body([effect('loot-artifact-untap',{target:0})],[h.target('target player')]);
 if(text==='Target opponent gains control of another target permanent you control. If they do, you draw a card.')return body([effect('give-draw',{target:1,player:0})],[h.target('target opponent'),{...h.target('target permanent you control'),excludeSelf:true}]);
 if(text==='Scry X, where X is the amount of {S} spent to cast this spell, then draw three cards.')return body([{action:'scry',who:'you',n:{kind:'snow-spent-v49'}},{action:'draw',who:'you',n:3}]);
 if(text==="Return all nonland permanents to their owners' hands. If this spell's surge cost was paid, create an 8/8 blue Octopus creature token.")return body([effect('surge-return')]);
 if(text==='Search your library for a card, exile it, then shuffle. Any opponent may have you put that card into your hand. If no player does, you draw three cards.')return body([effect('search-exile-offer')]);
 if(text.replace(/Exile (?:Step Between Worlds|this card)\./,'Exile this spell.')==='Each player may shuffle their hand and graveyard into their library. Each player who does draws seven cards. Exile this spell.')return body([effect('optional-wheel')]);
 return null;
}
