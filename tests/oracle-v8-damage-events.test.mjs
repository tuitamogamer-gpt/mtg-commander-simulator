import test from'node:test';import assert from'node:assert/strict';
import{fixtureEngine,context,put,settle,paidCast}from'./helpers/oracle-v8-fixtures.mjs';
const M=fixtureEngine([
 ['Source Watch','Whenever a noncreature source you control deals damage, you gain that much life.'],
 ['Body Watch','Whenever a creature you control is dealt damage, put a +1/+1 counter on it.'],
 ['Aura Watch','Enchant creature\nWhenever enchanted creature deals damage, you gain that much life.','Enchantment — Aura'],
 ['Any Watch','Whenever a creature you control deals combat damage, you gain that much life.'],
 ['Recipient Watch','Whenever a creature you control deals combat damage to a creature, you gain that much life.'],
 ['Reflect Watch','Whenever a creature is dealt damage, this enchantment deals that much damage to that creature\'s controller.','Enchantment'],
 ['Source Spell','Source Spell deals 1 damage to each creature.','Instant'],
 ['Spell Watch','Whenever an instant or sorcery spell you control deals damage, you gain that much life.'],
 ['Modified Watch','Whenever a modified creature you control deals combat damage to a player, draw a card.'],
 ['Reflection Body','Whenever a creature deals damage to this creature, this creature deals that much damage to that creature.'],
 ['Union Watch','Whenever this creature or another Bear you control deals combat damage to a player, you gain 1 life.'],
 ['Damage Body','','Creature — Bear'],
 ['Damage Artifact','','Artifact'],
]);
for(const role of['human','ai']){
 test(`${role}: one source with two recipients produces one ability and the total actual damage`,async()=>{
  const {game,a,b}=context(M,role),watch=put(M,game,a,'Source Watch'),src=put(M,game,a,'Damage Artifact'),one=put(M,game,b,'Damage Body'),two=put(M,game,b,'Damage Body'),life=a.life;
  await game.damageBatch([{src,target:one,n:1},{src,target:two,n:2}]);
  assert.equal(game.pendingTriggers.filter(t=>t.src===watch).length,1);assert.equal(a.life,life);await settle(game);assert.equal(a.life,life+3);
 });
 test(`${role}: simultaneous sources hitting one recipient produce one received-damage trigger`,async()=>{
  const {game,a,b}=context(M,role),watch=put(M,game,a,'Body Watch'),body=put(M,game,a,'Damage Body'),one=put(M,game,b,'Damage Body'),two=put(M,game,b,'Damage Body');
  await game.damageBatch([{src:one,target:body,n:1},{src:two,target:body,n:1}]);
  assert.equal(game.pendingTriggers.filter(t=>t.src===watch).length,1);await settle(game);assert.equal(body.counters['+1/+1'],1);
 });
 test(`${role}: source and recipient clauses differ during simultaneous combat damage`,async()=>{
  const {game,a,b}=context(M,role),sourceWatch=put(M,game,a,'Any Watch'),recipientWatch=put(M,game,a,'Recipient Watch'),attacker=put(M,game,a,'Damage Body'),one=put(M,game,b,'Damage Body'),two=put(M,game,b,'Damage Body');
  await game.damageBatch([{src:attacker,target:one,n:1},{src:attacker,target:two,n:1}],{combat:true});
  assert.equal(game.pendingTriggers.filter(t=>t.src===sourceWatch).length,1);assert.equal(game.pendingTriggers.filter(t=>t.src===recipientWatch).length,2);
  await settle(game);assert.equal(a.life,44);
 });
 test(`${role}: Aura controller gains life after Stack resolution even when the host dies`,async()=>{
  const {game,a,b}=context(M,role),aura=put(M,game,a,'Aura Watch'),host=put(M,game,b,'Damage Body'),foe=put(M,game,a,'Damage Body');await game.attach(aura,host);const life=a.life;
  await game.damageBatch([{src:host,target:foe,n:2},{src:foe,target:host,n:3}]);
  assert.equal(host.zone,'graveyard');assert.equal(aura.zone,'graveyard');assert.equal(a.life,life);assert.equal(game.pendingTriggers.filter(t=>t.src===aura).length,1);await settle(game);assert.equal(a.life,life+2);
 });
 test(`${role}: prevented and zero damage never create a damage event`,async()=>{
  const {game,a,b}=context(M,role),watch=put(M,game,a,'Source Watch'),src=put(M,game,a,'Damage Artifact'),body=put(M,game,b,'Damage Body');
  game.untilEffects.push({kind:'preventAllDamage',iid:body.iid,expires:'eot'});const apply=game.applyDamageReplacements.bind(game);game.applyDamageReplacements=async()=>0;
  await game.damageBatch([{src,target:body,n:3},{src,target:a,n:0}]);assert.equal(game.pendingTriggers.filter(t=>t.src===watch).length,0);game.applyDamageReplacements=apply;
 });
 test(`${role}: damaging a creature remembers its controller when it leaves`,async()=>{
  const {game,a,b}=context(M,role),watch=put(M,game,a,'Reflect Watch'),src=put(M,game,a,'Damage Artifact'),body=put(M,game,b,'Damage Body'),life=b.life;
  await game.damageCreature(src,body,3);assert.equal(body.zone,'graveyard');await settle(game);assert.equal(b.life,life-3);assert.equal(a.life,40);
 });
 test(`${role}: an actual Instant resolves one damage event; its later ability is not a spell`,async()=>{
  const ctx=context(M,role),{game,a,b}=ctx,watch=put(M,game,a,'Spell Watch');put(M,game,b,'Damage Body');const life=a.life;
  const spell=await paidCast(M,ctx,'Source Spell');assert.equal(a.life,life+2);assert.equal(spell.zone,'graveyard');
  await game.damagePlayer(spell,b,1);await settle(game);assert.equal(a.life,life+2);
 });
 test(`${role}: creature-source reflection binds the damager rather than its recipient`,async()=>{
  const {game,a,b}=context(M,role),body=put(M,game,a,'Reflection Body'),src=put(M,game,b,'Damage Body');await game.damageCreature(src,body,1);await settle(game);assert.equal(src.damage,1);assert.equal(body.damage,1);
 });
 test(`${role}: a modified creature is tested at damage time, with controller and combat restrictions`,async()=>{
  const {game,a,b}=context(M,role),watch=put(M,game,a,'Modified Watch'),src=put(M,game,a,'Damage Body');const hand=a.hand.length;
  await game.damagePlayer(src,b,1,{combat:true});await settle(game);assert.equal(a.hand.length,hand);
  src.counters['+1/+1']=1;game.recalc();await game.damagePlayer(src,b,1);await settle(game);assert.equal(a.hand.length,hand);
  await game.damagePlayer(src,b,1,{combat:true});src.counters={};game.recalc();await settle(game);assert.equal(a.hand.length,hand+1);
 });
 test(`${role}: disjoint source union triggers once for itself and once for another matching creature`,async()=>{
  const {game,a,b}=context(M,role),watch=put(M,game,a,'Union Watch'),own=put(M,game,a,'Damage Body'),enemy=put(M,game,b,'Damage Body');
  await game.damageBatch([{src:watch,target:b,n:1},{src:own,target:b,n:1},{src:enemy,target:a,n:1}],{combat:true});assert.equal(game.pendingTriggers.filter(t=>t.src===watch).length,2);await settle(game);assert.equal(a.life,41);
 });
 test(`${role}: the actual combat step groups a trampler's blocker and player damage`,async()=>{
  const {game,a,b}=context(M,role),watch=put(M,game,a,'Any Watch'),attacker=put(M,game,a,'Damage Body'),blocker=put(M,game,b,'Damage Body');
  attacker.def={...attacker.def,power:'5',toughness:'8',kws:['trample']};game.recalc();attacker.attacking=b;attacker.wasBlocked=true;attacker.blockedBy=[blocker];blocker.blocking=attacker.iid;game.combat={attackers:[attacker],defenders:new Map()};
  const life=a.life;await game.combatDamage(a,'normal');assert.equal(game.pendingTriggers.filter(t=>t.src===watch).length,1);await settle(game);assert.equal(a.life,life+5);
 });
}
