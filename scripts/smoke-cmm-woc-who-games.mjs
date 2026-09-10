import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadEngine} from '../tests/helpers/load-engine.mjs';
import {assertGameStateInvariants,assertRecalculationStable} from '../tests/helpers/game-state-invariants.mjs';
const M=loadEngine(),decks=Object.keys(M.DECKS),newDecks=JSON.parse(fs.readFileSync('reports/decks/precon-cmm-woc-who-2026-09-10/decklists.json')).decks.map(d=>d.name),selected=process.argv.includes('--affected-opponents')?decks.filter((name,index)=>[0,1,2,3].some(offset=>newDecks.includes(decks[(index+offset)%decks.length]))):newDecks,rows=[];
const resultFile='output/precon-cmm-woc-who-2026-09-10/'+(process.argv.includes('--affected-opponents')?'final-affected-games.json':'final-deck-games.json');
for(const name of selected.filter(n=>!process.env.PRECON_ONLY||n===process.env.PRECON_ONLY)){const index=decks.indexOf(name);assert.ok(index>=0);const opponents=[1,2,3].map(offset=>decks[(index+offset)%decks.length]),seed=11081+index;
 console.log('Starting',name,seed);const game=M.newGame({humanDeck:name,aiDecks:opponents,aiStyles:['balanced','balanced','balanced'],difficulty:'normal',seed,maxTurns:200,paced:false});await game.start();
 const errors=game.log.filter(r=>/AI V2 fallback|fatal|TypeError|ReferenceError/i.test(r.msg));if(errors.length)console.log(JSON.stringify(errors));
 assert.ok(game.gameOver&&game.winner);assert.ok(game.turnNo<200);assert.equal(game.pendingTriggers.length,0);assert.equal(game.log.filter(r=>/AI V2 fallback|fatal|TypeError|ReferenceError/i.test(r.msg)).length,0);assert.equal(game.aiDecisionLog?.some(row=>row.fallback)||false,false);assert.equal(game._decisionFallbacks||0,0);assertGameStateInvariants(game);assertRecalculationStable(game);
 const row={name,opponents,seed,turns:game.turnNo,winner:game.winner.name,passed:true};rows.push(row);console.log(JSON.stringify(row));fs.writeFileSync(resultFile,JSON.stringify({passed:rows.length,expected:selected.length,rows},null,2)+'\n');
}
