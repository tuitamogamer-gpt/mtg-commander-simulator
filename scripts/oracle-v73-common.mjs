// Closed complete clauses for permanent cards. Unrecognized Oracle text is rejected.
const body=(effects,targets=[])=>({effects,targets,optional:false});
const effect=(mode,extra={})=>({action:'common-effects-v73',mode,...extra});
const op=(mode,extra={})=>({kind:'common-permanent-v73',mode,...extra,contract:'generic-continuous-effect'});
const trigger=(event,eventFilter,b,extra={})=>b&&({kind:'generic-trigger',event,eventFilter,...b,...extra,contract:'generic-trigger-effect'});
export function extensionLine(card,line,h){
 if(line==="You can't lose the game.")return op('cant-lose');
 if(line==='All creatures block each combat if able.')return op('all-block');
 if(line==='The attacking player chooses how each creature blocks each combat.')return op('attack-player-blocks');
 if(line==='Each opponent must attack you or a planeswalker you control with at least one creature each combat if able.')return op('temptation-attack');
 if(line==="At the beginning of combat on each opponent's turn, separate all creatures that player controls into two piles. Only creatures in the pile of their choice can attack this turn.")return trigger('beginCombat','opponent-player',body([effect('pile-combat',{attack:true})]));
 if(line==='At the beginning of combat on your turn, for each defending player, separate all creatures that player controls into two piles and that player chooses one. Only creatures in the chosen piles can block this turn.')return trigger('beginCombat','your-combat',body([effect('pile-combat',{attack:false})]));
 if(line==='Whenever one or more creatures you control attack, each defending player divides all creatures without flying they control into a "left" pile and a "right" pile. For each attacking creature you control, choose "left" or "right.". That creature can\'t be blocked this combat except by creatures with flying and creatures in a pile with the chosen label.')return trigger('attackersDeclared','your-cast',body([effect('river-piles')]));
 if(line==='If a creature with a magnet counter on it attacks, all creatures with magnet counters on them attack if able.')return op('magnet-attack');
 if(line==='Whenever a creature with a magnet counter on it attacks, all creatures with magnet counters on them block that creature this turn if able.')return trigger('attacks',{kind:'object-event-v13'},body([effect('magnet-block')]),{magnetV73:true});
 if(line==='Whenever you lose life, for each 1 life you lost, exile a permanent you control or a card from your hand or graveyard.')return trigger('lifeLost','you',body([effect('mastery-exile')]),{lifeLostV73:true});

 if(line==='Enchant land you control')return {kind:'aura-target',what:'land',targetV9:h.target('target land you control'),contract:'aura-targeting'};
 const land=/^Enchanted land is a (3)\/(3) red Spirit creature with haste\. It\'s still a land\.$|^Enchanted land is a (4)\/(5) green Spirit creature with vigilance and haste\. It\'s still a land\.$/.exec(line);
 if(land)return op('land-animation',{power:land[1]?3:4,toughness:land[1]?3:5,color:land[1]?'R':'G',vigilance:!land[1]});

 if(line==='Whenever one or more nontoken Merfolk you control become tapped, create a 1/1 blue Merfolk creature token with hexproof.')return trigger('becameTapped',null,h.effect(card,'Create a 1/1 blue Merfolk creature token with hexproof.'),{tapMerfolkV73:true,oncePerBatch:true});
 if(line==='Whenever you put one or more counters on a permanent or player, this enchantment deals that much damage to target opponent, creature an opponent controls, or planeswalker an opponent controls.')return trigger('countersPlaced',null,body([{action:'damage',target:0,n:{kind:'event-number-v73'}}],[{what:'any',zone:'battlefield',min:1,controller:'opponent',v20:{kind:'counter-damage-v73'}}]),{byYouV73:true});
 if(line==='Whenever you pay life, put that many blood counters on this enchantment.')return trigger('lifePaidV73', 'you', body([{action:'counter',target:'self',counter:'blood',n:{kind:'event-number-v73'}}]),{lifePaidV73:true});
 if(line==='Whenever an opponent taps a land for mana, tap all lands that player controls.')return trigger('tappedForMana',null,body([effect('tap-lands')]),{opponentLandManaV73:true});
 if(line==='If a creature an opponent controls attacks, all creatures that opponent controls attack if able.')return op('all-attack');
 if(line==='All creatures attack enchanted creature\'s controller each combat if able.')return op('public-enemy');
 if(line==='When this enchantment enters, if it\'s not a token, each of your teammates creates a token that\'s a copy of this enchantment.')return trigger('etb','self',body([effect('team-copies')]),{nontokenV73:true});
 if(line==='If a spell or ability would cause its controller to gain life, that player loses that much life instead.')return op('rain-gore');
 if(line==='During your turn, as long as this permanent has one or more loyalty counters on him, he\'s a 3/4 Ninja creature and has hexproof.'||line==='During your turn, as long as Kaito has one or more loyalty counters on him, he\'s a 3/4 Ninja creature and has hexproof.')return op('kaito');
 if(line==='Whenever a creature you control dies, you may pay 3 life. If you do, return that card under your control with a finality counter on it.')return trigger('dies','your-creature',body([effect('meathook',{own:true})]));
 if(line==='Whenever a creature an opponent controls dies, they may pay 3 life. If they don\'t, return that card under your control with a finality counter on it.')return trigger('dies',{kind:'v8-event',target:h.target('target creature an opponent controls')},body([effect('meathook',{own:false})]));
 if(line==='Whenever a creature an opponent controls is dealt excess noncombat damage, amass Orcs X, where X is that excess damage.')return trigger('dealtDamage',null,body([effect('excess-amass')]),{excessV73:true});
 if(line==='Whenever this enchantment or another nontoken enchantment you control enters, create a 1/1 white Soldier creature token.')return trigger('etb',null,h.effect(card,'Create a 1/1 white Soldier creature token.'),{historianEntryV73:true});
 if(line==='Whenever the final chapter ability of a Saga you control triggers, create a 4/4 white Angel creature token with flying and vigilance.')return trigger('finalSagaChapterV73',null,h.effect(card,'Create a 4/4 white Angel creature token with flying and vigilance.'),{ownSagaV73:true});
 if(line==='As this enchantment enters, choose a creature.')return op('metamorphic-choice');
 if(line==='Enchanted creature is a copy of the chosen creature.')return op('metamorphic-copy');
 if(line==='Aura swap {2}{U}')return {kind:'generic-ability',cost:{mana:'{2}{U}'},...body([effect('aura-swap')]),contract:'generic-activated-effect'};
 if(line==='If enchanted land would be destroyed, instead sacrifice this enchantment and that land gains indestructible until end of turn.')return op('emergence-replacement');
 if(line==='Enchanted land loses all land types and abilities and has "{T}: Add {C}" and "{T}, Pay 1 life: Add one mana of any color.".')return op('lithoform');
 if(line==='All lands lose all abilities except mana abilities.')return op('blood-sun');
 return null;
}
export const modifierOperation=extensionLine;
export function extensionEffect(card,text,h){
 if(text==='Any number of target players each discard a card.')return body([{action:'discard',who:0,n:1}],[{...h.target('target player'),min:0,unbounded:true}]);
 if(text==='Surveil 2. Draw a card for each opponent who lost life this turn.')return body([{action:'surveil',who:'you',n:2},effect('opponents-lost-draw')]);
 if(text==='Flip five coins. Target opponent skips their next X turns, where X is the number of coins that came up heads.')return body([effect('ral-coins',{target:0})],[h.target('target opponent')]);
 if(text==='You may reveal an artifact card you own from outside the game or choose a face-up artifact card you own in exile. Put that card into your hand.')return body([effect('karn-exile')]);

 if(text==='Until your next turn, up to one target noncreature artifact becomes an artifact creature with power and toughness each equal to its mana value.')return body([{action:'animate',target:0,types:['Artifact','Creature'],subtypes:[],retainTypes:true,retainAllSubtypes:true,power:{kind:'target-stat',target:0,stat:'mv'},toughness:{kind:'target-stat',target:0,stat:'mv'},durationV14:'next-turn',temporary:true,keywords:[]}],[{...h.target('target noncreature artifact'),min:0,max:1}]);
 if(/^(?:This permanent|Fires of Mount Doom) deals 2 damage to target creature an opponent controls\. Destroy all Equipment attached to that creature\.$/.test(text))return body([{action:'damage',target:0,n:2},effect('destroy-equipment',{target:0})],[h.target('target creature an opponent controls')]);
 if(text==='Exile the top card of your library. You may play that card this turn. When you play a card this way, Fires of Mount Doom deals 2 damage to each player.'||text==='Exile the top card of your library. You may play that card this turn. When you play a card this way, this enchantment deals 2 damage to each player.')return body([effect('doom-exile')]);
 return null;
}
