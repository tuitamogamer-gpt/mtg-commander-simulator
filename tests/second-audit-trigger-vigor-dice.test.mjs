import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M=loadEngine();
function fixture(role='human',seed=10102026){
 const game=new M.Game({seed,paced:false});game.speedFactor=0;
 const f={events:[],questions:[]};game.onEvent=e=>f.events.push(e);
 const decide=async(_g,q)=>{
  f.questions.push(q);
  if(q.type==='priority')return{kind:'pass'};
  if(q.type==='main')return{kind:'done'};
  if(q.type==='chooseTargets')return f.targets?.(q)||(q.quickTarget?[q.quickTarget]:q.candidates.slice(0,q.min||0));
  if(q.type==='chooseCards')return f.cards?.(q)||q.from.slice(0,q.min||0);
  if(q.type==='chooseOption')return q.options.find(o=>o.key==='yes')?.key||q.options[0]?.key;
  if(q.type==='chooseManaSources')return{auto:true};
  if(q.type==='chooseX')return q.min||0;
  if(q.type==='orderTriggers')return q.triggers;
  if(q.type==='scry')return{top:q.cards,bottom:[]};
  return null;
 };
 const me=game.addPlayer('Native '+role,{name:'Second trigger audit'},{decide},role==='ai');
 const rival=game.addPlayer('Native rival',{name:'Second trigger audit'},{decide},false);
 game.turnPlayer=me;game.turnNo=8;game.phase='main1';game.step='main';
 const put=(name,zone='battlefield',owner=me)=>{
  assert.ok(M.DEFS[name],name+' has a native definition');
  const c=new M.CardInst(M.DEFS[name],owner);c.zone=zone;c.ctrl=owner;c.sick=false;
  (zone==='battlefield'?game.battlefield:owner[zone]).push(c);game.recalc();return c;
 };
 for(const p of game.players)for(let i=0;i<30;i++)put('Island','library',p);
 const settle=async()=>{
  for(let i=0;i<70;i++){
   await game.flushTriggers();
   if(!game.stack.length){assert.equal(game.pendingTriggers.length,0);assertGameStateInvariants(game);return;}
   await game.resolveTop();
  }
  assert.fail('native stack must settle');
 };
 const cast=async(name,lands,opts={})=>{
  const c=put(name,'hand');for(const land of lands)put(land);
  assert.equal(await game.castSpell(me,c,{from:'hand',...opts}),true,name+' is actually paid and cast');
  assert.equal(c.castMeta.manaSpent,lands.length,name+' records the real mana payment');
  assert.equal(Object.values(me.pool).reduce((a,b)=>a+b,0),0,'native lands cover the exact printed cost');
  await settle();return c;
 };
 const activate=async(source,lands,index=0)=>{
  for(const land of lands)put(land);
  const entry=game.activatableList(me).find(e=>e.card===source&&e.ability===source.def.abilities[index]);
  assert.ok(entry,'the printed activation is offered');
  assert.equal(await game.activateAbility(me,entry),true);await settle();return entry;
 };
 return Object.assign(f,{game,me,rival,put,cast,activate,settle});
}

for(const role of ['human','ai']){
 test(`${role}: paid Primal Vigor doubles a real counter spell for either player's creature`,async()=>{
  const f=fixture(role);await f.cast('Primal Vigor',['Forest','Wastes','Wastes','Wastes','Wastes']);
  const a=f.put('Grizzly Bears'),b=f.put('Grizzly Bears','battlefield',f.rival);
  f.targets=q=>q.candidates.includes(a)&&q.candidates.includes(b)?[a,b]:undefined;
  await f.cast('Travel Preparations',['Forest','Wastes']);
  assert.equal(a.counters['+1/+1'],2,'Vigor doubles the caster-controlled creature counters');
  assert.equal(b.counters['+1/+1'],2,'Vigor also doubles opposing creature counters');
 });
 test(`${role}: paid Primal Vigor doubles actual Raise the Alarm tokens`,async()=>{
  const f=fixture(role);await f.cast('Primal Vigor',['Forest','Wastes','Wastes','Wastes','Wastes']);
  await f.cast('Raise the Alarm',['Plains','Wastes']);
  assert.equal(f.game.creatures(f.me).filter(c=>c.isToken&&c.hasSub('Soldier')).length,4);
 });
 test(`${role}: an already present paid Primal Vigor doubles a cast Spike Feeder's entry counters`,async()=>{
  const f=fixture(role);await f.cast('Primal Vigor',['Forest','Wastes','Wastes','Wastes','Wastes']);
  const feeder=await f.cast('Spike Feeder',['Forest','Forest','Wastes']);
  assert.equal(feeder.counters['+1/+1'],4);
 });
 test(`${role}: two actually paid Primal Vigors each apply once to a later counter event`,async()=>{
  const f=fixture(role);
  for(let i=0;i<2;i++)await f.cast('Primal Vigor',['Forest','Wastes','Wastes','Wastes','Wastes']);
  const bear=f.put('Grizzly Bears');f.targets=q=>q.candidates.includes(bear)?[bear]:undefined;
  await f.cast('Travel Preparations',['Forest','Wastes']);
  assert.equal(bear.counters['+1/+1'],4);
 });
 test(`${role}: native ability loss disables Primal Vigor counter and token replacements`,async()=>{
  const f=fixture(role),vigor=await f.cast('Primal Vigor',['Forest','Wastes','Wastes','Wastes','Wastes']);
  f.targets=q=>q.candidates.includes(vigor)?[vigor]:undefined;
  await f.cast('Song of the Dryads',['Forest','Wastes','Wastes']);
  assert.equal(vigor.cur.abilitiesDisabled,true);assert.equal(vigor.is('Land'),true);
  const bear=f.put('Grizzly Bears');f.targets=q=>q.candidates.includes(bear)?[bear]:undefined;
  await f.cast('Travel Preparations',['Forest','Wastes']);assert.equal(bear.counters['+1/+1'],1);
  await f.cast('Raise the Alarm',['Plains','Wastes']);
  assert.equal(f.game.creatures(f.me).filter(c=>c.isToken&&c.hasSub('Soldier')).length,2);
 });
 for(const becomesLand of [false,true])test(`${role}: real proliferate ${becomesLand?'does not double a former creature':'doubles the increment on a current creature'}`,async()=>{
  const f=fixture(role);await f.cast('Primal Vigor',['Forest','Wastes','Wastes','Wastes','Wastes']);
  const bear=f.put('Grizzly Bears');bear.counters['+1/+1']=1;f.game.recalc();
  if(becomesLand){
   f.targets=q=>q.candidates.includes(bear)?[bear]:undefined;
   await f.cast('Song of the Dryads',['Forest','Wastes','Wastes']);assert.equal(bear.is('Creature'),false);
  }
  f.targets=q=>q.candidates.includes(bear)?[bear]:undefined;
  f.cards=q=>q.from.includes(bear)?[bear]:undefined;
  await f.cast('Contentious Plan',['Island','Wastes']);
  assert.equal(bear.counters['+1/+1'],becomesLand?2:3);
 });
 test(`${role}: real Open the Vaults co-entry excludes Primal Vigor until later counter events`,async()=>{
  const f=fixture(role),vigor=f.put('Primal Vigor','graveyard'),worker=f.put('Arcbound Worker','graveyard');
  await f.cast('Open the Vaults',['Plains','Plains','Wastes','Wastes','Wastes','Wastes']);
  assert.equal(vigor.zone,'battlefield');assert.equal(worker.zone,'battlefield');
  assert.equal(worker.counters['+1/+1'],1,'the simultaneous entrant is absent from the prior replacement snapshot');
  f.targets=q=>q.candidates.includes(worker)?[worker]:undefined;
  await f.cast('Travel Preparations',['Forest','Wastes']);
  assert.equal(worker.counters['+1/+1'],3,'the now-present Vigor doubles the later paid spell');
 });
 test(`${role}: Barbarian Class handles the real two-die Grave Endeavor as one group`,async()=>{
  const f=fixture(role,8),barbarian=await f.cast('Barbarian Class',['Mountain']);
  await f.activate(barbarian,['Mountain','Wastes']);
  assert.equal(M.AFC.level(barbarian),2);
  const bear=f.put('Grizzly Bears');f.targets=q=>q.candidates.includes(bear)?[bear]:undefined;
  const dead=f.put('Grizzly Bears','graveyard');
  await f.cast('Grave Endeavor',['Swamp','Swamp','Wastes','Wastes','Wastes','Wastes','Wastes']);
  const rolls=f.events.filter(e=>e.type==='diceRolled');assert.equal(rolls.length,1);
  const roll=rolls[0];assert.equal(roll.raw.length,3);assert.equal(roll.results.length,2);
  assert.deepEqual(Array.from(roll.raw),[2,7,4],'the actual seeded game produces an unsorted retained pair');
  assert.equal(roll.ignored[0],Math.min(...roll.raw),'the replacement ignores exactly the lowest die');
  const survivor=Array.from(roll.raw);survivor.splice(survivor.indexOf(Math.min(...survivor)),1);
  assert.deepEqual([...roll.results],survivor,'surviving dice retain their actual rolling order');
  assert.equal(f.questions.filter(q=>q.type==='chooseTargets'&&q.src===barbarian).length,1,'one or more dice trigger once for this group');
  assert.equal(bear.power,4);assert.equal(bear.kw('menace'),true);
  assert.equal(dead.zone,'battlefield');
 });
 test(`${role}: an actually paid zero-X Neverwinter Hydra performs no roll or Vrondiss trigger`,async()=>{
  const f=fixture(role);await f.cast('Vrondiss, Rage of Ancients',['Mountain','Forest','Wastes','Wastes','Wastes']);
  await f.cast('Barbarian Class',['Mountain']);
  const hydra=await f.cast('Neverwinter Hydra',['Forest','Forest'],{xVal:0});
  assert.equal(hydra.zone,'graveyard','the native zero-counter Hydra dies as a zero-toughness creature');
  assert.equal(f.events.filter(e=>e.type==='diceRolled').length,0);
  assert.equal(f.game.creatures(f.me).filter(c=>c.isToken&&c.hasSub('Spirit')).length,0);
 });
 test(`${role}: real Reanimate returning an uncast Neverwinter Hydra performs no rolls`,async()=>{
  const f=fixture(role),hydra=f.put('Neverwinter Hydra','graveyard');
  f.targets=q=>q.candidates.includes(hydra)?[hydra]:undefined;
  await f.cast('Reanimate',['Swamp']);
  assert.equal(hydra.zone,'graveyard');assert.equal(f.me.life,38);
  assert.equal(f.events.filter(e=>e.type==='diceRolled').length,0);
 });
 test(`${role}: an actually paid positive-X Neverwinter Hydra performs its printed rolls`,async()=>{
  const f=fixture(role);
  const hydra=await f.cast('Neverwinter Hydra',['Forest','Forest','Wastes','Wastes'],{xVal:1});
  const rolls=f.events.filter(e=>e.type==='diceRolled');assert.equal(rolls.length,1);
  assert.equal(rolls[0].raw.length,1);assert.equal(hydra.counters['+1/+1'],rolls[0].results[0]);
  assert.equal(hydra.zone,'battlefield');
 });
}
