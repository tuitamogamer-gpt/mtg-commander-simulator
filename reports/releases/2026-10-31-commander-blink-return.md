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

## Verification

- **`tests/ai-simulation-closure-isolation.test.mjs`** (new) has two tests:
  - A cloned end step returns only the simulation's copy. The live Spock stays in exile, and the real end step then returns him with the usual log line.
  - Live cards and players passed to `gainLife`, `move` and `draw` inside a simulation change only the copies, also through a nested lookahead. A live game never translates.

  Both fail on `1bb8f47`.
- **`tests/star-trek-landing.test.mjs`** has four tests for the prompts and the bot choice. Three fail on `0bd954b`.
- **`tests/browser/phone-table-polish.mjs`** checks the end-step tray on a 390×844 phone: 11 of 11.
- **All AI suites:** 768 of 768, including the existing isolation suites. They took 207 seconds, against 254 before the change.
- **A real game on a phone,** driven through the touch UI with Landing Party, with and without diplomacy: Kyle exiles Spock, the owner chooses Exile, the end step returns Spock, and he stays on the battlefield.
