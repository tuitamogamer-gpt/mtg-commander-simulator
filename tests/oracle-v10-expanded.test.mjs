import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createImportPlan,semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {phaseEntryV10} from './helpers/oracle-v10-turn-proof.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const sources=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v10-expanded.json',import.meta.url),'utf8'));
const M=loadEngine(),absent=sources.filter(card=>!M.DEFS[card.name]);
if(absent.length)M.registerOracleBatch(createImportPlan({cards:absent,bulk:{type:'oracle_cards',updated_at:'2026-08-30T09:01:56.964+00:00'},sequence:9911,limit:absent.length,compilerVersion:10}).report);
M.initData(M.RAW_DATA);
const funding=(player,mana)=>{for(const color of ['W','U','B','R','G','C'])player.pool[color]=mana[color]||0;};
const rich=player=>funding(player,{W:30,U:30,B:30,R:30,G:30,C:30});
function choices(player,{modes,target}={}){
  const decide=player.controller.decide.bind(player.controller);
  player.controller.decide=(g,q)=>q.type==='chooseMulti'&&modes?modes:q.type==='chooseTargets'&&target&&q.candidates.includes(target)?[target]:decide(g,q);
  return ()=>{player.controller.decide=decide;};
}
async function cast(f,name,player=f.a,target){
  rich(player);const source=put(M,f.game,player,name,'hand'),restore=choices(player,{target});
  assert.equal(await f.game.castSpell(player,source,{from:'hand'}),true,name);await settle(f.game);restore();return source;
}

test('v10 additions preserve complete v9 cards and reject unknown clauses on either prepared face',()=>{
  const prior={name:'Prior fixture',type_line:'Instant',layout:'normal',mana_cost:'{U}',oracle_text:'Draw a card.'};
  assert.deepEqual(semanticClass(prior),semanticClass(prior,{compilerVersion:9}));
  for(const source of sources){
    assert.ok(semanticClass(source).semanticClass,source.name);
    if(source.card_faces){
      for(const face of [0,1]){const invalid=structuredClone(source);invalid.card_faces[face].oracle_text+='\nPerform an unsupported test instruction.';assert.equal(semanticClass(invalid).semanticClass,undefined,source.name+'/'+face);}
    }else assert.equal(semanticClass({...source,oracle_text:source.oracle_text+'\nPerform an unsupported test instruction.'}).semanticClass,undefined,source.name);
  }
});

for(const role of ['human','ai']){
  test(role+': Kinship keeps the look private and requires both consent and a shared creature type',async()=>{
    for(const scenario of ['decline-look','different-type','decline-reveal','match','empty']){
      const f=context(M,role),source=put(M,f.game,f.a,'Wandering Graybeard'),seen=[];
      if(scenario==='empty')for(const card of f.a.library.slice())await f.game.move(card,'exile');
      else put(M,f.game,f.a,scenario==='different-type'?'Shivan Dragon':'Wandering Graybeard','library');
      const decide=f.a.controller.decide.bind(f.a.controller);f.a.controller.decide=(g,q)=>q.prompt?.startsWith('Kinship:')?scenario==='decline-look'||scenario==='decline-reveal'&&q.prompt.startsWith('Kinship: reveal')?'no':'yes':decide(g,q);
      f.game.revealToHuman=async row=>seen.push(row);const life=f.a.life;
      await f.game.emit('upkeep',{player:f.a});await settle(f.game);
      assert.equal(f.a.life-life,scenario==='match'?4:0,scenario);
      assert.deepEqual(seen.map(row=>row.kind),['decline-look','empty'].includes(scenario)?[]:scenario==='match'?['look','reveal']:['look']);
      for(const row of seen)assert.equal(row.ctrl,f.a);assert.equal(source.zone,'battlefield');assertGameStateInvariants(f.game);
    }
  });
  test(role+': Kinship resolves using the departed source creature types',async()=>{
    const f=context(M,role),source=put(M,f.game,f.a,'Wandering Graybeard');put(M,f.game,f.a,'Wandering Graybeard','library');
    const decide=f.a.controller.decide.bind(f.a.controller);f.a.controller.decide=(g,q)=>q.prompt?.startsWith('Kinship:')?'yes':decide(g,q);
    await f.game.emit('upkeep',{player:f.a});await f.game.flushTriggers();await f.game.move(source,'exile');const life=f.a.life;
    await settle(f.game);assert.equal(f.a.life,life+4);assertGameStateInvariants(f.game);
  });
  test(role+': Radiance affects shrouded creatures of the shared color and leaves other colors unchanged',async()=>{
    const f=context(M,role),red=put(M,f.game,f.b,'Shivan Dragon'),hidden=put(M,f.game,f.b,'Shivan Dragon'),green=put(M,f.game,f.a,'Llanowar Elves');
    hidden.def={...hidden.def,kws:[...(hidden.def.kws||[]),'shroud']};f.game.recalc();const before=[red,hidden,green].map(c=>c.power);
    await cast(f,'Wojek Siren',f.a,red);assert.deepEqual([red,hidden,green].map((c,i)=>c.power-before[i]),[1,1,0]);assertGameStateInvariants(f.game);
  });
  test(role+': a colorless Radiance target affects only itself and an invalid target makes the spell fail',async()=>{
    for(const remove of [false,true]){
      const f=context(M,role),first=put(M,f.game,f.b,'Ornithopter'),other=put(M,f.game,f.b,'Ornithopter');rich(f.a);choices(f.a,{target:first});
      const spell=put(M,f.game,f.a,'Wojek Siren','hand');assert.equal(await f.game.castSpell(f.a,spell,{from:'hand'}),true);
      if(remove)await f.game.move(first,'exile');await settle(f.game);assert.equal(other.power,0);if(!remove)assert.equal(first.power,1);assertGameStateInvariants(f.game);
    }
  });
  test(role+': Converge uses the actual distinct colors spent and spell copies have no colors spent',async()=>{
    for(const scenario of ['one','two','copy']){
      const f=context(M,role),target=put(M,f.game,f.b,'Grizzly Bears'),spell=put(M,f.game,f.a,'Prismatic Ending','hand');
      funding(f.a,scenario==='one'?{W:1,C:1}:{W:1,U:1});choices(f.a,{target});
      assert.equal(await f.game.castSpell(f.a,spell,{from:'hand',xVal:1}),true);
      const original=f.game.stack.find(row=>row.card===spell);assert.equal(original.manaSpent,2);
      if(scenario==='copy'){await f.game.copySpell(original,f.a,{mayNewTargets:false});await f.game.counterStackObject(original);}
      await settle(f.game);assert.equal(target.zone,scenario==='two'?'exile':'battlefield',scenario);assertGameStateInvariants(f.game);
    }
  });
  test(role+': Exert Influence checks power against paid colors and changes control only when it qualifies',async()=>{
    for(const two of [false,true]){
      const f=context(M,role),target=put(M,f.game,f.b,'Grizzly Bears'),spell=put(M,f.game,f.a,'Exert Influence','hand');
      funding(f.a,two?{U:1,G:1,C:3}:{U:1,C:4});choices(f.a,{target});assert.equal(await f.game.castSpell(f.a,spell,{from:'hand'}),true);await settle(f.game);
      assert.equal(target.ctrl,two?f.a:f.b);assertGameStateInvariants(f.game);
    }
  });
  test(role+': the flash cleanup cost is created only for a cast outside sorcery timing',async()=>{
    for(const late of [false,true]){
      const f=context(M,role);if(late){f.game.turnPlayer=f.b;f.game.phase='end';}const source=await cast(f,'Parapet');
      await f.game.emit('cleanupStep',{player:f.game.turnPlayer});await settle(f.game);assert.equal(source.zone,late?'graveyard':'battlefield');assertGameStateInvariants(f.game);
    }
  });
  test(role+': a spell copy does not inherit the original flash cleanup obligation',async()=>{
    const f=context(M,role);f.game.turnPlayer=f.b;f.game.phase='end';rich(f.a);const source=put(M,f.game,f.a,'Parapet','hand');
    assert.equal(await f.game.castSpell(f.a,source,{from:'hand'}),true);const original=f.game.stack.find(row=>row.card===source);
    await f.game.copySpell(original,f.a,{mayNewTargets:false});await settle(f.game);const copy=f.game.bf().find(card=>card!==source&&card.name==='Parapet');assert.ok(copy);
    await f.game.emit('cleanupStep',{player:f.b});await settle(f.game);assert.equal(source.zone,'graveyard');assert.equal(copy.zone,'battlefield');assertGameStateInvariants(f.game);
  });
  test(role+': a blink makes the returned enchantment a different object for the cleanup sacrifice',async()=>{
    const f=context(M,role);f.game.turnPlayer=f.b;f.game.phase='end';const source=await cast(f,'Parapet');
    await f.game.move(source,'exile');await f.game.putPermanentOntoBattlefield(source,f.a);await settle(f.game);
    await f.game.emit('cleanupStep',{player:f.b});await settle(f.game);assert.equal(source.zone,'battlefield');assertGameStateInvariants(f.game);
  });
  test(role+': Spree rejects unpaid, empty and repeated modes without changing game resources',async()=>{
    for(const [modes,mana]of [[['0','1'],{R:1,C:3}],[[],{R:1,C:4}],[['0','0'],{R:1,C:4}]]){
      const f=context(M,role),spell=put(M,f.game,f.a,'Explosive Derailment','hand');
      put(M,f.game,f.b,'Shivan Dragon');put(M,f.game,f.b,'Sol Ring');funding(f.a,mana);choices(f.a,{modes});
      const pool={...f.a.pool};assert.equal(await f.game.castSpell(f.a,spell,{from:'hand'}),false);
      assert.deepEqual({...f.a.pool},pool);assert.equal(spell.zone,'hand');assert.equal(f.game.stack.length,0);assert.equal(f.a.turnState.spellsCast,0);assertGameStateInvariants(f.game);
    }
  });
  test(role+': Spree pays each tier on a free cast and a copy retains the paid modes',async()=>{
    const f=context(M,role),spell=put(M,f.game,f.a,'Explosive Derailment','hand'),target=put(M,f.game,f.b,'Shivan Dragon');
    const artifact=put(M,f.game,f.b,'Sol Ring');choices(f.a,{modes:['0','1']});funding(f.a,{C:3});
    assert.equal(await f.game.castSpell(f.a,spell,{from:'hand',alt:{free:true}}),false);assert.equal(f.a.pool.C,3);
    funding(f.a,{C:4});assert.equal(await f.game.castSpell(f.a,spell,{from:'hand',alt:{free:true}}),true);
    const original=f.game.stack.find(row=>row.card===spell);assert.equal(original.manaSpent,4);assert.deepEqual(Array.from(original.mode),[0,1]);
    await f.game.copySpell(original,f.a,{mayNewTargets:false});const copy=f.game.stack.at(-1);
    assert.notEqual(copy,original);assert.deepEqual(Array.from(copy.mode),[0,1]);assert.equal(f.a.pool.C,0);
    await settle(f.game);assert.equal(target.zone,'graveyard');assert.equal(artifact.zone,'graveyard');assertGameStateInvariants(f.game);
  });
  test(role+': cost reduction applies after Spree tiers are added',async()=>{
    const f=context(M,role),spell=put(M,f.game,f.a,'Explosive Derailment','hand');put(M,f.game,f.a,'Goblin Electromancer');
    put(M,f.game,f.b,'Shivan Dragon');put(M,f.game,f.b,'Sol Ring');choices(f.a,{modes:['0','1']});funding(f.a,{R:1,C:3});
    assert.equal(await f.game.castSpell(f.a,spell,{from:'hand'}),true);assert.equal(f.game.stack.find(row=>row.card===spell).manaSpent,4);await settle(f.game);assertGameStateInvariants(f.game);
  });
  test(role+': Escalate charges colored mana only for modes beyond the first',async()=>{
    for(const modes of [['0'],['0','1']]){
      const f=context(M,role),spell=put(M,f.game,f.a,'Borrowed Grace','hand'),creature=put(M,f.game,f.a,'Runeclaw Bear');choices(f.a,{modes});funding(f.a,{W:1,C:4});
      if(modes.length===2){assert.equal(await f.game.castSpell(f.a,spell,{from:'hand'}),false);assert.equal(spell.zone,'hand');funding(f.a,{W:2,C:3});}
      assert.equal(await f.game.castSpell(f.a,spell,{from:'hand'}),true);assert.equal(f.game.stack.find(row=>row.card===spell).manaSpent,modes.length===1?3:5);
      await settle(f.game);assert.equal(creature.power,4);assert.equal(creature.toughness,modes.length===1?2:4);assertGameStateInvariants(f.game);
    }
  });
  test(role+': a prepared copy requires mana, legal timing and a live prepared source',async()=>{
    const f=context(M,role),source=await cast(f,'Adventurous Eater // Have a Bite'),copy=f.a.exile.find(card=>card.meta.preparedBy===source.iid);
    assert.ok(copy);assert.equal(source.is('Creature'),true);assert.equal(source.mv,3);assert.equal(copy.is('Creature'),false);assert.equal(copy.mv,1);
    assert.equal(M.oraclePrepareV10(f.game,source),null);funding(f.a,{});
    assert.equal(await f.game.castSpell(f.a,copy,{from:'exile'}),false);assert.equal(source.meta.prepared,true);
    funding(f.a,{B:1});f.game.phase='combat';assert.equal(await f.game.castSpell(f.a,copy,{from:'exile'}),false);f.game.phase='main1';
    source.phasedOut=true;assert.equal(f.game.castableList(f.a).some(row=>row.card===copy),false);source.phasedOut=false;
    M.OracleV8AbilityLoss.add(f.game,[source],{temporary:true,keywords:[]});assert.equal(source.meta.prepared,true);
    choices(f.a,{target:source});assert.equal(await f.game.castSpell(f.a,copy,{from:'exile'}),true);
    assert.equal(source.meta.prepared,false);assert.equal(f.a.pool.B,0);await settle(f.game);
    assert.equal(source.counters['+1/+1'],1);assert.equal(copy.zone,'ceased');assertGameStateInvariants(f.game);
  });
  test(role+': preparation follows the current controller, and a blink invalidates the old copy',async()=>{
    const f=context(M,role),source=await cast(f,'Goblin Glasswright // Craft with Pride'),copy=f.a.exile.find(card=>card.meta.preparedBy===source.iid);
    f.game.turnPlayer=f.b;await cast(f,'Act of Treason',f.b,source);rich(f.b);
    assert.equal(source.ctrl,f.b);assert.equal(f.game.castableList(f.a).some(row=>row.card===copy),false);assert.equal(f.game.castableList(f.b).some(row=>row.card===copy),true);
    assert.equal(await f.game.castSpell(f.b,copy,{from:'exile'}),true);await settle(f.game);
    assert.ok(f.game.bf().some(card=>card.isToken&&card.hasSub('Treasure')&&card.ctrl===f.b));
    await f.game.move(source,'exile');await f.game.putPermanentOntoBattlefield(source,f.a);await settle(f.game);
    const newer=f.a.exile.find(card=>card.meta.preparedBy===source.iid&&card!==copy);assert.ok(newer);
    await f.game.move(source,'hand');assert.equal(newer.zone,'ceased');assert.equal(await f.game.castSpell(f.a,newer,{from:'exile'}),false);assertGameStateInvariants(f.game);
  });
  test(role+': prepared spells survive a JSON save with cost, ownership and casting restrictions',async()=>{
    const f=context(M,role),source=await cast(f,'Adventurous Eater // Have a Bite'),copy=f.a.exile.find(card=>card.meta.preparedBy===source.iid);
    funding(f.a,{});const state=M.captureGameState(f.game);assert.ok(state,M.gameStateSnapshotBlockers(f.game).join(', '));
    const resumed=context(M,role);M.restoreGameState(resumed.game,JSON.parse(JSON.stringify(state)));
    const restored=resumed.game.byIid(copy.iid),host=resumed.game.byIid(source.iid),player=host.ctrl;
    assert.equal(restored.def.cost,'{B}');assert.equal(restored.is('Creature'),false);assert.equal(restored.owner,player);
    funding(player,{B:1});choices(player,{target:host});assert.equal(await resumed.game.castSpell(player,restored,{from:'exile'}),true);
    await settle(resumed.game);assert.equal(restored.zone,'ceased');assert.equal(host.counters['+1/+1'],1);assertGameStateInvariants(resumed.game);
  });
  test(role+': a countered prepared spell unprepares the source and ceases to exist',async()=>{
    const f=context(M,role),source=await cast(f,'Goblin Glasswright // Craft with Pride'),copy=f.a.exile.find(card=>card.meta.preparedBy===source.iid);rich(f.a);
    assert.equal(await f.game.castSpell(f.a,copy,{from:'exile'}),true);assert.equal(source.meta.prepared,false);
    assert.equal(await f.game.counterStackObject(f.game.stack.find(row=>row.card===copy)),true);await settle(f.game);
    assert.equal(copy.zone,'ceased');assert.equal(f.game.bf().some(card=>card.isToken&&card.hasSub('Treasure')),false);assertGameStateInvariants(f.game);
  });
  test(role+': two skipped turns consume separate occurrences without starting a turn',async()=>{
    const f=context(M,role),source=await cast(f,'Eater of Days');await f.game.move(source,'exile');const before=f.game.turnNo,started=f.a.turnsStarted;
    for(let i=0;i<2;i++){f.game.turnPlayer=f.a;await f.game.runTurn();assert.equal(f.game.turnNo,before);assert.equal(f.a.turnsStarted,started);}
    assert.equal(f.game.untilEffects.some(row=>row.kind==='oracleSkipV10'),false);assert.equal(f.game.oracleShouldSkipV10(f.a,'turn'),false);assertGameStateInvariants(f.game);
  });
  test(role+': a countered combat skip schedules nothing, while a resolved skip lasts one combat',async()=>{
    const f=context(M,role);rich(f.a);const first=put(M,f.game,f.a,'Moment of Silence','hand');choices(f.a,{target:f.b});
    assert.equal(await f.game.castSpell(f.a,first,{from:'hand'}),true);await f.game.counterStackObject(f.game.stack.find(row=>row.card===first));await settle(f.game);
    assert.equal(f.game.oracleShouldSkipV10(f.b,'combat'),false);
    await cast(f,'Moment of Silence',f.a,f.b);const skipped=await phaseEntryV10(f.game,f.b,'combat');assert.equal(skipped.some(event=>event.name==='beginCombat'),false);
    const next=await phaseEntryV10(f.game,f.b,'combat');assert.equal(next.some(event=>event.name==='beginCombat'),true);assertGameStateInvariants(f.game);
  });
  test(role+': Eon Hub suppresses both players upkeep events until it leaves',async()=>{
    const f=context(M,role),hub=await cast(f,'Eon Hub');
    for(const player of [f.a,f.b]){const events=await phaseEntryV10(f.game,player,'upkeep');assert.equal(events.some(event=>event.name==='upkeep'),false);}
    await f.game.move(hub,'hand');const events=await phaseEntryV10(f.game,f.a,'upkeep');assert.equal(events.some(event=>event.name==='upkeep'),true);assertGameStateInvariants(f.game);
  });
  test(role+': other-player untaps consume stun counters and stop when the ability is lost',async()=>{
    const f=context(M,role),soldier=await cast(f,'Thousand Moons Infantry');soldier.tapped=true;f.game.addCounters(soldier,'stun',1);
    await phaseEntryV10(f.game,f.b,'untap');assert.equal(soldier.tapped,true);assert.equal(soldier.counters.stun||0,0);
    await phaseEntryV10(f.game,f.b,'untap');assert.equal(soldier.tapped,false);soldier.tapped=true;
    M.OracleV8AbilityLoss.add(f.game,[soldier],{temporary:true,keywords:[]});await phaseEntryV10(f.game,f.b,'untap');assert.equal(soldier.tapped,true);assertGameStateInvariants(f.game);
  });
  test(role+': Void observes a real nonland departure by either player and resets each turn',async()=>{
    const f=context(M,role),source=await cast(f,'Voidforged Titan'),before=f.a.hand.length;
    const land=put(M,f.game,f.b,'Forest');await f.game.move(land,'hand');await f.game.emit('endStep',{player:f.a});await settle(f.game);assert.equal(f.a.hand.length,before);
    const artifact=put(M,f.game,f.b,'Sol Ring');await f.game.move(artifact,'exile');await f.game.emit('endStep',{player:f.a});await settle(f.game);assert.equal(f.a.hand.length,before+1);
    for(const player of f.game.players)player.turnState=player.freshTurnState();await f.game.emit('endStep',{player:f.a});await settle(f.game);assert.equal(f.a.hand.length,before+1);assert.equal(source.zone,'battlefield');assertGameStateInvariants(f.game);
  });
}
