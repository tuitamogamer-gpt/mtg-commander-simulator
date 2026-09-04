import test from'node:test';
import assert from'node:assert/strict';
import{fixtureEngine,context,put,settle}from'./helpers/oracle-v8-fixtures.mjs';
import{semanticClass}from'../scripts/import-oracle-batch.mjs';
const MTG=fixtureEngine([
 ['Encore Subject','Encore {2}{G}','Creature — Elf','{4}{G}'],
 ['Encore Entry','When this creature enters, draw a card.\nEncore {2}{G}','Creature — Elf','{4}{G}'],
 ['Encore Ability Copier',"Whenever you activate an ability, if it isn't a mana ability, copy that ability. You may choose new targets for the copy.",'Enchantment','{U}'],
]);
const own=(ctx,name,zone='battlefield',player=ctx.a)=>put(MTG,ctx.game,player,name,zone);
const option=(ctx,source)=>ctx.game.activatableList(ctx.a).find(row=>row.card===source&&row.gyAbility);
async function activate(ctx,name='Encore Subject'){
 const source=own(ctx,name,'graveyard');Object.assign(ctx.a.pool,{G:1,C:2});
 assert.equal(await ctx.game.activateAbility(ctx.a,option(ctx,source)),true);
 const stack=ctx.game.stack.find(row=>row.srcCard===source);assert.ok(stack);assert.equal(source.zone,'exile');assert.equal(ctx.a.pool.G+ctx.a.pool.C,0);
 await settle(ctx.game);const locks=stack.ctx.oracleEncoreTokens,tokens=locks.map(lock=>ctx.game.byIid(lock.iid));return{source,stack,locks,tokens};
}
for(const role of['human','ai']){
 test(`Encore ${role}: real graveyard payment produces one untapped hasty copy per opponent, then real required attacks and delayed sacrifice`,async()=>{
  const ctx=context(MTG,role,3),hand=ctx.a.hand.length,{source,locks,tokens}=await activate(ctx,'Encore Entry');
  assert.equal(tokens.length,3);assert.equal(ctx.a.hand.length,hand+3);assert.equal(ctx.game.delayed.filter(row=>row.name==='Encore sacrifice').length,1);
  for(let i=0;i<tokens.length;i++){const token=tokens[i];assert.equal(token.zone,'battlefield');assert.equal(token.tapped,false);assert.equal(!!token.attacking,false);assert.equal(token.kw('haste'),true);assert.equal(token.name,source.name);assert.deepEqual([...ctx.game.legalDeclarationAttackTargets(token)],[ctx.game.players[locks[i].opponent]]);assert.equal(ctx.game.isForcedToAttack(token),true);}
  const before=ctx.others.map(player=>player.life);await ctx.game.combatPhase(ctx.a);
  assert.deepEqual(ctx.others.map((player,i)=>before[i]-player.life),[2,2,2]);
  await ctx.game.emit('endStep',{player:ctx.a});await ctx.game.flushTriggers();assert.ok(ctx.game.stack.some(row=>row.name==='Encore sacrifice'));
  await settle(ctx.game);assert.ok(tokens.every(token=>token.zone!=='battlefield'));assert.equal(source.zone,'exile');assert.equal(option(ctx,source),undefined);
 });
 test(`Encore ${role}: countering the paid ability leaves its source exiled and creates no tokens`,async()=>{
  const ctx=context(MTG,role,2),source=own(ctx,'Encore Subject','graveyard');Object.assign(ctx.a.pool,{G:1,C:2});assert.equal(await ctx.game.activateAbility(ctx.a,option(ctx,source)),true);
  await ctx.game.counterStackObject(ctx.game.stack.at(-1),{ignoreUncounterable:true});assert.equal(source.zone,'exile');assert.equal(ctx.a.pool.G+ctx.a.pool.C,0);assert.equal(ctx.game.creatures(ctx.a).length,0);assert.equal(ctx.game.delayed.length,0);
 });
 test(`Encore ${role}: a countered end-step trigger does not retry, haste persists and the attack requirement expires`,async()=>{
  const ctx=context(MTG,role,2),{tokens}=await activate(ctx);await ctx.game.emit('endStep',{player:ctx.a});await ctx.game.flushTriggers();await ctx.game.counterStackObject(ctx.game.stack.at(-1),{ignoreUncounterable:true});
  ctx.game.turnNo++;ctx.game.recalc();for(const token of tokens){assert.equal(token.zone,'battlefield');assert.equal(token.kw('haste'),true);assert.equal(ctx.game.isForcedToAttack(token),false);assert.equal(ctx.game.legalDeclarationAttackTargets(token).length,2);}
  await ctx.game.emit('endStep',{player:ctx.b});await settle(ctx.game);assert.ok(tokens.every(token=>token.zone==='battlefield'));
 });
}
test('Encore validates exact printed activation, ownership, sorcery timing and available mana before payment',async()=>{
 const ctx=context(MTG),source=own(ctx,'Encore Subject','graveyard');ctx.a.pool.G=1;assert.equal(option(ctx,source),undefined);Object.assign(ctx.a.pool,{C:2});const row=option(ctx,source);assert.ok(row);
 ctx.game.phase='combat';assert.equal(option(ctx,source),undefined);assert.equal(await ctx.game.activateAbility(ctx.a,row),false);ctx.game.phase='main1';
 assert.equal(await ctx.game.activateAbility(ctx.a,{...row,gyAbilityOverride:{...row.gyAbilityOverride,cost:'{0}'}}),false);assert.equal(ctx.a.pool.C,2);assert.equal(source.zone,'graveyard');
 await ctx.game.move(source,'hand');assert.equal(await ctx.game.activateAbility(ctx.a,row),false);assert.equal(source.zone,'hand');
 const printed=own(ctx,'Encore Subject','hand');Object.assign(ctx.a.pool,{G:1,C:4});assert.equal(await ctx.game.castSpell(ctx.a,printed,{from:'hand'}),true);await settle(ctx.game);assert.equal(printed.zone,'battlefield');assert.equal(printed.kw('haste'),false);assert.equal(ctx.game.delayed.length,0);
});
test('Encore determines surviving opponents on resolution and captures source characteristics when activated',async()=>{
 const ctx=context(MTG,'human',3),source=own(ctx,'Encore Subject','graveyard');Object.assign(ctx.a.pool,{G:1,C:2});assert.equal(await ctx.game.activateAbility(ctx.a,option(ctx,source)),true);const stack=ctx.game.stack.at(-1);ctx.others[2].lost=true;
 await ctx.game.move(source,'hand');await settle(ctx.game);const tokens=stack.ctx.oracleEncoreTokens.map(lock=>ctx.game.byIid(lock.iid));assert.equal(tokens.length,2);assert.ok(tokens.every(token=>token.name==='Encore Subject'));assert.equal(source.zone,'hand');
});
test('Encore delayed sacrifice cannot sacrifice a stolen token, and does not retry after it is returned',async()=>{
 const ctx=context(MTG,'human',2),{tokens}=await activate(ctx);tokens[0].ctrl=ctx.b;await ctx.game.emit('endStep',{player:ctx.a});await settle(ctx.game);assert.equal(tokens[0].zone,'battlefield');assert.notEqual(tokens[1].zone,'battlefield');tokens[0].ctrl=ctx.a;
 await ctx.game.emit('endStep',{player:ctx.b});await settle(ctx.game);assert.equal(tokens[0].zone,'battlefield');
});
for(const role of['human','ai'])test(`Encore ${role}: actual ability copying and token doubling preserve every opponent assignment and delayed token identity`,async()=>{
 const ctx=context(MTG,role,2);own(ctx,'Encore Ability Copier');own(ctx,'Parallel Lives');const{source}=await activate(ctx),tokens=ctx.game.creatures(ctx.a).filter(card=>card.name===source.name);
 assert.equal(tokens.length,8);assert.equal(ctx.game.delayed.filter(row=>row.name==='Encore sacrifice').length,2);
 for(const opponent of ctx.others)assert.equal(tokens.filter(token=>ctx.game.legalDeclarationAttackTargets(token)[0]===opponent).length,4);
 assert.ok(tokens.every(token=>token.kw('haste')&&!token.tapped&&!token.attacking));await ctx.game.emit('endStep',{player:ctx.a});await settle(ctx.game);assert.ok(tokens.every(token=>token.zone!=='battlefield'));
});
test('Encore requirements compose with goad and prohibitions without turning a requirement into a restriction',async()=>{
 const ctx=context(MTG,'human',2),{tokens}=await activate(ctx),token=tokens[0];token.meta.goadedBy=[ctx.b];ctx.game.recalc();assert.deepEqual(new Set(ctx.game.legalDeclarationAttackTargets(token)),new Set(ctx.others));
 token.meta.goadedBy=[ctx.others[1]];ctx.game.recalc();assert.deepEqual([...ctx.game.legalDeclarationAttackTargets(token)],[ctx.b]);
 token.meta.goadedBy=[];ctx.game.recalc();ctx.game.untilEffects.push({kind:'cantAttackPlayerCard',iid:token.iid,notPlayer:ctx.b});assert.equal(ctx.game.isForcedToAttack(token),false);assert.deepEqual([...ctx.game.legalDeclarationAttackTargets(token)],[ctx.others[1]]);
});
test('Encore attack tax payment stays optional; declining it does not force an attack on another player',async()=>{
 const ctx=context(MTG,'human',2),{tokens}=await activate(ctx);own(ctx,'Ghostly Prison','battlefield',ctx.b);assert.equal(ctx.game.isForcedToAttack(tokens[0]),false);assert.deepEqual(new Set(ctx.game.legalDeclarationAttackTargets(tokens[0])),new Set(ctx.others));
 const before=ctx.others.map(player=>player.life);await ctx.game.combatPhase(ctx.a);assert.equal(ctx.b.life,before[0]);assert.equal(ctx.others[1].life,before[1]-2);
});
test('Encore fails closed on variable or unsupported cost clauses and noncreatures',()=>{
 for(const [text,type]of[['Encore {X}{G}','Creature'],['Encore—Sacrifice a creature.','Creature'],['Encore {2}{G}. Activate only during combat.','Creature'],['Encore {2}{G}','Sorcery']])assert.equal(!!semanticClass({name:'Unknown Encore',type_line:type,layout:'normal',mana_cost:'{G}',oracle_text:text,power:'2',toughness:'3'}).semanticClass,false);
});
