import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,settle} from './helpers/oracle-v8-fixtures.mjs';
import {def,permanent,choose} from './helpers/oracle-v30-permanents-proof.mjs';
import {createFixturePlan} from './helpers/oracle-fixture-plan.mjs';
import {runtimeBatch} from '../scripts/import-oracle-batch.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M=loadEngine();
const row=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v60-common.json',import.meta.url))).find(row=>row.name==='The Filigree Sylex');
assert.ok(row);
if(!M.DEFS[row.name])M.registerOracleBatch(runtimeBatch(createFixturePlan([row],60,9976).report));
M.initData(M.RAW_DATA);

function board(role='human'){
 const fixture=context(M,role),source=permanent(M,fixture.game,fixture.a,def('Counter payment source',['Artifact']));
 return {...fixture,source};
}
function counters(fixture,oil=0,charge=0){
 const card=permanent(M,fixture.game,fixture.a,def('Counter payment donor',['Artifact']));
 if(oil)card.counters.oil=oil;if(charge)card.counters.charge=charge;return card;
}
function scans(game,limit){
 const original=game.bf.bind(game);let count=0;
 game.bf=(...args)=>{assert.ok(++count<=limit,'counter feasibility uses a bounded number of battlefield scans');return original(...args);};
 return ()=>count;
}
const info=(n,among,kinds=['oil'])=>M.OracleV8CounterCosts.compile({n,kinds,self:false,among},()=>true);

test('nine available oil counters cannot pay ten, without enumerating permutations',()=>{
 const f=board(),cards=Array.from({length:9},()=>counters(f,1)),count=scans(f.game,2);
 assert.equal(M.OracleV8CounterCosts.canPay({g:f.game,you:f.a,src:f.source},info(10,true)),false);
 assert.ok(count()<=2);
 assert.equal(cards.reduce((n,c)=>n+c.counters.oil,0),9);
 assert.equal(f.source.zone,'battlefield');assertGameStateInvariants(f.game);
});

test('ten available counters with an unpayable mana cost have bounded feasibility scans',()=>{
 const f=board(),cards=Array.from({length:10},()=>counters(f,1)),count=scans(f.game,5000);
 assert.equal(M.OracleV8CounterCosts.canPay({g:f.game,you:f.a,src:f.source,manaCost:M.parseCost('{1}')},info(10,true)),false);
 assert.ok(count()<=5000);
 assert.equal(cards.reduce((n,c)=>n+c.counters.oil,0),10);
 assert.equal(Object.values(f.a.pool).reduce((n,x)=>n+x,0),0);assertGameStateInvariants(f.game);
});

test('different counter kinds on one permanent pay a same-permanent cost',async()=>{
 const f=board(),card=counters(f,2,2),payment=info(4,false,['oil','charge']),ctx={g:f.game,you:f.a,src:f.source};
 assert.equal(M.OracleV8CounterCosts.canPay(ctx,payment),true);
 const plan=await M.OracleV8CounterCosts.prepare(ctx,payment);
 assert.equal(plan.length,4);assert.ok(plan.every(row=>row.card===card));
 assert.equal(M.OracleV8CounterCosts.commit(ctx,payment,plan),true);
 assert.equal(card.counters.oil||0,0);assert.equal(card.counters.charge||0,0);
 assert.equal(ctx.oracleCounterPayment.reduce((n,row)=>n+row.n,0),4);assertGameStateInvariants(f.game);
});

test('a same-permanent payment cannot combine counters on two different permanents',()=>{
 const f=board(),first=counters(f,2),second=counters(f,2),count=scans(f.game,2);
 assert.equal(M.OracleV8CounterCosts.canPay({g:f.game,you:f.a,src:f.source},info(4,false)),false);
 assert.ok(count()<=2);assert.equal(first.counters.oil,2);assert.equal(second.counters.oil,2);assertGameStateInvariants(f.game);
});

for(const role of ['human','ai'])test(role+': The Filigree Sylex pays ten counters and sacrifice through the native activation',async()=>{
 const f=context(M,role),{game:g,a,b}=f,source=permanent(M,g,a,M.DEFS['The Filigree Sylex']);
 const cards=Array.from({length:10},()=>counters(f,1));
 choose(a,q=>q.type==='chooseTargets'?{...q,candidates:[b],min:1,max:1}:null);
 const ability=g.activatableList(a).find(row=>row.card===source&&row.ability?.cost?.oracleCounterPayment?.n===10);
 assert.ok(ability,'the fully payable native ability is offered');
 const life=b.life;
 assert.equal(await g.activateAbility(a,ability),true);
 assert.equal(source.zone,'graveyard');assert.ok(cards.every(c=>!c.counters.oil));
 const stack=g.stack.find(row=>row.srcCard===source);
 assert.ok(stack);assert.equal(stack.ctx.oracleCounterPayment.reduce((n,row)=>n+row.n,0),10);
 await settle(g);assert.equal(b.life,life-10);
 assert.equal(a.controller instanceof M.AIController,role==='ai');assertGameStateInvariants(g);
});
