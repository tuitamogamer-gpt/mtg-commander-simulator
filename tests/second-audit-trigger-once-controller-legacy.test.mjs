import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeFixture} from './helpers/second-trigger-fixtures.mjs';

async function flashRival(f){
 const orrery=await f.cast('Vedalken Orrery',Array(4).fill('Wastes'));
 f.targets=q=>q.candidates.includes(orrery)?[orrery]:q.candidates.includes(f.rival)?[f.rival]:undefined;
 await f.cast('Donate',['Island','Wastes','Wastes']);assert.equal(orrery.ctrl,f.rival);
}
async function steal(f,source){
 f.targets=q=>q.candidates.includes(source)?[source]:undefined;
 const aura=await f.cast('Confiscate',['Island','Island','Wastes','Wastes','Wastes','Wastes'],{player:f.rival});assert.equal(source.ctrl,f.rival);return aura;
}
async function reclaim(f,source,aura){
 f.targets=q=>q.candidates.includes(aura)?[aura]:undefined;
 await f.cast('Disenchant',['Plains','Wastes']);assert.equal(source.ctrl,f.me);
}
for(const role of ['human','ai']){
 test(`${role}: paid Donal retains separate accepted native flying-spell copies for its controllers`,async()=>{
  const f=nativeFixture(role);await flashRival(f);const source=await f.cast('Donal, Herald of Wings',['Island','Island','Wastes','Wastes']);
  const copies=player=>f.game.creatures(player).filter(c=>c.isToken&&c.name==='Ornithopter'&&c.hasSub('Spirit'));
  await f.cast('Ornithopter',[]);assert.equal(copies(f.me).length,1);assert.equal(copies(f.me)[0].power,1);
  const aura=await steal(f,source);await f.cast('Ornithopter',[],{player:f.rival});assert.equal(copies(f.rival).length,1,'the new controller may copy its printed flying spell');
  await reclaim(f,source,aura);await f.cast('Ornithopter',[]);assert.equal(copies(f.me).length,1,'the original controller remains used');
 });
 test(`${role}: paid Ondu retains separate accepted native enchantment copies for its controllers`,async()=>{
  const f=nativeFixture(role);await flashRival(f);
  f.option=q=>q.prompt?.includes('Copy Ondu Spiritdancer?')||q.prompt?.includes('Copy Confiscate?')?'no':undefined;
  const source=await f.cast('Ondu Spiritdancer',['Plains','Wastes','Wastes','Wastes','Wastes']);
  const copies=player=>f.game.bf().filter(c=>c.ctrl===player&&c.isToken&&c.name==='Glorious Anthem');
  await f.cast('Glorious Anthem',['Plains','Plains','Wastes']);assert.equal(copies(f.me).length,1);
  const aura=await steal(f,source);await f.cast('Glorious Anthem',['Plains','Plains','Wastes'],{player:f.rival});assert.equal(copies(f.rival).length,1,'the new controller may copy its native entering enchantment');
  await reclaim(f,source,aura);await f.cast('Glorious Anthem',['Plains','Plains','Wastes']);assert.equal(copies(f.me).length,1,'returning control preserves the original accepted use');
 });
 test(`${role}: paid Deep Gnome retains separate native Plains searches for its controllers`,async()=>{
  const f=nativeFixture(role);await flashRival(f);const source=await f.cast('Deep Gnome Terramancer',['Plains','Wastes']);
  f.cards=q=>q.from?.length?[q.from.find(c=>c.name==='Forest')||q.from.find(c=>c.name==='Plains')||q.from[0]]:undefined;
  const first=f.put('Plains','library'),rival=f.put('Plains','library',f.rival);f.put('Forest','library',f.rival);
  await f.cast('Rampant Growth',['Forest','Wastes'],{player:f.rival});assert.equal(first.zone,'battlefield');assert.equal(first.tapped,true);
  const aura=await steal(f,source);f.put('Forest','library');await f.cast('Rampant Growth',['Forest','Wastes']);assert.equal(rival.zone,'battlefield','the new controller may search for its actual Plains');assert.equal(rival.tapped,true);
  await reclaim(f,source,aura);const later=f.put('Plains','library');f.put('Forest','library',f.rival);await f.cast('Rampant Growth',['Forest','Wastes'],{player:f.rival});assert.equal(later.zone,'library','returning control does not reset the first controller use');
 });
}
