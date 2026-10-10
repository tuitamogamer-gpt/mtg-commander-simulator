import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M=loadEngine();
function fixture(){
  const game=new M.Game({seed:101020263,paced:false});game.speedFactor=0;
  const f={game,target:null};
  const decide=async(_g,q)=>{
    if(q.type==='priority')return {kind:'pass'};
    if(q.type==='chooseTargets')return q.candidates.includes(f.target)?[f.target]:q.candidates.includes(f.rival)?[f.rival]:q.candidates.slice(0,q.min||0);
    if(q.type==='chooseCards')return q.from.slice(0,q.min||0);
    if(q.type==='chooseOption')return q.options[0]?.key;
    if(q.type==='scry')return {top:q.cards,bottom:[]};
    if(q.type==='orderTriggers')return q.triggers;
    return null;
  };
  f.me=game.addPlayer('Hybrid payer',{}, {decide},false);f.rival=game.addPlayer('Hybrid rival',{}, {decide},false);
  game.turnPlayer=f.me;game.turnNo=9;game.phase='main1';game.step='main';
  f.put=(name,zone='battlefield',owner=f.me)=>{
    assert.ok(M.DEFS[name]);const c=new M.CardInst(M.DEFS[name],owner);c.zone=zone;c.sick=false;
    (zone==='battlefield'?game.battlefield:owner[zone]).push(c);game.recalc();return c;
  };
  for(const p of [f.me,f.rival])for(let i=0;i<16;i++)f.put('Island','library',p);
  f.settle=async()=>{let n=40;while((game.stack.length||game.pendingTriggers.length)&&n--){await game.flushTriggers();if(game.stack.length)await game.resolveTop();}assert.ok(n>0);assertGameStateInvariants(game);};
  f.cast=async(name,lands)=>{
    const c=f.put(name,'hand'),payment=lands.map(n=>f.put(n));
    assert.equal(await game.castSpell(f.me,c,{from:'hand'}),true,name);await f.settle();
    assert.ok(payment.every(c=>c.tapped));return c;
  };
  return f;
}

for(const taxes of [0,1,3])test(`Paid Evelyn hybrid cast preserves the sole fixed black source with ${taxes} actual Sphere taxes`,async t=>{
  const f=fixture();f.put('Counterspell','hand',f.rival);
  await f.cast('Duress',['Swamp']);await f.cast('Opt',['Island']);await f.cast('Shock',['Mountain']);
  for(let i=0;i<taxes;i++)await f.cast('Sphere of Resistance',Array(2+i).fill('Wastes'));
  const sources=['Swamp',...Array(4).fill('Island'),...Array(7).fill('Mountain')].map(n=>f.put(n));
  const card=f.put('Evelyn, the Covetous','hand'),cost=f.game.spellCost(f.me,card,{});
  assert.equal(cost.generic,2+taxes);assert.equal(cost.pips.length,3);
  t.diagnostic('actual native source rows '+f.game.manaSources(f.me).length+' / untapped physical lands '+sources.length);
  assert.ok(f.game.castableList(f.me).some(e=>e.card===card),'the actual affordable printed hybrid spell must be offered');
  assert.equal(await f.game.castSpell(f.me,card,{from:'hand'}),true);await f.settle();
  assert.equal(card.zone,'battlefield');assert.equal(card.castMeta.manaSpent,5+taxes);
  assert.equal(sources.filter(c=>c.tapped).length,5+taxes);assert.equal(sources[0].tapped,true);
});

for(const taxes of [0,4])test(`Paid Leyline of the Guildpact preserves four constrained hybrid colors with ${taxes} actual Sphere taxes`,async t=>{
  const f=fixture();
  await f.cast('Opt',['Island']);await f.cast('Shock',['Mountain']);
  for(let i=0;i<taxes;i++)await f.cast('Sphere of Resistance',Array(2+i).fill('Wastes'));
  const sources=['Plains','Island','Swamp',...Array(9).fill('Mountain')].map(n=>f.put(n));
  const card=f.put('Leyline of the Guildpact','hand'),cost=f.game.spellCost(f.me,card,{});
  assert.equal(cost.generic,taxes);assert.equal(cost.pips.length,4);
  t.diagnostic('actual native source rows '+f.game.manaSources(f.me).length+' / untapped physical lands '+sources.length);
  assert.ok(f.game.castableList(f.me).some(e=>e.card===card),'the actual affordable four-hybrid spell must be offered');
  assert.equal(await f.game.castSpell(f.me,card,{from:'hand'}),true);await f.settle();
  assert.equal(card.zone,'battlefield');assert.equal(card.castMeta.manaSpent,4+taxes);
  assert.equal(sources.filter(c=>c.tapped).length,4+taxes);
  for(const source of sources.slice(0,3))assert.equal(source.tapped,true,'each sole fixed hybrid color is reserved');
});
