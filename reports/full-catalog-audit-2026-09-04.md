# Full catalog execution and semantic audit — 2026-09-04

Scope: all **18,484** runtime definitions on top of released commit `cd07566b766e03cec5997521e8ceeb8e1aa3d4b0`. No cards were added. The purpose was to find failures beyond import validation, repair confirmed defects, and leave reproducible evidence for subsequent development.

This report distinguishes execution from semantic correctness. A successful common-board cast does not prove every ability or every interaction. Compiler-derived expected results are supplemented with independent state invariants, real-card boundary tests, full AI games and browser interaction checks.

## Coverage

| Layer | Scope | What it establishes |
| --- | --- | --- |
| Strict structural certification | 18,484 definitions; 27 decks; 2,347 card/deck checks | Required implementations/contracts exist and the catalog/decks are structurally valid. |
| Generic Oracle execution | 16,800 cards, each with controlled human choices and actual local AI | Supported operation/keyword routes execute; tracked gameplay scenarios are checked for independent state invariants and stable recalculation. |
| Native/manual execution | 1,684 cards × 2 controllers = 3,368 passing routes | Real paid cast/land actions and entry effects on a common board, with explicit prerequisites where required. Zero remaining prerequisite/choice gaps in this smoke. |
| Independent semantic regressions | Dedicated real-card tests for each repaired mechanism | Oracle outcomes, negative controls, exact payment, legal targets, zone identity and selected human/AI responses. |
| Full AI games | 81 deterministic games across all 27 decks, varied styles/difficulties/seeds | Actual action decisions, natural completion, state invariants and discarded search/simulation isolation checks. Final totals below. |
| Browser gameplay | 18 scenarios: five casting cases × human/local-AI and eight public/private top-card visibility cases | Visible paid casting, targeting, Stack/Proceed and final board state, with screenshots and browser-error capture. |

Native smoke includes real Suspend payment followed by four own upkeeps for Ancestral Vision, a declared combat for Take the Bait, incoming spells for counter/copy effects, and appropriate graveyard/permanent targets. It reports these prerequisites per card. Its fixed choice policy does not cover every modal choice or activated ability.

## Confirmed repairs

- **20 stale generated subtype selectors:** Desert, Cave, Locus, Town, Planet and Bobblehead descriptors incorrectly searched creatures rather than lands/artifacts. Exactly one reviewed `what` leaf changed per card, in 19 mirrored report/runtime pairs. Every card was recompiled with its original compiler version and the pinned source. Oracle/Scryfall IDs, raw/source fields, positions, batch membership, compiler versions and import state were preserved. See `oracle-semantic-repair-2026-09-04.json`.
- **Signed source power:** comparisons and effects setting base P/T preserve negative values, while ordinary +X/+X effects retain the required nonnegative treatment. Regressions include Dreadhorde Arcanist, Guardian Scalelord, Unruly Krasis, Obuun and Chameleon Colossus.
- **Conditional flash and stale cast offers:** Colossal Rattlewurm can use its actual Desert condition from hand; ordinary paid hand/command casts recheck timing and printed restrictions before payment. Cards without a printed cost remain unpayable normally but can use genuine free/alternative casting routes; Baral’s Expertise can still cast Ancestral Vision.
- **X offers:** a legal smaller X is not hidden by excess available mana. The check respects exact X values, count limits and compiled target thresholds without scanning every mana unit. Real Disorder in the Court, Repeal, Disembowel, By Force and Heat Ray regressions cover legal/illegal and performance boundaries.
- **Fixed P/T copies:** offspring and other native fixed-P/T token copies exclude the original characteristic-defining P/T ability. A 1/1 Maro offspring stays 1/1 as hand size changes and when copied again.
- **Trigger source identity:** event-time controller, zone version, metadata and attachment information survive a source leaving and returning before trigger placement. Resolving Auras and Aura spell copies enter already attached, so their ETB triggers capture the correct host. Linked exile effects retain the correct source incarnation.
- **Pongify / Rapid Hybridization:** a legal target surviving destruction through indestructible or a shield still produces its controller’s token; an illegal blinked target does not.
- **Hull Breach / It’s Clobberin’ Time!:** artifact lands are legal artifact targets.
- **Saw in Half:** death replacement, last-known P/T and fixed-copy characteristics are respected.
- **Sevinne’s Reclamation:** its graveyard bonus makes the optional spell copy on the Stack, with normal target and response behavior.
- **Colfenor’s Urn / Skyclave Apparition:** linked cards use exact exile identities and the correct owner/controller; blinked sources and moved/reexiled cards do not reuse stale links; required sacrifice must succeed.
- **Horde of Notions:** targets only its controller’s graveyard and casts the chosen Elemental directly through an immediate permission, without inserting a foreign-owned card into the wrong hand.
- **Disorder in the Court:** exile/return groups are simultaneous, return tapped under their owners, and ignore cards that left and reentered exile as new objects.
- **Complete target choices:** Curtains’ Call requires two distinct creatures before being offered; Mycosynth Gardens shows only targets whose activation cost is payable, without adding a payment restriction during resolution. Moxite Refinery’s last counter-kind choice enforces the required positive total payment.
- **AI costs:** fixed-count artifact taps select the required number; Bootleggers’ Stash requires an untapped land; mana and sacrifice costs are jointly feasible. Ravenous Squirrel does not sacrifice its only needed colored-mana source, and Olivia is not offered an activation whose Treasures cannot cover both costs.
- **AI decisions/search:** mandatory choices above 14 cards/targets retain enough candidates (real Disorder X=20 and large cleanup discard); base-P/T effects receive appropriate target evaluation; hypothetical search does not use the real hidden library order or unknown opponent hand allocation. Publicly revealed top cards and private owner-only look permissions are distinguished and retained; the public top is also available to human players in the UI. Hidden event-card names do not influence the optional-loop guard. Faithful generic action simulation remains unchanged. Repeating optional resource loops stop in the AI policy when they make no hand/opponent-damage progress; human legal choices remain available.

## Evidence and reproduction

Full artifacts are under `output/full-catalog-audit-2026-09-04/` (ignored local test output):

- `full-tests-final.log`: complete final test suite; the first failing run is retained in `full-tests-initial.log`.
- `oracle-invariants-final.json`: per-card generic route results and checked scenario counts.
- `native-final.json`: all 3,368 native/manual action results, prerequisites and limitations.
- `browser/evidence.json`: eight casting UI scenarios, `browser/aura-evidence.json`: two Aura scenarios, `library-top-browser/evidence.json`: eight visibility scenarios; `browser/*-stack.png` and `browser/*-final.png` capture intermediate and settled outcomes.
- `browser/skill-client-complete/`: final standard game skill client state/screenshot, visually reviewed with no captured errors; local guest account fixture is explicit, not a production account test.
- `catalog-execution-matrix.json` and `.csv`: the complete card inventory joined to execution results, with scope limitations. Regenerate with `node output/full-catalog-audit-2026-09-04/combine-evidence.mjs`.
- `ai-final/aggregate.json`, three shard reports, `README.md` and `source-snapshot.sha256`: final complete games, exact seeds/commands, source manifest and per-game decisions, actions, search probes and invariants.
- `final-validation.json`, `audit-environment.json` and `full-suite-source.sha256`: final test totals, Node version, baseline identity, and an unchanged 564-file source/test manifest.

Repeat the broad execution gates:

```sh
ORACLE_PROOF_REPORT=output/oracle-execution.json \
NATIVE_EXECUTION_REPORT=output/native-execution.json npm test
npm run check
npm run audit
npm run certify:strict
```

Meaningful added test files: `engine-source-and-x-audit.test.mjs`, `engine-x-offer-boundaries.test.mjs`, `native-card-interactions-audit.test.mjs`, `oracle-semantic-boundaries.test.mjs`, `oracle-cast-turn-conditions.test.mjs`, `ai-adversarial-regressions.test.mjs`, `library-top-visibility.test.mjs`, and `catalog-native-execution.test.mjs`. Existing proof fixtures now use genuine Suspend/upkeep/free-cast lifecycles for cards without a printed mana cost; synthetic zero-cost spells use `{0}`, lands use land-play actions, and paid test spells obey actual turn/timing rules. Eyes of the Wisent and Hermit of the Natterknolls additionally have actual paid Opt scenarios with positive and negative caster/turn controls. Existing generic execution tests now use `tests/helpers/game-state-invariants.mjs`; full AI auditing is opt-in through `tests/helpers/run-ai-adversarial-games.mjs`.

## Limits and handoff

- No finite test run establishes that every possible pair/multiplayer combination of 18,484 cards is correct. This audit establishes the explicit executions and assertions recorded in its artifacts.
- Native common-board smoke is deliberately weaker than card-specific semantic coverage. A literal test-reference inventory initially found 770 native/manual names without an explicit named test (748 in the later named-reference inventory); that inventory is a routing aid, not proof of no dynamic coverage or a defect count.
- Search hypotheses randomize the unseen card pool while preserving known cards; these tests prove order/allocation invariance, not a universal statistical model of unknown deck composition.
- Full games exercise the 27 configured decks. They cannot place all 18,484 cards into natural game states, and the browser sample is targeted rather than exhaustive.
- Scenario invariants cover games registered through the proof harness; an additional commander-pair deck-construction fixture uses its own game and is covered by its existing assertions rather than the added invariant tracker.
- Structural certification and controlled tests remain useful gates, but must not be labelled complete rules certification.
- The audit was completed locally above the released baseline with no new imports. The user subsequently authorized commit, push and production deployment; release observations are recorded separately under `output/full-catalog-audit-2026-09-04/release/`.

## Final validation

**PASS: 4,757/4,757 repository tests, zero failures, cancellations, skipped tests or TODOs, in 423.18 seconds.** Node v22.22.3. The final 564-file source/test manifest matched after completion; SHA-256 `4938bb61e5cc7efc2bc91c144adbc5086f121801293274ae8b778cc7d33c8681`. Syntax checks, catalog audit, strict certification and `git diff --check` also pass.

The joined card execution matrix passes **18,484/18,484**, with exactly human and local-AI coverage for every row and no missing recorded scenarios. Generic Oracle proof passes 33,600/33,600 controller/card runs, 46,054/46,054 operation routes, 9,972/9,972 keyword proofs and 77,294 nested assertions. Independent state and recalculation assertions passed in 60,599 tracked generic scenario games. Native/manual execution passes 3,368/3,368 routes with zero prerequisite gaps, choice gaps or errors.

Additional existing deep gates passed real cast/land and priority scenarios for 4,600 generic cards in both controller modes (8,700 casts and 500 land actions), plus actual keyword behavior for 1,510 cards / 3,020 controller casts. These are subsets of the catalog and do not add to the 18,484-card total.

The final AI run passed **81/81** games across all 27 decks, all ten local AI styles and all three difficulties. Games ended naturally in 24–77 turns, with 46,862 scored decisions, 12,697 state-invariant checks and 1,683 distinct acted card definitions. All 324 faithful action probes applied and remained isolated; 81 forced beam searches examined 651 nodes up to depth 3. There were no rejected actions, AI fallbacks, pending triggers, state anomalies or simulation mutations. The 254-file source manifest remained unchanged; its SHA-256 is `99a0e92c82d6f2794c652cb91fd53b82228b7b3d8626f56c7129d0943847e391`.

All **18/18 browser scenarios** pass with no captured browser errors; final screenshots were visually inspected. The standard skill-client run also completed without captured errors. The two temporary local audit servers were stopped after browser verification.

The preceding nonpassing suite and per-card evidence are preserved as `full-tests-before-turn-fixture-repair.log` and `oracle-invariants-before-turn-fixture-repair.json`. Its only failing aggregate test identified two trigger fixtures that incorrectly changed the active player for an opponent's spell during the controller's turn. Those fixtures and their independent positive/negative real-card regressions are included in the final passing suite. No product-source changes followed the final AI run.
