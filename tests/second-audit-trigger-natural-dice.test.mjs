import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeFixture} from './helpers/second-trigger-fixtures.mjs';

const cases=[
 {name:'natural six decreased to five',seed:4,natural:6,result:5,modifier:'down',draws:1},
 {name:'natural five increased to six',seed:2,natural:5,result:6,modifier:'up',draws:0},
 {name:'unchanged natural six',seed:4,natural:6,result:6,modifier:'no',draws:1},
 {name:'unchanged natural five',seed:2,natural:5,result:5,modifier:'no',draws:0},
 {name:'natural six rerolled to two',seed:4,natural:6,result:2,reroll:true,draws:0},
];
for(const role of ['human','ai'])for(const row of cases)test(`${role}: paid Netherese Puzzle-Ward distinguishes ${row.name}`,async()=>{
 const f=nativeFixture(role,row.seed);await f.cast('Netherese Puzzle-Ward',['Island','Wastes','Wastes','Wastes']);
 if(row.reroll){await f.cast('Monitor Monitor',['Island','Island','Wastes','Wastes']);f.put('Wastes');f.multi=()=>['0'];}
 else{
  await f.cast('Night Shift of the Living Dead',['Swamp','Wastes','Wastes','Wastes']);
  f.option=q=>q.prompt?.startsWith('Pay 1 life to adjust die ')?row.modifier:undefined;
 }
 const hand=f.me.hand.length;
 await f.cast('Neverwinter Hydra',['Forest','Forest','Wastes','Wastes'],{xVal:1});
 const roll=f.events.find(e=>e.type==='diceRolled');assert.ok(roll);assert.equal(roll.raw.length,1);
 assert.equal(roll.raw[0],row.natural,'the native seed reaches the required natural result');assert.equal(roll.results[0],row.result);
 assert.equal(f.me.hand.length,hand+row.draws,'only a retained highest natural result triggers the printed draw');
 if(row.modifier&&row.modifier!=='no')assert.equal(f.me.life,39,'the chosen native modifier actually pays one life');
 if(row.reroll){const choices=f.questions.filter(q=>q.type==='chooseMulti');assert.equal(choices.length,1);}
});
