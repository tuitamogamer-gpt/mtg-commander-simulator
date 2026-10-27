import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createDatabasePool, directDatabaseUrl } from '../server/postgres.js';

export async function migrateSchema(pool) {
  await pool.query(await readFile(new URL('../server/migrations/001-commander.sql', import.meta.url), 'utf8'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pool = createDatabasePool(directDatabaseUrl());
  try {
    await migrateSchema(pool);
    console.log('Commander PostgreSQL schema is ready.');
  } catch (error) {
    console.error('Schema migration failed:', error.code || 'connection/schema error');
    process.exitCode = 1;
  } finally { await pool.end(); }
}
