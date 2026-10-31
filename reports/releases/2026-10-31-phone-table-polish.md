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

## Not addressed

- **Desktop target panel covers boards (found during this review).** On desktop, the expanded decision panel floats over the right edge of the table (278px wide, from the header to the hand). While you choose targets, it covers the land column of each board in the right half of the table. A 1440×900 four-player check found all 10 opposing lands in the right-hand boards under the panel; neither opponent there could have a land chosen by clicking. In a duel, your own board and the opponent's both span the full width, so their land columns are covered too. This dates from 10–16 October, is unrelated to the phone changes and is why the desktop case of `mobile-land-targets` fails. A fix needs a desktop layout decision: reserve the panel's width while targeting, or move the panel away from the targets.
- In the two-column deck library, a one-line deck name keeps the height of a two-line one, so commander lines align across a row. This is a layout choice, not a defect.
- Below 360px wide the turn title and seat life wrap to two lines, as before.
