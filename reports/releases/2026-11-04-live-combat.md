# Live combat on the table — 4 November 2026

Based on `8bc3091`. Asked for: combat animated as it happens, instead of a replay window afterwards. Of the two options offered, the choice was the table itself. The replay window stays for **Replay last combat** only.

## What happens now

With **Combat animation** on (the default), a damage step plays on the table:

- **Charge.** Just before the damage, every attacker charges. A blocked attacker charges its blocker; an unblocked one charges the defending player's life total (or a planeswalker or battle). The card that moves is a copy in the effect layer. The real card stays in place, faded, and the fade survives renders. A blocked attacker whose blocker is not in view does not charge at all, so it never looks like a hit on the player.
- **Hit.** The charge lands as the damage is dealt. The engine already paused for `700 ms × game speed` before damage (`Game.combatPace`); that pause is the charge's length, less the frames it took to start. At the hit the table shows what the engine did:
  - damage numbers on the cards (40 ms apart while charging, instead of 110);
  - the life total dropping;
  - the existing shake and vignette for big hits.
- **Back and after.** The copies return before state-based actions, so creatures that died then leave for the graveyard with the usual zone animation.
- **Phone.** For the step the phone opens its Combat view, where each attacker sits beside its blockers, unless a decision is open. An unblocked attacker charges "You · N life" in that view. The view does not show another player's seat, so an attack on another opponent charges the attacker's own "→ name" line, which now marks that player (`data-defender-player`). When combat ends, the phone returns to the view it was on.
- **Nothing covers the table.** No window opens, the table is never inert, and the game never waits for a presentation. The central "COMBAT DAMAGE" banner is left out while charging, so it does not sit over the cards in motion or the seats. First strike keeps its own "FIRST STRIKE" accent.
- **Off.** With Combat animation off, reduced motion, or an instant game, nothing charges. With animation off the table keeps its framed clash, banner and short damage lunges, as before.

The recorded steps are still kept. **Replay last combat** (phone Combat tab, MENU) opens the replay window with the improvements of 3 November: commander portraits, wording, speed-based timing and steady height.

## Undone from 3 November

The 3 November change made the game wait for the replay window and skipped the table's own pauses while it played. With no automatic window, both are gone again: `combat-replay-events.js` only records, and `main.js` binds nothing. `Game.combatPace` stays as the named pause the charge is timed to.

## Found on the way

- **A card filled the phone screen.** On a phone, the existing damage lunge copied the whole row of the Combat view for a blocker hitting back. Outside the table's styles its image had no size, and the card art filled the screen. The lunge now copies only the art and takes the art's size, and while attackers charge it is not drawn at all.
- **Damage numbers in the corner.** On a phone, damage to a player whose seat was not in view, such as another opponent while the Combat view was open, showed its number at the top-left corner of the screen. The hidden seat had no position. The number now goes to a visible stand-in: the seat chip, your life in the Combat view, or the attacker's "→ name" line. Measured on a 390×844 phone, the number for Grizzly Bears hitting another opponent was centred at (0, 0) on `8bc3091` and is now at (226, 183), on that line.

## Verification

- **New browser test `tests/browser/live-combat.mjs`.** A real damage step at Normal speed, on a 1440×900 desktop and a 390×844 touch phone: Shivan Dragon into a Serra Angel, and Grizzly Bears unblocked. Frame by frame, it checks that:
  - both attackers charge before the damage, and the real cards fade;
  - the Dragon reaches its blocker as the damage lands, and the Bears reach the defending player's life total;
  - the copies are home before the blocker dies;
  - life goes 40 → 38 and the Angel goes to the graveyard;
  - no replay window opens, the table is never inert, and Replay stays available;
  - on the phone, the Combat view opens before the charge and gives way to the earlier view after combat.

  With animation off and with reduced motion, the damage is the same and nothing charges.
  - Measured on the desktop: the charge started 148–220 ms after the event and touched the blocker within about 80 ms of the damage.
  - Measured on the phone: the charge started at 56 ms, contact at 1067 ms, damage at 1147 ms.
  - On `8bc3091` the test fails: damage came at 81 ms with no charge, the replay window opened and the table was inert.
- **Updated tests:**
  - `combat-replay` opens Replay last combat itself and checks that damage never opens the window (9 of 9);
  - the Live presentation tests check replay order and identity through Replay instead of automatic playback;
  - `action-effects` expects a charge and no banner by default, and the framed clash with its banner when animation is off (13 of 13).

  The 3 November gate test was removed with the gate.
- **Browser suites pass:**
  - `combat-animation-setting`, `battlefield-combat`, `mobile-table-view`, `effect-anchors`, `command-table`;
  - `decision-experience`, `resolution-recap`, `phone-table-polish`, `live-lobby-experience`;
  - `optional-trigger-choice`, `interaction-continuity`, `stable-table-ui` and `desktop-target-room`.
- **`live-combat` also covers an attack on another opponent:** on both screens, the copy reaches that player and the damage number appears there, not in a corner.
- **Node suites:** replay events and presentation, command table, UI polish, frontend, player tools, Live battlefield lookup and optional target timing pass, 69 of 69.
- **Real games, driven through the interface** (four players, Quick Draw, your seat answered by bot decisions; game speed 0.3 to reach many combats). A recorder counted every damage step, charge, window and locked table:
  - **Phone, 390×844:** before the stand-in fix, 5 of 12 steps charged. Each step without a charge was an attack on another opponent. After it, 11 of 11 steps charged, all in the Combat view.
  - **Desktop, 1440×900:** 18 steps. Every step without a charge came after your seat was eliminated, when the "eliminated" window covers the table (`MTG.lastCombatCharge` names the reason: the attackers are not in view).
  - **Both:** no replay window opened, the table was never inert, and there were no page errors.
- **Not exercised:** Live in a browser. Live publishes the same clash events, so guests and hosts run the same charge; how closely it meets the hit depends on when those events arrive.
