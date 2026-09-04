import test from 'node:test';import assert from 'node:assert/strict';
import{fixtureEngine,context,put,settle}from'./helpers/oracle-v8-fixtures.mjs';
const M=fixtureEngine([
 ['Chosen Ward','{W}: The next time a source of your choice would deal damage to you this turn, prevent that damage.'],
 ['Chosen Red Ward','{W}: The next time a red source of your choice would deal damage to you this turn, prevent that damage.'],
 ['Chosen Global Ward','{W}: The next time a source of your choice would deal damage this turn, prevent that damage.'],
 ['Chosen Half Ward','{W}: The next time a source of your choice would deal damage to you this turn, prevent half that damage, rounded down.'],
 ['Chosen Life Ward','{W}: The next time a source of your choice would deal damage to you this turn, prevent that damage. You gain life equal to the damage prevented this way.'],
 ['Chosen Exile Ward','{W}: The next time a source of your choice would deal damage to you this turn, prevent that damage. Exile cards from the top of your library equal to the damage prevented this way.'],
 ['Departed Bomber','{R}, Sacrifice this creature: This creature deals 3 damage to target opponent.'],
 ['Red Threat','','Creature — Giant','{R}'],
]);
async function activate(ctx,name='Chosen Ward'){
 const source=put(M,ctx.game,ctx.a,name);ctx.a.pool.W+=1;
 const ability=ctx.game.activatableList(ctx.a).find(row=>row.card===source);assert.ok(ability);
 assert.equal(await ctx.game.activateAbility(ctx.a,ability),true);await settle(ctx.game);
 const shield=ctx.game.untilEffects.find(row=>row.kind==='oracleChosenSourcePrevention'&&row.sourceCard===source);assert.ok(shield);return shield;
}
for(const role of ['human','ai']){
 test(`${role}: chosen source shield ignores other sources and later events`,async()=>{
  const ctx=context(M,role),{game,a,b}=ctx,threat=put(M,game,b,'Red Threat');const shield=await activate(ctx);assert.equal(shield.sourceRecord.card,threat);
  const other=put(M,game,b,'Grizzly Bears');assert.equal(await game.damagePlayer(other,a,2),2);assert.equal(shield.consumed,false);
  assert.equal(await game.damagePlayer(threat,a,3),0);assert.equal(shield.consumed,true);assert.equal(await game.damagePlayer(threat,a,2),2);
 });
 test(`${role}: color is rechecked and a nonmatching event leaves shield available`,async()=>{
  const ctx=context(M,role),{game,a,b}=ctx,threat=put(M,game,b,'Red Threat'),shield=await activate(ctx,'Chosen Red Ward');
  threat.def={...threat.def,colorsOverride:['U']};game.recalc();assert.equal(await game.damagePlayer(threat,a,3),3);assert.equal(shield.consumed,false);
  threat.def={...threat.def,colorsOverride:['R']};game.recalc();assert.equal(await game.damagePlayer(threat,a,3),0);
 });
 test(`${role}: forbidden prevention and rounded-zero prevention do not consume a shield`,async()=>{
  const ctx=context(M,role),{game,a,b}=ctx,threat=put(M,game,b,'Red Threat'),shield=await activate(ctx,'Chosen Half Ward');
  assert.equal(await game.damagePlayer(threat,a,1),1);assert.equal(shield.consumed,false);
  const lock=put(M,game,a,'Grizzly Bears');lock.def={...lock.def,damageCantBePrevented:true};
  assert.equal(await game.damagePlayer(threat,a,5),5);assert.equal(shield.consumed,false);await game.move(lock,'graveyard');
  assert.equal(await game.damagePlayer(threat,a,5),3);assert.equal(shield.consumed,true);
 });
 test(`${role}: source incarnation survives control changes but not blink`,async()=>{
  const ctx=context(M,role),{game,a,b}=ctx,threat=put(M,game,b,'Red Threat'),shield=await activate(ctx);
  M.OracleV8Control.gain(game,threat,a);game.recalc();assert.equal(M.OracleV8SourcePrevention.applies(game,shield,{src:threat,target:a,n:3}),true);
  await game.move(threat,'exile');await game.move(threat,'battlefield',{ctrl:b});assert.equal(await game.damagePlayer(threat,a,3),3);assert.equal(shield.consumed,false);
 });
 test(`${role}: a whole simultaneous event is prevented for every recipient`,async()=>{
  const ctx=context(M,role),{game,a,b}=ctx,threat=put(M,game,b,'Red Threat'),shield=await activate(ctx,'Chosen Global Ward');
  const before=[a.life,b.life];assert.equal(await game.damageBatch([{src:threat,target:a,n:3},{src:threat,target:b,n:2}]),0);
  assert.deepEqual([a.life,b.life],before);assert.equal(shield.consumed,true);assert.equal(await game.damagePlayer(threat,a,1),1);
 });
 test(`${role}: gain and exile riders use the damage actually prevented`,async()=>{
  for(const name of ['Chosen Life Ward','Chosen Exile Ward']){
   const ctx=context(M,role),{game,a,b}=ctx,threat=put(M,game,b,'Red Threat');await activate(ctx,name);
   const before=a.life,top=a.library.slice(-3);assert.equal(await game.damagePlayer(threat,a,3),0);
   if(name==='Chosen Life Ward')assert.equal(a.life,before+3);else for(const card of top)assert.equal(card.zone,'exile');
  }
 });
 test(`${role}: a selected permanent spell is still the source after it resolves`,async()=>{
  const ctx=context(M,role),{game,a,b}=ctx,threat=put(M,game,b,'Red Threat','hand');b.pool.R=1;game.turnPlayer=b;
  assert.equal(await game.castSpell(b,threat,{from:'hand'}),true);
  const shield=await activate(ctx,'Chosen Red Ward');assert.equal(shield.sourceRecord.card,threat);assert.equal(shield.sourceRecord.spell,true);assert.equal(threat.zone,'battlefield');
  assert.equal(await game.damagePlayer(threat,a,3),0);await game.move(threat,'exile');await game.move(threat,'battlefield',{ctrl:b});assert.equal(await game.damagePlayer(threat,a,1),1);
 });
 test(`${role}: a departed source referred to by a pending ability is available and protected`,async()=>{
  const ctx=context(M,role),{game,a,b}=ctx,bomber=put(M,game,b,'Departed Bomber');b.pool.R=1;
  const ability=game.activatableList(b).find(row=>row.card===bomber);assert.equal(await game.activateAbility(b,ability),true);assert.equal(bomber.zone,'graveyard');
  const shield=await activate(ctx);assert.equal(shield.sourceRecord.card,bomber);assert.equal(a.life,40,'pending damage from old source is prevented');
 });
}
test('source choices enumerate only public eligible objects, including command objects and pending references',()=>{
 const{game,a,b}=context(M),live=put(M,game,b,'Red Threat'),hidden=put(M,game,b,'Red Threat','hand'),unreferenced=put(M,game,b,'Red Threat','graveyard'),command=put(M,game,b,'Red Threat','command');
 const rows=M.OracleV8SourcePrevention.candidates(game);assert.ok(rows.some(row=>row.card===live));assert.ok(rows.some(row=>row.card===command));assert.ok(!rows.some(row=>row.card===hidden||row.card===unreferenced));
 game.delayed.push({src:unreferenced,on:'upkeep'});assert.ok(M.OracleV8SourcePrevention.candidates(game).some(row=>row.card===unreferenced));
});
