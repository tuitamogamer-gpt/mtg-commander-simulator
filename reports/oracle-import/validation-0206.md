# Oracle batch 0206

20 September 2026. Batch 0206 adds **100 new cards locally**, bringing this expansion to **800 of the requested 1,000 cards**. The remaining 200 are in development. No commit, push or deployment was requested or performed.

The complete production selection runs from Aeve, Progenitor Ooze to Witness the End and uses compiler v17. All 206 batches are registered: **24,549 definitions**, **24,548 deck-import-eligible definitions**, and **20,600 generic Oracle cards**.

The pinned Scryfall source is `2026-08-30T09:01:56.964+00:00`, bulk ID `27bf3214-1271-490b-bdfe-c0be6c23d02e`, compressed SHA-256 `a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528`. Selection inspected all 38,627 rows and excluded previous names and Oracle IDs. Earlier successful compiler definitions remain frozen.

| Verification | Result |
| --- | --- |
| Exact production cohort before installation | PASS: 100 cards, human and local AI |
| Installed cohort execution | PASS: 100 cards, human and local AI |
| Source, report, module and state provenance | PASS: 100 source rows |
| Oracle and legacy catalog integrity | PASS: 2 tests |
| New boundary tests | PASS: 57 tests |
| Focused engine regression | PASS: 188 tests |
| Additional mana and v17 regression | PASS: 83 tests |
| Syntax and source audit | PASS: no duplicate scripts or simplified definitions |
| Strict certification | PASS: 24,549 definitions and 169 built-in decks |
| Generated catalog | PASS: 6,280 missing legal paper Oracle IDs |
| Browser workflow against local application/API server | PASS: 16 checks |
| Full repository suite | Not run for this cohort |

Coverage includes simultaneous damage and shield counters, attached-source last known information, private hand choices, player Auras, untap restrictions, frozen spell types, dependent graveyard targets, face-down legality, phasing, separate multikicker triggers, and choices of counter types and quantities. Browser checks cover paid human and AI casts, Stack resolution, saves, reload and console errors. These scenarios are not an exhaustive proof of every card combination.

Evidence is retained in `.local/oracle-v17/`: `production-proof1.json` with corrected `production-proof2.log`, `installed-proof1.json` with `installed-proof2.log`, `provenance1.json`, `integrity1.log`, `boundaries2.log`, `regression1.log`, `check2.log`, `audit1.log`, `certification1.log`, `catalog-export1.log`, and `browser1.log`. The incorrectly unbounded installed run was interrupted and is not counted as a pass. The additional 83-test regression is `.local/oracle-v18/mana-regression1.log`. Browser artifacts are in `output/playwright/oracle-0206-local-api/`.
