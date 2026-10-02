# Oracle expansion 0219 — partial completion

30 September 2026. **100 of the requested 1,000 new cards are imported locally**, in complete batch **0219** using compiler v21. **900 requested cards remain outstanding.** The runtime now registers **25,892 definitions**, **25,891 eligible for deck import**, and **21,900 generic Oracle cards** in 219 batches. The 175 built-in decks remain certified. This work includes no commit, push or production deployment.

| Batch | New cards | First card | Last card |
| --- | ---: | --- | --- |
| 0219 | 100 | Aclazotz, Deepest Betrayal // Temple of the Dead | Toxin Sliver |

The pinned Scryfall snapshot remains `2026-08-30T09:01:56.964+00:00`, bulk ID `27bf3214-1271-490b-bdfe-c0be6c23d02e`, compressed SHA-256 `a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528`. Its 38,627 source rows include 30,784 Commander-legal paper Oracle IDs. Selection uses the full verified source, excludes represented names, IDs and native face aliases, and explicitly selects v21. Earlier successful compiler descriptors and the historical CLI default remain unchanged.

The remaining source initially had only 10 parser-eligible cards. The new complete-rule extensions raised that pool to **123**, verified through a drift-free classification of all 5,057 previously missing Oracle IDs. This supports one complete 100-card batch. After importing it, **4,957 legal paper Oracle IDs remain absent**, including **23 parser-eligible cards** still awaiting a separate verified import. This is insufficient for the requested ten batches; the rest require additional rules implementations.

The new executable families include optional and modal permanent triggers, conditional forms and attachments, hand-size rules, conditional land permissions, event-stat comparisons, quoted Equipment grants, Saga chapters and Read ahead, Class progression, Gift branches, supported exile permissions and face returns, Waterbend, Compleated, Spree, casting discounts, fully compiled kicker targets, conditional modal spells and linked controller/owner effects. Acceptance requires the complete Oracle text; a supported keyword does not certify every card bearing it. The compiler continues to reject unknown instructions and unsupported cost/branch shapes.

Review found and fixed actual execution bugs before import: insufficient kicker target restrictions, Aura restrictions bound to the wrong controller, Saga modal selection and transform sequencing, Fish token color, stale exile permissions, and spell-damage events observed from the graveyard. Bloodfeather Phoenix now returns the exact graveyard incarnation and grants it haste. Its source checks use the announced Adventure face and the resolving copy's controller, including a copy whose physical original has already left the Stack.

| Verification | Result |
| --- | --- |
| Installed batch execution | PASS: 100 cards, human and local AI; 200 role-card scenarios |
| Operation and keyword coverage | PASS: 346 operation routes, 26 keyword routes; 1,690 nested proofs |
| Game state invariants | PASS: 620 scenarios |
| Source/report/module/state provenance | PASS: 100 exact source rows, one complete batch |
| Installed importer and v21 integration | PASS: 135 checks, including the 10 Phoenix Adventure/copy boundaries |
| Engine/payment/Stack regression | PASS: 332 checks; separate importer/provenance/damage/rules group 80 checks |
| Damage/history/copy follow-up | PASS: 81 checks after the final damage-source repair |
| Syntax, source audit and strict certification | PASS: 25,892 definitions and 175 decks |
| Local browser import and gameplay | PASS: 16 checks |
| Generated catalog and landing counts | PASS: regenerated inventory, classifier cache and landing counts match the installed runtime |
| Full repository suite | Not run for this expansion |

The browser gate exercised real guest 100-card deck paste, validation, persistence, review, paid casts, Stack resolution and a settled game. **Circle of the Moon Druid** from batch 0219 resolved after a real three-mana human payment. The hard AI paid and resolved three existing cards and made 25 decisions without fallback; browser opponents did not use the new cohort. New-card AI execution is covered by the headless installed-batch proof. Browser errors, remote mutations, pending Stack objects and pending triggers were all absent.

Machine-readable [execution evidence](evidence/0219-execution.json), [provenance evidence](evidence/0219-provenance.json) and [validation summary](evidence/0219-validation.json) are retained. Browser artifacts are in `output/playwright/oracle-0219-local-api/`; command logs and earlier diagnostic drafts are in `.local/oracle-v21/`. The final provenance gate independently recompiles every selected card. Classification-cache reuse checks exact source and compiler hashes. Historical queue statistics were not replayed by that verifier.

Controlled scenarios, state invariants and certification do not exhaust all card interactions. The comparison is against the pinned August snapshot. Existing unrelated engine, AI, UI, save and report changes were preserved. **This report does not claim completion of the requested 1,000-card import.**
