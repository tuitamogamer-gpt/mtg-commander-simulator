import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createImportPlan,semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
const cards=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-variable-counter-costs.json',import.meta.url))),M=loadEngine();
const missing=cards.filter(card=>!M.DEFS[card.name]);
if(missing.length){const {report}=createImportPlan({cards:missing,bulk:{type:'oracle_cards'},baseNames:new Set(),sequence:9993,limit:missing.length});M.registerOracleBatch(report);M.initData(M.RAW_DATA);}
function fund(player,mana,x=0){const cost=M.parseCost(mana||'');player.pool.C+=cost.generic+cost.x*x;for(const pip of cost.pips)player.pool[pip.find(c=>'WUBRGC'.includes(c))]++;}
async function cast(c,name){
 const source=put(M,c.game,c.a,name,'hand'),x=name==='Chamber Sentry'?3:0;
 if(x){c.a.pool.W=1;c.a.pool.U=1;c.a.pool.G=1;}else fund(c.a,source.def.cost);
 if(!c.a.isAI){const decide=c.a.controller.decide.bind(c.a.controller);c.a.controller.decide=(g,q)=>q.type==='chooseX'&&!q.aiHint?.counterPayment?x:decide(g,q);}
 assert.equal(await c.game.castSpell(c.a,source,{from:'hand'}),true,name+': printed spell cast');await settle(c.game);assert.equal(source.zone,'battlefield');assert.equal(Object.values(c.a.pool).reduce((n,x)=>n+x,0),0);source.sick=false;return source;
}
function chooseHuman(c,targets,n=2){if(c.a.isAI)return;const decide=c.a.controller.decide.bind(c.a.controller);c.a.controller.decide=(g,q)=>{if(q.type==='chooseX'&&q.aiHint?.counterPayment||q.type==='chooseTargets'){const result=q.type==='chooseX'?n:targets.filter(card=>q.candidates.includes(card)).slice(0,q.min||1);c.trace.push({q,result});return result;}return decide(g,q);};}
function variableAbility(c,source){return c.game.activatableList(c.a).find(row=>row.card===source&&typeof row.ability?.cost?.oracleCounterPayment?.n==='string');}
for(const role of ['human','ai'])for(const card of cards)test(`${role}: ${card.name} pays the printed variable counter cost before its source effect resolves`,async()=>{
 const c=context(M,role),source=await cast(c,card.name),operation=semanticClass(card).implementation.find(op=>op.kind==='generic-ability'&&typeof op.cost?.oracleCounterPayment?.n==='string');assert.ok(operation,card.name);
 const info=operation.cost.oracleCounterPayment,kind=info.kinds[0];c.game.addCounters(source,kind,Math.max(0,3-(source.counters[kind]||0)));
 const enemies=Array.from({length:3},(_,i)=>put(M,c.game,c.b,card.name==='Quillmane Baku'?'Grizzly Bears':'Colossal Dreadmaw'));
 for(const enemy of enemies)enemy.attacking=c.a;
 chooseHuman(c,enemies);fund(c.a,operation.cost.mana,3);
 const action=variableAbility(c,source);assert.ok(action,card.name+': legal real activation');const initialPower=source.power,initialLife=c.a.life,initialBattlefield=c.game.bf().slice(),beforeMana=Object.values(c.a.pool).reduce((sum,n)=>sum+n,0),removed=[];
 const remove=c.game.removeCounters;c.game.removeCounters=function(card,kind,n){const before=card.counters[kind]||0,result=remove.call(this,card,kind,n);removed.push({card,kind,n,before,after:card.counters[kind]||0});return result;};
 assert.equal(await c.game.activateAbility(c.a,action),true,card.name+': ability activated');
 const stack=c.game.stack.find(row=>row.srcCard===source&&row.ctx?.oracleCounterPayment);assert.ok(stack,card.name+': real paid ability on Stack');
 const payment=stack.ctx.oracleCounterPayment,n=info.n==='all'?3:role==='ai'?3:2;assert.equal(payment.length,1);assert.equal(payment[0].n,n);assert.equal(payment[0].kind,kind);assert.ok(removed.some(row=>row.card===source&&row.kind===kind&&row.n===n&&row.before-row.after===n));
 const cost=M.parseCost(operation.cost.mana||'');assert.equal(beforeMana-Object.values(c.a.pool).reduce((sum,n)=>sum+n,0),cost.generic+cost.pips.length+cost.x*n);if(operation.cost.tap){if(source.zone==='battlefield')assert.equal(source.tapped,true);else{assert.equal(source.zone,'graveyard');assert.equal(source.battlefieldLKI.get(stack.ctx.sourceZoneVersion)?.tapped,true,'zero-toughness source paid its tap cost before the SBA death');}}
 const selected=stack.ctx.targets.flat(Infinity),beforeTargets=selected.map(target=>({target,damage:target.damage,life:target.life,power:target.power,toughness:target.toughness}));
 await settle(c.game);
 if(card.name==='Waxmane Baku'){assert.equal(selected.length,n);for(const target of selected)assert.equal(target.tapped,true);}
 else if(card.name==='Quillmane Baku')assert.equal(selected[0].zone,'hand');
 else if(['Skullmane Baku','Infused Arrows','Vish Kal, Blood Arbiter'].includes(card.name)){assert.equal(selected[0].power,beforeTargets[0].power-n);assert.equal(selected[0].toughness,beforeTargets[0].toughness-n);}
 else if(card.name==='Blademane Baku')assert.equal(source.power,initialPower+2*n);
 else if(card.name==='Essence Bottle')assert.equal(c.a.life,initialLife+2*n);
 else if(card.name==='The Astonishing Ant-Man'){const tokens=c.game.bf().filter(card=>!initialBattlefield.includes(card)&&card.isToken);assert.equal(tokens.length,n);for(const token of tokens){assert.equal(token.hasSub('Insect'),true);assert.equal(token.power,1);assert.equal(token.toughness,1);}}
 else{for(const row of beforeTargets){if(row.target instanceof M.Player)assert.equal(row.target.life,row.life-n);else assert.equal(row.target.damage,row.damage+n);}}
 if(operation.cost.oracleCounterPayment.n==='X')assert.ok(c.trace.some(row=>row.q.type==='chooseX'&&row.q.aiHint?.counterPayment&&row.result===n));
});
test('variable cost grammar rejects multiple sources, mixed types, foreign X and mana abilities',()=>{
 for(const oracle of [
  'Remove X +1/+1 counters from among creatures you control: Target creature gets -X/-X until end of turn.',
  'Remove X charge or ki counters from this artifact: Draw X cards.',
  'Remove all charge counters from this artifact: Draw X cards.',
  'Remove X charge counters from this artifact: Draw X cards.\nWhen this artifact enters, draw X cards.',
  'Remove X charge counters from this artifact: Add X mana of any one color.',
  '{X}, Remove all charge counters from this artifact: Draw X cards.',
 ])assert.equal(!!semanticClass({name:'Boundary',layout:'normal',type_line:'Artifact',mana_cost:'{1}',oracle_text:oracle,keywords:[]}).semanticClass,false,oracle);
});

for(const role of ['human','ai'])for(const change of ['blink','phase','controller'])test(`${role}: ${change} during the announced counter choice prevents all payment`,async()=>{
 const c=context(M,role),source=await cast(c,'Cruel Sadist');c.game.addCounters(source,'+1/+1',3);fund(c.a,'{2}{B}');
 const offered=variableAbility(c,source),decide=c.a.controller.decide.bind(c.a.controller),beforeMana=Object.values(c.a.pool).reduce((sum,n)=>sum+n,0);
 assert.ok(offered);c.a.controller.decide=async(g,q)=>{
  const result=q.type==='chooseX'&&!c.a.isAI?2:await decide(g,q);
  if(q.type==='chooseX'&&q.aiHint?.counterPayment){
   if(change==='blink'){await g.move(source,'exile');await g.move(source,'battlefield',{ctrl:c.a});g.addCounters(source,'+1/+1',3);}
   else if(change==='phase')g.phaseOut(source,c.a);
   else{source.ctrl=c.b;g.recalc();}
  }
  return result;
 };
 assert.equal(await c.game.activateAbility(c.a,offered),false);assert.equal(source.counters['+1/+1'],3);assert.equal(source.tapped,false);
 assert.equal(Object.values(c.a.pool).reduce((sum,n)=>sum+n,0),beforeMana);assert.equal(c.game.stack.length,0);
});

test('the announced number rejects out of range and noninteger choices before targets or costs',async()=>{
 for(const n of [-1,4,1.5,NaN,null,'',false,true]){
  const c=context(M),source=await cast(c,'Cruel Sadist');c.game.addCounters(source,'+1/+1',3);fund(c.a,'{2}{B}');
  const offered=variableAbility(c,source);let targets=0;c.a.controller.decide=async(g,q)=>{if(q.type==='chooseTargets')targets++;return n;};
  assert.equal(await c.game.activateAbility(c.a,offered),false,String(n));assert.equal(targets,0);assert.equal(source.counters['+1/+1'],3);assert.equal(source.tapped,false);assert.equal(c.a.pool.C,2);assert.equal(c.a.pool.B,1);assert.equal(c.game.stack.length,0);
 }
});

test('X is announced before the exact X target cardinality and zero remains a legal choice',async()=>{
 const c=context(M),source=await cast(c,'Waxmane Baku');c.game.addCounters(source,'ki',3);fund(c.a,'{1}');
 const questions=[],offered=variableAbility(c,source),decide=c.a.controller.decide.bind(c.a.controller);c.a.controller.decide=async(g,q)=>{questions.push(q);if(q.type==='chooseX')return 0;if(q.type==='chooseTargets')return [];return decide(g,q);};
 assert.equal(await c.game.activateAbility(c.a,offered),true);const stack=c.game.stack.find(row=>row.srcCard===source);assert.equal(stack.ctx.x,0);assert.equal(stack.ctx.oracleCounterPayment[0].n,0);assert.equal(stack.ctx.targets.flat().length,0);
 assert.equal(source.counters.ki,3);assert.equal(c.a.pool.C,0);assert.equal(questions[0].type,'chooseX');await settle(c.game);
});

for(const role of ['human','ai'])test(`${role}: a counter-paid ability retains its actual amount after the source leaves and in an AI clone`,async()=>{
 const c=context(M,role),source=await cast(c,'Relic Amulet'),target=put(M,c.game,c.b,'Colossal Dreadmaw');c.game.addCounters(source,'charge',3);fund(c.a,'{2}');chooseHuman(c,[target]);
 assert.equal(await c.game.activateAbility(c.a,variableAbility(c,source)),true);const original=c.game.stack.find(row=>row.srcCard===source),n=original.ctx.oracleCounterPayment[0].n;
 await c.game.move(source,'exile');await c.game.move(source,'battlefield',{ctrl:c.a});c.game.addCounters(source,'charge',9);
 const clone=M.cloneGameForAISimulation(c.game,884);assert.ok(clone);await settle(clone);assert.equal(clone.byIid(target.iid).damage,n);assert.equal(target.damage,0);assert.equal(clone.byIid(source.iid).counters.charge,9);
 await settle(c.game);assert.equal(target.damage,n);assert.equal(source.counters.charge,9);
});

for(const role of ['human','ai'])test(`${role}: paying every +1/+1 counter can kill the source before its damage resolves`,async()=>{
 const c=context(M,role),source=await cast(c,'Chamber Sentry'),target=put(M,c.game,c.b,'Colossal Dreadmaw');fund(c.a,'{X}',3);chooseHuman(c,[target],3);
 assert.equal(await c.game.activateAbility(c.a,variableAbility(c,source)),true);await c.game.checkSBA();assert.equal(source.zone,'graveyard');const stack=c.game.stack.find(row=>row.srcCard===source&&row.ctx.oracleCounterPayment);assert.equal(stack.ctx.oracleCounterPayment[0].n,3);assert.equal(target.damage,0);
 await settle(c.game);assert.equal(target.damage,3);assert.equal(c.a.pool.C,0);
});

test('the same X is capped by both the printed mana cost and available counters',async()=>{
 const c=context(M),source=await cast(c,'Chamber Sentry'),target=put(M,c.game,c.b,'Colossal Dreadmaw');fund(c.a,'{X}',2);let maximum;
 c.a.controller.decide=async(g,q)=>{if(q.type==='chooseX'){maximum=q.max;return 3;}return [target];};
 assert.equal(await c.game.activateAbility(c.a,variableAbility(c,source)),false);assert.equal(maximum,2);assert.equal(source.counters['+1/+1'],3);assert.equal(c.a.pool.C,2);assert.equal(source.tapped,false);
 chooseHuman(c,[target],2);assert.equal(await c.game.activateAbility(c.a,variableAbility(c,source)),true);assert.equal(source.counters['+1/+1'],1);assert.equal(c.a.pool.C,0);await settle(c.game);assert.equal(target.damage,2);
});

test('zero counters do not make an empty repeatable effect attractive to the local bot',async()=>{
 const c=context(M,'ai'),source=await cast(c,'Vish Kal, Blood Arbiter');put(M,c.game,c.b,'Colossal Dreadmaw');const offered=variableAbility(c,source);assert.ok(offered,'removing all of zero counters remains legal');
 assert.ok(offered.ability.aiScore(c.game,source,c.a)<0,'zero-sized repeatable debuff has no positive action value');
 const decision=await c.a.controller.decide(c.game,{type:'main',player:c.a,casts:[],acts:[offered],lands:[],phase:'main1'});assert.notEqual(decision.kind,'activate','unforced local bot declines the empty repeatable activation');
 c.game.addCounters(source,'+1/+1',3);assert.ok(offered.ability.aiScore(c.game,source,c.a)>0,'available counters restore a useful action');
});

for(const role of ['human','ai'])test(`${role}: a nontap counter cost may use the same source's granted mana ability without spending its reserved counters`,async()=>{
 const c=context(M,role),source=await cast(c,'Blademane Baku');c.game.addCounters(source,'ki',3);
 const mantle=put(M,c.game,c.a,'Paradise Mantle','hand');assert.equal(await c.game.castSpell(c.a,mantle,{from:'hand'}),true);await settle(c.game);fund(c.a,'{1}');
 const equip=c.game.activatableList(c.a).find(row=>row.card===mantle);assert.ok(equip);chooseHuman(c,[source]);assert.equal(await c.game.activateAbility(c.a,equip),true);await settle(c.game);assert.equal(mantle.attachedTo,source.iid);assert.equal(c.a.pool.C,0);
 const power=source.power,n=role==='ai'?3:2;chooseHuman(c,[]);const action=variableAbility(c,source);assert.ok(action,'the same untapped source can fund its nontap activation');assert.equal(await c.game.activateAbility(c.a,action),true);assert.equal(source.tapped,true,'granted mana ability taps the source');assert.equal(source.counters.ki||0,3-n);await settle(c.game);assert.equal(source.power,power+2*n);
});
