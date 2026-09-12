import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M=loadEngine();
async function pendingTrigger() {
  const f=context(M,'human',3);
  const valgavoth=put(M,f.game,f.a,'Valgavoth, Harrower of Souls');
  f.game.turnPlayer=f.b;
  await f.game.loseLife(f.b,1,'opponent first life loss');
  await f.game.flushTriggers();
  assert.equal(f.game.stack.length,1);
  return {...f,valgavoth};
}

for(const zone of ['graveyard','exile','hand']) {
  test(`Valgavoth trigger still draws after source moves to ${zone}, without adding a counter there`,async()=>{
    const f=await pendingTrigger();
    await f.game.move(f.valgavoth,zone);
    await settle(f.game);
    assert.equal(f.a.hand.filter(c=>c!==f.valgavoth).length,1);
    assert.equal(f.valgavoth.counters['+1/+1']||0,0);
    assert.equal(f.valgavoth.zone,zone);
    assertGameStateInvariants(f.game);
  });

  test(`Valgavoth returning from ${zone} does not receive its previous incarnation's counter`,async()=>{
    const f=await pendingTrigger(),previousVersion=f.valgavoth.zoneVersion;
    await f.game.move(f.valgavoth,zone);
    await f.game.move(f.valgavoth,'battlefield',{ctrl:f.a});
    assert.notEqual(f.valgavoth.zoneVersion,previousVersion);
    await settle(f.game);
    assert.equal(f.a.hand.length,1);
    assert.equal(f.valgavoth.counters['+1/+1']||0,0);
    assert.equal(f.valgavoth.power,4);
    assertGameStateInvariants(f.game);
  });
}

test('Valgavoth changing controller keeps its counter but original trigger controller draws',async()=>{
  const f=await pendingTrigger();
  f.valgavoth.ctrl=f.others[1];f.game.recalc();
  await settle(f.game);
  assert.equal(f.valgavoth.counters['+1/+1'],1);
  assert.equal(f.a.hand.length,1);
  assert.equal(f.others[1].hand.length,0);
  assertGameStateInvariants(f.game);
});

test('Valgavoth phasing out before resolution still draws without receiving a counter',async()=>{
  const f=await pendingTrigger();
  f.valgavoth.phasedOut=true;f.game.recalc();
  await settle(f.game);
  assert.equal(f.a.hand.length,1);
  assert.equal(f.valgavoth.counters['+1/+1']||0,0);
  assertGameStateInvariants(f.game);
});

async function pendingLandfall() {
  const f=context(M,'human',3);
  const harvester=put(M,f.game,f.a,'Nightshade Harvester');
  const land=put(M,f.game,f.b,'Swamp','hand');
  f.game.turnPlayer=f.b;
  assert.equal(await f.game.playLand(f.b,land),true);
  await f.game.flushTriggers();
  assert.equal(f.game.stack.length,1);
  return {...f,harvester,land};
}

test('Nightshade Harvester loses its old counter after blinking, while the entrant still loses life',async()=>{
  const f=await pendingLandfall();
  await f.game.move(f.harvester,'exile');
  await f.game.move(f.harvester,'battlefield',{ctrl:f.a});
  await settle(f.game);
  assert.equal(f.b.life,39);
  assert.equal(f.harvester.counters['+1/+1']||0,0);
  assertGameStateInvariants(f.game);
});

test('Nightshade Harvester affects the land entry controller after control changes',async()=>{
  const f=await pendingLandfall();
  f.land.ctrl=f.others[1];f.game.recalc();
  await settle(f.game);
  assert.equal(f.b.life,39);
  assert.equal(f.others[1].life,40);
  assert.equal(f.harvester.counters['+1/+1'],1);
  assertGameStateInvariants(f.game);
});

test('Nightshade Harvester still affects the entrant after the land leaves the battlefield',async()=>{
  const f=await pendingLandfall();
  await f.game.move(f.land,'hand');
  await settle(f.game);
  assert.equal(f.b.life,39);
  assert.equal(f.harvester.counters['+1/+1'],1);
  assertGameStateInvariants(f.game);
});

async function pendingArsonist() {
  const f=context(M,'human',3);
  const arsonist=put(M,f.game,f.a,'Gleeful Arsonist');
  const spell=put(M,f.game,f.b,'Sol Ring','hand');
  f.game.addCounters(arsonist,'+1/+1',4);
  f.b.pool.C=1;f.game.turnPlayer=f.b;
  assert.equal(await f.game.castSpell(f.b,spell,{from:'hand'}),true);
  await f.game.flushTriggers();
  return {...f,arsonist};
}

for(const returns of [false,true]) {
  test(`Gleeful Arsonist uses departing power when ${returns?'blinked':'removed'} in response`,async()=>{
    const f=await pendingArsonist();
    // The relevant power is at departure, not at trigger creation.
    f.game.addCounters(f.arsonist,'+1/+1',2);
    await f.game.move(f.arsonist,'exile');
    if(returns)await f.game.move(f.arsonist,'battlefield',{ctrl:f.a});
    await settle(f.game);
    assert.equal(f.b.life,33);
    assertGameStateInvariants(f.game);
  });
}

test('Gleeful Arsonist uses its current power when it remains on the battlefield',async()=>{
  const f=await pendingArsonist();
  f.game.addCounters(f.arsonist,'+1/+1',3);
  await settle(f.game);
  assert.equal(f.b.life,32);
  assertGameStateInvariants(f.game);
});
