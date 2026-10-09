**Timing and action reachability audit — 9 October 2026**

After the Yuriko report, this audit checked whether representative legal plays actually reach the player, can be selected, pay their printed costs and resolve through native phase, priority and combat processing. It covers timing windows, actions from other zones, combat abilities, mandatory targets, restricted mana and mobile reaction controls.

The following production defects were reproduced and corrected:

- Forecast and four upkeep-only abilities could be passed automatically in ACTIONS/Required actions only. The timing-window guard now runs before profile and own-stack fast passes, including when an own upkeep trigger is waiting. The explicit cohort covers all eleven currently compiled Forecast definitions, Eternal Dragon, Necrosavant, Undead Gladiator and Dwarven Weaponsmith.
- Crew was removed from instant-speed priority questions. Vehicles can now be crewed before declaring attackers or blockers. Ordinary sorcery-speed Equip remains restricted; Leonin Shikari and Brass Squire retain their printed exceptions. ACTIONS still requires HOLD for ordinary optional responses such as Crew.
- Version-prefix activation conditions were never dispatched, causing Najeela, General Jarkeld and Baron Helmut Zemo to fail action discovery. Recognized false results are preserved and unknown conditions still throw. Jarkeld's blocked-attacker predicate also returned undefined for a fresh unblocked attacker; it now returns a boolean. Its exchange effect now preserves scalar blocker IDs, shared blockers and assignments to untouched attackers.
- Suspend passed null cast options into native cast-definition wrappers and crashed. Listing and activation now use an empty options object.
- Channel could be advertised with no legal mandatory target. Static hand-ability targets are checked before an action is offered, including hexproof and controller restrictions; optional targets remain optional.
- Seven restricted-mana sources could incorrectly pay Suspend: Secluded Courtyard, Unclaimed Territory, Somberwald Sage, Ancient Ziggurat, Abundant Countryside, Primal Beyond and Haven of the Spirit Dragon. Special actions are distinguished from spells and abilities. Actual Niko Defies Destiny chapter-II mana remains usable for Foretell, and Courtyard's creature-ability allowance is preserved.
- Mana receipt handlers crashed when there was no spell payment object. Solver surplus metadata also disagreed with actual source tracking, causing Signet payment to fail after tapping a land. Receipt guards and consistent spending traces now cover ordinary and Cave sources without relaxing restriction checks.
- A selected Toxicrene mana grant could be rejected after an earlier Golden Throne sacrifice regenerated its descriptor. Refreshing the descriptor's cost decoration before strict comparison retains the legal grant; source removal, blink, control changes and ability loss still invalidate it.
- Reaction controls used only the blocking pending question, hiding hand highlights, face-up readiness, graveyard/exile PLAY markers and prepared-spell casting. A shared current-action question now feeds those displays and guarded submission. Direct reaction buttons expose representative hand, graveyard, command, Crew and face-up actions. Stale buttons cannot overwrite a target decision.

The final focused Node runs passed **288/288 cases**, with no skips or cancellations:

| Cohort | Cases | Coverage |
| --- | ---: | --- |
| `timed-window-audit.test.mjs` | 46 | 18 named definitions; 44 complete native turns; exact Forecast costs, reveal expiry, upkeep/phase restrictions, draw effects and Najeela's extra combat |
| `combat-action-audit.test.mjs` | 14 | Crew, summoning sickness, ability tax, before-blocks combat, instant-speed Equip exceptions, first-strike response and tap-before-blocks |
| `oracle-condition-dispatch-audit.test.mjs` | 7 | Prefix conditions, false/unknown conditions, real attack event, mixed target candidates and Jarkeld multi-block exchange |
| `zone-action-audit.test.mjs` | 23 | Cycling, Channel, Derevi, graveyard returns, Unearth, Scavenge, Encore, Flashback, Escape, Foretell, Suspend and restricted-mana controls |
| `stack-window-prerequisite-audit.test.mjs` | 7 | Paid native Scepter ETB and Myojin hand cast, real counter/copy responses and missing-prerequisite controls |
| Selected existing priority, Suspend/Evoke, Yuriko, mana and save tests | 123 | Includes one new native Hidden Courtyard → Azorius Signet payment regression |
| Existing converter/backtracking/announcement tests | 62 | Successful payments and invalidation controls, including human and AI |
| Existing catalog reachability sweeps | 6 | Staged stack, timed-zone, ninjutsu and face-up positions |

The Scepter/Myojin sweep failures were missing printed prerequisites in the fixtures: direct battlefield insertion supplies neither linked exiles nor a hand-cast counter. Those two fixtures now stage a native cast, and seven separate paid native scenarios verify the resulting abilities and effects. The Lantern/Ziggurat assertion now checks that granted mana is unrestricted while retaining source receipts, instead of requiring all metadata to be empty.

Six **390×844 Chromium** flows also passed through visible controls: Proclamation of Rebirth Forecast during ACTIONS upkeep, Eternal Dragon's upkeep return, combat Cycling, combat Morph, native-AI attack → Sky Skiff Crew → block and kill Wind Drake, and a prepared Maestro's Gift cast during a reaction with the actual Vedalken Orrery flash permission. They verify payment, effect, stale-button protection, no browser errors, no decision fallbacks and no horizontal overflow. [Compact proof](2026-10-09-timing-and-action-audit.json) records results. Full local traces and twelve screenshots are in `output/timing-audit-2026-10-09/browser/`.

Run the focused Node cohorts with `node --test --test-concurrency=1` and the files listed above. The existing selection is `priority-explicit-stop`, `timing-suspend-evoke-regressions`, `yuriko-ninjutsu-window`, `c17-c19-mana`, `auto-mana-priority`, `save-prepared-effects`, `somberwald-sage-mana`, `mana-solver-backtracking`, `mana-announcement-boundaries`, `mana-repeatable-filters`, `oracle-mana-activation-announcement` and `priority-window-reachability`, each under `tests/` with `.test.mjs`. Run mobile checks with `PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROMIUM_EXECUTABLE=/path/to/chromium node tests/browser/timing-action-audit.mjs`.

Syntax and whitespace checks passed. Catalog export uses the same pinned 9 October Oracle and paper-printing snapshots; definitions, eligibility counts and CSV hashes are unchanged, with only the runtime input fingerprint updated.

This is a bounded behavior audit. Catalog sweeps use staged positions and do not demonstrate every card effect or possible combination. No full random match or entire test suite was run. Forecast/Cycling direct button labels still omit mana costs; the printed card text and actual payment remain available and verified. No speculative patch was made for unrelated type-grant behavior.
