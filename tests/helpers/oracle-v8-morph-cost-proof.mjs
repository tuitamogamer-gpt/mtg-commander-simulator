import assert from 'node:assert/strict';
import {stageOracleCastingCosts,assertOracleCastingCostRecord} from './oracle-v8-casting-cost-proof.mjs';
export async function proveOracleMorphCost(MTG,ctx,entry,operation,source,h){
 const {game,a}=ctx,additional={implementation:[{kind:'mechanic-additional-costs',costs:operation.costs||[]}]};
 const fixtures=operation.revealColor?[h.zoneCard(MTG,a,h.fixtureDefinition('Morph reveal payment',['Land'],{colorsOverride:[operation.revealColor]}),'hand')]:stageOracleCastingCosts(MTG,ctx,additional,h);
 const reveal=[],original=game.revealToHuman;game.revealToHuman=async function(event,...args){reveal.push(event);return original.call(this,event,...args);};
 const option=game.castableList(a).find(row=>row.card===source&&row.alt?.faceDownCast==='morph');assert.ok(option,entry.raw.name+': intrinsic face-down casting option');
 assert.equal(await game.castSpell(a,source,{from:'hand',alt:option.alt}),true);const stack=game.stack.find(row=>row.card===source);assert.ok(stack&&stack.manaSpent===3,entry.raw.name+': face-down spell actually pays three mana');await h.resolveAll(game);
 const version=source.zoneVersion,life=a.life,ability=game.activatableList(a).find(row=>row.card===source&&row.turnFaceUp&&row.faceUpKind==='morph');assert.ok(ability,entry.raw.name+': exact printed nonmana Morph action offered');
 assert.equal(await game.activateAbility(a,ability),true);assert.equal(source.faceDown,false);assert.equal(source.zoneVersion,version);const payment=source.meta.oracleFaceUpPayment;assert.ok(payment&&payment.sourceZoneVersion===version,entry.raw.name+': paid face-up action records same battlefield object');
 if(operation.revealColor){const card=fixtures.find(card=>card.iid===payment.reveal.iid)||a.hand.find(card=>card.iid===payment.reveal.iid);assert.ok(card&&card.zone==='hand'&&card.colors.includes(operation.revealColor));assert.ok(reveal.some(event=>event.cards?.includes(card)));}
 else{assertOracleCastingCostRecord(source,{oracleV4AdditionalCost:payment.costs},additional,fixtures.concat(a.hand,a.graveyard));assert.equal(a.life,life-payment.costs.life);}
 await h.resolveAll(game);return 8;
}
