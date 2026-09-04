import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadEngine } from './load-engine.mjs';
import { assertGameStateInvariants } from './game-state-invariants.mjs';

// This is an opt-in full-game audit, not another copy of the fast npm smoke.
// Every seat uses the production local AI. Shadow simulations are discarded;
// they neither choose the live action nor advance the live RNG.
export function aiIsolationFingerprint(game) {
  const cards = new Set(game.battlefield);
  for (const player of game.players) for (const zone of ['library', 'hand', 'graveyard', 'exile', 'command'])
    for (const card of player[zone]) cards.add(card);
  for (const object of game.stack) if (object.card) cards.add(object.card);
  const seen = new Map();
  const encode = value => {
    if (typeof value === 'function') return '[function]';
    if (!value || typeof value !== 'object') return value;
    if (value === game) return '[game]';
    if (game.players.includes(value)) return { player: value.idx };
    if (cards.has(value)) return { card: value.iid };
    if (seen.has(value)) return { ref: seen.get(value) };
    seen.set(value, seen.size);
    if (Array.isArray(value)) return Array.from(value, encode);
    if (Object.prototype.toString.call(value) === '[object Set]') return Array.from(value, encode);
    if (Object.prototype.toString.call(value) === '[object Map]') return Array.from(value, ([key, val]) => [encode(key), encode(val)]);
    return Object.fromEntries(Object.keys(value).sort().filter(key => typeof value[key] !== 'function').map(key => [key, encode(value[key])]));
  };
  const properties = (object, omit) => Object.fromEntries(Object.keys(object).sort()
    .filter(key => !omit.has(key) && typeof object[key] !== 'function').map(key => [key, encode(object[key])]));
  return JSON.stringify({
    players: game.players.map(player => properties(player, new Set(['controller', 'deck', 'game']))),
    cards: [...cards].map(card => properties(card, new Set(['def', 'faceDownDef', 'isCopyOf']))),
    phase: game.phase, step: game.step, turnNo: game.turnNo, active: game.turnPlayer?.idx,
    effects: encode(game.untilEffects), stack: encode(game.stack), triggers: encode(game.pendingTriggers),
    extraTurns: encode(game.extraTurns), extraPhases: encode(game._additionalPhases),
    nextCardIid: game._nextCardIid, timestamp: game._nextSimulationTimestamp,
  });
}

const increment = (map, key) => { map[key] = (map[key] || 0) + 1; };
const actionLabel = action => `${action.kind}: ${action.card?.name || action.entry?.card?.name || ''}${action.entry?.ability?.label ? ` / ${action.entry.ability.label}` : ''}`;
const answerSummary = (answer, depth = 0) => {
  if (!answer || typeof answer !== 'object') return answer;
  if (answer.iid !== undefined) return `${answer.name}#${answer.iid}`;
  if (answer.kind && ['land','cast','activate','done','pass'].includes(answer.kind)) return actionLabel(answer);
  if (depth > 2) return '[object]';
  if (Array.isArray(answer)) return answer.map(item => answerSummary(item, depth + 1));
  return Object.fromEntries(Object.entries(answer).filter(([key]) => ['top','bottom','key','name','kind','value','amount','W','U','B','R','G','C'].includes(key)).map(([key,value]) => [key, answerSummary(value, depth+1)]));
};

export async function auditAIGame(MTG, options, onProgress = () => {}) {
  let shadowSearch = false, searched = false;
  const record = { ...options, decisions: 0, queries: {}, hints: {}, actions: {}, cardsActed: {}, failures: [], fallbacks: [], probes: [], seats: [], invariants: 0, recentChoices: [] };
  const anomaly = (kind, details) => {
    if (!record.failures.some(row => row.kind === kind && JSON.stringify(row.details) === JSON.stringify(details))) {
      record.failures.push({ kind, details });
      onProgress({ anomaly: { kind, details } });
    }
  };
  const game = MTG.newGame({ ...options, paced: false, maxTurns: 200, onEvent(event) {
    if (event.type === 'aiDecision') {
      if (shadowSearch) return;
      record.decisions++;
      if (event.decision.fallback) record.fallbacks.push({ turn: game.turnNo, player: event.player.idx, decision: event.decision.chosen });
    }
    if (event.type === 'log' && /AI V2 fallback/.test(event.msg)) record.fallbacks.push({ turn: game.turnNo, message: event.msg });
  } });
  const seats = new Map(game.players.map(player => [player.idx, { deck: player.deckName, style: player.aiStyle, actions: {}, queries: 0 }]));
  const checkedPlayers = new Set();
  const checked = label => {
    try { assertGameStateInvariants(game, label); record.invariants++; }
    catch (error) { anomaly('state invariant', error.message); }
  };
  const originalPerform = game.performAction;
  game.performAction = async function (player, action) {
    if (this._simulation) return originalPerform.call(this, player, action);
    if (record.decisions > 15000) throw new Error('More than 15000 AI decisions: possible action loop');
    if (this.turnNo >= 12 && !checkedPlayers.has(player.idx) && ['cast', 'activate'].includes(action.kind)) {
      checkedPlayers.add(player.idx);
      const probe = { turn: this.turnNo, player: player.idx, action: actionLabel(action), battlefield: this.battlefield.length, layers: this.untilEffects.length };
      const before = aiIsolationFingerprint(this);
      const clock = MTG.currentOracleTimestamp();
      try {
        if (!searched) {
          searched = true;
          const savedLog = this.aiDecisionLog;
          shadowSearch = true;
          this.aiDecisionLog = [];
          try {
            const decision = await MTG.chooseBotAction({gameState:this,botPlayerId:player.idx,seed:options.seed,
              difficulty:'normal',forceSearch:true,budgetMs:0});
            probe.search = {chosen:decision.log.chosen,nodes:decision.log.analyzedNodes,depth:decision.log.reachedDepth,fallback:decision.log.fallback};
            if (decision.log.fallback) anomaly('shadow search fallback', probe.search);
          } finally { this.aiDecisionLog = savedLog; shadowSearch = false; }
        }
        const simulation = await MTG.simulateAction(this, action, { playerId: player.idx, seed: options.seed ^ (player.idx + 1) });
        probe.applied = simulation.applied;
        probe.error = simulation.error?.message || null;
        probe.isolated = before === aiIsolationFingerprint(this) && clock === MTG.currentOracleTimestamp();
        if (!probe.applied) anomaly('shadow action rejected', probe);
        if (!probe.isolated) anomaly('shadow live mutation', probe);
        assertGameStateInvariants(simulation.state, `shadow ${probe.action}`);
      } catch (error) { probe.error = error.message; anomaly('shadow exception', probe); }
      record.probes.push(probe);
    }
    const result = await originalPerform.call(this, player, action);
    increment(record.actions, action.kind);
    increment(record.cardsActed, actionLabel(action));
    increment(seats.get(player.idx).actions, action.kind);
    if (result === false) anomaly('live action rejected', { turn: this.turnNo, player: player.idx, action: actionLabel(action), choices: record.recentChoices.slice(-6) });
    checked(`seed ${options.seed} turn ${this.turnNo} ${actionLabel(action)}`);
    return result;
  };
  for (const player of game.players) {
    const originalDecide = player.controller.decide;
    player.controller.decide = async function (state, query) {
      increment(record.queries, query.type);
      if (query.aiHint?.kind || query.aiHint?.goal) increment(record.hints, query.aiHint.kind || query.aiHint.goal);
      seats.get(player.idx).queries++;
      const choice = { turn: state.turnNo, player: player.idx, query: query.type, hint: query.aiHint?.kind || query.aiHint?.goal,
        prompt: query.prompt, min: query.min, max: query.max, candidates: query.from?.length || query.candidates?.length };
      onProgress({ query: choice, battlefield: state.battlefield.length });
      const answer = await originalDecide.call(this, state, query);
      choice.answer = answerSummary(answer);
      record.recentChoices.push(choice);
      if (record.recentChoices.length > 12) record.recentChoices.shift();
      return answer;
    };
  }
  const originalRunTurn = game.runTurn;
  game.runTurn = async function () {
    if (Date.now() - started > 180000) throw new Error('Game exceeded the audit wall-clock budget of 180 seconds');
    onProgress({ turn: this.turnNo, decisions: record.decisions, actions: record.actions, failures: record.failures.length });
    const result = await originalRunTurn.call(this);
    checked(`seed ${options.seed} turn ${this.turnNo} complete`);
    return result;
  };
  const started = Date.now();
  try { await game.start(); }
  catch (error) { anomaly('game exception', { message: error.message, stack: error.stack }); }
  record.milliseconds = Date.now() - started;
  record.turns = game.turnNo;
  record.winner = game.winner?.deckName || null;
  record.gameOver = game.gameOver;
  record.pendingTriggers = game.pendingTriggers.length;
  record.stack = game.stack.length;
  record.seats = [...seats.values()];
  if (!game.gameOver || !game.winner || game.turnNo >= game.maxTurns) anomaly('game did not finish naturally', { turns: game.turnNo, gameOver: game.gameOver, winner: record.winner });
  if (game.pendingTriggers.length) anomaly('pending triggers at finish', game.pendingTriggers.length);
  if (record.fallbacks.length) anomaly('AI fallback', record.fallbacks);
  return record;
}

export async function runAIAudit({ rotations = 3, limit = Infinity, shard = 0, shards = 1, onlySeed = null, minSeed = 0, onGame = () => {}, onProgress = () => {} } = {}) {
  const MTG = loadEngine();
  const decks = Object.keys(MTG.DECKS);
  const styles = Object.keys(MTG.AI_STYLES).filter(key => !MTG.AI_STYLES[key].custom);
  const games = [];
  const offsets = [[5, 11, 17], [7, 13, 23], [8, 16, 25]];
  for (let rotation = 0; rotation < rotations; rotation++) for (let index = 0; index < decks.length; index++) {
    if ((rotation * decks.length + index) % shards !== shard) continue;
    if (games.length >= limit) return games;
    const options = {
      humanDeck: decks[index], aiDecks: offsets[rotation % 3].map(offset => decks[(index + offset) % decks.length]),
      aiStyles: [0, 1, 2].map(seat => styles[(index * 3 + rotation + seat) % styles.length]),
      difficulty: ['normal', 'hard', 'easy'][rotation % 3], seed: 920000 + rotation * 1000 + index,
    };
    if (options.seed < minSeed || onlySeed !== null && options.seed !== onlySeed) continue;
    onProgress({ seed: options.seed, deck: options.humanDeck, starting: true });
    const game = await auditAIGame(MTG, options, progress => onProgress({ seed: options.seed, ...progress }));
    games.push(game);
    await onGame(game, games.length);
  }
  return games;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const value = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
  const output = value('--output', '/private/tmp/ai-adversarial-games.json');
  const games = await runAIAudit({ limit: Number(value('--limit', Infinity)), rotations: Number(value('--rotations', 3)), shard: Number(value('--shard', 0)), shards: Number(value('--shards', 1)), onlySeed: args.includes('--seed') ? Number(value('--seed')) : null, minSeed: Number(value('--min-seed', 0)), onProgress: progress => {
    if (args.includes('--progress') || progress.anomaly) console.log(JSON.stringify(progress));
  }, onGame(game, count) {
    fs.appendFileSync(`${output}.jsonl`, `${JSON.stringify(game)}\n`);
    console.log(JSON.stringify({ game: count, deck: game.humanDeck, seed: game.seed, turns: game.turns, winner: game.winner, decisions: game.decisions, failures: game.failures.length, probes: game.probes.length }));
  } });
  const summary = {
    games: games.length, definitions: Object.keys(loadEngine().DEFS).length,
    decisions: games.reduce((n, game) => n + game.decisions, 0),
    probes: games.reduce((n, game) => n + game.probes.length, 0),
    invariants: games.reduce((n, game) => n + game.invariants, 0),
    failedGames: games.filter(game => game.failures.length).length,
    anomalies: games.flatMap(game => game.failures.map(failure => ({ seed: game.seed, ...failure }))),
  };
  fs.writeFileSync(output, `${JSON.stringify({ summary, games }, null, 2)}\n`);
  console.log(JSON.stringify(summary));
  if (summary.failedGames) process.exitCode = 1;
}
