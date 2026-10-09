# Oracle expansions 0264–0266 — 1,021 overlooked paper cards

9 October 2026. Batches 0264, 0265 and 0266 import exactly 500, 500 and 21 previously absent paper, Commander-legal Oracle identities. The batch payloads and reports contain the same 1,021 reviewed Oracle ID/name pairs, with no duplicate identities or names. Earlier batch payloads and reports through 0263 remain unchanged.

The previous paper filter used `games` on the representative `oracle_cards` printing. That printing can be digital even when the same Oracle identity has paper editions. Paper availability now aggregates all paper printings in a separately pinned `default_cards` source, including face Oracle IDs for reversible printings without a top-level Oracle ID. Commander legality still comes from the pinned Oracle row. Import, classification and catalog export share this eligibility rule. Once the import state records a companion source, omitting it fails rather than silently reverting to the old filter.

## Pinned sources

| Source | Bulk ID | Updated at | Compressed SHA-256 |
| --- | --- | --- | --- |
| `oracle_cards` | `27bf3214-1271-490b-bdfe-c0be6c23d02e` | `2026-10-09T09:01:54.966+00:00` | `0ca0d50138e5cf10e8d713e1169ebf2ffc928caaaae71292e0e62a793d1348be` |
| `default_cards` | `e2ef41e3-5778-4bc2-af3f-78eca4dd9c23` | `2026-10-09T09:05:44.334+00:00` | `d8e1f9730bd76d593a58100d3dbb3645a0d9182420c4835584c83ee89ef51227` |

The Oracle source contains 38,708 rows. The printing source contains 118,602 rows, including 109,466 paper printings representing 37,854 distinct paper Oracle IDs. Intersecting paper availability with Commander legality produces 32,115 eligible Oracle IDs. The source audit found no new Oracle IDs compared with the 7 October snapshot; this queue consists of paper identities previously excluded by the printing-level filter. Of 1,045 additionally eligible identities, 24 already had runtime representations and 1,021 required import.

## Implementation and inventory

Of the 1,021 cards, 740 already compiled with v92 and 281 required new closed source-specific rules: v93 adds 43 creatures, v94 adds 46 creatures, v95 adds 39 legendary creatures or lands, v96 adds 91 artifacts or enchantments, and v97 adds 62 spells. Batch 0264 uses the preserved v92 descriptors; batches 0265 and 0266 use v97. The new modules include native entry replacements, control and Aura restrictions, simultaneous control exchanges, dynamic mana receipts, casting permissions, delayed triggers and effects for the reviewed printed clauses.

The regenerated catalog contains 28,137 generic Oracle cards in 266 batches and 32,136 runtime definitions. Of those runtime definitions, 32,135 are permitted in arbitrary deck imports. All 32,115 eligible source Oracle IDs are represented; **0 remain**. The catalog retains its visible alias, unmatched native-definition and restricted legacy-definition exceptions.

## Validation performed

Canonical import generation checked both source hashes, paper/Commander eligibility, unique identities, compiler acceptance and the selected cohorts. Static source/data inventory checked exact manifest/runtime payload equality, unchanged earlier batches, app wiring and source provenance; its recorded results are in [the source audit](evidence/0264-0266-source-audit.json). Native definition compilation, JavaScript syntax checks, catalog generation and Git whitespace checks were performed. The lightweight landing inventory was synchronized to 32,135 importable definitions.

No additional test suites, gameplay simulations, browser tests or certification runs were performed, as requested by the user. Compilation and inventory checks do not establish gameplay execution coverage for these 1,021 cards. Existing certification reports remain historical; internal catalog status markers do not add new execution evidence.

The generated inventory is available in [imported cards](../../docs/catalog/imported-cards.csv), [remaining cards](../../docs/catalog/remaining-cards.csv), and [summary](../../docs/catalog/summary.json).
