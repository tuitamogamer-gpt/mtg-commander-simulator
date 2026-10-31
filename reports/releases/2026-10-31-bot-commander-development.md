# Bots deploy their hand before a taxed commander — 31 October 2026

Based on `8971d8e`.

## What changed

Bots with a full hand, typically after a board wipe, often spent the whole turn recasting an expensive commander and kept seven or eight cards in hand. Two things in the bot's scoring caused it:

- **Commander tax counted as value.** A cast scores higher the more mana it costs, and that included the tax. A commander on its third cast therefore looked better than on its first.
- **No opportunity cost.** The bot scores each action on its own and plays the best one. A commander worth more than any single card in hand won, even when the same mana would cast three of them.

Now:

- A commander's cast is scored on its printed cost; the tax is only a cost.
- When the commander is the best-scored play in the bot's main phase, the bot compares two plans for the mana it has: the commander plus whatever still fits beside it, and the best cards from hand that fit. Cards above the hand limit count as saved when they are cast, because cleanup would discard them. If the hand plan is worth more, the best hand card is played first. The bot compares again after each play, and the commander waits while it would cost those cards.
- The commander stays the play in the cases where it should be:
  - It is cheap enough to cast alongside the hand.
  - The hand has fewer than two cards to deploy.
  - The commander is worth more than the hand plan; commander-centric decks weigh it higher.
  - Instant-speed answers the bot is holding and X spells do not count toward the hand plan.
- The commander is never pushed below ending the main phase, so a weak hand that the bot would not cast anyway cannot leave it doing nothing.

## Verification

- **Rebuild probe:** 14 decks with five- or six-mana commanders. Each bot has an empty board, a hand of eight of its own deck's cards (six spells costing 2 to 4 and two lands) and lands from its deck, then plays its main phase.

  | Setup | Before | After |
  | --- | --- | --- |
  | Tax +4, 10 mana, without deep search | 6 of 14 cast the commander first; 1.71 hand spells; 6.36 cards kept | 0 of 14; 2.64 hand spells; 5.57 cards kept |
  | Tax +4, 10 mana, with deep search (interactive games) | 4 of 14 cast the commander first; 2.07 hand spells | 0 of 14; 2.79 hand spells |
  | Tax +2, 8 mana, without deep search | 3 of 14 cast the commander first | 0 of 14 |
  | No tax, 8 mana, without deep search | 5 of 14 cast the commander first | 3 of 14 |

  The three remaining first casts with no tax fit the cases above. Leonardo (4 mana) and Cloud (5) were cast alongside a hand card and used all the mana.
- **New tests:** `tests/ai-commander-development.test.mjs` uses a taxed Multani (10 mana) with ten Forests, in games with and without deep search:
  - With a hand of six creatures, the bot plays the hand first, deploys at least three of them and keeps Multani in the command zone. The old bot cast Multani first and fails this test.
  - With only lands in hand, the bot casts Multani; that test passes on both revisions.
- **AI suites:** all `tests/ai-*.test.mjs` pass, 766 of 766.
