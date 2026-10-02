import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {semanticClass,createImportPlan} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v21-permanents.json',import.meta.url),'utf8'));
const M=loadEngine(),absent=rows.filter(card=>!M.DEFS[card.name]);
const plan=createImportPlan({cards:absent,bulk:{type:'oracle_cards'},sequence:9949,limit:absent.length,compilerVersion:21});
assert.equal(plan.report.cards.length,absent.length,absent.filter(card=>!plan.report.cards.some(row=>row.raw.name===card.name)).map(card=>[card.name,semanticClass(card,{compilerVersion:21})]));
M.registerOracleBatch(plan.report);M.initData(M.RAW_DATA);
const choose=(p,fn)=>{const prior=p.controller.decide.bind(p.controller);p.controller.decide=(g,q)=>fn(g,q)??prior(g,q);};
const fund=p=>{for(const color of ['W','U','B','R','G','C'])p.pool[color]=30;};
const witness=(game,player,power,zone='battlefield',cost='{G}')=>{const card=new M.CardInst({...M.DEFS['Grizzly Bears'],name:'V21 event witness',cost,power:String(power),toughness:'20',colorsOverride:['G']},player);card.zone=zone;card.sick=false;if(zone==='battlefield'){game.battlefield.push(card);game.recalc();}else player[zone].push(card);return card;};
test('v21 complete permanent clauses retain rejection of an unknown continuation',()=>{
 for(const card of rows){assert.ok(semanticClass(card,{compilerVersion:21}).semanticClass,card.name);assert.equal(semanticClass({...card,oracle_text:card.oracle_text+'\nDo an unsupported thing.'},{compilerVersion:21}).semanticClass,undefined,card.name);}
});
test('v21 event comparisons reject target-pronoun use without a matching event scope',()=>{
 const pelt=rows.find(card=>card.name==='Pelt Collector'),apprentice=rows.find(card=>card.name==='Prismari Apprentice');
 assert.equal(semanticClass({...pelt,oracle_text:"{T}: Put a +1/+1 counter on this creature. If that creature's power is greater than this creature's power, put another +1/+1 counter on this creature."},{compilerVersion:21}).semanticClass,undefined);
 assert.equal(semanticClass({...apprentice,oracle_text:"Whenever you cast a creature spell, this creature can't be blocked this turn. If that spell has mana value 5 or greater, put a +1/+1 counter on this creature."},{compilerVersion:21}).semanticClass,undefined);
});
for(const role of ['human','ai']){
 test(role+': up-to-one modal triggers may announce no mode and lock the chosen normal mode',async()=>{
  const f=context(M,role),{game,a,b}=f,geist=put(M,game,a,'Dreamshackle Geist'),victim=put(M,game,b,'Grizzly Bears');
  choose(a,(g,q)=>q.type==='chooseOption'&&q.options.some(row=>row.label==='Choose no mode')?q.options.find(row=>row.label==='Choose no mode').key:undefined);
  await game.emit('beginCombat',{player:a});await settle(game);assert.equal(victim.tapped,false);assert.equal(geist.tapped,false);
  choose(a,(g,q)=>q.type==='chooseOption'&&q.options.some(row=>row.label==='Tap target creature.')?q.options.find(row=>row.label==='Tap target creature.').key:q.type==='chooseTargets'&&q.candidates.includes(victim)?[victim]:undefined);
  await game.emit('beginCombat',{player:a});await game.flushTriggers();assert.equal(victim.tapped,false,'tap waits for stack resolution');await settle(game);assert.equal(victim.tapped,true);assertGameStateInvariants(game);
 });
 test(role+': fixed hand limits combine live counters, additions, source timestamps and no-limit effects',async()=>{
  const f=context(M,role),{game,a}=f,oil=put(M,game,a,'Midnight Oil');oil.timestamp=game.nextOracleTimestamp();game.addCounters(oil,'hour',4);assert.equal(game.maximumHandSize(a),4);
  const profusion=put(M,game,a,'Null Profusion');profusion.timestamp=game.nextOracleTimestamp();assert.equal(game.maximumHandSize(a),2);
  const tower=put(M,game,a,'Reliquary Tower');assert.equal(game.maximumHandSize(a),Infinity);await game.move(tower,'graveyard');assert.equal(game.maximumHandSize(a),2);
  await game.move(profusion,'graveyard');assert.equal(game.maximumHandSize(a),4);game.removeCounters(oil,'hour',2);assert.equal(game.maximumHandSize(a),2);M.OracleV8AbilityLoss.add(game,[oil],{});assert.equal(game.maximumHandSize(a),7);assertGameStateInvariants(game);
 });
 test(role+': conditional additional land permission follows live Elf control and stops after the source leaves',async()=>{
  const f=context(M,role),{game,a,b}=f,source=put(M,game,a,"Thranduil's Company");assert.equal(game.landPlayLimit(a),1);
  const elf=put(M,game,a,'Llanowar Elves');assert.equal(game.landPlayLimit(a),2);M.OracleV8Control.gain(game,elf,b,{});game.recalc();assert.equal(game.landPlayLimit(a),1);M.OracleV8Control.gain(game,elf,a,{});game.recalc();assert.equal(game.landPlayLimit(a),2);await game.move(source,'graveyard');assert.equal(game.landPlayLimit(a),1);assertGameStateInvariants(game);
 });
 test(role+': Aura attack restrictions use its live controller and include that controller\'s planeswalkers',async()=>{
  const f=context(M,role),{game,a,b,others}=context(M,role,2);fund(a);const victim=put(M,game,b,'Grizzly Bears'),walker=put(M,game,a,'Jace Beleren'),aura=put(M,game,a,'Vow of Torment','hand');
  choose(a,(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(victim)?[victim]:undefined);assert.equal(await game.castSpell(a,aura,{from:'hand'}),true);await settle(game);assert.equal(victim.power,4);assert.equal(victim.kw('menace'),true);assert.equal(game.canAttackTarget(victim,a),false);assert.equal(game.canAttackTarget(victim,walker),false);assert.equal(game.canAttackTarget(victim,others[1]),true);M.OracleV8Control.gain(game,aura,others[1],{});game.recalc();assert.equal(game.canAttackTarget(victim,a),true);assert.equal(game.canAttackTarget(victim,others[1]),false);assertGameStateInvariants(game);
 });
 test(role+': conditional forms preserve layer order and restore printed forms as their condition changes',async()=>{
  const f=context(M,role),{game,a,b}=f,druid=put(M,game,a,'Circle of the Moon Druid'),operative=put(M,game,a,'Futurist Operative'),warden=put(M,game,a,'Warden of the Wall');
  assert.equal(druid.power,4);assert.equal(druid.hasSub('Bear'),true);assert.equal(druid.hasSub('Druid'),false);assert.equal(warden.is('Creature'),false);game.tap(operative);game.recalc();assert.equal(operative.power,1);assert.equal(operative.hasSub('Citizen'),true);assert.equal(operative.hasSub('Ninja'),false);assert.equal(operative.cur.unblockable,true);
  game.addOracleBasePT(operative,{power:6,toughness:7,temporary:true});assert.equal(operative.power,6);game.untap(operative);game.recalc();assert.equal(operative.hasSub('Ninja'),true);assert.equal(operative.cur.unblockable,false);game.turnPlayer=b;game.recalc();assert.equal(druid.hasSub('Druid'),true);assert.equal(warden.is('Creature'),true);assert.equal(warden.hasSub('Gargoyle'),true);assert.equal(warden.kw('flying'),true);assert.equal(warden.power,2);assertGameStateInvariants(game);
 });
 test(role+': a keyword instruction chooses on resolution and grants the chosen keyword to the current group',async()=>{
  const f=context(M,role),{game,a,b}=f,angel=put(M,game,a,'Angelic Skirmisher');await game.emit('beginCombat',{player:b});await game.flushTriggers();const newcomer=put(M,game,a,'Grizzly Bears');assert.equal(newcomer.kw('lifelink'),false);choose(a,(g,q)=>q.type==='chooseOption'&&q.options.some(row=>row.key==='lifelink')?'lifelink':undefined);await settle(game);assert.equal(angel.kw('lifelink'),true);assert.equal(newcomer.kw('lifelink'),true);assertGameStateInvariants(game);
 });
 test(role+': a quoted Equipment grant uses its host as source and controller, alongside type and power modifiers',async()=>{
  const f=context(M,role),{game,a,b}=f,host=put(M,game,a,'Grizzly Bears'),rod=put(M,game,b,"Black Mage's Rod");assert.equal(await game.attach(rod,host),true);assert.equal(host.hasSub('Wizard'),true);assert.equal(host.hasSub('Bear'),true);assert.equal(host.power,3);fund(a);const spell=put(M,game,a,'Opt','hand'),life=b.life;assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);await settle(game);assert.equal(b.life,life-1,'host controller receives the granted cast trigger');await game.move(rod,'hand');assert.equal(host.hasSub('Wizard'),false);assert.equal(host.power,2);assert.equal(host.cur.extraTriggers.length,0);assertGameStateInvariants(game);
 });
 test(role+': event comparisons check the exact stat twice and use departed event last known information',async()=>{
  const {game,a}=context(M,role),source=put(M,game,a,'Pelt Collector'),small=witness(game,a,1);await game.handleETB(small,{});await settle(game);assert.equal(source.counters['+1/+1']||0,0,'equal power never triggers');
  const larger=witness(game,a,2);await game.handleETB(larger,{});await game.flushTriggers();assert.equal(game.stack.length,1);game.addCounters(source,'+1/+1',1);await settle(game);assert.equal(source.counters['+1/+1'],1,'intervening condition compares again on resolution');
  const dying=witness(game,a,4);await game.destroy(dying);await game.flushTriggers();assert.equal(game.stack.length,1,'death compares the departed creature power');await game.putPermanentOntoBattlefield(dying,a);game.addCounters(dying,'-1/-1',3);await game.flushTriggers();await settle(game);assert.equal(source.counters['+1/+1'],2,'death retains the old incarnation power');assertGameStateInvariants(game);
 });
 test(role+': a later event comparison sees the counter put on the source by the preceding instruction',async()=>{
  const {game,a}=context(M,role);fund(a);const source=put(M,game,a,'Yorvo, Lord of Garenbrig','hand');assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await settle(game);assert.equal(source.counters['+1/+1'],4);
  const equal=witness(game,a,5);await game.handleETB(equal,{});await settle(game);assert.equal(source.counters['+1/+1'],5,'the first counter makes equal power fail the second instruction');
  const bigger=witness(game,a,7);await game.handleETB(bigger,{});await settle(game);assert.equal(source.counters['+1/+1'],7,'larger power receives both counters');assertGameStateInvariants(game);
 });
 test(role+': spell mana comparisons retain copied spell mana value without casting the copy',async()=>{
  const {game,a}=context(M,role),source=put(M,game,a,'Prismari Apprentice');fund(a);
  for(const n of [1,5]){const card=new M.CardInst({...M.DEFS['Opt'],name:'V21 mana-value witness',cost:'{'+n+'}',resolve:async()=>{}},a);card.zone='hand';a.hand.push(card);assert.equal(await game.castSpell(a,card,{from:'hand'}),true);await game.flushTriggers();const original=game.stack.find(row=>row.card===card&&row.kind==='spell');if(n===5){assert.ok(original);const copies=await game.copySpellBatch(original,a,[{}]);assert.equal(copies.length,1);assert.equal(copies[0].isCopy,true);}await settle(game);assert.equal(source.cur.unblockable,true);assert.equal(source.counters['+1/+1']||0,n===1?0:2);}
  assertGameStateInvariants(game);
 });
 test(role+': attached ability loss and untap-step restrictions end when the Aura leaves',async()=>{
  const {game,a,b}=context(M,role),host=put(M,game,b,'Serra Angel'),aura=put(M,game,a,'Stop Cold','hand');fund(a);choose(a,(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(host)?[host]:undefined);assert.equal(await game.castSpell(a,aura,{from:'hand'}),true);await settle(game);assert.equal(host.tapped,true);assert.equal(host.kw('flying'),false);assert.equal(host.kw('vigilance'),false);game.turnPlayer=b;await game.runBeginningPhase(b);assert.equal(host.tapped,true,'real untap step obeys the Aura');assert.equal(game.untap(host),true,'the printed step restriction allows another untap effect');game.tap(host);await game.move(aura,'exile');assert.equal(host.kw('flying'),true);await game.runBeginningPhase(b);assert.equal(host.tapped,false);assertGameStateInvariants(game);
 });
}
