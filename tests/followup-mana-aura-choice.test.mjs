import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M=loadEngine();
function fixture(role='human',seed=101020265){
  const game=new M.Game({seed,paced:false});game.speedFactor=0;
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


for(const role of ['human','ai'])test(`Paid Nylea Presence ${role} route chooses an actual beneficial land rather than granting the rival new mana`,async t=>{
  const f=fixture(role),factory=f.put("Mishra's Factory"),forest=f.put('Forest'),rival=f.put('Forest','battlefield',f.rival);
  f.target=factory;const aura=f.put("Nylea's Presence",'hand'),library=f.me.library.length;
  const choices=[],decide=f.me.controller.decide.bind(f.me.controller);
  f.me.controller.decide=async(g,q)=>{
    const result=await decide(g,q);
    if(q.type==='chooseTargets'&&q.src===aura)choices.push({source:q.src.name,hint:q.aiHint,selected:Array.from(result||[],card=>({name:card.name,iid:card.iid,controller:card.ctrl?.idx}))});
    return result;
  };
  assert.ok(f.game.castableList(f.me).some(e=>e.card===aura));
  assert.equal(await f.game.castSpell(f.me,aura,{from:'hand'}),true);await f.settle();
  assert.equal(aura.zone,'battlefield');assert.equal(aura.castMeta.manaSpent,2);assert.equal(f.me.library.length,library-1);
  assert.ok(factory.tapped&&forest.tapped);assert.equal(rival.tapped,false);
  const attached=f.game.byIid(aura.attachedTo);assert.ok(attached?.is('Land'));
  t.diagnostic(JSON.stringify(choices));
  assert.equal(attached.ctrl.idx,f.me.idx,'a beneficial color-fixing aura is attached to a land controlled by its caster');
  for(const type of ['Plains','Island','Swamp','Mountain','Forest'])assert.equal(attached.hasSub(type),true);
  assert.equal(rival.hasSub('Island'),false);assert.equal(rival.hasSub('Swamp'),false);
});

for(const role of ['human','ai'])test(`Paid Lotus Petal and Factory fund a ${role} Nylea Presence without granting the rival new mana`,async t=>{
  const f=fixture(role,3056),factory=f.put("Mishra's Factory"),rival=f.put('Forest','battlefield',f.rival);
  const petal=await f.cast('Lotus Petal');
  const source=f.game.manaSources(f.me).find(row=>row.card===petal);assert.ok(source);
  assert.equal(source.produce[0].ANY,true);
  assert.equal(await f.game.activateManaSource(f.me,source,source.produce[0],null,['G']),true);
  assert.equal(petal.zone,'graveyard');assert.equal(f.me.pool.G,1);
  f.target=factory;const aura=f.put("Nylea's Presence",'hand'),library=f.me.library.length;
  const choices=[],decide=f.me.controller.decide.bind(f.me.controller);
  f.me.controller.decide=async(g,q)=>{
    const result=await decide(g,q);
    if(q.type==='chooseTargets'&&q.src===aura)choices.push({source:q.src.name,hint:q.aiHint,selected:Array.from(result||[],card=>({name:card.name,iid:card.iid,controller:card.ctrl?.idx}))});
    return result;
  };
  assert.ok(f.game.castableList(f.me).some(e=>e.card===aura));
  assert.equal(await f.game.castSpell(f.me,aura,{from:'hand'}),true);await f.settle();
  assert.equal(aura.zone,'battlefield');assert.equal(aura.castMeta.manaSpent,2);assert.equal(f.me.library.length,library-1);
  assert.equal(factory.tapped,true);assert.equal(rival.tapped,false);assert.equal(f.me.pool.G,0);
  t.diagnostic(JSON.stringify(choices));
  assert.equal(aura.attachedTo,factory.iid,'the beneficial Aura fixes its caster land instead of the opponent land');
  for(const type of ['Plains','Island','Swamp','Mountain','Forest'])assert.equal(factory.hasSub(type),true);
  assert.equal(rival.hasSub('Island'),false);assert.equal(rival.hasSub('Swamp'),false);
});
