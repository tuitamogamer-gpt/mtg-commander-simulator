# Oracle expansion 0230 — 200 of another 1,000 cards

7 October 2026. Batches **0229–0230 contain 200 of the requested 1,000 new cards**, imported locally. **800 cards remain outstanding.** The runtime contains **26,999 definitions**, **26,998 eligible for deck import**, and **23,000 generic Oracle cards**. No commit, push or deployment has been performed for this expansion.

Batch 0230 uses compiler v32 and the same verified October Scryfall snapshot as batch 0229: SHA-256 `53c35f3df74a48df1a15859c29f2559fb3761f6680f0954b0a19fad9342f489b`, updated `2026-10-07T09:01:59.955+00:00`. Selection considered a recorded 101-card reviewed cohort; its ready counts describe that cohort, not a complete classification of the source.

The compiler adds complete programs for 19 spells. It also explicitly repairs the target binding in the two newly released Teyo cards, neither of which was present in an earlier import. Their creature/planeswalker conditions now inspect the targeted permanent. Earlier compiler versions still reproduce their historical descriptors. Proof fixtures use legal land entry for Room of Refuge and actually discard Titanbones to exercise its discard trigger.

| Verification | Result |
| --- | --- |
| Installed batch 0230 execution | PASS: 100 cards, 200 human/local-AI role-card scenarios |
| Operation and keyword routes | PASS: 308 operations, 64 keywords, 1,065 nested checks |
| State invariants | PASS: 439 controlled games |
| Cold source/report/module/state provenance | PASS: all 200 rows in 0229–0230 and all 8 historical repairs |
| Spell program and boundary regressions | PASS: 78 tests plus 8 AI targeting/duration tests |
| Teyo bindings, importer and cache regressions | PASS: 49 tests |
| Syntax and source audit | PASS |
| Strict card certification | PASS: 26,999/26,999 definitions |
| Browser import, persistence and natural gameplay | PASS: 16 checks |
| Full repository suite | Not run |

The first browser attempt reached turn 24 without drawing a new-cohort card and timed out. There were no browser console/page errors. A second ordinarily shuffled game completed the same checks, including paid human casting of a new card, actual local-AI spell resolution, and a settled Stack. It made no remote mutations. Neither attempt injected cards or mana into the game.

[Execution evidence](evidence/0230-execution.json), [combined provenance evidence](evidence/0230-provenance.json), and [browser evidence](evidence/0230-browser.json) are retained. Browser artifacts are in `output/playwright/oracle-0230-retry/`; the first attempt is retained separately. These controlled checks do not exhaust all card combinations. This is a checkpoint, not completion of the 1,000-card request. Compiler v33 work is still a draft and adds no imported cards to these totals.
