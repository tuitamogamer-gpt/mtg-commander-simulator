# Lord of the Rings / Commander Masters — five original precons

Implemented on 10 September 2026 from baseline `f27465f`. This batch preserves **500 original cards**, reuses **293** of **369** distinct identities and adds **76 native definitions**. The catalog now contains **115 selectable decks**, **20,853 definitions** and **20,835 importable definitions**.

## Imported decks

| Deck | Default commander(s) | Cards |
| --- | --- | ---: |
| Riders of Rohan | Éowyn, Shieldmaiden | 100 |
| The Hosts of Mordor | Sauron, Lord of the Rings | 100 |
| Food and Fellowship | Frodo, Adventurous Hobbit + Sam, Loyal Attendant | 100 |
| Sliver Swarm | Sliver Gravemother | 100 |
| Planeswalker Party | Commodore Guff | 100 |

## Sources and preservation

The [pinned precon index](../precon-starter-2026-09-06/moxfield-index.tsv) supplies queue links. After From Cute to Brute, release order and the index order select the three remaining LTC lists, followed by the first two CMM lists. Elven Council was already available and is skipped.

The lists were independently matched against Wizards and MTGJSON:

- [The Lord of the Rings official Commander decklists](https://magic.wizards.com/en/news/announcements/the-lord-of-the-rings-tales-of-middle-earth-commander-decklists)
- [Commander Masters official decklists](https://magic.wizards.com/en/news/announcements/commander-masters-commander-decklists)

These are verified original lists, not direct Moxfield exports. Original cards and quantities are retained regardless of current banlist status. Wizards abbreviates **Dusk // Dawn** as **Dusk** in Food and Fellowship; the importer explicitly normalizes this identity. Both Frodo and Sam occupy the command zone by default.

[decklists.json](decklists.json) and the five text exports retain exact lists and source hashes. [oracle.json](oracle.json) pins Oracle text and physical faces. [intake.json](intake.json) retains the initial 76-new/293-reused split. [source-validation.json](source-validation.json) verifies all 2,919 previous raw definitions, 111 raw deck records, 4,714 image mappings and 111 commander crops remain intact. Previously tracked artwork and videos are unchanged. Re-running the importer leaves `src/data.js` byte-identical. The report explicitly records the retained wording difference on the existing Selfless Squire definition.

## Rules and presentation

Seven new modules implement Food and life gain, Ring interactions, linked exile, reanimation, cycling with X, Sliver replicate and encore, type changes, monarch control, and planeswalker loyalty abilities. Shared engine changes support extra loyalty activations, dynamic target groups, precise linked costs, and source validity for graveyard grants. Repeated Reverberation consumes its next-action permission when the action occurs. Forth Eorlingas groups simultaneous damage, and Gollum's game-long damage history survives control changes and saved-game restoration.

All five decks have descriptions, strategy guides, opening-hand advice and AI profiles. **185 new WebP files** include six commander crops and nine linked token variants. [images.json](images.json) records provenance, aliases and file hashes. No commander videos were added.

## Verification

The final focused regression passes **605/605**, including **48** dedicated new-batch semantic tests. The additional broad diagnostic was stopped after **24.94 minutes**, with **6640 reported passes and six earlier failures**; all six are corrected and reconciled by the final focused run. The broad run began before those fixes, omitted all-deck headless smoke and did not finish. A full-suite pass is not claimed. Details are recorded in [qa.json](qa.json). The native execution smoke covers all **76 new definitions in both human and AI roles (152 checks)**. Semantic tests exercise real mana payment, costs, target selection, Stack resolution, source lifetime and save restoration. Browser evidence covers all five decks at **1440 px and 390 px**, including deck selection, commander setup and a paid commander cast. Five natural four-seat AI games finish without decision fallback.

The native smoke is a broad execution check, not exhaustive proof of every interaction. Browser commander casts use controlled boards; the five headless AI games use ordinary shuffled decks and natural play. Screenshots and full logs are retained under the ignored `output/precon-ltc-cmm-2026-09-10/` and `.local/` directories.

Reproduction commands:

```sh
node scripts/verify-ltc-cmm-import.mjs
node --test tests/ltc-cmm-precons.test.mjs tests/ltc-cmm-advanced.test.mjs
node scripts/smoke-ltc-cmm-precons.mjs
node scripts/smoke-ltc-cmm-games.mjs
npm run check
npm run audit
npm run certify:strict
```

Run `tests/browser/ltc-cmm-precons.mjs` with `PLAYWRIGHT_MODULE` pointing to a local Playwright installation when it is installed outside the repository.

Commit, push and production deployment were authorized on 10 September 2026. For the same ten browser scenarios against production, set `PRECON_BASE_URL=https://mtg-commander-simulator.vercel.app`; output goes to `output/precon-ltc-cmm-2026-09-10/production-browser/`. The final deployment ID, source revision and HTTP/source-byte checks are recorded in the local `output/precon-ltc-cmm-2026-09-10/release.json` evidence file.
