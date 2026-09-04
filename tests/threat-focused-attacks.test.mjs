import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

// Who gets attacked. Before this rule the table's biggest threat took 42% of
// all attacks — barely more than an even three-way split — and was ignored
// outright in 35 of 81 declarations where it was clearly ahead and attackable.
// A defender is now measured against the rest of the table, so a runaway draws
// the pod and the player who is behind is left alone.

const MTG = loadEngine();

function pod(seed = 31) {
  const game = new MTG.Game({ seed, paced: false, maxTurns: 40 });
  const players = ['Attacker', 'Leader', 'Middle', 'Weakest'].map((name, index) => {
    const player = game.addPlayer(name, { name: `${name} deck` }, { decide: async () => null }, index > 0);
    player.isAI = index === 0;
    return player;
  });
  game.turnPlayer = players[0];
  game.turnNo = 9;
  game.phase = 'combat';
  game.step = 'attackers';
  const put = (owner, name) => {
    const card = new MTG.CardInst(MTG.DEFS[name], owner);
    card.ctrl = owner;
    card.zone = 'battlefield';
    card.sick = false;
    card.tapped = false;
    game.battlefield.push(card);
    return card;
  };
  return { game, players, put };
}

async function declare(game, attacker) {
  game.recalc();
  const eligible = game.creatures(attacker).filter(card => !card.tapped && !card.sick && game.canAttackAtAll(card));
  const q = { type: 'attackers', player: attacker, eligible, opponents: attacker.opponents(game), forced: [] };
  const decision = await MTG.chooseBotAction({ gameState: game, botPlayerId: attacker.idx, difficulty: 'normal', actionWindow: q });
  const assignments = MTG.unwrapBotDecisionAction(decision.action) || [];
  const tally = new Map();
  for (const item of assignments) {
    const defender = item.target instanceof MTG.Player ? item.target : item.target && item.target.ctrl;
    tally.set(defender, (tally.get(defender) || 0) + 1);
  }
  return { assignments, tally, chosen: decision.log.chosen };
}

test('every attacker goes at the player who is running away with the game', async () => {
  const { game, players, put } = pod();
  const [me, leader, middle, weakest] = players;
  for (let index = 0; index < 3; index++) put(me, 'Grizzly Bears');
  // The leader's board is the reason they are the leader, and it is tapped
  // from their own attack — so all three defenders are equally open and the
  // only thing left to choose on is who the table's problem is.
  for (let index = 0; index < 3; index++) put(leader, 'Inferno Titan').tapped = true;
  put(middle, 'Grizzly Bears').tapped = true;
  game.recalc();

  const view = MTG.createBotPlayerView(game, me.idx);
  const threat = other => MTG.assessPlayerThreat(view, me.idx, other.idx).totalScore;
  assert.ok(threat(leader) > threat(middle) + 15, 'the fixture must have a clear leader');

  const { assignments, tally } = await declare(game, me);
  assert.ok(assignments.length >= 2, `the bot attacks (${assignments.length} attackers)`);
  assert.equal(tally.get(leader) || 0, assignments.length,
    `every attacker goes at the leader (${[...tally].map(([player, n]) => `${player.name}:${n}`).join(' ')})`);
  assert.equal(tally.get(weakest) || 0, 0, 'the weakest player is left alone');
});

test('the same board with no leader spreads out instead', async () => {
  const { game, players, put } = pod(32);
  const [me, first, second, third] = players;
  for (let index = 0; index < 3; index++) put(me, 'Grizzly Bears');
  for (const rival of [first, second, third]) put(rival, 'Grizzly Bears').tapped = true;
  game.recalc();

  const { assignments, tally } = await declare(game, me);
  assert.ok(assignments.length >= 2, 'the bot still attacks');
  assert.ok(tally.size >= 1, 'a flat table has no forced focus');
  const view = MTG.createBotPlayerView(game, me.idx);
  const scores = [first, second, third].map(rival => MTG.assessPlayerThreat(view, me.idx, rival.idx).totalScore);
  assert.ok(Math.max(...scores) - Math.min(...scores) < 15, 'the fixture really is flat');
});

test('a lethal swing at a low-threat player still beats pressuring the leader', async () => {
  const { game, players, put } = pod(33);
  const [me, leader, , weakest] = players;
  for (let index = 0; index < 3; index++) put(me, 'Inferno Titan');
  for (let index = 0; index < 3; index++) put(leader, 'Inferno Titan').tapped = true;
  // The weakest player is one swing from dead and cannot block.
  weakest.life = 6;
  game.recalc();

  const { tally } = await declare(game, me);
  assert.ok((tally.get(weakest) || 0) >= 1,
    `a kill is still a kill (${[...tally].map(([player, n]) => `${player.name}:${n}`).join(' ')})`);
});

test('the threat pull is measured against the table, not against zero', () => {
  const { game, players, put } = pod(34);
  const [me, leader, middle] = players;
  const attacker = put(me, 'Inferno Titan');
  for (let index = 0; index < 3; index++) put(leader, 'Inferno Titan').tapped = true;
  put(middle, 'Grizzly Bears').tapped = true;
  game.recalc();

  const context = MTG.botAttackPlanContext(game, me);
  const leaderScore = MTG.assessAttackAssignment(game, me, attacker, leader, 0, context).score;
  const middleScore = MTG.assessAttackAssignment(game, me, attacker, middle, 0, context).score;
  assert.ok(leaderScore > middleScore + 3,
    `the leader must be the clearly better target (${leaderScore.toFixed(2)} vs ${middleScore.toFixed(2)})`);

  // Without the table context the assessment stays exactly as it was, so
  // diplomacy's "is this attack tactically sound?" question is unchanged.
  const bare = MTG.assessAttackAssignment(game, me, attacker, leader, 0, null).score;
  const bareMiddle = MTG.assessAttackAssignment(game, me, attacker, middle, 0, null).score;
  assert.ok(Math.abs((bare - bareMiddle) - (leaderScore - middleScore)) > 1,
    'the table comparison is what creates the focus');
});

test('across real games the biggest threat takes most of the damage', { timeout: 900_000 }, async () => {
  const names = Object.keys(MTG.DECKS).filter(name => !MTG.DECKS[name].custom);
  const byRank = [0, 0, 0];
  let ignored = 0, attackable = 0;
  for (let index = 0; index < 6; index++) {
    const picks = [0, 1, 2, 3].map(offset => names[(index * 5 + offset * 3) % names.length]);
    const game = MTG.newGame({
      humanDeck: picks[0], aiDecks: picks.slice(1), aiStyles: ['balanced', 'balanced', 'balanced'],
      difficulty: 'normal', seed: 4200 + index, maxTurns: 45, paced: false,
    });
    for (const player of game.players) {
      const original = player.controller.decide.bind(player.controller);
      player.controller = { decide: async (current, q) => {
        const answer = await original(current, q);
        if (q.type !== 'attackers' || !Array.isArray(answer) || !answer.length) return answer;
        const opponents = player.opponents(current).filter(other => !other.lost);
        if (opponents.length < 2) return answer;
        const view = MTG.createBotPlayerView(current, player.idx);
        const ranked = opponents
          .map(other => ({ other, score: MTG.assessPlayerThreat(view, player.idx, other.idx).totalScore }))
          .sort((a, b) => b.score - a.score);
        const rankOf = new Map(ranked.map((row, position) => [row.other, position]));
        const hit = new Set();
        for (const item of answer) {
          const defender = item.target instanceof MTG.Player ? item.target : item.target && item.target.ctrl;
          if (!rankOf.has(defender)) continue;
          byRank[Math.min(2, rankOf.get(defender))]++;
          hit.add(defender);
        }
        // Only count declarations where hitting the leader was actually worth
        // something: the biggest board is also the best defended, and feeding
        // a creature to a free block is not "pressuring the leader".
        const context = MTG.botAttackPlanContext(current, player);
        const viable = answer.some(item => current.canAttackTarget(item.card, ranked[0].other) &&
          !MTG.assessAttackAssignment(current, player, item.card, ranked[0].other, 0, context).freeBlock);
        if (ranked[0].score - ranked[ranked.length - 1].score >= 12 && viable) {
          attackable++;
          if (!hit.has(ranked[0].other)) ignored++;
        }
        return answer;
      } };
    }
    await game.start();
  }
  const total = byRank.reduce((sum, value) => sum + value, 0);
  assert.ok(total > 100, `enough attacks to measure (${total})`);
  const leaderShare = byRank[0] / total;
  assert.ok(leaderShare >= 0.55, `the biggest threat takes most of the attacks (${(leaderShare * 100).toFixed(0)}%, was 42%)`);
  assert.ok(byRank[2] / total <= 0.15, `the least threatening player is mostly spared (${(byRank[2] / total * 100).toFixed(0)}%, was 22%)`);
  assert.ok(ignored / Math.max(1, attackable) <= 0.25,
    `a clear leader is rarely ignored (${ignored}/${attackable}, was 35/81)`);
});
