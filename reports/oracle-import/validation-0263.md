# Oracle expansions 0262–0263 — final 700 Commander cards

9 October 2026. Batches 0262 and 0263 import exactly 500 and 200 previously absent physical cards from the pinned Scryfall Oracle snapshot. Implementation groups v86–v92 contain 89, 101, 149, 123, 94, 94 and 50 cards respectively. Canonical import generation checks the pinned source hash, paper/Commander eligibility, unique Oracle IDs, complete compiler acceptance and the explicit selected cohort. Regeneration preserved the same 700 Oracle IDs and physical-card names.

The source snapshot is `2026-10-07T09:01:59.955+00:00`, compressed SHA-256 `53c35f3df74a48df1a15859c29f2559fb3761f6680f0954b0a19fad9342f489b`, bulk ID `27bf3214-1271-490b-bdfe-c0be6c23d02e`.

The catalog now has 27,116 generic Oracle cards across 263 batches. All 31,070 distinct Oracle IDs in the pinned paper/Commander universe are represented; **0 remain**. The runtime contains 31,115 definitions, of which 31,114 are eligible for deck import. These counts describe this pinned comparison universe and retain the catalog's existing legacy, alias and source-match exceptions.

The implementation adds the remaining double-faced, split, meld, Saga and Room cards; Attractions and sticker sheets; spells, creatures and legends with special rules; all remaining Sieges and planeswalkers. Native integrations include face-specific casting and transitions, alternative-zone permissions, actual mana-origin receipts, additional-cost reservation and payment, draft and outside-game configuration, counter replacement order, combat bands and assignment, Battle protectors and transformed casts, additional phase steps, planeswalker activation allowances and game restart. Auxiliary deck data, sticker state and Battle protectors are carried through the relevant deck, multiplayer and save-state paths.

New counter operations and native entry, loyalty and poison paths can select replacement order for each event. Older synchronous counter callers use stored affected-player source preferences or timestamp order, with preferences selected before resolution/priority when replacement providers change; they do not gain an asynchronous prompt at every synchronous counter call.

No additional test suites, gameplay simulations, browser tests or certification runs were performed, as requested by the user. Canonical import compilation, JavaScript syntax checks, static API review, catalog generation and Git whitespace checks do not establish gameplay execution coverage for these 700 cards. Existing certification and execution reports remain historical and do not cover these batches; internal catalog status markers do not add that evidence.

The generated inventory is available in [imported cards](../../docs/catalog/imported-cards.csv), [remaining cards](../../docs/catalog/remaining-cards.csv), and [summary](../../docs/catalog/summary.json).
