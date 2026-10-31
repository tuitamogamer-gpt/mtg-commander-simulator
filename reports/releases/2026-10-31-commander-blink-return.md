# A blinked commander, kept in exile — 31 October 2026

Based on `0bd954b`. Reported from play: Chief Kyle, Transporter Tech exiled Commander Spock, the owner chose to keep Spock in exile, and Spock did not seem to come back at the end step.

## What happened

The return works. In the engine and in a real game on a phone, the steps are:

1. A land enters and Kyle's landfall trigger exiles Spock.
2. The owner keeps Spock in exile instead of moving it to the command zone.
3. At the beginning of the end step, Spock comes back.

What follows explains the report. Spock's "Strange new worlds" triggers when he enters. It reveals the top card of the library and can put a land onto the battlefield. That land is a new landfall, so Kyle triggers again during the end step, with Spock as a legal target.

That second prompt looked exactly like the first one, "Chief Kyle, Transporter Tech — Choose target", and gave no reason to decline. Choosing Spock exiles him again. That return comes only at the next end step, which from inside the end step is the end step of the next player's turn.

## What changed

- **The target tray says what the choice does.** A triggered ability's generic "Choose target" now shows its effect text. For Kyle that reads "Exile up to one other creature you control; it returns at the beginning of the next end step". Kyle's trigger text, which also appears on the Stack and in the log, now says that instead of "Blink up to one other creature you control".
- **An end-step warning.** If the source's text returns a card "at the beginning of the next end step" and it is already the end step, the tray adds: "This is already the end step, so a card exiled now returns at the beginning of the next turn's end step, not this one."
- **The command-zone choice names the return.** When a blink will return an exiled commander, the choice reads "Keep it in exile to let Chief Kyle, Transporter Tech return it at the beginning of the next end step. Choosing Command zone prevents that return." Inside the end step it says "the next turn's end step". This covers every card that uses the shared delayed-return helper. Graveyard returns such as Gift of Immortality already had this reminder.
- **Bots keep the return.** A bot that blinked its own commander used to send it to the command zone, losing the free return and adding tax to the next cast. Both bot implementations now keep it where the pending return will bring it back. An exiled commander with nothing pending still goes home.

## Verification

- **`tests/star-trek-landing.test.mjs` has four new tests:**
  - A commander kept in exile returns at the end step. The choice names Kyle and the timing and carries the pending-return hint, and the target question carries the new effect text.
  - Exiled during the end step, the choice says "the next turn's end step".
  - Choosing the command zone ends the return.
  - A bot keeps the blinked commander in exile and it returns. The legacy chooser keeps a pending return and still sends a commander home when nothing will return it.

  Three of the four fail on `0bd954b`; the command-zone test passes on both revisions.
- **`tests/browser/phone-table-polish.mjs`** has a new check: on a 390×844 phone during the end step, the Kyle tray shows the effect text and the timing warning, and "Choose no targets" answers with no target. 11 of 11 checks pass.
- **A real game on a phone**, driven through the touch UI with Landing Party: Kyle exiles Spock, the owner chooses Exile, and the end step returns Spock. Spock reveals a Forest, Kyle triggers again with the warning, and the owner chooses no targets. Spock stays on the battlefield and is shown there in the following turns.
- **Node suites:**
  - All AI suites: 766 of 766.
  - Star Trek, commander, Gift of Immortality, final-rules, zone-audit, Counter Intelligence and CLB/40K suites: 417 of 419. Two fail the same way without these changes, in data byte-equivalence and the manual batch's provenance URL.
- **Browser suites:** `target-choice-guidance`, `emet-selch-removal`, `gift-of-immortality` and `commander-dock` pass.
