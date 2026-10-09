import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';
import {aiIsolationFingerprint} from './helpers/run-ai-adversarial-games.mjs';

const MTG=loadEngine();
const decks=['Multiverse Reforged','Quandrix Unlimited','Enduring Enchantments','Peace Offering'];

async function fixture(){
  const game=MTG.newGame({humanDeck:decks[0],aiDecks:decks.slice(1),aiStyles:['balanced','balanced','balanced'],seed:2078951849,paced:true});
  game.speedFactor=0;
  const player=game.players.find(p=>p.deckName===decks[0]);
  game.turnPlayer=player;game.phase='upkeep';game.turnNo=56;
  const angel=player.library.find(c=>c.name==='Darksteel Angel');
  const spell=player.library.find(c=>c.name==='Synthetic Destiny');
  await game.move(angel,'battlefield',{ctrl:player});
  await game.move(spell,'hand');
  player.life=-37;player.pool.U=4;player.pool.C=8;
  for(const opponent of game.players.filter(p=>p!==player)){
    const creature=new MTG.CardInst(MTG.DEFS['Colossal Dreadmaw'],opponent);
    creature.zone='battlefield';creature.sick=false;game.battlefield.push(creature);
  }
  game.recalc();
  game._prioritySessionActive=true;game._priorityRestart=player;
  game.priorityState={holder:player,consecutivePasses:0,neededPasses:4};
  return {game,player,angel,spell};
}

for(const depth of [0,1])test(`response simulation settles self-exile and sees loss independently of live resolution depth ${depth}`,async()=>{
  const {game,player,angel,spell}=await fixture();
  game._stackResolutionDepth=depth;
  const before=aiIsolationFingerprint(game),clock=MTG.currentOracleTimestamp();
  const priority=game.priorityState;
  const simulation=await MTG.simulateAction(game,{kind:'cast',card:spell,from:'hand'},{playerId:player.idx,seed:676300948});
  assert.equal(simulation.applied,true);
  assert.equal(simulation.error,null);
  assert.equal(simulation.state.players.find(p=>p.idx===player.idx).lost,true,'removing the only loss-prevention source is lethal');
  assert.equal(simulation.state.stack.length,0,'the response spell actually resolved');
  assert.equal(simulation.state.pendingTriggers.length,0);
  assert.equal(simulation.view.players.find(p=>p.id===player.idx).lost,true);
  assert.equal(game._prioritySessionActive,true);
  assert.equal(game._priorityRestart,player);
  assert.equal(game.priorityState,priority);
  assert.equal(game._stackResolutionDepth,depth);
  assert.equal(player.lost,false);
  assert.equal(angel.zone,'battlefield');
  assert.equal(spell.zone,'hand');
  assert.equal(aiIsolationFingerprint(game),before);
  assert.equal(MTG.currentOracleTimestamp(),clock);
  assertGameStateInvariants(simulation.state,'resolved response snapshot');
});

test('self-only exile scores its own affected set and the native bot preserves its survival source',async()=>{
  const {game,player,angel,spell}=await fixture();
  const impact=MTG.botBoardWipeImpact(game,player,{kind:'cast',card:spell,from:'hand'});
  assert.ok(impact);
  assert.equal(impact.removes(angel),true,'exile includes the indestructible source');
  assert.equal(impact.mineLoss>0,true);
  assert.equal(impact.theirsLoss,0,'opposing creatures are outside the printed scope');
  assert.equal(game.creatures(game.players.find(p=>p!==player)).every(c=>!impact.removes(c)),true);
  const before=aiIsolationFingerprint(game);
  const query={type:'priority',player,casts:[{card:spell,from:'hand'}],acts:[],stack:game.stack,phase:game.phase};
  const choice=await MTG.chooseBotAction({gameState:game,botPlayerId:player.idx,actionWindow:query,difficulty:'normal',seed:676300948,forceSearch:true,budgetMs:0});
  assert.equal(choice.action.kind,'pass');
  assert.ok(choice.log.analyzedNodes>0);
  const rejected=choice.consideredActions.find(row=>row.action==='Cast Synthetic Destiny');
  assert.ok(rejected);
  assert.ok(rejected.score<choice.score);
  assert.ok(rejected.scoreBreakdown.threat<0);
  assert.equal(aiIsolationFingerprint(game),before);
  assert.equal(game._prioritySessionActive,true);
  assert.equal(player.lost,false);
});
