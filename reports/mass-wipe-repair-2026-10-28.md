# Mass-wipe crash repair — 2026-10-28

Two independent failures were reproduced and repaired.

## Restored damage history

A real damage event stores physical source IDs in `card.meta._damageFrom.ids`, a Set. Generic JSON metadata capture converted it to `{}`. After restoring the same-turn checkpoint, Blasphemous Act and Chain Reaction threw `TypeError: target.meta._damageFrom.ids.add is not a function`. Hawkeye's death observer could similarly fail when calling `.has()`.

New checkpoints explicitly encode source IDs as arrays and restore fresh Sets. Existing checkpoints recover only IDs corroborated by the saved shared damage history for the same turn and exact target incarnation. Missing history produces an empty Set; unavailable historical information is not invented. The save format remains compatible.

Nine regressions exercise paid Hawkeye casting and damage activation, JSON checkpoint restoration, paid Blasphemous Act/Chain Reaction/Wrath of God, correct death-trigger draws, and missing/stale/incarnation-mismatched legacy history. A browser regression casts Shock, restores the checkpoint, casts Blasphemous Act, acknowledges the result, and verifies continuation at desktop and mobile widths. The baseline displays the fatal recovery screen; the repaired build completes.

## Live decision payloads

Death-trigger ordering serialized each trigger's full internal rules event, including repeated simultaneous-death snapshots. Optional death-trigger questions also serialized the whole death batch. Ordinary boards exceeded the server's existing 500,000-character decision limit, and larger ones exceeded the WebSocket message limit.

| Required decision | Before | After |
| --- | ---: | ---: |
| Order 9 death triggers | 775,761 | 4,691 |
| Order 17 death triggers | 2,676,561 | 7,627 |
| Solemn Simulacrum draw after 65 deaths | 666,309 | 1,637 |

The viewing client now receives public labels, source references and trigger provenance, plus the card references needed for decision presentation. Original host rules events and trigger objects remain authoritative. Ordering indices, all choices, and transport limits are preserved.

Six regressions cover paid damage/destroy wipes, creature and token deaths, server acceptance, remote reverse ordering, exact original-trigger hydration, provenance and subsequent optional draw. Browser checks use the Live Arena and server action validation, actual reorder/confirm/target controls, and continued resolution at desktop and mobile widths.

## Scope and reproduction

Only save-state encoding/restoration and Live decision presentation changed. Broader diagnostic probes also exercised all 176 built-in decks, a full 60-turn game with three wipes, and copies of recent saved positions. Those probes helped isolate the failures; they do not establish support for every possible card combination.

No production saved game, account or legacy Upstash data was modified. Private checkpoints used for diagnosis are excluded from the repository. The unrelated mana-search performance investigation is excluded from this patch.
