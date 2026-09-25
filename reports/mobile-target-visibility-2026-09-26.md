# Mobile target visibility — 26 September 2026

The target panel used a fixed height of up to 340px while the mobile hand kept
its full row. With six cards in hand at 390×720, the player's battlefield cards
were clipped beneath the decision panel and could not receive a click.

The mobile target panel now follows its content, capped at 180px for battlefield
choices and 228px when public-zone shortcuts are needed. Instructions and target
chips scroll inside the panel; confirmation stays outside that scroll area.
The duplicate heading and ordinary empty-selection message are omitted, and
selected targets precede the general help text. Proliferate's zero-selection
explanation and target constraints remain available.

While choosing targets, Mine gives the hand row's space to the battlefield.
Hand remains available through the existing navigation and preserves the
unconfirmed selection. The hand row returns when the choice ends. Landscape
phones use a side panel beside the battlefield. These styles apply only at
widths of 900px or less and do not change engine decisions or card callbacks.

## Validation

- Replaying the updated browser check against the previous `mobile.css` fails
  because the legal battlefield target is covered. The corresponding screenshot
  reproduces the reported problem.
- `tests/browser/target-choice-guidance.mjs` passes in Chromium and WebKit.
  A Jace target prompt with six cards in hand is checked at 390×720, 320×568,
  430×932, 820×1180, 667×375 and 844×390. Own targets remain completely visible
  before and after selection; opponent targets, Hand navigation and explicit
  confirmation remain usable. Long instructions, sequential choices, graveyard
  and exile shortcuts also pass at 1440×1024, 1280×720, 390×844 and 320×568.
- At 390×720 the short initial prompt measures 164px and the player's board
  has 404px; at 320×568 it has 252px. Both browsers agree. No horizontal page
  overflow or page errors were observed.
- `tests/browser/mobile-table-view.mjs` passes in Chromium, including an actual
  land play, one to three opponents, empty/normal/large hands, navigation and
  return to desktop layouts.
- The focused command-table, player-tools, arena-tools, responsive-client-v3,
  iOS-package and target-zone-and-suspend-regressions suites pass: **39/39**.
- `npm.cmd run check`, `npm.cmd run audit`, `npm.cmd run certify:strict`,
  `npm.cmd audit --omit=dev --audit-level=high` and `git diff --check` pass.
  Certification timestamp-only changes are excluded from the commit.

This scoped CSS release did not run the full engine simulation suite or a full
Live multiplayer game. WebKit checks run on Windows, not a physical iPhone.
Local screenshots, browser metrics and the subsequent production verification
are recorded under `.local/mobile-targets-2026-09-26/`; release identity and
canonical URL checks are in its `release.json`.
