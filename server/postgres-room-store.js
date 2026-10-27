import pg from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createDatabasePool, connectionOptions, transaction } from './postgres.js';

const CHANNEL = 'commander_live_rooms';
const busy = () => Object.assign(new Error('The room changed while waiting. Retrying.'), { code: 'ROOM_BUSY' });

export class PostgresRoomStore {
  constructor(connectionString, { pool, directUrl = connectionString } = {}) {
    this.kind = 'postgres';
    this.pool = pool || createDatabasePool(connectionString);
    this.directUrl = directUrl;
    this.context = new AsyncLocalStorage();
    this.listeners = new Set();
    this.observedRooms = new Set();
    this.subscriber = null;
    this.connecting = null;
    this.retry = null;
    this.closed = false;
  }

  async ping() {
    await this.pool.query('SELECT 1 FROM commander.live_rooms LIMIT 1');
    return 'PONG';
  }

  async get(room) {
    if (this.listeners.size) this.observedRooms.add(room);
    const { rows } = await (this.context.getStore()?.client || this.pool).query(
      'SELECT state FROM commander.live_rooms WHERE room=$1 AND expires_at>now()', [room]);
    return rows[0]?.state || null;
  }

  async set(room, state, lease) {
    const context = this.context.getStore();
    if (!context || context !== lease || !context.active || context.room !== room) throw busy();
    await context.client.query(`INSERT INTO commander.live_rooms(room,state,expires_at)
      VALUES ($1,$2::jsonb,now()+interval '24 hours') ON CONFLICT (room)
      DO UPDATE SET state=excluded.state,expires_at=excluded.expires_at`, [room, JSON.stringify(state)]);
  }

  async withLock(room, work) {
    // Subscribe before the initial read so remote commits cannot fall into a startup gap.
    if (this.listeners.size) await this.ready();
    try {
      return await transaction(this.pool, async client => {
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended('commander-live:' || $1,0))", [room]);
        const lease = { client, room, active: true };
        try { return await this.context.run(lease, () => work(lease)); }
        finally { lease.active = false; }
      });
    } catch (error) {
      if (['55P03', '57014', '25P03', '57P01', '08006'].includes(error.code)) throw busy();
      throw error;
    }
  }

  async publish(room) { await this.pool.query('SELECT pg_notify($1,$2)', [CHANNEL, room]); }

  notify(room) {
    if (!/^[a-z0-9-]{12,64}$/.test(room)) return;
    for (const listener of this.listeners) {
      Promise.resolve().then(() => listener(room))
        .catch(error => console.error('Commander Live notification failed:', error.code || 'listener error'));
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    void this.ready().catch(() => {}); // withLock awaits readiness and reports connection failures.
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) {
        clearTimeout(this.retry);
        this.retry = null;
        this.observedRooms.clear();
        const client = this.subscriber;
        this.subscriber = null;
        if (client) void client.end().catch(() => {});
      }
    };
  }

  ready() {
    if (this.closed) return Promise.reject(new Error('Room storage is closed.'));
    if (this.connecting) return this.connecting;
    if (this.subscriber || !this.listeners.size) return Promise.resolve();
    clearTimeout(this.retry);
    const client = new pg.Client({ ...connectionOptions(this.directUrl),
      keepAlive: true, keepAliveInitialDelayMillis: 10000, application_name: 'commander-live-listener' });
    this.subscriber = client;
    const disconnected = () => {
      if (this.subscriber !== client) return;
      this.subscriber = null;
      void client.end().catch(() => {});
      this.scheduleReconnect();
    };
    client.on('error', disconnected);
    client.on('end', disconnected);
    client.on('notification', event => {
      if (event.channel === CHANNEL) this.notify(event.payload);
    });
    this.connecting = (async () => {
      try {
        await client.connect();
        await client.query(`LISTEN ${CHANNEL}`);
        if (this.subscriber !== client || !this.listeners.size || this.closed) {
          if (this.subscriber === client) this.subscriber = null;
          await client.end();
          return;
        }
        // Re-read rooms after reconnect: NOTIFY is transient, room state is durable.
        for (const room of this.observedRooms) this.notify(room);
      } catch (error) {
        if (this.subscriber === client) this.subscriber = null;
        await client.end().catch(() => {});
        this.scheduleReconnect();
        throw error;
      } finally {
        this.connecting = null;
        if (!this.subscriber && this.listeners.size && !this.closed) this.scheduleReconnect();
      }
    })();
    return this.connecting;
  }

  scheduleReconnect() {
    if (this.closed || !this.listeners.size || this.retry) return;
    this.retry = setTimeout(() => {
      this.retry = null;
      void this.ready().catch(() => {});
    }, 1000);
    this.retry.unref();
  }

  async close() {
    this.closed = true;
    this.listeners.clear();
    clearTimeout(this.retry);
    const client = this.subscriber;
    this.subscriber = null;
    if (client) await client.end().catch(() => {});
    if (this.connecting) await this.connecting.catch(() => {});
    await this.pool.end();
  }
}
