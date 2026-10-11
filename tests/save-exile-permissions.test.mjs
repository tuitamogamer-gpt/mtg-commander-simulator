import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';

const M=loadEngine();
function table() {
  const game=new M.Game({seed:818,paced:false});
  const controller={decide:async(_g,q)=>{
    if(q.type==='priority')return {kind:'pass'};
    if(q.type==='chooseTargets')return q.candidates.slice(0,q.min||1);
    if(q.type==='chooseCards')return q.from.slice(0,q.min||1);
    if(q.type==='chooseOption')return q.options[0]?.key;
    if(q.type==='orderTriggers')return q.triggers;
    throw Error(`Unexpected exile save decision: ${q.type}`);
  }};
  const player=game.addPlayer('Caster',{name:'Exile save test'},controller,false);
  const rival=game.addPlayer('Owner',{name:'Exile save witness'},controller,false);
  player.turnsStarted=2;rival.turnsStarted=2;
  game.turnPlayer=player;game.turnNo=8;game.phase='main1';game.step='main';
  const put=(name,zone='battlefield',owner=player)=>{
    const card=new M.CardInst(M.DEFS[name],owner);card.zone=zone;card.ctrl=owner;card.sick=false;
    (zone==='battlefield'?game.battlefield:owner[zone]).push(card);game.recalc();return card;
  };
  const restore=()=>{
    const snapshot=M.captureGameState(game);assert.ok(snapshot,M.gameStateSnapshotBlockers(game).join(', '));
    const next=table();M.restoreGameState(next.game,JSON.parse(JSON.stringify(snapshot)));return {...next,snapshot};
  };
  return {game,player,rival,put,restore};
}
const offered=(game,player,card)=>{
  const active=game.turnPlayer;game.turnPlayer=player;
  try{return game.castableList(player).some(row=>row.card===card&&row.from==='exile');}
  finally{game.turnPlayer=active;}
};

test('paid Reckless Impulse keeps its exiled land playable through a JSON save and expires on the correct turn',async()=>{
  const f=table();f.put('Mountain');f.put('Mountain');
  const land=f.put('Island','library');f.put('Sol Ring','library');
  const spell=f.put('Reckless Impulse','hand');
  assert.equal(await f.game.castSpell(f.player,spell,{from:'hand'}),true);
  assert.equal(f.game.playableLands(f.player).includes(land),true);
  const next=f.restore(),restored=next.game.byIid(land.iid);
  assert.equal(next.game.playableLands(next.player).includes(restored),true,'Continue retains the land play granted by the paid spell');
  assert.equal(restored.meta.playableBy,next.player);
  assert.equal(restored.meta.playableUntilOwnTurn,3);
  next.player.turnsStarted=3;
  assert.equal(next.game.playableLands(next.player).includes(restored),true,'the card is still playable during the next own turn');
  next.game.expireOwnTurnExilePermissions(next.player);
  assert.equal(next.game.playableLands(next.player).includes(restored),false,'the permission ends in that turn’s cleanup');
});

test('paid Extract Power retains the caster’s exclusive permission for another player’s face-down card',async()=>{
  const f=table();for(let i=0;i<6;i++)f.put('Island');
  f.put('Forest','library');const stolen=f.put('Ornithopter','library',f.rival);
  const spell=f.put('Extract Power','hand');
  assert.equal(await f.game.castSpell(f.player,spell,{from:'hand'}),true);
  assert.equal(stolen.zone,'exile');assert.equal(stolen.faceDown,true);
  assert.equal(offered(f.game,f.player,stolen),true);assert.equal(offered(f.game,f.rival,stolen),false);
  const next=f.restore(),restored=next.game.byIid(stolen.iid);
  assert.equal(offered(next.game,next.player,restored),true,'the caster keeps the stolen-card offer');
  assert.equal(offered(next.game,next.rival,restored),false,'the original owner does not gain the permission');
  assert.equal(restored.meta.freePlay,true);assert.equal(restored.faceDown,true);
  assert.deepEqual(Array.from(restored.meta.revealedTo),[next.player.idx]);
  assert.equal(await next.game.castSpell(next.player,restored,{from:'exile',alt:{free:true,consumeExilePermission:true}}),true);
  assert.equal(restored.zone,'battlefield');assert.equal(restored.ctrl,next.player);assert.equal(restored.owner,next.rival);
});

test('paid Praetor’s Grasp preserves a permanent exile permission through JSON encoding',async()=>{
  const f=table();for(let i=0;i<3;i++)f.put('Swamp');
  const stolen=f.put('Ornithopter','library',f.rival);f.put('Forest','library',f.rival);
  const spell=f.put("Praetor's Grasp",'hand');
  assert.equal(await f.game.castSpell(f.player,spell,{from:'hand',quickTargets:[f.rival]}),true);
  assert.equal(stolen.zone,'exile');assert.equal(offered(f.game,f.player,stolen),true);
  const next=f.restore(),restored=next.game.byIid(stolen.iid);
  assert.equal(offered(next.game,next.player,restored),true);
  next.game.turnNo=100;
  assert.equal(offered(next.game,next.player,restored),true,'as long as it remains exiled has no turn expiry');
  assert.equal(offered(next.game,next.rival,restored),false);
  assert.equal(await next.game.castSpell(next.player,restored,{from:'exile'}),true);
  assert.equal(restored.zone,'battlefield');assert.equal(restored.ctrl,next.player);assert.equal(restored.owner,next.rival);
});

test('a native Evendo play condition keeps the prior checkpoint until its permission expires',async()=>{
  const f=table();f.put('Evendo Brushrazer');const fetch=f.put('Terramorphic Expanse');
  for(let i=0;i<4;i++)f.put('Forest','library');
  const action=f.game.activatableList(f.player).find(row=>row.card===fetch);
  assert.ok(action);assert.equal(await f.game.activateAbility(f.player,action),true);
  const exiled=f.player.exile.find(card=>typeof card.meta.playableCondition==='function');
  assert.ok(exiled,'sacrificing the real fetch land created Evendo’s conditional permission');
  assert.equal(f.game.playableLands(f.player).includes(exiled),true);
  assert.equal(M.captureGameState(f.game),null,'the executable condition cannot silently become an unconditional permission');
  assert.ok(M.gameStateSnapshotBlockers(f.game).includes('an unsupported exile play condition'));
  f.game.turnNo++;
  assert.equal(f.game.playableLands(f.player).includes(exiled),false);
  assert.ok(M.captureGameState(f.game),'an expired condition does not block later checkpoints indefinitely');
});

test('Chandra’s native conditional exile permission expires without blocking or reviving later saves',async()=>{
  const f=table();for(let i=0;i<6;i++)f.put('Mountain');
  for(const name of ['Squee, the Immortal','Forest','Forest','Lightning Bolt','Murder'])f.put(name,'library');
  const chandra=f.put("Chandra, Hope's Beacon",'hand');
  assert.equal(await f.game.castSpell(f.player,chandra,{from:'hand'}),true);
  const ability=f.game.activatableList(f.player).find(row=>row.card===chandra&&row.ability?.loyalty===1);
  assert.ok(ability);assert.equal(await f.game.activateAbility(f.player,ability),true);
  const exiled=f.player.exile.find(card=>card.name==='Murder');assert.ok(exiled);
  const squee=f.player.exile.find(card=>card.name==='Squee, the Immortal');assert.ok(squee);
  assert.equal(typeof exiled.meta.playableCondition,'function');
  assert.equal(f.game.hasExilePlayPermission(f.player,exiled),true);
  assert.equal(M.captureGameState(f.game),null,'the active callable restriction cannot become an unconditional permission');
  f.game.expireOwnTurnExilePermissions(f.player);
  assert.equal(f.game.hasExilePlayPermission(f.player,exiled),true,'cleanup before the next own turn retains the permission');
  f.player.turnsStarted=3;
  assert.equal(f.game.hasExilePlayPermission(f.player,exiled),true,'the next own turn still allows the spell before cleanup');
  f.game.expireOwnTurnExilePermissions(f.player);
  assert.equal(f.game.hasExilePlayPermission(f.player,exiled),false);
  assert.equal(exiled.meta.playableCondition,undefined,'the expired callable restriction must leave with its permission');
  const next=f.restore();
  for(const card of f.player.exile) {
    const restored=next.game.byIid(card.iid);assert.equal(restored.zone,'exile');
    assert.equal(restored.meta.playableBy,undefined);assert.equal(restored.meta.playableUntilOwnTurn,undefined);
    assert.equal(restored.meta.playableCondition,undefined);
    assert.equal(next.game.hasExilePlayPermission(next.player,restored),false);
    assert.equal(offered(next.game,next.player,restored),false);
    assert.equal(next.game.playableLands(next.player).includes(restored),false);
  }
  for(let i=0;i<3;i++)next.put('Mountain');
  const restoredSquee=next.game.byIid(squee.iid);
  assert.equal(offered(next.game,next.player,restoredSquee),true);
  assert.equal(await next.game.castSpell(next.player,restoredSquee,{from:'exile'}),true);
  assert.equal(restoredSquee.zone,'battlefield','Squee can pay for its native independent exile cast after Continue');
});

test('Chandra’s expired native grant cannot intercept Squee’s independent paid exile cast',async()=>{
  const f=table();for(let i=0;i<6;i++)f.put('Mountain');
  const squee=f.put('Squee, the Immortal','library');
  const chandra=f.put("Chandra, Hope's Beacon",'hand');
  assert.equal(await f.game.castSpell(f.player,chandra,{from:'hand'}),true);
  const ability=f.game.activatableList(f.player).find(row=>row.card===chandra&&row.ability?.loyalty===1);
  assert.ok(ability);assert.equal(await f.game.activateAbility(f.player,ability),true);
  assert.equal(squee.zone,'exile');
  f.player.turnsStarted=3;f.game.expireOwnTurnExilePermissions(f.player);
  for(let i=0;i<3;i++)f.put('Mountain');
  assert.equal(offered(f.game,f.player,squee),true);
  assert.equal(await f.game.castSpell(f.player,squee,{from:'exile'}),true);
  assert.equal(squee.zone,'battlefield');
});

test('Chandra’s active filtered grant leaves Squee’s independent paid cast and its own allowance separate',async()=>{
  const f=table();for(let i=0;i<6;i++)f.put('Mountain');
  const cards={};for(const name of ['Squee, the Immortal','Grizzly Bears','Lightning Bolt','Opt','Forest'])cards[name]=f.put(name,'library');
  const chandra=f.put("Chandra, Hope's Beacon",'hand');
  assert.equal(await f.game.castSpell(f.player,chandra,{from:'hand'}),true);
  const ability=f.game.activatableList(f.player).find(row=>row.card===chandra&&row.ability?.loyalty===1);
  assert.ok(ability);assert.equal(await f.game.activateAbility(f.player,ability),true);
  for(let i=0;i<3;i++)f.put('Mountain');f.put('Island');
  const squee=cards['Squee, the Immortal'],bear=cards['Grizzly Bears'];
  const grant=squee.meta.oracleExilePermissionV22.record;
  const route=f.game.castableList(f.player).find(row=>row.card===squee&&row.alt?.vnPermission==='squee');
  assert.ok(route,'a restricted external grant cannot hide Squee’s printed cast route');
  assert.equal(offered(f.game,f.player,bear),false,'ordinary creatures remain outside Chandra’s spell filter');
  assert.equal(await f.game.castSpell(f.player,bear,{from:'exile',alt:route.alt}),false,'the native permission cannot be forged onto another card');
  assert.equal(await f.game.castSpell(f.player,squee,{from:'exile',alt:{...route.alt,free:true}}),false,'an independent route does not inherit or invent free casting');
  f.game.turnPlayer=f.rival;
  assert.equal(await f.game.castSpell(f.player,squee,{from:'exile',alt:route.alt}),false,'the native route still obeys sorcery timing');
  f.game.turnPlayer=f.player;
  assert.equal(await f.game.castSpell(f.player,squee,{from:'exile',alt:route.alt}),true);
  assert.equal(squee.zone,'battlefield');assert.equal(grant.used.length,0,'using Squee’s own permission does not spend Chandra’s allowance');
  f.put('Mountain');
  const bolt=cards['Lightning Bolt'];
  const granted=f.game.castableList(f.player).find(row=>row.card===bolt&&row.alt?.consumeExilePermission);
  assert.ok(granted);assert.equal(await f.game.castSpell(f.player,bolt,{from:'exile',alt:granted.alt,quickTargets:[f.rival]}),true);
  assert.equal(grant.used.length,1);
  assert.equal(offered(f.game,f.player,cards.Opt),false,'a cast through the filtered grant consumes its shared allowance');
});

test('malformed saved exile permission seats are rejected before replacing the board',()=>{
  const f=table(),card=f.put('Sol Ring','exile');
  card.meta.playableBy=f.player;card.meta.playableUntil=Infinity;
  const snapshot=JSON.parse(JSON.stringify(M.captureGameState(f.game)));
  for(const change of [{exilePlayPlayer:2},{exilePlayPlayer:-1},{exilePlayForever:false},{zone:'hand'}]) {
    const bad=structuredClone(snapshot);Object.assign(bad.cards.find(row=>row.iid===card.iid),change);
    const next=table();next.put('Forest');const before=M.gameStateFingerprint(next.game);
    assert.throws(()=>M.restoreGameState(next.game,bad),/invalid exile play permission/);
    assert.equal(M.gameStateFingerprint(next.game),before);
  }
});

const compiledBlock = f => {
  assert.ok(M.gameStateSnapshotBlockers(f.game).includes('an unsupported compiled exile permission'));
  assert.equal(M.captureGameState(f.game),null);
};

test('paid Galvanic Relay keeps its only-next-turn restriction and resumes from the prior account checkpoint',async()=>{
  const f=table();for(let i=0;i<3;i++)f.put('Mountain');
  const hit=f.put('Ornithopter','library');f.put('Galvanic Relay','hand');
  const board=M.captureGameState(f.game);assert.ok(board);
  const timeline=[],decide=f.player.controller.decide;
  let cast=false;
  f.player.controller={decide:async(g,q)=>{
    const result=q.type==='main'?(cast?{kind:'done'}:(cast=true,{kind:'cast',...q.casts.find(row=>row.card.name==='Galvanic Relay')})):await decide(g,q);
    timeline.push(M.recordSaveDecision(q,f.player,result));return result;
  }};
  await f.game.mainPhase(f.player);
  assert.equal(hit.zone,'exile');assert.equal(offered(f.game,f.player,hit),false);
  compiledBlock(f);
  const setup={deck:'Quandrix Unlimited',commanders:['Zimone, Infinite Analyst'],ai:1,aiDecks:['Elven Council'],aiStyles:['balanced'],seed:'818'};
  const save=JSON.parse(JSON.stringify(M.buildAccountSave(f.game,setup,timeline,'restricted-exile-replay',board,0)));
  M.validateAccountSave(save);assert.deepEqual(save.state,JSON.parse(JSON.stringify(board)));
  const next=table();M.restoreGameState(next.game,save.state);let cursor=0;
  next.player.controller={decide:async(g,q)=>M.restoreSaveDecision(q,next.player,save.decisions[cursor++])};
  await next.game.mainPhase(next.player);
  assert.equal(cursor,timeline.length);assert.deepEqual({...next.player.pool},{...f.player.pool});
  const restored=next.game.byIid(hit.iid);assert.equal(restored.meta.oracleExilePermissionV22.record.duration,'only-next-turn');
  assert.equal(offered(next.game,next.player,restored),false);
  next.player.controller={decide};next.player.turnsStarted++;
  assert.equal(offered(next.game,next.player,restored),true,'replayed grant becomes usable during the next own turn');
  next.player.turnsStarted++;
  assert.equal(offered(next.game,next.player,restored),false);
  const expired=next.restore(),expiredCard=expired.game.byIid(hit.iid);
  assert.equal(offered(expired.game,expired.player,expiredCard),false,'expired compiled metadata cannot revive in a later snapshot');
});

test('paid March of Reckless Joy keeps a shared two-card allowance out of lossy checkpoints',async()=>{
  const f=table();for(let i=0;i<4;i++)f.put('Mountain');
  const hits=Array.from({length:3},()=>f.put('Ornithopter','library')),spell=f.put('March of Reckless Joy','hand');
  assert.equal(await f.game.castSpell(f.player,spell,{from:'hand',xVal:3}),true);
  assert.ok(hits.every(c=>c.zone==='exile'));compiledBlock(f);
  for(const card of hits.slice(0,2))assert.equal(await f.game.castSpell(f.player,card,{from:'exile'}),true);
  assert.equal(offered(f.game,f.player,hits[2]),false,'both native plays consume the shared allowance');
  const next=f.restore();assert.equal(offered(next.game,next.player,next.game.byIid(hits[2].iid)),false,'the exhausted third card stays unavailable');
});

test('paid Lightning keeps source-control exile permission attached to the original source',async()=>{
  const f=table();for(let i=0;i<3;i++)f.put('Mountain');
  const source=f.put('Lightning, Security Sergeant','hand');
  assert.equal(await f.game.castSpell(f.player,source,{from:'hand'}),true);
  for(let i=0;i<3;i++)f.put('Forest','library');
  f.game.turnNo++;source.sick=false;await f.game.runBeginningPhase(f.player);
  const hit=f.put('Ornithopter','library'),decide=f.player.controller.decide;
  f.player.controller={decide:async(g,q)=>q.type==='attackers'?[{card:source,target:f.rival}]:q.type==='blockers'?[]:decide(g,q)};
  f.rival.controller={decide:async(g,q)=>q.type==='blockers'?[]:decide(g,q)};
  await f.game.combatPhase(f.player);f.game.phase='main1';f.game.step='main';
  assert.equal(hit.zone,'exile');assert.equal(offered(f.game,f.player,hit),true);compiledBlock(f);
  await f.game.move(source,'hand');assert.equal(offered(f.game,f.player,hit),false);
  const next=f.restore();assert.equal(offered(next.game,next.player,next.game.byIid(hit.iid)),false);
});

test('paid Opera Love Song preserves next-end-step expiry and allows a later safe snapshot',async()=>{
  const f=table();f.put('Mountain');f.put('Mountain');
  const hit=f.put('Ornithopter','library');f.put('Forest','library');const spell=f.put('Opera Love Song','hand');
  assert.equal(await f.game.castSpell(f.player,spell,{from:'hand',mode:0}),true);
  assert.equal(hit.zone,'exile');assert.equal(offered(f.game,f.player,hit),true);compiledBlock(f);
  await f.game.runEndStepV90(f.player);f.game.phase='main1';
  assert.equal(offered(f.game,f.player,hit),false);
  const next=f.restore();assert.equal(offered(next.game,next.player,next.game.byIid(hit.iid)),false);
});

test('ordinary V22 eot grant from paid Visions of Phyrexia still saves and permits a native cast',async()=>{
  const f=table();for(let i=0;i<4;i++)f.put('Mountain');const source=f.put('Visions of Phyrexia','hand');
  assert.equal(await f.game.castSpell(f.player,source,{from:'hand'}),true);
  f.put('Forest','library');f.put('Forest','library');const hit=f.put('Ornithopter','library');
  f.game.turnNo++;await f.game.runBeginningPhase(f.player);f.game.phase='main1';f.game.step='main';
  assert.equal(hit.meta.oracleExilePermissionV22.record.duration,'eot');
  const next=f.restore(),card=next.game.byIid(hit.iid);
  assert.equal(await next.game.castSpell(next.player,card,{from:'exile'}),true);assert.equal(card.zone,'battlefield');
});

test('ordinary unlimited V22 next-turn grant from paid Monastery Raid still saves and permits a native cast',async()=>{
  const f=table();for(let i=0;i<3;i++)f.put('Mountain');const hit=f.put('Ornithopter','library');f.put('Forest','library');
  const spell=f.put('Monastery Raid','hand');assert.equal(await f.game.castSpell(f.player,spell,{from:'hand'}),true);
  assert.equal(hit.zone,'exile');assert.equal(hit.meta.oracleExilePermissionV22.record.duration,'next-turn');
  const next=f.restore(),card=next.game.byIid(hit.iid);
  assert.equal(await next.game.castSpell(next.player,card,{from:'exile'}),true);assert.equal(card.zone,'battlefield');
});
