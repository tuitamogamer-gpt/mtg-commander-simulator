# Commander Simulator public release

For a direct handoff, use the verified ZIP described below. After this exact audience build is released and production-verified, the hosted link is the recommended way to share it with players:

<https://mtg-commander-simulator.vercel.app/>

The first screen explains Solo and Commander Live, opens a short first-game guide, and then leads through Deck, Pod, and Review before a game starts.

Do not tell players that new local changes are live until the deployed revision has passed the release checks in this document.

## What a player needs

- A current desktop, tablet, or mobile browser.
- Accounts are optional for play; signing in enables a private Solo save, lifetime stats, scores, and synced favorites.
- One private invite link from the host for Commander Live.
- No external AI or model service. All bot decisions run inside the Commander client.

## What to tell new players

1. Press **Start a solo table** for the simplest first game.
2. Open **Guide** if HOLD, priority, the stack, or Proceed are unfamiliar.
3. Pick a deck by playstyle. Its spotlight explains the game plan, opening hand, and signature cards.
4. Build the pod, review all public settings, and start.
5. Important spells, targets, triggers, and combat reviews wait for the player to continue.

## Shareable self-host package

Run:

```bash
npm run package:public
```

This creates `dist/commander-simulator-public.zip` and verifies the archive. It contains the static client, local card art, Commander intro media, tests, reports, and the optional Commander Live server.

After extracting the archive:

```bash
npm install
npm run serve
```

Then open <http://127.0.0.1:8000>. Guest Solo mode works from the static server. Commander Live needs a hosted WebSocket deployment and Redis-compatible `REDIS_URL`, `KV_URL`, or `UPSTASH_REDIS_URL` storage. Login, profile stats, and cloud saves need the hosted account endpoint plus `KV_REST_API_URL` / `KV_REST_API_TOKEN` (or matching Upstash REST aliases).

## Before publishing a new version

Run the relevant browser flows and these release gates:

```bash
npm run check
npm test
npm run audit
npm run certify:strict
npm run test:ai
npm run benchmark:ai
```

Confirm that the deployed URL returns HTTP 200, `/api/ws` reports a ready room service, `/api/account?action=session` returns a no-store session response, private invite links open the correct room, register/login/logout work with an HttpOnly cookie, a Solo action can be saved and continued, and the deployed browser has no new console or page errors.

## Fan project notice

Commander Simulator is unofficial Fan Content permitted under the [Wizards Fan Content Policy](https://company.wizards.com/en/legal/fancontentpolicy). Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.
