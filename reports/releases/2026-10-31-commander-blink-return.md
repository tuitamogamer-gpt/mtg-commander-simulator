# A blinked commander, kept in exile — 31 October 2026

Based on `0bd954b`, then `1bb8f47`. Reported from play: Chief Kyle, Transporter Tech exiled Commander Spock, the owner chose to keep Spock in exile, and Spock never came back.

## The cause: a bot's lookahead moved the real card

The game log in the second report ended the turn with "Resolving: Chief Kyle, Transporter Tech: return Commander Spock." and nothing after it. At the same time:

- the exile count was 0;
- the commander dock said "On battlefield";
- Spock was not on the battlefield.

A bot thinks ahead on a copy of the game. The copy is deep, but closures are not copied. The delayed return ("at the beginning of the next end step") is a closure that holds the real Spock and the real player. During the end step, a bot's lookahead resolved that return on its copy, and the closure moved the real Spock:

- out of the real exile;
- to zone "battlefield";
- onto the copy's battlefield.

When the real return resolved, Spock was no longer in exile, so it did nothing. Spock was left on no real battlefield, in no exile and outside the command zone. Replaying exactly this — the blink, then a cloned end step, then the real end step — produced the same state and the same log.

**Fix.** Inside a simulation, every live card or player that reaches a state-changing method now stands for the simulation's own copy:

- zone moves and putting a permanent onto the battlefield, including the controller, attachment and attack target named in a move;
- counters, life, damage and drawing;
- tapping, tokens, sacrifice, destruction, discard, mill, attachment and exile.

Nested lookaheads translate through each generation. A real game never translates. Simulation still runs a delayed return, but on its own copy of the card.

## The earlier report: what the prompts said

The first report, before the cause above was known, also showed a confusing follow-up. On return, Spock's "Strange new worlds" can put a land onto the battlefield. That land triggers Kyle again during the end step, with Spock as a legal target, and the prompt said only "Choose target". Choosing Spock exiles him until the next turn's end step. Those changes, from `1bb8f47`:

- **The target tray says what a trigger does.** A triggered ability's generic "Choose target" now shows its effect text; Kyle's reads "Exile up to one other creature you control; it returns at the beginning of the next end step".
- **End-step warning.** Inside the end step, a source that returns a card "at the beginning of the next end step" warns: "This is already the end step, so a card exiled now returns at the beginning of the next turn's end step, not this one."
- **The command-zone choice names the return.** It reads "Keep it in exile to let Chief Kyle, Transporter Tech return it at the beginning of the next end step. Choosing Command zone prevents that return." This covers every card that uses the shared delayed-return helper.
- **Bots keep the return.** A bot that blinked its own commander now keeps it in exile instead of sending it home.

## The Landing Party sweep

The Spock deck exiles its own permanents and brings them back, and the permanent is often the commander. Every such card in the deck was checked with Commander Spock as the target:

| Card | Where Spock waits | Before | After |
| --- | --- | --- | --- |
| Chief Kyle, Transporter Tech | exile | returns; choice named Kyle | unchanged |
| Balance of Terror, chapters II and III | exile | returns; choice named Balance of Terror | unchanged |
| Temporal Tribulation, cast or flashback | exile | the choice did not mention the return, and a bot sent Spock to the command zone | the choice names it; a bot keeps Spock and he returns |
| The Guardian of Forever | graveyard | the sacrifice is a cost, so the choice came before the ability resolved, without a reminder; a bot sent Spock home | the reminder is set when the cost is paid; a bot keeps Spock |
| S.S. Botany Bay | exile, linked to the ship | no reminder | names its conditional return ("when it deals combat damage to a player with eight or more charge counters"); bots do not wait on an uncertain return |

For every card, the tests check four things:

- a human who keeps Spock gets him back at the next end step, on the real battlefield;
- choosing the command zone gives up the return;
- a bot makes the choice itself and keeps the return;
- a bot thinking ahead does not move the real Spock.

Kyle inside the end step says "the next turn's end step", and that end step returns Spock.

The shared test helper for game-state invariants now also checks the reverse direction for commanders: a commander is in the collection of the zone it names. Without this, the limbo above passed every check.

## Verification

- **`tests/ai-simulation-closure-isolation.test.mjs`** (new) has two tests:
  - A cloned end step returns only the simulation's copy. The live Spock stays in exile, and the real end step then returns him with the usual log line.
  - Live cards and players passed to `gainLife`, `move` and `draw` inside a simulation change only the copies, also through a nested lookahead. A live game never translates.

  Both fail on `1bb8f47`.
- **`tests/star-trek-landing.test.mjs`** has four tests for the prompts and the bot choice. Three fail on `0bd954b`.
- **`tests/browser/phone-table-polish.mjs`** checks the end-step tray on a 390×844 phone: 11 of 11.
- **`tests/star-trek-landing-blinks.test.mjs`** (new) has 26 tests: the four checks for each card above, plus Kyle inside the end step and Botany Bay. Seven fail on `72b665a`; they cover the Temporal Tribulation and Guardian choices and bots, and Botany Bay.
- **Full games:** 12 four-player games with Landing Party, every seat a bot, with the invariant check, including the new commander check, at each turn boundary. There were no failures. In one traced game, Balance of Terror exiled Spock and returned him at the end step under the bot's choice; elsewhere Spock was removed and recast from the command zone.
- **Commander, precon and Star Trek suites with the stricter invariant:** 405 of 406. The one failure is the manual batch's provenance URL, which also fails without these changes.
- **All AI suites:** 768 of 768, including the existing isolation suites. They took 207 seconds, against 254 before the change.
- **A real game on a phone,** driven through the touch UI with Landing Party, with and without diplomacy: Kyle exiles Spock, the owner chooses Exile, the end step returns Spock, and he stays on the battlefield.
