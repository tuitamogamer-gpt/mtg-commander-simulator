import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';

const M=loadEngine();
const historical=JSON.parse(readFileSync(new URL('../reports/oracle-import/batch-0145.json',import.meta.url)))
  .cards.find(card=>card.raw.name==='Vilis, Broker of Blood');
const input={name:historical.raw.name,mana_cost:historical.raw.cost,oracle_text:historical.raw.oracle,
  type_line:historical.catalog.typeLine,layout:historical.raw._layout,power:'8',toughness:'8',keywords:['Flying']};

test('Vilis recompilation preserves the imported life-loss event binding and complete descriptor',()=>{
  const actual=semanticClass(input,{compilerVersion:8});
  assert.equal(actual.semanticClass,historical.semanticClass,actual.reason);
  assert.deepEqual(actual.implementation,historical.implementation);
  for(const oracle_text of ['Whenever you surveil, draw that many cards.','Whenever you lose life for the first time each turn, draw that many cards.']){
    assert.equal(semanticClass({...input,oracle_text},{compilerVersion:8}).semanticClass,undefined,
      'an observed event without a typed amount binding remains deferred');
  }
});

for(const role of ['human','ai'])test(`${role}: paid Vilis activation draws the paid life amount, with exact event scope`,async()=>{
  const {game,a,b}=context(M,role),target=put(M,game,b,'Shivan Dragon');
  const source=put(M,game,a,input.name,'hand');Object.assign(a.pool,{C:5,B:4});
  assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await settle(game);
  assert.equal(a.pool.C,0);assert.equal(a.pool.B,1);
  const original=a.controller.decide.bind(a.controller);
  if(role==='human')a.controller.decide=async(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(target)?[target]:original(g,q);
  const entry=game.activatableList(a).find(row=>row.card===source&&row.ability);
  assert.ok(entry);const life=a.life,hand=a.hand.length;
  assert.equal(await game.activateAbility(a,entry),true);
  assert.equal(a.life,life-2);assert.equal(a.pool.B,0);await settle(game);
  assert.equal(a.hand.length,hand+2,'paying life triggers the printed draw ability');
  assert.equal(target.toughness,4,'real human or local AI chose the opposing creature');
  await game.damagePlayer(target,a,3);await settle(game);
  assert.equal(a.hand.length,hand+5,'damage produces one draw amount equal to actual life lost');
  await game.loseLife(a,0);await game.loseLife(b,2);await game.gainLife(a,2);await settle(game);
  assert.equal(a.hand.length,hand+5,'zero loss, another player, and life gain do not trigger Vilis');
  await game.loseLife(a,1);await game.flushTriggers();await game.move(source,'exile');await settle(game);
  assert.equal(a.hand.length,hand+6,'a triggered amount remains bound after its source leaves');
});
