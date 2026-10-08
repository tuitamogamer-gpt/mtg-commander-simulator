const body=(effects,targets=[])=>({effects,targets,optional:false});
const trigger=(event,eventFilter,b,extra={})=>b&&({kind:'generic-trigger',event,eventFilter,...b,...extra,contract:'generic-trigger-effect'});
const checked=(op,eventTestV37)=>op&&({...op,eventTestV37});
const capital=text=>text[0].toUpperCase()+text.slice(1);
const bundle=operations=>operations.every(Boolean)?{kind:'operation-bundle',operations,contract:'closed-permanent-clauses'}:null;
export function normalizeCard(card){
  if(card.name==='King Darien XLVIII')return {...card,oracle_text:card.oracle_text.replace('Sacrifice King Darien:', 'Sacrifice this creature:').replace('on King Darien and create','on this creature. Create')};
  if(card.name==='Tui and La, Moon and Ocean')return {...card,oracle_text:card.oracle_text.replace('put a +1/+1 counter on them.','put a +1/+1 counter on this creature.')};
  return card;
}
export function extensionCost(text,h){
  if(text==='{T}, Sacrifice ten nonland permanents')return {tap:true,sacN:10,sacFilter:h.target('target nonland permanent')};
  if(text==="{T}, Remove an eon counter from this land and return it to its owner's hand")return h.cost("{T}, Remove an eon counter from this land, Return this land to its owner's hand");
  return null;
}
export function extensionEffect(card,text,h){
  if(text==='Create a Food token or a Treasure token.')return body([{action:'choice-table-v20',kind:'mode',optional:false,options:['Food','Treasure'].map(name=>({key:name,label:name,effects:h.effect(card,'Create a '+name+' token.').effects}))}]);
  return null;
}
export function extensionLine(card,line,h){
  if(line==='You may play lands and cast Insect spells from your graveyard.')return bundle([h.line(card,'You may play lands from your graveyard.'),h.line(card,'You may cast Insect spells from your graveyard.')]);
  const cast=/^Whenever (you cast a Doctor spell or creature spell with doctor's companion|you cast a spell with \{H\} in its mana cost|an opponent casts an instant spell other than the first instant spell that player casts each turn|an opponent casts a creature or planeswalker spell with the same name as a card in their graveyard|you cast an instant or sorcery spell that targets only a single creature you control|you cast a creature spell that doesn't share a creature type with a creature you control or a creature card in your graveyard), (.+)$/.exec(line);
  if(cast){
    const tests={"you cast a Doctor spell or creature spell with doctor's companion":'doctor-companion',"you cast a spell with {H} in its mana cost":'phyrexian-spell',"an opponent casts an instant spell other than the first instant spell that player casts each turn":'later-opponent-instant',"an opponent casts a creature or planeswalker spell with the same name as a card in their graveyard":'grave-name-creature-pw',"you cast an instant or sorcery spell that targets only a single creature you control":'one-own-creature-target',"you cast a creature spell that doesn't share a creature type with a creature you control or a creature card in your graveyard":'no-shared-creature-type'};
    const b=h.effect(card,capital(cast[2]));if(b)return trigger('cast','each-upkeep',b,{eventTestV37:tests[cast[1]]});
  }
  if(line==='Whenever you discard a Spirit card or a card with disturb, put a +1/+1 counter on this creature.')return checked(h.line(card,'Whenever you discard a card, put a +1/+1 counter on this creature.'),'spirit-or-disturb');
  if(line==='Whenever you discard one or more cards for the first time each turn, draw that many cards.')return trigger('discarded',{kind:'v8-event',player:'you'},body([{action:'draw',who:'you',n:{kind:'discard-batch-count-v37'}}]),{eventTestV37:'first-discard-batch'});
  if(line==='Whenever one or more cards are put into exile from your graveyard, put that many +1/+1 counters on this creature.')return trigger('cardsLeftGraveyard','each-upkeep',body([{action:'counter',target:'self',counter:'+1/+1',n:{kind:'exiled-grave-count-v37'}}]),{eventTestV37:'exiled-grave-batch'});
  const activate=/^Whenever you activate an ability that targets a creature or player, (.+)$/.exec(line);
  if(activate)return trigger('abilityActivated',{kind:'observation-v9',controller:'you'},h.effect(card,capital(activate[1])),{eventTestV37:'creature-player-ability'});
  const ultron=/^Whenever another artifact is put into your graveyard from the battlefield or an artifact card is put into your graveyard from anywhere other than the battlefield, (.+)$/.exec(line);
  if(ultron)return bundle(['dies','cardToGraveyard'].map(event=>trigger(event,'each-upkeep',h.effect(card,capital(ultron[1])),{eventTestV37:event==='dies'?'own-other-artifact-dies':'own-artifact-graveyard'})));
  if(line==='Whenever this artifact or another nontoken artifact you control is put into a graveyard from the battlefield or is put into exile from the battlefield, create a tapped Powerstone token.')return checked(h.line(card,'Whenever this artifact or another nontoken artifact you control leaves the battlefield, create a tapped Powerstone token.'),'died-or-exiled');
  const captain=/^Whenever an opponent attacks you while you're the monarch, (.+)$/.exec(line);
  if(captain)return trigger('attackersDeclared',{kind:'v8-event',player:'opponent',declaredDefender:'you',target:h.target('target creature')},h.effect(card,capital(captain[1])),{eventTestV37:'monarch'});
  const oath=/^Whenever an opponent attacks a planeswalker you control with one or more creatures, (.+)$/.exec(line);
  if(oath)return trigger('attackersDeclared',{kind:'v8-event',player:'opponent'},h.effect(card,capital(oath[1])),{eventTestV37:'opponent-planeswalker-groups'});
  const horn=/^Whenever two or more creatures you control attack a player, (.+)$/.exec(line);
  if(horn)return trigger('attackersDeclared','each-upkeep',h.effect(card,capital(horn[1])),{eventTestV37:'two-creature-player-groups'});
  if(line==='Whenever a renowned creature you control deals combat damage to a player, double the number of +1/+1 counters on it.'){
    const base=h.line(card,'Whenever a creature you control deals combat damage to a player, put a +1/+1 counter on it.');
    return base?{...base,eventTestV37:'renowned-damage-source',effects:[{action:'double-counters',counter:'+1/+1',target:'event-card'}]}:null;
  }
  const party=/^Whenever one or more creatures you control deal combat damage to one or more players, (.+)$/.exec(line);
  if(party){const b=h.effect(card,capital(party[1]));return trigger('oracleDamageByController',{kind:'damage-event-v8',source:{kind:'filtered',target:h.target('target creature you control')},recipient:{kind:'a player'},bind:'source',combat:true},b);}
  if(line==='Whenever one or more Heroes you control deal damage to a player, put two +1/+1 counters on this creature.')return trigger('oracleDamageToObject',{kind:'damage-event-v8',source:{kind:'filtered',target:h.target('target Hero creature you control')},recipient:{kind:'a player'},bind:'source'},body([{action:'counter',target:'self',counter:'+1/+1',n:2}]));
  if(line==='Whenever a source you control deals noncombat damage to a creature equal to that creature\'s toughness, draw a card.')return checked(h.line(card,'Whenever a source you control deals noncombat damage to a creature, draw a card.'),'exact-toughness-damage');
  if(line==='Whenever this creature deals combat damage to one or more blocking creatures, manifest the top card of your library.')return trigger('oracleDamageBySource',{kind:'damage-event-v8',source:{kind:'self'},recipient:{kind:'filtered',target:{...h.target('target creature'),v20:{kind:'blocking-source-v37'}}},bind:'recipient',combat:true},h.effect(card,'Manifest the top card of your library.'));
  if(line==='Whenever an opponent is dealt damage by a red instant or sorcery spell you control or by a red planeswalker you control, return this card from your graveyard to your hand.'){
    const spell={kind:'filtered',target:{what:'card',zone:'graveyard',controller:'any',alternatives:['instant','sorcery'].map(what=>({what,zone:'graveyard',controller:'any',color:'red'}))},spell:true,controller:'you'},walker={kind:'filtered',target:h.target('target red planeswalker you control')};
    return trigger('oracleDamageHit',{kind:'damage-event-v8',source:{kind:'either',choices:[spell,walker]},recipient:{kind:'an opponent'},bind:'recipient'},h.effect(card,'Return this card from your graveyard to your hand.'),{zone:'graveyard'});
  }
  if(line==='Whenever this creature or an instant or sorcery spell you control deals damage to a player, exile the top card of your library. You may play that card this turn.')return trigger('oracleDamageHit',{kind:'damage-event-v8',source:{kind:'either',choices:[{kind:'self'},{kind:'filtered',target:{what:'card',zone:'graveyard',controller:'any',alternatives:['instant','sorcery'].map(what=>({what,zone:'graveyard',controller:'any'}))},spell:true,controller:'you'}]},recipient:{kind:'a player'},bind:'recipient'},h.effect(card,'Exile the top card of your library. You may play that card this turn.'));
  return null;
}
