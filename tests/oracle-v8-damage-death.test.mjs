import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync}from'node:fs';
import {semanticClass}from'../scripts/import-oracle-batch.mjs';
import {loadEngine}from'./helpers/load-engine.mjs';
import {context,put,settle}from'./helpers/oracle-v8-fixtures.mjs';
const M=loadEngine(),inputs=JSON.parse(readFileSync(new URL('./fixtures/oracle-damage-death.json',import.meta.url)));
const cards=inputs.map((c,i)=>{const semantic=semanticClass(c,{compilerVersion:8});assert.ok(semantic.semanticClass,c.name+': '+semantic.reason);const [type,subtypes='']=c.type_line.split(' — '),words=type.split(' ');return{position:i+1,oracleId:c.oracle_id,scryfallId:c.id,...semantic,raw:{name:c.name,cost:c.mana_cost,oracle:c.oracle_text,types:words.filter(word=>word!=='Legendary'),super:words.includes('Legendary')?['Legendary']:[],subtypes:subtypes.split(' ').filter(Boolean),power:c.power,toughness:c.toughness,_ci:c.color_identity},catalog:{typeLine:c.type_line,commanderLegality:'legal'}};});
const missing=cards.filter(c=>!M.DEFS[c.raw.name]);if(missing.length){M.registerOracleBatch({id:'oracle-damage-death-test',sequence:9997,cards:missing});M.initData(M.RAW_DATA);}
async function cast(f,name){const card=put(M,f.game,f.a,name,'hand');for(const c of ['W','U','B','R','G','C'])f.a.pool[c]=20;assert.equal(await f.game.castSpell(f.a,card,{from:'hand'}),true,name+': actual paid source');await settle(f.game);return card;}
async function setup(role,name='Sengir Vampire'){const f=context(M,role);f.source=await cast(f,name);return f;}
const counters=c=>c.counters['+1/+1']||0;
async function blink(g,c){await g.move(c,'exile');await g.move(c,'battlefield');}
async function nextUpkeep(game,a){const emit=game.emit,stop=new Error('next upkeep');game.turnPlayer=a;game.emit=async function(event,data){if(event==='upkeep')throw stop;return emit.call(this,event,data);};try{await assert.rejects(game.runTurn(),error=>error===stop);}finally{game.emit=emit;}}
function choose(f,target){if(f.a.isAI)return;const prior=f.a.controller.decide.bind(f.a.controller);f.a.controller.decide=async(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(target)?[target]:prior(g,q);}

test('historical-damage grammar compiles twelve pinned complete cards and rejects unsupported historical clauses',()=>{
 assert.equal(cards.length,12);
 const base=inputs.find(c=>c.name==='Sengir Vampire');
 for(const oracle_text of ['Whenever a creature dealt damage by this creature last turn dies, put a +1/+1 counter on this creature.','Whenever a creature dealt damage by a red creature this turn dies, put a +1/+1 counter on this creature.','Whenever a creature dealt combat damage by this creature this turn dies, put a +1/+1 counter on this creature.'])assert.equal(semanticClass({...base,oracle_text},{compilerVersion:8}).semanticClass,undefined);
 assert.throws(()=>M.oracleV8TriggerFilter('etb',{kind:'v8-event',damageByThisTurn:'self'},()=>{},()=>{}));
});
for(const role of ['human','ai']){
 test(`${role}: real paid Blood Cultist activation records damage and later death triggers exactly once`,async()=>{
  const f=await setup(role,'Blood Cultist'),{game,a,b,source}=f;await nextUpkeep(game,a);game.phase='main1';
  const victim=put(M,game,b,'Shivan Dragon');choose(f,victim);const ability=game.activatableList(a).find(row=>row.card===source&&row.ability);assert.ok(ability);
  assert.equal(await game.activateAbility(a,ability),true);assert.equal(source.tapped,true);await settle(game);assert.equal(victim.damage,1);
  await game.damageCreature(source,victim,1);await game.destroy(victim);await settle(game);assert.equal(counters(source),1,'two damage events produce one later death trigger');
 });
 test(`${role}: source or victim blink breaks historical incarnation links`,async()=>{
  for(const which of ['source','victim']){const f=await setup(role),{game,b,source}=f,victim=put(M,game,b,'Shivan Dragon');await game.damageCreature(source,victim,1);await blink(game,which==='source'?source:victim);await game.destroy(victim);await settle(game);assert.equal(counters(source),0,which+' is a new object');}
 });
 test(`${role}: another source, prevented damage and previous-turn damage do not satisfy the trigger`,async()=>{
  for(const kind of ['other','prevented','previous']){const f=await setup(role),{game,a,b,source}=f,victim=put(M,game,b,kind==='prevented'?'Cho-Manno, Revolutionary':'Shivan Dragon');
   const amount=await game.damageCreature(kind==='other'?put(M,game,b,'Grizzly Bears'):source,victim,1);assert.equal(amount,kind==='prevented'?0:1);
   if(kind==='previous')await nextUpkeep(game,a);await game.destroy(victim);await settle(game);assert.equal(counters(source),0,kind);}
 });
 test(`${role}: damage history follows the source across control change but not across a later blink`,async()=>{
  const f=await setup(role),{game,b,source}=f,victim=put(M,game,b,'Shivan Dragon');await game.damageCreature(source,victim,1);source.ctrl=b;game.recalc();await game.destroy(victim);await settle(game);assert.equal(counters(source),1);
 });
 test(`${role}: delayed activation damage is credited to its departed source incarnation`,async()=>{
  const f=await setup(role,'Blood Cultist'),{game,a,b,source}=f;await nextUpkeep(game,a);game.phase='main1';const victim=put(M,game,b,'Shivan Dragon');choose(f,victim);
  const ability=game.activatableList(a).find(row=>row.card===source&&row.ability);assert.equal(await game.activateAbility(a,ability),true);await blink(game,source);await settle(game);assert.equal(victim.damage,1);await game.destroy(victim);await settle(game);assert.equal(counters(source),0);
 });
 test(`${role}: simultaneous source and victim deaths use damage history and victim last-known toughness`,async()=>{
  const f=await setup(role,'Abattoir Ghoul'),{game,a,b,source}=f,victim=put(M,game,b,'Shivan Dragon'),life=a.life;
  await game.damageBatch([{src:source,target:victim,n:5},{src:victim,target:source,n:5}]);await settle(game);
  assert.equal(source.zone,'graveyard');assert.equal(victim.zone,'graveyard');assert.equal(a.life,life+5);
 });
 test(`${role}: Soul Collector returns the precise graveyard card even when the Collector dies simultaneously`,async()=>{
  const f=await setup(role,'Soul Collector'),{game,a,b,source}=f,victim=put(M,game,b,'Shivan Dragon');
  await game.damageBatch([{src:source,target:victim,n:5},{src:victim,target:source,n:5}]);await settle(game);
  assert.equal(source.zone,'graveyard');assert.equal(victim.zone,'battlefield');assert.equal(victim.ctrl,a);assert.equal(victim.owner,b);
 });
 test(`${role}: Wight creates its tapped token even if the dead card changed zones before the exile resolves`,async()=>{
  const f=await setup(role,'Wight'),{game,a,b,source}=f,victim=put(M,game,b,'Shivan Dragon');await game.damageCreature(source,victim,1);await game.destroy(victim);await game.flushTriggers();await game.move(victim,'exile');await game.move(victim,'graveyard');await settle(game);
  const tokens=game.creatures(a).filter(card=>card.isToken&&card.hasSub('Zombie'));assert.equal(tokens.length,1);assert.equal(tokens[0].tapped,true);assert.equal(victim.zone,'graveyard');
 });
 test(`${role}: damage before gaining Vampiric Sliver's ability is retained for the same creature`,async()=>{
  const f=context(M,role),{game,a,b}=f,damager=put(M,game,a,'Predatory Sliver'),victim=put(M,game,b,'Shivan Dragon');await game.damageCreature(damager,victim,1);const grant=await cast(f,'Vampiric Sliver');await game.destroy(victim);await settle(game);assert.equal(counters(damager),1);assert.equal(counters(grant),0);
 });
}
