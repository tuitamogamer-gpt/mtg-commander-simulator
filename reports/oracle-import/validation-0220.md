# Oracle expansion 0220 — continuing the next 1,000 cards

1 October 2026. **200 of the requested 1,000 new cards are imported locally**, in complete batches **0219–0220**. **800 cards remain outstanding.** Batch 0220 contains 100 new cards, selected with compiler v22 from the unchanged pinned Scryfall snapshot. Runtime inventory after this batch is **25,992 definitions**, **25,991 eligible for deck import**, and **22,000 generic Oracle cards** across 220 batches. No commit, push or production deployment was requested or performed.

Batch 0220 runs from **Alhammarret, High Arbiter** through **Venom Connoisseur**. The source is `2026-08-30T09:01:56.964+00:00`, bulk ID `27bf3214-1271-490b-bdfe-c0be6c23d02e`, compressed SHA-256 `a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528`. The final drift-free scan classified all 4,957 previously absent Commander-legal paper Oracle IDs and found 122 complete supported cards; 100 were selected after execution proof. There are now 4,857 absent IDs, including 22 supported cards awaiting another verified batch.

New complete-rule families cover card-name choices and restrictions, attached permanent interactions, bounded repeated-resolution instructions, group restrictions and return programs, library partitions, expanded modal spells, and complete supported face/layout rules. Compilation requires every printed instruction and executable cost/keyword behavior. Unknown rules remain rejected.

| Verification | Result |
| --- | --- |
| Installed batch execution | PASS: 100 cards, 200 human/local-AI role-card scenarios |
| Operation and keyword routes | PASS: 354 operation routes, 12 keyword routes, 2,598 nested checks |
| Game state invariants | PASS: 697 controlled games |
| Exact source/report/module/state provenance | PASS: 100 selected source rows |
| Local browser deck import and gameplay | PASS: 16 checks |
| Full repository suite | Not run for this expansion |

The browser imported and persisted a real 100-card guest deck. **Surestrike Trident** resolved after a real two-mana human payment. Browser AI gameplay used existing cards; new-cohort AI behavior is covered by the installed headless proof. The completed browser run recorded no errors or remote mutations. An initial browser attempt caught a runtime-module startup-order problem; the corrected run passed. Generated catalog and global inventory checks will be updated with the following cohort; this checkpoint does not claim those pending checks passed.

[Execution evidence](evidence/0220-execution.json) and [provenance evidence](evidence/0220-provenance.json) are retained. Browser artifacts are in `output/playwright/oracle-0220-local-api/`; logs are in `.local/oracle-v22/`. Controlled scenarios do not exhaust all card interactions, and comparison uses the pinned August snapshot. Existing unrelated local edits were preserved. The requested 1,000-card import remains in progress.
