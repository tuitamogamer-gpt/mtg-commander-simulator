import test from 'node:test';
import assert from 'node:assert/strict';
import{fixtureEngine,context,put,settle,paidCast}from'./helpers/oracle-v8-fixtures.mjs';
import{semanticClass}from'../scripts/import-oracle-batch.mjs';
const MTG=fixtureEngine([
 ['Upkeep Life','Cumulative upkeep—Pay 2 life.'],
 ['Upkeep Discard','Cumulative upkeep—Discard a card.'],
 ['Upkeep Sacrifice','Cumulative upkeep—Sacrifice a creature.'],
 ['Upkeep Mana','Cumulative upkeep {W} or {U}'],
 ['Upkeep Self Counter','Cumulative upkeep—Put a -1/-1 counter on this creature.'],
 ['Upkeep Opponent Counter','Cumulative upkeep—Put a +1/+1 counter on a creature an opponent controls.'],
 ['Upkeep Opponent Life','Cumulative upkeep—An opponent gains 1 life.'],
 ['Upkeep Mana Gain','Cumulative upkeep—Add {R}.','Enchantment'],
 ['Upkeep Draw','Cumulative upkeep—Draw a card.','Enchantment'],
 ['Upkeep Graveyard','Cumulative upkeep—Put two cards from a single graveyard on the bottom of their owner\'s library.'],
 ['Upkeep Echo Discard','Echo—Discard a card.'],
 ['Upkeep Echo Lands','Echo—Sacrifice two lands.'],
]);
const own=(ctx,name,zone='battlefield')=>put(MTG,ctx.game,ctx.a,name,zone);
function ready(role,name){const ctx=context(MTG,role,2);ctx.source=own(ctx,name);return ctx;}
async function trigger(ctx,player=ctx.a){
 await ctx.game.emit('upkeep',{player});await ctx.game.flushTriggers();
 const so=ctx.game.stack.find(row=>row.srcCard===ctx.source&&/upkeep|Echo/.test(row.name));
 if(so){assert.equal(so.kind,'trigger');assert.equal(so.targets.length,0);}
 await settle(ctx.game);return so?.ctx.oracleUpkeepPayment;
}
for(const role of['human','ai']){
 test(`Upkeep ${role}: actual cast, life escalation and refusal sacrifice with no partial life payment`,async()=>{
  const ctx=context(MTG,role);ctx.source=await paidCast(MTG,ctx,'Upkeep Life');const life=ctx.a.life;
  assert.equal((await trigger(ctx)).costs.life,2);assert.equal(ctx.a.life,life-2);assert.equal(ctx.source.counters.age,1);
  assert.equal((await trigger(ctx)).costs.life,4);assert.equal(ctx.a.life,life-6);
  ctx.a.life=5;const receipt=await trigger(ctx);assert.equal(receipt.paid,false);assert.equal(ctx.a.life,5);assert.equal(ctx.source.zone,'graveyard');
 });
 test(`Upkeep ${role}: discard and sacrifice reserve the complete number, including a legal source sacrifice`,async()=>{
  const ctx=ready(role,'Upkeep Discard');ctx.source.counters.age=1;const cards=[own(ctx,'Forest','hand'),own(ctx,'Forest','hand')];
  const receipt=await trigger(ctx);assert.equal(receipt.costs.discards.length,2);assert.ok(cards.every(card=>card.zone==='graveyard'));assert.equal(ctx.source.zone,'battlefield');
  const partial=own(ctx,'Forest','hand');assert.equal((await trigger(ctx)).paid,false);assert.equal(partial.zone,'hand');assert.equal(ctx.source.zone,'graveyard');
  const sac=ready(role,'Upkeep Sacrifice');sac.source.counters.age=1;const fodder=own(sac,'Grizzly Bears');const record=await trigger(sac);assert.equal(record.paid,true);assert.equal(record.costs.sacrifices.length,2);assert.equal(fodder.zone,'graveyard');assert.equal(sac.source.zone,'graveyard');
 });
 test(`Upkeep ${role}: each mana unit can choose a different color and fails without spending a partial pool`,async()=>{
  const ctx=ready(role,'Upkeep Mana');ctx.source.counters.age=1;ctx.a.pool.W=1;ctx.a.pool.U=1;const receipt=await trigger(ctx);assert.equal(receipt.paid,true);assert.equal(ctx.a.pool.W+ctx.a.pool.U,0);assert.deepEqual([...receipt.colors].sort(),['U','W']);
  ctx.a.pool.W=2;assert.equal((await trigger(ctx)).paid,false);assert.equal(ctx.a.pool.W,2);assert.equal(ctx.source.zone,'graveyard');
 });
 test(`Upkeep ${role}: counter, draw and produced mana are real payments and can be declined`,async()=>{
  for(const name of['Upkeep Self Counter','Upkeep Draw','Upkeep Mana Gain']){
   const ctx=ready(role,name),hand=ctx.a.hand.length;const record=await trigger(ctx);assert.equal(record.paid,true);
   if(name==='Upkeep Self Counter')assert.equal(ctx.source.counters['-1/-1'],1);
   if(name==='Upkeep Draw')assert.equal(ctx.a.hand.length,hand+1);
   if(name==='Upkeep Mana Gain')assert.equal(ctx.a.pool.R,1);
   const decide=ctx.a.controller.decide.bind(ctx.a.controller);ctx.a.controller.decide=(g,q)=>q.aiHint?.kind==='oracleUpkeepCost'?'no':decide(g,q);
   assert.equal((await trigger(ctx)).paid,false);assert.equal(ctx.source.zone,'graveyard');
  }
 });
 test(`Upkeep ${role}: choices of recipients are not targets, including shroud/hexproof and life gain prohibition`,async()=>{
  const ctx=ready(role,'Upkeep Opponent Counter');ctx.source.counters.age=1;
  const host=put(MTG,ctx.game,ctx.b,'Grizzly Bears');host.def={...host.def,kws:['shroud','hexproof']};ctx.game.recalc();assert.equal((await trigger(ctx)).paid,true);assert.equal(host.counters['+1/+1'],2);
  const life=ready(role,'Upkeep Opponent Life');life.source.counters.age=1;const total=life.others.reduce((sum,p)=>sum+p.life,0);assert.equal((await trigger(life)).paid,true);assert.equal(life.others.reduce((sum,p)=>sum+p.life,0),total+2);
  const stop=own(life,'Grizzly Bears');stop.def={...stop.def,noLifegain:'all'};life.game.recalc();assert.equal((await trigger(life)).paid,false);assert.equal(life.source.zone,'graveyard');
 });
 test(`Upkeep ${role}: each graveyard pair stays within one graveyard, every age choice is reserved before moving cards`,async()=>{
  const ctx=ready(role,'Upkeep Graveyard');ctx.source.counters.age=1;
  const cards=[...Array.from({length:2},()=>own(ctx,'Forest','graveyard')),...Array.from({length:2},()=>put(MTG,ctx.game,ctx.b,'Forest','graveyard'))];
  const before=ctx.a.library.length,otherBefore=ctx.b.library.length;const receipt=await trigger(ctx);assert.equal(receipt.paid,true);assert.equal(receipt.cards.length,4);assert.equal(ctx.a.library.length,before+2);assert.equal(ctx.b.library.length,otherBefore+2);assert.ok(cards.every(c=>c.zone==='library'));assert.ok(ctx.a.library.slice(0,2).every(c=>cards.includes(c)));assert.ok(ctx.b.library.slice(0,2).every(c=>cards.includes(c)));
  const fail=ready(role,'Upkeep Graveyard');own(fail,'Forest','graveyard');put(MTG,fail.game,fail.b,'Forest','graveyard');assert.equal((await trigger(fail)).paid,false);assert.equal(fail.source.zone,'graveyard');assert.equal(fail.b.graveyard.length,1);
 });
 test(`Upkeep ${role}: Echo pays once after gaining control and permits another payment after a later control change`,async()=>{
  const ctx=context(MTG,role);ctx.source=await paidCast(MTG,ctx,'Upkeep Echo Discard');const card=own(ctx,'Forest','hand');assert.equal((await trigger(ctx)).paid,true);assert.equal(card.zone,'graveyard');assert.equal(await trigger(ctx),undefined);
  ctx.source.ctrl=ctx.b;ctx.game.recalc();put(MTG,ctx.game,ctx.b,'Forest','hand');assert.equal((await trigger(ctx,ctx.b)).paid,true);
  const lands=ready(role,'Upkeep Echo Lands');const first=own(lands,'Forest'),second=own(lands,'Forest');assert.equal((await trigger(lands)).costs.sacrifices.length,2);assert.equal(first.zone,'graveyard');assert.equal(second.zone,'graveyard');
 });
}
test('Upkeep refuses duplicate, stale and foreign cost choices before any resource is committed',async()=>{
 for(const mode of['duplicate','blink','foreign']){
  const ctx=ready('human','Upkeep Discard');ctx.source.counters.age=1;const a=own(ctx,'Forest','hand'),b=own(ctx,'Forest','hand'),foreign=put(MTG,ctx.game,ctx.b,'Forest','hand');const decide=ctx.a.controller.decide.bind(ctx.a.controller);
  ctx.a.controller.decide=async(g,q)=>{if(q.type==='chooseCards'){if(mode==='blink'){await g.move(a,'exile');await g.move(a,'hand');return[a,b];}return mode==='duplicate'?[a,a]:[a,foreign];}return decide(g,q);};
  const receipt=await trigger(ctx);assert.equal(receipt.paid,false);assert.equal(a.zone,'hand');assert.equal(b.zone,'hand');assert.equal(foreign.zone,'hand');assert.equal(ctx.source.zone,'graveyard');
 }
});
test('Upkeep source blink before resolution cannot add age, charge payment or sacrifice the new object',async()=>{
 const ctx=ready('human','Upkeep Life'),life=ctx.a.life;await ctx.game.emit('upkeep',{player:ctx.a});await ctx.game.flushTriggers();assert.equal(ctx.game.stack.length,1);await ctx.game.move(ctx.source,'exile');await ctx.game.move(ctx.source,'battlefield');await settle(ctx.game);assert.equal(ctx.source.counters.age||0,0);assert.equal(ctx.a.life,life);assert.equal(ctx.source.zone,'battlefield');
});
test('Upkeep draw allows empty-library attempt, keeps replacement draws and AI avoids a lethal draw payment',async()=>{
 const empty=ready('human','Upkeep Draw');empty.a.library=[];assert.equal((await trigger(empty)).paid,true);assert.equal(empty.a.lost,true);
 const ai=ready('ai','Upkeep Draw');ai.a.library=[];assert.equal((await trigger(ai)).paid,false);assert.equal(ai.a.lost,false);assert.equal(ai.source.zone,'graveyard');
 const twice=ready('human','Upkeep Draw'),doubler=own(twice,'Grizzly Bears');doubler.def={...doubler.def,drawDouble:true};twice.game.recalc();const hand=twice.a.hand.length;assert.equal((await trigger(twice)).paid,true);assert.equal(twice.a.hand.length,hand+2);
});
test('Upkeep source sacrifice is opt-in and unsupported text/quantities/snow remain deferred',()=>{
 const ctx=ready('human','Upkeep Sacrifice'),cost=ctx.source.def.oracleImplementation.find(o=>o.kind==='mechanic-upkeep-cost-v8').payment.cost,compiled=MTG.compileOracleAdditionalCosts([cost]);assert.equal(compiled.castCond(ctx.game,ctx.a,ctx.source),false);assert.equal(compiled.canPayContext({g:ctx.game,you:ctx.a,src:ctx.source,so:{x:0},allowSourceSacrifice:true}),true);
 for(const line of['Cumulative upkeep {S}','Cumulative upkeep—Pay X life.','Cumulative upkeep—Sacrifice a creature unless you smile.','Echo—Draw a card.'])assert.equal(!!semanticClass({name:'Unknown upkeep',layout:'normal',type_line:'Creature — Bear',mana_cost:'{G}',power:'3',toughness:'4',oracle_text:line}).semanticClass,false);
});
