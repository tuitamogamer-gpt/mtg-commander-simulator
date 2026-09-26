import test from 'node:test';
import assert from 'node:assert/strict';

// api/ws.js also constructs the deployment adapter at module load. Keep this
// fixture independent of workstation credentials and any real Redis service.
const redisVariables = ['REDIS_URL', 'KV_URL', 'UPSTASH_REDIS_URL'];
const savedEnvironment = redisVariables.map(key => [key, process.env[key]]);
let RedisRoomStore;
try {
  for (const key of redisVariables) delete process.env[key];
  ({ RedisRoomStore } = await import('../api/ws.js'));
} finally {
  for (const [key, value] of savedEnvironment) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const busy = error => error?.code === 'ROOM_BUSY';
const room = 'lease-regression-room';

// Model Redis expiry, NX acquisition and atomic ownership operations. Redis
// time advances separately from JS timers so a suspended worker is reproducible.
// This transport does not execute Lua; the production gate exercises real Redis.
class RedisTransport {
  constructor() {
    this.now = 0;
    this.values = new Map();
    this.failNextRelease = false;
  }

  advance(ms) { this.now += ms; }

  read(key) {
    const entry = this.values.get(key);
    if (entry && entry.expiresAt <= this.now) {
      this.values.delete(key);
      return null;
    }
    return entry?.value ?? null;
  }

  write(key, value, ttl = Infinity) {
    this.values.set(key, { value: String(value), expiresAt: this.now + ttl });
  }

  duplicate() { return this; }
  on() { return this; }
  async subscribe() { return 1; }
  async quit() { return 'OK'; }
  async publish() { return 0; }
  async get(key) { return this.read(key); }

  async set(key, value, ...options) {
    if (options.includes('NX') && this.read(key) !== null) return null;
    const px = options.indexOf('PX'), ex = options.indexOf('EX');
    const ttl = px >= 0 ? Number(options[px + 1]) : ex >= 0 ? Number(options[ex + 1]) * 1000 : Infinity;
    this.write(key, value, ttl);
    return 'OK';
  }

  async eval(_script, keyCount, ...parameters) {
    const keys = parameters.slice(0, keyCount), args = parameters.slice(keyCount);
    if (keyCount === 2 && args.length === 3) {
      // Compare the owner and persist the room in one indivisible operation.
      if (this.read(keys[0]) !== args[0]) return 0;
      this.write(keys[1], args[1], Number(args[2]) * 1000);
      return 1;
    }
    assert.equal(keyCount, 1, 'unexpected Redis operation');
    if (args.length === 2) {
      if (this.read(keys[0]) !== args[0]) return 0;
      this.write(keys[0], args[0], Number(args[1]));
      return 1;
    }
    assert.equal(args.length, 1, 'unexpected Redis operation');
    if (this.failNextRelease) {
      this.failNextRelease = false;
      throw new Error('Redis connection lost during lock release');
    }
    if (this.read(keys[0]) !== args[0]) return 0;
    this.values.delete(keys[0]);
    return 1;
  }
}

function fixture(t) {
  const redis = new RedisTransport();
  const first = new RedisRoomStore(undefined, { redis });
  const second = new RedisRoomStore(undefined, { redis });
  t.after(() => Promise.all([first.close(), second.close()]));
  return { redis, first, second };
}

test('an expired worker cannot overwrite a replacement connection, game views or action receipts', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const { redis, first, second } = fixture(t);
  const initial = { revision: 40, seats: [{ seat: 2, connectionId: 'old-connection' }],
    views: { 2: { turn: 4 } }, actionReceipts: { 2: [] } };
  await first.withLock(room, lease => first.set(room, initial, lease));
  const read = deferred(), resumeStale = deferred(), replacementReady = deferred(), finishReplacement = deferred();
  const stale = first.withLock(room, async lease => {
    const state = await first.get(room);
    read.resolve();
    await resumeStale.promise;
    state.revision++;
    state.views[2].turn = 99;
    await first.set(room, state, lease);
  });
  const rejected = assert.rejects(stale, busy);
  await read.promise;
  // Redis expires the lease while the old worker cannot run its renewal timer.
  redis.advance(5001);
  const newer = { revision: 42, seats: [{ seat: 2, connectionId: 'replacement-connection' }],
    views: { 2: { turn: 5 } }, actionReceipts: { 2: [{ requestId: 'confirmed-action', digest: 'confirmed-digest' }] } };
  const replacement = second.withLock(room, async lease => {
    await second.set(room, newer, lease);
    replacementReady.resolve();
    await finishReplacement.promise;
    // The stale worker's cleanup must not release the replacement's lease.
    await second.set(room, newer, lease);
  });
  try {
    await replacementReady.promise;
    resumeStale.resolve();
    await rejected;
    assert.deepEqual(await second.get(room), newer);
    finishReplacement.resolve();
    await replacement;
    assert.deepEqual(await first.get(room), newer);
  } finally {
    resumeStale.resolve();
    finishReplacement.resolve();
    await Promise.allSettled([stale, replacement]);
  }
});

test('missing, incorrect and released leases cannot change a stored room', async t => {
  const { first } = fixture(t);
  const original = { revision: 1, views: { 0: { turn: 1 } } };
  const unwanted = { revision: 2, views: { 0: { turn: 999 } } };
  let releasedLease;
  await first.withLock(room, async lease => {
    releasedLease = lease;
    await first.set(room, original, lease);
    await assert.rejects(first.set(room, unwanted), busy);
    await assert.rejects(first.set(room, unwanted, 'different-owner'), busy);
    assert.deepEqual(await first.get(room), original);
  });
  await assert.rejects(first.set(room, unwanted, releasedLease), busy);
  assert.deepEqual(await first.get(room), original);
});

test('renewal retains ownership during work lasting beyond the initial five-second lease', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const { redis, first } = fixture(t);
  const ready = deferred(), finish = deferred();
  const state = { revision: 1, views: { 0: { turn: 8 } } };
  const work = first.withLock(room, async lease => {
    ready.resolve();
    await finish.promise;
    await first.set(room, state, lease);
    return 'committed';
  });
  try {
    await ready.promise;
    for (let second = 0; second < 7; second++) {
      redis.advance(1000);
      t.mock.timers.tick(1000);
      await Promise.resolve();
    }
    finish.resolve();
    assert.equal(await work, 'committed');
    assert.deepEqual(await first.get(room), state);
  } finally {
    finish.resolve();
    await Promise.allSettled([work]);
  }
});

test('lock release failure cannot reject a committed write and a later owner can continue', async t => {
  const { redis, first, second } = fixture(t);
  const committed = { revision: 7, views: { 0: { turn: 3 } }, actionReceipts: { 0: [{ requestId: 'applied' }] } };
  redis.failNextRelease = true;
  const result = await first.withLock(room, async lease => {
    await first.set(room, committed, lease);
    return 'confirmed';
  });
  assert.equal(result, 'confirmed');
  assert.deepEqual(await second.get(room), committed);
  redis.advance(5001);
  const resumed = { ...committed, revision: 8, views: { 0: { turn: 4 } } };
  await second.withLock(room, lease => second.set(room, resumed, lease));
  assert.deepEqual(await first.get(room), resumed);
});
