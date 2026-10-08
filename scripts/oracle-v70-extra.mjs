// Complete source matching keeps unsupported clauses closed.
const TEXT={
 "Illusion of Choice": "You choose how each player votes this turn.\nDraw a card.",
 "Decorum Dissertation": "Target player draws two cards and loses 2 life.\nParadigm (Then exile this spell. After you first resolve a spell with this name, you may cast a copy of it from exile without paying its mana cost at the beginning of each of your first main phases.)",
 "Germination Practicum": "Put two +1/+1 counters on each creature you control.\nParadigm (Then exile this spell. After you first resolve a spell with this name, you may cast a copy of it from exile without paying its mana cost at the beginning of each of your first main phases.)",
 "Echocasting Symposium": "Target player creates a token that's a copy of target creature you control.\nParadigm (Then exile this spell. After you first resolve a spell with this name, you may cast a copy of it from exile without paying its mana cost at the beginning of each of your first main phases.)",
 "Restoration Seminar": "Return target nonland permanent card from your graveyard to the battlefield.\nParadigm (Then exile this spell. After you first resolve a spell with this name, you may cast a copy of it from exile without paying its mana cost at the beginning of each of your first main phases.)",
 "Improvisation Capstone": "Exile cards from the top of your library until you exile cards with total mana value 4 or greater. You may cast any number of spells from among them without paying their mana costs.\nParadigm (Then exile this spell. After you first resolve a spell with this name, you may cast a copy of it from exile without paying its mana cost at the beginning of each of your first main phases.)",
 "Hallowed Moonlight": "Until end of turn, if a creature would enter and it wasn't cast, exile it instead.\nDraw a card.",
 "Pale Moon": "Until end of turn, if a player taps a nonbasic land for mana, it produces colorless mana instead of any other type.",
 "Peace Talks": "This turn and next turn, creatures can't attack, and players and permanents can't be the targets of spells or activated abilities.",
 "Taunt": "During target player's next turn, creatures that player controls attack you if able.",
 "Suspend": "Exile target creature and put two time counters on it. If it doesn't have suspend, it gains suspend. (At the beginning of its owner's upkeep, they remove a time counter. When the last is removed, they may play it without paying its mana cost. If it's a creature, it has haste.)",
 "Delay": "Counter target spell. If the spell is countered this way, exile it with three time counters on it instead of putting it into its owner's graveyard. If it doesn't have suspend, it gains suspend. (At the beginning of its owner's upkeep, they remove a time counter. When the last is removed, they may play it without paying its mana cost. If it's a creature, it has haste.)",
 "Bitter Ordeal": "Search target player's library for a card and exile it. Then that player shuffles.\nGravestorm (When you cast this spell, copy it for each permanent put into a graveyard this turn. You may choose new targets for the copies.)",
 "Capital Punishment": "Council's dilemma — Starting with you, each player votes for death or taxes. Each opponent sacrifices a creature of their choice for each death vote and discards a card for each taxes vote.",
 "Bite of the Black Rose": "Will of the council — Starting with you, each player votes for sickness or psychosis. If sickness gets more votes, creatures your opponents control get -2/-2 until end of turn. If psychosis gets more votes or the vote is tied, each opponent discards two cards.",
 "Split Decision": "Will of the council — Choose target instant or sorcery spell. Starting with you, each player votes for denial or duplication. If denial gets more votes, counter the spell. If duplication gets more votes or the vote is tied, copy the spell. You may choose new targets for the copy.",
 "Expropriate": "Council's dilemma — Starting with you, each player votes for time or money. For each time vote, take an extra turn after this one. For each money vote, choose a permanent owned by the voter and gain control of it. Exile Expropriate.",
 "Wheel of Misfortune": "Each player secretly chooses a number 0 or greater, then all players reveal those numbers simultaneously and determine the highest and lowest numbers revealed this way. Wheel of Misfortune deals damage equal to the highest number to each player who chose that number. Each player who didn't choose the lowest number discards their hand, then draws seven cards.",
 "Goblin Game": "Each player hides at least one item, then all players reveal them simultaneously. Each player loses life equal to the number of items they revealed. The player who revealed the fewest items then loses half their life, rounded up. If two or more players are tied for fewest, each loses half their life, rounded up.",
 "Cone of Cold": "Roll a d20.\n1—9 | Tap all creatures your opponents control.\n10—19 | Tap all creatures your opponents control. Those creatures don't untap during their controllers' next untap steps.\n20 | Tap all creatures your opponents control. Those creatures don't untap during their controllers' next untap steps. Until your next turn, creatures your opponents control enter tapped.",
 "Lae'zel's Acrobatics": "Exile all nontoken creatures you control, then roll a d20.\n1—9 | Return those cards to the battlefield under their owner's control at the beginning of the next end step.\n10—20 | Return those cards to the battlefield under their owner's control, then exile them again. Return those cards to the battlefield under their owner's control at the beginning of the next end step.",
 "Faith's Shield": "Target permanent you control gains protection from the color of your choice until end of turn.\nFateful hour — If you have 5 or less life, instead you and each permanent you control gain protection from the color of your choice until end of turn.",
 "Psychic Rebuttal": "Counter target instant or sorcery spell that targets you.\nSpell mastery — If there are two or more instant and/or sorcery cards in your graveyard, you may copy the spell countered this way. You may choose new targets for the copy.",
 "Storyweave": "Choose one —\n• Put two +1/+1 counters on target creature you control.\n• Put two lore counters on target Saga you control. The next time one or more enchantment creatures you control enter this turn, each enters with two additional +1/+1 counters on it.",
 "The Great Aurora": "Each player shuffles all cards from their hand and all permanents they own into their library, then draws that many cards. Each player may put any number of land cards from their hand onto the battlefield. Exile The Great Aurora."
};
const SOURCES={"Illusion of Choice": ["{U}", "Instant"], "Decorum Dissertation": ["{3}{B}{B}", "Sorcery \u2014 Lesson"], "Germination Practicum": ["{3}{G}{G}", "Sorcery \u2014 Lesson"], "Echocasting Symposium": ["{4}{U}{U}", "Sorcery \u2014 Lesson"], "Restoration Seminar": ["{5}{W}{W}", "Sorcery \u2014 Lesson"], "Improvisation Capstone": ["{5}{R}{R}", "Sorcery \u2014 Lesson"], "Hallowed Moonlight": ["{1}{W}", "Instant"], "Pale Moon": ["{1}{U}", "Instant"], "Peace Talks": ["{1}{W}", "Sorcery"], "Taunt": ["{U}", "Sorcery"], "Suspend": ["{U}", "Instant"], "Delay": ["{1}{U}", "Instant"], "Bitter Ordeal": ["{2}{B}", "Sorcery"], "Capital Punishment": ["{4}{B}{B}", "Sorcery"], "Bite of the Black Rose": ["{3}{B}", "Sorcery"], "Split Decision": ["{1}{U}", "Instant"], "Expropriate": ["{7}{U}{U}", "Sorcery"], "Wheel of Misfortune": ["{2}{R}", "Sorcery"], "Goblin Game": ["{5}{R}{R}", "Sorcery"], "Cone of Cold": ["{3}{U}", "Sorcery"], "Lae'zel's Acrobatics": ["{3}{W}", "Instant"], "Faith's Shield": ["{W}", "Instant"], "Psychic Rebuttal": ["{1}{U}", "Instant"], "Storyweave": ["{2}{G}", "Instant"], "The Great Aurora": ["{6}{G}{G}{G}", "Sorcery"]};
const fx=(mode,extra={})=>({action:'extra-effects-v70',mode,...extra});
const body=(effects,targets=[])=>({effects,targets,optional:false});
const spell=(effects,targets=[])=>({kind:'spell-generic',...body(effects,targets),contract:'spell-generic-effect'});
export function normalizeCard(card,original=card){return TEXT[original.name]===original.oracle_text?{...card,oracle_text:original.oracle_text}:card;}
export function compileWholeCard(card,h){
 if(card.layout!=='normal'||!/(?:Instant|Sorcery)/.test(card.type_line||'')||card.oracle_text!==TEXT[card.name]||card.mana_cost!==SOURCES[card.name]?.[0]||card.type_line!==SOURCES[card.name]?.[1])return null;
 const target=s=>{const base={controller:s.includes('you control')||s.includes('your graveyard')?'you':'any',zone:s.includes('graveyard')?'graveyard':s.includes('spell')?'stack':'battlefield',min:1,max:1};if(s==='target player')return {...base,what:'player'};if(s==='target spell')return {...base,what:'spell'};if(s==='target instant or sorcery spell')return {...base,what:'spell',spellFilter:{what:'card',zone:'graveyard',controller:'any',alternatives:[{what:'instant',zone:'graveyard',controller:'any'},{what:'sorcery',zone:'graveyard',controller:'any'}]}};if(s.includes('nonland permanent'))return {...base,what:'permanent',notType:'Land'};if(s.includes('Saga'))return {...base,what:'enchantment',subtype:'Saga'};return {...base,what:s.includes('permanent')?'permanent':'creature'};};let ops=[],effects=[],targets=[];
 const paradigm=['Decorum Dissertation','Germination Practicum','Echocasting Symposium','Restoration Seminar','Improvisation Capstone'].includes(card.name);
 switch(card.name){
 case 'Decorum Dissertation':targets=[target('target player')];effects=[{action:'draw',who:0,n:2},{action:'lose-life',who:0,n:2}];break;
 case 'Germination Practicum':effects=[fx('germination')];break;
 case 'Echocasting Symposium':targets=[target('target player'),target('target creature you control')];effects=[fx('echo')];break;
 case 'Restoration Seminar':targets=[target('target nonland permanent card from your graveyard')];effects=[{action:'reanimate',target:0}];break;
 case 'Improvisation Capstone':effects=[fx('capstone')];break;
 case 'Illusion of Choice':effects=[fx('illusion'),{action:'draw',who:'you',n:1}];break;
 case 'Hallowed Moonlight':effects=[fx('moonlight'),{action:'draw',who:'you',n:1}];break;
 case 'Pale Moon':effects=[fx('pale')];break;
 case 'Peace Talks':effects=[fx('peace')];break;
 case 'Taunt':targets=[target('target player')];effects=[fx('taunt',{target:0})];break;
 case 'Suspend':targets=[target('target creature')];effects=[fx('suspend',{target:0})];break;
 case 'Delay':targets=[target('target spell')];effects=[fx('delay',{target:0})];break;
 case 'Bitter Ordeal':targets=[target('target player')];effects=[fx('ordeal',{target:0})];ops=[{kind:'gravestorm-extra-v70',contract:'generic-trigger-effect'}];break;
 case 'Capital Punishment':effects=[fx('capital')];break;
 case 'Bite of the Black Rose':effects=[fx('bite')];break;
 case 'Split Decision':targets=[target('target instant or sorcery spell')];effects=[fx('split',{target:0})];break;
 case 'Expropriate':effects=[fx('expropriate')];break;
 case 'Wheel of Misfortune':effects=[fx('wheel')];break;
 case 'Goblin Game':effects=[fx('goblin')];break;
 case 'Cone of Cold':effects=[fx('cone')];break;
 case "Lae'zel's Acrobatics":effects=[fx('acrobatics')];break;
 case "Faith's Shield":targets=[target('target permanent you control')];effects=[fx('faith',{target:0})];break;
 case 'Psychic Rebuttal':targets=[{...target('target instant or sorcery spell'),v20:{kind:'targets-you-extra-v70'}}];effects=[fx('rebuttal',{target:0})];break;
 case 'Storyweave':ops=[{kind:'spell-modal-generic',choose:{min:1,max:1},modes:[{label:'Two +1/+1 counters',body:body([{action:'counter',target:0,counter:'+1/+1',n:2}],[target('target creature you control')])},{label:'Saga and enchantment creatures',body:body([{action:'counter',target:0,counter:'lore',n:2},fx('story')],[target('target Saga you control')])}],contract:'spell-modal-generic-effect'}];break;
 case 'The Great Aurora':effects=[fx('aurora')];break;
 default:return null;
 }
 if(effects.length)ops.push(spell(paradigm?[...effects,fx('paradigm')]:effects,targets));
 return {semanticClass:'spell-template',implementation:ops,implementedKeywords:[],oracleContracts:[...new Set(ops.map(o=>o.contract))],rulesCore:h.stripReminderText(card.oracle_text)};
}
