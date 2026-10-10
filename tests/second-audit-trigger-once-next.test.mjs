import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeFixture} from './helpers/second-trigger-fixtures.mjs';

const sourceTriggers=(f,s)=>f.game.stack.filter(so=>so.kind==='trigger'&&so.srcCard===s);
async function resolveToSourceEvent(f,s){
 await f.game.flushTriggers();
 while(f.game.stack.length&&!sourceTriggers(f,s).length)await f.game.resolveTop();
}
for(const role of ['human','ai']){
 test(`${role}: paid Planetarium declines one native scry, casts on the next, then stops`,async()=>{
  const f=nativeFixture(role),source=await f.cast('Planetarium of Wan Shi Tong',Array(6).fill('Wastes'));
  let accept=false,opportunities=0;
  f.cards=q=>{
   if(q.prompt?.startsWith('You may cast one of these cards')&&q.from.every(c=>c.zone==='library')){
    opportunities++;return accept?[q.from[0]]:[];
   }
  };
  const first=f.put('Ornithopter','library');f.put('Island','library');await f.cast('Opt',['Island']);
  assert.equal(first.zone,'library');assert.equal(opportunities,1);
  accept=true;const second=f.put('Ornithopter','library');f.put('Island','library');await f.cast('Opt',['Island']);
  assert.equal(second.zone,'battlefield');assert.equal(second.castMeta.from,'library');assert.equal(second.castMeta.manaSpent,0);
  assert.equal(opportunities,2);
  const third=f.put('Ornithopter','library');f.put('Island','library');await f.cast('Opt',['Island'],{settle:false});
  await resolveToSourceEvent(f,source);assert.equal(sourceTriggers(f,source).length,0,'the printed action limit suppresses later scry triggers');
  await f.settle();assert.equal(third.zone,'library');assert.equal(opportunities,2);
 });
 test(`${role}: paid Lucy shares a single accepted use between simultaneous native token entries`,async()=>{
  const f=nativeFixture(role),source=await f.cast('Lucy MacLean, Positively Armed',['Plains','Wastes','Wastes','Wastes','Wastes']);
  let decline=true,offers=0;f.targets=q=>q.candidates.includes(f.rival)?[f.rival]:undefined;
  f.option=q=>{if(q.prompt==='Create a copy of the token?'){offers++;return decline?'no':'yes';}};
  await f.cast('Raise the Alarm',['Plains','Wastes']);assert.equal(offers,2,JSON.stringify({
   nativeTokens:f.game.creatures(f.me).filter(c=>c.isToken).map(c=>({name:c.name,token:c.isToken})),
   questions:f.questions.filter(q=>['chooseTargets','chooseOption'].includes(q.type)).map(q=>({type:q.type,prompt:q.prompt,
    candidates:q.candidates?.map(c=>c.name),options:q.options?.map(o=>o.key)})),
  }));
  assert.equal(f.game.creatures(f.rival).filter(c=>c.isToken).length,0);
  decline=false;const before=f.me.hand.length;
  await f.cast('Raise the Alarm',['Plains','Wastes']);assert.equal(offers,3);
  assert.equal(f.game.creatures(f.rival).filter(c=>c.isToken).length,1);assert.equal(f.me.hand.length,before+1);
  await f.cast('Raise the Alarm',['Plains','Wastes'],{settle:false});await resolveToSourceEvent(f,source);
  assert.equal(sourceTriggers(f,source).length,0);await f.settle();assert.equal(offers,3);
 });
 test(`${role}: paid Priority Boarding may decline one actual die and reveal on a later die`,async()=>{
  const f=nativeFixture(role),source=await f.cast('Priority Boarding',['Mountain','Wastes','Wastes']);
  let accept=false,reveals=0;
  f.option=q=>{if(q.prompt==='Reveal the top card?'){reveals++;return accept?'yes':'no';}if(q.prompt?.startsWith('Exile and play '))return 'yes';};
  const first=f.put('Ornithopter','library');
  await f.cast('Neverwinter Hydra',['Forest','Forest','Wastes','Wastes'],{xVal:1});
  assert.equal(reveals,1);assert.equal(first.zone,'library');
  accept=true;const second=f.put('Ornithopter','library');
  await f.cast('Neverwinter Hydra',['Forest','Forest','Wastes','Wastes'],{xVal:1});
  assert.equal(reveals,2);assert.equal(second.zone,'exile');assert.equal(f.game.castableList(f.me).some(e=>e.card===second),true,'the accepted native reveal grants the printed play permission');
  const third=f.put('Ornithopter','library');
  await f.cast('Neverwinter Hydra',['Forest','Forest','Wastes','Wastes'],{xVal:1,settle:false});
  await resolveToSourceEvent(f,source);assert.equal(sourceTriggers(f,source).length,0);await f.settle();
  assert.equal(reveals,2);assert.equal(third.zone,'library');
 });
 test(`${role}: paid Lucy copies an actual opposing token under her controller without an opponent-copy draw`,async()=>{
  const f=nativeFixture(role);await f.cast('Lucy MacLean, Positively Armed',['Plains','Wastes','Wastes','Wastes','Wastes']);
  f.targets=q=>q.candidates.includes(f.me)?[f.me]:undefined;const before=f.me.hand.length;
  await f.cast('Raise the Alarm',['Plains','Wastes'],{player:f.rival});
  assert.equal(f.game.creatures(f.rival).filter(c=>c.isToken).length,2);
  assert.equal(f.game.creatures(f.me).filter(c=>c.isToken).length,1);
  assert.equal(f.me.hand.length,before,'copying under the holder does not satisfy opponent-created-token draw');
 });
 test(`${role}: paid Lucy keeps her action available after protected players prevent targeting`,async()=>{
  const f=nativeFixture(role);await f.cast('Lucy MacLean, Positively Armed',['Plains','Wastes','Wastes','Wastes','Wastes']);
  await f.cast('Blossoming Calm',['Plains'],{player:f.rival});
  f.targets=q=>q.candidates.includes(f.rival)?[f.rival]:undefined;
  await f.cast('Raise the Alarm',['Plains','Wastes']);
  assert.equal(f.game.creatures(f.rival).filter(c=>c.isToken).length,0);
  const tower=f.put('Detection Tower','hand');assert.equal(await f.game.playLand(f.me,tower),true);
  await f.activate(tower,['Wastes'],()=>true);
  const before=f.me.hand.length;await f.cast('Raise the Alarm',['Plains','Wastes']);
  assert.equal(f.game.creatures(f.rival).filter(c=>c.isToken).length,1,'the actual tower activation permits targeting through player hexproof');
  assert.equal(f.me.hand.length,before+1);
 });
 test(`${role}: paid Night Shift declines a native die and pays exactly one life on the next result`,async()=>{
  const f=nativeFixture(role);await f.cast('Night Shift of the Living Dead',['Swamp','Wastes','Wastes','Wastes']);
  let adjustments=0;f.option=q=>{if(q.prompt?.startsWith('Pay 1 life to adjust die ')){adjustments++;return adjustments===1?'no':'up';}};
  await f.cast('Neverwinter Hydra',['Forest','Forest','Wastes','Wastes','Wastes','Wastes'],{xVal:2});
  assert.equal(adjustments,2);assert.equal(f.me.life,39);
  const roll=f.events.find(e=>e.type==='diceRolled');
  assert.equal(roll.raw.length,2);assert.deepEqual(Array.from(roll.results),[roll.raw[0],roll.raw[1]+1]);
  await f.cast('Neverwinter Hydra',['Forest','Forest','Wastes','Wastes'],{xVal:1});
  assert.equal(adjustments,2);assert.equal(f.me.life,39);
 });
 test(`${role}: paid Riveteers Ascendancy declines one real sacrifice and returns only one later creature`,async()=>{
  const f=nativeFixture(role),source=await f.cast('Riveteers Ascendancy',['Swamp','Mountain','Forest']);
  const seer=await f.cast('Viscera Seer',['Swamp']);
  const bears=[];for(let i=0;i<3;i++)bears.push(await f.cast('Grizzly Bears',['Forest','Wastes']));
  const dead=Array.from({length:3},()=>f.put('Ornithopter','graveyard'));
  let decline=true,offers=0,index=0;
  f.option=q=>{if(q.aiHint?.src===source||q.aiHint?.card===source){offers++;return decline?'no':'yes';}};
  f.targets=q=>{const c=dead.find(c=>q.candidates.includes(c));return c?[c]:undefined;};
  f.cards=q=>{const c=bears[index];return q.from.includes(c)?[c]:undefined;};
  await f.activate(seer,[],()=>true);index++;assert.equal(offers,1);assert.equal(dead.filter(c=>c.zone==='battlefield').length,0);
  decline=false;await f.activate(seer,[],()=>true);index++;assert.equal(offers,2);
  assert.equal(dead.filter(c=>c.zone==='battlefield').length,1);assert.equal(dead.find(c=>c.zone==='battlefield').tapped,true);
  await f.activate(seer,[],()=>true,false);await f.game.flushTriggers();assert.equal(sourceTriggers(f,source).length,0);
  await f.settle();assert.equal(offers,2);assert.equal(dead.filter(c=>c.zone==='battlefield').length,1);
 });
}
