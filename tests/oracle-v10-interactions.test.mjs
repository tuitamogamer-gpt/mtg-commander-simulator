import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createImportPlan} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';
const M=loadEngine(),sources=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v10-expanded.json',import.meta.url),'utf8'));
const absent=sources.filter(card=>!M.DEFS[card.name]);
if(absent.length)M.registerOracleBatch(createImportPlan({cards:absent,bulk:{type:'oracle_cards',updated_at:'2026-08-30T09:01:56.964+00:00'},sequence:9913,limit:absent.length,compilerVersion:10}).report);
M.initData(M.RAW_DATA);
const fund=(p,n=30)=>{for(const color of ['W','U','B','R','G','C'])p.pool[color]=n;};
const choose=(p,fn)=>{const old=p.controller.decide.bind(p.controller);p.controller.decide=(g,q)=>fn(q)??old(g,q);};
async function cast(f,name,target,alt={}){fund(f.a);const card=put(M,f.game,f.a,name,'hand');if(target)choose(f.a,q=>q.type==='chooseTargets'&&q.candidates.includes(target)?[target]:undefined);assert.equal(await f.game.castSpell(f.a,card,{from:'hand',alt}),true,name);await settle(f.game);return card;}
async function cleanup(f){f.game.runBeginningPhase=async()=>{};f.game.mainPhase=async()=>{};f.game.combatPhase=async()=>{};await f.game.runTurn();await settle(f.game);}

test('the import queue reserves an existing native Prepare front face without reserving unrelated back-face names',()=>{
  const prepared=sources.find(card=>card.layout==='prepare');assert.ok(prepared);
  const ordinary=sources.find(card=>card.name==='Naga Vitalist'),bulk={type:'oracle_cards',updated_at:'2026-08-30T09:01:56.964+00:00'};
  const plan=createImportPlan({cards:[prepared,ordinary],bulk,baseNames:new Set([prepared.card_faces[0].name]),sequence:9914,limit:1,compilerVersion:10});
  assert.deepEqual(plan.report.cards.map(card=>card.raw.name),[ordinary.name]);assert.equal(plan.report.catalogSummary.deferredByReason['already-in-legacy-engine'],1);
  const back=createImportPlan({cards:[prepared],bulk,baseNames:new Set([prepared.card_faces[1].name]),sequence:9914,limit:1,compilerVersion:10});assert.equal(back.report.cards[0].raw.name,prepared.name);
});

for(const role of ['human','ai']){
  test(role+': attack-count discounts retain departed attackers, count each object once, survive saves and reset next turn',async()=>{
    for(const name of ['The Mary Janes','Witchstalker Frenzy']){
      const f=context(M,role),first=put(M,f.game,f.a,'Grizzly Bears'),second=put(M,f.game,f.a,'Ornithopter');
      const target=put(M,f.game,f.b,'Shivan Dragon'),spell=put(M,f.game,f.a,name,'hand'),opposing=put(M,f.game,f.b,name,'hand');
      let attackers=[first,second],made=false;
      choose(f.a,q=>q.type==='attackers'?attackers.map(card=>({card,target:f.b})):undefined);
      const emit=f.game.emit;
      f.game.emit=async function(event,data,...args){const result=await emit.call(this,event,data,...args);if(event==='attackersDeclared'&&!made){made=true;await this.makeTokens('spiritW',f.a,{attacking:f.b});}return result;};
      const cost=(player,card)=>f.game.spellCost(player,card,{from:'hand'}).generic;
      assert.equal(cost(f.a,spell),3);
      await f.game.combatPhase(f.a);await settle(f.game);
      assert.equal(made,true);assert.equal(cost(f.a,spell),1,'entering already attacking does not add an attacker');
      assert.equal(cost(f.b,opposing),1,'an opposing caster counts the same declared attackers');
      first.tapped=false;second.tapped=false;await f.game.combatPhase(f.a);await settle(f.game);
      assert.equal(cost(f.a,spell),1,'the same objects attacking in another combat are counted once');
      await f.game.move(first,'hand');await f.game.putPermanentOntoBattlefield(first,f.a);await settle(f.game);first.sick=false;first.tapped=false;attackers=[first];
      await f.game.combatPhase(f.a);await settle(f.game);
      assert.equal(cost(f.a,spell),0,'the returned creature is a new battlefield object');
      await f.game.move(first,'hand');await f.game.move(second,'graveyard');await settle(f.game);
      assert.equal(cost(f.a,spell),0,'departure does not erase the earlier attacks');
      f.game.phase='main1';f.game.step='main';
      const saved=M.captureGameState(f.game);assert.ok(saved,M.gameStateSnapshotBlockers(f.game).join(', '));
      const resumed=context(M,role);M.restoreGameState(resumed.game,JSON.parse(JSON.stringify(saved)));
      const restored=resumed.game.byIid(spell.iid),enemy=resumed.game.byIid(target.iid);
      assert.equal(resumed.game.spellCost(resumed.a,restored,{from:'hand'}).generic,0);
      assert.equal(await resumed.game.castSpell(resumed.a,restored,{from:'hand'}),false,'the colored pip is still required');
      resumed.a.pool.R=1;choose(resumed.a,q=>q.type==='chooseTargets'&&q.candidates.includes(enemy)?[enemy]:undefined);
      assert.equal(await resumed.game.castSpell(resumed.a,restored,{from:'hand'}),true);
      assert.equal(resumed.game.stack.find(row=>row.card===restored).manaSpent,1);await settle(resumed.game);
      if(name==='Witchstalker Frenzy')assert.equal(enemy.zone,'graveyard');else assert.equal(restored.zone,'battlefield');
      await cleanup(resumed);const next=put(M,resumed.game,resumed.a,name,'hand');
      assert.equal(resumed.game.spellCost(resumed.a,next,{from:'hand'}).generic,3,'a new turn resets the global attack count');
      assertGameStateInvariants(resumed.game);
    }
  });
  test(role+': both Cecil faces retain printed Oracle text through a real damage-triggered transformation and zone reset',async()=>{
    const name='Cecil, Dark Knight // Cecil, Redeemed Paladin',printed=sources.find(card=>card.name===name),f=context(M,role),source=put(M,f.game,f.a,name);assert.equal(source.def.oracle,printed.card_faces[0].oracle_text);
    f.a.life=21;source.tapped=true;await f.game.damagePlayer(source,f.b,2);await settle(f.game);assert.equal(source.oracleFace,'back');assert.equal(source.tapped,false);assert.equal(source.def.oracle,printed.card_faces[1].oracle_text);
    await f.game.move(source,'hand');assert.equal(source.oracleFace,'front');assert.equal(source.def.oracle,printed.card_faces[0].oracle_text);assertGameStateInvariants(f.game);
  });
  test(role+': Meathook uses the X actually paid on entry and observes both sides simultaneous deaths',async()=>{
    const f=context(M,role),own=put(M,f.game,f.a,'Grizzly Bears'),enemy=put(M,f.game,f.b,'Grizzly Bears'),zero=put(M,f.game,f.b,'Ornithopter'),survivor=put(M,f.game,f.b,'Shivan Dragon'),life=f.a.life,opponentLife=f.b.life;
    choose(f.a,q=>q.type==='chooseX'?2:undefined);const spell=put(M,f.game,f.a,'The Meathook Massacre','hand');fund(f.a);
    assert.equal(await f.game.castSpell(f.a,spell,{from:'hand'}),true);const so=f.game.stack.find(row=>row.card===spell);assert.equal(so.x,2);assert.equal(so.manaSpent,4);await settle(f.game);
    for(const card of [own,enemy,zero])assert.equal(card.zone,'graveyard');assert.equal(survivor.toughness,3);assert.equal(f.a.life,life+2);assert.equal(f.b.life,opponentLife-1);assertGameStateInvariants(f.game);
  });
  test(role+': Power-up subtracts printed mana cost on the entry turn and replaces creature types once per object',async()=>{
    const f=context(M,role),source=await cast(f,'Donald Blake, Guise of Thor');fund(f.a);const before=Object.values(f.a.pool).reduce((a,b)=>a+b,0),ability=f.game.activatableList(f.a).find(row=>row.card===source);assert.ok(ability);
    assert.equal(await f.game.activateAbility(f.a,ability),true);assert.equal(before-Object.values(f.a.pool).reduce((a,b)=>a+b,0),4);await settle(f.game);
    assert.equal(source.power,3);assert.equal(source.toughness,5);assert.equal(source.kw('flying'),true);assert.equal(source.kw('lifelink'),true);assert.deepEqual(new Set(source.cur.subtypes),new Set(['God','Warrior','Hero']));assert.equal(f.game.activatableList(f.a).some(row=>row.card===source),false);
    await f.game.move(source,'exile');await f.game.putPermanentOntoBattlefield(source,f.a);await settle(f.game);assert.equal(source.hasSub('God'),false);assert.equal(source.kw('flying'),false);assert.equal(f.game.activatableList(f.a).some(row=>row.card===source),true);assertGameStateInvariants(f.game);
  });
  test(role+': Enduring returns as an enchantment, preserves its ability, and does not return after its second death',async()=>{
    const f=context(M,role),source=put(M,f.game,f.a,'Enduring Vitality'),other=put(M,f.game,f.a,'Grizzly Bears');
    await f.game.sacrifice(f.a,source);await settle(f.game);
    assert.equal(source.zone,'battlefield');assert.equal(source.is('Creature'),false);assert.equal(source.is('Enchantment'),true);assert.equal(source.hasSub('Elk'),false);
    assert.equal(f.game.canPayMana(f.a,M.parseCost('{U}'),{isAbility:true}),true);assert.equal(await f.game.payMana(f.a,M.parseCost('{U}'),{isAbility:true}),true);assert.equal(other.tapped,true);
    const saved=JSON.parse(JSON.stringify(M.captureGameState(f.game))),resumed=context(M,role);assert.ok(saved?.format);M.restoreGameState(resumed.game,saved);const restored=resumed.game.byIid(source.iid);assert.equal(restored.is('Creature'),false);assert.equal(M.gameStateFingerprint(resumed.game),M.gameStateFingerprint(f.game));
    for(const mutation of [{power:9},{types:['Creature']},{zoneVersion:-1},{timestamp:Number.MAX_SAFE_INTEGER},{keywords:['flying']}]){const invalid=structuredClone(saved);Object.assign(invalid.enchantmentReturns[0],mutation);assert.throws(()=>M.restoreGameState(context(M,role).game,invalid),/invalid enchantment return/);}
    await resumed.game.sacrifice(restored.ctrl,restored);await settle(resumed.game);assert.equal(restored.zone,'graveyard');assert.equal(restored.def.types.includes('Creature'),true);assertGameStateInvariants(resumed.game);
  });
  test(role+': Enduring death trigger cannot retrieve a card that left its graveyard identity',async()=>{
    const f=context(M,role),source=put(M,f.game,f.a,'Enduring Vitality');await f.game.sacrifice(f.a,source);await f.game.flushTriggers();await f.game.move(source,'hand');await settle(f.game);assert.equal(source.zone,'hand');assertGameStateInvariants(f.game);
  });
  test(role+': land-dependent mana checks only controlled lands and preserves type versus color and basic restrictions',async()=>{
    for(const name of ['Naga Vitalist','Harvester Druid','Star Compass'])for(const land of ['none','opponent','Forest','Wastes','Command Tower']){
      const f=context(M,role),source=put(M,f.game,f.a,name);fund(f.a,0);
      if(land!=='none'){const card=put(M,f.game,land==='opponent'?f.b:f.a,land==='opponent'?'Forest':land);card.tapped=true;if(land==='Command Tower')f.a.colorIdentity=['G'];}
      const produce=source.def.mana.produce(f.game,source,f.a),colors=new Set(produce.flatMap(row=>Object.keys(row)));
      if(land==='none'||land==='opponent')assert.equal(colors.size,0);
      else if(land==='Forest')assert.deepEqual([...colors],['G']);
      else if(land==='Wastes')assert.deepEqual([...colors],name==='Naga Vitalist'?['C']:[]);
      else assert.deepEqual([...colors],name==='Star Compass'?[]:['G']);
      assert.equal(source.tapped,false);assertGameStateInvariants(f.game);
    }
  });
  test(role+': additional enchanted-land mana is spendable, and snow provenance follows the land',async()=>{
    const f=context(M,role),land=put(M,f.game,f.a,'Forest'),aura=put(M,f.game,f.a,'Glittering Frost');await f.game.attach(aura,land);fund(f.a,0);
    assert.equal(land.cur.super.includes('Snow'),true);assert.equal(f.game.canPayMana(f.a,M.parseCost('{S}{S}'),{isAbility:true}),true);
    assert.equal(await f.game.payMana(f.a,M.parseCost('{S}{S}'),{isAbility:true}),true);assert.equal(land.tapped,true);assert.equal(Object.values(f.a.pool).reduce((a,b)=>a+b,0),0);
    await f.game.move(aura,'exile');land.tapped=false;assert.equal(f.game.canPayMana(f.a,M.parseCost('{S}'),{isAbility:true}),false);assertGameStateInvariants(f.game);
  });
  test(role+': Insist survives nonmatching spells, applies once, and does not protect a spell copy',async()=>{
    const f=context(M,role);await cast(f,'Insist');await cast(f,'Dark Ritual');const source=put(M,f.game,f.a,'Grizzly Bears','hand');fund(f.a);
    assert.equal(await f.game.castSpell(f.a,source,{from:'hand'}),true);const original=f.game.stack.find(row=>row.card===source);assert.equal(M.isUncounterable(f.game,original),true);
    await f.game.copySpell(original,f.a,{mayNewTargets:false});const copied=f.game.stack.at(-1);assert.notEqual(copied,original);assert.equal(M.isUncounterable(f.game,copied),false);assert.equal(await f.game.counterStackObject(copied),true);assert.equal(await f.game.counterStackObject(original),false);await settle(f.game);
    const second=put(M,f.game,f.a,'Grizzly Bears','hand');assert.equal(await f.game.castSpell(f.a,second,{from:'hand'}),true);assert.equal(M.isUncounterable(f.game,f.game.stack.at(-1)),false);await settle(f.game);assertGameStateInvariants(f.game);
  });
  test(role+': unused next-spell protection expires in actual turn cleanup',async()=>{
    const f=context(M,role);await cast(f,'Overmaster');await cleanup(f);const spell=put(M,f.game,f.a,'Dark Ritual','hand');fund(f.a);f.game.phase='main1';
    assert.equal(await f.game.castSpell(f.a,spell,{from:'hand'}),true);assert.equal(M.isUncounterable(f.game,f.game.stack.at(-1)),false);await settle(f.game);assertGameStateInvariants(f.game);
  });
  test(role+': Rootwire uses sacrificed prototype power and its token loses granted haste at cleanup',async()=>{
    const f=context(M,role),source=await cast(f,'Rootwire Amalgam',null,{oraclePrototypeV10:true});fund(f.a);
    const ability=f.game.activatableList(f.a).find(row=>row.card===source&&row.ability.cost?.sacSelf);assert.ok(ability);assert.equal(await f.game.activateAbility(f.a,ability),true);await settle(f.game);
    const token=f.game.bf().find(card=>card.isToken&&card.hasSub('Golem'));assert.ok(token);assert.equal(token.power,6);assert.equal(token.toughness,6);assert.equal(token.kw('haste'),true);
    await cleanup(f);assert.equal(token.zone,'battlefield');assert.equal(token.kw('haste'),false);assertGameStateInvariants(f.game);
  });
  test(role+': reattaching an Aura moves its continuous restriction to the new host',async()=>{
    const f=context(M,role),first=put(M,f.game,f.b,'Grizzly Bears'),second=put(M,f.game,f.b,'Shivan Dragon'),source=put(M,f.game,f.a,'Stasis Cell');await f.game.attach(source,first);fund(f.a);
    choose(f.a,q=>q.type==='chooseTargets'?[second]:undefined);const ability=f.game.activatableList(f.a).find(row=>row.card===source);assert.ok(ability);assert.equal(await f.game.activateAbility(f.a,ability),true);await settle(f.game);
    assert.equal(source.attachedTo,second.iid);assert.equal(first.attachments.includes(source.iid),false);assert.equal(second.attachments.includes(source.iid),true);
    assert.equal(!!first.cur.cantUntap,false);assert.equal(second.cur.cantUntap,true);await f.game.move(source,'exile');assert.equal(second.attachments.includes(source.iid),false);assert.equal(!!second.cur.cantUntap,false);assertGameStateInvariants(f.game);
  });
  test(role+': Blot Out lets the opponent choose only a greatest-mana-value permanent without targeting it',async()=>{
    const f=context(M,role),low=put(M,f.game,f.b,'Grizzly Bears'),high=put(M,f.game,f.b,'Shivan Dragon'),tie=put(M,f.game,f.b,'Shivan Dragon'),own=put(M,f.game,f.a,'Boulderbranch Golem');
    high.def={...high.def,kws:[...high.def.kws,'shroud','indestructible']};f.game.recalc();let observed=false;
    choose(f.b,q=>{if(q.prompt==='Choose permanents to exile'){assert.deepEqual(new Set(q.from),new Set([high,tie]));observed=true;return [high];}});
    await cast(f,'Blot Out',f.b);assert.equal(observed,true);assert.equal(high.zone,'exile');for(const card of [low,tie,own])assert.equal(card.zone,'battlefield');assertGameStateInvariants(f.game);
  });
  test(role+': Strategic Betrayal exiles both the chosen creature and that opponents entire graveyard',async()=>{
    const f=context(M,role),creature=put(M,f.game,f.b,'Grizzly Bears'),grave=[put(M,f.game,f.b,'Forest','graveyard'),put(M,f.game,f.b,'Dark Ritual','graveyard')],own=put(M,f.game,f.a,'Forest','graveyard');
    await cast(f,'Strategic Betrayal',f.b);assert.equal(creature.zone,'exile');assert.ok(grave.every(card=>card.zone==='exile'));assert.equal(own.zone,'graveyard');assertGameStateInvariants(f.game);
  });
  test(role+': life-loss target qualification is checked at activation and remains true after life gain',async()=>{
    const f=context(M,role),source=put(M,f.game,f.a,'Rix Maadi Guildmage');fund(f.a);choose(f.a,q=>q.type==='chooseTargets'?[f.b]:undefined);
    const get=()=>f.game.activatableList(f.a).find(row=>row.card===source&&row.ability.targets?.some(spec=>spec.what==='player'));
    assert.equal(!!get(),false);await f.game.loseLife(f.b,2);await f.game.gainLife(f.b,2);const life=f.b.life,ability=get();assert.ok(ability);assert.equal(await f.game.activateAbility(f.a,ability),true);await settle(f.game);assert.equal(f.b.life,life-1);assertGameStateInvariants(f.game);
  });
  test(role+': Cavalry Master grants an additional independent instance of flanking only to other qualifying creatures',async()=>{
    const f=context(M,role),master=put(M,f.game,f.a,'Cavalry Master'),attacker=put(M,f.game,f.a,"Telim'Tor"),blocker=put(M,f.game,f.b,'Shivan Dragon');
    await f.game.emit('blocks',{attacker,blocker,player:f.b});await settle(f.game);assert.equal(blocker.toughness,3);
    await f.game.move(master,'exile');await f.game.emit('blocks',{attacker,blocker,player:f.b});await settle(f.game);assert.equal(blocker.toughness,2);assertGameStateInvariants(f.game);
  });
}
