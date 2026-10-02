import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createImportPlan} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v24-common.json',import.meta.url),'utf8')),M=loadEngine(),absent=rows.filter(c=>!M.DEFS[c.name]);
if(absent.length){const plan=createImportPlan({cards:absent,bulk:{type:'oracle_cards'},limit:absent.length,sequence:9955,compilerVersion:24});assert.equal(plan.report.cards.length,absent.length);M.registerOracleBatch(plan.report);M.initData(M.RAW_DATA);}
const fund=p=>{for(const color of ['W','U','B','R','G','C'])p.pool[color]=100;};
const total=p=>Object.values(p.pool).reduce((a,b)=>a+b,0);
for(const role of ['human','ai'])for(const row of rows.filter(c=>/Licid$/.test(c.name)))test(role+': '+row.name+' pays for conversion and ends its exact effect without using the Stack',async()=>{
 const f=context(M,role),{game,a,b}=f;fund(a);fund(b);const source=put(M,game,a,row.name,'hand'),host=put(M,game,b,'Grizzly Bears');
 assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await settle(game);assert.equal(source.zone,'battlefield');assert.equal(source.is('Creature'),true);source.sick=false;
 const activation=game.activatableList(a).find(e=>e.card===source&&e.ability?.oracleLicidV24);assert.ok(activation);const before=total(a);assert.equal(await game.activateAbility(a,activation,[host]),true);assert.ok(total(a)<before);assert.equal(source.tapped,true);assert.equal(source.is('Creature'),true);assert.equal(game.stack.length,1);
 await settle(game);assert.equal(source.is('Creature'),false);assert.equal(source.is('Enchantment'),true);assert.equal(source.hasSub('Aura'),true);assert.equal(source.attachedTo,host.iid);assert.equal(game.activatableList(a).some(e=>e.card===source&&e.ability?.oracleLicidV24),false);
 const grant=source.def.oracleImplementation.find(op=>op.kind==='attachment-grant');for(const keyword of grant?.keywords||[])assert.equal(host.kw(keyword),true);
 if(row.name==='Dominating Licid')assert.equal(host.ctrl,a);if(row.name==='Transmogrifying Licid'){assert.equal(host.is('Artifact'),true);assert.equal(host.power,3);assert.equal(host.toughness,3);}
 game.turnPlayer=b;game.phase='main1';const unrelated=put(M,game,b,'Grizzly Bears','hand');assert.equal(await game.castSpell(b,unrelated,{from:'hand'}),true);const size=game.stack.length,end=game.activatableList(a,true).find(e=>e.card===source&&e.oracleLicidEndV24);assert.ok(end);const prior=total(a);
 assert.equal(await game.activateAbility(a,end),true);assert.equal(game.stack.length,size);assert.ok(total(a)<prior);assert.equal(source.is('Creature'),true);assert.equal(source.attachedTo,null);assert.equal(host.attachments.includes(source.iid),false);assert.equal(source.tapped,true);assert.equal(M.OracleV24Common.records(game,source).length,0);assert.equal(host.ctrl,b);await settle(game);assertGameStateInvariants(game);
});
for(const role of ['human','ai'])for(const name of rows.filter(c=>/\bEpic\b/.test(c.oracle_text)).map(c=>c.name))test(role+': '+name+' actual paid Epic locks casting and creates exactly one non-Epic copy each own upkeep',async()=>{
 const f=context(M,role),{game,a,b}=f;fund(a);fund(b);put(M,game,a,'Rancor','library');put(M,game,a,'Grizzly Bears','hand');put(M,game,a,'Grizzly Bears');put(M,game,b,'Grizzly Bears','library');put(M,game,a,'Grizzly Bears','library');put(M,game,a,'Forest','library');put(M,game,a,'Forest','library');const choose=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='chooseCards'&&q.search?q.from.slice(0,Math.max(q.min,Math.min(1,q.max))):choose(g,q);const source=put(M,game,a,name,'hand'),before=total(a);
 assert.equal(await game.castSpell(a,source,{from:'hand',quickTargets:[b]}),true);assert.ok(total(a)<before);const original=game.stack.at(-1);await settle(game);assert.equal(source.zone,'graveyard');assert.equal(M.OracleV24Common.epic(game,a),true);assert.equal(game.delayed.filter(d=>d.name.includes('Epic')).length,1);assert.equal(game.castableList(a).length,0);assert.equal(await game.castSpell(a,a.hand[0],{from:'hand',alt:{free:true}}),false);assert.equal(M.OracleV24Common.epic(game,b),false);
 await game.emit('upkeep',{player:b});await settle(game);assert.equal(game.delayed.filter(d=>d.name.includes('Epic')).length,1);
 for(let n=0;n<2;n++){await game.emit('upkeep',{player:a});await game.flushTriggers();assert.equal(game.stack.length,1);await game.resolveTop();assert.equal(game.stack.length,1);assert.equal(game.stack[0].isCopy,true);assert.equal(game.stack[0].copyRoot,original);assert.equal(game.stack[0].oracleDefinition.oracleImplementation.some(op=>op.kind==='spell-epic-v24'),false);await settle(game);assert.equal(game.delayed.filter(d=>d.name.includes('Epic')).length,1);}assertGameStateInvariants(game);
});

for(const role of ['human','ai']){
 test(role+': two unresolved Licid activations retain two independent paid end permissions',async()=>{
  const {game,a,b}=context(M,role);fund(a);const source=put(M,game,a,'Quickening Licid'),host=put(M,game,b,'Grizzly Bears');
  for(let i=0;i<2;i++){game.untap(source);const ability=game.activatableList(a).find(e=>e.card===source&&e.ability?.oracleLicidV24);assert.ok(ability);assert.equal(await game.activateAbility(a,ability,[host]),true);}assert.equal(game.stack.length,2);await settle(game);assert.equal(M.OracleV24Common.records(game,source).length,2);
  let end=game.activatableList(a).find(e=>e.card===source&&e.oracleLicidEndV24);assert.equal(await game.activateAbility(a,end),true);assert.equal(source.hasSub('Aura'),true);assert.equal(source.attachedTo,host.iid);assert.equal(M.OracleV24Common.records(game,source).length,1);
  end=game.activatableList(a).find(e=>e.card===source&&e.oracleLicidEndV24);assert.equal(await game.activateAbility(a,end),true);assert.equal(source.is('Creature'),true);assert.equal(source.attachedTo,null);assertGameStateInvariants(game);
 });
 for(const changed of ['source','target'])test(role+': Licid conversion rejects a '+changed+' that leaves and returns before resolution',async()=>{
  const {game,a,b}=context(M,role);fund(a);const source=put(M,game,a,'Quickening Licid'),host=put(M,game,b,'Grizzly Bears'),ability=game.activatableList(a).find(e=>e.card===source&&e.ability?.oracleLicidV24);
  assert.equal(await game.activateAbility(a,ability,[host]),true);const card=changed==='source'?source:host;await game.move(card,'exile');await game.putPermanentOntoBattlefield(card,card.owner);await settle(game);assert.equal(source.is('Creature'),true);assert.equal(source.attachedTo,null);assert.equal(M.OracleV24Common.records(game,source).length,0);assertGameStateInvariants(game);
 });
 test(role+': Licid can pay its special end action under Split Second and makes the Aura removal target illegal',async()=>{
  const {game,a,b}=context(M,role);fund(a);fund(b);const source=put(M,game,a,'Quickening Licid'),host=put(M,game,b,'Grizzly Bears'),ability=game.activatableList(a).find(e=>e.card===source&&e.ability?.oracleLicidV24);
  assert.equal(await game.activateAbility(a,ability,[host]),true);await settle(game);game.turnPlayer=b;const grip=put(M,game,b,'Krosan Grip','hand');assert.equal(await game.castSpell(b,grip,{from:'hand',quickTargets:[source]}),true);assert.equal(game.hasSplitSecond(),true);const end=game.activatableList(a,true).find(e=>e.card===source&&e.oracleLicidEndV24);assert.ok(end);assert.equal(end.turnFaceUp,undefined);assert.equal(await game.activateAbility(a,end),true);assert.equal(game.stack.length,1);await settle(game);assert.equal(source.zone,'battlefield');assert.equal(source.is('Creature'),true);assert.equal(grip.zone,'graveyard');assertGameStateInvariants(game);
 });
 test(role+': a Licid targeting itself becomes an unattached Aura and is put in the graveyard',async()=>{
  const {game,a}=context(M,role);fund(a);const source=put(M,game,a,'Quickening Licid'),ability=game.activatableList(a).find(e=>e.card===source&&e.ability?.oracleLicidV24);assert.equal(await game.activateAbility(a,ability,[source]),true);await settle(game);assert.equal(source.zone,'graveyard');assertGameStateInvariants(game);
 });
 test(role+': Epic copied before initial resolution establishes two recurring abilities; the upkeep copies add none',async()=>{
  const {game,a}=context(M,role);fund(a);put(M,game,a,'Grizzly Bears','hand');const source=put(M,game,a,'Endless Swarm','hand');assert.equal(await game.castSpell(a,source,{from:'hand'}),true);const original=game.stack[0];assert.ok(await game.copySpell(original,a,{mayNewTargets:false}));await settle(game);assert.equal(game.delayed.filter(d=>d.name.includes('Epic')).length,2);await game.emit('upkeep',{player:a});await settle(game);assert.equal(game.delayed.filter(d=>d.name.includes('Epic')).length,2);assertGameStateInvariants(game);
 });
 test(role+': countered or fizzled Epic creates no casting lock or recurring ability',async()=>{
  for(const mode of ['countered','fizzled']){const {game,a,b}=context(M,role);fund(a);const target=put(M,game,b,'Grizzly Bears'),source=put(M,game,a,mode==='countered'?'Endless Swarm':'Undying Flames','hand');const decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(target)?[target]:decide(g,q);assert.equal(await game.castSpell(a,source,{from:'hand',quickTargets:[target]}),true);if(mode==='fizzled')assert.equal(game.stack[0].targets[0],target);if(mode==='countered')await game.counterStackObject(game.stack[0]);else{await game.move(target,'exile');await game.putPermanentOntoBattlefield(target,b);}await settle(game);assert.equal(M.OracleV24Common.epic(game,a),false,mode);assert.equal(game.delayed.filter(d=>d.name.includes('Epic')).length,0);assertGameStateInvariants(game);}
 });
}
test('Epic and Licid permissions survive AI graph cloning without changing the live game',async()=>{
 const {game,a,b}=context(M,'human');fund(a);const source=put(M,game,a,'Quickening Licid'),host=put(M,game,b,'Grizzly Bears');assert.equal(await game.activateAbility(a,game.activatableList(a).find(e=>e.card===source&&e.ability?.oracleLicidV24),[host]),true);await settle(game);
 const spell=put(M,game,a,'Endless Swarm','hand');assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);await settle(game);const clone=M.cloneGameForAISimulation(game,77),owner=clone.players[0],licid=clone.byIid(source.iid);assert.equal(M.OracleV24Common.epic(clone,owner),true);assert.equal(clone.castableList(owner).length,0);
 const end=clone.activatableList(owner).find(e=>e.card===licid&&e.oracleLicidEndV24);assert.ok(end);assert.equal(await clone.activateAbility(owner,end),true);assert.equal(licid.is('Creature'),true);assert.equal(source.hasSub('Aura'),true);
 await clone.emit('upkeep',{player:owner});await clone.flushTriggers();await clone.resolveTop();assert.equal(clone.stack.length,1);assert.equal(clone.stack[0].card.owner,owner);assert.notEqual(clone.stack[0].card,spell);await settle(clone);assert.equal(game.stack.length,0);assertGameStateInvariants(clone);assertGameStateInvariants(game);
});
