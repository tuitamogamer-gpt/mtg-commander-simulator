# Table, combat and deck library — 30 October 2026

Based on `1e14737`.

## Deck library

- **Newest first by default.** The library opens with the latest release on top: an exact release date where the catalog records one (the four Star Trek precons, 13 November), then the release year, then the most recent additions within a year. Release-year dividers mark the order and the latest dated release carries a **New** badge (**New · preview** for previews). The preference key changed to `deckOrder`: older versions stored their automatic `name` order with every other setting, so a kept `deckSort` value would have hidden the new default. An explicit choice of sort is still remembered.
- **A denser, calmer grid.** Five or six decks a row on desktop (four on tablets, two on phones), shorter art, tighter type and a light lift on hover. Thirty decks per page fill whole rows.

## Table

- **Effects beside their cards.** A routine resolution recap ("Land found", a reanimation, a change of control) used to open in the lower-right corner, away from what changed. On desktop it now opens beside the first visible permanent the result changed, which is outlined and linked to the panel, or on its controller's board when no changed card is visible. It is the same dialog with the same Proceed. Table-wide results keep the central spotlight; phones keep the corner sheet. Activity notices about a card on the table (counters, granted abilities, temporary boosts) appear as a short callout beside that card; other notices keep the corner stack.
- **The response panel points at its source.** An opponent's spell or ability waiting for your response stays in the stable decision rail on the right; moving that full-height panel across the table cut its content or covered other boards in testing. Instead the rail outlines the source permanent of an ability or trigger, or the caster's board heading for a spell, and draws a connecting line when the source is near. Your own objects and target choices draw nothing.
- **Tapped lands stack.** Tapped copies of one land share a single pile with a ×N badge in the Lands · Mana column; untapped lands keep their own cells. Each copy remains its own control (inspection, preview, targeting), and a pile opens up while one of its lands is a legal or chosen target.
- **Commander hover.** Hovering the commander in the dock turns the card toward the player, raises it with a stronger gold aura and shows the large card preview used for every other card.

## Combat

- Declared **blocks** raise blue guards on the blockers and route them to the attackers they meet.
- Before combat damage, a **Combat damage** (or **First strike**) banner frames each fight, attackers in ember and blockers in blue, and marks every clash. The engine then pauses on the marked damage before state-based actions remove the dead, so the hits, the life change and the deaths are seen in order.
- The simultaneous damage event is shown as hits landing one after another (110 ms apart, up to six) with the existing lunge, trail and impact effects. Rules are unchanged: assignment and damage stay one simultaneous event.
- The pauses are presentation only (paced games): headless games, simulations and tests do not wait. Live guests receive the block pairs and the clash.

## Bots

- **Pacing:** all three presets run 20% slower again (delay multipliers Normal 1.25 → 1.5625, Slow 3.25 → 4.0625, Fast 0.75 → 0.9375).
- **X spells.** Bots cast X spells that did nothing:
  - A cast is now vetoed when the largest payable X is below the spell's effect floor: X=0 for most X spells, 0/0 creatures and X-loyalty planeswalkers. Clones, "beneath the top X", fights, team protection, creatures sized by mana spent and permanents with abilities of their own keep an effect at X=0.
  - "X damage to each creature" and "X -1/-1 counters on each creature" sweepers are valued by what the payable X kills; before, Savage Twister counted every creature as destroyed even at X=0.
  - Martial Coup is valued as a wipe only when X can reach 5.
  - While announcing X, a value below the floor is never chosen when a larger one is legal. Easy bots' near-tie randomness had picked X=0 next to X=1 or X=2. The fallback controller no longer lowers X=1 to 0.

## Jean-Luc Picard, Luminary

Seek out ("Whenever you draw your second card each turn") was checked and works as printed: it triggers once, on the second card, including inside a single multi-card draw, never on the third or later card, and again on each later turn, including opponents' turns. Three complete four-player games with Federation Fleet (28, 36 and 47 turns) recorded 7 Seek out triggers, all on the second draw and at most one per turn, including turns with three or more draws. A regression test now covers a five-card draw, the sixth card and an opponent's turn.

## Verification

- **X spells:** a probe cast 30 precon X spells for 3 difficulties × payable X of 0, 1 and 2 × 4 seeds. Before: 47 casts announced X=0 (39 easy, 4 normal, 4 hard, including Savage Twister and Martial Coup on normal and hard). After: none. New `tests/ai-x-spell-floor.test.mjs` (9 tests) fails 7 of 9 on `1e14737`; the two that already passed are the normal and hard X announcements.
- **Full games with X-spell decks:** 33 seeded four-player games, 22 on Normal and 11 on Easy, each led by one of the 131 decks that hold X spells against the next three catalog decks. All finished with a winner inside the turn limit, passed the game-state invariant checks and logged no AI fallback or script error. 34 X spells were cast, none for X=0.
- **Picard:** `tests/star-trek-federation.test.mjs` gains a human and an AI regression test; with `star-trek-cross-deck` 50 of 50 pass. The three full games are described above.
- **Deck library:** new `deck-explorer` and `player-tools` tests (newest order, the `deckOrder` default and its survival across other preference changes); with `main-setup-favorites`, 21 of 21 pass. `tests/browser/setup-experience.mjs` passes at desktop and mobile widths.
- **AI suites:** all 37 `tests/ai-*.test.mjs` files pass (734 tests; `ai-custom-skills` was killed for memory under parallel load and passes alone, 20 of 20).
- **Combat, audio, Live and effects:** 64 matching test files, 1,465 of 1,466 pass. The failure (Odds and Ends loyalty pairs in `planeswalker-combat`) fails identically on `1e14737`. Recap and save tests: 62 of 62.
- **Browser:** `action-effects.mjs` (13, including the new block and clash check), `battlefield-resource-dock.mjs` (3 widths, now asserting two ×2 piles with reachable top cards), `commander-dock.mjs` (6, now asserting the hover preview) and the new `effect-anchors.mjs` (6) pass. `player-experience.mjs` times out on the hidden Challenge pod preset on both revisions.
- **Real browser games** at 1440×900 (Federation Fleet and Klingon Fury against three bots, no page errors): the Evolving Wilds recap opened beside the Island it found; the Shadowspear review stayed in the rail and outlined its caster.
- **Full suite:** a run of all `tests/*.test.mjs` was stopped incomplete after about 4,400 tests. Its failures were known or environmental: two byte-equivalence checks need commits older than this shallow clone, and the Esper Sentinel image URL in `commander-staples` fails as before. `headless-smoke` cannot finish its 180-deck sweep inside its 60-second limit here without sharding.

Not addressed: `player-experience.mjs`, `planeswalker-combat` and the commander-staples image URL predate these changes. This is focused coverage, not a complete card catalog or physical-device run.
