import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';
import {extensionEffect,extensionLine} from '../scripts/oracle-v8-combat-restrictions.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';
const M=loadEngine(), inputs=JSON.parse(readFileSync(new URL('./fixtures/oracle-combat-restrictions.json',import.meta.url)));
const compiled=inputs.map((card,index)=>{
  const semantic=semanticClass(card,{compilerVersion:8});assert.ok(semantic.semanticClass,card.name+': '+semantic.reason);
  const [types,subtypes='']=card.type_line.split(' — '),words=types.split(' ');
  return {position:index+1,oracleId:card.oracle_id,scryfallId:card.id,...semantic,
    raw:{name:card.name,cost:card.mana_cost,oracle:card.oracle_text,types:words.filter(word=>word!=='Legendary'),super:words.includes('Legendary')?['Legendary']:[],subtypes:subtypes.split(' ').filter(Boolean),power:card.power,toughness:card.toughness,_ci:card.color_identity},
    catalog:{typeLine:card.type_line,commanderLegality:'legal'}};
});
const missing=compiled.filter(row=>!M.DEFS[row.raw.name]);
if(missing.length){M.registerOracleBatch({id:'oracle-combat-restrictions-test',sequence:9992,cards:missing});M.initData(M.RAW_DATA);}
function setup(role){const f=context(M,role);f.choice={attackers:[],blockers:[],assignment:'yes'};f.journal=[];
 for(const p of f.game.players){const old=p.controller.decide.bind(p.controller);p.controller.decide=async(g,q)=>{
   if(!p.isAI&&q.type==='chooseTargets'&&f.choice.target&&q.candidates.includes(f.choice.target))return [f.choice.target];
   if(!p.isAI&&q.type==='attackers')return f.choice.attackers;
   if(!p.isAI&&q.type==='blockers')return f.choice.blockers;
   if(!p.isAI&&q.aiHint?.kind==='combatAsUnblocked')return f.choice.assignment;
   return old(g,q);
 };}
 const emit=f.game.emit.bind(f.game);f.game.emit=async(name,data)=>{if(name==='blockersDeclared')f.journal.push(data.attackers.flatMap(attacker=>attacker.blockedBy.map(blocker=>({attacker,blocker}))));return emit(name,data);};
 return f;
}
async function cast(f,name){for(const color of ['W','U','B','R','G','C'])f.a.pool[color]=20;
 const card=put(M,f.game,f.a,name,'hand'),before=Object.values(f.a.pool).reduce((a,b)=>a+b,0);
 assert.equal(await f.game.castSpell(f.a,card,{from:'hand'}),true);await settle(f.game);
 assert.ok(Object.values(f.a.pool).reduce((a,b)=>a+b,0)<before);card.sick=false;return card;
}
test('new combat grammar compiles complete pinned cards and rejects unknown riders',()=>{
 assert.equal(compiled.length,44);
 const card={name:'Restriction Boundary',type_line:'Creature — Beast'};
 for(const text of ['This creature blocks each turn if able.','This creature blocks each combat if able unless you pay {2}.','This creature attacks or blocks each combat if able. Draw a card.','You may have this creature assign its combat damage as though it were not blocked.'])assert.equal(extensionLine(card,text),null,text);
 const helpers={target:text=>({what:'creature',zone:'battlefield',controller:'any'})};
 for(const text of ['Target creature blocks this creature this turn.','Target creature can\'t block this creature this turn if able.','Target creature attacks next turn if able.','Target creature blocks this creature this combat if able.'])assert.equal(extensionEffect(card,text,helpers),null,text);
 assert.throws(()=>M.OracleV8CombatRestrictions.apply({}, {}, {kind:'required-block',extra:true}),/Invalid/);
});
for(const role of ['human','ai']){
 test(`combat ${role}: Iron Golem really casts and must block while respecting menace`,async()=>{
  for(const menace of [false,true]){
   const f=setup(role),{game,a,b}=f,source=await cast(f,'Iron Golem'),attacker=put(M,game,b,menace?'Boggart Brute':'Grizzly Bears');
   game.turnPlayer=b;f.choice.attackers=[{card:attacker,target:a}];f.choice.blockers=[];
   await game.combatPhase(b);
   assert.equal(f.journal.flat().some(pair=>pair.blocker===source),!menace);
   assert.equal((game.aiDecisionLog||[]).some(row=>row.fallback),false);assertGameStateInvariants(game);
  }
 });
 test(`combat ${role}: paid Tangle Angler forces its exact target to block it`,async()=>{
  const f=setup(role),{game,a,b}=f,source=await cast(f,'Tangle Angler'),target=put(M,game,b,'Grizzly Bears'),other=put(M,game,a,'Wind Drake');
  f.choice.target=target;a.pool.G=1;const entry=game.activatableList(a).find(row=>row.card===source&&row.ability);assert.ok(entry);
  assert.equal(await game.activateAbility(a,entry),true);await settle(game);assert.equal(a.pool.G,0);
  source.attacking=b;other.attacking=b;source.blockedBy=[];other.blockedBy=[target];target.blocking=other.iid;
  game.completeRequiredBlocks([source,other],[target]);assert.equal(source.blockedBy.includes(target),true);assert.equal(other.blockedBy.length,0);
  const lock=target.cur.requiredBlockSources[0];await game.move(source,'exile');await game.move(source,'battlefield');source.attacking=b;
  assert.notEqual(source.zoneVersion,lock.version);assert.equal(M.OracleV8CombatRestrictions.score([target],[{blocker:target,attacker:source}]),0,'old requirement never follows a blinked source');
 });
 test(`combat ${role}: Spin Engine block restriction keeps both object identities and expires`,async()=>{
  const f=setup(role),{game,a,b}=f,source=await cast(f,'Spin Engine'),target=put(M,game,b,'Grizzly Bears'),other=put(M,game,a,'Grizzly Bears');
  f.choice.target=target;a.pool.R=1;const entry=game.activatableList(a).find(row=>row.card===source&&row.ability);assert.equal(await game.activateAbility(a,entry),true);await settle(game);
  assert.equal(game.canBlock(target,source),false);assert.equal(game.canBlock(target,other),true);
  await game.move(target,'exile');await game.move(target,'battlefield');assert.equal(game.canBlock(target,source),true);
 });
 test(`combat ${role}: an ability cannot bind a source that blinked before it resolved`,async()=>{
  const f=setup(role),{game,a,b}=f,source=await cast(f,'Tangle Angler'),target=put(M,game,b,'Grizzly Bears');f.choice.target=target;a.pool.G=1;
  const entry=game.activatableList(a).find(row=>row.card===source&&row.ability);assert.equal(await game.activateAbility(a,entry),true);
  await game.move(source,'exile');await game.move(source,'battlefield');await settle(game);
  assert.equal(target.cur.requiredBlockSources?.length||0,0);
 });
 test(`combat ${role}: Thorn Elemental assigns lethal damage through blockers while taking their damage`,async()=>{
  const f=setup(role),{game,a,b}=f,source=await cast(f,'Thorn Elemental'),blocker=put(M,game,b,'Grizzly Bears');b.life=7;
  source.meta.mustAttackPlayer=b;f.choice.attackers=[{card:source,target:b}];f.choice.blockers=[{blocker,attacker:source}];
  await game.combatPhase(a);assert.equal(b.lost,true);assert.equal(source.damage,2,'a real block still deals simultaneous damage back');
  assert.equal((game.aiDecisionLog||[]).some(row=>row.fallback),false);
 });
}
test('human may decline Thorn Elemental damage assignment and kill its blocker',async()=>{
 const f=setup('human'),{game,a,b}=f,source=await cast(f,'Thorn Elemental'),blocker=put(M,game,b,'Grizzly Bears');
 f.choice.assignment='no';f.choice.attackers=[{card:source,target:b}];f.choice.blockers=[{blocker,attacker:source}];
 await game.combatPhase(a);assert.equal(b.life,40);assert.equal(blocker.zone,'graveyard');assert.equal(source.damage,2);
});
test('multiple source-block requirements maximize the legal declaration, including menace conflicts',async()=>{
 const f=setup('human'),{game,a,b}=f,first=await cast(f,'Tangle Angler'),second=put(M,game,a,'Tangle Angler'),blocker=put(M,game,b,'Grizzly Bears');
 f.choice.target=blocker;a.pool.G=3;
 for(const source of [first,first,second]){
  const action=game.activatableList(a).find(row=>row.card===source&&row.ability);assert.equal(await game.activateAbility(a,action),true);await settle(game);
 }
 for(const source of [first,second]){source.attacking=b;source.blockedBy=[];}
 game.completeRequiredBlocks([first,second],[blocker]);assert.equal(first.blockedBy.includes(blocker),true,'two requirements beat one');
 first.def={...first.def,kws:[...(first.def.kws||[]),'menace']};game.recalc();first.blockedBy=[];second.blockedBy=[];blocker.blocking=null;
 game.completeRequiredBlocks([first,second],[blocker]);assert.equal(first.blockedBy.length,0);assert.equal(second.blockedBy.includes(blocker),true,'one legal requirement beats two impossible ones');
});
test('double strike chooses optional as-unblocked assignment separately for each damage step',async()=>{
 const f=setup('human'),{game,a,b}=f,source=await cast(f,'Thorn Elemental'),blocker=put(M,game,b,'Grizzly Bears');
 blocker.def={...blocker.def,toughness:'20'};M.E.pumpUntilEOT(game,source,0,0,['double strike']);
 source.attacking=b;source.blockedBy=[blocker];source.wasBlocked=true;game.combat={attackers:[source]};
 f.choice.assignment='no';await game.combatDamage(a,'first');assert.equal(blocker.damage,7);assert.equal(b.life,40);
 f.choice.assignment='yes';await game.combatDamage(a,'normal');assert.equal(blocker.damage,7);assert.equal(b.life,33);assert.equal(source.damage,2);
});
