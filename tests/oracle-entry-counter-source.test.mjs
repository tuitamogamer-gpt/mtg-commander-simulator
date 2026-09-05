import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';import {loadEngine} from './helpers/load-engine.mjs';import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
const M=loadEngine(),raw=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-entry-counter-source.json',import.meta.url))),entries=raw.map((card,i)=>{const semantic=semanticClass(card),types=card.type_line.split(' — ')[0].split(' ');assert.ok(semantic.semanticClass,card.name);return {position:i+1,oracleId:card.oracle_id,scryfallId:card.id,...semantic,raw:{name:card.name,oracle:card.oracle_text,cost:card.mana_cost,types:types.filter(t=>!['Legendary','Basic','Snow'].includes(t)),super:types.filter(t=>['Legendary','Basic','Snow'].includes(t)),subtypes:card.type_line.split(' — ')[1]?.split(' ')||[],power:card.power,toughness:card.toughness,_ci:card.color_identity},catalog:{typeLine:card.type_line,commanderLegality:'legal'}};});
M.registerOracleBatch({id:'entry-counter-source-draft',sequence:9994,cards:entries.filter(c=>!M.DEFS[c.raw.name])});M.initData(M.RAW_DATA);
function setup(role,opponents=1){const ctx=context(M,role,opponents);assert.equal(ctx.a.controller instanceof M.AIController,role==='ai');return ctx;}
const fund=p=>{for(const c of ['W','U','B','R','G','C'])p.pool[c]=100;};
async function cast(ctx,name,{funded=true}={}){const {game,a}=ctx;if(funded)fund(a);const card=put(M,game,a,name,'hand'),before=Object.values(a.pool).reduce((x,y)=>x+y,0);assert.equal(await game.castSpell(a,card,{from:'hand'}),true,name+': actual paid cast');await settle(game);assert.ok(Object.values(a.pool).reduce((x,y)=>x+y,0)<before);return card;}
for(const role of ['human','ai']){
 for(const entry of entries.filter(entry=>entry.implementation.some(op=>op.kind==='entry-counters-v8')))test(`${role}: ${entry.raw.name} enters with counters before its real ETB observation`,async()=>{
  const ctx=setup(role),{game,a,b}=ctx;
  for(let i=0;i<5;i++)put(M,game,a,'Forest');
  const bear=put(M,game,a,'Grizzly Bears');game.addCounters(bear,'+1/+1',2);put(M,game,a,'Lightning Bolt','graveyard');put(M,game,a,'Grizzly Bears','graveyard');await game.loseLife(b,3,'entry proof');await cast(ctx,'Lightning Bolt');
  const observed=[],emit=game.emit.bind(game);game.emit=async(name,data)=>{if(name==='etb'&&data.card.name===entry.raw.name)observed.push({...data.card.counters});return emit(name,data);};
  const card=await cast(ctx,entry.raw.name),operation=entry.implementation.find(op=>op.kind==='entry-counters-v8');assert.equal(card.zone,'battlefield');assert.equal(observed.length,1);
  if(operation.choice){assert.equal(Object.values(card.counters).reduce((x,y)=>x+y,0),operation.choice.count);for(const kind of Object.keys(card.counters))assert.equal(card.kw(kind),true);assert.ok(ctx.trace.some(row=>row.q.aiHint?.kind==='keywordCounter'));}
  else if(operation.prepare){assert.equal(card.counters[operation.counters[0].kind]||0,operation.prepare==='remove-all-counters'?2:0);if(operation.prepare==='remove-all-counters')assert.equal(bear.counters['+1/+1'],0);}
  else for(const counter of operation.counters){const expected=M.OracleV8EntryCounters.condition(game,card,operation.condition)?M.OracleV8EntryCounters.value(game,card,counter.n):0;assert.equal(card.counters[counter.kind]||0,expected);assert.equal(observed[0][counter.kind]||0,expected);}
 });
 test(`${role}: Myojin hand casting adds its divinity counter while real blink loses cast history`,async()=>{
  const ctx=setup(role),{game,a}=ctx,card=await cast(ctx,'Myojin of Seeing Winds');assert.equal(card.counters.divinity,1);assert.equal(card.kw('indestructible'),true);await game.move(card,'exile');await game.putPermanentOntoBattlefield(card,a);assert.equal(card.counters.divinity,undefined);assert.equal(card.kw('indestructible'),false);
 });
 test(`${role}: actual five-color and colorless-inclusive mana payments determine converge counters`,async()=>{
  for(const [pool,wanted]of [[{W:1,U:1,B:1,R:1,G:1,C:0},5],[{W:0,U:1,B:0,R:0,G:0,C:4},1]]){const ctx=setup(role);Object.assign(ctx.a.pool,pool);const card=await cast(ctx,'Prism Array',{funded:false});assert.equal(card.counters.crystal,wanted);assert.equal(Object.values(ctx.a.pool).reduce((x,y)=>x+y,0),0);}
 });
 test(`${role}: Ancient Imperiosaur counts actual tapped convokers, not mana paid`,async()=>{
  const ctx=setup(role),{game,a}=ctx;for(let i=0;i<5;i++)put(M,game,a,'Grizzly Bears');Object.assign(a.pool,{W:0,U:0,B:0,R:0,G:2,C:0});const card=await cast(ctx,'Ancient Imperiosaur',{funded:false});assert.equal(card.castMeta.convokedCount,5);assert.equal(card.castMeta.manaSpent,2);assert.equal(card.counters['+1/+1'],10);assert.equal(game.bf().filter(c=>c!==card&&c.tapped).length,5);
 });
 test(`${role}: a local-AI clone preserves the paid spell's convokers without sharing mutable counters`,async()=>{
  const ctx=setup(role),{game,a}=ctx;for(let i=0;i<5;i++)put(M,game,a,'Grizzly Bears');Object.assign(a.pool,{W:0,U:0,B:0,R:0,G:2,C:0});const card=put(M,game,a,'Ancient Imperiosaur','hand');assert.equal(await game.castSpell(a,card,{from:'hand'}),true);
  const clone=M.cloneGameForAISimulation(game,21),copy=clone.stack.find(row=>row.card?.iid===card.iid).card;assert.equal(copy.castMeta.convokedCount,5);assert.equal(copy.castMeta.castBy,clone.players[0].idx);await settle(clone);assert.equal(copy.counters['+1/+1'],10);assert.equal(card.zone,'stack');assert.equal(card.counters['+1/+1'],undefined);await settle(game);assert.equal(card.counters['+1/+1'],10);
 });
 test(`${role}: actual prior red spells determine Hotheaded Giant's entry and a blink rechecks the current turn`,async()=>{
  const ctx=setup(role),{game,a}=ctx,first=await cast(ctx,'Hotheaded Giant');assert.equal(first.counters['-1/-1'],2);const second=await cast(ctx,'Hotheaded Giant');assert.equal(second.counters['-1/-1'],undefined);await game.move(first,'exile');await game.putPermanentOntoBattlefield(first,a);assert.equal(first.counters['-1/-1'],undefined);
 });
 test(`${role}: Canker Abomination chooses a real opponent and fixes the count at entry`,async()=>{
  const ctx=setup(role,2),{game,b,others}=ctx;for(let i=0;i<2;i++)put(M,game,b,'Grizzly Bears');for(let i=0;i<4;i++)put(M,game,others[1],'Grizzly Bears');const card=await cast(ctx,'Canker Abomination');assert.equal(card.counters['-1/-1'],2);assert.ok(ctx.trace.some(row=>row.q.aiHint?.kind==='entryCounterOpponent'));put(M,game,b,'Grizzly Bears');game.recalc();assert.equal(card.counters['-1/-1'],2);
 });
 test(`${role}: Arsenal Thresher reveals selected artifact cards without moving or spending them`,async()=>{
  const ctx=setup(role),{game,a}=ctx,ring=put(M,game,a,'Sol Ring','hand'),stone=put(M,game,a,'Mind Stone','hand'),forest=put(M,game,a,'Forest','hand'),revealed=[];game.revealToHuman=async data=>{if(data.kind==='reveal')revealed.push(...data.cards);};
  if(role==='human'){const decide=a.controller.decide.bind(a.controller);a.controller.decide=async(g,q)=>q.type==='chooseCards'&&q.prompt.startsWith('Reveal any number of artifact')?q.from:decide(g,q);}
  const card=await cast(ctx,'Arsenal Thresher');assert.equal(card.counters['+1/+1'],2);for(const artifact of [ring,stone]){assert.equal(artifact.zone,'hand');assert.ok(revealed.includes(artifact));}assert.equal(revealed.includes(forest),false);
 });
 test(`${role}: Thief of Blood removes every live counter kind before entry and ignores phased permanents`,async()=>{
  const ctx=setup(role),{game,a,b}=ctx,creature=put(M,game,a,'Grizzly Bears'),artifact=put(M,game,b,'Sol Ring'),phased=put(M,game,b,'Grizzly Bears');game.addCounters(creature,'+1/+1',3);game.addCounters(creature,'shield',1);game.addCounters(artifact,'charge',2);game.addCounters(phased,'+1/+1',4);game.phaseOut(phased);const thief=await cast(ctx,'Thief of Blood');assert.equal(thief.counters['+1/+1'],6);assert.equal(creature.counters['+1/+1'],0);assert.equal(creature.counters.shield,0);assert.equal(artifact.counters.charge,0);assert.equal(phased.counters['+1/+1'],4);
 });
 test(`${role}: copied permanent spells retain X but do not inherit mana, convokers or a cast-from-hand condition`,async()=>{
  for(const name of ['Myojin of Seeing Winds','Verazol, the Split Current']){
   const ctx=setup(role),{game,a,b}=ctx;fund(a);const original=put(M,game,a,name,'hand');assert.equal(await game.castSpell(a,original,{from:'hand',xVal:3}),true);const so=game.stack.find(row=>row.card===original),seen=[];const emit=game.emit.bind(game);game.emit=async(event,data)=>{if(event==='etb'&&data.card.name===name)seen.push({ctrl:data.card.ctrl,counters:{...data.card.counters},cast:data.card.castMeta});return emit(event,data);};
   await game.copySpell(so,b,{mayNewTargets:false});await game.resolveTop();const copy=seen.find(row=>row.ctrl===b);assert.ok(copy);assert.equal(Object.values(copy.counters).reduce((x,y)=>x+y,0),0);assert.notEqual(copy.cast?.wasCast,true);
   await game.resolveTop();assert.equal(original.zone,'battlefield');assert.ok(Object.values(original.counters).reduce((x,y)=>x+y,0)>0);
  }
 });
 test(`${role}: Dust Animus requires five untapped lands and its two counter kinds are one entry event`,async()=>{
  const ctx=setup(role),{game,a}=ctx;for(let i=0;i<4;i++)put(M,game,a,'Forest');const first=await cast(ctx,'Dust Animus');assert.equal(first.counters.lifelink,undefined);put(M,game,a,'Forest');const second=await cast(ctx,'Dust Animus');assert.equal(second.counters['+1/+1'],2);assert.equal(second.counters.lifelink,1);assert.equal(second.kw('lifelink'),true);
 });
 test(`${role}: Giada grants counters to later Angels using the existing battlefield, and phased or silenced sources stop granting them`,async()=>{
  const ctx=setup(role),{game,a,b}=ctx,giada=await cast(ctx,'Giada, Font of Hope');assert.equal(giada.counters['+1/+1']||0,0);
  const first=await cast(ctx,'Serra Angel'),second=await cast(ctx,'Serra Angel');assert.equal(first.counters['+1/+1'],1);assert.equal(second.counters['+1/+1'],2);
  game.phaseOut(giada);const phased=await cast(ctx,'Serra Angel');assert.equal(phased.counters['+1/+1']||0,0);game.phaseInFor(a);
  const aura=put(M,game,b,'Lignify','hand');await game.move(aura,'battlefield',{attachTo:giada});assert.equal(giada.cur.abilitiesDisabled,true);const silenced=await cast(ctx,'Serra Angel');assert.equal(silenced.counters['+1/+1']||0,0);
 });
 test(`${role}: Giada's simultaneous co-entrants do not provide each other's entry bonus`,async()=>{
  const ctx=setup(role),{game,a}=ctx,giada=put(M,game,a,'Giada, Font of Hope','hand'),angel=put(M,game,a,'Serra Angel','hand');
  await game.moveBattlefieldBatch([giada,angel]);assert.equal(angel.counters['+1/+1']||0,0);const next=await cast(ctx,'Serra Angel');assert.equal(next.counters['+1/+1'],2);
 });
 test(`${role}: Bioengineered Future uses prior land entries and combines printed entry counters before Hardened Scales`,async()=>{
  const ctx=setup(role),{game,a}=ctx;await cast(ctx,'Bioengineered Future');for(let i=0;i<2;i++){const land=put(M,game,a,'Forest','hand');await game.move(land,'battlefield');}await cast(ctx,'Hardened Scales');fund(a);
  const serpent=put(M,game,a,'Stonecoil Serpent','hand'),observed=[],emit=game.emit.bind(game);game.emit=async(event,data)=>{if(event==='countersPlaced'&&data.card===serpent)observed.push(data);return emit(event,data);};
  assert.equal(await game.castSpell(a,serpent,{from:'hand',xVal:2}),true);await settle(game);assert.equal(serpent.counters['+1/+1'],5);assert.equal(observed.length,1);assert.equal(observed[0].n,5);
 });
 test(`${role}: Bioengineered Future ignores simultaneous land co-entrants but counts them for later creatures`,async()=>{
  const ctx=setup(role),{game,a}=ctx;await cast(ctx,'Bioengineered Future');const land=put(M,game,a,'Forest','hand'),bear=put(M,game,a,'Grizzly Bears','hand');await game.withBattlefieldEntryBatch(async()=>{await game.move(land,'battlefield');await game.withBattlefieldEntryBatch(async()=>game.move(bear,'battlefield'));});assert.equal(bear.counters['+1/+1']||0,0);assert.equal(a.turnState.landsEntered,1);const later=await cast(ctx,'Grizzly Bears');assert.equal(later.counters['+1/+1'],1);
 });
 test(`${role}: Thunderous Velocipede grants once to Vehicles or creatures, using their battlefield mana value`,async()=>{
  const ctx=setup(role),{game}=ctx,source=await cast(ctx,'Thunderous Velocipede');assert.equal(source.counters['+1/+1']||0,0);const bear=await cast(ctx,'Grizzly Bears'),angel=await cast(ctx,'Serra Angel'),vehicle=await cast(ctx,"Cultivator's Caravan"),ring=await cast(ctx,'Sol Ring');assert.equal(bear.counters['+1/+1'],1);assert.equal(angel.counters['+1/+1'],3);assert.equal(vehicle.counters['+1/+1'],1);assert.equal(ring.counters['+1/+1']||0,0);
 });
}

test('entry counter descriptors reject unknown outcomes and impossible repeated counter choices',()=>{
 for(const extra of [{filter:'permanent'},{amount:'lands-in-hand'},{other:false},{arbitraryEffect:'draw'}])assert.throws(()=>M.OracleV8EntryCounters.compile({kind:'entry-counter-bonus-v8',contract:'entry-counter-replacement',filter:'angel',amount:'angels-controlled',other:true,...extra}));
 for(const operation of [
  {counters:[{kind:'+1/+1',n:{value:'prepared-count'}}]},
  {prepare:'reveal-artifacts',choice:{count:1,kinds:['lifelink']}},
  {prepare:'choose-opponent',counters:[{kind:'+1/+1',n:{value:'prepared-count'}}]},
  {prepare:'remove-all-counters',counters:[{kind:'+1/+1',n:{value:'prepared-count',multiply:2}}]},
 ])assert.throws(()=>M.OracleV8EntryCounters.compile({kind:'entry-counters-v8',contract:'entry-counter-replacement',...operation}));
 for(const extra of [{condition:'secret-hand-card'},{unconsumed:'draw a card'},{counters:[{kind:'unknown',n:1}]},{counters:[{kind:'+1/+1',n:{value:'unspecified'}}]},{choice:{count:2,kinds:['lifelink']},counters:undefined}])assert.throws(()=>M.OracleV8EntryCounters.compile({kind:'entry-counters-v8',contract:'entry-counter-replacement',counters:[{kind:'+1/+1',n:1}],...extra}));
});
