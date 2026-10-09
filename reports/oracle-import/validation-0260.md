# Oracle expansion 0260 — 100 additional Commander cards

9 October 2026. Batch 0260 imports exactly 100 previously absent physical cards from the pinned Scryfall Oracle snapshot, with 20 cards in each of the v75–v79 implementation groups. The explicit cohort is recorded in `batch-0260.json`; canonical import generation checks source eligibility, unique Oracle IDs and complete compiler acceptance.

The source snapshot is `2026-10-07T09:01:59.955+00:00`, compressed SHA-256 `53c35f3df74a48df1a15859c29f2559fb3761f6680f0954b0a19fad9342f489b`.

The catalog now has 26,216 generic Oracle cards across 260 batches. In the pinned paper/Commander universe of 31,070 distinct Oracle IDs, 30,170 are represented and 900 remain. The runtime inventory contains 30,215 definitions, of which 30,214 are eligible for deck import.

The implementation adds spell, creature, permanent and legendary creature rules, including native targeting, payments, exile permissions and source-incarnation tracking. Face-up mana-payment contexts now include the selected face-up kind so Qarsi Deceiver's mana restriction can distinguish morph and manifest from disguise. Saved games retain Yidaro's cycling count and completion of Tomb of Annihilation; older saves default these new fields to zero and false.

No additional test suites, gameplay simulations, browser tests or certification runs were performed, as requested by the user. Canonical import compilation, static code review and catalog generation are not execution proof for these 100 cards. Earlier certification and execution reports remain historical and do not cover this batch.

The generated catalog is available in [imported cards](../../docs/catalog/imported-cards.csv), [remaining cards](../../docs/catalog/remaining-cards.csv), and [summary](../../docs/catalog/summary.json).
