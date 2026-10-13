# Gameplay and reliability improvement round — 2026-10-13

Base revision: `159598fb479de2754c4a761cdcdac2a84c97ae5e`.

## Delivered behavior

- A presentation exception keeps the human decision Promise open. An independent accessible recovery dialog retries only the view, blocks stale table inputs, restores keyboard focus, and exports bounded, redacted presentation diagnostics. Paid actions are not submitted or paid again; engine fatal errors retain their existing recovery path.
- Creature-type choices with more than 50 options offer case-insensitive search, preserve their query across redraws, announce result counts and accept Enter only for a single match. Every legal option remains selectable. Old search buttons cannot answer a later decision. Search uses a full-width, 44px minimum touch control with 16px text.
- Pending Suspend upkeep, last-counter casts, Greater Gargadon counter removal and Equip resolve through their current context source and controller. Hypothetical AI responses no longer advance live suspended cards or attach live equipment. Copied abilities and stale source/target incarnations are covered separately.
- Account requests tolerate malformed unrelated cookies. Streamed and hosting-parsed JSON bodies share the object contract and UTF-8 size limit; invalid input returns a client error before contacting storage.
- `test:focused`, `test:ai:unit` and `test:ai:games` expose bounded and long-running verification separately. The combat audit now follows CR 509.1g: a declared blocker remains blocking until combat ends even if its attacker leaves.

## Evidence

Same-test baseline comparisons on immutable source:

- AI pending-source regression: 7 failures and 3 passing stale-incarnation controls on the base revision; all 10 pass with the fix. Native Opt response simulation preserves the complete live isolation fingerprint and resolves the cloned stack. Real resolution subsequently proceeds once.
- Choice UI regression: 2 failures and 1 passing short-choice control on the base UI; all 3 pass with the fix. Native paid Roaming Throne entry supplies all 324 types and finishes as Ninja.
- Account input regression: all 6 new cases fail on baseline and pass with the fix, including exact UTF-8 size boundaries and preservation of a valid session beside a malformed cookie.

Completed checks:

- Focused rules/UI/account/save/AI cohort: 127 tests, all passing.
- AI V2 unit checks: 25 passing. Additional Equipment cohort: 19 passing. Existing targeted Suspend/Equip integration cohort: 86 passing; overlaps with the focused cohort are not added to its count.
- UI recovery and existing debug-bundle cohort: 11 passing.
- Chromium acceptance: real Solo setup, paid Throne entry, recovery of the same waiting choice with exactly four mana paid, restored focus, search/Enter and no horizontal overflow at 320px, 390px and 1440px. No page errors.
- Existing battlefield-combat browser acceptance: 15 scenarios passing, including attacks split between a player and planeswalker, restrictions, blockers, drag, touch, retained assignments and phone/tablet/desktop widths.
- JavaScript syntax, source audit, strict card certification, production dependency audit and diff whitespace: PASS. Certification covers 6,474 unique active cards / 14,566 card-deck checks and all 32,136 raw definitions. Dependency audit reports zero vulnerabilities.

The initial type chooser renders 50 buttons instead of 324, an 84.6% reduction. Both browser runs retain all 324 native options. Render durations were collected for diagnosis; these single runs are not a statistically controlled timing benchmark.

Local logs and screenshots: `/workspace/scratch/improvement-round-2026-10-13/`. The reusable browser script is `tests/browser/improvement-round.mjs`.

## Scope and deployment verification

The full repository test suite and 175-deck full-match simulation were not run in this round. Certification does not prove every possible interaction. No card catalog, dependency or lockfile changes were made. Browser fixtures exercise native paid actions and the actual decision Promise; they do not establish a complete match or multiplayer socket pass.

After this source commit deploys through the existing Git integration, production acceptance must establish the exact merged SHA, READY state and canonical alias, then run the browser script against the public site. That run compares all four changed UI/engine/style assets with this checkout. Production deployment identity and results are recorded in the PR and local release evidence after publication; this pre-deployment document does not claim they already passed.

## Production request-parser follow-up

Production account checks on merged revision `b60cb960ad1ec608e384d1c6df91acb25e0daae1` passed eight of nine cases. Malformed JSON (`{`) returned 500 because Vercel's lazy `request.body` accessor throws `Invalid JSON` with `statusCode: 400` before the application's JSON parser runs. Signed-out sessions, malformed cookies and the five non-object JSON values already returned their expected responses with no-store caching.

The follow-up reads the hosting body once inside a narrow guard, translating SyntaxError and accessor status codes 400/413 into the existing client responses. Unknown accessor failures remain 500. Two real-accessor regression tests failed before the correction; the corrected account cohort passes **21/21**, including the existing registration, authentication, saves and logout tests. Syntax and whitespace checks pass. The broader 127-test and browser results above retain their original-source provenance; they were not repeated for this account-only correction.

The nine unauthenticated production checks must be repeated after the follow-up deployment. Local receipts are `reliability/hosting-getter-red.log`, `reliability/hosting-getter-green.log` and `reliability/production-account.json` under the evidence directory above.
