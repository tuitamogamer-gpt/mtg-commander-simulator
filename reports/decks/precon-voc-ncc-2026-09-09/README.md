# Crimson Vow through New Capenna: ten original precons

Local work requested on 9 September 2026: “hajde narednih 10 import. Ali prije toga prilagodi lading page novim brojevima”. The starting checkout was clean at `4a7a901d97bb76ba5963a033d70534bd3419cb26`. The landing page was corrected to the existing 80-deck catalog before importing this batch, then synchronized to the resulting 90-deck catalog. Local verification was completed first. The subsequent request “Push commit deploy” authorizes publication to the existing main branch and linked Vercel project.

| Original list | Default commander(s) | Edition | Cards | Unique names |
| --- | --- | --- | ---: | ---: |
| [Vampiric Bloodline](vampiric-bloodline.txt) | Strefan, Maurer Progenitor | VOC | 100 | 77 |
| [Spirit Squadron](spirit-squadron.txt) | Millicent, Restless Revenant | VOC | 100 | 79 |
| [Buckle Up](buckle-up.txt) | Kotori, Pilot Prodigy | NEC | 100 | 72 |
| [Upgrades Unleashed](upgrades-unleashed.txt) | Chishiro, the Shattered Blade | NEC | 100 | 75 |
| [Heads I Win, Tails You Lose](heads-i-win-tails-you-lose.txt) | Zndrsplt, Eye of Wisdom + Okaun, Eye of Chaos | SLD | 100 | 87 |
| [Riveteers Rampage](riveteers-rampage.txt) | Henzie "Toolbox" Torre | NCC | 100 | 88 |
| [Obscura Operation](obscura-operation.txt) | Kamiz, Obscura Oculus | NCC | 100 | 86 |
| [Bedecked Brokers](bedecked-brokers.txt) | Perrie, the Pulverizer | NCC | 100 | 89 |
| [Maestros Massacre](maestros-massacre.txt) | Anhelo, the Painter | NCC | 100 | 85 |
| [Cabaretti Cacophony](cabaretti-cacophony.txt) | Kitt Kanto, Mayhem Diva | NCC | 100 | 87 |

## Sources and exact lists

All **1,000 physical cards** match the original quantities independently between Wizards and MTGJSON. The **655 unique names** contain **490 reused definitions and 165 new native definitions**. Primary sources: [VOC original decklists](https://magic.wizards.com/en/news/feature/innistrad-crimson-vow-commander-decklists-2021-11-08), [NEC original decklists](https://magic.wizards.com/en/news/feature/kamigawa-neon-dynasty-commander-decklists-2022-02-07), [SLD original decklists](https://magic.wizards.com/en/news/announcements/heads-i-win-tails-you-lose-commander-decklist-2021-11-18), [NCC original decklists](https://magic.wizards.com/en/news/feature/streets-of-new-capenna-commander-decklists). [decklists.json](decklists.json) records the exact lists, source URLs, snapshot dates and hashes. [oracle.json](oracle.json) preserves Scryfall identifiers, Oracle text and all card faces. The pinned [Moxfield index](../precon-starter-2026-09-06/moxfield-index.tsv) supplies the queue and links; these are independently verified Wizards/MTGJSON lists, not direct Moxfield exports.

Upgrades Unleashed retains the original **two Mossfire Valleys**. The built-in deck preserves that printed exception; the general imported-list validator correctly reports its singleton violation. No substitute card was introduced. Heads I Win, Tails You Lose starts with both **Zndrsplt and Okaun** in the command zone, for human and AI players. The paired default also passes commander color-identity validation.

[source-validation.json](source-validation.json) confirms all preceding **2,427 raw definitions and 81 raw deck records** remain identical, including the excluded Blame Game record. Existing Oracle batches, images, 3,666 image mappings, 80 commander crops and commander videos remain unchanged. Commit/Memory, Dusk/Dawn and Indulge/Excess use the engine's combined split-card cost representation; Tezzeret's Gambit uses its existing equivalent Phyrexian mana spelling. The report records these formatting differences and the existing Bloodthirsty Blade wording difference. Repeating the importer leaves `src/data.js` byte-identical.

| Measure | Before | After |
| --- | ---: | ---: |
| Selectable decks | 80 | 90 |
| Runtime definitions | 20,285 | 20,450 |
| Native raw definitions | 2,427 | 2,592 |
| Eligible for deck import | 20,262 | 20,428 |
| Active unique cards | 3,514 | 3,811 |
| Card/deck checks | 6,570 | 7,395 |

The eligible count increases by 166 because the 165 new definitions also activate the existing Smuggler's Share definition through an original built-in list.

## Rules, landing page and artwork

The landing page now reads the selectable deck count and import-eligible card count from a generated catalog summary before the engine loads, then reconciles them against the live catalog. Hero text, proof figures, metadata and accessible labels agree. `node scripts/sync-landing-counts.mjs` refreshes the cold-load summary for future imports. Both first visit and return from deck selection show **90 decks / 20,428 importable cards**, without overflow at 1440px or 390px.

Native additions cover Blood, connive, casualty, blitz, reconfigure, Vehicle crew costs and Pilot power, coin flips and ignored results, linked exile, hideaway, voting, counter types, copy effects and split aftermath spells. Krark's Thumb handles additional flips and ignored results before win triggers. Henzie offers paid blitz, retains commander tax/reductions, and can use a still-valid exile casting permission. Anhelo's optional casualty payment is limited to the first instant or sorcery each turn. Actual payments, choices, Stack objects, targets and source lifetimes are exercised by dedicated human/local-AI cases.

Shorikai's Pilot retains its crew ability after JSON save/restore. Smuggler's Buggy keeps its hideaway card private from remote and local-AI opponents. A Timothar Bat holding an executable exile link retains the previous safe checkpoint until that link is resolved; its ability is never silently discarded by serialization. Other unsupported active effect closures retain the engine's existing save blockers.

All ten decks have set/year metadata, list-specific guides and key cards, opening advice and AI profiles. [images.json](images.json) records **318 new WebP files**: **307 card/token faces and 11 commander crops**. All 655 source names and their relevant faces have local artwork. The canonical Pilot name shares the NEC Pilot image. Existing commander videos are preserved; no new videos were generated.

## Verification

[qa.json](qa.json) records commands, final results, reconciled diagnostic findings and limitations. [tested-inputs.json](tested-inputs.json) pins the final runtime, tests, scripts and configuration. Raw logs, screenshots and browser states are under `output/precon-voc-ncc-2026-09-09/`.

The final affected run passes **450/450 tests**, and the final planeswalker inventory/combat follow-up passes **10/10**, plus **8/8** in the complete X-mana file. Coverage includes **115 new semantic cases** and complete related casting, coins, crew, damage, ability-loss, save, privacy and inventory files. All **1124 final pinned inputs** match. Only the planeswalker and X-mana inventory tests changed subsequently and their complete files were rerun; all runtime and 450-test inputs remained unchanged. The diagnostic complete suite finished **9094/9099**, with **5 failed cases**: a stale single-face commander assertion, the legacy catalog's new-batch exclusion, the canonical Pilot art alias, the expanded planeswalker inventory, and six newly active X spells. All five are corrected, and their complete affected files pass. The complete suite was not repeated after the final fixes; this report does not claim a fully passing complete-suite run on the final tree.

[runtime-smoke.json](runtime-smoke.json) records **330/330** paid human/local-AI cast or land-entry executions for all 165 additions, with no prerequisite gaps, choice gaps or errors. This broad execution smoke is separate from semantic verification and does not prove every possible interaction. Syntax, source audit, strict certification, preservation, idempotence and whitespace checks pass. Strict certification covers **20,450/20,450 definitions and 7,395/7,395 card/deck checks**.

All **13 deterministic games affected by the new queue** pass on the final runtime, covering all ten additions and the three preceding decks whose opponents changed. Every game has a natural winner before the turn cap, stable recalculation/state invariants, no pending triggers and no recorded AI fallback.

Browser verification passes **40 cases** at 1440px and 390px: 20 selector/pod/review/opening/paid-commander cases and 20 ability cases. Prepared follow-on boards use the real human controller, legal actions, payment, Stack and priority. They exercise Blood creation, Haunting Imitation, Shorikai/Pilot, Chishiro/reconfigure, both coin-flip partners, Henzie/blitz, Change of Plans with X=1, Agent's Toolkit, Anhelo/casualty and Kitt Kanto's tap/target sequence.

A normal-opening **390px Spirit Squadron versus Upgrades Unleashed** match finishes naturally on turn **18**, with 172 UI iterations, four land plays, eight spells and five attack declarations. Rematch preserves the pod/preferences, and the search Escape flow passes. A local Live table passes **seven checks with two humans and two bots**, including private controls, focus preservation, land play, a paid Sol Ring on the shared Stack, human priority, guest reload, host resume and independent bot turns. Browser error collections and horizontal-overflow assertions are clear. The standard game-skill client renders the final landing page. Desktop/mobile landing, paired-commander spotlight, Pilot, reconfigure, finished mobile match and Live screenshots were visually inspected.

Release authorized on 9 September 2026 after local verification. This report preserves the local test snapshot and its full-suite limitations. Independent Git, Vercel and production-browser evidence belongs to `output/precon-voc-ncc-release-2026-09-09/release.json`.
