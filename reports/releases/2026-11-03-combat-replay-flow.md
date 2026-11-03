# Combat replay in the flow of the game — 3 November 2026

Based on `7316229`, which added the combat replay (`e1c74de`) and its Combat animation setting.

## What real games showed

Two real Solo games were driven through the interface: four players with Quick Draw, at 1440×900 and on a 390×844 touch phone. Your seat answered every decision through the interface's own pending choice, as a bot would. A recorder in the page noted when each replay window opened and closed, how many strikes it held, the phases the game went through meanwhile, and any decision of yours waiting behind it. The games ran at game speed 0.3 to reach many combats; at Normal the game behind moves more slowly, but in the same way.

- **The game kept going behind the replay.** The window covered the table and made it inert, but the engine did not wait for it.
  - Desktop: of 18 replays, 12 ended after the game had left combat. In 7 of those the next turn had already begun.
  - The longest replay ran 21.5 seconds over 6 strikes, while turns 43 to 47 went by, including a new combat that was declared and dealt behind the window.
  - Phone: 8 of 10 replays ended after combat, and 6 of them in the next turn.
  - Your own main phase 2 often waited behind the window.
- **Each combat was shown twice.** The table first animated the damage step: the clash and the hits, with pauses of 1.9 to 2.4 seconds at the base pace, or 2.9 to 3.8 seconds at Normal. Then the replay showed the same step again.
- **The replay ignored the game speed.** Each strike took 3.3 seconds, or 4.6 seconds with three or more blockers, on Fast as on Slow.
- **Small things on the replay:**
  - "1 BLOCKERS";
  - "1 / 1 attackers" and "1 / 1 strikes";
  - every bot's portrait read "AI", and the "I" showed beside the damage number;
  - the window changed height between strikes, so it jumped by about 50px when the step totals appeared on the last strike.

## What changed

- **The game waits for the replay in Solo.** Each damage step is held until its replay has played or been skipped. Only then do the next step, its triggers and any decision follow. Pause pauses the game as well. A rendering failure closes the window, so the game can never be left waiting.
- **One presentation per step.** When the replay shows a step, the table skips its own pauses for that step (`Game.combatPace`). With Combat animation off, the table keeps its pauses as before, and Replay last combat stays available.
- **First strike and regular damage share one window.** After the first-strike step the window stays open for 0.7 seconds, and the regular step continues in it. Next or Finish during that moment closes it.
- **Speed.** The time after each hit follows the game speed: Normal keeps the authored 3.3 seconds, Fast is 0.6 times as long, and Slow up to 1.6 times. The hit stays in step with the card animation. An instant game keeps the authored timing.
- **Where it waits.** Only a local Solo game waits, bound in `main.js`. Live hosts publish events and never wait for a viewer, and Live guests receive replays as before. AI simulations, unpaced and instant games, a hidden tab and disabled animation never wait.
- **Details:**
  - the defending player shows their commander's art, as the seat portraits on the table do, and the initials of their name without it (never "AI"). Where only the whole card image is available locally, the circle is zoomed to its art, not the name bar and type line;
  - "1 BLOCKER" and "Strike 2 of 3"; the attacker count appears only when there are several attackers;
  - the window keeps its tallest height during one showing, capped at the screen height.

## Verification

- **The same two games again, after the change:**
  - all 22 desktop replays and all 11 phone replays opened and closed within the same damage step and turn;
  - no decision waited behind them;
  - a replay took 2.3 seconds per strike at that game speed.
- **New engine tests, `tests/combat-replay-gate.test.mjs`:**
  - the game holds a step until its replay has played, with damage already dealt and no separate table pauses;
  - with animation off, the table keeps its pauses and nothing waits;
  - unpaced and instant games never wait;
  - a bot thinking ahead never waits.
- **New presentation tests, in `tests/combat-replay-presentation.test.mjs`:**
  - Finish and Skip release the waiting game, and an unshown step never holds it;
  - the first-strike and regular steps play in one window, and a lone first-strike step closes after the grace;
  - the time after the hit follows Normal, Fast and Slow.
- **On `7316229`:** five of the seven new tests fail. The two that pass, animation off and instant games, guard behavior that was already right.
- **The replay suites pass:** `combat-replay-events`, `combat-replay-presentation` and `combat-replay-gate`, 24 of 24.
- **Browser suites pass:** `combat-replay` 9 of 9, `combat-animation-setting`, `optional-trigger-choice`, `battlefield-combat`, `mobile-table-view`, `live-lobby-experience`, `resolution-recap`, `phone-table-polish` and `desktop-target-room`.
- **Combat, recap, Live and AI combat Node suites (70 files):** 985 of 986. The one failure, a check that all 95 deck/planeswalker pairs have all 264 loyalty paths in `planeswalker-combat`, fails the same way on `7316229`.
