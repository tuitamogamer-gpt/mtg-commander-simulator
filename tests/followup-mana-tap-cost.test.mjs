import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M=loadEngine();
function fixture(){
  const game=new M.Game({seed:101020266,paced:false});game.speedFactor=0;
  const f={game,pick:null,target:null};
  const decide=async(g,q)=>{
    const choice=f.pick?.(g,q);if(choice!==undefined)return choice;
    if(q.type==='priority')return {kind:'pass'};
    if(q.type==='chooseManaSources')return {auto:true};
    if(q.type==='chooseTargets')return q.candidates.includes(f.target)?[f.target]:q.candidates.slice(0,q.min||0);
    if(q.type==='chooseCards')return q.from.slice(0,q.min||0);
    if(q.type==='chooseOption')return q.options[0]?.key;
    if(q.type==='orderTriggers')return q.triggers;
    if(q.type==='scry')return {top:q.cards,bottom:[]};
    return null;
  };
  f.me=game.addPlayer('Elf payer',{}, {decide},false);f.rival=game.addPlayer('Elf rival',{}, {decide},false);
  game.turnPlayer=f.me;game.turnNo=9;game.phase='main1';game.step='main';
  f.put=(name,zone='battlefield')=>{
    assert.ok(M.DEFS[name],name);const c=new M.CardInst(M.DEFS[name],f.me);c.zone=zone;c.sick=false;
    (zone==='battlefield'?game.battlefield:f.me[zone]).push(c);game.recalc();return c;
  };
  for(let i=0;i<24;i++)f.put('Island','library');
  f.settle=async()=>{let n=50;while((game.stack.length||game.pendingTriggers.length)&&n--){await game.flushTriggers();if(game.stack.length)await game.resolveTop();}assert.ok(n>0);assertGameStateInvariants(game);};
  f.cast=async(name,lands=[])=>{
    const c=f.put(name,'hand'),payment=lands.map(n=>f.put(n));
    assert.equal(await game.castSpell(f.me,c,{from:'hand'}),true,name);await f.settle();
    assert.ok(payment.every(c=>c.tapped));return c;
  };
  return f;
}

test('Paid summoning-sick Birchlore and Elf actually pay the self-inclusive two-Elf mana activation and Opt',async()=>{
  const f=fixture(),rangers=await f.cast('Birchlore Rangers',['Forest']),elf=await f.cast('Llanowar Elves',['Forest']);
  assert.equal(rangers.sick,true);assert.equal(elf.sick,true);
  const row=f.game.manaSources(f.me).find(s=>s.card===rangers&&s.produce.some(p=>p.U===1));assert.ok(row);
  f.pick=(_g,q)=>q.type==='chooseCards'&&q.from.includes(rangers)&&q.from.includes(elf)?[rangers,elf]:undefined;
  assert.equal(await f.game.activateManaSource(f.me,row,row.produce.find(p=>p.U===1)),true);
  assert.equal(rangers.tapped,true);assert.equal(elf.tapped,true);assert.equal(f.me.pool.U,1);
  const spell=await f.cast('Opt');assert.equal(spell.castMeta.manaSpent,1);assert.equal(f.me.pool.U,0);
});

test('Paid summoning-sick Birchlore and Elf are offered and automatically fund actual Opt from their shared printed cost',async()=>{
  const f=fixture(),rangers=await f.cast('Birchlore Rangers',['Forest']),elf=await f.cast('Llanowar Elves',['Forest']),spell=f.put('Opt','hand');
  assert.ok(f.game.castableList(f.me).some(e=>e.card===spell),'Birchlore can count itself in its tap-two-Elves cost');
  assert.equal(await f.game.castSpell(f.me,spell,{from:'hand'}),true);await f.settle();
  assert.equal(spell.zone,'graveyard');assert.equal(spell.castMeta.manaSpent,1);assert.equal(rangers.tapped,true);assert.equal(elf.tapped,true);
});

test('Paid Heritage Druid includes itself with two sick Elves to fund an actual three-mana Kodama Reach',async()=>{
  const f=fixture(),druid=await f.cast('Heritage Druid',['Forest']),elves=[];
  for(let i=0;i<2;i++)elves.push(await f.cast('Llanowar Elves',['Forest']));
  f.pick=(_g,q)=>q.type==='chooseCards'&&q.from.every(c=>c.zone==='library'&&c.is('Land'))?q.from.slice(0,q.max||q.min||0):undefined;
  const spell=f.put("Kodama's Reach",'hand');
  assert.ok(f.game.castableList(f.me).some(e=>e.card===spell),'Heritage Druid can count itself in its tap-three-Elves cost');
  assert.equal(await f.game.castSpell(f.me,spell,{from:'hand'}),true);await f.settle();
  assert.equal(spell.castMeta.manaSpent,3);assert.equal(spell.zone,'graveyard');assert.ok([druid,...elves].every(c=>c.tapped));
  assert.equal(f.me.hand.filter(c=>c.is('Land')).length,1);assert.equal(f.game.lands(f.me).length,4);
});

test('Paid animated Springleaf Drum cannot reuse its own tap symbol but can tap a separately paid sick Elf',async()=>{
  const f=fixture(),drum=await f.cast('Springleaf Drum',['Wastes']);f.target=drum;
  await f.cast('Ensoul Artifact',['Island','Wastes']);assert.equal(drum.is('Creature'),true);
  const greaves=await f.cast('Lightning Greaves',['Wastes','Wastes']);f.target=drum;
  const equip=f.game.activatableList(f.me).find(e=>e.card===greaves&&e.equip);assert.ok(equip);
  assert.equal(await f.game.activateAbility(f.me,equip),true);await f.settle();assert.equal(drum.kw('haste'),true);
  const spell=f.put('Opt','hand'),pool=JSON.stringify(f.me.pool);
  assert.equal(f.game.manaSources(f.me).some(s=>s.card===drum),false);
  assert.equal(await f.game.castSpell(f.me,spell,{from:'hand'}),false);assert.equal(drum.tapped,false);assert.equal(spell.zone,'hand');assert.equal(JSON.stringify(f.me.pool),pool);
  const elf=await f.cast('Llanowar Elves',['Forest']);assert.equal(elf.sick,true);
  assert.ok(f.game.castableList(f.me).some(e=>e.card===spell));
  assert.equal(await f.game.castSpell(f.me,spell,{from:'hand'}),true);await f.settle();
  assert.equal(drum.tapped,true);assert.equal(elf.tapped,true);assert.equal(spell.castMeta.manaSpent,1);
});

test('Paid Birchlore sources reject overlapping three-Elf costs atomically and accept four distinct paid bodies',async()=>{
  const f=fixture(),rangers=[];for(let i=0;i<2;i++)rangers.push(await f.cast('Birchlore Rangers',['Forest']));
  const first=await f.cast('Llanowar Elves',['Forest']),spell=f.put('Arcane Signet','hand'),cost=f.game.spellCost(f.me,spell,{}),pool=JSON.stringify(f.me.pool);
  assert.ok(f.game.manaSolve(f.me,cost,{card:spell,castOpts:{from:'hand'}},{onlyCards:rangers})===null);
  assert.equal(await f.game.castSpell(f.me,spell,{from:'hand'}),false);assert.equal(spell.zone,'hand');assert.equal(JSON.stringify(f.me.pool),pool);assert.ok([...rangers,first].every(c=>!c.tapped));
  const second=await f.cast('Llanowar Elves',['Forest']);f.me.manualMana=true;
  f.pick=(_g,q)=>q.type==='chooseManaSources'?{cards:rangers}:undefined;
  assert.ok(f.game.castableList(f.me).some(e=>e.card===spell));assert.equal(await f.game.castSpell(f.me,spell,{from:'hand'}),true);await f.settle();
  assert.equal(spell.zone,'battlefield');assert.equal(spell.castMeta.manaSpent,2);assert.ok([...rangers,first,second].every(c=>c.tapped));
});
