# Oracle expansion 0227 — the next 1,000 cards

3 October 2026. **900 of the requested 1,000 cards are imported locally**, in complete batches **0219–0227**. **100 remain outstanding.** Batch 0227 adds 100 complete cards, from **Allure of the Unknown** through **You Cannot Pass!**, using compiler v29. Inventory is **26,692 definitions**, **26,691 eligible for deck import**, **22,700 generic Oracle cards** in 227 batches and 175 built-in decks. No commit, push or deployment was requested or performed.

The unchanged source snapshot is `2026-08-30T09:01:56.964+00:00`, bulk ID `27bf3214-1271-490b-bdfe-c0be6c23d02e`, compressed SHA-256 `a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528`. The drift-free scan classified all 4,257 absent legal paper Oracle IDs and found 107 fully supported candidates. After this batch, 4,157 source IDs remain absent, including 7 supported candidates awaiting a verified batch. Catalog CSVs, guide, summary and landing counts were regenerated.

Compiler v29 adds complete paid permanent and turn-history programs, conditional and cohort spell bodies, and library, Saga and attack programs. Actual entry and sacrifice histories, beginning-of-turn counts, linked cohorts and paid donors retain their printed restrictions. New source bodies and every physical face reject unsupported continuations. Accepted cards retain every printed instruction; unsupported bodies remain rejected.

| Verification | Result |
| --- | --- |
| Installed execution | PASS: 100 cards and 200 human/local-AI role-card scenarios |
| Operation and keyword routes | PASS: 232 operation routes, 24 keyword routes, 4,160 nested checks |
| State invariants | PASS: 468 controlled games |
| Exact source/report/module/state provenance | PASS: 100 pinned source rows |
| Focused v29 mechanics | PASS: 340 tests |
| Syntax, source audit and strict certification | PASS; 26,692/26,692 definitions certified |
| Local browser import and gameplay | PASS: 16 checks; no browser errors or remote mutations |
| Full repository suite | Not run for this expansion |

The browser imported, saved and revalidated a 100-card guest deck, then resolved **Stormscale Anarch** after an actual 4-mana human payment. New-card AI behavior is covered by installed headless proof; browser AI used existing cards. Native casting-permission and prototype regression checks pass 158 tests. Prototype choices use the resulting spell mana value. Reign of Terror chooses its color on resolution, with each copy choosing separately. Human and AI tests cover actual combat declarations, saved library choices, stale objects, paid costs and optional declines.

[Execution evidence](evidence/0227-execution.json), [provenance evidence](evidence/0227-provenance.json) and [validation summary](evidence/0227-validation.json) are retained. Browser artifacts are in `output/playwright/oracle-0227-local-api/`; logs are in `.local/oracle-v29/`. Controlled scenarios do not exhaust all card combinations. The comparison uses the pinned August snapshot. Unrelated local work was preserved.
