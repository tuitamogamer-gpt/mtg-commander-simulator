import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureEngine,context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';
const MTG=fixtureEngine([
 ['Emerge Probe','When you cast this spell, draw a card.\nEmerge {5}{G}{U}','Creature — Eldrazi','{9}{G}{U}'],
 ['Emerge Colorless','Emerge {5}{C}{U}','Creature — Eldrazi','{9}{U}'],
 ['Emerge Double Sacrifice','As an additional cost to cast this spell, sacrifice a creature.\nEmerge {5}{G}{U}','Creature — Eldrazi','{9}{G}{U}'],
 ['Emerge Fodder Seven','','Creature — Bear','{7}'],
 ['Emerge Fodder Three','','Creature — Bear','{3}'],
 ['Emerge Fodder Zero','','Creature — Bear','{0}'],
 ['Emerge Mana Fodder','Sacrifice this creature: Add {G}.','Creature — Bear','{7}'],
]);
const own=(ctx,name,zone='battlefield')=>put(MTG,ctx.game,ctx.a,name,zone);
const alternative=card=>card.def.altCosts.find(a=>a.oracleEmergeCost);
function ready(role,name='Emerge Probe'){const ctx=context(MTG,role);ctx.a.pool={W:0,U:1,B:0,R:0,G:1,C:0};return{...ctx,source:own(ctx,name,'hand')};}
const cast=ctx=>ctx.game.castSpell(ctx.a,ctx.source,{from:ctx.source.zone,alt:alternative(ctx.source)});
const stack=ctx=>ctx.game.stack.find(o=>o.card===ctx.source);
for(const role of ['human','ai']){
 test(`Emerge ${role}: only an affordable sacrifice is offered, payment precedes cast triggers`,async()=>{
  const ctx=ready(role),zero=own(ctx,'Emerge Fodder Zero'),high=own(ctx,'Emerge Fodder Seven');
  assert.ok(ctx.game.castableList(ctx.a).some(o=>o.card===ctx.source&&o.alt?.oracleEmergeCost));
  assert.equal(await cast(ctx),true);const so=stack(ctx);assert.ok(so);assert.equal(so.manaSpent,2);
  assert.equal(high.zone,'graveyard');assert.equal(zero.zone,'battlefield');assert.equal(so.oracleEmergePayment.manaValue,7);
  assert.deepEqual(Array.from(so.oracleV4AdditionalCost.sacrifices,c=>c.iid),[high.iid]);
  assert.equal(ctx.a.pool.G+ctx.a.pool.U,0);assert.ok(ctx.game.stack.some(o=>o.kind==='trigger'));
  assert.equal(await ctx.game.counterStackObject(so),true);await settle(ctx.game);assert.equal(high.zone,'graveyard');assert.equal(ctx.a.hand.length,1,'cast trigger resolves even though the spell was countered');
 });
 test(`Emerge ${role}: fixed colored and colorless symbols survive the generic reduction`,async()=>{
  const ctx=ready(role,'Emerge Colorless');ctx.a.pool.C=0;own(ctx,'Emerge Fodder Seven');
  assert.equal(ctx.game.castableList(ctx.a).some(o=>o.card===ctx.source),false);assert.equal(await cast(ctx),false);
  ctx.a.pool.C=1;assert.equal(await cast(ctx),true);assert.equal(stack(ctx).manaSpent,2);assert.equal(ctx.a.pool.G,1);assert.equal(ctx.a.pool.C+ctx.a.pool.U,0);await settle(ctx.game);
 });
 test(`Emerge ${role}: commander tax stays in total cost and normal casting does not sacrifice`,async()=>{
  const ctx=ready(role);await ctx.game.move(ctx.source,'command');ctx.source.commander=true;ctx.source.cmdCasts=2;const high=own(ctx,'Emerge Fodder Seven');
  assert.equal(await cast(ctx),false);assert.equal(high.zone,'battlefield');ctx.a.pool.C=2;
  assert.equal(await cast(ctx),true);assert.equal(stack(ctx).manaSpent,4);assert.equal(ctx.a.pool.C,0);await settle(ctx.game);
  const normal=own(ctx,'Emerge Probe','hand'),fodder=own(ctx,'Emerge Fodder Seven');ctx.a.pool={W:0,U:1,B:0,R:0,G:1,C:9};
  assert.equal(await ctx.game.castSpell(ctx.a,normal,{from:'hand'}),true);const so=ctx.game.stack.find(o=>o.card===normal);assert.equal(so.manaSpent,11);assert.equal(so.oracleEmergePayment,undefined);assert.equal(fodder.zone,'battlefield');await settle(ctx.game);
 });
 test(`Emerge ${role}: compounded sacrifices cannot reuse one permanent`,async()=>{
  const ctx=ready(role,'Emerge Double Sacrifice'),high=own(ctx,'Emerge Fodder Seven');
  assert.equal(await cast(ctx),false);assert.equal(high.zone,'battlefield');assert.equal(ctx.a.pool.G+ctx.a.pool.U,2);
  const other=own(ctx,'Emerge Fodder Zero');
  if(role==='human'){const decide=ctx.a.controller.decide.bind(ctx.a.controller);ctx.a.controller.decide=async(g,q)=>q.type==='chooseCards'&&q.aiHint?.kind==='addlSac'&&q.from.includes(other)?[other]:decide(g,q);}
  assert.equal(await cast(ctx),true);assert.equal(stack(ctx).oracleV4AdditionalCost.sacrifices.length,2);assert.equal(high.zone,'graveyard');assert.equal(other.zone,'graveyard');await settle(ctx.game);
 });
}
test('Emerge rejects forged reduction, changed sacrifice identity, and duplicate use as a mana sacrifice',async()=>{
 const ctx=ready('human'),high=own(ctx,'Emerge Fodder Seven');
 assert.equal(await ctx.game.castSpell(ctx.a,ctx.source,{from:'hand',alt:{...alternative(ctx.source),oracleEmergeReduction:100}}),false);
 const decide=ctx.a.controller.decide.bind(ctx.a.controller);ctx.a.controller.decide=async(g,q)=>{const answer=await decide(g,q);if(q.type==='chooseCards'&&q.aiHint?.kind==='addlSac'){await g.move(high,'exile');await g.move(high,'battlefield');}return answer;};
 assert.equal(await cast(ctx),false);assert.equal(ctx.a.pool.G+ctx.a.pool.U,2);assert.equal(ctx.source.zone,'hand');
 const mana=ready('human');mana.a.pool.G=0;const manaSource=own(mana,'Emerge Mana Fodder');
 assert.equal(mana.game.castableList(mana.a).some(o=>o.card===mana.source),false);assert.equal(await cast(mana),false);assert.equal(manaSource.zone,'battlefield');
});
test('Emerge local AI picks and performs the canonical casting action',async()=>{
 const ctx=ready('ai');own(ctx,'Emerge Fodder Seven');const casts=ctx.game.castableList(ctx.a).filter(o=>o.card===ctx.source);
 const action=await ctx.a.controller.decide(ctx.game,{type:'main',player:ctx.a,phase:ctx.game.phase,casts,acts:[],lands:[]});
 assert.equal(action.kind,'cast');assert.equal(action.alt.oracleEmergeCost,true);await ctx.game.performAction(ctx.a,action);assert.ok(stack(ctx));await settle(ctx.game);assert.equal(ctx.source.zone,'battlefield');
});
test('Emerge unsupported variable and unplanned optional cost combinations remain closed',()=>{
 for(const oracle of ['Emerge {X}{U}','Emerge {5}{U}\nKicker {1}'])assert.equal(!!semanticClass({name:'Unknown Emerge',layout:'normal',type_line:'Creature — Eldrazi',mana_cost:'{8}',oracle_text:oracle,power:'2',toughness:'2'}).semanticClass,false);
});
