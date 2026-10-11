import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeFixture} from './helpers/second-trigger-fixtures.mjs';

for (const seat of [0, 1]) {
  test(`Abyssal Persecutor at seat ${seat} protects the opponent through the simultaneous loss check`, async () => {
    const f = nativeFixture('human', 10112031 + seat);
    const controller = f.game.players[seat], opponent = f.game.players[1 - seat];
    f.game.turnPlayer = controller;
    const persecutor = await f.cast('Abyssal Persecutor', ['Swamp', 'Swamp', 'Wastes', 'Wastes'], {player: controller});
    controller.life = opponent.life = 4;
    await f.cast('Flame Rift', ['Mountain', 'Wastes'], {player: controller});
    assert.equal(controller.lost, true);
    assert.equal(persecutor.zone, 'ceased');
    assert.equal(opponent.life, 0);
    assert.equal(opponent.lost, false, 'the opponent could not lose in the same state-based action');
    assert.equal(f.game.winner, opponent, 'all opponents have left, so the protected player wins immediately');
    const endings = f.events.filter(e => e.type === 'gameover');
    assert.equal(endings.length, 1, 'one actual match result is announced');
    assert.equal(endings[0].winner, opponent);
  });
}

test('paid Flame Rift eliminating both players announces one draw without a temporary winner', async () => {
  const f = nativeFixture('human', 10112033);
  f.me.life = f.rival.life = 4;
  await f.cast('Flame Rift', ['Mountain', 'Wastes']);
  assert.equal(f.game.players.every(p => p.lost), true);
  assert.equal(f.game.gameOver, true);
  assert.equal(f.game.winner, null);
  const endings = f.events.filter(e => e.type === 'gameover');
  assert.equal(endings.length, 1, 'a simultaneous draw must not first award an account win');
  assert.equal(endings[0].winner, null);
});

test('paid Flame Rift eliminating only one player retains the ordinary winner', async () => {
  const f = nativeFixture('human', 10112034);
  f.me.life = 5; f.rival.life = 4;
  await f.cast('Flame Rift', ['Mountain', 'Wastes']);
  assert.equal(f.me.life, 1);
  assert.equal(f.me.lost, false);
  assert.equal(f.rival.lost, true);
  assert.equal(f.game.winner, f.me);
  assert.equal(f.events.filter(e => e.type === 'gameover').length, 1);
});

test('losing Humility cannot restore Platinum Angel after its controller is already losing simultaneously', async () => {
  const f = nativeFixture('human', 10112035);
  await f.cast('Humility', ['Plains', 'Plains', 'Wastes', 'Wastes']);
  f.game.turnPlayer = f.rival;
  const angel = await f.cast('Platinum Angel', Array(7).fill('Wastes'), {player: f.rival});
  assert.equal(angel.cur.abilitiesDisabled, true);
  f.game.turnPlayer = f.me;
  f.me.life = f.rival.life = 4;
  await f.cast('Flame Rift', ['Mountain', 'Wastes']);
  assert.equal(f.game.players.every(p => p.lost), true, 'both players were eligible to lose in the pre-action state');
  assert.equal(f.game.winner, null);
  assert.equal(f.events.filter(e => e.type === 'gameover').length, 1);
});

test('a donated Golden Throne can replace its controller\'s simultaneous loss before its owner leaves', async () => {
  const f = nativeFixture('human', 10112036);
  const throne = await f.cast('The Golden Throne', Array(4).fill('Wastes'));
  f.targets = q => q.candidates.includes(throne) ? [throne] : q.candidates.includes(f.rival) ? [f.rival] : undefined;
  await f.cast('Donate', ['Island', 'Wastes', 'Wastes']);
  assert.equal(throne.ctrl, f.rival);
  f.me.life = f.rival.life = 4;
  await f.cast('Flame Rift', ['Mountain', 'Wastes']);
  assert.equal(f.me.lost, true);
  assert.equal(f.rival.lost, false);
  assert.equal(f.rival.life, 1, 'the replacement is chosen before simultaneous departures remove its source');
  assert.equal(f.game.winner, f.rival);
  assert.equal(f.events.filter(e => e.type === 'gameover').length, 1);
});

for (const [name, lands, life] of [
  ['Exquisite Archangel', ['Plains', 'Plains', ...Array(5).fill('Wastes')], 40],
  ["Lich's Mirror", Array(5).fill('Wastes'), 20],
]) {
  test(`donated ${name} replaces simultaneous loss before its owner leaves`, async () => {
    const f = nativeFixture('human', 10112037);
    const source = await f.cast(name, lands);
    f.targets = q => q.candidates.includes(source) ? [source] : q.candidates.includes(f.rival) ? [f.rival] : undefined;
    await f.cast('Donate', ['Island', 'Wastes', 'Wastes']);
    assert.equal(source.ctrl, f.rival);
    f.me.life = f.rival.life = 4;
    await f.cast('Flame Rift', ['Mountain', 'Wastes']);
    assert.equal(f.me.lost, true);
    assert.equal(f.rival.lost, false);
    assert.equal(f.rival.life, life);
    assert.equal(f.game.winner, f.rival);
    assert.equal(f.events.filter(e => e.type === 'gameover').length, 1);
  });
}

test('The Golden Throne cannot replace a concession', async () => {
  const f = nativeFixture('human', 10112038);
  const throne = await f.cast('The Golden Throne', Array(4).fill('Wastes'));
  await f.game.playerLoses(f.me, 'conceded');
  assert.equal(f.me.lost, true);
  assert.equal(throne.zone, 'ceased', 'leaves with the conceding player instead of exiling as a replacement');
  assert.equal(f.game.winner, f.rival);
  assert.equal(f.events.filter(e => e.type === 'gameover').length, 1);
});

for (const survivors of [0, 1, 2]) {
  test(`four-player Flame Rift leaves ${survivors} survivors and only announces an actual final result`, async () => {
    const f = nativeFixture('human', 10112039 + survivors);
    for (let i = 2; i < 4; i++) {
      const player = f.game.addPlayer(`Opponent ${i}`, {name: 'Simultaneous loss audit'}, f.rival.controller, false);
      for (let n = 0; n < 40; n++) f.put('Island', 'library', player);
    }
    for (const player of f.game.players) player.life = player.idx < 4 - survivors ? 4 : 8;
    await f.cast('Flame Rift', ['Mountain', 'Wastes']);
    assert.equal(f.game.alivePlayers().length, survivors);
    const endings = f.events.filter(e => e.type === 'gameover');
    assert.equal(endings.length, survivors <= 1 ? 1 : 0);
    if (survivors <= 1) assert.equal(f.game.winner, survivors ? f.game.players[3] : null);
    else assert.equal(f.game.gameOver, false);
  });
}
