# Commander Live: human control parity

Implemented on 2026-09-08. The user subsequently authorized committing, pushing and deploying only this multiplayer change. The ten pending precons from the other session are excluded, including their edits in shared modules.

All Live humans now use the existing Arena and `MTG.UI`. The host uses the same viewer-specific presentation and decision controller as guests. The host's separate `Game` still executes rules and validates choices.

## Behavior

- Land and artifact cards no longer acquire artificial 0/0 creature statistics. Actual creature characteristics, damage, counters, HP, mana and commander information reach each viewer.
- Casting, activation, manual mana, targets, drag controls, HOLD, Stack responses, combat and review dialogs use the same controls for all humans.
- Cancelling a cast preserves its card and unspent resources; a human can immediately try again.
- Scry, library ordering and authorized follow-up choices display their actual cards only to the deciding player. Other hands and library order remain private.
- Ordinary synchronization preserves focused controls and selected objects. Reload restores the same pending decision and compatible partial selections; reconnect still requires host resume.
- Last Resort uses the shared tools and authoritative correction path. Changes are acknowledged before further corrections are enabled.
- Preview requests are serialized. Automatic priority traffic stays below the existing server rate limit. Snapshot records avoid duplication; four complete views of a 200-permanent table fit the existing payload limit.

## Implementation contract

`src/modules/multiplayer-presentation.js` defines `commander-arena/v1`, stable viewer entities, explicit supported decisions and authoritative preview data. It strips executable card behavior and private engine references. A pending question can supplement authorized inspection, but cannot roll public card data back to an older state.

`src/modules/multiplayer-arena.js` drives the shared UI. Human responses differ only in local versus WebSocket transport. The view cannot execute the game engine. Stack tokens and card zone versions reject obsolete references; stale decisions are refreshed for review.

`src/modules/multiplayer.js` is the canonical pure room kernel. Regenerate the standalone platform adapter with `node scripts/sync-online-room.mjs`; `--check` verifies parity. The legacy metadata and game-over return formats remain compatible with their platform contract.

Protocol 4 requires every browser to reload and start a new room when published. Restoring the complete host engine after closing its browser remains outside this change; the host tab must remain open. Live diplomacy retains its existing disabled setting for all players.

## Verification

| Verification | Result |
| --- | --- |
| Related engine, UI, protocol, server, priority, recovery and save regressions | 114/114 passed |
| Final presentation/protocol tests after the private-option enhancement | 31/31 passed; overlaps the preceding suite |
| Complete Chromium gameplay | 14/14 groups, no console/page errors |
| Complete Safari/WebKit gameplay | 14/14 groups, no console/page errors |
| Four humans; three humans plus one bot; two humans plus two bots | All actual land/cast/Stack/reconnect flows passed |
| Standard unmodified develop-web-game client | Real Solo main phase reached; screenshot inspected |
| Syntax, generated room kernel and whitespace checks | Passed |

The gameplay driver uses isolated browser contexts and stages controlled cards only on the authoritative game. Choices use the actual Arena controls: paid Sol Ring for host and guest, rapid manual source edits, abort/recast, Swords to Plowshares, mobile Ponder ordering and Keep/Shuffle, Counterspell, attackers/blockers and marked damage, reload with a selected blocker, Last Resort, HOLD/direct drag targeting and Mind Stone's mana activation.

The earlier full repository run finished with 7,593 of 7,596 tests passing. Its three failures were legacy adapter return-format regressions, subsequently corrected and verified. The full repository suite was not repeated after later UI and serialization changes; the table above records the subsequent relevant checks.

Raw logs, result JSON and inspected screenshots are under `output/multiplayer-parity/`. The repeatable browser driver is `tests/browser/commander-live-parity.mjs`; it accepts `GAME_URL`, `BROWSER`, `PLAYWRIGHT_MODULE` and `GAME_QA_OUTPUT`.

## Multiplayer-only release verification

The release candidate is reconstructed from commit `3617270` in an isolated checkout. Its 21-file allowlist includes the multiplayer implementation, its tests and this report; shared modules contain only the selected multiplayer hunks. Deck definitions, guides, artwork, loading, catalog data and the 42-deck selection remain at the existing baseline. None of the ten pending precons or their supporting changes is included.

- `npm run check`, `npm run audit`, `npm run certify:strict`, generated-kernel parity and whitespace checks passed. Certification retains 19,690/19,690 raw definitions and 3,468/3,468 card/deck checks.
- The complete `npm test` release run finished with 7,601/7,602 passing in 1,084 seconds. Its only failure was the old static Judge-menu assertion. That assertion was replaced by a behavioral check covering Solo, Live and unsafe decision points; the entire affected file then passed 5/5. No application code changed during release verification, and the full command was not repeated after this test-only correction.
- Chromium and Safari/WebKit each passed all 14 gameplay groups with zero captured console/page errors. A test-only combat sampling race was corrected: the driver now reviews combat without ending the turn and clearing damage before inspecting it. The final Chromium run verifies damage in the same turn.
- The isolated release passed the four-human (9 checks), three-human/one-bot (8) and two-human/two-bot (7) browser scenarios, including actual guest land/cast/Stack/reconnect flows. Desktop, mobile and restored-blocker screenshots were inspected.
- Vercel's dry run confirmed that every uploadable regular file is tracked in the release checkout. Local dependencies and test evidence are excluded.

Release logs, exact scope manifest, upload inventory, production verification and Git/Vercel results are retained under `output/release-multiplayer-parity-2026-09-08/` in the main workspace.
