import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureEngine,context,put,paidCast,settle} from './helpers/oracle-v8-fixtures.mjs';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';
const M=fixtureEngine([
 ['Reveal Land','Reveal the top card of your library. If it\'s a land card, put it onto the battlefield tapped. Otherwise, draw a card.','Sorcery'],
 ['Reveal Creature','Reveal the top card of your library. If it\'s a creature card, put it onto the battlefield. Otherwise, put it into your graveyard.','Sorcery'],
 ['Reveal Stats','Scry 5, then reveal the top card of your library. If it\'s a creature card, you draw cards equal to its power and you gain life equal to its toughness.','Sorcery'],
 ['Reveal Draw','Scry 3, then reveal the top card of your library. Draw cards equal to that card\'s mana value.','Sorcery'],
 ['Reveal Drain','Reveal the top card of your library and put it into your hand. Each opponent loses life equal to that card\'s mana value.','Sorcery'],
 ['Reveal Sapling','Reveal the top card of your library. If it\'s a creature card, you gain life equal to that card\'s toughness, lose life equal to its power, then put it into your hand.','Sorcery'],
 ['Reveal Optional','You may reveal the top card of your library. If you do, each opponent loses life equal to that card\'s mana value.','Sorcery'],
 ['Reveal Three','Reveal the top card of your library. If it\'s a creature card, create a 1/1 green Saproling creature token. If it\'s a land card, put that card onto the battlefield under your control. If it\'s a noncreature, nonland card, you gain 2 life.','Sorcery'],
 ['Reveal Buff','{2}: Reveal the top card of your library. If it\'s a land card, this creature gets +2/+2 and gains trample until end of turn. Activate only once each turn.','Creature'],
 ['Reveal Body','','Creature','{4}'],
 ['Reveal Noncreature','Draw a card.','Instant','{3}'],
]);
function world(role){const ctx=context(M,role);ctx.reveals=[];ctx.game.revealToHuman=async q=>ctx.reveals.push(q);const decide=ctx.a.controller.decide.bind(ctx.a.controller);ctx.a.controller.decide=async(g,q)=>q.type==='scry'?{top:q.cards,bottom:[]}:decide(g,q);return ctx;}
for(const role of ['human','ai']){
 test(`${role}: Sapling reads live CDA power after gaining life while the card remains revealed in the library`,async()=>{
  const ctx=world(role),{game,a}=ctx,life=a.life,card=put(M,game,a,'Reveal Body','library');
  card.def={...card.def,oracleCharacteristicPT:true,cdaPower:()=>a.life/2,cdaToughness:()=>a.life};
  const losses=[],lose=game.loseLife;game.loseLife=async function(player,n,...rest){if(player===a)losses.push(n);return lose.call(this,player,n,...rest);};
  await paidCast(M,ctx,'Reveal Sapling');assert.deepEqual(losses,[life]);assert.equal(a.life,life);assert.equal(card.zone,'hand');
 });
 test(`${role}: Nissa uses library LKI after the revealed CDA creature is drawn into a hidden hand`,async()=>{
  const ctx=world(role),{game,a}=ctx,life=a.life,card=put(M,game,a,'Reveal Body','library');
  card.def={...card.def,oracleCharacteristicPT:true,cdaPower:()=>a.hand.length+2,cdaToughness:()=>a.hand.length+5};
  await paidCast(M,ctx,'Reveal Stats');assert.equal(a.hand.length,2);assert.equal(a.life,life+5);assert.equal(card.zone,'hand');assert.equal(card.toughness,7);
 });
 for(const land of [false,true])test(`${role}: revealed land ${land?'enters tapped without drawing':'else clause draws its actual top card'}`,async()=>{
  const ctx=world(role),card=put(M,ctx.game,ctx.a,land?'Forest':'Reveal Body','library');await paidCast(M,ctx,'Reveal Land');assert.equal(card.zone,land?'battlefield':'hand');assert.equal(ctx.a.hand.length,land?0:1);if(land)assert.equal(card.tapped,true);assert.ok(ctx.reveals.some(q=>q.cards.length===1&&q.cards[0]===card));
 });
 for(const creature of [false,true])test(`${role}: mandatory revealed-card ${creature?'battlefield':'graveyard'} placement never asks a second optional question`,async()=>{
  const ctx=world(role),card=put(M,ctx.game,ctx.a,creature?'Reveal Body':'Reveal Noncreature','library');await paidCast(M,ctx,'Reveal Creature');assert.equal(card.zone,creature?'battlefield':'graveyard');assert.equal(ctx.trace.some(row=>row.q.prompt==='Move the revealed card?'),false);
 });
 test(`${role}: revealed power and toughness remain bound after that card is drawn`,async()=>{
  const ctx=world(role),life=ctx.a.life,card=put(M,ctx.game,ctx.a,'Reveal Body','library');card.def={...card.def,power:'4',toughness:'7'};await paidCast(M,ctx,'Reveal Stats');assert.equal(ctx.a.hand.length,4);assert.equal(ctx.a.life,life+7);assert.equal(card.zone,'hand');
 });
 test(`${role}: revealed mana value draws the exact count`,async()=>{
  const ctx=world(role),card=put(M,ctx.game,ctx.a,'Reveal Noncreature','library');await paidCast(M,ctx,'Reveal Draw');assert.equal(ctx.a.hand.length,3);assert.equal(card.zone,'hand');
 });
 test(`${role}: nonpositive revealed power draws nothing while positive toughness still gains life`,async()=>{
  const ctx=world(role),life=ctx.a.life,card=put(M,ctx.game,ctx.a,'Reveal Body','library');card.def={...card.def,power:'-1',toughness:'3'};await paidCast(M,ctx,'Reveal Stats');assert.equal(ctx.a.hand.length,0);assert.equal(ctx.a.life,life+3);assert.equal(card.zone,'library');
 });
 test(`${role}: X contributes zero to the revealed card's library mana value`,async()=>{
  const ctx=world(role),card=put(M,ctx.game,ctx.a,'Reveal Noncreature','library');card.def={...card.def,cost:'{X}{2}'};card.castMeta={x:9};await paidCast(M,ctx,'Reveal Draw');assert.equal(ctx.a.hand.length,2);assert.equal(card.zone,'hand');
 });
 test(`${role}: moving the revealed card to hand retains its mana value for each opponent`,async()=>{
  const ctx=world(role),life=ctx.b.life,card=put(M,ctx.game,ctx.a,'Reveal Noncreature','library');await paidCast(M,ctx,'Reveal Drain');assert.equal(ctx.b.life,life-3);assert.equal(card.zone,'hand');
 });
 for(const kind of ['creature','land','other','both'])test(`${role}: independent conditional clauses evaluate a ${kind} card`,async()=>{
  const ctx=world(role),{game,a}=ctx,life=a.life,card=put(M,game,a,kind==='land'?'Forest':kind==='other'?'Reveal Noncreature':'Reveal Body','library');if(kind==='both')card.def={...card.def,types:['Creature','Land']};await paidCast(M,ctx,'Reveal Three');assert.equal(game.bf().filter(c=>c.isToken&&c.hasSub('Saproling')).length,['creature','both'].includes(kind)?1:0);assert.equal(card.zone,['land','both'].includes(kind)?'battlefield':'library');assert.equal(a.life,life+(kind==='other'?2:0));
 });
 test(`${role}: battlefield ability grants its printed boost and expires at cleanup`,async()=>{
  const ctx=world(role),{game,a}=ctx,source=put(M,game,a,'Reveal Buff'),power=source.power;a.pool.C=2;const ability=game.activatableList(a).find(row=>row.card===source);assert.equal(await game.activateAbility(a,ability),true);await settle(game);assert.equal(source.power,power+2);assert.equal(source.kw('trample'),true);assert.equal(game.activatableList(a).some(row=>row.card===source),false);game.mainPhase=async()=>{};game.combatPhase=async()=>{};await game.runTurn();game.recalc();assert.equal(source.power,power);assert.equal(source.kw('trample'),false);
 });
}
test('declining optional reveal leaves hidden top card undisclosed and unchanged',async()=>{
 const ctx=world('human'),card=ctx.a.library.at(-1),life=ctx.b.life,decide=ctx.a.controller.decide.bind(ctx.a.controller);ctx.a.controller.decide=(g,q)=>q.prompt==='Reveal the top card of your library?'?'no':decide(g,q);await paidCast(M,ctx,'Reveal Optional');assert.equal(ctx.reveals.length,0);assert.equal(ctx.a.library.at(-1),card);assert.equal(ctx.b.life,life);
});
test('empty library does not create a revealed-card result or draw from that absent card',async()=>{
 const ctx=world('human');ctx.a.library.length=0;await paidCast(M,ctx,'Reveal Draw');assert.equal(ctx.a.hand.length,0);assert.equal(ctx.reveals.length,0);assert.equal(ctx.a.lost,false);
});
test('unsupported repeats, foreign antecedents, and extra paragraphs remain deferred',()=>{
 for(const oracle_text of ["Reveal the top card of your library. If it's a land card, put it into your graveyard and repeat this process.","Reveal the top card of your library. If it's a creature card, exile it. You may cast it without paying its mana cost.","Reveal the top card of your library. Draw cards equal to that card's mana value. Repeat this process."])assert.equal(semanticClass({name:'Reveal Guard',oracle_text,type_line:'Sorcery',mana_cost:'{G}',layout:'normal'}).semanticClass,undefined);
});
