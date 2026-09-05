import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';
import {extensionEffect,extensionLine} from '../scripts/oracle-v8-combat-restrictions.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';
const M=loadEngine(),inputs=JSON.parse(readFileSync(new URL('./fixtures/oracle-combat-assignment.json',import.meta.url)));
const compiled=inputs.map((card,index)=>{
 const semantic=semanticClass(card,{compilerVersion:8});assert.ok(semantic.semanticClass,card.name+': '+semantic.reason);
 const [type,subtypes='']=card.type_line.split(' — '),words=type.split(' ');
 return{position:index+1,oracleId:card.oracle_id,scryfallId:card.id,...semantic,raw:{name:card.name,cost:card.mana_cost,oracle:card.oracle_text,types:words.filter(word=>word!=='Legendary'),super:words.includes('Legendary')?['Legendary']:[],subtypes:subtypes.split(' ').filter(Boolean),power:card.power,toughness:card.toughness,...(card.loyalty!==undefined?{loyalty:card.loyalty}:{}),_ci:card.color_identity},catalog:{typeLine:card.type_line,commanderLegality:'legal'}};
});
const missing=compiled.filter(card=>!M.DEFS[card.raw.name]);
if(missing.length){M.registerOracleBatch({id:'oracle-combat-assignment-test',sequence:9995,cards:missing});M.initData(M.RAW_DATA);}
function setup(role){const f=context(M,role);f.selected=[];
 const original=f.a.controller.decide.bind(f.a.controller);f.a.controller.decide=async(game,q)=>{
  if(!f.a.isAI&&q.type==='chooseTargets'&&f.selected.some(card=>q.candidates.includes(card)))return f.selected.filter(card=>q.candidates.includes(card)).slice(0,q.count||q.max||1);
  return original(game,q);
 };return f;
}
async function cast(f,name){const card=put(M,f.game,f.a,name,'hand');for(const color of ['W','U','B','R','G','C'])f.a.pool[color]=20;
 const before=Object.values(f.a.pool).reduce((a,b)=>a+b,0);assert.equal(await f.game.castSpell(f.a,card,{from:'hand'}),true,name);assert.ok(Object.values(f.a.pool).reduce((a,b)=>a+b,0)<before);await settle(f.game);card.sick=false;return card;
}
function creature(f,owner,power,toughness,name='Grizzly Bears'){const card=put(M,f.game,owner,name);card.def={...card.def,power:String(power),toughness:String(toughness)};f.game.recalc();return card;}
function combat(f,attacker,blockers=[]){const {game,a,b}=f;attacker.sick=false;attacker.attacking=attacker.ctrl===a?b:a;attacker.wasBlocked=!!blockers.length;attacker.blockedBy=blockers;for(const card of blockers)card.blocking=attacker.iid;game.combat={attackers:[attacker],defenders:new Map([[attacker.attacking,[attacker]]])};game.recalc();}
test('17 complete pinned toughness and blocker-count cards compile with exact grammar',()=>{
 assert.equal(compiled.length,17);const c={name:'Assignment Boundary',type_line:'Creature — Beast'},h={target:()=>({what:'creature',zone:'battlefield'})};
 for(const line of ['Each creature assigns combat damage equal to its toughness rather than its power during your turn.','Each creature assigns combat damage equal to its toughness rather than its power and gains trample.'])assert.equal(extensionLine(c,line,h),null);
 for(const line of ['Target creature assigns combat damage equal to its toughness rather than its power until end of combat.','Until end of turn, target creature assigns combat damage equal to its toughness rather than its power this turn.','That creature gets +1/+1 until end of turn for each creature blocking it.'])assert.equal(extensionEffect(c,line,h),null);
 assert.throws(()=>M.OracleV8CombatRestrictions.apply({}, {}, {kind:'assign-toughness',requires:'flying'}),/Invalid/);
});
for(const role of ['human','ai']){
 test(`assignment ${role}: paid Doran changes both sides' simultaneous combat damage and ends on source loss`,async()=>{
  const f=setup(role),{game,a,b}=f,attacker=creature(f,a,2,8),blocker=creature(f,b,1,3);const source=await cast(f,'Doran, the Siege Tower');combat(f,attacker,[blocker]);
  assert.equal(game.dmgAmount(attacker,'normal'),8);assert.equal(game.dmgAmount(blocker,'normal'),3);
  await game.combatDamage(a,'normal');assert.equal(blocker.zone,'graveyard');assert.equal(attacker.damage,3);assert.equal(attacker.zone,'battlefield');
  await game.move(source,'exile');assert.equal(game.dmgAmount(attacker,'normal'),2);assertGameStateInvariants(game);
 });
 test(`assignment ${role}: Ancient Lumberknot evaluates final current power and toughness after later effects`,async()=>{
  const f=setup(role),{game,a,b}=f,card=creature(f,a,2,5),other=creature(f,b,1,4);await cast(f,'Ancient Lumberknot');
  assert.equal(game.dmgAmount(card,'normal'),5);assert.equal(game.dmgAmount(other,'normal'),1);
  const later={expires:'eot',apply:()=>{card.cur.power+=4;}};game.untilEffects.push(later);game.recalc();assert.equal(game.dmgAmount(card,'normal'),6,'later power boost disables conditional toughness assignment');
  game.untilEffects.splice(game.untilEffects.indexOf(later),1);game.recalc();assert.equal(game.dmgAmount(card,'normal'),5);
 });
 test(`assignment ${role}: paid High Alert permits a real defender attack and uses its toughness`,async()=>{
  const f=setup(role),{game,a,b}=f,card=creature(f,a,0,4,'Wall of Wood');await cast(f,'High Alert');
  assert.equal(game.canAttackAtAll(card),true);combat(f,card);await game.combatDamage(a,'normal');assert.equal(b.life,36);
 });
 test(`assignment ${role}: Solid Footing reacts to vigilance gained or lost after attachment`,async()=>{
  const f=setup(role),{game,a}=f,card=creature(f,a,1,4);f.selected=[card];const aura=await cast(f,'Solid Footing');assert.equal(aura.attachedTo,card.iid);
  assert.equal(game.dmgAmount(card,'normal'),2);
  const vigilant={expires:'eot',apply:()=>card.cur.kw.add('vigilance')};game.untilEffects.push(vigilant);game.recalc();assert.equal(game.dmgAmount(card,'normal'),5);
  game.untilEffects.splice(game.untilEffects.indexOf(vigilant),1);game.recalc();assert.equal(game.dmgAmount(card,'normal'),2);
 });
 test(`assignment ${role}: Arcades applies only to creatures with defender and preserves the creature's power outside combat`,async()=>{
  const f=setup(role),{game,a,b}=f,defender=creature(f,a,0,5,'Wall of Wood'),ordinary=creature(f,a,1,4);await cast(f,'Arcades, the Strategist');
  assert.equal(game.canAttackAtAll(defender),true);assert.equal(game.dmgAmount(defender,'normal'),5);assert.equal(game.dmgAmount(ordinary,'normal'),1);assert.equal(defender.power,0);
  const victim=creature(f,b,1,10);assert.equal(await game.damageCreature(defender,victim,defender.power),0);
 });
 test(`blockers ${role}: paid Rabid Elephant counts remaining blockers when its trigger resolves`,async()=>{
  const f=setup(role),{game,a,b}=f,source=await cast(f,'Rabid Elephant'),one=creature(f,b,1,10),two=creature(f,b,1,10);combat(f,source,[one,two]);
  await game.emit('becomesBlocked',{attacker:source,blockers:[one,two]});await game.flushTriggers();assert.equal(game.stack.filter(row=>row.srcCard===source).length,1);
  await game.move(two,'exile');await settle(game);assert.equal(source.power,5);assert.equal(source.toughness,6);
 });
 test(`blockers ${role}: General Marhault binds the blocked event creature, preserving its identity across blink`,async()=>{
  for(const blink of [false,true]){const f=setup(role),{game,a,b}=f,source=await cast(f,'General Marhault Elsdragon'),attacker=creature(f,a,2,7),blocker=creature(f,b,1,15);combat(f,attacker,[blocker]);
   await game.emit('becomesBlocked',{attacker,blockers:[blocker]});await game.flushTriggers();assert.equal(game.stack.filter(row=>row.srcCard===source).length,1);
   if(blink){await game.move(attacker,'exile');await game.move(attacker,'battlefield');}await settle(game);
   assert.equal(attacker.power,blink?2:5);assert.equal(source.power,4,'observer is not the recipient');
  }
 });
}
