# AI archetypes and custom opponents

Solo supports **1–3 local AI opponents**. Choose a deck, click **Build this pod →**, then set each opponent's **Deck** and **Play style** in **Pod**. Open **Advanced rules → Difficulty** to choose Easy, Normal or Hard. Confirm the table in **Review** before starting.

The AI runs locally in the game. It evaluates legal actions, its own hand and the public table, without external model calls or access to opponents' hidden card identities. Rules remain the engine's responsibility: a style cannot make an illegal cast, create a missing card implementation or replace a card's printed behavior.

## Deck, style and difficulty do different jobs

| Setting | What it changes |
| --- | --- |
| **Deck** | The cards and strategy available to that seat. The evaluator derives roles, synergies, resource priorities and important engines from the list; some built-in decks also have explicit profile hints. |
| **Play style** | How the bot values development, pressure, defence, interaction and the other players. |
| **Difficulty** | The search budget and tolerance for weaker choices. It does not grant extra cards, mana or hidden information. |

For example, the same token deck can be played aggressively to apply pressure or defensively to preserve blockers and build resources. A style can only act on the cards and legal opportunities the current game offers. A sabotage style cannot goad creatures without a suitable card or effect.

## Core archetypes

There are five core choices. Balanced supplies the general policy; the other four add distinct preferences for combat, targets, casting and interaction.

| Play style | JSON base key | Typical preference |
| --- | --- | --- |
| **Aggressive** | `aggressive` | Attack early, develop attackers and damage, and pressure wounded players. Less eager to block or wipe away its own board. |
| **Opportunist** | `opportunist` | Seek weakened opponents and vulnerable openings, often avoiding the strongest player while preserving attackers. |
| **Defensive** | `passive` | Develop the board, keep blockers, value protective interaction and attack when the position supports it. |
| **Saboteur** | `teaser` | Disrupt plans through political pressure, misdirection and supported goad or other disruptive effects. |
| **Balanced** | `balanced` | Balance resources, board development, threats and interaction without one of the four stronger core tilts. |

The display names **Defensive** and **Saboteur** correspond to the older schema keys `passive` and `teaser`. Use the keys, not the display names, when writing a custom JSON file.

## Signature styles

The selector also includes five named policies under **Command Zone signatures**. They are game policies inspired by public play, not exact replicas, endorsements or predictions of what the named people would do. Their displayed reactions are flavor text. Each policy adds evaluation weights, situational modes and political preferences to the same local AI.

| Play style | JSON base key | Behavior |
| --- | --- | --- |
| **Jimmy — Aggressive Pressure** | `jimmy` | Build around the commander, attack open lanes, protect a winning line and commit to a finishing attack. |
| **Rachel — Balanced Tablecraft** | `rachel` | Develop flexible value, evaluate the table's shared threats, use defensive interaction and choose a supported finishing opportunity. |
| **Post Malone — Opportunist Showstopper** | `post` | Build card advantage with a low profile, use available theft/copy opportunities, and take calculated risks for a strong finish. |
| **Olivia — Saboteur Instigator** | `olivia` | Probe safe attacks, redirect pressure, disrupt the public leader and exploit an opening. |
| **Josh — Defensive Value** | `josh` | Develop mana and repeatable card advantage, hold interaction, favor short precise deals and win from a stronger resource position. |

Political preferences operate within the game's available rules. Enable **Diplomacy & Politics** in Advanced rules for structured public deals in a Solo pod with at least three players. Ordinary offers unlock once every active player has started their third turn; contextual bargains around supported public votes can occur earlier. The [Diplomacy & Politics guide in the README](../README.md#diplomacy--politics) explains offers, counteroffers, review pauses, emergency deals, and optional campaign tie-breaks. Signature styles also work with Politics off. A custom skill based on a signature inherits its policy, while displaying its own name and icon.

**Random style** assigns a built-in personality, revealed during the game. Saved custom skills do not join that pool, so installing a file does not change an unrelated seeded Random-style setup.

## Difficulty

| Difficulty | Configured candidate width | Maximum lookahead | Intended use |
| --- | --- | --- | --- |
| **Easy** | 4 | 1 step | Learn a deck against a more forgiving opponent. |
| **Normal** | 10 | 3 steps | The default balance of decision depth and responsiveness. |
| **Hard** | 18 | 4 steps | More search and less tolerance for weaker lines. |

These are configured limits, not a promise that every decision explores that many moves. Complex tables receive a smaller simulation budget and searches have time limits to keep the browser responsive. All levels can make mistakes; Hard is not a perfect solver. Styles retain survival safeguards even when their preferences favor aggression.

## Add your own skill

1. In Solo's Pod screen, click **Upload / manage custom AI skills**.
2. Open **Instructions & creation prompt**. Download a template, or copy the supplied prompt into an assistant of your choice and describe the opponent you want.
3. Upload or drop one `.json` file, or paste its JSON and click **Check skill**.
4. Review the base style and numeric settings, then click **Save skill**.
5. Close the workshop. In a bot's **Play style**, select the new entry under **Your custom skills**. Continue to Review and start.

Try the included [Patient Engine example](examples/patient-engine.json), which builds on Josh's value policy. It gives extra weight to card advantage, mana development and life safety, adds cast-score bonuses for engines and draw, and softly prefers reserving mana while holding interaction.

A skill uses the **`commander-ai-skill/v1` declarative JSON format**. The game reads supported settings; a paragraph such as “always counter the next spell” does not program new behavior. JavaScript, Markdown skills, model prompts, network access and arbitrary fields are not executed or accepted as extensions.

See [Custom opponent skills](custom-ai-skills.md) for the complete field contract, allowed roles, numeric limits, editing/export instructions and save portability. The library stores up to 20 skills in the current browser, including when signed in. Export files to share or back them up. Commander Live uses human players only.

## Implementation and evidence

The core style definitions are in [ai.js](../src/modules/ai.js); deck profiling, role inference, signature policies and action evaluation are in [ai-v2.js](../src/modules/ai-v2.js). The schema and revision handling are in [ai-custom-styles.js](../src/modules/ai-custom-styles.js), and the workshop is in [ai-skill-ui.js](../src/modules/ai-skill-ui.js).

Regression coverage includes [different core combat and target decisions](../tests/ai-archetypes.test.mjs), [custom settings changing a real paid cast through the Stack](../tests/ai-custom-skills.test.mjs), and [human and AI controllers piloting an imported list](../tests/custom-deck-controller-pilot.test.mjs). These check implemented behavior; they are not a claim of tournament-level play or universal rules coverage.
