# Release preflight: ten Bloomburrow through Final Fantasy precons

Date: 12 September 2026. Baseline: `cf8acd2dea4f6a6d6ae9fd92b6ceff0cff8fde03`.

This release adds ten original 100-card precons, bringing the selectable library to 150 decks and the importable catalog to 21,541 definitions. The [implementation report](../decks/precon-blc-dsc-sld-drc-fic-2026-09-12/README.md) records list sources, native rules checks, artwork hashes and development regression results.

## Completed release checks

- Clean dependency installation with `npm.cmd ci`; lockfile unchanged.
- JavaScript syntax checks and source audit pass. All 150 decklists contain 100 cards, with no duplicate scripts or simplified cards.
- Strict certification passes 21,541 / 21,541 raw definitions and 12,603 / 12,603 card/deck checks.
- Production dependency audit reports zero vulnerabilities.
- Source/list/artwork preservation checks pass against the baseline, including 294 new WebP hashes.
- Pinned catalog export and its check pass; staged whitespace check passes.
- Local browser acceptance passes for player experience, mobile table view, real deck import and paid spell resolution, and two-client Live launch/reconnect with private hands.
- The implementation's ten-deck browser matrix passes all 20 desktop/mobile flows; its native matrix passes 312 execution cases and its affected-deck matrix passes 13 four-player games.

Certification identified missing private top-of-library presentation for **One with the Multiverse** and **Into the Pit**. Both now use the shared `revealOwnTop` flag. All ten dedicated library visibility checks pass after the correction. New text files also received line-ending normalization.

## Interrupted full suite

The release attempted the complete `npm.cmd test` suite, including the global 150-deck simulation. At 22:22 local time, the user explicitly requested stopping the remaining tests and finishing deployment. The runner and its remaining headless and player-facing test processes were stopped. The command exited with code 1 after interruption; this is **not a full-suite pass**.

The global simulation completed 43 of 150 games and was running Seize Control (44/150) when stopped. Its completed games finished with winners below the turn cap and no pending triggers. No failure had been emitted before interruption, but buffered and unfinished results are not counted as passes. Earlier development failures and targeted corrections remain recorded separately in the implementation report.

## Publication evidence

The source revision is the commit containing this preflight report. Publication uses the existing project's production workflow and verifies the exact revision, READY state, canonical alias, changed runtime/artwork bytes and landing/Live/account health endpoints.

Final commit and deployment evidence is recorded locally under `output/precon-blc-dsc-sld-drc-fic-2026-09-12/`. This preflight report does not itself claim publication is complete. Additional browser test suites are not repeated after the user's stop request; the browser results above are local acceptance results. Public account lifecycle behavior is outside this release's verification scope.
