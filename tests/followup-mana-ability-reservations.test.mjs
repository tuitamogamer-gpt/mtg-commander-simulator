import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M=loadEngine();
function fixture(){
  const game=new M.Game({seed:101020267,paced:false});game.speedFactor=0;
  const f={game,target:null,payments:new Map(),modes:[],mode:null,cardChoice:null};
  const decide=async(_g,q)=>{
    if(q.type==='priority')return {kind:'pass'};
    if(q.type==='chooseManaSources')return f.payments.has(q.player)?{cards:f.payments.get(q.player)}:{auto:true};
    if(q.type==='chooseTargets')return q.candidates.includes(f.target)?[f.target]:q.candidates.slice(0,q.min||0);
    if(q.type==='chooseX')return Math.max(q.min||0,Math.min(1,q.max));
    if(q.type==='chooseCards')return q.from.includes(f.cardChoice)?[f.cardChoice]:q.from.slice(0,q.min||0);
    if(q.type==='chooseOption'){
      if(q.aiHint?.kind==='alternativeManaPayment'){
        f.modes.push({symbol:q.aiHint.symbol,kind:q.aiHint.paymentKind,options:q.options.map(x=>x.key)});
        return q.options.some(x=>x.key===f.mode)?f.mode:q.options[0]?.key;
      }
      return q.options[0]?.key;
    }
    if(q.type==='orderTriggers')return q.triggers;
    if(q.type==='scry')return {top:q.cards,bottom:[]};
    return null;
  };
  f.me=game.addPlayer('Ability symbol payer',{}, {decide},false);
  f.rival=game.addPlayer('Ability symbol rival',{}, {decide},false);
  game.turnPlayer=f.me;game.turnNo=9;game.phase='main1';game.step='main';
  f.put=(name,zone='battlefield',owner=f.me)=>{
    assert.ok(M.DEFS[name],name);const c=new M.CardInst(M.DEFS[name],owner);c.zone=zone;c.sick=false;
    (zone==='battlefield'?game.battlefield:owner[zone]).push(c);game.recalc();return c;
  };
  for(const player of [f.me,f.rival])for(let i=0;i<24;i++)f.put('Island','library',player);
  f.settle=async()=>{let n=40;while((game.stack.length||game.pendingTriggers.length)&&n--){await game.flushTriggers();if(game.stack.length)await game.resolveTop();}assert.ok(n>0);assertGameStateInvariants(game);};
  f.cast=async(name,lands,owner=f.me)=>{
    const c=f.put(name,'hand',owner),sources=lands.map(n=>f.put(n,'battlefield',owner));
    assert.ok(game.castableList(owner).some(e=>e.card===c),name+' native spell offer');
    const old=owner.manualMana;owner.manualMana=true;f.payments.set(owner,sources);
    try{assert.equal(await game.castSpell(owner,c,{from:'hand'}),true,name);await f.settle();}
    finally{owner.manualMana=old;f.payments.delete(owner);}
    assert.ok(sources.every(c=>c.tapped),name+' paid native sources');return c;
  };
  f.activate=async(card)=>{
    const entry=game.activatableList(f.me).find(e=>e.card===card&&e.ability&&!e.equip);assert.ok(entry,card.name+' native ability offer');
    assert.equal(await game.activateAbility(f.me,entry),true);await f.settle();
  };
  return f;
}


test('Paid Compulsion rejects using the only selected discard to fund the same native activation',async()=>{
  const f=fixture(),compulsion=await f.cast('Compulsion',['Island','Wastes']);
  const guide=f.put('Simian Spirit Guide','hand'),island=f.put('Island');f.cardChoice=guide;
  const entry=f.game.activatableList(f.me).find(e=>e.card===compulsion&&e.ability?.cost?.discard);assert.ok(entry,'the native selected-discard activation is offered');
  const pool=JSON.stringify(f.me.pool),library=f.me.library.length;
  assert.equal(await f.game.activateAbility(f.me,entry),false,'the same hand card cannot be exiled for mana and discarded for this ability');
  assert.equal(guide.zone,'hand');assert.equal(island.tapped,false);assert.equal(JSON.stringify(f.me.pool),pool);assert.equal(f.me.library.length,library);
  assert.equal(f.game.stack.length,0);assert.equal(f.game.pendingTriggers.length,0);assertGameStateInvariants(f.game);
});

test('Paid Compulsion can use a different actual Simian mana source while discarding a paid-selected Ornithopter',async()=>{
  const f=fixture(),compulsion=await f.cast('Compulsion',['Island','Wastes']);
  const guide=f.put('Simian Spirit Guide','hand'),discard=f.put('Ornithopter','hand'),island=f.put('Island');f.cardChoice=discard;
  const entry=f.game.activatableList(f.me).find(e=>e.card===compulsion&&e.ability?.cost?.discard);assert.ok(entry);
  const library=f.me.library.length;assert.equal(await f.game.activateAbility(f.me,entry),true);await f.settle();
  assert.equal(guide.zone,'exile');assert.equal(discard.zone,'graveyard');assert.equal(island.tapped,true);assert.equal(f.me.library.length,library-1);
});

test('Paid Compulsion preserves the actual selected Simian discard when distinct ordinary mana funds the activation',async()=>{
  const f=fixture(),compulsion=await f.cast('Compulsion',['Island','Wastes']);
  const guide=f.put('Simian Spirit Guide','hand'),sources=['Island','Wastes'].map(n=>f.put(n));f.cardChoice=guide;
  const entry=f.game.activatableList(f.me).find(e=>e.card===compulsion&&e.ability?.cost?.discard);assert.ok(entry);
  const library=f.me.library.length;assert.equal(await f.game.activateAbility(f.me,entry),true);await f.settle();
  assert.equal(guide.zone,'graveyard');assert.ok(sources.every(c=>c.tapped));assert.equal(f.me.library.length,library-1);
});
