# Gameplay polish — 15 October 2026

## Changes

- The problem-report editor retains its connected textarea, selection, Unicode text, and replay checkbox while the arena redraws or a new native decision arrives. The captured checkpoint stays unchanged while that decision waits. Escape closes the report and returns focus to the menu. Detached controls cannot modify a newer draft or answer the underlying game decision.
- Signed-in match completion requires an explicit acknowledgment. Duplicate callers share the pending result; a confirmed duplicate counts as success without awarding another result. Failed or malformed responses keep the device checkpoint and allow retry. The loss exit waits for confirmation, and a late response cannot repaint or navigate away from a replacement table after rematch. Confirmed completion also prevents page exit from recreating the finished checkpoint while the remaining players continue.
- Device recovery reuses the already-validated checkpoint JSON instead of encoding the entire game again. Validation, UTF-8 limits, synchronous storage, ownership, and stored bytes remain unchanged.

## Validation

Validation receipts are recorded under `/workspace/scratch/improvement-round-2026-10-15/`. Focused regressions exercise native account callbacks, idempotent completion, logout/account changes, concurrent callers, malformed responses, failed writes, recovery ownership, and page exit. Real Redis checks use a private Unix socket with TCP and persistence disabled.

The native HTTP completion browser gate passes four flows: failed loss and retry, an idempotent duplicate, simultaneous completion/leave, and signout during a held response. Device recovery passes guest refresh, offline signed-in recovery, diagnostic persistence isolation, and account/guest ownership separation. Report export/import completes 69 UI actions through turn 16 without changing the original account or device state; a separate full Solo game and rematch also pass.

Browser coverage uses real Solo decisions and local HTTP accounts. Report controls are checked at 320, 390, and 1440 pixels, including the unchanged game fingerprint and pending decision, plus a paid Roaming Throne entry arriving underneath an active report. The arena-refresh gate focuses a visible target card when mobile targeting intentionally hides the hand; it now verifies the initial focus before checking its preservation. Account failure injection stays on the local test server; public verification does not create test accounts.

Syntax and whitespace checks pass. Strict certification passes 32,136 raw definitions, 6,474 active unique cards, and 14,566 card/deck checks. The production dependency audit reports zero vulnerabilities. iOS bundle generation and its four packaging/export checks pass. The final focused count and production receipts are recorded in the PR.

The local-save measurement uses a native four-seat opening board (38,120 UTF-8 bytes) and nine alternating batches of 100 writes. Median Node VM CPU time fell from 0.424 ms to 0.310 ms with identical stored bytes. Storage was an in-memory test boundary: this measures serialization work, not mobile storage latency or concurrent player capacity.

## Publication

Publication uses the existing Git-to-Vercel integration. Preview checks precede merge. The production deployment must be READY for the merged revision and canonical alias; fresh browser checks compare deployed source hashes and generated build identity. Final commit, deployment, and public verification receipts are appended to the PR after publication.

This bounded round does not include an all-deck game sweep or a million-player load test. Catalog certification checks definitions and deck inventory separately from live interaction coverage.
