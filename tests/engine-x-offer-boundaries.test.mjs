import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';

const M=loadEngine();
for(const role of ['human','ai']) {
 test(role+': Heat Ray with no target uses a constant number of X offer probes',()=>{
  const ctx=context(M,role),source=put(M,ctx.game,ctx.a,'Heat Ray','hand');
  ctx.a.pool={C:100,R:1,W:0,U:0,B:0,G:0};
  const original=ctx.game.spellTargetSpecs;let probes=0;
  ctx.game.spellTargetSpecs=function(...args){probes++;return original.apply(this,args);};
  assert.equal(ctx.game.castableList(ctx.a).some(entry=>entry.card===source),false);
  assert.ok(probes<=3,`static empty target set must not enumerate affordable X values (${probes} probes)`);
 });
 for(const name of ['Repeal','Disembowel'])test(role+': '+name+' finds an exact target threshold below affordable X and pays that X',async()=>{
  const ctx=context(M,role),target=put(M,ctx.game,ctx.b,'Runeclaw Bear'),source=put(M,ctx.game,ctx.a,name,'hand');
  ctx.a.pool={C:20,R:0,W:0,U:1,B:1,G:0};
  assert.ok(ctx.game.castableList(ctx.a).some(entry=>entry.card===source),'a real compiled exact-X threshold remains offered');
  assert.equal(await ctx.game.castSpell(ctx.a,source,{from:'hand',xVal:2}),true);
  assert.equal(ctx.game.stack.at(-1).x,2);assert.ok(ctx.game.stack.at(-1).targets.flat().includes(target));
  assert.equal(ctx.a.pool.C,18);await settle(ctx.game);assert.equal(target.zone,name==='Repeal'?'hand':'graveyard');
 });
 test(role+': compiled exact-X target count retains a smaller legal cast',async()=>{
  const ctx=context(M,role),target=put(M,ctx.game,ctx.b,'Sol Ring'),source=put(M,ctx.game,ctx.a,'By Force','hand');
  ctx.a.pool={C:20,R:1,W:0,U:0,B:0,G:0};
  assert.ok(ctx.game.castableList(ctx.a).some(entry=>entry.card===source));
  assert.equal(await ctx.game.castSpell(ctx.a,source,{from:'hand',xVal:1}),true);
  assert.equal(ctx.game.stack.at(-1).targets.flat().length,1);assert.equal(ctx.a.pool.C,19);
  await settle(ctx.game);assert.equal(target.zone,'graveyard');
 });
}
