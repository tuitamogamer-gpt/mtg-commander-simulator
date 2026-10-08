# AI decisions and mobile Combat — 8 October 2026

This release addresses four reported gameplay problems:

- Board-wipe decisions account for the bot's own losses and each opposing board separately. Known losing resets cannot be rescued by generic personality or spell-value bonuses. Damage, destroy, exile and modal sweeps respect their affected permanents; emergency resets must actually prevent a projected combat loss.
- Shiko and Narset's copies of handwritten removal spells, including Pongify, can choose useful new targets. Copies keep their existing targets when alternatives would harm their controller or cannot be destroyed. Damage spells retain a shared target when both hits are needed, and human players retain the choice to keep or change targets.
- Uncommitted public and secret AI votes use seeded weighted choices. Tactical preferences still matter, but Dominion and other alternatives can win votes. Repeated decisions are reproducible and accepted diplomacy promises remain binding.
- Mobile Combat includes public defending-creature lists with direct inspection, current power/toughness, combat abilities, tapped state and marked damage. Player life and planeswalker loyalty are visible without switching to Table. Existing draft selection and confirmation behavior are preserved.

The production dependency audit also required a single lockfile patch:
`proxy-addr` 2.0.7 → 2.0.8, within Express's existing version range.

A full-game simulation also exposed a pre-existing damage observer crash when
Shellshock left some optional target slots empty. The observer now ignores
empty slots while preserving actual player targets in its single-target count.
Paid-cast regressions cover one and two creature targets and the related
Imodane trigger. Older test fixtures were updated to use the engine's actual
attacker event shape and offered graveyard-casting permissions; their existing
behavioral assertions remain intact.

Living Death now uses the shared simultaneous-sacrifice implementation, fixing
missing last-known snapshots that could crash zone replacements or lose a
departing copied source's replacement ability. The UI translator also preserves
the printed name Leonardo da Vinci when translating surrounding prompt text.

## Validation

- Final combined AI, spell/copy and sequencing regression run: **652 passed**,
  no failures, cancellations or skips.
- Multiplayer server regression suite: **33 passed**.
- Frontend/combat/responsive checks: **29 passed**; final English UI and
  full-catalog name preservation: **10 passed** after the proper-name repair.
- Wipe preservation and existing combat/ward/AI coverage: **148 passed**.
- Final Farewell mode-key, wipe and Deep Clue Sea rerun: **145 passed**,
  including both complete deck simulations.
- Voting, tactical preference and diplomacy coverage: **40 passed**.
- New Shiko copy scenarios: **12 passed**; existing copy/deck coverage:
  **80 passed**.
- Repaired fixture and data-preservation suites: **81 passed**. The six stale
  fixture failures were independently reproduced on the original source
  revision before repair. History-dependent checks use the complete Git history.
- Empty optional spell-target regressions: **3 passed**; the formerly crashing
  Avengers complete-game scenario passes.
- Living Death focused snapshot/ordering checks: **5 passed**; its filtered
  native audit passes for both human and AI controllers.
- Mobile Combat browser acceptance: **15 groups passed**, with no browser
  errors or failed requests. Mobile navigation: **8 groups passed**.
- Syntax, card/source audit and strict certification passed: **29,799 raw
  definitions**, **14,566 card/deck checks**, no certification failures.
- Production dependency audit: **0 vulnerabilities** after the lockfile patch.

The focused suites overlap; their counts should not be added together.

The pre-existing catalog-wide assertion in
`tests/once-per-turn-effects.test.mjs` still fails because its hardcoded
regression list omits six imported cards: Corruption of Towashi; Iron Man,
Bleeding Edge; Irreverent Gremlin; Legolas, Counter of Kills; Planetarium of
Wan Shi Tong; and Riveteers Ascendancy. The same failure was reproduced on
the original `5741c22` revision. This release does not weaken that assertion
or claim to add the missing card coverage. The other **94 tests in that
file pass**, including the repaired Ainok event fixture.

The Illuminor Szeras mana-source activation test in
`tests/clb-dmc-40k-rules.test.mjs` also fails on the original revision: its
generated mana descriptor does not preserve the identity required by activation
validation. That unrelated card defect remains unchanged. The adjacent
Toxicrene fixture was updated to exercise actual activation of all five colors
instead of requiring an obsolete internal descriptor shape, and passes.

The broad `npm test` sweep was stopped after about 15 minutes, with **3,046
passing tests, 12 failure reports and 475 cancellations**. It did not complete
the full catalog and is not reported as passing. Its findings were investigated
with focused reruns: stale fixtures, missing shallow-clone history, the damage
observer crash and the Farewell mode-label regression were corrected; the
Living Death native-audit crash was corrected and rerun in both roles. The
unrelated baseline limitations above remain documented. Final focused runs and
browser acceptance validate this scoped gameplay release.

Validation logs and browser screenshots are retained under the ignored
`output/release-2026-10-08/` directory. The release uses the existing `main`
branch and Vercel Git integration, with canonical URL
<https://www.mtgpod.xyz/>. Production verification records the pushed source
revision, READY deployment, aliases, exact changed-source hashes and API health.

Browser checks use Chromium automation, including 320px and 390px phones,
landscape phones, tablets and desktop. They are not physical-device tests.
