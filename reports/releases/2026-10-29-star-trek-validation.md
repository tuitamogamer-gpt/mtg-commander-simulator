# Star Trek precon validation — 29 October 2026

Post-release testing of all four new precons found expensive repeated work on large Scute Swarm boards and a token-label overlap. The fixes preserve card rules and AI decisions while reducing unnecessary board scans.

## Findings and changes

- Zone movement now snapshots only the actual Wan Shi Tong, Ketramose and Grolnok watchers. Simultaneous-departure snapshots remain authoritative. Cards without an attachment host no longer search every zone for a null ID.
- Shielding Plax and generic targeting restrictions collect their relevant sources once per synchronous target query. Empty candidate lists skip these scans. No cache survives a query.
- AI action ranking reuses an unrestricted mana estimate only within its synchronous ranking operation. Spell-specific estimates remain separate, temporary ritual mana has a separate key, and exceptions clear the scope.
- Fallback creature-token faces reserve space for subtype text above power/toughness. This fixes the Klingon Warrior label at compact desktop and mobile sizes.

The retained Scute Swarm benchmark creates the same **32 → 64 copies**, with **196 snapshots instead of 1,945** and **32 null-ID lookups instead of 1,977**. A 120-creature target query performs 120 source inspections per optimized filter; an empty query performs zero. These operation counts are deterministic. Wall-clock samples ran under different concurrent workloads and are not a controlled speed comparison.

## Validation

| Check | Result | Scope |
| --- | --- | --- |
| Final precon, import, cross-deck and targeting suites | 155/155 | All four decks; assimilation, Station, multiple opponents, copied and inactive protection sources |
| Zone watchers and attachment identities | 8/8 | Control changes, copied watchers, simultaneous exile, phasing and reattachment |
| Existing protection suites | 50/50 | Printed protection, C19/C20 protection, AFC/MIC integration |
| Snapshot and simultaneous-event regressions | 50/50 | Death snapshots, attachment lifecycle, state-based actions and simultaneous entry |
| Final AI and simulation-isolation suites | 68/68 | Existing decisions, priority outcomes, source/resource/graveyard isolation |
| AI memo, mana reserve and mana progress | 23/23 | Exact scores, deterministic choice, unchanged gameplay RNG, later decisions, exceptions and ritual previews |
| Initial broader regressions | 229/229 | Priority, sacrifice relevance, Station, counters, copying, saves and creature-type choices on the published base |
| Published precon browser scenarios | 8/8 | Four decks × desktop 1440px/mobile 390px on `www.mtgpod.xyz`, build `a8a5cf4` |
| Final token-overlay browser scenarios | 4/4 | 1440, 1920, 1280 and 390px; token label and P/T geometry, screenshots reviewed |
| Final-build four-deck integration | 4/4 | Complete seeded games with all combined fixes; repeat seeds are counted once below |
| Twelve-seed stress set | 11 completed; 1 performance failure | Seed 102911 stopped after one turn exceeded the ten-minute budget |

The browser precon checks use the real selector, Pod and review flow, verify each 100-card opening, then pay for and resolve the commander through the real UI and stack. They recorded no console/page/network errors, fallback decisions or horizontal overflow. The overlay test first reproduced the label overlap and then passed after the CSS change.

The selected Node suites cover **583 unique tests** across the initial and targeted post-fix runs; duplicate runs are counted once. The entire repository test suite was not run. JavaScript syntax and whitespace checks pass. Existing explicit rejection of unsupported complex checkpoints remains unchanged; these tests do not claim universal save/restore support for all effects.

Full-game outcomes, tested source variants and hashes are recorded in [postrelease-games.json](../decks/precon-trc-2026-10-29/postrelease-games.json). Interrupted performance reproductions are recorded separately and are never counted as completed games. Each completed game requires a real winner before the turn limit, zero AI fallbacks, valid card/zone state, and stable recalculation after every turn.

## Remaining performance issue

Seed **102911** (Federation Fleet with Landing Party in the pod) still produces multi-minute turns as Scute Swarm multiplies. The final combined build reached **250 Scute Swarm copies, 297 battlefield objects and 234 stack objects** during turn 33. A later sample showed the stack reduced to 86 objects; the existing 250-token-per-player limit prevented further token growth. No unbounded new-card trigger cycle was identified. Nevertheless, this is not acceptable evidence of responsive play, and completion is tracked separately from this timing failure. The optimizations above remove confirmed redundant work; they do **not** establish that large token boards are fully performant.

The run was stopped after turn 33 exceeded the ten-minute budget (**645,812 ms** at termination). Its final sample had drained the trigger stack and reached combat damage, but the game had not completed. This is an **unresolved performance failure**, not a passing game or a rules-error claim.

## Reproduction

```sh
node scripts/benchmark-token-zone-moves.mjs
node scripts/stress-star-trek-games.mjs 0
node scripts/stress-star-trek-games.mjs 1
node scripts/stress-star-trek-games.mjs 2
NODE_OPTIONS=--max-old-space-size=4096 node --test --test-concurrency=2 \
  tests/star-trek-*.test.mjs tests/zone-watcher-snapshots.test.mjs \
  tests/target-source-scans.test.mjs tests/ai-scoring-mana-memo.test.mjs
```

Detailed local logs, timing samples and screenshots are under `output/precon-trc-postrelease-2026-10-29/`.
