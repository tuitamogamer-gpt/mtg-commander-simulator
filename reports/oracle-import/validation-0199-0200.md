# Oracle batches 0199–0200

20 September 2026. **200 new cards imported locally. The requested 1,000-card expansion is not complete: 800 remain.** No commit, push or deployment was performed.

Both 100-card modules are registered in `src/app.js`, with matching source reports and import-state entries. The runtime contains **23,949 definitions**, **23,948 deck-import-eligible definitions**, and **20,000 generic Oracle cards in 200 batches**. Existing definitions and earlier batch descriptors are preserved.

| Batch | Cards | First name | Last name |
| --- | ---: | --- | --- |
| 0199 | 100 | Afiya Grove | Mirran Mettle |
| 0200 | 100 | Mizzium Tank | Zurgo's Vanguard |

## Reproducible source

The plans used the complete 38,627-row Scryfall Oracle source, including 30,784 paper cards legal in Commander. Selection excludes previously imported Oracle IDs, reserved names and legacy definitions; all 200 selected Oracle IDs and names are distinct.

- Bulk ID: `27bf3214-1271-490b-bdfe-c0be6c23d02e`
- Snapshot: `2026-08-30T09:01:56.964+00:00`
- Compressed SHA-256: `a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528`
- Explicit compiler: **v11**. The CLI accepts `--compiler-version=11`; its historical default remains v10.

The first plan found exactly 200 supported remaining cards. After selecting its first 100, the second plan found the remaining 100. The files were written only after the exact source-bound cohort passed its human/local-AI execution matrix. Provenance was checked again after registration.

## Implemented rules

The additive compiler preserves complete v10 interpretations before applying its additional closed grammar. It supports additional permanent qualities, owned-or-controlled targets, outlaw groups, alternative keywords, exact color counts, condition-dependent outcomes, coordinated effects, graveyard choices, library placement and counterspell destinations.

Runtime additions cover mana retained through steps and phases with its spending restrictions, static and triggered emblems in the command zone, granted abilities and supported mana abilities, event-object characteristics captured at death, and mana-cost Splice. Splice announces and pays its combined costs and targets, reveals the chosen cards without moving them from hand, preserves the original spell's identity, resolves additions in the chosen order, and survives spell copying and AI simulation. Twenty printed Splice cards have dedicated execution routes.

Additional scenarios exercise entry keyword-counter choices, decayed Zombies, Changeling tokens, temporary base statistics and creature types, Equipment movement, simultaneous damage groups, and hand-to-library choices. They check both outcomes of conditions, source loss, zone identity, actual payments, ability removal, combat and cleanup. Qualified groups retain their original creature/controller restrictions while accepting their printed alternatives.

Unknown clauses remain rejected. Temporary Myriad grants are excluded because multiple instances still require additional runtime work. Nonmana Splice costs and grant-dependent mana planning also remain outside this compiler's accepted subset.

## Validation

| Gate | Result |
| --- | --- |
| JavaScript syntax and whitespace in task files | PASS |
| Importer and v10/v11 focused suites | PASS: 323 tests |
| Installed batch, provenance and catalog integrity suites | PASS: 13 tests |
| Composition scenarios after the final grammar restriction | PASS: 21 tests |
| Exact source-bound cohort before installation | PASS: 200/200 cards, 871 invariant-checked games |
| Installed cohort through actual runtime modules | PASS: 200/200 cards, 871 invariant-checked games |
| Existing catalog execution matrix | PASS: 19,800/19,800 cards, 72,883 invariant-checked games; all 14 tests pass |
| Previous batches 0189–0198 provenance | PASS: 1,000 rows |
| New batches 0199–0200 provenance | PASS: 200 rows; source/report/module/state parity |
| Source audit | PASS: no duplicate scripts or simplified definitions |
| Strict card certification | PASS: 23,949/23,949 definitions; 169 built-in decks |
| Generated catalog | PASS: 23,949 definitions; 6,880 missing Oracle IDs; no remaining v11-ready cards |
| Browser guest-import flow | PASS: paste/check/save/reload, pod setup, paid human and AI casts, settled Stack, no console/page errors |
| Full repository test suite | Not run for this cohort |

The execution matrices are controlled rules scenarios, not exhaustive proofs of every possible card interaction. An initial installed-cohort command used a name filter containing a batch ID and correctly refused an empty selection; the corrected run uses the explicit list of 200 names. The first browser launch could not find Playwright's bundled browser; the retry uses the workstation's installed Chrome.

Local evidence is retained under `.local/oracle-v11/`: `plans-0199-0200.json`, `production-proof1.json`, `installed-proof1.json`, `existing-catalog-proof5.json`, `regression7.log`, `compositions2.log`, `prior-provenance6.json`, `installed-provenance1.json`, `audit1.log`, `certify1.log`, `catalog-export1.log`, and `browser-import2.log`. Browser artifacts are written to `output/playwright/oracle-0199-0200/`. The earlier whitespace diagnostic concerned concurrent audio edits and is superseded by the clean final workspace check.
