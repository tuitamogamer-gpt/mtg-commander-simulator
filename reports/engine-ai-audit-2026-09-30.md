# Engine, AI and bug audit — 30 September 2026

Scope: headless all-AI Commander games driven through the real engine, with a
harness that records uncaught and swallowed exceptions, hangs (per-game
watchdog), board invariants at every turn boundary, AI decision latency, AI
behaviour statistics, UI-translation coverage of engine text, and a JSON
save/restore round trip every third turn. Games are deterministic per seed, so
every finding below was reproduced and traced in a single-game replay.

Runs:

- **Smoke sweep** — the exact `tests/headless-smoke.test.mjs` configuration:
  all 175 built-in decks, 4 seats, balanced AI, normal difficulty,
  seeds 11081–11255.
- **Variety sweep** — random decks, AI styles, difficulties, Politics and random
  commanders, with save round trips.
- **Full test suite** and an independent review of the solver changes.

## Fixed

| # | Problem | Evidence | Fix |
| --- | --- | --- | --- |
| 1 | **Games froze for minutes.** 4 of 175 smoke games hit the 240 s watchdog (Turtle Power, Feline Ferocity, Arcane Wizardry, Angels). In a browser this freezes the tab. | CPU profile and stack sampling put all the time in the mana-payment solver (`G.manaSolve` → `tryCover`/`attemptSource`). One impossible affordability probe took 1.7–6.6 s, and it was repeated for every equip target, every X value and every AI candidate. | Changes 1a–1e in `engine2.js`. The Turtle Power and Arcane Wizardry games now finish; see Verification for the full sweep. |
| 1a | The "shared" converter node budget of 24 000 was reset before every pass and pool branch, so it never limited anything. One probe ran 143 000 nodes (6.6 s). | `findPayment` reset `totalNodes` on every pass. | The budget is now shared across one priority level. Each pool branch keeps a floor of 2 000 nodes, so a payment that only exists in a late converter-reserve branch is still found. |
| 1b | Restricted mana that could pay neither the cost nor any converter was still searched, e.g. a dozen Vibranium tokens facing an equip cost. | 2.5 s per `{3}` equip probe in a 15-permanent fixture. | Such sources are dropped before the search. This is sound because their mana cannot be spent on this payment. |
| 1c | A converter that can never be funded (Cascading Cataracts' `{5}` next to four lands) multiplied every search node with its any-colour output. | 3.4 s per WUBRG probe with six permanents. | A converter whose activation exceeds an upper bound of all other mana is dropped. |
| 1d | Affordability probes used a different spending context than the payment itself, so restricted mana was judged one way when offering the action and another way when paying. | Equip, hand, cycling, ninjutsu, graveyard and opponent abilities, and X abilities. | Every probe now uses the same context as its payment. |
| 2 | **Cleanup-step triggers resolved during the next player's turn**, violating CR 514.3a. Examples: Waste Not and The Gitrog Monster on the discard to hand size, Ray of Command's "tap it" when control ends, deaths from cleanup SBAs. | 18 cases in 12 of 175 games. The trigger was still in `pendingTriggers`, queued in phase `cleanup`, when the next turn began. | Pending triggers now go on the stack, players get priority, and a new cleanup step begins. That step emits `cleanupStep` again. The loop is capped at 5 passes and logs a warning when it hits the cap. |
| 3 | **Mila, Crafty Companion never drew** when an opponent's triggered ability targeted your permanent. The filter read `d.so.ctrl`, but the engine sends `so: null` for triggers, and the resulting exception was swallowed. | Swallowed `TypeError` in the trigger collector. | The filter uses `byPlayer` and only counts permanents on the battlefield. |
| 4 | **Solo checkpoints could not be saved** in any game containing a double-faced card: 239 catalog cards, e.g. every Pathway, Bloodline Keeper, Esika. Every turn failed with "card Barkchannel Pathway is not in this build". | Built-in deck *From Cute to Brute* and any imported list containing such a card. | Cards are saved under their catalog name "Front // Back"; the current face is stored separately. |
| 5 | **Restored saves lost transformed faces.** A transformed Incubator (a 3/3 Phyrexian) came back untransformed, and a modal land played as its back face came back as the front. | The save round-trip fingerprint did not match. | Restore now applies the saved face. |
| 6 | **"Do this only once each turn" was handled as "triggers once each turn"** on Oracle-compiled triggers (Earth Kingdom General, Terrasymbiosis). Declining the first time forfeited the rest of the turn. | The catalog regression test did not cover these cards and failed on `main`. | Such a trigger now tracks the use, per CR 603.2h. Both cards were added to the regression test. |
| 7 | **The AI kept cheap spells in hand with a dozen lands open** whenever it also held an instant answer. Sol Ring, Signets and small creatures were held for many turns. | Decision logs: "End action window" earned a hold-the-answer credit, but casts that still left the answer's mana open did not. | Those casts now earn the same credit. |
| 8 | **Two fight effects crashed the whole game**: Tovolar's Packleader's ability and Dromoka's Command's fight mode called a helper that does not exist (`E.fight is not a function`). | Smoke game 109 (Call for Backup) ended with an uncaught `TypeError` on turn 61. A scan of every card script for helper calls that do not exist found only these two. | Both use the engine's `fight`. |

Stale tests updated after the 27 September v20 import (engine behaviour was
correct):

- `full-card-audit` now counts v20 exile abilities; Torrent Elemental has one.
- `keywords-equipment` compares the printed target requirements rather than
  object identity.

New regression tests:

- `tests/mana-probe-stall.test.mjs`
- `tests/cleanup-step-triggers.test.mjs`
- `tests/save-double-faced.test.mjs`
- `tests/fight-effects.test.mjs`
- New cases in `tests/once-per-turn-effects.test.mjs`

Each case fails on the previous `main` and passes with the fixes.

## Verification

Smoke sweep of the same 175 games, before and after the fixes. Both runs used
four workers on a machine where an unrelated process used two cores, with a
300 s per-game watchdog.

| Measure | Before | After |
| --- | ---: | ---: |
| Triggers left pending at a turn start | 18 | 0 |
| Swallowed trigger-filter exceptions | 1 | 0 |
| Uncaught errors | 0 | 1 (the fight crash, fixed afterwards) |
| Games past the watchdog | 4 | 5 |
| Slowest single AI decision | 31.7 s | 11.0 s |
| Median game | 25.7 s | 25.0 s |

The Turtle Power game that froze now finishes in 42 s.

Three of the games past the watchdog were re-run alone, and all of them finish:

| Game | Total time | Slowest turn |
| --- | ---: | ---: |
| Feline Ferocity | 258 s | 44 s |
| Arcane Wizardry | 287 s | 153 s |
| Enchantress Rubinia | 394 s | 283 s |

This is the remaining performance problem below, not an infinite loop. The
other two games past the watchdog were not re-measured.

## Found, not changed

- **Slow late-game AI turns.** Some large boards still take tens of seconds
  per AI turn, and single turns took up to 283 s in the smoke games above. The
  CPU profile shows these hotspots:
  - continuous-effect recalculation (`recalc`) and state-based-action checks;
  - `castableList`/`activatableList` recomputed for every player in every priority window;
  - AI view construction (`deepFreeze`, `computeStateHash`);
  - attack search, up to 8 s.

  Suggested next step: cache these lists per decision and avoid redundant
  `recalc` calls.
- **22% of turn checkpoints cannot be saved.** Lasting effects, play
  permissions, linked exile, delayed triggers and emblems block the save. Once
  an emblem exists, every later save in that game is blocked, so a resume
  returns to an older turn.
- **AI search depends on wall-clock time.** Deadlines are 450/900/1400 ms per
  difficulty, so the same seed can play differently on a slower machine.
- **Background CPU load on this machine.** An unrelated `vite` dev server
  (port 5173, started 27 September) uses about two CPU cores continuously.

## Verified healthy

- No uncaught exception or crash, and no turn-limit stall in the smoke and
  variety runs, apart from the hangs above.
- No zone, ownership, duplicate-object, legend-rule, zero-toughness,
  marked-damage or lost-player-permanent violations at turn boundaries.
- Every engine log line and decision prompt seen by the AI was translated to
  English by the UI layer (0 untranslated).
- The translation layer alters no card name or Oracle text (25 792 names
  checked).
- AI V2 never fell back to the legacy controller.
