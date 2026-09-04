import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureEngine,context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';

const MTG=fixtureEngine([
 ['Keyword Reinforce','Draw a card.\nReinforce 2—{1}{W}','Instant','{2}{W}'],
 ['Keyword Reinforce X','Reinforce X—{X}{W}{W}','Creature — Hydra','{4}{W}'],
 ['Keyword Hybrid Evoke','When this creature enters, draw a card.\nEvoke {G/U}{G/U}','Creature — Elemental','{5}{G}'],
 ['Keyword Exile Evoke','When this creature enters, draw a card.\nEvoke—Exile a blue card from your hand.','Creature — Elemental','{5}{U}'],
 ['Keyword Fodder Blue','','Creature — Bear','{U}'],
 ['Keyword Fodder Red','','Creature — Bear','{R}'],
 ['Keyword Counter','Counter target spell.','Instant','{U}'],
]);
const own=(ctx,name,zone='battlefield')=>put(MTG,ctx.game,ctx.a,name,zone);
function ready(role,name){const ctx=context(MTG,role);ctx.a.pool={W:0,U:0,B:0,R:0,G:0,C:0};return {...ctx,source:own(ctx,name,'hand')};}
const ability=ctx=>ctx.game.activatableList(ctx.a).find(row=>row.card===ctx.source&&row.handAbility);
const alternative=ctx=>ctx.game.castableList(ctx.a).find(row=>row.card===ctx.source&&row.alt?.oracleAlternativeCost&&row.alt.evoke);

for(const role of ['human','ai']){
 test(`keyword costs ${role}: Reinforce discards the actual source and puts exact counters through Stack`,async()=>{
  const ctx=ready(role,'Keyword Reinforce'),target=own(ctx,'Keyword Fodder Blue');ctx.a.pool.W=1;ctx.a.pool.C=1;
  const action=ability(ctx);assert.ok(action);assert.equal(await ctx.game.activateAbility(ctx.a,action),true);
  assert.equal(ctx.source.zone,'graveyard');assert.equal(ctx.a.pool.W+ctx.a.pool.C,0);assert.equal(target.counters['+1/+1']||0,0);
  const stack=ctx.game.stack.at(-1);assert.equal(stack.kind,'ability');assert.equal(stack.ctx.you,ctx.a);
  await settle(ctx.game);assert.equal(target.counters['+1/+1'],2);assert.equal(ctx.a.hand.length,0,'Reinforce does not execute the printed spell body');
 });
 test(`keyword costs ${role}: Reinforce X pays the announced X and locks its target identity`,async()=>{
  const ctx=ready(role,'Keyword Reinforce X'),target=own(ctx,'Keyword Fodder Blue');ctx.a.pool.W=2;ctx.a.pool.C=3;
  if(role==='human'){const decide=ctx.a.controller.decide.bind(ctx.a.controller);ctx.a.controller.decide=(g,q)=>q.type==='chooseX'?Promise.resolve(3):decide(g,q);}
  assert.equal(await ctx.game.activateAbility(ctx.a,ability(ctx)),true);const stack=ctx.game.stack.at(-1),x=stack.ctx.x;
  assert.ok(x>=1&&x<=3);assert.equal(ctx.a.pool.C,3-x);assert.equal(ctx.a.pool.W,0);assert.equal(ctx.source.zone,'graveyard');
  await ctx.game.move(target,'exile');await ctx.game.move(target,'battlefield');await settle(ctx.game);assert.equal(target.counters['+1/+1']||0,0,'blink makes the original targeted object illegal');
 });
 test(`keyword costs ${role}: hybrid Evoke pays either color and creates a respondable sacrifice trigger`,async()=>{
  const ctx=ready(role,'Keyword Hybrid Evoke');ctx.a.pool.G=1;ctx.a.pool.U=1;const row=alternative(ctx);assert.ok(row);
  assert.equal(await ctx.game.castSpell(ctx.a,ctx.source,{from:'hand',alt:row.alt}),true);assert.equal(ctx.a.pool.G+ctx.a.pool.U,0);
  await ctx.game.resolveTop();assert.equal(ctx.source.zone,'battlefield');assert.ok(ctx.game.stack.some(object=>object.name.includes('Evoke sacrifice')));
  await settle(ctx.game);assert.equal(ctx.source.zone,'graveyard');assert.equal(ctx.a.hand.length,1);
  await ctx.game.move(ctx.source,'hand');ctx.a.pool.C=5;ctx.a.pool.G=1;
  assert.equal(await ctx.game.castSpell(ctx.a,ctx.source,{from:'hand'}),true);await settle(ctx.game);assert.equal(ctx.source.zone,'battlefield');assert.equal(ctx.a.pool.C+ctx.a.pool.G,0);
 });
 test(`keyword costs ${role}: nonmana Evoke exiles only a qualifying other card and preserves paid costs after countering`,async()=>{
  const ctx=ready(role,'Keyword Exile Evoke');const wrong=own(ctx,'Keyword Fodder Red','hand');assert.equal(!!alternative(ctx),false,'the blue spell itself cannot pay its exile cost');
  const fodder=own(ctx,'Keyword Fodder Blue','hand'),row=alternative(ctx);assert.ok(row);
  assert.equal(await ctx.game.castSpell(ctx.a,ctx.source,{from:'hand',alt:row.alt}),true);assert.equal(fodder.zone,'exile');assert.equal(wrong.zone,'hand');
  const stack=ctx.game.stack.at(-1);assert.equal(stack.manaSpent,0);assert.equal(stack.castOpts.evoke,true);assert.deepEqual(Array.from(stack.oracleV4AdditionalCost.handExiles),[fodder.iid]);
  assert.equal(await ctx.game.counterStackObject(stack),true);await settle(ctx.game);assert.equal(ctx.source.zone,'graveyard');assert.equal(fodder.zone,'exile');assert.equal(ctx.a.hand.length,1);
 });
}

test('keyword Evoke copied spell creates its own token sacrifice and blink defeats only the original sacrifice trigger',async()=>{
 const ctx=ready('human','Keyword Hybrid Evoke');ctx.a.pool.G=2;const row=alternative(ctx);assert.equal(await ctx.game.castSpell(ctx.a,ctx.source,{from:'hand',alt:row.alt}),true);
 const original=ctx.game.stack.at(-1);await ctx.game.copySpell(original,ctx.a,{mayNewTargets:false});await ctx.game.resolveTop();
 const copy=ctx.game.creatures(ctx.a).find(card=>card.isToken);assert.ok(copy);assert.ok(ctx.game.stack.some(object=>object.name.includes('Evoke sacrifice')&&object.srcCard===copy));
 while(ctx.game.stack.at(-1)!==original)await ctx.game.resolveTop();assert.equal(copy.zone,'ceased');
 await ctx.game.resolveTop();assert.equal(ctx.source.zone,'battlefield');await ctx.game.move(ctx.source,'exile');await ctx.game.move(ctx.source,'battlefield');await settle(ctx.game);assert.equal(ctx.source.zone,'battlefield','the new object is not the evoked entry');
});

test('keyword cost grammars remain closed for unbound amounts and unknown Evoke payments',()=>{
 for(const oracle of ['Reinforce X—{W}','Reinforce twelve—{W}','Evoke—Reveal a blue card from your hand.','Evoke—Pay any amount of life.'])assert.equal(!!semanticClass({name:'Unknown keyword cost',layout:'normal',type_line:'Creature — Elemental',mana_cost:'{4}{U}',power:'2',toughness:'2',oracle_text:oracle}).semanticClass,false,oracle);
});
