# Three original Secrets of Strixhaven precons

Added the next three missing original lists after Revival Trance in the pinned release queue. The selectable library grows from **150 to 153 decks**, and the importable catalog from **22,541 to 22,589 definitions**.

| Deck | Default commander | Plan |
| --- | --- | --- |
| Lorehold Spirit | Quintorius, History Chaser | Move cards out of the graveyard, create Spirits and recur small permanents. |
| Silverquill Influence | Killian, Decisive Mentor | Use Auras, goad and enchantment triggers to draw cards and direct combat. |
| Witherbloom Pestilence | Dina, Essence Brewer | Sacrifice creatures for cards, life and counters; build Pests and drain opponents. |

## Sources and preservation

The lists contain **300 physical cards and 237 distinct identities**: **189 reused and 48 new**. All quantities match both the [Wizards decklists](https://magic.wizards.com/en/news/announcements/secrets-of-strixhaven-commander-decklists) and MTGJSON. The pinned Moxfield index determines queue order; the lists are independently verified exports, not direct Moxfield downloads. Intervening decks already in the catalog and Collector duplicates are skipped.

[decklists.json](decklists.json) records URLs and source hashes. [oracle.json](oracle.json) preserves Scryfall rules, costs, types and faces, including all seven prepare spell faces. [intake.json](intake.json) retains the initial reused/new split. The three text exports can also be imported separately.

[source-validation.json](source-validation.json) compares baseline `9705435`. It verifies exact 100-card lists, an idempotent data import, unchanged existing raw definitions and decks, unchanged image mappings and tracked assets, and hashes for every added image. No retained Oracle-text differences were found.

## Rules and interface

All 48 additions have explicit native scripts. Focused scenarios exercise the new rules and the two reused face commanders under both human and local-AI controllers. They cover paid casts, targets, modes, loyalty, additional sacrifices, grouped graveyard departures, prepare timing and mana costs, linked exile, finality, gravestorm, Aura attachments, copies, class levels and once-per-turn graveyard permissions.

The import adds dedicated deck guides, opening-hand advice, key cards and AI profiles. [images.json](images.json) records **97 local WebP files**, including three commander crops, prepared spell images and the Spirit, Inkling and Contract token variants. These commanders use still artwork.

## Verification

- **554/554** tests pass in the final regression selection, including **111 SOC scenarios**. It covers the new cards, previous precons, AI profiles, catalog preservation, artwork, deck import, deck browsing, graveyard permissions, Aura control and spell copies.
- **96/96** native execution smoke cases pass: one execution path for each of the 48 new cards with both controllers. [runtime-smoke.json](runtime-smoke.json) records the individual results. This is not an exhaustive proof of every interaction.
- **6/6** desktop/mobile browser flows pass at 1440×1000 and 390×844: deck search, Spotlight, opponent selection, a 100-card opening state, commander mana payment, Stack resolution and battlefield display. No browser errors or horizontal overflow were reported. Desktop Spotlight and mobile battlefield screenshots were visually inspected.
- **6/6** deterministic four-player games finish with a winner below the 200-turn cap, consistent state, no engine errors and no AI fallback. The matrix includes the three new decks and the three preceding decks whose scheduled opponents now include them.
- Syntax, source audit, strict certification, source preservation and regenerated-catalog checks pass. Strict certification covers all **22,589** definitions and **12,860** card/deck checks.
- The additional planeswalker, X-mana and save/replay selection ran **441 tests**, initially with two failures. The outdated planeswalker inventory was updated for Quintorius; its **10/10** corrected tests pass, including **90 deck/planeswalker pairs and 250 loyalty paths**.

One existing save-state coverage threshold still fails: 107 of 120 turn boundaries are saveable, below its greater-than-90% requirement. A separate execution against unchanged baseline `9705435` reproduces the same **107 saved / 13 blocked** result; every baseline saved board restores identically. [baseline-save-comparison.json](baseline-save-comparison.json) records the decks and blockers. The threshold and save engine were not changed. This work does not claim a full `npm test` pass.

[qa-summary.json](qa-summary.json) records development results and relevant source hashes before publication. Raw logs and browser screenshots are in the ignored `output/precon-soc-2026-09-18/` directory. The [release preflight](../../releases/precon-soc-2026-09-18.md) records publication checks; final deployment evidence is saved separately in that output directory.

## Reproduction

```powershell
node scripts/import-soc-precons.mjs --sources --oracle
node scripts/import-soc-precons.mjs --write
node scripts/sync-soc-images.mjs
node scripts/sync-landing-counts.mjs
node scripts/verify-soc-import.mjs
node scripts/smoke-soc-precons.mjs
node scripts/smoke-soc-games.mjs --affected-opponents
node --test tests/soc-precons.test.mjs
node tests/browser/soc-precons.mjs
npm.cmd run check
npm.cmd run audit
npm.cmd run certify:strict
```

The browser runner accepts `PLAYWRIGHT_MODULE` and `PRECON_BASE_URL`. Catalog regeneration/check commands are documented in [the catalog](../../../docs/card-catalog.md).
