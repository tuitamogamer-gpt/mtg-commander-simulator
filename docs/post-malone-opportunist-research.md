# Post Malone — Opportunist Showstopper

## Scope

This is a conservative, local-AI synthesis of decisions visible in Post Malone's public Commander appearances. It is not a claim of exact imitation, endorsement, affiliation, or access to private deckbuilding and decision data.

## Public-game evidence

- [Game Knights 45 — Merieke Ri Berit](https://www.youtube.com/watch?v=j8FtcDd9wbc): Post builds around Rhystic Study and a Merieke/untap control engine, uses an asymmetrical Austere Command when the table becomes dangerous, joins the necessary attack on the immediate threat, then steals another premium creature and keeps a large reanimation finish available.
- [Game Knights 51 — Chishiro, the Shattered Blade](https://www.youtube.com/watch?v=zJIKljeQK88): the deck plan is auras, equipment and modified creatures. Post develops the commander and supporting engine, slows the fastest board, then takes an open profitable attack instead of fighting every player at once.
- [Game Knights 87 — Elrond, Moonreader](https://www.youtube.com/watch?v=iD3BPb7WzPo): the stated plan combines blink, card draw and interaction with playing opponents' cards. The game shows early resource risk, a Rhystic Study recovery engine, table-aware self-preservation, and repeatable bounce aimed at the publicly dominant mana engine.

Across these games, the useful repeatable pattern is not “always steal” or “always combo.” It is: accumulate cards while appearing manageable, convert the best opposing resource into an advantage when possible, accept a calculated risk when behind, and turn the resulting swing into a memorable finish.

## Skill contract

Style key: `post`

Skill id: `post-opportunist-showstopper`
Parent archetype: `Opportunist`

The ordinary `Opportunist` remains selectable. `Post Malone — Opportunist Showstopper` is a separate signature option.

### Modes

- `LAY_LOW`: early mana, card draw, selection and engines; avoids unnecessary stax and low-value combat.
- `HEIST`: prefers control-theft, opponent-card access, reanimation, blink/untap engines and high-value open attacks.
- `GAMBLE`: when life or board position is poor, accepts bounded life/resource risk and favors an asymmetrical reset or recovery line.
- `SHOWTIME`: when a visible lethal or sufficiently mature engine exists, stops accumulating and commits to the finisher, combo or profitable elimination.

### Behavioral rules

- Prefer repeatable draw/engine pieces, auras/equipment synergy, combo setup and reanimation over a comparable vanilla body.
- Keep one mana available for real interaction when the game is not ready for `SHOWTIME`.
- Use removal on a public leader, premium engine or contract-required target; do not spend it on a harmless permanent.
- Strongly avoid stax as a default plan.
- Reward attacks into genuinely open lanes, especially against a wounded opponent; never reward a free block.
- Add extra value when a borrowed creature deals the damage or a combat trigger produces cards, Treasure or exiled-card access.
- Accept fair, short self-preservation/shared-threat agreements and honor their rules-enforced terms.
- Use only public game state plus the bot's own legal private view; never inspect another player's hidden cards.

## Product behavior

The setup selector shows Post directly beside the other AI styles. Its badge uses the existing Opportunist treatment. The chosen style is stored through `Deck → Pod → Review`, used by the local deterministic controller, exposed in the public AI decision log, and retained by the existing rematch flow.
