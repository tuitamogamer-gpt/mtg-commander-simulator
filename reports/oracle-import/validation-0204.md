# Oracle batch 0204

20 September 2026. Batch 0204 adds **100 new cards locally**, bringing this requested expansion to **600 of 1,000 cards**. The remaining 400 are unfinished. No commit, push or deployment was requested or performed.

The batch runs from Abiding Grace to Waiting in the Weeds and uses compiler v15. All 204 batches are registered in the application, runtime, reports and import state: **24,349 definitions**, **24,348 deck-import-eligible definitions**, and **20,400 generic Oracle cards**.

The complete Scryfall source snapshot is `2026-08-30T09:01:56.964+00:00`, bulk ID `27bf3214-1271-490b-bdfe-c0be6c23d02e`, compressed SHA-256 `a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528`. Selection excludes every prior name and Oracle ID. Successful earlier compiler definitions remain frozen.

| Verification | Result |
| --- | --- |
| Exact production cohort before installation | PASS: 100 cards, human and local AI |
| Installed cohort execution | PASS: 100 cards, human and local AI |
| Source, report, module and state provenance | PASS: 100 source rows |
| Oracle and legacy catalog integrity | PASS: 2 tests |
| New composition tests | PASS: 31 tests |
| New boundary tests | PASS: 39 tests |
| Focused importer and engine regression | PASS: 183 tests before the final inherited-landwalk adjustment; that adjustment is covered by the boundary tests |
| JavaScript syntax and source audit | PASS: no duplicate scripts or simplified definitions |
| Strict certification | PASS: 24,349 definitions and 169 built-in decks |
| Generated catalog | PASS: 6,480 missing legal paper Oracle IDs |
| Browser workflow against local application/API server | PASS: 16 checks, human and AI paid casts, Stack resolution, save/reload, stable main phase, no console errors |
| Full repository suite | Not run for this cohort |

Boundary coverage includes X costs, multiplayer recipients, control changes, exact object identity after reentry, draw replacements, simultaneous discards, all supported landwalk types, damage prevention, regeneration and replacement destinations. Failed development runs remain retained; subsequent focused reruns passed after compiler, engine or fixture corrections. A passing scenario is not an exhaustive proof of every multiplayer combination.

Evidence is retained in `.local/oracle-v15/`: `production-proof1.json`, `installed-proof1.json`, `provenance1.log`, `integrity1.log`, `comps3.log`, `boundaries3.log`, `regression1.log`, `check2.log`, `audit1.log`, `certification1.log`, `catalog-export1.log`, and `browser1.log`. Browser artifacts are in `output/playwright/oracle-0204-local-api/`.
