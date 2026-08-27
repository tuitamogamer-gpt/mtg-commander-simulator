# Rachel — Balanced Tablecraft

## Scope

`Rachel — Balanced Tablecraft` is a local, deterministic Commander AI style inspired by Rachel Weeks's publicly described philosophy and publicly shown Command Zone gameplay. It is a design synthesis, not an impersonation, endorsement, or claim that the simulator reproduces her private decision-making.

The style remains inside the existing `Balanced` archetype. It does not call an external API or model, inspect hidden opponent information, or bypass the normal legal-action generator.

## Public evidence

### Stated Commander philosophy

In TCGplayer's interview, Rachel describes Commander as a format for big, inefficient, flavorful plays and says she often leaves decks less optimized to preserve a theme. Her "Lasagna Tier" puts responsibility on all players to help create a fun, climactic game. The clearest gameplay instruction is: build for fun, play to win. She also distinguishes defensive counterspells that protect a board, combo, or life total from offensive counters that merely stop another player from developing.

Source: [Meet the Newest Member of the CAG: Rachel Weeks](https://www.tcgplayer.com/content/article/Meet-the-Newest-Member-of-the-CAG-Rachel-Weeks/c59abc5a-23d1-481a-a560-06d5071f9566/)

### Chiss-Goria: value through calculated combat

In Game Knights 60, Rachel deploys an early Hangarback Walker as a blocker against poison pressure. She then takes a calculated combat risk to connect with Professional Face-Breaker, explaining that the Treasure and ability to deploy Sword of Forge and Frontier are worth the danger. The Sword is valued as both card advantage and mana development. When Josh's redundant value engine becomes the leading public threat, her removal is aimed at that engine rather than spent indiscriminately. The deck ultimately turns combat-generated resources into a powerful late-game sequence.

Source: [Game Knights 60 — Phyrexia: All Will Be One](https://www.youtube.com/watch?v=Q8QFmDcq5nQ)

### Dihada: offense and defense from the same pieces

In Game Knights 56, Rachel presents Dihada as a legends deck whose commander finds and protects attack-trigger threats before large swings close the game. During play she commits to an aggressive board, but uses vigilance, lifelink, indestructibility, and a board-wipe tax to preserve defense while attacking. This is useful evidence for a Balanced style that advances its plan without ignoring crackback risk.

Source: [Game Knights 56 — Dominaria United](https://www.youtube.com/watch?v=X__qapQRP50)

### Broader deck identity

Rachel's personal-decks episode shows that the behavior should work across different deck mechanics rather than hard-code one commander or color identity.

Source: [Rachel's Personal Commander Decks — The Command Zone 535](https://www.youtube.com/watch?v=LCqGf27Xyvk)

## Implemented decision model

The skill has four public-state modes:

- `DEVELOP`: prioritize mana, cards, commander support, and flexible permanents while preserving a blocker when the table can punish an all-out attack.
- `TABLE_READ`: compare public threat, make profitable resource-generating attacks, direct pressure and removal at the real leader, and keep enough defense for the crackback.
- `COMEBACK`: when life, commander damage, immediate loss risk, or board disparity becomes dangerous, increase blocking, removal, protection, and favorable reset priority.
- `FINISH`: when the remaining table is publicly closable or a mature engine is clearly ahead, stop extending the game and commit to the win.

Signature rules:

- Prefer cards that fill multiple useful roles over narrow cards with similar raw value.
- Treat counterspells primarily as defense for the bot, its commander, and its established engine.
- Avoid spending removal on a harmless setup permanent when a real public leader or engine is absent.
- Reward combat that produces cards, Treasure, tokens, or other plan resources, but price the loss of the last blocker.
- Do not treat the ability to eliminate one weak player in a larger pod as an automatic `FINISH` state.
- Accept or propose only the existing short, reciprocal, rules-enforced deals, with extra preference for pressure against a shared runaway threat.
- Take a real win when it is available.

## Verification contract

Targeted tests cover setup persistence, all four modes, flexible development, defensive interaction, table-aware combat, discard priorities, diplomacy, and a complete deterministic four-player game without AI fallbacks. Browser QA must additionally verify the explicit Pod Builder option and observe Rachel's `skill`, `mode`, and `tableBalance` fields in a real game decision log.
