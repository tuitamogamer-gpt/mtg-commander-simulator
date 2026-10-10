import test from 'node:test';
import assert from 'node:assert/strict';
import {table,paidCast,stable} from './helpers/second-audit-combat-fixtures.mjs';

for(const walkerDestination of [false,true])test('second combat: opponent paid Windshaper may reselect its own '+(walkerDestination?'planeswalker':'player seat')+' as defender',async()=>{
  const f=table(),attacker=f.put('Colossal Dreadmaw','hand'),planetar=f.put('Windshaper Planetar','hand',f.c);
  const blocker=f.put('Ornithopter','hand',f.c);
  const walker=walkerDestination?f.put('Jace Beleren','hand',f.c):null,destination=walker||f.c;
  f.lands(Array(20).fill('Forest'));
  f.lands([...Array(8).fill('Plains'),...Array(8).fill('Island'),...Array(8).fill('Forest')],f.c);
  f.g.turnPlayer=f.c;await paidCast(f,f.c,blocker);if(walker)await paidCast(f,f.c,walker);f.g.turnPlayer=f.a;
  let responded=false,blocked=false,reselected=false;
  f.main=(p,q)=>{
    if(p===f.a&&q.phase==='main1'&&attacker.zone==='hand'){
      const row=q.casts.find(row=>row.card===attacker);assert.ok(row);return {kind:'cast',card:attacker,from:row.from,alt:row.alt};
    }
    return {kind:'done'};
  };
  f.attackers=(p,q)=>p===f.a&&f.a.turnsStarted===2&&q.eligible.includes(attacker)?[{card:attacker,target:f.b}]:[];
  f.priority=(p,q)=>{
    if(!responded&&p===f.c&&f.g.step==='attackers'&&f.g.combat?.attackers.includes(attacker)){
      const row=q.casts.find(row=>row.card===planetar);assert.ok(row);responded=true;
      return {kind:'cast',card:planetar,from:row.from,alt:row.alt};
    }
    return {kind:'pass'};
  };
  f.option=(p,q)=>{
    if(q.prompt?.startsWith('Choose a new defender')){
      assert.equal(p.idx,f.c.idx,'the printed effect controller still makes the choice');
      const row=q.options.find(row=>row.target===destination);
      assert.ok(row,'a legal opponent of the attacking creature controller is offered, including the effect controller');
      assert.equal(q.options.some(row=>row.target===f.a),false,'the attacking creature cannot attack its own controller');
      reselected=true;return row.key;
    }
    return undefined;
  };
  f.blockers=(p,q)=>{
    if(p===f.c&&q.attackers.includes(attacker)&&q.potential.includes(blocker)){blocked=true;return [{blocker,attacker}];}
    return [];
  };
  await f.g.runTurn();for(let n=0;n<4;n++)await f.g.runTurn();
  assert.equal(responded,true);assert.equal(reselected,true);assert.equal(blocked,true);
  assert.equal(blocker.zone,'graveyard');assert.equal(f.b.life,40);assert.equal(f.c.life,walkerDestination?40:36);
  if(walker)assert.equal(walker.zone,'graveyard');
  assert.equal(f.events.filter(row=>row.event==='attacks'&&row.data.card===attacker).length,1);
  stable(f,'paid Windshaper chooses an actual opponent of the attacker controller');
});
