import test from 'node:test';
import assert from 'node:assert/strict';
import {M,nativeFixture} from './helpers/second-trigger-fixtures.mjs';

for(const role of ['human','ai']){
 for(const extraMana of [false,true])test(`${role}: Speed's real cast trigger ${extraMana?'pays one and limits blockers':'does not offer an unfunded payment'}`,async()=>{
  const f=nativeFixture(role),speed=await f.cast('Speed, Young Avenger',['Mountain','Wastes']);
  const haste=await f.cast('Fervent Champion',['Mountain']);
  const slow=f.put('Grizzly Bears','battlefield',f.rival),fast=f.put('Raging Goblin','battlefield',f.rival);
  f.targets=q=>q.candidates.includes(haste)?[haste]:undefined;
  const spare=extraMana?f.put('Wastes'):null;
  await f.cast('Arcane Signet',['Wastes','Wastes']);
  const offers=f.questions.filter(q=>q.type==='chooseOption'&&q.aiHint?.src===speed);
  assert.equal(offers.length,extraMana?1:0);
  if(extraMana){
   assert.equal(Object.values(f.me.pool).reduce((a,b)=>a+b,0),0);
   assert.equal(f.game.lands(f.me).filter(c=>c.tapped).length,6,'the two spells plus printed optional cost consume six actual lands');
   assert.equal(typeof haste.cur.cantBeBlockedBy,'function');
   assert.equal(haste.cur.cantBeBlockedBy(f.game,slow),true);
   assert.equal(haste.cur.cantBeBlockedBy(f.game,fast),false);
   assert.ok(spare.zone==='battlefield');
  }else assert.equal(haste.cur.cantBeBlockedBy?.(f.game,slow)||false,false);
 });
 test(`${role}: The Fantasticar counts four actual noncreature casts and sacrifices once`,async()=>{
  const f=nativeFixture(role);f.option=q=>q.aiHint?.kind==='fantasticarSacrifice'?'yes':q.options.some(o=>o.key==='no')?'no':undefined;
  const car=await f.cast('The Fantasticar',['Wastes','Wastes','Wastes']);
  await f.cast('Sol Ring',['Wastes']);assert.equal(car.zone,'battlefield');
  await f.cast('Arcane Signet',['Wastes','Wastes']);assert.equal(car.zone,'battlefield');
  await f.cast('Monologue Tax',['Plains','Wastes','Wastes']);
  assert.equal(f.me.turnState.spellsCastList.length,4,'the artifact itself was the real first noncreature cast');
  assert.equal(car.zone,'graveyard');
  const constructs=f.game.creatures(f.me).filter(c=>c.isToken&&c.name==='Construct Token');
  assert.equal(constructs.length,4);assert.equal(constructs.every(c=>c.kw('flying')&&c.kw('haste')),true);
 });
 test(`${role}: native commander replacement cannot reuse Edgar's old battlefield Eminence trigger`,async()=>{
  const f=nativeFixture(role),edgar=f.put('Edgar Markov');edgar.commander=true;
  const bounce=f.put('Unsummon','hand');f.put('Island');f.put('Island');let responded=false;
  f.priority=q=>{
   if(q.player!==f.me||responded||!q.stack.some(so=>so.kind==='trigger'&&so.srcCard===edgar))return;
   const offer=q.casts.find(e=>e.card===bounce);assert.ok(offer,'the real response is offered');responded=true;
   return{kind:'cast',card:bounce,from:offer.from,alt:offer.alt,quickTargets:[edgar]};
  };
  const version=edgar.zoneVersion;
  await f.cast('Vampire Nighthawk',['Swamp','Swamp','Wastes']);
  assert.equal(responded,true);assert.equal(bounce.castMeta.manaSpent,1);
  assert.equal(edgar.zone,'command');assert.ok(edgar.zoneVersion>version);
  assert.equal(f.game.creatures(f.me).filter(c=>c.isToken&&c.hasSub('Vampire')).length,0);
  await f.cast('Blood Artist',['Swamp','Wastes']);
  assert.equal(f.game.creatures(f.me).filter(c=>c.isToken&&c.hasSub('Vampire')).length,1,'a later paid Vampire uses the new command-zone incarnation');
 });
 test(`${role}: Watcher's Warning natively exiles each opponent's actual first spell top card`,async()=>{
  const f=nativeFixture(role);f.option=q=>q.aiHint?.kind==='freeCast'?'no':undefined;
  await f.cast("The Watcher's Warning",['Island','Island','Wastes','Wastes','Wastes','Wastes','Wastes']);
  const other=f.game.addPlayer('Other native opponent',{name:'Third spell payer'},f.rival.controller,false);
  for(let i=0;i<20;i++)f.put('Island','library',other);
  const first=f.put('Sol Ring','library',f.rival),second=f.put('Arcane Signet','library',other);
  const versions=[first.zoneVersion,second.zoneVersion];
  await f.cast('Opt',['Island'],{player:f.rival});
  await f.cast('Opt',['Island'],{player:other});
  assert.equal(first.zone,'exile');assert.equal(second.zone,'exile');
  assert.equal(first.zoneVersion,versions[0]+1,'actual exile creates a new object');
  assert.equal(second.zoneVersion,versions[1]+1);
  const untouched=f.put('Sol Ring','library',f.rival);
  await f.cast('Opt',['Island'],{player:f.rival});
  assert.equal(untouched.zone,'hand','the second Opt draws normally without another first-spell exile');
 });
 test(`${role}: Watcher's Warning offers a real free cast of the exiled opposing card`,async()=>{
  const f=nativeFixture(role);
  await f.cast("The Watcher's Warning",['Island','Island','Wastes','Wastes','Wastes','Wastes','Wastes']);
  const top=f.put('Sol Ring','library',f.rival);
  await f.cast('Opt',['Island'],{player:f.rival});
  assert.equal(top.zone,'battlefield','the printed permission actually casts and resolves the opposing card');
  assert.equal(top.ctrl,f.me);assert.equal(top.owner,f.rival);
  assert.equal(top.castMeta.from,'exile');assert.equal(top.castMeta.manaSpent,0);
  assert.equal(top.zoneVersion,2,'native exile and subsequent battlefield entry advance the object version');
 });
 test(`${role}: a declined Watcher commander cast leaves the native exile SBA choice available`,async()=>{
  const f=nativeFixture(role);
  await f.cast("The Watcher's Warning",['Island','Island','Wastes','Wastes','Wastes','Wastes','Wastes']);
  const commander=f.put('Edgar Markov','library',f.rival);commander.commander=true;
  const before=commander.zoneVersion;
  f.option=q=>{if(q.aiHint?.kind==='freeCast'&&q.aiHint.card===commander){
   assert.equal(commander.zone,'exile','a commander actually enters exile before its SBA choice');
   assert.equal(commander.zoneVersion,before+1);return 'no';
  }};
  await f.cast('Opt',['Island'],{player:f.rival});
  assert.equal(commander.zone,'command','the owner accepts the native commander SBA choice after resolution');
  assert.equal(commander.zoneVersion,before+2);
  assert.equal(f.questions.filter(q=>q.aiHint?.kind==='freeCast'&&q.aiHint?.card===commander).length,1);
  assert.equal(commander.castMeta?.wasCast||false,false,'declining the cast leaves the commander uncast');
 });
 test(`${role}: a Watcher can legally cast an exiled commander before the next SBA`,async()=>{
  const f=nativeFixture(role);
  await f.cast("The Watcher's Warning",['Island','Island','Wastes','Wastes','Wastes','Wastes','Wastes']);
  const commander=f.put('Edgar Markov','library',f.rival);commander.commander=true;
  await f.cast('Opt',['Island'],{player:f.rival});
  assert.equal(commander.zone,'battlefield');assert.equal(commander.ctrl,f.me);assert.equal(commander.owner,f.rival);
  assert.equal(commander.castMeta.from,'exile');assert.equal(commander.castMeta.manaSpent,0);
  assert.equal(commander.zoneVersion,2);
  assert.equal(f.questions.filter(q=>q.aiHint?.kind==='commanderZone'&&q.aiHint.card===commander).length,0);
 });
 test(`${role}: a declined Watcher opportunity grants no late permission after real zone roundtrip`,async()=>{
  const f=nativeFixture(role);f.option=q=>q.aiHint?.kind==='freeCast'?'no':undefined;
  await f.cast("The Watcher's Warning",['Island','Island','Wastes','Wastes','Wastes','Wastes','Wastes']);
  const bear=f.put('Grizzly Bears','library',f.rival);
  await f.cast('Opt',['Island'],{player:f.rival});assert.equal(bear.zone,'exile');
  const originalExileVersion=bear.zoneVersion;
  assert.equal(f.game.castableList(f.me).some(e=>e.card===bear),false);
  f.targets=q=>q.candidates.includes(bear)?[bear]:undefined;
  await f.cast('Pull from Eternity',['Plains']);assert.equal(bear.zone,'graveyard');
  await f.cast('Reanimate',['Swamp']);assert.equal(bear.zone,'battlefield');
  await f.cast('Swords to Plowshares',['Plains']);assert.equal(bear.zone,'exile');
  assert.equal(bear.zoneVersion,originalExileVersion+3);
  f.put('Forest');f.put('Wastes');
  assert.equal(f.game.canPayMana(f.me,M.parseCost(bear.def.cost),{kind:'spell',card:bear,ctrl:f.me,castOpts:{},from:'exile',x:0}),true,'the late spell has real mana available');
  assert.equal(f.game.castableList(f.me).some(e=>e.card===bear),false);
  assert.equal(f.game.castableList(f.rival).some(e=>e.card===bear),false);
  assert.equal(await f.game.castSpell(f.me,bear,{from:'exile'}),false,'the old declined immediate opportunity cannot be exercised later');
  assert.equal(bear.zone,'exile');
 });
}
