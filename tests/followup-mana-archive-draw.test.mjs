import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M=loadEngine();
function fixture(library){
  const game=new M.Game({seed:101020271,paced:false});game.speedFactor=0;
  const f={game,target:null,choices:[]};
  const human={decide:async(_g,q)=>{
    if(q.type==='priority')return {kind:'pass'};
    if(q.type==='chooseManaSources')return {auto:true};
    if(q.type==='chooseTargets')return q.candidates.includes(f.target)?[f.target]:q.candidates.slice(0,q.min||0);
    if(q.type==='chooseCards')return q.from.slice(0,q.min||0);
    if(q.type==='chooseOption')return q.options[0]?.key;
    if(q.type==='orderTriggers')return q.triggers;
    if(q.type==='scry')return {top:q.cards,bottom:[]};
    return null;
  }};
  f.me=game.addPlayer('Archive draw bot',{},human,true);f.rival=game.addPlayer('Archive rival',{},human,false);
  f.me.controller=new M.AIController(f.me,{difficulty:'hard',style:'balanced'});
  const decide=f.me.controller.decide.bind(f.me.controller);
  f.me.controller.decide=async(g,q)=>{const result=await decide(g,q);if(q.type==='main')f.choices.push({kind:result?.kind,card:result?.card?.name,entry:result?.entry?.card?.name});return result;};
  game.turnPlayer=f.me;game.turnNo=9;game.phase='main2';game.step='main';
  f.put=(name,zone='battlefield',owner=f.me)=>{assert.ok(M.DEFS[name],name);const c=new M.CardInst(M.DEFS[name],owner);c.zone=zone;c.sick=false;(zone==='battlefield'?game.battlefield:owner[zone]).push(c);game.recalc();return c;};
  for(let i=0;i<library;i++)f.put('Island','library');for(let i=0;i<12;i++)f.put('Island','library',f.rival);
  f.settle=async()=>{let n=40;while((game.stack.length||game.pendingTriggers.length)&&n--){await game.flushTriggers();if(game.stack.length)await game.resolveTop();}assert.ok(n>0);assertGameStateInvariants(game);};
  f.cast=async(name,lands=[],owner=f.me)=>{const c=f.put(name,'hand',owner),sources=lands.map(n=>f.put(n,'battlefield',owner));assert.ok(game.castableList(owner).some(e=>e.card===c),name+' actually offered');assert.equal(await game.castSpell(owner,c,{from:'hand'}),true,name);await f.settle();assert.ok(sources.every(c=>c.tapped),name+' actual payment');return c;};
  return f;
}

for(const library of [1,2])test(`Actual paid Archive lets native AI distinguish Opt with library${library} from its forced double draw`,async t=>{
  const f=fixture(library),archive=await f.cast("Alhammarret's Archive",Array(5).fill('Wastes'));
  assert.equal(archive.zone,'battlefield');assert.equal(archive.cur.abilitiesDisabled,false);
  const opt=f.put('Opt','hand'),source=f.put('Island');assert.ok(f.game.castableList(f.me).some(e=>e.card===opt));
  await f.game.mainPhase(f.me);await f.settle();t.diagnostic(JSON.stringify(f.choices));
  assert.equal(f.me.lost,false,'the real bot must not choose an immediate forced draw from an empty library');
  if(library===1){assert.equal(opt.zone,'hand');assert.equal(f.me.library.length,1);assert.equal(source.tapped,false);}
  else{assert.equal(opt.zone,'graveyard','the safe native draw is actually cast');assert.equal(opt.castMeta.manaSpent,1);assert.equal(source.tapped,true);assert.equal(f.me.library.length,0);assert.equal(f.me.turnState.drewThisTurn,2);}
});

test('Actual paid Disenchant removes Archive so native AI can safely pay Opt with exactly one remaining card',async t=>{
  const f=fixture(1),archive=await f.cast("Alhammarret's Archive",Array(5).fill('Wastes'));f.target=archive;
  await f.cast('Disenchant',['Plains','Wastes'],f.rival);assert.equal(archive.zone,'graveyard');
  const opt=f.put('Opt','hand'),source=f.put('Island');
  await f.game.mainPhase(f.me);await f.settle();t.diagnostic(JSON.stringify(f.choices));
  assert.equal(f.me.lost,false);assert.equal(opt.zone,'graveyard');assert.equal(opt.castMeta.manaSpent,1);assert.equal(source.tapped,true);assert.equal(f.me.library.length,0);assert.equal(f.me.turnState.drewThisTurn,1);
});

test('Actual paid Platinum Angel permits native Archive Opt despite the otherwise lethal empty second draw',async t=>{
  const f=fixture(1),archive=await f.cast("Alhammarret's Archive",Array(5).fill('Wastes'));
  const angel=await f.cast('Platinum Angel',Array(7).fill('Wastes'));assert.equal(angel.zone,'battlefield');assert.equal(f.game.canLoseGame(f.me),false);
  const opt=f.put('Opt','hand'),source=f.put('Island');
  await f.game.mainPhase(f.me);await f.settle();t.diagnostic(JSON.stringify(f.choices));
  assert.equal(archive.zone,'battlefield');assert.equal(f.me.lost,false);assert.equal(opt.zone,'graveyard');assert.equal(opt.castMeta.manaSpent,1);assert.equal(source.tapped,true);assert.equal(f.me.library.length,0);assert.equal(f.me.turnState.drewThisTurn,1);
});
