// Checks a Commander Live room server from the outside, the way two browsers
// on the game's page would use it. It opens one throwaway room (it expires on
// its own after 24 hours) and changes nothing else.
//
//   node scripts/live-smoke.mjs https://live.example.com --origin https://www.example.com
//
//   --origin <page origin>   the game's page; sent as the browser would send it
//   --insecure               accept a self-signed certificate (local rehearsal only)
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import { WebSocket } from 'ws';

const args = process.argv.slice(2);
const target = args.find(arg => !arg.startsWith('--'));
const flag = name => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : null; };
const pageOrigin = flag('--origin');
const insecure = args.includes('--insecure');
if (!target || !/^https?:\/\/[^/]+$/.test(target)) {
  console.error('Usage: node scripts/live-smoke.mjs https://live.example.com [--origin https://www.example.com] [--insecure]');
  process.exit(2);
}
const agent = insecure && target.startsWith('https:') ? new https.Agent({ rejectUnauthorized: false }) : undefined;
const socketBase = target.replace(/^http/, 'ws');
const room = `smoke-${randomUUID()}`;
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

function open(path, origin, playerId) {
  const ws = new WebSocket(`${socketBase}${path}`, { origin: origin || undefined, agent, handshakeTimeout: 10_000 });
  const messages = [];
  const waiters = new Set();
  ws.on('message', data => {
    const message = JSON.parse(String(data));
    messages.push(message);
    for (const waiter of [...waiters]) {
      if (!waiter.predicate(message)) continue;
      waiters.delete(waiter);
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    }
  });
  const waitFor = (predicate, what, timeout = 8000) => {
    const seen = messages.find(predicate);
    if (seen) return Promise.resolve(seen);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, timer: setTimeout(() => {
        waiters.delete(waiter);
        reject(new Error(`no ${what} within ${timeout} ms; last message: ${JSON.stringify(messages.at(-1) || null).slice(0, 200)}`));
      }, timeout) };
      waiters.add(waiter);
    });
  };
  const opened = new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('unexpected-response', (_request, response) => reject(new Error(`handshake refused with HTTP ${response.statusCode}`)));
    ws.once('error', reject);
  });
  return {
    ws, opened, waitFor,
    async join() {
      await opened;
      ws.send(JSON.stringify({ type: 'join', playerId }));
      return waitFor(message => message.type === 'state' && message.view?.you !== null && message.view?.you !== undefined, 'seat');
    },
  };
}

async function health() {
  const response = await new Promise((resolve, reject) => {
    const client = target.startsWith('https:') ? https : http;
    const request = client.get(`${target}/api/ws`, { agent, headers: pageOrigin ? { Origin: pageOrigin } : {} }, incoming => {
      let body = '';
      incoming.on('data', chunk => { body += chunk; });
      incoming.on('end', () => resolve({ status: incoming.statusCode, headers: incoming.headers, body }));
    });
    request.setTimeout(10_000, () => request.destroy(new Error('health request timed out')));
    request.on('error', reject);
  });
  let payload = null;
  try { payload = JSON.parse(response.body); } catch { /* reported below */ }
  check('health answers with ok: true', response.status === 200 && payload?.ok === true,
    payload ? `storage: ${payload.storage || payload.error}` : `HTTP ${response.status}`);
  if (pageOrigin) {
    check('health can be read from the game\'s page', response.headers['access-control-allow-origin'] === pageOrigin,
      `Access-Control-Allow-Origin: ${response.headers['access-control-allow-origin'] || 'missing'}`);
  }
}

try {
  await health();

  const started = Date.now();
  const host = open(`/api/ws?room=${room}&create=1&players=2`, pageOrigin, `p-${randomUUID()}`);
  const hostState = await host.join();
  check('the host opens a room and takes seat 1', hostState.view.you === 0 && hostState.view.seats.length === 2,
    `${Date.now() - started} ms`);

  const guest = open(`/api/ws?room=${room}`, pageOrigin, `p-${randomUUID()}`);
  const guestState = await guest.join();
  check('a second player joins the same room', guestState.view.you === 1);
  const both = await host.waitFor(message => message.type === 'state'
    && message.view.seats.every(seat => seat.occupied && seat.connected), 'both seats connected');
  check('the host is told the guest arrived', !!both);
  check('a player never receives another seat\'s reconnect identity', !JSON.stringify(guestState).includes('playerId'));

  if (pageOrigin) {
    const stranger = open(`/api/ws?room=${room}`, 'https://not-the-game.example', `p-${randomUUID()}`);
    const refused = await stranger.opened.then(() => false, error => /HTTP 403/.test(error.message));
    check('a page on another site is refused', refused);
    stranger.ws.terminate();
  }

  guest.ws.close();
  const away = await host.waitFor(message => message.type === 'state'
    && message.view.seats.some(seat => seat.seat === 1 && seat.connected === false), 'guest marked away');
  check('the host is told the guest left', !!away);
  host.ws.close();
} catch (error) {
  check('room flow completes', false, error.message);
}

const failed = results.filter(ok => !ok).length;
console.log(failed ? `\n${failed} check(s) failed against ${target}.` : `\nAll ${results.length} checks passed against ${target}.`);
process.exit(failed ? 1 : 0);
