import test from 'node:test';
import assert from 'node:assert/strict';
import {M,setup,play,card,body,settle} from './helpers/afc-mic-fixtures.mjs';

for(const role of ['human','ai']) {
  test(`${role}: large Klauth mana pool proves payments promptly and keeps its spell restriction`,async()=>{
    const f=setup(role),klauth=await play(f,'Klauth, Unrivaled Ancient');
    const attacker=body(f);
    f.game.addCounters(attacker,'+1/+1',22);
    for(const color in f.a.pool)f.a.pool[color]=0;
    f.a.poolMeta=[];
    klauth.attacking=f.b;attacker.attacking=f.b;
    f.decide=(_player,q)=>q.type==='chooseOption'&&q.options.some(o=>o.key==='B')?'B':undefined;
    await f.game.emit('attacks',{card:klauth,player:f.a,defender:f.b});
    await settle(f.game);
    assert.equal(f.a.pool.B,28);
    f.game.emptyPool();
    assert.equal(f.a.pool.B,28,'Klauth mana survives the end of a step');
    const spell=card(f,'Kindred Summons','hand'),payment={card:spell,castOpts:{}};
    const started=performance.now();
    assert.equal(f.game.canPayMana(f.a,M.parseCost('{5}{G}{G}'),payment),false);
    assert.ok(performance.now()-started<5000,'an impossible colored payment cannot monopolize the game loop');
    assert.equal(f.a.pool.B,28,'preflight leaves floating mana untouched');
    assert.equal(f.game.canPayMana(f.a,M.parseCost('{1}'),{card:klauth,isAbility:true}),false);
    assert.equal(await f.game.payMana(f.a,M.parseCost('{28}'),payment,{isSpell:true}),true);
    assert.equal(f.a.pool.B,0,'all 28 restricted units can actually pay a spell');
  });
}

test('Klauth preserves every chosen color when paying a multicolor spell',async()=>{
  const f=setup('human'),klauth=await play(f,'Klauth, Unrivaled Ancient');
  for(const color in f.a.pool)f.a.pool[color]=0;
  f.a.poolMeta=[];klauth.attacking=f.b;
  const choices=['R','G','R','G'];let next=0;
  f.decide=(_player,q)=>q.type==='chooseOption'&&q.options.some(o=>o.key==='G')?choices[next++]:undefined;
  await f.game.emit('attacks',{card:klauth,player:f.a,defender:f.b});await settle(f.game);
  assert.equal(f.a.pool.R,2);assert.equal(f.a.pool.G,2);
  const spell=card(f,'Kindred Summons','hand');
  assert.equal(await f.game.payMana(f.a,M.parseCost('{R}{R}{G}{G}'),{card:spell,castOpts:{}},{isSpell:true}),true);
  assert.equal(f.a.pool.R,0);assert.equal(f.a.pool.G,0);
});
