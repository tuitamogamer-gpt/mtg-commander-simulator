import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
const M=loadEngine();
async function cast(ctx,name){
  const card=put(M,ctx.game,ctx.a,name,'hand');
  for(const color of ['W','U','B','R','G','C'])ctx.a.pool[color]=10;
  assert.equal(await ctx.game.castSpell(ctx.a,card,{from:'hand'}),true);await settle(ctx.game);
}
for(const role of ['human','ai']){
 test(`${role}: shield counters cannot stop lethal marked damage after toughness falls`,async()=>{
  const ctx=context(M,role),warrior=put(M,ctx.game,ctx.b,'Elvish Warrior');
  await cast(ctx,'Pyroclasm');assert.equal(warrior.damage,2);assert.equal(warrior.zone,'battlefield');
  ctx.game.addCounters(warrior,'shield',2);
  await cast(ctx,'Disfigure');assert.equal(warrior.zone,'graveyard');
  assert.equal(warrior.battlefieldLKI.get(0).counters.shield,2,'SBA did not consume either shield');
 });
 for(const removal of ['Murder','Wrath of God'])test(`${role}: ${removal} consumes a shield without removing earlier damage`,async()=>{
  const ctx=context(M,role),warrior=put(M,ctx.game,ctx.b,'Elvish Warrior');
  await cast(ctx,'Pyroclasm');ctx.game.addCounters(warrior,'shield',1);
  await cast(ctx,removal);assert.equal(warrior.zone,'battlefield');assert.equal(warrior.counters.shield,0);
  assert.equal(warrior.damage,2,'destruction replacement preserves marked damage');
  await cast(ctx,'Disfigure');assert.equal(warrior.zone,'graveyard');
 });
 test(`${role}: regeneration replaces lethal SBA and preserves unrelated shield counters`,async()=>{
  const ctx=context(M,role),warrior=put(M,ctx.game,ctx.b,'Elvish Warrior');
  await cast(ctx,'Pyroclasm');ctx.game.addCounters(warrior,'shield',2);warrior.regenShield=1;
  await cast(ctx,'Disfigure');assert.equal(warrior.zone,'battlefield');assert.equal(warrior.damage,0);
  assert.equal(warrior.counters.shield,2);assert.equal(warrior.regenShield,0);assert.equal(warrior.tapped,true);
 });
}
