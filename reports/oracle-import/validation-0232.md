# Oracle expansion 0232 — 400 of another 1,000 cards

7 October 2026. Batches **0229–0232 contain 400 of the requested 1,000 additional cards**, imported locally. **600 remain outstanding.** The runtime contains **27,199 definitions**, **27,198 eligible for deck import**, and **23,200 generic Oracle cards**. No commit, push or deployment has been performed for this expansion.

Batch 0232 uses compiler v39 and the verified October Scryfall snapshot: SHA-256 `53c35f3df74a48df1a15859c29f2559fb3761f6680f0954b0a19fad9342f489b`, updated `2026-10-07T09:01:59.955+00:00`. The report records its 100-card reviewed cohort. Ready counts describe that cohort, not a new classification of every source row.

The rules added for this batch cover qualified cast, discard and damage triggers; combat requirements; token training and devour; graveyard selection; temporary control; and controlling another player's turn. Tests use paid casts and activations with both human fixtures and the real hard AI decision controller. Negative cases distinguish the affected players, objects, zones and turn boundaries.

| Verification | Result |
| --- | --- |
| Installed batch execution | PASS: 100 cards, 200 human/local-AI role-card scenarios |
| Operation and keyword routes | PASS: 378 operations, 54 keywords, 1,946 nested checks |
| State invariants | PASS: 438 controlled games |
| Cold source/report/module/state provenance | PASS: all 400 rows in 0229–0232 and all 8 historical repairs |
| v37/v38 and related control regressions | PASS: 135 tests |
| v39 closure, compatibility and paid scenarios | 31 initial passes; the remaining Stream of Thought AI scenario passed after the fixture constrained its optional replicate count; both Stream of Thought roles rechecked |
| Browser import, persistence and natural gameplay | PASS: 16 checks |
| Full repository suite | Not run |

The browser game cast Horn of the Mark from the human player's naturally drawn hand for two mana on turn 6, resolved local-AI spells and returned to a stable main phase. There were no browser errors, AI fallbacks or remote mutations. No cards or mana were injected into the game.

[Execution evidence](evidence/0232-execution.json), [combined provenance evidence](evidence/0232-provenance.json), and [browser evidence](evidence/0232-browser.json) are retained. Browser artifacts are in `output/playwright/oracle-0232/`. The CSV catalog still describes checkpoint 0230 and needs regeneration for the final expansion. These controlled checks do not exhaust all card combinations; this checkpoint does not complete the 1,000-card request. Compiler v40 work is unimported and not covered by this checkpoint.
