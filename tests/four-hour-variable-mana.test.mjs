import test from 'node:test';
import assert from 'node:assert/strict';
import {M, table, paidCast, stable} from './helpers/second-audit-combat-fixtures.mjs';

async function rocketsTable() {
  const f=table(), rocket=f.put("Wizard's Rockets",'hand');
  f.lands(['Wastes']);
  await paidCast(f,f.a,rocket);
  assert.equal(rocket.tapped,true);
  // Use an actual beginning phase to untap the artifact before activating it.
  f.g.turnNo++;await f.g.runBeginningPhase(f.a);
  f.g.phase='main1';f.g.step='main';
  f.rocket=rocket;return f;
}
for(const floating of [true,false])test(`Wizard's Rockets pays a printed RG spell from ${floating?'floating colorless mana':'untapped colorless lands'}`,async()=>{
  const f=await rocketsTable(), druid=f.put('Zhur-Taa Druid','hand');f.put('Wastes');
  const lands=f.g.lands(f.a);
  if(floating)for(const land of lands){const row=f.g.manaSources(f.a).find(row=>row.card===land);assert.ok(row);assert.equal(await f.g.activateManaSource(f.a,row,{C:1}),true);}
  assert.equal(f.a.pool.C,floating?2:0);
  const hand=f.a.hand.length;
  await paidCast(f,f.a,druid);
  assert.equal(druid.zone,'battlefield');
  assert.equal(f.rocket.zone,'graveyard');
  assert.ok(lands.every(land=>land.tapped));
  assert.equal(Object.values(f.a.pool).reduce((a,b)=>a+b,0),0);
  assert.equal(f.a.hand.length,hand,'Rockets draws one card after the creature leaves the hand');
  assert.equal(druid.castMeta.manaSpent,2);
  assert.equal(f.g.manaNeededV60,undefined,'temporary solver context is restored');
  stable(f,'paid native Rockets conversion');
});

test('manual Wizard\'s Rockets conversion still pays X and draws once',async()=>{
  const f=await rocketsTable();f.put('Wastes');
  f.x=()=>2;const colors=['R','G'];f.option=(p,q)=>q.options.some(row=>row.key===colors[0])?colors.shift():q.options[0]?.key;
  const entry=f.g.activatableList(f.a).find(row=>row.card===f.rocket&&row.manaAbility);
  assert.ok(entry);const hand=f.a.hand.length;
  assert.equal(await f.g.activateAbility(f.a,entry),true);await f.g.priorityRound(f.a);
  assert.equal(f.rocket.zone,'graveyard');assert.equal(f.a.pool.R,1);assert.equal(f.a.pool.G,1);
  assert.equal(f.a.hand.length,hand+1);
  stable(f,'manual native Rockets conversion');
});

function rocketsPlan(f) {
  const druid=f.put('Zhur-Taa Druid','hand');
  const plan=f.g.manaSolve(f.a,M.parseCost('{R}{G}'),{card:druid,castOpts:{}});
  assert.ok(plan);
  const step=plan.plan.find(row=>row.src?.card===f.rocket);assert.ok(step);
  return step;
}

test('a cached Rockets plan cannot activate after paid Stony Silence disables it',async()=>{
  const f=await rocketsTable();f.put('Wastes');const step=rocketsPlan(f);
  f.lands(['Plains','Plains']);const silence=f.put('Stony Silence','hand');
  await paidCast(f,f.a,silence);
  const before={...f.a.pool};
  assert.equal(await f.g.activateManaSource(f.a,step.src,step.chosen,null,step.anyColors),false);
  assert.deepEqual({...f.a.pool},before);assert.equal(f.rocket.zone,'battlefield');assert.equal(f.rocket.tapped,false);
  assert.equal(f.g.manaNeededV60,undefined);
  assert.equal(f.g.activatableList(f.a).some(row=>row.card===f.rocket),false);
  stable(f,'disabled Rockets plan');
});

for(const failure of ['decline','throw'])test(`Rockets restores solver context when its color decision ${failure==='throw'?'throws':'is invalid'}`,async()=>{
  const f=await rocketsTable();f.put('Wastes');const step=rocketsPlan(f),before={...f.a.pool};
  f.option=()=>{if(failure==='throw')throw Error('color choice interrupted');return 'invalid-color';};
  if(failure==='throw')await assert.rejects(f.g.activateManaSource(f.a,step.src,step.chosen,null,[]),/color choice interrupted/);
  else assert.equal(await f.g.activateManaSource(f.a,step.src,step.chosen,null,[]),false);
  assert.equal(f.g.manaNeededV60,undefined);assert.deepEqual({...f.a.pool},before);
  assert.equal(f.rocket.zone,'battlefield');assert.equal(f.rocket.tapped,false);
  stable(f,'interrupted Rockets choice');
});
