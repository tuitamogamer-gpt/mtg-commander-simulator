# Reality Fracture: Multiverse Reforged

The complete **Multiverse Reforged** precon is selectable in the simulator. The library now contains **170 decks**, **24,775 runtime card definitions**, and **24,774 cards eligible for deck import**. Jace, Multiverse Architect is the default commander; Nissa, Leyline Tamer is included in the deck and can replace Jace as commander in an imported list.

## Source and preservation

The [official Wizards list](https://magic.wizards.com/en/news/announcements/reality-fracture-multiverse-reforged-commander-decklist) matches the [MTGJSON product list](https://mtgjson.com/api/v5/decks/MultiverseReforged_FRC.json), including all **100 physical cards**. Multiple basic-land printings are aggregated by name. The deck has **93 distinct identities: 67 reused and 26 newly implemented**. Its published release date is 2 October 2026; the source was retrieved on 24 September. Prerelease legality metadata is retained as provided by Scryfall.

[decklists.json](decklists.json) records both sources and hashes; [oracle.json](oracle.json) pins the rules and identities; [intake.json](intake.json) preserves the original new/reused split. [multiverse-reforged.txt](multiverse-reforged.txt) is the complete importable list.

[source-validation.json](source-validation.json) verifies baseline `bd1bba00aa0db32ad8cd429ff4765197fbddf6af`: all **3,891 native raw definitions**, **169 deck records**, **6,758 image mappings**, **177 commander crops**, and existing tracked assets are preserved. New definitions match their pinned Oracle records; repeating the import leaves the raw-data hash unchanged.

The bulk catalog remains pinned to 30 August 2026. New native identities absent from that snapshot retain their Oracle IDs and are marked as unmatched in the export. They do not alter the historical comparison universe. A missing identity in an Oracle import batch still fails validation.

## Rules and presentation

Native scripts implement all 26 missing cards, including empower Jace, planeswalker loyalty abilities and combat protection, polymorph reveals, delayed graveyard returns, permanent goad and control transfers, monarch damage triggers, eminence, free casting of milled cards, spell/permanent copies, phasing and protection, mana retention, and Overlord's impending alternative cost.

Empower creates a nonlegendary blue Jace token with zero starting loyalty, then adds counters to one qualifying token. Token doublers do not give counters to every copy. Impending preserves the paid alternative-cost choice, including on a copied spell; a permanent copy does not inherit that choice. Its creature type follows the presence of time counters, including counters added later, as described in the [Duskmourn release notes](https://magic.wizards.com/en/news/feature/duskmourn-house-of-horror-release-notes). The [Reality Fracture release notes](https://magic.wizards.com/en/news/feature/reality-fracture-release-notes) guide the new card interactions.

Two shared engine adjustments preserve specified token mana costs and snapshot monarch ownership across simultaneous damage. The deck has a three-stage guide, key-card advice and an AI profile that prefers expendable tokens for Jace's transformation ability. [images.json](images.json) records **39 new WebP files**, including both commander crops and five token variants.

## Verification

The exact commands, results and file digests are in [qa-summary.json](qa-summary.json). Coverage includes:

- **84 FRC tests**, exercising all newly implemented cards with human and local-AI controllers, commander import, the alternate commander, doubled tokens/triggers, copied impending spells, zone changes and temporary casting permissions.
- **1,160/1,160 tests pass** across 32 selected files, including the FRC scenarios and regressions for existing precons, card catalogs, AI, tokens, planeswalkers, damage, copies and saved games; syntax, audit and strict certification checks also pass.
- **Two browser flows**, at 1440×1000 and 390×844: selection, Deck Spotlight, a 100-card opening state, paid commander casting, priority and Stack resolution. Both flows check errors, images, horizontal overflow and AI fallback. Desktop Spotlight and mobile battlefield screenshots were visually inspected.
- A deterministic **four-player game** against Elven Empire, Draconic Domination and Food and Fellowship, with a winner under the 200-turn limit, valid state and no AI fallback. [headless.json](headless.json) records its result.
- Source preservation, repeat-import consistency and generated-catalog verification. [catalog-cache-reuse.json](catalog-cache-reuse.json) records reuse of existing classifications after verifying every previously fingerprinted parser script is unchanged and all five new scripts are outside its 109-file dependency graph. The export still revalidates the source digest and rebuilds the complete runtime inventory.

These are focused checks; the full `npm test` suite is not claimed. Logs and screenshots are under the ignored `output/precon-frc-2026-09-24/` directory. This report covers local implementation and validation.

## Reproduction

```powershell
node scripts/import-frc-precon.mjs --sources --oracle
node scripts/import-frc-precon.mjs --write
node scripts/sync-frc-images.mjs
node scripts/sync-landing-counts.mjs
node scripts/verify-frc-import.mjs
node --test tests/frc-precon.test.mjs tests/catalog-source-match.test.mjs
node scripts/smoke-frc-game.mjs
node tests/browser/frc-precon.mjs
npm.cmd run check
npm.cmd run audit
npm.cmd run certify:strict
```

The browser runner accepts `PLAYWRIGHT_MODULE` and `PRECON_BASE_URL`. Bulk-catalog regeneration uses the commands in [the catalog documentation](../../../docs/card-catalog.md).
