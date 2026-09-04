import test from'node:test';import assert from'node:assert/strict';
import{fixtureEngine,context,put,settle}from'./helpers/oracle-v8-fixtures.mjs';import{semanticClass}from'../scripts/import-oracle-batch.mjs';
const MTG=fixtureEngine([
 ['Zone Cycling Life','Cycling—Pay 2 life.'],['Zone Cycling Land','Cycling—Sacrifice a land.'],
 ['Zone Eternalize','When this creature enters, you gain life equal to its power.\nEternalize—{2}{W}{W}, Discard a card.','Creature — Human Wizard','{1}{W}'],
 ['Zone Cycling Reducer','Cycling abilities you activate cost {2} less to activate.','Artifact','{2}'],
 ['Zone Cycling Blocker',"Players can't cycle cards.",'Artifact','{2}'],
 ['Zone Colored Cycle','Cycling {2}{U}','Creature — Drake','{3}{U}'],
]);
const own=(ctx,name,zone='battlefield',p=ctx.a)=>put(MTG,ctx.game,p,name,zone),cycle=(ctx,c)=>ctx.game.activatableList(ctx.a).find(row=>row.card===c&&row.cycling);
for(const role of['human','ai']){
 test(`Zone costs ${role}: Cycling pays life or sacrifices a land and discards the source before a respondable draw`,async()=>{
  for(const kind of['Life','Land']){const ctx=context(MTG,role),card=own(ctx,'Zone Cycling '+kind,'hand'),land=kind==='Land'?own(ctx,'Forest'):null,life=ctx.a.life,hand=ctx.a.hand.length;
   assert.equal(await ctx.game.activateAbility(ctx.a,cycle(ctx,card)),true);assert.equal(card.zone,'graveyard');const stack=ctx.game.stack.at(-1);assert.equal(stack.kind,'ability');if(land){assert.equal(land.zone,'graveyard');assert.equal(stack.oracleV4AdditionalCost.sacrifices[0].iid,land.iid);}else{assert.equal(ctx.a.life,life-2);assert.equal(stack.oracleV4AdditionalCost.life,2);}assert.equal(ctx.a.hand.length,hand-1);await settle(ctx.game);assert.equal(ctx.a.hand.length,hand);
  }
 });
 test(`Zone costs ${role}: Eternalize discards and exiles before resolution, then creates a black 4/4 Zombie with no mana cost and actual ETB`,async()=>{
  const ctx=context(MTG,role),card=own(ctx,'Zone Eternalize','graveyard');Object.assign(ctx.a.pool,{C:2,W:2});assert.equal(ctx.game.activatableList(ctx.a).find(row=>row.card===card),undefined);const discarded=own(ctx,'Forest','hand'),life=ctx.a.life;
  const row=ctx.game.activatableList(ctx.a).find(row=>row.card===card);assert.ok(row);assert.equal(await ctx.game.activateAbility(ctx.a,row),true);assert.equal(discarded.zone,'graveyard');assert.equal(card.zone,'exile');assert.equal(ctx.a.pool.W+ctx.a.pool.C,0);const stack=ctx.game.stack.at(-1);await settle(ctx.game);
  const token=stack.ctx.oracleEternalizeTokens[0];assert.equal(token.zone,'battlefield');assert.equal(token.power,4);assert.equal(token.toughness,4);assert.equal(token.def.cost,'');assert.deepEqual([...token.colors],['B']);assert.ok(token.hasSub('Zombie')&&token.hasSub('Human')&&token.hasSub('Wizard'));assert.equal(ctx.a.life,life+4);
 });
 test(`Zone costs ${role}: cycling reduction removes generic mana only and the prohibition stops every player`,async()=>{
  const ctx=context(MTG,role),reducer=own(ctx,'Zone Cycling Reducer'),card=own(ctx,'Zone Colored Cycle','hand');assert.equal(cycle(ctx,card),undefined);ctx.a.pool.U=1;assert.ok(cycle(ctx,card));assert.equal(await ctx.game.activateAbility(ctx.a,cycle(ctx,card)),true);assert.equal(ctx.a.pool.U,0);await settle(ctx.game);
  const blocker=own(ctx,'Zone Cycling Blocker'),life=own(ctx,'Zone Cycling Life','hand'),enemy=own(ctx,'Zone Cycling Life','hand',ctx.b);assert.equal(cycle(ctx,life),undefined);assert.equal(ctx.game.activatableList(ctx.b).some(row=>row.card===enemy&&row.cycling),false);assert.equal(await ctx.game.activateAbility(ctx.a,{card:life,cycling:true}),false);await ctx.game.move(blocker,'graveyard');assert.ok(cycle(ctx,life));assert.equal(reducer.zone,'battlefield');
 });
}
test('Zone costs reject insufficient payment, invalid permanent choice and stale source before spending anything',async()=>{
 const ctx=context(MTG),life=own(ctx,'Zone Cycling Life','hand');ctx.a.life=1;assert.equal(cycle(ctx,life),undefined);assert.equal(await ctx.game.activateAbility(ctx.a,{card:life,cycling:true}),false);assert.equal(life.zone,'hand');
 const card=own(ctx,'Zone Cycling Land','hand'),land=own(ctx,'Forest'),other=own(ctx,'Grizzly Bears');const decide=ctx.a.controller.decide.bind(ctx.a.controller);ctx.a.controller.decide=(g,q)=>q.type==='chooseCards'?[other]:decide(g,q);assert.equal(await ctx.game.activateAbility(ctx.a,cycle(ctx,card)),false);assert.equal(card.zone,'hand');assert.equal(land.zone,'battlefield');
 const row=cycle(ctx,card);await ctx.game.move(card,'graveyard');assert.equal(await ctx.game.activateAbility(ctx.a,row),false);assert.equal(land.zone,'battlefield');
});
test('Zone costs remain spent if the Cycling or Eternalize ability is countered',async()=>{
 const ctx=context(MTG),cycleCard=own(ctx,'Zone Cycling Life','hand'),hand=ctx.a.hand.length;assert.equal(await ctx.game.activateAbility(ctx.a,cycle(ctx,cycleCard)),true);await ctx.game.counterStackObject(ctx.game.stack.at(-1),{ignoreUncounterable:true});assert.equal(ctx.a.life,38);assert.equal(ctx.a.hand.length,hand-1);
 const source=own(ctx,'Zone Eternalize','graveyard'),fodder=own(ctx,'Forest','hand');Object.assign(ctx.a.pool,{W:2,C:2});assert.equal(await ctx.game.activateAbility(ctx.a,ctx.game.activatableList(ctx.a).find(row=>row.card===source)),true);await ctx.game.counterStackObject(ctx.game.stack.at(-1),{ignoreUncounterable:true});assert.equal(source.zone,'exile');assert.equal(fodder.zone,'graveyard');assert.equal(ctx.game.creatures(ctx.a).length,0);
});
test('Local AI declines lethal life Cycling while the human rules path still permits its true cost',async()=>{
 const ctx=context(MTG,'ai'),card=own(ctx,'Zone Cycling Life','hand');ctx.a.life=2;const action=cycle(ctx,card);assert.ok(action,'paying the last2life is a legal cost');
 const answer=await ctx.a.controller.decide(ctx.game,{type:'main',player:ctx.a,lands:[],casts:[],acts:[action]});assert.notEqual(answer?.kind,'activate');assert.equal(card.zone,'hand');assert.equal(ctx.a.life,2);
});
test('Cycling reduction applies to the chosen X with a generic floor and preserves colored mana',async()=>{
 const ctx=context(MTG);own(ctx,'Zone Cycling Reducer');const card=own(ctx,'Shark Typhoon','hand');Object.assign(ctx.a.pool,{U:1,C:2});const decide=ctx.a.controller.decide.bind(ctx.a.controller);ctx.a.controller.decide=(g,q)=>q.type==='chooseX'?3:decide(g,q);assert.equal(await ctx.game.activateAbility(ctx.a,cycle(ctx,card)),true);assert.equal(ctx.a.pool.U+ctx.a.pool.C,0);await settle(ctx.game);assert.equal(ctx.game.creatures(ctx.a)[0].power,3);
});
test('Zone keyword cost compiler rejects duplicate or unsupported costs',()=>{
 for(const text of['Cycling—Pay X life.','Cycling—Sacrifice a land.\nCycling {2}','Eternalize—{2}{U}, Discard two cards.','Eternalize—{2}{U}, Discard a blue card.','Eternalize—{2}{U}, Discard a card.\nEncore {3}'])assert.equal(!!semanticClass({name:'Unknown zone keyword',oracle_text:text,type_line:'Creature',mana_cost:'{U}',power:'2',toughness:'3',layout:'normal'}).semanticClass,false);
});
