import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M=loadEngine();
function fixture(){
 const game=new M.Game({seed:101020273,paced:false});game.speedFactor=0;
 const controller={decide:async(_g,q)=>{
  if(q.type==='priority')return {kind:'pass'};
  if(q.type==='main')return {kind:'done'};
  if(q.type==='chooseManaSources')return {auto:true};
  if(q.type==='chooseTargets')return q.candidates.slice(0,q.min||0);
  if(q.type==='chooseCards')return q.from.slice(0,q.min||0);
  if(q.type==='chooseOption')return q.options[0]?.key;
  if(q.type==='orderTriggers')return q.triggers;
  if(q.type==='scry')return {top:q.cards,bottom:[]};
  if(['attackers','blockers','combatReview'].includes(q.type))return [];
  return null;
 }};
 const me=game.addPlayer('Actual Gauntlets payer',{},controller,false),rival=game.addPlayer('Actual Gauntlets rival',{},controller,false);
 game.turnPlayer=me;game.turnNo=9;game.phase='main2';game.step='main';
 const put=(name,zone='battlefield',owner=me)=>{
  assert.ok(M.DEFS[name],name);const c=new M.CardInst(M.DEFS[name],owner);c.zone=zone;c.sick=false;
  (zone==='battlefield'?game.battlefield:owner[zone]).push(c);game.recalc();return c;
 };
 for(const player of [me,rival])for(let i=0;i<24;i++)put('Wastes','library',player);
 const settle=async()=>{let n=40;while((game.stack.length||game.pendingTriggers.length)&&n--){await game.flushTriggers();if(game.stack.length)await game.resolveTop();}assert.ok(n>0);assertGameStateInvariants(game);};
 const cast=async(name,lands,owner=me)=>{
  const previousPlayer=game.turnPlayer;game.turnPlayer=owner;
  const c=put(name,'hand',owner);for(const land of lands)put(land,'battlefield',owner);
  assert.ok(game.castableList(owner).some(e=>e.card===c),name+' actually offered');
  assert.equal(await game.castSpell(owner,c,{from:'hand'}),true,name+' actually paid');await settle();game.turnPlayer=previousPlayer;game.recalc();return c;
 };
 const native=source=>{const e=game.activatableList(me).find(e=>e.card===source&&e.ability?.cost?.sacSelf);assert.ok(e,'printed paid Gauntlets ability offered');return e;};
 const snapshot=()=>({pool:{...me.pool},cards:game.bf().filter(c=>c.ctrl===me).map(c=>({iid:c.iid,zone:c.zone,version:c.zoneVersion,tapped:c.tapped})),graveyard:me.graveyard.map(c=>c.iid)});
 return {game,me,rival,put,cast,settle,native,snapshot};
}

test('Paid Gauntlets does not offer a pure enchantment as its first exchange target and rejects it without spending',async t=>{
 const f=fixture(),source=await f.cast('Gauntlets of Chaos',Array(5).fill('Wastes'));
 const enchantment=await f.cast('Bloodchief Ascension',['Swamp']);
 const other=await f.cast('Mind Stone',['Wastes','Wastes'],f.rival);
 for(let i=0;i<5;i++)f.put('Wastes');
 const entry=f.native(source),offered=f.game.legalTargets(entry.ability.targets[0],source,f.me).includes(enchantment),before=f.snapshot();
 const paid=await f.game.activateAbility(f.me,entry,[enchantment,other]);await f.settle();
 t.diagnostic(JSON.stringify({offered,paid,source:source.zone,enchantmentController:enchantment.ctrl.idx,otherController:other.ctrl.idx}));
 assert.equal(paid,false);assert.deepEqual(f.snapshot(),before);assert.equal(offered,false,'printed artifact/creature/land target excludes a pure enchantment');assertGameStateInvariants(f.game);
});

test('Paid Gauntlets exchanges two actual artifacts while paying its five mana and source sacrifice',async t=>{
 const f=fixture(),source=await f.cast('Gauntlets of Chaos',Array(5).fill('Wastes'));
 const mine=await f.cast('Mind Stone',['Wastes','Wastes']),theirs=await f.cast('Coldsteel Heart',['Wastes','Wastes'],f.rival);
 for(let i=0;i<5;i++)f.put('Wastes');
 const entry=f.native(source),paid=await f.game.activateAbility(f.me,entry,[mine,theirs]);await f.settle();
 t.diagnostic(JSON.stringify({paid,source:source.zone,mineController:mine.ctrl.idx,theirController:theirs.ctrl.idx}));
 assert.equal(paid,true);assert.equal(source.zone,'graveyard');assert.equal(mine.ctrl,f.rival);assert.equal(theirs.ctrl,f.me);assert.equal(mine.owner,f.me);assert.equal(theirs.owner,f.rival);assertGameStateInvariants(f.game);
});

test('Paid Gauntlets rejects an artifact and an opposing ordinary land that share none of its permitted types atomically',async t=>{
 const f=fixture(),source=await f.cast('Gauntlets of Chaos',Array(5).fill('Wastes'));
 const mine=await f.cast('Mind Stone',['Wastes','Wastes']),theirs=f.put('Forest','battlefield',f.rival);
 for(let i=0;i<5;i++)f.put('Wastes');
 const entry=f.native(source),before=f.snapshot(),paid=await f.game.activateAbility(f.me,entry,[mine,theirs]);await f.settle();
 t.diagnostic(JSON.stringify({paid,source:source.zone,mineController:mine.ctrl.idx,theirController:theirs.ctrl.idx}));
 assert.equal(paid,false);assert.deepEqual(f.snapshot(),before);assert.equal(mine.ctrl,f.me);assert.equal(theirs.ctrl,f.rival);assertGameStateInvariants(f.game);
});
