# Ninjutsu and Roaming Throne entry preview — 2026-10-11

Base revision: `9396ae3097e109583613b50aad4279424adbe1cc`.

## Reported failure and reproduction

During blockers, activate Yuriko commander ninjutsu returning a Mockingbird copy of Changeling Outcast. Before Yuriko resolves, activate Thousand-Faced Shadow ninjutsu returning another Changeling Outcast. An attacking Roaming Throne with Ninja selected doubles Shadow’s enters-from-hand-attacking trigger. Target the attacking Throne for both triggers.

The first attacking Throne token is structurally inserted into the battlefield and combat before its as-enters creature-type choice completes. Its derived `cur` is temporarily null. The core engine deliberately excludes unfinished entrants from `game.bf()` during entry replacements.

Desktop/central combat preview nevertheless iterated the raw combat attacker list and called `dmgAmount` for this entrant, throwing `Cannot read properties of null (reading 'skipCombatDamage')`. The mobile combat history independently read `card.cur.unblockable` for the same entrant and threw too.

A render exception inside the human controller’s decision Promise rejects that decision and aborts the resolving Shadow trigger. A later render can still show the retained type-choice dialog. Clicking Ninja after that rejection clears the visible dialog but cannot resume the failed Promise. The reproduced final state matches the report: Yuriko in command, Shadow and one token Throne on the battlefield, two older stack items, no pending/reaction choice, and “Opponents are playing…”.

## Change

Use current `game.bf()` membership when building the central combat damage preview, mobile combat history and desktop combat ledger. Unfinished attackers appear after entry choices complete and derived characteristics are available. Core combat registration, ninjutsu resolution, creature-type choices and triggered-ability counts retain their native paths.

## Validation

- Syntax check and `git diff --check`: PASS.
- 69 related tests: PASS, including the prior copied-attacker/AI isolation fix, interleaved ninjutsu, combat action windows, entry timing, damage UI, frontend layout and baseline coverage.
- One additional native entry/UI regression: PASS. A real Roaming Throne token pauses its type choice while present in combat but excluded from the available battlefield. Central preview and actual mobile history keep two ready attackers/10 damage, then show three attackers/14 damage after the token enters as a 4/4. State invariants pass.
- Baseline central preview regression: RED with the exact null `skipCombatDamage` exception.
- Baseline mobile history regression: RED with the exact null `unblockable` exception.
- Native interleaved scenarios cover Ninja doubling, a Dragon control, and actual hard AI response evaluation with native Opt snapshot isolation. Each copied Throne independently chooses its type; source triggers do not multiply retroactively.
- Full mobile browser reproduction on the old presentation code: RED, including the visible Ninja click followed by the stale two-item stack.
- Full mobile browser acceptance on the fixed code: PASS. Both Shadow triggers and both visible Ninja choices resolve, two attacking Throne tokens are created, then Yuriko enters. All five Ninjas hit; three Ninja Thrones add three additional triggers per hit, so exactly 20 Yuriko triggers resolve. Final lives are 40/15/29/29 with Temporal Trespass revealed once and zero-value remaining reveals. Stack and pending choices settle; no browser errors.

Evidence is under `/workspace/scratch/shadow-type-browser-baseline-after-ninja`, `/workspace/scratch/shadow-type-browser-fixed-complete`, and `/workspace/scratch/ninjutsu-release/throne-*.log`.

## Scope and release

This patch addresses presentation during in-progress creature entry. It does not automatically resume a decision Promise already rejected in a running old client. Production acceptance will check the actual shipped changed modules after deployment.

The full 786-file test suite and 175-deck full-match smoke sweep were not repeated for this presentation change. Card data, scripts and dependencies are unchanged. Their prior audit/certification results do not establish a new all-match smoke pass.
