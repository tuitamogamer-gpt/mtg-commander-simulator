# Blame Game restored to the built-in library

The original **100-card Blame Game** list is selectable again, bringing the library to **169 decks**. **Nelly Borca, Impulsive Accuser** is the default commander; **Feather, Radiant Arbiter** remains an alternate. No card substitutions or new definitions were needed: the catalog remains at **22,749 definitions**, with **22,748 eligible for deck import**.

The earlier exclusion predated the [eighteen-card native rules review](../../cards/restricted-legacy-2026-09-10/README.md). Those corrections already cover the deck's suspect, goad, secret choices, prevention and damage-redirection mechanics. This change removes the runtime and audit exclusions, adds a dedicated three-stage guide and AI profile, and updates the landing counts and regression expectations. Existing local card images and commander artwork are reused; no video is added.

## Original list

[decklist.json](decklist.json) records the complete list and source hashes; [blame-game.txt](blame-game.txt) is its importable text export. The [official Wizards list](https://magic.wizards.com/en/news/announcements/murders-at-karlov-manor-commander-decklists) and [MTGJSON product list](https://mtgjson.com/api/v5/decks/BlameGame_MKC.json) were retrieved on 19 September 2026 and agree on all **100 cards / 86 distinct names**. The official label `Ransom Note (Accusations)` resolves to `Ransom Note`. The preserved raw deck in `src/data.js` matches both sources without modification.

## Validation

- Source comparison, local artwork availability and import eligibility pass for all 86 names.
- **172/172 native execution cases pass**, exercising every card with human and local-AI controllers on controlled boards. This is execution coverage, not proof of every interaction.
- Syntax and deck audit pass. Strict certification passes **14,131 card/deck checks**, **6,352 distinct active cards**, and **22,749/22,749 raw definitions**.
- **Four browser flows pass**: both deck/seat arrangements at desktop and phone sizes, with the correct 100-card opening, paid commander casting, stack resolution, local images and no browser errors or horizontal overflow. Desktop Spotlight and mobile battlefield screenshots were visually inspected.
- The full suite exposed an existing Commander 2013 cast-event regression: the dual-kicker bridge assumed every event supplied a spell stack object. It now records payment flags only for the relevant dual-kicker card and an actual stack object. The existing failing Speed scenario and both human/AI Stormscape Battlemage scenarios pass in the **132/132 Avengers and Commander 2013 regression checks**.
- The commander-media regression now includes the final eight imported precons and Nelly: **175 distinct default commanders**, retaining the existing **28 videos**. All **5/5 media checks** pass after updating the old inventory expectation.
- The broad native catalog audit examines **3,949 cards / 7,898 controller cases**: **7,894 execution passes**, four explicitly reported prerequisite gaps, zero choice gaps and zero runtime errors. The separate Blame Game audit has no gaps.
- The full-card audit now uses the current active/native inventory and recognizes Derevi's executable command-zone ability, matching strict certification. Its **13/13 checks** pass.
- The Commander 2011 cast bridge now tolerates notification-only events without a physical cast card. **137/137 Jeskai and Commander 2011/Secret Lair regression checks** pass, including complete Jeskai games in both seats.
- The Sliver Swarm simulation exposed a damage-source assumption in the Doctor Who/Ixalan damage-group bridge: emblems have no card-type method. Its creature snapshot now safely handles those sources; **61/61 targeted checks** pass, including Chandra's emblem dealing damage after its planeswalker leaves.
- The complete eleven-deck Sliver Swarm headless shard passes after that correction, using the original opponents and seeds.
- The artwork inventory now includes the final Commander 2013 import and its token aliases; **3/3 local-image checks** pass.
- The once-on-use coverage now executes Ancient Cornucopia and Nykthos Paragon through declined, queued, copied and blinked triggers in both controller paths. The target audit also checks Witch Hunt's dynamically bound random opponent. **96/96 once-per-turn and opponent-choice checks** pass.
- Profiling a token-heavy Open Hostility game identified repeated Rukarumel source searches for non-Sliver creature tokens, which that ability never affects. Those tokens now return before the battlefield search, preserving the existing result. **81/81 Lord of the Rings/Commander Masters advanced and persistence checks** pass.
- Production dependency audit reports **zero vulnerabilities**.
- Additional fixes found during the broader checks preserve life and sacrificed mana resources when a free legal payment exists, prevent local AI from repeatedly untapping an already-untapped Basalt Monolith, and forward activation-list options through the Commander 2013 bridge. The UI fixtures and planeswalker inventory were brought up to date. **188/188 targeted mana, AI, UI, planeswalker and Commander 2013 checks** pass.
- The broad Oracle interaction sweep exposed two fixture defects: absent implementation arrays on the original 300 template cards, and missing/incorrect mill evidence on thirteen other cards. All **313 affected cards** pass on rerun, covering **1,159 state-invariant games**. The mill proof now checks the actual top cards moved from library to graveyard, including spells that draw before milling.
- Painbow exposed Primeval Spawn calling a nonexistent mana-value method. Its free-cast filter now uses the prospective spell's existing mana-value API. **69/69 targeted checks** pass, including both controllers casting spells with a shared total mana value of ten while leaving over-budget cards exiled. The complete ten-deck headless shard also passes after the fix.
- Maja's complete-game regression exposed AI choosing additional Forests while lacking the white mana its hand and commander needed. Land development now values missing colored sources, including a required second colored pip. **9/9 AI progress and Maja checks** pass, with Maja actually cast in both original seeded games.
- Evasive Maneuvers exposed Surveyor's Scope requesting at most zero cards while both AI selectors still chose one. Both selectors now return an empty selection for that limit. **115/115 targeted checks** pass, including human/local-AI Scope activation with no eligible opponents.
- Large replicate costs now use an exact floating-mana fast path or a conservative colored-source bound before entering the general payment search. **129/129 mana checks** pass, including a fully funded 256-blue-pip payment and an impossible payment with abundant off-color mana. The complete player-facing casting and activation sweep also passes **4/4 checks**.
- Saved games now retain prepared spell rules, copy exceptions and phased-out characteristics. Storm of Souls uses a portable, battlefield-object-bound effect so its changes survive saving and expire on a blink. **Five focused persistence checks** and the original four-seed snapshot-equivalence regression pass.
- **All 169 precons complete their original seeded headless games**, across sixteen successful shard results. Blame Game completes its four-player game on turn 30.
- **All 439 root test files were exercised**, including two regression files added during the run and the pre-existing local Plargg/Nassari test, which is excluded from this commit. Validation was iterative: the original Windows scheduler was interrupted after 178 files; the remaining 258 files completed with 7,331 passes and four failures that subsequently passed on focused reruns. The seven failures before interruption also passed after fixes. A stale player-facing worker was replaced by a complete successful run after the mana solver correction. This is not represented as one uninterrupted green `npm test` run.
- Final syntax, deck/source audit, strict certification and pinned-source catalog export/check pass. [validation.json](validation.json) records the selected completed runs, log hashes, runtime hashes and known audit gaps. Detailed local logs and screenshots are in `output/blame-game-2026-09-19/`.

## Reproduction

```powershell
node scripts/verify-blame-game.mjs
node scripts/smoke-blame-game.mjs
node --test tests/blame-game.test.mjs tests/restricted-legacy-cards.test.mjs tests/restricted-legacy-interactions.test.mjs tests/restricted-legacy-import.test.mjs tests/restricted-legacy-games.test.mjs
node tests/browser/blame-game.mjs
npm.cmd run check
npm.cmd run audit
npm.cmd run certify:strict
npm.cmd test
```

Set `PLAYWRIGHT_MODULE` to the workstation's installed Playwright module for the browser runner. It checks Blame Game in both the human and AI seats at 1440×1000 and 390×844, including Spotlight, the original opening deck, paid commander casting and stack resolution. Full-suite headless simulations can use the existing `HEADLESS_SHARD_COUNT` / `HEADLESS_SHARD_INDEX` settings without changing the seeds, opponents or completion assertions.
