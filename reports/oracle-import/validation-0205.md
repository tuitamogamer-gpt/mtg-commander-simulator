# Oracle batch 0205

20 September 2026. Batch 0205 adds **100 new cards locally**, bringing this requested expansion to **700 of 1,000 cards**. The remaining 300 are unfinished. No commit, push or deployment was requested or performed.

The batch runs from Absorbing Man and Titania to Wurmskin Forger and uses compiler v16. All 205 batches are registered: **24,449 definitions**, **24,448 deck-import-eligible definitions**, and **20,500 generic Oracle cards**.

The complete Scryfall source snapshot is `2026-08-30T09:01:56.964+00:00`, bulk ID `27bf3214-1271-490b-bdfe-c0be6c23d02e`, compressed SHA-256 `a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528`. Selection excludes every prior name and Oracle ID. Successful earlier compiler definitions remain frozen.

| Verification | Result |
| --- | --- |
| Exact production cohort before installation | PASS: 100 cards, human and local AI |
| Installed cohort execution | PASS: 100 cards, human and local AI |
| Source, report, module and state provenance | PASS: 100 source rows |
| Oracle and legacy catalog integrity | PASS: 2 tests |
| New boundary tests | PASS: 35 tests |
| Focused engine regression | PASS: 203 tests |
| JavaScript syntax and source audit | PASS: no duplicate scripts or simplified definitions |
| Strict certification | PASS: 24,449 definitions and 169 built-in decks |
| Generated catalog | PASS: 6,380 missing legal paper Oracle IDs |
| Browser workflow against local application/API server | PASS: 16 checks, human and AI paid casts, Stack resolution, save/reload, stable main phase, no console errors |
| Full repository suite | Not run for this cohort |

Boundary coverage includes announced counter distributions after target loss, life gain replacements, joint Ward payments, frozen spell-type history, simultaneous deaths, stolen permanents, chosen creature types, ability inheritance and reentry identity. Failed development runs remain retained; corrected focused reruns passed. A passing scenario is not an exhaustive proof of every multiplayer combination.

Evidence is retained in `.local/oracle-v16/`: `production-proof1.json`, `installed-proof1.json`, `provenance1.json`, `integrity1.log`, `boundaries3.log`, `regression1.log`, `check1.log`, `audit1.log`, `certification1.log`, `catalog-export1.log`, and `browser1.log`. Browser artifacts are in `output/playwright/oracle-0205-local-api/`.
