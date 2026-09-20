# Oracle batch 0207

20–21 September 2026. Batch 0207 adds **100 cards locally**, the ninth batch of the requested 1,000-card expansion. The complete selection runs from Acceptable Losses to Zombie Musher and uses compiler v18. At this checkpoint, the application registered **24,649 definitions**, **24,648 deck-import-eligible definitions**, and **20,700 generic Oracle cards** in 207 batches.

The pinned Scryfall source is `2026-08-30T09:01:56.964+00:00`, bulk ID `27bf3214-1271-490b-bdfe-c0be6c23d02e`, compressed SHA-256 `a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528`. Selection inspected all 38,627 rows and excluded existing names and Oracle IDs. Earlier successful compiler descriptors remain frozen.

| Verification | Result |
| --- | --- |
| Exact production cohort before installation | PASS: 100 cards, human and local AI |
| Installed cohort execution | PASS: 100 cards, human and local AI |
| Source/report/module/state provenance | PASS: 100 source rows |
| New boundary tests | PASS: 49 tests |
| Focused regression | PASS: 335 tests |
| Catalog integrity | PASS: 2 tests |
| Syntax and source audit | PASS |
| Strict certification | PASS: 24,649 definitions and 169 built-in decks |
| Generated inventory | PASS: 6,180 missing legal paper Oracle IDs |
| Local browser workflow | PASS: 16 checks |
| Full repository suite | Not run for this cohort |

Coverage includes mixed Stack/permanent targets, Stack color changes, counter prohibitions, retained restricted mana, activated-cost increases, draw limits, loyalty restrictions, random discard costs, life exchanges, Exhaust, and keyword prohibitions. The browser gate verifies real guest deck import, persistence, paid human and hard-AI casts, Stack resolution, and absence of console errors. Its target selection follows the active overlay when the combat interface also exposes background controls.

The source loader also resolves the command table's named combat-module import for headless validation. The first integrity and certification attempts exposed that loader incompatibility; their corrected reruns passed. Earlier incomplete or failed browser/export attempts are not counted as passing evidence.

Evidence: `.local/oracle-v18/production-proof1.json`, `installed-proof1.json`, `provenance1.json`, `boundaries2.log`, `regression1.log`, `integrity2.log`, `check1.log`, `audit1.log`, `certification2.log`, `catalog-export3.log`, and `browser4.log`. Browser artifacts: `output/playwright/oracle-0207-local-api/`. No commit, push or deployment was requested or performed.
