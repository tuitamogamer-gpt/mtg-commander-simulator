# Commander Masters / Wilds of Eldraine / Doctor Who — five original precons

Imported locally on 10 September 2026 from baseline `f674dd7`. The batch preserves **500 original cards**, reuses **263** of **372** distinct identities and adds **109 native definitions**. The catalog contains **120 selectable decks**, **20,962 definitions** and **20,944 definitions eligible for deck import**.

| Deck | Default commander(s) | Cards |
| --- | --- | ---: |
| Enduring Enchantments | Anikthea, Hand of Erebos | 100 |
| Eldrazi Unbound | Zhulodok, Void Gorger | 100 |
| Virtue and Valor | Ellivere of the Wild Court | 100 |
| Fae Dominion | Tegwyll, Duke of Splendor | 100 |
| Timey-Wimey | The Tenth Doctor + Rose Tyler | 100 |

## Sources and preservation

The [pinned precon index](../precon-starter-2026-09-06/moxfield-index.tsv) supplies the queue links. After Planeswalker Party, release order and index order select the two remaining Commander Masters decks, both Wilds of Eldraine decks and the first Doctor Who deck.

Every list was independently matched against Wizards and MTGJSON:

- [Commander Masters official decklists](https://magic.wizards.com/en/news/announcements/commander-masters-commander-decklists)
- [Wilds of Eldraine official decklists](https://magic.wizards.com/en/news/announcements/wilds-of-eldraine-commander-decklists)
- [Doctor Who official decklists](https://magic.wizards.com/en/news/announcements/magic-the-gathering-doctor-who-commander-decklists)

These are original lists verified from independent sources, rather than direct Moxfield exports. Original card quantities are preserved. The importer corrects the official WOC spelling “Armont, the Redeemer” to “Syr Armont, the Redeemer” and resolves Adventure and split-card aliases. `Time Lord` remains one creature subtype. Timey-Wimey defaults to both printed commanders.

[decklists.json](decklists.json) and the five text exports retain the exact lists, source links and hashes. [oracle.json](oracle.json) pins card text and physical faces; [intake.json](intake.json) preserves the original 109-new/263-reused partition. [source-validation.json](source-validation.json) verifies preservation of all **2,995 previous raw definitions**, **116 raw deck records**, **4,897 image mappings** and **117 commander crops**. Previously tracked art and videos are unchanged. Re-running the importer leaves `src/data.js` byte-identical. The source report lists six retained Oracle wording or face-format differences on reused definitions.

## Rules and presentation

Nine new modules implement enchantment copies and reanimation, linked exile, colorless costs and double cascade, alternative casting costs, Faerie combat triggers, Adventure, suspend, time travel, vanishing, phasing and Doctor Who Sagas. Shared engine changes connect time counters to existing suspend behavior, support complete additional upkeeps, expose successful Saga chapter resolution, apply activation taxes to abilities with no printed mana cost, and make equipped creature names visible to rules queries.

Semantic checks cover actual paid casting and activation, source and target identity, optional costs, suspended cards, simultaneous damage, state triggers, attached Auras and Equipment, copy effects, and JSON save restoration. Existing suspend-removal helpers use the same time-counter events. Rousing Refrain now changes zones through the normal move operation and restores both its suspend metadata and its three counters.

Each deck has a description, strategy guide, opening-hand advice, AI profile and local card art. **216 new WebP files** include six commander crops and eleven linked token variants. [images.json](images.json) records source URLs and hashes. The existing 28 commander videos are preserved; these five decks use still art.

## Verification

The final targeted regression passes **1,185/1,185 tests**, including **53 new-batch semantic tests**. Results and reproduction commands are recorded in [qa.json](qa.json). The native execution smoke covers all **109 new definitions in human and AI roles (218 checks)**, with no prerequisite gaps, decision gaps or runtime errors. Strict catalog certification passes **9,914 card/deck checks** and **20,962 definitions**.

Browser evidence covers each deck at **1440 px and 390 px**, including the spotlight, pod setup, the default commander or commander pair, an opening 100-card deck, and a paid commander cast. All ten scenarios finish with no browser errors, missing image responses, horizontal overflow or AI fallback. Screenshots were also inspected visually.

Five ordinary shuffled four-seat AI games exercise the new decks against adjacent existing decks. They require a real winner before the 200-turn limit, no pending triggers, no AI fallback, and stable game-state invariants. Browser commander casts use controlled follow-on boards; the natural AI games do not.

The targeted regression and native execution checks are not exhaustive proof of all interactions. The full release diagnostic recorded **9,531 passes and nine failures**. All nine are reconciled by the final regression, paid-kicker and prompt checks, image/identity audits, and resumed game simulations. All **120 decks** have a successful seeded game: 109 completed in the original diagnostic, followed by the remaining eleven after fixes. This is not presented as one clean full-suite run. [release-qa.json](release-qa.json) retains the exact results and limits. Full logs and screenshots are retained in the ignored `.local/` and `output/precon-cmm-woc-who-2026-09-10/` directories.

```sh
node scripts/verify-cmm-woc-who-import.mjs
node --test tests/cmm-woc-who-precons.test.mjs tests/cmm-woc-who-advanced.test.mjs
node scripts/smoke-cmm-woc-who-precons.mjs
node scripts/smoke-cmm-woc-who-games.mjs
npm run check
npm run audit
npm run certify:strict
```

Run `tests/browser/cmm-woc-who-precons.mjs` with `PLAYWRIGHT_MODULE` pointing to the local Playwright installation when it is outside the repository. On this Windows workstation, use `npm.cmd` for the npm commands. Production delivery uses `main` and the existing [canonical application](https://mtg-commander-simulator.vercel.app/). Exact commit, deployment status, shipped-byte checks and production browser evidence are recorded locally in `output/precon-cmm-woc-who-2026-09-10/release.json`.

The release regenerates the exported catalog from the archived 30 August Oracle gzip with the exact pinned SHA-256 and passes `--check`. It also corrects optional-face handling in Rooftop Storm, partial cast-event handling, actual kicker payment for Myriad Construct and Jace, Mirror Mage, and The Black Gate’s player-choice prompt. Eight canonical token aliases share their pinned local art. The final isolated browser run passes all ten precon scenarios.
