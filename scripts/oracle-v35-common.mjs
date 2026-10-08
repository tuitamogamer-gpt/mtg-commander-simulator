const body=(effects,targets=[])=>({effects,targets,optional:false});
const trigger=(event,eventFilter,b,extra={})=>({kind:'generic-trigger',event,eventFilter,...b,...extra,contract:'generic-trigger-effect'});
const bundle=operations=>operations.every(Boolean)?{kind:'operation-bundle',operations,contract:'closed-permanent-clauses'}:null;
const checked=(op,eventTestV35)=>op?{...op,eventTestV35}:null;

export function extensionCost(text,h){
  const selfFirst=/^(.*?)(Sacrifice this (?:creature|artifact|permanent)) and ((?:another|a|an) .+)$/.exec(text);
  if(selfFirst)return h.cost(selfFirst[1]+selfFirst[2]+', Sacrifice '+selfFirst[3]);
  const selfLast=/^(.*?)(Sacrifice .+) and (this (?:creature|artifact|permanent))$/.exec(text);
  if(selfLast)return h.cost(selfLast[1]+selfLast[2]+', Sacrifice '+selfLast[3]);
  if(text==='{T}, Exile two cards from your graveyard and this creature')return h.cost('{T}, Exile this creature, Exile two cards from your graveyard');
  if(text==='Sacrifice a token named Wood')return {sacN:1,sacFilter:{...h.target('target permanent'),token:true,name:'Wood'}};
  if(text==='Sacrifice a suspected creature')return {sacN:1,sacFilter:{...h.target('target creature'),v20:{kind:'suspected-v35'}}};
  return null;
}

export function extensionLine(card,line,h){
  const draw=/^Whenever an opponent draws their second card each turn, (.+)$/.exec(line);
  if(draw){const b=h.effect(card,draw[1]);if(b)return trigger('draw',{kind:'draw-ordinal-v12',who:'any',ordinals:[2],ownTurn:false},b,{eventTestV35:'opponent-player'});}
  if(line==='Whenever a creature dies or a creature card is put into a graveyard from a library, each opponent loses 1 life.')return bundle([
    h.line(card,'Whenever a creature dies, each opponent loses 1 life.'),
    trigger('cardToGraveyard',{kind:'v8-event',from:'library',target:h.target('target creature card from a graveyard')},body([{action:'lose-life',who:'each-opponent',n:1}]))]);
  if(line==='Whenever one or more permanent cards are put into your graveyard from anywhere while this creature has a -1/-1 counter on it, remove a -1/-1 counter from this creature.')return checked(h.line(card,line.replace(' while this creature has a -1/-1 counter on it','')),'source-minus-counter');
  if(line==='Whenever a source you control other than this artifact deals damage to an opponent, put a charge counter on this artifact.')return h.line(card,'Whenever another source you control deals damage to an opponent, put a charge counter on this artifact.');
  const exile=/^Whenever you cast a spell from exile and whenever a permanent you control enters from exile, (.+)$/.exec(line);
  if(exile){const b=h.effect(card,exile[1]);if(b)return bundle([h.line(card,'Whenever you cast a spell from exile, '+exile[1]),checked(trigger('etb',{kind:'filtered-object',target:h.target('target permanent you control')},b),'entered-from-exile')]);}
  const exilePlay=/^Whenever you play a land from exile or cast a spell from exile, (.+)$/.exec(line);
  if(exilePlay){const b=h.effect(card,exilePlay[1]);if(b)return bundle([h.line(card,'Whenever you cast a spell from exile, '+exilePlay[1]),trigger('landPlayed',{kind:'observation-v9',controller:'you'},b,{eventTestV35:'played-from-exile'})]);}
  const powerup=/^Whenever another creature you control enters and whenever you activate a power-up ability, (.+)$/.exec(line);
  if(powerup){const b=h.effect(card,powerup[1]);if(b)return bundle([h.line(card,'Whenever another creature you control enters, '+powerup[1]),trigger('abilityActivated',{kind:'observation-v9',controller:'you'},b,{eventTestV35:'power-up'})]);}
  const grave=/^Whenever you cast a spell from your graveyard or activate an ability of a card in your graveyard, (.+)$/.exec(line);
  if(grave){const b=h.effect(card,grave[1]);if(b)return bundle([h.line(card,'Whenever you cast a spell from your graveyard, '+grave[1]),trigger('abilityActivated',{kind:'observation-v9',controller:'you'},b,{eventTestV35:'graveyard-activation'})]);}
  if(line==="Whenever a player puts a nontoken creature onto the battlefield, that player returns a land they control to its owner's hand.")return trigger('etb',{kind:'v8-event',target:h.target('target nontoken creature')},h.effect(card,"That player returns a land they control to its owner's hand."));
  if(line==="Whenever a creature you control but don't own dies, return it to the battlefield under its owner's control and you draw a card.")return checked(trigger('dies',{kind:'filtered-object',target:h.target('target creature you control')},h.effect(card,"Return that card to the battlefield under its owner's control. Draw a card.")),'foreign-owner');
  if(line==='Whenever you become the target of a spell, you may untap this creature.')return trigger('targeted','each-upkeep',{...body([{action:'untap',target:'self'}]),optional:true},{eventTestV35:'you-targeted-spell'});
  if(line==='Whenever you become the target of a spell or ability an opponent controls, counter that spell or ability unless its controller pays {1}.')return trigger('targeted','each-upkeep',body([{action:'counter-spell',target:'event-stack-v10',unlessGeneric:1}]),{eventTestV35:'you-targeted-opponent'});
  if(line==='Whenever a creature you control or a creature spell you control becomes the target of a spell or ability an opponent controls, draw a card.')return trigger('targeted','each-upkeep',body([{action:'draw',who:'you',n:1}]),{eventTestV35:'creature-targeted-opponent'});
  if(line==='Whenever you or a permanent you control becomes the target of a spell or ability an opponent controls, you may draw a card. You may draw an additional card if this creature is enchanted.')return trigger('targeted','each-upkeep',h.effect(card,'You may draw a card. You may draw an additional card if this creature is enchanted.'),{eventTestV35:'you-or-permanent-targeted-opponent'});
  const first=/^Whenever an opponent casts their first noncreature spell each turn, (.+)$/.exec(line);
  if(first){const b=h.effect(card,first[1]);if(b)return trigger('cast','each-upkeep',b,{eventTestV35:'opponent-first-noncreature'});}
  return null;
}
