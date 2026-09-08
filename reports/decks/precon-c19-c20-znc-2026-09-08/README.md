# Commander 2019–2020 and Zendikar Rising: next eight precons

Completed locally on 8 September 2026 after the authorized publication of the preceding ten C17–C19 precons. That release is commit `decdf93ee28e101442a9ed253b81a031d626d5d1`, verified on origin/main and Vercel production in `READY` state; its evidence is under `output/precon-c17-c19-release-2026-09-08/`. The user subsequently authorized commit, push and production deployment of these eight. Release evidence is recorded under `output/precon-c19-c20-znc-release-2026-09-08/`.

The user explicitly requested **every original card regardless of legality**. All eight original 100-card lists are retained, including **Dockside Extortionist** in Mystic Intellect. Its catalog metadata still says `banned`; legality produces an informational warning. Deck size, singleton restrictions, color identity and engine support remain validated.

| Original list | Default commander | Edition | Unique names |
| --- | --- | --- | ---: |
| [Mystic Intellect](mystic-intellect.txt) | Sevinne, the Chronoclasm | C19 | 82 |
| [Faceless Menace](faceless-menace.txt) | Kadena, Slinking Sorcerer | C19 | 88 |
| [Timeless Wisdom](timeless-wisdom.txt) | Gavi, Nest Warden | C20 | 88 |
| [Enhanced Evolution](enhanced-evolution.txt) | Otrimi, the Ever-Playful | C20 | 85 |
| [Ruthless Regiment](ruthless-regiment.txt) | Jirina Kudro | C20 | 87 |
| [Arcane Maelstrom](arcane-maelstrom.txt) | Kalamax, the Stormsire | C20 | 85 |
| [Symbiotic Swarm](symbiotic-swarm.txt) | Kathril, Aspect Warper | C20 | 85 |
| [Sneak Attack](sneak-attack.txt) | Anowon, the Ruin Thief | ZNC | 72 |

## Sources and preservation

The selection completes Commander 2019, imports all five Commander 2020 decks, then takes Sneak Attack in the pinned Zendikar Rising queue order. Land's Wrath is the next unimported list. The source lists were matched by exact names and quantities between Wizards and MTGJSON. [decklists.json](decklists.json) records both URLs, source snapshot dates, hashes, exports and Moxfield queue links. **These are Wizards/MTGJSON lists, not direct Moxfield exports.** Direct Moxfield API access was not attempted for this batch.

Primary lists: [Commander 2019](https://magic.wizards.com/en/news/feature/decks-commander-2019-edition-2019-08-08), [Timeless Wisdom](https://magic.wizards.com/en/news/announcements/timeless-wisdom-2020-04-06), [Enhanced Evolution](https://magic.wizards.com/en/news/announcements/enhanced-evolution-2020-04-06), [Ruthless Regiment](https://magic.wizards.com/en/news/announcements/ruthless-regiment-2020-04-06), [Arcane Maelstrom](https://magic.wizards.com/en/news/announcements/arcane-maelstrom-2020-04-06), [Symbiotic Swarm](https://magic.wizards.com/en/news/announcements/symbiotic-swarm-2020-04-06), and [Zendikar Rising Commander](https://magic.wizards.com/en/news/card-preview/zendikar-rising-commander-decklists-2020-09-09).

The **800 physical cards contain 547 unique names: 398 reused and 149 new native definitions**. [oracle.json](oracle.json) retains all source records, print IDs, legalities and card faces. The source name Beanstalk Giant resolves to the existing `Beanstalk Giant // Fertile Footsteps` definition after matching its Oracle ID; it creates no duplicate. The intake refuses missing native implementations or simplified/autoscripted additions. Registration is checked separately from executable behavior.

[source-validation.json](source-validation.json) compares against the published `decdf93` baseline. All 2,144 previous raw definitions and 63 raw deck records remain identical, including the excluded deck record. Generic Oracle batches, prior images and mappings, and all 28 commander videos remain unchanged.

| Measure | Before | After |
| --- | ---: | ---: |
| Selectable decks | 62 | 70 |
| Runtime definitions | 20,002 | 20,151 |
| Native raw definitions | 2,144 | 2,293 |
| Eligible for deck import | 19,974 | 20,126 |
| Active unique cards | 2,935 | 3,225 |
| Card/deck checks | 5,117 | 5,789 |

Agitator Ant, Frontier Warmonger and Sevinne's Reclamation become importable through active-deck coverage. The comparison retains two existing Oracle wording variations (Bloodthirsty Blade and Boros Garrison), plus equivalent cost notation for four split cards and Tezzeret's Gambit's Phyrexian mana symbol. These differences are listed rather than rewriting prior raw records.

## Rules, interface and assets

The native implementation covers cycling discounts and first-use limits, triggered discards and second-card draws, morph/megamorph with nonmana costs, mutate, simultaneous spell copies and Twinning Staff, graveyard casting, linked exile permissions, keyword inheritance/counters, X loyalty, ending combat, protection, attack requirements and mana from lands with acquired abilities. The [C19 release notes](https://magic.wizards.com/en/news/feature/commander-2019-edition-release-notes-2019-08-09), [Ikoria/C20 release notes](https://magic.wizards.com/en/news/feature/ikoria-lair-behemoths-and-commander-2020-edition-release-notes-2020-04-10) and [Ikoria mechanics](https://magic.wizards.com/en/news/feature/ikoria-lair-behemoths-mechanics-2020-04-02) informed the dedicated rules cases.

Mutate preserves one battlefield object's identity, summoning status and attachments while retaining physical components and their combined abilities. Tests cover choosing over/under, failed targets entering normally, ownership versus control, copied mutate spells, face-down components, commander identity/damage, zone replacements, ordered departures, token components, linked blink, undying/persist and controller departure. The UI shows the merged count and constituent names with face-down privacy. The local AI compares prospective top characteristics when deciding the merge order.

Gavi's first free cycling replaces the printed cycling cost while retaining the discard action. Copy batches preserve original spell parameters and trigger once for the specified copying instruction. Nonmana morph costs are paid before turning face up; Gift of Doom then attaches without targeting. Mandate of Peace stops the current combat and applies its remaining-turn casting restriction while ordinary end-of-combat effects still resolve normally.

Portable saves explicitly retain the preceding safe checkpoint when merged graphs or lasting linked permissions cannot yet be serialized. They do not silently drop those effects. These implementations and tests do not claim exhaustive proof of every cross-catalog combination.

All eight decks have set/year metadata, guides, opening advice, actual-list key cards and AI profiles. [images.json](images.json) records **307 new WebP files**: 293 card faces/aliases, six original token variants and eight commander crops. All 547 source names and relevant faces have local art. The image manifest contains 3,360 card-image keys and 70 commander crops, preserving all 3,059 prior card mappings and 62 prior crops. Canonical Faerie Rogue and Hydra token aliases point to their original variant images. No videos were generated.

## Verification

The complete suite finished **8,785/8,808**, with 23 failed tests. The final affected run passes **1,811/1,811 across 29 complete test files**, including all 14 dedicated C19–C20 native test files. The failing Oracle aggregate was rerun for all **56 affected card names**, both controller roles and every declared operation: **216 invariant games pass**, covering all 116 previously failed execution contexts. There are no outstanding failures from the run.

The 23 findings are individually reconciled in [qa.json](qa.json): expanded card/planeswalker/X inventories and fixtures, token aliases, missing Sneak Attack year metadata, the copy-proof recorder's new batch path, and an actual endCombatStep regression. Browser play also found an asset URL being rewritten by prose translation and an unportable Abort-cast response; their complete related suites passed 16/16 after the fixes.

**The full suite was not rerun after those corrections and did not have a frozen starting manifest.** Final affected tests, filtered Oracle proof and eight final deck games used 1,050 unchanged inputs recorded in [tested-inputs.json](tested-inputs.json). This is the precise verification scope, not an all-green full-suite claim for the final tree.

Final syntax, source audit, strict certification, preservation, idempotence and diff checks pass. Strict certification covers 20,151 definitions and 5,789 card/deck checks. The dependency audit reports zero vulnerabilities. [runtime-smoke.json](runtime-smoke.json) records **298/298** paid cast/entry executions, one human and one real local-AI case per new card, without prerequisite gaps, choice gaps or errors; separate dedicated tests assert meanings and interactions.

Browser verification includes **32 desktop/mobile scenarios** at 1440px and 390px: 16 selector/pod/review/opening/paid-commander cases and 16 commander mechanic cases. Each uses real controls, mana payment and Stack resolution; follow-on prepared boards are identified in the scripts. The mixed Live table passes **7/7** checks covering two humans and two bots, guest privacy and focus, land play, a paid spell on the shared Stack, all-human priority, guest reload and host resume. Captured browser errors and horizontal overflow are zero.

A normal-opening mobile Sneak Attack versus Ruthless Regiment match finishes naturally on turn 22, after 298 UI iterations, seven land plays, eleven spells, six attack declarations and twelve decision types. Rematch preserves the pod and preferences. The full suite completed deterministic four-player games for all 70 active decks; after the final engine fixes, all eight new-deck games were repeated and reached natural winners with stable state, no pending triggers and no AI fallback. The unmodified game-skill client confirms the 70-deck landing screen. Selector, merged creature, original token, completed-match, rematch and landing screenshots were visually inspected.

Raw logs, browser state and screenshots are under `output/precon-c19-c20-znc-2026-09-08/`. [qa.json](qa.json) records commands, failures, corrections, evidence hashes, scope and publication status. The local verification above precedes the subsequent release authorization. Publication and production verification are recorded separately under `output/precon-c19-c20-znc-release-2026-09-08/`.
