# Mobile combat, four-player Live and diplomacy — 26 September 2026

The release improves attack selection on small screens and makes the existing Solo diplomacy options easier to find and review. Live continues to use the shared Arena for the host and all three guests.

## Changes

- Defender buttons show life or planeswalker loyalty, assigned creatures and their combined power. The heading totals the attack draft. Selected creatures awaiting a defender have a distinct highlight, and unavailable defenders are disabled. Power is not a damage prediction.
- Diplomacy offers have board-dependent starters for combat truces, harmful-target protection, named-permanent protection, stack resolution and pressure on a runaway threat. Exact actor-named terms and the existing proposal validator explain whether Send is available without consuming an offer or predicting acceptance.
- Incoming offers, counteroffers and accepted agreements have short visual cues. Both operating-system and in-game Reduced motion disable these animations. The diplomacy guide also explains table removal, Last Stand and public vote bargains. Diplomacy remains a Solo option.
- Added a repeatable four-client browser scenario with independent browser storage and real WebSocket transport. Fixtures are placed only on the host; actions use the ordinary player controls and host-authoritative rules.

## Verification

The starting revision was `e24aa5a`. The previous production deployment was `dpl_Eww7bNAYPZjKtyNfxrNEKUx1DQht` (READY). Release changes were moved to a dedicated worktree after unrelated deck-import work began in the shared checkout. All unrelated changes and pre-existing untracked card tests were preserved and excluded from the release commit.

| Check | Result |
| --- | --- |
| Clean dependency install | Passed; 0 reported vulnerabilities |
| Syntax and whitespace | Passed |
| Catalog audit | 170 decks; no duplicate script registrations |
| Strict certification | 24,775/24,775 raw card definitions; 14,224/14,224 card/deck checks |
| Production dependency audit | 0 reported vulnerabilities |
| Diplomacy, vote and UI regressions | 73 passed |
| Combat overlay regressions | 2 passed |
| Live server regressions | 9 passed |
| Import browser flow | Passed through import, reload, pod setup, actual paid human/AI spells and stack resolution |
| Player-experience browser | 5 check groups passed |
| Mobile table browser | 8 check groups passed; no errors or failed requests |
| Battlefield combat browser | 12 check groups passed; 320×568 through desktop, split attacks, planeswalkers, goad and blocking; no errors or failed requests |
| Diplomacy browser | Passed at 1440, 390 and 320px; real Send/accepted agreement/Proceed, disabled duplicate offers, both reduced-motion settings |
| Two-client Live parity | 14 check groups passed, including Counterspell, manual payment, target cancellation, private Ponder choices, reconnect, Last Resort and drag targeting |
| Four-client Live parity | 17 check groups passed; 11,031 viewer-specific messages checked; no browser errors |
| Live imported-deck launch | 6 check groups passed; guest imports its own 100-card deck, plays a land and reconnects to the same seat/deck |

All four seats played a land, paid for a spell with manual mana, saw the same stack object, activated Mind Stone, cancelled targeting without changing floating mana/taps/turn/phase, ordered private Ponder cards on a phone, attacked and blocked. Each of the three guests reloaded during blocking and recovered its own pending decision and selected blocker. Main controls and Last Resort entry are available to every seat; the separate two-client suite verifies actual recovery edits, Counterspell and dragging. The local four-client run did not reveal an application parity defect; the later production transport finding is documented below.

The full `npm test` run in the shared checkout was interrupted and is **not a passing full-suite result**. While that command was running, unrelated work changed the active catalog from 170 to 175 decks and produced an inventory assertion failure against the earlier test version. Its mixed-source results do not certify this release. The sequential headless sweep had already been stopped in preparation for four supported shards, but the queued shards were cancelled before launch. No complete 170-deck headless sweep is claimed.

The dedicated worktree contains only this release's changes on the 170-deck base. Dependency installation, syntax checks, catalog audit, strict certification, the relevant unit regressions, mobile combat/table browsers, diplomacy browsers and Live parity browsers are repeated there. The table includes initial acceptance coverage; the isolated runs and their evidence below establish the release checks. Production verification is recorded separately after the pushed revision is deployed.

- Isolated catalog audit: 170 decks, no duplicate registrations or simplified cards.
- Isolated strict certification: 24,775/24,775 raw definitions and 14,224/14,224 card/deck checks passed.
- Isolated diplomacy, vote and UI regressions: 73 passed.
- Isolated combat, controls, responsive UI, multiplayer, Last Resort, planeswalker, priority-window and server regressions: 122 passed across 17 files; no failures, skips or cancellations.
- Isolated mobile combat: 12 check groups passed with no browser errors or failed requests.
- Isolated mobile table: 8 check groups across 124 layouts passed with no browser errors or failed requests.
- Isolated diplomacy browser: 1440, 390 and 320px scenarios passed, including actual agreements and both reduced-motion settings.
- Isolated four-client Live parity: 17 check groups and 9,319 viewer-specific messages passed; no browser errors. Every seat attacked and blocked, and each guest reconnected during a pending block.
- Isolated two-client Live parity: 14 check groups passed with no browser errors, including actual Counterspell payment, Last Resort recovery edits, drag targeting, private choices and blocker reconnection.

## Evidence and repeatability

### Production connection-lifetime follow-up

The initial release `7acac41` deployed successfully as `dpl_B3RWLj7LdZf8kK2y7iTjdcxHGcW9`. Production combat (12 groups), diplomacy (3 viewport groups) and imported guest-deck play/reconnect (6 groups) passed. The extra imported-deck check initially timed out on a deck selector without browser errors and passed unchanged on retry after other browser suites finished.

The longer production four-client run exposed a separate transport defect after seven groups: a host socket closed during an unconfirmed action and the client rejected its promise, stopping the engine. The room function has a 300-second lifetime; [Vercel documents that clients must recover from sockets closing at maximum Function duration](https://vercel.com/docs/functions/websockets). The first failed run did not capture a close code, so its precise close cause is not asserted.

The follow-up preserves an interrupted request across socket replacement and adds durable server receipts, stored atomically with the accepted action. Matching replays are acknowledged without repeating mutations or clearing an already-returned decision; changed payloads are rejected. Uncommitted decisions wait until the host resumes. Receipt IDs change on page reload, remain private, and are bounded to 128 per seat. Notification failures retry publication without reapplying the mutation. The host bridge also preserves manual-correction results and checks the running state before releasing a recovered decision to the engine.

Five focused server tests cover cross-instance replay, preserved decisions, an actual lost acknowledgement, deferred actions through pause/resume, receipt limits, legacy clients and cross-worker notification retry. Six client/bridge recovery tests and nine mixed-room tests also pass (20 combined with those server tests). Another 44 existing server, multiplayer, parity and imported-deck regressions pass after the recovery change. The focused `npm run test:server` command now includes the new recovery tests and passes all 20 checks. Syntax and whitespace checks pass.

The final local four-client run passes all 17 groups and 11,895 viewer-specific message checks with no browser errors. Every seat attacks and blocks, all three guests reconnect, and the visible Resume control is used three times. Evidence is in `output/combat-live-2026-09-26/recovery-live-four/result.json`. The follow-up production gate requires at least 330 seconds, a natural host socket closure, a resumed running table and actual combat afterward; results and deployment identity are recorded in the dated local production evidence.

The `a3a0324` production run captured a real host closure with code 1006 after 314,997ms, followed by reconnection and a Resume. It then exposed temporary Redis room-lock contention, which still rejected an in-flight host action. That incomplete run remains in `production-recovery-live-four/`; its four passed groups are not a completed four-player result. The separate two-client production parity check passed all 14 groups on this revision.

The final contention fix extends lock acquisition past the five-second lease, reports temporary refusal separately from invalid gameplay, and retries the same action or join with bounded one-to-two-second backoff. Busy retries preserve queue order and do not send gameplay before joining. Exhausted retries stop and reject queued work rather than sending dependent actions after a rejected request. Seven server replay tests and eleven client recovery tests cover these paths. The updated `npm run test:server` passes all 27 checks, and syntax/whitespace checks pass. Final production evidence uses distinct files so previous failures remain reviewable.

Browser scripts: `tests/browser/battlefield-combat.mjs`, `tests/browser/diplomacy-options.mjs`, `tests/browser/commander-live-four-player.mjs`, and the existing `tests/browser/commander-live-parity.mjs`. Set `PLAYWRIGHT_MODULE` to the local Playwright entry where needed. The four-client script accepts `--url`, `--output` and `--min-live-seconds 330`; the last option requires a natural host socket replacement followed by recovery and actual combat. The diplomacy script accepts `GAME_URL` and `DIPLOMACY_QA_OUTPUT`.

Definitive isolated evidence is retained under the worktree's ignored `output/combat-live-2026-09-26/`: `regression.log`, `regression-files.json`, `audit.log`, `certify.log`, `mobile-combat/`, `mobile-table/`, `diplomacy/`, `live-four/`, and `live-two/`. Initial acceptance evidence also remains in the original checkout's `output/combat-live-2026-09-26/`, `output/web-game/mobile-combat-final/`, `output/web-game/diplomacy-options/`, and `output/playwright/commander-live-four-player-*/` directories. The dated production verification record includes the released source revision, source SHA-256 comparisons and HTTP/Live/account health. Browser evidence contains no invitation or reconnect credentials.

These are automated browser clients using controlled boards, not a claim of four physical devices or an exhaustive human match. Desktop Chrome's mobile viewport/touch checks do not establish native iOS Safari coverage. The host remains online during all guest reconnection tests; host migration remains unsupported.
