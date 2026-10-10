import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeFixture} from './helpers/second-trigger-fixtures.mjs';

async function flashRival(f){
 const orrery=await f.cast('Vedalken Orrery',Array(4).fill('Wastes'));
 f.targets=q=>q.candidates.includes(orrery)?[orrery]:q.candidates.includes(f.rival)?[f.rival]:undefined;
 await f.cast('Donate',['Island','Wastes','Wastes']);assert.equal(orrery.ctrl,f.rival);
}
const choices=(f,source)=>f.questions.filter(q=>q.type==='chooseOption'&&q.aiHint?.src===source&&q.prompt?.includes('Search for a Plains?'));
for(const role of ['human','ai']){
 test(`${role}: paid Deep Gnome accepts a legal empty search and consumes its action`,async()=>{
  const f=nativeFixture(role);await flashRival(f);const source=await f.cast('Deep Gnome Terramancer',['Plains','Wastes']);
  const plains=f.put('Plains','hand');assert.equal(f.game.canSearchLibrary(f.me),true);assert.equal(f.me.library.some(c=>c.hasSub('Plains')),false);
  f.cards=q=>q.from?.length?[q.from.find(c=>c.name==='Forest')||q.from[0]]:undefined;
  f.put('Forest','library',f.rival);await f.cast('Rampant Growth',['Forest','Wastes'],{player:f.rival});
  assert.equal(choices(f,source).length,1,'a legal search may fail to find a Plains');
  f.cards=q=>q.prompt?.includes('Brainstorm')?[plains,q.from.find(c=>c!==plains)]:q.from?.length?[q.from.find(c=>c.name==='Forest')||q.from.find(c=>c.name==='Plains')||q.from[0]]:undefined;
  await f.cast('Brainstorm',['Island']);assert.equal(plains.zone,'library','actual Brainstorm makes a later Plains available');
  f.put('Forest','library',f.rival);await f.cast('Rampant Growth',['Forest','Wastes'],{player:f.rival});
  assert.equal(plains.zone,'library','an accepted empty search still consumes the action limit');assert.equal(choices(f,source).length,1);
 });
 test(`${role}: paid Deep Gnome triggers once for two simultaneous returned lands`,async()=>{
  const f=nativeFixture(role);await flashRival(f);const source=await f.cast('Deep Gnome Terramancer',['Plains','Wastes']);
  f.option=q=>q.aiHint?.src===source&&q.prompt?.includes('Search for a Plains?')?'no':undefined;
  const forests=[f.put('Forest','graveyard',f.rival),f.put('Forest','graveyard',f.rival)];
  let maxTriggers=0;const batches=new Set(),prior=f.game.onEvent;
  f.game.onEvent=e=>{prior(e);if(e.type==='stack'){const triggers=f.game.stack.filter(so=>so.kind==='trigger'&&so.srcCard===source);maxTriggers=Math.max(maxTriggers,triggers.length);for(const so of triggers)batches.add(so.ctx.data.oracleBatch);}};
  await f.cast('Planar Birth',['Plains','Wastes']);
  assert.equal(forests.every(c=>c.zone==='battlefield'&&c.tapped),true,'both lands actually enter through the native graveyard return batch');
  assert.equal(batches.size,1);assert.ok([...batches][0],'the first two returned lands share one actual native entry batch');
  assert.equal(maxTriggers,1,'printed one-or-more land entry has a single counterable trigger');assert.equal(choices(f,source).length,1);
  const versions=forests.map(c=>c.zoneVersion);f.targets=q=>forests.every(c=>q.candidates.includes(c))?forests:undefined;
  await f.cast('Ghostly Flicker',['Island','Wastes','Wastes'],{player:f.rival});
  assert.equal(forests.every((c,i)=>c.zone==='battlefield'&&c.zoneVersion===versions[i]+2),true,'actual paid Flicker returns the same opponent\'s two new land incarnations together');
  assert.equal(batches.size,2,'two declined native entry batches for the same opponent trigger separately');
  assert.equal(choices(f,source).length,2,'declining the first event leaves the later single-land action available');
 });
 test(`${role}: paid Deep Gnome retains distinct opponents in one land entry event`,async()=>{
  const f=nativeFixture(role),third=f.game.addPlayer('Third native opponent',{name:'Gnome grouping control'},f.rival.controller,false);
  const source=await f.cast('Deep Gnome Terramancer',['Plains','Wastes']);
  const lands=[f.put('Forest','graveyard',f.rival),f.put('Mountain','graveyard',third)];
  f.option=q=>q.aiHint?.src===source&&q.prompt?.includes('Search for a Plains?')?'no':undefined;
  let maxTriggers=0;const batches=new Set(),prior=f.game.onEvent;
  f.game.onEvent=e=>{prior(e);if(e.type==='stack'){const triggers=f.game.stack.filter(so=>so.kind==='trigger'&&so.srcCard===source);maxTriggers=Math.max(maxTriggers,triggers.length);for(const so of triggers)batches.add(so.ctx.data.oracleBatch);}};
  await f.cast('Planar Birth',['Plains','Wastes']);
  assert.equal(lands.every(c=>c.zone==='battlefield'&&c.tapped),true,'actual Planar Birth returns both opponents\' native lands');
  assert.equal(batches.size,1,'both opponents\' trigger receipts use the same native simultaneous entry batch');assert.ok([...batches][0]);
  assert.equal(maxTriggers,2,'each opponent supplies a distinct one-or-more occurrence');assert.equal(choices(f,source).length,2);
 });
}
