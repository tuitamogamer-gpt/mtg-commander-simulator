import assert from 'node:assert/strict';

// Exercise the authoritative phase entry. Isolate unrelated card triggers and
// priority decisions so this proof cannot accidentally play a second game.
export async function phaseEntryV10(game,player,phase){
  const saved={emit:game.emit,priorityRound:game.priorityRound,draw:game.draw},events=[];
  game.emit=async(name,data)=>{events.push({name,player:data?.player});};
  game.priorityRound=async()=>{};game.draw=async p=>{events.push({name:'draw-action',player:p});};
  try{
    if(phase==='combat')await game.combatPhase(player);
    else await game.runBeginningPhase(player);
  }finally{Object.assign(game,saved);}
  return events;
}

export async function skipEffectProofV10(game,player,effect,label){
  const pending=()=>game.untilEffects.filter(row=>row.kind==='oracleSkipV10'&&row.player===player&&row.phase===effect.phase).reduce((n,row)=>n+row.n,0);
  const initial=pending();assert.ok(initial>=effect.n,label+': exact player has scheduled skips');
  if(effect.phase==='turn'){
    const before=game.turnNo,started=player.turnsStarted;
    for(let n=0;n<effect.n;n++){game.turnPlayer=player;await game.runTurn();assert.equal(game.turnNo,before);assert.equal(player.turnsStarted,started);}
  }else{
    for(let n=0;n<effect.n;n++){
      const events=await phaseEntryV10(game,player,effect.phase);
      assert.equal(events.some(row=>row.name===({draw:'drawStep',combat:'beginCombat',untap:'becameUntapped'})[effect.phase]),false,label+': skipped step creates no event');
    }
  }
  assert.equal(pending(),initial-effect.n,label+': one pending replacement consumed per skipped occurrence');
  return effect.n+2;
}
