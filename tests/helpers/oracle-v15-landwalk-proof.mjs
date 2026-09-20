import assert from 'node:assert/strict';
import {context,put,settle} from './oracle-v8-fixtures.mjs';
export async function landwalkOverrideProof(M,entry,operation,role){
  const f=context(M,role),{game,a,b}=f,attacker=put(M,game,b,'Craw Wurm'),blocker=put(M,game,a,'Runeclaw Bear'),other=put(M,game,a,'Runeclaw Bear');
  for(const name of ['Plains','Island','Swamp','Mountain','Forest'])put(M,game,a,name);
  attacker.attacking=a;
  const keyword=operation.keywords[0]==='all'?'forestwalk':operation.keywords[0];
  attacker.def={...attacker.def,kws:[keyword]};game.recalc();assert.equal(game.canBlock(blocker,attacker),false);
  const source=put(M,game,a,entry.raw.name,'hand');for(const color of ['W','U','B','R','G','C'])a.pool[color]=20;
  const decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(blocker)?[blocker]:decide(g,q);
  assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await settle(game);
  if(operation.attached)assert.equal(source.attachedTo,blocker.iid);
  assert.equal(attacker.kw(keyword),true,'landwalk is still an ability');assert.equal(game.canBlock(blocker,attacker),true);
  assert.equal(game.canBlock(other,attacker),!operation.attached);
  if(operation.attached){assert.equal(blocker.power,2+operation.power);assert.equal(blocker.toughness,2+operation.toughness);}
  attacker.def={...attacker.def,kws:[keyword,'flying']};game.recalc();assert.equal(game.canBlock(blocker,attacker),false,'other evasion still restricts blocking');
  attacker.def={...attacker.def,kws:[keyword]};await game.move(source,'exile');assert.equal(game.canBlock(blocker,attacker),false);
  return 10;
}
