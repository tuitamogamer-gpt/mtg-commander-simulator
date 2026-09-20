# Oracle batch 0203

20 September 2026. Batch 0203 adds **100 new cards locally**, bringing this requested expansion to **500 of 1,000 cards**. The remaining 500 are unfinished. No commit, push or deployment was requested or performed.

The batch runs from Agent Maria Hill to Widow's Bite and uses compiler v14. All 203 batches are registered in the application, runtime, reports and import state: **24,249 definitions**, **24,248 deck-import-eligible definitions**, and **20,300 generic Oracle cards**.

The complete Scryfall source snapshot is `2026-08-30T09:01:56.964+00:00`, bulk ID `27bf3214-1271-490b-bdfe-c0be6c23d02e`, compressed SHA-256 `a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528`. Selection excludes every prior name and Oracle ID. Successful earlier compiler definitions remain frozen.

| Verification | Result |
| --- | --- |
| Exact production cohort before installation | PASS: 100 cards, human and local AI |
| Installed cohort execution | PASS: 100 cards, human and local AI |
| Source, report, module and state provenance | PASS: 100 source rows |
| Import and catalog integrity | PASS: 13 tests, 203 batches |
| Focused importer and engine regression | PASS: 341 tests |
| Additional movement regression | PASS: 21 tests |
| Source audit | PASS: no duplicate scripts or simplified definitions |
| Strict certification | PASS: 24,249 definitions and 169 built-in decks |
| Generated catalog | PASS: 6,580 missing legal paper Oracle IDs |
| Browser workflow against local application/API server | PASS: 16 checks, human and AI paid casts, Stack resolution, save/reload, stable main phase, no console errors |
| Full repository suite | Not run for this cohort |

The complete 20,300-card matrix passed 20,299 cards and failed Strip Bare in the AI proof fixture. The helper offered an unrelated creature without an attachment; correcting that staging produced a focused pass for both controllers. The original failed full run remains retained and is not described as a full pass.

Evidence is retained in `.local/oracle-v14/`, including `production-proof1.json`, `installed-proof2.json`, `provenance1.log`, `integrity1.log`, `regression1.log`, `movement-unit2.log`, `audit1.log`, `certification1.log`, `catalog-export1.log`, and `browser3.log`. The successful browser artifacts are in `output/playwright/oracle-0203-local-api/`. Strip Bare's focused rerun is `.local/oracle-v15/strip-bare-fix3.log`. These are controlled scenarios, not exhaustive proofs of every multiplayer interaction.
