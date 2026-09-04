import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureEngine,context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';
// CR 702.190, official release notes:
// https://magic.wizards.com/en/news/feature/teenage-mutant-ninja-turtles-release-notes
const MTG=fixtureEngine([
 ['Sneak Sorcery','Sneak {U}\nDraw two cards.','Sorcery','{3}{U}'],
 ['Sneak Creature','Sneak {1}{U}\nWhen this creature enters, draw a card.','Creature — Ninja','{4}{U}'],
 ['Sneak Fodder','','Creature — Bear','{G}'],
 ['Web Creature','Web-slinging {G}\nWhen this creature enters, draw a card.','Creature — Spider','{4}{G}'],
]);
const own=(ctx,name,zone='battlefield')=>put(MTG,ctx.game,ctx.a,name,zone);
function ready(role,name='Sneak Creature'){const ctx=context(MTG,role);ctx.a.pool={W:0,U:1,B:0,R:0,G:0,C:1};ctx.game.phase='combat';ctx.game.step='blockers';ctx.game.combat={attackers:[],defenders:new Map()};return{...ctx,source:own(ctx,name,'hand')};}
function attacker(ctx,owner=ctx.a,defender=ctx.b){const card=put(MTG,ctx.game,owner,'Sneak Fodder');card.ctrl=ctx.a;card.attacking=defender;card.blockedBy=[];card.wasBlocked=false;card.tapped=true;ctx.game.combat.attackers.push(card);return card;}
const canonical=ctx=>ctx.source.def.altCosts.find(a=>a.oracleSneakCost||a.oracleWebSlingingCost);
const listed=ctx=>ctx.game.castableList(ctx.a).find(row=>row.card===ctx.source&&row.alt?.oracleAlternativeId===canonical(ctx).oracleAlternativeId);
const cast=ctx=>ctx.game.castSpell(ctx.a,ctx.source,{from:ctx.source.zone,alt:canonical(ctx)});
const sourceStack=ctx=>ctx.game.stack.find(so=>so.card===ctx.source);
for(const role of ['human','ai']){
 test(`Sneak ${role}: exact blockers window, unblocked return cost and normal spell response`,async()=>{
  const ctx=ready(role,'Sneak Sorcery'),returned=attacker(ctx,ctx.b);
  for(const step of ['begin','attackers','firstStrike','damage','endCombat']){ctx.game.step=step;assert.equal(listed(ctx),undefined);assert.equal(await cast(ctx),false);}
  ctx.game.step='blockers';ctx.game.turnPlayer=ctx.b;assert.equal(listed(ctx),undefined);ctx.game.turnPlayer=ctx.a;
  returned.wasBlocked=true;assert.equal(listed(ctx),undefined);returned.wasBlocked=false;assert.ok(listed(ctx));
  assert.equal(await cast(ctx),true);assert.equal(returned.zone,'hand');assert.ok(ctx.b.hand.includes(returned));assert.equal(sourceStack(ctx).kind,'spell');assert.equal(sourceStack(ctx).manaSpent,1);
  const so=sourceStack(ctx);assert.equal(so.oracleV4AdditionalCost.returns[0],returned.iid);assert.equal(await ctx.game.counterStackObject(so),true);await settle(ctx.game);assert.equal(ctx.source.zone,'graveyard');assert.equal(ctx.a.hand.length,0);assert.equal(returned.zone,'hand');
 });
 test(`Sneak ${role}: creature enters already tapped attacking the recorded defender without an attack event`,async()=>{
  const ctx=ready(role);const returned=attacker(ctx),events=[];const emit=ctx.game.emit;ctx.game.emit=async function(name,data,...args){if(data.card===ctx.source&&['etb','attacks'].includes(name))events.push({name,tapped:ctx.source.tapped,attacking:ctx.source.attacking});return emit.call(this,name,data,...args);};
  assert.equal(await cast(ctx),true);assert.equal(returned.zone,'hand');await settle(ctx.game);assert.equal(ctx.source.zone,'battlefield');assert.equal(ctx.source.tapped,true);assert.equal(ctx.source.attacking,ctx.b);assert.ok(ctx.game.combat.attackers.includes(ctx.source));
  assert.deepEqual(events.map(e=>e.name),['etb']);assert.equal(events[0].attacking,ctx.b);assert.equal(events[0].tapped,true);assert.equal(ctx.a.hand.length,2);
 });
 test(`Web-slinging ${role}: only a tapped controlled creature can be returned and it grants no timing permission`,async()=>{
  const ctx=ready(role,'Web Creature');ctx.a.pool={W:0,U:0,B:0,R:0,G:1,C:0};const returned=own(ctx,'Sneak Fodder');
  assert.equal(listed(ctx),undefined);ctx.game.phase='main1';ctx.game.step='';assert.equal(listed(ctx),undefined);returned.tapped=true;assert.ok(listed(ctx));
  assert.equal(await cast(ctx),true);assert.equal(returned.zone,'hand');assert.equal(sourceStack(ctx).manaSpent,1);await settle(ctx.game);assert.equal(ctx.source.zone,'battlefield');assert.equal(ctx.source.tapped,false);assert.equal(ctx.source.attacking,null);
 });
}
test('Sneak preserves defender zone identity and gives a copied permanent spell its own attacking token',async()=>{
 const ctx=ready('human'),walker=new MTG.CardInst({...MTG.DEFS['Sneak Fodder'],name:'Combat Cost Walker',types:['Planeswalker'],subtypes:['Jace'],loyalty:'5'},ctx.b);walker.zone='battlefield';walker.counters.loyalty=5;ctx.game.battlefield.push(walker);ctx.game.recalc();attacker(ctx,ctx.a,walker);
 assert.equal(await cast(ctx),true);const original=sourceStack(ctx);await ctx.game.copySpell(original,ctx.a,{mayNewTargets:false});await ctx.game.resolveTop();
 const copy=ctx.game.creatures(ctx.a).find(card=>card.isToken);assert.ok(copy);assert.equal(copy.tapped,true);assert.equal(copy.attacking,walker);
 while(ctx.game.stack.at(-1)!==original)await ctx.game.resolveTop();await ctx.game.move(walker,'exile');await ctx.game.move(walker,'battlefield');walker.counters.loyalty=5;
 await settle(ctx.game);assert.equal(ctx.source.tapped,true);assert.equal(ctx.source.attacking,null,'new walker object is not the defender returned-cost recorded');
});
test('Sneak payment rechecks unblocked state and refuses forged alternate flags before mana is spent',async()=>{
 const ctx=ready('human'),returned=attacker(ctx),decide=ctx.a.controller.decide.bind(ctx.a.controller);
 assert.equal(await ctx.game.castSpell(ctx.a,ctx.source,{from:'hand',alt:{...canonical(ctx),altCostStr:'{0}'}}),false);
 ctx.a.controller.decide=async(g,q)=>{const picked=await decide(g,q);if(q.type==='chooseCards'&&q.aiHint?.kind==='bounceCost')returned.wasBlocked=true;return picked;};
 assert.equal(await cast(ctx),false);assert.equal(ctx.a.pool.C+ctx.a.pool.U,2);assert.equal(returned.zone,'battlefield');assert.equal(ctx.source.zone,'hand');
});
test('Sneak normal casting neither returns a creature nor changes battlefield entry',async()=>{
 const ctx=ready('human');ctx.game.phase='main1';ctx.game.step='';ctx.game.combat=null;ctx.a.pool.C=4;const fodder=own(ctx,'Sneak Fodder');
 assert.equal(await ctx.game.castSpell(ctx.a,ctx.source,{from:'hand'}),true);assert.equal(sourceStack(ctx).manaSpent,5);await settle(ctx.game);assert.equal(fodder.zone,'battlefield');assert.equal(ctx.source.tapped,false);assert.equal(ctx.source.attacking,null);
});
test('Sneak local AI selects and performs the legal spell during blockers',async()=>{
 const ctx=ready('ai','Sneak Sorcery'),returned=attacker(ctx),casts=ctx.game.castableList(ctx.a).filter(row=>row.card===ctx.source);
 const action=await ctx.a.controller.decide(ctx.game,{type:'priority',player:ctx.a,phase:ctx.game.phase,casts,acts:[],stack:[]});assert.equal(action.kind,'cast');assert.equal(action.alt.oracleSneakCost,true);await ctx.game.performAction(ctx.a,action);assert.equal(returned.zone,'hand');assert.ok(sourceStack(ctx));await settle(ctx.game);assert.equal(ctx.a.hand.length,3);
});
test('combat alternative grammar rejects variable costs and unknown suffixes',()=>{
 for(const oracle of ['Sneak {X}{U}','Sneak {U} during any combat.','Web-slinging {X}{G}'])assert.equal(!!semanticClass({name:'UnknownCombatCost',layout:'normal',type_line:'Creature — Bear',mana_cost:'{4}{U}',oracle_text:oracle,power:'2',toughness:'2'}).semanticClass,false);
});
