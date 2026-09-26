import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createImportPlan,semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v20-damage.json',import.meta.url),'utf8'));
const M=loadEngine(),absent=rows.filter(c=>!M.DEFS[c.name]);
if(absent.length){const plan=createImportPlan({cards:absent,bulk:{type:'oracle_cards'},sequence:9949,limit:absent.length,compilerVersion:20});M.registerOracleBatch(plan.report);M.initData(M.RAW_DATA);}
const fund=p=>{for(const color of ['W','U','B','R','G','C'])p.pool[color]=40;};
const bear=(g,p,name='Damage boundary witness')=>{const c=put(M,g,p,'Grizzly Bears');c.def={...c.def,name,power:'2',toughness:'30'};g.recalc();return c;};
const cast=async(f,name,targets=[])=>{fund(f.a);const card=put(M,f.game,f.a,name,'hand'),decide=f.a.controller.decide.bind(f.a.controller);f.a.controller.decide=(g,q)=>q.type==='chooseTargets'&&targets.length&&targets.every(t=>q.candidates.includes(t))?targets:decide(g,q);try{assert.equal(await f.game.castSpell(f.a,card,{from:'hand'}),true);await settle(f.game);}finally{f.a.controller.decide=decide;}return card;};
for(const role of ['human','ai']){
 test(role+': Story Circle retains its activation color after source departure and rechecks the damage source color',async()=>{
  const f=context(M,role),{game,a,b}=f,enemy=bear(game,b);enemy.def={...enemy.def,colorsOverride:['R']};game.recalc();const decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.prompt==='Story Circle: choose a color'?'R':decide(g,q);
  const circle=await cast(f,'Story Circle');a.controller.decide=decide;assert.equal(circle.meta.oracleChosenColor,'R');fund(a);const action=game.activatableList(a).find(row=>row.card===circle&&row.ability);assert.ok(action);assert.equal(await game.activateAbility(a,action),true);await game.move(circle,'exile');await settle(game);
  const shield=game.untilEffects.find(e=>e.kind==='oracleChosenSourcePrevention');assert.ok(shield);assert.deepEqual(Array.from(shield.effect.quality.colors),['R']);assert.equal(shield.sourceRecord.card.iid,enemy.iid);
  enemy.def={...enemy.def,colorsOverride:['G']};game.recalc();assert.equal(await game.damageAny(enemy,a,2),2);assert.equal(shield.consumed,false);enemy.def={...enemy.def,colorsOverride:['R']};game.recalc();assert.equal(await game.damageAny(enemy,a,2),0);assert.equal(shield.consumed,true);assert.equal(await game.damageAny(enemy,a,1),1);assertGameStateInvariants(game);
 });
 test(role+': Circle of Protection Shadow requires shadow at choice and at the damage event',async()=>{
  const f=context(M,role),{game,a,b}=f,enemy=bear(game,b);enemy.def={...enemy.def,kws:['shadow']};game.recalc();const circle=await cast(f,'Circle of Protection: Shadow');fund(a);const action=game.activatableList(a).find(row=>row.card===circle&&row.ability);assert.ok(action);assert.equal(await game.activateAbility(a,action),true);await settle(game);
  const shield=game.untilEffects.find(e=>e.kind==='oracleChosenSourcePrevention');assert.equal(shield.sourceRecord.card.iid,enemy.iid);enemy.def={...enemy.def,kws:[]};game.recalc();assert.equal(await game.damageAny(enemy,a,2),2);assert.equal(shield.consumed,false);enemy.def={...enemy.def,kws:['shadow']};game.recalc();assert.equal(await game.damageAny(enemy,a,2,{cantBePrevented:true}),2);assert.equal(shield.consumed,false);assert.equal(await game.damageAny(enemy,a,2),0);assertGameStateInvariants(game);
 });
 test(role+': Dralnu replaces unpreventable damage with a controller choice of sacrifices',async()=>{
  const {game,a,b}=context(M,role),dralnu=put(M,game,a,'Dralnu, Lich Lord'),enemy=bear(game,b),first=put(M,game,a,'Forest'),second=put(M,game,a,'Forest');
  const decide=a.controller.decide.bind(a.controller);let choices=0;
  a.controller.decide=(g,q)=>{if(q.type==='chooseCards'&&q.aiHint?.kind==='sacrifice'&&q.aiHint.src===dralnu){choices++;assert.equal(q.min,2);assert.equal(q.max,2);assert.ok(q.from.includes(dralnu));return [first,second];}return decide(g,q);};
  assert.equal(await game.damageAny(enemy,dralnu,2,{cantBePrevented:true}),0);assert.equal(dralnu.damage,0);assert.equal(first.zone,'graveyard');assert.equal(second.zone,'graveyard');assert.equal(choices,1);
  M.OracleV8AbilityLoss.add(game,[dralnu],{});assert.equal(await game.damageAny(enemy,dralnu,1),1);assert.equal(dralnu.damage,1);assert.equal(choices,1);assertGameStateInvariants(game);
 });
 test(role+': Haze Frog exempts its own combat damage and leaves noncombat damage unchanged',async()=>{
  const f=context(M,role),{game,a,b}=f,enemy=bear(game,b),frog=await cast(f,'Haze Frog'),before=b.life;
  assert.equal(await game.damageAny(frog,b,2,{combat:true}),2);assert.equal(b.life,before-2);const ownLife=a.life;
  assert.equal(await game.damageAny(enemy,a,2,{combat:true}),0);assert.equal(a.life,ownLife);assert.equal(await game.damageAny(enemy,a,2),2);assert.equal(a.life,ownLife-2);assertGameStateInvariants(game);
 });
 test(role+': a chosen source redirect covers the entire next simultaneous event and then expires',async()=>{
  const f=context(M,role),{game,a,b}=f,enemy=bear(game,b),own=bear(game,a);await cast(f,'Reflect Damage');
  const rule=game.untilEffects.find(e=>e.op?.mode==='redirect');assert.equal(rule.records.get('chosen-source-v20')[0].card.iid,enemy.iid);
  const al=a.life,bl=b.life;assert.equal(await game.damageBatch([{src:enemy,target:a,n:2},{src:enemy,target:own,n:3}]),5);assert.equal(a.life,al);assert.equal(b.life,bl-5);assert.equal(own.damage,0);
  assert.equal(await game.damageAny(enemy,a,2),2);assert.equal(a.life,al-2);assertGameStateInvariants(game);
 });
 test(role+': redirection remains effective for unpreventable damage but cannot follow a returned destination',async()=>{
  const f=context(M,role),{game,a,b}=f,enemy=bear(game,b);enemy.attacking=a;await cast(f,'Turn the Tables',[enemy]);const life=a.life;
  assert.equal(await game.damageAny(enemy,a,2,{combat:true,cantBePrevented:true}),2);assert.equal(enemy.damage,2);assert.equal(a.life,life);
  assert.equal(await game.damageAny(enemy,a,1),1);assert.equal(a.life,life-1);
  await game.move(enemy,'hand');await game.move(enemy,'battlefield',{ctrl:b});assert.equal(await game.damageAny(enemy,a,2,{combat:true}),2);assert.equal(a.life,life-3);assertGameStateInvariants(game);
 });
 test(role+': a shield targeting one player does not protect another player',async()=>{
  const f=context(M,role),{game,a,b}=f,enemy=bear(game,b);await cast(f,"Orim's Cure",[a]);const al=a.life,bl=b.life;
  assert.equal(await game.damageAny(enemy,b,2),2);assert.equal(b.life,bl-2);assert.equal(await game.damageAny(enemy,a,2),0);assert.equal(a.life,al);assertGameStateInvariants(game);
 });
 test(role+': Palisade Giant receives damage to its controller and other controlled permanents without a redirect loop',async()=>{
  const f=context(M,role),{game,a,b}=f,giant=put(M,game,a,'Palisade Giant'),own=bear(game,a),enemy=bear(game,b),al=a.life;
  await game.damageBatch([{src:enemy,target:a,n:1},{src:enemy,target:own,n:1},{src:enemy,target:giant,n:1}]);assert.equal(a.life,al);assert.equal(own.damage,0);assert.equal(giant.damage,3);assertGameStateInvariants(game);
 });
 test(role+': finite prevention is spent only on damage actually prevented and does not follow a returned object',async()=>{
  const f=context(M,role),{game,a,b}=f,host=bear(game,a),enemy=bear(game,b);await cast(f,'Test of Faith',[host]);
  assert.equal(await game.damageAny(enemy,host,2,{cantBePrevented:true}),2);assert.equal(host.counters['+1/+1']||0,0);
  assert.equal(await game.damageAny(enemy,host,2),0);assert.equal(host.counters['+1/+1'],2);
  assert.equal(await game.damageAny(enemy,host,2),1);assert.equal(host.counters['+1/+1'],3);assert.equal(await game.damageAny(enemy,host,2),2);
  await cast(f,'Test of Faith',[host]);await game.move(host,'exile');await game.move(host,'battlefield',{ctrl:a});await settle(game);assert.equal(await game.damageAny(enemy,host,2),2);assert.equal(host.counters['+1/+1']||0,0);assertGameStateInvariants(game);
 });
 test(role+': next-time prevention covers one simultaneous damage event, gains its total, and expires after that event',async()=>{
  const f=context(M,role),{game,a,b}=f,enemy=bear(game,b),host=bear(game,a);await cast(f,'Awe Strike',[enemy]);const life=a.life;
  await game.damageBatch([{src:enemy,target:a,n:2},{src:enemy,target:host,n:3}]);assert.equal(a.life,life+5);assert.equal(host.damage,0);
  assert.equal(await game.damageAny(enemy,a,2),2);assert.equal(a.life,life+3);assertGameStateInvariants(game);
 });
 test(role+': a prevented spell can resolve as a permanent and the effect keeps applying to that same source',async()=>{
  const f=context(M,role),{game,a,b}=f;fund(b);game.turnPlayer=b;const spell=put(M,game,b,'Grizzly Bears','hand');assert.equal(await game.castSpell(b,spell,{from:'hand'}),true);const object=game.stack.at(-1);game.turnPlayer=a;
  await cast(f,'Hallow',[object]);assert.equal(spell.zone,'battlefield');const life=a.life;assert.equal(await game.damageAny(spell,a,2),0);assert.equal(a.life,life+2);
  await game.move(spell,'hand');await game.move(spell,'battlefield',{ctrl:b});assert.equal(await game.damageAny(spell,a,2),2);assert.equal(a.life,life);assertGameStateInvariants(game);
 });
 test(role+': Soul-Scar Mage replaces only controlled noncombat damage to opposing creatures',async()=>{
  const f=context(M,role),{game,a,b}=f,mage=put(M,game,a,'Soul-Scar Mage'),own=bear(game,a),enemy=bear(game,b);
  assert.equal(await game.damageAny(own,enemy,3),0);assert.equal(enemy.counters['-1/-1'],3);assert.equal(await game.damageAny(own,enemy,1,{combat:true}),1);assert.equal(await game.damageAny(enemy,own,1),1);
  const life=b.life;assert.equal(await game.damageAny(own,b,1),1);assert.equal(b.life,life-1);M.OracleV8AbilityLoss.add(game,[mage],{});assert.equal(await game.damageAny(own,enemy,1),1);assertGameStateInvariants(game);
 });
 test(role+': prevention additional actions still happen when damage cannot be prevented',async()=>{
  const f=context(M,role),{game,a,b}=f,angel=put(M,game,a,'Angel of Suffering'),enemy=bear(game,b),library=a.library.length,life=a.life;
  assert.equal(await game.damageAny(enemy,a,3,{cantBePrevented:true}),3);assert.equal(a.life,life-3);assert.equal(a.library.length,library-6);M.OracleV8AbilityLoss.add(game,[angel],{});assert.equal(await game.damageAny(enemy,a,1),1);assert.equal(a.library.length,library-6);assertGameStateInvariants(game);
 });
 test(role+': an attached player damage multiplier follows the enchanted player and stops with ability loss',async()=>{
  const f=context(M,role),{game,a,b}=f,enemy=bear(game,b),curse=await cast(f,'Curse of Bloodletting',[b]);assert.equal(curse.meta.cursedPlayer,b);const aLife=a.life,bLife=b.life;
  assert.equal(await game.damageAny(enemy,b,2),4);assert.equal(b.life,bLife-4);assert.equal(await game.damageAny(enemy,a,2),2);assert.equal(a.life,aLife-2);M.OracleV8AbilityLoss.add(game,[curse],{});assert.equal(await game.damageAny(enemy,b,2),2);assertGameStateInvariants(game);
 });
 test(role+': temporary multipliers stop in cleanup and their selected source does not survive a zone change',async()=>{
  const f=context(M,role),{game,a,b}=f,own=bear(game,a);await cast(f,'Overblaze',[own]);assert.equal(await game.damageAny(own,b,2),4);await game.move(own,'hand');await game.move(own,'battlefield',{ctrl:a});assert.equal(await game.damageAny(own,b,2),2);
  await cast(f,'Overblaze',[own]);game.mainPhase=async()=>{};game.combatPhase=async()=>{};await game.runTurn();assert.equal(game.untilEffects.some(e=>e.kind==='oracleDamageRuleV20'),false);assert.equal(await game.damageAny(own,b,2),2);assertGameStateInvariants(game);
 });
}
test('damage compiler rejects extra unimplemented instructions',()=>{
 const base=rows.find(c=>c.name==='Angel of Suffering');assert.ok(semanticClass(base,{compilerVersion:20}).semanticClass);assert.equal(!!semanticClass({...base,oracle_text:base.oracle_text+'\nIgnore all future player choices.'},{compilerVersion:20}).semanticClass,false);
});
