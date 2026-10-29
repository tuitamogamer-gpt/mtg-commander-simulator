import assert from 'node:assert/strict';
import {setup, card, settle} from '../tests/helpers/c21-fixtures.mjs';

// A sixth land doubles 32 Scute Swarms through the ordinary trigger and
// token-entry paths. Measure only gameplay, excluding engine initialization.
const f = setup();
for (let i = 0; i < 32; i++) card(f, 'Scute Swarm');
for (let i = 0; i < 5; i++) card(f, 'Forest');
const land = card(f, 'Forest', 'hand');
let snapshotCalls = 0, nullLookups = 0;
const snapshot = f.game.snapshot, byIid = f.game.byIid;
f.game.snapshot = function (...args) { snapshotCalls++; return snapshot.apply(this, args); };
f.game.byIid = function (id) { if (id == null) nullLookups++; return byIid.call(this, id); };

const started = performance.now();
await f.game.putPermanentOntoBattlefield(land, f.a);
await settle(f.game);
const swarmCount = f.game.creatures(f.a).filter(c => c.name === 'Scute Swarm').length;
assert.equal(swarmCount, 64);
console.log(JSON.stringify({elapsedMs: performance.now() - started, snapshotCalls, nullLookups,
  swarmCount, battlefield: f.game.bf().length}, null, 2));
