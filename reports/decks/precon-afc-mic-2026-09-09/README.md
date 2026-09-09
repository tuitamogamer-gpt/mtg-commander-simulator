# Adventures in the Forgotten Realms and Midnight Hunt: next five precons

Local import requested on 9 September 2026 with “Importuj narednih pet”, starting from clean commit `030c0de43607081bed8ea9a07e9c6ecaa948d4e6`. The next original lists after Kaldheim are the four AFC decks and Undead Unleashed. Commander 2021 and Coven Counters were already present. Local verification was completed first. The subsequent request “Push commit deploy” authorizes publication to the existing main branch and linked Vercel project.

| Original list | Default commander | Edition | Cards | Unique names |
| --- | --- | --- | ---: | ---: |
| [Planar Portal](planar-portal.txt) | Prosper, Tome-Bound | AFC | 100 | 75 |
| [Draconic Rage](draconic-rage.txt) | Vrondiss, Rage of Ancients | AFC | 100 | 75 |
| [Aura of Courage](aura-of-courage.txt) | Galea, Kindler of Hope | AFC | 100 | 89 |
| [Dungeons of Death](dungeons-of-death.txt) | Sefris of the Hidden Ways | AFC | 100 | 84 |
| [Undead Unleashed](undead-unleashed.txt) | Wilhelt, the Rotcleaver | MIC | 100 | 75 |

## Sources and preservation

All **500 physical cards** match exact original quantities between Wizards and MTGJSON. The **350 unique names contain 258 reused definitions and 92 new native definitions**. Primary lists: [AFC Commander decklists](https://magic.wizards.com/en/news/announcements/adventures-forgotten-realms-commander-decklists-2021-07-09) and [Midnight Hunt Commander decklists](https://magic.wizards.com/en/news/announcements/innistrad-midnight-hunt-commander-decklists). The [pinned Moxfield index](../precon-starter-2026-09-06/moxfield-index.tsv) supplies queue order and links. These are independently verified Wizards/MTGJSON lists, not direct Moxfield exports. Every original card is retained, without substitutions for legality.

[decklists.json](decklists.json) records source URLs, snapshot dates, export hashes and exact lists. Wizards' `Immoveable Rod` spelling is normalized to the printed identity `Immovable Rod`; no card is replaced. [oracle.json](oracle.json) preserves Scryfall identifiers, Oracle text, legalities and all faces. [dungeons.json](dungeons.json) preserves the three printed dungeon records. The [AFC release notes](https://magic.wizards.com/en/news/feature/adventures-forgotten-realms-release-notes-2021-07-09) informed the dice, dungeon and card-specific rules.

[source-validation.json](source-validation.json) compares the result against the baseline: all **2,335 preceding raw definitions and 76 raw deck records** remain equal, including the excluded Blame Game record. Existing Oracle batches, images, 3,513 card-image mappings, 75 commander crops and commander videos remain unchanged. Realm-Cloaked Giant retains its existing Adventure representation; the report distinguishes its front-only runtime text from the combined source text. There are no printed cost, power or toughness discrepancies. Repeating the importer leaves `src/data.js` byte-identical.

| Measure | Before | After |
| --- | ---: | ---: |
| Selectable decks | 75 | 80 |
| Runtime definitions | 20,193 | 20,285 |
| Native raw definitions | 2,335 | 2,427 |
| Eligible for deck import | 20,170 | 20,262 |
| Active unique cards | 3,372 | 3,514 |
| Card/deck checks | 6,172 | 6,570 |

## Rules, interface and artwork

Native implementations cover die rolls and ignored dice, Class levels, all three dungeon graphs, room triggers and completion, decayed, damage batching, death replacements, linked exile, casting permissions, equipment and Aura effects, X costs and loyalty abilities. Dedicated cases exercise paid human and local-AI decisions, including optional modes, replacement order, source changes, expiry, simultaneous events and mana restrictions. Common-board registration and casting smoke do not establish correctness of every possible card interaction.

Prosper grants the correct exile window and rewards both lands and spells played from exile. Galea privately exposes the top card, permits the relevant Auras and Equipment, and attaches Equipment cast that way. The UI labels this action “Cast from top” and distinguishes a private top card from a publicly revealed one. Rooftop Storm retains command-zone tax; Gorex pays actual, validated graveyard exile costs; Rod of Absorption tracks spells and the source's lifetime. Reanimated black Zombies retain their other types and colors where required. Karazikar uses the engine's timed goad effect. Liliana's loyalty actions require the controller's main phase, an empty Stack and the normal once-per-turn limit.

Dungeon progress and completion counts are visible in player details and survive JSON checkpoint restore and Live presentation. Decayed and Dragon Spirit token abilities survive save/restore. Live serialization keeps Galea's top card private. States containing unsupported active effect closures retain the existing save blocker instead of silently discarding rules.

All five decks have guides, opening advice, list-specific key cards, set/year metadata and AI profiles. [images.json](images.json) records **157 new WebP files**: 143 card faces, five commander crops, three dungeons and six token variants. The Dragon Spirit canonical alias shares its AFC token art. All 350 source names and their relevant faces have local artwork. No commander videos were generated.

## Verification

Exact commands, results, reconciled findings and limitations are recorded in [qa.json](qa.json). [tested-inputs.json](tested-inputs.json) pins the final runtime, test and configuration inputs. Raw logs, screenshots and browser states are under `output/precon-afc-mic-2026-09-09/`.

The final affected run passes **709/709**, including **100 new semantic cases**, complete planeswalker timing, X-cost, source-lifetime, damage, replacement, save/restore, privacy and inventory files. All **1,096 pinned inputs** remain unchanged across final verification. The diagnostic complete suite finished **8,947/8,960**, with **13 failed cases**. Its findings included stale inventories, Karazikar's goad call, the Dragon Spirit canonical art alias and Liliana's timing flag. All are corrected and the complete affected files pass. The complete suite was not repeated after the final fixes; this report does not claim a fully passing complete-suite run on the final tree.

All **eight deterministic games involving a new deck** pass after the fixes, with natural winners, stable state, no pending triggers and no AI fallback. They cover all five new decks and the three preceding seats whose opponents change with this batch. [runtime-smoke.json](runtime-smoke.json) separately records **184/184** paid cast/entry executions for all 92 additions, without prerequisite gaps, choice gaps or errors. The original human-question inspector passes 91 actual nonland casts, 260 questions and 18 available activations on the final tree, along with its two defensive cases. Its fixture supplies the Forest required by Utopia Sprawl and graveyard creatures for Hour of Eternity. Underdark Rift is covered by the separate native land smoke. Syntax, source audit, strict certification, preservation, idempotence and whitespace checks pass. Strict certification covers all 20,285 definitions and 6,570 card/deck checks without failures.

Browser verification passes **20 cases at 1440px and 390px**: ten selector/pod/review/opening/paid-commander cases and ten ability cases. Prepared follow-on boards retain the real human controller, legal actions, payment, Stack, priority and combat. They exercise Prosper's exile cast and Treasure, Vrondiss's die-triggered damage and Dragon Spirit, Galea's top-library Equipment and attack, a paid Dungeon Map venture, and Wilhelt's decayed token after a sacrifice. The final Galea wording was separately replayed at both widths.

A normal-opening **390px Undead Unleashed versus Aura of Courage** match finishes naturally on turn **17**, with 195 UI iterations, six lands, ten spells and five attack declarations. Rematch, preserved pod/preferences and the search Escape flow pass. A local Live table passes **seven checks with two humans and two bots**, including guest-private controls, focus preservation, land play, a paid Sol Ring on the shared Stack, human priority, guest reload, host resume and independent bot turns. Captured browser errors and horizontal overflow checks are clear. The standard game-skill client renders the updated 80-deck landing page; landing, commander, token, dungeon and mobile-game screenshots were visually inspected.

Release authorized on 9 September 2026 after completion of the local import. This report preserves the local verification snapshot; independent Git, deployment and production-browser evidence belongs to `output/precon-afc-mic-release-2026-09-09/release.json`.
