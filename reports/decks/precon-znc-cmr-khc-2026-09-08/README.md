# Zendikar Rising, Commander Legends and Kaldheim: next five precons

Local import requested on 8 September 2026 with “Import 5 sljedećih”, starting from clean commit `721f859`. This batch adds the next five original lists after Sneak Attack. Every original card is retained under the user's existing instruction, with no substitutions for legality. The subsequent request “Push commit deploy” authorizes publication to the existing main branch and Vercel project.

| Original list | Default commander | Edition | Unique names |
| --- | --- | --- | ---: |
| [Land's Wrath](land-s-wrath.txt) | Obuun, Mul Daya Ancestor | ZNC | 82 |
| [Arm for Battle](arm-for-battle.txt) | Wyleth, Soul of Steel | CMR | 79 |
| [Reap the Tides](reap-the-tides.txt) | Aesi, Tyrant of Gyre Strait | CMR | 72 |
| [Phantom Premonition](phantom-premonition.txt) | Ranar the Ever-Watchful | KHC | 77 |
| [Elven Empire](elven-empire.txt) | Lathril, Blade of the Elves | KHC | 73 |

## Sources and preservation

All five 100-card lists match exact names and quantities between Wizards and MTGJSON. Primary lists: [Zendikar Rising Commander](https://magic.wizards.com/en/news/card-preview/zendikar-rising-commander-decklists-2020-09-09), [Commander Legends](https://magic.wizards.com/en/news/feature/commander-legends-commander-decklists-2020-11-05), and [Kaldheim Commander](https://magic.wizards.com/en/news/card-preview/kaldheim-commander-decklists-2021-01-20). The [pinned Moxfield index](../precon-starter-2026-09-06/moxfield-index.tsv) supplies queue order within each release and deck links. These are verified Wizards/MTGJSON lists, not direct Moxfield exports.

The **500 physical cards contain 333 unique source names: 291 reused and 42 new native definitions**. [decklists.json](decklists.json) records source URLs, snapshot dates, hashes and exports. [oracle.json](oracle.json) preserves Oracle records, legalities, print IDs and all faces. Beanstalk Giant resolves to the existing combined Adventure definition after an Oracle-ID match. The importer rejects missing native scripts and simplified or automatically scripted additions.

[source-validation.json](source-validation.json) compares the final data against `721f859`: all 2,293 preceding raw definitions and 71 raw deck records remain identical. Existing Oracle batches, images, all 3,360 card-image mappings, 70 commander crops and 28 commander videos are preserved. The excluded Blame Game record remains preserved. The comparison records existing text representation differences for Beanstalk Giant and Boros Garrison, and equivalent combined cost notation for three split cards; prior raw records are not rewritten.

| Measure | Before | After |
| --- | ---: | ---: |
| Selectable decks | 70 | 75 |
| Runtime definitions | 20,151 | 20,193 |
| Native raw definitions | 2,293 | 2,335 |
| Eligible for deck import | 20,126 | 20,170 |
| Active unique cards | 3,225 | 3,372 |
| Card/deck checks | 5,789 | 6,172 |

Deflecting Palm and Needle Spires become importable through their inclusion in active original lists. Existing legality metadata and validation remain intact.

## Rules, interface and artwork

The native scripts cover Elf counting and mana, paid and reflexive triggers, divided counters, equipment and Aura attachment, attack requirements, sea-monster exceptions, linked exile objects, delayed returns, foretell, Saga chapters and restricted mana. [Kaldheim release notes](https://magic.wizards.com/en/news/feature/kaldheim-release-notes-2021-01-22) informed the foretell and new-card cases. Ranar and Hero follow the later [June 2021 Oracle update](https://magic.wizards.com/en/news/announcements/oracle-changes-2021-06-18), including the distinction between hand exile and a controlled spell or ability exiling a permanent.

Ranar's first foretell special action costs zero; later actions still cost two. Ethereal Valkyrie's effect does not consume that first-action allowance, and an existing printed foretell cost remains available alongside its granted cost. Exile choices show their foretell prices and distinguish the Valkyrie option. Simultaneous exile instructions produce one Ranar trigger, while Hero and Soulherder count the appropriate objects; departing sources retain their last controller and ability. Cosmic Intervention participates in zone replacement ordering and returns only the same exiled objects at the next end step. Its replacement retains the controller of the original resolving effect: Ranar and Hero do not credit an opponent’s destruction, a sacrifice payment, or a state-based death to the Cosmic Intervention player.

Serpent's Soul-Jar grants one creature cast per activation and its permission survives the source leaving. Trove Warden, Tiana and Arcane Artisan do not follow cards or tokens through later unrelated zone changes. Elf effects include noncreature Kindred Elf permanents where the printed wording permits them. Stumpsquall Hydra can distribute counters to a planeswalker commander. Master Warcraft separates the choice of attackers from attack destinations, and Tromokratis enforces its complete blocker group.

A printed foretold card retains its proper definition, privacy and casting permission after JSON checkpoint restore. Granted foretell costs and unsupported lasting effect graphs keep the preceding safe checkpoint until portable capture is possible; saves do not silently omit those rules. Dedicated tests and broad regressions provide bounded evidence, not an exhaustive proof of every possible card combination.

All five decks have guides, opening advice, actual-list key cards, set/year metadata and AI profiles. [images.json](images.json) records **158 new WebP files**: 151 card faces, two original token variants (KHC Spirit and Replicated Ring), and five commander crops. All 333 source names and relevant faces have local artwork. No commander videos were generated.

## Verification

Verification results and exact commands are recorded in [qa.json](qa.json); final runtime/test inputs are recorded in [tested-inputs.json](tested-inputs.json). Raw logs, screenshots and browser states are under `output/precon-znc-cmr-khc-2026-09-08/`.

The final affected run passes **251/251**, including all **64 new-card and precon integration cases**, save/restore, exile privacy, casting costs, card inventories, images and multiplayer presentation. It uses **1,071 unchanged runtime/test/configuration inputs**. The complete diagnostic suite finished **8,868/8,871**, with three findings: two old inventory expectations and an incorrect Slinn Voda kicker descriptor. All three are corrected. Both complete inventory test files are included in the final affected run. The original human-question inspector is also replayed for all 42 new cards: 42 actual casts, 114 questions and three available activations pass, along with its two defensive regression cases. Slinn Voda’s human/local-AI cases explicitly choose the displayed kicker and pay ten total mana. **The complete suite was not repeated after the final fixes**; qa.json records this scope without an all-green complete-suite claim.

Syntax, source audit, strict certification, dependency audit, preservation, idempotence and whitespace checks pass. Strict certification covers all 20,193 definitions and 6,172 card/deck checks with no failures. The dependency audit reports zero vulnerabilities. All 75 decks finish the diagnostic deterministic four-player run; the five new deck games are repeated after the final fixes and pass with natural winners, stable state, no pending triggers and no AI fallback.

The targeted card tests exercise human and actual local-AI controllers, with explicit fixture answers for particular modes and choices. [runtime-smoke.json](runtime-smoke.json) separately records **84/84** paid cast/entry executions for all 42 new cards, without prerequisite gaps, choice gaps or errors. The legendary sorcery smoke includes a real controlled legendary creature as its prerequisite. Registration and this common-board smoke are not substitutes for the semantic tests.

Browser verification covers **20 desktop/mobile cases** at 1440px and 390px: ten selector/pod/review/opening/paid-commander cases and ten commander-mechanic cases. Prepared follow-on boards retain the real UI controller, legal actions, mana payment, priority and combat. The mechanic cases exercise Obuun's landfall and animated-land combat, Wyleth's paid equip and attack draw, Aesi's two land plays and draws, Ranar's free foretell and later paid exile cast, and Lathril's actual combat-damage tokens.

A normal-opening 390px Elven Empire versus Reap the Tides match finishes naturally on turn 24 after 188 UI iterations, six land plays, fourteen spells, nine attack declarations and ten decision types. Rematch preserves the pod and preferences. A local Live table passes seven checks with two humans and two bots, including guest privacy, focus preservation, land play, a paid Sol Ring on the shared Stack, human priority, guest reload, host resume and bot turns. All captured browser errors and horizontal overflow checks are clear. The unmodified game-skill client renders the updated 75-deck landing page; landing, commander, token and gameplay screenshots were visually inspected.

Release authorized on 8 September 2026. This report preserves the completed local verification snapshot. Independent Git, Vercel, canonical-source and production-browser evidence is recorded separately under `output/precon-znc-cmr-khc-release-2026-09-08/`; local test completion alone does not establish deployment.
