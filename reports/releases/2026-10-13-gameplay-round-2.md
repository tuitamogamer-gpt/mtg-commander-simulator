# Gameplay and account follow-up — 2026-10-13

Base revision: `8943fb03671f73d5cd77534bd15fd2fe112f3109`.

## Problems and changes

- A paid Ragavan Dash return could move the live card during an opponent's hypothetical Opt response. The delayed action now captures the battlefield incarnation when created and resolves through `ctx.src` and `ctx.sourceZoneVersion`. A blinked incarnation is excluded before and after trigger placement.
- Combat monarch/initiative transfers captured a live player in a function closure. A simulation could appear successful while assigning a holder outside its own player list. Their recipients now live in cloneable context data. Monarch also uses the damaging creature's current controller, or departure-time last-known information for its original incarnation. Source-less ability ownership and initiative's existing simultaneous-player grouping are preserved.
- Detached choice controls could answer the next human question. A native Rolling Thunder split could silently become 1/1/3 when a callback for its first target was replayed during its second target's choice. Modal and target controls are bound to their captured pending decision, including delegated visual choices and draft edits.
- Older same-account session/favorites responses could restore a deleted save or overwrite newer match statistics. The client tracks successful save/profile mutations and preserves those fields when an older response arrives. Genuine account changes, newer session authority, and failed-write recovery retain their native behavior.
- A stale tab's favorites request could write into a different authenticated account. Client and API now exchange and enforce the expected owner, matching the existing save/deck operations. Old already-open clients need a reload for owner-aware favorites requests.

The Dash and monarch behavior follows [the current official rules](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.txt), especially 702.109a, 603.7c–d, 725.2 and 608.2h. Initiative follows the existing per-player grouping in 726.2; this round does not reinterpret a damaged creature group's subsequent split control.

## Reproduction and verification

- Identical 15-case AI/native test bytes on the immutable base: 13 failures, 2 passing stale-Dash controls. Fixed: 15/15 pass. Actual paid responses preserve the full live-state isolation fingerprint and timestamp while resolving cloned objects, participants, dungeons and Palace Jailer duration effects. The existing targeted integration cohort passes 99/99; overlapping tests are not added to other cohort counts.
- Final account-client cases on the immutable base: 6 failures, 10 passing controls. Fixed account cohort: 42/42 (16 client, 18 API, 8 request-input), including local HTTP account ownership checks and the prior Vercel lazy-body parser regressions.
- All six native UI callback cases fail on the immutable base. Fixed UI cohort: 6/6, covering ordinary and visual choices, mode selection, target confirmation/removal, the actual paid Rolling Thunder 1/3/1 split, and removed-entry preservation of the current sheet.
- Combined focused regression command: 164/164 passing, zero skips or cancellations. AI V2 unit checks: 25/25 passing. JavaScript syntax and diff whitespace checks: PASS.
- Desktop and 390px phone Solo acceptance, both before and after the patch, complete the actual game in 69 UI steps, with 4 lands, 6 spells and 2 attacks, at turn 16. Rematch retains the pod and preferences. No page errors or failed HTTP responses. These use real clicks/keyboard input; native choices are not substituted.
- Source audit, strict card certification and production dependency audit: PASS. Certification covers all 32,136 raw definitions, 6,474 active unique cards and 14,566 card/deck checks. Dependency audit reports zero vulnerabilities. Generated timestamp-only report changes are excluded.

The mobile changed-behavior browser fixture also passes: a retained first-target callback leaves the exact second pending choice open, then fresh controls produce damage 1/3/1, tap seven lands, spend seven mana and put Rolling Thunder in the graveyard. Plain options and modes reject old callbacks; focused Enter still submits the current option. No page or render errors. Existing native Throne choice, Retry/focus and responsive search acceptance passes all four checks.

Local evidence lives under `/workspace/scratch/improvement-round-2-2026-10-13/`. Reusable changed-behavior acceptance is `tests/browser/decision-callbacks.mjs` (output via `DECISION_OUTPUT`).

## Publication and limits

The full repository suite and all-175-deck match sweep are not part of this round. The two Solo games use the same deterministic learn pod; they do not establish every pod or multiplayer socket path. No deck catalog, dependency, lockfile or database-schema changes are made.

`test:focused` includes the new native and UI regressions. Browser acceptance supports an installed Chromium through `BROWSER_EXECUTABLE`; the production asset check now includes `engine.js` and `src/account.js` alongside the prior four assets. Production requires the exact merged revision in READY state with the canonical alias, then fresh public browser and invalid-input account checks. Deployment identity and final receipts are added to the PR and local release evidence after publication.
