import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createImportPlan,semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v14-teamwork.json',import.meta.url),'utf8'));
const M=loadEngine(),absent=rows.filter(card=>!M.DEFS[card.name]);
if(absent.length){const plan=createImportPlan({cards:absent,bulk:{type:'oracle_cards'},sequence:9929,limit:absent.length,compilerVersion:14});assert.equal(plan.report.cards.length,absent.length);M.registerOracleBatch(plan.report);}
M.initData(M.RAW_DATA);
const fund=p=>{for(const color of ['W','U','B','R','G','C'])p.pool[color]=20;};
function choose(player,handler){const old=player.controller.decide.bind(player.controller);player.controller.decide=(g,q)=>{const answer=handler(g,q);return answer===undefined?old(g,q):answer;};}
test('Teamwork grammar accepts complete cards and fails closed on an unknown cost or effect',()=>{
 for(const card of rows){assert.ok(semanticClass(card,{compilerVersion:14}).semanticClass,card.name);assert.equal(semanticClass({...card,oracle_text:card.oracle_text+'\nUnsupported action.'},{compilerVersion:14}).semanticClass,undefined);if(/^Teamwork /.test(card.oracle_text))assert.equal(semanticClass({...card,oracle_text:card.oracle_text.replace(/^Teamwork \d+/,'Teamwork banana')},{compilerVersion:14}).semanticClass,undefined);}
});
for(const role of ['human','ai']){
 test(role+': Teamwork preserves ordinary casting and draws its extra card only after payment',async()=>{
  for(const paid of [false,true]){const {game,a}=context(M,role),donor=put(M,game,a,'Craw Wurm'),card=put(M,game,a,'Heroic Teamwork','hand');donor.sick=true;fund(a);choose(a,(g,q)=>q.type==='chooseTargets'?[donor]:undefined);const hand=a.hand.length;assert.equal(await game.castSpell(a,card,{from:'hand',alt:paid?{oracleOptionalCostV14:true}:{}}),true);const so=game.stack.find(row=>row.card===card);assert.equal(donor.tapped,paid);assert.equal(so.kicked,false);assert.equal(!!so.castOpts.oracleBargainV10,false);await settle(game);assert.equal(a.hand.length,hand-1+(paid?1:0));assert.equal(donor.power,8);assert.equal(donor.toughness,5);assertGameStateInvariants(game);}
 });
 test(role+': Go Nuts pays before putting both printed modes on the Stack and resolves counter before fight',async()=>{
  const {game,a,b}=context(M,role),bear=put(M,game,a,'Runeclaw Bear'),victim=put(M,game,b,'Runeclaw Bear'),donor=put(M,game,a,'Craw Wurm'),card=put(M,game,a,'Go Nuts!','hand');fund(a);
  choose(a,(g,q)=>q.type==='chooseTargets'?[q.candidates.includes(bear)?bear:victim]:q.type==='chooseCards'&&q.aiHint?.teamworkV14?[donor]:q.type==='chooseMulti'&&q.prompt.startsWith('Go Nuts!')?['1','0']:undefined);
  assert.equal(await game.castSpell(a,card,{from:'hand',alt:{oracleOptionalCostV14:true}}),true);const so=game.stack.find(row=>row.card===card);assert.deepEqual(Array.from(so.mode),[0,1]);assert.equal(donor.tapped,true);assert.equal(bear.counters['+1/+1']||0,0);await settle(game);assert.equal(bear.counters['+1/+1'],1);assert.equal(bear.zone,'battlefield');assert.equal(victim.zone,'graveyard');assertGameStateInvariants(game);
 });
 test(role+': Teamwork counts actual power and permits a summoning-sick creature',async()=>{
  const {game,a}=context(M,role),card=put(M,game,a,'Timeline Inquiry','hand'),donor=put(M,game,a,'Runeclaw Bear');donor.sick=true;fund(a);const original=game.vehicleCrewPower;game.vehicleCrewPower=()=>100;
  assert.ok(game.castableList(a).some(row=>row.card===card&&row.alt?.oracleOptionalCostV14));assert.equal(await game.castSpell(a,card,{from:'hand',alt:{oracleOptionalCostV14:true}}),true);assert.equal(donor.tapped,true);await settle(game);game.vehicleCrewPower=original;assertGameStateInvariants(game);
 });
 test(role+': a crew-only power bonus cannot make an undersized Teamwork payment legal',async()=>{
  const {game,a}=context(M,role),card=put(M,game,a,'Timeline Inquiry','hand'),donor=put(M,game,a,'Llanowar Elves');fund(a);game.vehicleCrewPower=()=>100;const before={...a.pool};assert.equal(game.castableList(a).some(row=>row.card===card&&row.alt?.oracleOptionalCostV14),false);assert.equal(await game.castSpell(a,card,{from:'hand',alt:{oracleOptionalCostV14:true}}),false);assert.equal(donor.tapped,false);assert.equal(card.zone,'hand');assert.deepEqual({...a.pool},before);assertGameStateInvariants(game);
 });
 test(role+': creatures reserved for Teamwork cannot also provide spell mana',async()=>{
  const {game,a}=context(M,role),card=put(M,game,a,'Go Nuts!','hand'),one=put(M,game,a,'Llanowar Elves'),two=put(M,game,a,'Llanowar Elves'),three=put(M,game,a,'Llanowar Elves');
  assert.equal(game.castableList(a).some(row=>row.card===card&&row.alt?.oracleOptionalCostV14),false);assert.equal(await game.castSpell(a,card,{from:'hand',alt:{oracleOptionalCostV14:true}}),false);assert.ok([one,two,three].every(card=>!card.tapped));assert.equal(card.zone,'hand');assertGameStateInvariants(game);
 });
 test(role+': a creature that leaves and returns during the payment choice is rejected without spending mana',async()=>{
  const {game,a}=context(M,role),card=put(M,game,a,'Timeline Inquiry','hand'),donor=put(M,game,a,'Craw Wurm');fund(a);const before={...a.pool};choose(a,(g,q)=>q.type==='chooseCards'&&q.aiHint?.teamworkV14?(async()=>{await game.move(donor,'exile');await game.move(donor,'battlefield',{ctrl:a});return [donor];})():undefined);
  assert.equal(await game.castSpell(a,card,{from:'hand',alt:{oracleOptionalCostV14:true}}),false);assert.equal(card.zone,'hand');assert.equal(donor.tapped,false);assert.deepEqual({...a.pool},before);assertGameStateInvariants(game);
 });
 test(role+': an invalid duplicate payment is rejected before tapping or spending mana',async()=>{
  const {game,a}=context(M,role),card=put(M,game,a,'Timeline Inquiry','hand'),donor=put(M,game,a,'Runeclaw Bear');fund(a);const before={...a.pool};choose(a,(g,q)=>q.type==='chooseCards'&&q.aiHint?.teamworkV14?[donor,donor]:undefined);assert.equal(await game.castSpell(a,card,{from:'hand',alt:{oracleOptionalCostV14:true}}),false);assert.equal(donor.tapped,false);assert.deepEqual({...a.pool},before);assertGameStateInvariants(game);
 });
}
