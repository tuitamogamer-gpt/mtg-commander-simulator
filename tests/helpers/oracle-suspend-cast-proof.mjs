import assert from 'node:assert/strict';

// Stop each real turn at its upkeep priority window. This exercises the
// engine's own time-counter and free-cast triggers without drawing cards or
// advancing unrelated phases in the controlled effect fixture.
export async function castThroughSuspend(MTG,game,player,card,{alreadySuspended=false}={}) {
 const printed=card.def.suspend;assert.ok(printed,card.name+': printed Suspend exists');
 if(!alreadySuspended){
  assert.equal(card.zone,'hand');
  if(!card.def.cost){const before={...player.pool};assert.equal(await game.castSpell(player,card,{from:'hand'}),false,card.name+': absent mana cost cannot be paid');assert.deepEqual({...player.pool},before);}
  const offer=game.activatableList(player).find(entry=>entry.card===card&&entry.suspend);
  assert.ok(offer,card.name+': legal Suspend special action is offered');
  const before=Object.values(player.pool).reduce((sum,n)=>sum+n,0);
  assert.equal(await game.activateAbility(player,offer),true,card.name+': Suspend cost is paid');
  const cost=MTG.parseCost(printed.cost);
  assert.equal(before-Object.values(player.pool).reduce((sum,n)=>sum+n,0),cost.generic+cost.pips.length,card.name+': exact Suspend mana payment');
 }
 assert.equal(card.zone,'exile');assert.equal(card.meta.suspended,printed.n);
 assert.equal(game.stack.some(object=>object.card===card),false,card.name+': suspending does not cast a spell');
 const originalPriority=game.priorityRound,originalPlayer=game.turnPlayer,stop=Symbol('completed suspend upkeep');
 let spell=null,removals=0,casts=0;
 game.turnPlayer=player;
 try {
  game.priorityRound=async()=>{
   assert.equal(game.phase,'upkeep',card.name+': use actual upkeep priority');
   for(let step=0;step<100&&(game.stack.length||game.pendingTriggers.length);step++){
    await game.flushTriggers();
    const top=game.stack.at(-1);
    if(top?.kind==='spell'&&top.card===card){spell=top;break;}
    if(top?.srcCard===card&&top.name.includes('Suspend: remove a time counter'))removals++;
    if(top?.srcCard===card&&top.name.includes('Suspend: cast'))casts++;
    if(top)await game.resolveTop();
   }
   throw stop;
  };
  for(let turn=0;turn<printed.n;turn++){
   try{await game.runTurn();assert.fail(card.name+': expected an upkeep checkpoint');}catch(error){if(error!==stop)throw error;}
   if(turn<printed.n-1){assert.equal(card.zone,'exile');assert.equal(card.meta.suspended,printed.n-turn-1);assert.equal(spell,null);}
  }
 }finally{game.priorityRound=originalPriority;game.turnPlayer=originalPlayer;}
 assert.equal(removals,printed.n,card.name+': one real removal trigger per upkeep');
 assert.equal(casts,1,card.name+': removing the last counter creates a separate cast trigger');
 assert.ok(spell,card.name+': Suspend casts the real card onto the Stack');
 assert.equal(card.zone,'stack');assert.equal(spell.castOpts.free,true);assert.equal(spell.castOpts.suspend,true);
 assert.equal(spell.castOpts.from,'exile');assert.equal(card.meta.suspended,undefined,card.name+': Suspend permission is consumed');
 return spell;
}
