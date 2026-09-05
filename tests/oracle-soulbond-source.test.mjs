import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';import {loadEngine} from './helpers/load-engine.mjs';import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {soulbondCast,soulbondChoices,soulbondScenario} from './helpers/oracle-soulbond-proof.mjs';
const M=loadEngine(),raw=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-soulbond-source.json',import.meta.url)));
const entries=raw.map((card,i)=>{const parsed=semanticClass(card),types=card.type_line.split(' — ')[0].split(' ');assert.ok(parsed.semanticClass,card.name);return {position:i+1,oracleId:card.oracle_id,scryfallId:card.id,...parsed,raw:{name:card.name,oracle:card.oracle_text,cost:card.mana_cost,types:types.filter(t=>!['Legendary','Snow','Basic'].includes(t)),super:types.filter(t=>['Legendary','Snow','Basic'].includes(t)),subtypes:card.type_line.split(' — ')[1]?.split(' ')||[],power:card.power,toughness:card.toughness,_ci:card.color_identity},catalog:{typeLine:card.type_line,commanderLegality:'legal'}};});
M.registerOracleBatch({id:'soulbond-source-draft',sequence:9995,cards:entries.filter(entry=>!M.DEFS[entry.raw.name])});M.initData(M.RAW_DATA);
function setup(role){const ctx=context(M,role);soulbondChoices(ctx);return ctx;}
for(const role of ['human','ai']){
  for(const entry of entries)test(`${role}: ${entry.raw.name} pays for both sources and executes the exact paired grant`,async()=>soulbondScenario(M,entry,context(M,role)));
  test(`${role}: pair choice happens at resolution, is optional, and is not a target`,async()=>{
    const ctx=setup(role),{game,a}=ctx,bear=await soulbondCast(M,ctx,'Slippery Bogle');
    const source=await soulbondCast(M,ctx,'Wingcrafter',a,{resolve:false});await game.resolveTop();await game.flushTriggers();assert.equal(game.stack.length,1);assert.equal(game.stack[0].targets?.length||0,0);assert.equal(M.OracleV8Soulbond.partner(game,source),null);
    await settle(game);assert.equal(M.OracleV8Soulbond.partner(game,source),bear);assert.equal(bear.kw('flying'),true);
  });
  test(`${role}: pending pair rejects a blinked entering creature and an unavailable source`,async()=>{
    for(const mode of ['visitor-blink','source-blink','source-control','visitor-control','visitor-phase']){
      const ctx=setup(role),{game,a,b}=ctx,source=await soulbondCast(M,ctx,'Wingcrafter'),other=await soulbondCast(M,ctx,'Grizzly Bears',a,{resolve:false});
      await game.resolveTop();await game.flushTriggers();const original=game.stack.at(-1);assert.ok(original);
      if(mode.includes('blink')){const card=mode.startsWith('source')?source:other;await game.move(card,'exile');await game.putPermanentOntoBattlefield(card,a);game.pendingTriggers=[];}
      if(mode.includes('control')){(mode.startsWith('source')?source:other).ctrl=b;game.recalc();}
      if(mode==='visitor-phase')game.phaseOut(other);
      await game.resolveTop();assert.equal(M.OracleV8Soulbond.partner(game,source),null,mode);assert.equal(M.OracleV8Soulbond.partner(game,other),null,mode);
    }
  });
  test(`${role}: both soulbond ETB abilities are distinct but only one pair can resolve`,async()=>{
    const ctx=setup(role),{game,a}=ctx,first=put(M,game,a,'Wingcrafter','hand'),second=put(M,game,a,'Lightning Mauler','hand');
    await game.withBattlefieldEntryBatch(async()=>{await game.putPermanentOntoBattlefield(first,a);await game.putPermanentOntoBattlefield(second,a);});
    assert.equal(game.pendingTriggers.length,4);await settle(game);assert.equal(M.OracleV8Soulbond.partner(game,first),second);assert.equal(first.kw('haste'),true);assert.equal(second.kw('flying'),true);
    const third=await soulbondCast(M,ctx,'Grizzly Bears');assert.equal(M.OracleV8Soulbond.partner(game,third),null);assert.equal(M.OracleV8Soulbond.partner(game,first),second);
  });
  test(`${role}: losing abilities preserves the pair while removing the relevant printed grants`,async()=>{
    const ctx=setup(role),{game,a}=ctx,source=await soulbondCast(M,ctx,'Wingcrafter'),other=await soulbondCast(M,ctx,'Grizzly Bears');
    const aura=put(M,game,a,'Lignify','hand');await game.move(aura,'battlefield',{attachTo:source});
    assert.equal(M.OracleV8Soulbond.partner(game,source),other);assert.equal(source.kw('flying'),false);assert.equal(other.kw('flying'),false);
    await game.move(aura,'graveyard');assert.equal(source.kw('flying'),true);assert.equal(other.kw('flying'),true);
    const late=put(M,game,a,'Lignify','hand');await game.move(late,'battlefield',{attachTo:other});assert.equal(M.OracleV8Soulbond.partner(game,source),other);assert.equal(source.kw('flying'),true);assert.equal(other.kw('flying'),false);
  });
  test(`${role}: control loss permanently unpairs even when both creatures move to the same controller`,async()=>{
    const ctx=setup(role),{game,a,b}=ctx,source=await soulbondCast(M,ctx,'Wingcrafter'),other=await soulbondCast(M,ctx,'Grizzly Bears');
    source.ctrl=b;other.ctrl=b;game.recalc();assert.equal(M.OracleV8Soulbond.partner(game,source),null);source.ctrl=a;other.ctrl=a;game.recalc();assert.equal(M.OracleV8Soulbond.partner(game,source),null);assert.equal(other.kw('flying'),false);
  });
  test(`${role}: paid phasing ends either member's pair and phase-in does not recreate it`,async()=>{
    for(const member of ['source','recipient']){
      const ctx=setup(role),{game,a,b}=ctx,source=await soulbondCast(M,ctx,'Wingcrafter'),other=await soulbondCast(M,ctx,'Grizzly Bears'),target=member==='source'?source:other;
      const decide=b.controller.decide.bind(b.controller);b.controller.decide=async(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(target)?[target]:decide(g,q);
      await soulbondCast(M,ctx,'Reality Ripple',b);assert.equal(target.phasedOut,true);assert.equal(M.OracleV8Soulbond.partner(game,source),null);assert.equal(source.meta.oracleSoulbond,undefined);assert.equal(other.meta.oracleSoulbond,undefined);
      game.phaseInFor(a);await settle(game);assert.equal(target.phasedOut,false);assert.equal(M.OracleV8Soulbond.partner(game,source),null);assert.equal(other.kw('flying'),false);
    }
  });
  test(`${role}: a real animated land becomes unpaired at cleanup and later animation cannot restore the pair`,async()=>{
    const ctx=setup(role),{game,a}=ctx,land=put(M,game,a,"Mishra's Factory",'hand');assert.equal(await game.playLand(a,land),true);a.pool.C=5;
    const animation=()=>game.activatableList(a).find(row=>row.card===land&&row.ability.label.includes('2/2'));
    assert.ok(animation());assert.equal(await game.activateAbility(a,animation()),true);await settle(game);
    const source=await soulbondCast(M,ctx,'Wingcrafter');assert.equal(M.OracleV8Soulbond.partner(game,source),land);assert.equal(land.kw('flying'),true);
    const decision=a.controller.decide.bind(a.controller);a.controller.decide=async(g,q)=>q.type==='main'?{kind:'done'}:decision(g,q);
    await game.runTurn();assert.equal(land.is('Creature'),false);assert.equal(source.meta.oracleSoulbond,undefined);assert.equal(land.meta.oracleSoulbond,undefined);
    game.turnPlayer=a;game.phase='main1';game.step='main';a.pool.C=5;assert.equal(await game.activateAbility(a,animation()),true);await settle(game);assert.equal(land.is('Creature'),true);assert.equal(M.OracleV8Soulbond.partner(game,source),null);assert.equal(land.kw('flying'),false);
  });
  test(`${role}: declining a pair preserves the next entry opportunity and never selects an older visitor`,async()=>{
    const ctx=setup(role),{game,a}=ctx,source=await soulbondCast(M,ctx,'Wingcrafter');let decline=true;const decide=a.controller.decide.bind(a.controller);
    a.controller.decide=async(g,q)=>q.type==='chooseCards'&&q.prompt?.includes(': pair with another creature?')&&decline?[]:decide(g,q);
    const first=await soulbondCast(M,ctx,'Grizzly Bears');assert.equal(source.meta.oracleSoulbond,undefined);decline=false;
    const second=await soulbondCast(M,ctx,'Serra Angel');assert.equal(M.OracleV8Soulbond.partner(game,source),second);assert.equal(first.meta.oracleSoulbond,undefined);
  });
  test(`${role}: a granted activation already paid remains on the Stack after the pair breaks`,async()=>{
    const ctx=setup(role),{game,a}=ctx,source=await soulbondCast(M,ctx,'Stonewright'),other=await soulbondCast(M,ctx,'Grizzly Bears');a.pool.R=1;
    const action=game.activatableList(a).find(row=>row.card===other&&row.ability.oracleCompiled);assert.equal(await game.activateAbility(a,action),true);assert.equal(a.pool.R,0);
    await game.move(source,'exile');assert.equal(other.cur.extraAbilities.length,0);await settle(game);assert.equal(other.power,3);
  });
  test(`${role}: source and recipient pair survives save and AI clone, while copied permanents are unpaired`,async()=>{
    const ctx=setup(role),{game,a}=ctx,source=await soulbondCast(M,ctx,'Wolfir Silverheart'),other=await soulbondCast(M,ctx,'Grizzly Bears');
    const clone=M.cloneGameForAISimulation(game,817);assert.equal(M.OracleV8Soulbond.partner(clone,clone.byIid(source.iid)),clone.byIid(other.iid));assert.equal(clone.byIid(other.iid).power,6);
    const saved=M.captureGameState(game);assert.ok(saved,JSON.stringify(M.gameStateSnapshotBlockers(game)));const restored=setup(role).game;M.restoreGameState(restored,JSON.parse(JSON.stringify(saved)));assert.equal(M.OracleV8Soulbond.partner(restored,restored.byIid(source.iid)),restored.byIid(other.iid));assert.equal(restored.byIid(other.iid).power,6);
    const [copy]=await game.copyPermanentToken(source,a);await settle(game);assert.equal(M.OracleV8Soulbond.partner(game,copy),null);assert.equal(copy.power,4);assert.equal(other.power,6);
  });
}
