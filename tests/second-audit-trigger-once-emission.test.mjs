import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeFixture} from './helpers/second-trigger-fixtures.mjs';

function observeStacks(f,source){
 const snapshots=[],prior=f.game.onEvent;
 f.game.onEvent=e=>{prior(e);if(e.type==='stack')snapshots.push(f.game.stack.map(so=>({kind:so.kind,source:so.srcCard?.iid})));};
 return{snapshots,count:()=>snapshots.filter(rows=>rows.some(so=>so.kind==='trigger'&&so.source===source.iid)).length,
  clear:()=>{snapshots.length=0;}};
}
async function flashback(f,card){
 for(const land of ['Island','Wastes','Wastes'])f.put(land);
 const offer=f.game.castableList(f.me).find(e=>e.card===card&&e.alt?.flashback);
 assert.ok(offer,'the printed flashback action is actually offered');
 assert.equal(await f.game.castSpell(f.me,card,{from:offer.from,alt:offer.alt}),true);
 assert.equal(card.castMeta.manaSpent,3);await f.settle();
}
for(const role of ['human','ai']){
 test(`${role}: used Irreverent Gremlin stops placing later native ETB triggers on the Stack`,async()=>{
  const f=nativeFixture(role),source=await f.cast('Irreverent Gremlin',['Mountain','Wastes']);
  f.put('Island','hand');f.put('Island','hand');const seen=observeStacks(f,source);
  await f.cast('Grizzly Bears',['Forest','Wastes']);assert.equal(f.me.turnState.discardedN,1);
  assert.ok(seen.count()>0,'the observer sees the actual first Stack trigger');seen.clear();
  await f.cast('Grizzly Bears',['Forest','Wastes']);
  assert.equal(seen.count(),0,'CR603.2h suppresses the next ETB trigger after taking the optional action');
  assert.equal(f.me.turnState.discardedN,1);
 });
 test(`${role}: used Spider-Verse stops placing later native flashback-copy triggers on the Stack`,async()=>{
  const f=nativeFixture(role),source=await f.cast('Spider-Verse',['Mountain','Mountain','Wastes','Wastes','Wastes']);
  const first=f.put('Think Twice','graveyard'),second=f.put('Think Twice','graveyard'),seen=observeStacks(f,source);
  const before=f.me.hand.length;await flashback(f,first);assert.equal(f.me.hand.length,before+2);
  assert.ok(seen.count()>0);seen.clear();await flashback(f,second);
  assert.equal(seen.count(),0,'CR603.2h suppresses the next cast-copy trigger after copying a spell');
  assert.equal(f.me.hand.length,before+3);
 });
 test(`${role}: used Planetarium stops placing later native scry-cast triggers on the Stack`,async()=>{
  const f=nativeFixture(role),source=await f.cast('Planetarium of Wan Shi Tong',Array(6).fill('Wastes'));
  f.cards=q=>q.prompt?.startsWith('You may cast one of these cards')?[q.from[0]]:undefined;
  const first=f.put('Ornithopter','library');f.put('Island','library');const seen=observeStacks(f,source);
  await f.cast('Opt',['Island']);assert.equal(first.zone,'battlefield');assert.equal(first.castMeta.manaSpent,0);
  assert.ok(seen.count()>0);seen.clear();
  const later=f.put('Ornithopter','library');f.put('Island','library');await f.cast('Opt',['Island']);
  assert.equal(seen.count(),0,'CR603.2h suppresses the next scry trigger after the permitted cast');
  assert.equal(later.zone,'library');
 });
}
