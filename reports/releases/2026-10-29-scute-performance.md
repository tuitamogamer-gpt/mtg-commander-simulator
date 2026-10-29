# Scute Swarm performance follow-up — 29 October 2026

This follow-up reduces repeated rules queries and AI evaluation on large Scute Swarm boards. It addresses the performance failure recorded on base commit `48e4c56`: Federation Fleet seed **102911** was stopped during turn 33 after **645,812 ms**, without completing the game. The earlier run had reached 250 Scute Swarm copies, 297 battlefield objects and 234 stack objects. Its stack eventually drained, so the observed failure was excessive processing time rather than an identified unbounded trigger cycle.

The isolated final run now completes seed **102911**, with a real winner after 35 turns and the same end-of-turn battlefield counts as the completed intermediate reference. The baseline remains documented in [the prior validation report](2026-10-29-star-trek-validation.md). Extreme headless turns still take roughly **3.9 minutes**; completion and browser responsiveness are measured separately below.

## Confirmed causes and changes

### Land-type dependency scheduling

The type-layer scheduler previously collected every independent pending row, then applied only the first one. On an ordinary board without land-type dependencies, that repeated unnecessary definition and static-effect reads after each row.

The scheduler now stops at the first independent row. It retains timestamp order, the cycle fallback, exact object identity checks, and dependency reevaluation after every yielded effect. The predicate audit found no game-state mutations in the affected dependency predicates.

The retained 250-row test performs **250 dependency inspections instead of 31,375**. This is a count of dependency inspections, not a claim that every part of the scheduler is linear.

### Printed source lookups

Several frequently queried helpers scanned every permanent for printed abilities that were usually absent. Nested calls during spell enumeration and blocking forecasts multiplied those scans and the associated definition getters.

These queries now use the existing `bfWithDef` source index:

- Outside-battlefield creature types: Maskwood Nexus, Arcane Adaptation and chosen-type effects such as Conspiracy.
- Outside-battlefield colors: Mycosynth Lattice and Celestial Dawn.
- Swirl the Mists detection when constructing a spell definition.
- WHO/LCC/MKC, PIP/OTC/M3C and CMM/WOC/WHO shared source helpers.
- Become the Pilot's attached-source lookup during blocking checks.
- Land mana replacements from Virtue of Strength, Pulse of Llanowar, Contamination and Reality Twist. Nonland mana queries skip this source lookup while retaining their existing replacement hooks.
- Activated-ability cost sources: first-artifact-activation discounts, v18 cost adjustments, native `abilityCostReduction` callbacks and v20 minimum-cost effects. Existing callback order, cost conditions and receiver identity remain unchanged.

Only printed-key membership is reused. Controller, ability loss, phasing, chosen metadata, attachment and timestamp checks remain live. The existing index invalidates for zone moves, recalculation, definition writes, and changes to the battlefield array or length. It also follows the same simultaneous-entry replacement snapshot as `bf()`.

On a stable 250-permanent board, 20 POM source queries and 20 Pilot blocking checks inspect each relevant key **250 times instead of 5,000**. Additional tests bound repeated outside-characteristic and WHO source reads while checking their actual returned characteristics and source order.

The mana replacement regression uses 252 permanents and 20 repeated land queries: each of the two relevant source flags is read **252 times**. Nonland queries read neither flag. Separate cases verify exact replacement paths, excluded payment sources, native produced mana, copies, controller changes, phasing and ability loss.

### Forced AI passes

When the native AI receives no castable spell and no nonmana activation, passing is its only generated action. That case now returns the pass without running the full board evaluation and action ranking.

The pass retains its decision-history entry and the bounded history's eviction behavior. Existing session-used bypasses retain their previous logging behavior. Tests compare the next real decision's seed and action, and verify style metadata. Castable instants, paid activations, sacrifice abilities and zero-cost nonmana abilities still reach normal AI evaluation. Human and custom controllers continue to receive their normal priority questions.

### Station planning reuse

AI action generation and initial ranking previously calculated the same Station plan twice. They now reuse a plan only within that synchronous portion of one decision, before search or an action can change the board. The scope ends before any search await, restores its previous value for nested decisions, and clears on exceptions.

Plans remain separate by game, player, source and every player's floating-mana pool. Explicit payment pools and text-change contexts bypass reuse. Tests compare the full decision, scores and history against uncached calculations, exercise temporary mana and later board changes, and verify cleanup around nested calls, exceptions and search. The focused case performs **4 pilot readiness checks instead of 8**, with the same selected action and decision history.

Every priority window, trigger, rule-event flush, state-trigger observation and state-based action check remains in place. No token limit, trigger limit, game rule or AI search budget changes in this patch.

## Profiling evidence

The profile summaries exclude each capture's first interval, which records profiler startup/response latency rather than observed CPU work. Earlier summaries incorrectly attributed that interval to the first sampled function. The excluded intervals were 1,322 ms for the baseline, 7,626 ms for `candidate-live`, and 8,639 ms for `final-live`.

| Corrected capture | Observed CPU interval | Type scheduler, inclusive | Core recalculation, inclusive | WHO source helper, inclusive |
| --- | ---: | ---: | ---: | ---: |
| Baseline `48e4c56` | 18,758 ms | 10.18% | 31.70% | 0.65% |
| `candidate-live` | 20,013 ms | 0.23% | 11.34% | 7.98% |
| `final-live` diagnostic | 15,164 ms | 0.32% | 31.55% | 0.88% |

The baseline covered turn 30 while the battlefield grew from 150 to 190 permanents. The intermediate candidate exposed repeated source scans beneath spell enumeration and blocking forecasts; its WHO source predicate alone accounted for 7.13% inclusive CPU. The later `final-live` diagnostic covered an entry-trigger wave: `handleETB` accounted for 27.08%, priority handling for 42.93%, and spell enumeration for 20.60%, inclusive. These nested percentages overlap and must not be added together.

A subsequent 15,005 ms sample after the token cap was reached attributed 53.75% inclusive CPU to activation enumeration, including 34.20% through the v20 ability-cost wrapper and 24.21% through its core cost calculation. This identified the repeated cost-source scans addressed in the final version. Its 1,737 ms startup interval was also excluded.

These are sampling weights from different execution windows, not invocation counts or a controlled overall speed comparison. The capture named `final-live` is a diagnostic artifact name, not final release verification. The final candidate must be judged by its complete run and browser measurements below.

Local profile artifacts, compiled-source mappings and logs are under `output/scute-performance-2026-10-29/`; the baseline timeout record is `output/precon-trc-postrelease-2026-10-29/final-performance-failure.json`.

## Intermediate complete-game diagnostic

An intermediate build containing the first **8 changed runtime files** completed Federation Fleet seed **102911** in **35 turns**, with **AI Dragon / Landing Party** winning. Total elapsed time was **902,483 ms**; turn 33 took **317,135 ms**, and turn 35 took **462,326 ms**. This establishes completion for that intermediate build while still showing multi-minute turns.

The artifact is `output/scute-performance-2026-10-29/final-full-games-batch-0.json`; despite its filename, it predates the later Station, mana and ability-cost/CMM source optimizations. It is diagnostic evidence for that source variant. The final **13-file** runtime was validated separately below.

## Confirmed test evidence

| Check | Passed | Coverage |
| --- | ---: | --- |
| Existing land/type/copy/ability-loss suites | 189/189 | Blood Moon, Urborg, Dryad, real type-setting/retaining effects, chosen types, copies and ability-loss timestamps |
| New scheduler regressions | 5/5 | 250-row operation count, dependencies, timestamp ties, cycles and checks after each yield |
| New forced-pass regressions | 14/14 | Exact pass behavior, history eviction, later seed/action, real responses, custom controllers and AI styles |
| Existing AI mana/progress and priority-outcome suites | 11/11 | Mana loops, legal choices, payment limits and isolated response simulation |
| Existing board-index and zone-characteristic suites | 29/29 | Live source membership, native paid casts, library/graveyard types, copy and suppression |
| WHO rules, advanced and precon suites; new zone-source regressions | 152/152 | 147 existing cases and 5 new source-index cases, including live characteristics and source ordering |
| PIP precon suite; new indexed-source regressions | 41/41 | 37 existing cases and 4 new cases covering control, copies, entry snapshots, Pilot and operation counts |
| Mana activation, grouped mana and new replacement-source regressions | 40/40 | 36 existing cases and 4 new cases covering replacement order, exclusions, native payment and live source membership |
| Station planning and scoring regressions | 50/50 | Equivalent decisions/history, scoped reuse, temporary mana, explicit pools, text contexts, nesting, exceptions, search boundaries and existing Station behavior |
| Ability-cost source and existing cost regressions | 231/231 | Printed source indexing, source zones, callback receivers, v18 boundaries and v20 costs |
| CMM/WOC/WHO advanced, precon and release suites | 60/60 | Existing shared-source behavior and native precon interactions |
| **Unique selected Node tests** | **822/822** | Duplicate runs counted once |

The new regression files are [land-type-row-order.test.mjs](../../tests/land-type-row-order.test.mjs), [ai-forced-priority-pass.test.mjs](../../tests/ai-forced-priority-pass.test.mjs), [zone-source-scans.test.mjs](../../tests/zone-source-scans.test.mjs), [precon-indexed-sources.test.mjs](../../tests/precon-indexed-sources.test.mjs), [mana-replacement-source-scans.test.mjs](../../tests/mana-replacement-source-scans.test.mjs), [ai-station-planning-memo.test.mjs](../../tests/ai-station-planning-memo.test.mjs), and [ability-cost-source-scans.test.mjs](../../tests/ability-cost-source-scans.test.mjs).

Existing suites: `oracle-land-setting-source`, `oracle-land-types-source`, `oracle-v28-common`, `oracle-v8-ability-loss`, `ai-mana-progress`, `ai-priority-simulation-outcomes`, `oracle-board-key-scans`, `zone-characteristic-audit`, `who-lcc-mkc-rules`, `who-lcc-mkc-advanced`, `who-lcc-sld-mkc-precons`, `pip-otc-m3c-precons`, `oracle-mana-activation-announcement`, and `oracle-mana-kicker-grouping` (all under `tests/`, with `.test.mjs` suffixes).

The Station group also includes `ai-scoring-mana-memo`, `ai-station-threat` and `ai-station`. The ability-cost group includes `four-hour-ability-reduction-zones`, `native-activation-cost-receiver`, `oracle-v18-boundaries` and `oracle-v20-costs`. The CMM group includes `cmm-woc-who-advanced`, `cmm-woc-who-precons` and `cmm-woc-who-release`.

This is selected regression coverage; the entire repository test suite was not run. `npm run check` and whitespace checks passed for the final changes.

## Final integration results

| Check | Status | Evidence |
| --- | --- | --- |
| Exact Federation Fleet seed 102911, final 13-file runtime | Passed | Landing Party wins on turn 35; all 35 turn invariants and stable-recalculation checks pass; no fallback/error detected |
| Other final seeded precon games | 4/4 passed | Borg 102930: 41 turns; Federation 102931: 22; Landing Party 102932: 35; Klingon Fury 102933: 28. Each has a real winner and passing state/fallback checks |
| Browser Scute Swarm scenarios | 4/4 passed | Desktop (1440 px) and mobile (390 px), automatic resolution and real paid instant responses; all 125 triggers resolve, 250 Scutes remain, no pending choices, page/render errors, fallback or overflow |
| Final runtime identity | Passed | All 13 changed runtime paths and SHA-256 hashes match the exact-seed run, four-deck batch, served browser sources and current source |

The final exact-seed run used no profiler and ran without another test engine. It completed in **578,159 ms**. Turn 30 took **42,592 ms**, turn 33 took **230,699 ms**, and the worst turn, 35, took **232,944 ms**. The original turn-33 reproduction was still unfinished at its **645,812 ms** termination. The interrupted baseline therefore supplies a lower-bound comparison for that turn, rather than a completed-game timing.

The final run matches the intermediate reference's winner, turn count, all 35 end-of-turn battlefield counts, 60 played-card names and 61 battlefield-card names. The four-deck batch ran as correctness coverage alongside initial browser work; its timings are not a controlled speed comparison.

### Browser measurements

The native fixture starts with 125 Scute Swarms and six lands. Playing the seventh land creates 125 triggers and reaches 250 Scutes (249 tokens) without changing the existing token cap. The response cases place an opponent's Opt above that wave, then use the visible response controls to cast a second Opt, pay its mana, scry and draw. Both spells reach the graveyard with one mana paid each; the drawn card is Forest. The default `end` priority profile remains selected. Harmless Scute triggers retain their normal automatic pass behavior.

| Browser scenario | Total time | Configured native waits | Maximum heartbeat gap | Animation frames |
| --- | ---: | ---: | ---: | ---: |
| Desktop, automatic CPU benchmark | 6,916 ms | 0 ms | 6,916 ms | 0 |
| Mobile viewport, automatic CPU benchmark | 5,977 ms | 0 ms | 5,977 ms | 0 |
| Desktop, normal pacing and paid response | 114,157 ms | 100,376 ms | 941 ms | 4,167 |
| Mobile viewport, normal pacing and paid response | 111,119 ms | 100,376 ms | 630 ms | 5,663 |

The automatic cases deliberately disable pacing and do not yield; their single long task is CPU benchmark behavior, not a measurement of normal UI responsiveness. The response cases use native pacing at the default 1.25 speed factor. Their largest observed long tasks are 902 ms on desktop and 542 ms in the mobile viewport, so these results establish continued UI progress without implying every frame is smooth. Both viewport sizes run Chromium on the execution host, not physical mobile hardware. Reduced motion is enabled in the harness; the native game pacing and priority flow remain active in response cases.

The mobile waiting and resolved screenshots were reviewed: response controls, grouped token counts and navigation fit within the viewport. The harness records page exceptions and render errors; it does not audit every console or network message. Its final receipt and screenshots are under `output/scute-performance-2026-10-29/browser-local/`.

The retained [machine-readable result](../decks/precon-trc-2026-10-29/scute-performance.json) records all 13 source hashes, the five complete games, browser timings and final-state assertions. The browser reproduction is [scute-swarm-performance.mjs](../../tests/browser/scute-swarm-performance.mjs).

## Reproduction

```sh
node --test tests/land-type-row-order.test.mjs
NODE_OPTIONS=--max-old-space-size=4096 node --test --test-concurrency=2 \
  tests/ai-forced-priority-pass.test.mjs \
  tests/zone-source-scans.test.mjs \
  tests/precon-indexed-sources.test.mjs \
  tests/mana-replacement-source-scans.test.mjs \
  tests/ai-station-planning-memo.test.mjs \
  tests/ability-cost-source-scans.test.mjs
PRECON_ONLY='Federation Fleet' SEED=102911 VARIANT=verify node scripts/stress-star-trek-games.mjs 0
node scripts/stress-star-trek-games.mjs 2
node tests/browser/scute-swarm-performance.mjs
```
