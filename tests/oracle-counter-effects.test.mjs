import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import{semanticClass}from'../scripts/import-oracle-batch.mjs';import{context,put,settle}from'./helpers/oracle-v8-fixtures.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-counter-effects.json',import.meta.url)));
import {loadEngine} from './helpers/load-engine.mjs';
const M=loadEngine(),production=new Map(M.ORACLE_BATCHES.flatMap(batch=>batch.cards).map(row=>[row.raw.name,row]));
for(const card of rows){const row=production.get(card.name);if(row){assert.equal(row.raw.oracle,card.oracle_text);assert.equal(row.raw.cost,card.mana_cost);assert.equal(row.raw.power,card.power);assert.equal(row.raw.toughness,card.toughness);assert.deepEqual(JSON.parse(JSON.stringify(row.implementation)),JSON.parse(JSON.stringify(semanticClass(card).implementation)),card.name+': production semantics retain exact source');}}
M.registerOracleBatch({id:'counter-removal-source-test',sequence:9993,cards:rows.filter(card=>!production.has(card.name)).map((card,i)=>{const [types,subtypes='']=card.type_line.split(' — ');return {position:i+1,oracleId:card.oracle_id,scryfallId:card.id,...semanticClass(card),raw:{name:card.name,oracle:card.oracle_text,cost:card.mana_cost,types:types.split(' ').filter(type=>!['Legendary','Snow','Basic'].includes(type)),super:types.split(' ').filter(type=>['Legendary','Snow','Basic'].includes(type)),subtypes:subtypes.split(' ').filter(Boolean),power:card.power,toughness:card.toughness,_ci:card.color_identity},catalog:{commanderLegality:'legal',typeLine:card.type_line}};})});M.initData(M.RAW_DATA);
async function cast(ctx,name,sunburst=false){const card=put(M,ctx.game,ctx.a,name,'hand'),cost=M.parseCost(card.def.cost);ctx.a.pool.C+=cost.generic;for(const pip of cost.pips)ctx.a.pool[pip.find(c=>'WUBRGC'.includes(c))]++;if(sunburst){ctx.a.pool.C=0;for(const color of'WUBRG')ctx.a.pool[color]=1;}assert.equal(await ctx.game.castSpell(ctx.a,card,{from:'hand'}),true);await settle(ctx.game);assert.equal(card.zone,'battlefield');assert.equal(Object.values(ctx.a.pool).reduce((n,x)=>n+x,0),0);card.sick=false;return card;}
test('nineteen whole sources have exact counter removal descriptors and unknown destinations fail closed',()=>{assert.equal(rows.length,19);for(const c of rows){const p=semanticClass(c);assert.ok(p.semanticClass,c.name);assert.match(JSON.stringify(p.implementation),/remove-counters-v8/);}for(const oracle of ['Remove all counters from target creature unless it dreams.','Remove two counters from target permanent.','Remove all charge counters from your library.'])assert.equal(semanticClass({name:'Boundary',type_line:'Instant',mana_cost:'{B}',oracle_text:oracle,layout:'normal',keywords:[]}).semanticClass,undefined);});
for(const role of['human','ai']){
 test(`${role}: paid Vampire Hexmage sacrifices itself and removes every planeswalker counter`,async()=>{
  const c=context(M,role),source=await cast(c,'Vampire Hexmage');
  const def={name:'Counter Test Planeswalker',types:['Planeswalker'],subtypes:['Test'],super:[],cost:'{3}{U}',loyalty:4},target=new M.CardInst(def,c.b);target.zone='battlefield';target.ctrl=c.b;target.counters={loyalty:4,charge:2};c.game.battlefield.push(target);c.game.recalc();
  const original=c.a.controller.decide.bind(c.a.controller);c.a.controller.decide=(g,q)=>role==='human'&&q.type==='chooseTargets'?[target]:original(g,q);
  const ability=c.game.activatableList(c.a).find(r=>r.card===source);assert.ok(ability);assert.equal(await c.game.activateAbility(c.a,ability),true);assert.equal(source.zone,'graveyard');assert.equal(target.counters.loyalty,4);await settle(c.game);assert.equal(target.zone,'graveyard');assert.equal(target.counters.loyalty||0,0);assert.equal(target.counters.charge||0,0);
 });
 test(`${role}: five-color Spinal Parasite pays two counters and removes one chosen target counter`,async()=>{
  const c=context(M,role),source=await cast(c,'Spinal Parasite',true);assert.equal(source.counters['+1/+1'],5);assert.equal(source.power,4);
  const target=put(M,c.game,c.b,'Grizzly Bears');c.game.addCounters(target,'charge',2);c.game.addCounters(target,'+1/+1',3);
  const original=c.a.controller.decide.bind(c.a.controller);c.a.controller.decide=(g,q)=>role==='human'&&q.type==='chooseTargets'?[target]:role==='human'&&q.type==='chooseOption'&&q.aiHint?.kind==='counterRemove'?'charge':original(g,q);
  const ability=c.game.activatableList(c.a).find(r=>r.card===source);assert.ok(ability);assert.equal(await c.game.activateAbility(c.a,ability),true);assert.equal(source.counters['+1/+1'],3);const before=Object.values(target.counters).reduce((n,x)=>n+x,0);await settle(c.game);assert.equal(Object.values(target.counters).reduce((n,x)=>n+x,0),before-1);if(role==='human'){assert.equal(target.counters.charge,1);assert.equal(target.counters['+1/+1'],3);}
 });
 test(`${role}: Heartmender removes one -1/-1 counter only from its controller's creatures`,async()=>{
  const c=context(M,role);await cast(c,'Heartmender');const own=put(M,c.game,c.a,'Colossal Dreadmaw'),enemy=put(M,c.game,c.b,'Colossal Dreadmaw');for(const card of[own,enemy])c.game.addCounters(card,'-1/-1',3);c.game.phase='upkeep';await c.game.emit('upkeep',{player:c.a});await settle(c.game);assert.equal(own.counters['-1/-1'],2);assert.equal(enemy.counters['-1/-1'],3);
 });
 test(`${role}: Sporogenesis leaving removes all fungus counters and preserves other counters`,async()=>{
  const c=context(M,role),source=await cast(c,'Sporogenesis'),own=put(M,c.game,c.a,'Grizzly Bears'),enemy=put(M,c.game,c.b,'Grizzly Bears');for(const card of[own,enemy]){c.game.addCounters(card,'fungus',3);c.game.addCounters(card,'charge',2);}await c.game.destroy(source);await settle(c.game);for(const card of[own,enemy]){assert.equal(card.counters.fungus||0,0);assert.equal(card.counters.charge,2);}
 });
}
test('paid Thrull Parasite may target a permanent with no counters without inventing a choice',async()=>{
 const c=context(M),source=await cast(c,'Thrull Parasite'),target=put(M,c.game,c.b,'Grizzly Bears'),life=c.a.life,original=c.a.controller.decide.bind(c.a.controller);let counterChoices=0;
 c.a.controller.decide=(g,q)=>{if(q.type==='chooseTargets')return[target];if(q.aiHint?.kind==='counterRemove')counterChoices++;return original(g,q);};
 assert.equal(await c.game.activateAbility(c.a,c.game.activatableList(c.a).find(row=>row.card===source)),true);assert.equal(c.a.life,life-2);assert.equal(source.tapped,true);await settle(c.game);assert.equal(counterChoices,0);assert.deepEqual(Object.keys(target.counters),[]);
});
test('counter choice validates the same object after an awaited decision',async()=>{
 const c=context(M),source=await cast(c,'Spinal Parasite',true),target=put(M,c.game,c.b,'Grizzly Bears'),original=c.a.controller.decide.bind(c.a.controller);c.game.addCounters(target,'charge',2);const version=target.zoneVersion;let choices=0;
 c.a.controller.decide=async(g,q)=>{if(q.type==='chooseTargets')return[target];if(q.aiHint?.kind==='counterRemove'){choices++;await g.move(target,'exile');await g.move(target,'battlefield');g.addCounters(target,'charge',5);return'charge';}return original(g,q);};
 assert.equal(await c.game.activateAbility(c.a,c.game.activatableList(c.a).find(row=>row.card===source)),true);await settle(c.game);assert.equal(choices,1);assert.ok(target.zoneVersion>version);assert.equal(target.counters.charge,5);assert.equal(source.counters['+1/+1'],3,'already paid cost remains paid');
});
