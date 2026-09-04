import assert from 'node:assert/strict';
import {countValue,stageCount} from './oracle-v5-proof.mjs';
const worlds=new WeakMap(),installed=new WeakSet(),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function amount(effect,ctx,context){const n=effect.n;return n==='X'?ctx.x??ctx.so?.x:typeof n==='number'?n:n.kind==='event-amount'?ctx.data?.n:countValue(context,ctx.src,n);}
function install(M,context,h){
 let state=worlds.get(context.game);if(state)return state;
 state={context,h,rows:[],costs:[]};worlds.set(context.game,state);
 if(installed.has(M.OracleV8Energy))return state;installed.add(M.OracleV8Energy);
 const run=M.OracleV8Energy.run,spend=M.OracleV8Energy.spend;
 M.OracleV8Energy.spend=function(game,player,n,source){
  const state=worlds.get(game),before=player.counters.energy||0,result=spend.call(this,game,player,n,source);
  if(state){assert.equal(player.counters.energy||0,result?before-n:before,'actual energy cost is paid atomically');state.costs.push({source,player,n,before,after:player.counters.energy||0,result});}return result;
 };
 M.OracleV8Energy.run=async function(ctx,effect,helpers){
  const state=worlds.get(ctx.g);if(!state)return run.call(this,ctx,effect,helpers);
  const row={effect,source:ctx.src,n:amount(effect,ctx,state.context),before:ctx.you.counters.energy||0,choices:[],children:[]};state.rows.push(row);
  const decide=ctx.you.controller.decide;ctx.you.controller.decide=async function(g,q){const result=await decide.call(this,g,q);row.choices.push({query:q,result});return result;};
  try{
   row.result=await run.call(this,ctx,effect,{...helpers,run:async(childCtx,effects)=>{
    const before=state.h.genericProofSnapshot(state.context,[ctx.src,...(childCtx.targets||[]).flat().filter(card=>card instanceof M.CardInst)]);row.children.push(effects);
    const result=await helpers.run(childCtx,effects);
    for(const child of effects)await state.h.assertGenericEffectEvidence(M,state.context,{raw:{name:ctx.src.name},implementation:[]},child,ctx.src,childCtx.targets||[],state.context.b,before,row.choices,ctx.src.name+'/energy-payment');return result;
   }});row.after=ctx.you.counters.energy||0;return row.result;
  }finally{ctx.you.controller.decide=decide;}
 };
 return state;
}
export function stageEnergy(M,context,effect,h){
 if(!M.OracleV8Energy.actions.has(effect.action))return false;install(M,context,h);
 if(effect.action==='pay-energy-v8')context.a.counters.energy=Math.max(context.a.counters.energy||0,effect.n+10);
 if(typeof effect.n==='object'&&effect.n.kind!=='event-amount')stageCount(M,context,effect.n,h);
 return true;
}
export function stageEnergyCosts(M,context,entry,h){
 const costs=[];const visit=node=>{if(!node||typeof node!=='object')return;if(node.cost?.energy)costs.push(node.cost.energy);if(node.activationCost?.energy)costs.push(node.activationCost.energy);for(const child of Object.values(node))Array.isArray(child)?child.forEach(visit):visit(child);};visit(entry.implementation);
 if(!costs.length)return;install(M,context,h);context.a.counters.energy=Math.max(context.a.counters.energy||0,100,...costs);
}
export function assertEnergyCost(M,context,cost,source,label){
 if(!cost?.energy)return;
 const row=worlds.get(context.game)?.costs.find(row=>!row.verified&&row.source===source&&row.n===cost.energy&&row.result);assert.ok(row,label+': exact printed energy activation cost was paid');row.verified=true;assert.equal(row.before-row.after,cost.energy);
}
export function assertEnergy(M,context,effect,source,label){
 if(!M.OracleV8Energy.actions.has(effect.action))return false;
 const row=worlds.get(context.game)?.rows.find(row=>!row.verified&&row.source===source&&same(row.effect,effect));assert.ok(row,label+': energy runtime executes');row.verified=true;
 if(effect.action==='gain-energy-v8'){assert.equal(row.result,row.n);assert.equal(row.after,row.before+row.n,label+': exact energy gain');}
 else{
  assert.equal(row.result,true,label+': affordable positive energy-payment branch executes');assert.equal(row.after,row.before-row.n,label+': exact payment before child effects');assert.equal(same(row.children,[effect.effects]),true,label+': precisely the paid branch executes');
  if(effect.optional){const query=row.choices.find(row=>row.query.prompt==='Pay '+effect.n+' energy?');assert.ok(query,label+': controller makes the real optional payment choice');assert.equal(query.result,'yes');}
 }
 return true;
}
