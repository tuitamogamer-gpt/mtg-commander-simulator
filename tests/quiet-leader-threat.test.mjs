import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

// A player nobody attacks stays at forty while the rest of the table grinds
// each other down. Measured over full games, the winners who had no board at
// all sat BELOW the table's average threat (30.6 against 36.0) while holding a
// twelve-point life lead — the model scored life at 0.08 a point, so being far
// ahead was worth less than one point of threat. Being far ahead is itself a
// public threat, and so is a board that draws cards every turn.

const MTG = loadEngine();

function table(seed = 41) {
  const game = new MTG.Game({ seed, paced: false, maxTurns: 40 });
  const players = ['Watcher', 'Quiet', 'Beater', 'Bystander'].map((name, index) =>
    game.addPlayer(name, { name: `${name} deck` }, { decide: async () => null }, index > 0));
  game.turnPlayer = players[0];
  game.turnNo = 12;
  const put = (owner, name, tapped = false) => {
    const card = new MTG.CardInst(MTG.DEFS[name], owner);
    card.ctrl = owner;
    card.zone = 'battlefield';
    card.sick = false;
    card.tapped = tapped;
    game.battlefield.push(card);
    return card;
  };
  return { game, players, put };
}

const threatOf = (game, observer, target) =>
  MTG.assessPlayerThreat(MTG.createBotPlayerView(game, observer.idx), observer.idx, target.idx);

test('a player far ahead on life is a threat even with an empty board', () => {
  const { game, players, put } = table();
  const [me, quiet, beater, bystander] = players;
  // The quiet player has done nothing visible and has been left alone; the
  // other two have been trading damage.
  quiet.life = 40;
  beater.life = 16;
  bystander.life = 14;
  me.life = 18;
  put(beater, 'Grizzly Bears');
  game.recalc();

  const quietThreat = threatOf(game, me, quiet);
  const beaterThreat = threatOf(game, me, beater);
  assert.ok(quietThreat.lifeLead > 10, `the life lead is seen (${quietThreat.lifeLead})`);
  assert.ok(beaterThreat.lifeLead < 0, `and the player who is behind is not inflated (${beaterThreat.lifeLead})`);
  assert.ok(quietThreat.totalScore > beaterThreat.totalScore,
    `an empty board at forty life outranks a small board at sixteen (${quietThreat.totalScore} vs ${beaterThreat.totalScore})`);
});

test('an equal-life table is unchanged by the life lead', () => {
  const { game, players, put } = table(42);
  const [me, first, second] = players;
  for (const player of players) player.life = 40;
  put(first, 'Grizzly Bears');
  game.recalc();
  assert.equal(threatOf(game, me, first).lifeLead, 0);
  assert.equal(threatOf(game, me, second).lifeLead, 0);
});

test('a real board still outweighs a life lead alone', () => {
  const { game, players, put } = table(43);
  const [me, quiet, beater] = players;
  quiet.life = 40;
  beater.life = 22;
  for (let index = 0; index < 3; index++) put(beater, 'Inferno Titan');
  game.recalc();
  assert.ok(threatOf(game, me, beater).totalScore > threatOf(game, me, quiet).totalScore,
    'three Titans beat an eighteen-point life lead');
});

test('a board that draws every turn counts for more than one that does not', () => {
  const { game, players, put } = table(44);
  const [me, drawer, other] = players;
  put(drawer, 'Archmage Emeritus');
  put(other, 'Murmuring Mystic');
  game.recalc();
  const drawerThreat = threatOf(game, me, drawer);
  const otherThreat = threatOf(game, me, other);
  assert.ok(drawerThreat.engineProgress >= 6,
    `a repeating card-draw permanent is worth an engine plus its draw (${drawerThreat.engineProgress})`);
  assert.ok(drawerThreat.engineProgress > otherThreat.engineProgress,
    `and more than a trigger that makes a token (${drawerThreat.engineProgress} vs ${otherThreat.engineProgress})`);
});

test('a persona that deliberately lets the leader run keeps doing so', async () => {
  const { game, players, put } = table(45);
  const [me, leader, wounded] = players;
  me.isAI = true;
  leader.life = 40;
  wounded.life = 9;
  players[3].life = 40;
  for (let index = 0; index < 3; index++) put(me, 'Grizzly Bears');
  for (let index = 0; index < 3; index++) put(leader, 'Inferno Titan', true);
  game.phase = 'combat';
  game.step = 'attackers';
  game.recalc();

  const decide = async style => {
    me.aiStyle = style;
    me.controller = new MTG.AIController(me, { difficulty: 'normal', style });
    const eligible = game.creatures(me).filter(card => !card.tapped && !card.sick && game.canAttackAtAll(card));
    const decision = await MTG.chooseBotAction({
      gameState: game, botPlayerId: me.idx, difficulty: 'normal',
      actionWindow: { type: 'attackers', player: me, eligible, opponents: me.opponents(game), forced: [] },
    });
    const assignments = MTG.unwrapBotDecisionAction(decision.action) || [];
    return {
      leader: assignments.filter(item => item.target === leader).length,
      wounded: assignments.filter(item => item.target === wounded).length,
    };
  };

  const balanced = await decide('balanced');
  assert.ok(balanced.leader > 0, `a balanced seat goes at the leader (${JSON.stringify(balanced)})`);
  const opportunist = await decide('opportunist');
  assert.ok(opportunist.wounded >= opportunist.leader,
    `the Opportunist still pecks at the wounded instead (${JSON.stringify(opportunist)})`);
});

test('over full games a winner without a board is no longer the least threatening player', { timeout: 900_000 }, async () => {
  const names = Object.keys(MTG.DECKS).filter(name => !MTG.DECKS[name].custom);
  const quietWinner = [], everyoneElse = [];
  for (let index = 0; index < 8; index++) {
    const picks = [0, 1, 2, 3].map(offset => names[(index * 5 + offset * 3) % names.length]);
    const game = MTG.newGame({
      humanDeck: picks[0], aiDecks: picks.slice(1), aiStyles: ['balanced', 'balanced', 'balanced'],
      difficulty: 'normal', seed: 4200 + index, maxTurns: 45, paced: false,
    });
    const samples = [];
    const previous = game.onEvent;
    game.onEvent = event => {
      if (event.type === 'phase' && game.phase === 'main1' && game.turnNo >= 8) {
        const observer = game.players.find(player => player !== game.turnPlayer && !player.lost);
        if (observer) {
          const view = MTG.createBotPlayerView(game, observer.idx);
          samples.push(game.players.filter(player => !player.lost && player !== observer).map(player => ({
            player, threat: MTG.assessPlayerThreat(view, observer.idx, player.idx),
          })));
        }
      }
      return previous && previous(event);
    };
    await game.start();
    if (!game.winner) continue;
    const late = samples.slice(-6).flat();
    const of = who => {
      const rows = late.filter(row => row.player === who);
      return rows.length ? rows.reduce((sum, row) => sum + row.threat.totalScore, 0) / rows.length : null;
    };
    const board = who => {
      const rows = late.filter(row => row.player === who);
      return rows.length ? rows.reduce((sum, row) => sum + row.threat.boardPower, 0) / rows.length : null;
    };
    const winnerScore = of(game.winner);
    if (winnerScore !== null && board(game.winner) < 8) quietWinner.push(winnerScore);
    for (const player of game.players) {
      if (player === game.winner) continue;
      const score = of(player);
      if (score !== null) everyoneElse.push(score);
    }
  }
  const mean = list => list.reduce((sum, value) => sum + value, 0) / Math.max(1, list.length);
  if (!quietWinner.length) return; // no board-less winner in this sample
  assert.ok(mean(quietWinner) > mean(everyoneElse),
    `a winner with no board outranks the rest of the table (${mean(quietWinner).toFixed(1)} vs ${mean(everyoneElse).toFixed(1)}, was 30.6 vs 36.0)`);
});
