import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function monarchGame() {
  const events = [];
  const game = new MTG.Game({
    seed: 8202026,
    paced: false,
    maxTurns: 50,
    onEvent: event => events.push(event),
  });
  const controller = { decide: async () => null };
  const players = ['You', 'Opponent 1', 'Opponent 2'].map((name, index) =>
    game.addPlayer(name, { name: `${name} deck` }, controller, index > 0));
  game.turnPlayer = players[0];
  game.turnNo = 9;
  game.phase = 'main1';
  game.step = 'main';
  return { game, players, events };
}

function permanent(game, player, name) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.ctrl = player;
  card.zone = 'battlefield';
  card.sick = false;
  game.battlefield.push(card);
  game.recalc();
  return card;
}

test('becoming Monarch publishes one complete presentation event and persistent timing state', async () => {
  const { game, players: [you], events } = monarchGame();
  const jailer = permanent(game, you, 'Palace Jailer');

  assert.equal(await game.becomeMonarch(you, { source: jailer, reason: 'entered the battlefield' }), true);
  assert.equal(game.monarch, you);
  assert.equal(game.monarchSince.turn, 9);
  assert.equal(game.monarchSince.phase, 'main1');
  assert.equal(game.monarchSince.step, 'main');
  assert.equal(game.monarchSince.reason, 'entered the battlefield');
  assert.equal(game.monarchSince.sourceName, 'Palace Jailer');

  const changed = events.filter(event => event.type === 'monarchChanged');
  assert.equal(changed.length, 1);
  assert.equal(changed[0].player, you);
  assert.equal(changed[0].previous, undefined);
  assert.equal(changed[0].source, jailer);
  assert.equal(changed[0].turn, 9);
  assert.equal(changed[0].phase, 'main1');
  assert.equal(changed[0].step, 'main');

  assert.equal(await game.becomeMonarch(you, { reason: 'duplicate attempt' }), false);
  assert.equal(events.filter(event => event.type === 'monarchChanged').length, 1);
});

test('Grave Venerations ETB uses the visible Monarch event path', async () => {
  const { game, players: [you], events } = monarchGame();
  const venerations = permanent(game, you, 'Grave Venerations');

  await game.emit('etb', { card: venerations, ctrl: you });
  await game.flushTriggers();
  while (game.stack.length) await game.resolveTop();

  assert.equal(game.monarch, you);
  const changed = events.filter(event => event.type === 'monarchChanged');
  assert.equal(changed.length, 1);
  assert.equal(changed[0].source, venerations);
  assert.equal(game.monarchSince.sourceName, 'Grave Venerations');
});

test('combat damage and elimination transfer the crown through the same visible event path', async () => {
  const { game, players: [you, opponent, successor], events } = monarchGame();
  await game.becomeMonarch(you, { reason: 'initial crown' });
  events.length = 0;

  game.phase = 'combat';
  game.step = 'damage';
  const attacker = permanent(game, opponent, 'Willie Lumpkin, Postman');
  await game.damagePlayer(attacker, you, 2, { combat: true, deferSBA: true });

  assert.equal(game.monarch, opponent);
  assert.equal(game.monarchSince.sourceName, 'Willie Lumpkin, Postman');
  assert.equal(game.monarchSince.reason, 'combat damage');
  let changed = events.filter(event => event.type === 'monarchChanged');
  assert.equal(changed.length, 1);
  assert.equal(changed[0].previous, you);
  assert.equal(changed[0].player, opponent);
  assert.equal(changed[0].phase, 'combat');
  assert.equal(changed[0].step, 'damage');

  events.length = 0;
  game.turnPlayer = successor;
  game.phase = 'main2';
  game.step = 'main';
  await game.playerLoses(opponent, 'test elimination');

  assert.equal(game.monarch, successor);
  changed = events.filter(event => event.type === 'monarchChanged');
  assert.equal(changed.length, 1);
  assert.equal(changed[0].previous, opponent);
  assert.equal(changed[0].player, successor);
  assert.match(changed[0].reason, /Opponent 1 was eliminated/);
});
