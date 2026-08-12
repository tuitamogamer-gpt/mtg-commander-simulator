import test from 'node:test';
import assert from 'node:assert/strict';
import { priorityGame } from './helpers/load-engine.mjs';

function observePasses(game, seen) {
  game.askPriorityAction = async player => {
    seen.push(player.name);
    return { kind: 'pass' };
  };
}

test('priority poslije akcije počinje od igrača koji je djelovao', async () => {
  const { game, players } = priorityGame();
  const seen = [];
  observePasses(game, seen);
  await game.priorityRound(players[2]);
  assert.deepEqual(seen, ['C', 'D', 'A', 'B']);
});

test('poslije rezolucije stacka aktivni igrač prvi dobija priority', async () => {
  const { game, players } = priorityGame();
  const seen = [];
  observePasses(game, seen);
  game.stack.push({ kind: 'test', name: 'Test spell', ctrl: players[2] });
  game.resolveTop = async () => {
    seen.push('RESOLVE');
    game.stack.pop();
  };
  await game.priorityRound(players[2]);
  assert.deepEqual(seen, ['C', 'D', 'A', 'B', 'RESOLVE', 'A', 'B', 'C', 'D']);
});

test('igrač zadržava priority nakon nove akcije', async () => {
  const { game, players } = priorityGame();
  const seen = [];
  let acted = false;
  game.askPriorityAction = async player => {
    seen.push(player.name);
    if (player === players[2] && !acted) {
      acted = true;
      return { kind: 'test-action' };
    }
    return { kind: 'pass' };
  };
  game.performAction = async player => {
    assert.equal(player, players[2]);
    seen.push('ACTION');
    return true;
  };
  await game.priorityRound(players[2]);
  assert.deepEqual(seen, ['C', 'ACTION', 'C', 'D', 'A', 'B']);
});

test('simultani triggeri se svi stave na stack prije priority kruga', async () => {
  const { game, players } = priorityGame(['Active', 'Next']);
  const decisions = [];
  const noop = async () => {};
  game.pendingTriggers.push(
    { ctrl: players[0], name: 'A1', run: noop },
    { ctrl: players[1], name: 'N1', run: noop },
    { ctrl: players[0], name: 'A2', run: noop },
  );
  const count = await game.flushTriggers();
  assert.equal(count, 3);
  assert.deepEqual(Array.from(game.stack, item => item.name), ['A1', 'A2', 'N1']);
  assert.deepEqual(decisions, []);
});

test('kontrolor bira redoslijed svojih simultanih triggera unutar APNAP grupe', async () => {
  const { game, players } = priorityGame(['Active', 'Next']);
  players[0].controller = {
    decide: async (g, q) => {
      assert.equal(q.type, 'orderTriggers');
      return q.triggers.slice().reverse();
    },
  };
  const noop = async () => {};
  game.pendingTriggers.push(
    { ctrl: players[0], name: 'Prvi', run: noop },
    { ctrl: players[0], name: 'Drugi', run: noop },
    { ctrl: players[1], name: 'NAP', run: noop },
  );
  await game.flushTriggers();
  assert.deepEqual(Array.from(game.stack, item => item.name), ['Drugi', 'Prvi', 'NAP']);
});

test('svaki proglašeni combat čeka ljudski pregled i kad čovjek nije meta', async () => {
  const { game, players } = priorityGame(['Human', 'Attacker', 'Defender']);
  players[1].isAI = true;
  players[2].isAI = true;
  game.paced = true;
  const attacker = { name: 'Test attacker', ctrl: players[1], attacking: players[2] };
  let seen = null;
  players[0].controller = {
    decide: async (g, q) => { seen = q; return null; },
  };

  await game.reviewCombatWithHuman({ attackingPlayer: players[1], attackers: [attacker] });

  assert.equal(seen.type, 'combatReview');
  assert.equal(seen.player, players[0]);
  assert.equal(seen.attackingPlayer, players[1]);
  assert.deepEqual(seen.attackers, [attacker]);
  assert.equal(attacker.attacking, players[2]);
});
