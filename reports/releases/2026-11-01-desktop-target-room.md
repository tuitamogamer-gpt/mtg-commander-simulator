# Desktop targets beside the decision panel — 1 November 2026

Based on `ff27c2a`. Found during the phone review of 31 October and listed there under "Not addressed".

## The problem

On desktop, an expanded decision floats over the right edge of the table: the panel is 278px wide (scaled with the page on large screens) and runs from below the header towards the hand. That covers a Stack review, the Stack, and choosing targets. While you chose targets, it covered the land column at the right edge of every battlefield in the right half of the table:

- **Four players at 1440×900:** all five lands of each of the two opponents on the right were under the panel, so none of them could be clicked as the target of "destroy target land". The panel also hid those opponents' life totals.
- **A duel:** both battlefields span the full width, so the land columns of both were covered, your own included. This is why the desktop case of `mobile-land-targets` failed since mid-October.

## The fix

While you choose targets, the table makes room for the panel instead of lying under it. On desktop:

- every battlefield and the hand stay left of the panel;
- the header above the panel keeps its full width;
- the table returns to its full width when the choice ends, whether the target is confirmed or the cast is aborted.

Only the choice of targets makes room. A Stack review still floats over the table without changing its size, as before, so opening and closing it moves nothing. Phones are unchanged; they have their own target tray.

The board reflows into the narrower space at its usual card size. At 1024×768 the creatures of each board wrap into two rows, and a large hand scrolls a little sooner.

## Verification

- **New test `tests/browser/desktop-target-room.mjs`:** a four-player board with 32 lands and a 15-card hand, at 1440×900, 1024×768 and 1920×1080. "Destroy target land" lists every land on the table. The test checks five things:
  - every one of the 32 targets is reachable by the pointer, once scrolled into its own battlefield's view;
  - every battlefield and the hand end left of the panel;
  - the header keeps the full width;
  - a land of the lower-right opponent can be clicked, confirmed and returned as the answer;
  - each battlefield gets its width back afterwards. Aborting the cast also restores the table.

  On `ff27c2a` it fails at the first size, with 10 targets under the panel: the five lands of each opponent on the right.
- **`mobile-land-targets`** now passes its desktop case (a duel at 1440×1000, where your own two Forests sit in the covered land column) as well as its phone case.
- **A viewport matrix** at 1920×1080, 1440×900, 1280×800 and 1024×768, in both the Table and the Focus preference, found no target under the panel. Target choice always shows all opponents, so both preferences give the same table.
- **Other browser suites pass:**
  - `command-table`, `target-choice-guidance`, `decision-experience`, `arena-experience`, `arena-refresh`, `effect-anchors`, `stable-table-ui`;
  - `battlefield-resource-dock`, `priority-actions`, `interaction-continuity`, `wait-ownership`, `phone-table-polish`, `mobile-table-view`;
  - `commander-dock`, `decision-callbacks`, `battlefield-combat`, `arena-drag-controls` and `resolution-recap`.
- **Node suites:** `command-table`, `ui-polish-regressions` and `frontend-overhaul` pass, 28 of 28.
