# Attack and instant effects — 28 October 2026

Based on `643386e06bb444ce7f04175f4037597f399cb3b8`.

Committed attacks get short ember trails from visible attackers toward their actual defenders, with a brief declaration label. Instants get a silver-blue travelling light, two staggered rings toward the visible Stack surface or phone Stack tab, and the chosen spell name. These are cast/declaration facts, not claims that damage was dealt or a spell resolved successfully.

The engine's existing public event now includes attacker/defender pairs and the actual cast spell name. Solo and Live consume the same facts; Live's existing event cursor prevents refresh/reconnect replay. Spell classification uses the chosen spell types, including Adventures, and excludes hidden and face-down identities.

`action-effects.js` owns disposable, inert decoration outside the reconciled arena. It uses Web Animations with a 960 ms lifetime, at most six concurrent/queued effects and eight attack paths per effect. Layout measurements honor UI zoom and use visible seat/Stack fallbacks. It never animates live card controls or adds an engine wait. Scroll, resize, hidden tabs, setup, replacement games/UIs and reduced-motion changes remove old effects and cancel queued frames. Replayed actions and AI simulations stay quiet.

Hyperframes' motion-design skill informed the staggered build, travelling light and faster fade. These interactive effects use native browser timelines tied to actual board positions, with no rendered video or additional runtime dependency. Colors use the design-system palette and a shared spell token; original card artwork is unchanged.

## Verification

- `tests/browser/action-effects.mjs`: Chromium at 1440×900, 390×844 and 2560×1440 with UI zoom. Checks geometry, visible labels, click-through, held-button completion, focus/card identity, no replay on redraw, bounded bursts, deduplication, actual spell face/name, suppression and cleanup. Screenshots/receipt: ignored `output/web-game/action-effects/`.
- `tests/browser/arena-refresh.mjs`: 18/18 pass, covering refresh identity, scrolling, target choices, Stack Proceed and replacement cards.
- Audio, keyword events and multiplayer parity: 70 unique tests pass across the final affected files. The new event regression executes a real attack and paid Stomp Adventure, verifies both Live seats receive the actual public facts once, and checks repeated/reconnected snapshots.
- JavaScript syntax and whitespace checks pass.

This is targeted interface and event coverage, not a complete catalog rules run or physical-device testing.
