import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {context, put, settle, fixtureEngine} from './helpers/oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M=loadEngine();
const fund=p=>{for(const c of ['W','U','B','R','G','C'])p.pool[c]=25;};
const total=p=>Object.values(p.pool).reduce((a,b)=>a+b,0);
async function cast(f,name,p=f.a,targets=[],options={}) {
  const card=put(M,f.game,p,name,'hand');fund(p);const before=total(p);
  assert.equal(await f.game.castSpell(p,card,{from:'hand',quickTargets:targets,...options}),true,name);
  assert.ok(total(p)<before,name+': mana was actually paid');return card;
}
async function commander(f,name='Child of Alara') {
  const card=put(M,f.game,f.a,name,'command');card.commander=true;f.a.commanders.push(card);fund(f.a);
  const before=total(f.a);assert.equal(await f.game.castSpell(f.a,card,{from:'command'}),true);
  assert.ok(total(f.a)<before);await settle(f.game);assert.equal(card.zone,'battlefield');return card;
}
function commandChoice(player,run) {
  const decide=player.controller.decide.bind(player.controller);
  player.controller.decide=async(g,q)=>q.aiHint?.kind==='commanderZone'?run(g,q):decide(g,q);
}

for(const role of ['human','ai']) {
  test(`${role}: paid Murder lets Child of Alara die and trigger even after the owner chooses command`,async()=>{
    const f=context(M,role),source=await commander(f),bear=put(M,f.game,f.b,'Grizzly Bears'),version=source.zoneVersion;
    const spell=await cast(f,'Murder',f.b,[source]);await f.game.resolveTop();
    assert.equal(source.zone,'command');assert.equal(source.zoneVersion,version+2);
    assert.equal(spell.zone,'graveyard');assert.equal(bear.zone,'battlefield');
    assert.ok(f.game.diedThisTurn.some(snap=>snap.iid===source.iid&&snap.zoneVersion===version));
    assert.equal(f.game.stack.filter(so=>so.srcCard===source&&so.kind==='trigger').length,1);
    await settle(f.game);assert.equal(bear.zone,'graveyard');assertGameStateInvariants(f.game);
  });
  test(`${role}: Swords finishes exile and life gain before commander SBA asks its owner`,async()=>{
    const f=context(M,role),source=await commander(f),life=f.a.life,power=source.power;let choices=0;
    const decide=f.a.controller.decide.bind(f.a.controller);
    commandChoice(f.a,async(g,q)=>{choices++;assert.equal(source.zone,'exile');assert.equal(f.a.life,life+power);assert.equal(g._stackResolutionDepth,0);return decide(g,q);});
    await cast(f,'Swords to Plowshares',f.b,[source]);await f.game.resolveTop();
    assert.equal(choices,1);assert.equal(source.zone,'command');assert.equal(f.game.diedThisTurn.length,0);
  });
  test(`${role}: a paid immediate Cloudshift returns the commander without offering an exile SBA`,async()=>{
    const f=context(M,role),source=await commander(f),version=source.zoneVersion;let choices=0;
    commandChoice(f.a,()=>{choices++;return 'cz';});
    await cast(f,'Cloudshift',f.a,[source]);await settle(f.game);
    assert.equal(source.zone,'battlefield');assert.equal(source.zoneVersion,version+2);assert.equal(choices,0);
    await f.game.checkSBA();assert.equal(choices,0);assert.equal(source.meta.commanderZoneEntry,undefined);
  });
  test(`${role}: a countered paid commander reaches the graveyard before command SBA and still pays tax on recast`,async()=>{
    const f=context(M,role),source=put(M,f.game,f.a,'Child of Alara','command');source.commander=true;f.a.commanders.push(source);fund(f.a);
    assert.equal(await f.game.castSpell(f.a,source,{from:'command'}),true);const original=f.game.stack.at(-1);
    await cast(f,'Counterspell',f.b,[original]);await f.game.resolveTop();assert.equal(source.zone,'command');assert.equal(source.cmdCasts,1);
    fund(f.a);const before=total(f.a);assert.equal(await f.game.castSpell(f.a,source,{from:'command'}),true);assert.equal(before-total(f.a),7);await settle(f.game);assert.equal(source.cmdCasts,2);
  });
  test(`${role}: Rest in Peace replaces a commander death with real exile, then command is a separate SBA`,async()=>{
    const f=context(M,role),source=await commander(f);await cast(f,'Rest in Peace',f.a);await settle(f.game);
    await cast(f,'Murder',f.b,[source]);await f.game.resolveTop();assert.equal(source.zone,'command');
    assert.equal(f.game.diedThisTurn.some(row=>row.iid===source.iid),false);assert.equal(f.game.stack.some(so=>so.srcCard===source),false);
  });
  test(`${role}: declining one entry is final until the commander changes zones again`,async()=>{
    const f=context(M,role),source=await commander(f);let choices=0;
    commandChoice(f.a,()=>{choices++;return choices===1?'stay':'cz';});
    await f.game.move(source,'graveyard');assert.equal(choices,0);assert.equal(source.zone,'graveyard');
    await f.game.checkSBA();assert.equal(choices,1);assert.equal(source.zone,'graveyard');
    await f.game.checkSBA();await f.game.flushTriggers();assert.equal(choices,1);
    await f.game.move(source,'exile');assert.equal(source.zone,'exile');await f.game.checkSBA();assert.equal(choices,2);assert.equal(source.zone,'command');
  });
  test(`${role}: hand and library still replace the destination without a graveyard or exile entry`,async()=>{
    for(const zone of ['hand','library']) {
      const f=context(M,role),source=await commander(f);let choices=0;
      commandChoice(f.a,(_g,q)=>{choices++;assert.equal(source.zone,'battlefield');assert.equal(q.aiHint.toZone,zone);return 'cz';});
      if(zone==='hand'){await cast(f,'Unsummon',f.b,[source]);await settle(f.game);}else await f.game.move(source,'library');
      assert.equal(source.zone,'command');assert.equal(choices,1);assert.equal(source.meta.commanderZoneEntry,undefined);assert.equal(f.game.diedThisTurn.length,0);
    }
  });
  test(`${role}: simultaneous commander choices are APNAP and see every prior exile before any command move`,async()=>{
    const f=context(M,role),first=await commander(f),second=put(M,f.game,f.b,'Child of Alara');second.commander=true;f.b.commanders.push(second);const order=[];
    for(const p of [f.a,f.b])commandChoice(p,()=>{order.push(p.idx);assert.equal(first.zone,'exile');assert.equal(second.zone,'exile');return 'cz';});
    f.game.turnPlayer=f.b;await f.game.exileMany([first,second]);assert.equal(order.length,0);await f.game.checkSBA();
    assert.deepEqual(order,[f.b.idx,f.a.idx]);assert.equal(first.zone,'command');assert.equal(second.zone,'command');
  });
  test(`${role}: pending commander zone identity survives a local AI clone and a JSON checkpoint`,async()=>{
    const f=context(M,role),source=await commander(f);await f.game.move(source,'exile');
    const clone=M.cloneGameForAISimulation(f.game,90309),copy=clone.byIid(source.iid);await clone.checkSBA();assert.equal(copy.zone,'command');assert.equal(source.zone,'exile');
    const snapshot=M.captureGameState(f.game);assert.ok(snapshot,JSON.stringify(M.gameStateSnapshotBlockers(f.game)));
    const fresh=context(M,role);M.restoreGameState(fresh.game,JSON.parse(JSON.stringify(snapshot)));await fresh.game.checkSBA();assert.equal(fresh.game.byIid(source.iid).zone,'command');assert.equal(source.zone,'exile');
  });
  test(`${role}: real Rile draws before lethal SBA and queues the death benefit after the original spell`,async()=>{
    const f=context(M,role);const bird=await cast(f,'Suntail Hawk');await settle(f.game);const har=await cast(f,'Grim Haruspex');await settle(f.game);
    const rile=await cast(f,'Rile',f.a,[bird]),before=f.a.hand.length;let died=false;const emit=f.game.emit;
    f.game.emit=async function(name,data){if(name==='dies'&&data.card===bird){died=true;assert.equal(rile.zone,'graveyard');assert.equal(f.a.hand.length,before+1);assert.equal(this._stackResolutionDepth,0);}return emit.call(this,name,data);};
    await f.game.resolveTop();assert.equal(died,true);assert.equal(bird.zone,'graveyard');assert.equal(f.a.hand.length,before+1);assert.ok(f.game.stack.some(so=>so.srcCard===har));await settle(f.game);assert.equal(f.a.hand.length,before+2);
  });
}

test('the shared resolution boundary lets a later pump save lethal damage until that pump ends',async()=>{
  const K=fixtureEngine([['Resolution Rescue','Resolution Rescue deals 2 damage to target creature. That creature gets +0/+1 until end of turn.','Instant','{R}']]);
  for(const role of ['human','ai']) {
    const f=context(K,role),bear=put(K,f.game,f.a,'Grizzly Bears'),spell=put(K,f.game,f.a,'Resolution Rescue','hand');f.a.pool.R=1;
    assert.equal(await f.game.castSpell(f.a,spell,{from:'hand',quickTargets:[bear]}),true);await settle(f.game);
    assert.equal(bear.zone,'battlefield');assert.equal(bear.damage,2);assert.equal(bear.toughness,3);assert.equal(f.a.pool.R,0);
    // Removing only the pump before marked damage is removed makes lethal
    // damage applicable at the next check; this is an explicit rules probe.
    f.game.untilEffects.length=0;await f.game.checkSBA();assert.equal(bear.zone,'graveyard');
  }
});
