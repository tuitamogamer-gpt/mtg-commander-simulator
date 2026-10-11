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

function checkpoint(matchId) {
  return {
    schema: 'commander-save/v1', mode: 'solo', matchId,
    setup: { deck: 'Quick Draw' }, decisions: [],
    summary: { deck: 'Quick Draw', commanders: ['Stella Lee, Wild Card'], turn: 1 },
  };
}

async function checkConcurrentCompletion(t, store) {
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
    const payload = await response.json();
    assert.equal(response.status, action === 'register' ? 201 : 200, payload.error);
    return payload;
  };
  const account = await call('register', {
    displayName: 'Concurrent Player', email: 'concurrent-save@example.test', password: 'save-race-password',
  });
  const expectedOwnerId = account.user.id;
  const oldMatch = {
    matchId: 'match-completing-0001', deck: 'Quick Draw', commanders: ['Stella Lee, Wild Card'], won: true, turns: 12,
  };
  const nextSave = checkpoint('match-new-active-0002');
  await call('save', { expectedOwnerId, save: checkpoint(oldMatch.matchId) });

  // Hold completion at its save cleanup boundary, allowing a different tab's
  // new match to save before cleanup reaches the store. The legacy path holds
  // its already-read value here and incorrectly deletes the newer match.
  const reached = deferred();
  const released = deferred();
  let armed = true;
  const pause = async () => {
    if (!armed) return;
    armed = false;
    reached.resolve();
    await released.promise;
  };
  const originalRead = store.getSave.bind(store);
  const originalConditionalDelete = store.deleteSaveIfMatch?.bind(store);
  store.getSave = async id => {
    const save = await originalRead(id);
    await pause();
    return save;
  };
  store.deleteSaveIfMatch = async (id, matchId) => {
    await pause();
    return originalConditionalDelete(id, matchId);
  };
  const completing = call('completeMatch', { expectedOwnerId, ...oldMatch });
  await reached.promise;
  try {
    await call('save', { expectedOwnerId, save: nextSave });
    assert.equal((await originalRead(expectedOwnerId)).matchId, nextSave.matchId);
  } finally {
    released.resolve();
  }
  const completed = await completing;
  assert.equal(completed.recorded, true);
  assert.equal(completed.save?.matchId, nextSave.matchId, 'finishing an older match must preserve the new match save');
  assert.equal((await originalRead(expectedOwnerId))?.matchId, nextSave.matchId);

  const duplicate = await call('completeMatch', { expectedOwnerId, ...oldMatch });
  assert.equal(duplicate.recorded, false);
  assert.equal(duplicate.profile.gamesPlayed, 1);
  assert.equal(duplicate.save?.matchId, nextSave.matchId);

  const matching = await call('completeMatch', { expectedOwnerId, ...oldMatch, matchId: nextSave.matchId });
  assert.equal(matching.recorded, true);
  assert.equal(matching.save, null, 'the completed match still clears its own checkpoint');
  await call('save', { expectedOwnerId, save: checkpoint('match-explicit-clear-0003') });
  const cleared = await call('clearSave', { expectedOwnerId });
  assert.equal(cleared.save, null, 'explicit Delete save retains its unconditional behavior');
  assert.equal(await originalRead(expectedOwnerId), null);
}

test('match completion preserves a concurrently saved different match in memory', async t => {
  await checkConcurrentCompletion(t, new MemoryAccountStore());
});

test('match completion preserves a concurrently saved different match with real Redis Lua', async t => {
  let fixture;
  try { fixture = await startLocalAccountRedis(); }
  catch (error) {
    if (error.code === 'ENOENT') {
      t.skip('Install redis-server or set REDIS_SERVER_BINARY to run the real Redis regression.');
      return;
    }
    throw error;
  }
  t.after(fixture.close);
  await checkConcurrentCompletion(t, new UpstashAccountStore(fixture.adapter));
});
