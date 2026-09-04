import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureEngine,context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
const MTG=fixtureEngine([
 ['Foretell Exile Probe','Draw a card. Exile Foretell Exile Probe.\nForetell {U}','Sorcery','{4}{U}'],
 ['Foretell Target Probe','Target creature gets +1/+1 until end of turn.\nForetell {U}','Sorcery','{3}{U}'],
]);
async function ready(role,name='Foretell Exile Probe'){
 const ctx=context(MTG,role),source=put(MTG,ctx.game,ctx.a,name,'hand');ctx.a.pool.C=2;ctx.a.pool.U=1;
 const old=source.zoneVersion;assert.equal(await ctx.game.activateAbility(ctx.a,{card:source,foretell:true}),true);
 assert.equal(source.zoneVersion,old+1);assert.equal(source.meta.foretoldZoneVersion,source.zoneVersion);assert.equal(source.faceDown,true);
 assert.equal(ctx.game.castableList(ctx.a).some(row=>row.card===source),false);ctx.game.turnNo++;
 return{...ctx,source};
}
const option=ctx=>ctx.game.castableList(ctx.a).find(row=>row.card===ctx.source&&row.alt?.foretell)?.alt;
for(const role of ['human','ai'])test(`Foretell ${role}: first cast pays once and a self-exiling spell cannot reuse its permission`,async()=>{
 const ctx=await ready(role),alt=option(ctx);assert.ok(alt);
 assert.equal(await ctx.game.castSpell(ctx.a,ctx.source,{from:'exile',alt}),true);
 const so=ctx.game.stack.find(row=>row.card===ctx.source);assert.ok(so);assert.equal(so.manaSpent,1);assert.equal(ctx.source.meta.foretold,undefined);
 await settle(ctx.game);assert.equal(ctx.source.zone,'exile');assert.equal(ctx.source.faceDown,false);assert.equal(ctx.a.hand.length,1);
 ctx.a.pool.U=1;assert.equal(option(ctx),undefined);assert.equal(await ctx.game.castSpell(ctx.a,ctx.source,{from:'exile',alt}),false);assert.equal(ctx.a.pool.U,1);
});
test('Foretell rejects changed exile identity, forged costs and a stale option after foretelling again',async()=>{
 const ctx=await ready('human'),alt=option(ctx);
 assert.equal(await ctx.game.castSpell(ctx.a,ctx.source,{from:'exile',alt:{...alt,altCostStr:'{0}'}}),false);
 assert.equal(await ctx.game.castSpell(ctx.a,ctx.source,{from:'exile',alt:{...alt,free:true}}),false);
 await ctx.game.move(ctx.source,'hand');await ctx.game.move(ctx.source,'exile');ctx.source.faceDown=true;
 assert.equal(option(ctx),undefined);assert.equal(await ctx.game.castSpell(ctx.a,ctx.source,{from:'exile',alt}),false);
 await ctx.game.move(ctx.source,'hand');ctx.a.pool.C=2;assert.equal(await ctx.game.activateAbility(ctx.a,{card:ctx.source,foretell:true}),true);ctx.game.turnNo++;
 assert.ok(option(ctx));assert.equal(await ctx.game.castSpell(ctx.a,ctx.source,{from:'exile',alt}),false);assert.equal(ctx.a.pool.U,1);
 assert.equal(await ctx.game.castSpell(ctx.a,ctx.source,{from:'exile',alt:option(ctx)}),true);await settle(ctx.game);
});
test('Foretell rechecks exact source and timing after target selection without spending mana',async()=>{
 const ctx=await ready('human','Foretell Target Probe');put(MTG,ctx.game,ctx.a,'Llanowar Elves');const alt=option(ctx);assert.ok(alt);
 const decide=ctx.a.controller.decide.bind(ctx.a.controller);ctx.a.controller.decide=async(g,q)=>{const answer=await decide(g,q);if(q.type==='chooseTargets'){await g.move(ctx.source,'hand');await g.move(ctx.source,'exile');ctx.source.faceDown=true;}return answer;};
 assert.equal(await ctx.game.castSpell(ctx.a,ctx.source,{from:'exile',alt}),false);assert.equal(ctx.a.pool.U,1);assert.equal(ctx.game.stack.length,0);
});
