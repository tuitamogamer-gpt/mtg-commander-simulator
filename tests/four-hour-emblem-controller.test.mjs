import test from 'node:test';
import assert from 'node:assert/strict';
import {M, table, paidCast, paidAbility, stable} from './helpers/second-audit-combat-fixtures.mjs';

async function torchEmblem(f, {emancipation = false} = {}) {
  f.lands(Array(5).fill('Forest'));
  await paidCast(f, f.a, f.put('Doubling Season', 'hand'));
  if (emancipation) {
    f.lands(Array(6).fill('Mountain'));
    await paidCast(f, f.a, f.put('Fiery Emancipation', 'hand'));
  }
  f.lands(['Mountain', 'Mountain', 'Wastes', 'Wastes']);
  const chandra = await paidCast(f, f.a, f.put('Chandra, Torch of Defiance', 'hand'));
  await paidAbility(f, f.a, chandra, ability => ability.loyalty === -7);
  return {chandra, emblem: f.a.emblems[0]};
}

function assertEmblem(emblem, controller) {
  assert.ok(emblem instanceof M.CardInst, 'use the established generic emblem representation');
  assert.equal(emblem.zone, 'command');
  assert.equal(emblem.owner, controller);
  assert.equal(emblem.ctrl, controller);
  assert.deepEqual(Array.from(emblem.colors), [], 'emblems do not inherit their planeswalker color');
  assert.deepEqual(Array.from(emblem.def.types), [], 'emblems have no card types');
  assert.equal(emblem.is('Planeswalker'), false);
  assert.equal(emblem.is('Creature'), false);
}

test('paid Torch emblem uses its own controller for Fiery Emancipation after Chandra leaves', async () => {
  const f = table();
  const {chandra, emblem} = await torchEmblem(f, {emancipation: true});
  assertEmblem(emblem, f.a);
  const removal = f.put("Hero's Downfall", 'hand');
  f.lands(Array(3).fill('Swamp'));
  f.targets = (_p, q) => q.src === removal ? [chandra] : q.candidates.includes(f.b) ? [f.b] : undefined;
  await paidCast(f, f.a, removal);
  assert.equal(chandra.zone, 'graveyard');
  assert.equal(f.b.life, 25, 'casting the removal triggers fifteen emblem damage');
  f.lands(['Wastes']);
  await paidCast(f, f.a, f.put('Sol Ring', 'hand'));
  assert.equal(f.b.life, 10, 'the independently controlled emblem still deals fifteen');
  assert.equal(emblem.ctrl, f.a);
  assert.ok(f.events.some(row => row.event === 'damageToPlayer' && row.data.src === emblem && row.data.n === 15));
  stable(f, 'Torch controller after source departure');
});

for (const controller of ['creator', 'recipient']) test(`Awakened Inferno emblem applies only its recipient's Fiery Emancipation (${controller} controls it)`, async () => {
  const f = table();
  f.lands(Array(6).fill('Mountain'));
  const chandra = await paidCast(f, f.a, f.put('Chandra, Awakened Inferno', 'hand'));
  await paidAbility(f, f.a, chandra, ability => ability.loyalty === 2);
  const emblem = f.b.emblems[0];
  assertEmblem(emblem, f.b);
  const player = controller === 'creator' ? f.a : f.b;
  f.g.turnPlayer = player;
  f.lands(Array(6).fill('Mountain'), player);
  await paidCast(f, player, f.put('Fiery Emancipation', 'hand', player));
  if (controller === 'recipient') {
    const clone = M.cloneGameForAISimulation(f.g, 10102673);
    const simulated = clone.players[f.b.idx].emblems[0];
    assert.notEqual(simulated, emblem);
    assertEmblem(simulated, clone.players[f.b.idx]);
    assert.notEqual(simulated.ctrl, f.b);
    assert.equal(simulated.source, clone.byIid(chandra.iid));
    assert.notEqual(simulated.source, chandra);
    simulated.meta.probe = true;
    assert.equal(emblem.meta.probe, undefined, 'simulation history must not mutate the live emblem');
  }
  f.g.turnPlayer = f.b;
  await f.g.runTurn();
  assert.equal(f.b.life, controller === 'recipient' ? 37 : 39);
  assert.equal(f.c.life, 40);
  assert.equal(f.d.life, 40);
  stable(f, 'Awakened Inferno recipient controls its emblem');
});

test('paid Torch emblem damage prevented by Swans draws cards for the emblem controller', async () => {
  const f = table();
  const {emblem} = await torchEmblem(f);
  f.g.turnPlayer = f.b;
  f.lands(Array(4).fill('Island'), f.b);
  const swans = await paidCast(f, f.b, f.put('Swans of Bryn Argoll', 'hand', f.b));
  f.g.turnPlayer = f.a;
  f.targets = (_p, q) => q.candidates.includes(swans) ? [swans] : undefined;
  f.lands(['Wastes']);
  const ring = f.put('Sol Ring', 'hand');
  const ownHand = f.a.hand.length, opposingHand = f.b.hand.length;
  await paidCast(f, f.a, ring);
  assert.equal(f.a.hand.length, ownHand - 1 + 5);
  assert.equal(f.b.hand.length, opposingHand);
  assert.equal(swans.damage, 0);
  assert.equal(swans.zone, 'battlefield');
  assert.equal(emblem.ctrl, f.a);
  stable(f, 'Swans draws for emblem controller');
});

test('paid Torch emblem remains colorless for Torbran damage replacement', async () => {
  const f = table();
  f.lands(Array(4).fill('Mountain'));
  await paidCast(f, f.a, f.put('Torbran, Thane of Red Fell', 'hand'));
  const {emblem} = await torchEmblem(f);
  assertEmblem(emblem, f.a);
  f.targets = (_p, q) => q.candidates.includes(f.b) ? [f.b] : undefined;
  f.lands(['Wastes']);
  await paidCast(f, f.a, f.put('Sol Ring', 'hand'));
  assert.equal(f.b.life, 35, 'Torbran does not add two to a colorless emblem');
  stable(f, 'colorless emblem damage');
});
