import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureEngine,context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {extensionEffect,fixedAmount} from '../scripts/oracle-v8-energy.mjs';
const rows=[
 ['Energy Sage','When this creature enters, you get {E}{E}{E} (three energy counters).'],
 ['Energy Fast','You draw two cards, lose 2 life, and get {E}{E} (two energy counters).','Sorcery'],
 ['Energy Maker','{T}: You get {E}{E} (two energy counters).'],
 ['Energy Spender','{1}, {T}: You may pay {E}{E}. If you do, put a +1/+1 counter on this creature.'],
 ['Energy Mandatory',"When this creature enters, pay {E}{E} (two energy counters). If you can't, return this creature to its owner's hand and you get {E}."],
 ['Energy Unless','At the beginning of your end step, sacrifice this creature unless you pay {E}{E}.'],
 ['Energy Observer','Whenever you get one or more {E} (energy counters), put a +1/+1 counter on target creature you control.'],
 ['Energy TurnObserver','Whenever you get one or more {E} during your turn, creatures you control get +1/+1 until end of turn.'],
 ['Energy Power','When this creature enters, you get an amount of {E} (energy counters) equal to this creature\'s power.'],
 ['Energy Combat','Whenever this creature deals combat damage to a player, you get that many {E} (energy counters).'],
 ['Energy Cost','{1}, {T}, Pay {E}{E}: Draw a card.'],
 ['Energy Mana','{T}, Pay {E}: Add one mana of any color.'],
 ['Energy Reflexive','{T}: You may pay {E}{E}. When you do, destroy target creature.'],
 ['Energy Death','When this creature dies, you may pay {E}{E}. When you do, this creature deals damage equal to its power to any target.'],
];
const M=fixtureEngine(rows);
async function cast(ctx,name){const source=put(M,ctx.game,ctx.a,name,'hand');ctx.a.pool.G=1;assert.equal(await ctx.game.castSpell(ctx.a,source,{from:'hand'}),true);await settle(ctx.game);return source;}
for(const role of ['human','ai']){
 test(`${role}: compound draw/loss/gain executes in order and keeps energy across turn reset`,async()=>{
  const ctx=context(M,role),events=[];const emit=ctx.game.emit;ctx.game.emit=async function(event,data,...args){events.push({event,data});return emit.call(this,event,data,...args);};await cast(ctx,'Energy Fast');assert.equal(ctx.a.hand.length,2);assert.equal(ctx.a.life,38);assert.equal(ctx.a.counters.energy,2);assert.equal(events.filter(r=>r.event==='energyGained').length,1);ctx.a.turnState=ctx.a.freshTurnState();assert.equal(ctx.a.counters.energy,2);
 });
 test(`${role}: tap source produces energy on the Stack; optional payment spends exactly two for one counter`,async()=>{
  const ctx=context(M,role),maker=put(M,ctx.game,ctx.a,'Energy Maker'),spender=put(M,ctx.game,ctx.a,'Energy Spender');assert.equal(await ctx.game.activateAbility(ctx.a,ctx.game.activatableList(ctx.a).find(r=>r.card===maker)),true);assert.equal(ctx.a.counters.energy||0,0);assert.equal(ctx.game.stack.length,1);await settle(ctx.game);assert.equal(ctx.a.counters.energy,2);ctx.a.pool.C=1;assert.equal(await ctx.game.activateAbility(ctx.a,ctx.game.activatableList(ctx.a).find(r=>r.card===spender)),true);assert.equal(ctx.a.counters.energy,2);await settle(ctx.game);assert.equal(ctx.a.counters.energy,0);assert.equal(ctx.a.turnState.energyPaid,2);assert.equal(ctx.a.turnState.energyLost,2);assert.equal(spender.counters['+1/+1'],1);
 });
 test(`${role}: an unaffordable optional energy payment has no prompt and no effect`,async()=>{
  const ctx=context(M,role),source=put(M,ctx.game,ctx.a,'Energy Spender');ctx.a.counters.energy=1;ctx.a.pool.C=1;assert.equal(await ctx.game.activateAbility(ctx.a,ctx.game.activatableList(ctx.a).find(r=>r.card===source)),true);await settle(ctx.game);assert.equal(ctx.a.counters.energy,1);assert.equal(source.counters['+1/+1']||0,0);assert.equal(ctx.trace.some(r=>r.q.prompt==='Pay 2 energy?'),false);
 });
 for(const before of [1,2])test(`${role}: mandatory payment with ${before} energy ${before===2?'pays without a choice':'takes exact return-and-gain fallback'}`,async()=>{
  const ctx=context(M,role);ctx.a.counters.energy=before;const source=await cast(ctx,'Energy Mandatory');assert.equal(source.zone,before===2?'battlefield':'hand');assert.equal(ctx.a.counters.energy,before===2?0:2);assert.equal(ctx.trace.some(r=>r.q.prompt==='Pay 2 energy?'),false);
 });
 test(`${role}: one gain of three energy creates one trigger and opponent gains create none`,async()=>{
  const ctx=context(M,role),observer=put(M,ctx.game,ctx.a,'Energy Observer');await cast(ctx,'Energy Sage');assert.equal(ctx.a.counters.energy,3);assert.equal(ctx.game.bf().reduce((n,c)=>n+(c.counters['+1/+1']||0),0),1);const before=ctx.game.bf().reduce((n,c)=>n+(c.counters['+1/+1']||0),0);await M.OracleV8Energy.gain(ctx.game,ctx.b,3,observer);await settle(ctx.game);assert.equal(ctx.game.bf().reduce((n,c)=>n+(c.counters['+1/+1']||0),0),before);assert.equal(ctx.b.counters.energy,3);
 });
 test(`${role}: during-your-turn gain trigger uses the turn player`,async()=>{
  const ctx=context(M,role),source=put(M,ctx.game,ctx.a,'Energy TurnObserver');await M.OracleV8Energy.gain(ctx.game,ctx.a,2,source);await ctx.game.flushTriggers();ctx.game.turnPlayer=ctx.b;await settle(ctx.game);assert.equal(source.power,3);await M.OracleV8Energy.gain(ctx.game,ctx.a,2,source);await settle(ctx.game);assert.equal(source.power,3);
 });
 test(`${role}: source-power and actual combat damage determine energy quantities`,async()=>{
  const ctx=context(M,role);await cast(ctx,'Energy Power');assert.equal(ctx.a.counters.energy,2);const source=put(M,ctx.game,ctx.a,'Energy Combat');source.attacking=ctx.b;source.blockedBy=[];ctx.game.combat={attackers:[source],player:ctx.a};await ctx.game.combatDamage(ctx.a,'normal');await settle(ctx.game);assert.equal(ctx.b.life,38);assert.equal(ctx.a.counters.energy,4);
 });
 test(`${role}: fixed activation cost requires the full amount and pays before resolving`,async()=>{
  const ctx=context(M,role),source=put(M,ctx.game,ctx.a,'Energy Cost');ctx.a.pool.C=1;ctx.a.counters.energy=1;assert.equal(ctx.game.activatableList(ctx.a).some(r=>r.card===source),false);ctx.a.counters.energy=2;const action=ctx.game.activatableList(ctx.a).find(r=>r.card===source);assert.ok(action);assert.equal(await ctx.game.activateAbility(ctx.a,action),true);assert.equal(source.tapped,true);assert.equal(ctx.a.pool.C,0);assert.equal(ctx.a.counters.energy,0);assert.equal(ctx.a.hand.length,0);await settle(ctx.game);assert.equal(ctx.a.hand.length,1);
 });
 test(`${role}: energy reflexive payment precedes its separate target choice and response window`,async()=>{
  const ctx=context(M,role),source=put(M,ctx.game,ctx.a,'Energy Reflexive'),victim=put(M,ctx.game,ctx.b,'Grizzly Bears');ctx.a.counters.energy=2;
  if(role==='human'){const decide=ctx.a.controller.decide;ctx.a.controller.decide=async(g,q)=>q.type==='chooseTargets'?[victim]:decide(g,q);}
  assert.equal(await ctx.game.activateAbility(ctx.a,ctx.game.activatableList(ctx.a).find(r=>r.card===source)),true);assert.equal(ctx.a.counters.energy,2);assert.equal(ctx.game.stack.at(-1).targets.length,0);assert.equal(ctx.trace.some(r=>r.q.type==='chooseTargets'),false);
  await ctx.game.resolveTop();await ctx.game.flushTriggers();assert.equal(ctx.a.counters.energy,0);const trigger=ctx.game.stack.at(-1);assert.ok(trigger.oracleReflexive);assert.equal(trigger.targets[0],victim);assert.equal(victim.zone,'battlefield');await ctx.game.counterStackObject(trigger);await settle(ctx.game);assert.equal(victim.zone,'battlefield');assert.equal(ctx.a.counters.energy,0);
 });
 test(`${role}: a paid reflexive trigger retains a dead source's power`,async()=>{
  const ctx=context(M,role),source=put(M,ctx.game,ctx.a,'Energy Death');ctx.a.counters.energy=2;source.counters['+1/+1']=2;ctx.game.recalc();assert.equal(source.power,4);
  if(role==='human'){const decide=ctx.a.controller.decide;ctx.a.controller.decide=async(g,q)=>q.type==='chooseTargets'?[ctx.b]:decide(g,q);}
  await ctx.game.sacrifice(ctx.a,source);await ctx.game.flushTriggers();await ctx.game.resolveTop();await ctx.game.flushTriggers();const trigger=ctx.game.stack.at(-1);assert.ok(trigger.oracleReflexive);assert.equal(ctx.a.counters.energy,0);assert.equal(source.zone,'graveyard');await settle(ctx.game);assert.equal(ctx.b.life,36);
 });
}
test('declining an affordable payment preserves energy; unless then sacrifices the source',async()=>{
 const ctx=context(M),source=put(M,ctx.game,ctx.a,'Energy Unless');ctx.a.counters.energy=2;const decide=ctx.a.controller.decide;ctx.a.controller.decide=async(g,q)=>q.prompt==='Pay 2 energy?'?'no':decide(g,q);await ctx.game.emit('endStep',{player:ctx.a});await settle(ctx.game);assert.equal(ctx.a.counters.energy,2);assert.equal(source.zone,'graveyard');
});
test('payment revalidates after the choice and never subtracts below zero',async()=>{
 const ctx=context(M),source=put(M,ctx.game,ctx.a,'Energy Spender');ctx.a.counters.energy=2;ctx.a.pool.C=1;const decide=ctx.a.controller.decide;ctx.a.controller.decide=async(g,q)=>{if(q.prompt==='Pay 2 energy?'){assert.equal(M.OracleV8Energy.spend(g,ctx.a,1,source),true);return 'yes';}return decide(g,q);};assert.equal(await ctx.game.activateAbility(ctx.a,ctx.game.activatableList(ctx.a).find(r=>r.card===source)),true);await settle(ctx.game);assert.equal(ctx.a.counters.energy,1);assert.equal(source.counters['+1/+1']||0,0);
});
test('two energy-cost mana sources cannot spend one energy twice in one payment plan',async()=>{
 const ctx=context(M),first=put(M,ctx.game,ctx.a,'Energy Mana'),second=put(M,ctx.game,ctx.a,'Energy Mana');ctx.a.counters.energy=1;assert.equal(ctx.game.canPayMana(ctx.a,M.parseCost('{G}{G}')),false);assert.equal(first.tapped,false);assert.equal(second.tapped,false);assert.equal(ctx.a.counters.energy,1);ctx.a.counters.energy=2;assert.equal(await ctx.game.payMana(ctx.a,M.parseCost('{G}{G}')),true);assert.equal(ctx.a.counters.energy,0);assert.equal(first.tapped,true);assert.equal(second.tapped,true);
});
test('energy scalar grammar is closed and state mutation rejects invalid quantities',async()=>{
 assert.equal(fixedAmount('{E}{E}{E}'),3);assert.equal(fixedAmount('six {E}'),6);assert.equal(fixedAmount('X {E}'),null);const ctx=context(M);for(const n of [-1,NaN,Infinity,1.5]){assert.throws(()=>M.OracleV8Energy.spend(ctx.game,ctx.a,n),/Invalid energy/);await assert.rejects(M.OracleV8Energy.gain(ctx.game,ctx.a,n),/Invalid energy/);}assert.equal(ctx.a.counters.energy||0,0);
 for(const text of ['You get {E}. Then explore forever.','You may pay any amount of {E}. If you do, draw a card.','You may pay {E}{E}. When you do, draw a card.','You get X {E}, where X is a number of your choice.'])assert.equal(extensionEffect({},text,{effect:()=>null}),null,text);
});
