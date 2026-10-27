import pg from 'pg';
import { attachDatabasePool } from '@vercel/functions';

export function databaseUrl(env = process.env) {
  return env.DATABASE_URL || env.POSTGRES_URL;
}

export function directDatabaseUrl(env = process.env) {
  return env.DATABASE_URL_UNPOOLED || env.POSTGRES_URL_NON_POOLING || databaseUrl(env);
}

export function connectionOptions(connectionString) {
  const url = new URL(connectionString);
  // Preserve explicit certificate verification across driver upgrades.
  if (['require', 'prefer', 'verify-ca'].includes(url.searchParams.get('sslmode')))
    url.searchParams.set('sslmode', 'verify-full');
  return { connectionString: url.toString(), connectionTimeoutMillis: 15000 };
}

export function createDatabasePool(connectionString = databaseUrl()) {
  if (!connectionString) throw new Error('DATABASE_URL is not configured.');
  const pool = new pg.Pool({ ...connectionOptions(connectionString), max: 5,
    idleTimeoutMillis: 5000, allowExitOnIdle: true });
  pool.on('error', error => console.error('Commander database connection failed:', error.code || 'connection error'));
  if (process.env.VERCEL) attachDatabasePool(pool);
  return pool;
}

export async function transaction(pool, work) {
  const client = await pool.connect();
  // An idle transaction must never retain a room or account lock indefinitely.
  client.on('error', onError);
  function onError() {}
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '6500ms'");
    await client.query("SET LOCAL statement_timeout = '15s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout = '15s'");
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.removeListener('error', onError);
    client.release();
  }
}
