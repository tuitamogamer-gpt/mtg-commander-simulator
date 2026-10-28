import test from 'node:test';
import assert from 'node:assert/strict';
import {M, nativeFixture} from './helpers/second-trigger-fixtures.mjs';

const wire = value => JSON.parse(JSON.stringify(value));

async function damagedBoard() {
  const f = nativeFixture();
  const hawkeye = await f.cast('Hawkeye, Avenging Archer', ['Island', 'Mountain', 'Wastes', 'Wastes']);
  hawkeye.sick = false; // The fixture begins after its summoning-sickness turn.
  const victim = f.put('Colossal Dreadmaw', 'battlefield', f.rival);
  for (let n = 0; n < 8; n++) f.put('Grizzly Bears', 'battlefield', n % 2 ? f.me : f.rival);
  f.targets = q => q.candidates.includes(victim) ? [victim] : undefined;
  await f.activate(hawkeye);
  assert.equal(victim.damage, 1); assert.equal(hawkeye.tapped, true);
  assert.equal(victim.meta._damageFrom.ids.has(hawkeye.iid), true);
  const state = M.captureGameState(f.game);
  assert.ok(state, M.gameStateSnapshotBlockers(f.game).join('; '));
  return {state: wire(state), hawkeyeId: hawkeye.iid, victimId: victim.iid};
}

function restore(state) {
  const f = nativeFixture();
  M.restoreGameState(f.game, wire(state));
  return f;
}

async function wipe(f, name) {
  const p = f.me, spell = f.put(name, 'hand');
  p.pool.R = 9; p.pool.W = 4;
  assert.equal(await f.game.castSpell(p, spell, {from: 'hand'}), true);
  assert.ok(spell.castMeta.manaSpent > 0, 'the wipe pays its actual mana cost');
  await f.settle();
  assert.equal(spell.zone, 'graveyard');
  assert.equal(f.game.creatures().length, 0, 'the populated battlefield clears completely');
}

for (const name of ['Blasphemous Act', 'Chain Reaction', 'Wrath of God']) {
  for (const legacy of [false, true]) {
    test(`${name} after JSON restore preserves Hawkeye damage credit (${legacy ? 'legacy {}' : 'source id array'})`, async () => {
      const {state, hawkeyeId, victimId} = await damagedBoard();
      const record = state.cards.find(c => c.iid === victimId).meta._damageFrom;
      assert.deepEqual(record.ids, [hawkeyeId], 'new saves explicitly encode the Set as source ids');
      if (legacy) record.ids = {};
      const untouched = wire(state), f = restore(state);
      const victim = f.game.byIid(victimId);
      assert.deepEqual(Array.from(victim.meta._damageFrom.ids), [hawkeyeId]);
      assert.equal(typeof victim.meta._damageFrom.ids.add, 'function');
      assert.deepEqual(state, untouched, 'restoring does not mutate the supplied checkpoint');
      const before = f.me.hand.length;
      await wipe(f, name);
      assert.equal(f.me.hand.length, before + 1, 'Hawkeye sees its one damaged enemy die, including when Hawkeye dies simultaneously');
      const again = M.captureGameState(f.game);
      assert.ok(again, 'the completed wipe can be saved again');
      assert.ok(Array.isArray(again.cards.find(c => c.iid === victimId).meta._damageFrom.ids));
    });
  }
}

for (const variant of ['missing history', 'different incarnation', 'earlier turn']) {
  test(`legacy damage metadata resumes safely without invented Hawkeye credit: ${variant}`, async () => {
    const {state, hawkeyeId, victimId} = await damagedBoard();
    const card = state.cards.find(c => c.iid === victimId);
    card.meta._damageFrom.ids = {};
    if (variant === 'missing history') delete state.damageHistory;
    if (variant === 'different incarnation') card.zoneVersion = (card.zoneVersion || 0) + 1;
    if (variant === 'earlier turn') {state.turnNo++; state.damageHistory = null;}
    const f = restore(state), victim = f.game.byIid(victimId);
    assert.equal(victim.meta._damageFrom.ids.has(hawkeyeId), false);
    const before = f.me.hand.length;
    await wipe(f, 'Blasphemous Act');
    assert.equal(f.me.hand.length, before, 'unrecoverable or stale damage never awards a draw');
  });
}
