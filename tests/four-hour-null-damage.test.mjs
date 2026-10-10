import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M = loadEngine();
function table() {
  const g = new M.Game({seed:101026718,paced:false,maxTurns:20}), f = {g};
  const controller = {decide:async(_g,q)=>{
    if(q.type==='priority') return {kind:'pass'};
    if(q.type==='chooseManaSources') return {cards:q.suggested};
    if(q.type==='chooseTargets') return f.targets?.(q) ?? (q.quickTarget ? [q.quickTarget] : q.candidates.slice(0,q.min||0));
    if(q.type==='chooseCards') return q.from.slice(0,q.min||0);
    if(q.type==='chooseOption') return f.option?.(q) ?? q.options.find(o=>/Each creature deals 1 damage/.test(o.label))?.key ?? q.options.find(o=>o.key==='yes')?.key ?? q.options[0]?.key;
    if(q.type==='chooseMulti') return f.multi?.(q) ?? [q.options.find(o=>/Each creature deals 1 damage/.test(o.label))?.key ?? q.options[0]?.key];
    if(q.type==='chooseX') return f.x?.(q) ?? q.min ?? 0;
    if(q.type==='orderTriggers') return q.triggers;
    if(q.type==='cardReveal') return null;
    if(q.type==='scry') return {top:q.cards,bottom:[]};
    throw Error('Unhandled native null-damage decision: '+q.type);
  }};
  f.a=g.addPlayer('Caster',{name:'Native source-less damage'},controller,false);
  f.b=g.addPlayer('Rival',{name:'Native source-less damage'},controller,false);
  g.turnPlayer=f.a;g.turnNo=8;g.phase='main1';g.step='main';
  f.put=(name,zone='battlefield',owner=f.a)=>{
    assert.ok(M.DEFS[name]);const card=new M.CardInst(M.DEFS[name],owner);
    card.zone=zone;card.sick=false;(zone==='battlefield'?g.battlefield:owner[zone]).push(card);g.recalc();return card;
  };
  f.cast=async(name,targets=[])=>{
    const card=f.put(name,'hand');
    assert.ok(g.castableList(f.a).some(row=>row.card===card),'native paid cast offered: '+name);
    assert.equal(await g.castSpell(f.a,card,{from:'hand',quickTargets:targets}),true);
    assert.equal(g.stack.length,0);assert.equal(g.pendingTriggers.length,0);assertGameStateInvariants(g);return card;
  };
  for(const player of g.players) for(let i=0;i<12;i++) f.put('Forest','library',player);
  return f;
}

test('UI judge source-less player damage remains ordinary damage after an actual paid Judith entry',async()=>{
  const f=table();for(const name of ['Wastes','Wastes','Wastes','Mountain','Swamp'])f.put(name);
  await f.cast('Judith, Carnage Connoisseur');
  assert.equal(await f.g.damageAny(null,f.b,1),1);
  assert.equal(f.b.life,39);assert.equal(f.b.poison,0);assert.equal(f.a.life,40);
  assertGameStateInvariants(f.g);
});

test('UI judge source-less creature damage uses the native damage and state-based death pipeline',async()=>{
  const f=table(), bear=f.put('Grizzly Bears','battlefield',f.b);
  assert.equal(await f.g.damageAny(null,bear,2),2);
  assert.equal(bear.zone,'graveyard');assert.equal(f.a.life,40);assert.equal(f.b.life,40);
  assertGameStateInvariants(f.g);
});

test('Actual paid Rakdos Charm creature-damage mode resolves through native priority',async()=>{
  const f=table();f.put('Mountain');f.put('Swamp');
  f.put('Grizzly Bears');f.put('Grizzly Bears','battlefield',f.b);f.put('Grizzly Bears','battlefield',f.b);
  await f.cast('Rakdos Charm');
  assert.equal(f.a.life,39);assert.equal(f.b.life,38);
  assertGameStateInvariants(f.g);
});

test('Actual paid Rakdos Charm keeps each creature source lifelink and infect',async()=>{
  const f=table();f.put('Mountain');f.put('Swamp');
  f.put('Vampire Nighthawk');f.put('Plague Stinger','battlefield',f.b);
  await f.cast('Rakdos Charm');
  assert.deepEqual([f.a.life,f.b.life,f.b.poison],[40,40,1],'Nighthawk lifelink offsets self-damage; Stinger infect creates poison instead of life loss');
  assertGameStateInvariants(f.g);
});

test('An actual ordinary paid Bolt retains ordinary damage without Judith',async()=>{
  const f=table();f.put('Mountain');const wall=f.put('Wall of Omens','battlefield',f.b);
  await f.cast('Lightning Bolt',[wall]);
  assert.equal(wall.zone,'battlefield');assert.equal(wall.damage,3);assert.equal(f.a.life,40);
  assertGameStateInvariants(f.g);
});

test('An actual paid Judith trigger still gives a paid Bolt deathtouch and lifelink',async()=>{
  const f=table();for(const name of ['Wastes','Wastes','Wastes','Swamp','Mountain','Mountain'])f.put(name);
  await f.cast('Judith, Carnage Connoisseur');const dreadmaw=f.put('Colossal Dreadmaw','battlefield',f.b);
  await f.cast('Lightning Bolt',[dreadmaw]);
  assert.equal(dreadmaw.zone,'graveyard');assert.equal(f.a.life,43);
  assertGameStateInvariants(f.g);
});

test('Paid Processor leaves one life and paid Rakdos Charm preserves simultaneous self-damage and lifelink',async()=>{
  const f=table();for(const name of ['Wastes','Wastes','Wastes','Wastes','Mountain','Swamp'])f.put(name);
  f.put('Vampire Nighthawk');f.x=()=>39;
  const processor=await f.cast('Phyrexian Processor');
  assert.equal(f.a.life,1);assert.equal(processor.meta.cslLifePaid,39);assert.equal(f.a.lost,false);
  await f.cast('Rakdos Charm');
  assert.equal(f.a.lost,false,'printed lifelink offsets the same self-damage event before state-based elimination');
  assert.equal(f.a.life,1);assert.equal(f.b.life,40);assert.equal(!!f.g.gameOver,false);
  assertGameStateInvariants(f.g);
});

test('Paid Rakdos Charm graveyard mode still exiles only the selected player graveyard',async()=>{
  const f=table();f.put('Mountain');f.put('Swamp');
  const own=f.put('Arcanis the Omnipotent','graveyard');
  const bear=f.put('Grizzly Bears','graveyard',f.b), land=f.put('Forest','graveyard',f.b);
  const version=bear.zoneVersion;
  f.option=q=>q.options.find(o=>/Exile a player's graveyard/.test(o.label))?.key;
  f.multi=q=>[q.options.find(o=>/Exile a player's graveyard/.test(o.label))?.key];
  await f.cast('Rakdos Charm',[f.b]);
  assert.equal(own.zone,'graveyard');assert.equal(bear.zone,'exile');assert.equal(land.zone,'exile');
  assert.equal(bear.zoneVersion,version+1);assert.deepEqual([f.a.life,f.b.life],[40,40]);
  assertGameStateInvariants(f.g);
});

test('Paid Rakdos Charm artifact mode destroys the selected artifact and preserves an enchantment',async()=>{
  const f=table();f.put('Mountain');f.put('Swamp');
  const ring=f.put('Sol Ring','battlefield',f.b), anthem=f.put('Glorious Anthem','battlefield',f.b);
  f.option=q=>q.options.find(o=>/Destroy an artifact/.test(o.label))?.key;
  f.multi=q=>[q.options.find(o=>/Destroy an artifact/.test(o.label))?.key];
  await f.cast('Rakdos Charm',[ring]);
  assert.equal(ring.zone,'graveyard');assert.equal(anthem.zone,'battlefield');
  assert.deepEqual([f.a.life,f.b.life],[40,40]);assertGameStateInvariants(f.g);
});
