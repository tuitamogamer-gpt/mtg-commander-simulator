# Commander 2017–2019: next ten original precons

Imported locally after the authorized C15/C16 release on 8 September 2026. This batch contains all four Commander 2017 decks, all four Commander 2018 decks, then Merciless Rage and Primal Genesis from Commander 2019 in the pinned queue order. The preceding C15/C16 release is commit `1662ff2`. This report records the completed local verification. The user subsequently authorized commit, push and deployment of this batch on 8 September 2026; release evidence is recorded under `output/precon-c17-c19-release-2026-09-08/`.

| Original decklist | Default commander | Edition | Unique names |
| --- | --- | --- | ---: |
| [Draconic Domination](draconic-domination.txt) | The Ur-Dragon | C17 | 87 |
| [Vampiric Bloodlust](vampiric-bloodlust.txt) | Edgar Markov | C17 | 88 |
| [Feline Ferocity](feline-ferocity.txt) | Arahbo, Roar of the World | C17 | 89 |
| [Arcane Wizardry](arcane-wizardry.txt) | Inalla, Archmage Ritualist | C17 | 83 |
| [Exquisite Invention](exquisite-invention.txt) | Saheeli, the Gifted | C18 | 75 |
| [Subjective Reality](subjective-reality.txt) | Aminatou, the Fateshifter | C18 | 87 |
| [Nature's Vengeance](nature-s-vengeance.txt) | Lord Windgrace | C18 | 85 |
| [Adaptive Enchantment](adaptive-enchantment.txt) | Estrid, the Masked | C18 | 80 |
| [Merciless Rage](merciless-rage.txt) | Anje Falkenrath | C19 | 82 |
| [Primal Genesis](primal-genesis.txt) | Ghired, Conclave Exile | C19 | 84 |

## Sources and preservation

The original [Wizards C17](https://magic.wizards.com/en/news/feature/commander-2017-edition-decklists-2017-08-11), [C18](https://magic.wizards.com/en/news/feature/commander-2018-edition-decklists-and-tokens-2018-07-27) and [C19](https://magic.wizards.com/en/news/feature/decks-commander-2019-edition-2019-08-08) lists were independently matched by exact names and quantities against MTGJSON. All ten contain 100 physical cards, including the default commander. Color identity, singleton rules, Scryfall Commander legality and the real deck importer pass.

The pinned Moxfield index supplies queue links. **These are verified Wizards/MTGJSON lists, not direct Moxfield exports.** Direct Moxfield API access was not tested for this second batch. [decklists.json](decklists.json) retains source URLs, source snapshot dates and SHA-256 hashes. [oracle.json](oracle.json) preserves all 663 source records, including both Budoka Gardener faces. The runtime uses the front name for the flip card.

The 1,000 physical cards contain **663 unique names: 493 reused and 170 added**. Each addition has an explicit native implementation. The importer refuses a missing implementation or simplified/autoscripted definition. Dedicated behavior tests are separate from this registration gate.

[source-validation.json](source-validation.json) compares against `1662ff20b52941d5202eee6540e4a45532e2a6cd`: all 1,974 previous raw definitions and 53 raw deck records remain identical, including the excluded deck record. Generic Oracle batches, the Sauron batch, prior images and all 28 commander videos remain unchanged.

| Measure | Before | After |
| --- | ---: | ---: |
| Selectable decks | 52 | 62 |
| Runtime definitions | 19,832 | 20,002 |
| Native raw definitions | 1,974 | 2,144 |
| Eligible for deck import | 19,801 | 19,974 |
| Active unique cards | 2,567 | 2,935 |
| Card/deck checks | 4,277 | 5,117 |

Three reused cards become importable through active-deck coverage: Ancient Stone Idol, Disrupt Decorum and Winds of Rath. Two retained source wording differences concern Bloodthirsty Blade and Boros Garrison; printed costs, power and toughness match the comparison source.

## Rules and interface

The native modules implement Eminence, the four planeswalker commanders, discard and madness, populate, umbra armor, enchantment and Equipment attachments, linked exile and acquired abilities, copy effects, ninjutsu from the command zone, bloodthirst, additional costs, play permissions, protection and life-total locking, reversed turn order, searches and retargeting.

New Blood changes creature-type text in native abilities and recompiles structured Oracle descriptors. Its additional cost taps an untapped Vampire before the spell reaches the Stack. Copies retain the original copiable text. Native literal creature-type queries now use a scoped text helper; dynamically chosen types remain chosen values. This broad shared path is covered by dedicated native/Oracle/token/copy cases and the full regression package, not claimed as proof of every possible text-changing permutation.

Leonin Arbiter blocks library search choices and offers each player a separate paid special action. Local AI pays before an affordable search and avoids wasting that payment without a search. Fist of Suns combines its alternative cost with an existing paid permission to cast from another zone. Teferi's Protection preserves ordinary mana payments while preventing life payments.

JSON saves preserve reversed turn order, prior attack history and Budoka's flip status. Positions with unportable linked-exile or play-permission state retain the preceding checkpoint according to the existing save policy, rather than dropping those effects.

All ten decks have verified strategy guides, key cards, opening advice, set labels and AI profiles. There are **386 new WebP assets: 369 card faces/aliases, seven token faces and ten commander crops**. Every one of the 663 source names has local art, including the Dokai alias. All 2,683 previous card-image mappings and 52 commander-art mappings remain identical. [images.json](images.json) records print IDs, source image URLs and hashes. This batch adds no commander videos.

## Verification

The complete regression run finished **8,074/8,077**, with three recorded failures: an exact card name incorrectly flagged by the language audit, a null Channel source in the Treasure Nabber mana wrapper, and the old 88-card X-spell inventory (now 95). After correcting those three bounded issues, the complete affected test files, all 355 dedicated C17–C19 cases and related mana regressions pass **442/442**, with **zero outstanding failures**. The full 8,077-test suite was not repeated after these corrections. [qa.json](qa.json) retains both results and failure explanations; [tested-inputs.json](tested-inputs.json) records all 936 inputs and the exact three files changed after the full run.

Final syntax, deck audit, strict certification, source preservation, idempotence and dependency audit pass. Strict certification covers 20,002 definitions and 5,117 card/deck checks; dependency vulnerabilities are zero. The local Live test also passes 7/7, covering two humans with two bots, guest land and paid spell/Stack decisions, guest reload and host resume. Concurrent commit `9f9806f` (surveil and unblockable presentation) remains preserved.

[runtime-smoke.json](runtime-smoke.json) records **340/340** common-board executions, one human and one real local-AI case per added card, with zero prerequisite gaps, choice gaps or errors. Cauldron Dance runs during actual opponent combat and New Blood receives an explicit untapped Vampire prerequisite. This is cast/entry execution evidence; dedicated tests separately assert card meanings, costs, lifetimes, choices and interactions.

The browser checks pass **42 scenarios**: 20 normal selector/pod/review/opening-hand/paid commander casts; 20 commander ability and combat cases; and two New Blood plus searchable card-name cases. Each runs at 1440px and 390px. Commands use real UI controls, pay costs, resolve the Stack and check final state. Controlled follow-on boards are identified in the test scripts. Captured errors and horizontal overflow are zero.

The normal-opening mobile Primal Genesis versus Vampiric Bloodlust match reaches a natural result on turn 18, using 199 UI iterations, five land plays, seven spells and six attack declarations. Eleven decision types were exercised, followed by a successful rematch preserving the pod and preferences. All 62 four-player deterministic games also reach natural winners without a turn-limit finish or waiting triggers.

The standard game skill client confirms the 62-deck landing state. Selector, combat, tokens, completed-game and card-name screens were visually inspected. Full-suite and final gate results are recorded in [qa.json](qa.json). Raw logs, state snapshots and screenshots are retained under `output/precon-c17-c19-2026-09-08/`.
