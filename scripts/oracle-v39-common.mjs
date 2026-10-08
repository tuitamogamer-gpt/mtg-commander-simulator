const body=(effects,targets=[])=>({effects,targets,optional:false});
const effect=(mode,extra={})=>({action:'common-effects-v39',mode,...extra});
const trigger=(event,eventFilter,b,extra={})=>b&&({kind:'generic-trigger',event,eventFilter,...b,...extra,contract:'generic-trigger-effect'});
export function normalizeCard(card){
  let text=card.oracle_text;
  if(card.name==='Brotherhood Regalia')text=text.replace("Equipped creature has ward {2}, is an Assassin in addition to its other types, and can't be blocked.","Equipped creature has ward {2}.\nEquipped creature is an Assassin in addition to its other types.\nEquipped creature can't be blocked.");
  if(card.name==="Swashbuckler's Whip")text=text.replace('Equipped creature has reach, "{2}, {T}: Tap target artifact or creature," and "{8}, {T}: Discover 10."','Equipped creature has reach.\nEquipped creature has "{2}, {T}: Tap target artifact or creature."\nEquipped creature has "{8}, {T}: Discover 10."');
  if(card.name==='Domri, City Smasher')text=text.replace('Those creatures gain trample','Creatures you control gain trample');
  return text===card.oracle_text?card:{...card,oracle_text:text};
}
export function extensionEffect(card,text,h){
  if(text==='Up to one target player mills cards equal to this creature\'s power.'){const b=h.effect(card,'Target player mills cards equal to this creature\'s power.');return b?{...b,targets:b.targets.map(t=>({...t,min:0,max:1}))}:null;}
  if(text==='This creature gets +1/+1 until end of turn and deals 1 damage to each opponent.')return h.effect(card,'This creature gets +1/+1 until end of turn. This creature deals 1 damage to each opponent.');
  if(text==='This creature gains flying and protection from green and from white until end of turn.')return h.effect(card,'This creature gains flying until end of turn. This creature gains protection from green until end of turn. This creature gains protection from white until end of turn.');
  if(text==='Return target creature card with infect from your graveyard to your hand.')return body([{action:'bounce',target:0}],[{...h.target('target creature card from your graveyard'),withKeyword:'infect'}]);
  if(text==='Put a +1/+1 counter on each other creature you control named Charmed Stray.')return body([{action:'battlefield-group',operation:'counter',n:1,counter:'+1/+1',filters:[{...h.target('target creature you control'),excludeSelf:true,name:'Charmed Stray'}]}]);
  if(text==='Create a 1/1 red and green Dragon creature token with flying and devour 2.')return body([{action:'token-inline',who:'you',n:1,token:{name:'Dragon',power:'1',toughness:'1',types:['Creature'],subtypes:['Dragon'],colors:['R','G'],keywords:['flying'],oracle:'Flying\nDevour 2',operations:[h.line(card,'Devour 2')]}}]);
  if(text==='Create a 1/1 green and white Human Soldier creature token with training.')return body([{action:'token-inline',who:'you',n:1,token:{name:'Human Soldier',power:'1',toughness:'1',types:['Creature'],subtypes:['Human','Soldier'],colors:['G','W'],keywords:[],oracle:'Training',operations:[{kind:'mechanic-training',contract:'mechanic-training'}]}}]);
  if(text==='Create a colorless snow artifact token named Icy Manalith with "{T}: Add one mana of any color."')return body([{action:'token-inline',who:'you',n:1,token:{name:'Icy Manalith',super:['Snow'],types:['Artifact'],subtypes:[],colors:[],keywords:[],oracle:'{T}: Add one mana of any color.',operations:[h.line(card,'{T}: Add one mana of any color.')]}}]);
  if(text==='Another target creature you control gains melee until end of turn.')return body([{action:'grant-operation',target:0,operation:h.line(card,'Melee')}],[{...h.target('target creature you control'),excludeSelf:true}]);
  if(text==='You may have creatures you control assign their combat damage this turn as though they weren\'t blocked.')return body([{action:'combat-restriction',filters:[h.target('target creature you control')],duration:'eot',restriction:{combatRule:{kind:'assign-unblocked'}}}]);
  if(text==='Target player searches their library for a card, then shuffles and puts that card on top.')return body([{action:'library-search-v8',who:0,chooser:'owner',ownerSearch:true,n:1,unrestricted:true,placements:[{n:'all',destination:'top'}]}],[h.target('target player')]);
  if(text==='Return target card from an opponent\'s graveyard to their hand. Put a +1/+1 counter on target creature.')return body([{action:'bounce',target:0},{action:'counter',target:1,counter:'+1/+1',n:1}],[h.target('target card from an opponent\'s graveyard'),h.target('target creature')]);
  if(text==='Tap target creature or planeswalker. Its activated abilities can\'t be activated this turn.')return body([{action:'tap',target:0},{action:'combat-restriction',target:0,restriction:{activationDisabled:true},duration:'eot'}],[h.target('target creature or planeswalker')]);
  if(text==='Choose target face-up exiled card. Its owner shuffles it into their library.')return body([{action:'move-to-library',target:0,shuffleAfter:true}],[{what:'card',zone:'exile',controller:'any',min:1,v20:{kind:'face-up-v39'}}]);
  if(text==='Exile it, then shuffle all creature cards from your graveyard into your library.'){
    const rest=h.effect(card,'Shuffle all creature cards from your graveyard into your library.');return rest?body([{action:'exile',target:'event-card'},...rest.effects]):null;
  }
  if(text==='You may put it on your choice of the top or bottom of its owner\'s library.')return {effects:[{action:'choice-table-v20',kind:'mode',optional:false,options:['top','bottom'].map(mode=>({key:mode,label:mode,effects:[{action:'move-to-library',target:'event-card',...(mode==='bottom'?{bottom:true}:{})}]}))}],targets:[],optional:true};
  if(text==='X target attacking creatures become blocked. This spell deals 1 damage to each of those creatures.')return body([{action:'object-effects-v38',mode:'become-blocked',target:0},{action:'damage',target:0,n:1}],[{...h.target('target attacking creature'),min:0,max:0,targetCountX:true}]);
  if(text==='Gain control of all creatures until end of turn. Untap them. They gain haste until end of turn.')return body([effect('steal-creatures')]);
  if(text==='Choose a player. That player adds two mana of any one color they choose.')return body([effect('choose-player-mana')]);
  if(text==='This creature deals damage to each player equal to half that player\'s life total, rounded down.')return body([effect('halve-life-damage')]);
  if(text==='Destroy target artifact. That artifact deals damage equal to its mana value to this creature.')return body([effect('artifact-retaliation',{target:0})],[h.target('target artifact')]);
  if(text==='Target player mills four cards. You shuffle up to four cards from your graveyard into your library.')return body([{action:'mill',who:0,n:4},effect('shuffle-grave-four')],[h.target('target player')]);
  if(text==='Target player exiles a card from their graveyard. If it\'s a creature card, you gain 2 life.')return body([effect('exile-grave-gain',{target:0})],[h.target('target player')]);
  if(text==='Sacrifice it unless you return two Forests you control to their owner\'s hand.')return body([effect('return-or-sacrifice',{what:'Forest',controller:'you',n:2})]);
  if(text==='Sacrifice it unless you return an enchantment to its owner\'s hand.')return body([effect('return-or-sacrifice',{what:'Enchantment',controller:'any',n:1})]);
  if(text==='That player can\'t gain life for the rest of the game.')return body([effect('no-life-gain',{who:'event-player'})]);
  return null;
}
export function extensionLine(card,line,h){
  if(line==='Whenever a source deals damage to this creature, that source\'s controller gains control of this creature.')return trigger('oracleDamageHit',{kind:'damage-event-v8',source:{kind:'source',controller:'any'},recipient:{kind:'self'},bind:'source'},body([{action:'give-control-v9',target:'self',who:'event-card-controller'}]));
  if(line==='Whenever a creature deals combat damage to you, that creature\'s controller gains control of this land.')return trigger('oracleDamageHit',{kind:'damage-event-v8',source:{kind:'filtered',target:h.target('target creature')},recipient:{kind:'you'},bind:'source',combat:true},body([{action:'give-control-v9',target:'self',who:'event-card-controller'}]));
  if(line==='Whenever a creature you control with deathtouch deals damage to a planeswalker, destroy that planeswalker.')return trigger('oracleDamageHit',{kind:'damage-event-v8',source:{kind:'filtered',target:h.target('target creature you control with deathtouch')},recipient:{kind:'filtered',target:h.target('target planeswalker')},bind:'recipient'},body([{action:'destroy',target:'event-card'}]));
  if(line==='Whenever a creature is put into your graveyard from the battlefield, put that card on top of your library.')return trigger('dies',{kind:'v8-event',target:h.target('target creature')},body([{action:'move-to-library',target:'event-card'}]),{eventTestV39:'owned-death'});
  if(line==='Whenever you activate an ability of a creature, draw a card. This ability triggers only once each turn.')return trigger('abilityActivated',{kind:'observation-v9',controller:'you',target:h.target('target creature')},body([{action:'draw',who:'you',n:1}]),{onceEachTurn:true});
  if(line==='Whenever you cast a creature spell with power 5 or greater, discover X, where X is that spell\'s mana value.'){
    const base=h.line(card,'Whenever you cast a creature spell with power 5 or greater, draw a card.');return base?{...base,effects:[{action:'discover-v9',n:{kind:'event-spell-mv-v10'}}]}:null;
  }
  if(line==='Whenever you cast a creature spell with power 4, 5, or 6, this enchantment deals 4 damage to any target.'){
    const base=h.line(card,'Whenever you cast a creature spell with power 4 or greater, this enchantment deals 4 damage to any target.'),upper=h.line(card,'Whenever you cast a creature spell with power 6 or less, draw a card.');return base&&upper?{...base,eventTestV39:'power-max-six',upperFilterV39:upper.eventFilter}:null;
  }
  if(line==='Whenever this creature attacks, target creature defending player controls blocks it this combat if able.'){
    const base=h.line(card,'Whenever this creature attacks, draw a card.'),target=h.target('target creature defending player controls');return base&&target?{...base,...body([{action:'require-block-v34',target:0,otherTarget:'self',duration:'combat'}],[target])}:null;
  }
  return null;
}
