# Oracle expansion 0236 — 800 of another 1,000 cards

8 October 2026. Batches **0229–0236 contain 800 of the requested 1,000 additional cards**, imported locally. **200 remain outstanding.** The runtime contains **27,599 definitions**, **27,598 eligible for deck import**, and **23,600 generic Oracle cards**. Commit, push and deployment are authorized after the full expansion; none has been performed yet.

Batch 0236 uses compiler v53 and the pinned October Scryfall snapshot: SHA-256 `53c35f3df74a48df1a15859c29f2559fb3761f6680f0954b0a19fad9342f489b`, updated `2026-10-07T09:01:59.955+00:00`. It contains 100 reviewed cards, including Wall of Dust and Warchanter Skald carried from v50, all fourteen v51 cards, thirty-three v52 cards, and fifty-one v53 cards. The current Oracle wording for Samite Elder is supported alongside the earlier wording. Ready counts describe the reviewed cohort only.

| Verification | Result |
| --- | --- |
| Draft and installed execution | PASS: 100 cards, 200 human/local-AI role-card scenarios |
| Declared rules | PASS: 254 operations, 70 keywords, 3,920 nested checks |
| State invariants | PASS: 578 controlled games |
| Cold source/report/module/state provenance | PASS: all 800 rows and all 8 historical repairs |
| v51–v53 closure and paid gameplay regressions | PASS: 57 + 133 + 229 tests |
| Browser import, persistence and natural gameplay | PASS: 16 checks |
| Full repository suite | Not run at this checkpoint |

The browser cast Acrobatic Cheerleader from the human player's naturally drawn hand for two mana on turn 5, observed local hard AI casts, and returned to a stable main phase. No console/page errors, AI fallbacks or remote mutations occurred; no cards or mana were injected into that game.

The graveyard activation path now pays and reserves printed mill costs, including rejecting an activation when the library cannot cover that cost. Trigger target selection binds the triggering spell's captured mana value. Once-per-object triggers distinguish a permanent's new incarnation after a zone change.

[Execution evidence](evidence/0236-execution.json), [combined provenance evidence](evidence/0236-provenance.json), and [browser evidence](evidence/0236-browser.json) are retained. Browser artifacts are in `output/playwright/oracle-236/`. CSV and strict certification reports need final regeneration. These controlled checks do not exhaust every card combination, and this checkpoint does not complete the requested expansion.
