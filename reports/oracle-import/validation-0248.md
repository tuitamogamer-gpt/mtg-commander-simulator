# Oracle expansion 0239–0248 — 1,000 additional Commander cards

8 October 2026. Ten complete batches, **0239–0248**, add exactly **1,000 cards**. The installed runtime contains **28,799 definitions**, **28,798 eligible for deck import**, and **24,800 generic Oracle cards** across **248 batches**. All 175 built-in precon decks remain available.

The source is the Scryfall Oracle snapshot updated `2026-10-07T09:01:59.955+00:00`, SHA-256 `53c35f3df74a48df1a15859c29f2559fb3761f6680f0954b0a19fad9342f489b`. The source contains 38,708 rows. The August pinned source remains necessary to independently recompile eight historical semantic repairs.

The new compiler families contain 225 v57 cards, 175 v58 cards, 167 v59 cards, 150 v60 cards, 160 v61 cards, 83 v62 cards and 40 v63 cards. Their fixtures reject unrecognized appended instructions, including each physical face. Existing compiler versions through v56 are unchanged. Final imports use canonical compiler version 63; a parser match alone does not make an unimported card playable.

| Verification | Result |
| --- | --- |
| All 1,000 installed cards, human and local hard AI | PASS: 2,000 role-card scenarios |
| Every declared operation and keyword | PASS: 3,768 operation routes, 396 keyword executions, 86,163 nested checks |
| State invariants across the expansion | PASS: 6,893 controlled games |
| Final shared engine and boundary regressions | PASS: 247 distinct tests; repeated solver cases counted once |
| Eclipsed Realms restricted mana for native ability payments | PASS: four paid positive/negative cases; supplemental installed matrix covers six routes, 576 checks and 12 invariant-checked games |
| Whole-card paid positive/negative family proofs and complete-source rejection | PASS: seven reviewed fixture families |
| JavaScript syntax and strict certification | PASS: all 28,799 runtime definitions; 14,566 card/deck checks |
| Local browser import, Library persistence and natural gameplay | PASS: 16 checks |
| Cold source/report/module/state provenance | PASS: all 1,000 rows, ten generated modules and eight historical repairs, in five independent shards |
| Updated CSV catalog | PASS: reproducible export and `--check`; 28,799 runtime rows and 2,316 remaining source cards |

The browser naturally drew and cast **Lens of Clarity** for one mana on turn 2, then **Fishing Pole** and **Tidal Flats** for one mana each on turn 5. Human and local hard-AI spells resolved through real costs, choices and the Stack into a stable main phase. There were no browser console/page errors, AI fallbacks, injected gameplay cards or mana, or remote mutations.

Runtime work includes full spell faces, triggered and activated abilities, conditional entry counters, attachments, layered effects, mana production and replacement, command-zone rules, private library visibility, exile play permissions and planeswalker abilities. Focused shared fixes preserve captured source and target incarnations, bind Arena's second target to the opponent who chose it, reserve self-exiling mana sources against simultaneous sacrifice costs, and allow Ironworks to sacrifice itself. Grouped mana choices, kicker announcements, zero-output mana bonuses, empty-library scry and bounded counter-cost searches have durable regressions.

Gwen Stacy's proof explicitly announces each legal spell face: the front cast pays two mana and triggers its top-card exile, its transformation pays five mana, and a direct back cast pays five without the front entry trigger. This avoids assuming that an AI choosing a legal back face cast the front.

[All 1,000 execution records](evidence/0239-0248-execution.json), [supplemental Eclipsed Realms ability payments](evidence/0248-eclipsed-execution.json), [cold source verification](evidence/0239-0248-provenance.json), [focused regression results](evidence/0248-regressions.json), and [browser verification](evidence/0248-browser.json) are retained. Local browser screenshots and game observations are under `output/playwright/oracle-248/`. Source verification runs the official CLI without a classification cache in five disjoint 200-row shards, each also checking complete import state, registrations, generated module bytes and all historical repairs. The Eclipsed Realms supplement adds proof assertions only; the compiler and runtime remain identical to the complete 1,000-card execution run.

These are controlled scenarios, not an exhaustive proof of every multiplayer combination. The full repository suite and its long all-deck simulation were not run for this expansion. Production deployment and the canonical alias must be verified against the exact pushed commit separately from this local report.
