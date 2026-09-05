# Arena refresh repair — 2026-09-05

Request: remove distracting visual refreshes, especially on phones.

The renderer cleared the entire arena on every state update. Its image pool preserved some decoded images, but detached their ancestors and recreated scrolling surfaces. Command Table portraits were added after that pool was applied, so they were always recreated.

The arena now composes its next state offscreen and commits it through `arena-render.js`. Unchanged regions remain connected. A small explicit set of structural containers keeps its identity while changed interactive subtrees receive fresh controls and callbacks. Retention is invalidated when the game, viewer, pending decision, reaction, drag mode or hand sort changes. Card instance IDs distinguish otherwise identical hands, attachments, lands and commander controls.

Scroll survives ordinary updates in hand, battlefield, opponent lanes, decision content and dialogs. Repeated Stack reviews settle their entry animation. Dialog replacement preserves the focused control and original return-focus target. Reused images handle failure on their attached element. Rules and AI strategy are unchanged.

## Verification

- `npm run check`, `git diff --check`: pass.
- Relevant frontend/interaction Node tests: **40/40** pass; `output/arena-refresh/targeted-final.log`.
- New `tests/browser/arena-refresh.mjs`: **18/18 Chromium and 18/18 WebKit**, with motion enabled. Desktop 1440×1024, mobile 390×844 and 320×568, and short Stack review. Same-node assertions plus a MutationObserver establish that unchanged tracked cards, portraits and panels never detach. Natural overflow tests cover the hand, own board, opponent strips and activity rail. The opponent outer container itself did not overflow in these layouts.
- The same browser suite checks live life/permanent updates, target selection, the current Stack Proceed callback, a real engine land play, replacement decision promises, same-name card/attachment identity, dialog focus and attached image fallback. Both reports contain zero page errors and HTTP failures. Evidence: `output/web-game/arena-refresh-{chromium,webkit}/`.
- Complete human UI games on desktop and **390×844 mobile**: 89 decisions, 18 turns, 4 lands, 8 spells, 3 attacks, blocking/reveals/card choices, natural game completion and rematch. Mobile evidence: `output/arena-refresh/mobile-gameplay/`; desktop: `output/web-game/player-gameplay/`.
- Command Table browser suite, mouse/touch drag controls, and player-experience suite pass. The latter covers setup at 320/390/820/1280/1900px, search, sorting, settings and actual land play. Logs: `output/arena-refresh/`.
- Required skill Playwright client executed after the final runtime changes; screenshots and state inspected in `output/arena-refresh/skill-final/`. Chromium/WebKit phone captures and mobile game completion were also visually inspected.

## Authorized release verification

The user subsequently requested commit, push and production deployment. Parallel README-only commits remain intact.

- Full suite: **7,162/7,162 pass**, zero failed/cancelled/skipped tests, 616.36 seconds. Before/after SHA-256 manifests contain 899 identical runtime/test/script/API/config files.
- Syntax, catalog audit, strict certification (**19,484/19,484 definitions; 2,347 card/deck checks**), dependency audit (zero vulnerabilities), and diff checks pass.
- Catalog export and read-only check pass against the pinned snapshot. Only the runtime input fingerprint changed; card lists/counts/classifier identity are unchanged.
- Source provenance: **52 batches / 5,200 rows (127–178)** pass against the pinned SHA-256 feed.
- Fresh local Live browser acceptance: **6/6**, including two isolated clients, guest imported deck, private remote land decision, guest reload/reconnect and host resume, without uncaught errors.
- Release evidence: `output/release-arena-refresh-2026-09-05/`. Deployment/SHA/HTTP verification and post-deploy Chromium/WebKit refresh checks are recorded there after publication and in the final handoff.
