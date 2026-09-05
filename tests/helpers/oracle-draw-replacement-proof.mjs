import assert from'node:assert/strict';
export async function drawReplacementProof(M,entry,operation,role,h){
 const ctx=h.gameFor(M,[h.decision({chooseTargets:(game,q)=>q.candidates.filter(candidate=>candidate!==game.players[0]).slice(0,q.min||1)}),h.decision()],{ai:role==='ai'}),{game,a,b}=ctx,label=entry.raw.name+'/'+role;
 h.assertControllerRole(M,ctx,label);for(const p of game.players){h.fund(p,100);h.fillLibrary(M,p,30);}h.stageCardCosts(M,ctx,entry);
 const temporary=operation.effects?.[0],isSpell=operation.kind==='spell-generic',source=h.zoneCard(M,a,entry.raw.name,'hand'),before=Object.values(a.pool).reduce((a,b)=>a+b,0);
 assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await h.resolveAll(game);assert.ok(Object.values(a.pool).reduce((a,b)=>a+b,0)<before);
 if(temporary&&!isSpell){h.permanent(M,game,b,'Grizzly Bears');h.zoneCard(M,b,'Grizzly Bears','hand');const ability=game.activatableList(a).find(row=>row.card===source);assert.ok(ability);const pool=Object.values(a.pool).reduce((a,b)=>a+b,0);assert.equal(await game.activateAbility(a,ability),true);await h.resolveAll(game);assert.equal(Object.values(a.pool).reduce((a,b)=>a+b,0),pool-1);}
 if(operation.mode==='look-three'||operation.mode==='reveal-creatures')for(const name of ['Serra Angel','Forest','Grizzly Bears'])h.zoneCard(M,a,name,'library');
 if(operation.mode==='win-empty')for(const card of a.library.slice())await game.move(card,'exile');
 const redirect=operation.mode==='redirect'||isSpell,player=redirect?b:a,hand=a.hand.length,enemyHand=b.hand.length,life=a.life,grave=a.graveyard.length,exile=a.exile.length,tokens=game.bf().filter(card=>card.isToken).length,own=game.bf().filter(card=>card.ctrl===a).length,opponents=game.bf().filter(card=>card.ctrl===b).length,events=[];
 const emit=game.emit.bind(game);game.emit=async(event,data)=>{if(event==='draw')events.push(data);return emit(event,data);};await game.draw(player,1,source);
 const mode=temporary?.mode||operation.mode;
 if(mode==='multiply'){assert.equal(a.hand.length-hand,2);assert.equal(events.length,2);}
 else if(mode==='redirect'){assert.equal(a.hand.length-hand,1);assert.equal(b.hand.length,enemyHand);assert.equal(events[0]?.player,a);}
 else if(mode==='empty-hand'){assert.equal(a.hand.length-hand,2);assert.equal(a.life,life-1);assert.equal(events.length,2);}
 else if(mode==='look-three'){assert.equal(a.hand.length-hand,1);assert.equal(a.graveyard.length-grave,operation.rest==='graveyard'?2:0);assert.equal(events.length,0);}
 else if(mode==='reveal-creatures'){assert.equal(a.hand.length-hand,2);assert.equal(events.length,0);}
 else if(mode==='impulse'){assert.equal(a.exile.length-exile,2);assert.equal(events.length,0);for(const card of a.exile.slice(-2))assert.equal(game.hasExilePlayPermission(a,card),true);}
 else if(mode==='win-empty'){assert.equal(game.winner,a);assert.equal(!!a.deckedOut,false);}
 else if(mode==='study'||mode==='skip'){
  // Both decisions are legal: the paid source proof verifies the actual
  // controller's choice and the matching concrete outcome.
  const replaced=events.length===0;assert.equal(a.hand.length-hand,replaced?0:1);if(mode==='study')assert.equal(source.counters.study||0,replaced?1:0);
 }
 else if(mode==='gain-life'){assert.equal(a.life,life+5);assert.equal(events.length,0);}
 else if(mode==='discard-opponents'){assert.equal(b.hand.length,enemyHand-1);assert.equal(events.length,0);}
 else if(mode==='bounce-each'){assert.equal(game.bf().filter(card=>card.ctrl===a).length,own-1);assert.equal(game.bf().filter(card=>card.ctrl===b).length,opponents-1);assert.equal(events.length,0);}
 else if(mode==='bear'){const made=game.bf().filter(card=>card.isToken);assert.equal(made.length,tokens+1);assert.equal(made.at(-1).name,'Bear Token');assert.equal(made.at(-1).power,2);assert.equal(events.length,0);}
 else assert.fail(label+': unproven draw replacement mode '+mode);
 return 8;
}
