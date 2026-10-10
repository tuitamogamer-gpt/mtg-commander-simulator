import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M=loadEngine();
function fixture(){
  const game=new M.Game({seed:101020267,paced:false});game.speedFactor=0;
  const f={game,target:null,payments:new Map(),modes:[],mode:null};
  const decide=async(_g,q)=>{
    if(q.type==='priority')return {kind:'pass'};
    if(q.type==='chooseManaSources')return f.payments.has(q.player)?{cards:f.payments.get(q.player)}:{auto:true};
    if(q.type==='chooseTargets')return q.candidates.includes(f.target)?[f.target]:q.candidates.slice(0,q.min||0);
    if(q.type==='chooseX')return Math.max(q.min||0,Math.min(1,q.max));
    if(q.type==='chooseCards')return q.from.slice(0,q.min||0);
    if(q.type==='chooseOption'){
      if(q.aiHint?.kind==='alternativeManaPayment'){
        f.modes.push({symbol:q.aiHint.symbol,kind:q.aiHint.paymentKind,options:q.options.map(x=>x.key)});
        return q.options.some(x=>x.key===f.mode)?f.mode:q.options[0]?.key;
      }
      return q.options[0]?.key;
    }
    if(q.type==='orderTriggers')return q.triggers;
    if(q.type==='scry')return {top:q.cards,bottom:[]};
    return null;
  };
  f.me=game.addPlayer('Ability symbol payer',{}, {decide},false);
  f.rival=game.addPlayer('Ability symbol rival',{}, {decide},false);
  game.turnPlayer=f.me;game.turnNo=9;game.phase='main1';game.step='main';
  f.put=(name,zone='battlefield',owner=f.me)=>{
    assert.ok(M.DEFS[name],name);const c=new M.CardInst(M.DEFS[name],owner);c.zone=zone;c.sick=false;
    (zone==='battlefield'?game.battlefield:owner[zone]).push(c);game.recalc();return c;
  };
  for(const player of [f.me,f.rival])for(let i=0;i<24;i++)f.put('Island','library',player);
  f.settle=async()=>{let n=40;while((game.stack.length||game.pendingTriggers.length)&&n--){await game.flushTriggers();if(game.stack.length)await game.resolveTop();}assert.ok(n>0);assertGameStateInvariants(game);};
  f.cast=async(name,lands,owner=f.me)=>{
    const c=f.put(name,'hand',owner),sources=lands.map(n=>f.put(n,'battlefield',owner));
    assert.ok(game.castableList(owner).some(e=>e.card===c),name+' native spell offer');
    const old=owner.manualMana;owner.manualMana=true;f.payments.set(owner,sources);
    try{assert.equal(await game.castSpell(owner,c,{from:'hand'}),true,name);await f.settle();}
    finally{owner.manualMana=old;f.payments.delete(owner);}
    assert.ok(sources.every(c=>c.tapped),name+' paid native sources');return c;
  };
  f.activate=async(card)=>{
    const entry=game.activatableList(f.me).find(e=>e.card===card&&e.ability&&!e.equip);assert.ok(entry,card.name+' native ability offer');
    assert.equal(await game.activateAbility(f.me,entry),true);await f.settle();
  };
  return f;
}


async function braceletFixture(){
  const f=fixture(),bear=await f.cast('Grizzly Bears',['Forest','Wastes']),bracelet=await f.cast('The Dominion Bracelet',['Wastes','Wastes']);
  f.equip=async(target)=>{
    const land=f.put('Wastes'),source=f.game.manaSources(f.me).find(row=>row.card===land);assert.ok(source);
    assert.equal(await f.game.activateManaSource(f.me,source,source.produce.find(row=>row.C===1)),true);
    f.target=target;const entry=f.game.activatableList(f.me).find(e=>e.card===bracelet&&e.equip);assert.ok(entry);
    assert.equal(await f.game.activateAbility(f.me,entry),true);await f.settle();assert.equal(land.tapped,true);assert.equal(bracelet.attachedTo,target.iid);
  };
  await f.equip(bear);assert.equal(bear.power,3);
  f.payment=Array.from({length:12},()=>f.put('Wastes'));
  f.offered=()=>f.game.activatableList(f.me).find(e=>e.card===bear&&e.ability?.oracleBraceletV87);
  f.old=f.offered();assert.ok(f.old,'the actual discounted granted ability is offered with12 printed mana sources');
  return Object.assign(f,{bear,bracelet});
}

test('Paid Bracelet moving to another paid Bear invalidates the former host ability without spending mana',async()=>{
  const f=await braceletFixture(),other=await f.cast('Grizzly Bears',['Forest','Wastes']);
  await f.equip(other);assert.equal(f.bear.power,2);assert.equal(f.bracelet.attachedTo,other.iid);
  f.payment.push(f.put('Wastes'),f.put('Wastes'));
  assert.equal(f.payment.filter(c=>!c.tapped).length,14,'the former host could pay its13-mana cost if it still had the granted ability');
  const pool=JSON.stringify(f.me.pool),sources=f.payment.map(c=>c.tapped);
  assert.equal(await f.game.activateAbility(f.me,f.old),false);
  assert.equal(f.bracelet.zone,'battlefield');assert.equal(f.bracelet.attachedTo,other.iid);assert.equal(JSON.stringify(f.me.pool),pool);assert.deepEqual(f.payment.map(c=>c.tapped),sources);
  assert.equal(f.offered(),undefined);assertGameStateInvariants(f.game);
});

test('Paid bounce and recast preserve Bracelet host identity while rejecting the old grant version and accepting a fresh actual activation',async()=>{
  const f=await braceletFixture(),iid=f.bear.iid,version=f.bear.zoneVersion;f.target=f.bear;
  await f.cast('Unsummon',['Island'],f.rival);assert.equal(f.bear.zone,'hand');assert.equal(f.bracelet.attachedTo,null);
  const recastSources=['Forest','Wastes'].map(n=>f.put(n));
  f.me.manualMana=true;f.payments.set(f.me,recastSources);
  assert.equal(await f.game.castSpell(f.me,f.bear,{from:'hand'}),true);await f.settle();f.me.manualMana=false;f.payments.delete(f.me);
  assert.equal(f.bear.iid,iid);assert.ok(f.bear.zoneVersion>version);assert.ok(recastSources.every(c=>c.tapped));await f.equip(f.bear);
  const pool=JSON.stringify(f.me.pool),tapped=f.payment.map(c=>c.tapped);
  assert.equal(await f.game.activateAbility(f.me,f.old),false);assert.equal(f.bracelet.zone,'battlefield');assert.equal(JSON.stringify(f.me.pool),pool);assert.deepEqual(f.payment.map(c=>c.tapped),tapped);
  const entry=f.offered();assert.ok(entry);f.target=f.rival;
  assert.equal(await f.game.activateAbility(f.me,entry),true);await f.settle();
  assert.equal(f.bracelet.zone,'exile');assert.equal(f.bear.zone,'battlefield');assert.equal(f.bear.power,2);assert.ok(f.payment.every(c=>c.tapped));
  assert.deepEqual(Array.from(f.game.c1516TurnControls,row=>({subject:row.subject,controller:row.controller})),[{subject:f.rival.idx,controller:f.me.idx}]);
});
