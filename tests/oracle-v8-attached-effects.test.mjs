import test from'node:test';import assert from'node:assert/strict';import{fixtureEngine,context,put,settle}from'./helpers/oracle-v8-fixtures.mjs';
const M=fixtureEngine([
 ['Attached Tap Probe','Enchant creature\n{1}: Tap enchanted creature.','Enchantment — Aura','{W}'],
 ['Attached Exile Probe','Enchant creature\n{1}, Sacrifice this Aura: Exile enchanted creature.','Enchantment — Aura','{W}'],
 ['Attached Pump Probe','{1}: Equipped creature gets +2/+0 until end of turn.\nEquip {1}','Artifact — Equipment','{1}'],
 ['Attached Red Probe',"At the beginning of your upkeep, put a +1/+1 counter on equipped creature if it's red.\nEquip {1}",'Artifact — Equipment','{1}'],
]);
async function attached(ctx,name){const host=put(M,ctx.game,ctx.a,'Grizzly Bears'),source=put(M,ctx.game,ctx.a,name);await ctx.game.attach(source,host);return {host,source};}
for(const role of ['human','ai']){
 test(`${role}: an attachment effect is not a target and works through shroud`,async()=>{
  const c=context(M,role),{source,host}=await attached(c,'Attached Tap Probe');host.def={...host.def,kws:['shroud']};c.game.recalc();c.a.pool.C=1;const action=c.game.activatableList(c.a).find(row=>row.card===source);assert.ok(action);await c.game.activateAbility(c.a,action);assert.equal(c.game.stack.at(-1).targets.length,0);await settle(c.game);assert.equal(host.tapped,true);
 });
 test(`${role}: sacrificial Aura uses its last attached host after the cost`,async()=>{
  const c=context(M,role),{source,host}=await attached(c,'Attached Exile Probe');c.a.pool.C=1;const action=c.game.activatableList(c.a).find(row=>row.card===source);await c.game.activateAbility(c.a,action);assert.equal(source.zone,'graveyard');assert.equal(host.zone,'battlefield');await settle(c.game);assert.equal(host.zone,'exile');
 });
 test(`${role}: last attachment identity does not follow a blinked host`,async()=>{
  const c=context(M,role),{source,host}=await attached(c,'Attached Exile Probe');c.a.pool.C=1;await c.game.activateAbility(c.a,c.game.activatableList(c.a).find(row=>row.card===source));await c.game.move(host,'exile');await c.game.move(host,'battlefield');await settle(c.game);assert.equal(host.zone,'battlefield');
 });
 test(`${role}: destroyed Aura still resolves against the former surviving host`,async()=>{
  const c=context(M,role),{source,host}=await attached(c,'Attached Tap Probe');c.a.pool.C=1;await c.game.activateAbility(c.a,c.game.activatableList(c.a).find(row=>row.card===source));await c.game.destroy(source);await settle(c.game);assert.equal(host.tapped,true);
 });
 test(`${role}: live Equipment uses the creature it equips on resolution`,async()=>{
  const c=context(M,role),{source,host}=await attached(c,'Attached Pump Probe'),other=put(M,c.game,c.a,'Grizzly Bears');c.a.pool.C=1;await c.game.activateAbility(c.a,c.game.activatableList(c.a).find(row=>row.card===source&&row.ability.oracleCompiled));await c.game.attach(source,other);await settle(c.game);assert.equal(host.power,2);assert.equal(other.power,4);
 });
 test(`${role}: a pronoun condition tests the equipped creature's color`,async()=>{
  const c=context(M,role),{source,host}=await attached(c,'Attached Red Probe');source.def={...source.def,colorsOverride:['R']};host.def={...host.def,colorsOverride:['G']};c.game.recalc();await c.game.emit('upkeep',{player:c.a});await settle(c.game);assert.equal(host.counters['+1/+1']||0,0);host.def={...host.def,colorsOverride:['R']};source.def={...source.def,colorsOverride:[]};c.game.recalc();await c.game.emit('upkeep',{player:c.a});await settle(c.game);assert.equal(host.counters['+1/+1'],1);
 });
}
