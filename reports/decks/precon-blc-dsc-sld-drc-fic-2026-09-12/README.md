# Ten original precons: Bloomburrow through Final Fantasy

This batch adds the next ten missing original lists after Eldrazi Incursion in the pinned release queue. The library grows from **140 to 150 selectable 100-card decks**. The importable catalog grows from **21,385 to 21,541 definitions**, with 156 new native scripts and 559 reused card identities.

| Deck | Commander | Playing plan |
| --- | --- | --- |
| Peace Offering | Ms. Bumbleflower | Shared draws, gifts, counters and evasive attackers. |
| Miracle Worker | Aminatou, Veil Piercer | Top-deck setup, discounted enchantments and Rooms. |
| Jump Scare! | Zimone, Mystery Unraveler | Landfall, manifest dread and turning permanents face up. |
| Death Toll | Winter, Cynical Opportunist | Fill the graveyard, reach delirium and recur permanents. |
| 20 Ways to Win | Go-Shintai of Life's Origin | Protect enchantments and assemble alternate win conditions. |
| Living Energy | Saheeli, Radiant Creator | Build energy, make artifact copies and attack with tokens. |
| Eternal Might | Temmet, Naktamun's Will | Draw, discard, recur Zombies and grow the attacking army. |
| Everyone's Invited! | Morophon, the Boundless | Combine changelings, creature types and tribal rewards. |
| Counter Blitz | Tidus, Yuna's Guardian | Move counters, connect in combat and proliferate. |
| Revival Trance | Terra, Herald of Hope | Mill creatures and return them for repeated value. |

## Source fidelity

The ten lists contain **1,000 physical cards and 715 distinct names**. Each list was compared with both the published Wizards list and its MTGJSON export. The pinned Moxfield index provides queue order and links; these are independently verified original lists, rather than direct Moxfield exports.

- [Bloomburrow Commander decklists](https://magic.wizards.com/en/news/announcements/bloomburrow-commander-decklists)
- [Duskmourn Commander decklists](https://magic.wizards.com/en/news/announcements/duskmourn-house-of-horror-commander-decklists)
- [20 Ways to Win decklist](https://magic.wizards.com/en/news/announcements/secret-lair-commander-deck-20-ways-to-win-full-decklist)
- [Aetherdrift Commander decklists](https://magic.wizards.com/en/news/announcements/aetherdrift-commander-decklists)
- [Everyone's Invited! decklist](https://magic.wizards.com/en/news/announcements/secret-lair-everyones-invited-commander-decklist)
- [Final Fantasy Commander decklists](https://magic.wizards.com/en/news/announcements/final-fantasy-commander-decklists)

Previously imported decks and Collector duplicates are skipped; Blame Game remains excluded. Original card quantities are preserved. [decklists.json](decklists.json) retains list hashes and source comparisons, [oracle.json](oracle.json) pins all card identities and faces, and [intake.json](intake.json) preserves the initial 559 reused / 156 new split. The ten text exports can be inspected or imported separately.

[source-validation.json](source-validation.json) compares baseline `cf8acd2`, verifies idempotent import, and confirms that every existing raw card, deck record, image mapping and tracked asset remains unchanged. Four retained text differences are documented there: three existing Adventure identities store face text separately, and Loran retains its previous self-reference wording.

## Rules and player decisions

All 156 additions use explicit native scripts and the existing payment, targeting, Stack and priority machinery. The batch adds gifts, Rooms and door costs, Aminatou's granted miracle, alternate win checks, energy payments, counter transfers, creature-type effects, graveyard casting permissions and native Saga chapters.

Focused scenarios check actual choices and payments for both human and local-AI controllers. They cover copied gifts and Rooms, forged or expired cast permissions, X costs under miracle, graveyard exile costs, once-per-turn limits after declining an option, grouped graveyard movement, random modes before priority, last-known copy characteristics, mana restrictions and delayed creature bonuses. The Falcon's graveyard activation pays five mana, enters tapped and refuses to return a different graveyard incarnation; its combat trigger sacrifices before announcing the reflexive target.

Type-changing effects run before dependent characteristics and intrinsic land mana abilities. Fish and artifact-token replacements participate in the shared replacement path. Persistent Approach casting history and permanently goaded Bird tokens survive a JSON checkpoint. Temporary permissions use the existing checkpoint guard where their active state cannot be serialized safely.

Each deck has opening-hand advice, key cards, an early/middle/late plan and a dedicated local-AI profile. Existing AI personalities remain available.

## Artwork and interface

[images.json](images.json) records **294 added WebP files**, including ten commander crops, alternate faces and nineteen token variants, with source print IDs and file hashes. Existing artwork and videos remain intact. These ten default commanders use still artwork.

All **20 browser flows** pass at 1440×1000 and 390×844. They exercise deck search, Spotlight, opponent selection, a 100-card opening state, actual commander mana payment, Stack resolution and battlefield rendering. The checks report no console/network errors, AI fallback or horizontal overflow. Final desktop selection and mobile battlefield screenshots were visually inspected.

## Validation and reproduction

The later [release preflight](../../releases/precon-blc-dsc-sld-drc-fic-2026-09-12.md) records release checks, the private library visibility correction, and the full-suite run interrupted at the user's request. The results below retain the original development history.

The focused batch has **137 passing tests**. Together with the full-card and opponent-target audits, the final focused run passes **161 tests**. The native matrix passes **312 execution cases** covering a real entry/cast/activation path for each new card under both controllers, with no prerequisite gaps, choice gaps or errors. This matrix is a smoke check, not proof of every ability on a card; the dedicated scenarios cover the additional interactions described above.

An additional **216 shared regression tests** pass, covering existing precons, AI profiles, catalog partitions, artwork, import, miracle and save/restore. The planeswalker inventory and combat run passes **10 tests**, including 89 deck/planeswalker pairs and 248 loyalty abilities. All **eight X-mana regressions** pass with 167 active X spells.

The final four-player matrix passes **13 games**: each new deck and the three preceding decks whose scheduled opponents now include this batch. Every game ends with a winner below the 200-turn cap, no engine errors or AI fallback decisions, and consistent final state. The later guard for synthetic casts with null metadata and Secret Lair display years are covered by **164 passing tests**: the complete batch file, responsive setup checks, and all Temur Roar scenarios including two full games.

The complete Oracle execution proof passes **35,600 card executions, 10,398 keyword executions, 49,286 operation routes and 86,199 nested proofs** under human and local-AI controllers.

The broader run completes with **10,199 passing tests and 13 failures** while overlapping corrections; it is not represented as a full pass. All 13 failures are resolved and verified in the targeted reruns above. They concern old catalog/portrait/planeswalker counts, landing metadata, source-less or metadata-less synthetic casts, and recognition of Communal Brewing's dynamic target factory. The complete casting-question and activated-ability-question sweeps both pass in that broader run.

[qa-summary.json](qa-summary.json) records those original results, corrections, final shared checks and deterministic game outcomes separately. The 150-deck global `headless-smoke.test.mjs` sweep is excluded; this batch does not claim a full `npm test` pass. Finite tests do not establish exhaustive coverage of every possible interaction.

```powershell
npm.cmd run check
node scripts/verify-blc-dsc-fic-import.mjs
node --test tests/blc-dsc-fic-precons.test.mjs tests/full-card-audit.test.mjs tests/opponent-choice.test.mjs
node scripts/smoke-blc-dsc-fic-precons.mjs
node scripts/smoke-blc-dsc-fic-games.mjs --affected-opponents
node tests/browser/blc-dsc-fic-precons.mjs
node scripts/export-card-catalog.mjs --check --source-file=.local/oracle-pinned-20260830090156.jsonl.gz --source-sha256=a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528
```

For browser checks, install Playwright or set `PLAYWRIGHT_MODULE` to an existing Playwright ESM entry. The test starts a local server with an in-memory account store. `PRECON_ONLY` selects one deck; `PRECON_BASE_URL` selects an existing server. Detailed screenshots and game output are under `output/precon-blc-dsc-sld-drc-fic-2026-09-12/`. The tracked execution matrix is [runtime-smoke.json](runtime-smoke.json). Generated catalog files retain the pinned 30 August Scryfall comparison snapshot and record current runtime availability separately.
