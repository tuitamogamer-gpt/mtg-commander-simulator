import test from 'node:test';
import assert from 'node:assert/strict';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';
import {fixtureEngine,context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
const M=fixtureEngine([
 ['Red Ward','If a red source would deal damage to you, prevent 2 of that damage.','Enchantment'],
 ['Spell Ward','If a spell would deal damage to you or another permanent you control, prevent that damage.'],
 ['Spell Furnace','If a red instant or sorcery spell you control would deal damage, it deals double that damage instead.','Enchantment'],
 ['Staff Ward','As long as this artifact is untapped, if a creature would deal combat damage to you, prevent 1 of that damage.','Artifact'],
 ['Capridor Ward','If noncombat damage would be dealt to this creature, prevent that damage. Put a +1/+1 counter on this creature for each 1 damage prevented this way.'],
 ['Hydra Ward','If a creature would deal combat damage to this creature, prevent that damage and put a +1/+1 counter on this creature.'],
 ['Flail Ward','If another creature would deal combat damage to equipped creature, it deals double that damage to equipped creature instead.\nEquip {0}','Artifact — Equipment'],
 ['Double Ward','If a source would deal damage to you or a permanent you control, prevent half that damage, rounded up.','Enchantment'],
 ['Red Bolt','This spell deals 3 damage to target opponent.','Instant','{R}'],
 ['Red Sorcery','This spell deals 3 damage to target opponent.','Sorcery','{R}'],
 ['Blue Bolt','This spell deals 3 damage to target opponent.','Sorcery','{U}'],
 ['Unpreventable',''],
]);
for(const role of ['human','ai']) {
 test(`${role}: source colors and controller changes govern each prevention event`,async()=>{
  const {game,a,b}=context(M,role),shield=put(M,game,a,'Red Ward'),red=put(M,game,b,'Red Bolt','graveyard'),blue=put(M,game,b,'Blue Bolt','graveyard');
  const before=a.life;assert.equal(await game.damagePlayer(red,a,3),1);assert.equal(await game.damagePlayer(blue,a,3),3);assert.equal(a.life,before-4);
  M.OracleV8Control.gain(game,shield,b);game.recalc();assert.equal(await game.damagePlayer(red,a,3),3);assert.equal(await game.damagePlayer(red,b,3),1);
 });
 test(`${role}: only real resolving red instant and sorcery spells receive the multiplier`,async()=>{
  const {game,a,b}=context(M,role);put(M,game,a,'Spell Furnace');
  for(const [name,mana,expected] of [['Red Bolt','R',6],['Red Sorcery','R',6],['Blue Bolt','U',3]]){
   const card=put(M,game,a,name,'hand');a.pool[mana]+=1;const before=b.life;
   assert.equal(await game.castSpell(a,card,{from:'hand'}),true);await settle(game);assert.equal(b.life,before-expected);
   assert.equal(await game.damagePlayer(card,b,1),1,'later ability from a card in a graveyard is not a spell');
  }
 });
 test(`${role}: untapped source condition and combat qualification are live`,async()=>{
  const {game,a,b}=context(M,role),staff=put(M,game,a,'Staff Ward'),attacker=put(M,game,b,'Grizzly Bears');
  assert.equal(await game.damagePlayer(attacker,a,3,{combat:true}),2);assert.equal(await game.damagePlayer(attacker,a,3),3);
  staff.tapped=true;assert.equal(await game.damagePlayer(attacker,a,3,{combat:true}),3);staff.tapped=false;
  assert.equal(await game.damagePlayer(attacker,a,3,{combat:true}),2);
 });
 test(`${role}: prevented-only counters and independent counter instructions differ when prevention is prohibited`,async()=>{
  const {game,a,b}=context(M,role),cap=put(M,game,a,'Capridor Ward'),hydra=put(M,game,a,'Hydra Ward'),attacker=put(M,game,b,'Grizzly Bears');
  assert.equal(await game.damageCreature(attacker,cap,3),0);assert.equal(cap.counters['+1/+1'],3);
  const lock=put(M,game,b,'Unpreventable');lock.def={...lock.def,damageCantBePrevented:true};
  assert.equal(await game.damageCreature(attacker,cap,2),2);assert.equal(cap.counters['+1/+1'],3);
  assert.equal(await game.damageCreature(attacker,hydra,1,{combat:true}),1);assert.equal(hydra.counters['+1/+1'],1);
 });
 test(`${role}: Equipment another-creature predicate excludes the attached host itself`,async()=>{
  const {game,a,b}=context(M,role),host=put(M,game,a,'Grizzly Bears'),other=put(M,game,b,'Grizzly Bears'),flail=put(M,game,a,'Flail Ward');
  const row=game.activatableList(a).find(row=>row.card===flail&&row.equip);assert.ok(row);assert.equal(await game.activateAbility(a,row),true);await settle(game);
  assert.equal(flail.attachedTo,host.iid);assert.equal(await game.damageCreature(host,host,1,{combat:true,deferSBA:true}),1);
  assert.equal(await game.damageCreature(other,host,1,{combat:true,deferSBA:true}),2);
 });
 test(`${role}: half prevention rounds the prevented amount up`,async()=>{
  const {game,a,b}=context(M,role),attacker=put(M,game,b,'Grizzly Bears');put(M,game,a,'Double Ward');
  assert.equal(await game.damagePlayer(attacker,a,5),2);assert.equal(await game.damagePlayer(attacker,a,1),0);assert.equal(await game.damagePlayer(attacker,a,4),2);
 });
 test(`${role}: spell ward excludes itself but covers its controller and other permanents`,async()=>{
  const {game,a,b}=context(M,role),ward=put(M,game,a,'Spell Ward'),host=put(M,game,a,'Grizzly Bears'),bolt=put(M,game,b,'Red Bolt','hand');
  bolt.def={...bolt.def,resolve:async ctx=>{
   assert.equal(await game.damagePlayer(ctx.src,a,1),0);
   assert.equal(await game.damageCreature(ctx.src,host,1),0);
   assert.equal(await game.damageCreature(ctx.src,ward,1),1);
  }};b.pool.R=1;game.turnPlayer=b;assert.equal(await game.castSpell(b,bolt,{from:'hand'}),true);await settle(game);
 });
}
test('damage replacement grammar remains closed around qualifiers and extra instructions',()=>{
 for(const oracle_text of ['If a red spell you copied would deal damage, it deals double that damage instead.','If a spell would deal damage to you, prevent that damage. Draw a card.','If a source would deal damage to you, prevent half that damage, rounded sideways.']){
  const sem=semanticClass({name:'Closed Ward',type_line:'Enchantment',oracle_text,layout:'normal',mana_cost:'{G}'});assert.equal(sem.semanticClass,undefined);
 }
});
