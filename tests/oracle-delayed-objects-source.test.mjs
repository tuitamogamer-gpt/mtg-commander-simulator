import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {semanticClass,createImportPlan} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-delayed-objects-source.json',import.meta.url)));
const M=loadEngine(),missing=rows.filter(card=>!M.DEFS[card.name]);
for(const card of rows)if(M.DEFS[card.name])assert.equal(M.DEFS[card.name].oracle,card.oracle_text);
if(missing.length){const {report}=createImportPlan({cards:missing,baseNames:new Set(),bulk:{type:'oracle_cards',updated_at:'2026-08-30T09:01:56.964+00:00'},limit:missing.length,sequence:9995,compilerVersion:8});M.registerOracleBatch(report);M.initData(M.RAW_DATA);}
async function cast(ctx,name,p=ctx.a){
 const card=put(M,ctx.game,p,name,'hand');for(const color of'WUBRGC')p.pool[color]=12;
 assert.equal(await ctx.game.castSpell(p,card,{from:'hand'}),true,name+': actual cast');assert.ok(ctx.game.stack.some(row=>row.card===card));
 assert.ok(Object.values(p.pool).reduce((n,x)=>n+x,0)<72,name+': printed cost paid');await settle(ctx.game);return card;
}
async function activate(ctx,source){for(const color of'WUBRGC')ctx.a.pool[color]=12;source.sick=false;const action=ctx.game.activatableList(ctx.a).find(row=>row.card===source);assert.ok(action);assert.equal(await ctx.game.activateAbility(ctx.a,action),true);assert.ok(Object.values(ctx.a.pool).reduce((n,x)=>n+x,0)<72);await settle(ctx.game);}
async function end(ctx,p=ctx.a){ctx.game.phase='end';await ctx.game.emit('endStep',{player:p});await settle(ctx.game);}
test('whole pinned delayed-object sources compile; unsupported antecedents and future outcomes fail closed',()=>{
 assert.ok(rows.length>=19);for(const card of rows)assert.ok(semanticClass(card).semanticClass,card.name);
 for(const oracle of ['Draw a card. Sacrifice it at the beginning of the next end step.','Create a 1/1 white Soldier creature token. Exile your library at the beginning of the next end step.','Return target creature card from your graveyard to the battlefield. Sacrifice it at the beginning of the next end step unless it dreams.'])
  assert.equal(semanticClass({name:'Boundary',oracle_text:oracle,mana_cost:'{B}',type_line:'Instant',layout:'normal'}).semanticClass,undefined);
});
test('delayed extension preserves every previously imported delayed-object descriptor',()=>{
 for(const file of fs.readdirSync(new URL('../reports/oracle-import/',import.meta.url)).filter(name=>/^batch-\d+\.json$/.test(name))){
  const report=JSON.parse(fs.readFileSync(new URL('../reports/oracle-import/'+file,import.meta.url)));
  for(const entry of report.cards||[]){
   if(!JSON.stringify(entry.implementation||[]).includes('"action":"delayed-object"'))continue;
   const raw=entry.raw,card={name:raw.name,oracle_text:raw.oracle,mana_cost:raw.cost||'',type_line:entry.catalog.typeLine,
    layout:raw._layout||'normal',power:raw.power,toughness:raw.toughness,loyalty:raw.loyalty,keywords:entry.catalog.keywords};
   assert.deepEqual(semanticClass(card).implementation,entry.implementation,raw.name+': frozen imported descriptor');
  }
 }
});
for(const role of ['human','ai']){
 test(`${role}: paid Roll-Roll-Roll-Roll chooses an own creature-or-land target and returns that exact object`,async()=>{
  const c=context(M,role),target=put(M,c.game,c.a,'Grizzly Bears'),other=put(M,c.game,c.b,'Colossal Dreadmaw');
  if(role==='human'){const decide=c.a.controller.decide.bind(c.a.controller);c.a.controller.decide=(g,q)=>q.type==='chooseTargets'?[target]:decide(g,q);}
  await cast(c,'Roll-Roll-Roll-Roll');assert.equal(target.zone,'exile');assert.equal(other.zone,'battlefield');
  await end(c);assert.equal(target.zone,'battlefield');assert.equal(target.ctrl,c.a);
 });
 test(`${role}: paid Sneak Attack gives haste and sacrifices exactly the card put onto the battlefield`,async()=>{
  const c=context(M,role),source=await cast(c,'Sneak Attack'),bystander=put(M,c.game,c.a,'Grizzly Bears'),card=put(M,c.game,c.a,'Colossal Dreadmaw','hand');
  await activate(c,source);assert.equal(card.zone,'battlefield');assert.equal(card.kw('haste'),true);assert.equal(bystander.kw('haste'),false);
  assert.ok(c.trace.some(row=>row.q.type==='chooseCards'&&row.result.includes(card)));await end(c);assert.equal(card.zone,'graveyard');assert.equal(bystander.zone,'battlefield');assert.equal(source.zone,'battlefield');
 });
 test(`${role}: Planebound Accomplice pays mana, chooses a real planeswalker, and schedules its sacrifice`,async()=>{
  const c=context(M,role),source=await cast(c,'Planebound Accomplice'),card=put(M,c.game,c.a,'Garruk Wildspeaker','hand');
  await activate(c,source);assert.equal(card.zone,'battlefield');assert.equal(card.counters.loyalty,3);await end(c);assert.equal(card.zone,'graveyard');assert.equal(source.zone,'battlefield');
 });
 test(`${role}: paid Kami of Industry does not sacrifice a new incarnation after blink`,async()=>{
  const c=context(M,role),target=put(M,c.game,c.a,'Sol Ring','graveyard');await cast(c,'Kami of Industry');assert.equal(target.zone,'battlefield');
  const version=target.zoneVersion;await c.game.move(target,'exile');await c.game.move(target,'battlefield');assert.ok(target.zoneVersion>version);await end(c);assert.equal(target.zone,'battlefield');
 });
 test(`${role}: paid Slave of Bolas retains the original delayed controller after a later paid Control Magic`,async()=>{
  const c=context(M,role),target=put(M,c.game,c.b,'Grizzly Bears');await cast(c,'Slave of Bolas');assert.equal(target.ctrl,c.a);assert.equal(target.kw('haste'),true);
  c.game.turnPlayer=c.b;c.game.phase='main1';await cast(c,'Control Magic',c.b);assert.equal(target.ctrl,c.b);await end(c,c.b);assert.equal(target.zone,'battlefield');assert.equal(target.ctrl,c.b);
 });
 test(`${role}: Sudden Disappearance returns its exact group simultaneously and ignores a later exile incarnation`,async()=>{
  const c=context(M,role);put(M,c.game,c.a,'Colossal Dreadmaw');const first=put(M,c.game,c.b,'Grizzly Bears'),second=put(M,c.game,c.b,'Sol Ring');
  if(role==='human'){const decide=c.a.controller.decide.bind(c.a.controller);c.a.controller.decide=(g,q)=>q.type==='chooseTargets'?[c.b]:decide(g,q);}
  await cast(c,'Sudden Disappearance');assert.equal(first.zone,'exile');assert.equal(second.zone,'exile');await c.game.move(second,'hand');await c.game.move(second,'exile');
  await end(c);assert.equal(first.zone,'battlefield');assert.equal(first.ctrl,c.b);assert.equal(second.zone,'exile');
 });
 test(`${role}: delayed bindings survive AI clone without moving objects in the original game`,async()=>{
  const c=context(M,role),source=await cast(c,'Sneak Attack'),card=put(M,c.game,c.a,'Colossal Dreadmaw','hand');await activate(c,source);
  const clone=M.cloneGameForAISimulation(c.game,601);assert.ok(clone);await clone.emit('endStep',{player:clone.players[c.a.idx]});await settle(clone);
  assert.equal(clone.byIid(card.iid).zone,'graveyard');assert.equal(card.zone,'battlefield');await end(c);assert.equal(card.zone,'graveyard');
 });
 test(`${role}: paid Transluminant activation sacrifices its source now and creates its Spirit only on the future Stack`,async()=>{
  const c=context(M,role),source=await cast(c,'Transluminant');await activate(c,source);assert.equal(source.zone,'graveyard');assert.equal(c.game.bf().filter(card=>card.isToken).length,0);
  await end(c);const tokens=c.game.bf().filter(card=>card.isToken);assert.equal(tokens.length,1);assert.equal(tokens[0].ctrl,c.a);assert.equal(tokens[0].power,1);assert.equal(tokens[0].toughness,1);assert.equal(tokens[0].kw('flying'),true);
 });
 test(`${role}: creating a delayed sacrifice after the end-step event waits for the next end step`,async()=>{
  const c=context(M,role),source=await cast(c,'Sneak Attack');await end(c);const card=put(M,c.game,c.a,'Colossal Dreadmaw','hand');await activate(c,source);
  assert.equal(card.zone,'battlefield');assert.equal(c.game.delayed.filter(row=>row.oracleOperation?.action==='delayed-objects-v8').length,1);
  c.game.turnNo++;await end(c,c.b);assert.equal(card.zone,'graveyard');
 });
}
