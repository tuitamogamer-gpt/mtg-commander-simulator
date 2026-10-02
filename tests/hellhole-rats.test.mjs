import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';

const M=loadEngine();

async function resolveRats({discardCost,sourceCost='{2}{B}{R}',afterDiscard}={}) {
  const game=new M.Game({seed:1002,paced:false});
  let target;
  const controller={decide:async(g,q)=>{
    if(q.type==='chooseTargets')return [target];
    if(q.type==='chooseCards')return q.from.slice(0,q.min);
    if(q.type==='orderTriggers')return q.triggers;
    if(q.type==='priority')return {kind:'pass'};
    return null;
  }};
  const owner=game.addPlayer('Rats controller',{name:'Test'},controller,false);
  target=game.addPlayer('Discarding player',{name:'Test'},controller,false);
  game.turnPlayer=owner;game.turnNo=5;game.phase='main1';
  game.priorityRound=async()=>{};
  let discarded;
  if(discardCost!==undefined){
    const definition=discardCost===''?M.DEFS.Forest:M.DEFS['Grizzly Bears'];
    discarded=new M.CardInst({...definition,name:'Discard witness',cost:discardCost},target);
    discarded.zone='hand';target.hand.push(discarded);
  }
  if(afterDiscard){
    const discard=game.discard;
    game.discard=async function(...args){await discard.apply(this,args);afterDiscard(discarded);};
  }
  const rats=new M.CardInst({...M.DEFS['Hellhole Rats'],cost:sourceCost},owner);
  rats.zone='nowhere';
  const life=target.life;
  await game.move(rats,'battlefield',{ctrl:owner});
  await game.flushTriggers();
  const trigger=game.stack.find(object=>object.srcCard===rats&&object.kind==='trigger');
  assert.ok(trigger,'the printed ETB ability reaches the stack');
  assert.equal(trigger.targets[0],target,'discard and damage use the announced player');
  await game.resolveTop();
  assert.equal(trigger.ctx.oracleSourceCapture.eventCard,rats,'the original ETB event remains bound');
  return {damage:life-target.life,discarded,rats};
}

for(const [label,discardCost,damage] of [['land','',0],['two-mana card','{1}{G}',2],['five-mana card','{5}',5]]){
  test(`Hellhole Rats deals the discarded ${label}'s mana value`,async()=>{
    const result=await resolveRats({discardCost});
    assert.equal(result.discarded.zone,'graveyard');
    assert.equal(result.damage,damage);
  });
}

test('Hellhole Rats deals zero damage when the target has no card to discard',async()=>{
  assert.equal((await resolveRats()).damage,0);
});

test('Hellhole Rats uses the discarded card rather than its changed source mana value',async()=>{
  const result=await resolveRats({discardCost:'{1}{G}',sourceCost:'{9}'});
  assert.equal(result.rats.mv,9);
  assert.equal(result.damage,2);
});

test('Hellhole Rats retains the discarded card mana value across the zone change',async()=>{
  const result=await resolveRats({discardCost:'{1}{G}',afterDiscard:card=>{card.def={...card.def,cost:'{12}'};}});
  assert.equal(result.discarded.mv,12);
  assert.equal(result.damage,2);
});
