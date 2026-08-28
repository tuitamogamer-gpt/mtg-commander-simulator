import express from 'express';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import Redis from 'ioredis';
import { setup, validateAction, applyAction, viewFor } from '../logic.js';

const ROOM_TTL_SECONDS = 24 * 60 * 60;
const MAX_MESSAGE_BYTES = 2_100_000;
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

class RedisRoomStore {
  constructor(url) {
    this.kind = 'redis';
    this.redis = new Redis(url, { maxRetriesPerRequest: 3, enableReadyCheck: true });
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

  async set(room, state) {
    await this.redis.set(roomKey(room), JSON.stringify(state), 'EX', ROOM_TTL_SECONDS);
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
    for (let attempt = 0; attempt < 30; attempt++) {
      acquired = (await this.redis.set(key, token, 'PX', 5000, 'NX')) === 'OK';
      if (acquired) break;
      await delay(20 + attempt * 5);
    }
    if (!acquired) throw new Error('The room is busy. Try the action again.');
    try {
      return await work();
    } finally {
      await this.redis.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        1, key, token,
      );
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
  const url = env.REDIS_URL || env.KV_URL || env.UPSTASH_REDIS_URL;
  return url ? new RedisRoomStore(url) : new MissingRoomStore();
}

function safeSend(ws, payload) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(payload));
}

function roomPlayerIds(state) {
  return state.seats.slice(0, 2).map(seat => seat.playerId).filter(Boolean);
}

function assignConnection(state, playerId, connectionId) {
  let seat = state.seats.slice(0, 2).find(item => item.playerId === playerId);
  if (!seat) {
    if (state.phase !== 'lobby') throw new Error('The game already started.');
    seat = state.seats.slice(0, 2).find(item => !item.playerId);
    if (!seat) throw new Error('The two human seats are full.');
    seat.playerId = playerId;
  }
  seat.connected = true;
  seat.connectionId = connectionId;
  state.revision += 1;
  state.lastEvent = { type: 'connected', seat: seat.seat, revision: state.revision };
  return seat;
}

export function createCommanderLiveServer({ store = createRoomStoreFromEnv() } = {}) {
  const app = express();
  const server = createServer(app);
  const clients = new Set();

  app.get('/api/ws', async (_request, response) => {
    response.set('Cache-Control', 'no-store');
    try {
      await store.ping();
      response.status(200).json({ ok: true, service: 'commander-live', storage: store.kind });
    } catch {
      response.status(503).json({ ok: false, service: 'commander-live', error: 'Live room storage is unavailable.' });
    }
  });

  const wss = new WebSocketServer({
    server,
    maxPayload: MAX_MESSAGE_BYTES,
    verifyClient({ origin, req }, done) {
      if (!origin) return done(true);
      try {
        const originHost = new URL(origin).host;
        const requestHost = String(req.headers['x-forwarded-host'] || req.headers.host || '');
        return done(originHost === requestHost, originHost === requestHost ? 200 : 403, 'Origin not allowed');
      } catch {
        return done(false, 403, 'Origin not allowed');
      }
    },
  });

  const sendState = (client, state) => {
    if (!client.playerId) return;
    safeSend(client.ws, {
      type: 'state',
      status: 'playing',
      seats: roomPlayerIds(state),
      you: client.playerId,
      view: viewFor(state, client.playerId),
    });
  };

  const broadcastLocal = (room, state) => {
    for (const client of clients) {
      if (client.room === room) sendState(client, state);
    }
  };

  const unsubscribe = store.subscribe(async room => {
    try {
      const state = await store.get(room);
      if (state) broadcastLocal(room, state);
    } catch (error) {
      console.error('Commander Live room broadcast failed:', error);
    }
  });

  const commit = async (room, work) => {
    let next;
    await store.withLock(room, async () => {
      const current = await store.get(room);
      next = await work(current);
      if (next) await store.set(room, next);
    });
    if (next) {
      broadcastLocal(room, next);
      await store.publish(room);
    }
    return next;
  };

  wss.on('connection', (ws, request) => {
    const url = new URL(request.url || '/', 'http://commander.local');
    const room = cleanRoom(url.searchParams.get('room'));
    const mayCreate = url.searchParams.get('create') === '1';
    if (!room) {
      safeSend(ws, { type: 'error', error: 'Invalid private room code.' });
      ws.close(1008, 'Invalid room');
      return;
    }

    const client = {
      ws, room, mayCreate, playerId: null, connectionId: randomUUID(),
      chain: Promise.resolve(), windowStartedAt: Date.now(), messages: 0,
    };
    clients.add(client);

    const handleJoin = async message => {
      const playerId = cleanPlayerId(message.playerId);
      if (!playerId) throw new Error('Invalid player identity.');
      client.playerId = playerId;
      return commit(room, state => {
        if (!state) {
          if (!client.mayCreate) throw new Error('This private room does not exist or expired.');
          state = setup([playerId]);
        } else {
          state = clone(state);
        }
        assignConnection(state, playerId, client.connectionId);
        return state;
      });
    };

    const handleAction = async message => {
      if (!client.playerId) throw new Error('Join the room before sending actions.');
      if (!message.action || typeof message.action !== 'object' || Array.isArray(message.action)) {
        throw new Error('Invalid room action.');
      }
      return commit(room, state => {
        if (!state) throw new Error('This private room expired.');
        const result = validateAction(state, client.playerId, message.action);
        if (!result || result.ok !== true) throw new Error(result && result.error || 'The room rejected the action.');
        return applyAction(state, client.playerId, message.action);
      });
    };

    ws.on('message', data => {
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
        if (message.type === 'action') return handleAction(message);
        throw new Error('Unsupported room message.');
      }).catch(error => safeSend(ws, { type: 'error', error: error.message || String(error) }));
    });

    ws.on('close', () => {
      clients.delete(client);
      if (!client.playerId) return;
      void commit(room, state => {
        if (!state) return null;
        const seat = state.seats.slice(0, 2).find(item => item.playerId === client.playerId);
        if (!seat || seat.connectionId !== client.connectionId || seat.connected === false) return null;
        const result = validateAction(state, client.playerId, { type: 'presence', connected: false });
        return result && result.ok ? applyAction(state, client.playerId, { type: 'presence', connected: false }) : null;
      }).catch(error => console.error('Commander Live disconnect update failed:', error));
    });
  });

  server.on('close', () => {
    unsubscribe();
    void store.close();
  });
  server.commanderLive = { store, wss, clients };
  return server;
}

const server = createCommanderLiveServer();
export default server;
