# Multiplayer guest controls and mixed human/bot tables

Implemented and validated locally. The user subsequently authorized commit, push to main, and production deployment without rerunning tests. Publication evidence is saved under `output/release-multiplayer-2026-09-07/`.

## Reproduction

The original guest renderer and stylesheet from commit `691733e`, served through the real local WebSocket room service, reproduce the reported static-looking opening screen in WebKit at 1365×768. The mandatory Keep button begins at y=823 and ends at y=865, below the viewport. The host is waiting for that remote opening-hand decision. Evidence: `output/multiplayer-repair/webkit-before/before-keep.png` and `result.json`. A separate baseline at 1440×1000 successfully played a guest land and reconnected, so this is not evidence of a universal connection outage.

## Changes

- Guest decisions appear before the board and stay reachable while scrolling. Unchanged decision controls remain attached during public updates, preserving a mouse-down → update → mouse-up interaction and keyboard focus. Pending submissions disable repeated responses.
- Lobby card images use a bounded grid row; human/bot and deck selectors remain visible. macOS select controls have an explicit readable height.
- Host can add/remove empty seats and choose human or local bot per unoccupied seat, with two to four total seats and at least the human host. Occupied human seats remain protected even after disconnect. Bots have host-selected decks and genuine local AI controllers; no remote model service is involved.
- Noncontiguous human/bot seat identities, names, commanders, private views, ready checks, imported lists, and server connection assignment follow the configured roster.
- Server actions carry exact request acknowledgments. The client ignores stale views and unrelated acknowledgments; legacy servers use matching action/seat events. Public updates are coalesced to avoid queueing every bot event. Bots wait while the room is paused.

## Validation

- Final focused multiplayer tests: **32/32 passed**, including both room implementations across every possible human/bot arrangement for 2–4 seats, authority/privacy checks, request ordering and bot pause/resume.
- Broader baseline/headless/multiplayer run: **38/38 passed**, including deterministic four-player games across the deck catalog. The later controller pause wrapper is covered by the final targeted suite and final WebKit gameplay.
- Real isolated browser sessions: **2 humans + 2 bots** and **3 humans + 1 bot** in WebKit; **1 human + 3 bots** and **4 humans** in Chromium. Verified opening controls, imported guest decks, private hands, each guest playing a land, paid Sol Ring casting through the shared Stack, resolution, reload/resume, and each configured bot developing mana. No captured page/console errors in successful scenarios.
- Final WebKit mixed-table run: `output/multiplayer-repair/webkit-final/result.json`; the three-human pointer/update check: `webkit-3h1b-final/result.json`. Mobile guest layout checked at 390×844 for horizontal overflow.
- Standard develop-web-game client captured the lobby and remote controls and reached an actual solo main phase via keyboard Keep; screenshots and text state were inspected.
- Syntax and `git diff --check` passed. These are local checks using installed WebKit, not a claim of testing the user's exact Safari build or current production deployment.

Local preview: http://127.0.0.1:65453
