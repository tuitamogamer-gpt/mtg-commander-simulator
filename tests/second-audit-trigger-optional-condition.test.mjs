import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeFixture} from './helpers/second-trigger-fixtures.mjs';

for(const role of ['human','ai'])for(const respond of [false,true])test(`${role}: paid Legolas checks its tapped condition before offering the optional action${respond?' after opposing untap':''}`,async()=>{
 const f=nativeFixture(role),source=await f.cast('Legolas, Counter of Kills',['Forest','Island','Wastes','Wastes']);
 let untap=false;
 f.targets=q=>q.candidates.includes(source)?[source]:undefined;
 f.option=q=>q.prompt?.startsWith('Tap or untap ')?untap?'untap':'tap':undefined;
 const choices=()=>f.questions.filter(q=>q.type==='chooseOption'&&q.aiHint?.src===source&&q.options.some(o=>o.key==='yes'));
 await f.cast('Twiddle',['Island']);assert.equal(source.tapped,true);
 const response=f.put('Twiddle','hand',f.rival);f.put('Island','battlefield',f.rival);
 let seen=false,answered=false;
 f.priority=q=>{
  if(!q.stack.some(so=>so.kind==='trigger'&&so.srcCard===source))return;
  seen=true;
  if(respond&&q.player===f.rival&&!answered){const offer=q.casts.find(row=>row.card===response);assert.ok(offer,'the paid opposing untap is actually offered during trigger priority');answered=true;untap=true;return{kind:'cast',card:response,from:offer.from,alt:offer.alt};}
 };
 await f.cast('Opt',['Island']);f.priority=null;
 assert.equal(seen,true,'the printed intervening-if is true at the actual scry event');
 if(respond){assert.equal(answered,true);assert.equal(response.castMeta.manaSpent,1);assert.equal(source.tapped,false);}
 assert.equal(choices().length,respond?0:1,'resolution checks the intervening-if before any optional action is offered');
 untap=false;await f.cast('Twiddle',['Island']);assert.equal(source.tapped,true);
 await f.cast('Opt',['Island']);
 assert.equal(source.tapped,!respond,'only a previously performed untap consumes the printed action limit');
 assert.equal(choices().length,1);
});
