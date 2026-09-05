import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

function recoveryGame() {
  const MTG = loadEngine();
  const game = new MTG.Game({ seed: 827, paced: false, maxTurns: 10 });
  const controller = { decide: async () => ({ kind: 'done' }) };
  const host = game.addPlayer('Host', { name: 'Host deck' }, controller, false);
  const guest = game.addPlayer('Guest', { name: 'Guest deck' }, controller, false);
  const bot = game.addPlayer('Bot', { name: 'Bot deck' }, controller, true);
  host.onlineSeat = 0; guest.onlineSeat = 1; bot.onlineSeat = 2;
  return { MTG, game, host, guest, bot };
}

function putCard(MTG, game, owner, name, zone, controller = owner) {
  const card = new MTG.CardInst(MTG.DEFS[name], owner);
  card.zone = zone;
  card.ctrl = controller;
  if (zone === 'battlefield') game.battlefield.push(card);
  else owner[zone].push(card);
  game.recalc();
  return card;
}

test('Last Resort applies exact public-state corrections without normal rules triggers', () => {
  const { MTG, game, host, guest } = recoveryGame();
  const ring = putCard(MTG, game, host, 'Sol Ring', 'battlefield');
  const signet = putCard(MTG, game, host, 'Arcane Signet', 'battlefield');
  const exiled = putCard(MTG, game, guest, 'Swords to Plowshares', 'exile');

  game.applyLastResortAction(host, { type: 'setLife', playerSeat: 1, value: 17 });
  game.applyLastResortAction(host, { type: 'setMana', playerSeat: 1, color: 'U', value: 4 });
  game.applyLastResortAction(host, { type: 'setCounter', cardToken: `c:${ring.iid}`, counter: 'charge', value: 3 });
  game.applyLastResortAction(host, { type: 'setTapped', cardToken: `c:${ring.iid}`, value: true });
  game.applyLastResortAction(host, { type: 'reorder', cardToken: `c:${signet.iid}`, direction: -1 });
  game.applyLastResortAction(host, { type: 'setController', cardToken: `c:${ring.iid}`, playerSeat: 1 });
  game.applyLastResortAction(host, { type: 'moveCard', cardToken: `c:${exiled.iid}`, toZone: 'battlefield', playerSeat: 1 });

  assert.equal(guest.life, 17);
  assert.equal(guest.pool.U, 4);
  assert.equal(ring.counters.charge, 3);
  assert.equal(ring.tapped, true);
  assert.equal(game.battlefield.indexOf(signet) < game.battlefield.indexOf(ring), true);
  assert.equal(ring.ctrl, guest);
  assert.equal(exiled.zone, 'battlefield');
  assert.equal(exiled.ctrl, guest);
  assert.equal(game.pendingTriggers.length, 0);
  assert.match(game.log.at(-1).msg, /LAST RESORT/);
});

test('Last Resort can add recovery tokens and known permanents directly', () => {
  const { game, host, guest } = recoveryGame();
  game.applyLastResortAction(host, { type: 'createToken', playerSeat: 1, tokenKey: 'treasure', count: 2 });
  game.applyLastResortAction(host, { type: 'createToken', playerSeat: 1, count: 1, custom: { name: 'Bug Fixer', power: 4, toughness: 4, keywords: ['flying'] } });
  game.applyLastResortAction(host, { type: 'addPermanent', playerSeat: 1, name: 'Sol Ring' });

  const cards = game.battlefield.filter(card => card.ctrl === guest);
  assert.equal(cards.filter(card => card.name === 'Treasure Token' && card.isToken).length, 2);
  assert.equal(cards.find(card => card.name === 'Bug Fixer').kw('flying'), true);
  assert.equal(cards.find(card => card.name === 'Sol Ring').isToken, false);
  assert.equal(guest.turnState.tokensCreated, 0);
  assert.equal(game.pendingTriggers.length, 0);
});

test('Last Resort never exposes or accepts another player hidden hand or face-down exile card', () => {
  const { MTG, game, host, guest } = recoveryGame();
  const hand = putCard(MTG, game, guest, 'Sol Ring', 'hand');
  const foretold = putCard(MTG, game, guest, 'Swords to Plowshares', 'exile');
  foretold.faceDown = true;

  assert.equal(game.lastResortCardVisibleTo(hand, host), false);
  assert.equal(game.lastResortCardVisibleTo(foretold, host), false);
  assert.equal(game.lastResortCardVisibleTo(hand, guest), true);
  assert.equal(game.lastResortCardVisibleTo(foretold, guest), true);
  assert.throws(() => game.applyLastResortAction(host, {
    type: 'moveCard', cardToken: `c:${hand.iid}`, toZone: 'battlefield', playerSeat: 0,
  }), /hidden/);
  assert.throws(() => game.applyLastResortAction(host, {
    type: 'moveCard', cardToken: `c:${foretold.iid}`, toZone: 'battlefield', playerSeat: 0,
  }), /hidden/);
});

test('Last Resort pause releases the engine only when recovery mode ends', async () => {
  const { game } = recoveryGame();
  game.setLastResortPaused(true);
  let released = false;
  const waiting = game.waitForLastResort().then(() => { released = true; });
  await Promise.resolve();
  assert.equal(released, false);
  game.setLastResortPaused(false);
  await waiting;
  assert.equal(released, true);
});
