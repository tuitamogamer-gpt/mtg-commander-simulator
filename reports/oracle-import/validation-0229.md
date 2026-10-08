# Oracle expansion 0229 — another 1,000 cards

7 October 2026. **100 of the requested 1,000 new cards are imported locally**, in batch **0229**. **900 remain outstanding.** The catalog contains **26,899 definitions**, **26,898 eligible for deck import**, and **22,900 generic Oracle cards** in 229 batches. No commit, push or deployment has been performed for this expansion.

The new pinned Scryfall snapshot is `2026-10-07T09:01:59.955+00:00`, bulk ID `27bf3214-1271-490b-bdfe-c0be6c23d02e`, compressed SHA-256 `53c35f3df74a48df1a15859c29f2559fb3761f6680f0954b0a19fad9342f489b`. It contains 38,708 source rows and 31,070 legal paper Commander Oracle IDs. Selection considered an explicitly recorded 177-row reviewed cohort. A subsequent complete inventory classified all 4,216 absent source IDs and found **82 parser-eligible cards** still requiring an import and execution proof; 4,134 require further semantic support.

Compiler v31 adds closed clauses for token replacements, remembered tapped state, life lost this turn, Equipment attachment, independent targets, graveyard exile and temporary creature control. Earlier successful descriptors remain frozen. A delayed source-damage trigger now compares the source's identity and captured zone version, preserving its original controller and rejecting a returned incarnation. Historical semantic repairs still recompile against their original August source through the verifier's `--repair-source-file` argument.

| Verification | Result |
| --- | --- |
| Installed execution | PASS: 100 cards; 200 human/local-AI role-card scenarios |
| Operation and keyword routes | PASS: 316 operation routes, 82 keyword routes, 540 nested checks |
| State invariants | PASS: 433 controlled games |
| Source/report/module/state provenance | PASS: all 100 source rows; all 8 historical repairs also verified |
| Focused v31 rules and earlier-descriptor preservation | PASS: 12 tests |
| Delayed-trigger regression, including control changes and blink | PASS: 15 tests |
| Import/cache/provenance regressions | PASS: 13 tests, plus 14 updated provenance/repair tests |
| Syntax, source audit and strict certification | PASS: 26,899/26,899 definitions certified |
| Browser import and natural gameplay | PASS: 16 checks; Living Library resolved after actual 2-mana payment |
| Full repository suite | Not run |

The guest browser test imported, saved and revalidated a 100-card deck, then observed a new human card and local-AI spells resolving through the Stack. It recorded no console/page errors, fallback AI decisions or remote mutations. New-card AI execution is covered by the installed headless matrix; the browser AI used existing cards.

[Execution evidence](evidence/0229-execution.json), [provenance evidence](evidence/0229-provenance.json) and [browser evidence](evidence/0229-browser.json) are retained. Full browser artifacts are in `output/playwright/oracle-0229/`. Controlled scenarios do not exhaust all card combinations. This is a checkpoint within the new 1,000-card request, not completion of that request.
