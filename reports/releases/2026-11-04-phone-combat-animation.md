# Combat animation on phones — 4 November 2026

Based on `22caa59`. Request: tidy the live combat animation on mobile.

## What was wrong

Four real damage steps were filmed frame by frame on a 390×844 phone at Normal speed:

- an opponent attacks you;
- you attack two opponents;
- seven attackers at once, with the list scrolled;
- a first-strike block.

On a phone, the Combat view stands in for the table. Its rows were used as if they were cards:

- **Hits landed on the text.** The damage numbers were centred on the whole row, over the name and the life line, about 130 px from the creature's picture. The big rings were sized for the desktop.
- **A dying creature flew to the corner.** It left as a copy of its whole row, enlarged, and flew toward the graveyard button, which the Combat view hides. The hidden button had no box, so the copy ended in the screen's top-left corner.
- **The rows moved under the hits.** Damage adds a "N damage marked" line to a row. Every row below it moved down about 25 px, while the hits and charging copies were still playing at the old places.
- **A hit with no place on screen.** A blocker scrolled out of the list would have had its number drawn in the middle of the screen.

## Changes

- **Effects use the row's picture.** On the Combat view, damage numbers, the lunge and a dying creature's flight all use the creature's picture, at its place and size. On phones, the rings of big hits are drawn at 62%.
- **The marked damage sits beside power and toughness**, on a line the row already has. A row keeps its height when damage is marked. This applies on the Combat view and in the defender's creature list.
- **A card goes to a place on screen.** A card leaving for a zone on screen goes there. If the zone is hidden, it flies to its owner's life total shown in the view. If neither is on screen, it sinks where it stood. This also covers the Stack view, and the desktop when a pile is missing.
- **No hit is drawn for a blocker scrolled out of view.** Its row shows the marked damage when scrolled back.

The desktop is unchanged, except in one case: if the destination pile is missing, a card now sinks in place instead of flying off the top.

## Verification

- **`tests/browser/live-combat.mjs` has new checks.** On the phone and on the desktop:
  - each creature's hit is within 12 px of its picture;
  - the dying blocker's flight ends on screen, within 40 px of the graveyard or of the life total standing in for it.

  On the phone only:
  - only the picture leaves, at most 60×80 px;
  - the next row moves at most 1 px when damage is marked.

  On `22caa59` the phone fails at the first check: the hits were 131 and 134 px from the pictures.
- **`tests/browser/battlefield-combat.mjs`** now expects the marked damage after power and toughness.
- **Browser suites pass:**
  - `live-combat`
  - `battlefield-combat`
  - `phone-memory`
  - `action-effects`
  - `mobile-table-view`
  - `phone-table-polish`
  - `resolution-recap`
  - `combat-replay`
  - `command-table`
  - `stable-table-ui`
- **Node tests:** the 14 files that use the game effects or the phone views pass 184 of 190. The six failures are in `responsive-client-v3.test.mjs`. They fail the same way on `22caa59`.
