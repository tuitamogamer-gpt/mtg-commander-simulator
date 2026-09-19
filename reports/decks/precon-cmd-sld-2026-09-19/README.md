# Seven original Commander 2011 and Secret Lair precons

The selectable library grows from **153 to 160 decks**, and the importable catalog from **22,589 to 22,668 definitions**.

| Deck | Default commander | Strategy |
| --- | --- | --- |
| Goblin Storm | Zada, Hedron Grinder | Goblin tokens, targeted cantrips and copied pump spells. |
| Hatsune Miku | Trostani, Selesnya's Voice | Populate, lifegain and creature counters. |
| Counterpunch | Ghave, Guru of Spores | Saprolings, counters and sacrifice. |
| Mirror Mastery | Riku of Two Reflections | Copy creatures and spells with extra mana. |
| Political Puppets | Zedruu the Greathearted | Donate permanents, draw cards and control combat. |
| Heavenly Inferno | Kaalia of the Vast | Put Angels, Demons and Dragons into combat. |
| Devour for Power | The Mimeoplasm | Fill graveyards and combine large creature bodies with useful abilities. |

## Original lists and preservation

The pinned queue's two remaining modern Secret Lair lists are followed by the five original Commander 2011 lists. Duplicate printings are skipped. The seven lists contain **700 physical cards and 452 unique identities: 373 reused and 79 new**. Original quantities and cards are retained, including Trade Secrets; these are historical lists rather than current-banlist upgrades.

Sources are the Wizards [Commander 2011 lists](https://magic.wizards.com/en/news/feature/magic-gathering-commander-decklists-2011-06-14), [Goblin Storm list](https://magic.wizards.com/en/news/announcements/secret-lair-commander-deck-goblin-storm-decklist), and [Hatsune Miku list](https://magic.wizards.com/en/news/announcements/secret-lair-commander-deck-hatsune-miku-decklist). Six lists also match MTGJSON exactly. Hatsune Miku is absent from the downloaded MTGJSON deck index and uses the published Wizards list only. The pinned Moxfield index supplies queue links; these are not direct Moxfield exports.

[decklists.json](decklists.json) records the list sources, normalizations and hashes. [oracle.json](oracle.json) pins Scryfall rules, identities and faces. [intake.json](intake.json) retains the initial reused/new split. Each deck also has a text export in this directory.

[source-validation.json](source-validation.json) compares baseline `4bffe16`: all existing raw definitions, deck records, image mappings and tracked artwork remain unchanged. Re-running the data import produces the same hash. Two retained Oracle wording differences, Boros Garrison and Soul Snare, replace the printed card name with its card type; their existing definitions are preserved.

## Rules and interface

All 79 additions have explicit native scripts. The import covers spell copies, join forces, radiance, war/peace choices, graveyard casting, offering, alternate costs, flip cards, Rooms, class levels, saga chapters, speed, exerted mana, restricted mana, counters across zone changes, control effects, clash, cycling, gifts and spree.

The seven decks have opening-hand advice, strategy routes, key cards and AI profiles. [images.json](images.json) records **227 added WebP files**, including commander crops, card faces and four token variants. Existing artwork is preserved. These decks use still commander artwork and add no videos.

## Verification

- **685/685** tests pass in the final regression selection, including **123 new scenarios**. The selection also covers preceding precons, AI profiles, catalog integrity, images and commander display.
- **186/186** additional engine tests pass for mana payment, exertion, copied spells and control effects. Together the two regression selections contain **871 passing tests**.
- **158/158** native execution smoke cases pass, one for each new card with human and local-AI controllers. [runtime-smoke.json](runtime-smoke.json) records every case. This checks common-board casting and entry, not every possible interaction.
- **14/14** browser flows pass at 1440×1000 and 390×844: deck selection, Spotlight, opponent selection, 100-card opening state, paid commander casting and Stack resolution. No browser errors or horizontal overflow were reported. Desktop Spotlight and mobile battlefield screenshots were visually inspected.
- **7/7** deterministic four-player games finish with a winner below the 200-turn cap, no AI fallback, and valid final game state. [headless.json](headless.json) records the matrix.
- Syntax, deck audit and strict certification pass. Strict certification checks **22,668 definitions** and **13,409 card/deck pairs**.
- Source preservation and generated-catalog verification pass. [qa-summary.json](qa-summary.json) records the final evidence and source hashes.

This is a targeted regression run, not a claim that the full `npm test` suite was run. Logs and browser screenshots are in the ignored `output/precon-cmd-sld-2026-09-19/` directory. The QA summary records the completed import before publication; the subsequent [release preflight](../../releases/precon-cmd-sld-2026-09-19.md) records the publication checks.

## Reproduction

```powershell
node scripts/import-cmd-sld-precons.mjs --sources --oracle
node scripts/import-cmd-sld-precons.mjs --write
node scripts/sync-cmd-sld-images.mjs
node scripts/sync-landing-counts.mjs
node scripts/verify-cmd-sld-import.mjs
node scripts/smoke-cmd-sld-precons.mjs
node scripts/smoke-cmd-sld-games.mjs
node --test tests/cmd-sld-precons.test.mjs tests/cmd-sld-advanced.test.mjs
node tests/browser/cmd-sld-precons.mjs
npm.cmd run check
npm.cmd run audit
npm.cmd run certify:strict
```

The browser runner accepts `PLAYWRIGHT_MODULE` and `PRECON_BASE_URL`. Catalog regeneration and verification commands are documented in [the catalog](../../../docs/card-catalog.md).
