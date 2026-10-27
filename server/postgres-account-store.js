import { createDatabasePool, transaction } from './postgres.js';
import { completedMatchSaveError, normalizedProfile, publicStoredDeck,
  storedImportedDeck, assertImportedDeckLibraryInvariants, importedDeckNameKey } from './account-records.js';

const json = JSON.stringify;
const SESSION_SECONDS = 30 * 24 * 60 * 60;

export class PostgresAccountStore {
  constructor(connectionString, { pool } = {}) {
    this.kind = 'postgres';
    this.pool = pool || createDatabasePool(connectionString);
    this.limiter = { limit: key => this.limit(key) };
    this.nextCleanup = 0;
  }

  async ping() {
    // Check the schema too: a missing migration must fail before accepting writes.
    await this.pool.query('SELECT 1 FROM commander.accounts LIMIT 1');
    return 'PONG';
  }

  async close() { await this.pool.end(); }

  async locked(id, work) {
    return transaction(this.pool, async client => {
      const { rows } = await client.query('SELECT * FROM commander.accounts WHERE id=$1 FOR UPDATE', [id]);
      if (!rows[0]) throw new Error('Account does not exist.');
      return work(client, rows[0]);
    });
  }

  async createAccount(user) {
    const result = await this.pool.query(`INSERT INTO commander.accounts(id,email_hash,identity)
      VALUES ($1,$2,$3::jsonb) ON CONFLICT (email_hash) DO NOTHING`, [user.id, user.emailHash, json(user)]);
    return result.rowCount === 1;
  }

  async findUserByEmailHash(hash) {
    const { rows } = await this.pool.query('SELECT identity FROM commander.accounts WHERE email_hash=$1', [hash]);
    return rows[0]?.identity || null;
  }

  async getUser(id) {
    const { rows } = await this.pool.query('SELECT identity FROM commander.accounts WHERE id=$1', [id]);
    return rows[0]?.identity || null;
  }

  async createSession(hash, record) {
    await this.pool.query(`INSERT INTO commander.sessions(token_hash,user_id,record,expires_at)
      VALUES ($1,$2,$3::jsonb,now()+$4*interval '1 second')`, [hash, record.userId, json(record), SESSION_SECONDS]);
    await this.cleanup();
  }

  async getSession(hash) {
    const { rows } = await this.pool.query(`UPDATE commander.sessions
      SET expires_at=now()+$2*interval '1 second' WHERE token_hash=$1 AND expires_at>now() RETURNING record`,
    [hash, SESSION_SECONDS]);
    return rows[0]?.record || null;
  }

  async deleteSession(hash) {
    await this.pool.query('DELETE FROM commander.sessions WHERE token_hash=$1', [hash]);
  }

  async saveGame(id, save) {
    await this.locked(id, async client => {
      const done = await client.query(`SELECT 1 FROM commander.completed_matches
        WHERE user_id=$1 AND match_id=$2 AND expires_at>now()`, [id, save.matchId]);
      if (done.rowCount) throw completedMatchSaveError();
      await client.query('UPDATE commander.accounts SET save=$2::jsonb WHERE id=$1', [id, json(save)]);
    });
  }

  async getSave(id) {
    const { rows } = await this.pool.query('SELECT save FROM commander.accounts WHERE id=$1', [id]);
    return rows[0]?.save || null;
  }

  async deleteSave(id) { await this.pool.query('UPDATE commander.accounts SET save=NULL WHERE id=$1', [id]); }

  async deleteSaveIfMatch(id, matchId) {
    const result = await this.pool.query("UPDATE commander.accounts SET save=NULL WHERE id=$1 AND save->>'matchId'=$2", [id, matchId]);
    return result.rowCount === 1;
  }

  async getDecks(id) {
    const { rows } = await this.pool.query('SELECT record FROM commander.decks WHERE user_id=$1', [id]);
    return rows.map(({ record }) => publicStoredDeck(record))
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)) || a.name.localeCompare(b.name));
  }

  async upsertDeck(id, deck) {
    return this.locked(id, async client => {
      const { rows } = await client.query('SELECT record FROM commander.decks WHERE user_id=$1', [id]);
      const decks = rows.map(row => publicStoredDeck(row.record));
      const existing = decks.find(row => row.id === deck.id);
      assertImportedDeckLibraryInvariants(decks, deck, existing);
      const stored = storedImportedDeck(deck, existing);
      await client.query(`INSERT INTO commander.decks(user_id,id,name_key,record) VALUES ($1,$2,$3,$4::jsonb)
        ON CONFLICT (user_id,id) DO UPDATE SET name_key=excluded.name_key,record=excluded.record`,
      [id, deck.id, importedDeckNameKey(deck.name), json(stored)]);
      return { deck: stored, created: !existing };
    });
  }

  async deleteDeck(id, deckId) {
    return this.locked(id, async client => {
      const result = await client.query('DELETE FROM commander.decks WHERE user_id=$1 AND id=$2', [id, deckId]);
      return result.rowCount === 1;
    });
  }

  async setFavoriteDecks(id, names) {
    await this.pool.query('UPDATE commander.accounts SET favorites=$2::jsonb WHERE id=$1', [id, json([...new Set(names)])]);
  }

  async completeMatch(id, match) {
    return this.locked(id, async (client, account) => {
      await client.query('DELETE FROM commander.completed_matches WHERE user_id=$1 AND expires_at<=now()', [id]);
      const inserted = await client.query(`INSERT INTO commander.completed_matches(user_id,match_id,expires_at)
        VALUES ($1,$2,now()+interval '365 days') ON CONFLICT DO NOTHING`, [id, match.matchId]);
      if (!inserted.rowCount) return false;
      // Redis renews the entire completed-match set on each new completion.
      await client.query("UPDATE commander.completed_matches SET expires_at=now()+interval '365 days' WHERE user_id=$1", [id]);
      const profile = normalizedProfile(account.profile);
      delete profile.winRate;
      profile.gamesPlayed++;
      profile.wins += match.won ? 1 : 0;
      profile.losses += match.won ? 0 : 1;
      profile.lifetimeScore += match.score;
      const commanders = new Map(Object.entries(account.commanders));
      for (const name of match.commanders) commanders.set(name, (Number(commanders.get(name)) || 0) + 1);
      await client.query('UPDATE commander.accounts SET profile=$2::jsonb,commanders=$3::jsonb,recent=$4::jsonb WHERE id=$1',
        [id, json(profile), json(Object.fromEntries(commanders)), json([match, ...account.recent].slice(0, 10))]);
      return true;
    });
  }

  async getProfile(id) {
    const { rows } = await this.pool.query('SELECT profile,commanders,favorites,recent FROM commander.accounts WHERE id=$1', [id]);
    const account = rows[0];
    return {
      ...normalizedProfile(account?.profile),
      favoriteCommanders: Object.entries(account?.commanders || {}).map(([name, games]) => ({ name, games: Number(games) || 0 }))
        .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name)).slice(0, 5),
      favoriteDecks: (account?.favorites || []).map(String).sort(),
      recentMatches: account?.recent || [],
    };
  }

  async limit(key) {
    const result = await transaction(this.pool, async client => {
      // Shared across all Vercel instances; row locking prevents parallel attempts bypassing the limit.
      await client.query(`INSERT INTO commander.rate_limits(key,expires_at) VALUES ($1,now()+interval '10 minutes')
        ON CONFLICT DO NOTHING`, [key]);
      const { rows } = await client.query('SELECT attempts FROM commander.rate_limits WHERE key=$1 FOR UPDATE', [key]);
      const { rows: clocks } = await client.query('SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS now');
      const now = Number(clocks[0].now);
      const attempts = rows[0].attempts.map(Number).filter(at => at > now - 600000);
      const success = attempts.length < 8;
      if (success) attempts.push(now);
      await client.query(`UPDATE commander.rate_limits SET attempts=$2::bigint[],expires_at=to_timestamp($3/1000.0) WHERE key=$1`,
        [key, attempts, (attempts.at(-1) || now) + 600000]);
      return { success, remaining: Math.max(0, 8 - attempts.length) };
    });
    await this.cleanup();
    return result;
  }

  async cleanup() {
    if (Date.now() < this.nextCleanup) return;
    this.nextCleanup = Date.now() + 60 * 60 * 1000;
    // Opportunistic, bounded cleanup allows Neon to sleep when the app is idle.
    for (const table of ['sessions', 'rate_limits', 'completed_matches', 'live_rooms']) {
      await this.pool.query(`DELETE FROM commander.${table} WHERE ctid IN
        (SELECT ctid FROM commander.${table} WHERE expires_at<=now() LIMIT 1000)`)
        .catch(error => console.error('Commander expiry cleanup failed:', error.code || 'database error'));
    }
  }
}
