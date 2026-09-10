# Multiplayer control verification — 10 September 2026

All tested human seats receive the host's gameplay controls. No application-code
change was needed to restore parity: Live already uses the shared Command Table,
`MTG.UI` and viewer-specific decision controller. This task adds an explicit
four-seat control comparison and makes the detailed parity driver start its own
local WebSocket server. README and deployment instructions now describe the
shared controls instead of the retired guest interface.

Local application baseline: `f674dd78a5f7683d75b005aee9f8c2446d6cc858`.
Browser checks used installed Google Chrome through Playwright, with isolated
contexts and anonymous test rooms. The production gameplay run used
<https://mtg-commander-simulator.vercel.app/>. This task did not publish a release.

| Verification | Result |
| --- | --- |
| Multiplayer protocol, mixed-seat configurations, imported decks, real WebSocket server, player tools, priority, drag and manual-mana regressions | 80/80 passed |
| Public entry and English presentation regressions | 18/18 passed |
| Local two-human gameplay parity | 14/14 groups passed |
| Local four-human gameplay with explicit command comparison | 10/10 groups passed |
| Production two-human gameplay parity | 14/14 groups passed |
| JavaScript syntax, generated room-kernel parity and whitespace | Passed |

The four-human test compares the rendered toolbar and menu of every guest with
the host. All four receive enabled **FIND, HOLD, MANA and MENU** buttons and all
18 host menu commands. Guests in this scenario use imported decks and also
receive the deck-specific **Judge** entry. Every seat opens priority settings,
switches manual mana independently, and arms and cancels HOLD. Each guest plays
a Forest through its card sheet while a synchronized update preserves the
focused control. A paid Sol Ring, shared Stack resolution, mobile layout and
guest reload/resume also pass.

The detailed two-human scenario passes both locally and in production: host and
guest manual payments; rapid source edits; Abort cast without spending resources;
battlefield targeting; private Ponder ordering and its resulting draw; mobile
selection; Counterspell with a selected Stack target; attack and block assignment;
reload with the same selected blocker; marked damage; guest Last Resort life,
mana and tap corrections; HOLD with direct drag targeting; and Mind Stone's mana
activation. All these browser runs captured zero page/console errors. Desktop,
mobile and combat screenshots were inspected.

Gameplay choices use actual rendered controls. Reproducible cards are staged
only on the host's authoritative game. These are controlled gameplay scenarios,
not an exhaustive full-match simulation of every deck. The full repository test
suite and other browser engines were not run for this task.

Starting the room, configuring seats and resuming after a disconnect remain host
room-management functions. Hidden hands and library order remain private, and
ordinary game actions remain subject to turn, priority and card legality.

Evidence is in the workspace under:

- `output/multiplayer-controls-2026-09-10/four-human-commands/result.json`
  (includes each player's full toolbar/menu inventory).
- `output/multiplayer-controls-2026-09-10/two-human-parity/`.
- `output/multiplayer-controls-2026-09-10/production-parity/`.
- `.local/multiplayer-controls-tests.log`, `.local/multiplayer-controls-docs.log`
  and `.local/multiplayer-controls-syntax.log`.

To repeat the browser tests, set `PLAYWRIGHT_MODULE` to the installed Playwright
ES module or browser adapter and run
`node tests/browser/commander-live-parity.mjs` and
`node tests/browser/commander-live-mixed.mjs`. Both start and close their own
local test backend by default, without Redis credentials. Set `GAME_URL` to test
a deployed instance and `GAME_QA_OUTPUT` to select a separate evidence directory.
The mixed driver defaults to four humans; `BOT_SEATS` selects optional bot seats.
