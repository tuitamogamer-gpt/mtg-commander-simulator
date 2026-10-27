import test from 'node:test';
import assert from 'node:assert/strict';
import {M,setup,card,settle} from './helpers/c21-fixtures.mjs';

const windowFor=f=>({type:'main',player:f.a,casts:[],lands:[],acts:f.game.activatableList(f.a),phase:f.game.phase});

test('AI ends its main phase when Soothsaying can only look at zero cards',async()=>{
  const f=setup('ai'),source=card(f,'Soothsaying');
  const q=windowFor(f);
  assert.ok(q.acts.some(e=>e.card===source&&e.ability.cost?.mana==='{X}'),'X=0 remains a legal activation');
  const action=await f.a.controller.decide(f.game,q);
  assert.equal(action.kind,'done');
});

test('AI pays for a useful library look, keeps spare mana and stops repeating it that turn',async()=>{
  const f=setup('ai'),source=card(f,'Soothsaying');
  f.a.pool.C=7;
  const action=await f.a.controller.decide(f.game,windowFor(f));
  assert.equal(action.kind,'activate');assert.equal(action.entry.card,source);
  assert.equal(await f.game.performAction(f.a,action),true);await settle(f.game);
  assert.equal(f.a.pool.C,4,'looks at three cards instead of spending all seven mana');
  const next=await f.a.controller.decide(f.game,windowFor(f));
  assert.equal(next.kind,'done');
  f.game.turnNo++;
  const later=await f.a.controller.decide(f.game,windowFor(f));
  assert.equal(later.kind,'activate','useful library selection is available again next turn');
});

test('Human X=0 remains legal and neither spends mana nor moves library cards',async()=>{
  const f=setup(),source=card(f,'Soothsaying'),before=f.a.library.slice();
  f.decide=(p,q)=>q.type==='chooseX'?0:undefined;
  const entry=f.game.activatableList(f.a).find(e=>e.card===source&&e.ability.cost?.mana==='{X}');
  assert.equal(await f.game.activateAbility(f.a,entry),true);await settle(f.game);
  assert.deepEqual(f.a.library,before);
  assert.equal(Object.values(f.a.pool).reduce((n,x)=>n+x,0),0);
});
