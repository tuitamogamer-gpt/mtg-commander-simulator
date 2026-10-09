# Card catalog and remaining imports

This inventory is generated from the application runtime and the pinned Scryfall Oracle feed with its pinned paper-printing availability source. It describes the repository's card catalog, not a promise that every Magic card or interaction is implemented.

## Download the complete lists

- [Imported/runtime cards](catalog/imported-cards.csv): every runtime definition, its source batch, engine marker, and whether arbitrary deck import permits it.
- [Remaining cards](catalog/remaining-cards.csv): every paper, Commander-legal Oracle ID in the pinned source that has no matched runtime definition, with its current compiler reason.
- [Machine-readable summary](catalog/summary.json): exact counts, snapshot metadata, hashes, exceptional names, and restricted legacy cards.

CSV files are UTF-8, sorted by card name without locale-specific collation, and use quoted fields. Counts are unique runtime names or unique Oracle IDs as indicated; they are not counts of printings, deck copies, or test cases.

## Current inventory

Generic Oracle import state: **2026-10-09T17:26:14.708Z**. The counts below include all current runtime definitions, including subsequent native precon imports.

| Measure | Count |
| --- | ---: |
| Runtime card definitions | 32,136 |
| Generic Oracle imports (266 batches; 1 × 21, 259 × 100, 2 × 200, 1 × 316, 3 × 500 cards) | 28,137 |
| Dedicated/manual Oracle imports | 65 |
| Legacy definitions | 3,934 |
| Of those: individually reviewed for deck import | 18 |
| Definitions allowed in arbitrary deck imports | 32,135 |
| Legacy definitions restricted from arbitrary deck imports | 1 |
| Paper, Commander-legal source Oracle IDs | 32,115 |
| Source Oracle IDs represented by a runtime name or face alias | 32,115 |
| Source Oracle IDs still absent from the runtime | 0 |
| Of those: parser-eligible but not imported | 0 |
| Of those: deferred by the current semantic compiler | 0 |

**Availability is explicit.** Native definitions qualify through an active built-in deck or a recorded individual review; Oracle imports qualify through their certified batch. The `native_import_review` column identifies individually reviewed native cards. The [18-card native review](../reports/cards/restricted-legacy-2026-09-10/README.md) covers the formerly restricted cards. The importer also validates deck size, commanders, singleton and color identity. A row with `deck_import_eligible=false` remains blocked.

**Certification has a defined limit.** `certified` and `certified-legacy` are internal catalog markers. Strict certification, source provenance, controlled human/local-AI execution, regression tests, and browser checks provide different evidence; none proves every multiplayer permutation. A parser match never grants support by itself.

## What “remaining” means

An Oracle ID qualifies when at least one printing in the pinned `default_cards` feed has `games.includes('paper')` and its pinned `oracle_cards` row has `legalities.commander === 'legal'`. Printing-level games on the representative Oracle row do not determine paper availability. Reversible printings without a top-level Oracle ID contribute their face Oracle IDs. The universe is deduplicated by Oracle ID. It excludes later releases, later Oracle or legality changes, identities without paper printings, tokens, and other source objects that fail the explicit filter. The Oracle feed has 38,708 source rows and 37,854 rows with paper availability. The CSV `source_games` column records the representative Oracle printing; `source_has_paper_printing` records the availability used for this comparison.

Recorded Oracle IDs take precedence when present. An Oracle batch identity missing from its pinned source is an error. Native definitions absent from the snapshot are explicitly marked as unmatched; their CSV Oracle ID contains any recorded runtime ID and otherwise remains empty. Legacy definitions without IDs match first by an exact source name, then by a face name within the comparison universe. Face matching is an inventory association, not proof that every side or transition is fully implemented. Multiple runtime names can refer to one Oracle ID, so runtime totals and source totals differ. The summary lists 2 such groups, 17 runtime names without a pinned-source match, and 2 matched runtime names outside the comparison universe. Those exceptions remain visible in the imported CSV and are not silently counted as missing source cards.

Current parser-eligible, unimported names: none. These still need an import record and executable proof. The importer defaults to complete 100-card batches; a smaller queue is not a reason to relax its safeguards.

| Current remaining reason | Cards |
| --- | ---: |
| None — pinned import queue completed | 0 |

These are compiler queue reasons, not a claim that each card is impossible to implement. The complete per-card list is in [remaining-cards.csv](catalog/remaining-cards.csv).

## Source and regeneration

- Provider: Scryfall `oracle_cards` bulk feed.
- Bulk ID: `27bf3214-1271-490b-bdfe-c0be6c23d02e`.
- Pinned update: **2026-10-09T09:01:54.966+00:00**.
- Compressed source SHA-256: `0ca0d50138e5cf10e8d713e1169ebf2ffc928caaaae71292e0e62a793d1348be`.

- Paper availability: Scryfall `default_cards` bulk feed, Oracle IDs aggregated from all paper printings.
- Paper bulk ID: `e2ef41e3-5778-4bc2-af3f-78eca4dd9c23`.
- Paper update: **2026-10-09T09:05:44.334+00:00**.
- Compressed paper source SHA-256: `d8e1f9730bd76d593a58100d3dbb3645a0d9182420c4835584c83ee89ef51227`.
- Paper printing rows: **109,466**; distinct paper Oracle IDs: **37,854**.

- Current semantic compiler: **v97**.

The original compressed snapshots are intentionally not committed. Use the same archived `.jsonl.gz` files and hashes. A current download from [Scryfall bulk data](https://scryfall.com/docs/api/bulk-data) may have different contents; it cannot reproduce this historical inventory. The exporter fails on a missing required source, mismatched SHA-256, duplicate/ambiguous identity, or catalog/state mismatch, and makes no network requests. Paper bulk ID, timestamp, and SHA-256 default to `state.source.paperAvailability`; a state recording that companion source cannot fall back to the representative printing's games field.

```sh
node scripts/export-card-catalog.mjs \
  --source-file=/absolute/path/to/oracle-pinned.jsonl.gz \
  --source-sha256=0ca0d50138e5cf10e8d713e1169ebf2ffc928caaaae71292e0e62a793d1348be \
  --paper-source-file=/absolute/path/to/default-cards-pinned.jsonl.gz \
  --paper-source-sha256=d8e1f9730bd76d593a58100d3dbb3645a0d9182420c4835584c83ee89ef51227

# Recompute and fail if any committed catalog artifact is stale:
node scripts/export-card-catalog.mjs \
  --source-file=/absolute/path/to/oracle-pinned.jsonl.gz \
  --source-sha256=0ca0d50138e5cf10e8d713e1169ebf2ffc928caaaae71292e0e62a793d1348be \
  --paper-source-file=/absolute/path/to/default-cards-pinned.jsonl.gz \
  --paper-source-sha256=d8e1f9730bd76d593a58100d3dbb3645a0d9182420c4835584c83ee89ef51227 \
  --check
```

The exporter writes this document and `docs/catalog/*.csv` / `summary.json`; `--check` writes nothing. It fingerprints the runtime, compiler scripts, and import manifests, and records CSV hashes. It never writes engine data or imports a card. Regenerate after card imports or changes to the classifier; validate source provenance and execute the relevant gameplay tests before release.

The first classification pass can take several minutes. Successful exports keep a local cache under ignored `output/card-catalog/`, keyed to the exact source SHA-256 and compiler-file hashes. Exact source rows can also reuse versioned compiler results under `output/oracle-classifier/`, including unchanged predecessor descriptors. Each run still validates the compressed source and rebuilds the runtime inventory. `--fresh` bypasses both caches and forces every remaining card through the compiler again; `--check` does not write either cache. Cache checksums detect accidental corruption, and the caches are not committed or needed to regenerate from scratch.

The generic import implementation is [import-oracle-batch.mjs](../scripts/import-oracle-batch.mjs), its state is [state.json](../reports/oracle-import/state.json), and the runtime eligibility rules are in [oracle-catalog.js](../src/modules/oracle-catalog.js). Historical reports elsewhere in the repository describe their dated cohorts; this generated inventory is the current catalog index.
