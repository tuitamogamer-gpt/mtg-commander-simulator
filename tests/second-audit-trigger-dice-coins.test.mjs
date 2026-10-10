import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeFixture} from './helpers/second-trigger-fixtures.mjs';

for(const role of ['human','ai']){
 test(`${role}: paid Delina and Pixie Guide keep one real die and create one attacking copy`,async()=>{
  const f=nativeFixture(role,8),delina=await f.cast('Delina, Wild Mage',['Mountain','Wastes','Wastes','Wastes']);
  await f.cast('Pixie Guide',['Island','Wastes']);const model=await f.cast('Grizzly Bears',['Forest','Wastes']);
  await f.cast('Fervor',['Mountain','Wastes','Wastes']);
  f.targets=q=>q.candidates.includes(model)?[model]:undefined;
  f.option=q=>q.prompt?.includes('Roll again for Delina?')?'no':undefined;
  f.attackers=q=>q.eligible.includes(delina)?[{card:delina,target:f.rival}]:[];
  await f.game.combatPhase(f.me);await f.settle();
  const rolls=f.events.filter(e=>e.type==='diceRolled');assert.equal(rolls.length,1);
  assert.equal(rolls[0].raw.length,2);assert.equal(rolls[0].ignored.length,1);assert.equal(rolls[0].results.length,1);
  assert.equal(rolls[0].results[0],Math.max(...rolls[0].raw));
  assert.equal(f.me.turnState.tokensCreated,1,'one surviving roll creates one copy');
  assert.equal(f.rival.life,35,'the native Delina attacker and tapped attacking Bears copy deal five damage');
  assert.equal(f.game.creatures(f.me).filter(c=>c.isToken).length,0,'the printed end-of-combat token exile resolves');
 });
 test(`${role}: a real opposing kept coin flip triggers paid Zndrsplt and Okaun once`,async()=>{
  const f=nativeFixture(role,8),efreet=f.put('Frenetic Efreet','battlefield',f.rival);
  f.put("Krark's Thumb",'battlefield',f.rival);
  await f.cast('Zndrsplt, Eye of Wisdom',['Island','Wastes','Wastes','Wastes','Wastes']);
  const okaun=await f.cast('Okaun, Eye of Chaos',['Mountain','Wastes','Wastes','Wastes','Wastes']);
  const encounter=await f.cast('Chance Encounter',['Mountain','Mountain','Wastes','Wastes']);
  f.option=q=>q.options.some(row=>row.key==='tails')?'tails':undefined;
  const before=f.me.hand.length;
  await f.activate(efreet,[],()=>true);
  const flips=f.events.filter(e=>e.type==='coinFlip');assert.equal(flips.length,1);
  assert.equal(flips[0].player,f.rival);assert.equal(flips[0].raw.length,2);assert.equal(flips[0].ignored,1);
  assert.equal(flips[0].won,true,'the actual seeded kept tails wins the native called flip');
  assert.equal(f.me.hand.length,before+1,'ignored flips produce no second draw');assert.equal(okaun.power,6);
  assert.equal(encounter.counters.luck||0,0,'an opposing win does not satisfy your-win Chance Encounter');
 });
}
