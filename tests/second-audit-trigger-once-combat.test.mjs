import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeFixture} from './helpers/second-trigger-fixtures.mjs';

for(const role of ['human','ai']){
 test(`${role}: paid Calix declines first-strike damage, copies on regular damage, then stops in a paid extra combat`,async()=>{
  const f=nativeFixture(role),calix=await f.cast('Calix, Guided by Fate',['Forest','Plains','Wastes']);
  f.targets=q=>q.candidates.includes(calix)?[calix]:undefined;
  await f.cast('Fervor',['Mountain','Wastes','Wastes']);
  const model=await f.cast('Glorious Anthem',['Plains','Plains','Wastes']);
  await f.cast("Duelist's Heritage",['Plains','Wastes','Wastes']);
  const extra=f.put('Relentless Assault','hand');f.put('Mountain');f.put('Mountain');f.put('Wastes');f.put('Wastes');
  let copyOffers=0,extraChosen=false;
  f.cards=q=>{if(q.prompt==='Create a copy of a nonlegendary enchantment'){
   copyOffers++;return copyOffers===1?[]:[model];
  }};
  f.main=q=>{
   if(q.phase==='main2'&&!extraChosen){const offered=q.casts.find(e=>e.card===extra);assert.ok(offered,'the actual paid extra-combat spell is offered');
    extraChosen=true;return{kind:'cast',card:extra,from:offered.from,alt:offered.alt};
   }
  };
  f.attackers=q=>q.eligible.includes(calix)?[{card:calix,target:f.rival}]:[];
  await f.game.runTurn();await f.settle();
  assert.equal(extraChosen,true);assert.equal(extra.castMeta.manaSpent,4);
  assert.equal(f.me.turnState.combatPhaseCount,2,'the second combat comes from the paid printed spell');
  assert.equal(copyOffers,2,'declining the first damage leaves the regular-damage opportunity, and using it stops the extra combat');
  const copies=f.game.bf().filter(c=>c.isToken&&c.name===model.name);assert.equal(copies.length,1);
  assert.ok(f.rival.life<40&&f.rival.life>0,'actual unblocked combat damage reached the opponent');
 });
 test(`${role}: paid Rinoa declines a real attacking-creature death and returns only one later attacker`,async()=>{
  const f=nativeFixture(role),rinoa=await f.cast('Rinoa, Angel Wing',['Plains','Wastes','Wastes']);
  await f.cast('Fervor',['Mountain','Wastes','Wastes']);
  const bears=[];for(let i=0;i<3;i++)bears.push(await f.cast('Grizzly Bears',['Forest','Wastes']));
  const kills=Array.from({length:3},()=>f.put('Fatal Push','hand'));for(let i=0;i<3;i++)f.put('Swamp');
  let killIndex=0,returnOffers=0;
  f.attackers=q=>bears.filter(c=>q.eligible.includes(c)).map(card=>({card,target:f.rival}));
  f.cards=q=>{if(q.prompt==='Return one attacking creature tapped with a flying counter'){
   returnOffers++;return returnOffers===1?[]:[bears[1]];
  }};
  f.priority=q=>{
   if(q.player!==f.me||f.game.step!=='attackers'||killIndex>=kills.length||
      killIndex&&kills[killIndex-1].zone!=='graveyard'||q.stack.some(so=>so.kind==='trigger'&&so.srcCard===rinoa))return;
   const offered=q.casts.find(e=>e.card===kills[killIndex]);if(!offered)return;
   const target=bears[killIndex],card=kills[killIndex++];
   assert.equal(target.attacking,f.rival,'the real declared attacker is still attacking when removal is announced');
   return{kind:'cast',card,from:offered.from,alt:offered.alt,quickTargets:[target]};
  };
  await f.game.combatPhase(f.me);await f.settle();
  assert.equal(killIndex,3);assert.equal(kills.every(c=>c.castMeta.manaSpent===1&&c.zone==='graveyard'),true);
  assert.equal(returnOffers,2);assert.equal(bears[0].zone,'graveyard');assert.equal(bears[2].zone,'graveyard');
  assert.equal(bears[1].zone,'battlefield');assert.equal(bears[1].tapped,true);
  assert.equal(bears[1].counters.flying,1);assert.equal(bears[1].kw('flying'),true);
  assert.equal(f.rival.life,40,'returned attackers are outside the original combat');
 });
}
