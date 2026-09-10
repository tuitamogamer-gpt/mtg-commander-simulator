import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadEngine} from '../tests/helpers/load-engine.mjs';
import {auditNativeCatalog} from '../tests/helpers/native-execution-audit.mjs';
import {assertGameStateInvariants,assertRecalculationStable} from '../tests/helpers/game-state-invariants.mjs';
import {buildIntake} from './import-ltc-cmm-precons.mjs';

const M=loadEngine(),intake=buildIntake(M);
const output='output/precon-ltc-cmm-2026-09-10/deep';
fs.mkdirSync(output,{recursive:true});
const write=(name,data)=>fs.writeFileSync(`${output}/${name}.json`,JSON.stringify(data,null,2)+'\n');
if(process.argv.includes('--native')){
  const report=await auditNativeCatalog(M,intake.names);
  write('all-card-execution',report);
  console.log(JSON.stringify(report.counts));
  console.log(JSON.stringify(report.results.filter(r=>r.status!=='runtime-smoke-pass')));
  assert.equal(report.counts['runtime-smoke-pass'],intake.names.length*2);
}else{
  const decks=intake.decks.map(d=>d.name),rows=[];
  // Each imported deck occupies seat zero with four independent shuffled deals:
  // two, three, and four players, including an all-Sliver interaction pod.
  for(let round=0;round<4;round++)for(const [index,name] of decks.entries()){
    const seed=910260+round*100+index;
    const opponents=round===3?['Sliver Swarm','Sliver Swarm','Planeswalker Party']:
      Array.from({length:round+1},(_,i)=>decks[(index+i+1)%decks.length]);
    const started=Date.now();
    console.log(JSON.stringify({starting:name,seed,opponents}));
    const game=M.newGame({humanDeck:name,aiDecks:opponents,aiStyles:opponents.map(()=> 'balanced'),difficulty:'normal',seed,maxTurns:200,paced:false});
    let failure;
    try{
      await game.start();
      assert.ok(game.gameOver&&game.winner,'Game finishes with a winner');
      assert.ok(game.turnNo<200,'No turn-limit result');
      assert.equal(game.pendingTriggers.length,0);
      assert.equal(game.aiDecisionLog?.some(r=>r.fallback)||false,false);
      assert.equal(game._decisionFallbacks||0,0);
      assert.equal(game.log.filter(r=>/AI V2 fallback|fatal|TypeError|ReferenceError/i.test(r.msg)).length,0);
      assertGameStateInvariants(game);assertRecalculationStable(game);
    }catch(error){failure=error.stack;}
    const row={name,seed,opponents,turns:game.turnNo,winner:game.winner?.name,seconds:(Date.now()-started)/1000,passed:!failure,...(failure?{failure}: {})};
    rows.push(row);write('games',{expected:20,passed:rows.filter(r=>r.passed).length,rows});
    console.log(JSON.stringify(row));
  }
  assert.ok(rows.every(r=>r.passed),'All 20 natural games pass');
}
