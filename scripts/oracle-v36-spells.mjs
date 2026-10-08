import TEXT from './oracle-v36-spell-text.json' with {type:'json'};
const target=(what,controller='any',zone='battlefield',extra={})=>({what,controller,zone,min:1,max:1,...extra});
const creature=(controller='any',extra={})=>target('creature',controller,'battlefield',extra);
const player=(controller='any',extra={})=>target('player',controller,'player',extra);
const spell=(extra={})=>target('spell','any','stack',extra);
const effect=(mode,extra={})=>({action:'spell-cohort-v36',mode,...extra});
export function compileWholeCard(card,h){
  if(card.layout!=='normal'||!/(?:Instant|Sorcery)/.test(card.type_line||'')||!TEXT[card.name]||h.stripReminderText(card.oracle_text||'')!==TEXT[card.name])return null;
  let targets=[],effects=[],before=[],side={implementation:[],implementedKeywords:[]};
  const lines=TEXT[card.name].split('\n'),secondary=lines.filter(line=>/^(?:Flashback|Cycling)\b/.test(line));
  if(secondary.length){
    side=h.compileCurrent({...card,oracle_text:'Draw a card.\n'+secondary.join('\n')});
    if(!side.semanticClass||side.implementation[0]?.kind!=='spell-draw'||side.implementation[0].n!==1)return null;
    side={...side,implementation:side.implementation.slice(1)};
  }
  switch(card.name){
    case 'High Tide':case 'Bubbling Muck':effects=[effect('temporary-land-mana',{subtype:card.name==='High Tide'?'Island':'Swamp',color:card.name==='High Tide'?'U':'B'})];break;
    case 'Cone of Flame':targets=[target('any'),target('any','any','battlefield',{differentFromAllPrevious:true}),target('any','any','battlefield',{differentFromAllPrevious:true})];effects=[effect('three-damage')];break;
    case 'Dash Hopes':
      before=[{kind:'generic-trigger',zone:'stack',event:'cast',eventFilter:'self',effects:[effect('pay-life-counter-source')],targets:[],optional:false,contract:'generic-trigger-effect'}];
      targets=[spell()];effects=[{action:'counter-spell',target:0}];break;
    case 'Day of Black Sun':effects=[effect('lose-abilities-destroy')];break;
    case 'Double Major':targets=[spell({controller:'you',spellQuality:'creature'})];effects=[effect('copy-nonlegendary')];break;
    case 'Empty City Ruse':case 'False Peace':targets=[player(card.name==='Empty City Ruse'?'opponent':'any')];effects=[effect('skip-next-turn-combats')];break;
    case 'False Cure':effects=[effect('false-cure')];break;
    case 'Fatal Fissure':targets=[creature()];effects=[effect('death-earthbend')];break;
    case 'Fire and Brimstone':targets=[player('any',{v20:{kind:'attacked-this-turn-v36'}})];effects=[effect('damage-attacker-and-you')];break;
    case 'Flay':targets=[player()];effects=[effect('random-discard-unless-pay')];break;
    case 'Incriminate':targets=[creature('any',{min:2,max:2,groupV22:{test:'same-controller'}})];effects=[effect('sacrifice-one-of-two')];break;
    case 'Meddle':case 'Rebound':targets=[spell(card.name==='Rebound'?{v20:{kind:'single-player-target-v36'}}:{})];effects=[effect('retarget-single',{what:card.name==='Rebound'?'player':'creature'})];break;
    case 'Noxious Vapors':effects=[effect('keep-hand-colors')];break;
    case 'Panther Pounce':targets=[player(),creature()];effects=[{action:'investigate',who:0,n:1},{action:'pump',target:1,power:1,toughness:0,keywords:['flying']},{action:'untap',target:1}];break;
    case 'Parallel Evolution':effects=[effect('copy-all-creature-tokens')];break;
    case 'Play with Fire':targets=[target('any')];effects=[effect('damage-player-scry')];break;
    case 'Quicken':case "Scout's Warning":effects=[effect('next-spell-flash',{what:card.name==='Quicken'?'sorcery':'creature'}),{action:'draw',who:'you',n:1}];break;
    case 'Scheming Symmetry':targets=[player('any',{min:2,max:2})];effects=[{action:'library-search-v8',who:0,chooser:'owner',ownerSearch:true,n:1,unrestricted:true,placements:[{n:'all',destination:'top'}]}];break;
    case 'Scrounge':case 'Visions of Dread':targets=[player('opponent')];effects=[effect('opponent-grave-choice',{what:card.name==='Scrounge'?'Artifact':'Creature'})];break;
    case 'Seismic Wave':targets=[target('any'),player('opponent')];effects=[effect('damage-and-nonartifact-creatures')];break;
    case 'Self-Destruct':targets=[creature('you'),target('any','any','battlefield',{differentFromPrevious:true})];effects=[effect('power-damage-self-and-other')];break;
    case 'Singularity Rupture':targets=[player('any',{min:0,max:99})];effects=[effect('destroy-mill-half')];break;
    case 'Spectacular Pileup':effects=[effect('remove-indestructible-destroy')];break;
    case 'Spiritualize':targets=[creature()];effects=[effect('damage-gain-life'),{action:'draw',who:'you',n:1}];break;
    case "Rivals' Duel":targets=[creature('any',{min:2,max:2,groupV22:{test:'no-shared-creature-type'}})];effects=[effect('fight-distinct-types')];break;
    case 'Second Guess':targets=[spell({v20:{kind:'second-spell-this-turn-v36'}})];effects=[{action:'counter-spell',target:0}];break;
    default:return null;
  }
  // Bind all announced target slots to the cohort for the ordinary AI scorer.
  effects=effects.map(e=>e.action==='spell-cohort-v36'&&targets.length?{...e,target:0,...(targets.length>1?{otherTarget:1}:{}),...(targets.length>2?{sourceTarget:2}:{})}:e);
  const implementation=[...before,{kind:'spell-generic',effects,targets,optional:false,contract:'spell-generic-effect'},...side.implementation];
  return {semanticClass:'spell-template',implementation,implementedKeywords:side.implementedKeywords,rulesCore:TEXT[card.name],oracleContracts:[...new Set(implementation.map(op=>op.contract))]};
}
