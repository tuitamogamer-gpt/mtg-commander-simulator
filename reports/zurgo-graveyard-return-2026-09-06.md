# Zurgo graveyard and Sun Titan verification

The reported historical effect was not identified. A paid Zurgo → Murder → choose Graveyard → Sun Titan sequence already returned Zurgo successfully. The investigation reproduced a separate, matching failure: Mari, the Killing Quill moved Zurgo from that graveyard to exile without the new command-zone choice. Soul-Guide Lantern, Scavenger Grounds and Ultimate Nullification had the same bypass.

These four scripts now use the existing zone-movement engine. Exile remains a real zone change, and the owner can then choose the command zone under [CR 903.9a](https://media.wizards.com/2026/downloads/MagicCompRules%2020260819.txt). Mari also checks the original graveyard object: an old death trigger cannot exile Zurgo after Sun Titan returns him and he dies again.

- 15 new paid human/local-AI regression cases; 183/183 related tests pass.
- Sun Titan entry and actual combat return Zurgo with mana value 3 even after paying commander tax. Reanimation does not increase command casts.
- Mari offers command or exile after the original graveyard choice; staying preserves the hit counter, choosing command removes it. Sun Titan cannot return an exiled card.
- Each of the three mass graveyard effects offers the command choice after resolving and moves other graveyard cards normally.
- Chromium 7/7 and WebKit 7/7 browser scenarios pass, including human card actions, graveyard selection, both commander choices, 390px phone UI and local AI. No page/console errors. Relevant screenshots and text states were inspected.
- The standard develop-web-game client reaches a playable four-player Mardu main phase.
- Syntax, catalog audit, strict 19,484/19,484 definition certification, 2,347/2,347 card/deck checks and diff validation pass.

Tests: `tests/zurgo-graveyard-return.test.mjs` and `tests/browser/zurgo-graveyard-return.mjs`. Logs, certification snapshots, screenshots and browser reports: `output/web-game/zurgo-graveyard-return/`.

The user subsequently requested commit, push and production deployment on 2026-09-06. Release preflight: `npm test` passes 7,177/7,177 tests in 835.9 seconds, with no failures, cancellations or skipped tests. All 900 source/test file hashes remain unchanged through that run. Syntax, catalog audit and strict certification pass again; `npm audit --omit=dev` reports zero vulnerabilities. The browser harness now accepts `GAME_URL` and a separate evidence directory for production checks. A fresh local run passes all seven Zurgo scenarios and all six Live launch/reconnection checks.

This release contains no card imports, catalog data or compiler changes. The historical pinned Oracle source is no longer present locally, so no fresh source-provenance or catalog-regeneration claim is made. Release logs, fresh certification snapshots, source hashes and final production evidence are stored separately in `output/release-zurgo-2026-09-06/`.
