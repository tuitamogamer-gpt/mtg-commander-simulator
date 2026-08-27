# Olivia — Saboteur Instigator

## Scope

`Olivia — Saboteur Instigator` is a conservative, local-AI synthesis of choices visible in Olivia Gobert-Hicks's public Command Zone gameplay. It is not an exact imitation, endorsement, affiliation, or claim about private decision-making. The style reads only public game state and its own legal private view.

## Why Olivia fits Saboteur

The repeated pattern is more precise than generic chaos: Olivia looks for a low-risk opening, changes who is safe and who is exposed, attacks alliances or engines that would lock her out, and converts an apparently indirect play into a decisive swing.

- [Game Knights 21 — Etrata, the Silencer](https://www.youtube.com/watch?v=TomR8EIzxk0): the deck's commander is a covert alternate-win threat rather than a conventional damage engine. In the game, Olivia identifies a flyer that can interfere with her plan, reacts when two opponents form an alliance that excludes her, joins a short defensive agreement, and uses the resulting cover to continue developing the hidden kill line.
- [Game Knights 50 — Saskia the Unyielding](https://www.youtube.com/watch?v=sxfhy22AFvA): Olivia marks Jimmy with Saskia, then attacks Arin so one combat pressures two seats at once. The choice avoids the strongest blocker while still damaging the named player—an unusually clean example of misdirection rather than simple aggression.
- [Game Knights 75 — Tymna / Jeska / Obosh](https://www.youtube.com/watch?v=ALUxJPWwGUE): Olivia uses safe attacks to turn Tymna into steady cards and becomes the Monarch while preserving the only developed board. The table eventually recognizes that the quiet accumulation is about to become lethal. This supports “probe first, ambush later,” not random attacks.
- [Extra Turns 24 — Thalisse](https://www.youtube.com/watch?v=P7oDhVWKwOQ): Olivia's token/aristocrats plan pays for opponents' tax effects, develops without advertising a premature all-in, and turns apparently disposable pieces into a board and life-total engine. It reinforces the preference for indirect leverage and held interaction.

## Skill contract

Style key: `olivia`

Skill id: `olivia-saboteur-instigator`
Parent archetype: `Saboteur`

The ordinary `Saboteur` remains selectable under the compatible internal key `teaser`. Olivia is a separate signature choice.

### Public-state modes

- `INFILTRATE`: build mana and card advantage, establish a quiet engine, and take only safe/profitable probes.
- `MISDIRECT`: prefer goad, suspect, control-changing, target-changing, Monarch/initiative and combat-trigger lines that make opponents expose one another.
- `DISRUPT`: when a public leader runs away or Olivia is under immediate pressure, hold and spend interaction on that leader's premium engine, attacker or spell.
- `AMBUSH`: when a visible lethal or mature public engine exists, stop hiding and commit to the finisher or profitable elimination.

### Behavioral rules

- Goad or suspect the strongest useful attacker, especially one controlled by the public leader; do not choose a harmless random creature merely because it is legal.
- Prefer target redirection, control-changing, attack-forcing, Monarch/initiative and voting cards over a comparable vanilla body.
- Use cheap evasive or combat-trigger creatures for safe attacks; value attacks across multiple open opponents when they generate cards or other resources.
- Preserve at least one blocker outside `AMBUSH` when the public crackback is meaningful.
- Save removal/counters for a public leader, premium engine, imminent threat, or rules-enforced contract target.
- Use a reset in `DISRUPT` only when opponents' public boards materially outweigh the bot's board.
- Keep sabotage, interaction, engine and card-draw pieces when discarding; shed excess lands, an off-plan expensive vanilla body, or an unnecessary wipe first.
- Accept or propose only short, reciprocal, existing rules-enforced deals; prefer terms that break a runaway player's position and always honor the resulting contract.
- Never inspect opponent hands, libraries, face-down identities, or any other hidden information.

## Product behavior

The setup selector exposes both `Saboteur` and `Olivia — Saboteur Instigator`. Olivia receives the existing Saboteur badge treatment, persists through `Deck → Pod → Review`, uses the local deterministic controller, reports public `skill` and `mode` fields in AI logs/state, and remains compatible with the existing rematch flow.
