import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import Redis from 'ioredis';

const serialize = value => typeof value === 'string' ? value : JSON.stringify(value);
const deserialize = value => {
  if (value === null) return null;
  try { return JSON.parse(value); } catch { return value; }
};

// Run the account store's production Lua against a private Redis process. No
// deployment URL/token is accepted: the server has no TCP port and stores no data.
export async function startLocalAccountRedis({ binary = process.env.REDIS_SERVER_BINARY || 'redis-server' } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'mtg-account-redis-'));
  const socket = join(directory, 'redis.sock');
  const server = spawn(binary, [
    '--port', '0', '--unixsocket', socket, '--unixsocketperm', '700',
    '--save', '', '--appendonly', 'no', '--dir', directory,
    '--databases', '1', '--loglevel', 'warning',
  ], { env: { PATH: process.env.PATH, LANG: 'C' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let serverError;
  let logs = '';
  server.on('error', error => { serverError = error; });
  for (const stream of [server.stdout, server.stderr]) stream.on('data', chunk => { logs += chunk; });
  const exited = new Promise(resolve => {
    server.once('exit', resolve);
    server.once('error', resolve);
  });
  const rawRedis = new Redis({ path: socket, lazyConnect: true, retryStrategy: null, connectTimeout: 1000 });
  rawRedis.on('error', () => {});
  let closed = false;
  async function close() {
    if (closed) return;
    closed = true;
    if (rawRedis.status === 'ready') await rawRedis.quit().catch(() => rawRedis.disconnect());
    else rawRedis.disconnect();
    if (server.pid && server.exitCode === null && server.signalCode === null) {
      server.kill('SIGTERM');
      const timer = setTimeout(() => server.kill('SIGKILL'), 2000);
      timer.unref();
      await exited;
      clearTimeout(timer);
    }
    await rm(directory, { recursive: true, force: true });
  }

  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (serverError) throw serverError;
      if (server.exitCode !== null) throw new Error(`Local Redis exited before becoming ready: ${logs}`);
      if (await stat(socket).then(() => true, () => false)) { ready = true; break; }
      await delay(20);
    }
    if (!ready) throw new Error(`Local Redis did not create its private socket: ${logs}`);
    await rawRedis.connect();
    await rawRedis.ping();
  } catch (error) {
    await close();
    throw error;
  }

  const adapter = {
    ping: () => rawRedis.ping(),
    async get(key) { return deserialize(await rawRedis.get(key)); },
    set(key, value, options = {}) {
      const args = [];
      if (options.ex !== undefined) args.push('EX', options.ex);
      if (options.nx) args.push('NX');
      return rawRedis.set(key, serialize(value), ...args);
    },
    expire: (key, seconds) => rawRedis.expire(key, seconds),
    del: (...keys) => rawRedis.del(...keys),
    hset(key, rows) {
      return rawRedis.hset(key, Object.fromEntries(Object.entries(rows).map(([field, value]) => [field, serialize(value)])));
    },
    hgetall: key => rawRedis.hgetall(key),
    smembers: key => rawRedis.smembers(key),
    lrange: (key, start, stop) => rawRedis.lrange(key, start, stop),
    // Match Upstash's eval(script, keys, args), while executing Redis's real Lua.
    eval: (script, keys, args) => rawRedis.eval(script, keys.length, ...keys, ...args),
    multi() {
      const transaction = rawRedis.multi();
      const chain = {
        del(...keys) { transaction.del(...keys); return chain; },
        sadd(key, ...values) { transaction.sadd(key, ...values); return chain; },
        exec: () => transaction.exec(),
      };
      return chain;
    },
  };
  return { adapter, rawRedis, close, ownerPrefix: `local-${randomUUID()}` };
}
