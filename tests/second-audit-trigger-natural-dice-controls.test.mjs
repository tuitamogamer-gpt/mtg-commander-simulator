import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeFixture} from './helpers/second-trigger-fixtures.mjs';

for(const role of ['human','ai']){
 test(`${role}: paid Monitor reroll to a natural six earns the Ward draw`,async()=>{
  const f=nativeFixture(role,31);await f.cast('Netherese Puzzle-Ward',['Island','Wastes','Wastes','Wastes']);
  await f.cast('Monitor Monitor',['Island','Island','Wastes','Wastes']);f.put('Wastes');f.multi=()=>['0'];
  const hand=f.me.hand.length;await f.cast('Neverwinter Hydra',['Forest','Forest','Wastes','Wastes'],{xVal:1});
  const roll=f.events.find(e=>e.type==='diceRolled');assert.ok(roll);assert.equal(roll.raw[0],5);assert.equal(roll.results[0],6);
  assert.equal(f.questions.filter(q=>q.type==='chooseMulti').length,1);assert.equal(f.me.hand.length,hand+1,'the actual rerolled highest face is natural');
 });
 test(`${role}: paid Barbarian Class ignores one natural six and Ward draws for only the retained die`,async()=>{
  const f=nativeFixture(role,30);await f.cast('Netherese Puzzle-Ward',['Island','Wastes','Wastes','Wastes']);await f.cast('Barbarian Class',['Mountain']);
  const hand=f.me.hand.length;await f.cast('Neverwinter Hydra',['Forest','Forest','Wastes','Wastes'],{xVal:1});
  const roll=f.events.find(e=>e.type==='diceRolled');assert.ok(roll);assert.equal(roll.raw.length,2);assert.equal(roll.raw[0],6);assert.equal(roll.raw[1],6);
  assert.equal(roll.ignored.length,1);assert.equal(roll.ignored[0],6);assert.equal(roll.results.length,1);assert.equal(roll.results[0],6);
  assert.equal(f.me.hand.length,hand+1,'the ignored natural six produces no additional trigger');
 });
}
