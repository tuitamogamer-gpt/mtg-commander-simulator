# Oracle batches 0189–0198

Local import and validation, 20 September 2026.

## Imported catalog

Exactly **1,000 distinct Oracle IDs** were imported in ten complete batches, `oracle-0189` through `oracle-0198`. Every non-reminder Oracle clause compiles to executable rules under compiler v10. The existing v9 parser remains the first successful interpretation for previously supported cards.

| Inventory | Count |
| --- | ---: |
| Generic Oracle batches | 198 |
| Generic Oracle cards | 19,800 |
| All runtime definitions | 23,749 |
| Definitions eligible for deck import | 23,748 |
| Represented Commander-legal paper Oracle IDs | 23,704 |
| Remaining IDs in the pinned comparison universe | 7,080 |

The remaining queue contains one parser-ready card and 7,079 deferred cards. The generated [catalog](../../docs/card-catalog.md) and CSV exports contain the full inventory. Native Prepare front faces are reserved during selection to prevent duplicate imports.

## Pinned source

- Scryfall bulk ID: `27bf3214-1271-490b-bdfe-c0be6c23d02e`.
- Snapshot: `2026-08-30T09:01:56.964+00:00`.
- Compressed SHA-256: `a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528`.
- Reports retain full-feed counts, the source identity, exact card text, implementations, and the selection policy.

## Rule coverage and regression fixes

The additive grammar and runtime cover the imported forms of mutate, prepare, saddle, start your engines/max speed, toxic, snow mana, Spree, Escalate, Cleave, Prototype, Bargain, fixed Waterbend activation costs, Kinship, Radiance, and additional closed target, cost, counter, token, attachment, and mana instructions.

Dedicated scenarios verify actual payments and failure atomicity, copied spell choices, last-known information after sacrifice, zone-identity resets, once-per-object upgrades, turn cleanup, prevention and countering restrictions, nontargeted exile choices, and additional mana provenance. Enduring returns retain the enchantment type change through JSON save/restore and do not return again after dying as an enchantment. Max speed remains a real condition during parsing. Printed face text remains separate from normalized executable grammar; Cecil, Exdeath, Kuja, and Lluwen preserve their exact printed Oracle text. The landing count and the native-precon inventory assertion were updated for the new catalog.

Prepare definitions survive the application's later native-script initialization, so both newly imported and native prepared spells can be saved and restored. The Mary Janes and Witchstalker Frenzy use distinct attacker history for the whole turn, including departed objects, rather than counting current battlefield survivors. Actual combat scenarios cover additional combats, entering already attacking, a blink, opposing casters, JSON restore, payment, and next-turn reset. Witchstalker Frenzy still requires its red mana payment, consistent with the [official Wilds of Eldraine release notes](https://magic.wizards.com/en/news/feature/wilds-of-eldraine-release-notes). Existing tests also retain ambiguous-clause rejection, token-only buffs and cleanup, and avoid fixture-name collisions with the newly imported real cards.

## Validation

| Gate | Result |
| --- | --- |
| Exact source/report/runtime/state provenance, 1,000 cards | PASS |
| Production execution matrix, every new card, human and AI | PASS; 4,424 invariant-checked games, zero failures |
| Full Oracle execution matrix, 19,800 cards, human and AI | PASS; 72,883 invariant-checked games, zero failures |
| Focused v10 and snow scenarios | PASS |
| Audit | PASS; zero duplicate script registrations or simplified cards |
| Strict certification | PASS; 23,749/23,749 raw definitions |
| Runtime dependency audit | PASS; zero vulnerabilities |
| Browser import and gameplay | PASS |
| Full repository test coverage | PASS after corrections; completed 446-file run and clean reruns of every affected file |
| Four-player headless simulations | PASS; all 169 decks, five disjoint partitions |
| Final regenerated catalog consistency, syntax, and whitespace | PASS |

The browser gate imports a 100-card list containing 59 cards from the new cohort, verifies list persistence after reload, observes a paid human cohort permanent and an AI spell on the Stack, and reaches a stable main phase with no pending triggers, fallback AI decisions, console/page errors, or horizontal overflow.

Local run evidence is in `.local/oracle-v10/`: `complete-validation.json`, `production-proof-release.json`, `all-cards-verified.json`, `provenance-release.json`, `browser/report.json`, and the test logs and gate result files.

The 446-file regular run covered every top-level test file except `headless-smoke.test.mjs`, with `node --test --test-concurrency=2`. It completed 11,248 checks: 11,240 passed and eight initially failed across seven files. Those failures were corrected. The final full-file rerun of nine affected and related files passed all 221 tests; the separate full `oracle-bulk-interactions.test.mjs` rerun passed and executed all 19,800 Oracle cards. The evidence verifier checks that every initially failed file is covered by a successful rerun. The initial exit-code-1 run remains recorded as a diagnostic, not a passing run. Final runs have no skipped or cancelled tests. The proof observer checks dynamic amounts at execution, preserves departing targets' last-known characteristics, and checks actual library-top ordering without requiring an artificial zone change.

Clean headless coverage uses the supported partitions 0, 1, and 2 of 4, plus 3 and 7 of 8, preserving each deck's original index, opponents, seed, and completion assertions. These disjoint groups contain 43 + 42 + 42 + 21 + 21 = 169 four-player games, all with a winner, below the turn limit, and without pending triggers. This sweep preceded the final Prepare-registry and attack-history corrections; actual combat, payment, and JSON save/restore tests then verified those corrections in the clean 221-test rerun. Interrupted and profiler-affected runs are retained as diagnostics and excluded from completed validation.

The execution matrix checks controlled scenarios and state invariants for every new card; it does not exhaust every possible card combination.
