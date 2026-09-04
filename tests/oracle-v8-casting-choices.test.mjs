import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureEngine,context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';
const cases=[
 ['Sacrifice','sacrifice a creature','{3}','battlefield','Choice Creature'],
 ['Discard','discard a card','{2}','hand','Choice Creature'],
 ['Exile','exile two cards from your graveyard','{1}{W}','graveyard','Choice Creature'],
 ['Reveal','reveal a Dinosaur card from your hand','{1}','hand','Choice Dinosaur'],
 ['Behold','behold a Dinosaur','{2}','battlefield','Choice Dinosaur'],
 ['Tap','tap an untapped artifact you control','{1}','battlefield','Choice Artifact'],
 ['Blight','blight 2','{1}','battlefield','Choice Creature'],
 ['Forage','forage','{B}','graveyard','Choice Creature'],
];
const MTG=fixtureEngine([
 ...cases.map(([name,left,cost])=>['Choice '+name,`As an additional cost to cast this spell, ${left} or pay ${cost}.\nDraw a card.`,'Instant','{G}']),
 ['Choice Creature','','Creature — Bear','{0}'],['Choice Dinosaur','','Creature — Dinosaur','{0}'],['Choice Artifact','','Artifact','{0}'],
 ['Choice Sacrifice Mana','Sacrifice this creature: Add {G}.','Creature — Bear','{0}'],
 ['Choice Artifact Mana','{T}: Add {G}.','Artifact','{0}'],
]);
const own=(ctx,name,zone='battlefield')=>put(MTG,ctx.game,ctx.a,name,zone);
function ready(role,name){const ctx=context(MTG,role);ctx.a.pool={W:0,U:0,B:0,R:0,G:1,C:0};return{...ctx,source:own(ctx,'Choice '+name,'hand')};}
const cast=ctx=>ctx.game.castSpell(ctx.a,ctx.source,{from:'hand'});
const object=ctx=>ctx.game.stack.find(row=>row.card===ctx.source);
for(const role of ['human','ai'])for(const [name,left,cost,zone,fodder]of cases){
 test(`Casting choice ${role}: ${name} pays its exact nonmana branch before the Stack`,async()=>{
  const ctx=ready(role,name),n=name==='Exile'?2:name==='Forage'?3:1,cards=Array.from({length:n},()=>own(ctx,fodder,zone)),reveals=[];ctx.game.revealToHuman=async event=>reveals.push(event);
  assert.ok(ctx.game.castableList(ctx.a).some(row=>row.card===ctx.source));assert.equal(await cast(ctx),true);const so=object(ctx);assert.ok(so);assert.equal(so.manaSpent,1);
  assert.notEqual(so.oracleCastingChoicePaid.kind,'mana');
  if(['Sacrifice','Discard'].includes(name))assert.ok(cards.every(card=>card.zone==='graveyard'));
  if(['Exile','Forage'].includes(name))assert.ok(cards.every(card=>card.zone==='exile'));
  if(name==='Reveal'){assert.equal(cards[0].zone,'hand');assert.equal(reveals.length,1);assert.equal(reveals[0].cards[0],cards[0]);}
  if(name==='Behold'){assert.equal(cards[0].zone,'battlefield');assert.equal(cards[0].tapped,false);assert.equal(reveals.length,0);}
  if(name==='Tap')assert.equal(cards[0].tapped,true);
  if(name==='Blight')assert.equal(cards[0].counters['-1/-1'],2);
  assert.equal(await ctx.game.counterStackObject(so),true);await settle(ctx.game);assert.equal(ctx.source.zone,'graveyard');
 });
 test(`Casting choice ${role}: ${name} requires the complete additional mana when no nonmana branch exists`,async()=>{
  const ctx=ready(role,name);assert.equal(ctx.game.castableList(ctx.a).some(row=>row.card===ctx.source),false);assert.equal(await cast(ctx),false);assert.equal(ctx.a.pool.G,1);
  const extra=MTG.parseCost(cost);ctx.a.pool.C=extra.generic;for(const pip of extra.pips)ctx.a.pool[pip[0]]++;
  assert.ok(ctx.game.castableList(ctx.a).some(row=>row.card===ctx.source));assert.equal(await cast(ctx),true);const so=object(ctx);assert.equal(so.oracleCastingChoicePaid.kind,'mana');assert.equal(so.oracleCastingChoicePaid.cost,cost);assert.equal(so.manaSpent,1+extra.generic+extra.pips.length);await settle(ctx.game);assert.equal(ctx.a.hand.length,1);
 });
}
test('Casting choice cannot consume the same artifact or creature for mana and its own mandatory cost',async()=>{
 for(const [kind,name]of [['Tap','Choice Artifact Mana'],['Sacrifice','Choice Sacrifice Mana']]){
  const ctx=ready('human',kind);ctx.a.pool.G=0;const fodder=own(ctx,name);assert.equal(ctx.game.castableList(ctx.a).some(row=>row.card===ctx.source),false);assert.equal(await cast(ctx),false);assert.equal(fodder.zone,'battlefield');assert.equal(fodder.tapped,false);
  ctx.a.pool.G=1;assert.equal(await cast(ctx),true);await settle(ctx.game);
 }
});
test('Casting choice rejects unknown branch, wrong card type, stale identity and invalid card count',async()=>{
 const ctx=ready('human','Reveal'),wrong=own(ctx,'Choice Creature','hand');assert.equal(await cast(ctx),false);assert.equal(wrong.zone,'hand');
 const dinosaur=own(ctx,'Choice Dinosaur','hand'),decide=ctx.a.controller.decide.bind(ctx.a.controller);
 ctx.a.controller.decide=async(g,q)=>{const answer=await decide(g,q);if(q.type==='chooseCards'){await g.move(dinosaur,'graveyard');await g.move(dinosaur,'hand');}return answer;};assert.equal(await cast(ctx),false);assert.equal(ctx.a.pool.G,1);
 const bad=ready('human','Tap'),artifact=own(bad,'Choice Artifact');bad.a.controller.decide=async()=>[artifact,artifact];assert.equal(await cast(bad),false);assert.equal(artifact.tapped,false);
 for(const phrase of ['reveal an UnknownSubtype card from your hand or pay {1}','sacrifice a creature or pay {X}','blight X or pay {1}','tap a tapped artifact you control or pay {1}'])assert.equal(!!semanticClass({name:'Unknown Choice',layout:'normal',type_line:'Instant',mana_cost:'{G}',oracle_text:`As an additional cost to cast this spell, ${phrase}.\nDraw a card.`}).semanticClass,false);
});
test('Casting choice local AI selects and performs the legal action with insufficient mana for the other branch',async()=>{
 const ctx=ready('ai','Reveal');own(ctx,'Choice Dinosaur','hand');const casts=ctx.game.castableList(ctx.a).filter(row=>row.card===ctx.source);
 const action=await ctx.a.controller.decide(ctx.game,{type:'main',player:ctx.a,phase:ctx.game.phase,casts,acts:[],lands:[]});assert.equal(action.kind,'cast');await ctx.game.performAction(ctx.a,action);assert.equal(object(ctx).oracleCastingChoicePaid.kind,'revealHand');await settle(ctx.game);
});
test('Casting choice preserves commander tax and consumes additional mana on a free cast',async()=>{
 const ctx=ready('human','Sacrifice');await ctx.game.move(ctx.source,'command');ctx.source.commander=true;ctx.source.cmdCasts=2;ctx.a.pool.C=6;
 assert.equal(await ctx.game.castSpell(ctx.a,ctx.source,{from:'command'}),false);assert.equal(ctx.a.pool.C,6);ctx.a.pool.C=7;
 assert.equal(await ctx.game.castSpell(ctx.a,ctx.source,{from:'command'}),true);assert.equal(object(ctx).manaSpent,8);await settle(ctx.game);
 const free=ready('human','Sacrifice');free.a.pool.G=0;free.a.pool.C=2;
 assert.equal(await free.game.castSpell(free.a,free.source,{from:'hand',alt:{free:true}}),false);free.a.pool.C=3;
 assert.equal(await free.game.castSpell(free.a,free.source,{from:'hand',alt:{free:true}}),true);assert.equal(object(free).manaSpent,3);await settle(free.game);
});
test('Casting choice applies residual generic and colored cost reductions to the chosen extra mana',async()=>{
 const ctx=ready('human','Sacrifice');ctx.source.def={...ctx.source.def,selfCostAdjust:()=>-2};ctx.a.pool.C=1;
 assert.equal(await cast(ctx),true);assert.equal(object(ctx).manaSpent,2);await settle(ctx.game);
 const colored=ready('human','Exile');colored.source.def={...colored.source.def,selfColoredCostReduction:()=>['W']};colored.a.pool.C=1;
 assert.equal(await cast(colored),true);assert.equal(object(colored).manaSpent,2);await settle(colored.game);
});
test('Casting choice Behold may reveal a matching hand card and Forage may sacrifice Food',async()=>{
 for(const role of ['human','ai']){
  const behold=ready(role,'Behold'),card=own(behold,'Choice Dinosaur','hand');assert.equal(await cast(behold),true);assert.equal(object(behold).oracleCastingChoicePaid.kind,'revealHand');assert.equal(card.zone,'hand');await settle(behold.game);
  const forage=ready(role,'Forage'),food=new MTG.CardInst({...MTG.DEFS['Choice Artifact'],name:'Choice Food',subtypes:['Food']},forage.a);food.zone='battlefield';forage.game.battlefield.push(food);forage.game.recalc();
  assert.equal(await cast(forage),true);assert.equal(food.zone,'graveyard');assert.equal(object(forage).oracleV4AdditionalCost.sacrifices[0].iid,food.iid);await settle(forage.game);
 }
});
