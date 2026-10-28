# Full control default and calmer pacing — 28 October 2026

Based on `1138366d71e19f2d3fb7bf89afaf7e64c843cbe9`.

Full control is now the default priority profile, including empty priority windows after combat damage and before Main 2. It appears first in Priority stops, and the in-game help describes the default. UI fallbacks, newly built saves and saves without a priority setting share the same default. Explicit device choices and recorded save settings remain intact; replay still consumes the original decision timeline.

All three pace presets now run at 80% of their previous rate. Delay multipliers change from Normal `1`, Slow `2.6`, Fast `0.6` to `1.25`, `3.25`, `0.75`, respectively. Required decisions remain untimed. Replay and simulation retain their zero-delay paths.

## Verification

`tests/browser/default-priority.mjs`: **6/6 checks pass**, with zero page errors, at 1440×900 and 390×844. Fresh settings, end-of-combat priority and the actual Viscera Seer sacrifice controls with Zurgo Stormrender are exercised. Sacrificing an attacking token before Main 2 draws one card, scries one and does not drain the opponent. A manually selected profile survives reload, and the Normal preset applies its new delay multiplier. Receipts and screenshots are stored in ignored `output/web-game/default-priority/`.

**43/43 Node tests pass** across `priority`, `priority-explicit-stop`, `combat-action-audit`, `save-settings` and `save-continue`. They cover priority ownership, explicit stops, combat actions, persisted settings and save replay. JavaScript syntax and whitespace checks pass. This is focused regression coverage, not a complete card catalog or physical-device run.
