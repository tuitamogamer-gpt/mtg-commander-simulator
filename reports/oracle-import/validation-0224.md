# Oracle expansion 0224 — the next 1,000 cards

3 October 2026. **600 of the requested 1,000 cards are imported locally**, in complete batches **0219–0224**. **400 remain outstanding.** Batch 0224 adds 100 complete cards, from **Amplifire** through **What Must Be Done**, using compiler v26. Inventory is **26,392 definitions**, **26,391 eligible for deck import**, **22,400 generic Oracle cards** in 224 batches and 175 built-in decks. No commit, push or deployment was requested or performed.

The unchanged source snapshot is `2026-08-30T09:01:56.964+00:00`, bulk ID `27bf3214-1271-490b-bdfe-c0be6c23d02e`, compressed SHA-256 `a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528`. The drift-free scan classified all 4,557 absent legal paper Oracle IDs and found 128 fully supported candidates. After this batch, 4,457 source IDs remain absent, including 28 supported candidates awaiting a verified batch. Catalog CSVs, guide, summary and landing counts were regenerated.

New families include entry life payments and copiable creature forms, linked exile look/play permissions, native paid-object and casting-cohort spell values, locked top-library conditions, hidden/public piles and captured reveal/mill values. Entry forms retain their copiable characteristics through checkpoints. Accepted cards retain every printed instruction; unsupported bodies remain rejected.

| Verification | Result |
| --- | --- |
| Installed execution | PASS: 100 cards and 200 human/local-AI role-card scenarios |
| Operation and keyword routes | PASS: 312 operation routes, 20 keyword routes, 5,850 nested checks |
| State invariants | PASS: 700 controlled games |
| Exact source/report/module/state provenance | PASS: 100 pinned source rows |
| Focused v26 mechanics | PASS: 324 tests |
| Syntax, source audit and strict certification | PASS; 26,392/26,392 definitions certified |
| Local browser import and gameplay | PASS: 16 checks; no browser errors or remote mutations |
| Full repository suite | Not run for this expansion |

The browser imported, saved and revalidated a 100-card guest deck, then resolved **Primal Clay** after an actual 4-mana human payment. New-card AI behavior is covered by installed headless proof; browser AI used existing cards. Entry-form save and restore also passes 20 existing checkpoint regressions. Focused combat checks cover Owlbear defending-player capture, Rulik land acceptance and fallback token creation, and complete physical faces.

[Execution evidence](evidence/0224-execution.json), [provenance evidence](evidence/0224-provenance.json) and [validation summary](evidence/0224-validation.json) are retained. Browser artifacts are in `output/playwright/oracle-0224-local-api/`; logs are in `.local/oracle-v26/`. Controlled scenarios do not exhaust all card combinations. The comparison uses the pinned August snapshot. Unrelated local work was preserved.
