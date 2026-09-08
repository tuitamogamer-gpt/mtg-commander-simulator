# Commander 2015 and Commander 2016: ten original precons

Imported locally on 8 September 2026. These are the next two annual five-deck editions after the completed C14 batch. Existing alternate editions are not imported twice.

| Original decklist | Default commander | Edition | Unique names |
| --- | --- | --- | ---: |
| [Call the Spirits](call-the-spirits.txt) | Daxos the Returned | C15 | 78 |
| [Seize Control](seize-control.txt) | Mizzix of the Izmagnus | C15 | 75 |
| [Plunder the Graves](plunder-the-graves.txt) | Meren of Clan Nel Toth | C15 | 77 |
| [Wade into Battle](wade-into-battle.txt) | Kalemne, Disciple of Iroas | C15 | 77 |
| [Swell the Host](swell-the-host.txt) | Ezuri, Claw of Progress | C15 | 77 |
| [Entropic Uprising](entropic-uprising.txt) | Yidris, Maelstrom Wielder | C16 | 84 |
| [Open Hostility](open-hostility.txt) | Saskia the Unyielding | C16 | 88 |
| [Stalwart Unity](stalwart-unity.txt) | Kynaios and Tiro of Meletis | C16 | 84 |
| [Breed Lethality](breed-lethality.txt) | Atraxa, Praetors' Voice | C16 | 83 |
| [Invent Superiority](invent-superiority.txt) | Breya, Etherium Shaper | C16 | 86 |

## Sources and preservation

The lists were retrieved from [Wizards: Commander 2015](https://magic.wizards.com/en/news/feature/commander-2015-edition-decklists-2015-11-06) and [Wizards: Commander 2016](https://magic.wizards.com/en/news/announcements/commander-2016-edition-decklists-2016-10-28), then independently matched by exact card names and quantities against ten MTGJSON deck files. Every deck contains 100 cards, including its commander. Color identity, singleton rules, Commander legality and the actual deck-import validator pass.

The existing Moxfield index supplies the queue links. Direct Moxfield API requests returned HTTP 403; **these are verified Wizards/MTGJSON lists, not direct Moxfield exports**. [decklists.json](decklists.json) records each source URL, snapshot date and SHA-256. The ten text exports, original intake baseline and all 616 Scryfall Oracle records are retained here. Cached original source responses remain in the local output folder.

The 1,000 physical cards contain **616 unique names: 474 reused and 142 added**. Every addition has an explicit native script; the importer refuses missing implementations. Repeating intake adds nothing. [source-validation.json](source-validation.json) proves all 1,832 previous raw definitions and all 43 previous raw deck records remain equal to baseline `3617270`; one excluded deck remains excluded. All 178 generic Oracle batches, the dedicated Sauron batch and existing image/video files are unchanged.

| Measure | Before | After |
| --- | ---: | ---: |
| Selectable decks | 42 | 52 |
| Runtime definitions | 19,690 | 19,832 |
| Native raw definitions | 1,832 | 1,974 |
| Eligible for deck import | 19,655 | 19,801 |
| Unique cards in active decks | 2,218 | 2,567 |
| Card/deck checks | 3,468 | 4,277 |

Four reused cards become importable through active-deck coverage: Anya, Merciless Angel; Gisela, Blade of Goldnight; Rite of the Raging Storm; and Seal of Cleansing. The source comparison finds only two self-reference wording differences (Anya and Boros Garrison), plus existing hybrid/Phyrexian mana and split-card notation differences. The preserved source report records these explicitly.

## Rules and interface

Six native modules implement the 142 additions. Scenarios cover experience counters and dynamic Daxos Spirits, Mizzix reductions, Kalemne and Ezuri triggers, Yidris cascade, Saskia's chosen player, Kynaios choices, partner commanders, myriad, additional combat, control of players and blocking, linked exile, copied objects, suspend X, bestow, manifest, cycling, cipher, graveyard permissions, delayed return, modal spells, multikicker targets and additional reveal/sacrifice costs.

Existing Meren, Atraxa and Breya definitions are reused and exercised for human and local-AI play. Proliferate now includes experience counters; both AI implementations recognize that benefit. Experience is visible beside life totals and in proliferate selections. JSON saves preserve experience, Saskia's choice and the complete Daxos Spirit definition. As with the existing checkpoint policy, positions with unportable ongoing control or linked effects retain the previous checkpoint instead of silently dropping rules state.

Cross-deck regressions include Oreskos Explorer with zero allowed search cards, older attack events without an explicit player field, Jaya's validated graveyard casting permissions, and Hushwing Gryff suppressing triggers from counters placed as a creature enters.

All ten decks have set labels, strategy guides, verified key-card lists, opening advice and local-AI profiles. **362 new WebP assets** comprise 349 card faces, three token faces and ten commander crops. All 616 source cards have local images. [images.json](images.json) retains Scryfall printing IDs, source URLs and file hashes. The 28 existing commander videos remain unchanged; this batch adds no videos.

## Verification evidence

The complete release run on the merged final code passes **7,698/7,698 tests**, with no failures, skipped or cancelled tests (Node v22.22.3; four concurrent test files). Runtime and test files remained unchanged throughout the run. A validation-only correction makes the preservation check distinguish newly added images from changes to baseline images after staging; the corrected check also passes. The earlier isolated run and its three corrected failures remain recorded in [qa.json](qa.json).

The final shared checkout passes **104/104 focused tests**, including 96 dedicated C15/C16 scenarios, plus **42/42** controller/priority/save regressions. The final image/planeswalker inventory and Spotlight tests pass. Syntax, source audit and strict certification pass at **19,832/19,832 definitions** and **4,277/4,277 card/deck checks**.

Dedicated rule assertions and common-board execution smoke are separate evidence. The smoke report covers **284/284 human/local-AI cases for 142 new cards**, with no prerequisite gaps, choice gaps or runtime errors. It does not claim exhaustive interaction or mode coverage.

The browser scenarios cover the standard selector, pod, review and 100-card opening hand, followed by actual paid commander casting and Stack resolution for all ten decks at 1440px and 390px: **20/20 pass**. Two additional desktop/mobile scenarios cast an enchantment, pay for Daxos's Spirit, cast a proliferate spell and select the player through the real UI; experience and Spirit size both increase correctly. Two further desktop/mobile cases retain the actual recording controller from main.js, pay for Cruel Entertainment, play a land from the controlled opponent’s hand, let the AI control the other turn and restore the original viewpoint: **24/24 browser cases in total**. No captured console/network errors or horizontal overflow are present.

The final normal-opening 390px Wade into Battle versus Swell the Host match completes on turn 22: **110 UI iterations, five lands, eleven spells, seven attack declarations and eleven decision types**, followed by rematch. Its human policy develops creatures first and declines optional kicker; every decision still uses real clicks or keys. The earlier generic driver repeatedly proposed an impossible kicked Orim’s Thunder; that diagnostic log is retained separately. All 52 four-player deterministic games reached natural winners in the isolated run. The ten new deck games were rerun in the final shared checkout after the kicker corrections and all passed, with no waiting triggers. The game skill client confirms the 52-deck landing state; representative selector, Stack, battlefield, proliferate, controlled-hand and completed-game screenshots were visually inspected.

Final suite counts, source hashes and the combined-checkout checks are recorded in [qa.json](qa.json). Raw logs, snapshots and screenshots are under `output/precon-c15-c16-2026-09-08/`.

The implementation was prepared in an isolated worktree, then merged by file against the baseline so concurrent multiplayer changes in the shared checkout remain intact. The user subsequently authorized commit, push and deployment before the next ten-deck intake. Release verification is retained under `output/precon-c15-c16-release-2026-09-08/`.
