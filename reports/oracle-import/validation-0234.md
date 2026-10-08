# Oracle expansion 0234 — 600 of another 1,000 cards

8 October 2026. Batches **0229–0234 contain 600 of the requested 1,000 additional cards**, imported locally. **400 remain outstanding.** The runtime contains **27,399 definitions**, **27,398 eligible for deck import**, and **23,400 generic Oracle cards**. Commit, push and deployment are authorized after the full expansion; none has been performed yet.

Batch 0234 uses compiler v47 and the pinned October Scryfall snapshot: SHA-256 `53c35f3df74a48df1a15859c29f2559fb3761f6680f0954b0a19fad9342f489b`, updated `2026-10-07T09:01:59.955+00:00`. It contains 100 reviewed cards from v43–v47; the remaining reviewed Yuriko card is reserved for the next batch. Ready counts describe the reviewed cohort only.

| Verification | Result |
| --- | --- |
| Draft and installed execution | PASS: 100 cards, 200 human/local-AI role-card scenarios |
| Declared rules | PASS: 386 operations, 56 keywords, 8,451 nested checks |
| State invariants | PASS: 748 controlled games |
| Cold source/report/module/state provenance | PASS: all 600 rows and all 8 historical repairs |
| v43–v47 closure and paid gameplay regressions | PASS: 409 tests |
| Browser import, persistence and natural gameplay | PASS: 16 checks |
| Full repository suite | Not run at this checkpoint |

The browser cast Tolarian Entrancer from the human player's naturally drawn hand for two mana on turn 4, observed local hard AI casts, and returned to a stable main phase. No console/page errors, AI fallbacks or remote mutations occurred; no cards or mana were injected into that game.

[Execution evidence](evidence/0234-execution.json), [combined provenance evidence](evidence/0234-provenance.json), and [browser evidence](evidence/0234-browser.json) are retained. Browser artifacts are in `output/playwright/oracle-234/`. CSV and strict certification reports need final regeneration. These controlled checks do not exhaust every card combination, and this checkpoint does not complete the requested expansion.
