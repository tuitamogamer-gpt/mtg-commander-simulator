import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeFixture} from './helpers/second-trigger-fixtures.mjs';

for(const role of ['human','ai'])for(const response of ['none','destroy','blink'])test(`${role}: paid Barren Glory intervening-if treats a ${response} response as the exact original object`,async()=>{
 const f=nativeFixture(role),glory=await f.cast('Barren Glory',['Plains','Plains','Wastes','Wastes','Wastes','Wastes']);
 await f.cast('Obliterate',['Mountain','Mountain','Wastes','Wastes','Wastes','Wastes','Wastes','Wastes']);
 assert.equal(f.me.hand.length,0);const own=f.game.bf().filter(c=>c.ctrl===f.me);assert.equal(own.length,1);assert.equal(own[0],glory);
 const version=glory.zoneVersion;let responded=false,spell;
 if(response!=='none'){
  spell=f.put(response==='blink'?'Flicker of Fate':'Disenchant','hand',f.rival);
  f.put('Plains','battlefield',f.rival);f.put('Wastes','battlefield',f.rival);
  f.targets=q=>q.candidates.includes(glory)?[glory]:undefined;
  f.priority=q=>{
   if(q.player!==f.rival||responded||!q.stack.some(so=>so.kind==='trigger'&&so.srcCard===glory))return;
   const offer=q.casts.find(row=>row.card===spell);assert.ok(offer,'the printed opposing instant is actually offered');
   responded=true;return{kind:'cast',card:spell,from:offer.from,alt:offer.alt};
  };
 }
 await f.game.runUpkeepStepV90(f.me);await f.settle();
 if(response!=='none'){assert.equal(responded,true);assert.equal(spell.castMeta.manaSpent,2);}
 if(response==='blink'){
  assert.equal(glory.zone,'battlefield');assert.equal(glory.zoneVersion,version+2);
  assert.equal(f.game.winner?.idx??null,null,'the returned Barren Glory is another permanent for the old ability');
 }else{
  assert.equal(glory.zone,response==='destroy'?'graveyard':'battlefield');
  assert.equal(f.game.winner?.idx??null,f.me.idx,'the unchanged original or no remaining permanents satisfies the old condition');
 }
});
