import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import { createAccountHandler, MemoryAccountStore } from '../api/account.js';

async function openServer(t) {
  const store = new MemoryAccountStore();
  const server = createServer(createAccountHandler({ store, limiter: null }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  return { store, origin: `http://127.0.0.1:${server.address().port}` };
}

async function parsedRequest(body) {
  const store = new MemoryAccountStore();
  let pings = 0;
  store.ping = async () => { pings++; return 'PONG'; };
  const handler = createAccountHandler({ store, limiter: null });
  const request = { method: 'POST', url: '/api/account', headers: { host: 'account.test' }, body };
  let payload;
  const headers = new Map();
  const response = {
    setHeader(name, value) { headers.set(name.toLowerCase(), value); },
    end(raw) { payload = JSON.parse(raw); },
  };
  await handler(request, response);
  return { status: response.statusCode, payload, headers, pings };
}

test('malformed unrelated cookies do not hide a valid account session', async t => {
  const { origin } = await openServer(t);
  const registered = await fetch(`${origin}/api/account`, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'register', displayName: 'Input Player', email: 'input-player@example.com', password: 'strong-pass-2026' }),
  });
  assert.equal(registered.status, 201);
  const { user } = await registered.json();
  const cookie = registered.headers.get('set-cookie').split(';')[0];
  const session = await fetch(`${origin}/api/account?action=session`, {
    headers: { Cookie: `analytics=%E0%A4%A; ${cookie}; other=%FF` },
  });
  assert.equal(session.status, 200);
  assert.equal((await session.json()).user.id, user.id);
  assert.equal(session.headers.get('cache-control'), 'no-store');
});

test('malformed session cookies settle as signed out', async t => {
  const { origin } = await openServer(t);
  const session = await fetch(`${origin}/api/account?action=session`, {
    headers: { Cookie: 'commander_session=%E0%A4%A; unrelated=valid' },
  });
  assert.equal(session.status, 200);
  const payload = await session.json();
  assert.equal(payload.user, null);
  assert.equal(payload.save, null);
});

test('streamed invalid JSON values return a client error instead of an account outage', async t => {
  const { origin } = await openServer(t);
  for (const raw of ['null', '[]', '"text"', 'true', '7', '{']) {
    const response = await fetch(`${origin}/api/account`, {
      method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: raw,
    });
    assert.equal(response.status, 400, raw);
    const payload = await response.json();
    assert.equal(payload.ok, false, raw);
    assert.match(payload.error, /Request body must be (?:a JSON object|valid JSON)\./, raw);
  }
});

test('hosting parsed bodies reject non-object JSON before contacting account storage', async () => {
  for (const body of [null, [], true, 7, 'null', '[]', '"text"', '{', Buffer.from('false')]) {
    const result = await parsedRequest(body);
    assert.equal(result.status, 400);
    assert.equal(result.pings, 0);
    assert.equal(result.payload.ok, false);
  }
});

test('hosting parsed bodies enforce the same UTF-8 size limit as raw JSON requests', async () => {
  const body = { action: 'login', email: 'missing@example.com', password: 'strong-pass-2026', padding: '' };
  const remaining = 1_900_000 - Buffer.byteLength(JSON.stringify(body));
  body.padding = 'é'.repeat(Math.floor(remaining / 2)) + 'x'.repeat(remaining % 2);
  const raw = JSON.stringify(body);
  assert.equal(Buffer.byteLength(raw), 1_900_000);
  for (const input of [body, raw, Buffer.from(raw)]) {
    assert.equal((await parsedRequest(input)).status, 401, 'a body at the byte limit reaches normal authentication');
  }
  const oversized = { ...body, padding: `${body.padding}x` };
  for (const input of [oversized, ` ${raw}`, Buffer.from(` ${raw}`)]) {
    const result = await parsedRequest(input);
    assert.equal(result.status, 413, 'one extra UTF-8 byte exceeds the limit, including raw whitespace');
    assert.equal(result.pings, 0);
    assert.equal(result.payload.error, 'Request is too large.');
  }
});

test('valid hosting parsed, string and buffer bodies retain normal account validation', async () => {
  const body = { action: 'login', email: 'missing@example.com', password: 'strong-pass-2026' };
  for (const input of [body, JSON.stringify(body), Buffer.from(JSON.stringify(body))]) {
    const result = await parsedRequest(input);
    assert.equal(result.status, 401);
    assert.equal(result.pings, 1);
    assert.equal(result.payload.error, 'Email or password is incorrect.');
  }
});
