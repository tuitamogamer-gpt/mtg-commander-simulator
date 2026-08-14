import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function controller(decide) {
  return { decide: async (game, q) => decide ? decide(game, q) : null };
}

function gameWithPod(opts = {}) {
  const events = [];
  const reviews = [];
  const game = new MTG.Game({
    seed: 814500, paced: opts.paced ?? true, maxTurns: 10,
    onEvent: event => events.push(event),
  });
  const human = game.addPlayer('Ti', { name: 'Human' }, controller((g, q) => {
    if (q.type === 'effectReview') reviews.push(q);
    return null;
  }), false);
  const opponents = ['AI Zmaj', 'AI Vuk', 'AI Gavran'].map(name =>
    game.addPlayer(name, { name }, controller(), true));
  game.turnPlayer = human;
  game.turnNo = 8;
  game.phase = 'main1';
  game.step = 'main';
  return { game, human, opponents, events, reviews };
}

function testCreature(owner, overrides = {}) {
  return new MTG.CardInst(Object.assign({
    name: 'Test Creature', cost: '{2}{G}', super: [], types: ['Creature'],
    subtypes: ['Beast'], power: '3', toughness: '3', kws: [], oracle: '',
  }, overrides), owner);
}

test('damage svim protivnicima prvo daje jedan Proceed pregled pa primjenjuje simultanu stetu', async () => {
  const { game, human, opponents, reviews } = gameWithPod();
  const source = testCreature(human, { name: 'Global Pinger' });
  source.ctrl = human;
  source.zone = 'battlefield';
  game.battlefield.push(source);
  game.recalc();

  const total = await game.damageOpponents(source, human, 2);

  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].effectKind, 'damageAllOpponents');
  assert.equal(reviews[0].source, source);
  assert.equal(reviews[0].amount, 2);
  assert.deepEqual(Array.from(reviews[0].targets), opponents);
  assert.deepEqual(opponents.map(player => player.life), [38, 38, 38]);
  assert.equal(total, 6);
});

test('globalni life loss koristi isti Proceed segment i vraca zbir za drain', async () => {
  const { game, human, opponents, reviews } = gameWithPod();
  const source = testCreature(human, { name: 'Global Drainer' });
  source.ctrl = human;

  const total = await game.loseLifeOpponents(source, human, 3, 'test drain');

  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].effectKind, 'lifeLossAllOpponents');
  assert.deepEqual(opponents.map(player => player.life), [37, 37, 37]);
  assert.equal(total, 9);
});

test('Commander i veliki creature ulazak emituju arrival event, mali creature ne', async () => {
  const { game, human, events } = gameWithPod({ paced: false });
  const commander = testCreature(human, { name: 'Small Commander', cost: '{1}{W}', power: '2', toughness: '2' });
  commander.commander = true;
  commander.zone = 'command';
  human.command.push(commander);
  await game.move(commander, 'battlefield', { ctrl: human });

  const powerhouse = testCreature(human, { name: 'Large Beast', cost: '{5}{G}', power: '6', toughness: '6' });
  powerhouse.zone = 'hand';
  human.hand.push(powerhouse);
  await game.move(powerhouse, 'battlefield', { ctrl: human });

  const small = testCreature(human, { name: 'Small Beast' });
  small.zone = 'hand';
  human.hand.push(small);
  await game.move(small, 'battlefield', { ctrl: human });

  const arrivals = events.filter(event => event.type === 'battlefieldArrival');
  assert.deepEqual(arrivals.map(event => [event.card.name, event.kind]), [
    ['Small Commander', 'commander'],
    ['Large Beast', 'powerhouse'],
  ]);
  assert.equal(commander.zone, 'battlefield');
  assert.equal(powerhouse.power, 6);
});
