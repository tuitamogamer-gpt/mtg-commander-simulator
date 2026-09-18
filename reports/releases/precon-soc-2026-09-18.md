# Release preflight: three Secrets of Strixhaven precons

Date: 18 September 2026. Baseline: `9705435`.

This release adds Lorehold Spirit, Silverquill Influence and Witherbloom Pestilence. The library grows to 153 selectable decks and 22,589 importable card definitions. The [implementation report](../decks/precon-soc-2026-09-18/README.md) records the exact lists, source provenance, 48 new native card scripts, 97 local images and preservation checks.

## Completed checks

- `main` and `origin/main` agree after fetching. The dependency manifest and lockfile are unchanged.
- `npm.cmd ci` succeeds; the production dependency audit reports zero vulnerabilities.
- JavaScript syntax, source audit, strict card certification and whitespace checks pass. Certification covers 22,589 definitions and 12,860 card/deck checks.
- The pinned catalog is regenerated and its check passes. Existing card definitions, lists and image mappings are preserved; all new image hashes agree with the import manifest.
- All 554 tests in the final import regression selection pass, including 111 focused SOC scenarios. All 13 runtime/test source hashes still match that validation run at release preflight.
- All 96 native execution cases and six affected four-player AI games pass. Every game finishes below the 200-turn cap with consistent state and no engine error or AI fallback.
- All six local desktop/mobile browser flows pass: deck selection, artwork, opponent selection, opening state, commander mana payment, stack resolution and battlefield display.
- All nine multiplayer server tests pass, including real WebSockets, private views and reconnect identity checks.

## Known test limitation

The additional engine selection originally had two failures. The stale planeswalker inventory was corrected and its ten tests pass. The remaining save-state test requires more than 90% saveable checkpoints but reaches 107/120. A separate run against unchanged baseline `9705435` reproduces exactly 107 saved and 13 blocked checkpoints, with every saved board restoring identically. The [baseline comparison](../decks/precon-soc-2026-09-18/baseline-save-comparison.json) records this evidence. The save engine and threshold are unchanged.

The complete `npm test` suite, including the global 153-deck simulation, was not rerun for this release. These results do not claim a full-suite pass or exhaustive rules coverage.

## Publication and rollback evidence

The source revision is the commit containing this report. Publication uses the existing GitHub integration on `main`; a manual deployment is only needed if that integration does not publish the pushed revision. Verify the exact revision, READY state, canonical production alias, changed source/artwork bytes, the three new desktop/mobile deck flows, and Live/account health.

Before publication, deployment `dpl_8KxnSYLGCcURwD3gpPykAKYpK8Uw` is READY at `mtg-commander-simulator-el9zevb5x-tuitamogamer-7851s-projects.vercel.app` and serves the canonical alias. Landing, Live health and signed-out account session return HTTP 200. Live health reports Redis storage and 2–4 players; the signed-out account endpoint returns `user: null` and `Cache-Control: no-store`.

Final revision, deployment details, HTTP checks and production browser results are recorded locally under `output/precon-soc-2026-09-18/`. This preflight report does not itself claim publication is complete. Account registration and private saved-game lifecycle behavior are outside this release's verification scope.
