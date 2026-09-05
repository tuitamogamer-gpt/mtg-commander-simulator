import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync}from'node:fs';
import {semanticClass}from'../scripts/import-oracle-batch.mjs';
import {loadEngine}from'./helpers/load-engine.mjs';
import {context,put,settle}from'./helpers/oracle-v8-fixtures.mjs';
const M=loadEngine(),inputs=JSON.parse(readFileSync(new URL('./fixtures/oracle-combat-keywords.json',import.meta.url)));
const cards=inputs.map((c,i)=>{const semantic=semanticClass(c,{compilerVersion:8});assert.ok(semantic.semanticClass,c.name+': '+semantic.reason);const [type,subtypes='']=c.type_line.split(' — '),words=type.split(' ');return{position:i+1,oracleId:c.oracle_id,scryfallId:c.id,...semantic,raw:{name:c.name,cost:c.mana_cost,oracle:c.oracle_text,types:words.filter(word=>word!=='Legendary'),super:words.includes('Legendary')?['Legendary']:[],subtypes:subtypes.split(' ').filter(Boolean),power:c.power,toughness:c.toughness,loyalty:c.loyalty,_ci:c.color_identity},catalog:{typeLine:c.type_line,commanderLegality:'legal'}};});
const missing=cards.filter(c=>!M.DEFS[c.raw.name]);if(missing.length){M.registerOracleBatch({id:'oracle-combat-keywords-test',sequence:9999,cards:missing});M.initData(M.RAW_DATA);}
const fund=p=>{for(const c of ['W','U','B','R','G','C'])p.pool[c]=30;};
async function inWindow(game,...args){const prior=game.priorityRound;game.priorityRound=async()=>{};try{return await game.castSpell(...args);}finally{game.priorityRound=prior;}}
const pool=p=>Object.values(p.pool).reduce((a,b)=>a+b,0);
async function cast(f,name,player=f.a,opts={}){const c=put(M,f.game,player,name,'hand');fund(player);const before=pool(player);assert.equal(await f.game.castSpell(player,c,{from:'hand',...opts}),true,name+': actual source cast');assert.ok(pool(player)<before);await settle(f.game);return c;}
function declare(p,card,target){const prior=p.controller.decide.bind(p.controller);p.controller.decide=async(g,q)=>q.type==='attackers'?[{card,target}]:q.type==='blockers'?[]:prior(g,q);}
async function nextUpkeep(game,a){const emit=game.emit,stop=new Error('next upkeep');game.turnPlayer=a;game.emit=async function(event,data){if(event==='upkeep')throw stop;return emit.call(this,event,data);};try{await assert.rejects(game.runTurn(),error=>error===stop);}finally{game.emit=emit;}}


test('combat keywords compile whole pinned sources and unsupported keyword values fail closed',()=>{
 assert.ok(cards.length>=13);
 const base=inputs.find(c=>c.name==='Eldrazi Ravager');
 for(const oracle_text of ['Annihilator X','Annihilator -1','Provoke 2','Melee 2'])assert.equal(semanticClass({...base,oracle_text},{compilerVersion:8}).semanticClass,undefined);
 assert.throws(()=>M.oracleV8TriggerFilter('etb',{kind:'v8-event',subject:'self',playerField:'defender'},()=>{},()=>{}));
});
for(const role of ['human','ai']){
 test(`${role}: paid Annihilator source forces exactly N actual defending-player sacrifices before blockers`,async()=>{
  const f=context(M,role,2),{game,a,b}=f,source=await cast(f,'Artisan of Kozilek');await nextUpkeep(game,a);game.phase='main1';
  for(const p of [b,f.others[1]])for(let n=0;n<3;n++)put(M,game,p,'Forest');declare(a,source,b);let checked=false;
  game.priorityRound=async()=>{if(game.step==='attackers'){assert.equal(game.stack.filter(s=>s.kind==='trigger').length,1);await settle(game);assert.equal(game.lands(b).length,1);assert.equal(game.lands(f.others[1]).length,3);checked=true;}};await game.combatPhase(a);assert.equal(checked,true);
 });
 test(`${role}: Annihilator remembers the attacked planeswalker's original controller after the source leaves`,async()=>{
  const f=context(M,role,2),{game,a,b}=f,source=await cast(f,'Artisan of Kozilek');await nextUpkeep(game,a);game.phase='main1';const walker=put(M,game,b,'Tezzeret, Betrayer of Flesh');for(const p of [b,f.others[1]])for(let n=0;n<3;n++)put(M,game,p,'Forest');declare(a,source,walker);let checked=false;
  game.priorityRound=async()=>{if(game.step==='attackers'){walker.ctrl=f.others[1];game.recalc();await game.move(source,'graveyard');await settle(game);assert.equal(game.lands(b).length,1);assert.equal(game.lands(f.others[1]).length,3);checked=true;}};await game.combatPhase(a);assert.equal(checked,true);
 });
 test(`${role}: Annihilator sacrifices all available permanents when fewer than N, but remains counterable`,async()=>{
  for(const counter of [false,true]){const f=context(M,role),{game,a,b}=f,source=await cast(f,'Artisan of Kozilek');await nextUpkeep(game,a);game.phase='main1';put(M,game,b,'Forest');declare(a,source,b);game.priorityRound=async()=>{if(game.step!=='attackers')return;if(counter)await game.counterStackObject(game.stack.find(s=>s.kind==='trigger'));await settle(game);assert.equal(game.lands(b).length,counter?1:0);};await game.combatPhase(a);}
 });
 test(`${role}: Provoke chooses a tapped defending creature, untaps it and enforces its actual block`,async()=>{
  const f=context(M,role),{game,a,b}=f,source=await cast(f,'Goblin Grappler');await nextUpkeep(game,a);game.phase='main1';const blocker=put(M,game,b,'Wall of Omens');blocker.tapped=true;declare(a,source,b);let checked=false;
  game.priorityRound=async()=>{if(game.step==='attackers'){await settle(game);assert.equal(blocker.tapped,false);assert.ok(game.untilEffects.some(e=>e.expires==='combat'));}if(game.step==='blockers'){assert.equal(blocker.blocking,source.iid);checked=true;}};await game.combatPhase(a);assert.equal(checked,true);assert.equal(game.untilEffects.some(e=>e.expires==='combat'),false);
 });
 test(`${role}: Provoke target legality excludes another defender and a blinked target cannot be untapped`,async()=>{
  const f=context(M,role,2),{game,a,b}=f,source=await cast(f,'Goblin Grappler');await nextUpkeep(game,a);game.phase='main1';const blocker=put(M,game,b,'Wall of Omens'),other=put(M,game,f.others[1],'Wall of Omens');blocker.tapped=true;other.tapped=true;declare(a,source,b);let checked=false;
  game.priorityRound=async()=>{if(game.step!=='attackers')return;const so=game.stack.find(s=>s.kind==='trigger');assert.ok(so);assert.deepEqual(Array.from(so.targets,c=>c.iid),[blocker.iid]);await game.move(blocker,'hand');await game.move(blocker,'battlefield',{tapped:true});blocker.tapped=true;await settle(game);assert.equal(blocker.tapped,true);assert.equal(other.tapped,true);assert.equal(game.untilEffects.some(e=>e.expires==='combat'),false);checked=true;};await game.combatPhase(a);assert.equal(checked,true);
 });
 test(`${role}: Provoke cannot make a ground creature block a flying source and the requirement ends this combat`,async()=>{
  const f=context(M,role),{game,a,b}=f,source=await cast(f,'Goblin Grappler');await nextUpkeep(game,a);game.phase='main1';source.def={...source.def,kws:[...source.def.kws,'flying']};game.recalc();const blocker=put(M,game,b,'Wall of Omens');blocker.tapped=true;declare(a,source,b);let checked=false;
  game.priorityRound=async()=>{if(game.step==='attackers')await settle(game);if(game.step==='blockers'){assert.equal(blocker.tapped,false);assert.equal(blocker.blocking,null);checked=true;}};await game.combatPhase(a);assert.equal(checked,true);
 });
 test(`${role}: Melee counts distinct declared opponents, excludes planeswalkers, and remembers a departed opponent`,async()=>{
  const f=context(M,role,3),{game,a,b}=f,source=await cast(f,'Deputized Protester');await nextUpkeep(game,a);game.phase='main1';const second=put(M,game,a,'Grizzly Bears'),duplicate=put(M,game,a,'Grizzly Bears'),walkerAttacker=put(M,game,a,'Grizzly Bears'),walker=put(M,game,f.others[2],'Tezzeret, Betrayer of Flesh'),prior=a.controller.decide.bind(a.controller);
  a.controller.decide=async(g,q)=>q.type==='attackers'?[{card:source,target:b},{card:second,target:f.others[1]},{card:duplicate,target:b},{card:walkerAttacker,target:walker}]:prior(g,q);let checked=false;
  game.priorityRound=async()=>{if(game.step!=='attackers')return;await game.move(second,'graveyard');f.others[1].lost=true;await settle(game);assert.equal(source.power,source.def.power*1+2);assert.equal(source.toughness,source.def.toughness*1+2);checked=true;};await game.combatPhase(a);assert.equal(checked,true);
 });
 test(`${role}: entering attacking grants no Melee trigger and does not add an attacked opponent`,async()=>{
  const f=context(M,role,2),{game,a,b}=f,source=await cast(f,'Deputized Protester');await nextUpkeep(game,a);game.phase='main1';declare(a,source,b);let checked=false;
  game.priorityRound=async()=>{if(game.step!=='attackers')return;const other=put(M,game,a,'Wings of the Guard','hand');await game.move(other,'battlefield',{attacking:f.others[1],ctrl:a});await settle(game);assert.equal(source.power,3);assert.equal(other.power,1);checked=true;};await game.combatPhase(a);assert.equal(checked,true);
 });
 test(`${role}: overlapping printed and granted Melee trigger independently after the granting source leaves`,async()=>{
  const f=context(M,role,2),{game,a,b}=f,grant=await cast(f,'Adriana, Captain of the Guard'),source=await cast(f,'Deputized Protester');await nextUpkeep(game,a);game.phase='main1';declare(a,source,b);let checked=false;
  game.priorityRound=async()=>{if(game.step!=='attackers')return;assert.equal(game.stack.filter(s=>s.kind==='trigger').length,2);await game.move(grant,'graveyard');await settle(game);assert.equal(source.power,4);checked=true;};await game.combatPhase(a);assert.equal(checked,true);
 });
}
