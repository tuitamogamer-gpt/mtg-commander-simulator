# Oracle expansion 0231 — 300 of another 1,000 cards

7 October 2026. Batches **0229–0231 contain 300 of the requested 1,000 additional cards**, imported locally. **700 remain outstanding.** The runtime contains **27,099 definitions**, **27,098 eligible for deck import**, and **23,100 generic Oracle cards**. No commit, push or deployment has been performed for this expansion.

Batch 0231 uses compiler v36 and the verified October Scryfall snapshot: SHA-256 `53c35f3df74a48df1a15859c29f2559fb3761f6680f0954b0a19fad9342f489b`, updated `2026-10-07T09:01:59.955+00:00`. The selection report records its 100-card reviewed cohort. Its ready counts apply to that cohort, not a new classification of every source row.

The added rules cover combat requirements, event qualifiers, costs and 31 complete spell programs. Immediate mana bonuses participate in mana payment planning. Single-use flash permissions expire on the next qualifying cast. Combat-skipping effects cover every combat phase of the specified turn. Retargeting, related targets, copied spells, delayed damage triggers, and exile-origin land play preserve the engine's ordinary target, controller and object-identity rules.

| Verification | Result |
| --- | --- |
| Installed batch 0231 execution | PASS: 100 cards, 200 human/local-AI role-card scenarios |
| Operation and keyword routes | PASS: 332 operations, 40 keywords, 2,418 nested checks |
| State invariants | PASS: 440 controlled games |
| Cold source/report/module/state provenance | PASS: all 300 rows in 0229–0231 and all 8 historical repairs |
| v36 spell, related-target, copied-spell and delayed-trigger regressions | PASS: 256 tests |
| v35 event, land-play and targeting regressions | PASS: 150 tests |
| Syntax and source audit | PASS |
| Strict card certification | PASS: 27,099/27,099 definitions |
| Browser import, persistence and natural gameplay | PASS: 16 checks |
| Full repository suite | Not run |

The browser game cast Hundred-Handed One from the human player's naturally drawn hand for four mana on turn 11, resolved local-AI spells and returned to a stable main phase. There were no browser errors, AI fallbacks or remote mutations. No cards or mana were injected into that game.

[Execution evidence](evidence/0231-execution.json), [combined provenance evidence](evidence/0231-provenance.json), and [browser evidence](evidence/0231-browser.json) are retained. Browser artifacts are in `output/playwright/oracle-0231/`. The CSV catalog still describes checkpoint 0230 and needs regeneration for the final expansion. These controlled checks do not exhaust all card combinations; this checkpoint does not complete the 1,000-card request.
