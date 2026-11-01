# Phone table polish — 31 October 2026

Based on `a355fa7`.

## What changed

A review of the phone table at 320×568, 360×780, 390×844 and 844×390 found the following problems, all now fixed:

- **Activity notices covered your life total.** Activity notices ("◆ Riders of Gavony: +1 +1/+1 counter."), spell-copy notices and short toasts sat under the opponent seats. That is where your board heading shows your name and life, and in the full-hand view, the hand heading. They now float just above the prompt bar, over the bottom of the scrolling panel. While a sheet or modal is open they keep their old place, because the sheet takes the bottom of the screen.
- **Touch prompts said "click".** On touch screens the prompt bar and toasts now say "tap": "Main phase 1: tap a card for actions", "Tap a selected target or × to remove it". Only whole words change, so a card name that starts with those letters keeps its spelling. A mouse keeps the original wording.
- **One card per row in the full hand.** In the portrait full-hand view, a 92px commander column left room for only one stretched card per row. The commander is now a compact row with its CAST badge above a hand of two columns. Partners share the row. Landscape keeps the commander column, because height is the scarce side there. In landscape, the full-hand view's sort control is wide enough for "Draw order".
- **The routine result sheet was centred and unpadded.** The minor resolution recap ("Land found · Resolved") was meant to sit in the corner, but the shared decision styling centred it and removed the padding from its "Waiting for you" strip, so the label touched the edge. The prompt text behind it also showed in slivers along its sides. On phones it is now a full-width bottom sheet below the visible board, and its strip is padded. On desktop, a recap with no visible card to sit beside is back in its corner.
- **The target hint lost its last line.** When choosing a target for a spell being cast, the tray was capped at 180px, which cut off the second line of "No mana or other cost has been paid yet." The tray is still only as tall as its content, but its limit now grows with the screen, up to 212px (260px with zone shortcuts). Phones under about 700px tall keep the old limit.
- **A dark strip ran along the Pod and Review screens.** On phones, the backdrop of the old pod drawer still painted a strip along the left gutter, although the builder is now part of the page. It is removed.

## Verification

- **New test:** `tests/browser/phone-table-polish.mjs` runs on a 390×844 touch phone, an 844×390 landscape phone and a 1440×900 desktop with a mouse. It covers:
  - touch wording;
  - notices and toast above the prompt in the Mine and full-hand views;
  - the portrait full hand;
  - the recap bottom sheet;
  - the whole target hint and the "Tap a selected target" tip;
  - the landscape commander column;
  - mouse wording.

  On `a355fa7`, 16 of its 25 assertions fail. The landscape and mouse checks pass on both revisions; they guard behavior that was already correct.
- **Updated tests:**
  - `commander-dock.mjs` now expects the commander row above the hand in portrait full-hand views (390×844 and 320×568) and the column in landscape.
  - `resolution-recap.mjs` waits two frames after resizing to 320×568 before measuring Proceed. Dynamic viewport units settle a frame after a resize. Measured at once, the sheet was still sized for the old height, so this check failed on `a355fa7` as well. With the wait it passes on both revisions, 14 of 14.
- **Browser suites:**
  - Pass: `phone-table-polish`, `commander-dock`, `mobile-table-view`, `resolution-recap`, `effect-anchors`, `battlefield-resource-dock`, `deck-sleeves`, `wait-ownership`, `target-choice-guidance`, `setup-experience`, `pod-builder`, `decision-experience`, `arena-experience`, `stable-table-ui` and `priority-actions`.
  - `resolution-recap-highlights` passes 4 of 6. Its two Yuriko cases fail the same way on `a355fa7`.
  - `mobile-land-targets` passes on the phone (390px). Its desktop case (1440px) fails the same way on `a355fa7`; see the desktop issue under "Not addressed".
- **Node suites:**
  - The syntax check passes.
  - `frontend-overhaul`, `ios-package`, `public-release`, `player-tools`, `deck-spotlight` and `deck-sleeves` pass.
  - `responsive-client-v3` passes 9 of 15. The same 6 tests fail on `a355fa7`: its sandbox cannot construct the arena UI any more ("Cannot read properties of undefined (reading 'map')" in `new UI`).
- **A real game on a phone:** a 390×844 touch phone played a four-player game with Quick Draw through the touch UI to turn 27. It went through:
  - the mulligan;
  - land plays from the card sheet;
  - Stack reviews of opposing spells;
  - minor and major recaps;
  - target choice with Abort cast;
  - combat review;
  - a clash;
  - "Cast for free?";
  - a discard choice.

  No page errors occurred.

## Follow-up: cards you may play from exile

Based on `8c19edc`. Reported from play: on a phone, exiled cards you may play showed only as names.

### What changed

- **Full cards in the hand row.** On phones (900px wide or less), cards you may play from outside your hand lead the hand row as full hand-sized cards. They include:
  - exile permissions: impulse draws, foretold and plotted cards, adventures, and an opponent's card you may play;
  - casts from a graveyard or from the top of your library.

  Before, they were name buttons in the prompt and 24×34px thumbnails in a 76px column beside the hand, where the names were cut short. Each card shows:
  - a ribbon naming its zone (EXILE, GRAVEYARD, LIBRARY TOP);
  - a footer with its window and owner, for example "This turn only", "Foretold" or "AI Dragon's · Limited time";
  - the usual green frame when it is playable now.

  Tapping one opens the ordinary card sheet with its "Play from exile" or graveyard cast action. In the full-hand view the cards are large enough to read, and the ribbon and footer sit above and below the card instead of over it, so its name and P/T stay visible. The desktop keeps its thumbnail tray, where hovering shows the card.
- **No repeated names in the prompt.** While the Mine or Hand view shows these cards, the prompt no longer repeats them as name buttons. Two such buttons had pushed Continue out of the 130px prompt. In Table, Combat and Stack, where the hand is hidden, the buttons stay as one swipeable line, and the prompt grows by that line so Continue stays visible.
- **Counterspell on a phone.** When every legal target is a spell or ability on the Stack ("counter target spell"), the phone now opens the Stack view, where the spell glows. Before, the tray said "Glowing cards and players are legal" over your own board while the spell sat in a view you had to find. This is also why `graveyard-permission-stack-exit` failed at 390px on `a355fa7` and `8c19edc`.
- **Card back fallback.** A face-down card painted through CSS before its deck sleeve was drawn, such as a library reveal, asked for `/src/assets/cardbacks/…` and got a 404. The plain design's relative path was resolved by the stylesheet in `src/`, not the page. Sleeve URLs are now made absolute, as the global card back already was. This came from the 30 October sleeve work and surfaced as a console error in `engine-gap-audit`.

### Verification

- **`phone-table-polish.mjs`** has three new checks:
  - On a 390×844 touch phone, three exile permissions appear in this order: an impulse card playable now, a foretold card and an opponent's card. Each is a hand-sized card with an EXILE ribbon, and the right cards have the green frame and footers. There is no tray, the prompt has no name buttons, and the sheet offers "Play from exile". In Table view the two name buttons share one line and Continue is not cut off.
  - "Counter target spell" opens the Stack view, and the spell is selected and confirmed.
  - On a 1440×900 desktop, the tray keeps its three cards, with two prompt buttons and no hand-row cards.

  The exile check times out on `8c19edc`, which has no such cards.
- **`deck-sleeves.mjs`:**
  - paints a back for a seat whose sleeve is not drawn yet and checks that its URL does not resolve into `/src/`;
  - fails on `8c19edc` with `http://…/src/assets/cardbacks/obsidian.webp`;
  - also fails on any card back request with an error status.
- **Tests updated for the new phone path.** Where a phone test clicked a prompt name button to cast from exile or a graveyard, it now taps the card in the hand row and then the sheet action:
  - `engine-gap-audit`, with its Bonecrusher Giant adventure;
  - `graveyard-permission-stack-exit`, for the human at 390px;
  - `prepared-spells`, whose five exile permissions are now five hand-row cards.

  Desktop cases keep the buttons. `kotis-graveyard-grant` also checks that the expired permission is absent from the phone hand row.
- **Results:**
  - `graveyard-permission-stack-exit`: 12 of 12; on `a355fa7` and `8c19edc` it failed at the first scenario.
  - `prepared-spells`: 4 of 4, run with the bundled Chromium instead of its `chrome` channel.
  - `kotis-graveyard-grant`: 3 of 3.
  - `commander-dock`: 6 of 6.
  - `deck-sleeves`: 6 of 6.
  - `phone-table-polish`: 10 of 10.
  - Also passing: `mobile-table-view`, `target-choice-guidance`, `decision-experience`, `arena-experience`, `priority-actions`, `setup-experience`, `effect-anchors`, `resolution-recap`, `stable-table-ui`, `wait-ownership`, `battlefield-resource-dock` and `interaction-continuity`.
  - `c14-emblem` fails before it reaches the table: a pod preset button is not visible. It fails the same way on `a355fa7` and `8c19edc`.
  - `engine-gap-audit`: 11 of 11 scenarios with no console errors. Before the sleeve fix, all 11 passed but the run failed on a 404 for `/src/assets/cardbacks/obsidian.webp`.

## Not addressed

- **Desktop target panel covers boards (found during this review).** On desktop, the expanded decision panel floats over the right edge of the table (278px wide, from the header to the hand). While you choose targets, it covers the land column of each board in the right half of the table. A 1440×900 four-player check found all 10 opposing lands in the right-hand boards under the panel; neither opponent there could have a land chosen by clicking. In a duel, your own board and the opponent's both span the full width, so their land columns are covered too. This dates from 10–16 October, is unrelated to the phone changes and is why the desktop case of `mobile-land-targets` fails. A fix needs a desktop layout decision: reserve the panel's width while targeting, or move the panel away from the targets. Fixed on 1 November by reserving the width while targeting; see [Desktop targets beside the decision panel](2026-11-01-desktop-target-room.md).
- In the two-column deck library, a one-line deck name keeps the height of a two-line one, so commander lines align across a row. This is a layout choice, not a defect.
- Below 360px wide the turn title and seat life wrap to two lines, as before.
