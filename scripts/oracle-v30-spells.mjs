const TEXT = {
  "No Witnesses": "Each player who controls the most creatures investigates. Destroy all creatures.",
  "Aggravate": "Aggravate deals 1 damage to each creature target player controls. Each creature dealt damage this way attacks this turn if able.",
  "When We Were Young": "Up to two target creatures each get +2/+2 until end of turn. If you control an artifact and an enchantment, those creatures also gain lifelink until end of turn.",
  "Epicenter": "Target player sacrifices a land.\nThreshold — Each player sacrifices all lands they control instead if there are seven or more cards in your graveyard.",
  "Come Back Wrong": "Destroy target creature. If a creature card is put into a graveyard this way, return it to the battlefield under your control. Sacrifice it at the beginning of your next end step.",
  "Fraying Omnipotence": "Each player loses half their life, then discards half the cards in their hand, then sacrifices half the creatures they control. Round up each time.",
  "Dazzling Reflection": "You gain life equal to target creature's power. The next time that creature would deal damage this turn, prevent that damage.",
  "Malamet Battle Glyph": "Choose target creature you control and target creature you don't control. If the creature you control entered this turn, put a +1/+1 counter on it. Those creatures fight each other.",
  "Volcanic Eruption": "Destroy X target Mountains. Volcanic Eruption deals damage to each creature and each player equal to the number of Mountains put into a graveyard this way.",
  "Omen of Fire": "Return all Islands to their owners' hands. Each player sacrifices a Plains or a white permanent for each white permanent they control.",
  "Spiteful Repossession": "Spiteful Repossession deals damage to each opponent who controls more lands than you equal to the difference. Create a number of Treasure tokens equal to the damage dealt this way.",
  "Brightflame": "Radiance — Brightflame deals X damage to target creature and each other creature that shares a color with it. You gain life equal to the damage dealt this way.",
  "Ent's Fury": "Put a +1/+1 counter on target creature you control if its power is 4 or greater. That creature gets +1/+1 until end of turn and fights target creature you don't control.",
  "Stronghold Gambit": "Each player chooses a card in their hand. Each player reveals their chosen card. The owner of each creature card revealed this way with the lowest mana value puts it onto the battlefield.",
  "Rhystic Scrying": "Draw three cards. If any player pays {2}, discard three cards.",
  "Builder's Bane": "Destroy X target artifacts. Builder's Bane deals damage to each player equal to the number of artifacts they controlled that were put into a graveyard this way.",
  "Kamahl's Summons": "Each player may reveal any number of creature cards from their hand. Each player creates a 2/2 green Bear creature token for each card they revealed this way.",
  "Send to Sleep": "Tap up to two target creatures.\nSpell mastery — If there are two or more instant and/or sorcery cards in your graveyard, those creatures don't untap during their controllers' next untap steps.",
  "Breaking Point": "Any player may have Breaking Point deal 6 damage to them. If no one does, destroy all creatures. Creatures destroyed this way can't be regenerated.",
  "Sink into Takenuma": "Sweep — Return any number of Swamps you control to their owner's hand. Target player discards a card for each Swamp returned this way.",
  "Ego Drain": "Target opponent reveals their hand. You choose a nonland card from it. That player discards that card. If you don't control a Faerie, exile a card from your hand.",
  "Savage Swipe": "Target creature you control gets +2/+2 until end of turn if its power is 2. It fights target creature you don't control.",
  "Charge Across the Araba": "Sweep — Return any number of Plains you control to their owner's hand. Creatures you control get +1/+1 until end of turn for each Plains returned this way.",
  "Alpha Brawl": "Target creature an opponent controls deals damage equal to its power to each other creature that player controls, then each of those creatures deals damage equal to its power to that creature.",
  "Friendly Fire": "Target creature's controller reveals a card at random from their hand. Friendly Fire deals damage to that creature and that player equal to the revealed card's mana value.",
  "Throw from the Saddle": "Target creature you control gets +1/+1 until end of turn. Put a +1/+1 counter on it instead if it's a Mount. It deals damage equal to its power to target creature you don't control.",
  "Urborg Justice": "Target opponent sacrifices a creature for each creature put into your graveyard from the battlefield this turn.",
  "Barrel Down Sokenzan": "Sweep — Return any number of Mountains you control to their owner's hand. Barrel Down Sokenzan deals damage to target creature equal to twice the number of Mountains returned this way.",
  "Covetous Elegy": "Each player chooses up to two creatures they control, then sacrifices the rest. You create a tapped Treasure token for each creature your opponents control.",
  "Plow Through Reito": "Sweep — Return any number of Plains you control to their owner's hand. Target creature gets +1/+1 until end of turn for each Plains returned this way.",
  "Friendly Rivalry": "Target creature you control and up to one other target legendary creature you control each deal damage equal to their power to target creature you don't control.",
  "Brood Birthing": "If you control an Eldrazi Spawn, create three 0/1 colorless Eldrazi Spawn creature tokens. They have \"Sacrifice this token: Add {C}.\". Otherwise, create one of those tokens.",
  "Tandem Takedown": "Up to two target creatures you control each get +1/+0 until end of turn. They each deal damage equal to their power to another target creature, planeswalker, or battle.",
  "Essence Vortex": "Destroy target creature unless its controller pays life equal to its toughness. A creature destroyed this way can't be regenerated.",
  "Underworld Fires": "Underworld Fires deals 1 damage to each creature and each planeswalker. If a permanent dealt damage this way would die this turn, exile it instead.",
  "Pulse of the Forge": "Pulse of the Forge deals 4 damage to target player or planeswalker. If that player or that planeswalker's controller has more life than you, return Pulse of the Forge to its owner's hand.",
  "Icy Blast": "Tap X target creatures.\nFerocious — If you control a creature with power 4 or greater, those creatures don't untap during their controllers' next untap steps.",
  "Rhystic Lightning": "Rhystic Lightning deals 4 damage to any target unless that permanent's controller or that player pays {2}. If they do, Rhystic Lightning deals 2 damage to the permanent or player.",
  "Dose of Dawnglow": "Return target creature card from your graveyard to the battlefield. If it isn't your main phase, blight 2.",
  "Dead Ringers": "Destroy two target nonblack creatures unless either one is a color the other isn't. They can't be regenerated."
};
const target=(what='creature',controller='any',zone='battlefield',extra={})=>({what,controller,zone,min:1,max:1,...extra}),creature=(controller='any',extra={})=>target('creature',controller,'battlefield',extra),player=(controller='any')=>target('player',controller,'player'),count=(metric,extra={})=>({kind:'spell-count-v30',metric,...extra}),branch=(metric,effects,elseEffects=[])=>({action:'spell-if-v30',metric,effects,elseEffects}),cohort=(mode,extra={})=>({action:'spell-cohort-v30',mode,...extra}),damage=(n,target=0)=>({action:'damage',target,n}),pump=(power,toughness=power,target=0,keywords=[])=>({action:'pump',target,power,toughness,keywords}),fight=()=>({action:'fight',target:0,otherTarget:1}),counter=()=>({action:'counter',target:0,counter:'+1/+1',n:1});
const pair=()=>[creature('you'),creature('opponent')];
export function compileWholeCard(card,h){
 if(card.layout&&card.layout!=='normal'||!/\b(?:Instant|Sorcery)\b/.test(card.type_line||''))return null;
 const text=h.stripReminderText(card.oracle_text||'');if(!TEXT[card.name]||text!==TEXT[card.name])return null;
 let effects=[],targets=[];
 switch(card.name){
  case 'Dead Ringers':effects=[cohort('matching-colors-destroy',{target:0})];targets=[creature('any',{min:2,max:2,nonblack:true})];break;
  case 'Dazzling Reflection':effects=[{action:'gain-life',who:'you',n:{kind:'target-stat',target:0,stat:'power'}},cohort('prevent-next-source',{target:0})];targets=[creature()];break;
  case 'Urborg Justice':effects=[cohort('sacrifice-death-count',{target:0})];targets=[player('opponent')];break;
  case 'Aggravate':effects=[cohort('damage-player-creatures',{target:0,n:1,attack:true})];targets=[player()];break;
  case 'Essence Vortex':effects=[cohort('pay-life-or-destroy',{target:0})];targets=[creature()];break;
  case 'Sink into Takenuma':effects=[cohort('sweep',{subtype:'Swamp',effect:'discard',target:0})];targets=[player()];break;
  case 'Plow Through Reito':effects=[cohort('sweep',{subtype:'Plains',effect:'pump',target:0})];targets=[creature()];break;
  case 'Charge Across the Araba':effects=[cohort('sweep',{subtype:'Plains',effect:'pump-all'})];break;
  case 'Barrel Down Sokenzan':effects=[cohort('sweep',{subtype:'Mountain',effect:'damage',target:0,multiply:2})];targets=[creature()];break;
  case 'Breaking Point':effects=[cohort('any-player-damage-destroy',{n:6})];break;
  case 'Underworld Fires':effects=[cohort('creature-walker-damage-exile',{n:1})];break;
  case 'Omen of Fire':effects=[cohort('island-bounce-white-sacrifice')];break;
  case 'Volcanic Eruption':effects=[cohort('destroy-targets-damage',{target:0,scope:'all'})];targets=[target('land','any','battlefield',{subtype:'Mountain',targetCountX:true,min:0,max:0})];break;
  case "Builder's Bane":effects=[cohort('destroy-targets-damage',{target:0,scope:'controllers'})];targets=[target('artifact','any','battlefield',{targetCountX:true,min:0,max:0})];break;
  case 'Brightflame':effects=[cohort('radiance-damage-life',{target:0})];targets=[creature()];break;
  case 'Covetous Elegy':effects=[cohort('keep-creatures-treasure',{n:2})];break;
  case 'Friendly Rivalry':effects=[cohort('sources-bite',{sourceTargets:[0,1],target:2})];targets=[creature('you'),creature('you',{min:0,max:1,legendary:true,differentFromPrevious:true}),creature('opponent')];break;
  case 'When We Were Young':effects=[pump(2),branch('artifact-and-enchantment',[pump(0,0,0,['lifelink'])])];targets=[creature('any',{min:0,max:2})];break;
  case 'Ego Drain':effects=[cohort('discard-nonland-exile-self',{target:0})];targets=[player('opponent')];break;
  case 'Dose of Dawnglow':effects=[{action:'reanimate',target:0},branch('not-main',[{action:'blight-v9',who:'you',n:2}])];targets=[target('creature','you','graveyard')];break;
  case 'Fraying Omnipotence':effects=[cohort('halves')];break;
  case "Kamahl's Summons":effects=[cohort('reveal-creatures-bears')];break;
  case 'Epicenter':effects=[cohort('sacrifice-lands',{target:0})];targets=[player()];break;
  case 'Tandem Takedown':effects=[pump(1,0),cohort('sources-bite',{sourceTargets:[0],target:1})];targets=[creature('you',{min:0,max:2}),target('card','any','battlefield',{differentFromPrevious:true,alternatives:['creature','planeswalker','battle'].map(what=>target(what))})];break;
  case 'Friendly Fire':effects=[cohort('random-hand-damage',{target:0})];targets=[creature()];break;
  case 'Brood Birthing':effects=[cohort('spawn')];break;
  case "Ent's Fury":effects=[branch('large-power',[counter()]),pump(1),fight()];targets=pair();break;
  case 'Savage Swipe':effects=[branch('power-two',[pump(2)]),fight()];targets=pair();break;
  case 'Come Back Wrong':effects=[cohort('destroy-return-sacrifice',{target:0})];targets=[creature()];break;
  case 'Rhystic Lightning':effects=[cohort('pay-mana-damage',{target:0,cost:'{2}',paid:2,unpaid:4})];targets=[target('any')];break;
  case 'Spiteful Repossession':effects=[cohort('opponent-land-gap-treasure')];break;
  case 'Malamet Battle Glyph':effects=[branch('target-entered',[counter()]),fight()];targets=pair();break;
  case 'Throw from the Saddle':effects=[branch('mount',[counter()],[pump(1)]),{action:'bite',target:0,otherTarget:1,stat:'power'}];targets=pair();break;
  case 'No Witnesses':effects=[cohort('most-creatures-investigate'),{action:'battlefield-group',operation:'destroy',filters:[creature()]}];break;
  case 'Alpha Brawl':effects=[cohort('alpha-brawl',{target:0})];targets=[creature('opponent')];break;
  case 'Stronghold Gambit':effects=[cohort('reveal-lowest-creatures')];break;
  case 'Pulse of the Forge':effects=[damage(4),cohort('greater-life-return-source',{target:0})];targets=[target('any','any','battlefield',{alternatives:[player(),target('planeswalker')]})];break;
  case 'Rhystic Scrying':effects=[{action:'draw',who:'you',n:3},cohort('any-player-pay-discard',{cost:'{2}',n:3})];break;
  case 'Icy Blast':case 'Send to Sleep':effects=[{action:'tap',target:0},branch(card.name==='Icy Blast'?'ferocious':'spell-mastery',[{action:'skip-next-untap',target:0}])];targets=[creature('any',card.name==='Icy Blast'?{targetCountX:true,min:0,max:0}:{min:0,max:2})];break;
  default:return null;
 }
 return {semanticClass:'spell-template',implementation:[{kind:'spell-generic',effects,targets,optional:false,contract:'spell-generic-effect'}],implementedKeywords:[],rulesCore:text,oracleContracts:['spell-generic-effect']};
}
