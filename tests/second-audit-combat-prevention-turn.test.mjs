import test from 'node:test';
import assert from 'node:assert/strict';
import {table,stable} from './helpers/second-audit-combat-fixtures.mjs';

for(const prevention of [true,false])test('second combat: real paid extra combat '+(prevention?'retains Snag for the entire turn':'deals damage without Snag'),async()=>{
  const f=table(),attacker=f.put('Colossal Dreadmaw','hand'),assault=f.put('Relentless Assault','hand');
  const snag=prevention?f.put('Snag','hand',f.b):null;
  f.lands([...Array(8).fill('Mountain'),...Array(16).fill('Forest')]);f.lands(Array(8).fill('Forest'),f.b);
  let prevented=false,extraPaid=false;const preventedHits=[],emit=f.g.emit.bind(f.g);
  f.g.emit=async(event,data,...args)=>{
    if(event==='damagePrevented'&&!f.g._damageEventQueue&&data.src===attacker&&data.combat)preventedHits.push(data);
    return emit(event,data,...args);
  };
  f.main=(p,q)=>{
    if(p!==f.a)return {kind:'done'};
    if(q.phase==='main1'&&attacker.zone==='hand'){
      const row=q.casts.find(row=>row.card===attacker);assert.ok(row);
      return {kind:'cast',card:attacker,from:row.from,alt:row.alt};
    }
    if(q.phase==='main2'&&f.a.turnsStarted===2&&!extraPaid){
      const row=q.casts.find(row=>row.card===assault);assert.ok(row,'real extra-combat spell is offered in the actual second main');
      extraPaid=true;return {kind:'cast',card:assault,from:row.from,alt:row.alt};
    }
    return {kind:'done'};
  };
  f.attackers=(p,q)=>p===f.a&&f.a.turnsStarted===2&&q.eligible.includes(attacker)?[{card:attacker,target:f.b}]:[];
  f.priority=(p,q)=>{
    if(snag&&!prevented&&p===f.b&&f.g.step==='attackers'&&f.g.combat?.attackers.includes(attacker)){
      const row=q.casts.find(row=>row.card===snag);assert.ok(row,'native paid instant prevention response');
      prevented=true;return {kind:'cast',card:snag,from:row.from,alt:row.alt};
    }
    return {kind:'pass'};
  };
  await f.g.runTurn();for(let n=0;n<4;n++)await f.g.runTurn();
  assert.equal(extraPaid,true);assert.equal(prevented,prevention);
  assert.equal(f.events.filter(row=>row.event==='attacks'&&row.data.card===attacker).length,2,'two real combat declarations occur in the same turn');
  assert.equal(f.b.life,prevention?40:28,'native normal and extra-combat damage obey the printed all-turn duration');
  assert.equal(preventedHits.reduce((n,hit)=>n+hit.n,0),prevention?12:0,'dispatch observer counts each native prevention event once');
  stable(f,'native whole-turn prevention with extra combat');
});
