# Release preflight: seven Commander 2011 and Secret Lair precons

Date: 19 September 2026. Baseline: `4bffe169591b141a11180b148891a8da9f494ae9`.

This release adds Goblin Storm, Hatsune Miku, Counterpunch, Mirror Mastery, Political Puppets, Heavenly Inferno and Devour for Power. The library grows to 160 selectable decks and 22,668 importable card definitions. The [import report](../decks/precon-cmd-sld-2026-09-19/README.md) records the original lists, source provenance, 79 new native definitions, 227 local images and preservation checks.

## Completed checks

- `main` and `origin/main` agree after fetching. The dependency manifest and lockfile are unchanged. `npm.cmd ci` succeeds and the production dependency audit reports zero vulnerabilities.
- All 40 implementation and test source hashes match the QA manifest: 871 distinct regression tests, 158 native execution cases, seven completed four-player games and 14 desktop/mobile precon flows pass. A trailing blank line was removed from the native smoke runner for the staged whitespace check; all 158 cases passed again, and the QA manifest records both hashes.
- Syntax, source preservation, deck audit and strict card certification pass. Certification covers 22,668 definitions and 13,409 card/deck pairs. The generated catalog check uses the pinned source with SHA-256 `a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528`.
- All 43 additional release tests pass, covering public packaging requirements, account API/client behavior, Solo save/continue and multiplayer sockets. A stale Solo menu text assertion was updated to the wording already present at the baseline; runtime UI code is unchanged by this correction.
- The four release browser runners pass: player experience, mobile table layouts, guest deck import and Commander Live launch. They cover 320–1900px layouts, persisted settings, actual paid human/AI spell resolution, private guest deck delivery, two separate Live clients and guest reconnection. No browser errors are reported.

The complete `npm test` suite, including the global 160-deck simulation and save-state checkpoint sweep, was not rerun. The selected checks do not claim a full-suite pass or exhaustive rules coverage. Account registration and private cloud-save lifecycle behavior were tested locally, not against production accounts.

## Publication and rollback evidence

The source revision is the commit containing this report. Publication uses the existing GitHub integration on `main`; a manual deployment is needed only if that integration does not publish the pushed revision. Final verification checks the exact revision, READY state, canonical alias, changed source/artwork bytes, all seven new desktop/mobile deck flows, and production Live/account health.

Before publication, deployment `dpl_5YHx7X9DfY6zL9EH8XaqxsVnvHJq` is READY and serves the canonical alias from `mtg-commander-simulator-3evpsavmc-tuitamogamer-7851s-projects.vercel.app`. Its GitHub revision is the baseline above. Landing, Live health and signed-out account session return HTTP 200. Live reports Redis storage and 2–4 players; the account session returns `user: null` and `Cache-Control: no-store`.

Final revision, deployment details, HTTP checks and production browser evidence are recorded locally under `output/precon-cmd-sld-2026-09-19/`. This preflight report does not itself claim publication is complete. The unrelated local `tests/plargg-nassari.test.mjs` is excluded from this release.
