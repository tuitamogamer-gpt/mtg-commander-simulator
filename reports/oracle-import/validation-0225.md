# Oracle expansion 0225 — the next 1,000 cards

3 October 2026. **700 of the requested 1,000 cards are imported locally**, in complete batches **0219–0225**. **300 remain outstanding.** Batch 0225 adds 100 complete cards, from **Aang's Journey** through **Winota, Joiner of Forces**, using compiler v27. Inventory is **26,492 definitions**, **26,491 eligible for deck import**, **22,500 generic Oracle cards** in 225 batches and 175 built-in decks. No commit, push or deployment was requested or performed.

The unchanged source snapshot is `2026-08-30T09:01:56.964+00:00`, bulk ID `27bf3214-1271-490b-bdfe-c0be6c23d02e`, compressed SHA-256 `a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528`. The drift-free scan classified all 4,457 absent legal paper Oracle IDs and found 124 fully supported candidates. After this batch, 4,357 source IDs remain absent, including 24 supported candidates awaiting a verified batch. Catalog CSVs, guide, summary and landing counts were regenerated.

New families cover chosen entry numbers and casting restrictions, linked exile and paid-object characteristics, divided spell choices, exact library selections, mill cohorts, selected-card followups and complete Saga/physical-face transitions. Accepted cards retain every printed instruction; unsupported bodies remain rejected.

| Verification | Result |
| --- | --- |
| Installed execution | PASS: 100 cards and 200 human/local-AI role-card scenarios |
| Operation and keyword routes | PASS: 320 operation routes, 24 keyword routes, 5,616 nested checks |
| State invariants | PASS: 642 controlled games |
| Exact source/report/module/state provenance | PASS: 100 pinned source rows |
| Focused v27 mechanics | PASS: 299 tests |
| Syntax, source audit and strict certification | PASS; 26,492/26,492 definitions certified |
| Local browser import and gameplay | PASS: 16 checks; no browser errors or remote mutations |
| Full repository suite | Not run for this expansion |

The browser imported, saved and revalidated a 100-card guest deck, then resolved **Ghost Vacuum** after an actual 1-mana human payment. New-card AI behavior is covered by installed headless proof; browser AI used existing cards. Circle of Confinement has a full paid-source proof covering legal exile, linked same-name Vampire casts, invalid and nonmatching casts, leave return and expiration. Complete per-face negative compilation checks reject every unsupported appended rule.

[Execution evidence](evidence/0225-execution.json), [provenance evidence](evidence/0225-provenance.json) and [validation summary](evidence/0225-validation.json) are retained. Browser artifacts are in `output/playwright/oracle-0225-local-api/`; logs are in `.local/oracle-v27/`. Controlled scenarios do not exhaust all card combinations. The comparison uses the pinned August snapshot. Unrelated local work was preserved.
