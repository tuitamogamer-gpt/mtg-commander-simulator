import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureEngine,context,put,settle}from'./helpers/oracle-v8-fixtures.mjs';
const MTG=fixtureEngine([
 ['Batch Entry','Whenever one or more other creatures you control enter, you gain 2 life.'],
 ['Batch Death','Whenever one or more other creatures you control die, you gain 2 life.'],
 ['Batch Leave','Whenever one or more other creatures you control leave the battlefield, you gain 2 life.'],
 ['Batch Tokens','Whenever one or more tokens you control enter, you gain 2 life.'],
 ['Limited Batch','Whenever one or more other creatures you control enter, you gain 2 life. This ability triggers only once each turn.'],
 ['Batch Discard','Whenever you discard one or more nonland cards, you gain 2 life.'],
 ['Batch Sacrifice','Whenever you sacrifice one or more other creatures, you gain 2 life.'],
 ['Created Creature Batch','Whenever you create one or more creature tokens, you gain 2 life.'],
]);
for(const role of ['human','ai']){
 test(`${role}: grouped discards ignore nonmatching cards and separate other players`,async()=>{
  const {game,a,b}=context(MTG,role);put(MTG,game,a,'Batch Discard');const life=a.life;
  await game.discard(a,[put(MTG,game,a,'Forest','hand'),put(MTG,game,a,'Grizzly Bears','hand'),put(MTG,game,a,'Lightning Bolt','hand')]);assert.equal(game.pendingTriggers.length,1);
  await game.discard(b,[put(MTG,game,b,'Grizzly Bears','hand')]);assert.equal(game.pendingTriggers.length,1);await settle(game);assert.equal(a.life,life+2);
  await game.discard(a,[put(MTG,game,a,'Lightning Bolt','hand')]);await settle(game);assert.equal(a.life,life+4);
 });
 test(`${role}: token creation qualifies by actual creature results`,async()=>{
  const {game,a,b}=context(MTG,role);put(MTG,game,a,'Created Creature Batch');const life=a.life;
  await game.makeTokens('treasure',a,{n:2});await game.makeTokens('saproling',b,{n:2});assert.equal(game.pendingTriggers.length,0);
  await game.makeTokens(['treasure','saproling','saproling'],a);assert.equal(game.pendingTriggers.length,1);await settle(game);assert.equal(a.life,life+2);
 });
 test(`${role}: simultaneous sacrifice is one event`,async()=>{
  const {game,a}=context(MTG,role);put(MTG,game,a,'Batch Sacrifice');const life=a.life;
  await game.sacrificeMany(a,[put(MTG,game,a,'Grizzly Bears'),put(MTG,game,a,'Grizzly Bears')]);assert.equal(game.pendingTriggers.length,1);await settle(game);assert.equal(a.life,life+2);
 });
 test(`${role}: simultaneous entrants trigger once, separate entries trigger separately`,async()=>{
  const {game,a,b}=context(MTG,role);put(MTG,game,a,'Batch Entry');const life=a.life;
  const creatures=[put(MTG,game,b,'Grizzly Bears','hand'),put(MTG,game,a,'Grizzly Bears','hand'),put(MTG,game,a,'Grizzly Bears','hand')];
  await game.moveBattlefieldBatch(creatures);assert.equal(game.pendingTriggers.length,1);await settle(game);assert.equal(a.life,life+2);
  for(let i=0;i<2;i++)await game.move(put(MTG,game,a,'Grizzly Bears','hand'),'battlefield');assert.equal(game.pendingTriggers.length,2);await settle(game);assert.equal(a.life,life+6);
 });
 test(`${role}: source dying with its creatures retains one LKI-controlled trigger`,async()=>{
  const {game,a,b}=context(MTG,role);const source=put(MTG,game,a,'Batch Death');const others=[put(MTG,game,a,'Grizzly Bears'),put(MTG,game,a,'Grizzly Bears'),put(MTG,game,b,'Grizzly Bears')],life=a.life;
  await game.destroyMany([...others,source]);assert.equal(game.pendingTriggers.length,1);await settle(game);assert.equal(a.life,life+2);
 });
 test(`${role}: a stolen source dying first uses its previous controller`,async()=>{
  const {game,a,b}=context(MTG,role);const source=put(MTG,game,b,'Batch Death');source.ctrl=a;game.recalc();const life=a.life,opponentLife=b.life;
  await game.destroyMany([source,put(MTG,game,a,'Grizzly Bears'),put(MTG,game,a,'Grizzly Bears')]);assert.equal(game.pendingTriggers.length,1);await settle(game);assert.equal(a.life,life+2);assert.equal(b.life,opponentLife);
 });
 test(`${role}: two simultaneous sources each retain their own trigger`,async()=>{
  const {game,a}=context(MTG,role);const sources=[put(MTG,game,a,'Batch Death'),put(MTG,game,a,'Batch Death')],life=a.life;
  await game.destroyMany(sources);assert.equal(game.pendingTriggers.length,2);await settle(game);assert.equal(a.life,life+4);
 });
 test(`${role}: mass bounce and exile each count as one leave event`,async()=>{
  const {game,a}=context(MTG,role);put(MTG,game,a,'Batch Leave');const creatures=[put(MTG,game,a,'Grizzly Bears'),put(MTG,game,a,'Grizzly Bears')],life=a.life;
  await game.bounceMany(creatures);assert.equal(game.pendingTriggers.length,1);await settle(game);assert.equal(a.life,life+2);
  await game.moveBattlefieldBatch(creatures);await game.exileMany(creatures);assert.equal(game.pendingTriggers.length,1);await settle(game);assert.equal(a.life,life+4);
 });
 test(`${role}: token creation is one simultaneous entry, including different token definitions`,async()=>{
  const {game,a}=context(MTG,role);put(MTG,game,a,'Batch Tokens');const life=a.life;
  await game.makeTokens(['saproling','treasure','saproling'],a);assert.equal(game.pendingTriggers.length,1);await settle(game);assert.equal(a.life,life+2);
  await game.makeTokens('saproling',a,{n:2});assert.equal(game.pendingTriggers.length,1);await settle(game);assert.equal(a.life,life+4);
 });
 test(`${role}: once-each-turn limit remains distinct from batch deduplication`,async()=>{
  const {game,a}=context(MTG,role);put(MTG,game,a,'Limited Batch');const life=a.life;
  for(let i=0;i<2;i++)await game.makeTokens('saproling',a,{n:3});assert.equal(game.pendingTriggers.length,1);await settle(game);assert.equal(a.life,life+2);
  game.turnNo++;await game.makeTokens('saproling',a,{n:3});await settle(game);assert.equal(a.life,life+4);
 });
}
