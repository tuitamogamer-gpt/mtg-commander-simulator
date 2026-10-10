import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M=loadEngine();
function fixture(){
  const game=new M.Game({seed:101020270,paced:false});game.speedFactor=0;
  const f={game,target:null,body:null};
  const decide=async(_g,q)=>{
    if(q.type==='priority')return {kind:'pass'};
    if(q.type==='chooseManaSources')return {auto:true};
    if(q.type==='chooseTargets')return q.candidates.includes(f.target)?[f.target]:q.candidates.slice(0,q.min||0);
    if(q.type==='chooseCards')return q.from.includes(f.body)?[f.body]:q.from.slice(0,q.min||0);
    if(q.type==='chooseOption')return q.options[0]?.key;
    if(q.type==='orderTriggers')return q.triggers;
    return null;
  };
  f.me=game.addPlayer('Face-up payer',{}, {decide},false);f.rival=game.addPlayer('Face-up rival',{}, {decide},false);
  game.turnPlayer=f.me;game.turnNo=9;game.phase='main1';game.step='main';
  f.put=(name,zone='battlefield')=>{assert.ok(M.DEFS[name]);const c=new M.CardInst(M.DEFS[name],f.me);c.zone=zone;c.sick=false;(zone==='battlefield'?game.battlefield:f.me[zone]).push(c);game.recalc();return c;};
  f.settle=async()=>{let n=40;while((game.stack.length||game.pendingTriggers.length)&&n--){await game.flushTriggers();if(game.stack.length)await game.resolveTop();}assert.ok(n>0);assertGameStateInvariants(game);};
  f.cast=async(name,lands=[])=>{const c=f.put(name,'hand'),sources=lands.map(n=>f.put(n));assert.ok(game.castableList(f.me).some(e=>e.card===c));assert.equal(await game.castSpell(f.me,c,{from:'hand'}),true);await f.settle();assert.ok(sources.every(c=>c.tapped));return c;};
  return f;
}

test('Actual paid Birchlore turn-face-up cannot leave Illuminor using the old zero-mana amount for its one-mana sacrificed body',async()=>{
  const f=fixture(),source=await f.cast('Illuminor Szeras',['Swamp','Wastes','Wastes']);
  const body=f.put('Birchlore Rangers','hand'),morphPayment=['Wastes','Wastes','Wastes'].map(n=>f.put(n));
  const morph=f.game.castableList(f.me).find(e=>e.card===body&&e.alt?.faceDownCast);assert.ok(morph);
  assert.equal(await f.game.castSpell(f.me,body,{from:morph.from,alt:morph.alt}),true);await f.settle();
  assert.ok(morphPayment.every(c=>c.tapped));assert.equal(body.faceDown,true);assert.equal(body.mv,0);
  const greaves=await f.cast('Lightning Greaves',['Wastes','Wastes']);f.target=source;
  const equip=f.game.activatableList(f.me).find(e=>e.card===greaves&&e.equip);assert.ok(equip);
  assert.equal(await f.game.activateAbility(f.me,equip),true);await f.settle();
  const old=f.game.activatableList(f.me).find(e=>e.card===source&&e.manaAbility&&e.manaSource.produce[0].B===0);assert.ok(old);
  const version=body.zoneVersion,green=f.put('Forest');
  const up=f.game.activatableList(f.me).find(e=>e.card===body&&e.turnFaceUp);assert.ok(up);
  assert.equal(await f.game.activateAbility(f.me,up),true);await f.settle();assert.equal(green.tapped,true);
  assert.equal(body.faceDown,false);assert.equal(body.zoneVersion,version);assert.equal(body.mv,1);
  f.body=body;
  const beforePool=JSON.stringify(f.me.pool),result=await f.game.activateAbility(f.me,old);await f.settle();
  if(result){
    assert.equal(body.zone,'graveyard');assert.equal(source.tapped,true);
    assert.equal(f.me.pool.B,1,'an accepted activation must use the actual mana value of the sacrificed face-up body');
  }else{
    assert.equal(body.zone,'battlefield');assert.equal(source.tapped,false);assert.equal(JSON.stringify(f.me.pool),beforePool,'a rejected stale amount must not pay any source/body cost');
    const fresh=f.game.activatableList(f.me).find(e=>e.card===source&&e.manaAbility&&e.manaSource.produce[0].B===1);assert.ok(fresh);
    assert.equal(await f.game.activateAbility(f.me,fresh),true);await f.settle();
    assert.equal(body.zone,'graveyard');assert.equal(source.tapped,true);assert.equal(f.me.pool.B,1);
  }
});
