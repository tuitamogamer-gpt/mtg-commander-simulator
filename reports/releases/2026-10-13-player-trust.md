# Solo reports, visible waits, trigger origins, and device recovery

Base: `b5f1591ee7a9ab0944d2a7092450f71f91bb07f6`. This is the first player-facing reliability package from the growth roadmap. It does not establish capacity for a million concurrent players.

## Result

- **Report a problem** freezes a Solo checkpoint and completed choices when opened, accepts a description, and downloads a portable report. The player can omit private replay data. Live reports remain public-only. Diagnostic import restores the checkpoint and decision tail with cloud saves, local recovery, and profile-result writes disabled. Reports identify the loaded build; a different revision is reported before replay. Public snapshots retain their setup-from-turn-one behavior. Downloads respect the native iOS 8 MiB export ceiling.
- Wait status identifies the actual pending player, human choice, or public resolving effect. Controller observations use exact tokens and remain outside saved state and AI simulation state. A presentation observer cannot replace a legal answer or an original controller error.
- Trigger ordering explains the combat-damage cause, target, count for that event, and the permanent adding another trigger. One Ninja hit with two matching Roaming Thrones has three triggers. Two separate Ninja hits with one matching Throne have four. Metadata preserves public event-time identities and redacts private or face-down cards.
- Solo saves keep a device recovery checkpoint before cloud debounce and on page exit. Home offers explicit **Continue on this device** for the settled owner. Cloud confirmation removes only its exact local revision; newer pending work survives an older response. Failed cloud saves stay visibly pending and retry on reconnection. False acknowledgments cannot show Saved or close Save & exit. Guests, different profiles, and stale Continue callbacks retain their ownership boundaries.
- Native save/restore now preserves Innocuous Researcher's casting restriction until the affected player's next turn, including its existing expiry behavior.

## Validation

Final focused regressions pass **275/275**, with zero failures, skips, or cancellations. The cohort includes report export/import, exact wait ownership, trigger origins, device recovery, casting restrictions, existing UI/ninjutsu regressions, and real Redis concurrency. Additional controller/card-routing and AI checks pass **107/107**; Live server/reconnect tests pass **33/33**. These overlapping cohorts are not summed.

The native browser device checks pass all four flows: guest refresh, an offline signed-in save with an older cloud checkpoint, diagnostic persistence isolation, and A/B/guest owner separation. A separate signed-in report test exports and imports the same board and pending choice, then completes 69 UI actions through turn 16 without changing the original cloud save, profile, or device recovery. Desktop native play and rematch also pass. Paid mobile trigger and wait-owner flows pass without browser errors; responsive choice/retry checks cover 320px, 390px, and desktop.

Two independent native race reproductions confirm the final fixes: paid Cruel Entertainment reports the actual controller of the turn, and a device revision changed during lazy module loading rejects the stale Continue while preserving and accepting the newer checkpoint. Syntax and whitespace checks pass. Strict certification passes 32,136 raw definitions, 6,474 active unique cards and 14,566 card/deck checks; production dependency audit finds zero vulnerabilities. iOS bundle generation and its build/export checks pass **9/9**.

Local evidence is under `/workspace/scratch/player-trust-round-2026-10-13/`. Publication receipts are added to the PR after deployment.

The browser cases use actual paid spells, native decisions, downloaded files, fresh-document replay, local HTTP accounts, and browser storage. Production verification uses guest play and rejected unauthenticated account requests; it does not create public test accounts. The focused account storage checks use Redis 7.2.16 on a private Unix socket with TCP and persistence disabled.

## Limits and release

Recovery stores a safe board checkpoint plus completed decisions, not an in-progress JavaScript continuation. Unfinished choices and timing-dependent failures may need additional reproduction. Replay across changed rules can stop at a mismatched decision. Local recovery depends on available browser storage and is removed with site data; it is not encrypted cloud storage.

The long all-deck game sweep and a million-player load test are outside this bounded release. Strict catalog certification is a separate coverage check, not a substitute for every possible live card interaction.

Publication uses the existing Git-to-Vercel integration. The merged main revision must be READY under the canonical alias, and its generated build identity must match that revision. Final deployment and browser receipts are attached to the PR after publication, avoiding another deployment solely to record deployment metadata.
