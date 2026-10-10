import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeFixture} from './helpers/second-trigger-fixtures.mjs';

for(const role of ['human','ai'])for(const counter of [false,true])test(`${role}: paid Spider-Verse copies a ${counter?'countered spell using last known information':'live outside-hand spell'}`,async()=>{
 const f=nativeFixture(role),source=await f.cast('Spider-Verse',['Mountain','Mountain','Wastes','Wastes','Wastes']);
 const response=f.put('Counterspell','hand',f.rival);f.put('Island','battlefield',f.rival);f.put('Island','battlefield',f.rival);
 const first=f.put('Think Twice','graveyard');let seen=false,answered=false;
 f.targets=q=>q.candidates.some(so=>so.kind==='spell'&&so.card===first)?[q.candidates.find(so=>so.kind==='spell'&&so.card===first)]:undefined;
 f.priority=q=>{
  if(!q.stack.some(so=>so.kind==='trigger'&&so.srcCard===source))return;
  seen=true;
  if(counter&&!answered&&q.player===f.rival){const offer=q.casts.find(row=>row.card===response);assert.ok(offer);answered=true;return{kind:'cast',card:response,from:offer.from,alt:offer.alt};}
 };
 const fire=async card=>{
  for(const land of ['Island','Wastes','Wastes'])f.put(land);
  const offer=f.game.castableList(f.me).find(row=>row.card===card&&row.alt?.flashback);assert.ok(offer,'the printed Flashback cast is actually offered');
  const before=f.me.hand.length;assert.equal(await f.game.castSpell(f.me,card,{from:offer.from,alt:offer.alt}),true);await f.settle();assert.equal(card.castMeta.manaSpent,3);return f.me.hand.length-before;
 };
 assert.equal(await fire(first),counter?1:2,'CR608.2h and 707.10 permit this untargeted trigger to copy the spell using its last known information');assert.equal(seen,true);
 if(counter){assert.equal(answered,true);assert.equal(response.castMeta.manaSpent,2);assert.equal(first.zone,'exile');}
 f.priority=null;
 assert.equal(await fire(f.put('Think Twice','graveyard')),1,'the actual performed copy consumes the source action even when the original was countered');
});
