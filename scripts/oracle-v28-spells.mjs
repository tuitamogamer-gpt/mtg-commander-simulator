const TEXT={
  "Close Encounter": "As an additional cost to cast this spell, choose a creature you control or a warped creature card you own in exile.\nClose Encounter deals damage equal to the power of the chosen creature or card to target creature.",
  "Mythos of Vadrok": "Mythos of Vadrok deals 5 damage divided as you choose among any number of target creatures and/or planeswalkers. If {W}{U} was spent to cast this spell, until your next turn, those permanents can't attack or block and their activated abilities can't be activated.",
  "Voltage Surge": "As an additional cost to cast this spell, you may sacrifice an artifact.\nVoltage Surge deals 2 damage to target creature or planeswalker. If this spell's additional cost was paid, Voltage Surge deals 4 damage instead.",
  "Command the Dreadhorde": "Choose any number of target creature and/or planeswalker cards in graveyards. Command the Dreadhorde deals damage to you equal to the total mana value of those cards. Put them onto the battlefield under your control.",
  "Aether Burst": "Return up to X target creatures to their owners' hands, where X is one plus the number of cards named Aether Burst in all graveyards as you cast this spell.",
  "Paradoxical Outcome": "Return any number of target nonland, nontoken permanents you control to their owners' hands. Draw a card for each card returned to your hand this way.",
  "Candlekeep Inspiration": "Until end of turn, creatures you control have base power and toughness X/X, where X is the number of cards you own in exile and in your graveyard that are instant cards, are sorcery cards, and/or have an Adventure.",
  "Rise of the Witch-king": "Each player sacrifices a creature. If you sacrificed a creature this way, you may return another permanent card from your graveyard to the battlefield.",
  "Meteor Swarm": "Meteor Swarm deals 8 damage divided as you choose among X target creatures and/or planeswalkers.",
  "Lethal Throwdown": "As an additional cost to cast this spell, sacrifice a creature or sacrifice a modified creature.\nDestroy target creature or planeswalker. If the modified creature was sacrificed, draw a card.",
  "Treacherous Greed": "As an additional cost to cast this spell, sacrifice a creature that dealt damage this turn.\nDraw three cards. Each opponent loses 3 life and you gain 3 life.",
  "Swallow Whole": "As an additional cost to cast this spell, tap an untapped creature you control.\nExile target tapped creature. Put a +1/+1 counter on the creature tapped to pay this spell's additional cost.",
  "Monstrous Emergence": "As an additional cost to cast this spell, choose a creature you control or reveal a creature card from your hand.\nMonstrous Emergence deals damage equal to the power of the creature you chose or the card you revealed to target creature.",
  "Cleansing Meditation": "Destroy all enchantments.\nThreshold — If there are seven or more cards in your graveyard, instead destroy all enchantments, then return all cards in your graveyard destroyed this way to the battlefield.",
  "Searing Blaze": "Searing Blaze deals 1 damage to target player or planeswalker and 1 damage to target creature that player or that planeswalker's controller controls.\nLandfall — If you had a land enter the battlefield under your control this turn, Searing Blaze deals 3 damage to that player or planeswalker and 3 damage to that creature instead.",
  "Skull Raid": "Target opponent discards two cards. If fewer than two cards were discarded this way, you draw cards equal to the difference.\nForetell {1}{B}",
  "Kaervek's Spite": "As an additional cost to cast this spell, sacrifice all permanents you control and discard your hand.\nTarget player loses 5 life.",
  "Embolden": "Prevent the next 4 damage that would be dealt this turn to any number of targets, divided as you choose.\nFlashback {1}{W}",
  "Superior Numbers": "Superior Numbers deals damage to target creature equal to the number of creatures you control in excess of the number of creatures target opponent controls.",
  "Surge of Strength": "As an additional cost to cast this spell, discard a red or green card.\nTarget creature gains trample and gets +X/+0 until end of turn, where X is that creature's mana value.",
  "Balance of Power": "If target opponent has more cards in hand than you, draw cards equal to the difference.",
  "Wing Storm": "Wing Storm deals damage to each player equal to twice the number of creatures that player controls with flying.",
  "Remedy": "Prevent the next 5 damage that would be dealt this turn to any number of targets, divided as you choose.",
  "Cerebral Vortex": "Target player draws two cards, then Cerebral Vortex deals damage to that player equal to the number of cards they've drawn this turn.",
  "Aurelia's Fury": "Aurelia's Fury deals X damage divided as you choose among any number of targets. Tap each creature dealt damage this way. Players dealt damage this way can't cast noncreature spells this turn.",
  "Cut Propulsion": "Target creature deals damage to itself equal to its power. If that creature has flying, it deals twice that much damage to itself instead.",
  "Triumphant Chomp": "Triumphant Chomp deals damage to target creature equal to 2 or the greatest power among Dinosaurs you control, whichever is greater.",
  "Warren Weirding": "Target player sacrifices a creature. If a Goblin is sacrificed this way, that player creates two 1/1 black Goblin Rogue creature tokens, and those tokens gain haste until end of turn.",
  "Phyrexian Purge": "This spell costs 3 life more to cast for each target.\nDestroy any number of target creatures.",
  "Serpentine Curve": "Create a 0/0 green and blue Fractal creature token. Put X +1/+1 counters on it, where X is one plus the total number of instant and sorcery cards you own in exile and in your graveyard.",
  "Officious Interrogation": "This spell costs {W}{U} more to cast for each target beyond the first.\nChoose any number of target players. Investigate X times, where X is the total number of creatures those players control.",
  "Concussive Bolt": "Concussive Bolt deals 4 damage to target player or planeswalker.\nMetalcraft — If you control three or more artifacts, creatures controlled by that player or by that planeswalker's controller can't block this turn.",
  "The Elderspell": "Destroy any number of target planeswalkers. Choose a planeswalker you control. Put two loyalty counters on it for each planeswalker destroyed this way.",
  "Frantic Firebolt": "Frantic Firebolt deals X damage to target creature, where X is 2 plus the number of cards in your graveyard that are instant cards, sorcery cards, and/or have an Adventure.",
  "Sandman's Quicksand": "Mayhem {3}{B}\nAll creatures get -2/-2 until end of turn. If this spell's mayhem cost was paid, creatures your opponents control get -2/-2 until end of turn instead.",
  "Mind Bomb": "Each player may discard up to three cards. Mind Bomb deals damage to each player equal to 3 minus the number of cards they discarded this way.",
  "Pollen Remedy": "Kicker—Sacrifice a land.\nPrevent the next 3 damage that would be dealt this turn to any number of targets, divided as you choose. If this spell was kicked, prevent the next 6 damage this way instead."
};
const target=(what='creature',controller='any',zone='battlefield',extra={})=>({what,controller,zone,min:1,max:1,...extra});
const creature=(controller='any',extra={})=>target('creature',controller,'battlefield',extra);
const player=(controller='any',extra={})=>target('player',controller,'player',extra);
const any=extra=>target('any','any','battlefield',extra);
const union=(types,zone='battlefield',controller='any',extra={})=>target(types.includes('player')?'any':'card',controller,zone,{alternatives:types.map(what=>target(what,controller,zone)),...extra});
const amount=(metric,extra={})=>({kind:'spell-count-v28',metric,...extra});
const cohort=(mode,extra={})=>({action:'spell-cohort-v28',mode,...extra});
const branch=(condition,effects,elseEffects=[])=>({action:'conditional-v27',condition,effects,elseEffects});
const flag=flag=>({kind:'cast-flag-v10',flag});
const customCost=(mode,extra={})=>({kind:'spell-custom-cost-v28',mode,contract:'spell-custom-cost-v28',...extra});
const all=extra=>({min:0,max:0,unbounded:true,...extra});
const damage=(n,target=0)=>({action:'damage',target,n});
export function compileWholeCard(card,h){
 if(card.layout&&card.layout!=='normal'||!/\b(?:Instant|Sorcery)\b/.test(card.type_line||''))return null;
 const text=h.stripReminderText(card.oracle_text||'');if(!TEXT[card.name]||text!==TEXT[card.name])return null;
 const effects=[],targets=[],before=[];const spell=(e,t=[])=>{effects.push(...e);targets.push(...t);};
 switch(card.name){
  case 'Close Encounter':case 'Monstrous Emergence':before.push(customCost('chosen-power',{otherZone:card.name==='Close Encounter'?'exile':'hand'}));spell([damage(amount('chosen-power'))],[creature()]);break;
  case 'Voltage Surge':before.push(customCost('sacrifice',{optional:true,quality:'artifact'}));spell([branch(flag('oracleCostV28Optional'),[damage(4)],[damage(2)])],[union(['creature','planeswalker'])]);break;
  case 'Lethal Throwdown':before.push(customCost('sacrifice',{quality:'creature',modifiedChoice:true}));spell([{action:'destroy',target:0},branch(flag('oracleCostV28Modified'),[{action:'draw',who:'you',n:1}])],[union(['creature','planeswalker'])]);break;
  case 'Treacherous Greed':before.push(customCost('sacrifice',{quality:'dealt-damage'}));spell([{action:'draw',who:'you',n:3},{action:'lose-life',who:'each-opponent',n:3},{action:'gain-life',who:'you',n:3}]);break;
  case "Kaervek's Spite":before.push(customCost('all-permanents-hand'));spell([{action:'lose-life',who:0,n:5}],[player()]);break;
  case 'Surge of Strength':before.push(customCost('discard',{quality:'red-green'}));spell([{action:'pump',target:0,power:{kind:'target-stat',target:0,stat:'mv'},toughness:0,keywords:['trample']}],[creature()]);break;
  case 'Swallow Whole':before.push({kind:'mechanic-tap-cost-v20',n:1,filter:creature('you'),contract:'mechanic-tap-cost-v20'},{kind:'spell-tap-evidence-v28',contract:'spell-tap-evidence-v28'});spell([{action:'exile',target:0},cohort('counter-tapped',{n:1})],[creature('any',{tapped:true})]);break;
  case 'Paradoxical Outcome':spell([cohort('bounce-draw',{target:0})],[target('permanent','you','battlefield',{nonland:true,nontoken:true,...all()})]);break;
  case 'Command the Dreadhorde':spell([cohort('command-return',{target:0})],[union(['creature','planeswalker'],'graveyard','any',all())]);break;
  case 'Cleansing Meditation':spell([cohort('destroy-return-enchantments')]);break;
  case 'Warren Weirding':spell([cohort('sacrifice-goblins',{target:0})],[player()]);break;
  case 'Rise of the Witch-king':spell([cohort('sacrifice-return')]);break;
  case 'Skull Raid':before.push({kind:'mechanic-foretell',cost:'{1}{B}',contract:'mechanic-foretell'});spell([cohort('discard-difference',{target:0,n:2})],[player('opponent')]);break;
  case 'Mind Bomb':spell([cohort('discard-damage',{n:3})]);break;
  case 'The Elderspell':spell([cohort('destroy-loyalty',{target:0})],[target('planeswalker','any','battlefield',all())]);break;
  case 'Searing Blaze':spell([cohort('paired-landfall-damage',{target:0,otherTarget:1})],[union(['player','planeswalker'],'any'),creature('any',{sameControllerAsFirstV28:true})]);break;
  case 'Concussive Bolt':spell([damage(4),cohort('metalcraft-controller-block',{target:0})],[union(['player','planeswalker'],'any')]);break;
  case "Sandman's Quicksand":before.push({kind:'mechanic-mayhem-v8',cost:'{3}{B}',speed:'sorcery',contract:'mechanic-mayhem-v8'});spell([branch(flag('mayhem'),[{action:'pump-group',who:'opponent-creatures',power:-2,toughness:-2,keywords:[]}],[{action:'pump-group',who:'all-creatures',power:-2,toughness:-2,keywords:[]}])]);break;
  case 'Phyrexian Purge':before.push(customCost('life-per-target',{n:3}));spell([{action:'destroy',target:0}],[creature('any',all())]);break;
  case 'Officious Interrogation':before.push({kind:'mechanic-strive-v8',cost:'{W}{U}',contract:'mechanic-strive-v8'});spell([{action:'investigate',who:'you',n:amount('selected-player-creatures',{target:0})}],[player('any',all())]);break;
  case 'Cerebral Vortex':spell([{action:'draw',who:0,n:2},damage(amount('selected-player-drawn',{target:0}))],[player()]);break;
  case 'Wing Storm':spell([cohort('player-flying-damage')]);break;
  case 'Balance of Power':spell([{action:'draw',who:'you',n:amount('hand-difference',{target:0})}],[player('opponent')]);break;
  case 'Superior Numbers':spell([damage(amount('creature-difference',{target:1}))],[creature(),player('opponent')]);break;
  case 'Triumphant Chomp':spell([damage(amount('dinosaur-power'))],[creature()]);break;
  case 'Cut Propulsion':spell([cohort('self-damage-flying',{target:0})],[creature()]);break;
  case 'Frantic Firebolt':spell([damage(amount('own-grave-spells',{includeAdventure:true,add:2}))],[creature()]);break;
  case 'Serpentine Curve':spell([{action:'token-inline',who:'you',n:1,token:{name:'Fractal',power:'0',toughness:'0',colors:['G','U'],types:['Creature'],subtypes:['Fractal'],keywords:[]}},{action:'counter',target:'created-tokens',counter:'+1/+1',n:amount('own-grave-spells',{exile:true,add:1})}]);break;
  case 'Candlekeep Inspiration':spell([{action:'base-pt',filters:[creature('you')],power:amount('own-grave-spells',{exile:true,includeAdventure:true}),toughness:amount('own-grave-spells',{exile:true,includeAdventure:true}),keywords:[]}]);break;
  case 'Aether Burst':before.push({kind:'spell-target-quota-v28',contract:'spell-target-quota-v28'});spell([{action:'move-to-hand',target:0}],[creature('any',{min:0,max:0,unbounded:true,dividedAmount:amount('aether-cast-quota')})]);break;
  case 'Mythos of Vadrok':spell([{action:'divided-damage-v8',target:0,n:5},branch({kind:'all',conditions:['W','U'].map(color=>({kind:'mana-spent',colors:[color],min:1}))},[{action:'combat-restriction',target:0,restriction:{cantAttack:true,cantBlock:true,activationDisabled:true},duration:'next-turn'}])],[union(['creature','planeswalker'],'battlefield','any',{min:0,max:5,dividedAmount:5})]);break;
  case 'Meteor Swarm':before.push({kind:'spell-x-bound-v28',max:8,contract:'spell-x-bound-v28'});spell([{action:'divided-damage-v8',target:0,n:8}],[union(['creature','planeswalker'],'battlefield','any',{targetCountX:true})]);break;
  case "Aurelia's Fury":spell([cohort('divided-followup',{target:0,n:'X'})],[any({min:0,max:0,unbounded:true,dividedAmount:'X'})]);break;
  case 'Pollen Remedy':before.push({kind:'mechanic-keyword-payment-v8',keyword:'kicker',mana:'{0}',costs:[{id:'v28-kicker-land',kind:'sacrifice',quantity:{min:1,max:1},object:{kind:'permanent',types:['Land']}}],label:'Kicker — sacrifice a land',contract:'mechanic-keyword-payment-v8'});spell([{action:'divided-prevention-v28',target:0,n:amount('kicked-prevention',{normal:3,kicked:6})}],[any({min:0,max:0,unbounded:true,dividedAmount:amount('kicked-prevention',{normal:3,kicked:6})})]);break;
  case 'Remedy':case 'Embolden':{const n=card.name==='Remedy'?5:4;if(card.name==='Embolden')before.push({kind:'mechanic-flashback',cost:'{1}{W}',speed:'instant',contract:'mechanic-flashback'});spell([{action:'divided-prevention-v28',target:0,n}],[any({min:0,max:n,dividedAmount:n})]);break;}
  default:return null;
 }
 const implementation=[...before,{kind:'spell-generic',effects,targets,optional:false,contract:'spell-generic-effect'}];
 return {semanticClass:'spell-template',implementation,implementedKeywords:[],rulesCore:text,oracleContracts:[...new Set(implementation.map(o=>o.contract))]};
}
