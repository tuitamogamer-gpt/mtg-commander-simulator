// Three reproducible four-deck batches: node scripts/stress-star-trek-games.mjs 0
// Run batches 0, 1 and 2 for twelve games. Filter/select a case with:
// PRECON_ONLY='Federation Fleet' SEED=102911 VARIANT=final node scripts/stress-star-trek-games.mjs 0
// Optional: SEED_BASE (default 102910), OUT_DIR, RESULT_PREFIX; outputs are ignored.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {loadEngine} from '../tests/helpers/load-engine.mjs';
import {assertGameStateInvariants, assertRecalculationStable} from '../tests/helpers/game-state-invariants.mjs';
import {precons} from './import-star-trek-precons.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
const batch = Number(process.argv[2] ?? process.env.BATCH ?? 0);
assert.ok(Number.isInteger(batch) && batch >= 0 && batch < 3, 'batch must be 0, 1 or 2');
const variant = process.env.VARIANT || 'working-tree';
const prefix = process.env.RESULT_PREFIX ?? (process.env.VARIANT ? variant + '-' : '');
assert.ok(!/[\\/]/.test(prefix), 'result prefix must be a filename prefix');
const out = path.resolve(repo, process.env.OUT_DIR || 'output/star-trek-stress');
fs.mkdirSync(out, {recursive: true});
const selection = process.env.PRECON_ONLY?.split('|');
if (selection) for (const name of selection) assert.ok(precons.some(deck => deck.name === name), 'unknown precon: ' + name);
const seedBase = Number(process.env.SEED_BASE ?? 102910);
const forcedSeed = process.env.SEED === undefined ? null : Number(process.env.SEED);
for (const seed of [seedBase, forcedSeed].filter(value => value !== null)) assert.ok(Number.isSafeInteger(seed) && seed >= 0 && seed <= 0xffffffff, 'seed must be an unsigned 32-bit integer');
if (forcedSeed !== null) assert.equal(selection?.length, 1, 'SEED requires exactly one PRECON_ONLY deck');
const baseCommit = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: repo, encoding: 'utf8'}).trim();
const runtimeChanges = execFileSync('git', ['diff', 'HEAD', '--name-only', '--', 'src'], {cwd: repo, encoding: 'utf8'}).trim().split('\n').filter(Boolean).map(file => ({
  path: file, sha256: createHash('sha256').update(fs.readFileSync(path.join(repo, file))).digest('hex'),
}));
const results = [], metadata = {baseCommit, variant, batch, seedBase, runtimeChanges};
const resultPath = path.join(out, `${prefix}games-batch-${batch}.json`);
const writeResults = () => fs.writeFileSync(resultPath, JSON.stringify({...metadata, results}, null, 2) + '\n');
writeResults();
const M = loadEngine();
for (const [index, deck] of precons.entries()) {
  if (selection && !selection.includes(deck.name)) continue;
  const offsets = [[1, 2, 3], [3, 1, 2], [2, 3, 1]][batch];
  const opponents = offsets.map(offset => precons[(index + offset) % precons.length].name);
  const styles = [['balanced', 'aggressive', 'opportunist'], ['opportunist', 'balanced', 'aggressive'], ['aggressive', 'opportunist', 'balanced']][batch];
  const seed = forcedSeed ?? seedBase + batch * 10 + index;
  const seenBattlefield = new Set(), playedCards = new Set(), turnTimings = [];
  let game, checkedTurns = 0;
  const onEvent = event => {
    if (event.type === 'cardPlayed' && event.card?.name) playedCards.add(event.card.name);
    if (event.type === 'turn') console.log(JSON.stringify({progress: true, deck: deck.name, seed, turn: game?.turnNo, player: event.p?.name, at: new Date().toISOString(), battlefield: game?.battlefield.length, stack: game?.stack.length}));
  };
  game = M.newGame({onEvent, humanDeck: deck.name, aiDecks: opponents, aiStyles: styles, difficulty: 'normal', seed, maxTurns: 200, paced: false});
  const runTurn = game.runTurn;
  game.runTurn = async function() {
    const started = Date.now(), result = await runTurn.call(this);
    assertGameStateInvariants(this, `${deck.name} seed ${seed} turn ${this.turnNo}`);
    assertRecalculationStable(this, `${deck.name} seed ${seed} turn ${this.turnNo}`);
    for (const card of this.battlefield) seenBattlefield.add(card.name);
    checkedTurns++;
    turnTimings.push({turn: this.turnNo, durationMs: Date.now() - started, battlefield: this.battlefield.length});
    return result;
  };
  const started = Date.now();
  try {
    await game.start();
    assert.ok(game.gameOver && game.winner, deck.name + ': requires a winner');
    assert.ok(game.turnNo < game.maxTurns, deck.name + ': reached artificial turn limit');
    assert.equal((game.aiDecisionLog || []).some(row => row.fallback), false, 'AI decision fallback');
    assert.equal(game._decisionFallbacks || 0, 0, 'decision fallback');
    assert.equal(game.log.filter(row => /AI V2 fallback|fatal|TypeError|ReferenceError/i.test(row.msg)).length, 0, 'error log');
    assertGameStateInvariants(game); assertRecalculationStable(game);
    const result = {deck: deck.name, opponents, styles, seed, turns: game.turnNo, checkedTurns, winner: game.winner.name, winningDeck: game.winner.deck?.name, durationMs: Date.now() - started, turnTimings, seenBattlefield: [...seenBattlefield].sort(), playedCards: [...playedCards].sort(), passed: true};
    results.push(result);
    console.log(JSON.stringify({...result, turnTimings: undefined, seenBattlefield: seenBattlefield.size, playedCards: playedCards.size}));
  } catch (error) {
    const result = {deck: deck.name, opponents, styles, seed, turns: game.turnNo, checkedTurns, durationMs: Date.now() - started, passed: false, error: error.stack};
    results.push(result);
    fs.writeFileSync(path.join(out, `${prefix}failure-${seed}.log`), game.log.map(row => JSON.stringify(row)).join('\n'));
    console.error(JSON.stringify(result));
  }
  writeResults();
}
process.exitCode = results.some(row => !row.passed) ? 1 : 0;
