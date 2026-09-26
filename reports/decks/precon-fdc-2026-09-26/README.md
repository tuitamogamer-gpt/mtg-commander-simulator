# Foundations Commander — full import, 26 September 2026

Five original 100-card precons are available in the deck selector, Solo seats and deck import. The batch contains **500 physical cards, 321 distinct identities, 304 reused definitions and 17 new native definitions**. The catalog now has **175 decks, 24,792 definitions and 24,791 import-eligible cards**; Brisela remains a meld result.

| Deck | Default commander | Original list |
| --- | --- | --- |
| Calling All Angels | Giada, Font of Hope | [Moxfield](https://moxfield.com/decks/STCkf8pBDE-Xxi1hgsZKiQ) · [export](calling-all-angels.txt) |
| Keen Engineering | Sai, Master Thopterist | [Moxfield](https://moxfield.com/decks/80zkHrncgEKyre0fMIJbng) · [export](keen-engineering.txt) |
| Wretched Ranks | Ghoulcaller Gisa | [Moxfield](https://moxfield.com/decks/EFXjDyGIrkitAxoiL2NS0g) · [export](wretched-ranks.txt) |
| Reign of Dragons | Lathliss, Dragon Queen | [Moxfield](https://moxfield.com/decks/tsKfnd0haUax0CLKMHWVHQ) · [export](reign-of-dragons.txt) |
| Tramplesaurus Rex | Ghalta, Primal Hunger | [Moxfield](https://moxfield.com/decks/m_jqtk3F6EOQiq1gytJFJg) · [export](tramplesaurus-rex.txt) |

## Sources and preservation

The five entries were identified on the supplied Moxfield precon listing. Each [official Wizards decklist](https://magic.wizards.com/en/news/announcements/foundations-commander-decklists) was compared by exact card name and quantity against its separate [MTGJSON FDC deck file](https://mtgjson.com/api/v5/decks/CallingAllAngels_FDC.json). Every list has 100 cards, the printed default commander, a valid color identity and legal singleton quantities. Their release date is 2 October 2026.

[decklists.json](decklists.json) records both sources and content digests. [oracle.json](oracle.json) pins the Scryfall identities, Oracle text and printing metadata used by the importer; [rulings.json](rulings.json) retains the related Wizards rulings supplied through Scryfall. [intake.json](intake.json) preserves the original 304/17 reuse split.

[source-validation.json](source-validation.json) verifies that all 170 earlier deck records, 3,917 earlier native raw definitions, 6,797 card-image mappings and 179 commander-art mappings match baseline `e24aa5ac14adfda448e5d83a1587d1e8c903d69a`. Previously tracked image and video assets are unchanged. Repeating the import produces the same data digest.

The bulk comparison remains pinned to the existing 30 August Scryfall snapshot. [catalog-cache-reuse.json](catalog-cache-reuse.json) verifies that all previously fingerprinted classifier scripts, including the 109 parser dependencies, are unchanged. Four new import/verification scripts lie outside that dependency graph, so their addition can reuse the established classifications. The exporter independently rebuilds the runtime inventory and validates the source digest; its subsequent `--check` passes.

## Implemented rules and presentation

| New native cards | Covered behavior |
| --- | --- |
| Carnelian Orb of Dragonkind | Mana can pay any cost; a Dragon creature spell paid with it gains haste for the turn. |
| Consumed by Greed; Scrapshooter | Gift costs and recipients, gift delivery, greatest-power sacrifice, graveyard return and the conditional destruction trigger. |
| Dragonhawk, Fate's Tempest | Resolution-time power count, object-bound exile permissions, expiry as the next own end step begins, and damage only for that trigger's remaining exiled objects. |
| Fall from Favor | Aura attachment, tapping, monarch creation and the controller's conditional untap restriction. |
| Goddric, Cloaked Reveler | Celebration tracking, Dragon type replacement, base 4/4 stats, flying and the granted Dragon pump activation. |
| Hit the Mother Lode | Discover, legal immediate casting or a hand return, random library-bottom placement and the correct number of tapped Treasures. |
| Kalitas, Traitor of Ghet | Ordered opposing nontoken-death replacement, Zombie creation during simultaneous wipes, lifelink and a paid sacrifice of another Vampire or Zombie. |
| Minion of the Mighty | Attack-declaration power total and a chosen Dragon entering tapped and attacking a legal defender. |
| Ram Through | Both target restrictions, simultaneous trample excess damage and deathtouch lethal assignment. |
| Razorlash Transmogrant | Blocking prohibition, paid graveyard activation, nonbasic-land discount and return with a counter. |
| Sarkhan, Dragon Ascendant | Beholding a controlled Dragon or revealing one from hand, Treasure creation, counters and temporary Dragon/flying characteristics. |
| Serra Avenger | Restriction during the controller's first three own turns, with ordinary off-turn casting permissions respected. |
| The Elder Dragon War | Read-ahead selection, skipped chapters, damage, discard/draw and the red 4/4 flying Dragon token. |
| Undead Butler | Mill three, optional exile of the same graveyard object and a separately targeted reflexive return trigger. |
| Wojek Investigator | One investigation for each opponent with a larger hand. |
| Zul Ashur, Lich Lord | Ward payment and a paid, object-bound Zombie casting permission for the current turn. |

Each deck has its own three-stage game plan, opening-hand advice, three signature cards and an AI profile. [images.json](images.json) records **96 added WebP assets**: 90 card images, five commander art crops and the Elder Dragon War token. All 321 identities have local card art. The five commanders use still artwork; the existing 28 commander videos remain the video library.

## Validation

- **65 targeted tests** exercise all 17 new cards and all five commanders with human and AI controllers, including real mana payments, activation costs and invalid/expired permissions.
- **661 distinct checks across 23 selected test files pass after the final fixes.** The coverage includes existing precons, catalog partitions, local images, commander visuals, AI, ordered zone replacements and saved games. The initial regression runs exposed outdated total-count assertions; follow-up runs verify their corrected totals. See [qa.json](qa.json) for each run and the final coverage calculation. This was a selected regression run, not the repository's complete test suite.
- Syntax, deck audit and strict card certification pass: 175 complete decks, 14,566 card/deck checks and 24,792 raw definitions.
- [Five deterministic four-player games](headless.json) finish with winners in 31–53 turns, before the 200-turn limit, with no decision fallback or state-invariant failures.
- [Browser checks](browser.json) cover all five guides at 1280 and 390 pixels, loaded commander art, desktop signature art and no horizontal overflow. A normal four-player setup reaches the opening hand and begins play, with seven cards in hand, 92 in the library and one commander per seat. A transient initial local module request recovered after a reload.
- Exact source comparison, original-data preservation, artwork digests, repeated-import consistency, generated-catalog verification and `git diff --check` pass.

## Reproduce

```powershell
node scripts/import-fdc-precons.mjs --write
node scripts/verify-fdc-import.mjs
node --test tests/fdc-precons.test.mjs
node scripts/smoke-fdc-games.mjs
npm.cmd run check
npm.cmd run audit
npm.cmd run certify:strict
```

The initial source fetch used `--sources --oracle`; image synchronization uses `scripts/sync-fdc-images.mjs`. Both retain source metadata for subsequent review. Catalog regeneration and `--check` use the pinned-source commands in [the catalog documentation](../../../docs/card-catalog.md).
