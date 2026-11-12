# Destroy and indestructible — 12 November 2026

Based on `d5e44ff`. A player reported from a phone, on turn 39 of a game on the live site: Darksteel Plate is on their battlefield, and opponents keep casting destroy effects at them anyway.

Two things could be wrong, so both were measured:

- **the rules:** does a destroy remove an indestructible permanent?
- **the bots:** what do they aim a destroy at?

## How it was measured

One script puts the real bot in front of the real engine, once for every card whose text destroys a target: 291 cards of the built-in decks, 1,350 in the whole catalog.

- The bot holds the card in hand with mana for it. A permanent is also tried on the battlefield, for its activated abilities: 447 probes for the built-in decks, 1,980 for the catalog.
- The opponent's best permanents cannot be destroyed: Impervious Greatwurm, a Shivan Dragon that wears Darksteel Plate, the Plate itself, Darksteel Citadel and Darksteel Ingot.
- In the first scenario the opponent also has something of each type that can be destroyed (a creature, two artifacts, two enchantments, two lands). In the second it has nothing else.
- Every target the bot chooses is recorded, and the engine's own note "destroy is prevented" says when a destroy met indestructible.

## What was wrong

**The rules were right.** No destroy removed an indestructible permanent, in any probe. The indestructible permanents that left the battlefield were sacrificed, returned to hand or exiled, as their cards say. The first test of the new file pins it: the creature that wears Darksteel Plate, and the Plate, cannot be destroyed.

**The bots did not know which of their effects destroy.**

- A bot learned it from one hint on the target (`removalKind: 'destroy'`). The Oracle compiler writes that hint; of the hand-written scripts, two do.
- The other hand-written scripts say `goal: 'removal'`, `goal: 'destroy'`, or nothing. Of the 657 destroy choices the script recorded, 173 came with no such hint.
- For those the bot aimed at the most valuable permanent it could name, which is exactly the creature a player protects with Darksteel Plate. With a destroyable target on offer, 53 of the 291 built-in cards were aimed at an indestructible one: Beast Within, Generous Gift, Assassin's Trophy, Feed the Swarm, Putrefy, Decimate, Maelstrom Pulse.
- A repeatable ability was aimed the same way each time it was used: Avatar of Woe, Stronghold Assassin. Hoard-Smelter Dragon and Deepfire Elemental were activated four times in one main phase, each time at an indestructible permanent.

**Five more faults of the same kind.**

- **Abilities were not weighed by what they remove.** A compiled ability counted any opposing permanent as a useful target, and an unhinted one was not weighed at all, so "{T}, Sacrifice a creature: Destroy target creature" was paid for with only an indestructible creature to aim at.
- **"Destroy target … with mana value X."** The bot took the largest X it could pay, which is the most expensive permanent, destructible or not.
- **A destroy spell with a rider** was cast with only indestructible targets, for the rider: Vanquish the Foul for its Scry 1, Deadly Embrace for no card.
- **Two compiled abilities told the bot that they help their target.** Tsabo's Assassin ("Destroy target creature if it shares a color with the most common color…") destroyed the bot's own creature. Boseiju, Who Endures was discarded at whatever the hint led to.
- **Damage has the same rule:** lethal damage destroys, and an indestructible creature survives it. Where a hint gave the bot no number to weigh, it burned the most valuable creature: 31 of the 126 built-in damage cards, with another target on offer.

## Changes

### What a target choice does (`src/modules/ai-v2.js`)

The bot now reads the printed text of the choice it is making. `targetInstructions` takes every "target …" instruction of a rules text in printed order: whether its object is destroyed or dealt damage, what it may be (creature, artifact, permanent…) and whose. `choiceRemovalKind` answers for one choice, from the most specific source to the least:

1. the hint, where it names the kind;
2. what the script itself calls the choice: an ability's label, a trigger's description, a prompt ("Sacrifice: destroy art/ench");
3. the printed text of the source. A Saga's chapter, an activated ability or another ability is read alone when the choice comes from it. With one instruction for each target step, the step is its instruction (Decimate, Closing Statement). Otherwise the instruction must fit what is offered: every candidate of a kind it names, and of the side it names (Abrade's two modes).

"A new target", "each target beyond the first" and "would be destroyed" choose and destroy nothing. A label that was cut short for display is skipped. Where the text does not settle it, the answer is empty and the bot does what it did before.

Scored inside the bot's own questions against what the engine then did (705 choices with a removal or damage purpose, or none stated): of the 609 choices whose target the engine went on to destroy, the reading says "destroy" for 608. The one it misses carries an older hint that says exile (Never // Return). Thirteen more answers of "destroy" are destroys that did not happen in the probe: a lost coin flip, an unmet condition, a "you may".

### Where it is used

- **Choosing a target.** A destroy aimed at an opposing indestructible permanent is a dead effect, whatever told the bot that it destroys. Damage with no number in its hint, aimed at an opposing indestructible creature, is valued like lethal damage on one already was.
- **Casting.** The best thing a removal spell would remove no longer counts what a destroy cannot remove. A single-target destroy spell whose every opposing target is indestructible is held, also when it has a rider.
- **Activating.** What an ability would remove counts only where it removes it, and a required destroy with nothing to destroy is not paid for. The compiled ability score (`oracle-catalog.js`) no longer counts an indestructible permanent as a use for a destroy.
- **Choosing X.** For "destroy target … with mana value X", an X is worth the best thing it lets the effect destroy. Other effects keep the plain rule for X, and so does "X target lands", where X counts the targets. `engine2.js` passes the ability with the question for X, as it already passed the card.
- **The fallback controller** (`ai.js`) prefers what a destroy can destroy.
- **Two hints** (`oracle-v65-common.js`, `oracle-v67-common.js`): Tsabo's Assassin and Boseiju's channel ability are removal, of the kind destroy.

No rule changed. An indestructible permanent stays a legal target for a player who wants it.

## Verification

### The audit, before and after

Cards with at least one probe in which a destroy met indestructible, and how many of them had a destroyable target on offer in that same choice:

| Cards | Opponent also has destroyable permanents | Difficulty | Before | After | With a destroyable target on offer |
|---|---|---|---|---|---|
| 291 built-in | yes | normal | 60 | 3 | 53 → 0 |
| 291 built-in | no | normal | 64 | 6 | none to offer |
| 1,350 catalog | yes | easy | 119 | 8 | 98 → 0 |
| 1,350 catalog | yes | normal | 121 | 9 | 98 → 0 |
| 1,350 catalog | yes | hard | 122 | 7 | 101 → 0 |
| 1,350 catalog | no | normal | 138 | 18 | none to offer |

The two rows at normal difficulty with destroyable permanents were measured again on the final code and are the same. The other four were measured before the X rule was narrowed for the last time.

What remains is not a choice of the bot:

- a permanent cast for itself, whose enters, monstrosity or chapter trigger must then name a target (Big Game Hunter with only indestructible creatures of power 4 or greater);
- "target opponent chooses a creature they control. Destroy that creature": the opponent chooses;
- Dismantling Wave cycled for its "destroy all".

Damage, for the 126 built-in cards that deal damage to a target: aimed at an indestructible creature with another target on offer in 41 choices of 31 cards before, in 6 choices of 4 cards after. Those six are other abilities of the same cards (tap, "can't block"), where the largest creature is the right target. With mana for a large X, Electrodominance, Worldsoul's Rage and Death Grasp now go to the opponent's face.

### Tests

- **New: `tests/ai-destroy-indestructible-scripts.test.mjs`**, 12 tests with real cards. On `d5e44ff` 11 of them fail; the one that passes is the rules premise.
  - The creature that wears Darksteel Plate, and the Plate, cannot be destroyed.
  - At easy, normal and hard, seven hand-written destroy spells are aimed at the creature that can be destroyed, not at the more valuable one wearing the Plate.
  - A destroy spell is kept when all it could aim at is indestructible.
  - An enters trigger with no hint takes the destroyable creature.
  - "{T}, Sacrifice a creature: Destroy target nonblack creature" is not paid for with only an indestructible creature to aim at, and is used once there is another.
  - Deepfire Elemental chooses X for the creature it can destroy.
  - Damage with no number in its hint is not put on the indestructible creature.
  - Tsabo's Assassin and Boseiju carry a destroy hint.
  - The reading of 20 printed texts, and the fallback controller.
- The same file and `oracle-ai-destroy-indestructible.test.mjs` also pass with the engine loaded the way the page loads it (`MTG_ENGINE_LOAD=two-part`): 15 of 15.
- **The node suite was not completed.** The work was closed while it ran. Of its 871 files, 689 ran to the end on the fixed code: 17,345 tests passed and 10 failed.
  - Nine fail the same way on the code before this fix: `bom-precons` and `clb-dmc-40k-precons` (each asks git for a commit this shallow checkout does not have), `commander-staples` (1), `ui-priority-action-callbacks` (4, also on `b3abef1`), `legacy-card-catalog-integrity` (1) and `oracle-token-forms-source` (1).
  - One was this round's own mistake, described below; its file now passes.
  - `headless-smoke` (180 complete four-player bot games) and `oracle-bulk-interactions` did not finish within 40 minutes each and were stopped. Eight of the 180 games were then run on their own (seeds 11081, 11088, 11111, 11141, 11171, 11201, 11231 and 11254): each ends with a winner, keeps the game-state invariants at every turn, and has no fallback decision.
  - 180 files were not run: 127 of the `oracle-*` card files (from `oracle-v57` on), the `save-*`, `restricted-*`, `priority-*` and `player-*` files and a few more.
  - The suite ran while the X rule was narrowed twice. After the last change, ten bot test files were run again (183 of 183 pass), with the new file and `oracle-land-setting-source` among them.
- Syntax check, `git diff --check` and the startup catalog check pass.

### One mistake of this round, found by the complete suite

The first version valued every X by its target. `oracle-land-setting-source.test.mjs` failed on it: Deepwood Elder's "X target lands become Forests" wants its X large, and lands are worth nothing as targets, so the bot chose X = 0. The valuation now applies only where X restricts what may be chosen and the effect is a destroy.

## Not changed, and not checked

- **A permanent with a required destroy trigger is still cast** when the trigger will have only indestructible targets. The bot weighs the permanent, not the trigger.
- **Damage among destructible creatures.** Where a hint gives no number, the bot still does not know whether 3 damage kills a 5/5. It no longer burns the creature that cannot die; it may still burn one that will not.
- **Other reasons a destroy fails**: a shield counter, a regeneration shield, umbra armor. Compiled hints already weigh the first two; hand-written destroys are only kept away from indestructible.
- **Other custom compiled effects.** Two modules gave every target of their custom effects one hint. The two that destroy are corrected; the other modes were not audited.
- **A destroy on the bot's own indestructible permanent** ("destroy target creature you control" as a cost of sorts) is not preferred.
- **Browser suites were not run.** No interface file changed; a bot's choices in a real page were not watched.
