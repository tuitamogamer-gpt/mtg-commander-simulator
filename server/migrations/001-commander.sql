BEGIN;
CREATE SCHEMA IF NOT EXISTS commander;
CREATE TABLE IF NOT EXISTS commander.accounts (
  id text PRIMARY KEY,
  email_hash text NOT NULL UNIQUE,
  identity jsonb NOT NULL,
  profile jsonb NOT NULL DEFAULT '{"gamesPlayed":0,"wins":0,"losses":0,"lifetimeScore":0}',
  commanders jsonb NOT NULL DEFAULT '{}',
  favorites jsonb NOT NULL DEFAULT '[]',
  recent jsonb NOT NULL DEFAULT '[]',
  save jsonb
);
CREATE TABLE IF NOT EXISTS commander.sessions (
  token_hash text PRIMARY KEY,
  user_id text NOT NULL REFERENCES commander.accounts(id),
  record jsonb NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON commander.sessions(expires_at);
CREATE TABLE IF NOT EXISTS commander.completed_matches (
  user_id text NOT NULL REFERENCES commander.accounts(id),
  match_id text NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY(user_id, match_id)
);
CREATE INDEX IF NOT EXISTS completed_expiry ON commander.completed_matches(expires_at);
CREATE TABLE IF NOT EXISTS commander.decks (
  user_id text NOT NULL REFERENCES commander.accounts(id),
  id text NOT NULL,
  name_key text NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(user_id, id),
  UNIQUE(user_id, name_key)
);
CREATE TABLE IF NOT EXISTS commander.rate_limits (
  key text PRIMARY KEY,
  attempts bigint[] NOT NULL DEFAULT '{}',
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_limits_expiry ON commander.rate_limits(expires_at);
CREATE TABLE IF NOT EXISTS commander.live_rooms (
  room text PRIMARY KEY,
  state jsonb NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS live_rooms_expiry ON commander.live_rooms(expires_at);
CREATE TABLE IF NOT EXISTS commander.imports (
  checksum text PRIMARY KEY,
  imported_at timestamptz NOT NULL DEFAULT now(),
  counts jsonb NOT NULL
);
COMMIT;
