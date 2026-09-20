# Oracle batches 0201–0202

20 September 2026. These two batches add **200 new cards locally**, bringing the current requested expansion to **400 of 1,000 cards**. The remaining 600 are unfinished. No commit, push or deployment was requested or performed.

| Batch | Cards | First card | Last card | Compiler |
| --- | ---: | --- | --- | --- |
| 0201 | 100 | Abu Ja'far | Path to the Festival | v12 |
| 0202 | 100 | Alaborn Zealot | War-Trained Slasher | v13 |

The application, runtime modules, source reports and import state register all 202 batches. The resulting catalog has **24,149 definitions**, **24,148 deck-import-eligible definitions**, and **20,200 generic Oracle cards**. Brisela remains a meld result rather than a standalone import.

The source is the complete Scryfall Oracle snapshot `2026-08-30T09:01:56.964+00:00`, bulk ID `27bf3214-1271-490b-bdfe-c0be6c23d02e`, compressed SHA-256 `a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528`. Both batches were selected from the full source with prior names and Oracle IDs excluded. Earlier successful compiler interpretations remain frozen.

The implementation expands closed conditions, event history, simultaneous damage, source and target identity, relative statistics, targeting relationships, linked outcomes and spell composition. Cipher now encodes a resolving spell on a controlled creature, grants the combat-damage trigger, offers a copy with legal targets, and supports declining, source changes and copied spells. Targeted-spell triggers and defensive counterspell handling preserve their original source and controller.

| Verification | Result |
| --- | --- |
| Exact production cohort before installation, each batch | PASS: 100 cards, human and local AI |
| Installed execution, each batch | PASS: 100 cards, human and local AI |
| Batches 0201–0202 source/report/module/state provenance | PASS: 200 rows |
| Importer and v11–v13 focused regression | PASS: 264 tests |
| Counterspell, ward, phasing, casting and damage regression | PASS: 154 tests |
| Source audit | PASS: no duplicate scripts or simplified definitions |
| Strict certification | PASS: 24,149 definitions and 169 built-in decks |
| Generated catalog | PASS: 24,149 definitions; 6,680 missing legal paper Oracle IDs |
| Import, provenance and whole-catalog integrity regression | PASS: 13 tests, all 202 registered batches |
| Guest browser workflow for batches 0201–0202 | PASS: human and AI paid casts, Stack resolution, stable main phase, no console errors |
| Full repository suite | Not run for this cohort |

The previous-catalog matrix exercised 20,100 cards. It passed 20,099; Solstice Revelations exposed a missing signed-value case in the proof helper. That helper was corrected, and a focused rerun passed the card for both controllers. The original full run is retained as a failed run and is not described as a full pass.

Evidence is retained in `.local/oracle-v12/` and `.local/oracle-v13/`, including `production-proof1.json`, `installed-proof1.json`, `provenance1.log`, `regression1.log`, `engine-regression1.log`, `prior-catalog-proof1.json`, `solstice-fix1.json`, `audit1.log`, `certification1.log` and `catalog-export1.log`. These are controlled execution scenarios, not exhaustive proofs of every multiplayer interaction.
