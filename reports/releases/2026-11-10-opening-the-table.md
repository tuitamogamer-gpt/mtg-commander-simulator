# Opening the table — 10 November 2026

Based on `fddd38e`. Request: cut the wait after **Play solo** by loading the import catalog on demand.

## Result

From the click on **Play solo** to the deck list, against a local server (so without network delay), on Chromium, two runs each on the same machine at the end of the work:

| | Before (`fddd38e`) | Now | Now, with `?catalog=full` |
| --- | --- | --- | --- |
| Desktop, 1440×900 | 10.0 s and 10.3 s | 2.4 s and 2.8 s | 6.6 s |
| Phone screen, processor slowed 4× | 34.8 s and 35.7 s | 6.5 s and 6.5 s | 20.0 s |
| Loaded for that click | 92.9 MB, 761 requests | 22.8 MB, 494 requests | 97.4 MB, 761 requests |

Two changes give this:

- the table opens with the cards of built-in decks, and the rest of the card collection loads when an imported deck needs it;
- the translation of interface text no longer tries every pattern on every string.

The middle column is for a player with no saved imported deck. A player who has one gets the complete collection before the table opens, as in the last column.

The notes of the improvement round give 12.9 s and 39.4 s for the same commit, measured earlier that day. The numbers in this table were measured together, one after another.

## What was slow

**The whole card collection, before any deck could be chosen.** The page loaded all 268 Oracle batches: 72 MB of the 93 MB, and 28,202 of the 32,273 card definitions. No built-in deck uses 25,492 of those; only imported decks do.

**Translating text that was already English.** Every string the table shows passes through `MTG.uiText`, which translates the engine's remaining Bosnian prompts with about 1,800 patterns. Each new string was run through all of them: about 8 ms per string. With the batches gone, the profile of the startup put 2.4 s of 6.8 s there, and another 1.0 s in building the patterns. The same cost was paid for every new line of text during a game.

## Changes

### The card collection

- **`src/app.js` is unchanged.** It stays the complete list of modules and batches, for tools and tests.
- **`scripts/build-startup-catalog.mjs`** (`npm run build:startup`) writes three things from `src/app.js` and the deck lists:
  - `src/app-startup.js`, what the page loads: the same modules, with each run of batch imports replaced by one startup part;
  - `src/oracle-startup/part-1.js` and `part-2.js`: the cards of each run that built-in decks use, as batches marked `startupSubset`, in batch order (2,710 cards, 4.7 MB);
  - `src/oracle-catalog-full.js`: every batch, in the order of `src/app.js`.

  The startup cards are the 2,581 that deck lists name, and 129 more whose names appear in a script module or inside a definition that is loaded at startup (a manual script for the card, a named token). With the 4,071 cards of `src/data.js`, the table opens with 6,781 definitions.
- **A batch can register in two parts** (`oracle-catalog.js`, `registerOracleBatch`). `MTG.ensureFullCatalog()` loads `src/oracle-catalog-full.js` once; every caller waits for the same load. The cards that were not in the startup subset then get their raw data, definitions and catalog rows. Definitions that already exist keep their identity, because cards in play point at them.
- **A card is the same however it was loaded.** What a batch compiles to depends on the modules loaded before it: later modules add compile hooks and replace helpers. Compiled after all of them, 296 of the cards that arrive later came out different (for example, 238 gained a `castCond`). So:
  - each startup part marks its place among the modules (`beginOracleCompileStage`), and the engine remembers the compiler's surroundings there: the members of `MTG` and of its plain namespaces, and the handler lists in them;
  - a batch that completes the catalog compiles with the surroundings of its original place;
  - a module that revises every script registered before it now says so with `MTG.reviseRegisteredScripts` (two modules did this with a loop: miracle, modular), and the batches that stood before it get the same revision when they arrive;
  - what a card writes into a registry when it compiles is kept. A card with a prepared spell records its definition in `MTG.E.preparedSpellDefinitions`, which a later module replaces with a copy; the entry of a card that arrived later went into the registry of its original place and was lost, so a table with such a spell prepared could not be saved. Entries added during such a compile are now copied into the registry that the game reads today;
  - the complete batch keeps the entries that its startup subset registered. A script points at the operations of its entry, the same objects, and a tool that walks `MTG.ORACLE_BATCHES` finds a card's rules by them.

  The last two were found by running the existing Oracle tests on an engine completed in two parts (see Verification).
- **One card order.** After completion, the batches, raw cards and definitions take the order of `src/app.js`.
- **An imported list is never checked against the startup subset.** `MTG.validateImportedDeck` refuses until the collection is complete: checked against the subset, most cards of a list would be called unsupported and a saved deck would look broken.

### When the rest loads

- **A player who has saved imported decks**, on the device or on the account: before the table opens, behind the loading message. Saved lists are checked against the complete collection, and completing it stops the page for several seconds (see Limits); for these players that would happen while a deck is chosen or a game is played. The page asks `MTG.playerHasImportedLists()` and waits at most 2.5 s for the profile and its lists. A player with no saved list never loads the rest at entry.
- **My Library and deck import:** when the window opens, while the list is pasted. Check and Save wait for it.
- **A saved table with an imported deck:** before it is rebuilt.
- **A problem report of a game played with an imported deck:** before the report is read in Diagnostics, because reading it checks its decklists.
- **A Live room:** for host and guest. Every seat's deck is built on the host, and any seat may bring an imported list. A page that opens for a room (**Play with friends**, or a room link) loads the collection behind the loading message; a player who goes to a room from an open table gets it when the lobby opens.
- **A choice among every card name** (Phyrexian Revoker and five other effects list the loaded definitions): before the list is made, in the middle of the game. The table shows "Loading the complete card collection…". From the startup subset the list would depend on how the page was opened, and a saved game with such a choice would not replay in another session.
- **`?catalog=full`** loads everything before the table opens, as every page did before. `?catalog=startup` never does at entry. A page under automation (`navigator.webdriver`) defaults to `full`: browser test fixtures put any card on the table by name. `?catalog=visitor` decides as for a visitor, also under automation.

### Interface text

`MTG.uiText` tries a rule only when the text can match it (`util.js`):

- a rule that is one whole word, 1,008 of the 1,808, only when the text has that word as a complete token;
- any other rule only when the text contains the longest plain run of characters that every match of its pattern has.

Both are necessary for a match, never sufficient: the pattern still decides. Patterns are built when a rule is first tried. A text with a letter whose case folding differs from `toLowerCase()` (the long s and a few others) is checked against every rule. A full cache drops its oldest quarter instead of everything, and holds 8,192 strings instead of 2,048. A new string takes about 0.06 ms instead of about 8 ms.

`MTG.uiTextReference` applies every rule in order and is the definition of the translation.

## Verification

Chromium, a local server, this branch. "Before this work" is commit `1a54d7d`, the last one before 10 November.

### The collection is the same collection

- **Loaded in two parts against loaded in one** (`tests/startup-catalog.test.mjs`, 6 tests). The generated files are current. Every card of every built-in deck is loaded at startup, with the script and definition it has in the complete collection. After completion all 32,273 scripts, definitions and catalog rows are equal, in the same order, and the definitions that existed before completion are the same objects. Every other member of `MTG` and of its namespaces is equal, and every script holds the operations of its own batch entry. A list checked before completion is refused, and a saved table or a problem report with an imported deck is read only after it.
- **Against the commit before this work, loaded in one part.** The same 32,273 scripts, definitions and catalog rows in the same order. Of 204,519 compiled functions, 114,850 differ only by the renamed argument of the text-change wrapper (the load change of the improvement round) and one by the wait before a choice among every card name; nothing else differs. Elsewhere on `MTG`, seven functions that this day's work edited differ and seven are new.
- **The long Oracle proof test** (`oracle-bulk-interactions`, every generic Oracle card through its executable proof, 46 minutes here). On an engine completed in two parts 13 of 14 tests pass, and the one that fails lists 2,681 proof gaps: the same list, line for line, as before this work. The first run listed 3,107; the 426 more were the cards of the startup subset, whose batch entries had been replaced by copies (fixed, see Changes).
- **The same games.** One seeded four-bot game (Counter Intelligence, seed 1700, 490 log lines) has the same log before this work, on this branch loaded in one part, and completed in two parts. Thirteen seeded four-bot games (Blame Game, Turtle Power, Grave Danger, Built from Scratch, Subjective Reality, Silverquill Statement and seven more; 30 to 82 turns) have the same log, line for line, on the engine loaded in one part and on the startup engine, which never needed the rest of the collection.

### Node tests

`npm test` is 870 files. On this machine they do not finish in one run: the Oracle rule-version files take one to six minutes each, and two files exceed their own time limits. What ran, with the engine loaded in one part:

- **723 files, 16,228 tests: 16,210 pass, 1 is skipped, 17 fail.**
  - Twelve fail the same way before this work: the two byte-equivalence checks that need commits older than this shallow clone (`bom-precons`, `clb-dmc-40k-precons`), the manual batch in `commander-staples`, the pinned counts in `legacy-card-catalog-integrity` and `restricted-legacy-import`, the creature type list in `oracle-token-forms-source`, the loyalty pairs in `planeswalker-combat`, the clean-board fixture in `save-state`, and four tests of `ui-priority-action-callbacks` ("window is not defined").
  - Five were broken by this branch and are fixed. `main-account-completion` (1) and `main-setup-favorites` (4) run pieces of the interface source cut between fixed lines; the match story of the improvement round and the entry change of this one had put code inside those pieces. Both files pass again (28 and 4 tests).
- **Run again on the final commit:** the 126 files that read the changed sources or ran before the last engine edit (the first 71 files): 1,871 of 1,873 tests pass, one is skipped, and `bom-precons` fails as above.
- **Not run with the engine loaded in one part: 147 files.**
  - 144 Oracle rule-version files, `oracle-v42-common` to `oracle-zone-replacement-source`. Their subject is what cards compile to, which the comparison with the commit before this work covers for every card.
  - `oracle-bulk-interactions`: run on the two-part engine and before this work instead (above).
  - `headless-smoke`: its 180-deck sweep does not fit its 60-second limit on this machine, as on 30 October; stopped after 53 minutes. The thirteen games above replace it here.
  - `player-facing-cards` casts every nonland card and does not fit its 300-second limit here: stopped after 33 minutes in the suite, and again after 15 minutes when run alone, before it reported a result. It was not compared with the commit before this work.
- **On an engine completed in two parts** (`MTG_ENGINE_LOAD=two-part`):
  - the 41 test files about import, saved tables, Live rooms and replay, with `oracle-v10-expanded` and `startup-catalog`: 389 of 391 tests pass; the two failures are the `restricted-legacy-import` and `save-state` tests above;
  - the first 110 Oracle test files: 3,857 of 3,861 tests pass. Two failures are the ones above (proof gaps, creature types). The other two found a fault of this change: "prepared spells survive a JSON save" passed in one part and failed in two (fixed, see Changes; it passes in the run above).
- **New tests:** `tests/startup-catalog.test.mjs` (6), `tests/startup-entry-choice.test.mjs` (8: the page's decision before the table opens, with a visitor, saved lists on the device or the account, the address, automation, a Live room, and a slow or failing profile) and `tests/ui-text-shortcut.test.mjs` (5).
- **Interface text.** The shortcut and the complete rule list give the same result on 94,918 strings (25,150 of them translated): every phrase of the rule tables in several surroundings, and every string of the card catalog. The translation before the change and after it agree on 2,357 strings. `ui-english` passes (12).
- **Tools:** `npm run check`, `npm run check:startup`, `npm run audit` and `npm run certify:strict` pass on the final commit: 15,021 card and deck checks, 6,651 active cards, 32,273 of 32,273 definitions.

### Browser

- **`tests/browser/startup-catalog.mjs`**, 9 checks at 1440 px and 390 px: the table opens with 6,781 definitions and no Oracle batch; a four-player game with built-in decks starts without the rest; My Library completes the collection and a list with a card that no built-in deck uses is ready to play; `?catalog=full` opens with all 32,273; a problem report of a game with an imported deck, chosen on a startup page, completes the collection and deals that deck; a visitor without saved lists opens with the startup subset, and with a saved list with the complete collection and the deck ready.
- **As a visitor gets the page** (a server that switches the automation default off): import a 100-card list, check, save, start a game, open a new page, continue the saved table; `commander-live-launch` (6 of 6, with an imported deck in a room and a guest reload); `player-gameplay` (a complete game through the interface to turn 18, and the rematch). No page errors.
- **On the default path under automation** (the complete collection), all pass: `imported-pod-flow` (6), `local-solo-recovery`, `problem-report` (a complete game, its report, and the diagnostic replay), `commander-live-launch` (6), `live-combat` (9), `mass-wipe-live` (6), `zone-flights` (10), `phone-table-polish` (13) and `command-table` (7).

## Limits

- **Measured locally.** The times are without network delay. On the hosted site the smaller download (22.8 MB instead of 92.9 MB, before compression) should count for more, not less; that was not measured.
- **A game with a name choice still loads everything**, once, when the effect happens.
- **A player with saved imported decks waits for the complete collection**, as in the last column of the table: 6.6 s instead of about 10 s on the desktop, 20 s instead of about 35 s with the processor slowed. If the profile or its lists take longer than 2.5 s to answer, the table opens without them and the collection completes when they arrive.
- **Completing the collection stops the page.** Every batch is compiled and about 25,500 definitions are built in one go. Measured from `MTG.ensureFullCatalog()` on an open table: 3.7 s on the desktop, of which the page does not respond for 2.7 s; 14.4 s with the processor slowed four times, of which 13.1 s. A player meets this when My Library is opened for the first time in a visit, when a room is entered from an open table, when a profile with saved lists answers late, and in a game with built-in decks at a choice among every card name. The work could be split into parts that let the page draw between them; that was not done.
- **The complete Node suite was not run in one piece**, and 147 of its 870 files were not run with the engine loaded in one part (see Verification). `player-facing-cards` was not compared with the commit before this work: it does not finish within 15 minutes on this machine.
- **The startup files are generated and committed.** After adding a deck or an Oracle batch, run `npm run build:startup`. `tests/startup-catalog.test.mjs` fails while they are stale.
