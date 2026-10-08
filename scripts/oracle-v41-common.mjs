const body=(effects,targets=[])=>({effects,targets,optional:false});
const effect=(mode,extra={})=>({action:'spell-effects-v41',mode,...extra});
export function normalizeCard(card){
  let text=card.oracle_text;
  if(['Sanctified Charge','Swarm Surge'].includes(card.name))text=text.replace('also gain','gain');
  if(card.name==='Swallowed by Leviathan')text=text.replace('Choose target spell. Surveil 2, then counter the chosen spell','Surveil 2. Counter target spell');
  if(card.name==='Druidic Ritual')text=text.replace('Then return','Return');
  return text===card.oracle_text?card:{...card,oracle_text:text};
}
export function extensionEffect(card,text,h){
  if(['Choking Vines','Flame Spill','Pigment Storm'].includes(card.name))text=text.replace(card.name+' deals','This spell deals');
  if(text==='Put a +1/+1 counter on target creature, two +1/+1 counters on another target creature, and three +1/+1 counters on a third target creature.')return body([1,2,3].map((n,i)=>({action:'counter',target:i,counter:'+1/+1',n})),[0,1,2].map(i=>({...h.target('target creature'),...(i?{differentFromAllPrevious:true}:{})})));
  if(text==='Counter target noncreature spell unless its controller pays {1} plus an additional {1} for each creature in your party.')return body([{action:'counter-spell',target:0,unlessGeneric:{kind:'sum',values:[1,{kind:'party'}]}}],[h.target('target noncreature spell')]);
  if(text==='Counter target spell unless its controller pays {2} plus an additional {2} for each card named Rune Snag in each graveyard.')return body([{action:'counter-spell',target:0,unlessGeneric:{kind:'sum',values:[2,{kind:'named-grave-count-v41',name:'Rune Snag',multiply:2}]}}],[h.target('target spell')]);
  if(text==='Choose up to three target cards in graveyards. The owners of those cards shuffle them into their libraries. You gain 2 life.')return body([{action:'move-to-library',target:0,shuffleAfter:true},{action:'gain-life',who:'you',n:2}],[{...h.target('target card from a graveyard'),min:0,max:3}]);
  if(text==="Shuffle Serene Remembrance and up to three target cards from a single graveyard into their owners' libraries.")return body([effect('self-grave-shuffle',{target:0})],[{...h.target('target card from a graveyard'),min:0,max:3,groupV22:{test:'same-controller'}}]);
  if(text==='Until end of turn, each creature you control gets +2/+2 and gains trample and "This creature can\'t be blocked by more than one creature.".')return body([{action:'pump-group',who:'your-creatures',filters:[h.target('target creature you control')],power:2,toughness:2,keywords:['trample']},{action:'combat-restriction',filters:[h.target('target creature you control')],restriction:{combatRule:{kind:'blocker-bounds',max:1}}}]);
  if(text==='Create a 2/2 white and blue Detective creature token. If a creature died this turn, you gain 2 life, surveil 2, then investigate.')return h.effect(card,'Create a 2/2 white and blue Detective creature token. If a creature died this turn, you gain 2 life. If a creature died this turn, surveil 2. If a creature died this turn, investigate.');
  if(text==='One or two target creatures each gain haste until end of turn. For each of those creatures, create a Monster Role token attached to it.')return body([{action:'pump',target:0,power:0,toughness:0,keywords:['haste']},{action:'role-token-v8',target:0,role:'Monster'}],[{...h.target('target creature'),min:1,max:2}]);
  if(text==='Copy any number of target instant and/or sorcery spells. You may choose new targets for the copies.')return body([{action:'copy-stack-v8',target:0,kind:'spell',n:1,retarget:true}],[{...h.target('target instant or sorcery spell'),min:0,max:99}]);
  if(text==='X target attacking creatures become blocked. This spell deals 1 damage to each of those creatures.')return body([{action:'object-effects-v38',mode:'become-blocked',target:0},{action:'damage',target:0,n:1}],[{...h.target('target attacking creature'),min:0,max:0,targetCountX:true}]);
  if(text==='Investigate. Creatures your opponents control get -2/-0 until end of turn. If any of them are suspected, they\'re no longer suspected.')return body([{action:'investigate',who:'you',n:1},effect('calm-opponents')]);
  if(text==='Target opponent may have Risk Factor deal 4 damage to them. If that player doesn\'t, you draw three cards.')return body([effect('damage-or-draw',{target:0,n:4,draw:3})],[h.target('target opponent')]);
  if(text==='This spell deals 4 damage to target creature. Excess damage is dealt to that creature\'s controller instead.')return body([effect('excess-damage',{target:0,n:4})],[h.target('target creature')]);
  if(text==='This spell deals 5 damage to target creature. Excess damage is dealt to that creature\'s controller instead.')return body([effect('excess-damage',{target:0,n:5})],[h.target('target creature')]);
  if(text==='You may mill three cards. Return up to one creature card and up to one land card from your graveyard to your hand.')return body([effect('ritual')]);
  if(text==='Creatures target player controls can\'t block this turn. Ember Gale deals 1 damage to each white and/or blue creature that player controls.')return body([effect('ember-gale',{target:0})],[h.target('target player')]);
  if(text==='Until end of turn, target non-Brushwagg creature gets +1/+1 for each supertype, card type, and subtype it has.')return body([effect('type-pump',{target:0})],[{...h.target('target creature'),v20:{kind:'not-brushwagg-v41'}}]);
  if(text==='Prevent all combat damage that would be dealt this turn by creatures target opponent controls.')return body([effect('prevent-controller',{target:0})],[h.target('target opponent')]);
  if(text==='Until end of turn, target creature becomes a green and blue Fractal with base power and toughness each equal to X plus 1.')return body([{action:'animate',target:0,power:{kind:'sum',values:['X',1]},toughness:{kind:'sum',values:['X',1]},types:[],subtypes:['Fractal'],colors:['G','U'],keywords:[],retainTypes:true,replaceCreatureSubtypes:true,retainAllSubtypes:false,temporary:true}],[h.target('target creature')]);
  if(text==="Target opponent mills eight cards. You may put an artifact card from that player's graveyard onto the battlefield under your control.")return body([effect('mill-steal-artifact',{target:0})],[h.target('target opponent')]);
  if(text==='Look at the top five cards of your library, cloak two of them, and put the rest on the bottom of your library in a random order.')return body([effect('look-cloak')]);
  if(text==='Add seven {R}. You can cast only one more spell this turn.')return body([{action:'add-mana',produce:{R:7}},effect('one-more-spell')]);
  if(text==='Target noncreature artifact becomes an artifact creature with power and toughness each equal to its mana value until end of turn.')return body([effect('animate-artifact',{target:0})],[h.target('target noncreature artifact')]);
  if(text==='Each attacking creature gets +1/+0 until end of turn for each nonbasic land defending player controls.')return body([effect('attacker-nonbasics')]);
  if(text==='Transform all Humans. Prevent all combat damage that would be dealt this turn by creatures other than Werewolves and Wolves.')return body([effect('moonmist')]);
  if(text==="Search target player's library for up to X cards, where X is the number of Swamps you control, and exile them. That player shuffles.")return body([{action:'library-search-v8',who:0,n:{kind:'count',zone:'battlefield',what:'land',controller:'you',filters:[h.target('target Swamp you control')]},unrestricted:true,upTo:true,placements:[{n:'all',destination:'exile'}]}],[h.target('target player')]);
  if(text==="X target blocked creatures assign their combat damage this turn as though they weren't blocked.")return body([{action:'combat-restriction',target:0,restriction:{combatRule:{kind:'assign-unblocked-required'}}}],[{...h.target('target creature'),v20:{kind:'blocked-v41'},min:0,max:0,targetCountX:true}]);
  if(text==="Amass Orcs 3, then target player mills X cards, where X is the amassed Army's power.")return body([effect('amass-mill',{target:0})],[h.target('target player')]);
  if(text==='Prevent all combat damage that would be dealt by creatures other than target creature this turn.')return body([effect('prevent-others',{target:0})],[h.target('target creature')]);
  if(text==='Transform up to one target Werewolf you control. Creatures you control gain trample until end of turn.')return body([effect('transform',{target:0}),{action:'pump-group',who:'your-creatures',filters:[h.target('target creature you control')],power:0,toughness:0,keywords:['trample']}],[{...h.target('target Werewolf you control'),min:0,max:1}]);
  if(text==='Look at the top two cards of your library. Manifest one of those cards, then put the other on the top or bottom of your library.')return body([effect('look-manifest')]);
  return null;
}
export function modifierOperation(card,text){
  if(text==="This spell can't be copied.")return {kind:'uncopyable-v41',contract:'spell-copy-effect'};
  return null;
}

export function compileWholeCard(card,h){
  const text="Search target player's library for up to X cards, where X is the number of Swamps you control, and exile them. That player shuffles.";
  if(card.name!=='Nightmare Incursion'||card.layout!=='normal'||h.stripReminderText(card.oracle_text)!==text)return null;
  const target={what:'player',controller:'any',zone:'player',min:1,max:1};
  const operation={kind:'spell-generic',targets:[target],effects:[{action:'library-search-v8',who:0,n:{kind:'count',zone:'battlefield',what:'land',controller:'you',filters:[{what:'land',zone:'battlefield',controller:'you',subtype:'Swamp',min:1,max:1}]},unrestricted:true,upTo:true,placements:[{n:'all',destination:'exile'}]}],optional:false,contract:'spell-generic-effect'};
  return {semanticClass:'spell-template',implementation:[operation],implementedKeywords:[],rulesCore:text,oracleContracts:[operation.contract]};
}
