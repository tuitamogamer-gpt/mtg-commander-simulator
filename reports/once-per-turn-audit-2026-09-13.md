# Once-per-turn ability audit — 13 September 2026

The Leonardo report exposed several distinct timing errors. The catalog search
screened 273 of the 22,541 definitions for once-only and first-event wording.
All 14 cards with **“Do this only once each turn”** now have executable coverage,
including human and local-AI decisions. This is a focused rules audit, not an
exhaustive gameplay certification of all 273 candidates.

## Confirmed findings and corrections

| Cards | Previous problem | Corrected behavior |
| --- | --- | --- |
| Leonardo, the Balance | Queued triggers could each add counters. | One accepted use, shared by pending and copied triggers; each token entry is observed, including resolving permanent spell copies. |
| Baron Strucker, HYDRA Overlord; Cosmic Crucible; G'raha Tia, Scion Reborn; Krile Baldesion; Emet-Selch of the Third Seat; Screeching Scorchbeast | The first trigger consumed the allowance even when declined or countered; copied triggers could repeat the action. | Declining, countering or failing to perform the optional action leaves the allowance available. Taking it prevents further triggers and suppresses the choices and effects of existing instances. |
| Puca's Covenant; The Reaper, King No More; Tidus, Yuna's Guardian | Already queued instances could still ask the player to use an effect whose allowance was spent. Puca and Reaper also read the returned source's metadata after a blink. | Check the original source object's use before prompting; a returned permanent has a separate allowance. |
| Ondu Spiritdancer | Old queued abilities could read or consume the new permanent's allowance after a blink. | Use the metadata captured for the original battlefield object. |
| Deep Gnome Terramancer | Its use record was captured when the trigger went onto the stack, allowing an intervening blink to associate old triggers with the new permanent. | Capture the use record at the triggering event. |
| Donal, Herald of Wings; Pantlaza, Sun-Favored | Further qualifying events still created empty triggers after the optional action had already been taken. | Stop creating those triggers for the rest of the turn. |
| Explicit once-per-turn triggers, including Welcoming Vampire, Tocasia's Welcome, Elvish Warmaster and Whispering Wizard | Additional-trigger effects such as Panharmonicon or Veyran bypassed the trigger limit. | Apply the limit after calculating additional triggers. Copying an already triggered ability still works. |
| Ainok Strike Leader | An artificial once-per-turn limit prevented another combat from producing Goblins. | Observe the declared attack group once, including when both Ainok and a commander attack, and allow a later combat to trigger again. |

The shared trigger correction covers 76 explicitly limited registered triggers
on 72 catalog definitions, and the same engine path handles granted abilities.
First-event triggers remain distinguishable from hard trigger limits: Veyran can
still double Valeria's first-spell trigger and an imported Angelic Cub's first
targeting trigger. The catalog compiler and native first-event definitions carry
that distinction explicitly.

Related checks also corrected Puca's graveyard targets to its controller's own
cards, kept Reaper's return tied to the actual graveyard object, and made G'raha
use the event's spell mana value (including X). G'raha can pay zero life for a
zero-value spell; an unaffordable payment does not spend its allowance.

## Implementation and verification

`oncePerTurnOnUse` identifies an optional action's use record in `sourceMeta`.
The engine checks it when collecting a trigger and again before offering its
resolution choice. The record is shared by copies and survives the source
leaving, while a new battlefield incarnation receives fresh metadata. An action
that returns `false` has not been performed and restores the prior allowance.
`oncePerTurn` continues to restrict triggering; `firstTimeEachTurn` preserves
additional triggers for a first qualifying event.

The focused tests exercise actual card events, stack placement, copying,
resolution, decline/retry, subsequent player turns, blink timing, and observable
draws, tokens, counters, returned cards and payments. They are in
`tests/once-per-turn-effects.test.mjs` and `tests/leonardo-balance.test.mjs`.
The earlier Turtle Power regression now creates real tokens and also checks that
a third token does not offer another use after acceptance.

Validation completed locally:

- `npm.cmd run check`: PASS.
- 26 focused and adjacent test files, run with `node --test --test-concurrency=3`:
  **787 tests passed, 0 failed, 0 skipped**. This includes the 90 focused Leonardo
  and once-per-turn regressions, optional resolution, stack copying, generated
  triggers, state-trigger lifetimes, mana limits, and the affected precon suites.
- `git diff --check`: PASS.

The complete `npm.cmd test` suite and a production browser session were not run.
Local execution evidence is in `.local/once-per-turn-regression.log`.

## Rules references

- [Comprehensive Rules, 603.2h and 603.3](https://media.wizards.com/2026/downloads/MagicCompRules%2020260619.pdf): triggering stops once the indicated action has been taken; triggered abilities use the stack.
- [Marvel Super Heroes release notes](https://magic.wizards.com/en/news/feature/marvel-super-heroes-release-notes): Baron Strucker's ruling explicitly distinguishes declining, taking the action and previously triggered instances.
- [Modern Horizons 2 release notes, Nykthos Paragon](https://magic.wizards.com/en/news/feature/modern-horizons-2-release-notes-2021-06-04): once-on-use limits and multiple pending instances.
- [Final Fantasy release notes](https://magic.wizards.com/en/news/feature/final-fantasy-release-notes): G'raha's spell mana value and Emet-Selch's immediate graveyard casting permission.

The audit and the checks above were completed locally. The subsequent release
was explicitly requested without rerunning tests.
