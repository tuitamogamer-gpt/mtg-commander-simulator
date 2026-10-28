# Interaction continuity and pacing — 28 October 2026

Based on `b913a9b3cb27c80fdc2a026e775b5c003e0fab13`.

## Player-visible changes

- Proceed, ordinary choice dialogs, and reveal controls stay connected during incidental renders of the same decision. Pressing a button before a redraw and releasing afterward now completes the click. The X input keeps its focus and current draft.
- An immediate interaction consumes an already queued render. Later game updates still schedule their own frame; stale frames cannot repaint a replacement game or rematched UI.
- Normal pacing uses a 1.0 multiplier instead of 1.6: cosmetic waits are 37.5% shorter. Slow and Fast remain available. This changes elapsed animation delays, not priority rules, mandatory reviews, or the AI's decision budget.

Retention is limited to unchanged content and the same game, viewer and decision context. The full pending-entry list, reaction question and manual picker participate in that context. New questions, even with identical labels, receive new controls and callbacks. Form values are compared separately from DOM attributes.

## Verification

Executed locally with Node 24 and Chromium, with animations enabled for browser continuity and arena refresh checks:

- **Before/after reproduction:** the new interaction-continuity harness failed 12 of its original 16 checks on the baseline. Main-phase, choice, review and reveal buttons detached during a held mouse gesture at 1440px and 390px; X input detached; a queued-plus-immediate render painted twice. The four next-question callback checks already passed.
- **Final continuity harness: 20/20 PASS.** Includes the original 16 checks plus four actual touch gestures on the 390px viewport with a render between pointer-down and pointer-up. Each accepted gesture answers exactly once; old callbacks cannot answer the next question. The queued-plus-immediate case paints once.
- **Arena refresh: 18/18 PASS.** Covers 1440px, 390px and 320px layouts; card/image identity; focus and scrolling; real target selection; Stack Proceed; same-name card and attachment replacement; image fallback.
- **Focused Node regressions: 67 tests pass across the final affected files.** The initial seven-file run passed 63/64; its one failure was a test-double assertion counting queued callbacks, including a newly invalidated callback. The recovery fixture now drains the frame queue and retains all recovery/decision assertions. The complete recovery file plus the three new scheduling tests then passed 10/10. The other six files were unchanged after their passing run.
- **Complete Solo game and rematch PASS.** 69 UI iterations, four land plays, six spells, two attack declarations, ending naturally on turn 16. Includes mulligan, priority, effect review, combat review, blockers, card selection and attackers. No captured page or HTTP errors. Rematch retains pod/preferences and an unanswered mulligan.
- JavaScript syntax and `git diff --check` pass.

Commands (set `PLAYWRIGHT_MODULE` and `BROWSER_EXECUTABLE` for the local installation):

```sh
node tests/browser/interaction-continuity.mjs
node tests/browser/arena-refresh.mjs
node tests/browser/player-gameplay.mjs
node --test --test-concurrency=2 tests/ui-render-scheduling.test.mjs tests/ui-decision-render-recovery.test.mjs tests/ui-decision-stale-callbacks.test.mjs tests/ui-priority-action-callbacks.test.mjs tests/ui-wait-ownership.test.mjs tests/ui-polish-regressions.test.mjs tests/responsive-client-v3.test.mjs tests/command-table.test.mjs
npm run check
git diff --check
```

Machine-readable browser receipts and screenshots are in ignored `output/interaction-continuity/`, `output/web-game/arena-refresh-chromium/`, and `output/web-game/player-gameplay/`. Baseline evidence is in `/workspace/scratch/mtg-continuity-before/`; Node logs are in `/workspace/scratch/mtg-*-tests.log` and `/workspace/scratch/mtg-recovery-final.log`.

This is bounded interaction coverage, not an all-deck rules sweep, a physical-device test, or a production deployment. The full-game harness removes cosmetic pacing waits for execution time; the 37.5% reduction describes the configured delays, not a measured whole-match speedup.
