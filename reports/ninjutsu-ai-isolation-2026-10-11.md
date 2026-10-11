# Ninjutsu source isolation — 11 October 2026

## Reproduction and cause

In a new Solo game, activate Yuriko's ninjutsu from hand by returning an
unblocked Mockingbird copying Hellkite Tyrant. If an opponent evaluates a
response while ninjutsu is on the stack, Yuriko can disappear: the log ends
with `Resolving: Yuriko, the Tiger's Shadow — Ninjutsu`, without battlefield
entry, combat damage, or Yuriko's reveal trigger.

The queued ability's resolution function closed over the live `CardInst`.
AI snapshots clone the ability context but share its function. Resolving the
snapshot consequently moved the live Yuriko into the snapshot's battlefield,
removed her from her real owner's hand, and changed her zone/version. The
actual ability then rejected that changed source. This also affected command
zone ninjutsu; a copied attacker was not required.

The resolution function now obtains its card from `abilityCtx.src`. Each
simulation moves its own cloned card; actual resolution moves the live card.
The source zone/version checks, controller, captured combat destination,
mana cost, and commander tax behavior remain intact.

## Verification

Before the change, all three direct snapshot-isolation scenarios failed:
hand with a copied attacker, hand with an ordinary attacker, and command
zone with a copied attacker. Ordinary native combat without simulation
already passed, which isolated the failure to AI response evaluation.

The new `tests/ninjutsu-copied-attacker.test.mjs` uses printed cards, actual
casting/payment, combat, stack resolution, and game-state invariants. It
checks Mockingbird's restored definition, live and simulated source identity,
paid opponent Opt response simulations, and actual Yuriko combat damage and
reveal/life loss. It also covers ordinary hand ninjutsu's hand-membership
check.

Passed checks:

- `node --test tests/ninjutsu-copied-attacker.test.mjs`.
- 56 existing tests covering source-zone changes, copied ninjutsu abilities,
  combat destinations, manual mana, ability cost reductions, Yuriko's native
  script, and AI response simulation.
- `npm run test:baseline` (5 tests).
- `npm run check` and `git diff --check`.

Mobile Chromium acceptance used the existing Yuriko browser fixture with a
Mockingbird copy and native AI Brainstorm response evaluation. Both hand and
command zone cases reproduced the disappearance on the original source.
Both passed with the fix: Yuriko was present in the actual battlefield,
entered tapped, dealt one combat damage, and revealed Temporal Trespass
(mana value 11), leaving player lives at `[40, 28, 29, 29]`. No browser errors
or AI fallbacks were recorded.

Validation is focused on this rules-engine change. The full catalog suite
and production deployment were not run as part of this patch.
