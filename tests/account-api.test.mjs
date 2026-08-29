import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { createAccountHandler, MemoryAccountStore } from '../api/account.js';

function testServer(options = {}) {
  const store = options.store || new MemoryAccountStore();
  const handler = createAccountHandler({ store, limiter: options.limiter ?? null });
  const server = createServer(handler);
  return { store, server };
}

async function openServer(t, options) {
  const harness = testServer(options);
  harness.server.listen(0, '127.0.0.1');
  await once(harness.server, 'listening');
  t.after(() => new Promise(resolve => harness.server.close(resolve)));
  const origin = `http://127.0.0.1:${harness.server.address().port}`;
  const call = async (action, body, cookie = '') => {
    const response = await fetch(`${origin}/api/account${body ? '' : `?action=${action}`}`, {
      method: body ? 'POST' : 'GET',
      headers: { Origin: origin, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify({ action, ...body }) : undefined,
    });
    const payload = await response.json();
    const setCookie = response.headers.get('set-cookie');
    return { response, payload, cookie: setCookie ? setCookie.split(';')[0] : cookie };
  };
  return { ...harness, origin, call };
}

function checkpoint(matchId = 'match-account-test-0001') {
  return {
    schema: 'commander-save/v1', mode: 'solo', matchId,
    setup: {
      deck: 'Quandrix Unlimited', commanders: ['Zimone, Infinite Analyst'], ai: 3,
      aiDecks: ['Elven Council', 'Doom Prevails', 'Quick Draw'], aiStyles: ['balanced', 'josh', 'olivia'],
      aiRandomCommanders: false, sumPartnerDamage: false, diplomacyEnabled: true, difficulty: 'hard', seed: '290829',
    },
    decisions: [{ shape: { type: 'mulligan' }, response: { kind: 'boolean', value: false } }],
    summary: { deck: 'Quandrix Unlimited', commanders: ['Zimone, Infinite Analyst'], turn: 8 },
  };
}

test('account API registers, authenticates, saves, scores once, syncs favorites, and logs out', async t => {
  const { store, call } = await openServer(t);
  const created = await call('register', { displayName: 'Boro', email: 'BORO@example.com', password: 'strong-pass-2026' });
  assert.equal(created.response.status, 201);
  assert.equal(created.payload.user.displayName, 'Boro');
  assert.equal(created.payload.user.email, 'boro@example.com');
  assert.equal(created.payload.profile.lifetimeScore, 0);
  assert.match(created.cookie, /^commander_session=/);
  assert.doesNotMatch(JSON.stringify(created.payload), /passwordHash|passwordSalt/);

  const stored = await store.findUserByEmailHash(createHash('sha256').update('boro@example.com').digest('hex'));
  assert.ok(stored.passwordHash);
  assert.notEqual(stored.passwordHash, 'strong-pass-2026');

  const duplicate = await call('register', { displayName: 'Other', email: 'boro@example.com', password: 'strong-pass-2026' });
  assert.equal(duplicate.response.status, 409);
  const badLogin = await call('login', { email: 'boro@example.com', password: 'wrong-password' });
  assert.equal(badLogin.response.status, 401);
  const login = await call('login', { email: 'boro@example.com', password: 'strong-pass-2026' });
  assert.equal(login.response.status, 200);

  const saved = await call('save', { save: checkpoint() }, login.cookie);
  assert.equal(saved.response.status, 200);
  assert.equal(saved.payload.save.summary.turn, 8);
  assert.equal(saved.payload.save.summary.decisionCount, 1);
  const favorites = await call('favorites', { decks: ['Quandrix Unlimited', 'Elven Council', 'Quandrix Unlimited'] }, login.cookie);
  assert.deepEqual(favorites.payload.profile.favoriteDecks, ['Elven Council', 'Quandrix Unlimited']);

  const completed = await call('completeMatch', {
    matchId: 'match-account-test-0001', deck: 'Quandrix Unlimited', commanders: ['Zimone, Infinite Analyst'], won: true, turns: 14,
  }, login.cookie);
  assert.equal(completed.payload.recorded, true);
  assert.equal(completed.payload.profile.gamesPlayed, 1);
  assert.equal(completed.payload.profile.wins, 1);
  assert.equal(completed.payload.profile.lifetimeScore, 100);
  assert.deepEqual(completed.payload.profile.favoriteCommanders, [{ name: 'Zimone, Infinite Analyst', games: 1 }]);
  assert.equal(completed.payload.save, null);

  const duplicateCompletion = await call('completeMatch', {
    matchId: 'match-account-test-0001', deck: 'Quandrix Unlimited', commanders: ['Zimone, Infinite Analyst'], won: true, turns: 14,
  }, login.cookie);
  assert.equal(duplicateCompletion.payload.recorded, false);
  assert.equal(duplicateCompletion.payload.profile.gamesPlayed, 1);
  assert.equal(duplicateCompletion.payload.profile.lifetimeScore, 100);

  const session = await call('session', null, login.cookie);
  assert.equal(session.payload.user.displayName, 'Boro');
  assert.equal(session.payload.profile.winRate, 100);
  assert.match(session.response.headers.get('set-cookie'), /HttpOnly; SameSite=Lax; Max-Age=2592000/);
  const logout = await call('logout', {}, login.cookie);
  assert.equal(logout.response.status, 200);
  assert.match(logout.response.headers.get('set-cookie'), /Max-Age=0/);
  const signedOut = await call('session', null, login.cookie);
  assert.equal(signedOut.payload.user, null);
});

test('account API rejects cross-origin writes, invalid saves, and rate-limited auth attempts', async t => {
  const { origin, call } = await openServer(t, { limiter: { limit: async () => ({ success: false }) } });
  const limited = await call('login', { email: 'nobody@example.com', password: 'strong-pass-2026' });
  assert.equal(limited.response.status, 429);

  const response = await fetch(`${origin}/api/account`, {
    method: 'POST', headers: { Origin: 'https://attacker.example', 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'register', displayName: 'Attacker', email: 'attacker@example.com', password: 'strong-pass-2026' }),
  });
  assert.equal(response.status, 403);

  const clean = await openServer(t);
  const registered = await clean.call('register', { displayName: 'Player', email: 'player@example.com', password: 'strong-pass-2026' });
  const invalid = await clean.call('save', { save: { schema: 'debug/v1', mode: 'solo' } }, registered.cookie);
  assert.equal(invalid.response.status, 400);
  assert.match(invalid.payload.error, /Unsupported save-game format/);
});
