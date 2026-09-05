import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {fixtureEngine,context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-kicker-replacements.json',import.meta.url)));
const production=loadEngine();
for(const card of rows)if(production.DEFS[card.name])assert.equal(production.DEFS[card.name].oracle,card.oracle_text,card.name+': existing production entry retains the exact pinned source');
const M=fixtureEngine(rows.filter(card=>!production.DEFS[card.name]).map(card=>[card.name,card.oracle_text,card.type_line,card.mana_cost,{power:card.power,toughness:card.toughness}]));
function fundCost(player,text){const cost=M.parseCost(text);player.pool.C+=cost.generic;for(const pip of cost.pips)player.pool[pip.find(c=>'WUBRGC'.includes(c))]++;}
async function cast(ctx,name,kicked){
 const card=put(M,ctx.game,ctx.a,name,'hand');fundCost(ctx.a,card.def.cost);
 if(kicked)fundCost(ctx.a,card.def.kicker.cost);
 assert.equal(await ctx.game.castSpell(ctx.a,card,{from:'hand'}),true);
 const object=ctx.game.stack.find(object=>object.card===card);assert.ok(object);
 assert.equal(object.kicked,kicked,'actual announced payment selects the branch');
 assert.equal(Object.values(ctx.a.pool).reduce((n,x)=>n+x,0),0,'printed plus announced kicker mana is spent');
 await settle(ctx.game);return {card,object};
}
test('all30 exact source cards compile both exclusive outcomes; unsupported announcement changes fail closed',()=>{
 assert.equal(rows.length,30);
 for(const card of rows){const parsed=semanticClass(card);assert.ok(parsed.semanticClass,card.name);const text=JSON.stringify(parsed.implementation);assert.match(text,/"condition":\{"kind":"kicked"\},"effects":/);assert.match(text,/"elseEffects":/);}
 for(const oracle of [
  'Kicker {2}{W}\nTarget creature you control gains indestructible until end of turn. If this spell was kicked, instead any number of target creatures you control gain indestructible until end of turn.',
  'Kicker {3}\nReturn target creature card from your graveyard to your hand. If this spell was kicked, instead return two target creature cards from your graveyard to your hand.',
  'Kicker {2}\nDraw a card. If this spell was kicked, draw a card and dream of stars instead.',
 ])assert.equal(semanticClass({name:'Boundary',type_line:'Instant',mana_cost:'{W}',oracle_text:oracle,layout:'normal',keywords:[]}).semanticClass,undefined);
});
for(const role of ['human','ai'])for(const kicked of [false,true]){
 test(`${role}/${kicked}: Burst Lightning replaces damage and Field Research replaces draw`,async()=>{
  let c=context(M,role),life=c.b.life;if(role==='human'){const base=c.a.controller.decide.bind(c.a.controller);c.a.controller.decide=(g,q)=>q.type==='chooseTargets'?[c.b]:base(g,q);}await cast(c,'Burst Lightning',kicked);assert.equal(c.b.life,life-(kicked?4:2));
  c=context(M,role);await cast(c,'Field Research',kicked);assert.equal(c.a.hand.length,kicked?3:2);
 });
 test(`${role}/${kicked}: Saproling Migration creates only the selected token count`,async()=>{
  const c=context(M,role);await cast(c,'Saproling Migration',kicked);assert.equal(c.game.creatures(c.a).filter(card=>card.hasSub('Saproling')).length,kicked?4:2);
 });
 test(`${role}/${kicked}: Gift of Growth always untaps and applies only the selected power bonus`,async()=>{
  const c=context(M,role),host=put(M,c.game,c.a,'Grizzly Bears');host.tapped=true;
  await cast(c,'Gift of Growth',kicked);assert.equal(host.tapped,false);assert.equal(host.power,kicked?6:4);assert.equal(host.toughness,kicked?6:4);
 });
 test(`${role}/${kicked}: Colossal Growth replaces the buff and grants only the paid keywords`,async()=>{
  const c=context(M,role),host=put(M,c.game,c.a,'Grizzly Bears');
  await cast(c,'Colossal Growth',kicked);assert.equal(host.power,kicked?6:5);assert.equal(host.kw('trample'),kicked);assert.equal(host.kw('haste'),kicked);
 });
 test(`${role}/${kicked}: Desolation Giant uses its paid ETB scope and excludes itself`,async()=>{
  const c=context(M,role),own=put(M,c.game,c.a,'Grizzly Bears'),enemy=put(M,c.game,c.b,'Grizzly Bears');
  const{card}=await cast(c,'Desolation Giant',kicked);assert.equal(own.zone,'graveyard');assert.equal(enemy.zone,kicked?'graveyard':'battlefield');assert.equal(card.zone,'battlefield');
 });
 test(`${role}/${kicked}: nonmana kicker sacrifices its real permanent and chooses only its paid debuff`,async()=>{
  const c=context(M,role),enemy=put(M,c.game,c.b,'Colossal Dreadmaw'),fodder=kicked?put(M,c.game,c.a,'Sol Ring'):null;
  const{object}=await cast(c,'Stomped by the Foot',kicked);assert.equal(enemy.power,kicked?1:4);assert.equal(enemy.toughness,kicked?1:4);
  if(kicked){assert.equal(fodder.zone,'graveyard');assert.equal(object.oracleV4AdditionalCost.sacrifices.length,1);assert.equal(object.oracleV4AdditionalCost.sacrifices[0].iid,fodder.iid);}
 });
 test(`${role}/${kicked}: Rona's Vortex chooses hand or library bottom for the same enemy target`,async()=>{
  const c=context(M,role),own=put(M,c.game,c.a,'Grizzly Bears'),enemy=put(M,c.game,c.b,'Grizzly Bears');
  const original=c.a.controller.decide.bind(c.a.controller);c.a.controller.decide=(g,q)=>{if(q.type==='chooseTargets'){assert.equal(q.candidates.includes(own),false);assert.equal(q.candidates.includes(enemy),true);}return original(g,q);};
  await cast(c,"Rona's Vortex",kicked);assert.equal(enemy.zone,kicked?'library':'hand');if(kicked)assert.equal(c.b.library[0],enemy);
 });
 test(`${role}/${kicked}: Marsh Casualties affects only the selected player's creatures`,async()=>{
  const c=context(M,role),own=put(M,c.game,c.a,'Colossal Dreadmaw'),enemy=put(M,c.game,c.b,'Colossal Dreadmaw');
  if(role==='human'){const original=c.a.controller.decide.bind(c.a.controller);c.a.controller.decide=(g,q)=>q.type==='chooseTargets'?[c.b]:original(g,q);}
  await cast(c,'Marsh Casualties',kicked);assert.equal(own.power,6);assert.equal(enemy.power,kicked?4:5);
 });
 test(`${role}/${kicked}: Reclaim the Wastes searches for exactly the selected maximum`,async()=>{
  const c=context(M,role);if(role==='human'){const original=c.a.controller.decide.bind(c.a.controller);c.a.controller.decide=(g,q)=>q.type==='chooseCards'?q.from.slice(0,q.max):original(g,q);}
  await cast(c,'Reclaim the Wastes',kicked);assert.equal(c.a.hand.length,kicked?2:1);
 });
}
