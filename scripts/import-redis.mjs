import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createDatabasePool, directDatabaseUrl, transaction } from '../server/postgres.js';
import { normalizedProfile, publicStoredDeck, importedDeckNameKey } from '../server/account-records.js';

const PREFIX = 'commander-account:v1:';
const ROOM_PREFIX = 'commander-live:room:';
const json = JSON.stringify;
const fail = message => { throw new Error(message); };
const decode = value => typeof value === 'string' ? JSON.parse(value) : value;
const hash = record => {
  if (!record) return {};
  if (record.type !== 'hash' || !Array.isArray(record.value) || record.value.length % 2) fail('Invalid hash record.');
  return Object.fromEntries(Array.from({ length: record.value.length / 2 }, (_, i) => record.value.slice(i * 2, i * 2 + 2)));
};

export function parseSnapshot(bytes, { now = Date.now(), expectedFingerprint } = {}) {
  const snapshot = JSON.parse(bytes.toString());
  if (snapshot.format !== 'commander-redis-export/v1' || !Array.isArray(snapshot.records)) fail('Unsupported export format.');
  if (!/^[a-f0-9]{64}$/.test(snapshot.sourceFingerprint || '')) fail('Export has no valid source fingerprint.');
  if (expectedFingerprint && snapshot.sourceFingerprint !== expectedFingerprint) fail('Export source does not match the production database.');
  const records = new Map();
  for (const record of snapshot.records) {
    if (typeof record.key !== 'string' || records.has(record.key)) fail('Duplicate or invalid export key.');
    if (record.expiresAt !== null && !Number.isFinite(record.expiresAt)) fail('Invalid export expiry.');
    records.set(record.key, record);
  }
  const live = record => record.expiresAt === null || record.expiresAt > now;
  const value = (key, type, fallback) => {
    const record = records.get(PREFIX + key);
    if (!record || !live(record)) return fallback;
    if (record.type !== type) fail('Unexpected account record type.');
    return record.value;
  };
  const accounts = [], sessions = [], completed = [], decks = [], rooms = [];
  const users = new Map();
  for (const record of records.values()) {
    if (!record.key.startsWith(PREFIX + 'user:') || !live(record)) continue;
    if (record.type !== 'string') fail('Invalid identity record.');
    const user = decode(record.value), id = record.key.slice((PREFIX + 'user:').length);
    if (!user || user.id !== id || !user.emailHash || !user.passwordHash || !user.passwordSalt) fail('Incomplete account identity.');
    const emailIndex = value('email:' + user.emailHash, 'string', null);
    if (emailIndex !== id) fail('Account email index does not match its identity.');
    users.set(id, user);
  }
  for (const [id, user] of users) {
    const profile = normalizedProfile(hash(records.get(PREFIX + 'profile:' + id)));
    delete profile.winRate;
    const commanders = Object.fromEntries(Object.entries(hash(records.get(PREFIX + 'commanders:' + id))).map(([name, count]) => [name, Math.max(0, Number(count) || 0)]));
    const favorites = value('favorites:' + id, 'set', []).map(String);
    const recent = value('recent:' + id, 'list', []).map(decode);
    const save = decode(value('save:' + id, 'string', null));
    accounts.push({ id, user, profile, commanders, favorites, recent, save });
    for (const [deckId, raw] of Object.entries(hash(records.get(PREFIX + 'decks:' + id)))) {
      const deck = publicStoredDeck(decode(raw));
      if (!deck || deck.id !== deckId || typeof deck.name !== 'string') fail('Invalid imported deck identity.');
      decks.push({ userId: id, deck });
    }
    const done = records.get(PREFIX + 'completed:' + id);
    if (done && live(done)) {
      if (done.type !== 'set' || !Array.isArray(done.value)) fail('Invalid completed-match set.');
      for (const matchId of done.value) completed.push({ userId: id, matchId, expiresAt: done.expiresAt });
    }
  }
  for (const record of records.values()) {
    if (!live(record)) continue;
    if (record.key.startsWith(ROOM_PREFIX)) {
      if (record.type !== 'string') fail('Invalid Live room record.');
      const room = record.key.slice(ROOM_PREFIX.length);
      if (!/^[a-z0-9-]{12,64}$/.test(room)) fail('Invalid Live room identity.');
      rooms.push({ room, state: decode(record.value), expiresAt: record.expiresAt });
      continue;
    }
    if (!record.key.startsWith(PREFIX)) fail('Unrecognized export namespace.');
    const suffix = record.key.slice(PREFIX.length), colon = suffix.indexOf(':');
    const kind = suffix.slice(0, colon), id = suffix.slice(colon + 1);
    if (kind === 'ratelimit') continue; // Transient auth counters restart with the same enforced limit.
    if (kind === 'session') {
      if (record.type !== 'string') fail('Invalid session type.');
      const session = decode(record.value);
      if (!users.has(session?.userId)) fail('An active session has no account.');
      sessions.push({ tokenHash: id, record: session, expiresAt: record.expiresAt });
    } else if (kind === 'email') {
      if (users.get(record.value)?.emailHash !== id) fail('Orphaned email index.');
    } else if (['user', 'profile', 'commanders', 'favorites', 'recent', 'save', 'completed', 'decks', 'deck-names'].includes(kind)) {
      if (!users.has(id)) fail('An account record has no identity.');
    } else fail('Unknown account data; refusing an incomplete migration.');
  }
  return { checksum: createHash('sha256').update(bytes).digest('hex'), accounts, sessions, completed, decks, rooms,
    counts: { accounts: accounts.length, sessions: sessions.length, completed: completed.length, decks: decks.length, rooms: rooms.length,
      saves: accounts.filter(account => account.save).length } };
}

export async function importSnapshot(pool, bytes, options = {}) {
  const data = parseSnapshot(bytes, options);
  const expiry = value => value === null ? 'infinity' : new Date(value).toISOString();
  return transaction(pool, async client => {
    // Import only into an unused target. The table locks also exclude application writes.
    await client.query('LOCK TABLE commander.accounts,commander.sessions,commander.completed_matches,commander.decks,commander.live_rooms,commander.imports IN ACCESS EXCLUSIVE MODE');
    const previous = await client.query('SELECT counts FROM commander.imports WHERE checksum=$1', [data.checksum]);
    if (previous.rowCount) return { alreadyImported: true, ...previous.rows[0].counts, checksum: data.checksum };
    const occupied = await client.query(`SELECT (SELECT count(*) FROM commander.accounts)+(SELECT count(*) FROM commander.live_rooms)
      +(SELECT count(*) FROM commander.imports) AS records`);
    if (Number(occupied.rows[0].records)) fail('Target is not empty; refusing to overwrite existing data.');
    for (const row of data.accounts) {
      await client.query(`INSERT INTO commander.accounts(id,email_hash,identity,profile,commanders,favorites,recent,save)
        VALUES ($1,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb)`,
      [row.id, row.user.emailHash, json(row.user), json(row.profile), json(row.commanders), json(row.favorites), json(row.recent), row.save ? json(row.save) : null]);
    }
    for (const row of data.sessions) await client.query(`INSERT INTO commander.sessions(token_hash,user_id,record,expires_at)
      VALUES ($1,$2,$3::jsonb,$4)`, [row.tokenHash, row.record.userId, json(row.record), expiry(row.expiresAt)]);
    for (const row of data.completed) await client.query(`INSERT INTO commander.completed_matches(user_id,match_id,expires_at)
      VALUES ($1,$2,$3)`, [row.userId, row.matchId, expiry(row.expiresAt)]);
    for (const { userId, deck } of data.decks) await client.query(`INSERT INTO commander.decks(user_id,id,name_key,record)
      VALUES ($1,$2,$3,$4::jsonb)`, [userId, deck.id, importedDeckNameKey(deck.name), json(deck)]);
    for (const row of data.rooms) await client.query('INSERT INTO commander.live_rooms(room,state,expires_at) VALUES ($1,$2::jsonb,$3)',
      [row.room, json(row.state), expiry(row.expiresAt)]);
    // Validate imported identities byte-for-byte as JSON values, including password hashes.
    for (const row of data.accounts) {
      const checked = await client.query(`SELECT identity=$2::jsonb AND profile=$3::jsonb AND commanders=$4::jsonb
        AND favorites=$5::jsonb AND recent=$6::jsonb AND save IS NOT DISTINCT FROM $7::jsonb AS valid
        FROM commander.accounts WHERE id=$1`, [row.id, json(row.user), json(row.profile), json(row.commanders),
        json(row.favorites), json(row.recent), row.save ? json(row.save) : null]);
      if (!checked.rows[0]?.valid) fail('Imported account verification failed.');
    }
    for (const [table, expected] of [['accounts',data.counts.accounts], ['sessions',data.counts.sessions],
      ['completed_matches',data.counts.completed], ['decks',data.counts.decks], ['live_rooms',data.counts.rooms]]) {
      const result = await client.query(`SELECT count(*) AS count FROM commander.${table}`);
      if (Number(result.rows[0].count) !== expected) fail('Imported record count verification failed.');
    }
    await client.query('INSERT INTO commander.imports(checksum,counts) VALUES ($1,$2::jsonb)', [data.checksum, json(data.counts)]);
    return { alreadyImported: false, ...data.counts, checksum: data.checksum };
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2];
  if (!file || !process.env.MTG_SOURCE_FINGERPRINT) {
    console.error('Usage: MTG_SOURCE_FINGERPRINT=<verified-source-sha256> node scripts/import-redis.mjs /private/export.json');
    process.exitCode = 1;
  } else {
    const pool = createDatabasePool(directDatabaseUrl());
    try {
      console.log(JSON.stringify(await importSnapshot(pool, await readFile(file), { expectedFingerprint: process.env.MTG_SOURCE_FINGERPRINT })));
    } catch (error) {
      console.error('Import failed and rolled back:', error.code || 'export validation failed');
      process.exitCode = 1;
    } finally { await pool.end(); }
  }
}
