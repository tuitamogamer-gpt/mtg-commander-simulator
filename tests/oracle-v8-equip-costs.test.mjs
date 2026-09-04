import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureEngine,context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';
const MTG=fixtureEngine([
 ['Equip Human','Equipped creature gets +2/+1.\nEquip Human {1}\nEquip {3}','Artifact — Equipment','{1}'],
 ['Equip Token','Equipped creature gets +1/+1.\nEquip creature token {1}\nEquip {3}','Artifact — Equipment','{1}'],
 ['Equip Commander','Equipped creature gets +1/+1.\nEquip commander {1}\nEquip {3}','Artifact — Equipment','{1}'],
 ['Equip Typal Union','Equipped creature gets +1/+1.\nEquip Shaman, Warlock, or Wizard {1}\nEquip {4}','Artifact — Equipment','{1}'],
 ['Equip Life','Equipped creature gets +1/+1.\nEquip—Pay 3 life.','Artifact — Equipment','{1}'],
 ['Equip Discard','Equipped creature gets +1/+1.\nEquip—Discard a card.','Artifact — Equipment','{1}'],
 ['Equip Sacrifice','Equipped creature gets +1/+1.\nEquip—Sacrifice a creature.','Artifact — Equipment','{1}'],
 ['Equip Other','Equipped creature gets +1/+1.\nEquip—Sacrifice another nonland permanent. Activate only once each turn.','Artifact — Equipment','{1}'],
 ['Equip Counter','Equipped creature gets +1/+1.\nEquip—Remove a charge counter from this Equipment.','Artifact — Equipment','{1}'],
 ['Equip Condition','Equipped creature gets +1/+1.\nEquip {2}. This ability costs {2} less to activate if you have one or fewer cards in hand.','Artifact — Equipment','{1}'],
 ['Equip Power','Equipped creature gets +1/+1.\nEquip {10}. This ability costs {X} less to activate, where X is the power of the creature it targets.','Artifact — Equipment','{1}'],
 ['Equip Self Discount','Equip abilities you activate that target this creature cost {2} less to activate.','Creature — Human','{G}'],
 ['Equip Global Discount','Equip abilities you activate cost {1} less to activate.','Creature — Human','{G}'],
 ['Equip Other Discount','Equip abilities you activate of other Equipment cost {1} less to activate.\nEquipped creature gets +1/+1.\nEquip {3}','Artifact — Equipment','{1}'],
 ['Equip Human Host','','Creature — Human','{0}'],['Equip Wizard Host','','Creature — Wizard','{0}'],
]);
const own=(ctx,name,zone='battlefield')=>put(MTG,ctx.game,ctx.a,name,zone);
const action=ctx=>ctx.game.activatableList(ctx.a).find(row=>row.card===ctx.source&&row.ability?.oracleEquip);
function ready(role,name){const ctx=context(MTG,role);ctx.a.pool={W:0,U:0,B:0,R:0,G:0,C:0};ctx.source=own(ctx,name);return ctx;}
const activate=ctx=>ctx.game.activateAbility(ctx.a,action(ctx));
for(const role of ['human','ai']){
 test(`Equip ${role}: typed, token, commander and subtype-union abilities preserve the separate normal ability`,async()=>{
  for(const [name,hostName,property]of [['Equip Human','Equip Human Host'],['Equip Token','Grizzly Bears','isToken'],['Equip Commander','Grizzly Bears','commander'],['Equip Typal Union','Equip Wizard Host']]){
   const ctx=ready(role,name);own(ctx,'Grizzly Bears');ctx.a.pool.C=1;assert.equal(action(ctx),undefined);const host=own(ctx,hostName);if(property)host[property]=true;ctx.game.recalc();assert.ok(action(ctx));assert.equal(await activate(ctx),true);assert.equal(ctx.a.pool.C,0);assert.equal(ctx.source.attachedTo,null);assert.equal(ctx.game.stack.at(-1).kind,'ability');await settle(ctx.game);assert.equal(ctx.source.attachedTo,host.iid);
   assert.equal(ctx.source.def.equip,name==='Equip Typal Union'?'{4}':'{3}');
  }
 });
 test(`Equip ${role}: life, discard, sacrifice and exact counter costs are paid before a respondable attachment`,async()=>{
  for(const kind of ['Life','Discard','Sacrifice','Counter']){
   const ctx=ready(role,'Equip '+kind),host=own(ctx,'Equip Human Host');const beforeLife=ctx.a.life;let fodder;
   if(kind==='Life')ctx.a.life=2;
   if(kind==='Sacrifice')await ctx.game.move(host,'hand');
   assert.equal(action(ctx),undefined);
   if(kind==='Life')ctx.a.life=beforeLife;
   if(kind==='Discard')fodder=own(ctx,'Forest','hand');
   if(kind==='Sacrifice'){await ctx.game.move(host,'battlefield');fodder=own(ctx,'Grizzly Bears');}
   if(kind==='Counter')ctx.source.counters.charge=1;
   assert.equal(await activate(ctx),true);const so=ctx.game.stack.at(-1);assert.equal(so.kind,'ability');assert.equal(ctx.source.attachedTo,null);
   if(kind==='Life')assert.equal(ctx.a.life,beforeLife-3);
   if(kind==='Discard')assert.equal(fodder.zone,'graveyard');
   if(kind==='Sacrifice')assert.ok(ctx.game.creatures(ctx.a).length===1);
   if(kind==='Counter')assert.equal(ctx.source.counters.charge||0,0);
   await settle(ctx.game);if(host.zone==='battlefield')assert.equal(ctx.source.attachedTo,host.iid);
  }
 });
 test(`Equip ${role}: target-dependent power and hand condition determine the amount actually paid`,async()=>{
  const ctx=ready(role,'Equip Power'),small=own(ctx,'Equip Human Host'),big=own(ctx,'Grizzly Bears');big.def={...big.def,power:'8',toughness:'8'};ctx.game.recalc();ctx.a.pool.C=2;assert.ok(action(ctx));const ability=action(ctx);assert.equal(await ctx.game.activateAbility(ctx.a,ability,[big]),true);assert.equal(ctx.a.pool.C,0);await settle(ctx.game);assert.equal(ctx.source.attachedTo,big.iid);
  const bad=ready(role,'Equip Power'),weak=own(bad,'Grizzly Bears');bad.a.pool.C=2;assert.equal(action(bad),undefined);assert.equal(await bad.game.activateAbility(bad.a,{card:bad.source,ability:bad.source.def.abilities[0],idx:0},[weak]),false);assert.equal(bad.a.pool.C,2);
  const condition=ready(role,'Equip Condition');own(condition,'Grizzly Bears');own(condition,'Forest','hand');own(condition,'Forest','hand');assert.equal(action(condition),undefined);await condition.game.move(condition.a.hand[0],'graveyard');assert.equal(await activate(condition),true);await settle(condition.game);
 });
}
test('Equip reductions apply to legacy and generic Equip, the chosen host only, and never remove colored mana',async()=>{
 const ctx=ready('human','Equip Human'),host=own(ctx,'Equip Self Discount'),other=own(ctx,'Equip Human Host');ctx.a.pool.C=1;assert.equal(ctx.game.abilityManaCost(ctx.a,ctx.source,'{3}{W}',{kind:'equip',targets:[host]}).generic,1);assert.equal(ctx.game.abilityManaCost(ctx.a,ctx.source,'{3}{W}',{kind:'equip',targets:[other]}).generic,3);
 assert.equal(await ctx.game.activateAbility(ctx.a,{card:ctx.source,equip:true},[host]),true);assert.equal(ctx.a.pool.C,0);await settle(ctx.game);assert.equal(ctx.source.attachedTo,host.iid);
 const global=own(ctx,'Equip Global Discount');const typed=ctx.source.def.abilities[0];assert.equal(ctx.game.abilityManaCost(ctx.a,ctx.source,'{1}{W}',{ability:typed,targets:[other]}).generic,0);assert.equal(ctx.game.abilityManaCost(ctx.a,ctx.source,'{1}{W}',{ability:typed,targets:[other]}).pips.length,1);assert.equal(ctx.game.abilityManaCost(ctx.a,ctx.source,'{3}',{ability:{},targets:[other]}).generic,3);
 global.cur.abilitiesDisabled=true;assert.equal(ctx.game.abilityManaCost(ctx.a,ctx.source,'{1}',{ability:typed,targets:[other]}).generic,1);
 const reducer=own(ctx,'Equip Other Discount');assert.equal(ctx.game.abilityManaCost(ctx.a,reducer,'{3}',{kind:'equip',targets:[other]}).generic,2);await ctx.game.move(global,'exile');assert.equal(ctx.game.abilityManaCost(ctx.a,reducer,'{3}',{kind:'equip',targets:[other]}).generic,3);assert.equal(ctx.game.abilityManaCost(ctx.a,ctx.source,'{3}',{kind:'equip',targets:[other]}).generic,2);
});
test('Equip once-per-turn and sorcery rules recheck through real activation, and source/target blink cannot attach new objects',async()=>{
 const ctx=ready('human','Equip Other'),fodder=own(ctx,'Sol Ring'),host=own(ctx,'Equip Human Host');assert.equal(action(ctx).ability.cost.sac(ctx.game,ctx.source,ctx.source),false);assert.equal(await activate(ctx),true);assert.equal(fodder.zone,'graveyard');await settle(ctx.game);own(ctx,'Sol Ring');assert.equal(action(ctx),undefined);ctx.game.turnNo++;assert.ok(action(ctx));ctx.game.phase='combat';assert.equal(action(ctx),undefined);
 const blink=ready('human','Equip Discard'),target=own(blink,'Grizzly Bears');own(blink,'Forest','hand');assert.equal(await activate(blink),true);await blink.game.move(target,'exile');await blink.game.move(target,'battlefield');await settle(blink.game);assert.equal(blink.source.attachedTo,null);
 const source=ready('human','Equip Discard');own(source,'Grizzly Bears');own(source,'Forest','hand');assert.equal(await activate(source),true);await source.game.move(source.source,'exile');await source.game.move(source.source,'battlefield');await settle(source.game);assert.equal(source.source.attachedTo,null);
});
test('Equip local AI performs a useful activated option and does not keep re-equipping the same host',async()=>{
 const ctx=ready('ai','Equip Human'),host=own(ctx,'Equip Human Host');ctx.a.pool.C=1;const acts=ctx.game.activatableList(ctx.a).filter(row=>row.card===ctx.source&&row.ability?.oracleEquip),choice=await ctx.a.controller.decide(ctx.game,{type:'main',player:ctx.a,phase:ctx.game.phase,acts,casts:[],lands:[]});assert.equal(choice.kind,'activate');await ctx.game.performAction(ctx.a,choice);await settle(ctx.game);assert.equal(ctx.source.attachedTo,host.iid);assert.ok(ctx.source.def.abilities[0].aiScore(ctx.game,ctx.source,ctx.a)<0);
});
test('Equip compiler defers unknown typed objects, variable cost counts, and unimplemented alternative choices',()=>{
 for(const text of ['Equip AlienType {1}','Equip—Discard X cards.','Equip—Pay {3} or discard a card.','Equip {2}. This ability costs {1} less to activate when anything happens.'])assert.equal(!!semanticClass({name:'Unknown Equip',layout:'normal',type_line:'Artifact — Equipment',mana_cost:'{1}',oracle_text:'Equipped creature gets +1/+1.\n'+text}).semanticClass,false);
});
