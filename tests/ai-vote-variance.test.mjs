import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();
const COUNCIL = [
  { key: 'dominion', label: 'Dominion', requiresMajority: true },
  { key: 'guidance', label: 'Guidance' },
];

function fixture(sourceName = 'Galadriel, Elven-Queen') {
  const game = new MTG.Game({ seed: 8173, paced: false });
  const players = ['Council owner', 'Bot A', 'Bot B', 'Bot C'].map((name, index) => {
    const player = game.addPlayer(name, { name: `${name} deck` }, null, index > 0);
    player.controller = index > 0
      ? new MTG.AIController(player, { difficulty: 'normal', style: 'balanced' })
      : { decide: async () => 'dominion' };
    return player;
  });
  game.turnPlayer = players[0];
  game.turnNo = 5;
  game.phase = 'combat';
  MTG.initDiplomacy(game, false);
  const source = new MTG.CardInst(MTG.DEFS[sourceName], players[0]);
  source.zone = 'battlefield';
  source.sick = false;
  game.battlefield.push(source);
  game.recalc();
  const query = (voter, options = COUNCIL, secret = false) => ({
    type: 'chooseOption', prompt: `${source.name}: vote`, options,
    aiHint: { kind: 'vote', src: source, forWhom: players[0], voter, secret, revealedVotes: [] },
  });
  return { game, players, source, query };
}

test('every bot seat and difficulty sometimes votes Dominion while still favoring Guidance', async () => {
  const { game, players, query } = fixture();
  for (const difficulty of ['easy', 'normal', 'hard']) for (const bot of players.slice(1)) {
    let dominion = 0;
    for (let seed = 1; seed <= 96; seed++) {
      const decision = await MTG.chooseBotAction({
        gameState: game, botPlayerId: bot.idx, difficulty, seed, actionWindow: query(bot),
      });
      assert.ok(COUNCIL.some(option => option.key === decision.action.value));
      assert.equal(decision.consideredActions[0].action, 'Choose Guidance', 'the tactical preference remains intact');
      if (decision.action.value === 'dominion') dominion++;
    }
    assert.ok(dominion >= 8 && dominion < 45, `${difficulty}, seat ${bot.idx}: ${dominion}/96 Dominion votes`);
  }
});

test('ballots replay with the same state and seed without consuming gameplay randomness', async () => {
  const { game, players: [, bot], query } = fixture();
  game.rnd = () => { throw new Error('Voting must not advance the gameplay RNG'); };
  const params = { gameState: game, botPlayerId: bot.idx, seed: 27, actionWindow: query(bot) };
  const first = await MTG.chooseBotAction(params);
  const replay = await MTG.chooseBotAction(params);
  assert.equal(first.action.value, replay.action.value);
  assert.equal(first.score, replay.score);
  assert.equal(first.log.seed, replay.log.seed);
  assert.equal(first.log.fallback, false);
});

test('fallback voting shares the seeded choice with the normal controller', async () => {
  const { game, players: [, bot], query } = fixture();
  const outcomes = new Set();
  for (let seed = 1; seed <= 64; seed++) {
    game.opts.seed = seed;
    const q = query(bot);
    const fallback = bot.controller.chooseOption(game, q);
    const normal = await bot.controller.decide(game, q);
    assert.equal(fallback, normal);
    assert.equal(bot.controller.lastV2Decision.log.fallback, false);
    outcomes.add(normal);
  }
  assert.deepEqual([...outcomes].sort(), ['dominion', 'guidance']);
});

test('other public and secret councils also vary without losing their tactical preference', async () => {
  for (const [sourceName, options, preferred, secret] of [
    ['Plea for Power', [{ key: 'time', label: 'Time' }, { key: 'knowledge', label: 'Knowledge' }], 'knowledge', false],
    ['Elrond of the White Council', [{ key: 'fellowship', label: 'Fellowship' }, { key: 'aid', label: 'Aid' }], 'fellowship', true],
  ]) {
    const { game, players: [, bot], query } = fixture(sourceName);
    const counts = new Map(options.map(option => [option.key, 0]));
    for (let seed = 1; seed <= 96; seed++) {
      const decision = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed, actionWindow: query(bot, options, secret) });
      counts.set(decision.action.value, counts.get(decision.action.value) + 1);
    }
    assert.ok([...counts.values()].every(count => count > 0), `${sourceName}: every legal ballot is reachable`);
    assert.ok(counts.get(preferred) > 48, `${sourceName}: the tactical choice remains the most likely`);
  }
});

test('a free four-player council can produce an actual Dominion majority', async () => {
  const { game, players: [owner], source } = fixture();
  let dominionWins = 0;
  for (let seed = 1; seed <= 64; seed++) {
    game.opts.seed = seed;
    const votes = await MTG.E7.vote(game, owner, source, COUNCIL,
      voter => voter === owner ? 'dominion' : 'guidance');
    assert.equal((votes.get('dominion') || 0) + (votes.get('guidance') || 0), 4);
    if (MTG.E7.voteBeats(votes, 'dominion', 'guidance')) dominionWins++;
  }
  assert.ok(dominionWins > 0 && dominionWins < 32, `${dominionWins}/64 councils award Dominion`);
});

test('a promised ballot stays locked even on a seed that would vote the other way', async () => {
  const { game, players: [owner, bot], source, query } = fixture();
  const ordinary = await bot.controller.decide(game, query(bot));
  const promised = ordinary === 'guidance' ? 'dominion' : 'guidance';
  const recorded = [];
  game.diplomacyCampaignForPublicChoice = async () => new Map([[bot.idx, { key: promised, contractId: 'locked-vote' }]]);
  game.diplomacyRecordPublicChoice = (...args) => recorded.push(args);
  bot.controller.decide = () => { throw new Error('A promised vote must bypass the random ballot picker'); };
  const votes = await MTG.E7.vote(game, owner, source, COUNCIL);
  assert.equal(votes['_by_' + bot.idx], promised);
  assert.equal(recorded.length, 1);
  assert.deepEqual(recorded[0], ['locked-vote', bot, promised]);
});
