# Data and account behavior

This page describes the current implementation. It is a technical data inventory, not a promise of a support service or a replacement for the operator's privacy policy.

## Playing without an account

Guest Solo play does not require registration or an external AI service. The browser stores preferences (including the Command Table's Table/Focus view), guest imported decks, custom AI skills, saved pod presets, and a Solo recovery checkpoint on the current website origin. Clearing site data or using another browser/device can remove or hide these records.

A different domain is a different browser storage origin. Moving the website does not automatically move guest libraries or custom skills. Keep original decklist text and skill JSON files so you can import them again. An account library and a guest library are separate; signing in does not silently merge the guest library into the account.

Requests for unbundled artwork go to Scryfall. The web host, room service, account storage provider, and image provider receive the network requests needed for their respective features. Bot decisions run locally without sending prompts to a model API.

## Optional accounts

The account service stores:

| Data | Purpose and behavior |
| --- | --- |
| Email, display name, account ID, creation time | Login and profile identity. The service does not verify ownership of the email address. |
| Password salt and scrypt hash | Password authentication; passwords are not stored as plain text. |
| Hashed session token and expiry | Identify the signed-in account. The browser cookie is HttpOnly and SameSite=Lax, with Secure enabled for HTTPS requests. |
| Imported deck records and favorites | Restore the owner's library and preferences across signed-in sessions. An account can retain up to 40 imported decks. |
| One private Solo save | Resume that account's current Solo game. It contains private game information; the optional problem replay also includes that information. |
| Match IDs, totals, commander statistics, and recent results | Track completed matches without counting a retry twice. The recent-match list is bounded; cumulative totals and deduplication IDs are retained. |

The Redis session entry uses a 30-day expiry refreshed when the session is read; the browser cookie has a 30-day Max-Age. This is not a guarantee of an uninterrupted login. Successful logout invalidates the current session and clears its cookie. If storage is unavailable during logout, the browser cookie is still cleared and the service reports that server-side session invalidation failed. Account responses use no-store caching.

Account data, saved decks, statistics, and the active Solo save do not have an automatic account-wide expiry in this implementation. Deleting a saved deck removes that deck record; replacing or clearing a Solo save affects the active checkpoint. Neither action deletes the account.

A Solo save carries the imported lists used by that match. Continue keeps those lists even if My Library later contains another deck with the same name; starting a new game uses the current library list. Changes to manual mana and priority stops are recorded with the match, so Continue restores their timing alongside the saved actions.

## Device recovery

Solo keeps a private checkpoint in browser storage before the cloud-save delay and on page exit. On the home screen, **Continue on this device** explicitly restores that checkpoint. Guests and each signed-in profile have separate records; a profile's record is offered only after the current session identifies the same owner. These browser records are not encrypted account storage and remain subject to access by someone using the same browser profile.

A confirmed cloud save clears only its acknowledged device revision, preserving a newer pending checkpoint. Failed cloud saves retain the device copy when browser storage succeeds, and an online event retries a pending cloud save. **Save & Exit** requires a confirmed cloud save. For a signed-in game, only a confirmed match result discards its matching device recovery; a failed result submission stays pending and can be retried. Repeated completion requests share the same pending confirmation, and an already-recorded result is accepted without counting it again. Guest completion or explicitly exiting without saving discards its matching device recovery. A quota or storage error cannot provide a local backup, and deleting site data removes it.

Recovery uses the existing safe board checkpoint and completed decision history. It does not preserve a running JavaScript call or an unfinished choice; a rules change can prevent an older decision from replaying.

## Current account limits

There is no built-in email verification, password reset/change, or self-service account deletion. Do not assume an emailed recovery link is available. Use guest play if you do not want to create a stored account.

Operators need their own private contact channel, retention/deletion procedure, access controls, and backup/restore practice before promising account support to a wider audience. Do not ask users to post email addresses, passwords, session cookies, or account exports in public GitHub issues.

## Private Commander Live rooms

Room links identify private invite-only tables. The same invitation can be reused while seats remain open in the lobby, so share it only with intended players.

The host browser runs the rules engine and holds the complete game state. Guests receive their own private view through the room service; the host can see full decklists and private state by design. Commander Live is intended for trusted private groups and is not a server-enforced competitive anti-cheat service.

Redis room state expires 24 hours after the most recent state write. This expiry is separate from account retention. A Live room is not a durable Solo save: closing or refreshing the host's game tab can lose the running engine even if the room record still exists. Guest socket reconnection requires the original tab's session identity and an active host.

## Reporting a problem

**Game Menu → Report a problem** downloads a description, loaded build identity, and public diagnostics. Its optional Solo replay includes private saved cards, deck lists, and completed decisions; the checkbox identifies that content before download. Nothing is submitted automatically. Live reports do not attach a private replay. **Open problem replay** launches a diagnostic game with cloud saves, device recovery, and profile-result writes disabled.

**Download debug snapshot** remains available for public diagnostics with private card identities redacted. The public snapshot importer restores its deterministic setup from turn one.

Review descriptions, screenshots, and opted-in Solo replay attachments before submitting a public issue. Do not include private room invitations, passwords, cookies, Redis configuration, or environment files.
