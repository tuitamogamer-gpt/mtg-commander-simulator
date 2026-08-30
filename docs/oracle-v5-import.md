# Oracle compiler v5: batches 0047–0066

This release imports 2,000 more distinct paper, Commander-legal Oracle identities. The catalog now contains 6,600 generic batch cards, 58 manually implemented Sauron additions and 1,626 legacy definitions (8,284 total). Existing legacy exclusions still apply when importing arbitrary decks.

The source is the pinned Scryfall Oracle snapshot from 2026-08-30T09:01:56.964+00:00. Its compressed SHA-256 is `a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528`. Batch manifests retain each complete source row, Oracle identity, printing identity, legality and compiled operation. No placeholder or partial Oracle script counts as supported.

Compiler v5 first tries the previous v4 grammar and preserves successful v4 descriptors. The additional closed grammar covers conditional triggers/statics, characteristic power/toughness, typed search and library choices, optional payments, selected graveyard abilities, additional combat/target restrictions and explicit effect sequences. Unknown clauses remain deferred. Historical manifests are recompiled using their recorded compiler version.

New runtime paths include Unearth, Embalm, Eternalize, Ninjutsu, Foretell, Retrace, Soulshift, Modular, Fabricate, Living weapon, For Mirrodin!, Offspring, Afflict and Ingest. Existing central engine implementations are reused where available. The engine rechecks activation timing before payment, keeps exact object identities across zone changes, and distinguishes event-creature statistics from the source's statistics. The local AI still uses no external model or network service.

## Verification

- `npm run check`, `npm run audit`, `npm run certify:strict` and the full test suite.
- `tests/oracle-bulk-interactions.test.mjs` executes every declared operation and keyword for human and local-AI controllers. Both controller routes, target selections, Stack resolution and resulting effects are checked. Some isolated operation fixtures place sources directly on the battlefield; these counts are not a claim that every route is a natural full game or a paid cast.
- The original deep controller/keyword matrices remain frozen to their original 4,600-card cohort. The bulk matrix and interaction-contract matrix include all 6,600 generic cards. Separate v5 regressions check timing, optional choices, conditions, stale identities and last-known information.
- All 37 new legendary creature commanders exercise initial command casting, owner return choice and taxed recasting under both controllers: 148 paid casts.
- Pinned-source provenance is checked independently for new batches 0047–0066 and previous batches 0027–0046.

These checks exercise the declared supported paths. They do not prove every possible multiplayer combination of Magic cards.

## Test deck

[`tests/fixtures/oracle-v5-maja-deck.txt`](../tests/fixtures/oracle-v5-maja-deck.txt) contains **Maja — Oracle 6600 Test**, a green-white Commander deck with 100 cards, 37 lands and 69 unique names. It uses 23 cards from the new cohort. [`reports/oracle-v5-test-deck.json`](../reports/oracle-v5-test-deck.json) records its identities, color identity and pinned Commander legality.

The exact text is tested through import, persistent Library reload and two full four-player local-AI games (seeds 660047 and 660066). The visible human browser flow also plays lands, pays for Elvish Visionary and resolves its draw trigger against three bots.

Moxfield publication and a test using a real newly created Moxfield link remain pending user sign-in. The exported text and local import test are not a substitute for that external-link test. No Moxfield URL has been invented.

Rules reference: [official Comprehensive Rules](https://magic.wizards.com/en/rules), especially the before-attackers restriction in CR 506.7, last-known information and the individual keyword rules.
