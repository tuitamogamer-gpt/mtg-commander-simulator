# Star Trek Commander — 29 October 2026 intake

The four published Star Trek Commander lists are selectable and importable in the simulator, with **400 physical cards and 302 distinct identities**. They reuse **165 existing definitions** and add **137 native implementations**. The product releases on **13 November 2026**; the new identities are preview cards, and their pinned Scryfall Commander legality remains `not_legal`.

| Precon | Default commander | New identities in deck | Assigned once to this deck | Export |
| --- | --- | ---: | ---: | --- |
| We Are the Borg | The Borg Queen | 37 | 37 | [100 cards](we-are-the-borg.txt) |
| Federation Fleet | Jean-Luc Picard, Luminary | 34 | 33 | [100 cards](federation-fleet.txt) |
| Landing Party | Commander Spock | 38 | 36 | [100 cards](landing-party.txt) |
| Klingon Fury | Worf, Defiant Commander | 34 | 31 | [100 cards](klingon-fury.txt) |

## Published sources

[Wizards' complete decklist article](https://magic.wizards.com/en/news/announcements/star-trek-commander-decklists) is pinned in [official-decklists.html](official-decklists.html). [decklists.json](decklists.json) records exact card names, quantities, commanders, source addresses and content digests. Exported lists are compared directly with the official HTML, including every basic land. No replacements or invented cards are used.

MTGJSON's deck index had no TRC entries on 29 October, and the four direct product-file addresses returned HTTP 404. Accordingly these are **official-source decklists**, not independently corroborated MTGJSON lists. The importer will compare exact names and quantities if those files become available on a future source refresh.

[oracle.json](oracle.json) independently pins Scryfall's complete Oracle text, identity, printing, layout, color identity, legality, release date and image metadata for all **302 names**, with **zero missing records**. The 137 new identities comprise 126 TRC cards and 11 TRK cards, all releasing on 13 November. The other 165 identities are already Commander legal; their returned printing dates do not change that legality or replace existing runtime records.

[mechanics.json](mechanics.json) preserves relevant text from the [official mechanics article](https://magic.wizards.com/en/news/feature/star-trek-mechanics), covering assimilation, station, battlefront and seek out. [creature-types.json](creature-types.json) pins the complete fresh Scryfall creature-type catalog used to review the new species.

## Preservation and registration

[intake.json](intake.json) records the initial **32,136 runtime definitions, 3,934 native raw records and 176 precons**, with raw-card and deck digests. Assignments are disjoint in Borg → Federation → Landing → Klingon order; a shared new card is implemented only by its first owner. The four `assignments-*.json` files retain the exact Oracle text given to each implementation owner.

The importer requires every new identity to have a native implementation before writing. It checks 100-card totals, printed commanders, exact source names and quantities, singleton rules, color identities and preview metadata. Existing raw definitions and all 176 existing deck records must retain their original digests. Repeated registration must preserve the exact data bytes.

Preview cards remain usable in the simulator through the existing built-in deck certification mechanism. Their `not_legal` metadata is preserved and ordinary deck import produces legality warnings. Simulator support is not a claim of current tournament legality.

## Presentation

Each deck has its own guide, commander spotlight and AI profile: Borg assimilation and artifacts, Federation second draws and charged Spacecraft, Spock's differently named lands, and Klingon attacks across several opponents. [images.json](images.json) records **158 new WebP files converted from original Scryfall artwork, including four commander art crops**. All 302 source identities have local card images, and existing image mappings and assets are preserved.

## Verification

[source-validation.json](source-validation.json) confirms **180 selectable precons, 32,273 runtime definitions and 32,272 import-eligible definitions**. All 137 new raw definitions match the pinned Oracle fields and identities. Every original raw card and precon is preserved, and repeating registration preserves the exact data-file digest.

[qa.json](qa.json) records the completed checks:

- **145 native-card and import tests pass**, covering all four new card cohorts, source integrity, payment and target restrictions, object lifetimes, station, assimilation and preview import warnings.
- **256 distinct focused regression tests pass** across existing precons, card audits, local artwork, commander visuals, AI station decisions and creature-type selection. Two stale inventory assertions in the first run were corrected; the affected eight tests pass on rerun.
- **14 additional AI regression tests from the merged main branch pass**, covering land play, energy costs, targeting taxes, X restrictions and rejected-action handling.
- **Strict certification passes for 32,273/32,273 definitions and all 15,021 card/deck checks**, with zero failures. This checks engine implementation coverage, not tournament legality.
- **Eight browser scenarios pass at 1440 px and 390 px**, covering every deck's selection, original commander art, paid commander cast through the stack and battlefield entry. There are zero recorded browser errors, decision fallbacks or horizontal-overflow failures. [browser.json](browser.json) retains the results; screenshots and logs are under ignored `output/precon-trc-2026-10-29/`.
- **Four complete four-player games pass in the final integrated-tree run**, based on merged main `8dd16a4`. Each finishes with a winner before the 200-turn limit, with no decision fallback, valid game-state invariants and stable recalculation. [headless.json](headless.json) pins the seeds and results:

| Starting deck | Seed | Turns | Winner |
| --- | ---: | ---: | --- |
| We Are the Borg | 102900 | 25 | You |
| Federation Fleet | 102901 | 74 | AI Dragon |
| Landing Party | 102902 | 51 | AI Wolf |
| Klingon Fury | 102903 | 44 | You |

These are selected validation suites; a run of the repository's complete `npm test` suite is not claimed.

## Bounded limitations

The original Borg, Klingon Warrior, Officer, Spacecraft Illusion and Tribble token printings were not published through the checked Scryfall endpoints on 29 October. Those tokens use the existing placeholder presentation; their gameplay definitions are implemented. No substitute token artwork is presented as official art.

Positions containing complex ongoing native effects may not qualify for a fresh state checkpoint. The existing save guard retains the previous safe checkpoint and recorded decisions instead of silently dropping unsupported effects. This import does not extend checkpoint serialization for those effect classes.

## Reproduce

```sh
node scripts/import-star-trek-precons.mjs --write
node scripts/verify-star-trek-import.mjs
node --test --test-concurrency=1 tests/star-trek-import.test.mjs tests/star-trek-borg.test.mjs tests/star-trek-federation.test.mjs tests/star-trek-landing.test.mjs tests/star-trek-klingon.test.mjs
node scripts/smoke-star-trek-games.mjs
npm run certify:strict
```

Source refresh is explicit: `node scripts/import-star-trek-precons.mjs --sources --oracle`. It requires Python 3 for proxy-aware HTTP transport and retains full fetched responses under ignored `output/precon-trc-2026-10-29/`. The official page, normalized Oracle records and plain-text deck exports are tracked here for offline verification. Native card behavior is covered separately by each deck's focused engine tests.
