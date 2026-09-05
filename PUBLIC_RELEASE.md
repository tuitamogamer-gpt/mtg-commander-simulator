# Commander Simulator public release

The public entry point is <https://mtg-commander-simulator.vercel.app/>. The [README](README.md) introduces the product; [Deployment](docs/deployment.md) documents its server configuration; the [card catalog](docs/card-catalog.md) defines card coverage.

A release is ready to share after its source revision passes the applicable gates and the canonical deployed URL is verified. A successful CLI upload or a card count alone is insufficient.

## Player handoff

Players need a current desktop, tablet, or mobile browser. An account is optional. Start with **Guide**, choose **Solo** or **Commander Live**, select a deck, build the pod, and review the settings.

For a custom list, use [Import your deck](docs/deck-import.md). For opponent personalities, use [AI archetypes](docs/ai-archetypes.md) and [Custom AI skills](docs/custom-ai-skills.md). Tell Live hosts to keep the game tab open and invite only trusted players; this is a private table with a host-run engine.

Present the [current data and account limits](docs/data-and-accounts.md) honestly. Password recovery, email verification, account deletion UI, public matchmaking, host migration, and durable Live resume are not implemented.

## Source and automated gates

Use the existing `main`, GitHub remote, and production project unless deliberately changing release targets. Check `git status --short --branch` and fetch the remote before working. Preserve unrelated worktrees and uncommitted work.

```bash
npm ci
npm run check
npm test
npm run audit
npm run certify:strict
npm audit --omit=dev --audit-level=high
git diff --check
```

The full suite includes AI, rules, account, deck import, and multiplayer server coverage. Focused commands are useful during development:

```bash
npm run test:ai
npm run test:server
npm run benchmark:ai
```

For card imports, also verify batch provenance against the pinned SHA-256 source and regenerate/check the [exported catalog](docs/card-catalog.md). Certification report timestamps can change without a content change; do not commit timestamp-only noise.

## Browser acceptance

Run the existing browser scripts with Playwright available to Node. `PLAYWRIGHT_MODULE` can point to an installed `playwright/index.mjs` when it is not a project dependency.

```bash
node tests/browser/oracle-import-release.mjs --output output/playwright/release-import
node tests/browser/player-experience.mjs
node tests/browser/mobile-table-view.mjs
node tests/browser/commander-live-launch.mjs --output output/playwright/release-live
```

Check real user-facing behavior, including:

- Landing page, guide, deck selection, Pod, Review, and opening hand.
- A pasted 100-card list, validation errors, My Library persistence after reload, and actual paid spell resolution.
- Human and local AI decisions through the stack, Proceed, and combat.
- Phone and desktop layouts, card artwork, and browser console/page errors.
- Two or more separate Live clients: create/join, private hands, imported guest deck delivery, ready/start, a guest decision, and guest reconnection.
- Optional account registration/login/logout, a private Solo save/continue, owner-bound imported lists, and favorites using a disposable local or staging account.

The host must remain active for Live reconnect testing. A surviving Redis room record does not establish that a closed host's engine can resume.

This release changes Live reconnect identities from a legacy shared tab value to fresh per-room credentials. Start new rooms after the upgrade. Existing room records and credentials disclosed by an earlier build are not retroactively protected; the new client does not reuse the legacy identity.

## Publish and verify

Commit only the intended files and push `main`. Compare local HEAD, `origin/main`, and `git ls-remote origin refs/heads/main`. Deploy through the linked project's established release workflow; avoid duplicate deployments when Git integration already started the same revision.

Independently inspect the deployment to **READY**, confirm its revision metadata or compare the shipped changed source bytes, and verify the canonical URL:

```bash
curl --fail https://mtg-commander-simulator.vercel.app/
curl --fail https://mtg-commander-simulator.vercel.app/api/ws
curl --fail 'https://mtg-commander-simulator.vercel.app/api/account?action=session'
```

Live health must report `ok: true`, Redis storage, `minPlayers: 2`, and `maxPlayers: 4`. A signed-out account session should return `ok: true, user: null` with no-store caching. Neither health response replaces a real socket or browser test.

Repeat the relevant browser flow against production, for example:

```bash
node tests/browser/oracle-import-release.mjs --url https://mtg-commander-simulator.vercel.app --output output/playwright/production-import
node tests/browser/commander-live-launch.mjs --url https://mtg-commander-simulator.vercel.app --output output/playwright/production-live
```

Record the source revision, command results, production deployment ID/state, canonical HTTP checks, browser evidence, and any untested limits in a dated report. Inspect final `git status` and branch state before reporting completion.

## Hosting and account operations

Configure both the Live TCP Redis connection and account REST Redis credentials in the correct deployment environment. Verify provider quotas, connection limits, log access, and backup/restore procedures for the intended audience. Keep secrets and private game records out of source control and public test output.

Before changing the domain, check WebSocket routing, HTTPS, redirects, canonical/share metadata, and origin-scoped cookies and browser storage. Signed-in users will need to authenticate on the new origin; guests should retain decklist/skill exports. A new domain does not require changing the frontend host.

Before advertising supported public accounts, the operator must establish a private contact route and a retention/deletion/recovery procedure. These operational choices are not created by committing documentation.

## Self-host archive

```bash
npm run package:public
```

This generates and integrity-checks `dist/commander-simulator-public.zip`. After extraction, `npm ci && npm run serve` starts guest Solo. Online features need the [server configuration](docs/deployment.md), dependencies, and Redis services. The archive intentionally excludes credentials and local workspace output.

## Rollback

Record the last verified deployment and source revision before release. If the new production build fails, return the existing project's canonical alias to that verified deployment, verify HTTP and Live/account behavior again, and stop advertising the failed build. Avoid rewriting shared Git history; record any source correction as a new commit.

## Fan project notice

Commander Simulator is unofficial Fan Content permitted under the [Wizards Fan Content Policy](https://company.wizards.com/en/legal/fancontentpolicy). Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.
