# Oracle expansion 0221 — continuing the next 1,000 cards

1 October 2026. **300 of the requested 1,000 new cards are imported locally**, in complete batches **0219–0221**. **700 cards remain outstanding.** Batch 0221 contains 100 complete cards selected with compiler v23 from the unchanged pinned Scryfall snapshot. Runtime inventory is **26,092 definitions**, **26,091 eligible for deck import**, and **22,100 generic Oracle cards** across 221 batches, with 175 built-in decks. No commit, push or deployment was requested or performed.

The batch runs from **Accumulate Wisdom** through **Wail of the Forgotten**. The source is `2026-08-30T09:01:56.964+00:00`, bulk ID `27bf3214-1271-490b-bdfe-c0be6c23d02e`, compressed SHA-256 `a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528`. The drift-free scan classified all 4,857 previously absent legal paper Oracle IDs and found 119 complete supported cards. After importing 100, 4,757 IDs remain absent, including 19 supported candidates awaiting a verified batch. The catalog CSVs, guide, summary and landing counts were regenerated for this checkpoint.

New supported families include optional opening-hand disclosures and correctly timed delayed abilities, actual casting-origin branches, compound nonmana casting costs, dual-zone granted keywords, Aura effects with exact attachment identity, Suspend/cumulative-upkeep costs, qualified library choices, and complete modal bodies. Every printed instruction must compile; unsupported bodies remain rejected.

| Verification | Result |
| --- | --- |
| Installed execution | PASS: 100 cards and 200 human/local-AI role-card scenarios |
| Operation and keyword routes | PASS: 414 operation routes, 22 keyword routes, 3,441 nested checks |
| Game state invariants | PASS: 638 controlled games |
| Exact source/report/module/state provenance | PASS: 100 pinned source rows |
| Focused v23 mechanics | PASS: 237 tests |
| Syntax, source audit and strict certification | PASS; 26,092/26,092 definitions certified |
| Local browser import and gameplay | PASS: 16 checks, no browser errors or remote mutations |
| Full repository suite | Not run for this expansion |

The browser imported and persisted a 100-card guest deck. **Rocket-Powered Goblin Glider** resolved after an actual three-mana human payment. Browser AI gameplay used existing cards; new-cohort AI behavior is covered by installed headless proof. The installed fresh-load check caught module registration occurring after batch registration; compiler/runtime modules now load before batches, with late native integrations installed afterwards. A strict-certification false failure for Chancellor of the Tangle was corrected to recognize its explicit opening-hand delayed first-main program. The corrected checks pass.

[Execution evidence](evidence/0221-execution.json), [provenance evidence](evidence/0221-provenance.json) and [validation summary](evidence/0221-validation.json) are retained. Browser artifacts are in `output/playwright/oracle-0221-local-api/`; logs are in `.local/oracle-v23/`. Controlled scenarios do not exhaust every card interaction, and the comparison uses the pinned August snapshot. Existing unrelated local edits were preserved. The 1,000-card request remains in progress.
