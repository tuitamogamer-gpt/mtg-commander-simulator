import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M=loadEngine();
function fixture(seed=101020262) {
  const game=new M.Game({seed,paced:false});game.speedFactor=0;
  const f={game,pick:null};
  const decide=async(g,q)=>{
    const choice=f.pick?.(g,q);if(choice!==undefined)return choice;
    if(q.type==='priority')return {kind:'pass'};
    if(q.type==='main')return {kind:'done'};
    if(q.type==='chooseManaSources')return {auto:true};
    if(['attackers','blockers','combatReview'].includes(q.type))return [];
    if(q.type==='chooseOption')return q.options[0]?.key;
    if(q.type==='chooseCards')return q.from.slice(0,q.min||0);
    if(q.type==='chooseTargets')return q.candidates.slice(0,q.min||0);
    if(q.type==='orderTriggers')return q.triggers;
    if(q.type==='scry')return {top:q.cards,bottom:[]};
    if(q.type==='chooseX')return q.min||0;
    return null;
  };
  f.me=game.addPlayer('Native payer',{}, {decide},false);
  f.rival=game.addPlayer('Native rival',{}, {decide},false);
  game.turnPlayer=f.me;game.turnNo=9;game.phase='main1';game.step='main';
  f.put=(name,zone='battlefield',owner=f.me)=>{
    assert.ok(M.DEFS[name],name);const card=new M.CardInst(M.DEFS[name],owner);
    card.zone=zone;card.ctrl=owner;card.sick=false;
    (zone==='battlefield'?game.battlefield:owner[zone]).push(card);game.recalc();return card;
  };
  for(const p of [f.me,f.rival])for(let i=0;i<24;i++)f.put('Island','library',p);
  f.settle=async()=>{
    let limit=50;
    while((game.stack.length||game.pendingTriggers.length)&&limit--){
      await game.flushTriggers();if(game.stack.length)await game.resolveTop();
    }
    assert.ok(limit>0);assertGameStateInvariants(game);
  };
  f.cast=async(name,lands,owner=f.me)=>{
    const card=f.put(name,'hand',owner),payment=lands.map(n=>f.put(n,'battlefield',owner));
    assert.equal(await game.castSpell(owner,card,{from:'hand'}),true,name);await f.settle();
    assert.ok(payment.every(c=>c.tapped),name+': printed cost consumes native sources');
    return card;
  };
  f.equip=async(equipment,target)=>{
    const prior=f.pick;f.pick=(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(target)?[target]:prior?.(g,q);
    const entry=game.activatableList(f.me).find(e=>e.card===equipment&&e.equip);
    assert.ok(entry);assert.equal(await game.activateAbility(f.me,entry),true);await f.settle();
    f.pick=prior;assert.equal(equipment.attachedTo,target.iid);
  };
  return f;
}

for(const automatic of [false,true])test(`Paid Illuminor selects the actual sacrificed body ${automatic?'while funding Sign in Blood':'through its native mana action'}`,async t=>{
  const f=fixture(),source=await f.cast('Illuminor Szeras',['Swamp','Wastes','Wastes']);
  const bear=await f.cast('Grizzly Bears',['Forest','Wastes']);
  const greaves=await f.cast('Lightning Greaves',['Wastes','Wastes']);await f.equip(greaves,source);
  assert.equal(source.kw('haste'),true);
  const offer=f.game.manaSources(f.me).find(e=>e.card===source&&e.produce[0].B===2);
  assert.ok(offer);t.diagnostic('selected native source amount '+offer.produce[0].B);
  f.pick=(_g,q)=>q.type==='chooseCards'&&q.from.includes(bear)?[bear]:undefined;
  if(automatic){
    const spell=f.put('Sign in Blood','hand'),hand=f.me.hand.length;
    f.pick=(_g,q)=>q.type==='chooseTargets'&&q.candidates.includes(f.me)?[f.me]:
      q.type==='chooseCards'&&q.from.includes(bear)?[bear]:undefined;
    assert.ok(f.game.castableList(f.me).some(e=>e.card===spell));
    assert.equal(await f.game.castSpell(f.me,spell,{from:'hand'}),true);await f.settle();
    assert.equal(spell.zone,'graveyard');assert.equal(f.me.hand.length,hand+1);assert.equal(f.me.life,38);
    assert.equal(f.me.pool.B,0);assert.equal(spell.castMeta.manaSpent,2);
  }else{
    assert.equal(await f.game.activateManaSource(f.me,offer,offer.produce[0]),true);
    assert.equal(f.me.pool.B,2);
  }
  assert.equal(bear.zone,'graveyard');assert.equal(source.tapped,true);assertGameStateInvariants(f.game);
});

for(const [color,name] of [['W','Swords to Plowshares'],['U','Opt'],['B','Dark Ritual'],['R','Shock'],['G','Giant Growth']])
test(`Paid Darksteel Ingot actually funds its printed ANY ${color} spell`,async()=>{
  const f=fixture(),source=await f.cast('Darksteel Ingot',['Wastes','Wastes','Wastes']);
  const victim=f.put('Grizzly Bears','battlefield',f.rival),spell=f.put(name,'hand');
  f.pick=(_g,q)=>{
    if(q.type==='chooseTargets')return q.candidates.includes(victim)&&['W','G'].includes(color)?[victim]:q.candidates.includes(f.rival)?[f.rival]:undefined;
    if(q.type==='chooseOption'&&q.aiHint?.kind==='manaColor')return color;
  };
  const entry=f.game.manaSources(f.me).find(e=>e.card===source);
  assert.ok(entry);assert.equal(entry.produce[0].ANY,true);assert.equal(entry.produce[0].n??1,1);
  assert.equal(entry.produce[0].anyColorGroupV59??1,1);
  const library=f.me.library.length;
  assert.equal(await f.game.castSpell(f.me,spell,{from:'hand'}),true);await f.settle();
  assert.equal(source.tapped,true);assert.equal(spell.castMeta.manaSpent,1);assert.equal(spell.zone,'graveyard');
  if(color==='W'){assert.equal(victim.zone,'exile');assert.equal(f.rival.life,42);}
  if(color==='U')assert.equal(f.me.library.length,library-1);
  if(color==='B')assert.equal(f.me.pool.B,3);
  if(color==='R')assert.equal(f.rival.life,38);
  if(color==='G')assert.equal(victim.power,5);
});

test('Two paid Geese and native Food entries reserve distinct costs and pay an actual artifact spell',async t=>{
  const f=fixture(),first=await f.cast('Gilded Goose',['Forest']),second=await f.cast('Gilded Goose',['Forest']);
  const foods=f.game.bf().filter(c=>c.isToken&&c.hasSub('Food'));
  assert.equal(foods.length,2);
  const greaves=await f.cast('Lightning Greaves',['Wastes','Wastes']);await f.equip(greaves,first);
  const spell=f.put('Mind Stone','hand');f.me.manualMana=true;
  const basicSources=f.game.lands(f.me),queries=[];let attempted=false;
  f.pick=(_g,q)=>{
    queries.push({type:q.type,min:q.min,prompt:q.prompt});
    if(q.type==='main'&&q.player===f.me&&!attempted){
      attempted=true;assert.equal(first.sick,false);assert.equal(second.sick,false);
      const entry=q.casts.find(e=>e.card===spell);assert.ok(entry,'native main offers the actual artifact');
      return {kind:'cast',...entry};
    }
    if(q.type==='chooseManaSources')return {cards:[first,second]};
    if(q.type==='chooseCards'&&q.from.some(c=>foods.includes(c)))return q.from.filter(c=>foods.includes(c)).slice(0,q.min);
  };
  // Pay inside the actual main-phase decision of the native next turn.
  await f.game.runTurn();await f.settle();
  t.diagnostic(JSON.stringify({attempted,queries,foods:foods.map(c=>c.zone),tapped:[first.tapped,second.tapped]}));
  assert.equal(attempted,true);
  assert.equal(spell.zone,'battlefield');assert.equal(spell.castMeta.manaSpent,2);
  assert.equal(first.tapped,true);assert.equal(second.tapped,true);
  assert.ok(foods.every(c=>c.zone!=='battlefield'));assert.ok(basicSources.every(c=>!c.tapped));
});

test('Paid Illuminor preserves a lower-value body when the offered higher-value sacrifice funds Grave Titan',async()=>{
  const f=fixture(),source=await f.cast('Illuminor Szeras',['Swamp','Wastes','Wastes']);
  const bear=await f.cast('Grizzly Bears',['Forest','Wastes']);
  const dreadmaw=await f.cast('Colossal Dreadmaw',['Forest','Forest','Wastes','Wastes','Wastes','Wastes']);
  const greaves=await f.cast('Lightning Greaves',['Wastes','Wastes']);await f.equip(greaves,source);
  const titan=f.put('Grave Titan','hand');
  assert.ok(f.game.castableList(f.me).some(e=>e.card===titan));
  assert.equal(await f.game.castSpell(f.me,titan,{from:'hand'}),true);await f.settle();
  assert.equal(dreadmaw.zone,'graveyard');assert.equal(bear.zone,'battlefield');assert.equal(source.tapped,true);
  assert.equal(titan.zone,'battlefield');assert.equal(titan.castMeta.manaSpent,6);assert.equal(f.me.pool.B,0);
  assert.equal(f.game.creatures(f.me).filter(c=>c.isToken&&c.hasSub('Zombie')).length,2);
});

test('Paid bounce and recast invalidate Illuminor old selected-body receipt but permit a fresh offered receipt',async()=>{
  const f=fixture(),source=await f.cast('Illuminor Szeras',['Swamp','Wastes','Wastes']);
  const bear=await f.cast('Grizzly Bears',['Forest','Wastes']);
  const greaves=await f.cast('Lightning Greaves',['Wastes','Wastes']);await f.equip(greaves,source);
  const old=f.game.manaSources(f.me).find(e=>e.card===source&&e.produce[0].B===2);
  assert.ok(old);f.pick=(_g,q)=>q.type==='chooseTargets'&&q.candidates.includes(bear)?[bear]:undefined;
  await f.cast('Unsummon',['Island'],f.rival);assert.equal(bear.zone,'hand');
  const payment=[f.put('Forest'),f.put('Wastes')];
  assert.equal(await f.game.castSpell(f.me,bear,{from:'hand'}),true);await f.settle();assert.ok(payment.every(c=>c.tapped));
  const pool=JSON.stringify(f.me.pool);
  assert.equal(await f.game.activateManaSource(f.me,old,old.produce[0]),false);
  assert.equal(bear.zone,'battlefield');assert.equal(source.tapped,false);assert.equal(JSON.stringify(f.me.pool),pool);
  const fresh=f.game.manaSources(f.me).find(e=>e.card===source&&e.produce[0].B===2);assert.ok(fresh);
  assert.equal(await f.game.activateManaSource(f.me,fresh,fresh.produce[0]),true);
  assert.equal(bear.zone,'graveyard');assert.equal(source.tapped,true);assert.equal(f.me.pool.B,2);
});

for(const bodies of [1,2])test(`Paid Mirror Box, Assault Suits and two Illuminors ${bodies===1?'reject one shared body atomically':'reserve two distinct paid bodies for one actual cast'}`,async()=>{
  const f=fixture();await f.cast('Mirror Box',['Wastes','Wastes','Wastes']);
  const first=await f.cast('Illuminor Szeras',['Swamp','Wastes','Wastes']);
  const second=await f.cast('Illuminor Szeras',['Swamp','Wastes','Wastes']);
  const bears=[];for(let i=0;i<bodies;i++)bears.push(await f.cast('Grizzly Bears',['Forest','Wastes']));
  const suits=[];for(let i=0;i<2;i++)suits.push(await f.cast('Assault Suit',Array(4).fill('Wastes')));
  // A previously activated Illuminor can legally be sacrificed by the other.
  // Real Assault Suits remove that alternative while leaving the Bear costs.
  for(let i=0;i<6;i++){
    const land=f.put('Wastes'),row=f.game.manaSources(f.me).find(s=>s.card===land);
    assert.ok(row);assert.equal(await f.game.activateManaSource(f.me,row,row.produce[0]),true);
  }
  assert.equal(f.me.pool.C,6);
  await f.equip(suits[0],first);await f.equip(suits[1],second);assert.equal(f.me.pool.C,0);
  assert.equal(f.game.canSacrificeCost(first),false);assert.equal(f.game.canSacrificeCost(second),false);
  const spell=f.put('Hedron Archive','hand');f.me.manualMana=true;let checked=false;
  f.pick=(_g,q)=>{
    if(q.type==='main'&&q.player===f.me&&!checked){
      checked=true;assert.equal(first.sick,false);assert.equal(second.sick,false);
      const action={card:spell,castOpts:{from:'hand'}},options={onlyCards:[first,second]};
      if(bodies===1){
        assert.ok(f.game.manaSolve(f.me,M.parseCost('{4}'),action,options)===null,
          'a source cannot be sacrificed by one ability and tapped for the other');
        const entry=q.casts.find(e=>e.card===spell);assert.ok(entry,'ordinary lands fund the offer before exact manual selection');
        return {kind:'cast',...entry};
      }
      const entry=q.casts.find(e=>e.card===spell);assert.ok(entry);return {kind:'cast',...entry};
    }
    if(q.type==='chooseManaSources')return {cards:[first,second]};
    if(q.type==='chooseCards'&&q.from.some(c=>bears.includes(c)))return q.from.filter(c=>bears.includes(c)).slice(0,q.min);
  };
  await f.game.runTurn();await f.settle();assert.equal(checked,true);
  if(bodies===1){
    assert.equal(first.tapped,false);assert.equal(second.tapped,false);assert.equal(bears[0].zone,'battlefield');
    assert.equal(spell.zone,'hand');assert.equal(Object.values(f.me.pool).reduce((a,b)=>a+b,0),0);
  }else{
    assert.equal(first.tapped,true);assert.equal(second.tapped,true);assert.ok(bears.every(c=>c.zone==='graveyard'));
    assert.equal(spell.zone,'battlefield');assert.equal(spell.castMeta.manaSpent,4);
    assert.ok(f.game.lands(f.me).every(c=>!c.tapped));
  }
});
