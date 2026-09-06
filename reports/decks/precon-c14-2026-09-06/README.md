# Commander 2014 precon import — 6 September 2026

Five original Commander 2014 decks have been implemented locally in the standard selector. The isolated implementation and final verification are complete. The preceding Commander 2021 batch was committed, pushed and deployed separately as `5270d19e5fe912b9c330ab6b9cc7bfd2ff78f41a`; its production verification is recorded in `output/release-c21-2026-09-06/release.json`. This report preserves its original local verification; the later [combined release report](../../releases/2026-09-06-c14-planeswalkers-tokens.md) covers this batch together with the planeswalker and custom-token sessions.

## Source decklists

The direct Moxfield Share / Download exports match the independently retrieved MTGJSON C14 decklists by card name and quantity. All five contain exactly 100 cards, including the commander, and pass singleton and commander color-identity checks. The [Wizards Commander 2014 release notes](https://magic.wizards.com/en/news/feature/release-notes-2014-11-10) identify the five decks and supply card-specific rulings. The old Wizards decklist URL now redirects to a card gallery; it was not used as decklist evidence.

| Deck / Moxfield source | Commander | Unique names |
| --- | --- | ---: |
| [Forged in Stone](https://moxfield.com/decks/VCpZU-l9Ykqx91BzMxKB5A) | Nahiri, the Lithomancer | 69 |
| [Peer Through Time](https://moxfield.com/decks/eI5qvS1WQUqLpM4s4OcFXQ) | Teferi, Temporal Archmage | 70 |
| [Sworn to Darkness](https://moxfield.com/decks/Ta08Su5JcEGKM4IO9xQLXA) | Ob Nixilis of the Black Oath | 69 |
| [Built from Scratch](https://moxfield.com/decks/dDRyzSWi_kegywH3X_WtQA) | Daretti, Scrap Savant | 72 |
| [Guided by Nature](https://moxfield.com/decks/7r4b_MnVLkWFm4VyIWnfTQ) | Freyalise, Llanowar's Fury | 76 |

The five original `.txt` exports, their SHA-256 values in [intake.json](intake.json), the independently retrieved [decklists](independent-decklists.json), and all 322 current Scryfall records in [oracle.json](oracle.json) are retained here. The Moxfield lists are maintained by its precon account; they are not represented as Wizards-authored exports. The existing [193-entry Moxfield index](../precon-starter-2026-09-06/moxfield-index.tsv) remains the source queue for later batches and includes alternate editions.

## Catalog and interface

The 500 physical cards contain **322 unique names: 257 reused and 65 added**. Existing native definitions and previous decklists are unchanged. No Oracle batch files were changed for this import. All new definitions have explicit executable scripts, and `scripts/import-c14-precons.mjs` fails if one is absent; repeating the intake finds zero missing definitions and preserves the original baseline report.

| Measure | Before | After |
| --- | ---: | ---: |
| Selectable decks | 37 | 42 |
| Card definitions | 19,625 | 19,690 |
| Native definitions | 1,767 | 1,832 |
| Importable definitions | 19,589 | 19,655 |
| Unique cards in active decks | 2,002 | 2,218 |
| Card/deck checks | 3,112 | 3,468 |

The importable count increases by 66 because the existing Comeuppance definition also enters the active inventory. It is reused, not imported again. Of the 322 source Oracle texts, 321 match after whitespace/reminder normalization; Steel Hellkite differs only in self-reference wording. Costs, types and evergreen keywords match. [source-validation.json](source-validation.json) records these comparisons and preservation checks.

Each deck has a `Commander (2014)` set label, strategy guide, key cards, opening advice and local AI profile. The new assets are **216 card images, three original C14 token images and five commander crops (224 WebP files)** from Scryfall. [token-images.json](token-images.json) pins the Kor Soldier, Elf Druid and Stoneforged Blade printings and asset hashes. All 322 source cards have local images. The existing 28 commander videos are unchanged; no videos were created or added.

## Rules and gameplay evidence

The dedicated C14 scenarios exercise all 65 new names through paid casting, activation or land play, with concrete state assertions. Coverage includes all loyalty abilities of the four new planeswalker definitions, reuse of Daretti, token mana/equipment, emblem activation, morph and suspend, untap-step skipping, targeted-spell and targeted-ability countering, single-target redirection, entry replacements, permanent copying, linked exile, graveyard identity, extort, additional graveyard costs, damage division, sacrifice restrictions, random choices and forced combat.

Additional boundaries cover real mana auto-payment with Crypt Ghast and Caged Sun, ability grants under Song of the Dryads, Lieutenant ownership, private top-of-library views and Abyssal Persecutor's loss/win restrictions. The local AI recognizes removing its own Persecutor to release opponents who have already reached a loss condition. It also avoids killing an opposing Persecutor when that would eliminate itself, and prioritizes Ob Nixilis's emblem as a needed sacrifice outlet. These decisions use public game state.

## Validation results

- Complete suite: **7,362/7,362 PASS**, zero failed/cancelled/skipped/todo; Node 22.22.3. All 925 runtime/test/script/API/config hashes stayed unchanged for the complete run.
- All **42 deterministic four-player deck games** finished with natural winners before their turn limit and with no pending triggers. This includes all five C14 decks.
- **78 dedicated C14 scenarios**; **123/123** in the initial C14/AI focused run on Node 25 (all included again in the complete Node 22 suite); **130/130** new-card human/local-AI runtime smoke cases, with zero prerequisite gaps, choice gaps or errors.
- Syntax and audit pass. Strict catalog checks: **19,690/19,690** definitions and **3,468/3,468** card/deck combinations.
- Standard selector → pod → review → 100-card opening hand, followed by real UI paid commander casting and first loyalty activation: **10/10**, covering all five decks at 1440px and 390px. Both spell and ability Stack paths are observed, with no captured errors, network failures, overflow or AI fallbacks.
- Paid Ob Nixilis emblem use after its planeswalker dies: **2/2**, at desktop/mobile sizes; real mana payment, sacrifice, life gain, draw and private library-top boundaries pass.
- Complete normal-opening 390px Forged in Stone vs Guided by Nature match: **142 UI iterations, 6 lands, 16 spells, 6 attack declarations, 11 decision types**, natural AI winner on turn **32**, then rematch. No captured console/network errors.
- The final media-only delta registers the three existing token templates for the image inventory and adds their original C14 images. It changes no ability bodies or existing assets. The final candidate passes **86/86** C14/image/commander-visual tests and **2/2** desktop/mobile real-UI token scenarios. All three token images were opened and visually inspected after real loyalty activations.

[qa.json](qa.json) retains the results, all final source hashes and exact evidence paths. Raw logs, browser states and screenshots are preserved under `output/precon-c14-2026-09-06/isolated/`. The complete-suite snapshot and the separately tested three-file media delta are recorded distinctly; no post-image full-suite rerun is claimed.

A simultaneous Ajani/Atarka/attack-interface task changed shared files during earlier validation. Its changes are preserved in the main checkout and excluded from the C14 verification worktree at `/tmp/mtg-c14-verify-20260906`. Only C14 hunks are present in that worktree's shared AI/UI files. Earlier mixed-source runs are diagnostic evidence only. The exact isolated changes are also preserved in `output/precon-c14-2026-09-06/c14-reviewed.patch` for a later authorized release.

These scenarios prove their asserted outcomes and broad runtime stability. They are not exhaustive coverage of every possible multiplayer interaction. Common-board smoke is kept separate from semantic tests; prerequisite gaps are never counted as passes. The browser fixtures deliberately prepare boards for targeted actions, while the complete mobile match plays from a normal opening hand through a natural winner and rematch.
