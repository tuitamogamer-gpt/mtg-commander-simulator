import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,settle} from './helpers/oracle-v8-fixtures.mjs';
import {def,permanent,put,choose,total,fund} from './helpers/oracle-v30-permanents-proof.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M=loadEngine();
for(const role of ['human','ai']){
 for(const change of ['none','phase','control','ability-loss','source-blink','sacrifice-blink'])
  test(`${role}: both mana colors are announced before costs (${change})`,async()=>{
   const {game:g,a,b}=context(M,role),sac=permanent(M,g,a,def('Announcement Treasure',['Artifact'],{subtypes:['Treasure']})),
    tap=permanent(M,g,a,def('Announcement tap donor',['Artifact'])),
    source=permanent(M,g,a,def('Announcement ANY producer',['Artifact','Creature'],{
     mana:{oncePerTurn:true,key:'announcement',cost:{tap:true,life:2,rmCounter:{kind:'charge',n:1},
      sac:(_g,c)=>c.hasSub('Treasure'),sacN:1,tapPermanents:{n:1,filter:(_g,c)=>c.is('Artifact')&&!c.hasSub('Treasure')}},
      produce:[{ANY:true,n:2}]},
    }));
   source.counters.charge=1;
   const row=g.manaSources(a).find(r=>r.card===source),pool={...a.pool},life=a.life,version=source.zoneVersion,
    activated=a.turnState.artifactAbilitiesActivated||0,events=[],emit=g.emit;
   assert.ok(row);
   g.emit=async function(event,data){if(event==='abilityActivated'&&data.card===source)events.push(data);return emit.call(this,event,data);};
   let colors=0;const prior=a.controller.decide.bind(a.controller);
   a.controller.decide=async(game,q)=>{
    const answer=await prior(game,q.aiHint?.kind==='manaColor'?{...q,options:q.options.filter(o=>o.key==='G')}:q);
    if(q.aiHint?.kind==='manaColor'){
     colors++;
     assert.equal(source.tapped,false);assert.equal(tap.tapped,false);assert.equal(sac.zone,'battlefield');
     assert.equal(a.life,life);assert.deepEqual({...a.pool},pool);assert.equal(source.counters.charge,1);
     assert.equal(a.turnState.artifactAbilitiesActivated||0,activated);assert.equal(events.length,0);
     if(colors===2){
      if(change==='phase')g.phaseOut(source);
      if(change==='control'){source.ctrl=b;g.recalc();}
      if(change==='ability-loss'){M.OracleV8AbilityLoss.add(g,[source],{temporary:true});g.recalc();}
      if(change==='source-blink'){await g.move(source,'hand');await g.putPermanentOntoBattlefield(source,a);}
      if(change==='sacrifice-blink'){await g.move(sac,'hand');await g.putPermanentOntoBattlefield(sac,a);}
     }
    }
    return answer;
   };
   const ok=await g.activateManaSource(a,row,row.produce[0]);
   assert.equal(colors,2);assert.equal(ok,change==='none');
   if(ok){
    assert.equal(source.tapped,true);assert.equal(tap.tapped,true);assert.equal(sac.zone,'graveyard');
    assert.equal(a.life,life-2);assert.equal(source.counters.charge||0,0);assert.equal(a.pool.G,(pool.G||0)+2);
    assert.equal(events.length,1);assert.equal(events[0].sourceZoneVersionV44,version);
    assert.equal(a.turnState.artifactAbilitiesActivated,activated+1);
    assert.equal(source.meta._mana_announcement,g.turnNo);
   }else{
    assert.equal(source.tapped,false);assert.equal(tap.tapped,false);assert.equal(sac.zone,'battlefield');
    assert.equal(a.life,life);assert.deepEqual({...a.pool},pool);assert.equal(events.length,0);
    assert.equal(a.turnState.artifactAbilitiesActivated||0,activated);assert.equal(source.meta._mana_announcement,undefined);
    if(change!=='source-blink')assert.equal(source.counters.charge,1);
   }
   await settle(g);assert.equal(a.controller instanceof M.AIController,role==='ai');assertGameStateInvariants(g);
  });
 test(`${role}: a mana grant that blinks during the real color decision cannot pay costs`,async()=>{
  const {game:g,a}=context(M,role),source=permanent(M,g,a,def('Announcement granted producer',['Artifact'])),
   granter=permanent(M,g,a,def('Announcement mana grant',['Enchantment'],{
    grantMana:{filter:(_g,c)=>c.is('Artifact'),cost:{tap:true,life:2},produce:[{ANY:true}]},
   })),row=g.manaSources(a).find(r=>r.card===source&&r.grantedBy===granter),pool={...a.pool},life=a.life,version=granter.zoneVersion;
  assert.ok(row);let choices=0;const prior=a.controller.decide.bind(a.controller);
  a.controller.decide=async(game,q)=>{
   const answer=await prior(game,q);
   if(q.aiHint?.kind==='manaColor'){
    choices++;assert.equal(source.tapped,false);assert.equal(a.life,life);
    await g.move(granter,'hand');await g.putPermanentOntoBattlefield(granter,a);
   }
   return answer;
  };
  assert.equal(await g.activateManaSource(a,row,row.produce[0]),false);assert.equal(choices,1);
  assert.notEqual(granter.zoneVersion,version);assert.equal(source.tapped,false);assert.equal(a.life,life);assert.deepEqual({...a.pool},pool);
  assert.equal(a.controller instanceof M.AIController,role==='ai');assertGameStateInvariants(g);
 });
 for(const change of ['recalculate','remove','blink'])test(`${role}: a native regenerated Toxicrene mana grant stays legal only while granted (${change})`,async()=>{
  const {game:g,a}=context(M,role),land=permanent(M,g,a,M.DEFS.Forest),provider=put(M,a,'Toxicrene','hand');
  a.pool.C=3;a.pool.G=1;assert.equal(await g.castSpell(a,provider,{from:'hand'}),true);await settle(g);
  assert.equal(a.pool.C,0);assert.equal(a.pool.G,0);assert.equal(provider.zone,'battlefield');assert.equal(land.tapped,false);
  const row=g.manaSources(a).find(r=>r.card===land&&r.produce[0].ANY),version=land.zoneVersion,providerVersion=provider.zoneVersion;assert.ok(row);
  const prior=a.controller.decide.bind(a.controller);let choices=0;
  a.controller.decide=async(game,q)=>{
   const answer=await prior(game,q.aiHint?.kind==='manaColor'?{...q,options:q.options.filter(o=>o.key==='G')}:q);
   if(q.aiHint?.kind==='manaColor'){
    choices++;assert.equal(land.tapped,false);
    if(change==='remove')await g.move(provider,'graveyard');
    else if(change==='blink'){await g.move(provider,'hand');await g.putPermanentOntoBattlefield(provider,a);}
    else g.recalc();
   }
   return answer;
  };
  assert.equal(await g.activateManaSource(a,row,row.produce[0]),change==='recalculate');assert.equal(choices,1);
  assert.equal(land.zoneVersion,version);assert.equal(land.tapped,change==='recalculate');assert.equal(a.pool.G,change==='recalculate'?1:0);
  if(change==='recalculate')assert.equal(land.cur.extraMana.includes(row.m),false,'the native static intentionally regenerates a new descriptor');
  if(change==='blink')assert.equal(provider.zoneVersion,providerVersion+2);
  assert.equal(a.controller instanceof M.AIController,role==='ai');assertGameStateInvariants(g);
 });
 test(`${role}: native Springjack keeps its exact Goat cost and life effect through a donor-choice recalculation`,async()=>{
  const {game:g,a}=context(M,role),land=put(M,a,'Springjack Pasture','hand');
  assert.equal(await g.playLand(a,land),true);await settle(g);
  const goats=Array.from({length:2},(_,i)=>permanent(M,g,a,def('Announcement Goat '+i,['Creature'],{subtypes:['Goat']}))),
   row=g.manaSources(a).find(r=>r.card===land&&r.extraCost.sacN===2),pool={...a.pool},life=a.life;
  assert.ok(row);const output=row.produce.find(o=>o.G===2);assert.ok(output);
  const prior=a.controller.decide.bind(a.controller);let choices=0;
  a.controller.decide=async(game,q)=>{
   const answer=await prior(game,q);
   if(q.type==='chooseCards'&&q.from.every(c=>goats.includes(c))){
    choices++;assert.equal(land.tapped,false);assert.ok(goats.every(c=>c.zone==='battlefield'));assert.equal(a.life,life);
    g.recalc();assert.equal(land.cur.extraMana.includes(row.m),true,'the same incarnation and amount retain the exact closure');
   }
   return answer;
  };
  assert.equal(await g.activateManaSource(a,row,output),true);assert.equal(choices,1);assert.equal(land.tapped,true);
  assert.ok(goats.every(c=>c.zone==='graveyard'));assert.equal(a.life,life+2);assert.equal(a.pool.G,(pool.G||0)+2);
  assert.equal(a.controller instanceof M.AIController,role==='ai');assertGameStateInvariants(g);
 });
 test(`${role}: an earlier real mana sacrifice preserves a selected native regenerated land grant`,async()=>{
  const {game:g,a}=context(M,role),throne=put(M,a,'The Golden Throne','hand');a.pool.C=4;
  assert.equal(await g.castSpell(a,throne,{from:'hand'}),true);await settle(g);assert.equal(total(a),0);
  const provider=put(M,a,'Toxicrene','hand');a.pool.C=3;a.pool.G=1;
  assert.equal(await g.castSpell(a,provider,{from:'hand'}),true);await settle(g);assert.equal(total(a),0);
  const land=put(M,a,'Forest','hand');assert.equal(await g.playLand(a,land),true);await settle(g);
  const goat=permanent(M,g,a,def('Announcement actual mana sacrifice',['Creature'],{subtypes:['Goat']}));
  choose(a,q=>q.type==='chooseCards'&&q.from.includes(goat)?{...q,from:[goat],min:1,max:1}:
    q.aiHint?.kind==='manaColor'?{...q,options:q.options.filter(o=>o.key==='G')}:null);
  const selected=g.manaSources(a).find(r=>r.card===land),events=[],emit=g.emit;assert.ok(selected);
  g.emit=async function(event,data){if(event==='abilityActivated'&&data.isMana)events.push(data.card);return emit.call(this,event,data);};
  const action=g.activatableList(a).find(r=>r.card===throne&&r.manaAbility);assert.ok(action);
  assert.equal(await g.activateAbility(a,action),true);assert.equal(goat.zone,'graveyard');assert.equal(a.pool.G,3);
  assert.equal(land.cur.extraMana.includes(selected.m),false,'the actual earlier sacrifice recalculates the later selected grant');
  assert.equal(await g.activateManaSource(a,selected,selected.produce[0]),true);assert.equal(a.pool.G,4);
  const spell=put(M,a,'Harmonize','hand'),hand=a.hand.length;
  assert.equal(await g.castSpell(a,spell,{from:'hand'}),true);
  assert.deepEqual(events,[throne,land]);assert.equal(goat.zone,'graveyard');assert.equal(throne.tapped,true);assert.equal(land.tapped,true);
  assert.equal(g.stack.find(row=>row.card===spell).manaSpent,4);assert.equal(total(a),0);
  await settle(g);assert.equal(a.hand.length,hand-1+3);assert.equal(spell.zone,'graveyard');
  assert.equal(a.controller instanceof M.AIController,role==='ai');assertGameStateInvariants(g);
 });
 for(const name of ['Nexos','Discreet Retreat'])test(`${role}: native ${name} survives grant recalculation and preserves its real spending restriction`,async()=>{
  const {game:g,a}=context(M,role),land=put(M,a,'Forest','hand');assert.equal(await g.playLand(a,land),true);await settle(g);
  choose(a,q=>q.type==='chooseTargets'&&q.candidates.includes(land)?{...q,candidates:[land],min:1,max:1}:
    q.aiHint?.kind==='manaColor'?{...q,options:q.options.filter(o=>o.key==='B')}:q.type==='chooseX'?{...q,min:1,max:1}:null);
  const provider=put(M,a,name,'hand');fund(a);const mana=total(a);
  assert.equal(await g.castSpell(a,provider,{from:'hand'}),true);assert.ok(total(a)<mana);await settle(g);
  for(const color of Object.keys(a.pool))a.pool[color]=0;
  const row=g.manaSources(a).find(r=>r.card===land&&r.m.restrict);assert.ok(row);
  g.recalc();assert.equal(land.cur.extraMana.includes(row.m),false);
  assert.equal(await g.activateManaSource(a,row,row.produce[0]),true);assert.equal(land.tapped,true);assert.equal(total(a),2);
  const wrong=put(M,a,name==='Nexos'?'Mind Stone':'Walking Corpse','hand'),before={...a.pool};
  assert.equal(await g.castSpell(a,wrong,{from:'hand'}),false);assert.equal(wrong.zone,'hand');assert.deepEqual({...a.pool},before);
  const spell=put(M,a,name==='Nexos'?'Hangarback Walker':'Vampire Cutthroat','hand');
  assert.equal(await g.castSpell(a,spell,{from:'hand'}),true);
  assert.equal(g.stack.find(so=>so.card===spell).manaSpent,name==='Nexos'?2:1);await settle(g);assert.equal(spell.zone,'battlefield');
  if(name==='Nexos')assert.equal(spell.counters['+1/+1'],1);
  else assert.equal(total(a),1);
  assert.equal(a.controller instanceof M.AIController,role==='ai');assertGameStateInvariants(g);
 });
}
