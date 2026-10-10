import assert from 'node:assert/strict';
import {loadEngine} from './load-engine.mjs';
import {assertGameStateInvariants} from './game-state-invariants.mjs';
export const M=loadEngine();
export function nativeFixture(role='human',seed=10102026){
 const game=new M.Game({seed,paced:false});game.speedFactor=0;
 const f={events:[],questions:[]};game.onEvent=e=>f.events.push(e);
 const decide=async(_g,q)=>{
  f.questions.push(q);
  if(q.type==='priority')return f.priority?.(q)||{kind:'pass'};
  if(q.type==='main')return f.main?.(q)||{kind:'done'};
  if(q.type==='chooseTargets')return f.targets?.(q)||(q.quickTarget?[q.quickTarget]:q.candidates.slice(0,q.min||0));
  if(q.type==='chooseCards')return f.cards?.(q)||q.from.slice(0,q.min||0);
  if(q.type==='chooseOption')return f.option?.(q)||q.options.find(o=>o.key==='yes')?.key||q.options[0]?.key;
  if(q.type==='chooseMulti')return f.multi?.(q)||q.options.slice(0,q.min||0).map(o=>o.key);
  if(q.type==='chooseManaSources')return{auto:true};
  if(q.type==='chooseX')return q.min||0;
  if(q.type==='orderTriggers')return q.triggers;
  if(q.type==='scry')return{top:q.cards,bottom:[]};
  if(q.type==='attackers')return f.attackers?.(q)||[];
  if(q.type==='blockers')return f.blockers?.(q)||[];
  if(q.type==='combatReview')return[];
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
 for(const p of game.players)for(let i=0;i<40;i++)put('Island','library',p);
 const settle=async()=>{
  for(let i=0;i<80;i++){
   await game.flushTriggers();
   if(!game.stack.length){assert.equal(game.pendingTriggers.length,0);assertGameStateInvariants(game);return;}
   await game.resolveTop();
  }
  assert.fail('native stack must settle');
 };
 const castCard=async(c,lands,opts={})=>{
  const {player=me,settle:finish=true,...nativeOpts}=opts;
  for(const land of lands)put(land,'battlefield',player);
  assert.equal(await game.castSpell(player,c,{from:c.zone,...nativeOpts}),true,c.name+' is actually paid and cast');
  assert.equal(c.castMeta.manaSpent,lands.length,c.name+' records the real mana payment');
  if(finish)await settle();return c;
 };
 const cast=async(name,lands,opts={})=>castCard(put(name,'hand',opts.player||me),lands,opts);
 const activate=async(source,lands=[],index=0,finish=true)=>{
  for(const land of lands)put(land,'battlefield',source.ctrl);
  const entries=game.activatableList(source.ctrl);
  const entry=entries.find(e=>e.card===source&&(typeof index==='function'?index(e):e.ability===source.def.abilities[index]));
  assert.ok(entry,'the printed activation is actually offered');
  assert.equal(await game.activateAbility(source.ctrl,entry),true);
  if(finish)await settle();return entry;
 };
 return Object.assign(f,{game,me,rival,put,cast,castCard,activate,settle});
}
