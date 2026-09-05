import assert from 'node:assert/strict';

// Stop at the real post-declaration priority window. The ordinary generic
// evidence helper then resolves the actual trigger and proves every effect,
// without combat damage changing the same life and creature witnesses.
export async function declareExertProof(M,context,source){
  const {game,a,b}=context,decision=a.controller.decide.bind(a.controller),priority=game.priorityRound;
  const stop=new Error('Exert declaration proof reached priority');
  a.controller.decide=async(g,q)=>q.type==='attackers'?[{card:source,target:b}]:decision(g,q);
  game.priorityRound=async()=>{if(game.step==='attackers')throw stop;};
  try{await assert.rejects(game.combatPhase(a),error=>error===stop);}
  finally{a.controller.decide=decision;game.priorityRound=priority;}
  assert.equal(source.attacking,b,source.name+': source is legally declared attacking');
  assert.ok(source.meta.oracleExertedBy?.includes(a.idx),source.name+': real attack exertion records the exerting player');
  assert.equal(source.meta.oracleLastExertedTurn,game.turnNo,source.name+': paid exertion belongs to this turn');
  assert.ok(game.stack.some(row=>row.kind==='trigger'&&row.srcCard===source),source.name+': linked or watcher trigger waits for responses');
}
