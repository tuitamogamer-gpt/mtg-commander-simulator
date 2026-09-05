import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {untapStep} from './helpers/oracle-phasing-proof.mjs';
const M=loadEngine();
function setup(role='human') {
  const ctx=context(M,role,3);ctx.targets=[];ctx.events=[];
  for(const player of ctx.game.players) {
    const decide=player.controller.decide.bind(player.controller);
    if(!player.isAI)player.controller={...player.controller};
    player.controller.decide=async(g,q)=>{
      if(!player.isAI&&q.type==='chooseTargets')return ctx.targets.filter(card=>q.candidates.includes(card)).slice(0,q.max??1);
      return decide(g,q);
    };
  }
  const emit=ctx.game.emit.bind(ctx.game);
  ctx.game.emit=async(name,data)=>{ctx.events.push({name,data});return emit(name,data);};
  assert.equal(ctx.a.controller instanceof M.AIController,role==='ai','the selected role retains its real controller');
  return {...ctx,c:ctx.others[1],d:ctx.others[2],put:(name,owner=ctx.a,zone='battlefield')=>put(M,ctx.game,owner,name,zone)};
}
async function cast(ctx,name,player=ctx.a) {
  const {game}=ctx;game.turnPlayer=player;game.phase='main1';game.step='main';
  for(const color of ['W','U','B','R','G','C'])player.pool[color]=20;
  const source=ctx.put(name,player,'hand');
  assert.equal(await game.castSpell(player,source,{from:'hand'}),true,name+': real paid cast');
  assert.ok(Object.values(player.pool).reduce((a,b)=>a+b,0)<120);
  await settle(game);return source;
}
async function stealAndPhase(ctx,{aura=false,owner=ctx.b,name='Grizzly Bears'}={}) {
  const host=ctx.put(name,owner);ctx.targets.push(host);ctx.game.addCounters(host,'charge',2);
  await cast(ctx,aura?'Control Magic':'Act of Treason');assert.equal(host.ctrl,ctx.a);
  host.tapped=true;await cast(ctx,'Clever Concealment');assert.equal(host.phasedOut,true);
  return host;
}
async function nextUntap(game) {const player=game.turnPlayer;await untapStep(game,player);await game.checkSBA();return player;}
for(const role of ['human','ai']) {
  test(`${role}: departure exile and paid reanimation reset real Puppeteer haste and Assault Formation permission`,async()=>{
    const ctx=setup(role),{game,a,b,c}=ctx,host=ctx.put('Wall of Omens',c,'graveyard');ctx.targets.push(host);
    const puppet=await cast(ctx,'Puppeteer Clique',b);assert.ok(host.ctrl===b);assert.equal(host.meta.tempHaste,true);
    ctx.targets.splice(0,ctx.targets.length,puppet);await cast(ctx,'Unsummon',c);ctx.targets.splice(0,ctx.targets.length,host);
    const aura=await cast(ctx,'Control Magic');const formation=await cast(ctx,'Assault Formation');a.pool.G=1;
    const action=game.activatableList(a).find(row=>row.card===formation&&row.ability?.label==='Defender can attack');assert.ok(action);
    assert.equal(await game.activateAbility(a,action),true);await settle(game);assert.equal(host.meta.canAttackDefender,true);
    await game.playerLoses(b,'default reanimator leaves');assert.ok(host.ctrl===a);ctx.targets.splice(0,ctx.targets.length,aura);await cast(ctx,'Disenchant',c);
    assert.equal(host.zone,'exile');assert.equal(host.kw('haste'),false,'exile card has printed abilities');
    // Stage a later legal reanimation after the actual rule-exile. Both zone
    // transitions still use the engine, rather than rewriting the card object.
    await game.move(host,'graveyard');ctx.targets.splice(0,ctx.targets.length,host);await cast(ctx,'Ashen Powder');
    assert.ok(host.ctrl===a);assert.equal(host.zone,'battlefield');assert.equal(host.sick,true);assert.equal(host.kw('haste'),false);
    assert.equal(host.meta.tempHaste,undefined);assert.equal(host.meta.canAttackDefender,undefined);assert.equal(game.canAttackAtAll(host),false);
  });
  for(const faceDown of [false,true])test(`${role}: ${faceDown?'face-down':'face-up'} copied foreign card restores its printed definition through departure exile, another zone and paid reanimation`,async()=>{
    const ctx=setup(role),{game,a,b,c,d}=ctx,host=ctx.put('Myr Retriever',c,'graveyard'),model=ctx.put('Shivan Dragon',d);
    if(faceDown)await game.manifestCard(b,host);
    else {ctx.targets.push(host);await cast(ctx,'Puppeteer Clique',b);}
    M.OracleV8Copies.applyCopy(game,host,model.def);game.recalc();const copyVersion=host.zoneVersion;
    assert.equal(host.meta.oracleCopyState.zoneVersion,copyVersion);assert.equal(host.meta.characteristicOriginalDef.name,'Myr Retriever');
    if(faceDown)assert.equal(host.meta.faceDownDef.name,'Shivan Dragon');else assert.equal(host.name,'Shivan Dragon');
    ctx.targets.splice(0,ctx.targets.length,host);const aura=await cast(ctx,'Control Magic');await game.playerLoses(b,'default controller of copied object leaves');
    ctx.targets.splice(0,ctx.targets.length,aura);await cast(ctx,'Disenchant',c);assert.equal(host.zone,'exile');assert.equal(host.name,'Myr Retriever');assert.equal(host.zoneVersion,copyVersion+1);
    assert.equal(host.faceDown,false);assert.equal(host.isCopyOf,null);assert.equal(game.untilEffects.some(effect=>effect.oracleCopyLayer&&effect.iid===host.iid),false);
    await game.move(host,'graveyard');assert.equal(host.name,'Myr Retriever','a later zone change must not restore the obsolete face-down copied definition');
    ctx.targets.splice(0,ctx.targets.length,host);await cast(ctx,'Ashen Powder');assert.equal(host.name,'Myr Retriever');assert.equal(host.power,1);assert.equal(host.is('Artifact'),true);
    assert.equal(host.kw('flying'),false);assert.equal(host.meta.oracleCopyState,undefined);assert.equal(host.meta.faceDownDef,undefined);assert.equal(host.meta.characteristicOriginalDef,undefined);
  });
  test(`${role}: paid theft/phasing survives controller departure and returns only after that departed seat's next nominal turn`,async()=>{
    const ctx=setup(role),{game,a,b,c,d}=ctx,host=await stealAndPhase(ctx),version=host.zoneVersion;
    ctx.events.length=0;await game.playerLoses(a,'controlled departure');
    assert.equal(host.ctrl,b);assert.equal(host.phasedOut,true);assert.equal(host.meta.phaseInPlayer,a.idx);
    assert.equal(host.zoneVersion,version);assert.equal(host.counters.charge,2);
    assert.equal(game.untilEffects.some(effect=>effect.layeredControl&&effect.to===a),false);
    game.advanceTurnPlayer(a);assert.equal(game.turnPlayer,b);
    for(const player of [b,c,d]) {assert.equal(await nextUntap(game),player);assert.equal(host.phasedOut,true);game.advanceTurnPlayer(player);}
    assert.equal(game.turnPlayer,b);assert.equal(host.meta.phaseAfterDepartureReady,true);
    await nextUntap(game);assert.equal(host.phasedOut,false);assert.equal(host.tapped,false);assert.equal(host.ctrl,b);
    assert.equal(host.zoneVersion,version);assert.equal(host.counters.charge,2);
    assert.equal(ctx.events.some(event=>['etb','lto','dies','sacrificed'].includes(event.name)&&event.data.card===host),false);
    assert.equal((game.aiDecisionLog||[]).some(row=>row.fallback),false);
  });
  test(`${role}: ending the departed thief's layer reveals the older surviving Aura controller and returns its indirect cohort`,async()=>{
    const ctx=setup(role),{game,a,b,c,d}=ctx,host=ctx.put('Grizzly Bears',c);ctx.targets.push(host);
    const older=await cast(ctx,'Control Magic',b);await cast(ctx,'Act of Treason');await cast(ctx,'Clever Concealment');
    assert.equal(host.ctrl,a);assert.equal(older.phasedOut,true);await game.playerLoses(a,'newer thief leaves');
    assert.equal(host.ctrl,b);assert.equal(host.owner,c);assert.equal(older.ctrl,b);assert.equal(host.phasedOut,true);
    game.advanceTurnPlayer(a);for(const player of [b,c,d]){await nextUntap(game);game.advanceTurnPlayer(player);}
    await nextUntap(game);assert.equal(host.phasedOut,false);assert.equal(older.phasedOut,false);assert.equal(older.attachedTo,host.iid);assert.equal(host.ctrl,b);
  });
  test(`${role}: a reanimated opponent card phases under its default controller and is exiled when that controller leaves`,async()=>{
    const ctx=setup(role),{game,a,b}=ctx,host=ctx.put('Thragtusk',b,'graveyard');ctx.targets.push(host);
    await cast(ctx,'Ashen Powder');assert.equal(host.ctrl,a);assert.equal(host.owner,b);
    await cast(ctx,'Clever Concealment');const version=host.zoneVersion;ctx.events.length=0;
    await game.playerLoses(a,'default controller leaves');
    assert.equal(host.zone,'exile');assert.equal(host.ctrl,b);assert.equal(host.phasedOut,false);assert.equal(host.zoneVersion,version+1);
    assert.equal(b.exile.includes(host),true);assert.equal(game.battlefield.includes(host),false);
    assert.equal(ctx.events.some(event=>['lto','dies','etb'].includes(event.name)&&event.data.card===host),false,'an absent phased creature has no leave trigger');
    assert.equal(game.pendingTriggers.length,0);
  });
  test(`${role}: after a departed default controller, a surviving Control Magic layer lasts until Disenchant; Thragtusk's LKI trigger belongs to the last live controller`,async()=>{
    const ctx=setup(role),{game,a,b,c}=ctx,host=ctx.put('Thragtusk',c,'graveyard');ctx.targets.push(host);
    await cast(ctx,'Ashen Powder');const aura=await cast(ctx,'Control Magic',b);assert.equal(host.ctrl,b);
    await game.playerLoses(a,'default controller leaves');assert.equal(host.zone,'battlefield');assert.equal(host.ctrl,b);
    const version=host.zoneVersion;ctx.targets.splice(0,ctx.targets.length,aura);ctx.events.length=0;
    await cast(ctx,'Disenchant',c);
    assert.equal(aura.zone,'graveyard');assert.equal(host.zone,'exile');assert.equal(host.zoneVersion,version+1);
    const leaves=ctx.events.filter(event=>event.name==='lto'&&event.data.card===host);
    assert.equal(leaves.length,1);assert.equal(leaves[0].data.snap.ctrl,b);assert.equal(leaves[0].data.snap.zoneVersion,version);
    assert.equal(game.creatures(b).filter(card=>card.isToken&&card.name==='Beast Token').length,1,'real leave trigger resolved for B');
    assert.equal(game.creatures(c).filter(card=>card.isToken).length,0);
  });
}
test('queued extra turns establish the departed deadline in queue order; a skipped untap defers return to the next real untap, including an extra turn',async()=>{
  const ctx=setup(),{game,a,b,c,d}=ctx,host=await stealAndPhase(ctx,{aura:true});
  game.scheduleExtraTurn(a);game.scheduleExtraTurn(d);await game.playerLoses(a,'queued beneficiary leaves');
  game.advanceTurnPlayer(a);assert.equal(game.turnPlayer,d);await nextUntap(game);assert.equal(host.phasedOut,true);
  game.advanceTurnPlayer(d);assert.equal(game.turnPlayer,b);assert.equal(host.meta.phaseAfterDepartureReady,true,'lost queued extra turn was the next nominal turn');
  b.skipUntapOnce=true;await nextUntap(game);assert.equal(host.phasedOut,true);
  game.scheduleExtraTurn(c);game.advanceTurnPlayer(b);assert.equal(game.turnPlayer,c);
  await nextUntap(game);assert.equal(host.phasedOut,false);assert.equal(host.ctrl,b);assert.equal(host.tapped,true,'return during another player untap does not untap the card');
});
test('a normal seat boundary is not advanced by an unrelated extra turn',async()=>{
  const ctx=setup(),{game,a,b,c,d}=ctx,host=await stealAndPhase(ctx,{aura:true});await game.playerLoses(a,'departed current seat');
  game.scheduleExtraTurn(d);game.advanceTurnPlayer(a);await nextUntap(game);assert.equal(host.phasedOut,true);
  game.advanceTurnPlayer(d);assert.equal(game.turnPlayer,b);assert.equal(host.meta.phaseAfterDepartureReady,undefined);
  for(const player of [b,c,d]){await nextUntap(game);assert.equal(host.phasedOut,true);game.advanceTurnPlayer(player);}
  await nextUntap(game);assert.equal(host.phasedOut,false);
});
test('owned phased roots leave silently; an indirect surviving attachment does not return alone after its root leaves the game',async()=>{
  const ctx=setup(),{game,a,b,c,d}=ctx,host=ctx.put('Grizzly Bears'),aura=ctx.put('Rancor',b);
  await game.attach(aura,host);ctx.targets.push(host);await cast(ctx,'Clever Concealment');ctx.events.length=0;
  await game.playerLoses(a,'owner leaves');assert.equal(host.zone,'ceased');assert.equal(aura.zone,'battlefield');assert.equal(aura.phasedOut,true);
  game.advanceTurnPlayer(a);for(const player of [b,c,d,b]){await nextUntap(game);game.advanceTurnPlayer(player);}
  assert.equal(aura.phasedOut,true);assert.equal(ctx.events.some(event=>['lto','dies'].includes(event.name)&&[host,aura].includes(event.data.card)),false);
});
test('an unrelated departure does not restart a separately phased Control Magic on its still-present host',async()=>{
  const ctx=setup(),{game,a,b,c}=ctx,host=ctx.put('Grizzly Bears');ctx.targets.push(host);
  const aura=await cast(ctx,'Control Magic',b);assert.equal(host.ctrl,b);
  ctx.targets.splice(0,ctx.targets.length,aura);await cast(ctx,'Clever Concealment',b);
  assert.equal(aura.phasedOut,true);assert.equal(host.phasedOut,false);assert.equal(host.ctrl,a);
  await game.playerLoses(c,'unrelated player leaves');assert.equal(host.ctrl,a);
  await untapStep(game,b);assert.equal(aura.phasedOut,false);assert.equal(host.ctrl,b);
});
test('JSON checkpoint and local AI clone preserve departed phase deadlines before and after the nominal boundary',async()=>{
  for(const ready of [false,true]) {
    const ctx=setup(),{game,a,b,c,d}=ctx,host=await stealAndPhase(ctx,{aura:true});await game.playerLoses(a,'checkpoint departure');game.advanceTurnPlayer(a);
    if(ready)for(const player of [b,c,d]){await nextUntap(game);game.advanceTurnPlayer(player);}
    const saved=M.captureGameState(game);assert.ok(saved,JSON.stringify(M.gameStateSnapshotBlockers(game)));
    const restored=setup().game;M.restoreGameState(restored,JSON.parse(JSON.stringify(saved)));
    const clone=M.cloneGameForAISimulation(game,70226);
    for(const copy of [restored,clone]) {
      const permanent=copy.byIid(host.iid);assert.equal(permanent.ctrl,copy.players[b.idx]);assert.equal(permanent.phasedOut,true);
      if(!ready)for(const seat of [b.idx,c.idx,d.idx]){assert.equal(copy.turnPlayer.idx,seat);await nextUntap(copy);assert.equal(permanent.phasedOut,true);copy.advanceTurnPlayer(copy.turnPlayer);}
      await nextUntap(copy);assert.equal(permanent.phasedOut,false);assert.equal(permanent.ctrl,copy.players[b.idx]);assert.equal(permanent.zoneVersion,host.zoneVersion);
    }
    assert.equal(host.phasedOut,true,'isolated simulations never mutate the original phased object');
  }
});
test('immediate rules exile waits for async event observers and propagates their failures at the next trigger boundary',async()=>{
  const ctx=setup(),{game,a,b,c}=ctx,host=ctx.put('Thragtusk',c,'graveyard');ctx.targets.push(host);
  await cast(ctx,'Ashen Powder');const aura=await cast(ctx,'Control Magic',b);await game.playerLoses(a,'default controller leaves');
  const failure=new Error('controlled rule-event observer failure'),emit=game.emit.bind(game);
  game.emit=async(name,data)=>{if(name==='lto'&&data.card===host){await Promise.resolve();throw failure;}return emit(name,data);};
  game.phaseOut(aura,b);assert.equal(host.zone,'exile','CR800.4c exile is immediate even when a control Aura phases out');
  await assert.rejects(()=>game.flushTriggers(),error=>error===failure);
  assert.equal(game._pendingRuleEvents.length,0);
});
