**Printed card names and four-player match — 9 October 2026**

Printed/flavor names were rejected even though their canonical gameplay identities were already implemented. Deck import now uses a generated, source-proven name index for paper, Arena and MTGO printings. It recognizes split separators, DFC face names and every additional name field present in the pinned Scryfall `default_cards` snapshot. It canonicalizes identity before Commander size, singleton, color, legality and engine-certification checks.

The snapshot covers 118,602 selected printing rows and 38,708 Oracle identities. It is Scryfall's selected-printing `default_cards` feed, not exhaustive `all_cards` translations. There are 4,119 additional names across 2,650 runtime cards and 6,590 recognized identities without runtime support. Unavailable cards receive their canonical identity and legality diagnostic. Ambiguous names ask for an unambiguous full name; they do not select another card. Exact existing canonical names retain precedence.

The complete 4,119-name audit found 4,057 expected resolutions, 35 canonical-precedence cases and 27 safe ambiguity refusals, with zero unexpected results. The 18 collision keys in the source report are distinct from the count of alias occurrences refused at runtime. Both source hashes, matching proof and detailed outcomes are retained in [name provenance](../deck-import/name-aliases-2026-10-09.json) and [resolution validation](../deck-import/name-resolution-validation-2026-10-09.json).

| Name from the screenshot | Runtime identity |
| --- | --- |
| Balin’s Tomb | Ancient Tomb |
| Erebor Heirloom | Fellwar Stone |
| Glittering Caves of Aglarond | Gemstone Caverns |
| Porom’s Silence Magic | Silence |
| The Blades of Chaos Bond | Rite of Flame |
| Unseat the Usurper | Praetor's Grasp |
| Wear/Tear | Wear // Tear |

All seven visible names pass an actual legal 100-card import together. The screenshot's hidden eighth issue cannot be identified from the image; this change checks the complete source rather than adding only seven special cases.

Four decks were selected uniformly without replacement from 175 native deck entries using `node:crypto.randomInt`. The selected seed is 2078951849. The same selection was replayed after necessary engine fixes. All four players used the production AI controller, normal difficulty, balanced style, native deep search (`paced: true`) and zero presentation delay. The final run ended naturally on global turn 53 after 348.3 seconds: **Bot 2 / Quandrix Unlimited won with 18 life**. The 1,000-turn safety ceiling did not decide the winner.

Actual shuffled turn order differs from the original deck-selection order. From Bot 1's viewer perspective:

| Actual turn position | Bot and deck | UI position | Finish |
| --- | --- | --- | --- |
| 1 | Bot 1 — Multiverse Reforged / Jace, Multiverse Architect | 04 YOU, lower left | 4th, eliminated turn 47 |
| 2 | Bot 4 — Peace Offering / Ms. Bumbleflower | 01, upper left | 3rd, eliminated turn 50 |
| 3 | Bot 3 — Enduring Enchantments / Anikthea, Hand of Erebos | 02, upper right | 2nd, eliminated turn 53 |
| 4 | Bot 2 — Quandrix Unlimited / Zimone, Infinite Analyst | 03, lower right | 1st, winner |

| Bot | Deck | Lands played | Spells cast | Activations | Attackers declared | Blocks assigned |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Bot 1 | Multiverse Reforged | 10 | 19 | 14 | 9 | 1 |
| Bot 4 | Peace Offering | 9 | 13 | 1 | 5 | 2 |
| Bot 3 | Enduring Enchantments | 11 | 23 | 3 | 32 | 10 |
| Bot 2 | Quandrix Unlimited | 11 | 20 | 2 | 5 | 3 |

The final run recorded 733 AI decisions, 738 controller queries and 138 native actions. AI fallbacks: 0; safe-default fallbacks: 0; rejected native actions: 2; warning/error logs: 0. All 53 turn checkpoints and final state/recalculation checks passed. Stack and pending triggers were empty at completion. [Full result and runtime hashes](../ai/random-match-2026-10-09.json) preserve the original base commit and dirty-worktree metadata rather than attributing the run to an untested clean commit.

Two mana-payment refusals remain in the final trace: Peace Offering tried Octomancer and Perplexing Test on turn 38, and both logged that mana was not paid. The bot continued normally; Perplexing Test succeeded on turn 42. Static review suggests ordinary-mana metadata differs between converter planning and execution, but this cause was not dynamically reproduced. These refusals are retained as a remaining payment/planning issue rather than reporting all actions as successful. The final match did not play Darksteel Angel or Synthetic Destiny; their corrected self-preservation behavior is established by the focused regressions.

The first attempt stalled because simulation clones dropped zone-dependent card-definition accessors, penalizing productive actions; it then failed during Adventure target-cost preview. The second attempt played cards but failed at turn 16 because activation-cost wrappers lost their method receiver. Fixes rebuild independent card-definition accessors in simulations, distinguish target-spec generators from selected spell targets, preserve target-cost alternatives, and retain the receiver throughout activation feasibility, preparation, validation and payment.

The third attempt completed naturally on turn 57, but revealed a concrete bot error: Bot 1 at -37 life cast Synthetic Destiny and self-exiled Darksteel Angel, then immediately lost. AI snapshots inherited a live priority-session flag, leaving their simulated response spells unresolved on the stack and hiding the resulting loss. A self-only exile also incorrectly received a bonus for opposing creatures. The final patch resets only the snapshot's transient priority state and recognizes the self-only affected set. Focused native full-search regression now chooses Pass over that lethal spell and proves the live game, session fields, cards and clock are unchanged.

The fourth attempt was interrupted by an execution-environment restart at its last recorded turn 31; no result or winner was written. The fifth attempt is the final run above. Failed, earlier completed and interrupted attempts are recorded alongside the final result. Local full traces remain in `output/random-match-2026-10-09/`. This is repeated validation of one originally selected scenario; it does not certify optimal strategy or all card interactions.

A separate paused presentation fixture in system Chromium at 1440×1024 used the exact same native seed and decks, with Bot 1 as the viewer. Rendered DOM player IDs, commander names and seat badges matched the native order. After a presentation-only elimination preview, surviving badges stayed 01 and 03 while the grid compacted. There were no page errors or horizontal overflow. This used no `game.start()` and no additional full match. [Browser evidence](../ai/random-match-2026-10-09-browser/evidence.json) records positions; visually inspected screenshots remain in `output/random-match-2026-10-09/browser-seats/`.

Focused validation passed: nine name-index regressions, four native AI simulation regressions, three priority-outcome/search regressions, two Adventure/target-cost regressions, two native activation-payment regressions, three existing deck-import checks, six imported-library checks and eighteen existing wipe-preservation checks. An existing sideboard test asserted obsolete `ignored` behavior; it now verifies the already-existing v87 outside-game auxiliary list while still excluding sideboard cards from the main deck. Syntax checks passed for all 20 changed JavaScript files, and Git whitespace checks passed. The complete test suite was not run.

The canonical catalog was regenerated from both pinned sources. Runtime counts remain 32,136 definitions and 32,135 deck-import-eligible definitions; 32,115 paper Commander source identities are represented with zero source identities remaining. Printed-name recognition and gameplay support remain separate metrics.

To reproduce the selected scenario, run `node scripts/run-random-deck-match.mjs --selection-file=reports/ai/random-match-2026-10-09.json --output=output/random-match-replay`. The runner records full events, decisions, checkpoint invariants and rejects an artificial turn-limit winner. Native search uses elapsed-time budgets, so the seed reproduces the setup rather than guaranteeing a bit-for-bit identical decision trace.
