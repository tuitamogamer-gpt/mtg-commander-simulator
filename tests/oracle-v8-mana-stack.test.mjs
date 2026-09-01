import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureEngine,context,put,settle} from './helpers/oracle-v8-fixtures.mjs';

// CR 605.1a, effective August 2026. Library movement in costs/effects means
// ordinary priority and the stack even when the same ability produces mana.
const MTG=fixtureEngine([['V8 Library Mana','{T}: Draw a card. Add {G}.','Artifact','{1}']]);
async function castArtifact(ctx,name) {
  const card=put(MTG,ctx.game,ctx.a,name,'hand');ctx.a.pool.C=5;
  const before=ctx.a.pool.C;
  assert.equal(await ctx.game.castSpell(ctx.a,card,{from:'hand'}),true);
  assert.ok(ctx.a.pool.C<before);await settle(ctx.game);
  for(const color of Object.keys(ctx.a.pool))ctx.a.pool[color]=0;
  return card;
}
for(const role of ['human','ai']) {
  test(`v8 ${role}: a paid Chromatic Sphere activation can be countered and cannot pay another spell while pending`,async()=>{
    const ctx=context(MTG,role),{game,a}=ctx;
    const sphere=await castArtifact(ctx,'Chromatic Sphere');
    a.pool.C=1;const library=a.library.length,hand=a.hand.length;
    assert.equal(game.manaSources(a).some(entry=>entry.card===sphere),false);
    const action=game.activatableList(a).find(entry=>entry.card===sphere&&entry.ability);
    assert.ok(action?.ability.oracleManaUsesStack);
    assert.equal(await game.activateAbility(a,action),true);
    assert.equal(sphere.zone,'graveyard');assert.equal(a.pool.C,0);
    assert.equal(a.library.length,library);assert.equal(a.hand.length,hand);
    assert.equal(game.canPayMana(a,MTG.parseCost('{G}')),false);
    assert.equal(game.stack.at(-1).kind,'ability');
    await game.counterStackObject(game.stack.at(-1));await settle(game);
    assert.equal(a.library.length,library);assert.equal(Object.values(a.pool).reduce((x,y)=>x+y,0),0);
  });
  test(`v8 ${role}: an Egg produces mana and draws only when its paid ability resolves`,async()=>{
    const ctx=context(MTG,role),{game,a}=ctx;
    const egg=await castArtifact(ctx,'Darkwater Egg');a.pool.C=2;
    const library=a.library.length;
    const action=game.activatableList(a).find(entry=>entry.card===egg&&entry.ability);
    assert.ok(action);assert.equal(game.manaSources(a).some(entry=>entry.card===egg),false);
    assert.equal(await game.activateAbility(a,action),true);
    assert.equal(a.pool.C,0);assert.equal(a.pool.U,0);assert.equal(a.pool.B,0);assert.equal(a.library.length,library);
    await settle(game);assert.equal(a.pool.U,1);assert.equal(a.pool.B,1);assert.equal(a.library.length,library-1);
  });
  test(`v8 ${role}: Millikin mills its cost before the stack, but cannot be used by automatic mana payment`,async()=>{
    const ctx=context(MTG,role),{game,a}=ctx;
    const millikin=put(MTG,game,a,'Millikin');
    assert.equal(game.manaSolve(a,MTG.parseCost('{1}')),null);
    const library=a.library.length,action=game.activatableList(a).find(entry=>entry.card===millikin&&entry.ability);
    assert.ok(action);assert.equal(await game.activateAbility(a,action),true);
    assert.equal(a.library.length,library-1);assert.equal(a.pool.C,0);
    await game.counterStackObject(game.stack.at(-1));await settle(game);
    assert.equal(a.pool.C,0);assert.equal(a.library.length,library-1);
    millikin.tapped=false;a.library=[];
    assert.equal(game.activatableList(a).some(entry=>entry.card===millikin),false);
    assert.equal(await game.activateAbility(a,action),false);assert.equal(millikin.tapped,false);
  });
  test(`v8 ${role}: Selvala's public Parley runs only on resolution, after both players can respond`,async()=>{
    const ctx=context(MTG,role),{game,a,b}=ctx;
    const selvala=put(MTG,game,a,'Selvala, Explorer Returned');
    put(MTG,game,b,'Shock','library');
    const library=[a.library.length,b.library.length],life=a.life,reveals=[];
    game.revealToHuman=async payload=>reveals.push(...payload.cards);
    assert.equal(game.manaSources(a).some(entry=>entry.card===selvala),false);
    const action=game.activatableList(a).find(entry=>entry.card===selvala&&entry.ability);
    assert.ok(action);assert.equal(await game.activateAbility(a,action),true);
    assert.equal(a.pool.G,0);assert.equal(a.life,life);assert.deepEqual(reveals,[]);
    await settle(game);
    assert.equal(reveals.length,2);assert.equal(a.pool.G,1);assert.equal(a.life,life+1);
    assert.deepEqual([a.library.length,b.library.length],library.map(n=>n-1));
  });
  test(`v8 ${role}: an explicit draw-then-mana descriptor preserves effect order and uses the stack`,async()=>{
    const ctx=context(MTG,role),{game,a}=ctx;
    const source=await castArtifact(ctx,'V8 Library Mana');
    const action=game.activatableList(a).find(entry=>entry.card===source&&entry.ability);
    const library=a.library.length;
    assert.ok(action?.ability.oracleManaUsesStack);
    assert.equal(await game.activateAbility(a,action),true);assert.equal(a.library.length,library);assert.equal(a.pool.G,0);
    await settle(game);assert.equal(a.library.length,library-1);assert.equal(a.pool.G,1);
  });
}
