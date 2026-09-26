# Oracle expansion 0209–0218

27 September 2026. **All 1,000 requested new cards are imported locally**, in ten complete batches using compiler v20. The application registers **25,792 card definitions**, **25,791 eligible for deck import**, including **21,800 generic Oracle cards** in 218 batches. The 175 built-in decks remain certified. These checks were completed before the commit/push/deploy request; publication reuses this evidence without additional test runs.

| Batch | New cards | First card | Last card |
| --- | ---: | --- | --- |
| 0209 | 100 | Abomination, Terrifying Titan | Brainwash |
| 0210 | 100 | Brass-Talon Chimera | Culling Scales |
| 0211 | 100 | Cunning Bandit // Azamuki, Treachery Incarnate | Fiendslayer Paladin |
| 0212 | 100 | Final Showdown | Heirloom Mirror // Inherited Fiend |
| 0213 | 100 | Helga, Skittish Seer | Leader's Talent |
| 0214 | 100 | Legion Leadership // Legion Stronghold | Nightshade Seer |
| 0215 | 100 | Nightsnare | Ramosian Rally |
| 0216 | 100 | Rampaging Soulrager | Slickshot Lockpicker |
| 0217 | 100 | Smoke Bomb | Throne of Makindi |
| 0218 | 100 | Thunder Magic | Woodland Weavemaster |

The pinned Scryfall snapshot is `2026-08-30T09:01:56.964+00:00`, bulk ID `27bf3214-1271-490b-bdfe-c0be6c23d02e`, compressed SHA-256 `a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528`. Its 38,627 source rows include 30,784 Commander-legal paper Oracle IDs. Selection uses the full source, excluding existing names, Oracle IDs and supported native face aliases. Budoka Gardener and Spiked Corridor are existing physical cards and are excluded from this expansion. Earlier successful compiler descriptors remain frozen; v20 is explicitly selected and the historical CLI default remains unchanged.

The new executable rules cover casting and activation costs, restricted mana and X, craft, multistage permanents, Rooms, Station, flip and transforming faces, disturb, named-card choices, modal and conditional effects, damage replacement and prevention, life-total rules, protection, target restrictions, and triggers from nonbattlefield zones. Printed rules must compile completely; unknown instructions continue to reject the card.

| Verification | Result |
| --- | --- |
| Installed batches 0209–0218 execution | PASS: all 1,000 cards, human and local AI |
| State invariants during installed execution | PASS: 4,901 game scenarios |
| Source/report/module/state provenance | PASS: 1,000 source rows in ten batches |
| New mechanics suite | PASS: 499 checks, plus focused payment, damage, discard and review boundaries |
| Engine regression | 967 initial passes; all six remaining mixed-mana assertions pass in the 103-check mana rerun |
| Damage/combat and protection/target follow-ups | PASS: 125 and 58 checks |
| Syntax, source audit and strict certification | PASS: 25,792 definitions and 175 decks |
| Local browser import and gameplay | PASS: 16 checks |
| Generated catalog | PASS: 5,057 missing legal paper Oracle IDs; 10 parser-eligible cards await a separate import |
| Full repository suite | Not run for this expansion |

The browser gate verifies a real guest 100-card deck import, persistence, deck review, paid human and hard-AI casting, Stack resolution, a settled game, and no browser errors or horizontal overflow. Its newly imported resolved human cards include Selfless Police Captain.

Review also verified simultaneous Worship/lifelink/prevention results, affected-player replacement order, announced Adventure colors with resolution-time rechecks, protection using the actual caster of an opponent-owned card, sacrifice-bound Altar of the Wretched values, and black-only generic X with reductions and restricted mana. Test witnesses preserve final damage amounts and source/target identities.

Machine-readable [execution evidence](evidence/0209-0218-execution.json) and [provenance evidence](evidence/0209-0218-provenance.json) are retained. Browser artifacts are in `output/playwright/oracle-0209-0218-local-api/`. Additional command logs are in `.local/oracle-v20/`, `.local/oracle-v20-costs/` and `.local/oracle-v20-spells/`. Full-source classification was computed through the unchanged semantic compiler in parallel workers; cache reuse checks the exact source and compiler hashes. The installed provenance gate independently recompiles the selected source cards.

Controlled scenarios, state invariants and certification are not an exhaustive proof of every possible card interaction. Historical queue statistics were not replayed by the final provenance verifier. Unrelated local UI and combat-report work was preserved.
