# Commander 2014, planeswalker decisions and custom token presentation

Pre-publication verification for the combined 6 September 2026 release, authorized by the user: “Push commit deploy sve, ovo i još one 2 sesije”. Baseline: `5270d19e5fe912b9c330ab6b9cc7bfd2ff78f41a`. Target: existing `main` / `origin` and [canonical Vercel application](https://mtg-commander-simulator.vercel.app/).

## Included work

- Five Commander 2014 precons: Forged in Stone, Peer Through Time, Sworn to Darkness, Built from Scratch and Guided by Nature. The selector has **42 decks**. Exact Moxfield exports match the independent MTGJSON lists; **257 existing definitions are reused and 65 added**. There are **224 new WebP assets and no new videos**. [Original C14 validation](../decks/precon-c14-2026-09-06/README.md).
- Ajani's temporary combat buffs now prefer a useful friendly target; optional targets can be declined to gain loyalty, and public quantities inform loyalty finishers. Attack declarations require an explicit player or planeswalker destination, support either selection order and retain mobile scroll. Haste appears in the attacker list. [Original planeswalker investigation](../planeswalker-2026-09-06.md).
- Custom tokens without artwork display a colored characteristics card with name, type, abilities and current power/toughness. Existing artwork and copied-card artwork are retained; failed images fall back to the characteristics card. Updates, hidden identities, search, Stack, combat and manual tokens are covered.
- The full-game browser driver selects a defender explicitly, matching the repaired interface. The Oracle haste proof stages a newly arrived creature that benefits from haste; effect assertions remain unchanged.

## Combined validation

- The complete run finished **7,511 / 7,515 PASS**, with four errors in the marked-damage test's simulated DOM and zero cancelled/skipped/todo. Node 22.22.3 with concurrency 4; all **927** source hashes stayed unchanged during that run.
- The simulated DOM lacked `insertAdjacentHTML`, used by the real browser's shared card renderer. Implementing that standard method in the test double preserves all existing damage assertions; the complete affected file then passes **7 / 7**. There are **zero outstanding failures** across the unchanged full-suite results and this corrected-file rerun. No runtime code changed and no post-fixture full-suite rerun is claimed.
- All **42** deterministic four-player deck games finish with natural winners and no pending triggers.
- Syntax and catalog audit pass. Strict checks: **19,690 / 19,690 definitions** and **3,468 / 3,468 card/deck combinations**. Dependency audit reports **zero vulnerabilities**.
- C14 selector, paid commander and loyalty Stack paths: **10 / 10** desktop/mobile cases.
- Planeswalker and paid Atarka cast/equip/combat flows: **20 / 20 Chromium + 20 / 20 WebKit**; 390px cases use touch/tap input.
- Custom-token rendering and interactions: **2 / 2** desktop/mobile scenarios, including artwork failure, changing stats, retained DOM/focus, privacy and real combat.
- Ob Nixilis's paid emblem after the planeswalker dies: **2 / 2** desktop/mobile scenarios.
- Normal-opening 390px Forged in Stone versus Guided by Nature game: **125 UI iterations, 6 lands, 15 spells and 4 attack declarations**, natural winner on turn **30**, then rematch. No captured errors or failed requests.

Two test files were promoted after the complete run: the already exercised `tests/browser/player-gameplay.mjs` driver for explicit defender selection, and the corrected DOM double in `tests/marked-damage-ui.test.mjs`. Neither changes runtime code or removes effect assertions. Final source hashes and browser evidence are retained in `output/release-all-2026-09-06/preflight.json`; the original full-suite snapshot remains separate in `full-suite-inputs.json`. Production deployment, commit identity, remote parity and production-browser evidence are recorded after publication in `output/release-all-2026-09-06/release.json`.

## Historical boundaries

The original session reports retain their earlier local snapshots, including the planeswalker session's 7,514/7,515 run and the C14 isolated run. The combined run and corrected-file rerun above supersede those for this release. Atarka's reported no-attack state was not reproduced; controlled paid cast/equip/combat checks pass. The previously documented Vitaspore Thallid choice that sacrifices its own intended haste target remains outside this release's fixes.
