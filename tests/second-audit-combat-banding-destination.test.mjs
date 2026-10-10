import test from 'node:test';
import assert from 'node:assert/strict';
import {table,paidCast,stable} from './helpers/second-audit-combat-fixtures.mjs';

for(const scenario of [
  {name:'Thrasta and an ordinary planeswalker',thrasta:true,removed:false,life:37},
  {name:'Thrasta and a removed planeswalker',thrasta:true,removed:true,life:34},
  {name:'ordinary trample and a removed planeswalker',thrasta:false,removed:true,life:40},
])test('second combat: native paid banding assigns '+scenario.name,async()=>{
  const f=table(),attacker=f.put(scenario.thrasta?"Thrasta, Tempest's Roar":'Colossal Dreadmaw','hand');
  const walker=f.put('Jace Beleren','hand',f.b),hero=f.put('Benalish Hero','hand',f.b);
  const bounce=scenario.removed?f.put('Into the Roil','hand',f.b):null;
  f.lands([...Array(24).fill('Forest')]);
  f.lands([...Array(8).fill('Island'),...Array(8).fill('Plains')],f.b);
  f.g.turnPlayer=f.b;await paidCast(f,f.b,walker);await paidCast(f,f.b,hero);f.g.turnPlayer=f.a;
  assert.equal(hero.kw('banding'),true,'printed blocker actually grants damage assignment control');
  let removed=false,blocked=false,offeredOverflow=false;
  f.targets=(p,q)=>q.src===bounce&&q.candidates.includes(walker)?[walker]:undefined;
  f.main=(p,q)=>{
    if(p===f.a&&q.phase==='main1'&&attacker.zone==='hand'){
      const row=q.casts.find(row=>row.card===attacker);assert.ok(row);
      return {kind:'cast',card:attacker,from:row.from,alt:row.alt};
    }
    return {kind:'done'};
  };
  f.attackers=(p,q)=>p===f.a&&f.a.turnsStarted===2&&q.eligible.includes(attacker)?[{card:attacker,target:walker}]:[];
  f.blockers=(p,q)=>{
    if(p===f.b&&q.attackers.includes(attacker)&&q.potential.includes(hero)){
      blocked=true;return [{blocker:hero,attacker}];
    }
    return [];
  };
  f.priority=(p,q)=>{
    if(bounce&&!removed&&p===f.b&&f.g.step==='attackers'&&f.g.combat?.attackers.includes(attacker)){
      const row=q.casts.find(row=>row.card===bounce);assert.ok(row);
      removed=true;return {kind:'cast',card:bounce,from:row.from,alt:row.alt};
    }
    return {kind:'pass'};
  };
  f.x=(p,q)=>{
    if(q.prompt?.startsWith('Banding: damage assigned')){
      assert.equal(p.idx,f.b.idx,'real printed banding blocker controller assigns the damage');
      offeredOverflow=true;return q.max;
    }
    return q.min||0;
  };
  await f.g.runTurn();for(let n=0;n<4;n++)await f.g.runTurn();
  assert.equal(blocked,true);assert.equal(hero.zone,'graveyard');
  assert.equal(removed,scenario.removed);
  assert.equal(f.b.life,scenario.life,'native banding preserves the printed trample-over-planeswalker exception');
  assert.equal(offeredOverflow,scenario.thrasta,'ordinary trample has no damage destination after the planeswalker leaves combat');
  assert.equal(walker.zone,scenario.removed?'hand':'graveyard');
  stable(f,'native banding destination '+scenario.name);
});
