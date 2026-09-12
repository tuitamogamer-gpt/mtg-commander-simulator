# Ten original precons: Fallout, Thunder Junction and Modern Horizons 3

This batch adds the next ten original Commander lists after Deadly Disguise in the pinned release queue. The selectable library grows from **130 to 140 decks**, each containing 100 cards. The importable catalog grows from **21,171 to 21,385 definitions**: 214 new native scripts and 512 reused identities across the ten lists.

| Deck | Commander | Playing plan |
| --- | --- | --- |
| Scrappy Survivors | Dogmeat, Ever Loyal | Auras, Equipment, Junk and recurring attachments. |
| Science! | Dr. Madison Li | Artifact spells, energy and repeatable commander activations. |
| Mutant Menace | The Wise Mothman | Radiation, milling, counters and graveyard value. |
| Hail, Caesar | Caesar, Legion's Emperor | Attack with tokens, sacrifice creatures and choose rewards. |
| Grand Larceny | Gonti, Canny Acquisitor | Connect in combat and cast opponents' exiled cards. |
| Desert Bloom | Yuma, Proud Protector | Sacrifice and recur Deserts to create Sand Warriors. |
| Creative Energy | Satya, Aetherflux Genius | Copy attacking creatures and manage energy upkeep. |
| Graveyard Overdrive | Disa the Restless | Mill creatures, return Lhurgoyfs and make Tarmogoyfs. |
| Tricky Terrain | Omo, Queen of Vesuva | Everything counters, land types and creature types. |
| Eldrazi Incursion | Ulalek, Fused Atrocity | Ramp into Eldrazi and pay colorless mana for copies. |

## Source fidelity

The lists contain 1,000 physical cards and 726 distinct names. Each original list was compared with Wizards' published decklist and its MTGJSON deck export. The pinned Moxfield index supplies queue order and links; these files are not represented as direct Moxfield exports.

- [Fallout Commander decklists](https://magic.wizards.com/en/news/announcements/magic-the-gathering-fallout-commander-decklists)
- [Outlaws of Thunder Junction Commander decklists](https://magic.wizards.com/en/news/announcements/outlaws-of-thunder-junction-commander-decklists)
- [Modern Horizons 3 Commander decklists](https://magic.wizards.com/en/news/announcements/modern-horizons-3-commander-decklists)

Quick Draw and Most Wanted already exist in the library and are skipped. The Blame Game exclusion remains, and Collector editions are not counted twice. Original card quantities are retained, including cards affected by later Commander bans. Displayed Fallout Saga titles are normalized to their full canonical Vault names; split cards and all alternate faces retain their pinned source text.

[decklists.json](decklists.json) preserves source URLs, comparison results and list hashes. [oracle.json](oracle.json) pins all 726 card identities and faces. [intake.json](intake.json) records the original 512/214 split. The ten text files are ready to inspect or import. [source-validation.json](source-validation.json) compares baseline `489c47b`, verifies idempotent import and confirms preservation of every existing raw deck/card, image mapping and tracked asset. There are no retained Oracle-text differences for this batch.

## Rules and player decisions

All 214 additions use native scripts and the existing stack, priority, target and payment machinery. The implementations cover radiation, energy replacement and spending, squad costs, Junk, modified creatures, attack copies, Deserts, everything counters, Lhurgoyf characteristics, plot, graveyard permissions, unearth, scavenge, cast triggers and spell/ability copies.

Permissions bind the card and source incarnation where required. Targeted scenarios cover forged free-cast permissions, expired or removed sources, real optional payments, mutually exclusive graveyard resources, two kickers, X boundaries, modal announcements, opponent-selected targets, grouped damage and per-card milling triggers. Shared payment paths preserve Sunken Palace mana provenance through casts and activated abilities. Counter removal records energy lost separately from energy paid. Copied squad spells retain their additional-cost choices.

Every deck includes opening-hand advice, key cards, an early/middle/late plan, pacing, complexity and AI strategy tags. All existing local AI personalities remain available. Unsupported temporary effects use the existing checkpoint guard to avoid resuming a save with missing rules state.

## Artwork and interface

[images.json](images.json) records **382 added WebP files**, including ten commander crops, alternate faces and thirteen token variants, with source print IDs and file hashes. Existing artwork and videos are preserved. These ten commanders use still artwork.

Radiation appears beside player life, in the mobile opponent ribbon and in Player Details with its precombat-main rule. The ribbon also exposes energy. The browser check exercises all ten decks at 1440×1000 and 390×844: deck search, Spotlight artwork, pod setup, opening 100-card count, commander selection, actual mana payment, Stack resolution and battlefield rendering. It checks console/network errors, fallback decisions and horizontal overflow. The Mothman flow also checks both players' radiation and the visible mobile counter. Desktop/mobile selection and battlefield screenshots were visually inspected.

## Validation and reproduction

The final focused run passes **122 tests**: 94 batch/radiation tests and 28 existing catalog, artwork and targeting regressions. The native matrix passes **428 execution cases** for all 214 new cards under human and local-AI controllers, with no prerequisite gaps, choice gaps or errors. All **20 browser flows** pass without console/network errors.

An additional **75 shared regression tests** cover energy, poison, counter costs, combat mechanics, save/restore and Command Table presentation. The updated planeswalker inventory and combat regression passes **10 tests**, including all 81 deck/planeswalker pairs and 225 loyalty abilities. The last corrections pass **81 tests**, comprising the 55 batch advanced tests above plus 26 Sauron/X regressions. The complete activated-ability question sweep also passes on rerun. These final runs cover 234 distinct tests.

The four-player game matrix passes **13 games**: every new deck and the three preceding decks whose scheduled opponents now include this batch. Every game ends with a winner below the 200-turn cap, no engine errors or AI fallback decisions, and consistent final game state. It was rerun after the payment and counter corrections. The later Safe metadata fix and synthetic null-source death guard are covered by the final dedicated regressions and activated-ability sweep. These finite tests do not constitute exhaustive coverage of every possible interaction.

The broader run finishes with **10,059 passing tests and eight failures** and is not represented as a full pass. It overlapped the final corrections. The eight failures were resolved and verified in the reruns above: active-card counts, the original legacy partition, image manifest coverage, Caesar's reflexive target, planeswalker inventory, Safe's linked exile metadata, synthetic death events and the X-spell inventory. The complete casting-question sweep passes in that broader run; the activated-ability sweep passes after the Safe fix. [qa-summary.json](qa-summary.json) records the original results and each correction separately.

The full Oracle execution proof passes **35,600 card executions, 10,398 keyword executions, 49,286 operation routes and 86,199 nested proofs** under human and local-AI controllers. The 140-deck global `headless-smoke.test.mjs` sweep was excluded; this batch does not claim a full `npm test` pass. Generated catalog files use the pinned 30 August Scryfall snapshot, with current runtime availability recorded separately.

```powershell
npm.cmd run check
node scripts/verify-pip-otc-m3c-import.mjs
node --test tests/pip-otc-m3c-precons.test.mjs tests/pip-otc-m3c-advanced.test.mjs tests/pom-radiation-ui.test.mjs tests/full-card-audit.test.mjs tests/legacy-card-catalog-integrity.test.mjs tests/local-card-images.test.mjs tests/opponent-choice.test.mjs
node scripts/smoke-pip-otc-m3c-precons.mjs
node scripts/smoke-pip-otc-m3c-games.mjs --affected-opponents
node tests/browser/pip-otc-m3c-precons.mjs
node scripts/export-card-catalog.mjs --check --source-file=.local/oracle-pinned-20260830090156.jsonl.gz --source-sha256=a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528
```

For the browser test, install Playwright or set `PLAYWRIGHT_MODULE` to an existing Playwright ESM entry. The test starts a local server with an in-memory account store. `PRECON_ONLY` selects one deck; `PRECON_BASE_URL` selects an existing server. Detailed local screenshots and game output are under `output/precon-pip-otc-m3c-2026-09-12/`. The tracked native matrix is [runtime-smoke.json](runtime-smoke.json), and [qa-summary.json](qa-summary.json) retains final counts, game seeds and outcomes.
