# Commander hand dock — 28 October 2026

Based on `8ba7238f6bbdbab7cdf93e140d4fa778ea9c4764`.

The bottom strip separates commanders into a left panel and gives hand cards their own area on the right. Command-zone cards use their original artwork with a perspective tilt, layered gold edge, soft aura and hover/focus lift. Leaving the command zone removes those effects and shows the commander's location. The panel keeps its space when a commander is cast or the hand becomes empty. Both partner cards remain independently accessible; The Ring retains its original details control beside the hand tools.

The dock moves existing command-zone controls, preserving their cost calculation, casting/ninjutsu actions and keyboard handlers. New structural containers participate in arena reconciliation so unchanged cards, images and the running aura stay connected through incidental renders. System and in-game reduced-motion preferences disable the tilt, transitions and repeating aura. Rules, original card images and engine timing are unchanged.

## Verification

Local Chromium and Node 24:

- `tests/browser/commander-dock.mjs`: passes at **1440×900, 1280×720, 390×844, 320×568 and 844×390**. Covers left/right separation, reachable controls, keyboard inspection, refresh identity/focus, partners, Ring inspection, mobile full-hand view, exile access, long-hand scrolling, empty hands and the large-card preference. A real UI cast uses the engine, pauses at the Stack checkpoint, resolves to the battlefield, and returns to the command zone with the increased commander tax. Both reduced-motion preferences are checked.
- `tests/browser/arena-refresh.mjs`: **18/18 pass**, including card/image identity, focus, scrolling, real targeting and Stack actions, and replacement cards with the same artwork.
- `tests/browser/battlefield-resource-dock.mjs`: crowded battlefield and resource accessibility checked at desktop, laptop and phone sizes.
- `node --test tests/command-table.test.mjs tests/ui-polish-regressions.test.mjs`: **23/23 pass**.
- `npm run check` and `git diff --check` pass.

Browser screenshots are saved locally in ignored `output/web-game/commander-dock/`, `output/web-game/arena-refresh-chromium/` and `output/web-game/resource-dock/`. These checks cover the changed interface; they do not constitute a full catalog rules run or physical-device testing.
