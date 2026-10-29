import test from 'node:test';
import assert from 'node:assert/strict';
import {M, setup, card, body, settle} from './helpers/c21-fixtures.mjs';

test('Wan Shi Tong observes a library batch once, including after changing controller', async () => {
  const f = setup(), wan = card(f, 'Wan Shi Tong, All-Knowing');
  const first = card(f, 'Forest', 'graveyard'), second = card(f, 'Grizzly Bears', 'graveyard');
  M.OracleV8Control.gain(f.game, wan, f.b); f.game.recalc();
  await f.game.moveGraveyardBatch([first, second], 'library');
  await settle(f.game);
  const spirits = f.game.creatures().filter(c => c.isToken && c.hasSub('Spirit'));
  assert.equal(spirits.length, 2);
  assert.ok(spirits.every(c => c.ctrl === f.b));
  assert.ok(spirits.every(c => c.cur.onlyBlockSpiritV90 && c.cur.onlyBlockedSpiritV90));
});

test('Ketramose observes simultaneous exile using its departing source snapshot and groups the batch', async () => {
  const f = setup(), ketramose = card(f, 'Ketramose, the New Dawn'), creature = body(f);
  await f.game.exileMany([ketramose, creature]);
  await settle(f.game);
  assert.equal(ketramose.zone, 'exile');
  assert.equal(creature.zone, 'exile');
  assert.equal(f.a.hand.length, 1);
  assert.equal(f.a.life, 39);
});

test('Grolnok preserves a separate trigger for each milled permanent and ignores instants', async () => {
  const f = setup(); card(f, 'Grolnok, the Omnivore');
  const land = card(f, 'Forest', 'library'), creature = card(f, 'Grizzly Bears', 'library'), instant = card(f, 'Lightning Bolt', 'library');
  await f.game.mill(f.a, 3);
  await settle(f.game);
  for (const c of [land, creature]) {
    assert.equal(c.zone, 'exile');
    assert.equal(c.counters.croak, 1);
  }
  assert.equal(instant.zone, 'graveyard');
});

test('A copied zone watcher retains its own independent trigger', async () => {
  const f = setup(), grolnok = card(f, 'Grolnok, the Omnivore');
  await M.C13.copy({g: f.game, src: grolnok, you: f.a, sourceZoneVersion: grolnok.zoneVersion}, grolnok,
    {definition: {...M.C13.snapshotCopy(grolnok), super: []}});
  const land = card(f, 'Forest', 'library');
  await f.game.mill(f.a, 1);
  assert.equal(f.game.pendingTriggers.filter(t => t.name.includes('grolnok-exile')).length, 2);
  await settle(f.game);
  assert.equal(land.zone, 'exile');
  assert.equal(land.counters.croak, 1, 'the second trigger cannot follow the card into a new zone');
});

for (const inactive of ['phasedOut', 'faceDown', 'abilitiesDisabled']) {
  test('Zone watchers ignore an inactive source: ' + inactive, async () => {
    const f = setup(), watcher = card(f, 'Wan Shi Tong, All-Knowing'), moved = card(f, 'Forest', 'hand');
    if (inactive === 'abilitiesDisabled') card(f, 'Humility');
    else watcher[inactive] = true;
    await f.game.move(moved, 'library');
    await settle(f.game);
    assert.equal(f.game.creatures().filter(c => c.isToken && c.hasSub('Spirit')).length, 0);
  });
}

test('Attachment snapshots preserve the current host version, including a phased host and reattachment', async () => {
  const f = setup(), host = body(f), sword = card(f, 'The Sword of Kahless');
  assert.equal(f.game.snapshot(host).attachedHostVersion, undefined);
  await f.game.attach(sword, host);
  assert.equal(f.game.snapshot(sword).attachedHostVersion, host.zoneVersion);
  host.phasedOut = true;
  assert.equal(f.game.snapshot(sword).attachedHostVersion, host.zoneVersion);
  host.phasedOut = false;
  const version = host.zoneVersion;
  await f.game.move(host, 'exile');
  assert.equal(f.game.snapshot(sword).attachedHostVersion, undefined);
  await f.game.putPermanentOntoBattlefield(host, f.a);
  await f.game.attach(sword, host);
  assert.ok(host.zoneVersion > version);
  assert.equal(f.game.snapshot(sword).attachedHostVersion, host.zoneVersion);
});
