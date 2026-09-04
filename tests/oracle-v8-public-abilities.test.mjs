import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureEngine,context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';

const MTG=fixtureEngine([
 ['Public Token','{1}, Discard a card: Create a 1/1 green Saproling creature token. Any player may activate this ability.','Enchantment','{0}'],
 ['Public Land Draw','{2}, Sacrifice a land: Draw a card. Any player may activate this ability.','Enchantment','{0}'],
 ['Public Sorcery','{2}: Target player discards a card. Any player may activate this ability but only as a sorcery.','Creature — Human','{0}'],
 ['Public Pump','{1}: This creature gets +1/+1 until end of turn. Any player may activate this ability.\n{1}: This creature gets -1/-1 until end of turn. Any player may activate this ability.\n{1}: Draw a card.','Creature — Beast','{0}'],
 ['Public Own Target','{1}: Target creature you control gets +1/+1 until end of turn. Any player may activate this ability.','Artifact','{0}'],
 ['Public Return','{1}: Return this creature to its owner\'s hand. Any player may activate this ability.','Creature — Wall','{0}'],
 ['Public Body','','Creature — Bear','{1}'],
 ['Public Reducer','','Artifact','{0}'],
]);
function ready(role,name){const ctx=context(MTG,role);ctx.a.pool={W:0,U:0,B:0,R:0,G:0,C:0};ctx.b.pool={W:0,U:0,B:0,R:0,G:0,C:0};return {...ctx,source:put(MTG,ctx.game,ctx.b,name)};}
const own=(ctx,name,zone='battlefield')=>put(MTG,ctx.game,ctx.a,name,zone);
const offered=ctx=>ctx.game.activatableList(ctx.a).filter(row=>row.card===ctx.source);
async function activate(ctx,row=offered(ctx)[0]){assert.ok(row);if(ctx.a.isAI){const action=await ctx.a.controller.decide(ctx.game,{type:'main',player:ctx.a,phase:ctx.game.phase,casts:[],acts:[row],lands:[]});assert.equal(action.kind,'activate');return ctx.game.performAction(ctx.a,action);}return ctx.game.activateAbility(ctx.a,row);}

for(const role of ['human','ai']){
 test(`public ability ${role}: the activator pays the discard and receives the token without taking the source`,async()=>{
  const ctx=ready(role,'Public Token');ctx.a.pool.C=1;const other=put(MTG,ctx.game,ctx.b,'Forest','hand');
  assert.equal(offered(ctx).length,0,'the source controller hand cannot pay an opponent cost');
  const card=own(ctx,'Forest','hand');const row=offered(ctx)[0];assert.equal(row.anyPlayerAbility,true);
  assert.equal(await activate(ctx,row),true);assert.equal(card.zone,'graveyard');assert.equal(other.zone,'hand');assert.equal(ctx.a.pool.C,0);assert.equal(ctx.source.ctrl,ctx.b);
  const stack=ctx.game.stack.at(-1);assert.equal(stack.ctrl,ctx.a);assert.equal(stack.ctx.you,ctx.a);assert.equal(stack.srcCard,ctx.source);
  await settle(ctx.game);assert.equal(ctx.game.creatures(ctx.a).filter(card=>card.isToken&&card.hasSub('Saproling')).length,1);assert.equal(ctx.game.creatures(ctx.b).length,0);
 });
 test(`public ability ${role}: only activator lands pay sacrifice, with that player's global mana reduction`,async()=>{
  const ctx=ready(role,'Public Land Draw');ctx.a.pool.C=1;const rivalLand=put(MTG,ctx.game,ctx.b,'Forest');
  assert.equal(offered(ctx).length,0);const land=own(ctx,'Forest');land.tapped=true;assert.equal(offered(ctx).length,0,'one floating mana is below the printed cost');
  const reducer=own(ctx,'Public Reducer');reducer.def={...reducer.def,abilityCostReduction:()=>1};ctx.game.recalc();const row=offered(ctx)[0];assert.ok(row);
  assert.equal(await activate(ctx,row),true);assert.equal(ctx.a.pool.C,0);assert.equal(land.zone,'graveyard');assert.equal(rivalLand.zone,'battlefield');assert.equal(ctx.source.ctrl,ctx.b);
  await settle(ctx.game);assert.equal(ctx.a.hand.length,1);assert.equal(ctx.b.hand.length,0);
 });
 test(`public ability ${role}: target 'you control' means the activating player`,async()=>{
  const ctx=ready(role,'Public Own Target');ctx.a.pool.C=1;const mine=own(ctx,'Public Body'),rival=put(MTG,ctx.game,ctx.b,'Public Body');
  const before=mine.power;assert.equal(await activate(ctx),true);assert.equal(ctx.game.stack.at(-1).targets[0],mine);await settle(ctx.game);assert.equal(mine.power,before+1);assert.equal(rival.power,2);assert.equal(ctx.source.ctrl,ctx.b);
 });
 test(`public ability ${role}: ordinary abilities cannot be forged into public ones`,async()=>{
  const ctx=ready(role,'Public Pump');ctx.a.pool.C=3;const all=ctx.source.def.abilities;assert.equal(offered(ctx).length,2);assert.equal(ctx.game.activatableList(ctx.b).filter(row=>row.card===ctx.source).length,0,'source controller has no mana');
  assert.equal(await ctx.game.activateAbility(ctx.a,{card:ctx.source,ability:all[2],idx:2,anyPlayerAbility:true}),false);
  assert.equal(await ctx.game.activateAbility(ctx.a,{card:ctx.source,ability:{...all[2],oracleAnyPlayer:true},idx:2,anyPlayerAbility:true}),false);assert.equal(ctx.a.pool.C,3);
  const negative=offered(ctx).find(row=>row.ability===all[1]);const old=ctx.source.power;assert.equal(await activate(ctx,negative),true);await settle(ctx.game);assert.equal(ctx.source.power,old-1);assert.equal(ctx.a.pool.C,2);
 });
}

test('public activation sorcery timing follows the activator and stale disabled sources reject without payment',async()=>{
 const ctx=ready('human','Public Sorcery');ctx.a.pool.C=2;put(MTG,ctx.game,ctx.b,'Forest','hand');const row=offered(ctx)[0];assert.ok(row);
 ctx.game.turnPlayer=ctx.b;assert.equal(offered(ctx).length,0);assert.equal(await ctx.game.activateAbility(ctx.a,row),false);assert.equal(ctx.a.pool.C,2);
 ctx.game.turnPlayer=ctx.a;ctx.source.cur.abilitiesDisabled=true;assert.equal(await ctx.game.activateAbility(ctx.a,row),false);assert.equal(ctx.a.pool.C,2);
 ctx.game.recalc();const decide=ctx.a.controller.decide.bind(ctx.a.controller);ctx.a.controller.decide=(g,q)=>q.type==='chooseTargets'?Promise.resolve([ctx.b]):decide(g,q);
 assert.equal(await activate(ctx,row),true);assert.equal(ctx.game.stack.at(-1).ctrl,ctx.a);await settle(ctx.game);assert.equal(ctx.b.hand.length,0);
});

test('public source effects preserve original owner and source identity',async()=>{
 const ctx=ready('human','Public Return');ctx.a.pool.C=1;assert.equal(await activate(ctx),true);await settle(ctx.game);assert.equal(ctx.source.zone,'hand');assert.ok(ctx.b.hand.includes(ctx.source));assert.equal(ctx.a.hand.length,0);
});

test('public costs recheck live permission after choices before spending cards or mana',async()=>{
 const ctx=ready('human','Public Token');ctx.a.pool.C=1;const card=own(ctx,'Forest','hand'),row=offered(ctx)[0];
 const decide=ctx.a.controller.decide.bind(ctx.a.controller);ctx.a.controller.decide=(g,q)=>{if(q.type==='chooseCards'){ctx.source.cur.abilitiesDisabled=true;return Promise.resolve([card]);}return decide(g,q);};
 assert.equal(await ctx.game.activateAbility(ctx.a,row),false);assert.equal(card.zone,'hand');assert.equal(ctx.a.pool.C,1);assert.equal(ctx.game.stack.length,0);
});

test('local AI avoids paying to pump an opponent and still values reducing that opponent',()=>{
 const ctx=ready('ai','Public Pump');ctx.a.pool.C=4;const [positive,negative]=ctx.source.def.abilities;
 assert.ok(positive.aiScore(ctx.game,ctx.source,ctx.a)<0);assert.ok(negative.aiScore(ctx.game,ctx.source,ctx.a)>0);
 assert.ok(positive.aiScore(ctx.game,ctx.source,ctx.b)>0);assert.ok(negative.aiScore(ctx.game,ctx.source,ctx.b)<0);
});

test('public activation parser rejects unimplemented payment, source zones and timing',()=>{
 for(const oracle of [
  '{T}: Draw a card. Any player may activate this ability.',
  'Sacrifice this creature: Draw a card. Any player may activate this ability.',
  '{1}: Draw a card. Any player may activate this ability but only if this card is on the stack.',
  '{1}: Draw a card. Any player may activate this ability but only before blockers.',
 ])assert.equal(!!semanticClass({name:'Unknown public ability',layout:'normal',type_line:'Creature — Bear',mana_cost:'{1}',power:'2',toughness:'2',oracle_text:oracle}).semanticClass,false,oracle);
});
