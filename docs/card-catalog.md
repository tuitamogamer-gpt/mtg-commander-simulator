# Card catalog and remaining imports

This inventory is generated from the application runtime and the pinned Scryfall Oracle feed. It describes the repository's card catalog, not a promise that every Magic card or interaction is implemented.

## Download the complete lists

- [Imported/runtime cards](catalog/imported-cards.csv): every runtime definition, its source batch, engine marker, and whether arbitrary deck import permits it.
- [Remaining cards](catalog/remaining-cards.csv): every paper, Commander-legal Oracle ID in the pinned source that has no matched runtime definition, with its current compiler reason.
- [Machine-readable summary](catalog/summary.json): exact counts, snapshot metadata, hashes, exceptional names, and restricted legacy cards.

CSV files are UTF-8, sorted by card name without locale-specific collation, and use quoted fields. Counts are unique runtime names or unique Oracle IDs as indicated; they are not counts of printings, deck copies, or test cases.

## Current inventory

Last recorded import: **2026-09-05T16:33:38.988Z**.

| Measure | Count |
| --- | ---: |
| Runtime card definitions | 19,484 |
| Generic Oracle imports (178 batches of 100) | 17,800 |
| Dedicated/manual Oracle imports | 58 |
| Legacy definitions | 1,626 |
| Definitions allowed in arbitrary deck imports | 19,438 |
| Legacy definitions restricted from arbitrary deck imports | 46 |
| Paper, Commander-legal source Oracle IDs | 30,784 |
| Source Oracle IDs represented by a runtime name or face alias | 19,463 |
| Source Oracle IDs still absent from the runtime | 11,321 |
| Of those: parser-eligible but not imported | 2 |
| Of those: deferred by the current semantic compiler | 11,319 |

**Availability is explicit.** A row with `deck_import_eligible=false` exists internally but is blocked for arbitrary deck imports: the legacy catalog includes cards from inactive built-in decks. The importer also validates the whole deck. Presence in this CSV alone does not make any proposed deck legal or launch-ready.

**Certification has a defined limit.** `certified` and `certified-legacy` are internal catalog markers. Strict certification, source provenance, controlled human/local-AI execution, regression tests, and browser checks provide different evidence; none proves every multiplayer permutation. A parser match never grants support by itself.

## What “remaining” means

The comparison universe is exactly `games.includes('paper') && legalities.commander === 'legal'` in the pinned feed, deduplicated by Oracle ID. It excludes later releases, later Oracle or legality changes, rows not marked for paper, tokens, and other source objects that fail that filter. The feed has 38,627 source rows and 36,495 rows marked for paper.

Imported Oracle batches match by their recorded Oracle ID. Legacy definitions match first by an exact source name, then by a face name within the comparison universe. Face matching is an inventory association, not proof that every side or transition is fully implemented. Multiple runtime names can refer to one Oracle ID, so runtime totals and source totals differ. The summary lists 2 such groups, 17 runtime names without a pinned-source match, and 2 matched runtime names outside the comparison universe. Those exceptions remain visible in the imported CSV and are not silently counted as missing source cards.

Current parser-eligible, unimported names: `Zuo Ci, the Mocking Sage`, `Zurgo's Vanguard`. These still need an import record and executable proof. The importer defaults to complete 100-card batches; a smaller queue is not a reason to relax its safeguards.

| Current remaining reason | Cards |
| --- | ---: |
| `oracle-needs-explicit-semantics` | 5,045 |
| `spell-needs-explicit-semantics` | 2,630 |
| `noncreature-needs-explicit-semantics` | 2,500 |
| `double-faced-card-needs-complete-front-semantics` | 253 |
| `land-needs-explicit-semantics` | 165 |
| `complex-layout` | 137 |
| `saga-chapter-needs-complete-semantics` | 126 |
| `double-faced-card-needs-face-transition-semantics` | 84 |
| `unsupported-mana-cost` | 49 |
| `adventure-needs-complete-face-semantics` | 44 |
| `dynamic-power-toughness` | 39 |
| `split-needs-complete-face-semantics` | 38 |
| `unbound-event-reference` | 33 |
| `double-faced-card-needs-complete-back-semantics` | 28 |
| `unsupported-split-faces` | 27 |
| `unbound-target-damage-source` | 25 |
| `unbound-event-amount` | 17 |
| `unsupported-adventure-face-types` | 17 |
| `mana-ability-needs-explicit-semantics` | 16 |
| `overload-body-needs-complete-semantics` | 11 |
| `transform-land-face-transition-needs-proof` | 8 |
| `unbound-target-X` | 8 |
| `unbound-sacrificed-stat` | 3 |
| `backup-grant-needs-semantics` | 2 |
| `backup-other-rules-unsupported` | 2 |
| `leveler-band-needs-complete-semantics` | 2 |
| `requires-import-and-executable-proof` | 2 |
| `saga-other-rules-unsupported` | 2 |
| `unbound-X` | 2 |
| `conflicting-hand-abilities` | 1 |
| `event-stat-condition-needs-binding` | 1 |
| `library-selected-reference-needs-binding` | 1 |
| `reminder-only-oracle` | 1 |
| `unsupported-backup-suffix` | 1 |
| `unsupported-loyalty-value` | 1 |

These are compiler queue reasons, not a claim that each card is impossible to implement. The complete per-card list is in [remaining-cards.csv](catalog/remaining-cards.csv).

## Source and regeneration

- Provider: Scryfall `oracle_cards` bulk feed.
- Bulk ID: `27bf3214-1271-490b-bdfe-c0be6c23d02e`.
- Pinned update: **2026-08-30T09:01:56.964+00:00**.
- Compressed source SHA-256: `a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528`.
- Current semantic compiler: **v8**.

The original compressed snapshot is intentionally not committed. Use the same archived `.jsonl.gz` file and hash. A current download from [Scryfall bulk data](https://scryfall.com/docs/api/bulk-data) may have different contents; it cannot reproduce this historical inventory. The exporter fails on a missing source, mismatched SHA-256, duplicate/ambiguous identity, or catalog/state mismatch, and makes no network requests.

```sh
node scripts/export-card-catalog.mjs \
  --source-file=/absolute/path/to/oracle-pinned.jsonl.gz \
  --source-sha256=a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528

# Recompute and fail if any committed catalog artifact is stale:
node scripts/export-card-catalog.mjs \
  --source-file=/absolute/path/to/oracle-pinned.jsonl.gz \
  --source-sha256=a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528 \
  --check
```

The exporter writes this document and `docs/catalog/*.csv` / `summary.json`; `--check` writes nothing. It fingerprints the runtime, compiler scripts, and import manifests, and records CSV hashes. It never writes engine data or imports a card. Regenerate after card imports or changes to the classifier; validate source provenance and execute the relevant gameplay tests before release.

The first classification pass can take several minutes. Successful exports keep a local cache under ignored `output/card-catalog/`, keyed to the exact source SHA-256 and compiler-file hashes. Each run still validates the compressed source and rebuilds the runtime inventory. Unchanged whole-card classifications may reuse that cache; `--fresh` forces every remaining card through the compiler again. Cache checksums detect accidental corruption, and the cache is not committed or needed to regenerate from scratch.

The generic import implementation is [import-oracle-batch.mjs](../scripts/import-oracle-batch.mjs), its state is [state.json](../reports/oracle-import/state.json), and the runtime eligibility rules are in [oracle-catalog.js](../src/modules/oracle-catalog.js). Historical reports elsewhere in the repository describe their dated cohorts; this generated inventory is the current catalog index.
