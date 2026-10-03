# Oracle expansion 0226 — the next 1,000 cards

3 October 2026. **800 of the requested 1,000 cards are imported locally**, in complete batches **0219–0226**. **200 remain outstanding.** Batch 0226 adds 100 complete cards, from **Aether Burst** through **Yorvo, Lord of Garenbrig**, using compiler v28. Inventory is **26,592 definitions**, **26,591 eligible for deck import**, **22,600 generic Oracle cards** in 226 batches and 175 built-in decks. No commit, push or deployment was requested or performed.

The unchanged source snapshot is `2026-08-30T09:01:56.964+00:00`, bulk ID `27bf3214-1271-490b-bdfe-c0be6c23d02e`, compressed SHA-256 `a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528`. The drift-free scan classified all 4,357 absent legal paper Oracle IDs and found 108 fully supported candidates. After this batch, 4,257 source IDs remain absent, including 8 supported candidates awaiting a verified batch. Catalog CSVs, guide, summary and landing counts were regenerated.

New complete rules cover chosen land and creature types in all printed zones, actual additional life and donor costs, captured tapping/revealing and spell-resolution cohorts, divided damage/prevention, variable target quotas and ordered exile replacements. Accepted cards retain every printed instruction; unsupported bodies remain rejected.

| Verification | Result |
| --- | --- |
| Installed execution | PASS: 100 cards and 200 human/local-AI role-card scenarios |
| Operation and keyword routes | PASS: 338 operation routes, 26 keyword routes, 4,340 nested checks |
| State invariants | PASS: 610 controlled games |
| Exact source/report/module/state provenance | PASS: 100 pinned source rows |
| Focused v28 mechanics | PASS: 351 tests |
| Syntax, source audit and strict certification | PASS; 26,592/26,592 definitions certified |
| Local browser import and gameplay | PASS: 16 checks; no browser errors or remote mutations |
| Full repository suite | Not run for this expansion |

The browser imported, saved and revalidated a 100-card guest deck, then resolved **Tangle Tumbler** after an actual 3-mana human payment. New-card AI behavior is covered by installed headless proof; browser AI used existing cards. Chosen type values survive actual JSON checkpoints; 168 existing land, name and casting regressions pass with the new runtime loaded. Kaervek mana sacrifices and Monstrous failed-mana/deferred-reveal/copy paths have native paid proofs. Betrothed of Fire proves both sacrifice costs and both printed pump groups for human and local AI.

[Execution evidence](evidence/0226-execution.json), [provenance evidence](evidence/0226-provenance.json) and [validation summary](evidence/0226-validation.json) are retained. Browser artifacts are in `output/playwright/oracle-0226-local-api/`; logs are in `.local/oracle-v28/`. Controlled scenarios do not exhaust all card combinations. The comparison uses the pinned August snapshot. Unrelated local work was preserved.
