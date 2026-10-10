import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeFixture} from './helpers/second-trigger-fixtures.mjs';

for(const role of ['human','ai'])for(const counter of [false,true])test(`${role}: paid Donal copies a ${counter?'countered flying spell using last known information':'live native flying spell'}`,async()=>{
 const f=nativeFixture(role),source=await f.cast('Donal, Herald of Wings',['Island','Island','Wastes','Wastes']);
 const response=f.put('Counterspell','hand',f.rival);f.put('Island','battlefield',f.rival);f.put('Island','battlefield',f.rival);
 const first=f.put('Ornithopter','hand');let seen=false,answered=false;
 f.targets=q=>q.candidates.some(so=>so.kind==='spell'&&so.card===first)?[q.candidates.find(so=>so.kind==='spell'&&so.card===first)]:undefined;
 f.priority=q=>{
  if(!q.stack.some(so=>so.kind==='trigger'&&so.srcCard===source))return;
  seen=true;
  if(counter&&!answered&&q.player===f.rival){const offer=q.casts.find(row=>row.card===response);assert.ok(offer);answered=true;return{kind:'cast',card:response,from:offer.from,alt:offer.alt};}
 };
 await f.castCard(first,[]);f.priority=null;assert.equal(seen,true);
 const copies=()=>f.game.creatures(f.me).filter(c=>c.isToken&&c.name==='Ornithopter'&&c.hasSub('Spirit'));
 assert.equal(copies().length,1,'CR608.2h and 707.10 permit the untargeted trigger to copy the spell using its last known information');
 if(counter){assert.equal(answered,true);assert.equal(response.castMeta.manaSpent,2);assert.equal(first.zone,'graveyard');}
 await f.cast('Ornithopter',[]);assert.equal(copies().length,1,'the actual performed copy consumes the source action even when the original was countered');assert.equal(copies()[0].power,1);
});
