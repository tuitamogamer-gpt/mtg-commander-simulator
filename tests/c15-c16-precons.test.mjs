import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildIntake,precons,sourceDir} from '../scripts/import-c15-c16-precons.mjs';
import {M,setup,card,body,play,activate,event,target,settle} from './helpers/c15-c16-fixtures.mjs';
const intake=JSON.parse(fs.readFileSync(sourceDir+'/intake.json'));
test('C15/C16 preserve ten independent 100-card sources, reuse 474 names and add exactly 142 native definitions',()=>{
 const result=buildIntake(M);assert.equal(result.names.length,616);assert.equal(result.newNames.length,0);assert.equal(intake.newCards,142);assert.equal(intake.reusedCards,474);assert.equal(intake.baselineCards,19690);assert.equal(intake.baselineDecks,42);
 for(const row of precons){const deck=M.DECKS[row.name];assert.equal(deck.cards.reduce((n,c)=>n+c.n,0),100);assert.equal(deck.commander,row.commander);const guide=M.DECK_GUIDES[row.name];assert.ok(guide&&M.DECK_GUIDE_ROUTES[guide.route]);assert.ok(guide.keys.every(n=>deck.cards.some(c=>c.name===n)));assert.ok(M.AI_DECK_PROFILE_HINTS[row.name]);assert.match(M.DECK_META[row.name].set,/Commander \(201[56]\)/);}
 for(const n of intake.newNames){assert.ok(M.DEFS[n]&&M.SCRIPTS[n]);assert.ok(!M.DEFS[n].autoScripted&&!M.DEFS[n].simplified,n);}
});
for(const role of ['human','ai'])test(role+': reused Meren uses canonical experience and returns cheap creatures or expensive cards to hand',async()=>{
 const f=setup(role),m=await play(f,'Meren of Clan Nel Toth'),b=body(f),cheap=card(f,'Llanowar Elves','graveyard');await f.game.destroy(b);await settle(f.game);assert.equal(f.a.counters.experience,1);target(f,cheap);await event(f,'endStep',{player:f.a});assert.equal(cheap.zone,'battlefield');target(f,b);await event(f,'endStep',{player:f.a});assert.equal(b.zone,'hand');assert.equal(m.zone,'battlefield');
});
for(const role of ['human','ai'])test(role+': reused Atraxa proliferates the current player and permanent counter kinds',async()=>{
 const f=setup(role),a=await play(f,"Atraxa, Praetors' Voice"),b=body(f);f.game.addCounters(b,'+1/+1',1);f.a.counters.experience=1;if(role==='human')f.decide=(p,q)=>q.spec?.what==='proliferate'?q.candidates.filter(c=>c===b||c===f.a):undefined;await event(f,'endStep',{player:f.a});assert.equal(b.counters['+1/+1'],2);assert.equal(f.a.counters.experience,2);assert.ok(a.kw('flying')&&a.kw('vigilance')&&a.kw('deathtouch')&&a.kw('lifelink'));
});
for(const role of ['human','ai'])test(role+': reused Breya creates Thopters, pays two artifact sacrifices and damages an opponent',async()=>{
 const f=setup(role),b=await play(f,'Breya, Etherium Shaper');assert.equal(f.game.creatures(f.a).filter(c=>c.hasSub('Thopter')).length,2);f.decide=(p,q)=>{if(q.type==='chooseTargets')return q.candidates.filter(c=>c===f.b);if(q.type==='chooseCards')return q.from.filter(c=>c!==b).slice(0,q.max);if(q.type==='chooseOption'&&q.aiHint?.kind==='mode')return '0';};await activate(f,b);assert.equal(f.b.life,37);assert.equal(f.game.creatures(f.a).filter(c=>c.hasSub('Thopter')).length,0);assert.equal(b.zone,'battlefield');
});
test('new-card runtime smoke recorded all human and local-AI cases without prerequisite gaps',()=>{
 const report=JSON.parse(fs.readFileSync(sourceDir+'/runtime-smoke.json'));assert.equal(report.cards,142);assert.equal(report.results.length,284);assert.deepEqual(report.counts,{'runtime-smoke-pass':284,'prerequisite-gap':0,'choice-gap':0,error:0});
 assert.deepEqual([...new Set(report.results.map(r=>r.name))].sort(),intake.newNames.slice().sort());
});
test('local AI Oreskos Explorer resolves without a search choice when no opponent has more lands',async()=>{
 const f=setup('ai');let searches=0;f.decide=(p,q)=>{if(q.type==='chooseCards'&&q.prompt?.includes('Oreskos Explorer'))searches++;};const before=f.a.hand.length;await play(f,'Oreskos Explorer');assert.equal(searches,0);assert.equal(f.a.hand.length,before);
});
test('Hushwing suppresses counters placed by creature entry, while later counter placement still triggers Fathom Mage',async()=>{
 const f=setup(),gryff=await play(f,'Hushwing Gryff'),thrinax=card(f,'Bloodspore Thrinax');f.game.addCounters(thrinax,'+1/+1',2);await settle(f.game);const before=f.a.hand.length,mage=await play(f,'Fathom Mage');assert.equal(mage.counters['+1/+1'],2);assert.equal(f.a.hand.length,before);f.game.addCounters(mage,'+1/+1',1);await settle(f.game);assert.equal(f.a.hand.length,before+1);assert.equal(gryff.zone,'battlefield');
});
test('experience, dynamic Daxos Spirits and Saskia choices survive JSON save/restore',async()=>{
 const f=setup(),d=await play(f,'Daxos the Returned');f.a.counters.experience=3;await activate(f,d);f.decide=(p,q)=>q.type==='chooseOption'&&q.prompt.includes('choose a player')?String(f.b.idx):undefined;await play(f,'Saskia the Unyielding');const snap=M.captureGameState(f.game);assert.ok(snap,M.gameStateSnapshotBlockers(f.game).join(', '));const fresh=setup();M.restoreGameState(fresh.game,JSON.parse(JSON.stringify(snap)));assert.equal(fresh.a.counters.experience,3);assert.equal(fresh.a.experienceCounters,3);const spirit=fresh.game.creatures(fresh.a).find(c=>c.isToken);assert.equal(spirit.power,3);fresh.a.counters.experience=5;fresh.game.recalc();assert.equal(spirit.power,5);await fresh.game.damagePlayer(spirit,fresh.b,2,{combat:true});await settle(fresh.game);assert.equal(fresh.b.life,36);
 for(const value of [-1,1.5,'3']){const invalid=structuredClone(snap);invalid.players[0].counters.experience=value;assert.throws(()=>M.restoreGameState(fresh.game,invalid),/invalid player experience/);}
});
test('unportable control and linked-exile positions retain the previous checkpoint',async()=>{
 const f=setup();f.game.c1516TurnControls=[{subject:0,controller:1}];assert.equal(M.captureGameState(f.game),null);f.game.c1516TurnControls=[];const b=body(f,f.b);target(f,b);await play(f,'Grasp of Fate');assert.equal(b.zone,'exile');assert.equal(M.captureGameState(f.game),null);
});

for(const role of ['human','ai'])test(role+': base casting costs remain payable when Orim and Urza kicker is unaffordable',async()=>{
 for(const name of ["Orim's Thunder","Urza's Rage"]){const f=setup(role),victim=name==="Orim's Thunder"?card(f,'Sunforger','battlefield',f.b):f.b,c=card(f,name,'hand');let kickers=0;f.decide=(p,q)=>{if(q.aiHint?.kind==='kicker')kickers++;if(q.type==='chooseTargets')return q.candidates.filter(c=>c===victim);};for(const k of Object.keys(f.a.pool))f.a.pool[k]=0;f.a.pool.C=2;f.a.pool[name==="Orim's Thunder"?'W':'R']=1;assert.equal(await f.game.castSpell(f.a,c,{from:'hand'}),true);await settle(f.game);assert.equal(c.castMeta.manaSpent,3);assert.equal(kickers,0);if(name==="Orim's Thunder")assert.equal(victim.zone,'graveyard');else assert.equal(f.b.life,37);}
});
