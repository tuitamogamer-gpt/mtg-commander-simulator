import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M=loadEngine();
function fixture(){
  const game=new M.Game({seed:10102026,paced:false});game.speedFactor=0;
  const f={target:null};
  const decide=async(_g,q)=>{
    if(q.type==='priority')return{kind:'pass'};
    if(q.type==='chooseTargets')return f.target&&q.candidates.includes(f.target)?[f.target]:q.candidates.slice(0,q.min||0);
    if(q.type==='chooseCards')return q.from.slice(0,q.min||0);
    if(q.type==='chooseOption')return q.options.find(o=>o.key==='yes')?.key||q.options[0]?.key;
    if(q.type==='orderTriggers')return q.triggers;
    return null;
  };
  const me=game.addPlayer('Artifact borrower',{name:'Native borrowed audit'},{decide},false);
  game.addPlayer('Native rival',{name:'Native borrowed audit'},{decide},false);
  game.turnPlayer=me;game.turnNo=8;game.phase='main1';game.step='main';
  const put=(name,zone='battlefield')=>{assert.ok(M.DEFS[name]);const c=new M.CardInst(M.DEFS[name],me);c.zone=zone;c.ctrl=me;c.sick=false;(zone==='battlefield'?game.battlefield:me[zone]).push(c);game.recalc();return c;};
  for(const p of game.players)for(let i=0;i<20;i++){const c=new M.CardInst(M.DEFS.Island,p);c.zone='library';p.library.push(c);}
  const settle=async()=>{for(let i=0;i<60;i++){await game.flushTriggers();if(!game.stack.length){assertGameStateInvariants(game);return;}await game.resolveTop();}assert.fail('native borrowed stack settles');};
  const cast=async(name,lands)=>{const c=put(name,'hand');const payment=lands.map(n=>put(n));assert.equal(await game.castSpell(me,c,{from:'hand'}),true);assert.equal(c.castMeta.manaSpent,lands.length);assert.ok(payment.every(land=>land.tapped));await settle();return c;};
  return Object.assign(f,{game,me,put,cast,settle});
}

test('Mystic Forge: an actually paid native artifact pays life and taps to exile the top card',async()=>{
  const f=fixture(),forge=await f.cast('Mystic Forge',Array(4).fill('Wastes'));
  const entry=f.game.activatableList(f.me).find(e=>e.card===forge&&/exile the top/i.test(e.ability?.label||''));
  assert.ok(entry,'printed life-and-tap ability is offered');
  const top=f.me.library.at(-1),life=f.me.life;
  assert.equal(await f.game.activateAbility(f.me,entry),true);await f.settle();
  assert.equal(forge.tapped,true);assert.equal(f.me.life,life-1);assert.equal(top.zone,'exile');assert.equal(top.zoneVersion,1);
});

test('Trazyn: a paid, natively equipped borrower activates a previously offered Mystic Forge ability',async()=>{
  const f=fixture(),forge=await f.cast('Mystic Forge',Array(4).fill('Wastes'));
  assert.ok(f.game.activatableList(f.me).some(e=>e.card===forge&&/exile the top/i.test(e.ability?.label||'')),'the actual donor offered its printed ability');
  f.target=forge;await f.cast('Disenchant',['Plains','Wastes']);f.target=null;
  assert.equal(forge.zone,'graveyard');assert.equal(forge.zoneVersion,2);
  const trazyn=await f.cast('Trazyn the Infinite',['Swamp','Swamp','Wastes','Wastes','Wastes','Wastes']);
  const greaves=await f.cast('Lightning Greaves',['Wastes','Wastes']);
  f.target=trazyn;const equip=f.game.activatableList(f.me).find(e=>e.card===greaves&&e.equip);
  assert.ok(equip);assert.equal(await f.game.activateAbility(f.me,equip),true);await f.settle();f.target=null;
  assert.equal(greaves.attachedTo,trazyn.iid);assert.equal(trazyn.kw('haste'),true);
  const entry=f.game.activatableList(f.me).find(e=>e.card===trazyn&&/exile the top/i.test(e.ability?.label||''));
  assert.ok(entry,'printed inherited ability is actually offered');
  const top=f.me.library.at(-1),life=f.me.life;
  assert.equal(await f.game.activateAbility(f.me,entry),true);await f.settle();
  assert.equal(trazyn.tapped,true);assert.equal(f.me.life,life-1);assert.equal(top.zone,'exile');assert.equal(top.zoneVersion,1);
  const reversal=f.put('Dramatic Reversal','hand');f.put('Island');f.put('Wastes');
  assert.equal(await f.game.castSpell(f.me,reversal,{from:'hand'}),true);await f.settle();
  assert.equal(reversal.castMeta.manaSpent,2);assert.equal(trazyn.tapped,false);
  const secondTop=f.me.library.at(-1),again=f.game.activatableList(f.me).find(e=>e.card===trazyn&&/exile the top/i.test(e.ability?.label||''));
  assert.ok(again,'Trazyn has no once-per-turn limit after a real untap effect');
  assert.equal(await f.game.activateAbility(f.me,again),true);await f.settle();
  assert.equal(trazyn.tapped,true);assert.equal(f.me.life,life-2);assert.equal(secondTop.zone,'exile');assert.equal(secondTop.zoneVersion,1);
});

test('Trazyn: a borrowed black activation pays one native Drought sacrifice',async()=>{
  const f=fixture(),donor=await f.cast('Ethersworn Adjudicator',['Island','Wastes','Wastes','Wastes','Wastes']);
  const greaves=await f.cast('Lightning Greaves',['Wastes','Wastes']);
  f.target=donor;let equip=f.game.activatableList(f.me).find(e=>e.card===greaves&&e.equip);
  assert.ok(equip);assert.equal(await f.game.activateAbility(f.me,equip),true);await f.settle();
  const firstBear=f.put('Grizzly Bears');f.target=firstBear;
  const firstPayment=['Plains','Swamp','Wastes'].map(n=>f.put(n));
  const original=f.game.activatableList(f.me).find(e=>e.card===donor&&/destroy/i.test(e.ability?.label||''));
  assert.ok(original,'the actual donor offered its printed destroy ability with native haste and mana');
  assert.equal(await f.game.activateAbility(f.me,original),true);await f.settle();
  assert.ok(firstPayment.every(c=>c.tapped));assert.equal(firstBear.zone,'graveyard');
  f.target=f.put('Silvercoat Lion');equip=f.game.activatableList(f.me).find(e=>e.card===greaves&&e.equip);
  assert.ok(equip);assert.equal(await f.game.activateAbility(f.me,equip),true);await f.settle();
  assert.equal(donor.kw('shroud'),false,'native Equip moved the Greaves before the targeted removal');
  f.target=donor;await f.cast('Disenchant',['Plains','Wastes']);f.target=null;assert.equal(donor.zone,'graveyard');
  const trazyn=await f.cast('Trazyn the Infinite',['Swamp','Swamp','Wastes','Wastes','Wastes','Wastes']);
  f.target=trazyn;equip=f.game.activatableList(f.me).find(e=>e.card===greaves&&e.equip);
  assert.ok(equip);assert.equal(await f.game.activateAbility(f.me,equip),true);await f.settle();f.target=null;
  await f.cast('Drought',['Plains','Plains','Wastes','Wastes']);
  const bear=f.put('Grizzly Bears');f.target=bear;
  const payment=['Plains','Swamp','Wastes'].map(n=>f.put(n));
  const entry=f.game.activatableList(f.me).find(e=>e.card===trazyn&&/destroy/i.test(e.ability?.label||''));
  assert.ok(entry,'the inherited black activation is offered with a separate native Swamp available');
  const before=f.me.graveyard.filter(c=>c.name==='Swamp').length;
  assert.equal(await f.game.activateAbility(f.me,entry),true);await f.settle();
  assert.ok(payment.every(c=>c.tapped));assert.equal(trazyn.tapped,true);assert.equal(bear.zone,'graveyard');
  assert.equal(f.me.graveyard.filter(c=>c.name==='Swamp').length,before+1,'one black activation symbol pays one additional Swamp, despite the cloned donor condition');
});
