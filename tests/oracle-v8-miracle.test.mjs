import test from'node:test';import assert from'node:assert/strict';
import{fixtureEngine,context,put,settle}from'./helpers/oracle-v8-fixtures.mjs';import{semanticClass}from'../scripts/import-oracle-batch.mjs';
const MTG=fixtureEngine([
 ['Miracle Draw','Draw two cards.\nMiracle {U}','Sorcery','{4}{U}'],
 ['Miracle Damage','This spell deals 5 damage to any target.\nMiracle {R}','Instant','{4}{R}{R}'],
 ['Miracle Tokens','Create X 4/4 white Angel creature tokens with flying.\nMiracle {X}{W}{W}','Sorcery','{X}{X}{W}{W}{W}'],
 ['Miracle Creature','Flying\nMiracle {W}','Creature — Angel','{4}{W}'],
 ['Miracle Draw Observer','Whenever you draw a card, you gain 1 life.','Enchantment','{W}'],
]);
const own=(ctx,name,zone='library')=>put(MTG,ctx.game,ctx.a,name,zone);
for(const role of['human','ai']){
 test(`Miracle ${role}: reveal is chosen during the first draw, before remaining draws, and paid cast is a separate respondable spell`,async()=>{
  const ctx=context(MTG,role),second=own(ctx,'Forest'),card=own(ctx,'Miracle Draw');ctx.a.pool.U=1;ctx.game.turnPlayer=ctx.b;ctx.game.phase='combat';let countWhenRevealed;
  ctx.game.revealToHuman=async({cards})=>{assert.equal(cards[0],card);countWhenRevealed=ctx.a.turnState.drewThisTurn;assert.equal(second.zone,'library');};
  await ctx.game.draw(ctx.a,2);assert.equal(countWhenRevealed,1);assert.equal(card.zone,'hand');assert.equal(ctx.a.pool.U,1);assert.deepEqual([...ctx.game.miracleRevealedCards(ctx.a)],[card]);
  await ctx.game.flushTriggers();assert.equal(ctx.game.stack.length,1);const trigger=ctx.game.stack.at(-1);assert.equal(trigger.kind,'trigger');await ctx.game.resolveTop();
  const spell=ctx.game.stack.find(row=>row.card===card);assert.ok(spell);assert.equal(spell.castOpts.miracle,true);assert.equal(ctx.a.pool.U,0);assert.equal(ctx.game.miracleRevealedCards().length,0);assert.equal(ctx.a.hand.length,1);await settle(ctx.game);assert.equal(ctx.a.hand.length,3);assert.equal(card.zone,'graveyard');
 });
 test(`Miracle ${role}: first draw on an opponent turn enables creature casting and printed normal cast remains unchanged`,async()=>{
  const ctx=context(MTG,role),card=own(ctx,'Miracle Creature');ctx.game.turnPlayer=ctx.b;ctx.game.phase='end';ctx.a.pool.W=1;await ctx.game.draw(ctx.a,1);await settle(ctx.game);assert.equal(card.zone,'battlefield');assert.equal(ctx.a.pool.W,0);
  const q=context(MTG,role),normal=own(q,'Miracle Creature','hand');Object.assign(q.a.pool,{W:1,C:4});assert.equal(await q.game.castSpell(q.a,normal,{from:'hand'}),true);assert.equal(q.game.stack.at(-1).castOpts.miracle,undefined);await settle(q.game);assert.equal(normal.zone,'battlefield');assert.equal(q.a.pool.C,0);
 });
}
test('Miracle second draw and a declined reveal produce no trigger or permission',async()=>{
 const ctx=context(MTG),second=own(ctx,'Miracle Draw');own(ctx,'Forest');ctx.a.pool.U=1;await ctx.game.draw(ctx.a,2);assert.equal(second.zone,'hand');assert.equal(ctx.game.pendingTriggers.length,0);assert.equal(ctx.game.miracleRevealedCards().length,0);
 const q=context(MTG),card=own(q,'Miracle Draw');q.a.pool.U=1;const decide=q.a.controller.decide.bind(q.a.controller);q.a.controller.decide=(g,query)=>query.aiHint?.kind==='oracleMiracleReveal'?'no':decide(g,query);await q.game.draw(q.a,1);assert.equal(card.zone,'hand');assert.equal(q.game.pendingTriggers.length,0);
});
test('Miracle stays publicly revealed while simultaneous triggers are being ordered',async()=>{
 const ctx=context(MTG),card=own(ctx,'Miracle Creature');own(ctx,'Miracle Draw Observer','battlefield');ctx.a.pool.W=1;const decide=ctx.a.controller.decide.bind(ctx.a.controller);let ordered=false;
 ctx.a.controller.decide=(g,q)=>{if(q.type==='orderTriggers'){ordered=true;assert.ok(g.miracleRevealedCards().includes(card));}return decide(g,q);};
 await ctx.game.draw(ctx.a,1);await ctx.game.flushTriggers();assert.equal(ordered,true);await settle(ctx.game);assert.equal(card.zone,'battlefield');assert.equal(ctx.game.miracleRevealedCards().length,0);
});
test('Miracle trigger is counterable and a declined cast ends the reveal without leaving a reusable discount',async()=>{
 for(const counter of[true,false]){const ctx=context(MTG),card=own(ctx,'Miracle Draw');ctx.a.pool.U=1;await ctx.game.draw(ctx.a,1);await ctx.game.flushTriggers();assert.equal(ctx.game.miracleRevealedCards().length,1);
  if(counter)await ctx.game.counterStackObject(ctx.game.stack.at(-1),{ignoreUncounterable:true});else{const decide=ctx.a.controller.decide.bind(ctx.a.controller);ctx.a.controller.decide=(g,q)=>q.aiHint?.kind==='oracleMiracleCast'?'no':decide(g,q);await settle(ctx.game);}
  assert.equal(card.zone,'hand');assert.equal(ctx.a.pool.U,1);assert.equal(ctx.game.miracleRevealedCards().length,0);assert.equal(await ctx.game.castSpell(ctx.a,card,{from:'hand',alt:{miracle:true,altCostStr:'{U}',speed:'instant'}}),false);
 }
});
test('Miracle preserves exact hand identity across discard and return; forged free and discounted options fail before mana',async()=>{
 const ctx=context(MTG),card=own(ctx,'Miracle Draw');ctx.a.pool.U=1;await ctx.game.draw(ctx.a,1);await ctx.game.flushTriggers();await ctx.game.move(card,'graveyard');await ctx.game.move(card,'hand');await settle(ctx.game);assert.equal(card.zone,'hand');assert.equal(ctx.a.pool.U,1);
 for(const alt of[{altCostStr:'{U}'},{altCostStr:'{0}'},{miracle:true,altCostStr:'{U}',speed:'instant'},{miracle:true,altCostStr:'{U}',speed:'instant',free:true}])assert.equal(await ctx.game.castSpell(ctx.a,card,{from:'hand',alt}),false);
 assert.equal(ctx.a.pool.U,1);
});
test('Miracle X is announced once, paid once, and changes actual token count',async()=>{
 const ctx=context(MTG),card=own(ctx,'Miracle Tokens');Object.assign(ctx.a.pool,{W:2,C:3});const decide=ctx.a.controller.decide.bind(ctx.a.controller);ctx.a.controller.decide=(g,q)=>q.type==='chooseX'?3:decide(g,q);
 await ctx.game.draw(ctx.a,1);await ctx.game.flushTriggers();await ctx.game.resolveTop();assert.equal(ctx.game.stack.at(-1).x,3);assert.equal(ctx.a.pool.W+ctx.a.pool.C,0);await settle(ctx.game);assert.equal(ctx.game.creatures(ctx.a).length,3);assert.equal(card.zone,'graveyard');
});
test('Miracle allows revealing without mana but cannot cast if the payment becomes unavailable',async()=>{
 const ctx=context(MTG),card=own(ctx,'Miracle Draw');await ctx.game.draw(ctx.a,1);await settle(ctx.game);assert.equal(card.zone,'hand');assert.equal(ctx.game.miracleRevealedCards().length,0);
});
test('Miracle authorization rejects free overrides inside its live window and preserves commander tax',async()=>{
 const ctx=context(MTG),card=own(ctx,'Miracle Creature');card.commander=true;card.cmdCasts=2;Object.assign(ctx.a.pool,{W:1,C:4});const decide=ctx.a.controller.decide.bind(ctx.a.controller);let rejected;
 ctx.a.controller.decide=async(g,q)=>{
  if(q.aiHint?.kind==='oracleMiracleCast')rejected=await g.castSpell(ctx.a,card,{from:'hand',alt:{miracle:true,altCostStr:'{W}',speed:'instant',free:true}});
  return decide(g,q);
 };
 await ctx.game.draw(ctx.a,1);await ctx.game.flushTriggers();await ctx.game.resolveTop();assert.equal(rejected,false);assert.equal(ctx.a.pool.W,0);assert.equal(ctx.a.pool.C,4,'commander tax applies only when cast from command zone');await settle(ctx.game);assert.equal(card.zone,'battlefield');assert.equal(card.cmdCasts,2);
});
test('Miracle rejects unknown mana and unsupported trailing restrictions',()=>{
 for(const cost of['{S}','{2/P}','{U}. Activate only during combat.'])assert.equal(!!semanticClass({name:'Unknown Miracle',oracle_text:'Draw a card.\nMiracle '+cost,type_line:'Sorcery',layout:'normal',mana_cost:'{U}'}).semanticClass,false);
});
