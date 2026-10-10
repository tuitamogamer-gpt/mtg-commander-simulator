import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeFixture} from './helpers/second-trigger-fixtures.mjs';

async function setup(role){
 const f=nativeFixture(role),orrery=await f.cast('Vedalken Orrery',Array(4).fill('Wastes'));
 f.targets=q=>q.candidates.includes(orrery)?[orrery]:q.candidates.includes(f.rival)?[f.rival]:undefined;
 await f.cast('Donate',['Island','Wastes','Wastes']);assert.equal(orrery.ctrl,f.rival);
 const source=await f.cast('Deep Gnome Terramancer',['Plains','Wastes']);
 f.option=q=>q.aiHint?.src===source&&q.prompt?.includes('Search for a Plains?')?'no':undefined;
 f.cards=q=>q.from?.filter(c=>c.name==='Forest').slice(0,q.max||1);
 let maxTriggers=0;const batches=new Set(),prior=f.game.onEvent;
 f.game.onEvent=e=>{prior(e);if(e.type==='stack'){const triggers=f.game.stack.filter(so=>so.kind==='trigger'&&so.srcCard===source);maxTriggers=Math.max(maxTriggers,triggers.length);for(const so of triggers)batches.add(so.ctx.data.oracleBatch);}};
 return Object.assign(f,{source,batches,maxTriggers:()=>maxTriggers,clearSeen:()=>{maxTriggers=0;batches.clear();}});
}
for(const role of ['human','ai']){
 test(`${role}: paid Explosive Vegetation returns searched lands in one native entry event`,async()=>{
  const f=await setup(role),forests=[f.put('Forest','library',f.rival),f.put('Forest','library',f.rival)];
  await f.cast('Explosive Vegetation',['Forest','Wastes','Wastes','Wastes'],{player:f.rival});
  assert.equal(forests.every(c=>c.zone==='battlefield'&&c.tapped),true,'both actually searched basic lands enter tapped');
  assert.equal(f.batches.size,1);assert.ok([...f.batches][0],'a simultaneous library-to-battlefield move supplies one real native entry batch');
  assert.equal(f.maxTriggers(),1,'the one-or-more Gnome occurrence has one counterable native Stack trigger');
  f.clearSeen();const single=f.put('Forest','library',f.rival);await f.cast('Rampant Growth',['Forest','Wastes'],{player:f.rival});
  assert.equal(single.zone,'battlefield');assert.equal(single.tapped,true);assert.equal(f.maxTriggers(),1,'single-card search remains a separate qualifying occurrence after declining');
 });
 test(`${role}: paid Cultivate preserves a mixed battlefield and hand search`,async()=>{
  const f=await setup(role),forests=[f.put('Forest','library',f.rival),f.put('Forest','library',f.rival)];
  await f.cast('Cultivate',['Forest','Wastes','Wastes'],{player:f.rival});
  const permanent=forests.find(c=>c.zone==='battlefield'),hand=forests.find(c=>c.zone==='hand');
  assert.ok(permanent);assert.ok(hand);assert.notEqual(permanent,hand);assert.equal(permanent.tapped,true);
  assert.equal(f.maxTriggers(),1,'only the land actually put onto the battlefield supplies a Gnome occurrence');
  assert.equal(f.questions.filter(q=>q.type==='chooseOption'&&q.aiHint?.src===f.source&&q.prompt?.includes('Search for a Plains?')).length,1);
 });
}
