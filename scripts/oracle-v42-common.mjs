const body=(effects,targets=[])=>({effects,targets,optional:false});
const effect=(mode,extra={})=>({action:'common-effects-v42',mode,...extra});
const trigger=(event,eventFilter,b,extra={})=>b&&({kind:'generic-trigger',event,eventFilter,...b,...extra,contract:'generic-trigger-effect'});
export function normalizeCard(card){
  let text=card.oracle_text;
  if(card.name==='Children of Korlis')text=text.replace("the life you've lost this turn",'the amount of life you lost this turn');
  if(card.name==='Sandstone Deadfall')text=text.replace('Sacrifice two lands and this artifact','Sacrifice this artifact, Sacrifice two lands');
  if(card.name==='Ravaging Riftwurm')text=text.replace('three additional time counters','three time counters');
  return text===card.oracle_text?card:{...card,oracle_text:text};
}
export function extensionEffect(card,text,h){
  if(text==='Target opponent puts a deathtouch counter on a creature they control.')return body([effect('opponent-deathtouch',{target:0})],[h.target('target opponent')]);
  if(text==='Unattach enchanted Equipment.')return body([effect('unattach-equipment',{target:'attached-host'})]);
  if(text==='The next spell you cast this turn costs {1} less to cast.')return body([effect('next-spell-discount')]);
  if(text==="Destroy all permanents with that spell's mana value.")return body([effect('destroy-spell-value')]);
  if(text==='It becomes a Bird Giant, and it loses defender.')return body([{action:'animate',target:'self',types:[],subtypes:['Bird','Giant'],keywords:[],retainTypes:true,replaceCreatureSubtypes:true,temporary:false},effect('keyword-duration',{target:'self',keyword:'defender',remove:true})]);
  if(text==='Target land becomes a Swamp. Exile this card.'){const first=h.effect(card,'Target land becomes a Swamp.');return first&&{...first,effects:[...first.effects,{action:'exile',target:'event-card'}]};}
  if(text==='Put a +0/+1 counter or a +1/+0 counter on target creature.')return body([effect('counter-choice',{target:0})],[h.target('target creature')]);
  if(text==='Each player discards a card. If you discarded a card this way, draw a card.')return body([effect('discard-draw')]);
  if(text==='Put a fade counter on each permanent with fading you control.')return body([{action:'battlefield-group',operation:'counter',filters:[{...h.target('target permanent you control'),v20:{kind:'has-fading-v42'}}],counter:'fade',n:1}]);
  if(text==='This creature and up to one other target creature each get +3/+3 until end of turn.')return body([{action:'pump',target:'self',power:3,toughness:3,keywords:[]},{action:'pump',target:0,power:3,toughness:3,keywords:[]}],[{...h.target('target creature'),excludeSelf:true,min:0,max:1}]);
  if(text==='If this creature is suspected, put a +1/+1 counter on it. Otherwise, suspect it.')return body([effect('suspect-or-grow')]);
  if(text==='You gain life equal to the total life lost by all players this turn.')return body([{action:'gain-life',who:'you',n:{kind:'all-life-lost-v42'}}]);
  if(text==='Attach all Equipment on the battlefield to it.')return body([effect('all-equipment')]);
  if(text==='It becomes the creature type of your choice.')return body([effect('choose-source-type')]);
  if(text==='This creature gains flying.')return body([effect('keyword-duration',{target:'self',keyword:'flying',remove:false})]);
  if(text==='This creature loses flying.')return body([effect('keyword-duration',{target:'self',keyword:'flying',remove:true})]);
  if(text==='Target snow land is no longer snow.')return body([effect('snow-status',{target:0,snow:false})],[h.target('target snow land')]);
  if(text==='Target nonsnow basic land becomes snow.')return body([effect('snow-status',{target:0,snow:true})],[{...h.target('target basic land'),v20:{kind:'not-snow-v42'}}]);
  if(text==='Each of that player\'s opponents may draw a card.')return body([effect('caster-opponents-draw',{optional:true})]);
  if(text==='That player may pay {2}. If the player does, they draw a card.')return body([effect('caster-pay-draw')]);
  if(text==='Face-down spells you cast this turn cost {1} less to cast.')return body([effect('face-down-discount')]);
  if(text==='Incubate 3 X times.')return body([effect('repeat-incubate',{n:'X',size:3})]);
  if(text==='Transform target Incubator token you control.')return body([effect('transform-incubator',{target:0})],[{...h.target('target Incubator you control'),token:true}]);
  if(text==='This creature deals damage to target creature equal to the damage already dealt to it this turn.')return body([{action:'damage',target:0,n:{kind:'damage-received-v42',target:0}}],[h.target('target creature')]);
  return null;
}
export function extensionLine(card,line,h){
  if(line==='Whenever enchanted opponent draws a card, you may draw a card.')return {...h.line(card,'Whenever an opponent draws a card, you may draw a card.'),enchantedPlayerV17:true};
  if(line==='{2}: Draw a card. Any player may activate this ability but only during their draw step.')return {...h.line(card,'{2}: Draw a card. Any player may activate this ability.'),activationCondition:{kind:'own-draw-step-v42'}};
  if(line==='Whenever one or more creatures you control attack, they gain indestructible until end of turn.')return {...h.line(card,'Whenever one or more creatures you control attack, draw a card.'),...body([effect('attackers-indestructible')]),captureAttackersV42:true};
  if(line==='Whenever you activate an ability of an Elemental, this creature gets +1/+0 until end of turn.')return trigger('abilityActivated','each-upkeep',body([{action:'pump',target:'self',power:1,toughness:0,keywords:[]}]),{eventTestV42:'own-elemental-ability'});
  if(line==='Whenever a player casts a spell, if no colored mana was spent to cast it, counter that spell.')return {...h.line(card,'Whenever a player casts a spell, draw a card.'),...body([{action:'counter-spell',target:'event-stack-v10'}]),eventTestV42:'no-colored-mana'};
  if(line==='Whenever a player casts their first multicolored spell each turn, each other player draws a card.')return {...h.line(card,'Whenever a player casts a spell, draw a card.'),...body([effect('caster-opponents-draw',{optional:false})]),eventTestV42:'first-multicolor'};
  if(line==='Each non-Human creature you control gets +1/+1 for each of its creature types, to a maximum of 10.')return {kind:'type-count-boost-v42',contract:'generic-continuous-effect'};
  if(line==='For each basic land type among lands you control, this creature has landwalk of that type.')return {kind:'domain-landwalk-v42',contract:'generic-continuous-effect'};
  if(line==='Basic lands each player controls have shroud as long as that player controls three or fewer lands.')return {kind:'small-land-shroud-v42',contract:'generic-continuous-effect'};
  if(line==='At end of combat, put a -0/-2 counter on each creature blocking or blocked by this creature.')return trigger('endCombat','each-upkeep',body([effect('combat-partners-counters')]));
  if(line==='{8}: This creature and up to one other target creature each get +3/+3 until end of turn.')return {...h.line(card,'{8}: Draw a card.'),...extensionEffect(card,line.slice(5),h)};
  return null;
}
