import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {loadEngine} from './helpers/load-engine.mjs';
import {context, put, settle} from './helpers/oracle-v8-fixtures.mjs';

const M = loadEngine();
const reportPath = new URL('../reports/oracle-import/batch-0167.json', import.meta.url);
const source = JSON.parse(readFileSync(reportPath)).cards.find(row => row.raw.name === 'Orcish Mine');
const stored = JSON.stringify(source.implementation);
const total = player => Object.values(player.pool).reduce((sum, value) => sum + value, 0);
function fixture(role) {
  const f = context(M, role, 2);
  for (const player of f.game.players) if (!player.isAI) {
    const decide = player.controller.decide.bind(player.controller);
    player.controller.decide = (game, query) => query.type === 'chooseTargets' && query.quickTarget
      ? [query.quickTarget] : decide(game, query);
  }
  return f;
}
async function cast(f, name, player = f.a, targets = []) {
  for (const color of ['W', 'U', 'B', 'R', 'G', 'C']) player.pool[color] = 30;
  const card = put(M, f.game, player, name, 'hand'), before = total(player);
  assert.equal(await f.game.castSpell(player, card, {from: 'hand', quickTargets: targets}), true, name + ': paid legal cast');
  assert.ok(total(player) < before, name + ': mana paid');
  return card;
}
async function land(f, player, name = 'Island') {
  f.game.turnPlayer = player;
  const card = put(M, f.game, player, name, 'hand');
  assert.equal(await f.game.playLand(player, card), true, 'real land play');
  f.game.turnPlayer = f.a;
  return card;
}
async function mine(f, host) {
  const card = await cast(f, 'Orcish Mine', f.a, [host]);
  await settle(f.game);
  assert.equal(card.attachedTo, host.iid); assert.equal(card.counters.ore, 3);
  assert.equal(JSON.stringify(card.def.oracleImplementation), stored, 'frozen source descriptor remains intact');
  return card;
}
async function lastCounter(f, card) {
  f.game.removeCounters(card, 'ore', 3);
  await f.game.flushTriggers();
  const trigger = f.game.stack.find(object => object.srcCard === card && object.ctx?.data?.kind === 'ore');
  assert.ok(trigger, 'last counter removal creates an answerable trigger');
  return trigger;
}
function life(f, recipient, amount = 2) {
  for (const player of f.game.players) assert.equal(player.life, 40 - (player === recipient ? amount : 0), player.name + ': exact damage recipient');
}

for (const role of ['human', 'ai']) {
  for (const own of [true, false]) test(`${role}: paid Orcish Mine damages the destroyed ${own ? 'own' : 'opposing'} land's controller`, async () => {
    const f = fixture(role), owner = own ? f.a : f.b, host = await land(f, owner), aura = await mine(f, host);
    await lastCounter(f, aura); await settle(f.game);
    assert.equal(host.zone, 'graveyard'); assert.equal(aura.zone, 'graveyard'); life(f, owner);
  });

  test(`${role}: tapping the enchanted land for real mana removes ore and triggers its printed final damage`, async () => {
    const f = fixture(role), host = await land(f, f.b), aura = await mine(f, host);
    for (let remaining = 2; remaining >= 0; remaining--) {
      if (host.tapped) f.game.untap(host);
      const mana = f.game.manaSources(f.b).find(row => row.card === host);
      assert.ok(mana); assert.equal(await f.game.activateManaSource(f.b, mana, mana.produce[0]), true);
      await settle(f.game);
      if (remaining) { assert.equal(aura.counters.ore, remaining); life(f, null, 0); }
    }
    assert.equal(host.zone, 'graveyard'); life(f, f.b);
  });

  test(`${role}: an indestructible enchanted land survives but its controller still takes damage`, async () => {
    const f = fixture(role), host = await land(f, f.b, 'Darksteel Citadel'), aura = await mine(f, host);
    await lastCounter(f, aura); await settle(f.game);
    assert.equal(host.zone, 'battlefield'); assert.equal(aura.zone, 'battlefield'); life(f, f.b);
  });

  test(`${role}: changing land control in response uses its controller at resolution`, async () => {
    const f = fixture(role), host = await land(f, f.b), aura = await mine(f, host);
    await cast(f, 'Vedalken Orrery'); await settle(f.game);
    await lastCounter(f, aura);
    await cast(f, 'Annex', f.a, [host]); await f.game.resolveTop();
    assert.ok(host.ctrl === f.a); await settle(f.game);
    assert.equal(host.zone, 'graveyard'); assert.ok(host.ctrl === f.b, 'new graveyard object has its owner'); life(f, f.a);
  });

  test(`${role}: changing Aura control in response does not change the land damage recipient`, async () => {
    const f = fixture(role), host = await land(f, f.a), aura = await mine(f, host);
    f.game.turnPlayer = f.b; await cast(f, 'Vedalken Orrery', f.b); await settle(f.game); f.game.turnPlayer = f.a;
    await lastCounter(f, aura);
    await cast(f, 'Steal Enchantment', f.b, [aura]); await f.game.resolveTop();
    assert.ok(aura.ctrl === f.b); await settle(f.game); life(f, f.a);
  });

  test(`${role}: bouncing the Aura in response preserves the old attachment and damage source`, async () => {
    const f = fixture(role), host = await land(f, f.b), aura = await mine(f, host);
    await lastCounter(f, aura);
    await cast(f, 'Wipe Away', f.b, [aura]); await f.game.resolveTop();
    assert.equal(aura.zone, 'hand'); await settle(f.game);
    assert.equal(host.zone, 'graveyard'); life(f, f.b);
  });

  for (const response of ['none', 'bounce', 'blink', 'exile-replacement']) test(`${role}: a stolen land's ${response} route uses its exact last battlefield controller`, async () => {
    const f = fixture(role), owner = f.others[1], host = await land(f, owner);
    f.game.turnPlayer = f.b;
    await cast(f, 'Annex', f.b, [host]); await settle(f.game); assert.ok(host.ctrl === f.b);
    if (response === 'exile-replacement') { f.game.turnPlayer = f.a; await cast(f, 'Rest in Peace'); await settle(f.game); }
    if (response === 'blink') { f.game.turnPlayer = f.b; await cast(f, 'Sol Ring', f.b); await settle(f.game); }
    f.game.turnPlayer = f.a;
    const aura = await mine(f, host), version = host.zoneVersion;
    await lastCounter(f, aura);
    if (response === 'bounce') { await cast(f, 'Wipe Away', f.b, [host]); await f.game.resolveTop(); assert.equal(host.zone, 'hand'); }
    if (response === 'blink') { await cast(f, 'Ghostly Flicker', f.b); await f.game.resolveTop(); assert.equal(host.zone, 'battlefield'); assert.ok(host.zoneVersion > version); }
    await settle(f.game); life(f, f.b);
    assert.equal(host.zone, response === 'bounce' ? 'hand' : response === 'blink' ? 'battlefield' : response === 'exile-replacement' ? 'exile' : 'graveyard');
  });

  test(`${role}: a paid Stifle stops Orcish Mine's entire last-counter ability`, async () => {
    const f = fixture(role), host = await land(f, f.b), aura = await mine(f, host), trigger = await lastCounter(f, aura);
    await cast(f, 'Stifle', f.b, [trigger]); await settle(f.game);
    assert.equal(host.zone, 'battlefield'); assert.equal(aura.zone, 'battlefield'); life(f, null, 0);
  });
}

test('Orcish Mine keeps its pinned historical compiler descriptor and source identity', () => {
  assert.equal(source.oracleId, 'a6bfa03e-6317-4550-960b-fbd2a30e521f');
  assert.equal(JSON.stringify(M.DEFS['Orcish Mine'].oracleImplementation), stored);
  assert.equal(createHash('sha256').update(source.raw.oracle).digest('hex'), 'b65c276bf53b7a290e38e9ecbeeb6c810351930b1cd82edf9a80d916262af522');
  assert.deepEqual([...M.DEFS['Orcish Mine'].oracleRuntimeRepairs], ['orcish-mine-attached-controller']);
});
