import test from 'node:test';
import assert from 'node:assert/strict';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
const M=loadEngine();
const rows=[
 ['Demon','Enchant creature\nEnchanted creature gets +2/+2, has flying, and is a Demon in addition to its other types.\nWhen this Aura enters, non-Demon creatures get -2/-2 until end of turn.','Enchantment — Aura'],
 ['Color','As long as there are seven or more cards in your graveyard, this creature gets +1/+1, is black, and has "{2}{B}, {T}: Destroy target blue creature."'],
 ['All Types','As long as there are two or more creature cards in your graveyard, this creature gets +2/+2 and is all creature types.'],
 ['Toughness','Creatures your opponents control have base toughness 1.'],
 ['Archon','Non-Archon creatures have base power and toughness 3/3.','Creature — Archon'],
 ['Juggernauts','Other creatures you control have base power and toughness 5/3 and are Juggernauts in addition to their other creature types.'],
 ['Angels','Creatures you control with +1/+1 counters on them have base power and toughness 4/4, have flying, and are Angels in addition to their other types.','Enchantment'],
 ['Auras','As long as this creature is enchanted by exactly one Aura, it has base power and toughness 3/3.\nAs long as this creature is enchanted by exactly two Auras, it has base power and toughness 5/5 and vigilance.\nAs long as this creature is enchanted by three or more Auras, it has base power and toughness 10/10, vigilance, and trample.'],
].map(([label,oracle_text,type_line='Creature — Elf'],i)=>{const card={name:'Layered Proof '+label,oracle_text,type_line,mana_cost:'{1}',power:'2',toughness:'8',layout:'normal'},semantic=semanticClass(card,{compilerVersion:8});assert.ok(semantic.semanticClass,label+': '+semantic.reason);return {position:i+1,oracleId:'layered-proof-'+i,scryfallId:'layered-print-'+i,...semantic,raw:{name:card.name,cost:card.mana_cost,oracle:oracle_text,types:type_line.split(' — ')[0].split(' '),subtypes:type_line.split(' — ')[1]?.split(' ')||[],super:[],power:'2',toughness:'8',_ci:[]},catalog:{typeLine:type_line,commanderLegality:'legal'}};});
M.registerOracleBatch({id:'oracle-layered-static-fixtures',sequence:9981,cards:rows});M.initData(M.RAW_DATA);
function setup(role){const human={async decide(g,q){if(q.type==='chooseTargets')return q.candidates.slice(0,q.min??1);if(q.type==='chooseCards')return q.from.slice(0,q.min??1);if(q.type==='chooseOption')return q.options[0].key;return null;}};const game=new M.Game({seed:164,paced:false}),a=game.addPlayer('A',{name:'A'},human,role==='ai'),b=game.addPlayer('B',{name:'B'},human,false);if(role==='ai')a.controller=new M.AIController(a,{difficulty:'hard',style:'balanced'});game.turnNo=5;game.turnPlayer=a;game.phase='main1';game.step='main';game.priorityRound=async()=>{};game.spotlight=async()=>{};game.pace=async()=>{};return{game,a,b};}
const fixture=(name,extra={})=>({name,cost:'{1}',types:['Creature'],subtypes:['Elf'],super:[],power:'2',toughness:'8',kws:[],oracle:'',...extra});
function put(ctx,name,player=ctx.a,zone='battlefield'){const card=new M.CardInst(typeof name==='string'?M.DEFS[name]:name,player);card.ctrl=player;card.zone=zone;card.sick=false;if(zone==='battlefield'){ctx.game.battlefield.push(card);ctx.game.recalc();}else player[zone].push(card);return card;}
async function settle(game){for(let i=0;i<30&&(game.pendingTriggers.length||game.stack.length);i++){await game.flushTriggers();if(game.stack.length)await game.resolveTop();}assert.equal(game.pendingTriggers.length+game.stack.length,0);}
for(const role of ['human','ai']){
 test(role+': Aura changes its host type before its actual ETB trigger, preserves prior types, and follows attachment movement',async()=>{
  const ctx=setup(role),{game,a}=ctx,host=put(ctx,fixture('Host')),aura=put(ctx,'Layered Proof Demon',a,'hand');a.pool.C=1;assert.equal(await game.castSpell(a,aura,{from:'hand'}),true);await settle(game);assert.equal(host.power,4);assert.equal(host.hasSub('Demon'),true);assert.equal(host.hasSub('Elf'),true);assert.equal(host.kw('flying'),true);
  const other=put(ctx,fixture('Other'));await game.attach(aura,other);assert.equal(host.hasSub('Demon'),false);assert.equal(host.power,2);assert.equal(other.power,4);assert.equal(other.hasSub('Demon'),true);await game.move(aura,'graveyard');assert.equal(other.hasSub('Demon'),false);assert.equal(other.power,2);
 });
 test(role+': type/color effect continues its P/T part after source ability loss, while later layer-6 removal suppresses earlier granted abilities',async()=>{
  const ctx=setup(role),{game,a,b}=ctx,source=put(ctx,'Layered Proof Color');const graves=Array.from({length:7},(_,i)=>put(ctx,fixture('Threshold '+i),a,'graveyard'));game.recalc();assert.deepEqual(Array.from(source.colors),['B']);assert.equal(source.power,3);assert.equal(source.cur.extraAbilities.length,1);
  const target=put(ctx,fixture('Blue target',{colorsOverride:['U']}),b);a.pool.C=2;a.pool.B=1;const action=game.activatableList(a).find(row=>row.card===source&&source.cur.extraAbilities.includes(row.ability));assert.ok(action);assert.equal(await game.activateAbility(a,action),true);await settle(game);assert.equal(target.zone,'graveyard');
  const aura=put(ctx,'Lignify');await game.attach(aura,source);assert.equal(source.cur.abilitiesDisabled,true);assert.deepEqual(Array.from(source.colors),['B']);assert.equal(source.power,1,'0 base plus the continuing +1/+1 part');assert.equal(source.toughness,5);assert.equal(source.cur.extraAbilities.length,0,'later ability removal wins layer 6');
  await game.move(graves[0],'exile');assert.equal(source.power,0);assert.equal(source.colors.length,0);await game.move(aura,'exile');assert.equal(source.power,2);assert.equal(source.cur.extraAbilities.length,0);
 });
 test(role+': later Aura grants survive earlier Lignify and earlier Aura grants lose to later Lignify in the proper layers',async()=>{
  const ctx=setup(role),{game}=ctx,host=put(ctx,fixture('Layer host')),lignify=put(ctx,'Lignify');await game.attach(lignify,host);const aura=put(ctx,'Layered Proof Demon');await game.attach(aura,host);assert.equal(host.hasSub('Treefolk'),true);assert.equal(host.hasSub('Demon'),true);assert.equal(host.power,2);assert.equal(host.kw('flying'),true);
  await game.move(lignify,'hand');await game.move(lignify,'battlefield',{attachTo:host});assert.equal(host.hasSub('Demon'),false);assert.equal(host.hasSub('Treefolk'),true);assert.equal(host.power,2,'the continuing P/T modifier remains');assert.equal(host.kw('flying'),false,'newer layer-6 removal wins');
 });
 test(role+': setting toughness alone preserves power and follows source control; a later animation takes timestamp precedence',async()=>{
  const ctx=setup(role),{game,a,b}=ctx,source=put(ctx,'Layered Proof Toughness'),host=put(ctx,fixture('Foreign host',{power:'7',toughness:'8'}),b);game.addCounters(host,'+1/+1',2);assert.equal(host.power,9);assert.equal(host.toughness,3);
  game.addOracleAnimation(host,{types:['Creature'],subtypes:['Bird'],power:4,toughness:6,keywords:[],colors:null,retainTypes:true,temporary:true});assert.equal(host.power,6);assert.equal(host.toughness,8);
  await game.move(source,'exile');await game.move(source,'battlefield');assert.equal(host.power,6);assert.equal(host.toughness,3,'newly entered static has later timestamp');M.OracleV8Control.gain(game,source,b);game.recalc();assert.equal(host.toughness,8);assert.equal(source.ctrl===b,true);assert.equal(a.life,40);
 });
 test(role+': type and base-stat grant uses the same eligible recipients and counters still apply afterward',async()=>{
  const ctx=setup(role),{game,a,b}=ctx,source=put(ctx,'Layered Proof Angels'),host=put(ctx,fixture('Counter host')),foreign=put(ctx,fixture('Foreign counter host'),b);game.addCounters(foreign,'+1/+1',1);assert.equal(foreign.hasSub('Angel'),false);game.addCounters(host,'+1/+1',1);assert.equal(host.power,5);assert.equal(host.toughness,5);assert.equal(host.hasSub('Elf'),true);assert.equal(host.hasSub('Angel'),true);assert.equal(host.kw('flying'),true);
  game.removeCounters(host,'+1/+1',1);assert.equal(host.power,2);assert.equal(host.hasSub('Angel'),false);assert.equal(host.kw('flying'),false);
  const jugger=put(ctx,'Layered Proof Juggernauts');assert.equal(host.cur.basePower,5);assert.equal(host.hasSub('Juggernaut'),true);assert.equal(jugger.cur.basePower,2);await game.move(jugger,'graveyard');assert.equal(host.power,2);assert.equal(host.hasSub('Juggernaut'),false);
 });
 test(role+': legacy base-setting effects share timestamp order with the continuing base-stat part',async()=>{
  const ctx=setup(role),{game}=ctx,source=put(ctx,'Layered Proof Angels'),host=put(ctx,fixture('Layer seven host'));game.addCounters(host,'+1/+1',1);assert.equal(host.power,5);
  const lignify=put(ctx,'Lignify');await game.attach(lignify,host);assert.equal(host.cur.basePower,0);assert.equal(host.cur.baseToughness,4);assert.equal(host.power,1);assert.equal(host.kw('flying'),false);
  await game.move(source,'exile');await game.move(source,'battlefield');assert.equal(host.cur.basePower,4);assert.equal(host.cur.baseToughness,4);assert.equal(host.power,5);assert.equal(host.kw('flying'),true);assert.equal(host.hasSub('Treefolk'),true);assert.equal(host.hasSub('Angel'),true);
 });
 test(role+': repeated copies retain independent recipients and a conditional source cannot reuse an earlier calculation',async()=>{
  const ctx=setup(role),{game,a,b}=ctx,host=put(ctx,fixture('First host')),other=put(ctx,fixture('Second host'),b),one=put(ctx,'Layered Proof Demon'),two=put(ctx,'Layered Proof Demon',b);
  await game.attach(one,host);await game.attach(two,other);assert.equal(host.power,4);assert.equal(other.power,4);await game.move(one,'exile');assert.equal(host.power,2);assert.equal(other.power,4);
  const source=put(ctx,'Layered Proof Color'),graves=[];for(let i=0;i<7;i++)graves.push(put(ctx,fixture('Threshold again '+i),a,'graveyard'));game.recalc();assert.equal(source.power,3);await game.move(graves[0],'exile');assert.equal(source.power,2,'an earlier calculation cannot leak past its condition');assert.equal(source.colors.length,0);assert.equal(source.cur.extraAbilities.length,0);
 });
 test(role+': exact Aura counts move between three continuous P/T bands and all-type conditions reset with graveyard changes',async()=>{
  const ctx=setup(role),{game,a}=ctx,source=put(ctx,'Layered Proof Auras'),auras=[];
  for(let i=0;i<3;i++){const aura=put(ctx,fixture('Counting Aura '+i,{types:['Enchantment'],subtypes:['Aura']}));await game.attach(aura,source);auras.push(aura);assert.equal(source.power,[3,5,10][i]);}
  assert.equal(source.kw('trample'),true);await game.move(auras[0],'graveyard');assert.equal(source.power,5);assert.equal(source.kw('trample'),false);await game.move(auras[1],'graveyard');assert.equal(source.power,3);assert.equal(source.kw('vigilance'),false);
  const shape=put(ctx,'Layered Proof All Types'),c1=put(ctx,fixture('Dead one'),a,'graveyard'),c2=put(ctx,fixture('Dead two'),a,'graveyard');game.recalc();assert.equal(shape.hasSub('Brushwagg'),true);assert.equal(shape.hasSub('Equipment'),false);assert.equal(shape.power,4);await game.move(c1,'exile');assert.equal(shape.hasSub('Brushwagg'),false);assert.equal(shape.power,2);
 });
}
