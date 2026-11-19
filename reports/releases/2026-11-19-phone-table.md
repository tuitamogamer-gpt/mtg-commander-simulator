# The phone table — 19 November 2026

Based on `3161452`. The request: tidy the phone version too, after the way MTG Arena and Hearthstone lay a card game out on a phone. What was taken from them is how the screen is used, not how they look: the board is the screen, your side is at your thumb, there is one clear action, and a player is a portrait with a life total.

## What the phone showed

On a 390×844 phone the Mine view was a dashboard:

- a framed panel headed `Your battlefield`, the commander's name and a `Your turn` chip, with your life as a small number in its corner;
- under it a row of four labelled buttons (`Hand 7`, `Library 25`, `Graveyard 0`, `Exile 0`), then a `CREATURES` title, then one row of cards in which creatures and their support shared one sideways scroll, a `LANDS · MANA` title, the land counts, and the mana rocks cut off at the panel's edge;
- a prompt of three stacked lines (`Waiting for you`, the instruction, a full-width button);
- a hand under its own heading (`Your hand 7`, a sort menu, `View all`): three cards of 81×114 px beside a commander tile, the rest behind a sideways scroll;
- an opponent's board only instead of yours, never beside it; with it open your life was not on the screen at all;
- in Combat, a list: one row of text per creature with a thumbnail and an `Inspect` button.

## What it shows now

`src/modules/phone-table.js` marks the table as it is composed (`ct-phone`) and `src/phone-experience.css` lays it out. Every control keeps its handler; the rules, the decisions and the Mine / Table / Combat / Stack / Politics destinations are as they were. A short landscape screen keeps its side-by-side layout.

- **Two sides.** The seats are round portraits with a name and a life total; the active one is ringed. On a phone 760 px tall or more, the creatures of the opponent across the table stand above your board as a strip of small cards under that opponent's name, and the seat across points at it. A seat opens that opponent's whole board, with its name and piles on one line; your own creatures are then the strip, below it. Shorter phones show one board at a time.
- **You are beside your hand.** Your portrait (ringed on your turn), your life in 28 px figures and your piles are one bar between the board and the prompt, whichever side is open. The Hand pile opens the whole hand, where the heading and sorting are. Floating mana takes your name's place.
- **The board has no frame or titles.** With 700 px of height your creatures face the table and their support stands behind them at a smaller size, each row scrolling sideways on its own. Lands are one line of counts by name with the mana rocks at its start. The cards are anchored from the top: a prompt that grows or shrinks moves the lands and your bar, not the cards.
- **The hand has larger cards.** Cards of 90×126 px on a tall phone (81×114 before), side by side in a row that scrolls sideways, with the commander at its head as a flat card under a crown. *The first version was a fan of overlapping cards with playable ones standing up; it was taken out on 20 November after the first play test, at the player's request. See the note at the end.*
- **One action.** A prompt with one button is one line, the button at the right thumb.
- **Combat is cards.** Attackers and blockers are a grid, three to a row (four on a short phone): the picture, the name, power and toughness, keywords, what the card is doing. A chosen card steps forward in a ring; Inspect is a mark in the corner with 44 px around it. What stands above the cards is shorter: six creatures are in view where three rows of the list were.
- **The card sheet** shows the card at 44% of its width instead of 36%, and its action is a 52 px button.
- Notices stand on your portrait and life instead of over them.

## Graphics memory

A phone's graphics memory is small and an iPhone tab that runs out is closed. Measured in Chromium at device pixel ratio 3 on 390×844, with motion on, over `LayerTree`:

| | before (`3161452`) | first version of this table | now |
|---|---|---|---|
| at rest, your turn | 44 MB in 28 layers | 48 MB in 47 layers | **26 MB in 25 layers** |
| an opponent's board open | — | — | 33 MB |
| peak of a staged wipe of twenty | 65 MB | 72 MB | **51 MB** |

The first version was worse than the table it replaced, so the layers were read one by one. Every box that scrolls is a layer of its own, and so is everything drawn over it later in the document. The seats were appended last, over boards that scroll; they, the prompt and the hand shared one layer nearly the size of the screen (10 MB), and a second one of 9 MB hung on the commander's `CAST` mark. Three changes, with what each measured as it was tried:

- only the rows of cards scroll: your board, the strip across the table and their wrappers do not (48 → 37 MB);
- the header and the keyword marks have no backdrop filter on a phone, about a dozen small layers fewer (→ 36 MB);
- the seats stand right after the header in the document, so they are drawn before the boards (→ 27.5 MB; 26 MB in the finished table).

Both rules are in `DESIGN.md` now, and `tests/browser/phone-table.mjs` reads the layer tree: one layer the size of the screen (the document) and no more than 38 MB at rest.

## Two things the tests found

- **The fan and a touch on a card's middle** (the fan is gone now). With a deep overlap, a touch in the middle of a card landed on the card over it, so each card kept more than half its width in view.
- **Cards that jumped.** The first version anchored your cards to the bottom of the board, so they moved whenever the prompt changed height; a removal's hit then landed beside its card (`single-removal`). They are anchored from the top.

## Verification

**New and changed tests.**

- `tests/browser/phone-table.mjs` (new, 10 checks): at 390×844 your bar between the board and the prompt, 44 px piles, no frame and no hand heading, the seats right after the header; the fan (overlap, each middle in view and hit, five whole cards, playable cards standing up, a card of the middle opens its sheet, the Hand pile opens the whole hand and back); the one-line prompt; the two sides (the strip, its name, the marked seat, a card across opens its sheet, an open opponent's board with yours and your life under it, the one line when nothing is across); Combat cards (three to a row, Inspect looks, a touch chooses); 390×660 and 320×568 (one board at a time, a whole creature above the lands, your bar always in view); a taller prompt moves your bar and not the cards; 844×390 is not the phone table; the layer memory. The pending decision is the same object throughout.
- `tests/browser/mobile-table-view.mjs`, `tests/browser/command-table.mjs`: the two sides in place of "one board owns the board area"; an opponent's lands in view, or reached by a swipe.
- `tests/browser/phone-table-polish.mjs`: notices just above your portrait and life; a recap sheet rises under both front lines.
- `tests/browser/battlefield-resource-dock.mjs`: a lane scrolls sideways on its own.
- `tests/browser/single-removal.mjs`: the card that is off this view belongs to an opponent who is not across; a card across the table is hit where it stands (new check).

**Browser suites.** 58 of the 149 ran in this round, in three or four lanes beside each other: the phone and table suites, combat, effects and motion, the wipe, decisions and priority, Politics, the recap, setup and the Live lobby.

- After the last change to the code, fourteen ran again and pass: `phone-table`, `phone-table-polish`, `mobile-table-view`, `commander-dock`, `command-table`, `single-removal`, `phone-memory`, `card-art-edges`, `zone-flights`, `battlefield-resource-dock`, `mobile-land-targets`, `table-motion`, `effect-anchors`, `battlefield-combat`.
- Three suites that measure time on a desktop failed beside the other lanes and pass alone: `board-wipe` (5 checks), `live-combat` (9) and `single-removal` (9; its desktop check `the lane waits for the hit` read 183 ms and 40 ms under load against the 200 ms it expects).
- `planeswalker-haste` and `ghostly-prison` ran and passed before the layer changes and were not run again after them.
- The other 42 suites of the broad run passed once, before the last two changes to the stylesheet (the top anchoring and the whole card from another zone).

**Node tests.** The 21 test files that load the table's modules, the stylesheets or the documents: 149 tests, 148 pass and one is skipped. The 13 interface files (`ui-*`, `main-*`): 99 pass. `npm run check`, `node scripts/build-startup-catalog.mjs --check`, `git diff --check`, the iOS bundle and `npm run ios:test` pass.

**Real games.**

- One four-player Solo game through the interface on a 390×844 phone with touch, every seat played by a bot, at the Fast pace for five minutes: 35 turns, 486 renders, all of them the phone table with your bar; a staged wipe played on it; 323 hand cards sampled in the fan, each hit by a touch on its middle; your bar never over the prompt; no sideways scroll; no page error.
- Earlier in the round, in a real game through the touch controls: the opening hand kept, a land touched in the fan, its sheet opened and `Play land` pressed; the land was on the battlefield as a count.
- Looked at: 320×568, 390×660, 393×724, 390×844, 430×932 and 768×1024, each with the same populated table.

**Not verified.**

- No phone was at hand. Everything was seen in Chromium with touch emulation; the memory is Chromium's layer tree at pixel ratio 3, and Safari decides its layers differently.
- Nobody held it: the reach of the thumb, the feel of the fan and of the smaller across strip under a finger are untested.
- Live rooms on a phone were not looked at; the table code is the same, and the `commander-live-*` suites did not run in this round.
- The Combat view between decisions (the fights in progress) and the attackers you block are still rows.
- A tablet (768 px and wider) gets the same table with a lot of empty middle; it was looked at once and not designed for.
- The other 91 browser suites and the rest of the node suite did not run. The two node tests that failed on the released commit before this work (`planeswalker-combat`, `save-state`) were not touched.

## 20 November: the fan is taken out

After the first play test the player liked the phone table and did not like the fan of hand cards. The hand is a row of cards side by side again, as it was before this work, at the larger size. Nothing else of the table changed: the bar with your portrait and piles, the Hand pile that opens the whole hand, the two sides, the one-line prompt and the Combat cards stay.

`tests/browser/phone-table.mjs` now checks the row: the cards do not overlap, stand in one line (a playable card is framed, not raised), a touch on a card is that card, at least three whole cards are in view and the last one is reached by scrolling. All ten checks pass; at rest the table holds 27.5 MB of layers (the hand's row is 1.5 MB larger than the fan's was). Where this report says "fan" above, in what was verified, it describes the first version.
