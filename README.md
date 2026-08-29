# Commander Simulator

Responsive, browser-based Commander table for 27 fixed, scripted preconstructed decks. The public entry explains the game, offers Solo and private Commander Live modes, and leads new players through Deck, Pod, and Review before the opening hand.

Every opponent nonland spell is shown on a central action stage and waits for **Proceed**. The client also exposes real stack/priority passes, configurable end-step/combat/full-control stops, visible combat assignments, and deck/card certification reports.

Bots use the local heuristic/simulation-based **Commander AI Engine V2**. It has hidden-information-safe player views, per-deck profiles, multiplayer threat evaluation, seedable beam search and a structured decision log; it uses no AI/model/API service. See [`docs/COMMANDER_AI_ENGINE.md`](docs/COMMANDER_AI_ENGINE.md).

## Share with players

The production URL for approved, verified releases is:

<https://mtg-commander-simulator.vercel.app/>

For unreleased local changes, share the verified ZIP or complete the release checks before presenting that URL as the current build.

New players can open **Guide** for the first-game walkthrough. An account is optional for immediate play and enables a private Solo checkpoint, lifetime stats, score, most-played commanders, recent matches, and synced deck favorites. Commander Live creates one private link for a human-only table of two to four players.

The fuller handoff and release checklist is in [`PUBLIC_RELEASE.md`](PUBLIC_RELEASE.md).

## Running locally

Install dependencies and run a local static server:

```bash
npm install
npm run serve
```

Then visit `http://127.0.0.1:8000`.

To create a self-host package with the static client, local card art, tests, reports, and optional Live server:

```bash
npm run package:public
```

The verified archive is written to `dist/commander-simulator-public.zip` and is intentionally ignored by Git because it includes the complete local card-image library.

## Debug snapshots and replay

During a solo game, open **Game Menu → Download debug snapshot** to save a share-safe `mtg-commander-debug/v1` JSON report. It includes the seed, table configuration, public checkpoint, recent public log, and AI decision trace, while redacting hand, library, exile, and controller-only face-down identities.

Use **Import debug snapshot** on the Main Page to validate the file and restore its deck, commanders, AI decks/styles, difficulty, Politics, house rule, and seed. The imported configuration starts deterministically from turn 1; the public checkpoint is reference evidence rather than a mid-game save. Online-room snapshots are reported but are not currently accepted by the solo replay importer.

## Accounts and Save & Continue

The hosted build exposes `api/account.js`. Passwords use a per-account scrypt salt and hash; the browser receives only an HttpOnly, SameSite session cookie. Login and registration are rate-limited. One private Solo save is retained per account and updated after each completed human decision or direct Last Resort/Politics action. Continue reconstructs the same hidden and public game state by replaying the deterministic seed and portable action history, then stops at the first new decision.

Completed Solo matches award 100 lifetime points for a win or 25 for a completed loss. Match IDs are recorded idempotently so a retry cannot count a result twice. Commander Live continues to use its room reconnect/sync path rather than the Solo save format.

## Verification

```bash
npm run check
npm test
npm run audit
npm run certify:strict
npm run test:ai
npm run benchmark:ai
```

The generated per-deck/per-card results are in `reports/card-certification.md` and `reports/card-certification.json`.

## Card images and external services

Card art and mana symbols are bundled locally. The 17 flavor-name prints that cannot be resolved by Scryfall's collection endpoint use its named image API at runtime, with the local card back as an error fallback. `npm run sync:card-images` is the explicit maintenance command that resolves the fixed deck/token inventory through Scryfall, converts it to WebP, and regenerates the hardcoded manifest in `src/card-images.js`.

Deck data is also bundled. Arbitrary/Moxfield deck import is intentionally not part of this product. Redis credentials are server-only environment variables and are never shipped to the browser.

## Deployment

The browser client is deployed as static files on Vercel. `index.html` loads the ES modules under `src/`; there is no production build step. Commander Live uses `api/ws.js` with `REDIS_URL`-compatible room storage and private room codes. Accounts use `api/account.js` with `KV_REST_API_URL` and `KV_REST_API_TOKEN` (or the `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` aliases).

## Fan project notice

Commander Simulator is unofficial Fan Content permitted under the [Wizards Fan Content Policy](https://company.wizards.com/en/legal/fancontentpolicy). Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.
