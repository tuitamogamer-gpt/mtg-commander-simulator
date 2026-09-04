import assert from 'node:assert/strict';

export async function handSizeProof(M,entry,operation,role,h){
 const ctx=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=ctx,label=entry.raw.name+'/'+role;
 h.assertControllerRole(M,ctx,label);
 h.fillLibrary(M,a,40);h.fillLibrary(M,b,40);
 // Keep the tested discarding player in the real human / local-AI seat.
 const owner=operation.who==='opponents'?b:a;
 const source=h.zoneCard(M,owner,entry.raw.name,'hand');
 const cast=async()=>{
  h.fund(owner,100);assert.equal(await game.castSpell(owner,source,{from:'hand'}),true,label+': paid source cast');
  await h.resolveAll(game);assert.equal(source.zone,'battlefield',label+': source resolved');
 };
 if(owner===b){game.turnPlayer=b;await cast();game.turnPlayer=a;}
 const expected=operation.unlimited?Infinity:Math.max(0,7+operation.n);
 let prepared=false,cleanupSeen=false;
 game.mainPhase=async()=>{
  if(prepared)return;prepared=true;
  // Cast after upkeep so a separate upkeep ability cannot remove the source
  // before this operation's actual cleanup demonstration.
  if(owner===a)await cast();
  assert.equal(game.maximumHandSize(a),expected,label+': exact printed modifier');
  assert.equal(game.maximumHandSize(b),operation.who==='all'?Infinity:7,label+': unaffected controller/opponent');
  while(a.hand.length<18)h.zoneCard(M,a,'Forest','hand');
 };
 const maximum=game.maximumHandSize;
 game.maximumHandSize=function(player){
  const result=maximum.call(this,player);
  if(this.phase==='cleanup'&&player===a){cleanupSeen=true;assert.equal(source.zone,'battlefield');assert.equal(result,expected,label+': live rule at cleanup');}
  return result;
 };
 game.combatPhase=async()=>{};game.priorityRound=async()=>h.resolveAll(game);
 await game.runTurn();
 assert.ok(cleanupSeen,label+': real cleanup was executed');
 assert.equal(a.hand.length,operation.unlimited?18:expected,label+': exact cleanup hand count');
 const discarded=a.graveyard.length;
 assert.equal(discarded,operation.unlimited?0:18-expected,label+': exact cards discarded');
 game.maximumHandSize=maximum;
 await game.move(source,'exile');game.recalc();
 assert.equal(game.maximumHandSize(a),7,label+': source removal restores default');
 assert.equal(game.maximumHandSize(b),7,label+': other player remains default');
 assert.equal((game.aiDecisionLog||[]).some(row=>row.fallback),false,label+': no AI fallback');
 return 8;
}
