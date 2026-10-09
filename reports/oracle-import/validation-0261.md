# Oracle expansion 0261 — 200 additional Commander cards

9 October 2026. Batch 0261 imports exactly 200 previously absent physical cards from the pinned Scryfall Oracle snapshot. The v80–v85 implementation groups contain 33, 34, 33, 32, 34 and 33 cards respectively, plus Cephalid Snitch using an existing native descriptor. The explicit cohort is recorded in `batch-0261.json`; canonical import generation checks source eligibility, unique Oracle IDs and complete compiler acceptance.

The source snapshot is `2026-10-07T09:01:59.955+00:00`, compressed SHA-256 `53c35f3df74a48df1a15859c29f2559fb3761f6680f0954b0a19fad9342f489b`.

The catalog now has 26,416 generic Oracle cards across 261 batches. In the pinned paper/Commander universe of 31,070 distinct Oracle IDs, 30,370 are represented and 700 remain. The runtime inventory contains 30,415 definitions, of which 30,414 are eligible for deck import.

The implementation adds spell, creature, permanent and legendary creature rules. Shared native integrations include ending a turn through the existing cleanup process, additional combat phase identity, foretelling on opponents' turns, automatic regeneration, power-based tapping costs, Cave mana provenance, actual colored mana paid for a restricted X cost, combat declaration payments, and granted graveyard sneak permission. Whole-card compiler extensions require exact pinned source text, mana cost, type and layout; earlier compiler descriptors remain unchanged.

No additional test suites, gameplay simulations, browser tests or certification runs were performed, as requested by the user. Canonical import compilation, static code review and catalog generation are not execution proof for these 200 cards. Earlier certification and execution reports remain historical and do not cover this batch.

The generated catalog is available in [imported cards](../../docs/catalog/imported-cards.csv), [remaining cards](../../docs/catalog/remaining-cards.csv), and [summary](../../docs/catalog/summary.json).
