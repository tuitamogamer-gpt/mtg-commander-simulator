import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeFixture} from './helpers/second-trigger-fixtures.mjs';

for(const role of ['human','ai'])test(`${role}: a paid blink cannot make an already-used old Gremlin trigger consume the new incarnation`,async()=>{
 const f=nativeFixture(role),source=await f.cast('Irreverent Gremlin',['Mountain','Wastes']);
 const blink=f.put('Ghostly Flicker','hand'),island=f.put('Island');f.put('Island');f.put('Wastes');f.put('Wastes');
 f.put('Island','hand');f.put('Island','hand');const oldVersion=source.zoneVersion;let responded=false,offers=0;
 f.cards=q=>q.prompt?.includes('Irreverent Gremlin: choose cards')?[q.from.find(c=>c.name==='Island')]:undefined;
 f.targets=q=>q.max===2&&q.candidates.includes(source)&&q.candidates.includes(island)?[source,island]:undefined;
 f.option=q=>{if(q.prompt==='Irreverent Gremlin: Discard a card to draw a card?'){offers++;return 'yes';}};
 f.priority=q=>{
  if(q.player!==f.me||responded||source.meta.lootV50?.turn!==f.game.turnNo||
     !q.stack.some(so=>so.kind==='trigger'&&so.srcCard===source))return;
  const offer=q.casts.find(e=>e.card===blink);assert.ok(offer,'the actual instant response is funded and offered');responded=true;
  return{kind:'cast',card:blink,from:offer.from,alt:offer.alt,quickTargets:[source,island]};
 };
 await f.cast('Raise the Alarm',['Plains','Wastes']);
 assert.equal(responded,true);assert.equal(blink.castMeta.manaSpent,3);assert.equal(source.zoneVersion,oldVersion+2);
 assert.equal(f.me.turnState.discardedN,1,'the queued old trigger retains the already-used old metadata');
 assert.equal(offers,1,'the old trigger cannot ask to use the returned source');
 await f.cast('Grizzly Bears',['Forest','Wastes']);
 assert.equal(f.me.turnState.discardedN,2,'the actual later ETB may use the new incarnation once');assert.equal(offers,2);
});
