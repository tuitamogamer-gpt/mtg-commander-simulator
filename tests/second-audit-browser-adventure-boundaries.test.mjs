import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M=loadEngine();
function fixture(){
  const g=new M.Game({seed:101020269,paced:false}),f={g,questions:[],target:null,response:null,color:null};
  const decide=async(game,q)=>{
    f.questions.push({type:q.type,player:q.player?.idx,prompt:q.prompt});
    if(q.type==='priority'){
      if(f.response&&q.player===f.response.owner&&game.stack.some(so=>so.card===f.response.toSpell)){
        const entry=q.casts.find(e=>e.card===f.response.card);
        if(entry){f.response.used=true;const action={kind:'cast',card:entry.card,from:entry.from,alt:entry.alt};f.response=null;return action;}
      }
      return {kind:'pass'};
    }
    if(q.type==='chooseTargets'){
      if(f.declineTargets){assert.ok(!q.candidates.includes(f.target),'Printed red Adventure never offers the protected Paladin');return [];}
      return q.candidates.includes(f.target)?[f.target]:q.candidates.slice(0,q.min||0);
    }
    if(q.type==='chooseManaSources')return {auto:true};
    if(q.type==='chooseCards')return q.from.slice(0,q.min||0);
    if(q.type==='chooseOption')return q.options.find(o=>o.key===f.color)?.key||q.options[0]?.key;
    if(q.type==='chooseMulti')return q.options.slice(0,q.min||0).map(o=>o.key);
    if(q.type==='chooseX')return q.min||0;
    if(q.type==='orderTriggers')return q.triggers;
    if(q.type==='scry')return {top:q.cards,bottom:[]};
    if(['cardReveal','effectReview','threatAlert','combatReview'].includes(q.type))return null;
    throw Error('Unhandled native Adventure question '+q.type);
  };
  f.a=g.addPlayer('Printed Adventure caster',{}, {decide},false);
  f.b=g.addPlayer('Printed Adventure rival',{}, {decide},false);
  g.turnNo=9;g.turnPlayer=f.a;g.phase='main1';g.step='main';
  f.put=(name,zone='battlefield',owner=f.a)=>{assert.ok(M.DEFS[name],'Printed definition '+name);const c=new M.CardInst(M.DEFS[name],owner);c.zone=zone;c.ctrl=owner;c.sick=false;(zone==='battlefield'?g.battlefield:owner[zone]).push(c);return c;};
  for(const p of [f.a,f.b])for(let i=0;i<24;i++)f.put('Island','library',p);
  f.offer=(card,adventure=false)=>{g.recalc();const e=g.castableList(card.ctrl).find(e=>e.card===card&&!!e.alt?.adventure===adventure);assert.ok(e,'Actual native offered face for '+card.name);return e;};
  f.cast=async(name,sources,owner=f.a)=>{
    const old=g.turnPlayer;g.turnPlayer=owner;const c=f.put(name,'hand',owner),lands=sources.map(n=>f.put(n,'battlefield',owner));const entry=f.offer(c);
    assert.equal(await g.castSpell(owner,c,{from:entry.from,alt:entry.alt}),true,'Paid native '+name);g.turnPlayer=old;assert.ok(lands.every(c=>c.tapped),'Actual printed cost was paid');assert.equal(c.zone,'battlefield');assertGameStateInvariants(g);return c;
  };
  f.adventure=async(card)=>{const e=f.offer(card,true);return g.castSpell(f.a,card,{from:e.from,alt:e.alt});};
  return f;
}

test('Printed paid blue Petty Theft legally targets Fiendslayer Paladin',async()=>{
  const f=fixture(),paladin=await f.cast('Fiendslayer Paladin',['Plains','Plains','Wastes'],f.b);
  const theft=f.put('Brazen Borrower','hand'),lands=['Island','Wastes'].map(n=>f.put(n));f.target=paladin;
  assert.equal(await f.adventure(theft),true);assert.equal(paladin.zone,'hand');assert.equal(theft.zone,'exile');assert.ok(lands.every(c=>c.tapped));assertGameStateInvariants(f.g);
});

test('Printed red Stomp rejects Fiendslayer Paladin without spending its actual mana sources',async()=>{
  const f=fixture(),paladin=await f.cast('Fiendslayer Paladin',['Plains','Plains','Wastes'],f.b);
  const stomp=f.put('Bonecrusher Giant','hand'),lands=['Mountain','Wastes'].map(n=>f.put(n)),e=f.offer(stomp,true);
  f.target=paladin;f.declineTargets=true;
  assert.equal(await f.g.castSpell(f.a,stomp,{from:e.from,alt:e.alt}),false);assert.equal(stomp.zone,'hand');assert.equal(paladin.zone,'battlefield');assert.ok(lands.every(c=>!c.tapped));assert.equal(f.g.stack.length,0);assertGameStateInvariants(f.g);
});

test('Printed red Scalding Viper pays its blue Steam Clean Adventure against Fiendslayer Paladin',async()=>{
  const f=fixture(),paladin=await f.cast('Fiendslayer Paladin',['Plains','Plains','Wastes'],f.b);
  const steam=f.put('Scalding Viper // Steam Clean','hand'),lands=['Island','Wastes'].map(n=>f.put(n));f.target=paladin;
  assert.ok(steam.colors.includes('R'),'Actual printed creature face is red');const printed={adventure:true,...steam.def.adventure};f.g.recalc();
  assert.equal(printed.name,'Steam Clean');assert.ok(printed.types.includes('Sorcery'));assert.equal(f.g.canCastTiming(f.a,steam,printed),true);assert.equal(f.g.canPayMana(f.a,f.g.spellCost(f.a,steam,printed),{card:steam,castOpts:printed}),true);
  const e=f.offer(steam,true);assert.equal(e.alt.name,'Steam Clean');
  assert.equal(await f.adventure(steam),true);assert.equal(paladin.zone,'hand');assert.equal(steam.zone,'exile');assert.ok(lands.every(c=>c.tapped));assertGameStateInvariants(f.g);
});

test('Paid Orrery permits a paid Painter response that makes Petty Theft red before resolution',async()=>{
  const f=fixture(),paladin=await f.cast('Fiendslayer Paladin',['Plains','Plains','Wastes'],f.b);
  await f.cast('Vedalken Orrery',['Wastes','Wastes','Wastes','Wastes'],f.b);
  const painter=f.put("Painter's Servant",'hand',f.b),responseLands=['Wastes','Wastes'].map(n=>f.put(n,'battlefield',f.b));
  const theft=f.put('Brazen Borrower','hand'),spellLands=['Island','Wastes'].map(n=>f.put(n));f.target=paladin;f.color='R';
  const response={card:painter,owner:f.b,toSpell:theft,used:false};f.response=response;
  assert.equal(await f.adventure(theft),true);assert.equal(response.used,true,'Actual opposing priority cast the printed Painter');assert.equal(painter.zone,'battlefield');
  assert.ok(responseLands.every(c=>c.tapped));assert.ok(spellLands.every(c=>c.tapped));assert.equal(paladin.zone,'battlefield','Current red spell cannot affect the protected creature');assert.equal(theft.zone,'graveyard');assert.ok(painter.meta.chosenColor==='R'||painter.chosenColor==='R'||theft.colors.includes('R'));assertGameStateInvariants(f.g);
});
