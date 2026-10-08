# Oracle expansion 0229–0238 — all 1,000 cards imported

8 October 2026. The requested additional **1,000 cards** are installed in ten complete batches, **0229–0238**. The runtime contains **27,799 definitions**, **27,798 eligible for deck import**, and **23,800 generic Oracle cards** across **238 batches**. The 175 built-in precon decks remain available.

Batch 0238 contains 27 carried v55 cards and 73 v56 cards. Its pinned Scryfall snapshot was updated `2026-10-07T09:01:59.955+00:00`, SHA-256 `53c35f3df74a48df1a15859c29f2559fb3761f6680f0954b0a19fad9342f489b`. The August snapshot remains available for older imports and historical repairs. Ready counts in selection reports describe the reviewed cohort only.

| Verification | Result |
| --- | --- |
| All 1,000 installed cards, human and local hard AI | PASS: 2,000 role-card scenarios |
| All declared operations and keywords | PASS: 3,074 operations, 516 keywords, 33,942 nested checks |
| State invariants across the expansion | PASS: 5,252 controlled games |
| Batch 0238 draft and installed execution | PASS: 200 role-card scenarios, 288 operations, 40 keywords, 4,630 nested checks, 616 controlled games |
| v56 complete-rule rejection and paid gameplay | PASS: 293 tests |
| Existing engine, mana, targets, damage, entries, phasing and precon regressions | PASS: 679 tests |
| Cost boundaries, combat requirements, copying, ability loss and compiler cache | PASS: 68 tests |
| Catalog, source matching, import records, compatibility and historical repairs | PASS: 107 tests |
| JavaScript syntax and strict certification | PASS: all 27,799 runtime definitions |
| Local browser import, persistence and natural gameplay | PASS: 16 checks |
| Cold source/report/module/state provenance | PASS: all 1,000 imported rows, ten batch modules and eight historical repairs |
| Updated CSV catalog | PASS: reproducible export and `--check`; 27,799 runtime rows and 3,316 remaining source cards |

The browser naturally drew and cast **Quest for the Holy Relic** for one mana on turn 1, observed local hard AI casting, and reached a stable main phase. There were no console/page errors, AI fallbacks, injected gameplay cards or mana, or remote mutations.

The expansion adds complete compiler descriptors and native execution for the new cards. Final regression cases cover paid activation resources, physical object identity after zone changes, independent regeneration shields and riders, damage prevention, copies, linked exile permissions, attachment timing, spell faces and repeated delayed triggers. Auras such as Mammoth Harness retain their own triggered abilities even when the enchanted creature loses its abilities.

[All 1,000 execution records](evidence/0229-0238-execution.json), [batch 0238 execution records](evidence/0238-execution.json), [source verification](evidence/0238-provenance.json), [1,147 focused regression results](evidence/0238-regressions.json), and [browser verification](evidence/0238-browser.json) are retained. Browser screenshots and traces are under `output/playwright/oracle-238/`.

These checks are controlled evidence, not an exhaustive proof of every multiplayer combination. The full repository suite and its long all-deck simulation were not run for this expansion; the focused suites and complete new-card execution matrix above were run. Production deployment must be verified against the exact pushed commit and the canonical alias separately from this local validation report.
