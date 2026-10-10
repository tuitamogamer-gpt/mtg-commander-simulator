import test from 'node:test';
import assert from 'node:assert/strict';
import {table,paidCast,stable} from './helpers/second-audit-combat-fixtures.mjs';

for(const walkerDestination of [false,true])test('second combat: paid Windshaper reselects '+(walkerDestination?'a planeswalker':'a player')+' and the new defender blocks',async()=>{
  const f=table(),attacker=f.put('Colossal Dreadmaw','hand'),planetar=f.put('Windshaper Planetar','hand',f.c);
  const blocker=f.put('Ornithopter','hand',f.d),oldBlocker=f.put('Ornithopter','hand',f.b);
  const walker=walkerDestination?f.put('Jace Beleren','hand',f.d):null,destination=walker||f.d;
  f.lands(Array(20).fill('Forest'));
  f.lands([...Array(6).fill('Plains'),...Array(6).fill('Forest')],f.c);
  f.lands(Array(8).fill('Island'),f.d);
  f.g.turnPlayer=f.b;await paidCast(f,f.b,oldBlocker);f.g.turnPlayer=f.d;
  await paidCast(f,f.d,blocker);if(walker)await paidCast(f,f.d,walker);f.g.turnPlayer=f.a;
  let responded=false,newDefenderBlocked=false,reselected=false;
  f.main=(p,q)=>{
    if(p===f.a&&q.phase==='main1'&&attacker.zone==='hand'){
      const row=q.casts.find(row=>row.card===attacker);assert.ok(row);
      return {kind:'cast',card:attacker,from:row.from,alt:row.alt};
    }
    return {kind:'done'};
  };
  f.attackers=(p,q)=>p===f.a&&f.a.turnsStarted===2&&q.eligible.includes(attacker)?[{card:attacker,target:f.b}]:[];
  f.priority=(p,q)=>{
    if(!responded&&p===f.c&&f.g.step==='attackers'&&f.g.combat?.attackers.includes(attacker)){
      const row=q.casts.find(row=>row.card===planetar);assert.ok(row,'printed Flash creature is offered after real declaration');
      responded=true;return {kind:'cast',card:planetar,from:row.from,alt:row.alt};
    }
    return {kind:'pass'};
  };
  f.option=(p,q)=>{
    if(q.prompt?.startsWith('Choose a new defender')){
      const row=q.options.find(row=>row.target===destination);assert.ok(row,'real reselected destination');
      reselected=true;return row.key;
    }
    return undefined;
  };
  f.blockers=(p,q)=>{
    if(p===f.d&&q.attackers.includes(attacker)&&q.potential.includes(blocker)){
      assert.equal(attacker.attacking===destination,true);
      newDefenderBlocked=true;return [{blocker,attacker}];
    }
    return [];
  };
  await f.g.runTurn();for(let n=0;n<4;n++)await f.g.runTurn();
  assert.equal(responded,true);assert.equal(reselected,true);
  assert.equal(newDefenderBlocked,true,'legitimate reselect assigns blocking to the new defending player');
  assert.equal(blocker.zone,'graveyard');assert.equal(oldBlocker.zone,'battlefield');
  assert.equal(f.b.life,40,'the originally attacked player receives no combat damage');
  assert.equal(f.d.life,walkerDestination?40:36,'only real trample overflow reaches the reselected player');
  if(walker)assert.equal(walker.zone,'graveyard');
  assert.equal(f.events.filter(r=>r.event==='attacks'&&r.data.card===attacker).length,1,'reselecting does not declare a second attack');
  stable(f,'Windshaper native reselection');
});
