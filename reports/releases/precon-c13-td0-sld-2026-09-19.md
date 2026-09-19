# Release preflight: eight Commander 2013, Angels and MTGO precons

Date: 19 September 2026. Baseline: `ffc96c35a69991e0f9fb8969eeb8c6deb9d0a335`.

This release adds Evasive Maneuvers, Power Hungry, Eternal Bargain, Mind Seize, Nature of the Beast, Angels: They're Just Like Us but Cooler and with Wings, Enchantress Rubinia and Deathdancer Xira. The library grows to 168 decks and 22,748 importable cards. Brisela is an additional meld-result definition, bringing the runtime total to 22,749 definitions. The [import report](../decks/precon-c13-td0-sld-2026-09-19/README.md) records list provenance, the exhausted eight-deck queue, 81 new native definitions, 246 images and preservation checks.

## Completed checks

- `main` and `origin/main` agree after fetching. `npm.cmd ci` succeeds with the unchanged dependency manifest and lockfile; the production dependency audit reports zero vulnerabilities.
- All 15 implementation QA source hashes and 246 new image hashes match their manifests. The recorded implementation checks pass: 533 targeted regression tests, 162 human/local-AI execution cases, eight completed four-player games and 16 desktop/mobile precon flows. No game reaches the artificial turn cap or uses an AI fallback.
- Syntax and source preservation pass again during release preparation. The unchanged rules implementation retains its passing deck audit and strict certification: 168 decks, 14,045 card/deck checks, 6,337 distinct active cards and all 22,749 raw definitions. Existing cards, deck lists, artwork and videos remain preserved.
- All 48 additional release tests pass, covering public packaging, account API/client behavior, Solo save/continue, multiplayer sockets and imported guest decks.
- The four release browser runners pass: player experience, mobile table layouts, guest deck import and Commander Live launch. They cover 320–1900px setup layouts, persisted preferences, paid human/AI spell resolution, two isolated Live clients, private guest deck delivery and guest reconnection. No browser errors are reported.
- The player-experience runner exposed 33px of Pod overflow at 820px because the new Angels option enlarged the select controls. The layout now allows both select columns and their containers to shrink. The full layout runner passes again; an additional 820px check with Angels selected reports a scroll width of exactly 820px. The resulting screenshot was inspected.
- The new `decklists.json` report uses LF line endings; its parsed deck and provenance content is unchanged. The staged whitespace check passes.

The final catalog export and `--check` pass against the pinned compressed source SHA-256 `a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528`. An initial check found an outdated classifier-files fingerprint; regeneration refreshed that metadata and the subsequent check passed. Both generated CSV contents are unchanged from the implementation QA artifacts.

The complete `npm test` suite, including the global all-deck simulation and save-state checkpoint sweep, was not rerun. The selected checks do not claim a full-suite pass or exhaustive Magic rules coverage. Account registration and private cloud-save lifecycle behavior were tested locally, not against production accounts.

## Publication and rollback evidence

The source revision is the commit containing this report. Publication uses the existing GitHub integration on `main`; a manual deployment is needed only if that integration does not publish the pushed revision. Final verification checks the exact revision, READY state, canonical alias, all changed runtime/artwork bytes, all eight desktop/mobile precon flows and production Live/account behavior.

Before publication, deployment `dpl_gSHr2ZTH93ok3yZMRakyZm2s8jMx` is READY and serves the canonical alias from `mtg-commander-simulator-pp99sopio-tuitamogamer-7851s-projects.vercel.app`. Its GitHub revision is the baseline above and the deployed card-data bytes match that revision. Landing, Live health and signed-out account session return HTTP 200. Live reports Redis storage and 2–4 players; the account session returns `user: null` with `Cache-Control: no-store`.

Final revision, deployment metadata, HTTP/source checks and production browser evidence are recorded locally under `output/precon-c13-td0-sld-2026-09-19/`. This preflight report does not itself claim publication is complete. The unrelated local `tests/plargg-nassari.test.mjs` is excluded and remains unchanged.
