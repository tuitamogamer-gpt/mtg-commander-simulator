# Improvement round — 10 November 2026

Based on `1a54d7d`. Request: improve everything in the game that can be improved. No list came with the request, so the game itself was examined:

- real four-player games played through the interface on a 1440×900 desktop and a 390×844 phone, with your seat answered by bot decisions, and every page error, card flight and screen recorded;
- 42 seeded four-bot games run without the interface, timing every bot decision;
- the node tests and the browser suites.

## What was wrong

**Bots froze late in the game.** All 42 bot games finished without an error, but on wide boards one bot turn could take over a minute of thinking. The profile of the slowest game put 41% of all time in one forecast: which attacks get through if a mana payment taps the bot's blockers. That forecast was rebuilt for every action the bot ranked, and again inside every mana plan it tried. Each of its combat forecasts also looked up every creature's damage again.

**A bot repeated an empty ability all turn.** One of the 42 games stood out: 10,669 bot decisions where the others had 330 to 1,668 (median 758), and one turn of 149 s. The bot playing 20 Ways to Win had Helix Pinnacle ("{X}: Put X tower counters on Helix Pinnacle") and no untapped land. Activating it for X=0 is legal and free, so the bot did it at every opportunity: 2,152 times in the game, each one put on the stack and resolved. At the table that is minutes of the same line in the log.

**The combat charge could crash.** With an attacker in view and its blocker or the defender out of view, the charge threw `getBoundingClientRect is not a function`. Nothing charged in that damage step, and the effect's layer stayed on screen. It happened in a real game on the phone.

**Card flights named the wrong thing.** The ghost card that flies between zones is drawn from two renders of the table. Three errors followed from that:

- An opponent's instant was shown as "MILLED". While a spell resolves it is in no zone, and a card found in no zone was taken to come from the library.
- A land played and sacrificed between two renders (Terramorphic Expanse) was shown as "DISCARDED", because it went from hand to graveyard.
- A hidden seat has no box, so the flight was drawn at the screen's top-left corner with its name badge cut off. On a phone that is every opponent's flight; on the desktop the anchor was missing too (the badge started at −45 px).

**The match's last screen said nothing about the match.** Its "public match highlights" were the last five lines of the log, such as four lines of one creature's pump. Eliminations were left out.

**A result recap repeated itself.** For a commander exiled by Swords to Plowshares, the recap listed "battlefield → exile", "exile → command zone" and then "1 permanent → command zone". The third line took the place of the life gained.

**Phone details.**

- In the full hand view, the gold ring of the commander's pedestal was 74% of the row wide and ran through the commander's name.
- The menu offered "⌘K / Ctrl+K", and the search window ended in "↑↓ Navigate · Enter Open · Esc Close", on a screen with no keyboard.

**Wording.** "1 ATTACKERS"; "1/1 untapped creatures", which reads like a creature's power and toughness; "LOCKED TARGET MAP · 0 targets" for a spell without targets.

**Tests that no longer ran.**

- Six tests in `responsive-client-v3.test.mjs` failed in every run. They build the UI alone, and the UI now reads the engine's priority modes when it is constructed.
- Forty-nine browser suites stopped at the same click. They choose a Quick preset on the Pod step; since the Pod step was redesigned, the presets sit in a closed panel.

## Changes

- **Bots: one tap forecast per ranking** (`ai-v2.js`, `rankingTapDefense`). A ranking scores every action against one unchanged board, so the forecast is built once per ranking and shared by the action scores and the mana solver. The combat forecasts of one search share their damage lookups (`baseDamage`). Nothing is kept after the ranking returns.
- **Bots: no empty {X} activation** (`ai-v2.js`, `abilityAffordsOnlyZeroX`). A bot does not activate an ability with {X} in its mana cost when the most it can pay is X=0. Where X picks a mana value (Steel Hellkite, Valki, Lazav), X=0 stays available. 133 abilities in the catalog have {X} in a mana cost, 35 of them in the built-in decks.
- **Combat charge** (`action-effects.js`). An attacker whose blocker or defender is out of view is skipped without an error; the other attackers still charge.
- **Card flights** (`ui.js`, `syncZoneEffects`).
  - "DISCARDED" needs the engine's own discard mark on the card.
  - "MILLED" needs a card that was in a library at the last render, or the engine's mill mark.
  - A card that was in no zone, such as a resolving spell, draws no flight to the graveyard.
  - A card drawn and discarded between two renders is a discard.
  - A flight starts and ends at a place on screen: the zone, or the player's visible stand-in (seat chip, life total). If the player is not on screen, no flight is drawn.
  - The name badge is kept inside the screen.
  - **Live guests.** A guest cannot see hands or libraries, so the table cannot tell where a card came from. The engine now marks a milled card as it marks a discarded one (`engine.js`, `mill`), and both marks are published to guests (`multiplayer-presentation.js`). A guest sees "DISCARDED" and "MILLED" from the marks alone, and no longer "MILLED" for every card an opponent puts into a graveyard.
- **Match end** (`ui.js`, `matchHighlights`). The highlights list every elimination with its turn and reason and the win, in order. The places left, up to six lines, go to the latest attacks, damage and arrivals.
- **Result recap** (`resolution-recap.js`). A card whose way is already named by an exile row is not counted again.
- **Phone details** (`commander-dock.css`, `experience-tools.css`, `ui.js`). The pedestal ring sits under the commander's card. On touch screens the menu entry reads "Your hand and public cards" and the search window has no keyboard footer. A mouse and keyboard keep both.
- **Wording.** "1 ATTACKER"; "3 of 4 creatures untapped" and "No creatures"; "NO TARGETS".
- **Tests.** The isolated UI harness takes the priority modes from the engine source. The 49 browser suites open the Quick presets panel before choosing a preset.

## Verification

### Bots

Four of the slowest seeded games were run before and after, under the same load. Each plays out line for line as before (same log hash, turn count and life totals).

| Seed | Turns | Bot decision time | Longest turn |
| --- | --- | --- | --- |
| 1005 | 31 | 25.4 s → 12.0 s (−53%) | 14.3 s → 6.7 s |
| 1007 | 66 | 25.0 s → 20.4 s (−18%) | 9.7 s → 8.2 s |
| 1104 | 45 | 52.9 s → 32.4 s (−39%) | 14.3 s → 9.3 s |
| 1203 | 62 | 105.9 s → 56.1 s (−47%) | 65.4 s → 26.3 s |

In game 1203 the longest single decision went from 7.2 s to 2.3 s. These are times without the interface, on a shared four-core machine; a browser adds the game's own pacing.

- **New test `tests/ai-ranking-tap-defense.test.mjs`** (3 tests). A bot with five mana creatures ranks five spells against two opponents' attackers.
  - Every score equals the score of the same action scored alone.
  - The ranking makes 546 damage lookups; scored alone, the actions make 2,292. On `1a54d7d` both are 23,440, and the test fails.
  - After a blocker is tapped, an attacker arrives or life drops, the next ranking reads the board again.
- **The empty activation.** `tests/ai-repeatable-abilities.test.mjs` has two new tests. With no mana the bot leaves Helix Pinnacle alone; with three Forests it activates it once for X=3 and stops. Lazav's "mana value X" ability is not ruled out at X=0. The first fails on `1a54d7d`. The same game (seed 1107) now has 1,244 bot decisions instead of 10,669, and its longest turn is 12.8 s instead of 105 s (both measured with the faster forecast, under load). No other game of the 42 had more than 32 decisions per turn; the median is 17.
- **All bot test files** (`tests/ai-*.test.mjs`): 789 of 789 pass.

### Table

- **New browser test `tests/browser/zone-flights.mjs`**, on a 1440×900 desktop and a 390×844 phone:
  - a spell that resolved draws no flight;
  - a land played and sacrificed draws no flight;
  - the engine's discard and mill are shown, for you and for an opponent, with the name badge inside the screen;
  - a card drawn and discarded is a discard;
  - a card from no zone the table knew, as a Live guest sees it, is named by the engine's mark alone, and not announced without one.

  On `1a54d7d` it fails at the first check: `"AI Dragon · MILLED"` for Swords to Plowshares, with the badge at −45 px.
- **New test `tests/zone-flight-marks.test.mjs`** (3 tests): a mill and a discard mark their cards with the graveyard zone version, the mark stops counting once the card moves again, and a guest receives the marks of public cards and nothing of a hidden one.
- **`tests/browser/live-combat.mjs`** has a new desktop check: a blocked attacker whose blocker has no place on the table is skipped as "blocker not in view", the unblocked attacker still charges, and nothing stays on screen. On `1a54d7d` it fails with the page error.
- **`tests/resolution-recap.test.mjs`** has a new test: an exiled commander is told in two lines, followed by "You: 40 → 44 life". On `1a54d7d` the third line is "1 permanent → command zone". 33 of 33 pass.
- **`tests/browser/battlefield-combat.mjs`** expects "3 of 4 creatures untapped".
- **`tests/browser/phone-table-polish.mjs`** has three new checks: the pedestal ring ends before the commander's name, the phone is offered no keyboard shortcut in the menu or the search window, and the desktop keeps its search hints. On `1a54d7d` the first fails: the ring ends at 280 px, the name starts at 86 px.
- **`tests/responsive-client-v3.test.mjs`**: 16 of 16 pass (9 of 15 on `1a54d7d`). The new test gives the match's last screen a log with three eliminations, a win, hits and pumps, and expects the eliminations and the win first, the latest hits in the places left, and no pump.
- **The match's last screen** was read on the phone after a complete game: "T24 You lose (life reached 0)", "T25 AI Wolf loses", two hits on AI Raven, "T27 AI Raven loses", "AI Dragon WINS!".
- **Real games after the fixes:** five more games through the interface (four on the phone, one on the desktop, 27 to 35 turns) raised no page error. The recorded card flights of the first phone game now show only the one real discard.

### Suites

- **Live:** `mass-wipe-live` (three wipes on both screens, host and guest) and `commander-live-launch` (two browsers, a guest's decision over WebSockets, reload and resume) pass.
- **Browser suites that pass on the fixed source:**
  - `live-combat`, `battlefield-combat`, `zone-flights`, `action-effects`, `effect-anchors`, `combat-replay`;
  - `phone-table-polish`, `phone-memory`, `mobile-table-view`;
  - `command-table`, `stable-table-ui`, `interaction-continuity`, `decision-experience`, `resolution-recap`;
  - `player-experience` and `player-gameplay`, a complete game through the interface up to the rematch. Both use a Quick preset and stopped at that click before.
  - `c21-precons` and `starter-precons`, every deck on both screens, and `afc-mic-precons` for one deck (Planar Portal), as samples of the 49 repaired suites.

- **Node tests.** The complete run was cut short by a restart of the session after 1,791 top-level tests. One had failed: `bom-precons.test.mjs` reads `git show 22dcc14:src/data.js`, and this checkout is a shallow clone without that commit. On the final source, 31 files were run again: those that use mill or discard, the Live presentation, saves, bot isolation and the files nearest to the changes. 1,296 of 1,297 tests pass. The one failure is not from this round: `oracle-token-forms-source.test.mjs` compares the engine's creature types with a pinned official list, and the Star Trek preview decks added types (Aenar, Andorian, Borg and others) that the list does not have. `ui-english.test.mjs` did not finish within ten minutes here and was not waited for.
- **Bot games on the final engine.** Two shards of the headless smoke test, twenty four-bot games with the state checks at every turn, pass with no bot fallback. The second ran with the empty-activation rule.
- **Another failure that is not from this round:** `commander-staples.test.mjs` expects the seven staples' pictures to be pinned Scryfall addresses; they now resolve to local copies, so `new URL(...)` throws. It fails the same way without this round's changes.
- Syntax check, source audit and `git diff --check` pass. Strict certification passes: 180 decks, 6,651 unique active cards, 15,021 card and deck checks, and all 32,273 definitions. Its timestamp-only report change is not committed.

## Opening the table

From the click on **Play solo** to the deck list, the game loads about 750 files and 90 MB of JavaScript: 12.9 s on a desktop and 39.4 s with the processor slowed four times, as on a phone (measured against a local server, so without any network delay). It happens on every visit.

One part of that is shorter now. To support text-changing effects, every function of every card definition is wrapped once at load (`c17-c19-text-rules.js`, `executable`). The walk carried the whole key path as a new array for every value of all 32,273 definitions, only to know whether it was under a `targets` key. It now carries that one flag. The engine and catalog load in Node took 10.3 to 12.1 s before and 9.9 to 10.2 s after, three runs each, while another job shared the machine. The 364 tests of the `c17-c19` files and the target audit pass.

A second lookup is shorter too. Asking for the image of a name the catalog does not know ("Face-down card", "Hidden card", a token without its own art) went through the deck importer's name index every time, and that index lists every catalog name to check that it is current: about 5 ms per lookup. Only names that resolved were remembered. Unknown names are remembered as well (`card-images.js`, `cardImageCatalogName`), until the catalog is replaced. 200 lookups of "Face-down card" took 1,124 ms and now take 5 ms. In the profiled bot game these lookups were 1.7 s, from result recaps drawing their cards. Drawing the table itself was not affected: a face-down card there shows its sleeve without asking for an image. New test `tests/card-image-unknown-names.test.mjs` (3 tests).

The larger part is not changed. 25,622 of the 32,273 definitions are used by no built-in deck; they are needed only for imported decks, and are still fetched, parsed and compiled before setup opens. Loading them on demand is a change of its own and was proposed as a separate task.

## Not changed

- **Bot turns on very wide boards are still slow.** After this change, a bot's own decisions are about a quarter of the time of a slow game. The rest is the engine listing castable spells at every priority window and recalculating the board after every action.
- **The 49 repaired browser suites were not all run.** They take one to six minutes each. The ones run are listed above; the others may have further stale steps behind the repaired click.
- **The pinned creature-type list** was not updated for the Star Trek preview types. It needs the official list once the set is released.
- **Live precon suites** were not run. `afc-mic-live` timed out waiting for a guest's decision while several other runs shared the machine; the two Live suites above pass when run alone.
- **An empty optional card choice** still has both "Confirm ✓ (0)" and "None".
