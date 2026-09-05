import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/modules/command-table.js';

test('focus survives turn changes, falls back after elimination and supports a solo survivor', () => {
  const me = { idx: 0 }, a = { idx: 1 }, b = { idx: 2 }, c = { idx: 3 };
  const game = { players: [me, a, b, c], turnPlayer: c };
  assert.equal(MTG.commandTableFocus(game, me, b.idx, 'main').focused, b);
  b.lost = true;
  const fallback = MTG.commandTableFocus(game, me, b.idx, 'main');
  assert.equal(fallback.focused, a);
  assert.deepEqual(fallback.opponents, [a, c]);
  a.lost = c.lost = true;
  assert.deepEqual(MTG.commandTableFocus(game, me, b.idx, 'main'), { opponents: [], focused: null, showAll: false });
});

test('target/player selection and combat cannot hide a legal opponent behind Focus', () => {
  const me = { idx: 0 }, opponent = { idx: 1 };
  const game = { players: [me, opponent] };
  for (const decision of ['chooseTargets', 'choosePlayer', 'attackers', 'blockers']) {
    assert.equal(MTG.commandTableFocus(game, me, 1, decision).showAll, true, decision);
  }
  for (const decision of ['main', 'priority', 'mulligan', undefined]) {
    assert.equal(MTG.commandTableFocus(game, me, 1, decision).showAll, false, decision);
  }
});

test('focus state is derived without inspecting private zones or changing the game', () => {
  const me = Object.freeze({ idx: 0 });
  const opponent = Object.freeze({ idx: 1,
    get hand() { throw new Error('Private hand accessed'); },
    get library() { throw new Error('Private library accessed'); },
  });
  const game = Object.freeze({ players: Object.freeze([me, opponent]) });
  const first = MTG.commandTableFocus(game, me, 99, 'main');
  const second = MTG.commandTableFocus(game, me, 99, 'main');
  assert.deepEqual(first, second);
  assert.equal(first.focused, opponent);
});
