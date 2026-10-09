import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const MTG=loadEngine();
const decks=['Multiverse Reforged','Quandrix Unlimited','Enduring Enchantments','Peace Offering'];

async function fixture(){
  const game=MTG.newGame({humanDeck:decks[0],aiDecks:decks.slice(1),aiStyles:['balanced','balanced','balanced'],seed:2078951849,paced:false});
  const player=game.players.find(p=>p.deckName==='Quandrix Unlimited');
  game.turnPlayer=player;game.turnNo=16;game.phase='main1';
  await game.move(player.commanders[0],'battlefield',{ctrl:player});
  const passage=player.library.find(c=>c.name==='Fabled Passage');
  await game.move(passage,'battlefield',{ctrl:player});
  for(let i=0;i<3;i++)await game.move(player.library.find(c=>c.name==='Forest'),'battlefield',{ctrl:player});
  game.recalc();
  return {game,player,passage};
}

test('native Fabled Passage activation preserves cost-method receivers through every payment stage',async()=>{
  const {game,player,passage}=await fixture();
  const size=player.library.length;
  const action=game.activatableList(player).find(entry=>entry.card===passage);
  assert.ok(action,'the legal native activation is offered');
  assert.equal(action.ability.cost.additionalCostV20.kind,'v87-global');
  assert.equal(await game.activateAbility(player,action),true);
  assert.equal(passage.zone,'graveyard');
  assert.equal(player.library.length,size-1);
  assert.equal(game.lands(player).length,4);
  assert.equal(game.lands(player).every(card=>!card.tapped),true,'the fetched basic untaps with four lands');
  assert.equal(game.stack.length,0);
  assert.equal(game.pendingTriggers.length,0);
  assert.equal(game._decisionFallbacks||0,0);
  assertGameStateInvariants(game,'native fetch activation');
});

test('native activation rejects an unpaid tax and still pays it after cost-wrapper delegation',async()=>{
  const {game,player,passage}=await fixture();
  const opponent=game.players.find(p=>p!==player);
  const field=new MTG.CardInst(MTG.DEFS['Suppression Field'],opponent);
  field.zone='battlefield';game.battlefield.push(field);
  for(const land of game.lands(player))if(land!==passage)land.tapped=true;
  game.recalc();
  const size=player.library.length;
  assert.equal(game.activatableList(player).some(entry=>entry.card===passage),false);
  assert.equal(passage.zone,'battlefield');
  assert.equal(passage.tapped,false);
  assert.equal(player.library.length,size);
  player.pool.C=2;
  const action=game.activatableList(player).find(entry=>entry.card===passage);
  assert.ok(action);
  assert.equal(await game.activateAbility(player,action),true);
  assert.equal(player.pool.C,0,'the two-mana activation tax is paid');
  assert.equal(passage.zone,'graveyard');
  assert.equal(player.library.length,size-1);
  assert.equal(field.zone,'battlefield');
  assertGameStateInvariants(game,'taxed native fetch activation');
});
