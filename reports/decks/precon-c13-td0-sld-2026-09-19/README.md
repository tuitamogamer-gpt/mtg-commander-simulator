# Eight original Commander 2013, Angels and MTGO precons

The library grows from **160 to 168 decks**. The runtime has **22,749 definitions**, including **22,748 cards eligible for deck import**. Brisela is a meld result, not a standalone deck card.

The requested next ten reached the end of the pinned queue: only eight distinct unimported lists remained. Duplicate Collector/Anthology printings and the existing Blame Game exclusion are preserved.

| Deck | Default commander | Strategy |
| --- | --- | --- |
| Evasive Maneuvers | Derevi, Empyrial Tactician | Evasive combat, tapping and untapping. |
| Power Hungry | Prossh, Skyraider of Kher | Creature tokens and sacrifice. |
| Eternal Bargain | Oloro, Ageless Ascetic | Life gain, card advantage and control. |
| Mind Seize | Jeleva, Nephalia's Scourge | Exiled spells and interaction. |
| Nature of the Beast | Marath, Will of the Wild | Counters, tokens and large creatures. |
| Angels: They're Just Like Us but Cooler and with Wings | Gisela, the Broken Blade | Angels, life gain, recursion and meld. |
| Enchantress Rubinia | Rubinia Soulsinger | Enchantments and creature control. |
| Deathdancer Xira | Xira Arien | Graveyard value and removal. |

## Lists and provenance

The eight lists contain **800 physical cards and 523 distinct deck-card identities: 443 reused and 80 new**. The additional Brisela result brings the new native definitions to **81** and the pinned Oracle identities to **524**. Original quantities and cards are retained.

The [Commander 2013 article](https://magic.wizards.com/en/news/making-magic/all-five-commander-decklists-2013-10-18) and the [Angels announcement](https://magic.wizards.com/en/news/announcements/secret-lairs-next-commander-deck-takes-flight) provide six live official lists. Five match MTGJSON exactly. The official Power Hungry article has **99 cards and omits Savage Lands**; the importer explicitly records that discrepancy and uses MTGJSON's complete 100-card product list.

The two MTGO Theme Decks use preserved MTGJSON lists. Their [legacy Wizards announcement](https://magic.wizards.com/en/articles/archive/feature/coming-soon-magic-online-2009-08-25) returned HTTP 404 on the retrieval date; it is not claimed as successful independent verification. The pinned Moxfield index supplies queue links, not direct deck exports. [decklists.json](decklists.json) records sources, dates and hashes; [oracle.json](oracle.json) pins Scryfall rules and identities; [intake.json](intake.json) preserves the initial new/reused split. Each deck has a text export alongside these records.

[source-validation.json](source-validation.json) compares baseline `ffc96c3`: all **3,810 existing native raw definitions**, **161 raw deck records**, **6,518 card-image mappings**, **169 commander crops**, and previously tracked assets are preserved. Repeating the import produces the same raw-data hash. Existing wording differences for Boros Garrison and Seal of Cleansing remain unchanged.

## Rules and interface

Native implementations cover command-zone abilities, paid-mana entry counters, linked exile casting, meld, face-down casting with Illusionary Mask, independently paid kickers, snow-mana tracking, combat taxes, direction restrictions, tempting offers, control exchanges, graveyard returns, delayed triggers, token/counter doubling, devotion and life-total win/loss restrictions.

Meld uses the engine's physical-component representation: Brisela is one battlefield object, has mana value eleven and the printed white color, and restores both original cards when it leaves. Illusionary Mask preserves the actual card under its face-down definition, validates the mana spent on X, permits only the immediate free cast, and reveals before tapping or damage. Its permission cannot be reused after the activation resolves. Tempting-offer decisions precede opponents' simultaneous effects, following the [Wizards release-note clarification](https://magic.wizards.com/en/news/feature/commander-masters-release-notes).

Every new deck has strategy advice, three real key cards, a three-stage guide and an AI profile. The previous seven decks' short theme labels were expanded to satisfy the existing guide-quality check. [images.json](images.json) records **246 new WebP files**, including eight commander crops and six token variants. Existing art and videos are preserved; this batch adds no videos.

## Verification

The final counts, commands and file digests are recorded in [qa-summary.json](qa-summary.json). Evidence includes:

- **533/533 targeted tests pass**, including **105 new scenarios** for human and local-AI play, plus regression coverage for previous precons, profiles, catalogs, deck guides, merged cards, face-down creatures, source identity and mana payment.
- **162 native execution smoke cases**, including actual meld resolution for Brisela rather than an impossible cast of the result. [runtime-smoke.json](runtime-smoke.json) records each case; this is common-board execution coverage, not a proof of every interaction.
- **16 browser flows** at 1440×1000 and 390×844, covering deck selection, Spotlight, opponent selection, 100-card opening state, paid commander casting, priority and Stack resolution. No console errors, failed requests or horizontal overflow were reported. Desktop Spotlight and mobile battlefield screenshots were visually inspected.
- **Eight deterministic four-player games** with winners below the 200-turn cap, no AI fallback and valid final state. [headless.json](headless.json) records the results.
- Syntax, deck audit, strict certification, source preservation and generated-catalog verification.

This is targeted regression coverage; the full `npm test` suite is not claimed. Logs and screenshots are in the ignored `output/precon-c13-td0-sld-2026-09-19/` directory. The subsequent release request and additional checks are recorded in the [release preflight](../../releases/precon-c13-td0-sld-2026-09-19.md).

## Reproduction

```powershell
node scripts/import-c13-td0-sld-precons.mjs --sources --oracle
node scripts/import-c13-td0-sld-precons.mjs --write
node scripts/sync-c13-td0-sld-images.mjs
node scripts/sync-landing-counts.mjs
node scripts/verify-c13-td0-sld-import.mjs
node scripts/smoke-c13-td0-sld-precons.mjs
node scripts/smoke-c13-td0-sld-games.mjs
node --test tests/c13-td0-sld-precons.test.mjs
node tests/browser/c13-td0-sld-precons.mjs
npm.cmd run check
npm.cmd run audit
npm.cmd run certify:strict
```

The browser runner accepts `PLAYWRIGHT_MODULE`, `PRECON_BASE_URL` and `PRECON_ONLY`. Pinned bulk-catalog regeneration commands are documented in [the catalog](../../../docs/card-catalog.md).
