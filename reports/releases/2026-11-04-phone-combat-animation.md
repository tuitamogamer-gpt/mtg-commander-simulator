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

## Second pass

Based on `994143e`. Request: one more round of polish. The same four combats were filmed again, and five rough spots remained on the phone.

### What was wrong

- **Rows jumped when a creature died.** A dead blocker's row disappeared, and every row below it jumped up about 60 px at once.
- **The "Graveyard" label stayed behind.** It stayed where the dead blocker had been. The next row moved under it, so the label seemed to name the wrong creature.
- **"Blocked · blocker left combat" for a blocker that died.** The engine forgets a blocker once it leaves the battlefield, so the row could not say why it was gone.
- **Your life total in the Combat view did not react to a hit.** The flash was set on the life line, but the view is rebuilt as soon as life changes, so the flash was lost at once.
- **Hits on one player piled up.** Five unblocked attackers put five numbers and rings on the same spot.

The switch to and from the Combat view was also a hard cut.

### Changes

- **Rows slide** to their new places, in 280 ms, when a row leaves the list. Places are kept in the list's own coordinates, so scrolling is not mistaken for a move. A slide cut short by a new render continues from where the row was. With reduced motion, rows do not slide.
- **The zone label travels with the card** toward where it goes, in the Combat view. The desktop is unchanged.
- **The attacker's row says "Blocked · blocker died"** (or "blockers died") when its blockers went to the graveyard. It keeps "blocker left combat" for other cases, such as exile, a bounce, or removal from combat. The blockers seen this turn are remembered for this.
- **Your life line flashes red and shows the total lost**, such as "−10", for about a second. It stays marked across renders, timed from the hit.
- **Hits on one player fan out** around the life total: centre, then left, right and below.
- **The Combat view fades in** when live combat opens it, and **fades out** before the previous view returns. It uses opacity only, so the charge still measures the cards' places correctly. A decision that opens during the fade keeps the Combat view.

### Verification

- **`tests/browser/live-combat.mjs` has five new phone checks:**
  - the rows below the dead blocker slide;
  - the attacker's row reads "Blocked · blocker died";
  - your life line shows "−2";
  - the zone label travels;
  - two quick hits on one player land at least 24 px apart.

  On `994143e` the first of these fails: `{"slid":false,"lifeHit":null,"badge":false,"status":"Blocked · blocker left combat"}`.
- **`tests/browser/battlefield-combat.mjs`** now expects "Blocked · blockers died" when both blockers went to the graveyard. When one of them was exiled instead, it expects "blocker left combat".
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
  - `interaction-continuity`
- **Node tests:** the same 14 files pass 184 of 190. The six failures are the same ones in `responsive-client-v3.test.mjs`.
