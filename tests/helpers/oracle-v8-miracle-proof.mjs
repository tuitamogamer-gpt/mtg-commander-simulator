import assert from'node:assert/strict';
export async function proveOracleMiracle(MTG,ctx,entry,operation,source,h){
 const{game,a}=ctx;await game.move(source,'library');a.turnState.drewThisTurn=0;
 // Choose a bounded positive X through the actual announcement prompt. The
 // rest of the human/local-AI decisions retain their ordinary controllers.
 const decide=a.controller.decide.bind(a.controller);if(!a.isAI)a.controller.decide=(g,q)=>q.type==='chooseX'?Math.max(q.min||0,Math.min(2,q.max??2)):decide(g,q);
 const before=Object.values(a.pool).reduce((sum,n)=>sum+n,0);await game.draw(a,1);
 assert.equal(source.zone,'hand');assert.ok(game.miracleRevealedCards(a).includes(source),entry.raw.name+': first draw is actually revealed before trigger placement');
 await game.flushTriggers();const trigger=game.stack.find(row=>row.srcCard===source&&row.name.endsWith(`Miracle ${operation.cost}`));assert.ok(trigger,entry.raw.name+': respondable Miracle trigger');
 for(let n=0;n<100&&game.stack.includes(trigger);n++)await game.resolveTop();
 const spell=game.stack.find(row=>row.card===source);assert.ok(spell,entry.raw.name+': paid Miracle cast produced a separate spell');assert.equal(spell.castOpts.miracle,true);assert.equal(spell.castOpts.altCostStr,operation.cost);assert.ok(Object.values(a.pool).reduce((sum,n)=>sum+n,0)<before);assert.equal(game.miracleRevealedCards(a).includes(source),false);
 if(operation.cost.includes('{X}'))assert.ok(spell.x>0,entry.raw.name+': positive X is actually announced and paid');
 await h.resolveAll(game);assert.notEqual(source.zone,'stack');assert.notEqual(source.zone,'hand');return 9;
}
