import test from'node:test';import assert from'node:assert/strict';
import{semanticClass}from'../scripts/import-oracle-batch.mjs';
import{fixtureEngine,context,put,settle,paidCast}from'./helpers/oracle-v8-fixtures.mjs';
const M=fixtureEngine([
 ['Death Watch','Whenever a creature dies this turn, you gain 2 life.','Instant'],
 ['Cast Watch','Until end of turn, whenever you cast a creature spell, draw a card.','Instant'],
 ['Entry Watch','Whenever a creature you control enters this turn, put a +1/+1 counter on it and it gains haste until end of turn.','Instant'],
 ['Next Watch','When you next cast a creature spell this turn, you gain 2 life.','Instant'],
 ['Owned Watch','{1}: Whenever a creature dies this turn, you gain 2 life.'],
 ['Watch Body',''],
 ['Block Watch','Destroy target creature or planeswalker.\nWhenever a creature blocks this turn, its controller loses 1 life.','Sorcery'],
 ['Paragraph Watch','Whenever a creature you control enters this turn, put a +1/+1 counter on it and it gains haste until end of turn.\nLearn.','Instant'],
]);
for(const role of ['human','ai']){
 test(`${role}: a resolved spell leaves a repeatable future trigger with real Stack and expiry`,async()=>{
  const ctx=context(M,role),{game,a,b}=ctx,source=await paidCast(M,ctx,'Death Watch'),life=a.life;assert.equal(source.zone,'graveyard');
  for(let n=0;n<2;n++){const creature=put(M,game,b,'Watch Body');await game.destroy(creature);assert.equal(game.pendingTriggers.length,1);assert.equal(a.life,life+2*n);await game.flushTriggers();assert.equal(game.stack.at(-1).kind,'trigger');await settle(game);assert.equal(a.life,life+2*(n+1));}
  game.mainPhase=async()=>{};game.combatPhase=async()=>{};await game.runTurn();assert.equal(game.delayed.length,0);await game.destroy(put(M,game,b,'Watch Body'));await settle(game);assert.equal(a.life,life+4);
 });
 test(`${role}: cast event requires the actual controller and next trigger is consumed once`,async()=>{
  const ctx=context(M,role),{game,a,b}=ctx;await paidCast(M,ctx,'Next Watch');const life=a.life;const other=put(M,game,b,'Watch Body','hand');b.pool.G=1;game.turnPlayer=b;assert.equal(await game.castSpell(b,other,{from:'hand'}),true);await settle(game);assert.equal(a.life,life);game.turnPlayer=a;
  await paidCast(M,ctx,'Watch Body');assert.equal(a.life,life+2);await paidCast(M,ctx,'Watch Body');assert.equal(a.life,life+2);assert.equal(game.delayed.length,0);
 });
 test(`${role}: event-card references bind the future creature, even after the spell source leaves`,async()=>{
  const ctx=context(M,role),{game,a,b}=ctx;await paidCast(M,ctx,'Entry Watch');const other=put(M,game,b,'Watch Body','hand');await game.putPermanentOntoBattlefield(other,b);await settle(game);assert.equal(other.counters['+1/+1']||0,0);
  const own=await paidCast(M,ctx,'Watch Body');assert.equal(own.counters['+1/+1'],1);assert.equal(own.kw('haste'),true);
 });
 test(`${role}: changing the permanent source controller never transfers a delayed trigger`,async()=>{
  const ctx=context(M,role),{game,a,b}=ctx,source=put(M,game,a,'Owned Watch');a.pool.C=1;const ability=game.activatableList(a).find(row=>row.card===source&&row.ability);assert.equal(await game.activateAbility(a,ability),true);await settle(game);const life=a.life,otherLife=b.life;
  M.OracleV8Control.gain(game,source,b);game.recalc();await game.destroy(put(M,game,b,'Watch Body'));await settle(game);assert.equal(a.life,life+2);assert.equal(b.life,otherLife);
 });
 test(`${role}: a delayed cast trigger sees real cast metadata and draws only on resolution`,async()=>{
  const ctx=context(M,role),{game,a}=ctx;await paidCast(M,ctx,'Cast Watch');const source=put(M,game,a,'Watch Body','hand'),before=a.hand.length;a.pool.G=1;assert.equal(await game.castSpell(a,source,{from:'hand'}),true);assert.equal(a.hand.length,before-1);assert.ok(game.pendingTriggers.length||game.stack.some(row=>row.kind==='trigger'));await settle(game);assert.equal(a.hand.length,before);
 });
 test(`${role}: a future blocker controller never binds to the preceding spell target`,async()=>{
  const ctx=context(M,role,2),{game,a,b,others}=ctx,target=put(M,game,b,'Watch Body');
  await paidCast(M,ctx,'Block Watch');assert.equal(target.zone,'graveyard');
  const blocker=put(M,game,others[1],'Watch Body'),attacker=put(M,game,a,'Watch Body'),before=others[1].life,otherBefore=b.life;
  await game.emit('blocks',{blocker,attacker});assert.equal(others[1].life,before);await settle(game);
  assert.equal(others[1].life,before-1);assert.equal(b.life,otherBefore);
 });
}
test('a later printed paragraph resolves now and is not swallowed by the future trigger',()=>{
 const operations=semanticClass({name:'Paragraph Watch',type_line:'Instant',layout:'normal',mana_cost:'{R}',oracle_text:'Whenever a creature you control enters this turn, put a +1/+1 counter on it and it gains haste until end of turn.\nLearn.'}).implementation;
 const effects=operations.find(row=>row.kind==='spell-generic').effects;
 assert.equal(effects[0].action,'install-trigger-v8');assert.equal(effects[1].action,'learn');
 assert.deepEqual([...effects[0].trigger.effects.map(row=>row.action)],['counter','pump']);
});
