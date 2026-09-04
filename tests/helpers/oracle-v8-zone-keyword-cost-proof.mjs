import assert from'node:assert/strict';
import{stageOracleCastingCosts,assertOracleCastingCostRecord}from'./oracle-v8-casting-cost-proof.mjs';
export async function proveOracleZoneKeywordCost(MTG,ctx,entry,operation,source,h){
 const{game,a}=ctx;
 if(operation.kind==='mechanic-cycling-rule-v8'){
  assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await h.resolveAll(game);assert.equal(source.zone,'battlefield');
  const probe=h.zoneCard(MTG,a,h.fixtureDefinition('Cycling proof source',['Creature'],{cost:'{4}{U}',power:'2',toughness:'2',cycling:{cost:'{2}{U}'}}),'hand');
  const find=()=>game.activatableList(a).find(row=>row.card===probe&&row.cycling);
  if(operation.prohibited){assert.equal(find(),undefined);assert.equal(await game.activateAbility(a,{card:probe,cycling:true}),false);await game.move(source,'graveyard');assert.ok(find());}
  else{assert.equal(game.cyclingManaCost(a,probe).generic,0);assert.equal(game.cyclingManaCost(a,probe).pips.length,1);}
  const before=Object.values(a.pool).reduce((sum,n)=>sum+n,0),hand=a.hand.length;assert.equal(await game.activateAbility(a,find()),true);assert.equal(probe.zone,'graveyard');assert.equal(before-Object.values(a.pool).reduce((sum,n)=>sum+n,0),operation.prohibited?3:1);await h.resolveAll(game);assert.equal(a.hand.length,hand);return 8;
 }
 const additional={implementation:[{kind:'mechanic-additional-costs',costs:operation.costs}]};stageOracleCastingCosts(MTG,ctx,additional,h);
 if(operation.keyword==='eternalize')await game.move(source,'graveyard');
 const beforeHand=a.hand.length,beforeMana=Object.values(a.pool).reduce((sum,n)=>sum+n,0),handCards=a.hand.slice();
 const row=game.activatableList(a).find(row=>row.card===source&&(operation.keyword==='cycling'?row.cycling:row.gyAbility));assert.ok(row);
 assert.equal(await game.activateAbility(a,row),true);const stack=game.stack.find(row=>row.srcCard===source);assert.ok(stack);
 if(operation.keyword==='cycling'){assert.equal(source.zone,'graveyard');assertOracleCastingCostRecord(source,stack,additional);await h.resolveAll(game);assert.equal(a.hand.length,beforeHand);}
 else{assert.equal(source.zone,'exile');assert.ok(handCards.some(card=>card.zone==='graveyard'));assert.ok(Object.values(a.pool).reduce((sum,n)=>sum+n,0)<beforeMana);await h.resolveAll(game);const token=stack.ctx.oracleEternalizeTokens[0];assert.equal(token.zone,'battlefield');assert.equal(token.def.power,'4');assert.equal(token.def.toughness,'4');assert.equal(token.def.cost,'');assert.deepEqual([...token.colors],['B']);assert.equal(token.hasSub('Zombie'),true);}
 return 9;
}
