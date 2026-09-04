import assert from'node:assert/strict';
export async function proveOracleEncore(MTG,ctx,entry,operation,source,h){
 const{game,a}=ctx;await game.move(source,'graveyard');
 const row=game.activatableList(a).find(row=>row.card===source&&row.gyAbility);assert.ok(row,entry.raw.name+': genuine printed graveyard activation is offered');
 const before=Object.values(a.pool).reduce((sum,n)=>sum+n,0),opponents=game.players.filter(player=>player!==a&&!player.lost);
 assert.equal(await game.activateAbility(a,row),true,entry.raw.name+': actual human/local AI activation');
 const stack=game.stack.find(row=>row.srcCard===source);assert.ok(stack,entry.raw.name+': respondable Encore ability');assert.equal(source.zone,'exile');assert.ok(Object.values(a.pool).reduce((sum,n)=>sum+n,0)<before);
 await h.resolveAll(game);const locks=stack.ctx.oracleEncoreTokens;assert.equal(locks.length,opponents.length,entry.raw.name+': one copy per remaining opponent');
 const tokens=locks.map(lock=>game.byIid(lock.iid));
 for(let i=0;i<tokens.length;i++){const token=tokens[i];assert.ok(token&&token.zone==='battlefield');assert.equal(token.name,source.name);assert.equal(token.kw('haste'),true);assert.equal(token.tapped,false);assert.equal(!!token.attacking,false);assert.deepEqual([...game.legalDeclarationAttackTargets(token)],[game.players[locks[i].opponent]]);}
 await game.emit('endStep',{player:a});await game.flushTriggers();assert.ok(game.stack.some(row=>row.name==='Encore sacrifice'));await h.resolveAll(game);assert.ok(tokens.every(token=>token.zone!=='battlefield'));assert.equal(source.zone,'exile');
 return 8+tokens.length*6;
}
