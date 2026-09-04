import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {ORACLE_SUBTYPE_TYPES} from '../scripts/oracle-subtypes.mjs';

const M=loadEngine();
const world=role=>{const ctx=context(M,role);ctx.a.pool={W:30,U:30,B:30,R:30,G:30,C:30};if(role==='human'){const old=ctx.a.controller.decide.bind(ctx.a.controller);ctx.a.controller.decide=(g,q)=>q.type==='chooseCards'&&q.prompt?.startsWith('You may cast one')?Promise.resolve(q.from.slice(0,1)):old(g,q);}return ctx;};
const add=(ctx,name,owner=ctx.a,zone='battlefield')=>put(M,ctx.game,owner,name,zone);
function humanTarget(ctx,target){if(ctx.a.isAI)return;const old=ctx.a.controller.decide.bind(ctx.a.controller);ctx.a.controller.decide=(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(target)?Promise.resolve([target]):old(g,q);}
async function activate(ctx,card){const offered=ctx.game.activatableList(ctx.a).find(entry=>entry.card===card);assert.ok(offered,card.name+' is genuinely activatable');assert.equal(await ctx.game.activateAbility(ctx.a,offered),true);await settle(ctx.game);}
async function cast(ctx,name){const source=add(ctx,name,ctx.a,'hand');assert.equal(await ctx.game.castSpell(ctx.a,source,{from:'hand'}),true);await settle(ctx.game);return source;}
async function attackTrigger(ctx,source){source.attacking=ctx.b;await ctx.game.emit('attacks',{card:source,player:ctx.a,defender:ctx.b});await ctx.game.flushTriggers();}

test('all 16800 generated Oracle descriptors use the actual parent type of noncreature subtypes',()=>{
 const failures=[];
 function walk(node,name){if(!node||typeof node!=='object')return;if(node.what==='creature'&&ORACLE_SUBTYPE_TYPES[node.subtype]&&ORACLE_SUBTYPE_TYPES[node.subtype]!=='creature')failures.push(name+': '+node.subtype);for(const value of Object.values(node))walk(value,name);}
 for(const file of fs.readdirSync('reports/oracle-import').filter(file=>/^batch-\d{4}\.json$/.test(file)))for(const row of JSON.parse(fs.readFileSync('reports/oracle-import/'+file,'utf8')).cards)walk(row.implementation,row.raw.name);
 assert.deepEqual(failures,[]);
});

for(const role of ['human','ai']) {
 test(role+': real Desert lands enable Hydra, Naga, Camel and Greenblade statics and stop on departure',async()=>{
  const ctx=world(role),hydra=add(ctx,'Ramunap Hydra'),naga=add(ctx,'Sidewinder Naga'),camel=add(ctx,'Solitary Camel'),greenblade=add(ctx,'Outcaster Greenblade');
  const original=[hydra.power,naga.power,greenblade.power];add(ctx,'Ifnir Deadlands',ctx.b);ctx.game.recalc();
  assert.deepEqual([hydra.power,naga.power,greenblade.power],original,'opponent Deserts are irrelevant');assert.equal(camel.kw('lifelink'),false);
  const desert=add(ctx,'Ifnir Deadlands');assert.deepEqual([hydra.power,naga.power,greenblade.power],original.map(n=>n+1));assert.equal(naga.kw('trample'),true);assert.equal(camel.kw('lifelink'),true);
  await ctx.game.move(desert,'exile');assert.deepEqual([hydra.power,naga.power,greenblade.power],original);assert.equal(naga.kw('trample'),false);assert.equal(camel.kw('lifelink'),false);
 });
 for(const [name,land]of [['Cactarantula','Ifnir Deadlands'],['Gargantuan Leech','Captivating Cave'],['Travel the Overworld','Baron, Airship Kingdom']])test(role+': '+name+' pays the reduced cost with an actual noncreature '+land,async()=>{
  const ctx=world(role),source=add(ctx,name,ctx.a,'hand'),base=ctx.game.spellCost(ctx.a,source,{from:'hand'}).generic;
  add(ctx,land,ctx.b);assert.equal(ctx.game.spellCost(ctx.a,source,{from:'hand'}).generic,base);
  add(ctx,land);assert.equal(ctx.game.spellCost(ctx.a,source,{from:'hand'}).generic,base-1);
  const before=Object.values(ctx.a.pool).reduce((a,b)=>a+b,0),cost=ctx.game.spellCost(ctx.a,source,{from:'hand'});
  assert.equal(await ctx.game.castSpell(ctx.a,source,{from:'hand'}),true);assert.equal(before-Object.values(ctx.a.pool).reduce((a,b)=>a+b,0),cost.generic+cost.pips.length);await settle(ctx.game);
 });
 for(const kind of ['Charisma','Intelligence','Strength'])test(role+': '+kind+' Bobblehead counts artifacts, including itself, exactly once',async()=>{
  const ctx=world(role),source=add(ctx,kind+' Bobblehead'),others=['Charisma','Intelligence','Strength'].filter(x=>x!==kind);for(const other of others)add(ctx,other+' Bobblehead');add(ctx,'Charisma Bobblehead',ctx.b);
  const host=kind==='Strength'?add(ctx,'Runeclaw Bear'):null;if(host)humanTarget(ctx,host);
  const beforeHand=ctx.a.hand.length,beforeCreatures=ctx.game.creatures(ctx.a).length;
  await activate(ctx,source);assert.equal(source.tapped,true);
  if(kind==='Charisma')assert.equal(ctx.game.creatures(ctx.a).length-beforeCreatures,3);
  if(kind==='Intelligence')assert.equal(ctx.a.hand.length-beforeHand,3);
  if(kind==='Strength')assert.equal(host.counters['+1/+1'],3);
 });
 test(role+': Desert’s Due damage-sized modifier and Failed Fording surveil use actual Desert lands',async()=>{
  const ctx=world(role),host=add(ctx,'Wall of Mist',ctx.b);humanTarget(ctx,host);add(ctx,'Ifnir Deadlands');add(ctx,'Hashep Oasis');
  const toughness=host.toughness;await cast(ctx,"Desert's Due");assert.equal(host.toughness,toughness-4);
  const target=add(ctx,'Darksteel Relic',ctx.b);humanTarget(ctx,target);await cast(ctx,'Failed Fording');assert.ok([host,target].some(card=>card.zone==='hand'),'the announced legal permanent is returned');assert.ok(ctx.trace.some(({q})=>q.type==='scry'&&q.surveil===true));
 });
 test(role+': Dune Diviner taps a real Desert as its cost and Trenchpost counts real Loci',async()=>{
  const ctx=world(role),diviner=add(ctx,'Dune Diviner'),desert=add(ctx,'Ifnir Deadlands'),life=ctx.a.life;add(ctx,'Hashep Oasis',ctx.b);
  await activate(ctx,diviner);assert.equal(desert.tapped,true);assert.equal(ctx.a.life,life+1);
  const trench=add(ctx,'Trenchpost');add(ctx,'Cloudpost');add(ctx,'Cloudpost',ctx.b);humanTarget(ctx,ctx.b);const before=ctx.b.library.length;
  await activate(ctx,trench);assert.equal(before-ctx.b.library.length,2);
 });
 test(role+': Desert conditions enable real attack, entry, death and activated triggers',async()=>{
  const ctx=world(role),host=add(ctx,'Wall of Mist',ctx.b);add(ctx,'Ifnir Deadlands');humanTarget(ctx,host);
  const cerodon=add(ctx,'Gilded Cerodon');await attackTrigger(ctx,cerodon);await settle(ctx.game);assert.equal(host.cur.cantBlock,true);
  const strangler=add(ctx,'Sand Strangler',ctx.a,'hand');await ctx.game.move(strangler,'battlefield');await settle(ctx.game);assert.equal(host.damage,3);
  const wall=add(ctx,'Wall of Forgotten Pharaohs');humanTarget(ctx,ctx.b);const life=ctx.b.life;await activate(ctx,wall);assert.equal(ctx.b.life,life-1);
  const camel=add(ctx,'Wretched Camel');add(ctx,'Forest',ctx.b,'hand');await ctx.game.sacrifice(ctx.a,camel);await settle(ctx.game);assert.equal(ctx.b.hand.length,0);
 });
 test(role+': a real Desert grants Colossal Rattlewurm permission on an opponent’s turn',async()=>{
  const ctx=world(role),card=add(ctx,'Colossal Rattlewurm',ctx.a,'hand');ctx.game.turnPlayer=ctx.b;
  assert.equal(ctx.game.castableList(ctx.a).some(entry=>entry.card===card),false);add(ctx,'Ifnir Deadlands');assert.equal(ctx.game.castableList(ctx.a).some(entry=>entry.card===card),true);
  assert.equal(await ctx.game.castSpell(ctx.a,card,{from:'hand'}),true);await settle(ctx.game);assert.equal(card.zone,'battlefield');
 });
 test(role+': conditional self-flash rechecks its Desert and never grants another card flash',async()=>{
  const ctx=world(role),card=add(ctx,'Colossal Rattlewurm',ctx.a,'hand'),other=add(ctx,'Runeclaw Bear',ctx.a,'hand'),desert=add(ctx,'Ifnir Deadlands');ctx.game.turnPlayer=ctx.b;
  const offered=ctx.game.castableList(ctx.a).find(entry=>entry.card===card);assert.ok(offered);assert.equal(ctx.game.castableList(ctx.a).some(entry=>entry.card===other),false);
  assert.equal(M.oracleFlashGranted(ctx.game,ctx.a,card,{faceDownCast:true}),false);
  await ctx.game.move(desert,'exile');const before=Object.values(ctx.a.pool).reduce((a,b)=>a+b,0);
  assert.equal(await ctx.game.castSpell(ctx.a,card,{from:'hand',alt:offered.alt}),false);assert.equal(card.zone,'hand');assert.equal(Object.values(ctx.a.pool).reduce((a,b)=>a+b,0),before);
 });
 test(role+': Drill Too Deep can select a noncreature Planet in its first mode',async()=>{
  const ctx=world(role),planet=new M.CardInst({...M.DEFS.Forest,name:'Semantic audit Planet',subtypes:['Planet']},ctx.a);planet.zone='battlefield';ctx.game.battlefield.push(planet);ctx.game.recalc();
  const source=add(ctx,'Drill Too Deep',ctx.a,'hand'),old=ctx.a.controller.decide.bind(ctx.a.controller);
  // Only the first mode has a legal target, so both controllers must use it.
  if(!ctx.a.isAI)ctx.a.controller.decide=(g,q)=>q.type==='chooseModes'?Promise.resolve([0]):old(g,q);
  assert.equal(await ctx.game.castSpell(ctx.a,source,{from:'hand'}),true);await settle(ctx.game);assert.equal(planet.counters.charge,5);
 });

 // CR 107.1b: comparisons and effects setting a specific P/T retain negative
 // values. Ordinary +X/+X effects still use zero for a negative result.
 for(const name of ['Dreadhorde Arcanist','Guardian Scalelord'])test(role+': negative-power '+name+' cannot target mana value zero',async()=>{
  const ctx=world(role),source=add(ctx,name),target=add(ctx,name==='Dreadhorde Arcanist'?'Ancestral Vision':'Darksteel Relic',ctx.a,'graveyard');
  M.E.pumpUntilEOT(ctx.game,source,-source.power-2,0,[]);assert.equal(source.power,-2);await attackTrigger(ctx,source);
  assert.equal(ctx.game.stack.length,0,'no legal target at negative threshold');assert.equal(target.zone,'graveyard');
 });
 test(role+': source-power target legality rechecks a fall below zero using current power',async()=>{
  const ctx=world(role),source=add(ctx,'Dreadhorde Arcanist'),target=add(ctx,'Ancestral Vision',ctx.a,'graveyard');await attackTrigger(ctx,source);assert.equal(ctx.game.stack.length,1);
  M.E.pumpUntilEOT(ctx.game,source,-3,0,[]);await settle(ctx.game);assert.equal(target.zone,'graveyard');assert.equal(ctx.a.hand.length,0);
 });
 for(const name of ['Dreadhorde Arcanist','Guardian Scalelord'])test(role+': zero-power '+name+' still permits a mana-value-zero target',async()=>{
  const ctx=world(role),source=add(ctx,name),target=add(ctx,name==='Dreadhorde Arcanist'?'Ancestral Vision':'Darksteel Relic',ctx.a,'graveyard');
  M.E.pumpUntilEOT(ctx.game,source,-source.power,0,[]);await attackTrigger(ctx,source);assert.equal(ctx.game.stack.length,1);await settle(ctx.game);
  assert.equal(target.zone,name==='Dreadhorde Arcanist'?'exile':'battlefield');if(name==='Dreadhorde Arcanist')assert.equal(ctx.a.hand.length,3);
 });
 test(role+': a negative last-known source cannot use a returned incarnation’s positive power',async()=>{
  const ctx=world(role),source=add(ctx,'Dreadhorde Arcanist'),target=add(ctx,'Ancestral Vision',ctx.a,'graveyard');await attackTrigger(ctx,source);assert.equal(ctx.game.stack.length,1);
  M.E.pumpUntilEOT(ctx.game,source,-3,0,[]);await ctx.game.move(source,'exile');await ctx.game.move(source,'battlefield');assert.equal(source.power,1);await settle(ctx.game);assert.equal(target.zone,'graveyard');assert.equal(ctx.a.hand.length,0);
 });
 test(role+': Unruly Krasis sets a negative base P/T without erasing counters',async()=>{
  const ctx=world(role),source=add(ctx,'Unruly Krasis'),target=add(ctx,'Runeclaw Bear');ctx.game.addCounters(target,'+1/+1',5,false,ctx.a);humanTarget(ctx,target);
  M.E.pumpUntilEOT(ctx.game,source,-6,0,[]);await attackTrigger(ctx,source);await settle(ctx.game);
  assert.equal(target.cur.basePower,-2);assert.equal(target.cur.baseToughness,-2);assert.equal(target.power,3);assert.equal(target.toughness,3);
 });
 test(role+': Obuun sets negative animation P/T while counters keep its land alive',async()=>{
  const ctx=world(role),source=add(ctx,'Obuun, Mul Daya Ancestor'),target=add(ctx,'Forest');ctx.game.addCounters(target,'+1/+1',5,false,ctx.a);humanTarget(ctx,target);
  await ctx.game.emit('beginCombat',{player:ctx.a});await ctx.game.flushTriggers();
  assert.ok(ctx.game.stack[0]?.targets.flat().includes(target),'the real controller first chooses the beneficial positive-power animation');
  M.E.pumpUntilEOT(ctx.game,source,-5,0,[]);await settle(ctx.game);
  assert.equal(target.cur.basePower,-2);assert.equal(target.cur.baseToughness,-2);assert.equal(target.power,3);assert.equal(target.toughness,3);assert.equal(target.is('Land'),true);assert.equal(target.is('Creature'),true);
 });
 test(role+': Chameleon Colossus ordinary +X/+X still uses zero for negative source power',async()=>{
  const ctx=world(role),source=add(ctx,'Chameleon Colossus');M.E.pumpUntilEOT(ctx.game,source,-6,0,[]);assert.equal(source.power,-2);await activate(ctx,source);assert.equal(source.power,-2);assert.equal(source.toughness,4);
 });
}

test('ai: initially lethal Obuun animation is an optional decline, not executed animation coverage',async()=>{
 const ctx=world('ai'),source=add(ctx,'Obuun, Mul Daya Ancestor'),target=add(ctx,'Forest');
 M.E.pumpUntilEOT(ctx.game,source,-5,0,[]);assert.equal(source.power,-2);
 await ctx.game.emit('beginCombat',{player:ctx.a});await ctx.game.flushTriggers();
 assert.ok(ctx.trace.some(({q})=>q.type==='chooseTargets'&&q.aiHint?.goal==='oracleBasePT'&&q.candidates.includes(target)),'the real AI receives the optional animation choice');
 assert.equal(ctx.game.stack.some(object=>object.targets.flat().includes(target)),false,'the AI declines the lethal land target');
 await settle(ctx.game);assert.equal(target.zone,'battlefield');assert.equal(target.is('Land'),true);assert.equal(target.is('Creature'),false);
});
