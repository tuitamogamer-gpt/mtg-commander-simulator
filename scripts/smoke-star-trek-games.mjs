import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {loadEngine} from '../tests/helpers/load-engine.mjs';
import {assertGameStateInvariants, assertRecalculationStable} from '../tests/helpers/game-state-invariants.mjs';
import {precons, sourceDir} from './import-star-trek-precons.mjs';
const baseCommit = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: new URL('../', import.meta.url), encoding: 'utf8'}).trim();
const M = loadEngine(), results = [];
for (const [index, deck] of precons.entries()) {
  if (process.env.PRECON_ONLY && deck.name !== process.env.PRECON_ONLY) continue;
  const opponents = [1, 2, 3].map(n => precons[(index + n) % precons.length].name), seed = 102900 + index;
  console.log('Starting ' + deck.name);
  let game;
  const onEvent = e => {if (process.env.SMOKE_TRACE && e.type === 'turn') console.log(JSON.stringify({deck: deck.name, turn: game?.turnNo, player: e.p?.name, battlefield: game?.battlefield.length, hand: e.p?.hand.length, stack: game?.stack.length}));};
  game = M.newGame({onEvent, humanDeck: deck.name, aiDecks: opponents, aiStyles: ['balanced', 'aggressive', 'opportunist'], difficulty: 'normal', seed, maxTurns: 200, paced: false});
  const started = Date.now(); await game.start();
  assert.ok(game.gameOver && game.winner, deck.name + ': requires a winner');
  assert.ok(game.turnNo < game.maxTurns, deck.name + ': reached artificial turn limit');
  assert.equal((game.aiDecisionLog || []).some(r => r.fallback), false);
  assert.equal(game._decisionFallbacks || 0, 0);
  assert.equal(game.log.filter(r => /AI V2 fallback|fatal|TypeError|ReferenceError/i.test(r.msg)).length, 0);
  assertGameStateInvariants(game); assertRecalculationStable(game);
  const result = {deck: deck.name, opponents, seed, turns: game.turnNo, winner: game.winner.name, durationMs: Date.now() - started, passed: true};
  results.push(result); fs.writeFileSync(sourceDir + '/headless.json', JSON.stringify({baseCommit, results}, null, 2) + '\n'); console.log(JSON.stringify(result));
}
