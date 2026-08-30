import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = 'commander_session';
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const MAX_BODY_BYTES = 1_900_000;
const MAX_SAVE_BYTES = 1_750_000;
const MAX_DECK_BYTES = 64_000;
const MAX_IMPORTED_DECKS = 40;
const ACCOUNT_PREFIX = 'commander-account:v1';

const userKey = id => `${ACCOUNT_PREFIX}:user:${id}`;
const emailKey = hash => `${ACCOUNT_PREFIX}:email:${hash}`;
const sessionKey = hash => `${ACCOUNT_PREFIX}:session:${hash}`;
const profileKey = id => `${ACCOUNT_PREFIX}:profile:${id}`;
const commanderKey = id => `${ACCOUNT_PREFIX}:commanders:${id}`;
const favoritesKey = id => `${ACCOUNT_PREFIX}:favorites:${id}`;
const recentKey = id => `${ACCOUNT_PREFIX}:recent:${id}`;
const completedKey = id => `${ACCOUNT_PREFIX}:completed:${id}`;
const saveKey = id => `${ACCOUNT_PREFIX}:save:${id}`;
const deckLibraryKey = id => `${ACCOUNT_PREFIX}:decks:${id}`;
const deckLibraryNamesKey = id => `${ACCOUNT_PREFIX}:deck-names:${id}`;

const sha256 = value => createHash('sha256').update(String(value)).digest('hex');
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const byteSize = value => {
  try { return Buffer.byteLength(JSON.stringify(value)); } catch { return Infinity; }
};
const cleanText = (value, max = 120) => String(value || '').trim()
  .replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max);
const normalizeEmail = value => cleanText(value, 254).toLowerCase();
const publicUser = user => user ? {
  id: user.id,
  email: user.email,
  displayName: user.displayName,
  createdAt: user.createdAt,
} : null;

function emptyProfile() {
  return { gamesPlayed: 0, wins: 0, losses: 0, lifetimeScore: 0 };
}

function normalizedProfile(raw = {}) {
  const number = key => Math.max(0, Number(raw[key]) || 0);
  const gamesPlayed = number('gamesPlayed');
  const wins = number('wins');
  return {
    gamesPlayed,
    wins,
    losses: number('losses'),
    lifetimeScore: number('lifetimeScore'),
    winRate: gamesPlayed ? Math.round((wins / gamesPlayed) * 100) : 0,
  };
}

export class MemoryAccountStore {
  constructor() {
    this.kind = 'memory';
    this.users = new Map();
    this.emailIds = new Map();
    this.sessions = new Map();
    this.profiles = new Map();
    this.commanders = new Map();
    this.favorites = new Map();
    this.recent = new Map();
    this.completed = new Map();
    this.saves = new Map();
    this.decks = new Map();
  }

  async ping() { return 'PONG'; }
  async createAccount(user) {
    if (this.emailIds.has(user.emailHash)) return false;
    this.emailIds.set(user.emailHash, user.id);
    this.users.set(user.id, clone(user));
    this.profiles.set(user.id, emptyProfile());
    return true;
  }
  async findUserByEmailHash(hash) {
    const id = this.emailIds.get(hash);
    return id ? clone(this.users.get(id)) : null;
  }
  async getUser(id) { return clone(this.users.get(id)) || null; }
  async createSession(hash, record) { this.sessions.set(hash, clone(record)); }
  async getSession(hash) { return clone(this.sessions.get(hash)) || null; }
  async deleteSession(hash) { this.sessions.delete(hash); }
  async saveGame(id, save) { this.saves.set(id, clone(save)); }
  async getSave(id) { return clone(this.saves.get(id)) || null; }
  async deleteSave(id) { this.saves.delete(id); }
  async getDecks(id) {
    return [...(this.decks.get(id) || new Map()).values()]
      .map(clone)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)) || a.name.localeCompare(b.name));
  }
  async upsertDeck(id, deck) {
    const decks = this.decks.get(id) || new Map();
    const existing = decks.get(deck.id) || null;
    assertImportedDeckLibraryInvariants(decks.values(), deck, existing);
    const stored = storedImportedDeck(deck, existing);
    decks.set(deck.id, clone(stored));
    this.decks.set(id, decks);
    return { deck: clone(stored), created: !existing };
  }
  async deleteDeck(id, deckId) {
    return this.decks.get(id)?.delete(deckId) || false;
  }
  async setFavoriteDecks(id, names) { this.favorites.set(id, new Set(names)); }
  async completeMatch(id, match) {
    const done = this.completed.get(id) || new Set();
    if (done.has(match.matchId)) return false;
    done.add(match.matchId);
    this.completed.set(id, done);
    const profile = this.profiles.get(id) || emptyProfile();
    profile.gamesPlayed += 1;
    profile.wins += match.won ? 1 : 0;
    profile.losses += match.won ? 0 : 1;
    profile.lifetimeScore += match.score;
    this.profiles.set(id, profile);
    const commanders = this.commanders.get(id) || new Map();
    for (const name of match.commanders) commanders.set(name, (commanders.get(name) || 0) + 1);
    this.commanders.set(id, commanders);
    const recent = this.recent.get(id) || [];
    recent.unshift(clone(match));
    this.recent.set(id, recent.slice(0, 10));
    return true;
  }
  async getProfile(id) {
    const commanders = [...(this.commanders.get(id) || new Map()).entries()]
      .map(([name, games]) => ({ name, games })).sort((a, b) => b.games - a.games || a.name.localeCompare(b.name)).slice(0, 5);
    return {
      ...normalizedProfile(this.profiles.get(id)),
      favoriteCommanders: commanders,
      favoriteDecks: [...(this.favorites.get(id) || new Set())].sort(),
      recentMatches: clone(this.recent.get(id) || []),
    };
  }
}

export class UpstashAccountStore {
  constructor(redis) {
    this.kind = 'upstash-redis';
    this.redis = redis;
  }
  async ping() { return this.redis.ping(); }
  async createAccount(user) {
    const claimed = await this.redis.set(emailKey(user.emailHash), user.id, { nx: true });
    if (claimed !== 'OK') return false;
    try {
      await this.redis.set(userKey(user.id), user);
      await this.redis.hset(profileKey(user.id), emptyProfile());
      return true;
    } catch (error) {
      await Promise.allSettled([this.redis.del(emailKey(user.emailHash)), this.redis.del(userKey(user.id)), this.redis.del(profileKey(user.id))]);
      throw error;
    }
  }
  async findUserByEmailHash(hash) {
    const id = await this.redis.get(emailKey(hash));
    return id ? this.redis.get(userKey(id)) : null;
  }
  async getUser(id) { return this.redis.get(userKey(id)); }
  async createSession(hash, record) { await this.redis.set(sessionKey(hash), record, { ex: SESSION_TTL_SECONDS }); }
  async getSession(hash) {
    const session = await this.redis.get(sessionKey(hash));
    if (session) await this.redis.expire(sessionKey(hash), SESSION_TTL_SECONDS);
    return session;
  }
  async deleteSession(hash) { await this.redis.del(sessionKey(hash)); }
  async saveGame(id, save) { await this.redis.set(saveKey(id), save); }
  async getSave(id) { return this.redis.get(saveKey(id)); }
  async deleteSave(id) { await this.redis.del(saveKey(id)); }
  async getDecks(id) {
    const rows = await this.redis.hgetall(deckLibraryKey(id));
    return Object.values(rows || {}).map(row => {
      if (row && typeof row === 'object') return row;
      try { return JSON.parse(row); } catch { return null; }
    }).filter(Boolean).map(publicStoredDeck)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)) || String(a.name).localeCompare(String(b.name)));
  }
  async upsertDeck(id, deck) {
    const nameKey = importedDeckNameKey(deck.name);
    const storageDeck = { ...deck, _libraryNameKey: nameKey };
    const script = `
      local libraryKey = KEYS[1]
      local namesKey = KEYS[2]
      local deckId = ARGV[1]
      local nameKey = ARGV[2]
      local candidate = cjson.decode(ARGV[3])
      local now = ARGV[4]
      local maxDecks = tonumber(ARGV[5])
      local existingRaw = redis.call('HGET', libraryKey, deckId)
      local created = 0

      if not existingRaw then
        if redis.call('HLEN', libraryKey) >= maxDecks then return {-1, 'capacity'} end
        created = 1
      end

      local claimedId = redis.call('HGET', namesKey, nameKey)
      if claimedId and claimedId ~= deckId then
        if redis.call('HEXISTS', libraryKey, claimedId) == 1 then return {-2, 'duplicate'} end
        redis.call('HDEL', namesKey, nameKey)
      end

      local rows = redis.call('HGETALL', libraryKey)
      for index = 1, #rows, 2 do
        local savedId = rows[index]
        if savedId ~= deckId then
          local ok, saved = pcall(cjson.decode, rows[index + 1])
          if ok and saved then
            local savedNameKey = saved._libraryNameKey
            if savedNameKey and savedNameKey == nameKey then return {-2, 'duplicate'} end
            if (not savedNameKey) and saved.name and string.lower(saved.name) == nameKey then return {-2, 'duplicate'} end
          end
        end
      end

      local existing = nil
      if existingRaw then
        local ok, decoded = pcall(cjson.decode, existingRaw)
        if ok then existing = decoded end
      end
      if existing and existing._libraryNameKey and existing._libraryNameKey ~= nameKey then
        if redis.call('HGET', namesKey, existing._libraryNameKey) == deckId then
          redis.call('HDEL', namesKey, existing._libraryNameKey)
        end
      end

      candidate.revision = existing and math.max(0, tonumber(existing.revision) or 0) + 1 or 1
      candidate.createdAt = existing and existing.createdAt or now
      candidate.updatedAt = now
      local encoded = cjson.encode(candidate)
      redis.call('HSET', libraryKey, deckId, encoded)
      redis.call('HSET', namesKey, nameKey, deckId)
      return {created, encoded}`;
    const result = await this.redis.eval(script,
      [deckLibraryKey(id), deckLibraryNamesKey(id)],
      [deck.id, nameKey, JSON.stringify(storageDeck), new Date().toISOString(), String(MAX_IMPORTED_DECKS)]);
    const code = Number(result?.[0]);
    if (code === -1) throw importedDeckError(`Your imported deck library can contain up to ${MAX_IMPORTED_DECKS} decks.`, 409);
    if (code === -2) throw importedDeckError('An imported deck with that name is already in your library.', 409);
    const row = result?.[1];
    const stored = row && typeof row === 'object' ? row : JSON.parse(String(row || 'null'));
    if (!stored) throw new Error('Redis did not return the stored imported deck.');
    return { deck: publicStoredDeck(stored), created: code === 1 };
  }
  async deleteDeck(id, deckId) {
    const script = `
      local libraryKey = KEYS[1]
      local namesKey = KEYS[2]
      local deckId = ARGV[1]
      local existingRaw = redis.call('HGET', libraryKey, deckId)
      if not existingRaw then return 0 end
      local ok, existing = pcall(cjson.decode, existingRaw)
      if ok and existing and existing._libraryNameKey then
        if redis.call('HGET', namesKey, existing._libraryNameKey) == deckId then
          redis.call('HDEL', namesKey, existing._libraryNameKey)
        end
      end
      local names = redis.call('HGETALL', namesKey)
      for index = 1, #names, 2 do
        if names[index + 1] == deckId then redis.call('HDEL', namesKey, names[index]) end
      end
      return redis.call('HDEL', libraryKey, deckId)`;
    return Number(await this.redis.eval(script,
      [deckLibraryKey(id), deckLibraryNamesKey(id)], [deckId])) > 0;
  }
  async setFavoriteDecks(id, names) {
    const key = favoritesKey(id);
    const transaction = this.redis.multi();
    transaction.del(key);
    if (names.length) transaction.sadd(key, ...names);
    await transaction.exec();
  }
  async completeMatch(id, match) {
    const script = `
      if redis.call('SADD', KEYS[1], ARGV[1]) == 0 then return 0 end
      redis.call('EXPIRE', KEYS[1], 31536000)
      redis.call('HINCRBY', KEYS[2], 'gamesPlayed', 1)
      redis.call('HINCRBY', KEYS[2], 'wins', ARGV[2])
      redis.call('HINCRBY', KEYS[2], 'losses', ARGV[3])
      redis.call('HINCRBY', KEYS[2], 'lifetimeScore', ARGV[4])
      if ARGV[5] ~= '' then redis.call('HINCRBY', KEYS[3], ARGV[5], 1) end
      if ARGV[6] ~= '' and ARGV[6] ~= ARGV[5] then redis.call('HINCRBY', KEYS[3], ARGV[6], 1) end
      redis.call('LPUSH', KEYS[4], ARGV[7])
      redis.call('LTRIM', KEYS[4], 0, 9)
      return 1`;
    const result = await this.redis.eval(script,
      [completedKey(id), profileKey(id), commanderKey(id), recentKey(id)],
      [match.matchId, match.won ? '1' : '0', match.won ? '0' : '1', String(match.score), match.commanders[0] || '', match.commanders[1] || '', JSON.stringify(match)]);
    return Number(result) === 1;
  }
  async getProfile(id) {
    const [profile, commanderCounts, favoriteDecks, recentRows] = await Promise.all([
      this.redis.hgetall(profileKey(id)),
      this.redis.hgetall(commanderKey(id)),
      this.redis.smembers(favoritesKey(id)),
      this.redis.lrange(recentKey(id), 0, 9),
    ]);
    const favoriteCommanders = Object.entries(commanderCounts || {})
      .map(([name, games]) => ({ name, games: Math.max(0, Number(games) || 0) }))
      .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name)).slice(0, 5);
    const recentMatches = (recentRows || []).map(row => {
      if (row && typeof row === 'object') return row;
      try { return JSON.parse(row); } catch { return null; }
    }).filter(Boolean);
    return {
      ...normalizedProfile(profile || {}),
      favoriteCommanders,
      favoriteDecks: (favoriteDecks || []).map(String).sort(),
      recentMatches,
    };
  }
}

class MissingAccountStore {
  constructor() { this.kind = 'missing'; }
  async ping() { throw new Error('Account storage is unavailable.'); }
}

export function createAccountStoreFromEnv(env = process.env) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return new MissingAccountStore();
  return new UpstashAccountStore(new Redis({ url, token }));
}

function parseCookies(header = '') {
  return Object.fromEntries(String(header).split(';').map(part => {
    const index = part.indexOf('=');
    if (index < 0) return ['', ''];
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(([key]) => key));
}

function sessionCookie(token, request, maxAge = SESSION_TTL_SECONDS) {
  const forwarded = String(request.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const secure = forwarded === 'https' || !!request.socket?.encrypted;
  return `${SESSION_COOKIE}=${encodeURIComponent(token || '')}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

function sameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    const host = String(request.headers['x-forwarded-host'] || request.headers.host || '').split(',')[0].trim();
    const forwarded = String(request.headers['x-forwarded-proto'] || '').split(',')[0].trim();
    const protocol = forwarded || (request.socket?.encrypted ? 'https' : 'http');
    const parsed = new URL(origin);
    return parsed.host === host && parsed.protocol === `${protocol}:`;
  } catch { return false; }
}

async function readBody(request) {
  if (request.body && typeof request.body === 'object') return request.body;
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('Request is too large.'), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Request body must be valid JSON.'), { status: 400 }); }
}

async function passwordDigest(password, salt) {
  return Buffer.from(await scrypt(password, Buffer.from(salt, 'base64'), 64)).toString('base64');
}

async function passwordMatches(password, user) {
  const calculated = Buffer.from(await passwordDigest(password, user.passwordSalt), 'base64');
  const expected = Buffer.from(user.passwordHash || '', 'base64');
  return calculated.length === expected.length && timingSafeEqual(calculated, expected);
}

function validateCredentials(body, registering) {
  const email = normalizeEmail(body.email);
  const password = String(body.password || '');
  const displayName = cleanText(body.displayName, 32);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Object.assign(new Error('Enter a valid email address.'), { status: 400 });
  if (password.length < 8 || password.length > 128) throw Object.assign(new Error('Password must contain 8 to 128 characters.'), { status: 400 });
  if (registering && (displayName.length < 2 || displayName.length > 32)) throw Object.assign(new Error('Display name must contain 2 to 32 characters.'), { status: 400 });
  return { email, password, displayName };
}

function cleanSave(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.schema !== 'commander-save/v1')
    throw Object.assign(new Error('Unsupported save-game format.'), { status: 400 });
  if (value.mode !== 'solo' || !value.setup || typeof value.setup !== 'object')
    throw Object.assign(new Error('Only Solo games can be saved to a profile.'), { status: 400 });
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(String(value.matchId || '')))
    throw Object.assign(new Error('Save game is missing a valid match identity.'), { status: 400 });
  if (!Array.isArray(value.decisions) || value.decisions.length > 5000)
    throw Object.assign(new Error('Save game has too many decisions.'), { status: 400 });
  if (byteSize(value) > MAX_SAVE_BYTES) throw Object.assign(new Error('Save game is too large.'), { status: 413 });
  const save = clone(value);
  save.updatedAt = new Date().toISOString();
  save.summary = {
    deck: cleanText(value.summary?.deck || value.setup.deck, 120),
    commanders: Array.isArray(value.summary?.commanders) ? value.summary.commanders.map(name => cleanText(name, 160)).filter(Boolean).slice(0, 2) : [],
    turn: Math.max(0, Math.min(999, Number(value.summary?.turn) || 0)),
    decisionCount: value.decisions.length,
  };
  return save;
}

function importedDeckError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function requiredDeckText(value, label, max) {
  if (typeof value !== 'string') throw importedDeckError(`${label} must be text.`);
  const text = value.trim();
  if (!text || text.length > max || /[\u0000-\u001f\u007f]/.test(text))
    throw importedDeckError(`${label} is invalid.`);
  return text;
}

function importedDeckNameKey(value) {
  return String(value || '').toLowerCase();
}

function publicStoredDeck(value) {
  const deck = clone(value);
  if (deck && typeof deck === 'object') delete deck._libraryNameKey;
  return deck;
}

function storedImportedDeck(deck, existing = null, now = new Date().toISOString()) {
  const existingCreatedAt = existing && Number.isFinite(new Date(existing.createdAt).getTime()) ? existing.createdAt : null;
  return {
    ...clone(deck),
    revision: existing ? Math.max(0, Number(existing.revision) || 0) + 1 : 1,
    createdAt: existingCreatedAt || now,
    updatedAt: now,
  };
}

function assertImportedDeckLibraryInvariants(savedDecks, deck, existing = null) {
  const rows = [...savedDecks];
  if (!existing && rows.length >= MAX_IMPORTED_DECKS)
    throw importedDeckError(`Your imported deck library can contain up to ${MAX_IMPORTED_DECKS} decks.`, 409);
  const nameKey = importedDeckNameKey(deck.name);
  if (rows.some(saved => saved.id !== deck.id && importedDeckNameKey(saved.name) === nameKey))
    throw importedDeckError('An imported deck with that name is already in your library.', 409);
}

function cleanImportedDeck(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.schema !== 'commander-deck/v1')
    throw importedDeckError('Unsupported imported-deck format.');
  if (byteSize(value) > MAX_DECK_BYTES) throw importedDeckError('Imported deck is too large.', 413);

  const id = requiredDeckText(value.id, 'Deck identity', 85);
  if (!/^deck-[a-z0-9-]{8,80}$/.test(id)) throw importedDeckError('Deck identity is invalid.');
  const name = requiredDeckText(value.name, 'Deck name', 80);

  if (!Array.isArray(value.commanders) || value.commanders.length < 1 || value.commanders.length > 2)
    throw importedDeckError('Imported deck must have one or two commanders.');
  const commanders = value.commanders.map((commander, index) => requiredDeckText(commander, `Commander ${index + 1}`, 160));
  if (new Set(commanders).size !== commanders.length) throw importedDeckError('Commander names must be unique.');

  if (!Array.isArray(value.cards) || value.cards.length < 1 || value.cards.length > 100)
    throw importedDeckError('Imported deck must contain normalized card rows.');
  const seen = new Set();
  let total = 0;
  const cards = value.cards.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw importedDeckError(`Card row ${index + 1} is invalid.`);
    const cardName = requiredDeckText(row.name, `Card row ${index + 1} name`, 160);
    if (seen.has(cardName)) throw importedDeckError(`Card row ${index + 1} duplicates ${cardName}.`);
    seen.add(cardName);
    if (!Number.isSafeInteger(row.n) || row.n < 1 || row.n > 100)
      throw importedDeckError(`Card row ${index + 1} has an invalid count.`);
    if (row.section !== 'Commander' && row.section !== 'Main')
      throw importedDeckError(`Card row ${index + 1} has an invalid section.`);
    total += row.n;
    return { name: cardName, n: row.n, section: row.section };
  });
  if (total !== 100) throw importedDeckError(`Imported deck must contain exactly 100 cards; found ${total}.`);

  const rowsByName = new Map(cards.map(row => [row.name, row]));
  for (const commander of commanders) {
    const row = rowsByName.get(commander);
    if (!row || row.n !== 1 || row.section !== 'Commander')
      throw importedDeckError(`Commander ${commander} must appear exactly once in the Commander section.`);
  }
  const unexpectedCommander = cards.find(row => row.section === 'Commander' && !commanders.includes(row.name));
  if (unexpectedCommander) throw importedDeckError(`${unexpectedCommander.name} is not listed as a commander.`);

  return {
    schema: 'commander-deck/v1',
    id,
    name,
    commanders,
    cards,
  };
}

function cleanMatch(body) {
  const matchId = cleanText(body.matchId, 80);
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(matchId)) throw Object.assign(new Error('Invalid match identity.'), { status: 400 });
  const won = body.won === true;
  const match = {
    matchId,
    deck: cleanText(body.deck, 120),
    commanders: Array.isArray(body.commanders) ? body.commanders.map(name => cleanText(name, 160)).filter(Boolean).slice(0, 2) : [],
    won,
    score: won ? 100 : 25,
    turns: Math.max(0, Math.min(999, Number(body.turns) || 0)),
    completedAt: new Date().toISOString(),
  };
  if (!match.deck || !match.commanders.length) throw Object.assign(new Error('Match deck and commander are required.'), { status: 400 });
  return match;
}

async function accountSnapshot(store, user) {
  const [profile, save] = await Promise.all([store.getProfile(user.id), store.getSave(user.id)]);
  return { user: publicUser(user), profile, save };
}

function send(response, status, payload, headers = {}) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
  response.end(JSON.stringify(payload));
}

function clientIp(request) {
  return String(request.headers['x-forwarded-for'] || request.socket?.remoteAddress || 'unknown').split(',')[0].trim().slice(0, 120);
}

export function createAccountHandler({ store = createAccountStoreFromEnv(), limiter = undefined } = {}) {
  const rateLimiter = limiter === undefined && store.redis
    ? new Ratelimit({ redis: store.redis, limiter: Ratelimit.slidingWindow(8, '10 m'), prefix: `${ACCOUNT_PREFIX}:ratelimit` })
    : limiter;

  return async function accountHandler(request, response) {
    let ownerBoundRequest = false;
    let responseOwnerId = null;
    try {
      if (!sameOrigin(request)) return send(response, 403, { ok: false, error: 'Request origin is not allowed.' });
      const url = new URL(request.url || '/api/account', `http://${request.headers.host || 'commander.local'}`);
      const body = request.method === 'POST' ? await readBody(request) : {};
      const action = cleanText(body.action || url.searchParams.get('action') || 'session', 40);
      const deckLibraryRequest = ['decks', 'upsertDeck', 'deleteDeck'].includes(action);
      ownerBoundRequest = ['save', 'clearSave', 'completeMatch', 'decks', 'upsertDeck', 'deleteDeck'].includes(action);
      const cookies = parseCookies(request.headers.cookie);
      const rawSession = cookies[SESSION_COOKIE] || '';

      if (request.method === 'POST' && action === 'logout') {
        try {
          await store.ping();
          if (rawSession) await store.deleteSession(sha256(rawSession));
        } catch (error) {
          console.error('Commander account logout failed:', error);
          return send(response, 503, { ok: false, code: 'LOCAL_SESSION_CLEARED', error: 'Your local session was cleared, but the server session could not be closed.' },
            { 'Set-Cookie': sessionCookie('', request, 0) });
        }
        return send(response, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', request, 0) });
      }

      await store.ping();
      const session = rawSession ? await store.getSession(sha256(rawSession)) : null;
      const user = session ? await store.getUser(session.userId) : null;
      const sessionHeaders = user && rawSession ? { 'Set-Cookie': sessionCookie(rawSession, request) } : {};

      if (request.method === 'GET' && ['session', 'profile'].includes(action)) {
        if (!user) return send(response, 200, { ok: true, user: null, profile: null, save: null }, rawSession ? { 'Set-Cookie': sessionCookie('', request, 0) } : {});
        return send(response, 200, { ok: true, ...(await accountSnapshot(store, user)) }, sessionHeaders);
      }
      if (request.method === 'GET' && action === 'decks') {
        responseOwnerId = user?.id || null;
        if (!user) return send(response, 401, { ok: false, error: 'Sign in to use your imported deck library.', ownerId: null });
        if (url.searchParams.get('expectedOwnerId') !== user.id)
          return send(response, 409, { ok: false, code: 'ACCOUNT_OWNER_MISMATCH', error: 'Your signed-in account changed. Reload the deck library and try again.', ownerId: user.id }, sessionHeaders);
        return send(response, 200, { ok: true, ownerId: user.id, decks: await store.getDecks(user.id) }, sessionHeaders);
      }
      if (request.method !== 'POST') return send(response, 405, { ok: false, error: 'Method not allowed.' }, { Allow: 'GET, POST' });

      if (action === 'register' || action === 'login') {
        const credentials = validateCredentials(body, action === 'register');
        if (rateLimiter) {
          const result = await rateLimiter.limit(`${action}:${clientIp(request)}:${sha256(credentials.email).slice(0, 18)}`, { ip: clientIp(request), userAgent: String(request.headers['user-agent'] || '').slice(0, 200) });
          if (!result.success) return send(response, 429, { ok: false, error: 'Too many attempts. Wait a few minutes and try again.' });
        }
        let account;
        if (action === 'register') {
          const passwordSalt = randomBytes(16).toString('base64');
          account = {
            id: randomUUID(), email: credentials.email, emailHash: sha256(credentials.email), displayName: credentials.displayName,
            passwordSalt, passwordHash: await passwordDigest(credentials.password, passwordSalt), createdAt: new Date().toISOString(),
          };
          if (!await store.createAccount(account)) return send(response, 409, { ok: false, error: 'An account already exists for this email.' });
        } else {
          account = await store.findUserByEmailHash(sha256(credentials.email));
          if (!account || !await passwordMatches(credentials.password, account)) return send(response, 401, { ok: false, error: 'Email or password is incorrect.' });
        }
        const token = randomBytes(32).toString('base64url');
        await store.createSession(sha256(token), { userId: account.id, createdAt: new Date().toISOString() });
        return send(response, action === 'register' ? 201 : 200, { ok: true, ...(await accountSnapshot(store, account)) }, { 'Set-Cookie': sessionCookie(token, request) });
      }

      if (!user) return send(response, 401, ownerBoundRequest
        ? { ok: false, error: deckLibraryRequest ? 'Sign in to use your imported deck library.' : 'Sign in to save games and record stats.', ownerId: null }
        : { ok: false, error: 'Sign in to use profile saves and stats.' });

      if (action === 'save') {
        responseOwnerId = user.id;
        if (body.expectedOwnerId !== user.id)
          return send(response, 409, { ok: false, code: 'ACCOUNT_OWNER_MISMATCH', error: 'Your signed-in account changed. Reload your profile and try again.', ownerId: user.id }, sessionHeaders);
        const save = cleanSave(body.save);
        await store.saveGame(user.id, save);
        return send(response, 200, { ok: true, ownerId: user.id, save }, sessionHeaders);
      }
      if (action === 'clearSave') {
        responseOwnerId = user.id;
        if (body.expectedOwnerId !== user.id)
          return send(response, 409, { ok: false, code: 'ACCOUNT_OWNER_MISMATCH', error: 'Your signed-in account changed. Reload your profile and try again.', ownerId: user.id }, sessionHeaders);
        await store.deleteSave(user.id);
        return send(response, 200, { ok: true, ownerId: user.id, save: null }, sessionHeaders);
      }
      if (action === 'upsertDeck') {
        responseOwnerId = user.id;
        if (body.expectedOwnerId !== user.id)
          return send(response, 409, { ok: false, code: 'ACCOUNT_OWNER_MISMATCH', error: 'Your signed-in account changed. Reload the deck library and try again.', ownerId: user.id }, sessionHeaders);
        const result = await store.upsertDeck(user.id, cleanImportedDeck(body.deck));
        return send(response, result.created ? 201 : 200, { ok: true, ownerId: user.id, deck: result.deck }, sessionHeaders);
      }
      if (action === 'deleteDeck') {
        responseOwnerId = user.id;
        if (body.expectedOwnerId !== user.id)
          return send(response, 409, { ok: false, code: 'ACCOUNT_OWNER_MISMATCH', error: 'Your signed-in account changed. Reload the deck library and try again.', ownerId: user.id }, sessionHeaders);
        const deckId = requiredDeckText(body.deckId, 'Deck identity', 85);
        if (!/^deck-[a-z0-9-]{8,80}$/.test(deckId)) throw importedDeckError('Deck identity is invalid.');
        const deleted = await store.deleteDeck(user.id, deckId);
        return send(response, 200, { ok: true, ownerId: user.id, deleted, deckId }, sessionHeaders);
      }
      if (action === 'completeMatch') {
        responseOwnerId = user.id;
        if (body.expectedOwnerId !== user.id)
          return send(response, 409, { ok: false, code: 'ACCOUNT_OWNER_MISMATCH', error: 'Your signed-in account changed. Reload your profile and try again.', ownerId: user.id }, sessionHeaders);
        const match = cleanMatch(body);
        const recorded = await store.completeMatch(user.id, match);
        const activeSave = await store.getSave(user.id);
        if (activeSave && activeSave.matchId === match.matchId) await store.deleteSave(user.id);
        return send(response, 200, { ok: true, ownerId: user.id, recorded, ...(await accountSnapshot(store, user)) }, sessionHeaders);
      }
      if (action === 'favorites') {
        const names = Array.isArray(body.decks)
          ? [...new Set(body.decks.map(name => cleanText(name, 120)).filter(Boolean))].slice(0, 27) : [];
        await store.setFavoriteDecks(user.id, names);
        return send(response, 200, { ok: true, profile: await store.getProfile(user.id) }, sessionHeaders);
      }
      return send(response, 400, { ok: false, error: 'Unknown account action.' }, sessionHeaders);
    } catch (error) {
      if (!error.status || error.status >= 500) console.error('Commander account request failed:', error);
      return send(response, error.status || 500, {
        ok: false,
        error: error.status ? error.message : 'Account service is temporarily unavailable.',
        ...(ownerBoundRequest ? { ownerId: responseOwnerId } : {}),
      });
    }
  };
}

export default createAccountHandler();
