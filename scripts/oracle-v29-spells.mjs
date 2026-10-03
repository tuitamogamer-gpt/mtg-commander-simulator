const TEXT = {
  "Browbeat": "Any player may have Browbeat deal 5 damage to them. If no one does, target player draws three cards.",
  "Unravel": "Counter target spell. If the amount of mana spent to cast that spell was less than its mana value, you draw a card.",
  "Simulacrum": "You gain life equal to the damage dealt to you this turn. Simulacrum deals damage to target creature you control equal to the damage dealt to you this turn.",
  "Jaded Response": "Counter target spell if it shares a color with a creature you control.",
  "Anoint with Affliction": "Exile target creature if it has mana value 3 or less.\nCorrupted — Exile that creature instead if its controller has three or more poison counters.",
  "Fade from History": "Each player who controls an artifact or enchantment creates a 2/2 green Bear creature token. Destroy all artifacts and enchantments.",
  "Insatiable Appetite": "You may sacrifice a Food. If you do, target creature gets +5/+5 until end of turn. Otherwise, that creature gets +3/+3 until end of turn.",
  "Inquisitor's Snare": "Prevent all damage target attacking or blocking creature would deal this turn. If that creature is black or red, destroy it.",
  "Resolute Strike": "Target creature gets +2/+2 until end of turn. If it's a Warrior, you may attach an Equipment you control to it.",
  "Bring the Ending": "Counter target spell unless its controller pays {2}.\nCorrupted — Counter that spell instead if its controller has three or more poison counters.",
  "Disorder": "Disorder deals 2 damage to each white creature and each player who controls a white creature.",
  "Roiling Terrain": "Destroy target land, then Roiling Terrain deals damage to that land's controller equal to the number of land cards in that player's graveyard.",
  "Dismantle": "Destroy target artifact. If that artifact had counters on it, put that many +1/+1 counters or charge counters on an artifact you control.",
  "Reign of Terror": "Destroy all green creatures or all white creatures. They can't be regenerated. You lose 2 life for each creature that died this way.",
  "Teachings of the Archaics": "If an opponent has more cards in hand than you, draw two cards. Draw three cards instead if an opponent has at least four more cards in hand than you.",
  "Twinstrike": "Twinstrike deals 2 damage to each of two target creatures.\nHellbent — Destroy those creatures instead if you have no cards in hand.",
  "Necrotic Fumes": "As an additional cost to cast this spell, exile a creature you control.\nExile target creature or planeswalker.",
  "Match the Odds": "Create a 1/1 white Ally creature token. Put a +1/+1 counter on it for each creature your opponents control.",
  "Lightning Dart": "Lightning Dart deals 1 damage to target creature. If that creature is white or blue, Lightning Dart deals 4 damage to it instead.",
  "Reward the Faithful": "Each of any number of target players each gains life equal to the greatest mana value among permanents you control.",
  "Bane's Contingency": "Counter target spell. If that spell targets a commander you control, instead counter that spell, scry 2, then draw a card.",
  "Engulf the Shore": "Return to their owners' hands all creatures with toughness less than or equal to the number of Islands you control.",
  "Spoils of Evil": "For each artifact or creature card in target opponent's graveyard, add {C} and you gain 1 life.",
  "Thoughtweft Charge": "Target creature gets +3/+3 until end of turn. If a creature entered the battlefield under your control this turn, draw a card.",
  "Dispersal Shield": "Counter target spell if its mana value is less than or equal to the greatest mana value among permanents you control.",
  "Lich-Knights' Conquest": "Sacrifice any number of artifacts, enchantments, and/or tokens. Return that many creature cards from your graveyard to the battlefield.",
  "Coordinated Clobbering": "Tap one or two target untapped creatures you control. They each deal damage equal to their power to target creature an opponent controls.",
  "Crater's Claws": "Crater's Claws deals X damage to any target.\nFerocious — Crater's Claws deals X plus 2 damage instead if you control a creature with power 4 or greater.",
  "Battlefield Improvisation": "Target creature gets +2/+2 until end of turn. If that creature is attacking, you may attach any number of Equipment you control to it.",
  "Pippin's Bravery": "You may sacrifice a Food. If you do, target creature gets +4/+4 until end of turn. Otherwise, that creature gets +2/+2 until end of turn.",
  "Ill-Gotten Gains": "Exile Ill-Gotten Gains. Each player discards their hand, then returns up to three cards from their graveyard to their hand.",
  "Audience with Trostani": "Create a 0/1 green Plant creature token, then draw cards equal to the number of differently named creature tokens you control.",
  "Rupture": "Sacrifice a creature. Rupture deals damage equal to that creature's power to each creature without flying and each player.",
  "Hour of Glory": "Exile target creature. If that creature was a God, its controller reveals their hand and exiles all cards from it with the same name as that creature.",
  "Seeds of Innocence": "Destroy all artifacts. They can't be regenerated. The controller of each of those artifacts gains life equal to its mana value.",
  "Vow to Erebor": "Untap target creature you control. It gets +2/+2 until end of turn. If it's a Dwarf, you may attach an Equipment you control to it.",
  "Unified Will": "Counter target spell if you control more creatures than that spell's controller.",
  "Unforge": "Destroy target Equipment. If that Equipment was attached to a creature, Unforge deals 2 damage to that creature.",
  "Truce": "Each player may draw up to two cards. For each card less than two a player draws this way, that player gains 2 life.",
  "Temporary Truce": "Each player may draw up to two cards. For each card less than two a player draws this way, that player gains 2 life."
};
const target=(what='creature',controller='any',zone='battlefield',extra={})=>({what,controller,zone,min:1,max:1,...extra}),creature=(controller='any',extra={})=>target('creature',controller,'battlefield',extra),player=(controller='any',extra={})=>target('player',controller,'player',extra),spell=()=>target('spell','any','stack'),any=()=>target('any');
const count=(metric,extra={})=>({kind:'spell-count-v29',metric,...extra}),check=(metric,extra={})=>({metric,...extra}),branch=(condition,effects,elseEffects=[])=>({action:'spell-if-v29',condition,effects,elseEffects}),cohort=(mode,extra={})=>({action:'spell-cohort-v29',mode,...extra}),damage=(n,target=0)=>({action:'damage',target,n}),counter=()=>({action:'counter-spell',target:0}),all=()=>({min:0,max:0,unbounded:true}),pump=n=>({action:'pump',target:0,power:n,toughness:n,keywords:[]});
const token=(name,power,toughness,colors,subtypes)=>({action:'token-inline',who:'you',n:1,token:{name,power:String(power),toughness:String(toughness),colors,types:['Creature'],subtypes,keywords:[]}});
export function compileWholeCard(card,h){
 if(card.layout&&card.layout!=='normal'||!/\b(?:Instant|Sorcery)\b/.test(card.type_line||''))return null;
 const text=h.stripReminderText(card.oracle_text||'');if(!TEXT[card.name]||text!==TEXT[card.name])return null;
 let effects=[],targets=[],before=[];
 switch(card.name){
  case 'Jaded Response':effects=[branch(check('spell-creature-color'),[counter()])];targets=[spell()];break;
  case 'Unified Will':effects=[branch(check('more-creatures'),[counter()])];targets=[spell()];break;
  case 'Dispersal Shield':effects=[branch(check('maximum-mana-value'),[counter()])];targets=[spell()];break;
  case 'Unravel':effects=[branch(check('underpaid-spell'),[counter(),{action:'draw',who:'you',n:1}],[counter()])];targets=[spell()];break;
  case "Bane's Contingency":effects=[branch(check('commander-target'),[counter(),{action:'scry',who:'you',n:2},{action:'draw',who:'you',n:1}],[counter()])];targets=[spell()];break;
  case 'Bring the Ending':effects=[branch(check('controller-poison',{min:3}),[counter()],[{...counter(),unlessGeneric:2}])];targets=[spell()];break;
  case 'Dismantle':effects=[cohort('destroy-transfer-counters',{target:0})];targets=[target('artifact')];break;
  case 'Hour of Glory':effects=[cohort('god-exile-hand',{target:0})];targets=[creature()];break;
  case 'Spoils of Evil':effects=[{action:'add-mana',produce:{C:1},multiplier:count('opposing-artifact-creature-grave',{target:0})},{action:'gain-life',who:'you',n:count('opposing-artifact-creature-grave',{target:0})}];targets=[player('opponent')];break;
  case 'Disorder':effects=[cohort('white-damage')];break;
  case 'Reward the Faithful':effects=[{action:'gain-life',who:0,n:count('maximum-owned-mana-value')}];targets=[player('any',all())];break;
  case 'Match the Odds':effects=[token('Ally',1,1,['W'],['Ally']),{action:'counter',target:'created-tokens',counter:'+1/+1',n:count('opposing-creatures')}];break;
  case 'Resolute Strike':effects=[pump(2),cohort('optional-equipment',{target:0,subtype:'Warrior',max:1})];targets=[creature()];break;
  case 'Vow to Erebor':effects=[{action:'untap',target:0},pump(2),cohort('optional-equipment',{target:0,subtype:'Dwarf',max:1})];targets=[creature('you')];break;
  case 'Battlefield Improvisation':effects=[pump(2),cohort('optional-equipment',{target:0,attacking:true,max:'all'})];targets=[creature()];break;
  case 'Unforge':effects=[cohort('equipment-destroy-damage',{target:0,n:2})];targets=[target('artifact','any','battlefield',{subtype:'Equipment'})];break;
  case 'Engulf the Shore':effects=[cohort('island-toughness-bounce')];break;
  case 'Temporary Truce':case 'Truce':effects=[cohort('optional-draw-life',{n:2})];break;
  case 'Rupture':effects=[cohort('resolution-sacrifice-damage')];break;
  case "Inquisitor's Snare":effects=[{action:'prevent-all',direction:'by',combat:false,target:0},branch(check('target-colors',{colors:['B','R']}),[{action:'destroy',target:0}])];targets=[creature('any',{attackingOrBlocking:true})];break;
  case 'Audience with Trostani':effects=[token('Plant',0,1,['G'],['Plant']),{action:'draw',who:'you',n:count('unique-creature-token-names')}];break;
  case 'Seeds of Innocence':effects=[cohort('artifact-destroy-life')];break;
  case 'Lightning Dart':effects=[branch(check('target-colors',{colors:['W','U']}),[damage(4)],[damage(1)])];targets=[creature()];break;
  case 'Twinstrike':effects=[branch(check('empty-hand'),[{action:'destroy',target:0}],[damage(2)])];targets=[creature('any',{min:2,max:2})];break;
  case 'Reign of Terror':effects=[cohort('color-destroy-loss')];break;
  case 'Thoughtweft Charge':effects=[pump(3),branch(check('creature-entered'),[{action:'draw',who:'you',n:1}])];targets=[creature()];break;
  case 'Insatiable Appetite':case "Pippin's Bravery":effects=[cohort('optional-food-pump',{target:0,normal:card.name==='Insatiable Appetite'?3:2,paid:card.name==='Insatiable Appetite'?5:4})];targets=[creature()];break;
  case 'Coordinated Clobbering':effects=[cohort('tap-creatures-damage',{target:0,otherTarget:1})];targets=[creature('you',{untapped:true,min:1,max:2}),creature('opponent')];break;
  case 'Roiling Terrain':effects=[{action:'destroy',target:0},damage(count('controller-land-grave',{target:0}),{kind:'target-controller',index:0})];targets=[target('land')];break;
  case 'Ill-Gotten Gains':effects=[cohort('exile-discard-return',{n:3})];break;
  case 'Necrotic Fumes':before=[{kind:'spell-battlefield-exile-cost-v29',contract:'spell-battlefield-exile-cost-v29'}];effects=[{action:'exile',target:0}];targets=[target('card','any','battlefield',{alternatives:['creature','planeswalker'].map(what=>target(what))})];break;
  case 'Browbeat':effects=[cohort('any-player-damage-draw',{target:0,damage:5,n:3})];targets=[player()];break;
  case "Lich-Knights' Conquest":effects=[cohort('resolution-sacrifice-return')];break;
  case 'Fade from History':effects=[cohort('artifact-enchantment-bear-destroy')];break;
  case 'Teachings of the Archaics':effects=[branch(check('opponent-hand-greater'),[{action:'draw',who:'you',n:count('hand-gap-draw')}])];break;
  case 'Simulacrum':effects=[{action:'gain-life',who:'you',n:count('damage-taken')},damage(count('damage-taken'))];targets=[creature('you')];break;
  case 'Anoint with Affliction':effects=[branch(check('small-or-poisoned'),[{action:'exile',target:0}])];targets=[creature()];break;
  case "Crater's Claws":effects=[branch(check('ferocious'),[damage(count('x-plus',{add:2}))],[damage('X')])];targets=[any()];break;
  default:return null;
 }
 return {semanticClass:'spell-template',implementation:[...before,{kind:'spell-generic',effects,targets,optional:false,contract:'spell-generic-effect'}],implementedKeywords:[],rulesCore:text,oracleContracts:[...new Set([...before.map(op=>op.contract),'spell-generic-effect'])]};
}
