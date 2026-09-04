import assert from'node:assert/strict';
import{stageOracleCastingCosts,assertOracleCastingCostRecord}from'./oracle-v8-casting-cost-proof.mjs';
export async function proveOracleKeywordPayment(MTG,ctx,entry,operation,source,h){
 const{game,a}=ctx;
 const additional={implementation:[{kind:'mechanic-additional-costs',costs:operation.costs}]};
 const fixtures=stageOracleCastingCosts(MTG,ctx,additional,h);
 let alt;
 if(operation.keyword==='flashback'){
  await game.move(source,'graveyard');delete source.meta.emryCastTurn;
  alt=game.castableList(a).find(row=>row.card===source&&row.alt?.oracleKeywordPayment==='flashback')?.alt;
  assert.ok(alt,entry.raw.name+': printed Flashback payment is offered from the actual graveyard');
 }
 assert.equal(await game.castSpell(a,source,{from:source.zone,...(alt?{alt}:{})}),true,entry.raw.name+': actual keyword-paid cast');
 const stack=game.stack.find(row=>row.card===source);assert.ok(stack);
 assertOracleCastingCostRecord(source,stack,additional);
 assert.equal(operation.keyword==='flashback'?stack.castOpts.flashback:operation.keyword==='buyback'?stack.castOpts.buybackPaid:stack.kicked,true,entry.raw.name+': keyword state follows actual payment');
 await h.resolveAll(game);
 assert.equal(source.zone,operation.keyword==='flashback'?'exile':operation.keyword==='buyback'?'hand':source.is('Creature')?'battlefield':'graveyard',entry.raw.name+': correct paid keyword destination');
 const cost=operation.costs[0];
 if(cost.kind==='sacrifice'||cost.kind==='discard'||cost.kind==='returnPermanent'){
  const selected=cost.kind==='sacrifice'?stack.oracleV4AdditionalCost.sacrifices.map(row=>row.iid):cost.kind==='discard'?stack.oracleV4AdditionalCost.discards:stack.oracleV4AdditionalCost.returns;
  assert.equal(new Set(selected).size,cost.quantity.min);
  // The engine may choose any legal staged payment, so verify its recorded
  // identity rather than forcing a particular AI fixture choice.
  for(const iid of selected){const card=game.byIid(iid);assert.ok(card&&card.zone!==(cost.kind==='discard'?'hand':'battlefield'));}
 }
 return 6+fixtures.length;
}
