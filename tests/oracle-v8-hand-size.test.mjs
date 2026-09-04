import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureEngine,context,put,settle,paidCast} from './helpers/oracle-v8-fixtures.mjs';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';

const M=fixtureEngine([
 ['Hand Study Scholar','Your maximum hand size is increased by two.'],
 ['Hand Study Eater','Your maximum hand size is reduced by four.'],
 ['Hand Study Miser',"Each opponent's maximum hand size is reduced by three."],
 ['Hand Study Augur',"Each opponent's maximum hand size is reduced by seven."],
 ['Hand Study All','Players have no maximum hand size.','Artifact'],
 ['Hand Study Forever','You have no maximum hand size for the rest of the game.','Sorcery'],
 ['Hand Study Draw Forever','Draw two cards. You have no maximum hand size for the rest of the game.','Sorcery'],
 ['Hand Study Blank','Target creature loses all abilities until end of turn.','Instant'],
]);
async function cleanup(ctx,player=ctx.a){ctx.game.turnPlayer=player;ctx.game.mainPhase=async()=>{};ctx.game.combatPhase=async()=>{};ctx.game.priorityRound=async()=>settle(ctx.game);await ctx.game.runTurn();}
for(const role of ['human','ai']){
 test(`${role}: additive hand-size rules stack and actual cleanup discards the exact excess`,async()=>{
  const ctx=context(M,role),scholar=await paidCast(M,ctx,'Hand Study Scholar');
  put(M,ctx.game,ctx.a,'Hand Study Eater');put(M,ctx.game,ctx.b,'Hand Study Miser');
  assert.equal(ctx.game.maximumHandSize(ctx.a),2);assert.equal(ctx.game.maximumHandSize(ctx.b),7);
  for(let i=0;i<12;i++)put(M,ctx.game,ctx.a,'Forest','hand');
  await cleanup(ctx);assert.equal(ctx.a.hand.length,2);assert.equal(ctx.a.graveyard.length,11);
  assert.ok(ctx.trace.some(row=>row.q.aiHint?.kind==='cleanupDiscard'&&row.q.min===11));
  await ctx.game.move(scholar,'exile');assert.equal(ctx.game.maximumHandSize(ctx.a),0);
 });
 test(`${role}: repeated opposing reductions clamp at zero and do not reduce their controller`,async()=>{
  const ctx=context(M,role);put(M,ctx.game,ctx.b,'Hand Study Augur');put(M,ctx.game,ctx.b,'Hand Study Miser');
  for(let i=0;i<5;i++)put(M,ctx.game,ctx.a,'Forest','hand');
  assert.equal(ctx.game.maximumHandSize(ctx.a),0);assert.equal(ctx.game.maximumHandSize(ctx.b),7);
  await cleanup(ctx);assert.equal(ctx.a.hand.length,0);assert.equal(ctx.a.graveyard.length,6);
 });
 test(`${role}: unlimited wins over additive reductions for both players and ends with its source`,async()=>{
  const ctx=context(M,role);put(M,ctx.game,ctx.b,'Hand Study Augur');const source=await paidCast(M,ctx,'Hand Study All');
  for(let i=0;i<12;i++)put(M,ctx.game,ctx.a,'Forest','hand');
  assert.equal(ctx.game.maximumHandSize(ctx.a),Infinity);assert.equal(ctx.game.maximumHandSize(ctx.b),Infinity);
  await cleanup(ctx);assert.equal(ctx.a.hand.length,13);assert.equal(ctx.a.graveyard.length,0);
  await ctx.game.move(source,'exile');assert.equal(ctx.game.maximumHandSize(ctx.a),0);assert.equal(ctx.game.maximumHandSize(ctx.b),7);
 });
 test(`${role}: an actual ability-removal spell suppresses a hand-size static through cleanup`,async()=>{
  const ctx=context(M,role),source=await paidCast(M,ctx,'Hand Study Scholar');
  await paidCast(M,ctx,'Hand Study Blank');assert.equal(source.cur.abilitiesDisabled,true);assert.equal(ctx.game.maximumHandSize(ctx.a),7);
  for(let i=0;i<12;i++)put(M,ctx.game,ctx.a,'Forest','hand');
  await cleanup(ctx);assert.equal(ctx.a.hand.length,7);assert.equal(ctx.game.maximumHandSize(ctx.a),9);assert.equal(source.cur.abilitiesDisabled,false);
 });
 test(`${role}: resolved permanent hand-limit permission survives source movement and later turns`,async()=>{
  const ctx=context(M,role),source=await paidCast(M,ctx,'Hand Study Draw Forever');
  assert.equal(ctx.a.hand.length,2);assert.equal(ctx.a.noMaxHandForever,true);assert.equal(ctx.b.noMaxHandForever,undefined);
  await ctx.game.move(source,'exile');put(M,ctx.game,ctx.b,'Hand Study Augur');
  for(let i=0;i<10;i++)put(M,ctx.game,ctx.a,'Forest','hand');
  await cleanup(ctx);await cleanup(ctx);assert.equal(ctx.a.hand.length,14);assert.equal(ctx.game.maximumHandSize(ctx.a),Infinity);
 });
 test(`${role}: countering the permanent permission leaves normal cleanup intact`,async()=>{
  const ctx=context(M,role),source=put(M,ctx.game,ctx.a,'Hand Study Forever','hand');ctx.a.pool.G=1;
  assert.equal(await ctx.game.castSpell(ctx.a,source,{from:'hand'}),true);assert.equal(ctx.a.noMaxHandForever,undefined);
  await ctx.game.counterStackObject(ctx.game.stack.find(row=>row.card===source));await settle(ctx.game);
  assert.equal(ctx.game.maximumHandSize(ctx.a),7);assert.equal(ctx.a.noMaxHandForever,undefined);
 });
}
test('hand-size compiler keeps finite settings, conditional rules, unsupported tails and durations closed',()=>{
 for(const oracle of ['Your maximum hand size is five.','Your maximum hand size is increased by two. You win the game.','If you control an Island, your maximum hand size is increased by two.','You have no maximum hand size until your next turn.','Players have no maximum hand size. Spells cost {2} less to cast.']){
  assert.equal(semanticClass({name:'Hand Boundary',type_line:'Enchantment',mana_cost:'{G}',oracle_text:oracle,layout:'normal'}).semanticClass,undefined,oracle);
 }
});
