import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
const cards=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-counter-transfers.json',import.meta.url))),M=loadEngine();
const entries=cards.map((card,index)=>{const words=card.type_line.split(' — ')[0].split(' ');return{position:index+1,oracleId:card.oracle_id,scryfallId:card.id,...semanticClass(card),raw:{name:card.name,cost:card.mana_cost,oracle:card.oracle_text,types:words.filter(x=>!['Legendary','Snow','Basic'].includes(x)),super:words.filter(x=>['Legendary','Snow','Basic'].includes(x)),subtypes:card.type_line.split(' — ')[1]?.split(' ')||[],power:card.power,toughness:card.toughness,_ci:card.color_identity},catalog:{typeLine:card.type_line,commanderLegality:'legal'}};});
const production=new Map(M.ORACLE_BATCHES.flatMap(batch=>batch.cards).map(row=>[row.raw.name,row]));
for(const row of entries)if(production.has(row.raw.name))assert.deepEqual(JSON.parse(JSON.stringify(row.implementation)),JSON.parse(JSON.stringify(production.get(row.raw.name).implementation)));
M.registerOracleBatch({id:'counter-transfers-source-test',sequence:9997,cards:entries.filter(row=>!production.has(row.raw.name))});M.initData(M.RAW_DATA);
function fund(player,mana){const c=M.parseCost(mana);player.pool.C+=c.generic;for(const pip of c.pips)player.pool[pip.find(color=>'WUBRGC'.includes(color))]++;}
async function cast(ctx,name){const card=put(M,ctx.game,ctx.a,name,'hand');fund(ctx.a,card.def.cost);assert.equal(await ctx.game.castSpell(ctx.a,card,{from:'hand'}),true);await settle(ctx.game);assert.equal(Object.values(ctx.a.pool).reduce((n,x)=>n+x,0),0);card.sick=false;return card;}
function targets(ctx,donor,recipient){if(ctx.a.isAI)return;const old=ctx.a.controller.decide.bind(ctx.a.controller);ctx.a.controller.decide=(g,q)=>q.type==='chooseTargets'?[q.aiHint?.goal==='counterTransferDonor'?donor:recipient]:old(g,q);}
test('fifteen exact source cards compile and unspecified counter/subject grammar stays closed',()=>{
 assert.equal(cards.length,15);for(const c of cards){const parsed=semanticClass(c);assert.ok(parsed.semanticClass,c.name);assert.match(JSON.stringify(parsed.implementation),/(?:move|copy)-counters-v8/);}
 for(const oracle of ['Move any number of counters from target creature onto another target creature.','Move a +1/+1 counter from your library onto target creature.','Move a charge counter from target artifact onto target creature unless it is a dream.','Put its counters on target creature you control.'])assert.equal(!!semanticClass({name:'Boundary',layout:'normal',type_line:'Instant',mana_cost:'{G}',oracle_text:oracle,keywords:[]}).semanticClass,false,oracle);
});
for(const role of ['human','ai']){
 test(`${role}: paid Weapon Rack activation moves exactly one existing counter`,async()=>{
  const c=context(M,role),source=await cast(c,'Weapon Rack'),recipient=put(M,c.game,c.a,'Grizzly Bears');targets(c,source,recipient);assert.equal(source.counters['+1/+1'],3);
  const ability=c.game.activatableList(c.a).find(row=>row.card===source);assert.ok(ability);assert.equal(await c.game.activateAbility(c.a,ability),true);assert.equal(source.tapped,true);assert.equal(source.counters['+1/+1'],3);await settle(c.game);assert.equal(source.counters['+1/+1'],2);assert.equal(recipient.counters['+1/+1'],1);
 });
 test(`${role}: paid Fate Transfer selects counter-bearing enemy then friendly recipient`,async()=>{
  const c=context(M,role),donor=put(M,c.game,c.b,'Grizzly Bears'),recipient=put(M,c.game,c.a,'Colossal Dreadmaw');c.game.addCounters(donor,'+1/+1',3);c.game.addCounters(donor,'charge',2);targets(c,donor,recipient);
  await cast(c,'Fate Transfer');assert.equal(donor.counters['+1/+1'],0);assert.equal(donor.counters.charge,0);assert.equal(recipient.counters['+1/+1'],3);assert.equal(recipient.counters.charge,2);
 });
 test(`${role}: Fate Transfer chooses harmful counters on an ally and moves them to an enemy`,async()=>{
  const c=context(M,role),donor=put(M,c.game,c.a,'Colossal Dreadmaw'),recipient=put(M,c.game,c.b,'Colossal Dreadmaw');c.game.addCounters(donor,'-1/-1',2);targets(c,donor,recipient);
  await cast(c,'Fate Transfer');assert.equal(donor.counters['-1/-1'],0);assert.equal(recipient.counters['-1/-1'],2);
 });
 test(`${role}: Star Pupil copies old counters after dying and returning as a new object`,async()=>{
  const c=context(M,role),source=await cast(c,'Star Pupil'),recipient=put(M,c.game,c.a,'Colossal Dreadmaw');targets(c,source,recipient);assert.equal(source.counters['+1/+1'],1,'printed entry counter');c.game.addCounters(source,'+1/+1',2);c.game.addCounters(source,'charge',3);c.game.addCounters(source,'hexproof',1);
  await c.game.destroy(source);assert.equal(source.zone,'graveyard');await c.game.flushTriggers();await c.game.move(source,'battlefield');c.game.addCounters(source,'charge',9);await settle(c.game);
  assert.equal(recipient.counters['+1/+1'],3);assert.equal(recipient.counters.charge,3);assert.equal(recipient.counters.hexproof,1);assert.equal(source.counters.charge,9);
 });
}
test('a fixed move onto the same source and a move with no available counter do nothing',async()=>{
 const c=context(M),source=await cast(c,'Cytoplast Root-Kin');source.counters['+1/+1']=3;c.game.recalc();targets(c,source,source);fund(c.a,'{2}');
 assert.equal(await c.game.activateAbility(c.a,c.game.activatableList(c.a).find(row=>row.card===source)),true);await settle(c.game);assert.equal(source.counters['+1/+1'],3);
 const empty=put(M,c.game,c.a,'Grizzly Bears');targets(c,empty,source);fund(c.a,'{2}');assert.equal(await c.game.activateAbility(c.a,c.game.activatableList(c.a).find(row=>row.card===source)),true);await settle(c.game);assert.equal(source.counters['+1/+1'],3);assert.equal(empty.counters['+1/+1']||0,0);
});
test('a locked recipient blinking before resolution leaves the donor counters untouched',async()=>{
 const c=context(M),source=await cast(c,'Weapon Rack'),recipient=put(M,c.game,c.a,'Grizzly Bears');targets(c,source,recipient);
 assert.equal(await c.game.activateAbility(c.a,c.game.activatableList(c.a).find(row=>row.card===source)),true);await c.game.move(recipient,'exile');await c.game.move(recipient,'battlefield');await settle(c.game);assert.equal(source.counters['+1/+1'],3);assert.equal(recipient.counters['+1/+1']||0,0);
});
test('counter placement replacements apply to the moved amount after exact donor removal',async()=>{
 const c=context(M),source=await cast(c,'Weapon Rack'),recipient=put(M,c.game,c.a,'Grizzly Bears');put(M,c.game,c.a,'Hardened Scales');targets(c,source,recipient);
 assert.equal(await c.game.activateAbility(c.a,c.game.activatableList(c.a).find(row=>row.card===source)),true);await settle(c.game);assert.equal(source.counters['+1/+1'],2);assert.equal(recipient.counters['+1/+1'],2);
});
test('Scrounging Bandar permits choosing zero and only triggers on its controller upkeep',async()=>{
 const c=context(M),source=await cast(c,'Scrounging Bandar'),recipient=put(M,c.game,c.a,'Grizzly Bears');targets(c,source,recipient);
 await c.game.emit('upkeep',{player:c.b});await settle(c.game);assert.equal(c.game.stack.length,0);assert.equal(source.counters['+1/+1'],2);
 await c.game.emit('upkeep',{player:c.a});await settle(c.game);assert.equal(source.counters['+1/+1'],2);assert.equal(recipient.counters['+1/+1']||0,0);assert.ok(c.trace.some(row=>row.q.type==='chooseX'&&row.q.aiHint?.kind==='counterMove'&&row.result===0));
});
for(const subject of ['donor','recipient'])test(`awaited counter quantity rejects a blinked ${subject}`,async()=>{
 const c=context(M),source=await cast(c,'Scrounging Bandar'),recipient=put(M,c.game,c.a,'Grizzly Bears');targets(c,source,recipient);const decide=c.a.controller.decide.bind(c.a.controller);let choices=0;
 c.a.controller.decide=async(g,q)=>{if(q.type==='chooseX'&&q.aiHint?.kind==='counterMove'){choices++;const moved=subject==='donor'?source:recipient;await g.move(moved,'exile');await g.move(moved,'battlefield');return 1;}return decide(g,q);};
 await c.game.emit('upkeep',{player:c.a});await settle(c.game);assert.equal(choices,1);assert.equal(source.counters['+1/+1'],2);assert.equal(recipient.counters['+1/+1']||0,0);
});
test('simultaneous deaths retain each source own counter snapshot',async()=>{
 const c=context(M),first=await cast(c,'Star Pupil'),second=await cast(c,'Spiteful Squad'),recipient=put(M,c.game,c.a,'Colossal Dreadmaw');targets(c,first,recipient);c.game.addCounters(first,'charge',2);c.game.addCounters(second,'charge',5);
 await c.game.destroyMany([first,second]);await settle(c.game);assert.equal(first.zone,'graveyard');assert.equal(second.zone,'graveyard');assert.equal(recipient.counters['+1/+1'],3);assert.equal(recipient.counters.charge,7);
});
