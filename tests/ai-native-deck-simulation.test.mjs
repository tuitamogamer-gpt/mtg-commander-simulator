import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const MTG=loadEngine();
const decks=['Multiverse Reforged','Quandrix Unlimited','Enduring Enchantments','Peace Offering'];

function fixture(){
  const game=MTG.newGame({humanDeck:decks[0],aiDecks:decks.slice(1),aiStyles:['balanced','balanced','balanced'],seed:2078951849,paced:true});
  game.speedFactor=0;
  const player=game.players.find(p=>p.deckName===decks[0]);
  game.turnPlayer=player;game.turnNo=1;game.phase='main1';
  return {game,player};
}

function addPermanent(game,player,name){
  const card=new MTG.CardInst(MTG.DEFS[name],player);
  card.zone='battlefield';game.battlefield.push(card);
  return card;
}

test('full AI search plays a native built-deck land and leaves live definitions independent',async()=>{
  const {game,player}=fixture();
  const land=player.library.find(c=>c.name==='Caves of Koilos');
  assert.ok(land);
  await game.move(land,'hand');
  const definition=land.def,clock=MTG.currentOracleTimestamp();
  const query={type:'main',player,casts:game.castableList(player),acts:game.activatableList(player),lands:game.playableLands(player),phase:game.phase};
  const choice=await MTG.chooseBotAction({gameState:game,botPlayerId:player.idx,actionWindow:query,difficulty:'normal',seed:196981619,forceSearch:true,budgetMs:0});
  assert.equal(choice.action.kind,'land');
  assert.ok(choice.log.analyzedNodes>0);
  const simulation=await MTG.simulateAction(game,choice.action,{playerId:player.idx,seed:196981619});
  assert.equal(simulation.applied,true);
  assert.equal(simulation.error,null);
  assertGameStateInvariants(simulation.state,'native deck simulation');
  const cloned=simulation.state.byIid(land.iid);
  assert.equal(cloned.zone,'battlefield');
  assert.equal(land.zone,'hand');
  assert.notEqual(cloned.owner,land.owner);
  assert.notEqual(Object.getOwnPropertyDescriptor(cloned,'def').get,Object.getOwnPropertyDescriptor(land,'def').get);
  cloned.def={...cloned.def,name:'Simulation-only land'};
  assert.equal(land.def,definition);
  assert.equal(land.name,'Caves of Koilos');
  assert.equal(MTG.currentOracleTimestamp(),clock);
  const nested=MTG.cloneGameForAISimulation(simulation.state,55);
  nested.byIid(land.iid).def={...cloned.def,name:'Nested-only land'};
  assert.equal(cloned.name,'Simulation-only land');
  assert.equal(land.name,'Caves of Koilos');
});

test('native simulation rebuilds Rootpath library definitions against cloned zones and sources',async()=>{
  const {game,player}=fixture();
  const land=player.library.find(c=>c.name==='Caves of Koilos');
  const purifier=addPermanent(game,player,'Rootpath Purifier');game.recalc();
  assert.equal(land.def.super.includes('Basic'),true);
  const clone=MTG.cloneGameForAISimulation(game,55),cloned=clone.byIid(land.iid);
  assert.equal(cloned.def.super.includes('Basic'),true);
  await clone.move(cloned,'hand');
  assert.equal(cloned.def.super.includes('Basic'),false);
  assert.equal(land.zone,'library');
  assert.equal(land.def.super.includes('Basic'),true);
  await clone.move(cloned,'library');
  assert.equal(cloned.def.super.includes('Basic'),true);
  await clone.move(clone.byIid(purifier.iid),'graveyard');
  assert.equal(cloned.def.super.includes('Basic'),false);
  assert.equal(purifier.zone,'battlefield');
  assert.equal(land.def.super.includes('Basic'),true);
  assertGameStateInvariants(clone,'Rootpath simulation');
});

test('native simulation restores graveyard abilities from its own underlying definition',async()=>{
  const {game,player}=fixture();
  const ring=player.library.find(c=>c.name==='Sol Ring');
  const original=ring.def;
  addPermanent(game,player,'Yixlid Jailer');
  await game.move(ring,'graveyard');
  assert.equal(ring.def.mana.length,0);
  const clone=MTG.cloneGameForAISimulation(game,55),cloned=clone.byIid(ring.iid);
  assert.equal(cloned.def.mana.length,0);
  await clone.move(cloned,'hand');
  assert.equal(cloned.def,original);
  assert.equal(ring.zone,'graveyard');
  assert.equal(ring.def.mana.length,0);
  await clone.move(cloned,'graveyard');
  assert.equal(cloned.def.mana.length,0);
  assertGameStateInvariants(clone,'graveyard definition simulation');
});

test('snapshot card facades inherit cloned identities without writing the live definition',()=>{
  const {game,player}=fixture();
  const card=player.library.find(c=>c.name==='Caves of Koilos'),definition=card.def;
  const facade=Object.create(card);
  Object.defineProperty(facade,'def',{value:{...definition,name:'Snapshot land'},writable:true,configurable:true,enumerable:true});
  game.untilEffects.push({kind:'snapshot-facade',sourceCard:facade});
  const clone=MTG.cloneGameForAISimulation(game,55);
  const cloned=clone.byIid(card.iid),clonedFacade=clone.untilEffects[0].sourceCard;
  assert.equal(Object.getPrototypeOf(clonedFacade),cloned);
  assert.equal(clonedFacade.owner.game,clone);
  assert.equal(clonedFacade.name,'Snapshot land');
  assert.equal(card.def,definition);
  assert.equal(cloned.def,definition);
  clonedFacade.def={...definition,name:'Updated snapshot'};
  assert.equal(cloned.def,definition);
  assert.equal(card.def,definition);
  // The live facade setter must also create its own definition.
  const inherited=Object.create(card);
  inherited.def={...definition,name:'Another facade'};
  assert.equal(inherited.name,'Another facade');
  assert.equal(card.def,definition);
});
