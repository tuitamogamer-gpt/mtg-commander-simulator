import test from 'node:test';
import assert from 'node:assert/strict';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
const M=loadEngine();
const rows=[
 ['Conditional Aura','Enchant creature\nAs long as enchanted creature is red, it gets +1/+1 and has "{R}: This creature gets +1/+0 until end of turn."','Enchantment — Aura'],
 ['Alternative Aura',"Enchant creature\nEnchanted creature gets -2/-0. It gets -6/-0 instead as long as its controller has seven or more cards in their graveyard.",'Enchantment — Aura'],
 ['Attacking Tokens','Attacking tokens you control have flying.','Enchantment'],
 ['Zombie Tokens','Zombie tokens you control have deathtouch.','Enchantment'],
 ['Outlaws','Other outlaws you control get +1/+1.','Enchantment'],
 ['Union','As long as you control a land, this creature and land creatures you control get +2/+2.'],
 ['Split Anthem','As long as you control your commander, this creature gets +2/+2 and creatures you control have vigilance.'],
 ['Typed Entry',"When a Dragon you control enters, return this enchantment to its owner's hand.",'Enchantment'],
 ['Keyword Loss','Enchant permanent\nAs long as enchanted permanent is a creature, it gets -3/-0 and loses flying.','Enchantment — Aura'],
].map(([label,oracle_text,type_line='Creature — Elf'],i)=>{const card={name:'Composition Proof '+label,oracle_text,type_line,mana_cost:'{1}',power:'2',toughness:'8',layout:'normal'},semantic=semanticClass(card,{compilerVersion:8});assert.ok(semantic.semanticClass,label+': '+semantic.reason);return {position:i+1,oracleId:'composition-proof-'+i,scryfallId:'composition-print-'+i,...semantic,raw:{name:card.name,cost:card.mana_cost,oracle:oracle_text,types:type_line.split(' — ')[0].split(' '),subtypes:type_line.split(' — ')[1]?.split(' ')||[],super:[],power:'2',toughness:'8',_ci:[]},catalog:{typeLine:type_line,commanderLegality:'legal'}};});
M.registerOracleBatch({id:'oracle-static-composition-fixtures',sequence:9980,cards:rows});M.initData(M.RAW_DATA);
function setup(role){const human={async decide(g,q){if(q.type==='chooseTargets')return q.candidates.slice(0,q.min??1);if(q.type==='chooseCards')return q.from.slice(0,q.min??1);if(q.type==='chooseOption')return q.options[0].key;return null;}};const game=new M.Game({seed:164,paced:false}),a=game.addPlayer('A',{name:'A'},human,role==='ai'),b=game.addPlayer('B',{name:'B'},human,false);if(role==='ai')a.controller=new M.AIController(a,{difficulty:'hard',style:'balanced'});game.turnNo=5;game.turnPlayer=a;game.phase='main1';game.step='main';game.priorityRound=async()=>{};game.spotlight=async()=>{};game.pace=async()=>{};return{game,a,b};}
const fixture=(name,extra={})=>({name,cost:'{1}',types:['Creature'],subtypes:['Elf'],super:[],power:'2',toughness:'8',kws:[],oracle:'',...extra});
function put(ctx,name,player=ctx.a,zone='battlefield'){const card=new M.CardInst(typeof name==='string'?M.DEFS[name]:name,player);card.ctrl=player;card.zone=zone;card.sick=false;if(zone==='battlefield'){ctx.game.battlefield.push(card);ctx.game.recalc();}else player[zone].push(card);return card;}
async function settle(game){for(let i=0;i<30&&(game.pendingTriggers.length||game.stack.length);i++){await game.flushTriggers();if(game.stack.length)await game.resolveTop();}assert.equal(game.pendingTriggers.length+game.stack.length,0);}
for(const role of ['human','ai']){
 test(role+': singular When subtype entry observes actual ownership and returns its source through the Stack',async()=>{
  const ctx=setup(role),{game,a,b}=ctx,source=put(ctx,'Composition Proof Typed Entry'),foreign=put(ctx,fixture('Foreign Dragon',{subtypes:['Dragon']}),b,'hand');await game.move(foreign,'battlefield');await settle(game);assert.equal(source.zone,'battlefield');const other=put(ctx,fixture('Own other'),a,'hand');await game.move(other,'battlefield');await settle(game);assert.equal(source.zone,'battlefield');const dragon=put(ctx,fixture('Own Dragon',{subtypes:['Dragon']}),a,'hand');await game.move(dragon,'battlefield');assert.equal(source.zone,'battlefield');assert.equal(game.pendingTriggers.length,1);await settle(game);assert.equal(source.zone,'hand');assert.equal(source.owner===a,true);
 });
 test(role+': conditional Aura grants the host a paid ability; removing its condition or Aura does not erase an already activated ability',async()=>{
  const ctx=setup(role),{game,a,b}=ctx,host=put(ctx,fixture('Red host',{colorsOverride:['R']}),a),aura=put(ctx,'Composition Proof Conditional Aura',b);await game.attach(aura,host);assert.equal(host.power,3);assert.equal(host.cur.extraAbilities.length,1);assert.equal(game.activatableList(b).some(row=>row.card===host),false);
  a.pool.R=1;const action=game.activatableList(a).find(row=>row.card===host);assert.ok(action);assert.equal(await game.activateAbility(a,action),true);assert.equal(a.pool.R,0);game.addOracleCharacteristics([host],{characteristic:'color',colors:['G'],retain:false});assert.equal(host.power,2);assert.equal(host.cur.extraAbilities.length,0);await game.move(aura,'exile');await settle(game);assert.equal(host.power,3,'the activated ability uses the recipient as source even after the grant ends');
 });
 test(role+': replacement Aura stats count the enchanted creature controller graveyard and switch as that count changes',async()=>{
  const ctx=setup(role),{game,a,b}=ctx,host=put(ctx,fixture('Large host',{power:'8',toughness:'20'}),b),aura=put(ctx,'Composition Proof Alternative Aura',a);await game.attach(aura,host);for(let i=0;i<7;i++)put(ctx,fixture('Wrong grave '+i),a,'graveyard');game.recalc();assert.equal(host.power,6,'Aura controller graveyard is irrelevant');const graves=[];for(let i=0;i<7;i++)graves.push(put(ctx,fixture('Host grave '+i),b,'graveyard'));game.recalc();assert.equal(host.power,2);await game.move(graves[0],'exile');assert.equal(host.power,6);await game.move(aura,'exile');assert.equal(host.power,8);
 });
 test(role+': actual declaration grants flying only to attacking tokens and removes it when combat ends',async()=>{
  const ctx=setup(role),{game,a,b}=ctx;put(ctx,'Composition Proof Attacking Tokens');const token=put(ctx,fixture('Attacking token')),nontoken=put(ctx,fixture('Nontoken attacker'));token.isToken=true;
  if(role==='human'){const original=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='attackers'?Promise.resolve([token,nontoken].map(card=>({card,target:b}))):q.type==='blockers'?Promise.resolve([]):original(g,q);}
  let checked=false;const emit=game.emit.bind(game);game.emit=async(event,data)=>{if(event==='attackersDeclared'){assert.ok(data.attackers.includes(token));assert.equal(token.kw('flying'),true);assert.equal(nontoken.kw('flying'),false);checked=true;}return emit(event,data);};game.reviewCombatWithHuman=async()=>{};await game.combatPhase(a);assert.equal(checked,true);assert.equal(token.kw('flying'),false);assert.equal(token.attacking,null);
 });
 test(role+': subtype token scopes include noncreature tokens and union scopes do not double count matching outlaws',async()=>{
  const ctx=setup(role),{game,a,b}=ctx,zombie=put(ctx,fixture('Zombie artifact',{types:['Kindred','Artifact'],subtypes:['Zombie']})),creature=put(ctx,fixture('Zombie creature',{subtypes:['Zombie']})),outlaw=put(ctx,fixture('Two outlaw types',{subtypes:['Pirate','Rogue']}));zombie.isToken=true;put(ctx,'Composition Proof Zombie Tokens');put(ctx,'Composition Proof Outlaws');assert.equal(zombie.kw('deathtouch'),true);assert.equal(creature.kw('deathtouch'),false);assert.equal(outlaw.power,3,'two matching outlaw types grant the same +1 only once');M.OracleV8Control.gain(game,outlaw,b);game.recalc();assert.equal(outlaw.power,2);
 });
 test(role+': self plus a matching creature group applies once to the source and follows continuous controller changes',async()=>{
  const ctx=setup(role),{game,a,b}=ctx,source=put(ctx,'Composition Proof Union'),land=put(ctx,fixture('Land creature',{types:['Land','Creature']})),bear=put(ctx,fixture('Other creature'));game.addOracleAnimation(source,{types:['Land','Creature'],subtypes:[],power:2,toughness:8,keywords:[],colors:null,retainTypes:true,temporary:true});assert.equal(source.power,4,'self also qualifies for land-creature group but gets +2 once');assert.equal(land.power,4);assert.equal(bear.power,2);M.OracleV8Control.gain(game,source,b);game.recalc();assert.equal(source.power,4);assert.equal(land.power,2);
 });
 test(role+': one condition governs both parts of a joined anthem and attached keyword loss is live',async()=>{
  const ctx=setup(role),{game,a}=ctx,source=put(ctx,'Composition Proof Split Anthem'),other=put(ctx,fixture('Other'));assert.equal(source.power,2);assert.equal(other.kw('vigilance'),false);const commander=put(ctx,fixture('Actual commander'));commander.commander=true;game.recalc();assert.equal(source.power,4);assert.equal(source.kw('vigilance'),true);assert.equal(other.kw('vigilance'),true);await game.move(commander,'exile');assert.equal(source.power,2);assert.equal(other.kw('vigilance'),false);
  other.def={...other.def,kws:['flying']};game.recalc();const aura=put(ctx,'Composition Proof Keyword Loss');await game.attach(aura,other);assert.equal(other.kw('flying'),false);assert.equal(other.power,-1);await game.move(aura,'exile');assert.equal(other.kw('flying'),true);assert.equal(other.power,2);
 });
}
