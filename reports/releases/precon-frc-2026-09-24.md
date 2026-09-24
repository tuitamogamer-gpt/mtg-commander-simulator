# Release preflight: Reality Fracture Multiverse Reforged

Date: 24 September 2026. Baseline: `bd1bba00aa0db32ad8cd429ff4765197fbddf6af`.

This release adds the complete 100-card Multiverse Reforged precon with Jace, Multiverse Architect as commander, its guide, AI profile, native rules and local artwork. The library grows to 170 decks, 24,775 runtime definitions and 24,774 cards eligible for import. The [import report](../decks/precon-frc-2026-09-24/README.md) records the official list, pinned Oracle data, 26 new native definitions, 39 images and preservation of existing content.

## Completed checks

- `main` and `origin/main` agree after fetching. `npm.cmd ci` succeeds with unchanged dependency manifests; the production dependency audit reports zero vulnerabilities.
- All 20 implementation source hashes and 39 new image hashes still match the QA manifests. The recorded implementation checks pass: 1,160 selected regression tests, including 84 FRC cases, two desktop/mobile precon flows and a completed four-player AI game with valid state and no fallback.
- Syntax, source preservation, repeat-import consistency, deck audit and strict certification pass: 170 decks, 14,224 card/deck checks, 6,384 distinct active cards and all 24,775 raw definitions. Existing cards, decks and artwork remain preserved.
- The catalog export and its check pass against pinned source SHA-256 `a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528`. The import report documents validated reuse of unchanged parser classifications and the treatment of new native identities absent from the older snapshot.
- All 48 additional release tests pass, covering public packaging, account API/client behavior, Solo save/continue, multiplayer sockets and imported guest decks.
- All four release browser runners pass: player experience, mobile table layouts, guest deck import and Commander Live launch. They cover 320–1900px setup layouts, preferences, actual paid human/AI spell resolution, separate Live clients, private guest hands and guest reconnection. No browser errors are reported.
- The mobile runner initially waited at a valid action-review checkpoint because its selector omitted the prompt bar and resolution recap. It now selects visible Proceed/Continue controls by their label. The complete runner passes again, including real land play, all phone/tablet layouts and restoration of desktop views. This changes the test driver only.
- Three new helper/test files had CRLF line endings normalized to LF for the staged whitespace check. Their executable content is unchanged; syntax checks pass and the QA digest manifest records both hashes. Catalog fingerprint metadata was refreshed and export/check pass again.
- Browser runners use the installed Chrome channel through a local Playwright adapter because the default bundled Chromium executable is not installed. Test assertions remain unchanged.

The complete `npm test` suite, including the global all-deck simulation and save-state checkpoint sweep, was not rerun. These focused checks do not claim a full-suite pass or exhaustive Magic rules coverage. Account registration and private cloud-save lifecycle behavior were tested locally, not against production accounts.

## Publication and rollback evidence

The source revision is the commit containing this report. Publication uses the existing GitHub integration on `main`; a manual deployment is needed only if that integration does not publish the pushed revision. Final verification checks the exact revision, READY state, canonical alias, changed runtime/artwork bytes, desktop/mobile precon flows and production Live/account behavior.

Before publication, deployment `dpl_FxxYHD8qv8GcsRCqLY85iLrRFmDW` is READY and serves the canonical alias from `mtg-commander-simulator-owlhsgxto-tuitamogamer-7851s-projects.vercel.app`. The deployed card-data bytes match the baseline revision. Landing, Live health and signed-out account session return HTTP 200. Live reports Redis storage and 2–4 players; the account session returns `user: null` with `Cache-Control: no-store`.

Final revision, deployment metadata, HTTP/source checks and production browser evidence are recorded locally under `output/precon-frc-2026-09-24/`. This preflight report does not itself claim publication is complete. The unrelated local `tests/browser/disorder-in-the-court.mjs` and `tests/plargg-nassari.test.mjs` are excluded and remain unchanged.
