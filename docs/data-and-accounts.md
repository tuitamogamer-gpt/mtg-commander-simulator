# Data and account behavior

This page describes the current implementation. It is a technical data inventory, not a promise of a support service or a replacement for the operator's privacy policy.

## Playing without an account

Guest Solo play does not require registration or an external AI service. The browser stores preferences (including the Command Table's Table/Focus view), guest imported decks, custom AI skills, and saved pod presets on the current website origin. Clearing site data or using another browser/device can remove or hide these records.

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
| One private Solo save | Resume that account's current Solo game. It contains private game information and must not be published as a debug report. |
| Match IDs, totals, commander statistics, and recent results | Track completed matches without counting a retry twice. The recent-match list is bounded; cumulative totals and deduplication IDs are retained. |

The Redis session entry uses a 30-day expiry refreshed when the session is read; the browser cookie has a 30-day Max-Age. This is not a guarantee of an uninterrupted login. Successful logout invalidates the current session and clears its cookie. If storage is unavailable during logout, the browser cookie is still cleared and the service reports that server-side session invalidation failed. Account responses use no-store caching.

Account data, saved decks, statistics, and the active Solo save do not have an automatic account-wide expiry in this implementation. Deleting a saved deck removes that deck record; replacing or clearing a Solo save affects the active checkpoint. Neither action deletes the account.

## Current account limits

There is no built-in email verification, password reset/change, or self-service account deletion. Do not assume an emailed recovery link is available. Use guest play if you do not want to create a stored account.

Operators need their own private contact channel, retention/deletion procedure, access controls, and backup/restore practice before promising account support to a wider audience. Do not ask users to post email addresses, passwords, session cookies, or account exports in public GitHub issues.

## Private Commander Live rooms

Room links identify private invite-only tables. The same invitation can be reused while seats remain open in the lobby, so share it only with intended players.

The host browser runs the rules engine and holds the complete game state. Guests receive their own private view through the room service; the host can see full decklists and private state by design. Commander Live is intended for trusted private groups and is not a server-enforced competitive anti-cheat service.

Redis room state expires 24 hours after the most recent state write. This expiry is separate from account retention. A Live room is not a durable Solo save: closing or refreshing the host's game tab can lose the running engine even if the room record still exists. Guest socket reconnection requires the original tab's session identity and an active host.

## Reporting a problem

Prefer **Game Menu → Download debug snapshot**, which exports the share-safe public debug format with private card identities redacted. The separate debug importer restores its deterministic setup from turn one; it does not restore an account's private save.

Review your description and screenshots before submitting a public issue. Do not include private room invitations, account save payloads, passwords, cookies, Redis configuration, or environment files.
