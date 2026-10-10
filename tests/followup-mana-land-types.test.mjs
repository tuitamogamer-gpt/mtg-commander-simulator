import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M=loadEngine();
function fixture(){
  const game=new M.Game({seed:101020264,paced:false});game.speedFactor=0;
  const f={game,target:null,pick:null};
  const decide=async(g,q)=>{
    const chosen=f.pick?.(g,q);if(chosen!==undefined)return chosen;
    if(q.type==='priority')return {kind:'pass'};
    if(q.type==='main')return {kind:'done'};
    if(['attackers','blockers','combatReview'].includes(q.type))return [];
    if(q.type==='chooseManaSources')return {auto:true};
    if(q.type==='chooseTargets')return q.candidates.includes(f.target)?[f.target]:q.candidates.slice(0,q.min||0);
    if(q.type==='chooseCards')return q.from.slice(0,q.min||0);
    if(q.type==='chooseOption')return q.options.some(o=>o.key==='untap')?'untap':q.options[0]?.key;
    if(q.type==='orderTriggers')return q.triggers;
    if(q.type==='scry')return {top:q.cards,bottom:[]};
    if(q.type==='chooseX')return q.min||0;
    return null;
  };
  f.me=game.addPlayer('Land payer',{}, {decide},false);f.rival=game.addPlayer('Land rival',{}, {decide},false);
  game.turnPlayer=f.me;game.turnNo=9;game.phase='main1';game.step='main';
  f.put=(name,zone='battlefield',owner=f.me)=>{
    assert.ok(M.DEFS[name],name);const c=new M.CardInst(M.DEFS[name],owner);c.zone=zone;c.sick=false;
    (zone==='battlefield'?game.battlefield:owner[zone]).push(c);game.recalc();return c;
  };
  for(const p of [f.me,f.rival])for(let i=0;i<24;i++)f.put('Island','library',p);
  f.settle=async()=>{let n=50;while((game.stack.length||game.pendingTriggers.length)&&n--){await game.flushTriggers();if(game.stack.length)await game.resolveTop();}assert.ok(n>0);assertGameStateInvariants(game);};
  f.cast=async(name,lands=[],owner=f.me)=>{
    const card=f.put(name,'hand',owner),payment=lands.map(n=>f.put(n,'battlefield',owner));
    assert.equal(await game.castSpell(owner,card,{from:'hand'}),true,name);await f.settle();
    assert.ok(payment.every(c=>c.tapped),name+': actual printed payment');return card;
  };
  f.untap=async(c)=>{f.target=c;await f.cast('Twiddle',['Island'],f.rival);assert.equal(c.tapped,false);};
  return f;
}

test('A paid Forest spell and paid untap preserve one actual basic mana ability',async t=>{
  const f=fixture(),forest=f.put('Forest'),victim=f.put('Grizzly Bears','battlefield',f.rival);f.target=victim;
  await f.cast('Giant Growth');assert.equal(forest.tapped,true);assert.equal(victim.power,5);
  await f.untap(forest);
  const rows=f.game.manaSources(f.me).filter(row=>row.card===forest);
  t.diagnostic('actual Forest mana rows after paid cast and untap '+rows.length);
  assert.equal(rows.length,1,'nonsemantic cost-decorator metadata must not duplicate printed basic mana');
  f.target=victim;const spell=await f.cast('Giant Growth');assert.equal(spell.castMeta.manaSpent,1);assert.equal(victim.power,8);
});

test('Paid Lantern retains a distinct granted ANY route beside one warmed Forest route',async()=>{
  const f=fixture(),lantern=await f.cast('Chromatic Lantern',['Wastes','Wastes','Wastes']);
  const forest=f.put('Forest'),victim=f.put('Grizzly Bears','battlefield',f.rival);f.target=victim;
  f.pick=(_g,q)=>q.type==='chooseManaSources'?{cards:[forest]}:undefined;f.me.manualMana=true;
  await f.cast('Giant Growth');await f.untap(forest);
  const rows=f.game.manaSources(f.me).filter(row=>row.card===forest);
  assert.equal(rows.length,2);assert.equal(rows.filter(row=>row.produce.some(p=>p.G===1)).length,1);
  assert.equal(rows.filter(row=>row.produce.some(p=>p.ANY)).length,1);
  f.pick=(_g,q)=>q.type==='chooseManaSources'?{cards:[forest]}:undefined;
  const spell=await f.cast('Opt');assert.equal(spell.castMeta.manaSpent,1);assert.equal(forest.tapped,true);assert.equal(lantern.tapped,false);
});

test('Paid Dryad retains restricted Ziggurat mana and all five distinct intrinsic colors',async()=>{
  const f=fixture();await f.cast('Dryad of the Ilysian Grove',['Forest','Wastes','Wastes']);
  const land=f.put('Ancient Ziggurat');f.game.manaSources(f.me);f.game.recalc();
  const rows=f.game.manaSources(f.me).filter(row=>row.card===land);
  assert.equal(rows.length,6);assert.equal(rows.filter(row=>row.m.restrict).length,1);
  for(const color of ['W','U','B','R','G'])assert.ok(rows.some(row=>row.produce.some(p=>p[color]===1)));
  const spell=await f.cast('Opt');assert.equal(spell.castMeta.manaSpent,1);assert.equal(land.tapped,true);
});

test('Paid Ashaya retains Birchlore two-Elf mana cost beside its intrinsic Forest ability',async t=>{
  const f=fixture(),rangers=await f.cast('Birchlore Rangers',['Forest']),elf=await f.cast('Llanowar Elves',['Forest']);
  await f.cast('Ashaya, Soul of the Wild',['Forest','Forest','Wastes','Wastes','Wastes']);
  const opt=f.put('Opt','hand');let attempted=false;
  f.me.manualMana=true;f.pick=(_g,q)=>{
    if(q.type==='main'&&q.player===f.me&&!attempted){attempted=true;const rows=f.game.manaSources(f.me).filter(row=>row.card===rangers);assert.equal(rows.length,2);assert.ok(rows.some(row=>row.extraCost?.tapPermanents?.n===2));assert.ok(rows.some(row=>row.extraCost?.tap));t.diagnostic(JSON.stringify({rangers:{tapped:rangers.tapped,sick:rangers.sick,subtypes:rangers.cur.subtypes},elf:{tapped:elf.tapped,sick:elf.sick,subtypes:elf.cur.subtypes},rows:rows.map(row=>({produce:row.produce,tap:row.extraCost?.tap,tapN:row.extraCost?.tapPermanents?.n})),canPay:!!f.game.manaSolve(f.me,M.parseCost('{U}'),{card:opt,castOpts:{from:'hand'}})}));const entry=q.casts.find(e=>e.card===opt);assert.ok(entry);return {kind:'cast',...entry};}
    if(q.type==='chooseManaSources')return {cards:[rangers]};
    if(q.type==='chooseCards'&&q.from.includes(rangers)&&q.from.includes(elf))return [rangers,elf];
  };
  await f.game.runTurn();await f.settle();assert.equal(attempted,true);assert.equal(opt.zone,'graveyard');assert.equal(opt.castMeta.manaSpent,1);assert.equal(rangers.tapped,true);assert.equal(elf.tapped,true);
});

test('Paid Nissa animation and Dress Down remove Moonring intrinsic blue mana through actual layers',async()=>{
  const f=fixture(),moonring=f.put('Moonring Island','hand');assert.equal(await f.game.playLand(f.me,moonring),true);assert.equal(moonring.tapped,true);
  const nissa=await f.cast('Nissa, Who Shakes the World',['Forest','Forest','Wastes','Wastes','Wastes']);f.target=moonring;
  const activation=f.game.activatableList(f.me).find(row=>row.card===nissa&&row.ability?.loyalty===1);assert.ok(activation);
  assert.equal(await f.game.activateAbility(f.me,activation),true);await f.settle();
  assert.equal(moonring.is('Creature'),true);assert.equal(moonring.hasSub('Island'),true);assert.equal(moonring.tapped,false);
  const opt=await f.cast('Opt');assert.equal(opt.castMeta.manaSpent,1);assert.equal(moonring.tapped,true);
  await f.untap(moonring);
  const dress=f.put('Dress Down','hand'),dressPayment=[f.put('Island'),f.put('Wastes')];
  f.me.manualMana=true;f.pick=(_g,q)=>q.type==='chooseManaSources'?{cards:dressPayment}:undefined;
  assert.equal(await f.game.castSpell(f.me,dress,{from:'hand'}),true);await f.settle();assert.ok(dressPayment.every(c=>c.tapped));
  assert.equal(moonring.cur.abilitiesDisabled,true);assert.equal(moonring.is('Creature'),true);assert.equal(moonring.hasSub('Island'),true);
  const blocked=f.put('Opt','hand'),pool=JSON.stringify(f.me.pool);
  assert.equal(f.game.manaSources(f.me,blocked).some(row=>row.card===moonring),false);
  assert.equal(f.game.canPayMana(f.me,M.parseCost('{U}'),{card:blocked},{onlyCards:[moonring]}),false);
  f.pick=(_g,q)=>q.type==='chooseManaSources'?{cards:[moonring]}:undefined;
  assert.equal(await f.game.castSpell(f.me,blocked,{from:'hand'}),false);assert.equal(blocked.zone,'hand');assert.equal(moonring.tapped,false);assert.equal(JSON.stringify(f.me.pool),pool);
});
