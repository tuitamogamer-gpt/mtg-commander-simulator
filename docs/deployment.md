# Deployment, multiplayer, and operations

This guide describes the repository implementation. The production entry is
<https://mtg-commander-simulator.vercel.app/>. A successful local check or an old
deployment report does not establish that a newer revision is live.

## What runs where

| Component | Runtime | Persistent data |
| --- | --- | --- |
| Browser client (`index.html`, `src/`, `assets/`) | Static hosting; vanilla JavaScript | Guest preferences, imported deck library, and custom AI skills in browser storage |
| Solo rules and AI | Player's browser | Optional account checkpoint through `/api/account` |
| Commander Live rules engine | Host player's browser | Room projections and pending decisions through `/api/ws`; no full Live engine checkpoint |
| Live room service (`api/ws.js`, `logic.js`) | Node.js HTTP/WebSocket server | Redis over its native connection URL, with pub/sub and room locks |
| Accounts (`api/account.js`) | Node.js HTTP handler | Upstash-compatible Redis REST API |

There is no application build step, external AI inference service, or Supabase
integration. `index.html` loads the source modules directly. The static client can
run without either backend; accounts and internet multiplayer need their respective
server endpoints.

## Local development

Use Node.js 22 or newer and Python 3 for the static server:

```bash
npm ci
npm run serve
```

Open <http://127.0.0.1:8000/>. This command serves guest Solo and the client assets.
Python does not execute `api/account.js` or `api/ws.js`, so it does not provide
accounts or Live room connections.

For the linked Vercel project, use the Vercel CLI's local development server to
serve static files and API routes together:

```bash
vercel dev --listen 3000
```

Supply the Development environment variables described below. The local Live
adapter uses `/api/ws` on the current origin, just as a custom-domain deployment
does. The browser must reach an actual WebSocket endpoint on that origin.

For a backend-only Live server, with environment variables already supplied to
the process:

```bash
node --input-type=module -e "import server from './api/ws.js'; server.listen(3001, '127.0.0.1');"
```

This serves Live health and WebSockets on port 3001; it does not serve the static
client or account API. `node api/ws.js` alone does not listen on a port because the
module exports its server for the hosting platform.

The focused integration suite starts real local WebSocket servers with in-memory
test stores and needs no Redis credentials:

```bash
npm run test:server
```

Memory stores are explicit test helpers. Missing production credentials do not
silently fall back to volatile memory.

## Vercel setup

Deploy the repository root with the lockfile dependencies and a supported Node.js
version satisfying `engines.node`. Use the static/Other project setup, with the
repository root as the static output and no framework build command. The `api/`
directory supplies the two Node.js endpoints. Do not point the output directory
at `dist/`: that directory is for the optional ZIP package.

Enable Fluid compute for the project. As checked on 5 September 2026, Vercel
supports WebSockets in public beta; its documented Node.js pattern matches this
repository's exported HTTP server with `ws`. Connections close at the function
duration limit and can reconnect to a different instance. This is why room state
and pub/sub live in Redis. [Vercel WebSocket documentation](https://vercel.com/docs/functions/websockets)

The checked-in `vercel.json` sets `api/ws.js` to `maxDuration: 300`, adds
`nosniff`, referrer and browser-permission headers, disables API caching, and
caches files under `assets/cards/` immutably for one year. Card image replacements
must use a new asset path rather than changing the contents of a cached URL.

Configure each environment explicitly. Preview credentials do not configure
Production; changing secrets requires a new deployment to pick them up. Keep
Preview/Development data separate from production accounts and rooms.

| Feature | Preferred variables | Accepted aliases |
| --- | --- | --- |
| Live rooms | `REDIS_URL` | `KV_URL` or `UPSTASH_REDIS_URL` |
| Accounts, saves, imported deck library, login limiter | `KV_REST_API_URL` and `KV_REST_API_TOKEN` | `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` |

Live needs a native Redis URL, normally `rediss://...`, supporting commands,
pub/sub, and Lua. Accounts need the HTTPS REST URL and its write-capable token.
These are different connection interfaces; supplying just one does not configure
both features. They may address the same Redis database when the provider exposes
both interfaces. All credentials belong in server environment variables, never
in source, screenshots, browser configuration, or a public ZIP.

Deploy to the existing project and check the resulting deployment state, canonical
alias, and source commit. `READY` and an HTTP 200 home page are necessary but do not
prove that account writes or WebSocket game actions work.

## Custom domains and self-hosting

A custom domain can point to the existing Vercel project. It does not require a
database migration or a different frontend host. Standard origins, including
custom domains and localhost, use same-origin `/api/ws` for Live and `/api/account`
for accounts. The legacy Higgsfield domain adapter uses its platform-specific
`/ws/<room>` path.

When changing the canonical origin, players need to sign in again: session cookies
and browser storage belong to the old origin. Guest deck libraries and custom AI
skills do not migrate automatically; export them before switching. Existing room
invite links also retain their original origin.

A conventional Node.js host can run `api/ws.js` continuously. To serve the whole
application there, provide these three routes behind one HTTPS origin:

1. Static `index.html`, `src/`, and `assets/`.
2. `/api/ws`, including WebSocket upgrades, forwarded to the Live server.
3. `/api/account`, handled by the exported account handler with its REST Redis
   environment.

The repository includes the server modules, not a bundled process manager,
container, TLS terminator, or full self-host launcher. Use a supervisor and a
reverse proxy for a public Node deployment. Preserve the original Host and trusted
`X-Forwarded-Host` / `X-Forwarded-Proto` values, support upgrade headers, and use an
appropriate connection timeout. Origin checks compare the browser's origin with
the request host, and secure account cookies depend on HTTPS information reaching
the handler. Do not expose a general static directory containing `.env` files.

Keep Redis even with an always-on server: it supplies shared room data and pub/sub
across processes. Moving accounts to PostgreSQL or Supabase would require an
account/session/storage adapter and data migration; changing an environment URL
alone cannot perform that migration.

## Commander Live behavior

The host chooses two, three, or four human seats and shares the private room link.
Every player selects a different deck and marks the seat ready before the host
starts. Live has no bot seats. Imported deck lists travel only to their owner and
the host, which checks them against its executable card catalog before building
the game.

The host browser runs the full Commander engine, including hidden game state. The
server manages seats, room revisions, legal response contracts, presence, and
viewer-specific projections. Guests receive their own private view and decision
prompt. The host supplies those projections and legal choices, so Live is intended
for private, trusted tables; this is not an independently simulated tournament
server or an anti-cheat system.

Rooms use random invite codes. An anonymous seat gets a different random reconnect
identity for each room. It stays in the tab's `sessionStorage` and is not broadcast to other players. It is separate
from the optional account login. Only the current connection can act for or receive
private state for that seat; a replacement connection closes the old one. Failed
joins receive no subsequent room state.

The launch release replaces the legacy shared tab identity with versioned,
per-room identities. Start new rooms after upgrading: old room state and
previously disclosed identifiers are not retroactively secured, and the new
client deliberately does not reuse those old seat credentials.

Keep the host tab open throughout a game. A temporary socket drop reconnects after
1.5 seconds and reloads the room view. Disconnecting a participant pauses the room;
the host resumes once everyone is connected. Room Redis data has a 24-hour TTL,
renewed on writes. This is room retention, not a 24-hour durable game save.

Refreshing or closing the host tab loses its in-memory engine. The stored room
projections are insufficient to reconstruct that game, and Live has no host
migration. Guest reconnects and a socket reconnect within the original host tab
are different from restoring a destroyed host page. Solo **Save & Continue** does
not save Live games.

## Accounts and retention

Accounts use email/password authentication with salted scrypt password hashes.
The browser receives an HttpOnly, SameSite=Lax session cookie, marked Secure on
HTTPS. Session identifiers are hashed in storage, expire after 30 days, and are
renewed on authenticated access. Account data uses the `commander-account:v1`
key prefix; Live uses `commander-live`.

The account service retains one Solo save per user, up to 40 imported decks,
favorites, aggregate statistics, and the 10 most recent match summaries. The
completed-match ID set prevents duplicate counting. Results are submitted by the
client and are personal statistics, not independently verified competitive ranks.
The save format includes a private board checkpoint and decision history, with
deterministic reconstruction handled by the client.

User records, saves, imported decks, statistics, and completed-match IDs have no
automatic expiry. There is no email verification, password reset/change, account
deletion UI, or outbound account email service in this repository. Establish a
support and account-removal process before advertising those capabilities. A
Redis backup must include all account-prefix keys, not only user profiles.

| Implemented limit | Value |
| --- | --- |
| Login/registration limiter | 8 attempts per 10 minutes for each action + IP + email key |
| Raw account request body | 1,900,000 bytes when streamed by the handler |
| Solo save payload | 1,750,000 bytes |
| Saved imported deck payload | 64,000 bytes |
| Imported deck list sent through Live | 16,000 UTF-8 bytes |
| Live WebSocket payload | 2,100,000 bytes |
| Live messages | 600 per connection per minute |
| Host synchronized views | 2,000,000 serialized characters |

These are application limits, not a load-test result or a promise of concurrent
player capacity. Multiple rooms increase Redis traffic and active WebSocket
function usage.

## Operational checks and troubleshooting

Use read-only health requests on the actual canonical origin:

```bash
curl --fail-with-body https://mtg-commander-simulator.vercel.app/api/ws
curl --fail-with-body 'https://mtg-commander-simulator.vercel.app/api/account?action=session'
```

Live should return `ok: true`, `storage: "redis"`, `minPlayers: 2`, and
`maxPlayers: 4`. An unauthenticated account check should return `ok: true` with
`user: null`, `profile: null`, and `save: null`, plus `Cache-Control: no-store`.
`user: null` means signed out, not broken authentication.

| Symptom | First check |
| --- | --- |
| Home page works, Live health fails | Native Redis credentials, Production scope, connectivity, Redis command support |
| Live health works, socket fails | Fluid compute, actual upgrade response, same-origin path, reverse-proxy upgrade headers, deployment protection |
| Accounts unavailable | REST URL/token pair and target environment; native `REDIS_URL` alone is insufficient |
| Friend cannot enter a preview | Use the generated invite including its deployment access parameter; do not publish private access tokens |
| Room is full or already started | Use the original player's tab to reconnect; a new tab may receive a new seat identity |
| Host page was closed/refreshed | Start a new room; full Live engine recovery is not implemented |
| Imported deck is rejected by the host | Confirm both clients use the same release and current supported catalog; resolve conflicting deck names |
| Account changed while saving | Reload the profile/library, then retry under the intended account |

Monitor API errors, room disconnect/reconnect behavior, Redis latency/errors,
storage growth, connection usage, and platform spend. Use provider backups for
durable account data and verify that a restore includes sessions, save records,
deck names, and statistical indexes. The repository does not schedule backups.
Avoid logging passwords, cookies, reconnect identities, private hands, and invite
access tokens.

Before a public release, use the checks in [PUBLIC_RELEASE.md](../PUBLIC_RELEASE.md)
and retain the exact source SHA with their results. Verify an actual two-client
Live game through a remote decision, disconnect/reconnect, and private-view checks;
also verify account registration/login/logout, Solo save/continue, and imported
deck synchronization on the deployed build. A health response checks service
availability, not those complete player flows.
