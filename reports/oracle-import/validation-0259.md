# Oracle expansion 0259 — 316 additional Commander cards

8 October 2026. Batch 0259 adds exactly **316 physical cards** from the pinned Scryfall source. The simulator contains **30,115 runtime definitions**, **30,114 eligible for deck import**, and **26,116 generic Oracle cards across 259 batches**. All 175 built-in decks remain available.

The paper/Commander comparison universe contains 31,070 distinct Oracle IDs: **30,070 represented and 1,000 remaining**, down from 1,316. The remaining queue contains 999 deferred cards and one parser-eligible but unimported card, **Cephalid Snitch**. Its protection-removal behavior failed execution review, so it remains outside this import.

The source snapshot is `2026-10-07T09:01:59.955+00:00`, compressed SHA-256 `53c35f3df74a48df1a15859c29f2559fb3761f6680f0954b0a19fad9342f489b`. All 316 selected cards were previously absent and have unique Oracle IDs. The exact requested cohort is recorded in the batch selection policy. Eligibility, duplicate checks, source matching and full compiler acceptance still apply; an unsupported requested card cannot be silently replaced by another ready card.

| Family | Physical cards |
| --- | ---: |
| v70 spells | 73 |
| v71 creatures | 46 |
| v72 creatures | 63 |
| v73 permanents | 63 |
| v74 legends and other creatures | 70 |
| Previously proven Teachings of the Kirin, both faces | 1 |
| **Total** | **316** |

| Verification | Result |
| --- | --- |
| Installed cards, human and local hard AI | **PASS:** 632 role-card scenarios; zero failures |
| Declared operations and keywords | **PASS:** 1,010 operation routes, 166 keyword executions and 22,742 nested checks |
| State invariants | **PASS:** 2,412 controlled games |
| Final shared-rule regressions | **PASS:** 168 checks plus 4 target/ninjutsu checks |
| Zone replacement/save restoration | **PASS:** 56 checks |
| Winter timestamps/save compatibility and clean-board save probe | **PASS:** 7 and 1 checks |
| Importer, provenance unit tests and spell-contract registry | **PASS:** 43 checks |
| Mixed batch size integrity | **PASS:** 7 checks across catalog integrity, interaction matrix and unchanged historical batch tests |
| Strict certification | **PASS:** 30,115/30,115 runtime definitions; 14,566 card/deck checks across 175 decks |
| Local browser import and gameplay | **PASS:** 16/16 checks |
| Cold canonical source/report/module/state provenance | **PASS:** 316 full rows, generated module, state/app registration and eight historical repairs; no classification cache |
| Catalog export and final reproducibility check | **PASS:** 30,115 runtime rows and 1,000 remaining Oracle IDs; final export and `--check` agree |

Complete-source fixture checks cover every selected card and reject appended unknown instructions; physical face checks include both faces of Teachings of the Kirin. The final installed execution run uses the actual registered batch. Cohort test logs preceded some contract-ID corrections; the installed execution run and cold canonical provenance cover the final generated descriptors.

Shared changes include multiple hand abilities, actual destruction events, loyalty cost adjustment, timestamped hand-size rules, additional ballots, and narrowly scoped entry, mana and combat hooks. Regression tests retain source-incarnation checks, payment revalidation, ability-loss ordering, source departure and human/AI paths. The historical 258 batches retain their original 100-card sizes; report/runtime/state checks now validate each recorded size and the exact 26,116-card union.

The browser gate used a signed-out guest, pasted a legal 100-card deck, saved and reloaded it in My Library, reviewed a hard-AI pod, and naturally cast **Suncleanser** from the new batch on turn 7, paying 2 mana. Human and hard-AI spells resolved through the real Stack. It reported no page/console errors, AI fallback, remote writes or horizontal overflow. Screenshots and observations are retained under `output/next316/browser-0259/`.

The save-state suite initially exposed a test baseline retaining The Ring emblem after a completed Elven Council game. The probe now removes those baseline emblems and verifies that the baseline saves before adding its own blockers. Its focused rerun passes; production snapshot restrictions were preserved. The earlier full run observed four passes, including both game-continuation simulations, and this one fixture failure. Its overwritten raw log is not included in the retained green-run receipt.

Evidence: [installed execution](evidence/0259-execution.json), [browser gate](evidence/0259-browser.json), [retained regression receipt](evidence/0259-regressions.json), and [cold canonical provenance](evidence/0259-provenance.json). The catalog is available in [imported cards](../../docs/catalog/imported-cards.csv), [remaining cards](../../docs/catalog/remaining-cards.csv), and [summary](../../docs/catalog/summary.json).

These are controlled scenarios, not exhaustive multiplayer combinations. The full repository suite was not run. Production deployment is outside this local validation.
