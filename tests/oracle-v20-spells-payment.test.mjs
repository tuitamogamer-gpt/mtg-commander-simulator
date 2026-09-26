import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createImportPlan,semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const card=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v20-costs.json',import.meta.url),'utf8')).find(card=>card.name==='Altar of the Wretched // Wretched Bonemass');
assert.ok(card);
const M=loadEngine();
if(!M.DEFS[card.name]){const {report}=createImportPlan({cards:[card],bulk:{type:'oracle_cards'},sequence:9937,limit:1,compilerVersion:20});assert.equal(report.cards.length,1);M.registerOracleBatch(report);}
M.initData(M.RAW_DATA);

test('sacrifice-bound X compiles completely and rejects an unknown printed suffix',()=>{
 const parsed=semanticClass(card,{compilerVersion:20});assert.ok(parsed.semanticClass);assert.match(JSON.stringify(parsed.implementation),/"kind":"payment-stat","stat":"power"/);
 const invalid={...card,card_faces:card.card_faces.map((face,index)=>index===0?{...face,oracle_text:face.oracle_text+'\nDo an unsupported thing.'}:face)};assert.equal(semanticClass(invalid,{compilerVersion:20}).semanticClass,undefined);
});

for(const role of ['human','ai'])test(role+': Altar uses paid creature last-known power and draws nothing when payment is declined',async()=>{
 for(const [paid,power,bonus]of [[true,3,2],[false,3,2],[true,0,0],[true,-2,0]]){
  const f=context(M,role),victim=put(M,f.game,f.a,'Grizzly Bears');victim.def={...victim.def,power:String(power),toughness:'4'};f.game.recalc();if(bonus)M.E.pumpUntilEOT(f.game,victim,bonus,0,[]);
  const source=put(M,f.game,f.a,card.name,'hand');for(const color of ['W','U','B','R','G','C'])f.a.pool[color]=10;
  const decide=f.a.controller.decide.bind(f.a.controller);f.a.controller.decide=(game,q)=>q.aiHint?.kind==='oracleUnlessPayment'?(paid?'yes':'no'):q.type==='chooseCards'&&q.prompt.endsWith(': choose cards to sacrifice')?[victim]:decide(game,q);
  assert.equal(await f.game.castSpell(f.a,source,{from:'hand'}),true);await settle(f.game);
  const expected=paid?Math.max(0,power+bonus):0;assert.equal(source.zone,'battlefield');assert.equal(victim.zone,paid?'graveyard':'battlefield');assert.equal(f.a.hand.length,expected);assert.equal(f.a.library.length,30-2*expected);assert.equal(f.a.graveyard.length,expected+(paid?1:0));assertGameStateInvariants(f.game);
 }
});
