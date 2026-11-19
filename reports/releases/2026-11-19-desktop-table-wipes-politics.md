# The desktop table, board wipes and Politics — 19 November 2026

Based on `a1ae2d4`. Four reports from a play test on a desktop:

- there is a lot of unused black space in the middle of the table;
- the Your turn announcement is stretched across the whole screen;
- Politics & Diplomacy is clunky and needs a redesign;
- a mass wipe is over at once: fourteen creatures die and it ends in what looks like a millisecond. It is an important event and needs an animation that can be followed, more drama, and sound.

## A board wipe ended at once

**What happened.** Measured on a 1440×900 table with twenty creatures, at the game's normal pace:

- The engine announced the wipe and moved every card in the same breath: `destroyMany` returned after 198 ms and the cards were off the table after 238 ms.
- The effect then ran over an empty table for 1.37 seconds: a dark storm with a large `✕`, `20 PERMANENTS`, and copies of sixteen of the twenty cards falling away together.
- A resolution that removes three or more permanents ends in a table highlight for every player. A single removal waits 900 ms for its hit before that highlight; a wipe did not wait, so the `Board wipe` dialog opened over the storm.
- A toughness wipe (Toxic Deluge) and a mass return to hand (Cyclonic Rift, Evacuation) had no wipe at all: each card got its own flight or removal effect, all of them at the same moment.

**Now the game waits and the table plays it** (`src/modules/engine.js`, `stageBoardWipe`; `src/modules/board-wipe.js`; `src/motion.css`). Three beats, on the cards themselves:

1. **Build-up.** A plate in the middle of the table: `BOARD WIPE · AI Dragon`, `Wrath of God`, `20 creatures`, the card's picture and one pip per card. A frame closes on every doomed card, in the order the cards will go.
2. **Impact.** A flash and two shockwaves from the middle of the table, and the table shakes once. The plate steps under the header.
3. **The cards go one after another**, board by board, row by row, left to right. Each takes the hit of a single removal in its colour: the blade for destroyed and died, the closing ring for exile, the rising streak for a return to hand. The plate counts (`7 of 20 creatures destroyed`), a pip goes out per card, and when a board's last card has gone the board shows its loss (`−4`) where its cards stood.

Then the cards leave the battlefield together, the plate says the result with each player's loss (`AI Dragon 4 · AI Wolf 4 · AI Raven 4 · You 8`), and the highlight follows.

The same twenty creatures, measured again: the plate at 33 ms, the frames closing between 0.15 and 0.64 s, the impact at 1.02 s, the first card 0.22 s after it and the last 1.86 s after it, the cards off the table at 3.61 s, the engine going on at 4.66 s. By the plan, fourteen or twenty creatures stand for 3.3 seconds before they leave and three for 2.0; at the Fast pace fourteen take 2.0 seconds, at Slow 4.7.

**How it is built.**

- The engine waits as it does for a charge before combat damage. It announces the wipe with its beats (`MTG.boardWipeTiming`: real milliseconds for the number of cards and the game speed), waits for the build-up, says the impact, waits for the cascade, moves the cards, says how many really left and waits a moment for the result. Slow is not four times as long and Fast still reads. These waits are presentation: an unpaced game (tests, bot simulations), an instant game and a restored save pass through at once and show one plate that says what happened. No rule changed.
- The cards are still on the battlefield while the wipe plays, so nothing is cloned. The real cards are marked and fade where they stand; frames, hits and sparks are small elements in the effect layer. The arena is rebuilt on every render: a card drawn again takes over the state of the one it replaces.
- When each card goes is an animation delay from the impact, not a timer per card. The first version used timers, and a busy frame bunched four cards together. The delays are also set to start at the impact itself, because a browser starts an animation only when it is ready to draw it; on a busy page the cards went that much late and the last ones were still fading when the engine moved them.
- A pile of equal permanents is one picture and goes as one. Cards that are not in view (a phone shows one board) follow as one silent step per player, so the count and each player's loss stay true.
- State-based actions now find a toughness wipe: three or more creatures that shrink to nothing together while a spell or ability resolves. The same deaths with nothing resolving, combat deaths and a player returning their own cards keep their ordinary effects.
- Live guests receive the cards, the kind and the beats with the event (`multiplayer-arena.js`); before, a guest's storm said `0 PERMANENTS`.

**Sound** (`src/modules/game-audio.js`, `scripts/generate-wipe-sfx.py`). One sound for each beat: a rising charge (1.04 s), one weighted impact with a rolling tail (1.99 s), and a short break (0.27 s) for each card, at the table's own times and falling in pitch as the board empties, at most eighteen for any board. The breaks are one voice of the three-voice mixer; the impact retires the charge. An unstaged wipe keeps the single burst. The three files are original deterministic synthesis by the project's generator and pass the pack's checks for loudness, peak, spectrum and tail. The spoken comment (`The battlefield has changed`) still follows a wipe of five or more when narration is on.

**Phones.** The same beats, with the plate under the seats from the start, a flash and one shockwave of a card's reach, and no veil, sparks, per-card flash or camera. Measured at device pixel ratio 3 on a 390×844 phone (`LayerTree` over CDP, drawing layers × 36 bytes per CSS pixel):

| | Layers | Approx. memory |
| --- | ---: | ---: |
| At rest | 21 | 44 MB |
| Build-up | 26 | 50 MB |
| Impact and cascade (eight cards of the visible board) | 47 | 65 MB |
| Result | 26 | 54 MB |
| First version, with a veil and a flash across the screen | 52 | 90 MB |

What remains is one layer per waiting card and one for their board, because the cards fade in place.

**Reduced motion.** The plate, a still outline on what is leaving, and the cards gone in the same order, with nothing that moves.

## Your turn was a strip across the screen

The two words stood on a dark strip from one edge of the screen to the other, with a hairline above and below: on a 1920×1080 desktop it covered a row of every board. They now stand in the middle of the table on a glow of their own width, about a third of the screen (`src/motion.css`). A phone, as wide as the words, keeps its strip.

## Politics & Diplomacy, redesigned

**What was clunky.** The drawer repeated its title in a box under its own head, then a disclosure, a dashed box that said there were no agreements, and a boxed row per player with a letter-spaced `Make offer` button. The offer dialog stacked a paragraph, three tall tiles, a hint, two boxed fields, a boxed contract, a boxed status and a boxed warning. The review that pauses the game explained the pause in a paragraph, listed `TERM 1 ·` and `TERM 2 ·` in large type, and ended in a button as wide as the dialog.

**Now** (`src/modules/ui.js`, `src/politics-experience.css`), one language for the three surfaces:

- Players are faces: their commander's art, which is public.
- **The drawer** is ordered by need: whether negotiations are open (or how far the lock is), what waits for your answer, the players, the agreements in force, a table deal or last stand when there is one, what happened recently, and the rules behind `How deals work`. It groups with spacing, headings and hairlines; only an offer that waits for an answer is a raised card, with `You get` and `You give`, the reciprocity check, the bot's reason, then Accept and Decline. Each player is a row with a face, a standing and one `Offer deal` button.
- **The offer dialog**: both faces and `Offer AI Wolf a deal`; starting points as chips, and the chosen one says what it does; two plain one-line fields; the deal in words, headed by who promises what; one line that says whether it can be sent; a foot with one sentence of what sending means, then Cancel and Send offer.
- **The review**: its title says what happened (`AI Wolf accepted your offer`), both players as chips, each term headed by the player who promises it, the result, and a foot with `The game waits until you press Proceed` and the button.
- The header's chip says `POLITICS` and a state. Opening the drawer removes the negotiation notice, which would only cover it.

Proposals, contracts, the bots' evaluation and every callback are unchanged, and so are the hooks the suites use.

## The middle of the table was empty

**What happened.** A desktop board drew its cards at the size at which two rows of a crowded board fit: 52 px wide in a 728×256 lane on a 1920×1080 screen (67 real pixels at the page's zoom). A board with four creatures drew them at that size too, in the top left corner of its lane, and the rest of the panel was dark.

**Now each board takes the largest card size at which nothing of it scrolls** (`src/modules/command-table.js`, `fitBoardCards`), up to 124 px wide and never less than the stylesheet's size:

- four creatures are 117 px wide on that screen (113 px at 1440×900): a row of readable cards across the lane;
- twelve permanents keep about their size, and a board that has to scroll is drawn exactly as before;
- no lane changes its box, and lands keep their size;
- the size is measured only when the room or the board's contents change (13 ms for four boards, nothing on other renders), and the table's motion carries a card from one size to the next like any other move.

**An empty board** says so in the middle of its lane, under the dashed outline of a card; the label stood in the lane's top left corner. An opponent with lands and nothing else had no label at all and shows the outline alone (`src/arena-experience.css`).

## Verification

**New and changed tests.**

- `tests/board-wipe-staging.test.mjs` (new, 13 tests): the beats for 3, 20 and 60 cards and for each game speed; a paced destroy-all waits twice with every card on the battlefield, then once with them gone, and announces no card a second time; an unpaced game says the same and does not wait; two removals are not a wipe; exile and a mass return in their own kinds; a player's own return and a return with nothing resolving are not wipes; a toughness wipe is one staged wipe, and is not one with nothing resolving; a damage wipe; the three sounds, the times and pitches of the breaks, the breaks as one voice of the mixer, and silence when muted, replayed or simulated.
- `tests/browser/board-wipe.mjs` (new, 5 checks): on a desktop at the normal pace, the plate, a frame on every card and no card copy while all twenty creatures are on the battlefield; board order; the impact; each card's turn one step after the one before and never counted before its turn; the cards leaving only after the cascade with no decision opened over it; each board's loss; the final zones. Then exile, a mass return and a toughness wipe, an instant game, reduced motion and a phone.
- `tests/browser/desktop-board-fit.mjs` (new, 9 checks): at 1440 and 1920 px, boards with four creatures grow at least one and a half times and fill at least 70% of the lane's height; a crowded board is not drawn smaller; no lane's box changes; ten creatures step down a size and still fit; a board that has to scroll keeps the stylesheet's size; the empty board's label and outline; the pending decision is the same object; a phone is not fitted.
- `tests/browser/diplomacy-options.mjs`: besides what it checked, the composer's faces, title, chips, fields and foot, the review's title, chips, term heads and Proceed, and the drawer's order, rows, button sizes and text sizes, at 1440, 390 and 320 px.
- `tests/browser/phone-memory.mjs`: a staged wipe on a phone draws no card copy, no part as large as the screen, nothing blurred or blended, no sparks, no camera shake; a desktop keeps the full wipe; a restored table still draws nothing.
- `tests/browser/table-motion.mjs`: your turn's announcement is centred and takes between a quarter and 60% of the screen's width.

**Node tests.** 206 test files that load the interface, the audio, Live publishing, the documents and stylesheets, or name a wipe, a removal or their events: 6,119 tests, 6,116 pass, one is skipped and two fail.

- Both failures are on the released commit `a1ae2d4` too, run in a separate checkout for this comparison, and are not repaired here: `planeswalker-combat` compares the decks that hold planeswalkers with a list that lacks the decks added since, and `save-state` (`a snapshot is refused while anything unsaveable is in play`) stops at `an unsupported exile play condition` before it reaches its own probe.
- The complete suite was started first and stopped after 35 minutes, at 147 of its 870 files (2,744 tests, none failing): it would have taken about three hours on this machine. The 52-minute `oracle-bulk-interactions` proof was left out, as before.
- After the last change to the code (the result is read a little longer and the plate leaves before the highlight opens), the seven files that read the wipe's events ran again: 115 tests, none failing. `npm run check`, `node scripts/build-startup-catalog.mjs --check`, `git diff --check`, the iOS bundle and `npm run ios:test` pass.

**Browser suites.** 61 of the 148 ran in two lanes beside the node run: the interface suites, the three new or changed ones, and every suite that mentions removal, highlights, effects, combat on the table, the phone's views, Politics, audio or Live rooms. All 61 pass; three did not the first time:

- `board-wipe` (new) failed twice while it was written, both times in how it measured: it counted the steps it saw, which depends on how many frames a busy machine draws. It now checks each card's turn against the plan and that no card is counted before its turn.
- `live-combat` measured where a charging copy stops against a fixed 70 px; with a board's cards drawn larger the copy stops 72 px from its blocker's centre, at the same leading edge. The suite allows half a card.
- `commander-live-four-player` ran out of the fifteen minutes it was given beside three other test processes, with fourteen of its checks passed and none failed. Alone it passes in ten minutes (17 checks).
- After the last change to the code, five ran alone again and pass: `board-wipe`, `phone-memory`, `resolution-recap`, `resolution-recap-highlights` and `mass-wipe-restored`.

**Real games.**

- One four-player Solo game through the interface on a 1440×900 desktop, every seat played by a bot, at the Fast pace for five minutes: 30 turns, 3,252 events, 392 renders, boards fitted 1,056 times (up to the 124 px limit), no page error. No wipe happened in it.
- Five wipe spells cast and paid through the engine's own cast path at the Normal pace, with seven creatures on two boards: Wrath of God, Damnation, Blasphemous Act, Evacuation and Toxic Deluge (X = 4, which a 6/6 survived). Each was staged in its kind, with its own words (`MASS RETURN · You`, `Evacuation`, `7 creatures returned to hand`, `Opponent 4 · You 3`). The cards left about two seconds after the impact and the highlight opened about 1.2 seconds after that, with the plate gone.
- One wipe of sixteen creatures in a real Solo game with sound on: the mixer played the charge, then the impact with sixteen breaks, then the spoken comment; the pending decision was the same object before and after.
- The frames stand on their cards at the page's three zoom steps (1440, 1920 and 2560 px wide: within 3 px in the suite at 1440, exactly at the other two), and at 1920 each board's loss stood on its own board.

**Not verified.**

- The three new sounds were measured, not heard: this environment has no audio output. Their loudness, peak, spectrum and tail pass the pack's checks, and their envelopes are what was written (a rise over a second, a hit that falls over two, a quarter-second break).
- No iPhone was at hand: the phone's layers were measured in Chromium at device pixel ratio 3.
- A Live guest's wipe was not looked at in a real room. `mass-wipe-live` passes, but it runs unpaced, so it covers the single plate and not the staged beats over the network. A guest receives each event up to a fifth of a second after the host.
- A mass sacrifice (each player sacrifices every creature) is still one removal effect per card, all at once.
- The other 87 browser suites (deck lists, imports, accounts, card sets) and the rest of the node suite did not run in this round.
