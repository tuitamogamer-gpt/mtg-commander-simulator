import assert from 'node:assert/strict';
export async function fireCastEvent(M,context,source,operation,h){
 const rule=operation.eventFilter;if(operation.event!=='cast'||rule?.kind!=='qualified-cast-v8')return false;
 const {game,a,b}=context,player=rule.controller==='opponent'?b:a;
 const f=rule.target.spellFilter?.alternatives?.[0]||rule.target.spellFilter||{},quality=f.what||rule.target.spellQuality;
 const type=['creature','artifact','enchantment','instant','sorcery','planeswalker'].includes(quality)?quality[0].toUpperCase()+quality.slice(1):'Instant';
 const cost=(rule.manaX?'{X}':'')+(rule.colors?.map(c=>'{'+c+'}').join('')||'{0}');
 const def=h.fixtureDefinition('V8 cast-event witness',[type],{cost,power:'2',toughness:'20',kws:rule.target.withKeyword?[rule.target.withKeyword]:[],subtypes:f.subtype?[f.subtype]:[],
  ...(rule.targetsYouOrCreature?{targets:[{what:'player',filter:(g,p)=>p===a}]}:{})});
 const from=rule.from==='not-hand'?'exile':rule.from||'hand',owner=rule.zoneOwner==='source'?a:player;
 const card=h.zoneCard(M,owner,def,from);h.fund(player,100);
 context.eventCard=card;context.eventController=player;context.eventCardBefore=h.cardState(card);
 const phase=game.phase,active=game.turnPlayer;game.phase='main1';game.turnPlayer=rule.timing==='opponent-turn'?b:rule.timing? a:player;
 const events=[],emit=game.emit;game.emit=async function(event,data,...args){if(event==='cast')events.push(data);return emit.call(this,event,data,...args);};
 try{
  if(from==='library'||owner!==player){
   const controller=player.controller,decide=controller.decide;controller.decide=async function(g,q){return !player.isAI&&q.type==='chooseCards'&&q.prompt?.startsWith('You may cast one')?[card]:decide.call(this,g,q);};
   try{assert.equal(await M.OracleV8PlayPermissions.castOne({g:game,you:player,src:source},[card],{},{}),card,'qualified event has a real immediate zone permission');}finally{controller.decide=decide;}
  }else{
   if(from==='exile'){card.meta.playableBy=player;card.meta.playableUntil=game.turnNo;}
   if(from==='graveyard')card.meta.emryCastTurn=game.turnNo;
   const offer=game.castableList(player).find(row=>row.card===card);assert.ok(offer,'qualified cast witness is actually legal');
   assert.equal(await game.castSpell(player,card,{from,alt:offer.alt,...(rule.manaX?{xVal:3}:{})}),true);
  }
  assert.equal(events.filter(data=>data.player===player&&data.card===card).length,1,'qualified event uses one actual cast');
  const so=game.stack.find(so=>so.kind==='spell'&&so.card===card);assert.ok(so);assert.equal(so.from,from);
  if(rule.colors)assert.ok(rule.colors.every(color=>card.colors.includes(color)));
  if(rule.manaX)assert.equal(so.x,3,'chosen X is retained for the triggered body');
  if(rule.targetsYouOrCreature)assert.ok(so.targets.flat().includes(a));
 }finally{game.emit=emit;game.phase=phase;game.turnPlayer=active;}
 return true;
}
