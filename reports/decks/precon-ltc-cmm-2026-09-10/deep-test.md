# Player and AI deep testing — 10 September 2026

Scope: Riders of Rohan, The Hosts of Mordor, Food and Fellowship, Sliver Swarm, and Planeswalker Party. Testing started from `c98fc837c731fe88dc15a2e666a07e1a31f5c827`. The original 500 physical cards and 369 distinct card identities are preserved.

The results and SHA-256 hashes for the tested files are recorded in `deep-test.json`. This is a local follow-up to the completed import release; it does not replace the original release evidence in `qa.json` or assert that these fixes are deployed.

## Separate perspectives

| Perspective | Coverage |
| --- | --- |
| Player | Real Chrome UI at 1440 and 390 pixels: select the original deck, verify the 100-card opening and commanders, choose a card/action, pay mana, select targets or X, pass priority and verify the resolved board. |
| Bot decisions | Ten autonomous scenarios: all five decks at normal and hard difficulty. The real AI controller chooses its action, targets, optional choices and X without scripted answers. |
| Complete bot games | Twenty independently shuffled games: five decks across four seeds each; two, three and four seats; includes a pod with three Sliver decks. Every seat uses the production local AI controller. |
| Rules in both roles | Nineteen adversarial scenarios each run in human and AI roles, producing 38 checks. Some choices are deliberately specified to reproduce exact edge cases; these are separate from autonomous decision tests. |
| All cards | 738 common-board execution checks: each of 369 identities in both role configurations. These exercise legal cast/land offers, payments, resolution, entry triggers and state invariants. They do not establish optimal AI play or cover every ability. |
| Regression | 712 checks across the five-deck semantics, planeswalker activations and decisions, AI isolation, copies, delayed triggers, damage, optional triggers and save/restore. This includes the 99 import-specific checks; the counts are not additive. |

Browser scenarios specifically exercise Fealty's target and changing monarch, Reanimate targeting an opponent's graveyard and charging six life, Farmer Cotton with X=2 followed by Sam's discounted Food activation, two Hatchery replicate payments, and a Chain Veil activation followed by a newly cast Jace activating twice. On phones, an opponent's graveyard is reached through player details when the desktop shortcut is hidden.

## Eight corrected findings

1. **Chandra, Awakened Inferno:** a planeswalker damaged by her −X incorrectly went to the graveyard. The replacement now exiles the same damaged permanent when it would die, including later destruction. Tests also cover zero damage and blinking out of the affected incarnation. [Core Set 2020 release notes](https://magic.wizards.com/en/news/feature/core-set-2020-release-notes-2019-06-25).
2. **The Chain Veil's additional activation:** the permission was stored only on planeswalkers present when it resolved. It now belongs to the player for that turn, including later entrants and blinked planeswalkers, survives removal of the Veil, stacks, expires and persists through JSON checkpoints. [Magic 2015 release notes](https://magic.wizards.com/en/news/feature/magic-2015-core-set-release-notes-2014-07-07).
3. **Oath of Teferi:** additional activations incorrectly applied to permanents that had become Birds and were no longer planeswalkers. Its increased limit now checks the current permanent type. [Dominaria release notes](https://magic.wizards.com/en/news/feature/dominaria-release-notes).
4. **The Chain Veil's life-loss condition:** activating a Bird's retained loyalty ability incorrectly prevented the two-life penalty. The activation history now records whether the source was a planeswalker at activation. A planeswalker subsequently leaving still counts.
5. **Brood Sliver / Synapse Sliver:** a stolen Sliver leaving before its combat trigger resolved could give the reward to its owner. The reward uses current control while the same object remains on the battlefield, otherwise its last known battlefield controller. Both branches are tested. [Comprehensive Rules, 608.2h](https://media.wizards.com/2022/downloads/MagicCompRules%2020220708.pdf).
6. **Farmer Cotton / Jace, Mirror Mage:** blinking before the entry trigger resolved could lose the original X or kicker information. Entry events now retain their own cast information, so a new incarnation does not overwrite the pending trigger's choices.
7. **Repeated Reverberation and shared copy helpers in AI simulations:** closures referred to the real player and shared mutable consumption state, so an AI clone failed to receive its copies. The player and consumption record now come from the cloned delayed-effect record. Independent clone and real-game activations are tested.
8. **Copying after the original is countered:** the same helper incorrectly dropped an already triggered copy when the original spell or loyalty ability left the stack. It now copies the recorded object; tests verify two copies resolve while loyalty is paid only once.

Before fixing the initial findings, the corrected adversarial test set produced 18 failures out of 35 checks. Four additional tests reproduced the countered-original copy issue. The final dedicated deep-test file contains 51 passing checks, including ten autonomous bot tests and three persistence/simulation checks.

## Reproduce on this workstation

```powershell
node --test tests/ltc-cmm-precons.test.mjs tests/ltc-cmm-advanced.test.mjs tests/ltc-cmm-deep.test.mjs
node scripts/test-ltc-cmm-deep.mjs --native
node scripts/test-ltc-cmm-deep.mjs
$env:PLAYWRIGHT_MODULE='file:///C:/Users/Korisnik/Downloads/MTG/.local/browser-tools/node_modules/playwright/index.mjs'
node tests/browser/ltc-cmm-deep.mjs
node scripts/verify-ltc-cmm-import.mjs
npm.cmd run check
npm.cmd run audit
git diff --check
```

The complete 712-check command and compact evidence are in `deep-test.json`. Full local logs are in `.local/ltc-cmm-deep-*`; browser screenshots and full card/game results are in `output/precon-ltc-cmm-2026-09-10/deep/`.

## Subsequent release

After these local tests, commit, push and production deployment were authorized. The six changed runtime files still exactly match the hashes from the 712-check regression, 738 execution cases and 20 games. The browser harness additionally accepts `PRECON_BASE_URL` so the same ten interactions can run on the canonical production URL; local mode was rechecked. Release gates also include 19 public-release/server checks, strict certification of all 20,853 definitions and a dependency audit. The final commit, automatic deployment, published source digests, browser results and Live checks are recorded in `output/precon-ltc-cmm-2026-09-10/deep/release.json` after deployment.

```powershell
$env:PRECON_BASE_URL='https://mtg-commander-simulator.vercel.app'
node tests/browser/ltc-cmm-deep.mjs
```

## Limits

This is focused deep testing, not a full `npm test` pass or proof of every possible card interaction. Browser boards are controlled fixtures following a real deck opening; the 20 bot games use natural shuffled decks. Save/restore checks cover portable checkpoints and AI clone isolation. The existing save system still retains the previous checkpoint while unsupported lasting effects, delayed triggers or emblems are active. Historical release and full-suite limitations remain as recorded in the original reports.
