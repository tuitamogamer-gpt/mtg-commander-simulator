import assert from'node:assert/strict';
export async function fireDamageEvent(M,ctx,source,operation,h){
 const rule=operation.eventFilter;if(rule?.kind!=='damage-event-v8')return false;
 const {game,a,b}=ctx;
 async function object(selector,label){
  if(selector.kind==='self')return source;
  if(selector.kind==='either')return object(selector.choices[0],label);
  if(selector.kind==='quality'){
   const obj=h.permanent(M,game,a,h.fixtureDefinition('Damage quality creature',selector.quality==='land'?['Land','Creature']:selector.quality==='historic'?['Artifact','Creature']:['Creature'],{power:'3',toughness:'20'}));
   if(selector.quality==='modified'||selector.quality==='power-above-base'){obj.counters['+1/+1']=1;game.recalc();}return obj;
  }
  if(selector.kind==='attached'){
   if(source.attachedTo)return game.byIid(source.attachedTo);
   const host=h.permanent(M,game,a,h.fixtureDefinition('Damage event host',['Creature'],{power:'3',toughness:'20'}));await game.attach(source,host);return host;
  }
  if(selector.kind==='you')return a;
  if(['a player','an opponent','a player or battle','a creature or opponent','any'].includes(selector.kind))return b;
  if(selector.kind==='filtered'){
   const obj=h.stageGenericTarget(M,ctx,{...selector.target,...(selector.spell?{zone:'battlefield',controller:selector.controller}:{}),controller:selector.target.controller==='any'?'you':selector.target.controller},'damage-'+label);
   if(obj.def&&!obj.def.oracleImplementation&&obj.is('Creature')){obj.def={...obj.def,power:'3',toughness:'20'};game.recalc();}return obj;
  }
  return h.permanent(M,game,selector.controller==='you'?a:b,h.fixtureDefinition('Damage event source',['Artifact'],{colorsOverride:selector.color?[selector.color]:[]}));
 }
 const origin=await object(rule.source,'source'),recipient=await object(rule.recipient,'recipient');
 const card=rule.bind==='source'?origin:recipient;
 ctx.eventCard=card;ctx.eventController=card.ctrl;ctx.eventPlayer=recipient instanceof M.Player?recipient:recipient.ctrl;ctx.eventAmount=1;
 ctx.eventCardBefore=h.cardState(card);ctx.eventCardStats={power:card.power,toughness:card.toughness,mv:card.mv};
 if(rule.source.spell){
  const player=rule.source.controller==='you'?a:b;await game.move(origin,'hand');origin.owner=player;origin.ctrl=player;
  origin.def={...origin.def,resolve:async c=>c.g.damageAny(c.src,recipient,1,{combat:!!rule.combat})};
  const turn=game.turnPlayer,phase=game.phase;game.turnPlayer=player;game.phase='main1';h.fund(player);
  try{assert.equal(await game.castSpell(player,origin,{from:'hand'}),true);const so=game.stack.find(row=>row.card===origin);assert.ok(so);while(game.stack.at(-1)!==so)await game.resolveTop();await game.resolveTop();}finally{game.turnPlayer=turn;game.phase=phase;}
 }else await game.damageAny(origin,recipient,1,{combat:!!rule.combat});
 return true;
}
