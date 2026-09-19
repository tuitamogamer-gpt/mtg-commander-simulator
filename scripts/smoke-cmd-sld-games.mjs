import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadEngine} from '../tests/helpers/load-engine.mjs';
import {assertGameStateInvariants,assertRecalculationStable} from '../tests/helpers/game-state-invariants.mjs';
import {precons,sourceDir} from './import-cmd-sld-precons.mjs';
const M=loadEngine(),results=[];
for(const [index,deck] of precons.entries()){
 console.log('Start '+deck.name);
 const aiDecks=[1,2,3].map(n=>precons[(index+n)%precons.length].name),seed=11081+153+index;
 const game=M.newGame({humanDeck:deck.name,aiDecks,aiStyles:['balanced','balanced','balanced'],difficulty:'normal',seed,maxTurns:200,paced:false});
 await game.start();
 assert.ok(game.gameOver&&game.winner,deck.name+': a winner is required');
 assert.ok(game.turnNo<game.maxTurns,deck.name+': must finish before the artificial limit');
 assert.equal(game.pendingTriggers.length,0);
 assert.equal((game.aiDecisionLog||[]).some(r=>r.fallback),false);
 assert.equal(game._decisionFallbacks||0,0);
 assert.equal(game.log.filter(r=>/AI V2 fallback|fatal|TypeError|ReferenceError/i.test(r.msg)).length,0);
 assertGameStateInvariants(game);assertRecalculationStable(game);
 const result={deck:deck.name,opponents:aiDecks,seed,turns:game.turnNo,winner:game.winner.name,passed:true};
 results.push(result);fs.writeFileSync(sourceDir+'/headless.json',JSON.stringify({results},null,2)+'\n');console.log(JSON.stringify(result));
}
