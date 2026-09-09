import assert from 'node:assert/strict';
import test from 'node:test';
import {M,setup,card,body,play,activate,event,settle,fuel} from './helpers/voc-ncc-fixtures.mjs';

for(const role of ['human','ai']){
 test(role+': Shorikai creates a Pilot that contributes three power to crew',async()=>{
  const f=setup(role),ship=await play(f,'Shorikai, Genesis Engine');await activate(f,ship);
  const pilot=f.game.creatures(f.a).find(c=>c.hasSub('Pilot'));assert.equal(pilot.power,1);assert.equal(f.game.vehicleCrewPower(pilot),3);
  const mech=await play(f,'Mobilizer Mech');f.decide=(p,q)=>q.type==='chooseCards'&&q.aiHint?.kind==='crew'?[pilot]:undefined;
  assert.equal(await f.game.activateAbility(f.a,f.game.activatableList(f.a).find(e=>e.card===mech&&e.crew)),true);await settle(f.game);
  assert.equal(pilot.tapped,true);assert.equal(mech.is('Creature'),true);
 });
 test(role+': Kotori grants crew 2 and the grant expires when Kotori leaves',async()=>{
  const f=setup(role),pilot=body(f),plow=await play(f,'Colossal Plow'),kotori=await play(f,'Kotori, Pilot Prodigy');
  assert.equal(f.game.vehicleCrewCost(plow),2);assert.equal(plow.def.crew,6);
  await f.game.move(kotori,'hand');assert.equal(f.game.vehicleCrewCost(plow),6);assert.equal(f.game.activatableList(f.a).some(e=>e.card===plow&&e.crew),false);
 });
 test(role+': Reconfigure removes the creature type while attached and restores it on detach',async()=>{
  const f=setup(role),host=body(f),armor=await play(f,'Komainu Battle Armor');
  f.decide=(p,q)=>q.type==='chooseTargets'?[host]:undefined;await activate(f,armor,0);
  assert.equal(armor.is('Creature'),false);assert.equal(host.power,4);assert.equal(host.kw('menace'),true);
  await activate(f,armor,1);assert.equal(armor.is('Creature'),true);assert.equal(host.power,2);assert.equal(host.kw('menace'),false);
 });
 test(role+': Swift Reconfiguration grants crew 5 without removing printed abilities',async()=>{
  const f=setup(role),host=card(f,'Colossal Dreadmaw');f.decide=(p,q)=>q.type==='chooseTargets'?[host]:undefined;
  await play(f,'Swift Reconfiguration');assert.equal(host.is('Creature'),false);assert.equal(host.hasSub('Vehicle'),true);assert.equal(f.game.vehicleCrewCost(host),5);assert.equal(host.kw('trample'),true);
  const pilot=card(f,'Colossal Dreadmaw');f.decide=(p,q)=>q.type==='chooseCards'&&q.aiHint?.kind==='crew'?[pilot]:undefined;
  assert.equal(await f.game.activateAbility(f.a,f.game.activatableList(f.a).find(e=>e.card===host&&e.crew)),true);await settle(f.game);assert.equal(host.is('Creature'),true);
 });
 test(role+': Plow mana persists through phase changes but is not permanent',async()=>{
  const f=setup(role),c=await play(f,'Colossal Plow');f.a.pool.W=0;c.attacking=f.b;const life=f.a.life;
  await event(f,'attacks',{card:c,player:f.a});assert.equal(f.a.pool.W,3);assert.equal(f.a.life,life+3);assert.equal(f.a.poolMeta.some(m=>m.color==='W'&&m.persist==='eot'),true);
 });
 test(role+': Krark’s Thumb ignores the unchosen coin without firing a losing event',async()=>{
  const f=setup(role);await play(f,"Krark's Thumb");const chance=await play(f,'Chance Encounter');let i=0;f.game.rnd=()=>[.1,.9][i++%2];
  f.decide=(p,q)=>q.type==='chooseOption'&&q.options.some(o=>o.key==='heads')?'heads':undefined;
  const result=await f.game.flipCoin(f.a,{source:chance});await settle(f.game);assert.equal(result.won,true);assert.equal(result.ignored,1);assert.equal(chance.counters.luck,1);
 });
 test(role+': Chance Encounter requires ten counters both at trigger and at resolution',async()=>{
  const f=setup(role),c=await play(f,'Chance Encounter');f.game.addCounters(c,'luck',10,false,f.a);
  await f.game.emit('upkeep',{player:f.a});await f.game.flushTriggers();f.game.removeCounters(c,'luck',1);await settle(f.game);assert.equal(f.game.gameOver,false);
  f.game.addCounters(c,'luck',1,false,f.a);await event(f,'upkeep',{player:f.a});assert.equal(f.game.winner,f.a);
 });
 test(role+': Krark returns a losing spell to hand while the spell has already been paid for',async()=>{
  const f=setup(role);await play(f,'Krark, the Thumbless');f.game.rnd=()=>.9;f.decide=(p,q)=>q.type==='chooseOption'&&q.options.some(o=>o.key==='heads')?'heads':undefined;
  const spell=await play(f,'Sol Ring');assert.equal(spell.zone,'battlefield');
  const instant=await play(f,'Stitch in Time');assert.equal(instant.zone,'hand');
 });
 test(role+': In Too Deep removes creature abilities but provides the Clue sacrifice ability',async()=>{
  const f=setup(role),host=card(f,'Colossal Dreadmaw');f.decide=(p,q)=>q.type==='chooseTargets'?[host]:undefined;
  await play(f,'In Too Deep');assert.equal(host.is('Creature'),false);assert.equal(host.hasSub('Clue'),true);assert.equal(host.kw('trample'),false);
  fuel(f.a);const ability=f.game.activatableList(f.a).find(e=>e.card===host&&e.ability?.label.startsWith('Sacrifice this Clue'));assert.ok(ability);
  const before=f.a.hand.length;await f.game.activateAbility(f.a,ability);await settle(f.game);assert.equal(host.zone,'graveyard');assert.equal(f.a.hand.length,before+1);
 });
 test(role+': Arterial Alchemy gives Blood a real equip action and +2/+0',async()=>{
  const f=setup(role),host=body(f);await play(f,'Arterial Alchemy');const blood=f.game.bf().find(c=>c.hasSub('Blood'));assert.equal(blood.hasSub('Equipment'),true);
  f.decide=(p,q)=>q.type==='chooseTargets'?[host]:undefined;fuel(f.a);const e=f.game.activatableList(f.a).find(e=>e.card===blood&&e.ability?.label==='Equip Blood {2}');assert.ok(e);
  await f.game.activateAbility(f.a,e);await settle(f.game);assert.equal(host.power,4);
 });
}
