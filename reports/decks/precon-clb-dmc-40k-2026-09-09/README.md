# CLB / DMC / Warhammer 40,000 — ten original precons

Completed locally on 9 September 2026, based on `22dcc1432f8560eff0806145df24a2d62c3c68e1`. This batch adds **10 decks with all 1,000 printed cards**, reuses **493** of the **681** distinct card names, and implements **188 new native definitions**. The catalog now contains **100 selectable decks**, **20,638 definitions**, and **20,619 importable definitions**. No commit, push or deployment was requested or performed.

## Imported decks

| Deck | Default commander | Edition | Cards |
| --- | --- | --- | ---: |
| Mind Flayarrrs | Captain N'ghathrod | CLB | 100 |
| Party Time | Nalia de'Arnise | CLB | 100 |
| Draconic Dissent | Firkraag, Cunning Instigator | CLB | 100 |
| Exit from Exile | Faldorn, Dread Wolf Herald | CLB | 100 |
| Painbow | Jared Carthalion | DMC | 100 |
| Legends' Legacy | Dihada, Binder of Wills | DMC | 100 |
| Tyranid Swarm | The Swarmlord | 40K | 100 |
| The Ruinous Powers | Abaddon the Despoiler | 40K | 100 |
| Necron Dynasties | Szarekh, the Silent King | 40K | 100 |
| Forces of the Imperium | Inquisitor Greyfax | 40K | 100 |

## Sources and preservation

The pinned [Moxfield index](../precon-starter-2026-09-06/moxfield-index.tsv) supplies queue order and links. These are **verified Wizards / MTGJSON lists**, not direct Moxfield exports. Every list independently matches its official Wizards decklist and its MTGJSON edition export; original cards are retained regardless of current legality.

- [Baldur's Gate official decklists](https://magic.wizards.com/en/news/feature/commander-legends-battle-for-baldurs-gate-commander-decklists)
- [Dominaria United official decklists](https://magic.wizards.com/en/news/feature/dominaria-united-commander-decklists-2022-08-19)
- [Warhammer 40,000 official decklists](https://magic.wizards.com/en/news/announcements/warhammer-40000-commander-decklists)
- [Per-deck MTGJSON URLs, exact source totals and SHA-256 digests](source-validation.json)

[decklists.json](decklists.json) and the ten text exports retain exact quantities. [oracle.json](oracle.json) retains full Scryfall faces and source metadata. Adventure front names are normalized to the existing combined definitions for Beanstalk Giant and Embereth Shieldbreaker; their spell halves remain implemented separately. Four other preserved definitions differ from current Oracle only in self-reference wording (Bloodthirsty Blade, Boros Garrison, Steel Hellkite and Vengeful Ancestor). These six documented text differences do not justify rewriting previous card records.

All **2,592 previous raw definitions**, **91 previous raw deck records**, **3,974 image mappings**, **91 commander crops** and every previously tracked asset remain unchanged as data. The importer is byte-idempotent. Kher Keep, Spectacular Showdown and War Room already had definitions and become eligible through this active-deck batch; therefore import eligibility grows by 191 while definitions grow by 188.

## Native behavior and presentation

The added modules implement party, initiative and the Undercity, ravenous/X, unearth, Backgrounds, cascade grants, graveyard and exile casting, six Sagas, the new planeswalkers, extra costs, copy effects, borrowed artifact abilities and the remaining printed mechanics. Shared engine hooks cover actual mana and nonmana costs, restricted X mana, replacement effects, searching the correct player's library, entry state, source lifetime, targets, combat obligations and checkpoint safety. Semantic tests exercise costs and Stack resolution rather than treating registration as proof of rules.

All ten decks have their own metadata, strategy guides, opening advice, legal key cards and AI profiles. **394 local WebP assets** include ten commander crops, printed card/Adventure faces, Undercity artwork and twenty token variants. [images.json](images.json) records provenance and file digests. Existing videos are preserved; no new videos were created. Cold landing and runtime counts both display the expanded catalog. Initiative is visible in player status.

## Verification

| Check | Final result | Evidence |
| --- | --- | --- |
| Exact source lists, preservation, idempotence and artwork hashes | Pass | [source-validation.json](source-validation.json) |
| Complete affected regression files | **823/823** | `output/precon-clb-dmc-40k-2026-09-09/final-affected-test.log` |
| Search, draw and zone replacement files | **196/196** | `search-draw-final.log` |
| New native semantic cases (included in the 823) | **67/67** | `rules-final.log` |
| Complete player-facing cast/activation inspectors | **4/4** | `player-facing.log` |
| Paid human / local-AI execution for all 188 additions | **376/376** | [runtime-smoke.json](runtime-smoke.json) |
| Deterministic four-player games containing new decks | **13/13** | `final-affected-games.json` |
| Desktop/mobile deck selection and paid commander casting | **20/20** | `browser/result.json` |
| Desktop/mobile paid native ability scenarios | **20/20** | `abilities/result.json` |
| Two-human / two-bot local Live controls, privacy and reconnect | **7/7** | `live/result.json` |
| Natural 390px human game and rematch | **Pass, turn 20** | `natural-game/result.json` |
| Syntax / source audit / strict certification | **Pass** | `check-final.log`, `audit-final.log`, `certify-final.log` |

The 13 deterministic games use the original regression seeds, reach natural winners before the turn cap, and finish without pending triggers, runtime errors or AI/decision fallback. Additional assertions check zone/controller invariants and stable recalculation. The natural mobile game uses Necron Dynasties against Tyranid Swarm and completes 10 land plays, 11 spell casts and four attack declarations through real controls before rematching. Prepared-board browser checks cover one distinct card mechanic per new deck at 1440px and 390px. Local Live uses Necron host, Tyranid/Imperium bots and a private custom mono-green guest deck to make real guest mana and casting deterministic. Recorded browser/page errors are empty.

Representative desktop, mobile, new artwork, resolved abilities and Live screenshots were visually inspected, as were the unmodified develop-web-game client's two screenshot/state outputs. Strict certification reports **20,638/20,638 definition checks** and **8,211/8,211 active card/deck checks**; that structural audit is separate from semantic and gameplay evidence.

## Diagnostic findings and limits

The initial complete repository run finished **9,159/9,181** with **22 failures**. It began before final corrections. Findings included stale catalog/artwork/planeswalker/X inventories, synthetic cast events without spell objects, a missing explore helper, uninitialized next-spell cascade grants, and a missing legal graveyard target in Jared's test fixture. [qa.json](qa.json) records every original failure and its resolution. Complete affected files and the full player-facing inspector pass; the affected headless games are replayed with the original seeds.

**A green rerun of the entire final repository suite is not claimed.** The browser checks use Chromium and selected mechanics; they do not prove every possible card interaction. The final [input manifest](tested-inputs.json) is a completion snapshot captured after validation, while the diagnostic and browser runs preceded some final rule corrections. All evidence here concerns the local checkout, not production.

## Reproduction and artifacts

Run `node scripts/import-clb-dmc-40k-precons.mjs --write` to reapply the pinned intake; `node scripts/verify-clb-dmc-40k-import.mjs` verifies independent sources, baseline preservation, images and idempotence. Run `node scripts/smoke-clb-dmc-40k-precons.mjs` and `node scripts/smoke-clb-dmc-40k-games.mjs --affected-opponents` for paid execution and complete games. Full resolved test-file commands are in [qa.json](qa.json). The four browser scripts are under `tests/browser/clb-dmc-40k-*.mjs`; set `PLAYWRIGHT_MODULE` to the installed Playwright module, `ARENA_VIEWPORT_WIDTH=390` / `ARENA_VIEWPORT_HEIGHT=844` for the natural mobile game and `BOT_SEATS=1,3` for the mixed Live scenario.

Structured source and QA reports live in this directory. Raw source caches, logs, browser states and screenshots remain under `output/precon-clb-dmc-40k-2026-09-09/` (ignored by Git). [tested-inputs.json](tested-inputs.json) pins the final source, test and configuration files for future publication checks.
