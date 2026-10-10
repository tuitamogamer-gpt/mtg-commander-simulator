# Yuriko and exile highlights — 10 October 2026

Public reveal and exile results now receive a table highlight that stays visible until **Proceed**. Yuriko shows the revealed card, its mana value, library → hand and every opponent’s completed life change, including a land with mana value zero. Its effect is correctly labelled life loss. Exile results show their actual source and destination zones, including both halves of a blink. Hidden and face-down identities remain anonymous.

This request arrived at the end of the four-hour audit. Only `src/modules/resolution-recap.js` changed after its frozen verification. The existing responsive dialog, artwork, statistics and acknowledgement are reused; native rules, payment and priority remain unchanged.

- **42/42 focused native checks**: 32 existing recap checks and 10 new effect, trigger, headless and privacy cases.
- **6/6 actual mobile routes** checked at 390×844 and 320×568: Yuriko MV 1, Yuriko MV 0, Swords to Plowshares, Soul-Guide Lantern, Cloudshift and Gonti. No browser errors or decision fallbacks; Proceed remains reachable without page overflow.
- Syntax, source audit, room contract synchronization and pinned catalog export pass on the final source. Export counts and the pinned 9 October comparison remain unchanged; the source fingerprint is refreshed.

Earlier test-harness failures are retained in the [machine-readable evidence](2026-10-10-yuriko-exile-highlights.json): one copy fixture initially revealed the card before copying, and the first browser setup had not activated the game display. Corrected fixtures pass on unchanged presentation source. They add no product-defect credit.

The original [four-hour audit](2026-10-10-second-engine-audit.md) retains its 1831-check, 30-route and six-game proof on its own frozen source inventory. These separate presentation checks do not claim new whole matches or exhaustive engine correctness. The JSON records the exact one-file source delta, full final inventory, test/driver hashes, raw results and screenshot hashes.
