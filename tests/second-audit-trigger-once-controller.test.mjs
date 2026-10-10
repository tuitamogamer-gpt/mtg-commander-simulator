import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeFixture} from './helpers/second-trigger-fixtures.mjs';

async function giveOrrery(f){
 const orrery=await f.cast('Vedalken Orrery',Array(4).fill('Wastes'));
 f.targets=q=>q.candidates.includes(orrery)?[orrery]:q.candidates.includes(f.rival)?[f.rival]:undefined;
 await f.cast('Donate',['Island','Wastes','Wastes']);assert.equal(orrery.ctrl,f.rival);return orrery;
}
async function steal(f,source){
 f.targets=q=>q.candidates.includes(source)?[source]:undefined;
 const aura=await f.cast('Confiscate',['Island','Island','Wastes','Wastes','Wastes','Wastes'],{player:f.rival});
 assert.equal(source.ctrl,f.rival);return aura;
}
async function reclaim(f,source,aura){
 f.targets=q=>q.candidates.includes(aura)?[aura]:undefined;
 await f.cast('Disenchant',['Plains','Wastes']);assert.equal(aura.zone,'graveyard');assert.equal(source.ctrl,f.me);
}
for(const role of ['human','ai']){
 test(`${role}: paid Iron Man permits each controller's once-on-use action and retains the first controller's used record`,async()=>{
  const f=nativeFixture(role);await giveOrrery(f);
  const iron=await f.cast('Iron Man, Bleeding Edge',['Island','Island','Wastes','Wastes','Wastes']);
  await f.cast('Ornithopter',[]);assert.equal(f.game.creatures(f.me).filter(c=>c.isToken&&c.name==='Ornithopter').length,1);
  const version=iron.zoneVersion,aura=await steal(f,iron);assert.equal(iron.zoneVersion,version);
  await f.cast('Ornithopter',[],{player:f.rival});
  assert.equal(f.game.creatures(f.rival).filter(c=>c.isToken&&c.name==='Ornithopter').length,1,'the new controller has not taken this source action this turn');
  await reclaim(f,iron,aura);await f.cast('Ornithopter',[]);
  assert.equal(f.game.creatures(f.me).filter(c=>c.isToken&&c.name==='Ornithopter').length,1,'returning control does not erase the original controller use');
  await f.cast('Mirror Box',['Wastes','Wastes','Wastes']);
  const other=await f.cast('Iron Man, Bleeding Edge',['Island','Island','Wastes','Wastes','Wastes']);assert.notEqual(other,iron);
  await f.cast('Ornithopter',[]);
  assert.equal(f.game.creatures(f.me).filter(c=>c.isToken&&c.name==='Ornithopter').length,2,'a different printed source has an independent action record');
 });
 test(`${role}: paid Whispering Wizard preserves an explicit object-wide trigger limit through control changes`,async()=>{
  const f=nativeFixture(role);await giveOrrery(f);
  const wizard=await f.cast('Whispering Wizard',['Island','Wastes','Wastes','Wastes']);await f.cast('Opt',['Island']);
  assert.equal(f.game.creatures(f.me).filter(c=>c.isToken&&c.hasSub('Spirit')).length,1);
  const aura=await steal(f,wizard);await f.cast('Opt',['Island'],{player:f.rival});
  assert.equal(f.game.creatures(f.rival).filter(c=>c.isToken&&c.hasSub('Spirit')).length,0,'the explicit trigger limit remains used for this object');
  await reclaim(f,wizard,aura);await f.cast('Opt',['Island']);
  assert.equal(f.game.creatures(f.me).filter(c=>c.isToken&&c.hasSub('Spirit')).length,1);
 });
}
