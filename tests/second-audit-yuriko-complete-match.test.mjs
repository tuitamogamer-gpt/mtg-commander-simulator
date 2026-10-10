import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

test('the supplied 100-card Yuriko import completes a native four-player match with recorded natural seats', {timeout: 600_000}, async t => {
  const progress = row => {
    const line = JSON.stringify({...row, utc:new Date().toISOString()});
    if (process.env.YURIKO_PROGRESS_FILE) fs.appendFileSync(process.env.YURIKO_PROGRESS_FILE, line+'\n');
    if (process.env.YURIKO_PROGRESS) console.log(line);
  };
  progress({event:'loading'});
  const M=loadEngine(),commander="Yuriko, the Tiger's Shadow";
  const text=fs.readFileSync(new URL('./fixtures/yuriko-custom-deck.txt',import.meta.url),'utf8');
  const imported=M.importCommanderDeck(text,{name:'Second audit supplied Yuriko',commanders:[commander],register:true});
  assert.equal(imported.ok,true,JSON.stringify(imported.errors));
  assert.equal(imported.summary.inputCards,100);assert.equal(imported.summary.resolvedCards,100);
  const available=Object.keys(M.DECKS).filter(name=>!M.DECKS[name].custom).sort();
  const random=M.mulberry32(101026833),opponents=[];
  while(opponents.length<3){const name=available[Math.floor(random()*available.length)];if(!opponents.includes(name))opponents.push(name);}
  const seed=101026833;
  const game=M.newGame({humanDeck:imported.deck.name,humanCommanders:imported.commanders,aiDecks:opponents,
    aiStyles:['balanced','balanced','balanced'],difficulty:'normal',seed,maxTurns:200,paced:false,
    onEvent:event=>{
      if (event.type==='log' && process.env.YURIKO_TRACE) progress({event:'native-log',message:event.msg,cls:event.cls});
    }});
  const positions=game.players.map(p=>({seat:p.idx+1,deck:p.deckName,isAI:p.isAI}));
  const designated=game.players.find(p=>p.deckName===imported.deck.name);assert.ok(designated);
  assert.ok(designated.command.some(c=>c.name===commander));
  const failures=[];let checkpoints=0;
  game.onTurnCheckpoint=()=>{
    checkpoints++;
    progress({event:'turn',seed,turn:game.turnNo,phase:game.phase,activeSeat:game.turnPlayer ? game.turnPlayer.idx+1 : null,
      lives:game.players.map(p=>({seat:p.idx+1,life:p.life,lost:p.lost,hand:p.hand.length,library:p.library.length}))});
    try{assertGameStateInvariants(game,`Yuriko seed ${seed} turn ${game.turnNo}`);}catch(e){failures.push(e.message);}
  };
  progress({event:'start',seed,positions});
  await game.start();
  assert.equal(game.gameOver,true);assert.ok(game.winner);assert.ok(game.turnNo<game.maxTurns);
  assert.equal(game.pendingTriggers.length,0);
  assert.equal((game.aiDecisionLog||[]).some(row=>row.fallback),false);
  assert.equal(game.log.some(row=>/AI V2 fallback/i.test(row.msg)),false);
  assert.deepEqual(failures,[]);assertGameStateInvariants(game,'completed supplied Yuriko match');
  assert.ok(checkpoints>1);
  const completed={event:'completed',seed,positions,designatedSeat:designated.idx+1,
    turns:game.turnNo,checkpoints,winnerSeat:game.winner.idx+1,winnerDeck:game.winner.deckName,
    survivingSeats:game.alivePlayers().map(p=>p.idx+1)};
  progress(completed);t.diagnostic(JSON.stringify(completed));
});
