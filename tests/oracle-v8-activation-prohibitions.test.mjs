import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';
import {extensionEffect,extensionLine} from '../scripts/oracle-v8-activation-prohibitions.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';
const M=loadEngine(),inputs=JSON.parse(readFileSync(new URL('./fixtures/oracle-activation-prohibitions.json',import.meta.url)));
const compiled=inputs.map((card,index)=>{
 const semantic=semanticClass(card,{compilerVersion:8});assert.ok(semantic.semanticClass,card.name+': '+semantic.reason);
 const [type,subtypes='']=card.type_line.split(' — '),words=type.split(' ');
 return{position:index+1,oracleId:card.oracle_id,scryfallId:card.id,...semantic,raw:{name:card.name,cost:card.mana_cost,oracle:card.oracle_text,types:words.filter(word=>word!=='Legendary'),super:words.includes('Legendary')?['Legendary']:[],subtypes:subtypes.split(' ').filter(Boolean),power:card.power,toughness:card.toughness,_ci:card.color_identity},catalog:{typeLine:card.type_line,commanderLegality:'legal'}};
});
const missing=compiled.filter(card=>!M.DEFS[card.raw.name]);
if(missing.length){M.registerOracleBatch({id:'oracle-activation-prohibitions-test',sequence:9994,cards:missing});M.initData(M.RAW_DATA);}
function setup(role){const f=context(M,role);f.selected=[];
 for(const player of f.game.players){const original=player.controller.decide.bind(player.controller);player.controller.decide=async(game,q)=>{
   if(!player.isAI&&q.type==='chooseTargets'&&f.selected.some(card=>q.candidates.includes(card)))return f.selected.filter(card=>q.candidates.includes(card)).slice(0,q.count||q.max||1);
   return original(game,q);
 };}return f;
}
async function cast(f,name,{resolve=true}={}){
 const card=put(M,f.game,f.a,name,'hand');for(const color of ['W','U','B','R','G','C'])f.a.pool[color]=20;
 const before=Object.values(f.a.pool).reduce((a,b)=>a+b,0);assert.equal(await f.game.castSpell(f.a,card,{from:'hand'}),true,name+': real paid cast');
 assert.ok(Object.values(f.a.pool).reduce((a,b)=>a+b,0)<before);if(resolve)await settle(f.game);return card;
}
async function reachUpkeep(game,player){const original=game.emit,stop=new Error('Reached upkeep');game.turnPlayer=player;
 game.emit=async function(event,data){if(event==='upkeep'&&data.player===player)throw stop;return original.call(this,event,data);};
 try{await assert.rejects(game.runTurn(),error=>error===stop);}finally{game.emit=original;}
}
function disabled(game,card){assert.equal(card.cur.activationDisabled,true);assert.equal(game.activatableList(card.ctrl).some(row=>row.card===card&&!row.turnFaceUp),false);assert.equal(game.manaSources(card.ctrl).some(row=>row.card===card),false);}

test('activation grammar compiles complete pinned inputs and rejects extra exceptions or durations',()=>{
 assert.equal(compiled.length,29);
 const card={name:'Boundary',type_line:'Enchantment — Aura'},helpers={target:()=>({what:'creature',zone:'battlefield',controller:'any'})};
 for(const line of ["Enchanted creature's activated abilities can't be activated unless they're mana abilities.","Enchanted permanent can't attack, block, or crew Vehicles, and its activated abilities can't be activated.","Enchanted creature's activated abilities can't be activated. Its controller may pay {3} to ignore this effect.","Activated abilities of creatures can't be activated except during your turn."])assert.equal(extensionLine(card,line,helpers),null,line);
 for(const line of ['Detain each creature.','Detain target land.',"Target creature can't attack or block, and its activated abilities can't be activated until end of combat.","Until your next turn, target creature can't attack or block, and its activated abilities can't be activated this turn."])assert.equal(extensionEffect(card,line,helpers),null,line);
});
for(const role of ['human','ai']){
 test(`activation ${role}: paid Arrest preserves indestructible and damage triggers while forbidding activation`,async()=>{
  const f=setup(role),{game,a,b}=f,target=put(M,game,b,'Brash Taunter');put(M,game,a,'Grizzly Bears');Object.assign(b.pool,{C:2,R:1});
  const stale=game.activatableList(b).find(row=>row.card===target&&row.ability);assert.ok(stale);f.selected=[target];
  const aura=await cast(f,'Arrest');assert.equal(aura.attachedTo,target.iid);disabled(game,target);assert.equal(target.kw('indestructible'),true);
  const priorMana={...b.pool};assert.equal(await game.activateAbility(b,stale),false);assert.deepEqual({...b.pool},priorMana);
  assert.equal(game.canAttackAtAll(target),false);assert.equal(game.canBlock(target,put(M,game,a,'Grizzly Bears')),false);
  await game.damageCreature(null,target,2);await settle(game);assert.equal(a.life,38,'printed damage trigger still resolves');assert.equal(target.zone,'battlefield');
  await game.move(aura,'graveyard');assert.equal(!!target.cur.activationDisabled,false);assert.ok(game.activatableList(b).some(row=>row.card===target&&row.ability));assertGameStateInvariants(game);
 });
 test(`activation ${role}: paid Lawmage's Binding forbids mana and stale mana descriptors until unattached`,async()=>{
  const f=setup(role),{game,b}=f,target=put(M,game,b,'Birds of Paradise'),source=game.manaSources(b).find(row=>row.card===target);assert.ok(source);f.selected=[target];
  const aura=await cast(f,"Lawmage's Binding");assert.equal(aura.attachedTo,target.iid);disabled(game,target);assert.equal(target.kw('flying'),true);
  const prior=b.pool.G;assert.equal(await game.activateManaSource(b,source,{G:1}),false);assert.equal(b.pool.G,prior);assert.equal(target.tapped,false);
  await game.move(target,'exile');await game.checkSBA();assert.equal(aura.zone,'graveyard');await game.move(target,'battlefield');target.sick=false;
  assert.equal(!!target.cur.activationDisabled,false);assert.ok(game.manaSources(b).some(row=>row.card===target));
 });
 test(`detain ${role}: paid Arrester effect outlives source and follows control until caster's next turn`,async()=>{
  const f=setup(role),{game,a,b}=f,target=put(M,game,b,'Brash Taunter');f.selected=[target];
  const source=await cast(f,'Azorius Arrester');disabled(game,target);const row=game.untilEffects.find(row=>row.iid===target.iid&&row.kind==='oracleCombatRestriction');assert.equal(row.whoTurn,a);
  await game.move(source,'exile');target.ctrl=a;game.recalc();disabled(game,target);
  await reachUpkeep(game,b);disabled(game,target);await reachUpkeep(game,a);assert.equal(!!target.cur.activationDisabled,false);assert.equal(!!target.cur.cantAttack,false);assert.equal(!!target.cur.cantBlock,false);
 });
 test(`detain ${role}: target blink before Inaction Injunction resolves makes all its targets illegal`,async()=>{
  const f=setup(role),{game,a,b}=f,target=put(M,game,b,'Brash Taunter');f.selected=[target];const before=a.library.length;
  const source=await cast(f,'Inaction Injunction',{resolve:false});await game.move(target,'exile');await game.move(target,'battlefield');await settle(game);
  assert.equal(source.zone,'graveyard');assert.equal(!!target.cur.activationDisabled,false);assert.equal(a.library.length,before,'all targets illegal also prevents draw');
 });
 test(`detain ${role}: paid Lyev Decree chooses two opponents' creatures and allows a zero-target cast`,async()=>{
  for(const positive of [true,false]){const f=setup(role),{game,b}=f;
   const targets=positive?[put(M,game,b,'Brash Taunter'),put(M,game,b,'Shivan Dragon')]:[];f.selected=targets;
   await cast(f,'Lyev Decree');assert.equal(game.untilEffects.filter(row=>row.kind==='oracleCombatRestriction').length,targets.length);for(const target of targets)disabled(game,target);
  }
 });
 test(`detain ${role}: Lavinia selects all opposing nonland permanents at resolution with exact mana value bound`,async()=>{
  const f=setup(role),{game,a,b}=f,small=put(M,game,b,'Sol Ring'),boundary=put(M,game,b,'Solemn Simulacrum'),large=put(M,game,b,'Shivan Dragon'),land=put(M,game,b,'Forest'),own=put(M,game,a,'Sol Ring');
  const source=await cast(f,'Lavinia of the Tenth');disabled(game,small);disabled(game,boundary);
  for(const card of [large,land,own,source])assert.equal(!!card.cur.activationDisabled,false,card.name+': outside detain group');
 });
 test(`aura ${role}: paid new target nouns suppress a planeswalker and restore its loyalty ability on removal`,async()=>{
  for(const name of ["Nahiri's Binding",'Planar Disruption','Suppression Bonds']){const f=setup(role),{game,b}=f,target=put(M,game,b,'Domri, Anarch of Bolas');target.counters.loyalty=3;f.selected=[target];
   const aura=await cast(f,name);assert.equal(aura.attachedTo,target.iid);disabled(game,target);await game.move(aura,'graveyard');assert.equal(!!target.cur.activationDisabled,false);
   game.turnPlayer=b;assert.ok(game.activatableList(b).some(row=>row.card===target&&row.ability?.loyalty!==undefined));
  }
 });
}
test('new Aura target nouns enforce exact type categories before paying or attaching',()=>{
 const f=setup('human'),{game,a,b}=f,names=['Forest','Sol Ring','Grizzly Bears','Domri, Anarch of Bolas','Rhystic Study'];
 const candidates=names.map(name=>put(M,game,b,name));
 for(const [name,expected]of [['Suppression Bonds',[false,true,true,true,true]],["Nahiri's Binding",[false,false,true,true,false]],['Planar Disruption',[false,true,true,true,false]]]){
  const source=put(M,game,a,name,'hand'),spec=game.spellTargetSpecs(source,{},a)[0],legal=game.legalTargets(spec,source,a);
  assert.deepEqual(candidates.map(card=>legal.includes(card)),expected,name);
 }
});
test('an activated ability already on the stack resolves after its source is detained',async()=>{
 const f=setup('human'),{game,a,b}=f,target=put(M,game,b,'Shivan Dragon'),source=put(M,game,a,'New Prahv Guildmage');b.pool.R=1;
 const ability=game.activatableList(b).find(row=>row.card===target&&row.ability);assert.equal(await game.activateAbility(b,ability),true);f.selected=[target];
 Object.assign(a.pool,{C:3,W:1,U:1});const detain=game.activatableList(a).find(row=>row.card===source&&row.idx===1);assert.ok(detain);
 assert.equal(await game.activateAbility(a,detain),true);await game.resolveTop();disabled(game,target);
 await settle(game);assert.equal(target.power,6,'detain does not counter an existing activation');
});
