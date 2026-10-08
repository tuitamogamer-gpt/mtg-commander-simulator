# Oracle expansion 0237 — 900 of another 1,000 cards

8 October 2026. Batches **0229–0237 contain 900 of the requested 1,000 additional cards**, imported locally. **100 remain outstanding.** The runtime contains **27,699 definitions**, **27,698 eligible for deck import**, and **23,700 generic Oracle cards**. Commit, push and deployment are authorized after the full expansion; none has been performed yet.

Batch 0237 uses compiler v55 and the pinned October Scryfall snapshot: SHA-256 `53c35f3df74a48df1a15859c29f2559fb3761f6680f0954b0a19fad9342f489b`, updated `2026-10-07T09:01:59.955+00:00`. It contains five carried v53 cards, all sixty v54 cards and thirty-five v55 cards. Ready counts describe the reviewed cohort only.

| Verification | Result |
| --- | --- |
| Draft and installed execution | PASS: 100 cards, 200 human/local-AI role-card scenarios |
| Declared rules | PASS: 246 operations, 42 keywords, 3,578 nested checks |
| State invariants | PASS: 534 controlled games |
| Cold source/report/module/state provenance | PASS: all 900 rows and all 8 historical repairs |
| v54–v55 closure and paid gameplay regressions | PASS: 241 + 249 tests; later focused spell-face checks also pass |
| Browser import, persistence and natural gameplay | PASS: 16 checks |
| Full repository suite | Not run at this checkpoint |

The browser cast Nimble Hobbit from the human player's naturally drawn hand for two mana on turn 6, observed local hard AI casts, and returned to a stable main phase. No console/page errors, AI fallbacks or remote mutations occurred; no cards or mana were injected into that game.

The new behavior includes linked life totals, Aura transfers, repeated delayed triggers, physical exile permissions, and spell-face-aware free casting. Arcbond retains the damaged creature's last known characteristics when that creature dies before the delayed trigger resolves. Twinning Glass tests the actual prospective spell face against cast history.

[Execution evidence](evidence/0237-execution.json), [combined provenance evidence](evidence/0237-provenance.json), and [browser evidence](evidence/0237-browser.json) are retained. Browser artifacts are in `output/playwright/oracle-237/`. CSV and strict certification reports need final regeneration. These controlled checks do not exhaust every card combination, and this checkpoint does not complete the requested expansion.
