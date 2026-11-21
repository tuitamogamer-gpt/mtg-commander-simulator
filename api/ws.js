import express from 'express';
import { createServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import Redis from 'ioredis';
import { PostgresRoomStore } from '../server/postgres-room-store.js';
import { databaseUrl, directDatabaseUrl } from '../server/postgres.js';
import { setup, validateAction, applyAction, viewFor } from '../logic.js';

const ROOM_TTL_SECONDS = 24 * 60 * 60;
const MAX_MESSAGE_BYTES = 2_100_000;
const MAX_ACTION_RECEIPTS = 128;
const ROOM_LOCK_TTL_MS = 5000;
const ROOM_LOCK_WAIT_MS = 6500;
const RUNNING_ACTIONS = new Set(['decisionRequest', 'decisionResponse', 'decisionPreview', 'manualAction']);
const CHANNEL = 'commander-live:room-events';
const roomKey = room => `commander-live:room:${room}`;
const lockKey = room => `commander-live:lock:${room}`;
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function cleanRoom(value) {
  const room = String(value || '').trim().toLowerCase();
  return /^[a-z0-9-]{12,64}$/.test(room) ? room : '';
}

function cleanPlayerId(value) {
  const id = String(value || '').trim();
  return /^[a-zA-Z0-9-]{12,80}$/.test(id) ? id : '';
}

function cleanPlayerCount(value) {
  const count = Number(value);
  return Number.isInteger(count) && count >= 2 && count <= 4 ? count : 2;
}

// A room server on its own host (LIVE_ALLOWED_ORIGINS) is reached from the
// game's page on another origin. The list holds exact origins, never patterns:
// a typo must stop the server instead of quietly opening or closing the door.
export function parseAllowedOrigins(value) {
  return String(value || '').split(',').map(item => item.trim()).filter(Boolean).map(item => {
    let url;
    try { url = new URL(item); } catch { throw new Error(`LIVE_ALLOWED_ORIGINS has an invalid origin: ${item}`); }
    if (!['https:', 'http:'].includes(url.protocol) || !/^[a-z0-9.-]+$/.test(url.hostname)
      || url.origin !== item.replace(/\/$/, '').toLowerCase()) {
      throw new Error(`LIVE_ALLOWED_ORIGINS needs plain origins such as https://www.example.com, not: ${item}`);
    }
    return url.origin;
  });
}

// A browser on the server's own host is always accepted; any other origin
// must be listed. A client with no Origin header is not a browser page.
export function originAllowed(origin, requestHost, allowedOrigins = []) {
  if (!origin) return true;
  let url;
  try { url = new URL(origin); } catch { return false; }
  return url.host === requestHost || allowedOrigins.includes(url.origin);
}

class MemoryRoomStore {
  constructor() {
    this.kind = 'memory';
    this.rooms = new Map();
    this.listeners = new Set();
    this.locks = new Map();
  }

  async get(room) {
    return clone(this.rooms.get(room));
  }

  async set(room, state) {
    this.rooms.set(room, clone(state));
  }

  async publish(room) {
    for (const listener of this.listeners) await listener(room);
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async withLock(room, work) {
    const previous = this.locks.get(room) || Promise.resolve();
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    this.locks.set(room, previous.then(() => gate));
    await previous;
    try {
      return await work();
    } finally {
      release();
    }
  }

  async ping() { return 'PONG'; }
  async close() {}
}

export class RedisRoomStore {
  constructor(url, { redis } = {}) {
    this.kind = 'redis';
    this.redis = redis || new Redis(url, { maxRetriesPerRequest: 3, enableReadyCheck: true });
    this.subscriber = this.redis.duplicate();
    this.listeners = new Set();
    this.subscriber.on('message', (_channel, payload) => {
      let event;
      try { event = JSON.parse(payload); } catch { return; }
      if (!cleanRoom(event.room)) return;
      for (const listener of this.listeners) void listener(event.room);
    });
    this.subscriber.subscribe(CHANNEL).catch(error => console.error('Commander Live Redis subscribe failed:', error));
  }

  async get(room) {
    const value = await this.redis.get(roomKey(room));
    return value ? JSON.parse(value) : null;
  }

  async set(room, state, lease) {
    // The lease can expire while a worker is suspended or waiting for Redis.
    // Check ownership atomically with the write, not just when releasing it.
    const written = lease && await this.redis.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then redis.call('set', KEYS[2], ARGV[2], 'EX', ARGV[3]); return 1 else return 0 end",
      2, lockKey(room), roomKey(room), lease, JSON.stringify(state), ROOM_TTL_SECONDS,
    );
    if (!written) throw Object.assign(new Error('The room changed while waiting. Retrying.'), { code: 'ROOM_BUSY' });
  }

  async publish(room) {
    await this.redis.publish(CHANNEL, JSON.stringify({ room }));
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async withLock(room, work) {
    const key = lockKey(room);
    const token = randomUUID();
    let acquired = false;
    // A worker can disappear with its lease still live. Wait beyond that lease
    // before returning temporary contention to a replacement connection.
    const deadline = Date.now() + ROOM_LOCK_WAIT_MS;
    for (let attempt = 0; Date.now() < deadline; attempt++) {
      acquired = (await this.redis.set(key, token, 'PX', ROOM_LOCK_TTL_MS, 'NX')) === 'OK';
      if (acquired) break;
      await delay(Math.min(200, 20 + attempt * 5));
    }
    if (!acquired) {
      const error = new Error('The room is busy. Waiting to retry.');
      error.code = 'ROOM_BUSY';
      throw error;
    }
    const renewal = setInterval(() => {
      void this.redis.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end",
        1, key, token, ROOM_LOCK_TTL_MS,
      ).catch(() => {}); // The fenced write rejects a lost lease safely.
    }, Math.floor(ROOM_LOCK_TTL_MS / 3));
    renewal.unref();
    try {
      return await work(token);
    } finally {
      clearInterval(renewal);
      await this.redis.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        1, key, token,
      ).catch(() => {}); // Cleanup failure must not reject a durable commit.
    }
  }

  async ping() { return this.redis.ping(); }
  async close() {
    await Promise.allSettled([this.subscriber.quit(), this.redis.quit()]);
  }
}

class MissingRoomStore {
  constructor() { this.kind = 'missing'; }
  async get() { throw new Error('REDIS_URL is not configured.'); }
  async set() { throw new Error('REDIS_URL is not configured.'); }
  async publish() {}
  subscribe() { return () => {}; }
  async withLock(_room, work) { return work(); }
  async ping() { throw new Error('REDIS_URL is not configured.'); }
  async close() {}
}

export function createMemoryRoomStore() {
  return new MemoryRoomStore();
}

export function createRoomStoreFromEnv(env = process.env) {
  if (databaseUrl(env)) return new PostgresRoomStore(databaseUrl(env), { directUrl: directDatabaseUrl(env) });
  const url = env.REDIS_URL || env.KV_URL || env.UPSTASH_REDIS_URL;
  return url ? new RedisRoomStore(url) : new MissingRoomStore();
}

function safeSend(ws, payload) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(payload));
}

function assignConnection(state, playerId, connectionId) {
  let seat = state.seats.find(item => item.playerId === playerId);
  if (!seat) {
    if (state.phase !== 'lobby') throw new Error('The game already started.');
    seat = state.seats.find(item => item.kind === 'human' && !item.playerId);
    if (!seat) throw new Error(`This ${state.seats.length}-player room is full.`);
    seat.playerId = playerId;
  }
  seat.connected = true;
  seat.connectionId = connectionId;
  state.revision += 1;
  state.lastEvent = { type: 'connected', seat: seat.seat, revision: state.revision };
  return seat;
}

export function createCommanderLiveServer({
  store = createRoomStoreFromEnv(),
  allowedOrigins = parseAllowedOrigins(process.env.LIVE_ALLOWED_ORIGINS),
  maxClients = Number(process.env.LIVE_MAX_CONNECTIONS) || 0,
  heartbeatMs = 30_000,
} = {}) {
  const app = express();
  const server = createServer(app);
  const clients = new Set();
  // Disconnect updates still being written; a shutdown waits for them.
  const pending = new Set();
  let closing = false;

  app.get('/api/ws', async (request, response) => {
    response.set('Cache-Control', 'no-store');
    // The landing page reads this health answer from the game's own origin.
    const origin = request.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
      response.set('Access-Control-Allow-Origin', origin);
      response.vary('Origin');
    }
    try {
      await store.ping();
      response.status(200).json({ ok: true, service: 'commander-live', storage: store.kind, minPlayers: 2, maxPlayers: 4 });
    } catch {
      response.status(503).json({ ok: false, service: 'commander-live', error: 'Live room storage is unavailable.' });
    }
  });

  const wss = new WebSocketServer({
    server,
    maxPayload: MAX_MESSAGE_BYTES,
    verifyClient({ origin, req }, done) {
      if (closing) return done(false, 503, 'Live server is restarting');
      if (maxClients > 0 && clients.size >= maxClients) return done(false, 503, 'Live server is full');
      const requestHost = String(req.headers['x-forwarded-host'] || req.headers.host || '');
      const allowed = originAllowed(origin, requestHost, allowedOrigins);
      return done(allowed, allowed ? 200 : 403, 'Origin not allowed');
    },
  });

  // A connection that stays open for hours can die without a close frame (a
  // sleeping laptop, a dropped mobile link). Ping every connection; one that
  // did not answer the previous ping is ended, and its seat is marked away.
  let heartbeat = null;
  const beat = () => {
    for (const client of clients) {
      if (client.alive === false) { client.ws.terminate(); continue; }
      client.alive = false;
      try { client.ws.ping(); } catch { /* the close handler follows */ }
    }
  };

  const sendState = (client, state) => {
    if (!client.playerId) return;
    // Cross-worker reads/publications can finish out of order. An older
    // connection ID must never eject a seat whose newer join was accepted.
    if (state.revision < client.lastRevision) return;
    client.lastRevision = state.revision;
    const seat = state.seats.find(item => item.playerId === client.playerId);
    if (!seat || seat.connectionId !== client.connectionId) {
      // A reconnect replaces the old transport. Never send a private view to
      // a superseded socket, including one attached to a different instance.
      client.ws.close(4001, 'This seat reconnected in another connection.');
      return;
    }
    safeSend(client.ws, {
      type: 'state',
      status: 'playing',
      actionAcks: true,
      actionReplay: true,
      // playerId is the anonymous seat's reconnect capability. It must stay
      // server-side; the filtered view already contains public seat numbers.
      view: viewFor(state, client.playerId),
    });
  };

  const broadcastLocal = (room, state) => {
    for (const client of clients) {
      if (client.room === room) sendState(client, state);
    }
  };

  let unsubscribe;
  const onRoomChanged = async room => {
    try {
      if (![...clients].some(client => client.room === room && client.playerId)) return;
      const state = await store.get(room);
      if (state) broadcastLocal(room, state);
    } catch (error) {
      console.error('Commander Live room broadcast failed:', error);
    }
  };

  const commit = async (room, work, onStored) => {
    let next;
    await store.withLock(room, async lease => {
      const current = await store.get(room);
      next = await work(current);
      if (next) {
        await store.set(room, next, lease);
      }
    });
    if (next) {
      onStored?.();
      broadcastLocal(room, next);
      // The mutation is already durable. A notification failure must not turn
      // a committed action into a rejection that could be applied again.
      for (let attempt = 0; attempt < 3; attempt++) {
        try { await store.publish(room); break; }
        catch (error) {
          if (attempt < 2) await delay(100 * (attempt + 1));
          else console.error('Commander Live notification failed after commit:', error.message);
        }
      }
    }
    return next;
  };

  wss.on('connection', (ws, request) => {
    const url = new URL(request.url || '/', 'http://commander.local');
    const room = cleanRoom(url.searchParams.get('room'));
    const mayCreate = url.searchParams.get('create') === '1';
    const playerCount = cleanPlayerCount(url.searchParams.get('players'));
    if (!room) {
      safeSend(ws, { type: 'error', error: 'Invalid private room code.' });
      ws.close(1008, 'Invalid room');
      return;
    }

    const client = {
      ws, room, mayCreate, playerId: null, connectionId: randomUUID(),
      chain: Promise.resolve(), windowStartedAt: Date.now(), messages: 0, lastRevision: -1, alive: true,
    };
    clients.add(client);
    ws.on('pong', () => { client.alive = true; });
    if (heartbeatMs > 0 && !heartbeat) {
      heartbeat = setInterval(beat, heartbeatMs);
      heartbeat.unref();
    }
    if (!unsubscribe) unsubscribe = store.subscribe(onRoomChanged);

    const handleJoin = async message => {
      const playerId = cleanPlayerId(message.playerId);
      if (!playerId) throw new Error('Invalid player identity.');
      if (client.playerId && client.playerId !== playerId) throw new Error('A connection cannot change its player identity.');
      const joined = await commit(room, state => {
        if (ws.readyState !== WebSocket.OPEN) throw new Error('This connection is closed.');
        if (client.playerId && state?.seats.find(item => item.playerId === playerId)?.connectionId !== client.connectionId) {
          throw new Error('This connection no longer owns the seat. Open a new connection to reconnect.');
        }
        if (!state) {
          if (!client.mayCreate) throw new Error('This private room does not exist or expired.');
          state = setup([playerId], { playerCount });
        } else {
          state = clone(state);
        }
        assignConnection(state, playerId, client.connectionId);
        return state;
      }, () => {
        // Bind after durable acceptance but before awaited publication. A
        // newer state arriving during publication must reach this socket.
        // Rejected joins never subscribe to private room broadcasts.
        client.playerId = playerId;
      });
      if (ws.readyState === WebSocket.OPEN) sendState(client, joined);
      else {
        await commit(room, state => {
          const seat = state?.seats.find(item => item.playerId === playerId);
          if (!seat || seat.connectionId !== client.connectionId) return null;
          return applyAction(state, playerId, { type: 'presence', connected: false });
        });
      }
      return joined;
    };

    const handleAction = async message => {
      if (!client.playerId) throw new Error('Join the room before sending actions.');
      if (!message.action || typeof message.action !== 'object' || Array.isArray(message.action)) {
        throw new Error('Invalid room action.');
      }
      const replayId = typeof message.requestId === 'string' && message.requestId.startsWith('action:v1:')
        ? message.requestId : null;
      if (replayId && (!/^action:v1:[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}:[1-9]\d{0,15}$/i.test(replayId) ||
        !Number.isSafeInteger(Number(replayId.split(':').at(-1))))) throw new Error('Invalid replay request identity.');
      const digest = replayId ? createHash('sha256').update(JSON.stringify(message.action)).digest('hex') : null;
      let deferred = false;
      await commit(room, state => {
        if (ws.readyState !== WebSocket.OPEN) throw new Error('This connection is closed.');
        if (!state) throw new Error('This private room expired.');
        const seat = state.seats.find(item => item.playerId === client.playerId);
        if (!seat || seat.connectionId !== client.connectionId) throw new Error('This connection no longer owns the seat. Reconnect to continue.');
        const receipts = state.actionReceipts?.[seat.seat] || [];
        const receipt = replayId && receipts.find(item => item.requestId === replayId);
        if (receipt) {
          if (receipt.digest !== digest) throw new Error('A replay request cannot change its action.');
          // A lost acknowledgement may arrive after a decision was answered.
          // Never apply the old action again or erase the newer decision.
          return null;
        }
        if (replayId && state.phase === 'paused' && RUNNING_ACTIONS.has(message.action.type)) {
          deferred = true;
          return null;
        }
        const result = validateAction(state, client.playerId, message.action);
        if (!result || result.ok !== true) throw new Error(result && result.error || 'The room rejected the action.');
        const next = applyAction(state, client.playerId, message.action);
        if (replayId) {
          // Stored with the mutation under the same room lock. This stays out
          // of viewFor's allowlisted public/private presentation fields.
          next.actionReceipts ||= {};
          next.actionReceipts[seat.seat] = [...receipts, { requestId: replayId, digest }].slice(-MAX_ACTION_RECEIPTS);
        }
        return next;
      });
      return { deferred };
    };

    ws.on('message', data => {
      client.alive = true;
      const now = Date.now();
      if (now - client.windowStartedAt > 60_000) {
        client.windowStartedAt = now;
        client.messages = 0;
      }
      client.messages += 1;
      if (client.messages > 600) {
        safeSend(ws, { type: 'error', error: 'Too many room messages.' });
        ws.close(1008, 'Rate limit');
        return;
      }
      client.chain = client.chain.then(async () => {
        let message;
        try { message = JSON.parse(String(data)); } catch { throw new Error('Invalid JSON message.'); }
        if (message.type === 'join') return handleJoin(message);
        if (message.type === 'action') {
          const requestId = typeof message.requestId === 'string' ? message.requestId.slice(0, 100) : null;
          try {
            const result = await handleAction(message);
            // A room broadcast may include another player's newer revision.
            // Confirm this exact action independently of broadcast ordering.
            if (requestId) safeSend(ws, result.deferred
              ? { type: 'actionDeferred', requestId, reason: 'paused' }
              : { type: 'actionAck', requestId });
          } catch (error) {
            safeSend(ws, error.code === 'ROOM_BUSY' && requestId?.startsWith('action:v1:')
              ? { type: 'actionDeferred', requestId, reason: 'busy', retryAfterMs: 1000 }
              : { type: 'error', requestId, error: error.message || String(error) });
          }
          return;
        }
        throw new Error('Unsupported room message.');
      }).catch(error => safeSend(ws, {
        type: 'error', error: error.message || String(error),
        ...(error.code === 'ROOM_BUSY' ? { code: 'ROOM_BUSY', retryAfterMs: 1000 } : {}),
      }));
    });

    ws.on('close', () => {
      clients.delete(client);
      if (!clients.size) {
        unsubscribe?.(); unsubscribe = undefined;
        clearInterval(heartbeat); heartbeat = null;
      }
      if (!client.playerId) return;
      const update = commit(room, state => {
        if (!state) return null;
        const seat = state.seats.find(item => item.playerId === client.playerId);
        if (!seat || seat.connectionId !== client.connectionId || seat.connected === false) return null;
        const result = validateAction(state, client.playerId, { type: 'presence', connected: false });
        return result && result.ok ? applyAction(state, client.playerId, { type: 'presence', connected: false }) : null;
      }).catch(error => console.error('Commander Live disconnect update failed:', error));
      pending.add(update);
      void update.finally(() => pending.delete(update));
    });
  });

  let storeClosed = null;
  const closeStore = () => storeClosed ||= Promise.resolve().then(() => store.close())
    .catch(error => console.error('Commander Live storage did not close cleanly:', error.code || error.message));
  server.on('close', () => {
    unsubscribe?.();
    clearInterval(heartbeat);
    void closeStore();
  });

  // An always-on host stops the process to deploy. Players are told the
  // service is restarting (1012) and reconnect by themselves; every seat is
  // stored as away before the storage connection closes, so the room is
  // paused, never left showing a player who is no longer there.
  const shutdown = async ({ timeoutMs = 8000 } = {}) => {
    closing = true;
    const deadline = Date.now() + timeoutMs;
    for (const client of clients) client.ws.close(1012, 'Server restarting');
    while (clients.size && Date.now() < deadline) await delay(20);
    for (const client of clients) client.ws.terminate();
    while (clients.size && Date.now() < deadline + 1000) await delay(20);
    await Promise.allSettled([...pending]);
    await new Promise(resolve => wss.close(() => resolve()));
    if (server.listening) {
      await new Promise(resolve => {
        server.close(() => resolve());
        server.closeAllConnections?.();
      });
    }
    await closeStore();
  };
  server.commanderLive = { store, wss, clients, shutdown, allowedOrigins };
  return server;
}

const server = createCommanderLiveServer();
export default server;
