import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeFixture} from './helpers/second-trigger-fixtures.mjs';

for(const role of ['human','ai'])test(`${role}: paid copied Iron triggers retain their original controller's action record after a real control change`,async()=>{
 const f=nativeFixture(role),orrery=await f.cast('Vedalken Orrery',Array(4).fill('Wastes'));
 f.targets=q=>q.candidates.includes(orrery)?[orrery]:q.candidates.includes(f.rival)?[f.rival]:undefined;
 await f.cast('Donate',['Island','Wastes','Wastes']);assert.equal(orrery.ctrl,f.rival);
 const resonator=await f.cast('Strionic Resonator',['Wastes','Wastes']);
 const source=await f.cast('Iron Man, Bleeding Edge',['Island','Island','Wastes','Wastes','Wastes']);f.put('Wastes');f.put('Wastes');
 const confiscate=f.put('Confiscate','hand',f.rival);for(const land of ['Island','Island','Wastes','Wastes','Wastes','Wastes'])f.put(land,'battlefield',f.rival);
 let stage=0;
 f.targets=q=>q.candidates.some(so=>so.kind==='trigger'&&so.srcCard===source)?[q.candidates.find(so=>so.kind==='trigger'&&so.srcCard===source)]:q.candidates.includes(source)?[source]:undefined;
 f.priority=q=>{
  const triggers=q.stack.filter(so=>so.kind==='trigger'&&so.srcCard===source);
  if(stage===0&&triggers.length&&q.player===f.me){const entry=q.acts.find(row=>row.card===resonator);assert.ok(entry);stage=1;return{kind:'activate',entry};}
  if(stage===1&&triggers.length===2)stage=2;
  if(stage===2&&q.player===f.rival){const offer=q.casts.find(row=>row.card===confiscate);assert.ok(offer,'the opponent receives the real flash cast offer');stage=3;return{kind:'cast',card:confiscate,from:offer.from,alt:offer.alt};}
 };
 await f.cast('Ornithopter',[]);f.priority=null;
 assert.equal(stage,3);assert.equal(resonator.tapped,true);assert.equal(confiscate.castMeta.manaSpent,6);assert.equal(source.ctrl,f.rival);
 assert.equal(f.game.creatures(f.me).filter(c=>c.isToken&&c.name==='Ornithopter').length,1,'the original and copied old-controller triggers share one accepted action');
 await f.cast('Ornithopter',[],{player:f.rival});
 assert.equal(f.game.creatures(f.rival).filter(c=>c.isToken&&c.name==='Ornithopter').length,1,'the new controller remains unused after the old-controller abilities resolve');
});
