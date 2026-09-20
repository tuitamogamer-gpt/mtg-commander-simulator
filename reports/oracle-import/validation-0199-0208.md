# Oracle expansion 0199–0208

21 September 2026. **All 1,000 requested new cards are imported locally**, in ten complete batches. The application now registers **24,749 card definitions**, **24,748 eligible for deck import**, including **20,800 generic Oracle cards** in 208 batches. No commit, push or deployment was requested or performed.

| Batches | Compiler | New cards | Detailed report |
| --- | --- | --- | --- |
| 0199–0200 | v11 | 200 | [Validation](validation-0199-0200.md) |
| 0201–0202 | v12–v13 | 200 | [Validation](validation-0201-0202.md) |
| 0203 | v14 | 100 | [Validation](validation-0203.md) |
| 0204 | v15 | 100 | [Validation](validation-0204.md) |
| 0205 | v16 | 100 | [Validation](validation-0205.md) |
| 0206 | v17 | 100 | [Validation](validation-0206.md) |
| 0207 | v18 | 100 | [Validation](validation-0207.md) |
| 0208 | v19 | 100 | [Validation](validation-0208.md) |

The pinned Scryfall snapshot is `2026-08-30T09:01:56.964+00:00`, bulk ID `27bf3214-1271-490b-bdfe-c0be6c23d02e`, compressed SHA-256 `a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528`. The complete source contains 38,627 rows and 30,784 Commander-legal paper Oracle IDs. Existing names and Oracle IDs are excluded from selection. Earlier successful compiler descriptors remain frozen.

| Final verification | Result |
| --- | --- |
| Installed execution matrix, batches 0199–0208 | PASS: all 1,000 cards, human and local AI |
| State invariants during that matrix | PASS: 3,775 game scenarios |
| Source/report/module/state provenance | PASS: all 1,000 source rows, ten batches |
| Final cohort boundaries and general rules | PASS: 76 tests |
| Engine regression | PASS: 319 tests |
| Importer and earlier composition regression | PASS: 235 tests |
| Catalog integrity | PASS: 2 tests |
| Syntax and source audit | PASS; no duplicate script registrations or simplified definitions |
| Strict certification | PASS: 24,749 definitions and 169 built-in decks |
| Final cohort browser workflow | PASS: 16 checks |
| Generated card inventory | PASS: 6,080 missing legal paper Oracle IDs |
| Full repository suite | Not run for this expansion |

The browser gate uses the local application and API server. It verifies guest paste/check import, persistence, deck review, ordinary paid human and hard-AI casts, Stack resolution, and no console errors or horizontal overflow. The settled board contains newly imported Quinjet Technician and Grafdigger's Cage.

Complete machine-readable [execution evidence](evidence/0199-0208-execution.json) and [provenance evidence](evidence/0199-0208-provenance.json) are retained with the reports. Additional logs are in `.local/oracle-v19/`: `installed-expansion-proof2.log`, `boundaries5.log`, `regression1.log`, `importer-regression1.log`, `integrity1.log`, `check3.log`, `audit3.log`, `certification1.log`, `browser1.log`, and `catalog-export1.log`. Browser artifacts are in `output/playwright/oracle-0208-local-api/`.

The remaining inventory includes eight parser-eligible cards awaiting a separate import; the other 6,072 still require more rules support. These are outside the completed 1,000-card request. Controlled scenarios and certification checks are not an exhaustive proof of every possible card interaction. Historical queue statistics were not replayed by the final provenance verifier.
