# Oracle expansion 0223 — continuing the next 1,000 cards

3 October 2026. **500 of the requested 1,000 cards are imported locally**, in complete batches **0219–0223**. **500 remain outstanding.** Batch 0223 adds 100 complete cards, from **Abundant Harvest** through **Unidentified Hovership**, using compiler v25. Inventory is **26,292 definitions**, **26,291 eligible for deck import**, **22,300 generic Oracle cards** in 223 batches and 175 built-in decks. No commit, push or deployment was requested or performed.

The unchanged source snapshot is `2026-08-30T09:01:56.964+00:00`, bulk ID `27bf3214-1271-490b-bdfe-c0be6c23d02e`, compressed SHA-256 `a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528`. The final drift-free scan classified all 4,657 absent legal paper Oracle IDs and found 130 fully supported candidates. After this batch, 4,557 source IDs remain absent, including 30 supported candidates awaiting a verified batch. Catalog CSVs, guide, summary and landing counts were regenerated.

New families include complete private hand choices, Clash and Fateseal, printed random target timing, paid spell riders and alternative costs, linked exile permissions, top-library selection programs, native granted Equip/Crew activations and complete transform/Saga faces. Accepted cards retain every printed instruction; unsupported bodies remain rejected.

| Verification | Result |
| --- | --- |
| Installed execution | PASS: 100 cards and 200 human/local-AI role-card scenarios |
| Operation and keyword routes | PASS: 312 operation routes, 50 keyword routes, 5,653 nested checks |
| State invariants | PASS: 594 controlled games |
| Exact source/report/module/state provenance | PASS: 100 pinned source rows |
| Focused v25 mechanics | PASS: 354 tests |
| Syntax, source audit and strict certification | PASS; 26,292/26,292 definitions certified |
| Local browser import and gameplay | PASS: 16 checks; no browser errors or remote mutations |
| Full repository suite | Not run for this expansion |

The browser imported, saved and revalidated a 100-card guest deck, then resolved **Dino DNA** after an actual one-mana human payment. New-card AI behavior is covered by installed headless proof; browser AI used existing cards. Candidate verification exposed Ojer Kaslem's separate creature and land selections and missing Shredder's Technique Sneak coverage. Ojer now chooses at most one of each from the same locked cohort, excludes a card already selected, and enters both simultaneously. Its front face, six combat damage, death return, Temple mana and gated paid transformation are proved for both roles. Shredder's Technique has actual normal and Sneak payments, the unblocked attacker return cost, and the enchantment-only successful destruction life rider.

[Execution evidence](evidence/0223-execution.json), [provenance evidence](evidence/0223-provenance.json) and [validation summary](evidence/0223-validation.json) are retained. Browser artifacts are in `output/playwright/oracle-0223-local-api/`; logs are in `.local/oracle-v25/`. Controlled scenarios do not exhaust all card combinations. The comparison uses the pinned August snapshot. Unrelated local work was preserved. The 1,000-card request remains in progress.
