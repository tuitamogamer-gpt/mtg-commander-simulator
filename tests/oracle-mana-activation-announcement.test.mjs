import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadEngine} from './helpers/load-engine.mjs';
import {createFixturePlan,registerCanonicalFixturePlan} from './helpers/oracle-fixture-plan.mjs';

import {context,settle} from './helpers/oracle-v8-fixtures.mjs';
import {fund,total,put,permanent,choose} from './helpers/oracle-v30-permanents-proof.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v66-common.json',import.meta.url))).filter(row=>row.name==='Katabatic Winds');
const plan=createFixturePlan(rows,69,9971),M=loadEngine();
registerCanonicalFixturePlan(M,plan);

async function setup(role,name){
 const f=context(M,role),{game:g,a}=f;fund(a);g.spotlight=async()=>{};
 const source=put(M,a,name,'hand'),before=total(a);
 assert.equal(await g.castSpell(a,source,{from:'hand'}),true);assert.equal(total(a),before-2);await settle(g);source.sick=false;
 for(const color of Object.keys(a.pool))a.pool[color]=0;
 a.pool.C=2;
 const activation=g.activatableList(a).find(entry=>entry.card===source&&entry.manaAbility&&entry.manaSource.extraCost.mana);
 assert.ok(activation,'the actual printed mana ability is offered');
 const activated=[],emit=g.emit;
 g.emit=async function(event,data){if(event==='abilityActivated'&&data.isMana)activated.push(data);return emit.call(this,event,data);};
 let colorQuestions=0;
 choose(a,q=>{if(q.type!=='chooseOption'||q.aiHint?.kind!=='manaColor')return null;colorQuestions++;
  const option=q.options.find(row=>row.key==='W'||row.mana?.W===1);assert.ok(option);
  return {...q,options:[option]};});
 return {...f,source,activation,activated,colorQuestions:()=>colorQuestions};
}
function cleanRejected(f,fee){
 assert.equal(total(f.a),fee);assert.equal(f.source.tapped,false);
 assert.equal(f.a.turnState.artifactAbilitiesActivated||0,0);
 assert.equal(f.activated.length,0);assert.equal(f.game.stack.length,0);
 assert.equal(f.a.controller instanceof M.AIController,f.a.isAI);
 assertGameStateInvariants(f.game);
}

for(const role of ['human','ai']){
 for(const [name,fee]of [['Prismite',2],['Prismatic Lens',1]]){
  test(`${role}: paid ${name} announces its actual color once and pays the native mana activation fee`,async()=>{
   const f=await setup(role,name),{game:g,a,source}=f;a.pool.C=fee;
   assert.equal(await g.activateAbility(a,f.activation),true);
   assert.equal(f.colorQuestions(),1);assert.equal(a.pool.C,0);assert.equal(a.pool.W,1);assert.equal(total(a),1);
   assert.equal(source.tapped,name==='Prismatic Lens');assert.equal(a.turnState.artifactAbilitiesActivated,1);
   assert.equal(f.activated.length,1);assert.equal(f.activated[0].card,source);assert.equal(f.activated[0].sourceZoneVersionV44,source.zoneVersion);
   assert.equal(a.turnState.starterGraveActivity||false,false);assert.equal(g.stack.length,0);assertGameStateInvariants(g);
  });
  test(`${role}: ${name} source blink during native mana-color choice spends no activation fee`,async()=>{
   const f=await setup(role,name),{game:g,a,source}=f;a.pool.C=fee;
   const version=source.zoneVersion,native=a.controller.decide.bind(a.controller);let changed=false;
   a.controller.decide=async(game,q)=>{const answer=await native(game,q);if(!changed&&q.type==='chooseOption'&&q.aiHint?.kind==='manaColor'){
    changed=true;await game.move(source,'hand');await game.putPermanentOntoBattlefield(source,a);
   }return answer;};
   assert.equal(await g.activateAbility(a,f.activation),false);assert.equal(changed,true);assert.ok(source.zoneVersion>version);
   assert.equal(f.colorQuestions(),1);assert.equal(a.pool.W,0);cleanRejected(f,fee);
  });
 }
 test(`${role}: actual Katabatic Winds entering during Lens ANY announcement forbids activation without fee or tap`,async()=>{
  const f=await setup(role,'Prismatic Lens'),{game:g,a,b,source}=f;a.pool.C=1;
  g.addOracleAnimation(source,{types:['Creature'],subtypes:[],keywords:[],colors:null,retainTypes:true,power:2,toughness:2,temporary:true});
  M.E.grantUntilEOT(g,source,['flying']);assert.equal(source.is('Creature'),true);assert.equal(source.kw('flying'),true);
  const winds=put(M,b,'Katabatic Winds','hand'),native=a.controller.decide.bind(a.controller);let changed=false;
  a.controller.decide=async(game,q)=>{const answer=await native(game,q);if(!changed&&q.type==='chooseOption'&&q.aiHint?.kind==='manaColor'){
   changed=true;await game.putPermanentOntoBattlefield(winds,b);
  }return answer;};
  assert.equal(await g.activateAbility(a,f.activation),false);assert.equal(changed,true);assert.equal(winds.zone,'battlefield');
  assert.equal(M.oracleManaAbilityAllowedV66(g,a,f.activation.manaSource),false);assert.equal(a.pool.W,0);cleanRejected(f,1);
 });
 test(`${role}: Prismite may legally sacrifice its own source to Altar while paying its announced mana ability`,async()=>{
  const f=await setup(role,'Prismite'),{game:g,a,source}=f,altar=permanent(M,g,a,M.DEFS['Phyrexian Altar']);a.pool.C=1;
  choose(a,q=>q.type==='chooseCards'&&q.from.includes(source)?{...q,from:[source],min:1,max:1}:null);
  const version=source.zoneVersion;
  assert.equal(await g.activateAbility(a,f.activation),true);
  assert.equal(source.zone,'graveyard');assert.equal(altar.zone,'battlefield');assert.equal(total(a),1);assert.equal(a.pool.W,1);
  assert.equal(f.activated.filter(row=>row.card===source).length,1);
  const actual=f.activated.find(row=>row.card===source);assert.equal(actual.sourceZoneVersionV44,version);
  assert.equal(actual.sourceSnapshotV44.types.includes('Creature'),true);
  assert.equal(a.turnState.artifactAbilitiesActivated,2);assert.equal(a.turnState.starterGraveActivity||false,false);
  assert.equal(g.stack.length,0);assertGameStateInvariants(g);
 });
 test(`${role}: actual paid Petalmane Baku permits X=0 and spends its fee without counters or mana output`,async()=>{
  const f=await setup(role,'Petalmane Baku'),{game:g,a,source}=f;a.pool.C=1;
  assert.equal(source.counters.ki||0,0);assert.equal(f.activation.manaSource.extraCost.tap,undefined);
  choose(a,q=>q.type==='chooseOption'&&q.aiHint?.kind==='storageManaAmount'?{...q,options:q.options.filter(option=>option.key==='0')}:null);
  assert.equal(await g.activateAbility(a,f.activation),true);assert.equal(total(a),0);
  assert.equal(source.counters.ki||0,0);assert.equal(source.tapped,false);assert.equal(f.colorQuestions(),0);
  assert.equal(f.activated.length,1);assert.equal(f.activated[0].card,source);
  assert.equal(g.stack.length,0);assertGameStateInvariants(g);
 });
 test(`${role}: actual Baku X=0 may sacrifice itself to its paid Altar for the native activation fee`,async()=>{
  const f=await setup(role,'Petalmane Baku'),{game:g,a,source}=f;a.pool.C=3;
  const altar=put(M,a,'Phyrexian Altar','hand');assert.equal(await g.castSpell(a,altar,{from:'hand'}),true);assert.equal(total(a),0);await settle(g);
  choose(a,q=>q.type==='chooseOption'&&q.aiHint?.kind==='storageManaAmount'?{...q,options:q.options.filter(option=>option.key==='0')}:
   q.type==='chooseCards'&&q.from.includes(source)?{...q,from:[source],min:1,max:1}:null);
  assert.equal(source.counters.ki||0,0);const version=source.zoneVersion;
  assert.equal(await g.activateAbility(a,f.activation),true);
  assert.equal(source.zone,'graveyard');assert.equal(source.counters.ki||0,0);assert.equal(altar.zone,'battlefield');assert.equal(total(a),0);
  const actual=f.activated.filter(row=>row.card===source);assert.equal(actual.length,1);assert.equal(actual[0].sourceZoneVersionV44,version);
  assert.equal(a.turnState.artifactAbilitiesActivated,1);assert.equal(a.turnState.starterGraveActivity||false,false);
  assert.equal(g.stack.length,0);assertGameStateInvariants(g);
 });
 for(const payWithAltar of [true,false])test(`${role}: Grotto ${payWithAltar?'announces raw color before its fee removes Contamination':'keeps fixed black without an unnecessary picker for a pool-only fee'}`,async()=>{
  const f=context(M,role),{game:g,a}=f;fund(a);g.spotlight=async()=>{};
  const sources={};
  for(const [name,cost]of [['Opalescence',4],['Contamination',3],['Phyrexian Altar',3]]){
   const source=put(M,a,name,'hand'),before=total(a);assert.ok(source.def);
   assert.equal(await g.castSpell(a,source,{from:'hand'}),true);assert.equal(total(a),before-cost);await settle(g);sources[name]=source;
  }
  const contamination=sources.Contamination,altar=sources['Phyrexian Altar'];
  assert.equal(contamination.is('Creature'),true,'actual Opalescence makes the paid Contamination a legal Altar sacrifice');
  const grotto=put(M,a,'Shimmering Grotto','hand');assert.equal(await g.playLand(a,grotto),true);
  for(const color of Object.keys(a.pool))a.pool[color]=0;if(!payWithAltar)a.pool.C=1;
  const activation=g.activatableList(a).find(row=>row.card===grotto&&row.manaAbility&&row.manaSource.extraCost.mana);
  assert.ok(activation);assert.deepEqual(JSON.parse(JSON.stringify(activation.manaSource.produce)),[{B:1}]);
  let colorQuestions=0,donorQuestions=0;
  choose(a,q=>{
   if(q.type==='chooseCards'&&q.from.includes(contamination)){donorQuestions++;return {...q,from:[contamination],min:1,max:1};}
   if(q.type==='chooseOption'&&q.aiHint?.kind==='manaColor'){
    colorQuestions++;assert.equal(payWithAltar,true);assert.equal(contamination.zone,'battlefield');assert.equal(grotto.tapped,false);assert.equal(total(a),0);
    assert.ok(q.options.some(option=>option.key==='U'));return {...q,options:q.options.filter(option=>option.key==='U')};
   }
   return null;
  });
  assert.equal(await g.activateAbility(a,activation),true);
  assert.equal(colorQuestions,payWithAltar?1:0);assert.equal(donorQuestions,payWithAltar?1:0);
  assert.equal(contamination.zone,payWithAltar?'graveyard':'battlefield');assert.equal(altar.zone,'battlefield');assert.equal(grotto.tapped,true);
  assert.equal(total(a),1);assert.equal(a.pool[payWithAltar?'U':'B'],1);assert.equal(a.pool[payWithAltar?'B':'U'],0);
  assert.equal(g.stack.length,0);assertGameStateInvariants(g);
 });
}
