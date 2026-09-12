# Ten original precons: WHO, LCC, SLD and MKC

This batch follows Timey-Wimey in the pinned release queue. It adds ten original 100-card Commander lists, 209 native card implementations, deck guides, AI profiles, card faces, token art and commander crops. The selectable library grows from 120 to 130 decks and the importable catalog from 20,962 to 21,171 definitions.

| Deck | Default commanders | Playing plan |
| --- | --- | --- |
| Paradox Power | The Thirteenth Doctor + Yasmin Khan | Cast from other zones, grow creatures and use temporary exile permissions. |
| Masters of Evil | Davros, Dalek Creator | Artifact creatures, Dalek tokens, opponent life loss and villainous choices. |
| Blast from the Past | The Fourth Doctor + Sarah Jane Smith | Historic spells, Saga chapters, tokens and repeatable value. |
| Veloci-Ramp-Tor | Pantlaza, Sun-Favored | Ramp into Dinosaurs, discover and use damage-triggered abilities. |
| Explorers of the Deep | Hakbal of the Surging Soul | Explore with Merfolk, develop mana and accumulate counters. |
| Blood Rites | Clavileño, First of the Blessed | Attack with Vampires, sacrifice them and retain value through death triggers. |
| Ahoy Mateys | Admiral Brass, Unsinkable | Pirate combat damage and graveyard returns with finality. |
| Raining Cats and Dogs | Rin and Seri, Inseparable | Cast Cats and Dogs, make tokens and exploit tribal support. |
| Revenant Recon | Mirko, Obsessive Theorist | Surveil, grow Mirko and return creatures with strictly smaller power. |
| Deadly Disguise | Kaust, Eyes of the Glade | Face-down creatures, combat reveals and base 2/2 synergies. |

## Source fidelity

The ten lists contain 1,000 physical cards and 681 distinct source identities: 472 reused identities and 209 new definitions. Each list is compared against Wizards' published list and the matching MTGJSON deck export. The pinned Moxfield index determines queue order; the exported text files are reconstructed from these independently verified sources, not represented as direct Moxfield downloads.

- [Doctor Who decklists](https://magic.wizards.com/en/news/announcements/magic-the-gathering-doctor-who-commander-decklists)
- [Lost Caverns of Ixalan decklists](https://magic.wizards.com/en/news/announcements/the-lost-caverns-of-ixalan-commander-decklists)
- [Raining Cats and Dogs decklist](https://magic.wizards.com/en/news/announcements/secret-lair-commander-deck-raining-cats-and-dogs)
- [Murders at Karlov Manor decklists](https://magic.wizards.com/en/news/announcements/murders-at-karlov-manor-commander-decklists)

[decklists.json](decklists.json) preserves source URLs, per-list hashes, counts and normalization notes. [oracle.json](oracle.json) pins all faces. [intake.json](intake.json) records the pre-import inventory. [source-validation.json](source-validation.json) checks the baseline `7aea478`, idempotent import, preservation of every existing raw deck/card, existing image mappings and tracked assets. The four retained Oracle display differences are self-reference wording or separately stored Adventure faces; the complete pinned faces remain available in the source report.

Deep Clue Sea is already in the library and is skipped. The existing Blame Game exclusion remains. Original deck contents are preserved, including cards affected by later Commander bans. Planechase decks and packaging extras are outside these 100-card Commander lists.

## Engine and player decisions

The new scripts use the real stack, targeting, priority, payment and zone-change machinery. They include historic/paradox casting, discover, explore, villainous choices, replicate, demonstrate, casualty, convoke, retrace, flashback, escape, suspend, Saga chapters/read ahead, morph/disguise/cloak, finality, reanimation Auras, copied characteristics and linked exile.

Casting permissions record card/source identities and expiry. The test scenarios check source removal, blinked objects, cost rejection, different spell faces, countered spells, grouped damage and graveyard events, optional decisions, commander pairs and Clara's chosen color. Shared engine corrections include positive-X kicker, typed blocking requirements, cleanup triggers and exact graveyard Aura attachment. Unsupported temporary save effects defer a checkpoint using the existing save guard rather than silently dropping rules state on resume.

Every deck has its own opening-hand advice, early/mid/late plan, key cards, complexity, pacing and AI strategy tags. AI casting scores account for the active commander's synergies and expiring permissions. The existing opponent personalities remain available for the new decks.

## Artwork and interface

[images.json](images.json) records 396 added WebP files with hashes, including commander crops, token variants and alternate faces. Existing artwork and videos are preserved. The new commanders use still artwork.

The browser regression covers all ten decks at 1440×1000 and 390×844: selector, spotlight image loading, pod setup, printed commander pairs, opening 100-card count, actual commander action, mana payment, stack resolution, battlefield rendering, console/network errors and horizontal overflow. Screenshots and detailed output are written under `output/precon-who-lcc-sld-mkc-2026-09-12/browser/`. Desktop/mobile spotlight and battlefield screenshots were also visually inspected.

## Reproduction

The targeted validation passes: **145 rule/import tests**, **418 native execution cases** (209 cards under each controller role), **29 inventory/art/damage-UI regression tests**, **17 additional shared regression tests**, **20 browser flows**, and **13 complete four-player games**. The game matrix includes every new deck and the three preceding decks whose scheduled opponents now include this batch. All thirteen finish with a winner below the 200-turn cap, no engine errors or AI fallback decisions, and consistent game state.

The initial `npm.cmd test` run finished with **9,894 passing checks and 25 failures** and is **not a full pass**. It overlapped the fixes. Its full-catalog `headless-smoke.test.mjs` worker was interrupted after 22.2 minutes because it had loaded an engine snapshot before the subsequent fixes. The other 24 reported failures were corrected and verified through targeted follow-up tests: current catalog inventories, source-less damage, synthetic cast/death events, and The Five Doctors' kicker cost and player prompt. The 130-deck global game sweep remains uncompleted. The full player-facing sweep reported one prompt problem; the dedicated Five Doctors tests verify that correction in five payment/search scenarios for each controller role without claiming a second full-sweep pass.

The full Oracle execution proof did pass: **35,600 card executions, 10,398 keyword executions, 49,286 operation routes and 86,199 nested effect proofs** for human and local-AI controllers. The completed reruns and original full-run result are recorded separately in [qa-summary.json](qa-summary.json).

```powershell
npm.cmd run check
node scripts/verify-who-lcc-sld-mkc-import.mjs
node --test tests/who-lcc-mkc-rules.test.mjs tests/who-lcc-mkc-advanced.test.mjs tests/who-lcc-sld-mkc-precons.test.mjs
node scripts/smoke-who-lcc-sld-mkc-precons.mjs
node scripts/smoke-who-lcc-sld-mkc-games.mjs
node scripts/smoke-who-lcc-sld-mkc-games.mjs --previous-opponents
node scripts/smoke-who-lcc-sld-mkc-games.mjs --affected-opponents
node tests/browser/who-lcc-sld-mkc-precons.mjs
npm.cmd test
```

For the browser test, install Playwright or point `PLAYWRIGHT_MODULE` at an existing Playwright ESM entry. It starts its own local server with an in-memory account store. `PRECON_ONLY` selects one deck; `PRECON_BASE_URL` selects an existing server. Full-game seeds and opponents are recorded in the game report. These finite scenarios establish tested behavior; they do not constitute exhaustive proof of every possible interaction among the full catalog.

Final validation results are recorded in [qa-summary.json](qa-summary.json). The native execution matrix is [runtime-smoke.json](runtime-smoke.json).
