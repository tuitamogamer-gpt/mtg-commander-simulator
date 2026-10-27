# Commander storage on Neon

`DATABASE_URL` (pooled) enables PostgreSQL for accounts and Live rooms. Set
`DATABASE_URL_UNPOOLED` for the Live LISTEN connection and schema migrations.
Keep both variables server-only. Existing scrypt passwords, account IDs, cookie
tokens, imported decks, saved games, statistics and Live action receipts retain
their existing formats. Neon Auth and the Data API are not required.

The account adapter uses row transactions for completion/save races and deck
library limits. Live mutations use transaction-scoped advisory locks; a write
cannot survive its transaction or overwrite another worker after losing its lock.
LISTEN connections exist only while WebSocket clients are connected and resync
rooms after reconnecting. Pools release idle connections after five seconds.
Expiry cleanup runs on authentication activity, with no always-on polling job.

## Prepare and verify

1. Provision Neon Free in the same region as the Vercel functions. Initially
   connect only Preview and Development. Do not connect Production yet.
2. Apply the versioned schema using the direct URL: `npm run db:migrate`.
3. Run `TEST_DATABASE_URL=<empty-disposable-local-database> npm run test:postgres`.
   This test writes fixtures and requires an empty database; never point it at
   a database holding application or imported data. Create a fresh test database
   for each run. Run the existing account and multiplayer tests too.
4. Deploy a preview with both Neon URLs and test login, saves and Live rooms.
   Delete only explicitly identified synthetic test accounts after verification.

## Transfer existing data

The Redis source must allow reads. A quota error is a migration blocker, not an
empty database. Do not promote a fresh empty target over existing accounts.
Production may use different credentials from Preview/Development; verify the
source endpoint fingerprint against Production before importing.

1. Stop writes to the source during the final export and cutover. Drain active
   Live connections as well as account requests. Keep the original deployment,
   Redis credentials and database available until verification is complete.
2. With the **production source** Upstash REST variables in the process environment,
   run `python scripts/export-redis.py /private/commander-export.json`.
   The script uses read-only commands, preserves raw JSON/container shapes and
   absolute expiry times, and creates a new file with mode 0600. Never put exports,
   password hashes or connection strings in Git, logs or deployment artifacts.
3. Use a clean Neon target and run:

   ```sh
   MTG_SOURCE_FINGERPRINT=<verified-source-sha256> node scripts/import-redis.mjs /private/commander-export.json
   ```

   The fingerprint is the SHA-256 of the source REST URL with its trailing slash
   removed. The importer rejects a different source, unknown account data, orphaned
   records, duplicate identities and occupied targets. The entire import commits
   atomically after checking account values and record counts. Repeating the same
   file is idempotent. Expired sessions/rooms are excluded. Auth rate counters and
   transient Redis locks/pubsub subscriptions are intentionally not imported;
   PostgreSQL immediately enforces the same eight-attempt/ten-minute auth limit.
4. Validate existing login/session, profile, deck library, saved Solo game and
   Live room state against the export. Keep the export checksum and aggregate
   counts in the release record; never include user data.
5. Connect Neon to Production, deploy with production variables without moving
   domains (`vercel deploy --prod --skip-domain`), verify the staged deployment,
   then promote that verified deployment. Resume application writes.

## Rollback

Before accepting any new PostgreSQL writes, the old deployment and Redis database
can be restored together. After PostgreSQL has accepted writes, stop traffic and
reconcile or export those writes before switching storage; simply rolling back
code would discard new accounts, saves and matches. Keep Redis intact until the
migration has been verified and an appropriate retention period has passed.

Free compute/storage/egress limits still apply. Monitor usage through Vercel's
Neon resource dashboard; this migration does not enable a paid plan or auto-upgrade.
