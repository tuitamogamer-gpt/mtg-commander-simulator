# Gameplay details audit — 14 September 2026

Six confirmed defects were corrected locally, with additional guidance at the
Ring-bearer decision. The starting point was the previous three fixes:
once-per-turn abilities (`9a2c69b`), automatic mana and target guidance
(`c32c49a`), and dungeon routes and progress (`47aa8bb`).

The audit followed the same failure patterns: information missing when making
a choice, an engine restriction applied only after a choice, a delayed effect
following the wrong battlefield incarnation, and public state omitted from a
save. This is a focused review, not an exhaustive audit of the card catalog.

## Confirmed defects

| # | Reproduction and previous behavior | Correction |
| --- | --- | --- |
| 1 | Give a player four rad counters, save, and restore. The restored player has none, so subsequent radiation also stops. Energy and experience survive, which concealed the omission. | Capture, validate, restore, and fingerprint rad counters. A restored radiation trigger mills the correct number of cards, loses life for nonlands, and removes the corresponding counters. Older saves with no rad field remain readable. |
| 2 | Another player gains control of a Ring-bearer. The creature keeps the designation and can become the new controller's bearer without a Ring choice. | Actual control changes clear the designation, both for native assignments and control layers. Returning control does not restore it; the original player's Ring level remains. |
| 3 | Phase out the old Ring-bearer, choose another, then phase the old one back in. Both creatures retain the designation. | Choosing a bearer clears the previous designation on phased-out permanents too. Phasing alone does not remove the designation. |
| 4 | Two creatures block a level-three Ring-bearer. The game creates only one Ring trigger; countering it saves both blockers. | Observe the existing event for each blocking creature, generating a separate Ring trigger and delayed sacrifice for each. Countering one does not counter the other. |
| 5 | After blocking a level-three Ring-bearer, exile and return the blocker before the sacrifice resolves. The returned creature is incorrectly sacrificed. | Capture the blocker's zone identity at the blocking event and check it at the delayed sacrifice. Covers blinking before the first Ring trigger resolves, after it resolves, and in response to the end-of-combat trigger. |
| 6 | For unkicked Waste Management, select cards from different players' graveyards. The UI and both AI decision paths allow the choice, then the engine rejects it. Live also accepts the response too far into the decision flow. | Enforce one-graveyard selection in UI eligibility, zone indicators, AI candidate generation, legacy AI selection, and Live response validation. Target feasibility also checks the required count within one graveyard. Clearing the current selection permits switching graveyards. |

Waste Management now explicitly asks for up to two cards from one graveyard to
exile. The Ring choice shows all four abilities, the active level, future levels,
the current bearer, and the option to keep the same bearer. These details are
included in the Live decision data.

## Validation

- `npm.cmd run check`: PASS.
- `git diff --check`: PASS.
- Broader regression run: **557 tests passed, zero failed or skipped**, in 28
  files. Includes automatic mana priorities and converters, Leonardo and other
  once-per-turn effects, optional triggers, Sauron, the affected precons,
  control changes, dungeon paths, saves, target routing, and multiplayer.
- Final focused run: **19 tests passed**, including the final Live checks and
  an actual combat that sacrifices both surviving blockers after the bearer
  dies. The first 17 tests overlap the broader run; the combined coverage is
  **559 distinct passing tests**.
- Browser acceptance: PASS at **1440, 390, and 320 px** for Ring explanations,
  selecting and confirming a bearer, same-graveyard restrictions, clearing and
  switching graveyards, and explicit confirmation. No page errors.
- Existing target-guidance browser regression: PASS at **1440, 1280, 390, and
  320 px**, including long prompts, sequential targets, graveyards, exile,
  confirmation, and indicator cleanup.

Executable coverage:

- [`tests/gameplay-details-audit.test.mjs`](../tests/gameplay-details-audit.test.mjs)
- [`tests/browser/gameplay-details-audit.mjs`](../tests/browser/gameplay-details-audit.mjs)
- [`tests/browser/target-choice-guidance.mjs`](../tests/browser/target-choice-guidance.mjs)

Local logs: `.local/gameplay-details-regression.log`,
`.local/gameplay-details-focused.log`, `.local/gameplay-details-browser.log`,
and `.local/gameplay-details-target-guidance.log`.
Screenshots: `output/web-game/gameplay-details-audit/`.

No further automatic-mana failure was found in the exercised cases. During the
audit, the full `npm.cmd test` suite, a complete Live game against a deployed
backend, and a production deployment were not run. Existing save guards for function-backed
emblems and delayed abilities, including The Ring, remain in place; this audit
does not add persistence for those unsupported effect shapes. It fixes silent
loss of radiation in otherwise saveable positions.

## Rules references

- The Ring's designation ends when another player gains control of its bearer;
  its acquired abilities belong to the player's emblem.
  [Official LOTR mechanics](https://magic.wizards.com/en/news/feature/the-lord-of-the-rings-tales-of-middle-earth-mechanics).
- The third Ring ability triggers for each creature that blocks the bearer;
  a new temptation can choose the same bearer, and the acquired abilities are
  cumulative.
  [Official LOTR release notes](https://magic.wizards.com/en/news/feature/the-lord-of-the-rings-tales-of-middle-earth-release-notes).

## Release preparation

The subsequent commit, push, and production deployment were requested on
14 September. Final syntax, source audit, and strict certification checks passed:
22,541/22,541 catalog definitions, with no certification failures. All nine
multiplayer server tests passed; `npm audit --omit=dev --audit-level=high`
reported zero vulnerabilities. Certification output changed only its timestamp,
so the existing generated reports were retained.

The browser acceptance script supports `--url` and `--output` for running the
same Ring and target scenarios against the deployed application. Deployment
identity, production checks, and post-release evidence are recorded separately
in `.local/gameplay-release-2026-09-14.md`.
