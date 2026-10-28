# Pod setup and response priority default — 28 October 2026

Based on `2d5dbfb532f7c9287106c68f5ecf0e29e74cfdb9`.

The default priority profile is **Combat responses + before my turn** (`end`). Empty combat windows pass automatically; legal combat responses and legal plays at the end step immediately before the player's turn still wait. Required opposing-card reviews remain explicit. Full control remains available, and explicit saved profiles are preserved. The previous 20% pacing reduction is unchanged.

Pod setup separates the player's seat, the opponent roster and table settings. Duel, Trio and Full pod choices show their AI counts. Opponent cards show consistent seat numbers, a commander preview using official card artwork, deck/style controls and an expandable play-style explanation. Random decks and random commanders use a generic card back. Difficulty is visible beside the roster on desktop and below it on phones; presets, extra options and diagnostics remain collapsible. The sticky footer summarizes the actual seat count and difficulty.

The existing selection callbacks, Review flow, imported lists and Live lobby handoff remain in use. Live has its own seat-count explanation and hides Solo-only controls. A debug snapshot refreshes the visible difficulty description alongside the selected button.

## Verification

- Priority: 43/43 targeted Node tests and 8/8 browser checks at 1440×900 and 390×844. Browser checks include empty-combat automatic passing, native Seer activation sacrificing an attacking token for Zurgo draw plus scry, a legal instant response before the next turn, and persistence of explicit Full control.
- Pod: 12/12 browser checks at 1440×1000 and 390×844, including resized 2560×1440 zoom and 360×800 geometry. Native selections, duplicate-deck guards, Review/back, hidden-seat retention, random-commander previews and Live/Solo roundtrips pass with zero page errors. Artifacts: ignored `output/web-game/pod-builder/`.
- Setup selection and favorites: 6/6 Node tests pass. JavaScript syntax and whitespace checks pass.

This is targeted UI and rules regression coverage, not a full card catalog or physical-device run.
