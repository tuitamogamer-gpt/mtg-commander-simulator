# Commander 2021 precon import — 6 September 2026

Five original precons are available in the standard deck selector, with deck guides, local AI profiles and official Scryfall commander art. This report records their completed local verification before release. The preceding five Starter Commander decks were released separately in commit `396eebfa0e255c1a09d6ac90da878843e12c355f`, establishing the baseline of 32 selectable decks; this batch raises the total to 37.

## Sources and exact decklists

Each Moxfield export was obtained from its Share / Download dialog and checked against the [Wizards of the Coast Commander 2021 decklists](https://magic.wizards.com/en/news/announcements/commander-2021-edition-decklists-2021-04-05). All five lists contain exactly 100 cards, including their commander, and match the official quantities. Commander identity, color identity and singleton constraints pass.

| Deck / Moxfield source | Commander | Unique cards |
| --- | --- | ---: |
| [Lorehold Legacies](https://moxfield.com/decks/Vgzv5-wfcUqwUbd77Flqhw) | Osgir, the Reconstructor | 82 |
| [Prismari Performance](https://moxfield.com/decks/aPbAlXnx1kKMj7EYicfvsg) | Zaffai, Thunder Conductor | 83 |
| [Quantum Quandrix](https://moxfield.com/decks/hNhQ07wNf0e7423P6S1P1g) | Adrix and Nev, Twincasters | 81 |
| [Silverquill Statement](https://moxfield.com/decks/_dM2RHtVoUqDHjMko8X4pQ) | Breena, the Demagogue | 78 |
| [Witherbloom Witchcraft](https://moxfield.com/decks/6WeWU_rriEaCGPmJ2l1e1g) | Willowdusk, Essence Seer | 80 |

The five `.txt` exports, their SHA-256 values in [intake.json](intake.json), the official snapshot in [official-decklists.json](official-decklists.json), and all 357 Scryfall records in [oracle.json](oracle.json) are retained here. The intake records the original baseline and remains unchanged on repeat imports. Future batches can continue from the previously captured [193-entry Moxfield index](../precon-starter-2026-09-06/moxfield-index.tsv); it includes alternate editions and is not a count of distinct card lists.

## Catalog changes

The 500 physical cards contain **357 unique names: 277 reused and 80 added**. Existing native definitions and existing decklists are unchanged; the Oracle batch files are untouched. Shared execution fixes apply to existing cards where the new decks exposed incorrect behavior.

| Runtime measure | Before | After |
| --- | ---: | ---: |
| Selectable decks | 32 | 37 |
| Catalog definitions | 19,545 | 19,625 |
| Native definitions | 1,687 | 1,767 |
| Importable definitions | 19,502 | 19,589 |
| Unique cards in active decks | 1,808 | 2,002 |
| Card/deck checks | 2,708 | 3,112 |

The importable total increases by 87 because seven existing native cards also enter the active deck inventory: Bloodthirsty Blade, Boros Garrison, Duelist's Heritage, Martial Impetus, Selfless Squire, Stalking Leonin and Windborn Muse. These are reused definitions, not additional imports.

Source validation accounts for all 357 names: 351 normalized Oracle texts match directly; six differ only in Oracle's replacement of a card's own name with “this creature”, “this land”, “this Equipment”, or “this enchantment”. The exact differences and unchanged-definition checks are in [source-validation.json](source-validation.json). Evergreen keyword comparison covers all 80 new definitions.

The importer is `scripts/import-c21-precons.mjs`. It validates the saved sources, adds only absent definitions and requires executable native scripts for every addition. Runtime behavior is implemented in the five `scripts-c21-*.js` modules and `c21-precon-rules.js`. No unsupported placeholder definitions were admitted.

## Rules and execution coverage

The 69 C21 tests cover every new card name, with concrete state assertions, paid cast/activation paths and relevant negative cases. They include spell copies and demonstrate, restricted and donated mana, graveyard permissions, suspend, linked exile, simultaneous token fights, replacement effects, source identity, planeswalker loyalty, hidden opponent choices, attack taxes, goad, damage prevention and face-down Forests. These scenarios establish the tested outcomes; they are not an exhaustive proof of every possible multiplayer interaction.

Reused-card regressions also cover Stalking Leonin's revealed choice and once-only activation cost, Duelist's Heritage's target announcement, Martial Impetus enchanting your own creature, Selfless Squire after blink, and Bloodthirsty Blade after detachment. Goad expiration now respects a card changing zones; creature-entry and death history preserve the relevant controller.

## Verification

- Focused combined regression: **183/183 pass**, including all 69 C21 scenarios, active-card audit, Starter cards, diplomacy, planeswalker combat and AI profiles.
- Final setup metadata / active-X inventory / C21 regression: **91/91 pass**. The active X spell inventory now includes Damnable Pact, Muse Vortex and Suffer the Past, for 72 names. All five set labels use the established `Commander (2021)` display format.
- Common-board native execution for the 80 additions: **160/160 human/local-AI runs pass**, with zero prerequisite gaps, choice gaps or errors. The full catalog's separate native smoke reports two prerequisite gaps among older cards; those are not counted as executed outcomes for that smoke.
- Syntax and catalog audit pass. Strict certification: **19,625/19,625 definitions and 3,112 card/deck checks**; no duplicate names or simplified active definitions.
- Final complete test suite (`node --test --test-concurrency=2 tests/*.test.mjs`): **7,284/7,284 pass**, zero failures, cancellations, skips or todos; 1,538.87 seconds. All **913 runtime/test/script/API/config hashes remain unchanged** from the start of this final run. The preceding complete run passed 7,282 of 7,284 tests; its only failures were the set-label format and the stale X inventory corrected above.
- Whole-deck regression on the final source: **37/37 complete four-player AI games pass**, each with a natural winner before the turn limit and no remaining pending triggers.
- Desktop/mobile selector and paid commander checks: **10/10 pass** on the final source, at 1440px and 390px. Each case uses Deck → Pod → Review → 100-card opening, followed by actual paid commander casting through the human UI and Stack resolution. No captured page/console errors, AI fallback, pending Stack items or horizontal overflow. Forty screenshots retained; selected mobile deck, desktop Stack and completed-match screenshots visually inspected.
- Complete mobile Lorehold Legacies versus Witherbloom Witchcraft game: **pass**, 252 UI iterations, nine land plays, ten spells, six attack declarations and twelve decision types. The AI wins naturally on turn 20. Rematch, retained pod/preferences and search-dialog behavior pass; no captured console or network errors.

The complete mobile match preceded the final set-label formatting change; its engine, card scripts and gameplay fixture are unchanged. The ten desktop/mobile selector cases were repeated after that label change. [qa.json](qa.json) records final results, source/export hashes, all 913 frozen input hashes, media counts and explicit coverage limits. `git diff --check` passes.

Evidence is retained under ignored `output/precon-c21-2026-09-06/`. The full suite includes complete four-player AI games for all 37 selectable decks. Earlier full runs were stopped while repairing audit accounting and additional card behavior; they are not counted as passing final runs. The supplemental generic skill browser client initially timed out during screenshot capture. Its retry captured the menu and `deckCount:37` without page/console errors, but its Solo click timed out; this is menu evidence only. The repository's dedicated Chromium selector and complete-game clients passed on the final source as recorded above.

## Images and scope

All 357 source cards have local images. This batch adds 194 card images and five commander crops, all from Scryfall: **199 WebP files**. The existing 28 commander videos are unchanged; no videos were generated or added. All 37 commanders have art entries.

The first release's production verification is separate in `output/release-starter-2026-09-06/`: matching local/remote commit, Vercel `READY`, canonical HTTP/API checks, 13 static-source hashes, ten desktop/mobile commander flows and a complete mobile match with rematch. This report records the Commander 2021 batch's completed local verification before publication. The user subsequently authorized commit/push/deploy and another five precons. Commander 2021 production evidence is kept separately in `output/release-c21-2026-09-06/`; the next batch starts only after that release is verified.
