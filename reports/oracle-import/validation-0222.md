# Oracle expansion 0222 — continuing the next 1,000 cards

1 October 2026. **400 of the requested 1,000 cards are imported locally**, in complete batches **0219–0222**. **600 remain outstanding.** Batch 0222 adds 100 complete cards, from **Aether Vial** through **White Mage's Staff**, using compiler v24. Inventory is **26,192 definitions**, **26,191 eligible for deck import**, **22,200 generic Oracle cards** in 222 batches and 175 built-in decks. No commit, push or deployment was requested or performed.

The unchanged source snapshot is `2026-08-30T09:01:56.964+00:00`, bulk ID `27bf3214-1271-490b-bdfe-c0be6c23d02e`, compressed SHA-256 `a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528`. The drift-free scan classified all 4,757 absent legal paper Oracle IDs and found 122 fully supported candidates. After this batch, 4,657 source IDs remain absent, including 22 supported candidates awaiting a verified batch. Catalog CSVs, guide, summary and landing counts were regenerated.

New families include dual kicker and captured entry choices, the five March exile reductions, aggregate and repeated additional costs, Epic, all twelve Licids, linked exile and Hideaway, complete Saga chapters and qualified cards put from hand. Accepted cards retain every printed instruction; unsupported bodies remain rejected.

| Verification | Result |
| --- | --- |
| Installed execution | PASS: 100 cards and 200 human/local-AI role-card scenarios |
| Operation and keyword routes | PASS: 406 operation routes, 18 keyword routes, 11,420 nested checks |
| State invariants | PASS: 1,049 controlled games |
| Exact source/report/module/state provenance | PASS: 100 pinned source rows |
| Focused v24 mechanics | PASS: 346 tests |
| Syntax, source audit and strict certification | PASS; 26,192/26,192 definitions certified |
| Local browser import and gameplay | PASS: 16 checks; no browser errors or remote mutations |
| Full repository suite | Not run for this expansion |

The browser imported, saved and revalidated a 100-card guest deck, then resolved **Cemetery Prowler** after an actual three-mana human payment. New-card AI behavior is covered by installed headless proof; browser AI used existing cards. The full candidate proof also found missing Safe Haven activation coverage and a Thief of Existence Stack-to-battlefield granted ability issue. Both were repaired and exercised with actual paid casts, copies, countered sources and changed object incarnations before installation. Licid ending actions work under Split Second without adding an ability to the Stack; countered or fizzled Epic creates no casting lock.

[Execution evidence](evidence/0222-execution.json), [provenance evidence](evidence/0222-provenance.json) and [validation summary](evidence/0222-validation.json) are retained. Browser artifacts are in `output/playwright/oracle-0222-local-api/`; logs are in `.local/oracle-v24/`. Controlled scenarios do not exhaust all card combinations. The comparison uses the pinned August snapshot. Unrelated local work was preserved. The 1,000-card request remains in progress.
