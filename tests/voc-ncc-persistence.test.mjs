import test from 'node:test';
import assert from 'node:assert/strict';
import {M,setup,card,play,activate,settle,fuel,event} from './helpers/voc-ncc-fixtures.mjs';

test('Shorikai Pilot retains its crew power and public ability after a JSON checkpoint restore',async()=>{
 const f=setup(),s=await play(f,'Shorikai, Genesis Engine');s.sick=false;await activate(f,s);
 const pilot=f.game.creatures(f.a).find(c=>c.def.vnPilot);assert.ok(pilot);assert.equal(f.game.vehicleCrewPower(pilot),3);
 const snapshot=M.captureGameState(f.game);assert.ok(snapshot,M.gameStateSnapshotBlockers(f.game).join(', '));
 const next=setup();M.restoreGameState(next.game,JSON.parse(JSON.stringify(snapshot)));const restored=next.game.byIid(pilot.iid);
 assert.equal(next.game.vehicleCrewPower(restored),3);assert.equal(restored.def.vnPilot,true);
 const publicCard=M.onlineCardPresentation(restored,next.b);assert.match(publicCard.def.oracle,/power were 2 greater/);
});

test('Smuggler’s Buggy hideaway card stays private from remote and local AI opponents',async()=>{
 const f=setup();const hidden=card(f,'Colossal Dreadmaw','library');f.decide=(p,q)=>q.type==='chooseCards'&&q.from.includes(hidden)?[hidden]:undefined;
 await play(f,"Smuggler's Buggy");assert.equal(hidden.zone,'exile');assert.equal(hidden.faceDown,true);
 for(const viewer of [f.a,f.b]){
  const row=M.onlineGameViewFor(f.game,viewer).players.find(p=>p.seat===f.a.idx).exile.find(c=>c.token===`c:${hidden.iid}`);
  const bot=M.createBotPlayerView(f.game,viewer.idx).players.find(p=>p.id===f.a.idx).exile.find(c=>c.id===hidden.iid);
  assert.equal(row.hidden,viewer!==f.a);assert.equal(bot.known,viewer===f.a);assert.equal(row.name,viewer===f.a?hidden.name:'Hidden card');
 }
});

test('Timothar retains the last safe checkpoint while a Bat holds an executable exile link',async()=>{
 const f=setup();await play(f,'Timothar, Baron of Bats');const c=card(f,'Vampire Nighthawk');fuel(f.a);f.decide=(p,q)=>q.type==='chooseOption'&&q.options.some(o=>o.key==='yes')?'yes':undefined;
 await f.game.destroy(c);await settle(f.game);const bat=f.game.creatures(f.a).find(c=>c.def.vnTimotharBat);assert.ok(bat);
 assert.equal(M.captureGameState(f.game),null);assert.ok(M.gameStateSnapshotBlockers(f.game).some(s=>s.includes('Timothar')));
 await event(f,'damageToPlayer',{src:bat,player:f.b,combat:true,n:1});assert.equal(c.zone,'battlefield');assert.ok(M.captureGameState(f.game),M.gameStateSnapshotBlockers(f.game).join(', '));
});
