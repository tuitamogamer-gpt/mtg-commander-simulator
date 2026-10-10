import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M=loadEngine();
test('Paid Illuminor can sacrifice a real zero-mana creature for zero output and still pay its cost and trigger actual death effects',async()=>{
  const game=new M.Game({seed:101020269,paced:false});game.speedFactor=0;
  let target=null,body=null;
  const decide=async(_g,q)=>{
    if(q.type==='priority')return {kind:'pass'};
    if(q.type==='chooseManaSources')return {auto:true};
    if(q.type==='chooseTargets')return q.candidates.includes(target)?[target]:q.candidates.slice(0,q.min||0);
    if(q.type==='chooseCards')return q.from.includes(body)?[body]:q.from.slice(0,q.min||0);
    if(q.type==='chooseOption')return q.options[0]?.key;
    if(q.type==='orderTriggers')return q.triggers;
    return null;
  };
  const me=game.addPlayer('Zero-output payer',{}, {decide},false),rival=game.addPlayer('Zero-output rival',{}, {decide},false);
  game.turnPlayer=me;game.turnNo=9;game.phase='main1';game.step='main';
  const put=(name,zone='battlefield')=>{assert.ok(M.DEFS[name]);const c=new M.CardInst(M.DEFS[name],me);c.zone=zone;c.sick=false;(zone==='battlefield'?game.battlefield:me[zone]).push(c);game.recalc();return c;};
  const settle=async()=>{let n=40;while((game.stack.length||game.pendingTriggers.length)&&n--){await game.flushTriggers();if(game.stack.length)await game.resolveTop();}assert.ok(n>0);assertGameStateInvariants(game);};
  const cast=async(name,lands=[])=>{const c=put(name,'hand'),sources=lands.map(n=>put(n));assert.ok(game.castableList(me).some(e=>e.card===c));assert.equal(await game.castSpell(me,c,{from:'hand'}),true);await settle();assert.ok(sources.every(c=>c.tapped));return c;};
  const source=await cast('Illuminor Szeras',['Swamp','Wastes','Wastes']);
  body=await cast('Ornithopter');await cast('Blood Artist',['Swamp','Wastes']);
  assert.equal(body.mv,0);assert.equal(source.sick,true);
  assert.equal(game.activatableList(me).some(e=>e.card===source&&e.manaAbility),false,'zero output does not bypass summoning sickness on its tap-symbol cost');
  const greaves=await cast('Lightning Greaves',['Wastes','Wastes']);target=source;
  const equip=game.activatableList(me).find(e=>e.card===greaves&&e.equip);assert.ok(equip);
  assert.equal(await game.activateAbility(me,equip),true);await settle();assert.equal(source.kw('haste'),true);
  const entry=game.activatableList(me).find(e=>e.card===source&&e.manaAbility&&e.manaSource.produce[0].B===0);assert.ok(entry,'the legal zero-output printed mana action is offered');
  const pool=JSON.stringify(me.pool),receipts=me.poolMeta.length,life=me.life,rivalLife=rival.life;
  target=rival;
  assert.equal(await game.activateAbility(me,entry),true);await settle();
  assert.equal(source.tapped,true);assert.equal(body.zone,'graveyard');
  assert.equal(JSON.stringify(me.pool),pool);assert.equal(me.poolMeta.length,receipts);
  assert.equal(me.life,life+1);assert.equal(rival.life,rivalLife-1);
});
