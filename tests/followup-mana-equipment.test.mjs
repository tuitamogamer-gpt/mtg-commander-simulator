import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M=loadEngine();
function fixture(role='human'){
  const game=new M.Game({seed:101020265,paced:false});game.speedFactor=0;
  const f={game,target:null,payments:new Map()};
  const decide=async(_g,q)=>{
    if(q.type==='priority')return {kind:'pass'};
    if(q.type==='chooseManaSources')return f.payments.has(q.player)?{cards:f.payments.get(q.player)}:{auto:true};
    if(q.type==='chooseTargets')return q.candidates.includes(f.target)?[f.target]:q.candidates.slice(0,q.min||0);
    if(q.type==='chooseCards')return q.from.slice(0,q.min||0);
    if(q.type==='chooseOption')return q.options[0]?.key;
    if(q.type==='orderTriggers')return q.triggers;
    if(q.type==='scry')return {top:q.cards,bottom:[]};
    return null;
  };
  f.me=game.addPlayer('Equipment payer',{}, {decide},role==='ai');f.rival=game.addPlayer('Equipment rival',{}, {decide},false);
  if(role==='ai')f.me.controller=new M.AIController(f.me,{difficulty:'hard',style:'balanced'});
  game.turnPlayer=f.me;game.turnNo=9;game.phase='main1';game.step='main';
  f.put=(name,zone='battlefield',owner=f.me)=>{
    assert.ok(M.DEFS[name],name);const card=new M.CardInst(M.DEFS[name],owner);card.zone=zone;card.sick=false;
    (zone==='battlefield'?game.battlefield:owner[zone]).push(card);game.recalc();return card;
  };
  for(const p of [f.me,f.rival])for(let i=0;i<24;i++)f.put('Island','library',p);
  f.settle=async()=>{let n=40;while((game.stack.length||game.pendingTriggers.length)&&n--){await game.flushTriggers();if(game.stack.length)await game.resolveTop();}assert.ok(n>0);assertGameStateInvariants(game);};
  f.cast=async(name,lands=[],owner=f.me)=>{
    const card=f.put(name,'hand',owner),sources=lands.map(n=>f.put(n,'battlefield',owner));
    assert.ok(game.castableList(owner).some(e=>e.card===card),name+' native spell offer');
    const prior=owner.manualMana;
    if(sources.length&&!owner.isAI){owner.manualMana=true;f.payments.set(owner,sources);}
    try{assert.equal(await game.castSpell(owner,card,{from:'hand'}),true,name);await f.settle();}
    finally{owner.manualMana=prior;f.payments.delete(owner);}
    assert.ok(sources.every(c=>c.tapped),name+' actual payment');return card;
  };
  f.equip=async(equipment,target,lands=[])=>{
    const sources=lands.map(n=>f.put(n));f.target=target;
    const entry=game.activatableList(f.me).find(e=>e.card===equipment&&e.equip);assert.ok(entry);
    assert.equal(await game.activateAbility(f.me,entry),true);await f.settle();
    assert.equal(equipment.attachedTo,target.iid);assert.ok(sources.every(c=>c.tapped));
  };
  return f;
}

test('Paid Puresteel metalcraft equips actual Wrecking Ball Arm for zero and Flail blocks only while attached',async()=>{
  const f=fixture();await f.cast('Puresteel Paladin',['Plains','Plains']);
  const arm=await f.cast('Wrecking Ball Arm',['Wastes','Wastes']);
  const ring=await f.cast('Sol Ring',['Wastes']),flail=await f.cast("Conqueror's Flail");assert.equal(ring.tapped,true);
  const cloud=await f.cast('Cloud, Ex-SOLDIER',['Mountain','Forest','Plains','Wastes','Wastes']);
  assert.equal(arm.cur.equipCost,'{0}');assert.equal(flail.cur.equipCost,'{0}');
  const victim=f.put('Grizzly Bears','battlefield',f.rival);f.target=victim;
  const before=await f.cast('Chaos Warp',['Mountain','Wastes','Wastes'],f.rival);assert.equal(before.zone,'graveyard');assert.ok(['library','battlefield'].includes(victim.zone));
  await f.equip(arm,cloud);assert.equal(cloud.power,7);assert.equal(cloud.toughness,7);
  await f.equip(flail,cloud);
  const blocked=f.put('Chaos Warp','hand',f.rival),payment=['Mountain','Wastes','Wastes'].map(n=>f.put(n,'battlefield',f.rival));
  const target=f.rival.library.find(c=>c.name==='Forest')?.zone==='library'?f.game.lands(f.rival).find(c=>!payment.includes(c)):null;
  f.target=target||payment[0];
  assert.equal(f.game.castableList(f.rival).some(e=>e.card===blocked),false);
  assert.equal(await f.game.castSpell(f.rival,blocked,{from:'hand'}),false);assert.equal(blocked.zone,'hand');assert.ok(payment.every(c=>!c.tapped));
  f.target=flail;await f.cast('Disenchant',['Plains','Wastes']);assert.equal(flail.zone,'graveyard');
  f.target=cloud;assert.ok(f.game.castableList(f.rival).some(e=>e.card===blocked));
  f.rival.manualMana=true;f.payments.set(f.rival,payment);
  assert.equal(await f.game.castSpell(f.rival,blocked,{from:'hand'}),true);await f.settle();assert.equal(blocked.zone,'graveyard');assert.ok(payment.every(c=>c.tapped));
});

for(const role of ['human','ai'])test(`Paid Nylea Presence ${role} route attaches and resolves its mandatory entry draw exactly once`,async()=>{
  const f=fixture(role);f.put("Mishra's Factory");f.put('Forest');f.put('Wastes');
  const aura=f.put("Nylea's Presence",'hand'),library=f.me.library.length;
  assert.ok(f.game.castableList(f.me).some(e=>e.card===aura));assert.equal(await f.game.castSpell(f.me,aura,{from:'hand'}),true);await f.settle();
  assert.equal(aura.zone,'battlefield');assert.equal(aura.castMeta.manaSpent,2);assert.equal(f.me.library.length,library-1);
  const land=f.game.byIid(aura.attachedTo);assert.ok(land?.is('Land'));
  for(const subtype of ['Plains','Island','Swamp','Mountain','Forest'])assert.equal(land.hasSub(subtype),true);
  assert.equal((f.game.aiDecisionLog||[]).some(row=>row.fallback),false);
});

test('Paid ordinary Flail equip spends its printed two mana and releases the spell restriction after paid removal',async()=>{
  const f=fixture(),bear=await f.cast('Grizzly Bears',['Forest','Wastes']),flail=await f.cast("Conqueror's Flail",['Wastes','Wastes']);
  await f.cast('Opt',['Island'],f.rival);
  await f.equip(flail,bear,['Wastes','Wastes']);assert.equal(flail.cur.equipCost??flail.def.equip,'{2}');
  const blocked=f.put('Opt','hand',f.rival),island=f.put('Island','battlefield',f.rival);
  assert.equal(f.game.castableList(f.rival).some(e=>e.card===blocked),false);
  assert.equal(await f.game.castSpell(f.rival,blocked,{from:'hand'}),false);assert.equal(island.tapped,false);
  f.target=flail;await f.cast('Naturalize',['Forest','Wastes']);assert.equal(flail.zone,'graveyard');
  assert.ok(f.game.castableList(f.rival).some(e=>e.card===blocked));assert.equal(await f.game.castSpell(f.rival,blocked,{from:'hand'}),true);await f.settle();assert.equal(blocked.zone,'graveyard');assert.equal(island.tapped,true);
});
