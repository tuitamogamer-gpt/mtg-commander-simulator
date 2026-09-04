import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureEngine,context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';
const M=fixtureEngine([
 ['Paid Grave Cast','You may cast target instant or sorcery card from a graveyard. If that spell would be put into a graveyard, exile it instead.','Sorcery'],
 ['Any Color Grave Cast','You may cast target instant or sorcery card from a graveyard, and mana of any type can be spent to cast that spell. If that spell would be put into a graveyard, exile it instead.','Sorcery'],
 ['Target Limited Grave Cast','You may cast target instant or sorcery card with mana value 3 or less from your graveyard without paying its mana cost. If that spell would be put into your graveyard, exile it instead.','Sorcery'],
 ['Select Grave Cast','You may cast an instant or sorcery spell with mana value 3 or less from a graveyard without paying its mana cost. If that spell would be put into a graveyard, exile it instead.','Sorcery'],
 ['Select Own Grave Cast','You may cast an instant or sorcery spell from your graveyard.','Sorcery'],
 ['Conditional Exile Cast','You may cast target instant, sorcery, or artifact card from your graveyard without paying its mana cost. If an instant or sorcery spell cast this way would be put into your graveyard, exile it instead.','Sorcery'],
 ['Power Gravecaster',"{T}: You may cast target instant or sorcery card with mana value less than or equal to this creature's power from your graveyard without paying its mana cost. If that spell would be put into your graveyard, exile it instead.",'Creature'],
 ['Power Draw','Draw two cards.','Sorcery','{2}'],
 ['Cast Red Draw','Draw two cards.','Sorcery','{2}{R}'],
 ['Cast Cheap Draw','Draw two cards.','Sorcery','{3}'],
 ['Cast Costly Draw','Draw two cards.','Sorcery','{4}'],
 ['Cast Artifact','','Artifact','{3}'],
]);
function world(role){const ctx=context(M,role),decide=ctx.a.controller.decide.bind(ctx.a.controller);if(role==='human')ctx.a.controller.decide=(g,q)=>q.type==='chooseCards'&&q.prompt?.startsWith('You may cast one')?Promise.resolve(q.from.slice(0,1)):decide(g,q);return ctx;}
async function start(ctx,name){const source=put(M,ctx.game,ctx.a,name,'hand');ctx.a.pool.G=1;assert.equal(await ctx.game.castSpell(ctx.a,source,{from:'hand'}),true);return source;}
for(const role of ['human','ai']){
 for(const change of ['none','smaller','left','returned'])test(`${role}: source-power limit uses ${['left','returned'].includes(change)?'the last battlefield incarnation after it '+change:change==='smaller'?'its reduced power at resolution':'its actual battlefield power'}`,async()=>{
  const ctx=world(role),{game,a}=ctx,source=put(M,game,a,'Power Gravecaster'),card=put(M,game,a,'Power Draw','graveyard');
  const ability=game.activatableList(a).find(action=>action.card===source);assert.ok(ability);assert.equal(await game.activateAbility(a,ability),true);
  if(['left','returned'].includes(change))await game.move(source,'graveyard');
  if(change==='returned'){await game.move(source,'battlefield');source.counters['-1/-1']=1;game.recalc();}
  if(change==='smaller'){source.counters['-1/-1']=1;game.recalc();}
  await settle(game);assert.equal(card.zone,change==='smaller'?'graveyard':'exile');assert.equal(a.hand.length,change==='smaller'?0:2);
 });
 for(const enough of [false,true])test(`${role}: paid graveyard permission ${enough?'pays the full printed cost':'cannot cast an unaffordable card'}`,async()=>{
  const ctx=world(role),{game,a,b}=ctx,card=put(M,game,b,'Cast Cheap Draw','graveyard');await start(ctx,'Paid Grave Cast');a.pool.C=enough?3:2;
  await game.resolveTop();assert.equal(card.zone,enough?'stack':'graveyard');assert.equal(a.pool.C,enough?0:2);
  if(enough){const so=game.stack.at(-1);assert.equal(so.castOpts.free,false);assert.equal(so.manaSpent,3);assert.equal(so.ctrl,a);await settle(game);assert.equal(card.zone,'exile');assert.equal(a.hand.length,2);}else await settle(game);
 });
 test(`${role}: any-color permission pays colored mana with colorless and does not waive cost`,async()=>{
  const ctx=world(role),{game,a,b}=ctx,card=put(M,game,b,'Cast Red Draw','graveyard');await start(ctx,'Any Color Grave Cast');a.pool.C=3;
  await game.resolveTop();assert.equal(card.zone,'stack');assert.equal(a.pool.C,0);assert.equal(game.stack.at(-1).manaSpent,3);await settle(game);assert.equal(card.zone,'exile');assert.equal(a.hand.length,2);
 });
 test(`${role}: untargeted graveyard choice uses all graveyards and the prospective spell limit`,async()=>{
  const ctx=world(role),{game,a,b}=ctx,ownCostly=put(M,game,a,'Cast Costly Draw','graveyard'),enemy=put(M,game,b,'Cast Cheap Draw','graveyard'),hand=put(M,game,a,'Cast Cheap Draw','hand');
  await start(ctx,'Select Grave Cast');await game.resolveTop();assert.equal(enemy.zone,'stack');assert.equal(ownCostly.zone,'graveyard');assert.equal(hand.zone,'hand');assert.equal(game.stack.at(-1).manaSpent,0);await settle(game);assert.equal(enemy.zone,'exile');
 });
 test(`${role}: own graveyard selection never offers an opponent card`,async()=>{
  const ctx=world(role),{game,a,b}=ctx,enemy=put(M,game,b,'Cast Cheap Draw','graveyard');await start(ctx,'Select Own Grave Cast');a.pool.C=3;await settle(game);assert.equal(enemy.zone,'graveyard');assert.equal(a.pool.C,3);
 });
 for(const artifact of [false,true])test(`${role}: conditional Stack-to-graveyard replacement ${artifact?'preserves the artifact spell':'exiles the sorcery spell'} when countered`,async()=>{
  const ctx=world(role),{game,a}=ctx,card=put(M,game,a,artifact?'Cast Artifact':'Cast Cheap Draw','graveyard');await start(ctx,'Conditional Exile Cast');await game.resolveTop();const so=game.stack.at(-1);assert.equal(so.card,card);assert.equal(!!so.castOpts.oracleExileOnGraveyard,!artifact);
  await game.counterStackObject(so);assert.equal(card.zone,artifact?'graveyard':'exile');await settle(game);
 });
 test(`${role}: targeted limit is rechecked before granting permission after the target leaves`,async()=>{
  const ctx=world(role),{game,a}=ctx,card=put(M,game,a,'Cast Cheap Draw','graveyard');await start(ctx,'Target Limited Grave Cast');await game.move(card,'hand');await game.move(card,'graveyard');await settle(game);assert.equal(card.zone,'graveyard');assert.equal(a.hand.length,0);
 });
}
test('graveyard permission grammar keeps lasting and additional-cost instructions deferred',()=>{
 for(const oracle_text of ['You may cast target instant card from your graveyard this turn.','You may cast target instant card from your graveyard by paying {R} in addition to its other costs.','You may cast an instant spell from your graveyard. Repeat this process.'])assert.equal(semanticClass({name:'Grave Cast Guard',oracle_text,type_line:'Sorcery',mana_cost:'{G}',layout:'normal'}).semanticClass,undefined);
});
