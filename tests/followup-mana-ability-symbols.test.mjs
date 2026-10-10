import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M=loadEngine();
function fixture(){
  const game=new M.Game({seed:101020267,paced:false});game.speedFactor=0;
  const f={game,target:null,payments:new Map(),modes:[],mode:null};
  const decide=async(_g,q)=>{
    if(q.type==='priority')return {kind:'pass'};
    if(q.type==='chooseManaSources')return f.payments.has(q.player)?{cards:f.payments.get(q.player)}:{auto:true};
    if(q.type==='chooseTargets')return q.candidates.includes(f.target)?[f.target]:q.candidates.slice(0,q.min||0);
    if(q.type==='chooseX')return Math.max(q.min||0,Math.min(1,q.max));
    if(q.type==='chooseCards')return q.from.slice(0,q.min||0);
    if(q.type==='chooseOption'){
      if(q.aiHint?.kind==='alternativeManaPayment'){
        f.modes.push({symbol:q.aiHint.symbol,kind:q.aiHint.paymentKind,options:Array.from(q.options,x=>x.key)});
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

for(const mode of ['life','B'])test(`Paid Hex Parasite human activation pays actual X and selected Phyrexian mode ${mode}`,async()=>{
  const f=fixture(),parasite=await f.cast('Hex Parasite',['Wastes']);
  const liliana=await f.cast('Liliana Vess',['Swamp','Swamp','Wastes','Wastes','Wastes']);
  const originalCounters=liliana.counters.loyalty;assert.ok(originalCounters>1);
  const sources=['Swamp','Wastes','Wastes'].map(n=>f.put(n));f.target=liliana;f.mode=mode;f.modes=[];
  const life=f.me.life;f.me.manualMana=true;
  f.payments.set(f.me,mode==='life'?[sources[1]]:sources.slice(0,2));
  await f.activate(parasite);f.me.manualMana=false;f.payments.delete(f.me);
  assert.equal(liliana.counters.loyalty,originalCounters-1);assert.equal(parasite.power,2);
  if(mode==='life'){
    assert.equal(f.me.life,life-2,'the player selected life while both payment modes were legal');
    assert.equal(sources[0].tapped,false,'the black source is preserved by the actual announced life mode');
    assert.equal(sources.filter(c=>c.tapped).length,1);
    assert.deepEqual(f.modes.map(x=>x.kind),['phyrexian']);
    assert.deepEqual(f.modes[0].options,['B','life']);
  }else{
    assert.equal(f.me.life,life);assert.equal(sources[0].tapped,true);assert.equal(sources.filter(c=>c.tapped).length,2);
  }
});

test('Paid Tasigur human activation announces both hybrid modes before native four-mana payment and actual mill',async()=>{
  const f=fixture(),tasigur=await f.cast('Tasigur, the Golden Fang',['Swamp',...Array(5).fill('Wastes')]);
  const sources=['Wastes','Wastes','Forest','Forest','Island','Island'].map(n=>f.put(n));
  const library=f.me.library.length;f.mode='G';f.modes=[];await f.activate(tasigur);
  assert.equal(f.me.library.length,library-2);assert.equal(f.me.graveyard.length,2);
  assert.equal(sources.filter(c=>c.tapped).length,4);
  assert.deepEqual(f.modes.map(x=>x.kind),['hybrid','hybrid'],'both legal hybrid choices belong to the human player');
  assert.ok(sources.slice(2,4).every(c=>c.tapped));assert.ok(sources.slice(4).every(c=>!c.tapped));
});

test('Paid Phyrexian Reclamation keeps fixed life and fixed mana costs distinct from alternative symbol choices',async()=>{
  const f=fixture(),bear=await f.cast('Grizzly Bears',['Forest','Wastes']);f.target=bear;
  await f.cast('Shock',['Mountain'],f.rival);assert.equal(bear.zone,'graveyard');
  const reclamation=await f.cast('Phyrexian Reclamation',['Swamp']);
  const sources=['Swamp','Wastes'].map(n=>f.put(n));f.target=bear;f.modes=[];
  const life=f.me.life;await f.activate(reclamation);
  assert.equal(bear.zone,'hand');assert.equal(f.me.life,life-2);assert.ok(sources.every(c=>c.tapped));assert.equal(f.modes.length,0);
});
