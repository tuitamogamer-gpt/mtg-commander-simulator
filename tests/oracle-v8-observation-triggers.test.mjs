import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureEngine,context,put,settle}from'./helpers/oracle-v8-fixtures.mjs';
const M=fixtureEngine([
 ['Surveil Observer','Whenever you surveil, put a +1/+1 counter on this creature.'],
 ['First Surveil','Whenever you surveil for the first time each turn, put a +1/+1 counter on this creature.'],
 ['First Gain','Whenever you gain life for the first time each turn, put a +1/+1 counter on this creature.'],
 ['First Loss','Whenever you lose life for the first time each turn, put a +1/+1 counter on this creature.'],
 ['Life Observer','Whenever you gain or lose life during your turn, put a +1/+1 counter on this creature.'],
 ['Explore Observer','Whenever a creature you control explores, you gain 2 life.'],
 ['Explore Land','Whenever a creature you control explores a land card, put a +1/+1 counter on this creature.'],
 ['Explore Nonland','Whenever a creature you control explores a nonland card, put a +1/+1 counter on this creature.'],
 ['Main Observer','At the beginning of your second main phase, if this creature is tapped, you gain 2 life.'],
 ['Glimmer Observer','At the beginning of your second main phase, if this creature is tapped, draw a card if you control a Glimmer creature. If you don\'t control a Glimmer creature, create a 1/1 white Glimmer enchantment creature token.'],
 ['Glimmer Body','','Creature — Glimmer'],
]);
const counters=card=>card.counters['+1/+1']||0;
async function explore(ctx,name){const card=put(M,ctx.game,ctx.a,'Merfolk Branchwalker','hand');ctx.a.pool.G++;ctx.a.pool.C++;assert.equal(await ctx.game.castSpell(ctx.a,card,{from:'hand'}),true);await settle(ctx.game);return card;}
for(const role of ['human','ai']){
 for(const present of [false,true])test(`${role}: complementary Glimmer clauses choose the ${present?'draw':'create'} instruction`,async()=>{
  const {game,a}=context(M,role),source=put(M,game,a,'Glimmer Observer');if(present)put(M,game,a,'Glimmer Body');source.tapped=true;const hand=a.hand.length;a.turnState.mainPhaseCount=1;
  await game.emitMainPhase(a);await settle(game);assert.equal(a.hand.length,hand+(present?1:0));assert.equal(game.bf().filter(card=>card.isToken&&card.hasSub('Glimmer')).length,present?0:1);
 });
 test(`${role}: surveil completes before triggering and empty library still counts`,async()=>{
  const {game,a,b}=context(M,role),source=put(M,game,a,'Surveil Observer');a.library=[];
  await M.E.surveil(game,a,0);assert.equal(game.pendingTriggers.length,0);
  await M.E.surveil(game,a,1);assert.equal(game.pendingTriggers.length,1);await settle(game);assert.equal(counters(source),1);
  await M.E.surveil(game,b,1);await settle(game);assert.equal(counters(source),1);
 });
 test(`${role}: first surveil follows player turn history before the source enters`,async()=>{
  const {game,a}=context(M,role);await M.E.surveil(game,a,1);const source=put(M,game,a,'First Surveil');await M.E.surveil(game,a,1);await settle(game);assert.equal(counters(source),0);
  game.turnNo++;delete a.turnState.surveilEvents;await M.E.surveil(game,a,1);await M.E.surveil(game,a,1);await settle(game);assert.equal(counters(source),1);
 });
 test(`${role}: first life events and your-turn condition use actual player events`,async()=>{
  const {game,a,b}=context(M,role),gain=put(M,game,a,'First Gain'),loss=put(M,game,a,'First Loss'),both=put(M,game,a,'Life Observer');
  await game.gainLife(a,1);await game.gainLife(a,2);await game.loseLife(a,1);await game.loseLife(a,2);await settle(game);assert.deepEqual([counters(gain),counters(loss),counters(both)],[1,1,4]);
  game.turnPlayer=b;await game.gainLife(a,1);await settle(game);assert.equal(counters(both),4);
 });
 for(const kind of ['land','nonland','empty'])test(`${role}: exploration ${kind} distinguishes revealed card from the empty-library branch`,async()=>{
  const ctx=context(M,role),{game,a}=ctx;const all=put(M,game,a,'Explore Observer'),land=put(M,game,a,'Explore Land'),nonland=put(M,game,a,'Explore Nonland'),life=a.life;
  if(kind==='empty')a.library=[];else put(M,game,a,kind==='land'?'Forest':'Lightning Bolt','library');
  await explore(ctx);assert.equal(a.life,life+2);assert.equal(counters(land),kind==='land'?1:0);assert.equal(counters(nonland),kind==='nonland'?1:0);assert.equal(all.zone,'battlefield');
 });
 test(`${role}: Survival uses the second main phase even when it is additional`,async()=>{
  const {game,a}=context(M,role),source=put(M,game,a,'Main Observer'),life=a.life;source.tapped=true;
  await game.emitMainPhase(a,{precombat:true});assert.equal(game.pendingTriggers.length,0);
  game.mainPhase=async()=>{};game.scheduleAdditionalPhases(['main']);await game.runAdditionalPhases(a);await settle(game);assert.equal(a.life,life+2);
  await game.emitMainPhase(a);await settle(game);assert.equal(a.life,life+2);assert.equal(a.turnState.mainPhaseCount,3);
 });
 test(`${role}: Survival checks tapped state both when triggering and resolving`,async()=>{
  const {game,a}=context(M,role),source=put(M,game,a,'Main Observer'),life=a.life;a.turnState.mainPhaseCount=1;
  await game.emitMainPhase(a);assert.equal(game.pendingTriggers.length,0);
  a.turnState.mainPhaseCount=1;source.tapped=true;await game.emitMainPhase(a);await game.flushTriggers();source.tapped=false;await settle(game);assert.equal(a.life,life);
 });
}
