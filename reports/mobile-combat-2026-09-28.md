# Mobile Combat — 28 September 2026

The mobile navigation now has **Mine**, **Table**, **Combat**, and **Stack**.
Combat replaces the Hand tab. **View all** above the hand still opens the full
hand grid with the existing inspect, sort and play actions.

At widths up to 900px, attack declarations, blocker assignments and attack
reviews automatically open Combat. Public defenders or incoming attackers
stay beside the scrollable creature roster, above it on portrait phones.
Every creature shows its assignment, power/toughness and relevant keywords.
Inspect controls retain the draft. All attack, Clear and explicit confirmation
remain outside the scroll area. Navigating to another tab never submits a
declaration; Open Combat returns to the same draft. Between decisions the tab
shows the public attack/block state.

The mobile controls reuse the existing declaration handlers and legality
checks. Forced attacks, defender restrictions, flying, menace, and multi-block
assignments still use the engine's existing decisions. A disabled choice
explains when a creature cannot attack or block the selected target.

Desktop keeps its battlefield controls, drag interactions, Details overview,
assignment lines and layout. The mobile panel is not rendered there, and its
styles only affect the new panel and mobile view. Resizing retains the pending
declaration and its selections.

## Validation

- Syntax checks (`npm.cmd run check` plus `node --check` for the two combat
  modules) and `git diff --check`: pass.
- Eleven focused test files covering command-table, player tools, responsive
  UI, iOS packaging, combat controls, dragging, frontend, targeting, UI polish,
  English presentation and the baseline: **79 pass, 0 fail, 1 skip**. The skip
  requires a generated iOS bundle, which was not produced for this web release.
- `npm.cmd run audit`, `npm.cmd run certify:strict`, and
  `npm.cmd audit --omit=dev --audit-level=high`: pass. Certification checks
  25,792 definitions and 14,566 card/deck combinations; no npm vulnerabilities.
  Timestamp-only certification report changes were discarded.
- Chromium and WebKit battlefield/combat browser acceptance: 13 check groups
  pass in each browser,
  including 320×568, 390×844, 844×390, 768×1024 and 1280×720; player/planeswalker
  split attacks, exact submissions, forced attacks, block restrictions,
  clear/remove, inspection, navigation, empty rosters and resize retention.
  Desktop attack, block, drag and Details checks remain in the same suite.
- Mobile navigation browser acceptance: 8 check groups pass, including real
  seeded Solo land play from the full hand, one to three opponents, normal/
  empty/large hands, and restoring desktop at 1024px and 1440px from every view.
- Target-choice browser acceptance passes: hand access from Combat retains
  selected targets, explicit confirmation and the existing target layout at
  six mobile sizes and desktop sizes.
- Four isolated Live clients pass the full browser flow. Every seat attacks
  and blocks on a phone; all three guests reload while blocking and recover
  the same pending decision and selected blocker. The host verifies actual
  marked damage and life totals after combat. Manual mana, shared stack,
  private library choices and hidden-zone isolation also pass. No browser
  errors were recorded.

Early browser runs exposed timing assumptions in the tests when changing
viewport size: matchMedia rerendering is asynchronous. The tests now await
the completed view change, and the final Chromium, WebKit and Live runs pass.
The phone panel is also hidden by CSS immediately when leaving the mobile
breakpoint. WebKit's initial catalog-loading wait was extended for this large
card catalog on Windows. Initial incomplete runs remain in the local evidence.

The isolated worktree starts at `c6d2700`. Unrelated tracked edits and two
untracked card tests in the original checkout are excluded from this release.
The previous verified production deployment is
`dpl_G1H5k7qgYCo8BVCpzUZ3ukZJmUQE`.

Local screenshots, browser reports and production verification are kept under
`.local/mobile-combat-2026-09-28/` in the original checkout. The release record
includes the pushed revision, deployment state, exact committed-source hashes
from the canonical https://mtgpod.xyz/ URL (redirecting to www), and signed-out
account/Live health checks.

This is a scoped interface release. The full engine simulation sweep was not
rerun; browser automation is not a physical iPhone or Android device test.
