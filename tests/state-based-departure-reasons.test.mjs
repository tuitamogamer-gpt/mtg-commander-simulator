import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeFixture} from './helpers/second-trigger-fixtures.mjs';

async function yurikoFixture() {
  const f = nativeFixture('human', 10112029);
  const yuriko = f.put("Yuriko, the Tiger's Shadow", 'command');
  yuriko.commander = true;
  f.me.commanders.push(yuriko);
  await f.castCard(yuriko, ['Island', 'Swamp', 'Wastes']);
  f.targets = q => q.candidates.includes(yuriko) ? [yuriko] : undefined;
  return Object.assign(f, {yuriko});
}

function assertDeparture(f, card, reason) {
  assert.ok(f.game.log.some(entry => entry.msg === `${card.name} dies (${reason}).`),
    'the public game log explains why the permanent died');
  const event = f.events.find(e => e.type === 'gameEffect' && e.kind === 'zoneMove' &&
    e.cardId === card.iid && e.fromZone === 'battlefield');
  assert.ok(event, 'the departure still produces its ordinary visual event');
  assert.equal(event.reason, reason);
}

test('a commander killed by paid Lightning Bolt reports lethal damage before returning to command', async () => {
  const f = await yurikoFixture();
  await f.cast('Lightning Bolt', ['Mountain']);
  assert.equal(f.yuriko.zone, 'command');
  assertDeparture(f, f.yuriko, 'lethal damage: 3 marked, 3 required');
});

test('paid Dismember reports the toughness that caused Yuriko to die', async () => {
  const f = await yurikoFixture();
  await f.cast('Dismember', ['Swamp', 'Swamp', 'Wastes']);
  assert.equal(f.yuriko.zone, 'command');
  assertDeparture(f, f.yuriko, '-2 toughness');
});

test('damage from a paid deathtouch creature reports the actual cause of death', async () => {
  const f = await yurikoFixture();
  f.game.turnPlayer = f.rival;
  const snake = await f.cast('Sedge Scorpion', ['Forest'], {player: f.rival});
  await f.game.damageAny(snake, f.yuriko, 1, {combat: true});
  await f.game.checkSBA();
  assert.equal(f.yuriko.zone, 'command');
  assertDeparture(f, f.yuriko, 'deathtouch damage');
});

test('the legend rule reports the discarded duplicate without changing the chosen survivor', async () => {
  const f = nativeFixture('human', 10112030);
  const first = await f.cast('Isamaru, Hound of Konda', ['Plains']);
  f.cards = q => q.aiHint?.kind === 'legendKeep' ? [first] : undefined;
  const second = await f.cast('Isamaru, Hound of Konda', ['Plains']);
  assert.equal(first.zone, 'battlefield');
  assert.equal(second.zone, 'graveyard');
  assertDeparture(f, second, 'legend rule');
});
