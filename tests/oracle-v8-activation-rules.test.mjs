import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureEngine,context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {extensionLine} from '../scripts/oracle-v8-activation-rules.mjs';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';

const MTG=fixtureEngine([
  ['Rule Shrine Cost','{5}{W}, {T}: Draw a card. This ability costs {1} less to activate for each Shrine you control.','Artifact','{0}'],
  ['Rule Hand Surcharge','{3}, {T}: Draw three cards. This ability costs {1} more to activate for each card in your hand.','Artifact','{0}'],
  ['Rule Counter Cost','{5}{U}, {T}: Draw a card. This ability costs {1} less to activate for each oil counter on this artifact.','Artifact','{0}'],
  ['Rule Conditional Cost','{4}{W}, {T}: Draw a card. This ability costs {2} less to activate if you control a legendary creature.','Artifact','{0}'],
  ['Rule Composed','{1}: Draw a card. Activate only if you control an enchantment and only as a sorcery and only once each turn.','Artifact','{0}'],
  ['Rule Once Object','{1}: Draw a card. Activate only as a sorcery and only once.','Artifact','{0}'],
  ['Rule Threshold','{T}: Draw a card. Activate only if there are three or more brick counters on this artifact.','Artifact','{0}'],
  ['Rule Upkeep','{1}: Draw a card. Activate only during your upkeep and only if you control a Swamp.','Artifact','{0}'],
  ['Rule Timing Mana','{T}: Add {U} or {B}. Activate only if this land entered this turn or if you control a basic land.','Land',''],
  ['Rule Shrine','','Enchantment — Shrine','{1}'],
  ['Rule Creature','','Creature — Bear','{1}'],
  ['Rule Artifact','','Artifact','{0}'],
]);
const own=(ctx,name,zone='battlefield')=>put(MTG,ctx.game,ctx.a,name,zone);
function ready(role,name){const ctx=context(MTG,role);ctx.a.pool={W:0,U:0,B:0,R:0,G:0,C:0};return {...ctx,source:own(ctx,name)};}
const entry=ctx=>ctx.game.activatableList(ctx.a).find(row=>row.card===ctx.source&&row.ability);
const raw=ctx=>({card:ctx.source,ability:ctx.source.def.abilities[0],idx:0});
const manaCost=ctx=>ctx.game.abilityManaCost(ctx.a,ctx.source,ctx.source.def.abilities[0].cost.mana(ctx.game,ctx.source),{ability:ctx.source.def.abilities[0]});

for(const role of ['human','ai']) {
  test(`activation rules ${role}: live subtype discount preserves colored mana and composes with global reductions`,async()=>{
    const ctx=ready(role,'Rule Shrine Cost');ctx.a.pool.W=1;ctx.a.pool.C=2;
    own(ctx,'Rule Shrine');own(ctx,'Rule Shrine');put(MTG,ctx.game,ctx.b,'Rule Shrine');
    assert.equal(manaCost(ctx).generic,3);assert.equal(!!entry(ctx),false);assert.equal(await ctx.game.activateAbility(ctx.a,raw(ctx)),false);assert.equal(ctx.source.tapped,false);
    const reducer=own(ctx,'Rule Artifact');reducer.def={...reducer.def,abilityCostReduction:()=>1};ctx.game.recalc();
    assert.equal(manaCost(ctx).generic,2);assert.deepEqual(Array.from(manaCost(ctx).pips,pip=>Array.from(pip)),[['W']]);
    const offered=entry(ctx);assert.ok(offered);
    if(role==='ai') {
      const action=await ctx.a.controller.decide(ctx.game,{type:'main',player:ctx.a,phase:ctx.game.phase,casts:[],acts:[offered],lands:[]});
      assert.equal(action.kind,'activate');assert.equal(await ctx.game.performAction(ctx.a,action),true);
    }else assert.equal(await ctx.game.activateAbility(ctx.a,offered),true);
    assert.equal(ctx.source.tapped,true);assert.equal(ctx.a.pool.W+ctx.a.pool.C,0);await settle(ctx.game);assert.equal(ctx.a.hand.length,1);
  });
  test(`activation rules ${role}: hand surcharge is exact and cannot be skipped with a stale affordable entry`,async()=>{
    const ctx=ready(role,'Rule Hand Surcharge');ctx.a.pool.C=3;const offered=entry(ctx);assert.ok(offered);
    own(ctx,'Forest','hand');own(ctx,'Forest','hand');assert.equal(manaCost(ctx).generic,5);
    assert.equal(await ctx.game.activateAbility(ctx.a,offered),false);assert.equal(ctx.a.pool.C,3);assert.equal(ctx.source.tapped,false);
    ctx.a.pool.C=5;assert.equal(await ctx.game.activateAbility(ctx.a,raw(ctx)),true);assert.equal(ctx.a.pool.C,0);
    await settle(ctx.game);assert.equal(ctx.a.hand.length,5);
  });
  test(`activation rules ${role}: source-counter discount floors generic mana at zero without removing colored pips`,async()=>{
    const ctx=ready(role,'Rule Counter Cost');ctx.source.counters.oil=8;ctx.game.recalc();ctx.a.pool.C=1;
    assert.equal(manaCost(ctx).generic,0);assert.equal(!!entry(ctx),false,'generic mana cannot replace the blue pip');
    ctx.a.pool.C=0;ctx.a.pool.U=1;assert.equal(await ctx.game.activateAbility(ctx.a,raw(ctx)),true);assert.equal(ctx.a.pool.U,0);
    assert.equal(ctx.source.counters.oil,8,'discount counts counters without removing them');await settle(ctx.game);
  });
  test(`activation rules ${role}: condition, sorcery timing and once each turn all gate the same ability`,async()=>{
    const ctx=ready(role,'Rule Composed');ctx.a.pool.C=4;
    assert.equal(await ctx.game.activateAbility(ctx.a,raw(ctx)),false);own(ctx,'Rule Shrine');
    ctx.game.turnPlayer=ctx.b;assert.equal(await ctx.game.activateAbility(ctx.a,raw(ctx)),false);
    ctx.game.turnPlayer=ctx.a;ctx.game.phase='upkeep';assert.equal(await ctx.game.activateAbility(ctx.a,raw(ctx)),false);
    ctx.game.phase='main1';assert.equal(await ctx.game.activateAbility(ctx.a,raw(ctx)),true);await settle(ctx.game);
    assert.equal(await ctx.game.activateAbility(ctx.a,raw(ctx)),false);assert.equal(ctx.a.pool.C,3);
    ctx.game.turnNo+=1;assert.equal(await ctx.game.activateAbility(ctx.a,raw(ctx)),true);await settle(ctx.game);assert.equal(ctx.a.hand.length,2);
  });
  test(`activation rules ${role}: once per object stays used across turns and resets only after a zone change`,async()=>{
    const ctx=ready(role,'Rule Once Object');ctx.a.pool.C=4;
    assert.equal(await ctx.game.activateAbility(ctx.a,raw(ctx)),true);await settle(ctx.game);ctx.game.turnNo+=1;
    assert.equal(await ctx.game.activateAbility(ctx.a,raw(ctx)),false);assert.equal(ctx.a.pool.C,3);
    await ctx.game.move(ctx.source,'hand');await ctx.game.move(ctx.source,'battlefield');
    assert.equal(await ctx.game.activateAbility(ctx.a,raw(ctx)),true);await settle(ctx.game);assert.equal(ctx.a.hand.length,2);
  });
}

test('activation rules conditional reductions follow current controller and exact legendary quality',async()=>{
  const ctx=ready('human','Rule Conditional Cost'),creature=own(ctx,'Rule Creature');ctx.a.pool.W=1;ctx.a.pool.C=2;
  assert.equal(manaCost(ctx).generic,4);creature.def={...creature.def,super:['Legendary']};ctx.game.recalc();assert.equal(manaCost(ctx).generic,2);
  const offered=entry(ctx);assert.ok(offered);creature.ctrl=ctx.b;ctx.game.recalc();
  assert.equal(await ctx.game.activateAbility(ctx.a,offered),false);assert.equal(ctx.a.pool.C,2);assert.equal(ctx.source.tapped,false);
  creature.ctrl=ctx.a;ctx.game.recalc();assert.equal(await ctx.game.activateAbility(ctx.a,raw(ctx)),true);await settle(ctx.game);
});

test('activation rules explicit source counter thresholds and composed upkeep restrictions are enforced',async()=>{
  const ctx=ready('human','Rule Threshold');ctx.source.counters.brick=2;
  assert.equal(await ctx.game.activateAbility(ctx.a,raw(ctx)),false);ctx.source.counters.brick=3;
  assert.equal(await ctx.game.activateAbility(ctx.a,raw(ctx)),true);await settle(ctx.game);
  const upkeep=ready('human','Rule Upkeep');upkeep.a.pool.C=1;own(upkeep,'Swamp');
  assert.equal(await upkeep.game.activateAbility(upkeep.a,raw(upkeep)),false);upkeep.game.phase='upkeep';
  assert.equal(await upkeep.game.activateAbility(upkeep.a,raw(upkeep)),true);await settle(upkeep.game);
});

test('activation rules an or-condition on a true mana ability remains outside the Stack and respects either branch',async()=>{
  for(const branch of ['entry','basic']){
    const ctx=ready('human','Rule Timing Mana');assert.equal(ctx.game.manaSources(ctx.a).some(row=>row.card===ctx.source),false);
    if(branch==='entry')ctx.source.meta._enteredTurn=ctx.game.turnNo;else own(ctx,'Forest');
    const candidates=ctx.game.manaSources(ctx.a).filter(row=>row.card===ctx.source);assert.ok(candidates.length);
    assert.equal(await ctx.game.payMana(ctx.a,MTG.parseCost('{U}')),true);assert.equal(ctx.source.tapped,true);assert.equal(ctx.game.stack.length,0);
  }
});

test('activation rules fail closed on unknown timing, conditions, reference bindings and cost semantics',()=>{
  const h={condition:()=>null,count:()=>null,line:()=>{throw new Error('unsupported rules must not reach body compilation');}};
  for(const line of [
    '{1}: Draw a card. Activate only during the end of combat step.',
    '{1}: Draw a card. Activate no more than twice each turn.',
    '{1}: Draw a card. Activate only if an unknown event happened.',
    '{1}: Draw a card. This ability costs {X} less to activate, where X is the number of differently named lands you control.',
    '{1}: Draw a card. This ability costs {1}{U} less to activate if you attacked this turn.',
    '{1}: Draw a card. This ability costs {1} less to activate if it targets a creature with power 3 or less.',
  ])assert.equal(extensionLine({},line,h),null,line);
  const card={layout:'normal',name:'Unknown activation',type_line:'Artifact',mana_cost:'{1}',oracle_text:'{1}: Draw a card. Activate only once and only once each turn.'};
  assert.equal(!!semanticClass(card).semanticClass,false);
});
