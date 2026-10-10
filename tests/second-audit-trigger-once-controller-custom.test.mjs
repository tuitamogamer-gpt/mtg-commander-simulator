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
 const aura=await f.cast('Confiscate',['Island','Island','Wastes','Wastes','Wastes','Wastes'],{player:f.rival});
 assert.equal(source.ctrl,f.rival);return aura;
}
async function reclaim(f,source,aura){
 f.targets=q=>q.candidates.includes(aura)?[aura]:undefined;
 await f.cast('Disenchant',['Plains','Wastes']);assert.equal(source.ctrl,f.me);
}
for(const role of ['human','ai']){
 test(`${role}: paid Gremlin keeps separate accepted loot actions for its actual controllers`,async()=>{
  const f=nativeFixture(role);await flashRival(f);const source=await f.cast('Irreverent Gremlin',['Mountain','Wastes']);
  f.put('Island','hand');f.put('Island','hand',f.rival);
  f.cards=q=>q.prompt?.includes('Irreverent Gremlin: choose cards')?[q.from.find(c=>c.name==='Island')]:undefined;
  await f.cast('Grizzly Bears',['Forest','Wastes']);assert.equal(f.me.turnState.discardedN,1);
  const version=source.zoneVersion,aura=await steal(f,source);assert.equal(source.zoneVersion,version);
  await f.cast('Grizzly Bears',['Forest','Wastes'],{player:f.rival});assert.equal(f.rival.turnState.discardedN,1,'the second controller may take this source action');
  await reclaim(f,source,aura);await f.cast('Grizzly Bears',['Forest','Wastes']);assert.equal(f.me.turnState.discardedN,1,'the first controller remains used after returning control');
 });
 test(`${role}: paid Spider-Verse keeps separate accepted real Flashback copies for its controllers`,async()=>{
  const f=nativeFixture(role);await flashRival(f);const source=await f.cast('Spider-Verse',['Mountain','Mountain','Wastes','Wastes','Wastes']);
  const fire=async player=>{
   const c=f.put('Think Twice','graveyard',player);for(const name of ['Island','Wastes','Wastes'])f.put(name,'battlefield',player);
   const offer=f.game.castableList(player).find(row=>row.card===c&&row.alt?.flashback);assert.ok(offer);
   const before=player.hand.length;assert.equal(await f.game.castSpell(player,c,{from:offer.from,alt:offer.alt}),true);await f.settle();assert.equal(c.castMeta.manaSpent,3);return player.hand.length-before;
  };
  assert.equal(await fire(f.me),2);const aura=await steal(f,source);
  assert.equal(await fire(f.rival),2,'the second controller may copy a real outside-hand spell');
  await reclaim(f,source,aura);assert.equal(await fire(f.me),1,'the original controller cannot copy again');
 });
 test(`${role}: paid Planetarium keeps separate permitted library casts for its controllers`,async()=>{
  const f=nativeFixture(role);await flashRival(f);const source=await f.cast('Planetarium of Wan Shi Tong',Array(6).fill('Wastes'));
  f.cards=q=>q.prompt?.startsWith('You may cast one of these cards')?[q.from[0]]:undefined;
  const fire=async player=>{const c=f.put('Ornithopter','library',player);f.put('Island','library',player);await f.cast('Opt',['Island'],{player});return c;};
  assert.equal((await fire(f.me)).zone,'battlefield');const aura=await steal(f,source);
  const second=await fire(f.rival);assert.equal(second.zone,'battlefield','the second controller may take the permitted cast action');assert.equal(second.castMeta.manaSpent,0);
  await reclaim(f,source,aura);assert.equal((await fire(f.me)).zone,'library','the original controller action remains used');
 });
}
