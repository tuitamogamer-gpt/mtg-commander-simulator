import test from'node:test';
import assert from'node:assert/strict';
import{fixtureEngine,context,put,settle}from'./helpers/oracle-v8-fixtures.mjs';
import{semanticClass}from'../scripts/import-oracle-batch.mjs';
const MTG=fixtureEngine([
 ['Payment Flashback Life','Draw a card.\nFlashback—{1}{U}, Pay 3 life.','Sorcery','{4}{U}'],
 ['Payment Flashback Sacrifice','Create two 1/1 white Bird creature tokens with flying.\nFlashback—Sacrifice three creatures.','Sorcery','{2}{W}{W}'],
 ['Payment Flashback Mountain','Draw a card.\nFlashback—Sacrifice a Mountain.','Instant','{R}'],
 ['Payment Buyback Discard','Buyback—Discard two cards.\nDraw a card.','Sorcery','{U}'],
 ['Payment Buyback Life','Buyback—Pay 4 life.\nDraw a card.','Instant','{U}'],
 ['Payment Buyback Land','Buyback—Sacrifice a land.\nDraw a card.','Instant','{U}'],
 ['Payment Kicker Land','Kicker—{2}{R}, Sacrifice a land.\nDraw a card. If this spell was kicked, draw a card.','Sorcery','{R}'],
 ['Payment Kicker Life','Kicker—Pay 3 life.\nIf this creature was kicked, it enters with two +1/+1 counters on it.','Creature — Zombie','{B}'],
 ['Payment Kicker Return',"Kicker—Return a creature you control to its owner's hand.\nIf this creature was kicked, it enters with a +1/+1 counter on it.",'Creature — Merfolk','{U}'],
]);
const own=(ctx,name,zone='battlefield')=>put(MTG,ctx.game,ctx.a,name,zone);
const flash=(ctx,source)=>ctx.game.castableList(ctx.a).find(row=>row.card===source&&row.alt?.oracleKeywordPayment==='flashback');
for(const role of['human','ai']){
 test(`Keyword payment ${role}: Flashback pays actual mana and life, stays out of hand options, and exiles after resolution`,async()=>{
  const ctx=context(MTG,role),source=own(ctx,'Payment Flashback Life','hand');ctx.a.pool.C=4;ctx.a.pool.U=1;const life=ctx.a.life;
  assert.equal(flash(ctx,source),undefined);assert.equal(await ctx.game.castSpell(ctx.a,source,{from:'hand'}),true);await settle(ctx.game);assert.equal(ctx.a.life,life);assert.equal(source.zone,'graveyard');
  ctx.a.pool.C=1;ctx.a.pool.U=1;ctx.a.life=2;assert.equal(flash(ctx,source),undefined);ctx.a.life=life;const option=flash(ctx,source);assert.ok(option);
  const hand=ctx.a.hand.length;assert.equal(await ctx.game.castSpell(ctx.a,source,{from:'graveyard',alt:option.alt}),true);const stack=ctx.game.stack.find(row=>row.card===source);assert.equal(stack.oracleV4AdditionalCost.life,3);assert.equal(ctx.a.life,life-3);assert.equal(ctx.a.pool.U+ctx.a.pool.C,0);await settle(ctx.game);assert.equal(ctx.a.hand.length,hand+1);assert.equal(source.zone,'exile');assert.equal(flash(ctx,source),undefined);
 });
 test(`Keyword payment ${role}: fixed-count and typed Flashback sacrifices are real before a respondable spell`,async()=>{
  const ctx=context(MTG,role),source=own(ctx,'Payment Flashback Sacrifice','graveyard');const fodder=[own(ctx,'Grizzly Bears'),own(ctx,'Grizzly Bears')];assert.equal(flash(ctx,source),undefined);fodder.push(own(ctx,'Grizzly Bears'));const option=flash(ctx,source);assert.ok(option);assert.equal(await ctx.game.castSpell(ctx.a,source,{from:'graveyard',alt:option.alt}),true);assert.ok(fodder.every(card=>card.zone==='graveyard'));assert.equal(ctx.game.stack.at(-1).oracleV4AdditionalCost.sacrifices.length,3);await settle(ctx.game);assert.equal(ctx.game.creatures(ctx.a).length,2);assert.equal(source.zone,'exile');
  const typed=context(MTG,role),card=own(typed,'Payment Flashback Mountain','graveyard');own(typed,'Forest');assert.equal(flash(typed,card),undefined);const mountain=own(typed,'Mountain');assert.equal(await typed.game.castSpell(typed.a,card,{from:'graveyard',alt:flash(typed,card).alt}),true);assert.equal(mountain.zone,'graveyard');await settle(typed.game);
 });
 test(`Keyword payment ${role}: Buyback pays additional costs before resolution and returns only on success`,async()=>{
  for(const kind of['Discard','Life','Land']){
   const ctx=context(MTG,role),source=own(ctx,'Payment Buyback '+kind,'hand');ctx.a.pool.U=1;
   const fodder=kind==='Discard'?[own(ctx,'Forest','hand'),own(ctx,'Forest','hand')]:kind==='Land'?[own(ctx,'Forest')]:[];const life=ctx.a.life;
   assert.equal(await ctx.game.castSpell(ctx.a,source,{from:'hand'}),true);const stack=ctx.game.stack.at(-1);assert.equal(stack.castOpts.buybackPaid,true);assert.equal(ctx.a.pool.U,0);
   if(kind==='Life'){assert.equal(ctx.a.life,life-4);assert.equal(stack.oracleV4AdditionalCost.life,4);}else assert.ok(fodder.every(card=>card.zone==='graveyard'));
   await settle(ctx.game);assert.equal(source.zone,'hand');
  }
 });
 test(`Keyword payment ${role}: Kicker mana, sacrificed land, life or return payment enables the actual kicked effect`,async()=>{
  const ctx=context(MTG,role),source=own(ctx,'Payment Kicker Land','hand'),land=own(ctx,'Forest');Object.assign(ctx.a.pool,{R:2,C:2});const hand=ctx.a.hand.length;assert.equal(await ctx.game.castSpell(ctx.a,source,{from:'hand'}),true);const stack=ctx.game.stack.at(-1);assert.equal(stack.kicked,true);assert.equal(stack.oracleV4AdditionalCost.sacrifices.length,1);assert.equal(land.zone,'graveyard');assert.equal(ctx.a.pool.R+ctx.a.pool.C,0);await settle(ctx.game);assert.equal(ctx.a.hand.length,hand+1);
  for(const kind of['Life','Return']){
   const q=context(MTG,role),card=own(q,'Payment Kicker '+kind,'hand'),host=kind==='Return'?own(q,'Grizzly Bears'):null;Object.assign(q.a.pool,{U:1,B:1});const life=q.a.life;assert.equal(await q.game.castSpell(q.a,card,{from:'hand'}),true);assert.equal(q.game.stack.at(-1).kicked,true);if(host)assert.equal(host.zone,'hand');else assert.equal(q.a.life,life-3);await settle(q.game);assert.equal(card.counters['+1/+1'],kind==='Life'?2:1);
  }
 });
}
test('Keyword payment normal casts, declined optional costs and countered spells retain correct zones',async()=>{
 const ctx=context(MTG),source=own(ctx,'Payment Buyback Life','hand');ctx.a.pool.U=1;ctx.a.life=3;assert.equal(await ctx.game.castSpell(ctx.a,source,{from:'hand'}),true);assert.equal(ctx.game.stack.at(-1).castOpts.buybackPaid,undefined);await settle(ctx.game);assert.equal(source.zone,'graveyard');assert.equal(ctx.a.life,3);
 const no=context(MTG),kicker=own(no,'Payment Kicker Life','hand');no.a.pool.B=1;const decide=no.a.controller.decide.bind(no.a.controller);no.a.controller.decide=(g,q)=>q.aiHint?.kind==='kicker'?'no':decide(g,q);assert.equal(await no.game.castSpell(no.a,kicker,{from:'hand'}),true);await settle(no.game);assert.equal(kicker.counters['+1/+1']||0,0);assert.equal(no.a.life,40);
 for(const name of['Payment Buyback Life','Payment Flashback Life']){
  const q=context(MTG),card=own(q,name,name.includes('Flashback')?'graveyard':'hand');Object.assign(q.a.pool,{U:1,C:1});assert.equal(await q.game.castSpell(q.a,card,{from:card.zone,...(name.includes('Flashback')?{alt:flash(q,card).alt}:{})}),true);const stack=q.game.stack.at(-1);assert.ok(stack.oracleV4AdditionalCost.life>0);await q.game.counterStackObject(stack,{ignoreUncounterable:true});assert.equal(card.zone,name.includes('Flashback')?'exile':'graveyard');
 }
});
test('Keyword payment rejects forged, unpaid or wrong-zone Flashback and optional keyword flags',async()=>{
 const ctx=context(MTG),source=own(ctx,'Payment Flashback Life','graveyard');Object.assign(ctx.a.pool,{C:5,U:3});const life=ctx.a.life;
 for(const opts of[{from:'graveyard',alt:{flashback:true,altCostStr:'{1}{U}'}},{from:'graveyard',alt:{flashback:true}},{from:'graveyard',alt:{...flash(ctx,source).alt,free:true}},{from:'graveyard',alt:{...flash(ctx,source).alt,oracleAlternativeId:'oracle-alt-forged'}}])assert.equal(await ctx.game.castSpell(ctx.a,source,opts),false);
 assert.equal(ctx.a.life,life);assert.equal(ctx.a.pool.C,5);const option=flash(ctx,source).alt;await ctx.game.move(source,'hand');assert.equal(await ctx.game.castSpell(ctx.a,source,{from:'hand',alt:option}),false);
 const buy=own(ctx,'Payment Buyback Life','hand');assert.equal(await ctx.game.castSpell(ctx.a,buy,{from:'hand',alt:{buybackPaid:true}}),false);const kick=own(ctx,'Payment Kicker Life','hand');assert.equal(await ctx.game.castSpell(ctx.a,kick,{from:'hand',alt:{_kicked:true}}),false);
});
test('Keyword payment permits tapping a land before sacrificing it and rejects invalid choices before mana expenditure',async()=>{
 const ctx=context(MTG),source=own(ctx,'Payment Buyback Land','hand'),island=own(ctx,'Island');assert.equal(await ctx.game.castSpell(ctx.a,source,{from:'hand'}),true);assert.equal(island.zone,'graveyard');assert.equal(source.zone,'stack');assert.equal(ctx.a.pool.U,0);await settle(ctx.game);assert.equal(source.zone,'hand');
 const q=context(MTG),card=own(q,'Payment Buyback Discard','hand'),fodder=own(q,'Forest','hand');own(q,'Forest','hand');q.a.pool.U=1;const decide=q.a.controller.decide.bind(q.a.controller);q.a.controller.decide=(g,query)=>query.type==='chooseCards'?[fodder,fodder]:decide(g,query);assert.equal(await q.game.castSpell(q.a,card,{from:'hand'}),false);assert.equal(q.a.pool.U,1);assert.equal(fodder.zone,'hand');
});
test('Keyword payment parser fails closed on variables, unsupported clauses and combined optional announcements',()=>{
 for(const text of['Flashback—Sacrifice X Mountains.','Flashback—Tap three untapped creatures you control.','Buyback—Pay 3 life, Discard a card at random.','Kicker—Pay 3 life.\nBuyback {2}'])assert.equal(!!semanticClass({name:'Unknown keyword payment',type_line:'Sorcery',layout:'normal',mana_cost:'{U}',oracle_text:text+'\nDraw a card.'}).semanticClass,false);
});
