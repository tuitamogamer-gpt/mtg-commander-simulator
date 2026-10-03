import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {loadEngine} from './helpers/load-engine.mjs';import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';
import {createImportPlan,runtimeBatch,semanticClass} from '../scripts/import-oracle-batch.mjs';
const M=loadEngine(),rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v28-common.json',import.meta.url),'utf8'));
const plan=createImportPlan({cards:rows,bulk:{type:'oracle_cards'},limit:rows.length,sequence:9959,compilerVersion:28}),batch=runtimeBatch(plan.report),absent=batch.cards.filter(entry=>!M.DEFS[entry.raw.name]);if(absent.length)M.registerOracleBatch({...batch,cards:absent});M.initData(M.RAW_DATA);
for(const row of rows)test(row.name+': complete source rejects unsupported appended text',()=>{
 assert.ok(semanticClass(row,{compilerVersion:28}).semanticClass);
 assert.ok(!semanticClass({...row,oracle_text:row.oracle_text+'\nWhenever an opponent sings, restart the game.'},{compilerVersion:28}).semanticClass);
});
const total=p=>Object.values(p.pool).reduce((a,b)=>a+b,0),fund=p=>{for(const color of ['W','U','B','R','G','C'])p.pool[color]=30;},empty=p=>{for(const color of ['W','U','B','R','G','C'])p.pool[color]=0;};
function choices(p,types,pay=false){let index=0;const old=p.controller.decide.bind(p.controller);p.controller.decide=(g,q)=>/(?:basic )?land type/.test(q.prompt||'')?types[Math.min(index++,types.length-1)]:q.prompt?.endsWith('pay 2 life?')?pay?'pay':'tapped':old(g,q);}
async function paid(f,name,types=['Island'],options={}){fund(f.a);choices(f.a,types);const source=put(M,f.game,f.a,name,'hand'),before=total(f.a);assert.equal(await f.game.castSpell(f.a,source,{from:'hand',...options}),true);assert.ok(total(f.a)<before);await settle(f.game);return source;}
async function land(f,name,type,pay=false){choices(f.a,[type],pay);const source=put(M,f.game,f.a,name,'hand');assert.equal(await f.game.playLand(f.a,source),true);await settle(f.game);return source;}
const manaColors=(game,player,source)=>new Set(game.manaSources(player,null,{includeRestricted:true}).filter(row=>row.card===source).flatMap(row=>row.produce.flatMap(output=>Object.keys(output).filter(color=>output[color]>0))));
test('natural local AI chooses a creature type matching its actual visible creatures',async()=>{
 const f=context(M,'ai');put(M,f.game,f.a,'Grizzly Bears');fund(f.a);const source=put(M,f.game,f.a,'Conspiracy','hand');assert.equal(await f.game.castSpell(f.a,source,{from:'hand'}),true);await settle(f.game);assert.equal(source.meta.oracleEntryCreatureTypeV28.type,'Bear');assertGameStateInvariants(f.game);
});
for(const role of ['human','ai']){
 test(role+': both chosen land and creature types survive a real JSON checkpoint',async()=>{
  const f=context(M,role),decide=f.a.controller.decide.bind(f.a.controller);f.a.controller.decide=(g,q)=>q.prompt==='Choose a creature type'?'Goblin':decide(g,q);
  const realm=await paid(f,'Realmwright',['Swamp']),conspiracy=await paid(f,'Conspiracy'),forest=put(M,f.game,f.a,'Forest'),bear=put(M,f.game,f.a,'Grizzly Bears','graveyard'),snapshot=M.captureGameState(f.game);assert.ok(snapshot,f.game.log.at(-1)?.msg);
  const restored=context(M,role);M.restoreGameState(restored.game,JSON.parse(JSON.stringify(snapshot)));const r=restored.game.byIid(realm.iid),c=restored.game.byIid(conspiracy.iid),land=restored.game.byIid(forest.iid),grave=restored.game.byIid(bear.iid);
  assert.equal(land.hasSub('Swamp'),true);assert.equal(grave.hasSub('Goblin'),true);assert.equal(grave.hasSub('Bear'),false);assert.equal(restored.game.manaSources(restored.a).some(row=>row.card===land&&row.produce.some(output=>output.B===1)),true);
  await restored.game.move(r,'exile');await restored.game.move(c,'exile');assert.equal(land.hasSub('Swamp'),false);assert.equal(grave.hasSub('Goblin'),false);assert.equal(grave.hasSub('Bear'),true);assertGameStateInvariants(restored.game);
 });
 test(role+': creature types follow battlefield control and stack control rather than card ownership',async()=>{
  const f=context(M,role),decide=f.a.controller.decide.bind(f.a.controller);f.a.controller.decide=(g,q)=>q.prompt==='Choose a creature type'?'Goblin':decide(g,q);const source=await paid(f,'Conspiracy'),own=put(M,f.game,f.a,'Grizzly Bears'),foreign=put(M,f.game,f.b,'Grizzly Bears');
  own.ctrl=f.b;foreign.ctrl=f.a;f.game.recalc();assert.equal(own.hasSub('Goblin'),false);assert.equal(foreign.hasSub('Goblin'),true);
  await f.game.move(foreign,'graveyard');assert.equal(foreign.hasSub('Goblin'),false);await f.game.move(own,'graveyard');assert.equal(own.hasSub('Goblin'),true);await f.game.move(source,'exile');assert.equal(own.hasSub('Goblin'),false);assertGameStateInvariants(f.game);
 });
 for(const name of ['Ashes of the Fallen','Conspiracy','Leyline of Transformation'])test(role+': '+name+' applies live creature subtypes in precisely its printed zones',async()=>{
  const f=context(M,role),decide=f.a.controller.decide.bind(f.a.controller);f.a.controller.decide=(g,q)=>q.prompt==='Choose a creature type'?'Goblin':decide(g,q);
  const hand=put(M,f.game,f.a,'Grizzly Bears','hand'),grave=put(M,f.game,f.a,'Grizzly Bears','graveyard'),library=put(M,f.game,f.a,'Grizzly Bears','library'),exile=put(M,f.game,f.a,'Grizzly Bears','exile'),own=put(M,f.game,f.a,'Grizzly Bears'),enemy=put(M,f.game,f.b,'Grizzly Bears'),enemyGrave=put(M,f.game,f.b,'Grizzly Bears','graveyard'),retain=name!=='Conspiracy';
  const source=await paid(f,name);assert.equal(grave.hasSub('Goblin'),true);assert.equal(grave.hasSub('Bear'),retain);assert.equal(enemyGrave.hasSub('Goblin'),false);
  for(const card of [hand,library,exile,own]){assert.equal(card.hasSub('Goblin'),name!=='Ashes of the Fallen');assert.equal(card.hasSub('Bear'),retain||name==='Ashes of the Fallen');}assert.equal(enemy.hasSub('Goblin'),false);
  assert.ok(f.game.snapshot(grave).subtypes.includes('Goblin'));assert.equal(grave.def.subtypes.includes('Goblin'),false);assert.equal(M.DEFS['Grizzly Bears'].subtypes.includes('Goblin'),false);
  if(name!=='Ashes of the Fallen'){assert.ok(f.game.castDefinition(hand).subtypes.includes('Goblin'));assert.equal(await f.game.castSpell(f.a,hand,{from:'hand'}),true);assert.equal(hand.zone,'stack');assert.equal(hand.hasSub('Goblin'),true);assert.equal(hand.hasSub('Bear'),retain);await settle(f.game);assert.equal(hand.hasSub('Goblin'),true);}
  await f.game.move(source,'exile');for(const card of [hand,grave,library,exile,own]){assert.equal(card.hasSub('Goblin'),false);assert.equal(card.hasSub('Bear'),true);}assertGameStateInvariants(f.game);
 });
 test(role+': Conspiracy replaces printed Changeling and respects later type timestamps without copying the choice',async()=>{
  const f=context(M,role),decide=f.a.controller.decide.bind(f.a.controller);let type='Goblin';f.a.controller.decide=(g,q)=>q.prompt==='Choose a creature type'?type:decide(g,q);
  const changeling=put(M,f.game,f.a,'Universal Automaton','graveyard'),first=await paid(f,'Conspiracy');assert.equal(changeling.hasSub('Goblin'),true);assert.equal(changeling.hasSub('Elf'),false);assert.equal(f.game.snapshot(changeling).changeling,false);
  type='Elf';const leyline=await paid(f,'Leyline of Transformation');assert.equal(changeling.hasSub('Goblin'),true);assert.equal(changeling.hasSub('Elf'),true);assert.equal(changeling.hasSub('Zombie'),false);
  type='Zombie';const second=await paid(f,'Conspiracy');assert.equal(changeling.hasSub('Goblin'),false);assert.equal(changeling.hasSub('Elf'),false);assert.equal(changeling.hasSub('Zombie'),true);
  await f.game.move(second,'exile');assert.equal(changeling.hasSub('Goblin'),true);assert.equal(changeling.hasSub('Elf'),true);await f.game.move(first,'exile');assert.equal(changeling.hasSub('Zombie'),true);await f.game.move(leyline,'exile');assert.equal(changeling.hasSub('Goblin'),true);assertGameStateInvariants(f.game);
 });
 test(role+': Leyline of Transformation enters through the actual opening-permanent action and chooses anew after returning',async()=>{
  const f=context(M,role),source=put(M,f.game,f.a,'Leyline of Transformation','hand'),decide=f.a.controller.decide.bind(f.a.controller);let type='Elf';f.a.controller.decide=async(g,q)=>q.prompt==='Choose a creature type'?type:/Begin with Leyline/.test(q.prompt||'')?'yes':decide(g,q);
  await M.CDK.openingPermanents(f.game);assert.equal(source.zone,'battlefield');const card=put(M,f.game,f.a,'Grizzly Bears','hand');assert.equal(card.hasSub('Elf'),true);const version=source.zoneVersion;
  await f.game.move(source,'exile');assert.equal(card.hasSub('Elf'),false);type='Goblin';await f.game.putPermanentOntoBattlefield(source,f.a);assert.ok(source.zoneVersion>version);assert.equal(card.hasSub('Elf'),false);assert.equal(card.hasSub('Goblin'),true);assertGameStateInvariants(f.game);
 });
 test(role+': Roots of Life gains life for each actual opposing chosen-land mana activation',async()=>{
  for(const [type,color] of [['Island','U'],['Swamp','B']]){const f=context(M,role),source=await paid(f,'Roots of Life',[type]),enemy=put(M,f.game,f.b,type),own=put(M,f.game,f.a,type),other=put(M,f.game,f.b,type==='Island'?'Swamp':'Island'),life=f.a.life;
   assert.equal(await f.game.activateManaSource(f.b,f.game.manaSources(f.b).find(row=>row.card===enemy),{[color]:1}),true);await settle(f.game);assert.equal(f.a.life,life+1);
   await f.game.activateManaSource(f.a,f.game.manaSources(f.a).find(row=>row.card===own),{[color]:1});await settle(f.game);assert.equal(f.a.life,life+1);
   await f.game.activateManaSource(f.b,f.game.manaSources(f.b).find(row=>row.card===other),{[type==='Island'?'B':'U']:1});await settle(f.game);assert.equal(f.a.life,life+1);
   await f.game.move(source,'exile');enemy.tapped=false;await f.game.activateManaSource(f.b,f.game.manaSources(f.b).find(row=>row.card===enemy),{[color]:1});await settle(f.game);assert.equal(f.a.life,life+1);assertGameStateInvariants(f.game);
  }
 });
 test(role+': a paid Clone of Realmwright makes a fresh type choice without copying the original choice',async()=>{
  const f=context(M,role),forest=put(M,f.game,f.a,'Forest'),source=await paid(f,'Realmwright',['Island']),decide=f.a.controller.decide.bind(f.a.controller);
  f.a.controller.decide=(g,q)=>q.type==='chooseCards'&&q.from.includes(source)?[source]:decide(g,q);
  const clone=await paid(f,'Clone',['Swamp']);assert.equal(clone.name,'Realmwright');assert.equal(forest.hasSub('Island'),true);assert.equal(forest.hasSub('Swamp'),true);
  await f.game.move(source,'exile');assert.equal(forest.hasSub('Island'),false);assert.equal(forest.hasSub('Swamp'),true);await f.game.move(clone,'exile');assert.equal(forest.hasSub('Swamp'),false);assert.equal(clone.name,'Clone');assertGameStateInvariants(f.game);
 });
 test(role+': a returning Multiversal Passage chooses and pays afresh for its new incarnation',async()=>{
  const f=context(M,role),source=await land(f,'Multiversal Passage','Forest'),version=source.zoneVersion;assert.equal(source.tapped,true);await f.game.move(source,'exile');choices(f.a,['Swamp'],true);await f.game.putPermanentOntoBattlefield(source,f.a);await settle(f.game);
  assert.ok(source.zoneVersion>version);assert.equal(source.hasSub('Forest'),false);assert.equal(source.hasSub('Swamp'),true);assert.equal(source.tapped,false);assert.equal(f.a.life,38);assertGameStateInvariants(f.game);
 });
 test(role+': Realmwright adds the chosen type and actual intrinsic mana while retaining native Forest mana',async()=>{
  const f=context(M,role),lands=Array.from({length:3},()=>put(M,f.game,f.a,'Forest')),opponent=put(M,f.game,f.b,'Forest');
  const source=await paid(f,'Realmwright');for(const card of lands){assert.equal(card.hasSub('Island'),true);assert.equal(card.hasSub('Forest'),true);assert.deepEqual([...manaColors(f.game,f.a,card)].sort(),['G','U']);}assert.equal(opponent.hasSub('Island'),false);
  empty(f.a);const spell=put(M,f.game,f.a,'Divination','hand');assert.equal(await f.game.castSpell(f.a,spell,{from:'hand'}),true);assert.equal(lands.filter(c=>c.tapped).length,3);assert.ok(spell.castMeta.paymentColors.includes('U'));await settle(f.game);
  await f.game.move(source,'exile');assert.ok(lands.every(c=>!c.hasSub('Island')));for(const card of lands)card.tapped=false;assert.deepEqual([...manaColors(f.game,f.a,lands[0])],['G']);assertGameStateInvariants(f.game);
 });
 test(role+': Convincing Mirage removes printed Forest mana and restores it when the Aura leaves',async()=>{
  const f=context(M,role),target=put(M,f.game,f.b,'Forest');const source=await paid(f,'Convincing Mirage',['Mountain'],{quickTargets:[target]});assert.equal(source.attachedTo,target.iid);assert.equal(target.hasSub('Forest'),false);assert.equal(target.hasSub('Mountain'),true);assert.deepEqual([...manaColors(f.game,f.b,target)],['R']);
  await f.game.move(source,'exile');assert.equal(target.hasSub('Forest'),true);assert.equal(target.hasSub('Mountain'),false);assert.deepEqual([...manaColors(f.game,f.b,target)],['G']);assertGameStateInvariants(f.game);
 });
 test(role+': Illusionary Terrain changes only basic lands of the first type and pays its real cumulative upkeep',async()=>{
  const f=context(M,role),forest=put(M,f.game,f.a,'Forest'),enemy=put(M,f.game,f.b,'Forest'),dual=put(M,f.game,f.b,'Temple Garden');const source=await paid(f,'Illusionary Terrain',['Forest','Mountain']);
  for(const card of [forest,enemy]){assert.equal(card.hasSub('Forest'),false);assert.equal(card.hasSub('Mountain'),true);}assert.equal(dual.hasSub('Forest'),true);assert.equal(dual.hasSub('Plains'),true);
  const before=total(f.a);await f.game.emit('upkeep',{player:f.a});await settle(f.game);assert.equal(source.counters.age,1);assert.equal(total(f.a),before-2);
  await f.game.emit('upkeep',{player:f.a});await settle(f.game);assert.equal(source.counters.age,2);assert.equal(total(f.a),before-6);
  await f.game.move(source,'exile');assert.equal(forest.hasSub('Forest'),true);assert.equal(enemy.hasSub('Forest'),true);assertGameStateInvariants(f.game);
 });
 test(role+': Illusionary Terrain is sacrificed when its cumulative upkeep cannot be paid',async()=>{
  const f=context(M,role),source=await paid(f,'Illusionary Terrain',['Forest','Mountain']);empty(f.a);await f.game.emit('upkeep',{player:f.a});await settle(f.game);assert.equal(source.zone,'graveyard');assertGameStateInvariants(f.game);
 });
 test(role+': Thran Portal chooses every printed basic type and checks the count of other lands on entry',async()=>{
  for(const type of ['Plains','Island','Swamp','Mountain','Forest'])for(const count of [0,2,3]){const f=context(M,role);for(let i=0;i<count;i++)put(M,f.game,f.a,'Forest');const source=await land(f,'Thran Portal',type);assert.equal(source.tapped,count>2);assert.equal(source.hasSub(type),true);assert.equal(source.def.oracleEntryLandTypeV28,undefined);assertGameStateInvariants(f.game);}
 });
 test(role+': Thran Portal pays its additional life for a real automatic mana activation',async()=>{
  const f=context(M,role),source=await land(f,'Thran Portal','Forest');empty(f.a);const before=f.a.life,spell=put(M,f.game,f.a,'Llanowar Elves','hand');assert.equal(await f.game.castSpell(f.a,spell,{from:'hand'}),true);await settle(f.game);assert.equal(f.a.life,before-1);assert.equal(source.tapped,true);assert.equal(spell.zone,'battlefield');assertGameStateInvariants(f.game);
 });
 test(role+': Platinum Emperion prevents paying Thran Portal mana life without tapping the land',async()=>{
  const f=context(M,role),source=await land(f,'Thran Portal','Forest');put(M,f.game,f.a,'Platinum Emperion');empty(f.a);const spell=put(M,f.game,f.a,'Llanowar Elves','hand');assert.equal(await f.game.castSpell(f.a,spell,{from:'hand'}),false);assert.equal(f.a.life,40);assert.equal(source.tapped,false);assert.equal(spell.zone,'hand');assertGameStateInvariants(f.game);
 });
 test(role+': Blood Moon removes the Portal choice and additional life ability but supplies actual Mountain mana',async()=>{
  const f=context(M,role),source=await land(f,'Thran Portal','Forest');put(M,f.game,f.b,'Blood Moon');empty(f.a);assert.equal(source.hasSub('Forest'),false);assert.equal(source.hasSub('Mountain'),true);const decide=f.a.controller.decide.bind(f.a.controller);f.a.controller.decide=(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(f.b)?[f.b]:decide(g,q);const spell=put(M,f.game,f.a,'Lightning Bolt','hand');assert.equal(await f.game.castSpell(f.a,spell,{from:'hand',quickTargets:[f.b]}),true);await settle(f.game);assert.equal(f.a.life,40);assert.equal(f.b.life,37);assert.equal(source.tapped,true);assertGameStateInvariants(f.game);
 });
 test(role+': Multiversal Passage chooses every type and offers the exact two-life entry payment',async()=>{
  for(const type of ['Plains','Island','Swamp','Mountain','Forest'])for(const pay of [false,true]){const f=context(M,role),source=await land(f,'Multiversal Passage',type,pay);assert.equal(source.hasSub(type),true);assert.equal(source.tapped,!pay);assert.equal(f.a.life,pay?38:40);source.tapped=false;assert.deepEqual([...manaColors(f.game,f.a,source)],[{Plains:'W',Island:'U',Swamp:'B',Mountain:'R',Forest:'G'}[type]]);assertGameStateInvariants(f.game);}
 });
 test(role+': Multiversal Passage enters tapped when a requested life payment is forbidden',async()=>{
  const f=context(M,role);put(M,f.game,f.a,'Platinum Emperion');const source=await land(f,'Multiversal Passage','Island',true);assert.equal(source.tapped,true);assert.equal(source.hasSub('Island'),true);assert.equal(f.a.life,40);assertGameStateInvariants(f.game);
 });
}
for(const role of ['human','ai']){
 test(role+": Traveler's Cloak draws on actual entry and grants chosen landwalk, including a nonbasic subtype",async()=>{
  for(const [type,landName] of [['Island','Island'],['Gate','Golgari Guildgate']]){const f=context(M,role),creature=put(M,f.game,f.a,'Grizzly Bears'),blocker=put(M,f.game,f.b,'Grizzly Bears'),land=put(M,f.game,f.b,landName),hand=f.a.hand.length;
   const source=await paid(f,"Traveler's Cloak",[type],{quickTargets:[creature]});assert.equal(source.attachedTo,creature.iid);assert.equal(f.a.hand.length,hand+1);creature.attacking=f.b;assert.equal(creature.kw(type.toLowerCase()+'walk'),true);assert.equal(f.game.canBlock(blocker,creature),false);
   await f.game.move(land,'exile');assert.equal(f.game.canBlock(blocker,creature),true);await f.game.putPermanentOntoBattlefield(land,f.b);assert.equal(f.game.canBlock(blocker,creature),false);
   const decide=f.a.controller.decide.bind(f.a.controller),defend=f.b.controller.decide.bind(f.b.controller);f.a.controller.decide=(g,q)=>q.type==='attackers'?[{card:creature,target:f.b}]:decide(g,q);f.b.controller.decide=(g,q)=>q.type==='blockers'?[{blocker,attacker:creature}]:defend(g,q);f.game.priorityRound=async()=>settle(f.game);const life=f.b.life;await f.game.combatPhase(f.a);assert.equal(f.b.life,life-2);assert.equal(blocker.zone,'battlefield');
   await f.game.move(source,'exile');assert.equal(f.game.canBlock(blocker,creature),true);assertGameStateInvariants(f.game);
  }
 });
 test(role+': the native ignore-landwalk permission also overrides the chosen subtype',async()=>{
  const f=context(M,role),creature=put(M,f.game,f.a,'Grizzly Bears'),blocker=put(M,f.game,f.b,'Grizzly Bears');put(M,f.game,f.b,'Island');await paid(f,"Traveler's Cloak",['Island'],{quickTargets:[creature]});creature.attacking=f.b;assert.equal(f.game.canBlock(blocker,creature),false);blocker.cur.oracleBlockLandwalkV15=['all'];assert.equal(f.game.canBlock(blocker,creature),true);assertGameStateInvariants(f.game);
 });
 test(role+': Shimmer phases only chosen-type lands at each actual owner untap action and keeps their incarnation',async()=>{
  const f=context(M,role),own=put(M,f.game,f.a,'Forest'),enemy=put(M,f.game,f.b,'Forest'),other=put(M,f.game,f.a,'Island'),source=await paid(f,'Shimmer',['Forest']),versions=[own.zoneVersion,enemy.zoneVersion];
  assert.equal(own.kw('phasing'),true);assert.equal(enemy.kw('phasing'),true);assert.equal(other.kw('phasing'),false);f.game.phaseDuringUntap(f.a);assert.equal(own.phasedOut,true);assert.equal(enemy.phasedOut,false);assert.equal(other.phasedOut,false);
  f.game.phaseDuringUntap(f.b);assert.equal(enemy.phasedOut,true);assert.equal(own.zoneVersion,versions[0]);assert.equal(enemy.zoneVersion,versions[1]);
  await f.game.move(source,'exile');f.game.phaseDuringUntap(f.a);assert.equal(own.phasedOut,false);assert.equal(enemy.phasedOut,true);f.game.phaseDuringUntap(f.b);assert.equal(enemy.phasedOut,false);assert.equal(own.kw('phasing'),false);assert.equal(enemy.kw('phasing'),false);assertGameStateInvariants(f.game);
 });
}
