# Oracle expansion 0249–0258 — 1,000 additional Commander cards

8 October 2026. All local release checks below are complete.

Ten complete batches, **0249–0258**, add exactly **1,000 physical cards**. The installed runtime contains **29,799 definitions**, **29,798 eligible for deck import**, and **25,800 generic Oracle cards** across **258 batches**. All **175 built-in precon decks** remain available. The pinned paper/Commander comparison universe has **1,316 unimported Oracle IDs**, down from 2,316 before this expansion.

The source is the Scryfall Oracle snapshot updated `2026-10-07T09:01:59.955+00:00`, SHA-256 `53c35f3df74a48df1a15859c29f2559fb3761f6680f0954b0a19fad9342f489b`. It contains 38,708 source rows and 31,070 distinct Oracle IDs in the paper/Commander comparison universe. The August pinned source remains necessary to independently recompile eight historical semantic repairs.

The selected cards come from six new compiler families:

| Family | Selected physical cards |
| --- | ---: |
| v64 — spells | 166 |
| v65 — creatures | 215 |
| v66 — enchantments | 156 |
| v67 — artifacts and lands | 124 |
| v68 — legendary creatures | 180 |
| v69 — planeswalkers and complete physical faces | 159 |
| **Total installed** | **1,000** |

The v69 fixture and source-closure check cover 160 cards; **Teachings of the Kirin // Kirin-Touched Orochi** is the one proven surplus card excluded from this exact 1,000-card import. Complete-source fixture checks reject unrecognized appended instructions, including each physical face. The historical leaf compiler modules through v63 are byte-identical. The shared importer adds typed predicates guarded for the new compiler families. Final imports use canonical compiler version 69; a parser-eligible source is not playable until it has been imported and verified.

| Verification | Result |
| --- | --- |
| All 1,000 installed cards, human and local hard AI | **PASS:** 2,000 role-card scenarios; zero failures |
| Every declared operation and keyword | **PASS:** 3,418 operation routes, 474 keyword executions and 112,569 nested checks |
| State invariants across the installed expansion | **PASS:** 7,127 controlled games |
| Retained focused regression checks | **PASS:** 4,032 distinct behavior checks across 49 completed green runs; 5,812 behavior-check executions include 1,780 repeats |
| v69 fresh installed-runtime paid positive/negative proofs | **PASS:** 640/640 checks, 15,890 assertions, zero failed/skipped/cancelled/todo; 159 installed cards plus one surplus fixture card |
| Complete-source acceptance and unknown-instruction rejection | **PASS:** six reviewed families; v69 checks every face of all 160 fixture cards |
| Strict certification | **PASS:** 29,799/29,799 runtime definitions, 6,474 unique deck cards and 14,566 card/deck checks across 175 decks; zero failures |
| Final JavaScript syntax and whitespace checks | **PASS:** frozen runtime syntax check and `git diff --check`, confirmed by the release owner |
| Cold source/report/module/state provenance | **PASS:** 1,000 complete source/compiler rows, ten generated modules and eight historical repairs in five independent 200-row shards; no classification cache |
| Local browser import, Library persistence and natural gameplay | **PASS:** 16/16 checks; real paid cohort permanent and hard-AI spell resolve; no browser errors, remote mutations or AI fallback |
| Final CSV catalog export and reproducibility check | **PASS:** final export and `--check` after all retained evidence; 29,799 runtime rows and 1,316 remaining source cards |

The installed execution evidence contains exactly 1,000 unique Oracle IDs and confirms both controller roles for every card. The final full-expansion run completed with no failures, cancellations, skipped tests or outstanding tests. It loaded all 258 batches and their 25,800 generic definitions before exercising the new cards.

The browser verified the real paste/check and Library flows, guest persistence after reload, opponent review, mulligan and gameplay. It naturally cast **Key to the Side-Door** from batch 0253 on turn 3, paid one mana and resolved it onto the battlefield. Human and local hard-AI spells were observed on the Stack and resolved into a stable main phase without remaining Stack objects or entry triggers. The retained successful retry has no browser console/page errors, remote mutations, AI fallbacks or horizontal overflow. Its screenshots and observations are under `output/playwright/oracle-258-retry/`.

The focused regression receipt distinguishes passing executions from distinct checks. Its 49 retained green logs report 5,813 passing executions; one file-inventory check is excluded from the behavior count. Failed or partial development runs are not evidence of a passing release gate. The v69 receipt is separate from the Node test-footer aggregation and includes validated payload, log and owned-file checksums.

The fresh v69 driver compares each installed definition against independently compiled canonical data: full raw physical source, Oracle and Scryfall IDs, semantic class, catalog, keywords, contracts and implementation AST. It preserves all 159 installed definitions and registers only the uninstalled surplus card. Its 640 checks cover paid positive and negative paths for the human and local hard-AI controllers, with native costs, choices, Stack resolution and state invariants.

Runtime coverage includes complete spell and permanent faces, Adventure additional costs, source-bound graveyard casting, layered restrictions, replacements, mana production, triggered and activated abilities, planeswalker loyalty and physical-incarnation checks. Shared boundary checks cover colored and restricted mana, hybrid Phyrexian payments, atomic payment revalidation, actual target identities, face-up privacy and bans, activation announcement order, staged effects and borrowed abilities.

Domri, Chaos Bringer's paid mana proof distinguishes mana actually spent on a creature from unused mana or a noncreature spell. It covers independent printed Riot, live counter prohibitions, blinked incarnations, an actually cast creature copy paying its own kicker, and an uncast copy that cannot inherit the original spell's payment receipt. Native ability-loss checks distinguish older and newer continuous-effect timestamps and suppress printed Riot under live ability loss. Torrent Sculptor's canonical entry path binds its counters to the actual exiled graveyard card rather than the entering source's mana value; Case of the Pilfered Proof exercises actual paid face-up and token-replacement actions.

The current catalog summary records **29,754 represented comparison-universe Oracle IDs** and **1,316 remaining IDs**, of which **2 are parser-eligible but unimported** and **1,314 remain deferred**. Its 17 legacy runtime names without a snapshot match and 26 entries outside the current comparison universe are unchanged. The final export and reproducibility check validate these counts against the pinned source and current runtime.

[All 1,000 installed execution records](evidence/0249-0258-execution.json), [focused regression results](evidence/0258-regressions.json), [the checksummed v69 paid proof receipt](evidence/0258-v69-paid.json), and [browser verification](evidence/0258-browser.json) are retained. [Cold canonical provenance](evidence/0249-0258-provenance.json) and [the independent complete-source and face audit](evidence/0258-source-audit.json) are retained. The source audit includes 112 multiface cards with all 224 printed faces; its executed inputs and captured completed output are checksummed alongside the receipt. The passing installed execution log is `installed-1000-execution-final2.log`; strict certification is `certification-0258-final2.log`. The complete fresh v69 paid log is `v69-current-installed-640.log`, SHA-256 `093bf07e09252d5b22c536cdee95203dd3c141da69f7ff79ab4ebc790b14c1c5`; its summary payload SHA-256 is `eb60abcd97b451846187a20849c8b597ba95a4357ffd8d844435c3f60354665f`.

These are controlled scenarios rather than an exhaustive proof of every multiplayer combination. The full repository suite and its long all-deck simulation were not run for this expansion. Production deployment and the canonical alias must be verified against the exact pushed commit separately from this local report.
