import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { MemoryAccountStore, UpstashAccountStore, createAccountHandler } from '../api/account.js';
import { startLocalAccountRedis } from './helpers/local-account-redis.mjs';

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function checkpoint(matchId, turn = 1) {
  return {
    schema: 'commander-save/v1', mode: 'solo', matchId,
    setup: {
      deck: 'Quick Draw', commanders: ['Stella Lee, Wild Card'],
      ai: 1, aiDecks: ['Elven Council'], aiStyles: ['balanced'], seed: 'completed-save-1',
      importedDecks: [],
    },
    decisions: [],
    summary: { deck: 'Quick Draw', commanders: ['Stella Lee, Wild Card'], turn },
  };
}

async function checkInFlightCheckpoint(store, call, expectedOwnerId) {
  const match = {
    matchId: 'match-inflight-finished-003', deck: 'Quick Draw', commanders: ['Stella Lee, Wild Card'], won: false, turns: 15,
  };
  assert.equal((await call('save', { expectedOwnerId, save: checkpoint(match.matchId, 8) })).status, 200);
  const reached = deferred();
  const released = deferred();
  let armed = true;
  const pause = async () => {
    if (!armed) return;
    armed = false;
    reached.resolve();
    await released.promise;
  };
  let restore;
  if (store.redis) {
    // Hold the save at the actual Redis write boundary. A separate completion
    // can execute its real Lua while this request is already in flight. Both
    // SET and EVAL are intercepted so a non-atomic check-then-SET would fail.
    const redis = store.redis;
    const originalEval = redis.eval;
    const originalSet = redis.set;
    const key = `commander-account:v1:save:${expectedOwnerId}`;
    redis.eval = async (script, keys, args) => {
      if (keys.includes(key) && args[0] === match.matchId) await pause();
      return originalEval(script, keys, args);
    };
    redis.set = async (savedKey, value, options) => {
      const save = typeof value === 'string' ? JSON.parse(value) : value;
      if (savedKey === key && save?.matchId === match.matchId) await pause();
      return originalSet(savedKey, value, options);
    };
    restore = () => { redis.eval = originalEval; redis.set = originalSet; };
  } else {
    const originalSave = store.saveGame;
    store.saveGame = async (owner, save) => {
      if (save.matchId === match.matchId) await pause();
      return originalSave.call(store, owner, save);
    };
    restore = () => { store.saveGame = originalSave; };
  }
  const pending = call('save', { expectedOwnerId, save: checkpoint(match.matchId, 9) });
  try {
    await reached.promise;
    const completed = await call('completeMatch', { expectedOwnerId, ...match });
    assert.equal(completed.status, 200);
    assert.equal(completed.payload.recorded, true);
    assert.equal(completed.payload.save, null);
    const next = await call('save', { expectedOwnerId, save: checkpoint('match-inflight-new-active-004') });
    assert.equal(next.status, 200);
    released.resolve();
    const late = await pending;
    assert.equal(late.status, 409);
    assert.equal(late.payload.code, 'MATCH_ALREADY_COMPLETED');
    assert.equal(late.payload.ownerId, expectedOwnerId);
    assert.deepEqual(await store.getSave(expectedOwnerId), next.payload.save);
    assert.deepEqual(await store.getProfile(expectedOwnerId), completed.payload.profile);
  } finally {
    released.resolve();
    await pending;
    restore();
  }
}

async function checkUnconfirmedRedisWrite(store, call, expectedOwnerId, rawRedis) {
  const redis = store.redis;
  const originalEval = redis.eval;
  const key = `commander-account:v1:save:${expectedOwnerId}`;
  const previousSave = await store.getSave(expectedOwnerId);
  const previousRaw = await rawRedis.get(key);
  const next = checkpoint('match-retryable-write-0005');
  try {
    for (const unconfirmed of [null, undefined, '', false, 'unknown']) {
      redis.eval = async (script, keys, args) => keys.includes(key)
        ? unconfirmed : originalEval(script, keys, args);
      const failed = await call('save', { expectedOwnerId, save: next });
      assert.equal(failed.status, 500, `unconfirmed Redis reply ${String(unconfirmed)} must remain retryable`);
      assert.equal(failed.payload.ok, false);
      assert.equal(failed.payload.ownerId, expectedOwnerId);
      assert.equal(Object.hasOwn(failed.payload, 'code'), false, 'only confirmed completed matches have a terminal error code');
      assert.deepEqual(await store.getSave(expectedOwnerId), previousSave);
      assert.equal(await rawRedis.get(key), previousRaw);
    }
  } finally {
    redis.eval = originalEval;
  }
  const retried = await call('save', { expectedOwnerId, save: next });
  assert.equal(retried.status, 200);
  assert.deepEqual(retried.payload.save.setup, next.setup);
  assert.equal(await rawRedis.get(key), JSON.stringify(retried.payload.save));
}

async function checkCompletedMatchSave(t, store, rawRedis = null) {
  const server = createServer(createAccountHandler({ store, limiter: null }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  const call = async (action, body) => {
    const response = await fetch(`${origin}/api/account`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ action, ...body }),
    });
    cookie = response.headers.get('set-cookie')?.split(';')[0] || cookie;
    return { status: response.status, payload: await response.json() };
  };
  const account = await call('register', {
    displayName: 'Completed Match Player', email: 'completed-save@example.test', password: 'local-save-regression-password',
  });
  assert.equal(account.status, 201);
  const expectedOwnerId = account.payload.user.id;
  const match = {
    matchId: 'match-finished-table-0001', deck: 'Quick Draw', commanders: ['Stella Lee, Wild Card'], won: true, turns: 20,
  };
  assert.equal((await call('save', { expectedOwnerId, save: checkpoint(match.matchId, 10) })).status, 200);
  const completed = await call('completeMatch', { expectedOwnerId, ...match });
  assert.equal(completed.status, 200);
  assert.equal(completed.payload.recorded, true);
  assert.equal(completed.payload.save, null);

  // A second tab can still be running the same resumed table. Its next
  // checkpoint must not recreate a game already recorded as finished.
  const rejectFinishedCheckpoint = async () => {
    const late = await call('save', { expectedOwnerId, save: checkpoint(match.matchId, 11) });
    assert.equal(late.status, 409);
    assert.equal(late.payload.ok, false);
    assert.equal(late.payload.code, 'MATCH_ALREADY_COMPLETED');
    assert.equal(late.payload.ownerId, expectedOwnerId);
  };
  await rejectFinishedCheckpoint();
  assert.equal(await store.getSave(expectedOwnerId), null);

  const next = checkpoint('match-next-active-000002', 1);
  const imported = {
    schema: 'commander-deck/v1', id: 'deck-yuriko-unicode-0001', name: 'Čarobni Yuriko 🥷',
    commanders: ["Yuriko, the Tiger's Shadow"],
    cards: [
      { name: "Yuriko, the Tiger's Shadow", n: 1, section: 'Commander' },
      { name: 'Island', n: 99, section: 'Main' },
    ],
    auxiliaryV87: { attractions: [], stickers: [], outsideGame: [], colors: {}, draft: {} },
  };
  next.setup = { ...next.setup, deck: imported.name, commanders: imported.commanders, importedDecks: [imported] };
  next.summary = { ...next.summary, deck: imported.name, commanders: imported.commanders };
  const saved = await call('save', { expectedOwnerId, save: next });
  assert.equal(saved.status, 200);
  assert.equal(saved.payload.ownerId, expectedOwnerId);
  assert.deepEqual(saved.payload.save.setup, next.setup);
  assert.deepEqual(saved.payload.save.decisions, []);
  assert.deepEqual(await store.getSave(expectedOwnerId), saved.payload.save);
  if (rawRedis) {
    assert.equal(await rawRedis.get(`commander-account:v1:save:${expectedOwnerId}`), JSON.stringify(saved.payload.save),
      'the atomic Redis write must retain the original UTF-8 JSON, including empty arrays and maps');
  }

  await rejectFinishedCheckpoint();
  assert.deepEqual(await store.getSave(expectedOwnerId), saved.payload.save, 'a late finished checkpoint cannot replace a new game');
  const duplicate = await call('completeMatch', { expectedOwnerId, ...match });
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.payload.recorded, false);
  assert.deepEqual(duplicate.payload.profile, completed.payload.profile, 'late saves and repeated completion cannot change recorded statistics');
  assert.deepEqual(duplicate.payload.save, saved.payload.save, 'repeated completion still preserves the other match');
  await checkInFlightCheckpoint(store, call, expectedOwnerId);
  if (rawRedis) await t.test('unconfirmed Redis save replies remain retryable API errors', async () => {
    await checkUnconfirmedRedisWrite(store, call, expectedOwnerId, rawRedis);
  });
}

test('completed matches cannot be saved again through the account API in memory', async t => {
  await checkCompletedMatchSave(t, new MemoryAccountStore());
});

test('completed matches cannot be saved again through the account API with real Redis Lua', async t => {
  let fixture;
  try { fixture = await startLocalAccountRedis(); }
  catch (error) {
    if (error.code === 'ENOENT' && !process.env.REDIS_SERVER_BINARY) {
      t.skip('Install redis-server or set REDIS_SERVER_BINARY to run the real Redis regression.');
      return;
    }
    throw error;
  }
  t.after(fixture.close);
  await checkCompletedMatchSave(t, new UpstashAccountStore(fixture.adapter), fixture.rawRedis);
});
