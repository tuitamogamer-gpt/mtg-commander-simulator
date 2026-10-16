# Stable table and Overencumbered — 16 October 2026

## Player-visible changes

- Battlefield and hand cards display their artwork without a second name label. Hover, keyboard/click inspection, accessible names, power/toughness, counters, and token badges remain available. A failed or placeholder image still displays its readable name.
- Opening the desktop Proceed review overlays the table without reserving 300 additional pixels on the right. The bottom action row retains its space, keeping the battlefield and hand in place in Table and Focus views.
- Overencumbered offers payment at the beginning of the enchanted player's combat. If payment is unaffordable, an explicit explanation and Continue control replace the silent decline. Declining or failing payment prevents the attacker picker from offering prohibited creatures. Paid mana, the artifact count at resolution, manual payment, and the restriction's combat lifetime remain enforced.
- Player-enchanting Auras retain their enchanted player's seat through JSON save/restore, including both native Aura target formats. Host validation happens before restoring the board; AI clones keep their own player references.

## Reproduction and limits

The original fresh Solo report did not involve reload or Continue. A native paid Overencumbered cast, its Clue/Food/Junk entry trigger, and four available mana sources correctly displayed payment before these changes. With four artifacts and only three available mana, the old code silently declined and still offered attackers which it later rejected. That fresh-game failure is reproduced separately from the save bug; the precise original game state was not available.

The independent save failure dropped the live Player reference from the Aura's metadata. A JSON-restored Aura consequently lost its host and combat trigger. New snapshots retain the seat. Older snapshots that already lost an active player-Aura attachment are rejected explicitly, before changing the current board; the host cannot be safely inferred. Unaffected older snapshots keep their existing fingerprint shape.

## Validation

Receipts are stored under `/workspace/scratch/overencumbered-2026-10-16/`; final counts and production evidence are appended to the PR.

- Native Overencumbered regressions exercise actual casts, payments, entry triggers, beginning-of-combat priority, artifact counting, attack eligibility, zero-cost choice, later combats, JSON restoration, invalid attachments, and isolated AI copies. Native Curse of Opulence and Curse of Disturbance regressions check rewards only for attacks on their restored enchanted player.
- Browser RED/GREEN evidence covers fresh unaffordable combat and restored Auras. Twelve desktop/mobile flows verify automatic/manual payment, decline, source consumption, and combat continuation against loaded source hashes.
- UI browser checks measure battlefield and hand bounds through real Proceed decisions, inspect cards using hover/keyboard/click, verify image-failure names, and retain status badges. Separate combat acceptance checks cover attack/block selection, targets, forced attacks, phone rotation, and resizing.
- Focused regressions and the additional save/Fallout/Thunder Junction/Modern Horizons cohort cover adjacent rules and recovery. Syntax, whitespace, catalog audit, strict certification, production dependency audit, iOS bundle generation, and its four packaging checks are included.

Publication uses the existing Git-to-Vercel integration. Preview status is checked before merge; the exact merged production revision, canonical alias, loaded source hashes, public health, and relevant browser behavior are checked after deployment. Full Solo gameplay and rematch are checked independently from the constructed rules fixtures. This is bounded regression coverage, not an all-deck game sweep or a capacity test.
