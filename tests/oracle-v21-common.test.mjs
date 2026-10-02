import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createImportPlan,semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v21-common.json',import.meta.url),'utf8'));
const M=loadEngine(),absent=rows.filter(row=>!M.DEFS[row.name]);
if(absent.length){const plan=createImportPlan({cards:absent,bulk:{type:'oracle_cards'},sequence:9941,limit:absent.length,compilerVersion:21});assert.equal(plan.report.cards.length,absent.length);M.registerOracleBatch(plan.report);M.initData(M.RAW_DATA);}
const fund=p=>{for(const color of ['W','U','B','R','G','C'])p.pool[color]=30;};
for(const role of ['human','ai']){
 test(role+': Phoenix observes graveyard spell damage and grants haste to its returned incarnation',async()=>{
  const {game,a,b}=context(M,role),phoenix=put(M,game,a,'Bloodfeather Phoenix','graveyard');game.recalc();assert.equal(game._oracleDamageWatch,true);fund(a);
  const shock=put(M,game,a,'Shock','hand'),prior=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='chooseTargets'?[b]:prior(g,q);
  const red=a.pool.R;assert.equal(await game.castSpell(a,shock,{from:'hand'}),true);await settle(game);
  assert.equal(b.life,38);assert.equal(phoenix.zone,'battlefield');assert.equal(phoenix.kw('haste'),true);assert.equal(a.pool.R,red-2);
  game.untilEffects=game.untilEffects.filter(e=>e.expires!=='eot');game.recalc();assert.equal(phoenix.kw('haste'),false);assertGameStateInvariants(game);
 });
 test(role+': Phoenix declines payment and rejects a stale graveyard incarnation',async()=>{
  for(const stale of [false,true]){
   const {game,a,b}=context(M,role),phoenix=put(M,game,a,'Bloodfeather Phoenix','graveyard');game.recalc();fund(a);
   const shock=put(M,game,a,'Shock','hand'),prior=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='chooseTargets'?[b]:q.type==='chooseOption'&&q.aiHint?.kind==='optTrigger'?(stale?'yes':'no'):prior(g,q);
   assert.equal(await game.castSpell(a,shock,{from:'hand'}),true);await game.resolveTop();await game.flushTriggers();assert.ok(game.stack.some(row=>row.srcCard===phoenix));
   if(stale){await game.move(phoenix,'exile');await game.move(phoenix,'graveyard');}
   await settle(game);assert.equal(phoenix.zone,'graveyard');assert.equal(phoenix.kw('haste'),false);assertGameStateInvariants(game);
  }
 });
 test(role+': Phoenix requires its controller spell and an opponent damage recipient',async()=>{
  for(const opponentSpell of [false,true]){
   const {game,a,b}=context(M,role),phoenix=put(M,game,a,'Bloodfeather Phoenix','graveyard');game.recalc();fund(a);fund(b);
   const caster=opponentSpell?b:a,shock=put(M,game,caster,'Shock','hand'),prior=caster.controller.decide.bind(caster.controller);caster.controller.decide=(g,q)=>q.type==='chooseTargets'?[a]:prior(g,q);
   game.turnPlayer=caster;assert.equal(await game.castSpell(caster,shock,{from:'hand'}),true);await settle(game);assert.equal(phoenix.zone,'graveyard');
   await game.move(phoenix,'exile');game.recalc();assert.equal(game._oracleDamageWatch,false);assertGameStateInvariants(game);
  }
 });
 test(role+': Coalborn Entity offers the full union and excludes ordinary creatures',async()=>{
  const {game,a,b}=context(M,role),source=put(M,game,a,'Coalborn Entity'),normal=put(M,game,b,'Grizzly Bears'),token=put(M,game,b,'Grizzly Bears');token.isToken=true;fund(a);
  const action=game.activatableList(a).find(row=>row.card===source&&row.ability);assert.ok(action);
  const legal=game.legalTargets(action.ability.targets[0],source,a);assert.equal(legal.includes(b),true);assert.equal(legal.includes(token),true);assert.equal(legal.includes(normal),false);
  const prior=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='chooseTargets'?[b]:prior(g,q);const life=b.life;
  assert.equal(await game.activateAbility(a,action),true);await settle(game);assert.equal(b.life,life-1);assertGameStateInvariants(game);
 });
 test(role+': Nocturnus continuously checks the exact top card and recipient controller',async()=>{
  const {game,a,b}=context(M,role),source=put(M,game,a,'Vampire Nocturnus'),own=put(M,game,a,'Grizzly Bears'),enemy=put(M,game,b,'Grizzly Bears');
  for(const witness of [own,enemy])witness.def={...witness.def,subtypes:['Vampire']};game.recalc();
  const baseline={power:source.power,toughness:source.toughness};assert.equal(source.kw('flying'),false);
  put(M,game,a,'Vampire Nocturnus','library');game.recalc();assert.equal(source.power,baseline.power+2);assert.equal(source.toughness,baseline.toughness+1);assert.equal(source.kw('flying'),true);assert.equal(own.kw('flying'),true);assert.equal(enemy.kw('flying'),false);
  await game.draw(a,1);game.recalc();assert.equal(source.power,baseline.power);assert.equal(source.kw('flying'),false);assertGameStateInvariants(game);
 });
 test(role+': Reality Chip top-card permission follows its live attachment',async()=>{
  const {game,a}=context(M,role),chip=put(M,game,a,'The Reality Chip'),host=put(M,game,a,'Grizzly Bears'),card=put(M,game,a,'Grizzly Bears','library');fund(a);
  assert.equal(game.castableList(a).some(row=>row.card===card),false);
  const reconfigure=game.activatableList(a).find(row=>row.card===chip&&row.ability?.label==='Reconfigure — attach');assert.ok(reconfigure);
  const decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='chooseTargets'?[host]:decide(g,q);
  assert.equal(await game.activateAbility(a,reconfigure),true);await settle(game);a.controller.decide=decide;
  assert.equal(chip.attachedTo,host.iid);assert.equal(game.castableList(a).some(row=>row.card===card),true);
  await game.move(host,'graveyard');assert.equal(game.castableList(a).some(row=>row.card===card),false);assertGameStateInvariants(game);
 });
 test(role+': Yanling emblem grants actual paid draw activations only to its controller Islands',async()=>{
  const {game,a,b}=context(M,role),source=put(M,game,a,'Mu Yanling, Sky Dancer'),island=put(M,game,a,'Island'),enemy=put(M,game,b,'Island');source.counters.loyalty=8;game.recalc();
  const action=game.activatableList(a).find(row=>row.card===source&&row.ability?.loyalty===-8);assert.ok(action);
  assert.equal(await game.activateAbility(a,action),true);await settle(game);assert.equal(a.emblems.length,1);assert.equal(source.zone,'graveyard');
  assert.equal(island.cur.extraAbilities.length,1);assert.equal(enemy.cur.extraAbilities.length,0);
  const draw=game.activatableList(a).find(row=>row.card===island&&row.ability===island.cur.extraAbilities[0]);assert.ok(draw);const old=a.hand.length;
  assert.equal(await game.activateAbility(a,draw),true);assert.equal(island.tapped,true);await settle(game);assert.equal(a.hand.length,old+1);assert.equal(a.emblems.length,1);assertGameStateInvariants(game);
 });
}
test('v21 shared grammar consumes complete conditions and keeps unknown qualifications closed',()=>{
 for(const text of ['As long as the top card of your library is plaid, this creature gets +2/+2.','As long as this creature is attached to a mysterious object, draw a card.','You get an emblem with "Islands you control have an unfinished ability."']){
  assert.equal(semanticClass({name:'Closed common rule',layout:'normal',mana_cost:'{2}',type_line:'Creature — Bear',power:'2',toughness:'3',oracle_text:text},{compilerVersion:21}).semanticClass,undefined);
 }
});
