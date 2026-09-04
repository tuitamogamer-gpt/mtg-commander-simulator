import test from'node:test';import assert from'node:assert/strict';
import{fixtureEngine,context,put,settle,paidCast}from'./helpers/oracle-v8-fixtures.mjs';
const M=fixtureEngine([
 ['Coin Win','Whenever you win a coin flip, you gain 2 life.'],
 ['Coin Lose','Whenever a player loses a coin flip, you gain 1 life.'],
 ['Coin Spell','Flip a coin. If you win the flip, draw two cards. If you lose the flip, you lose 3 life.','Instant'],
 ['Coin Repeat Entry','When this creature enters, flip a coin until you lose a flip. Put a +1/+1 counter on this creature for each flip you won.'],
 ['Coin Bare','{1}: Flip a coin.'],
]);
for(const role of['human','ai']){
 test(`${role}: a real flip has a declared call and exactly one win or loss trigger`,async()=>{
  const {game,a,b}=context(M,role),win=put(M,game,a,'Coin Win'),lose=put(M,game,a,'Coin Lose');game.rnd=()=>0;
  const result=await game.flipCoin(a);assert.equal(result.heads,true);assert.ok(['heads','tails'].includes(result.call));assert.equal(result.won,result.call==='heads');
  assert.equal(game.pendingTriggers.filter(t=>t.src===win).length,Number(result.won));assert.equal(game.pendingTriggers.filter(t=>t.src===lose).length,Number(!result.won));await settle(game);
  const life=a.life;await game.flipCoin(b,{headsOnly:true});await settle(game);assert.equal(a.life,life);
 });
 for(const heads of[true,false])test(`${role}: resolving a cast branches only after the random outcome (${heads})`,async()=>{
  const ctx=context(M,role),{game,a}=ctx,controller=a.controller,decide=controller.decide.bind(controller);controller.decide=async(g,q)=>q.aiHint?.kind==='coinCall'?'heads':decide(g,q);game.rnd=()=>heads?0:0.9;
  const hand=a.hand.length,life=a.life;await paidCast(M,ctx,'Coin Spell');assert.equal(a.hand.length,hand+(heads?2:0));assert.equal(a.life,life-(heads?0:3));
 });
 test(`${role}: repeating flips stops on the first loss and counts only wins`,async()=>{
  const ctx=context(M,role),{game,a}=ctx,decide=a.controller.decide.bind(a.controller);a.controller.decide=async(g,q)=>q.aiHint?.kind==='coinCall'?'heads':decide(g,q);let draws=0;game.rnd=()=>[0,0,0.9][draws++]??0.9;
  const creature=await paidCast(M,ctx,'Coin Repeat Entry');assert.equal(draws,3);assert.equal(creature.counters['+1/+1'],2);
 });
 test(`${role}: an activated bare flip uses the Stack and emits a result for other cards`,async()=>{
  const {game,a}=context(M,role),source=put(M,game,a,'Coin Bare'),watch=put(M,game,a,'Coin Win');a.pool.C=1;const ability=game.activatableList(a).find(row=>row.card===source);assert.ok(ability);const before=a.life;
  const decide=a.controller.decide.bind(a.controller);a.controller.decide=async(g,q)=>q.aiHint?.kind==='coinCall'?'heads':decide(g,q);game.rnd=()=>0;
  assert.equal(await game.activateAbility(a,ability),true);assert.equal(a.life,before);await settle(game);assert.equal(a.life,before+2);
 });
}
