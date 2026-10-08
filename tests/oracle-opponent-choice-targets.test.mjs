import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {choose} from './helpers/oracle-v30-permanents-proof.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M=loadEngine();

function sameCards(actual,expected,message) {
  assert.equal(actual.length,expected.length,message);
  expected.forEach((card,index)=>assert.ok(actual[index]===card,message));
}

function arenaGame(role) {
  const f=context(M,role,2),{game:g,a,b,others}=f,third=others[1];
  const arena=put(M,g,a,'Arena'),own=put(M,g,a,'Elite Vanguard');
  const enemy=put(M,g,b,'Elite Vanguard'),foreign=put(M,g,third,'Elite Vanguard');
  const choices=[];
  let selectedOpponent=b;
  for(const opponent of others) {
    const decide=opponent.controller.decide.bind(opponent.controller);
    opponent.controller={decide:async(game,query)=>{
      if(query.type==='chooseTargets')choices.push({player:opponent,candidates:query.candidates.slice()});
      return decide(game,query);
    }};
  }
  choose(a,query=>{
    if(query.type==='chooseOption') {
      const opponent=query.options.find(option=>String(option.key)===String(selectedOpponent.idx));
      if(opponent)return {...query,options:[opponent]};
      const yes=query.options.find(option=>option.key==='yes');
      if(yes)return {...query,options:[yes]};
    }
    if(query.type==='chooseTargets'&&query.candidates.includes(own))return {...query,candidates:[own],min:1,max:1};
    return null;
  });
  for(const color of Object.keys(a.pool))a.pool[color]=0;
  a.pool.C=3;
  g.spotlight=async()=>{};
  return {...f,third,arena,own,enemy,foreign,choices,selectOpponent:player=>{selectedOpponent=player;}};
}

async function paidArena(f,role) {
  const {game:g,a,b,arena,own,enemy,choices}=f;
  assert.equal(a.controller instanceof M.AIController,role==='ai');
  const entry=g.activatableList(a).find(row=>row.card===arena&&!row.manaAbility);
  assert.ok(entry,'actual Arena activation is available');
  assert.equal(await g.activateAbility(a,entry),true);
  assert.equal(a.pool.C,0,'the activation pays all three mana');
  assert.equal(arena.tapped,true,'the activation pays its tap cost');
  const ability=g.stack.find(row=>row.srcCard===arena);
  assert.ok(ability,'the paid ability remains on the stack');
  sameCards(ability.targets,[own,enemy],'the ability retains both selected objects');
  assert.equal(choices.length,1);
  assert.equal(choices[0].player,b,'the selected opponent chooses their creature');
  sameCards(choices[0].candidates,[enemy],'another opponent cannot supply that target');
  return ability;
}

test('paid Arena retains its chosen opponent when a creature transfers to another opponent',async()=>{
  for(const role of ['human','ai']) {
    const f=arenaGame(role),{game:g,own,enemy,foreign,third}=f;
    const ability=await paidArena(f,role);
    M.OracleV8Control.gain(g,enemy,third);g.recalc();
    assert.equal(enemy.ctrl,third);
    const checked=g.revalidateTargets(ability.targets,ability.targetSpecs,ability.srcCard,ability.ctrl,ability.targetIdentities);
    assert.equal(checked.targets[0],own);
    assert.equal(checked.targets[1],null,'transfer to another opponent invalidates the chosen opponent target');
    await settle(g);
    assert.equal(own.tapped,true,'the surviving legal target is still tapped');
    assert.equal(enemy.tapped,false,'the illegal target is untouched');
    assert.equal(own.zone,'battlefield');assert.equal(enemy.zone,'battlefield');
    assert.equal(own.damage,0);assert.equal(enemy.damage,0);
    assert.equal(foreign.tapped,false);
    assertGameStateInvariants(g);
  }
});

test('paid Arena still fights legal targets and preserves ordinary target protection',async()=>{
  for(const role of ['human','ai'])for(const hexproof of [false,true]) {
    const f=arenaGame(role),{game:g,own,enemy,foreign}=f;
    await paidArena(f,role);
    if(hexproof)M.E.pumpUntilEOT(g,enemy,0,0,['hexproof']);
    await settle(g);
    assert.equal(own.zone,hexproof?'battlefield':'graveyard');
    assert.equal(enemy.zone,hexproof?'battlefield':'graveyard');
    if(hexproof) {
      assert.equal(own.tapped,true);assert.equal(enemy.tapped,false);
      assert.equal(own.damage,0);assert.equal(enemy.damage,0);
    }
    assert.equal(foreign.zone,'battlefield');assert.equal(foreign.tapped,false);
    assertGameStateInvariants(g);
  }
});

test('an Arena ability copy may bind a different opponent without changing the original choice',async()=>{
  for(const role of ['human','ai']) {
    const f=arenaGame(role),{game:g,a,b,own,enemy,foreign,third,choices}=f;
    const original=await paidArena(f,role);
    f.selectOpponent(third);
    const copy=await g.copyStackAbility(original,a,{mayNewTargets:true});
    assert.ok(copy);
    sameCards(copy.targets,[own,foreign],'the copy has its newly chosen targets');
    assert.equal(choices.length,2);assert.equal(choices[1].player,third);
    sameCards(choices[1].candidates,[foreign],'the newly selected opponent chooses their own creature');
    sameCards(original.targets,[own,enemy],'the original targets remain unchanged');
    assert.equal(original.targetSpecs[1].filter(g,enemy,a,f.arena),true);
    assert.equal(original.targetSpecs[1].filter(g,foreign,a,f.arena),false);
    assert.equal(copy.targetSpecs[1].filter(g,foreign,a,f.arena),true);
    assert.equal(copy.targetSpecs[1].filter(g,enemy,a,f.arena),false);
    await settle(g);
    assert.equal(own.zone,'graveyard');assert.equal(foreign.zone,'graveyard');
    assert.equal(enemy.zone,'battlefield');assert.equal(enemy.ctrl,b);assert.equal(enemy.tapped,true);
    assertGameStateInvariants(g);
  }
});
