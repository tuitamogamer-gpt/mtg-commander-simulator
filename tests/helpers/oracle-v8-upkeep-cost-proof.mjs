import assert from 'node:assert/strict';
export async function proveOracleUpkeepCost(MTG,ctx,entry,operation,source,h){
 const {game,a,b}=ctx,p=operation.payment;
 const n=operation.echo?1:2;
 if(p.kind==='additional'&&p.cost.kind!=='payLife'){
  const count=p.cost.quantity.min*n;
  for(let i=0;i<count;i++){
   const object=p.cost.object,type=object.types?.[0]||'Artifact';
   const def=h.fixtureDefinition('Upkeep payment '+i,[type],{cost:'{0}',power:'0',toughness:'1',subtypes:object.qualifier?.subtypes||[],colorsOverride:object.qualifier?.colors||[]});
   if(p.cost.kind==='discard')h.zoneCard(MTG,a,def,'hand');else h.permanent(MTG,game,a,def);
  }
 }
 if(p.kind==='opponent-counter')h.permanent(MTG,game,b,h.fixtureDefinition('Upkeep counter recipient',['Creature'],{cost:'{0}',power:'0',toughness:'3',kws:['shroud']}));
 if(p.kind==='graveyard-bottom')for(let i=0;i<n*2;i++)h.zoneCard(MTG,a,'Forest','graveyard');
 assert.equal(await game.castSpell(a,source,{from:'hand'}),true,entry.raw.name+': upkeep card is really cast');await h.resolveAll(game);
 assert.equal(source.zone,'battlefield');if(!operation.echo)source.counters.age=1;
 const before={life:a.life,hand:a.hand.length,mana:{...a.pool},counters:source.counters['-1/-1']||0,players:game.players.map(player=>player.life),creatures:new Map(game.bf().map(card=>[card,card.counters['+1/+1']||0]))};
 await game.emit('upkeep',{player:a});await game.flushTriggers();
 const stack=game.stack.find(row=>row.srcCard===source&&row.name.includes(operation.echo?'Echo —':'Cumulative upkeep —'));
 assert.ok(stack,entry.raw.name+': normal upkeep Stack trigger exists');assert.equal(stack.targets.length,0,entry.raw.name+': cost choices are not targets');
 await h.resolveAll(game);const receipt=stack.ctx.oracleUpkeepPayment;
 assert.equal(receipt?.paid,true,entry.raw.name+': human/local AI chose and really paid the full upkeep');assert.equal(receipt.n,n);
 if(p.kind==='additional'){
  if(p.cost.kind==='payLife'){assert.equal(receipt.costs.life,p.cost.amount.value*n);assert.equal(a.life,before.life-receipt.costs.life);}
  else{
   const selected=p.cost.kind==='discard'?receipt.costs.discards:receipt.costs.sacrifices.map(row=>row.iid);
   assert.equal(selected.length,p.cost.quantity.min*n);assert.equal(new Set(selected).size,selected.length);
   for(const iid of selected){const card=game.byIid(iid);assert.ok(card&&card.zone!==(p.cost.kind==='discard'?'hand':'battlefield'),entry.raw.name+': selected cost object actually left its payment zone');}
  }
 }else if(p.kind==='mana')assert.equal(Object.values(before.mana).reduce((a,b)=>a+b,0)-Object.values(a.pool).reduce((a,b)=>a+b,0),n);
 else if(p.kind==='self-counter')assert.equal(source.counters['-1/-1'],before.counters+n);
 else if(p.kind==='draw')assert.equal(a.hand.length,before.hand+n);
 else if(p.kind==='add-mana')assert.equal(a.pool.R,before.mana.R+n);
 else if(p.kind==='opponent-life')assert.equal(game.players.reduce((sum,player,index)=>sum+player.life-before.players[index],0),n);
 else if(p.kind==='opponent-counter')assert.equal(game.bf().reduce((sum,card)=>sum+(card.counters['+1/+1']||0)-(before.creatures.get(card)||0),0),n);
 else if(p.kind==='graveyard-bottom'){assert.equal(receipt.cards.length,n*2);assert.ok(receipt.cards.every(iid=>game.players.some(player=>player.library.slice(0,n*2).some(card=>card.iid===iid))));}
 assert.equal(source.zone,'battlefield',entry.raw.name+': successful payment retains the permanent');
 if(operation.echo){await game.emit('upkeep',{player:a});await game.flushTriggers();assert.equal(game.stack.some(row=>row.srcCard===source&&row.name.includes('Echo —')),false);await h.resolveAll(game);}
 else{
  const decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.aiHint?.kind==='oracleUpkeepCost'?'no':decide(g,q);
  await game.emit('upkeep',{player:a});await game.flushTriggers();const declined=game.stack.find(row=>row.srcCard===source&&row.name.includes('Cumulative upkeep —'));assert.ok(declined);await h.resolveAll(game);
  assert.equal(declined.ctx.oracleUpkeepPayment.paid,false);assert.notEqual(source.zone,'battlefield',entry.raw.name+': declined upkeep sacrifices the exact permanent');
 }
 return 10;
}
