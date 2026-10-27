import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadEngine} from '../tests/helpers/load-engine.mjs';
import {assertGameStateInvariants,assertRecalculationStable} from '../tests/helpers/game-state-invariants.mjs';
import {sourceDir} from './import-odds-and-ends.mjs';
const M=loadEngine(),results=[];
for(const [index,opponents]of [
  ['Wretched Ranks','Tramplesaurus Rex','Calling All Angels'],
  ['Keen Engineering','Reign of Dragons','Multiverse Reforged'],
  ['Hatsune Miku','Mind Seize','Enhanced Evolution'],
].entries()){
  const seed=102700+index;
  for(const name of opponents)assert.ok(M.DECKS[name],name);
  const game=M.newGame({humanDeck:'Odds and Ends',aiDecks:opponents,aiStyles:['balanced','balanced','balanced'],difficulty:'normal',seed,maxTurns:200,paced:false});
  const started=Date.now();await game.start();
  assert.ok(game.gameOver&&game.winner);
  assert.ok(game.turnNo<game.maxTurns);
  assert.equal((game.aiDecisionLog||[]).some(r=>r.fallback),false);
  assert.equal(game._decisionFallbacks||0,0);
  assert.equal(game.log.some(r=>/AI V2 fallback|fatal|TypeError|ReferenceError/i.test(r.msg)),false);
  assertGameStateInvariants(game);assertRecalculationStable(game);
  const result={deck:'Odds and Ends',opponents,seed,turns:game.turnNo,winner:game.winner.name,durationMs:Date.now()-started,passed:true};
  results.push(result);fs.writeFileSync(sourceDir+'/headless.json',JSON.stringify({results},null,2)+'\n');console.log(JSON.stringify(result));
}
