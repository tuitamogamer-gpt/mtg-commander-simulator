# Premium pass — 14 November 2026

Based on `42dbe8c`. Request: fix everything and give the game a premium design feel. No list came with it, so three things were done:

- every surface was captured as a player meets it, on a 390×844 phone and a 1440×900 desktop (home, deck picker, search, deck spotlight, pod, review, opening hand, main phase, a card in hand, the menu and its tabs, Find, a populated mid-game board in each phone view, a battlefield card, a land, a zone, the last screen), and read at 2× scale;
- the verification left open by the round of 12 November was continued on the released commit;
- the tests that failed before any of this work were examined one by one.

## What was wrong

**Rules text was printed as code.** A card sheet said `{1}{B}, {T}, Discard a card: Create a 2/2 black Zombie creature token`. An ability's button said `Equip {2}`, and How to play said that a recast `adds {2} commander tax`. The card's picture beside the same text shows mana symbols.

**Marks came from the platform's emoji font.** Labels and scripts lead with a gear, crossed swords, a shield, a moon, a pause sign. Each phone and browser draws those in its own colour font, next to the table's own line icons in the header, the lanes and the tabs.

**A card sheet did not say what can be done.**

- An ability that can be used now looked like `Close`: the same neutral button.
- An ability that cannot be used now was a faded full-width block that repeated the ability's text and ended in `: unavailable now`. Three such blocks were heavier than the card's rules text above them.
- The type line used a hyphen: `Creature - Zombie`.

**Smaller things, each of which read as unfinished.**

- The phase button said `Continue ▶ (combat)`.
- Prompts said `click` on every device; a phone reworded it to `tap`, which is also the game's word for turning a card.
- A seat chip of the phone's ribbon said `32 life` in the monospaced face of counters.
- The threat list ranked players with medal emoji.
- The commander-damage table headed each column with four letters of a name: `TEMM STEL GALA ANIK`.
- The phone's Combat view between combats was one line of text over an empty pane, with letter-spaced button labels.
- An empty zone said `0 of 0 cards`; a full one said `25 of 25 cards`.

Home, the setup flow, the menu and Find needed nothing.

## Changes

### Symbols and marks (`src/modules/visuals.js`, `src/modules/util.js`, `assets/icons/game-ui.svg`)

- `MTG.symbolizeTextNode` reads one text node and shows every `{…}` symbol as the glyph of the local mana set: the pictures of `assets/mana` for W, U, B, R, G, C, X and the tap symbol, a number or letter in a disc of the same size otherwise, two halves for a hybrid symbol.
- The characters stay in the page. A symbol is `<span class="tsym"><span class="tsymraw">{T}</span>glyph</span>`; `.tsymraw` is clipped, the glyph is hidden from assistive technology. Text content, a copy, a screen reader and every existing test read the same text as before.
- 45 marks are icons of the table's set: 22 new symbols in the sprite (ability, hourglass, clock, warning, lock, arrow, map, fire, moon, pause, eye, mute, forward, hint, link, controls, help, book, stun, gift, box, rotate) and 16 that it already had. An emoji without a row in `MARKS` is shown as typed.
- `MTG.localizeTree` calls it for every text node of a render, so a render is complete before it is compared with the table; one observer covers the surfaces that assign their markup directly. Form fields, code, SVG text and anything under `[data-raw-symbols]` are left as typed.
- A re-render of an unchanged table replaces the same surfaces as before, and 20 renders of a populated board took 502–582 ms against 663–669 ms on the released build, measured on the same machine under load. The comparison says the pass costs nothing measurable; it is not a speed-up.

### Card sheet (`src/modules/ui.js`, `src/decision-experience.css`)

- An ability that can be used now is a button in the accent tint.
- One that cannot is a quiet row: the ability's text, then `UNAVAILABLE NOW` (or `ADDS NO MANA RIGHT NOW`, `NOT ENOUGH MANA OR NOT YOUR MAIN PHASE`) as a small label. The colon that joins them stays in the page for readers.
- The type line uses an em dash.

### Wording and table details

- The phase button says where it leads, in words: `Continue to combat`, `Continue to next phase`, `End turn`. It keeps `Continue` as its first word, which guides and 86 automated browser suites find it by.
- Prompts, tooltips and the How to play text say `choose`, `select` and `press`. A text that still says `click`, from a card's script for instance, is reworded for a finger as before.
- A seat chip shows the heart and the number (`src/modules/command-table.js`); the word `life` stays in the page for readers, and the life animation follows the number.
- The threat list has numbered ranks in discs, the first in the accent.
- Each commander-damage column is headed by its commander's art, with the commander's and the owner's names for readers.
- The phone's Combat view between combats is one composed block: mark, sentence, two ordinary buttons (`src/modules/mobile-combat.js`, `src/mobile.css`).
- A zone says `25 cards`, or `3 of 25 cards` when a filter hides some, and nothing when it is empty.

`DESIGN.md` records the rules: symbols and marks, wording, card sheet actions.

## Tests that failed before this work

Six node test files and one browser suite failed on the released commit and on the commits before it. None was caused by the game's rules.

| File | Cause | What was done |
| --- | --- | --- |
| `ui-priority-action-callbacks` (4 tests) | The prompt bar asked `window.matchMedia` for the phone width; the tests render it without a window. | The two phone-width checks in `ui.js` test for a window first, as the code around them does. |
| `legacy-card-catalog-integrity` | The Star Trek import of 29 October added 137 cards to the raw data; the test did not know that intake and counted them as legacy cards (1,763 against the pinned 1,626). | The test reads that intake too. The pinned count and the pinned name digest are unchanged and match. |
| `oracle-token-forms-source` | The same import refreshed the table's creature types to the complete catalog (374); the test compared them with the compiler's list of 19 August (324). | The table's list is compared with the recorded catalog, and must contain the compiler's list. The compiler's file is not touched: compiled batches record its digest. |
| `commander-staples` | Esper Sentinel's picture is served from a shipped copy since 27 October; the test parsed every address as a Scryfall URL. | A shipped copy passes when its report records the same pinned printing and the file has the recorded digest. Both hold. |
| `bom-precons`, `clb-dmc-40k-precons` | Each compares today's data with `src/data.js` of commit `22dcc14`, which a shallow clone does not hold. | With the commit present the comparison runs and passes (91 decks, 2,592 card records, 4,065 picture paths, no difference). Without it the test skips and says why. |
| `resolution-recap-highlights` (browser, 2 of 6 cases) | A revealed library card is shown in two steps since the library-reveal dialog; the suite pressed `Continue` and never `Reveal cards`, so Yuriko's trigger never reached its result. | The suite presses the first step too. All six cases pass. |

## Verification

Everything below ran on the code of this commit unless it says otherwise.

**Node tests.**

- 147 test files that load the interface or read a file this pass changed: 1,705 tests, none failing.
- The 31 of them that draw the interface, read the changed stylesheets and documents, or were repaired above ran again after the last change to the code: 242 tests, none failing. Two of those are the history comparisons, which skip in this shallow checkout and passed against the fetched commit.
- `npm run check`, `node scripts/build-startup-catalog.mjs --check` and `git diff --check` pass.

**Browser suites.**

- The 47 suites of the interface (table, decisions, combat, motion, phone, setup, Live launch) all pass.
- Eight of them failed while the other checks loaded the four processors of this machine. Six pass unchanged when run alone: `action-effects`, `arena-refresh`, `commander-live-launch`, `live-combat`, `commander-import-visuals`, `table-motion`. Each measures something that lasts under a second (an action effect lives 960 ms) or waits a fixed time for the page.
- The other two needed their expectations changed. `phone-table-polish` expected the old wording. `arena-experience` measured a button while a resize was replacing it; it failed once in the round of 12 November too, and now measures the node that stays.
- A prompt's first control was `To combat` for a short while. 86 suites advance a turn by a button that starts with `Continue`, and `commander-live-launch` stopped there. The label became `Continue to combat` before the runs counted here.

**Real games.** Two four-player games were played through the interface with your seat answered by a bot after each decision was shown: 24 turns on a 390×844 phone and 18 turns on a 1440×900 desktop. No page error in either.

**Not finished when this was written.**

- The other 98 browser suites play built-in decks and engine scenarios through the page. One had passed and the rest were still to run. Their result is added below when they finish.
- The complete node suite and the 180-game bot sweep of the released commit `42dbe8c`, left open on 12 November, were paused to give these checks the processors: 60 of 870 test files had run (4,202 tests pass; the 4 failures are `ui-priority-action-callbacks`, repaired above) and 42 of 180 games had finished without a fault. This pass changes no rule and no bot code.
- The pictures were judged on Chromium at phone and desktop sizes. No iPhone was at hand: Safari draws the same SVG symbols and sprite, which the game already used, but it was not looked at.
