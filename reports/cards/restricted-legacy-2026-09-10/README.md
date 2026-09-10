# Eighteen previously restricted native cards

Reviewed locally on **10 September 2026**. All **18** formerly restricted definitions are now eligible for Commander deck import after rule corrections and executable checks. The catalog contains **20,962 definitions, all import-eligible**, and **120 built-in decks**. This review adds no card definitions or built-in decks. The original Blame Game list can now be imported as a custom deck with Nelly or Feather as commander.

## Sources and inventory

[source-cards.json](source-cards.json) preserves the eighteen complete Scryfall objects from the archived **30 August 2026** Oracle snapshot. Its compressed source has SHA-256 `a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528`. Each individual review in [reviewed-legacy-imports.js](../../../src/reviewed-legacy-imports.js) records its Oracle ID, printing ID, source hash and review identifier. Existing native identities and their `certified-legacy` classification are preserved.

The [generated inventory](../../../docs/card-catalog.md) and [imported-card CSV](../../../docs/catalog/imported-cards.csv) expose the review identifier and current eligibility. The comparison backlog stays at **9,849 distinct paper, Commander-legal Oracle IDs**: these eighteen cards were already represented in the engine. That backlog contains **2 parser-eligible candidates** and **9,847 deferred cards**; parser eligibility alone does not grant import support. All source comparisons use the dated snapshot.

The [official Murders at Karlov Manor release notes](https://magic.wizards.com/en/news/feature/murders-at-karlov-manor-release-notes) were also consulted for the relevant Commander mechanics. Executable coverage uses the pinned card text and the engine's normal spell, ability, damage, targeting and combat paths.

## Card review

| Card | Correction or verified behavior |
| --- | --- |
| Boros Reckoner | Hybrid payment, first strike activation and actual damage received; its damage trigger survives lethal damage. |
| Darien, King of Kjeldor | Optional Soldier creation matches combat and noncombat damage; ordinary life loss does not trigger it. |
| Feather, Radiant Arbiter | Pays two mana per selected copy; copies a countered original using its last known spell state; Aura copies become attached tokens. |
| Fiendish Duo | Doubles damage to opponents without doubling damage to its controller or to creatures. |
| Gideon's Sacrifice | Chooses a creature or planeswalker on resolution without targeting; redirects damage only to the chosen battlefield incarnation. |
| Havoc Eater | Announces up to one creature target per opponent; sums signed powers and rejects invalid targets and a changed source incarnation. |
| Hot Pursuit | Links goad to the exact enchantment and creature; suspicion remains when goad ends. Uses normal temporary control, untap and haste operations. |
| Immortal Obligation | Targets an opposing graveyard creature and puts its duty counter on entry. Goad and attack/block restrictions end permanently when the last duty counter is removed. |
| Labyrinth of Skophos | Produces colorless mana and pays four mana plus tapping to remove an attacking or blocking creature from combat. |
| Loran of the Third Path | Optional artifact/enchantment destruction and the paid tap ability that lets both selected players draw. |
| Mob Verdict | Collects secret, nontargeting player choices before revealing votes; emits the voting event for other cards; deals damage in one batch and draws for votes against its controller. |
| Nelly Borca, Impulsive Accuser | Suspects and goads on attack; groups simultaneous combat damage by source controller so each qualifying controller draws once per damage event. |
| Otherworldly Escort | Returns the same graveyard incarnation as a Spirit Detective with four charge counters already present on entry. Removing a counter is an activation cost; destruction requires that exact creature to have damaged its controller this turn. |
| Prisoner's Dilemma | Keeps choices secret until all players choose, validates answers and applies simultaneous 4/8/12 damage. Flashback pays seven mana and exiles the spell. |
| Redemption Arc | Can enchant its controller's creature. Its paid exile ability follows the current attachment or the Aura's last known attachment when removed in response. |
| Take the Bait | Prevents combat damage to its controller and their planeswalkers; untaps and goads attackers, then inserts only an additional combat phase. |
| Trouble in Pairs | Supports separate opponents and repeated qualifying combats. Checks each queued extra turn when it would begin and preserves later turns when skipping one. |
| Vow of Lightning | Power, toughness, first strike and attack restrictions follow the attachment and the Aura's current controller; leaving the battlefield removes them. |

The shared Vow helper applies the same attachment-lifetime correction to Vow of Duty. New engine hooks cover entry-time type changes, per-controller damage batches, planeswalker combat prevention and extra-turn replacement. The import gate still rejects inactive native cards without a recorded review.

## Images and verification

All eighteen cards now have local WebP artwork, with four additional commander portraits for Darien, Feather, Loran and Nelly. [images.json](images.json) records the **22 files**, their source URLs and hashes. Existing image paths are preserved, and the regular image-sync script retains these reviewed cards.

[qa.json](qa.json) records reproduction commands, test files, source hashes and compact browser/game results:

- **1,118/1,118 tests** pass across 63 relevant regression files, including the new rule, interaction, import and natural-game tests.
- **8/8 follow-up tests** pass after adding the artwork and its manifest checks. These overlap with the regression set and are not an additional count of unique tests.
- **4/4 browser scenarios** pass: Nelly and Feather at 1440 px and 390 px. Each imports all eighteen cards in a legal 100-card list, saves and reloads the guest library, opens a game, loads every card image, and completes a paid commander cast. No browser errors, AI fallback, unresolved triggers or page overflow were reported. Desktop and mobile battlefield screenshots were inspected.
- Two ordinary shuffled, four-seat games using the original Blame Game list finish with winners at turns **36** and **58**, with no pending triggers or AI fallback. Opponents are Enduring Enchantments, Fae Dominion and Timey-Wimey. Browser commander casts use controlled follow-on boards; these two games do not.
- Syntax and script audit pass. Strict certification passes **9,914 card/deck checks** and **20,962/20,962 raw definitions**. The regenerated catalog passes its pinned-source `--check`.

[decklist.txt](decklist.txt) is the 100-card import fixture containing all eighteen cards. It is a verification list with 82 basic lands, not a recommended play deck. The full original Blame Game list is exercised separately by the import and game tests.

```powershell
node --test tests/restricted-legacy-cards.test.mjs tests/restricted-legacy-interactions.test.mjs tests/restricted-legacy-import.test.mjs tests/restricted-legacy-games.test.mjs
npm.cmd run check
npm.cmd run audit
npm.cmd run certify:strict
node scripts/export-card-catalog.mjs --source-file=.local/restricted-legacy-oracle-source.jsonl.gz --source-sha256=a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528 --check
```

Run [the browser test](../../../tests/browser/restricted-legacy-import.mjs) with `PLAYWRIGHT_MODULE` pointing to the workstation's Playwright module when needed. Full logs and screenshots are retained in the ignored `.local/` and `output/restricted-legacy-2026-09-10/` directories.

These are targeted checks, not a full `npm test` run or proof of every possible multiplayer interaction. Deck-library save/reload is covered. Midgame checkpoints retain the existing serializer restrictions: nonportable linked-duration effects or type animations prevent an unsafe checkpoint instead of silently losing their rules. This report describes the local implementation and does not claim a production deployment.
