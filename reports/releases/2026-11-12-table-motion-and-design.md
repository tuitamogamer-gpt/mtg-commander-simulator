# Table motion and design — 12 November 2026

Based on `b3abef1`. Request: fix everything about animations and design, at premium quality. No list came with the request, so the game itself was examined:

- real four-player games played through the interface on a 1440×900 desktop and a 390×844 phone, recorded as video, with your seat answered by a bot either directly or through the interface, so every decision surface was shown;
- every change of the table (a tap, a land drop, a draw, a cast, a death, a hit, a dialog opening and closing) stepped through frame by frame from its animation timeline, and read at 2× scale;
- the animation code and every stylesheet rule that declares an animation or a transition.

## What was wrong

**The table cut from one state to the next.** The stylesheets hold 103 keyframe animations, most of them for events (hits, charges, board wipes, arrivals). But the arena is rebuilt on every render, so nothing on it could have a transition of its own:

- a tapped card was simply turned, a played land was simply in its column, a drawn card was simply in the hand;
- when a creature left, its lane had already closed the gap;
- an opponent's spell appeared in a window in the middle of the table, the decision panel appeared over the table's edge, and both vanished when the spell resolved;
- a dialog, the menu and a card sheet closed in one frame; a life total switched; the current step jumped.

The effects sat on a table that otherwise changed like a slide show, which is what made the motion feel unfinished rather than any single effect.

**Announcements each had a look of their own.**

- The turn announcement was a 173×41 px box with a star emoji in the middle of the table. An opponent's turn used the same box in the same place.
- A powerhouse entering play was a teal bar across the header's turn tracker with a cropped card. On a phone it covered the header and cut the name ("Gray Merc...").
- The card that arrived hopped three times.
- The spotlight line, the Monarch change and a table negotiation had square corners, gold, green and grey gradients of their own, the ♛ and dove glyphs of the platform's font, and copy of 8 to 10 px. The spotlight line cut out.
- Toasts stacked on each other and cut out.

**Design defects.**

- The opening hand was a 5 + 2 grid in a 760 px dialog on a 1440 px desktop.
- The large card preview followed the pointer, so it covered the row of cards you were reading along.
- The header's turn tracker moved with the title beside it: it stood at 242 px for "You · Main 1" and at 383 px for "AI Dragon · Combat first strike". On a 1280 px desktop that longest title left the step names 406 px of the 412 px they need, and "Main 1" broke in two.
- The loading dialog was not drawn as designed. Its panel rules (`#setup …`) were outranked by the veil's older ones (`#setup[data-app-view="home"] …`): the kicker's 9 px tracked style and centred text landed on the step names.
- The match's last screen was a 760 px dialog in 7 to 11 px type, under the 12 px minimum of DESIGN.md.
- A faint "SEAT 01" mark of an older layout ran under the last cards of each land column.
- Prompts, hints and toasts led with emoji, which every platform draws in its own colour font.
- The engine's zone-move effect took your commander to the lane head instead of its dock: its selectors (`.cmdzone`, `.commanderzone`) match nothing in the Command Table.
- On a phone, live combat's fade showed the playmat for a frame: a bright flash between two dark views.
- Setup steps and the deck spotlight cut in.

## Changes

### Table continuity (`src/modules/motion.js`, new)

Each render is compared with what the table showed just before it, and the difference is animated. `ui.js` calls `captureMotion` before the arena is committed and `playMotion` after the lanes are fitted.

- **In place.** A card still in its place travels from where it was drawn to where it is drawn now, and turns as it taps or untaps. A lane closes a gap by moving its cards. What the pointer adds to a card (a hover lift) is no change of the table: a redrawn card under the pointer is left to the stylesheet, as before.
- **From another place.** A card that was shown somewhere else flies from there: your hand card to the Stack or the table, a spell from where the Stack shows it to its place, your commander from and to its dock. The larger of the two is the picture that flies, so nothing is drawn enlarged. It lands in the pose of its destination: a land that enters tapped lands tapped. The real card appears under the copy as it lands; the copy then fades.
- **From a count.** A drawn card comes out of your library counter, an opponent's land or spell out of their hand counter, a commander out of the command-zone mark. Between two small places the card comes forward on the way, large enough to be recognised. A spell that resolved flies to its owner's graveyard or exile counter.
- **From nowhere.** A token is set down in its place.
- **Between renders.** A card can be shown nowhere for a render or two while a land drop is applied or a spell resolves. Where it was last shown is remembered for 1.1 s. A render during a flight replaces the card it flies to; the new node stays hidden until landing.
- **Leaving play.** The engine's zone-move effect already carries a card that leaves a battlefield; no second copy flies. That effect now takes your commander to its dock.
- **Phones.** The Stack is a tab there: a cast card flies into the tab and a resolved permanent comes out of it. Lands are counts per name ("Swamp 4/6"): a played land flies into its count, which is never hidden.
- **Numbers and chrome.** The current step wipes in from the side of the step before it. A zone count that changed nods. A life total rolls over: the old number leaves upward as a copy, the new one arrives from below in the colour of the change.
- **Surfaces.** A dialog that closes leaves an empty plate and its dim, which fade. The Stack's window leaves the same plate. On a desktop the decision panel opens over the table's edge and closes into its strip.
- **Views.** Another phone view or board, another focused opponent, Table/Focus or a resized window redraw the table somewhere else. Nothing travels then; the boards now shown come up with a short fade of their contents.
- **Drag and drop.** A card you dropped continues from where you let go.
- **Piles.** Equal permanents are drawn as one pile, as its first card. A card that takes the place of an equal one that just left did not arrive, and is left alone.

Flights live in a click-through, `aria-hidden` layer inside the arena, which the commit keeps (`arena-render.js`). A copy carries no card id, focus stop or control. Reduced motion (the system's or the game's), a hidden tab, a restored save, bot simulations and instant games keep the table still. Nothing in this module reads or changes game state, and no motion delays a decision.

Motion runs inside the arena's render, and a failure of the render is a recovery dialog over the table. Both entry points are guarded: a failure is reported once to the console, and the table does not move for that render.

Motion tokens in `design-system.css` gain an expressive ease-out, an exit ease, a travel ease and two durations; `motion.js` reads the same values.

### Announcements (`src/motion.css`, `ui.js`, `phone-table.js`)

- **Turn.** Words on a soft band, without a box and without the emoji: across the middle of the table for your turn, smaller and shorter on the player's own lane for an opponent's, so no seat is covered. One shows at a time.
- **Opening hand.** One row of seven on a desktop, dealt one after another.
- **Arrival.** A compact plate under the header with the whole card and its name on one line. A phone places it above the prompt with the other notices. The card that arrived is lit twice instead of hopping.
- **Spotlight, Monarch, negotiation.** Plates of the dialog material with the tone on the leading edge, the table's own icons and copy of 12 px or more. They come down into place and leave upward. On a phone a negotiation's action takes its own row.
- **Toasts.** One at a time; it rises in and fades.

### Design

- **Match end** (`renderGameOver`, `resolution-recap.css`). Headed by the winner's commander art; says Victory, Defeat or Match complete; lists the standing with commander portraits; reads at body size. It arrives in order: the art settles, the result is said, then the standing, row by row.
- **Card preview.** It belongs to its card and never covers the cards you are reading along. Cards in a row (a lane, your hand, the dock) show it above them, or below when there is no room above; cards in a column (lands and mana) and in the decision panel show it beside them. It grows out of its card when it appears.
- **Header.** The title beside the tracker has one width. When it does not fit, the player's name gives way, never the step. A step's name stays on one line.
- **Loading dialog.** Drawn as designed, on every screen.
- **Icons for emoji.** The mark that leads a prompt, hint or toast is the matching icon of the table's set (`MTG.iconizeLead`). The text is unchanged.
- **Setup.** A step comes up instead of cutting in, and the deck spotlight rises into place.
- **Phone combat.** The Combat view fades its contents, not its panel, so the playmat no longer flashes through.
- The "SEAT 01" mark is gone from the Command Table.

## Two mistakes of this round, found by its own checks

- **Life totals counted through the numbers between.** The first version wrote each number on the way into the page, so for up to 0.9 s the table showed a total that was never true. `tests/browser/arena-refresh.mjs` reads the total right after the render and failed on it. The roll-over replaced it: the number in the page is the new total at once.
- **A phone's turn made a whole board "arrive".** The first version read the table's layout from the UI's state. The command table's render has already set the focused opponent and the phone's board when it captures the table it is about to replace, so a change of focus never showed as a change of layout. A phone follows the active player to their board on every new turn; in one recorded phone game 56 cards were set down and some flew from a hand counter they never left. The layout is now read from the arena as it is drawn, and `table-motion.mjs` checks it.

## Verification

### Motion

- **New browser test `tests/browser/table-motion.mjs`**, 21 checks on a 1440×900 desktop and a 390×844 phone:
  - a tap turns the card from its last pose;
  - a land flies from the hand to its place, a drawn card from the library counter, an opponent's land from their hand counter, a spell to the Stack and from there to its owner's graveyard;
  - the flying copy is click-through, hidden from assistive technology and carries no card id, focus stop or control; the layer is removed afterwards;
  - a card that leaves play is carried once (by the engine's effect), and its lane closes the gap;
  - a life total is the new total the moment the table is drawn, on lane heads and phone seats;
  - a closed dialog leaves an empty plate and its dim, nothing of its content;
  - a redrawn card under the pointer is not treated as moved;
  - a failure inside motion (`Element.animate` made to throw) leaves the render whole: no recovery dialog, the card drawn tapped, one console report, and the next render moves again;
  - the in-app Reduced motion setting, the system preference and an instant game each keep the table still;
  - on the phone, a land flies into its count, a cast card into the Stack tab, and switching the view or following the turn to another board moves nothing;
  - the pending decision is the same object throughout;
  - the match's last screen shows the winner's commander art, four standings, 12 px or more, inside the screen.

  On `b3abef1` it stops at its first step.
- **Interface zoom.** At 1920×1080 (zoom 1.3) and 2560×1440 (zoom 1.55) a flight starts on its hand card and lands on its target within 2 px, the old life total leaves from the total's own box, and an opponent's turn is announced on the centre of their lane.
- **Cost of a render.** Forty renders that each tap or untap a creature, timed still, then moving, then still again; three runs on the final code.
  - Desktop, a board of 68 cards: 34.3 to 35.1 ms median moving, 33.0 to 34.4 ms still before it and 30.8 to 32.0 ms still after it. The motion pass costs 1 to 3 ms of a render.
  - Phone layout with the processor slowed four times, 36 cards: 141 to 148 ms moving, 113 to 135 ms still before it and 95 to 141 ms after it. Moving is the slower of the three in every run, by about a tenth; the still renders differ more from run to run than that.

  A render follows a game event, not a frame. The animations it starts change `transform`, `opacity` and `clip-path`; a life total also changes its colour.
- **Layers on a phone.** At device pixel ratio 3, measured on the final code as in the notes of 4 November (`LayerTree` over CDP): 21 layers and about 44 MB at rest; one render that draws a card, plays a land, taps three creatures, loses one and gains one holds 35 layers and about 55 MB for under a second. The wipe of 4 November peaks at 50 MB.
- **Real games on the final code**, four players, your seat answered by a bot through the interface, recorded as video: 21 turns on the desktop and 21 on the phone, no page error. The phone game's last 120 motions: 51 moves in place, 8 turns, 18 flights from an opponent's hand counter, 9 out of the Stack tab, 5 from your library, 1 from your hand, 1 commander from its dock, 10 set-downs. Before the layout was read from the arena, a phone game of 17 turns set 56 cards down.
- **Every animation of a third game** (desktop, 18 turns, 200 s, no page error) was recorded with the pose it starts from: 621 animations.
  - Cards on the table, 158: 86 moved 6 to 80 px as their lane re-fitted, 2 moved further, 10 moved 2 px or less, 32 turned or faded where they stood, 25 were held until their flight landed, 3 were set down.
  - 47 flights of three animations each (the path, the rise off the table and the fade), 97 step changes, 94 count nods, 30 plates of closed surfaces, 20 openings and closings of the decision panel, 3 life totals, 19 on hand cards.
  - The other 59 are the engine's own effects, dialog dims and lane fades.

### Suites

- **Browser suites.** Forty-eight suites were run on the final commit of the interface code (`53497bc`), two at a time, with nothing else on the machine: 46 passed. `resolution-recap-highlights` failed as it does on `b3abef1`, and `arena-backgrounds` was dealt an opening hand without a land. Both are described below.
- **Under load.** An earlier complete run shared the machine with the node tests. Three suites failed in it and pass when run alone: `live-combat` (it measures in real time that the charge lands with the damage), `arena-experience` and `commander-import-visuals` (a 30 s wait). They are timing checks, not changes of behaviour.
- **`card-art-edges`** had two faults of its own, both repaired:
  - It asked that an opponent's cards end above the land dock, which has been a column beside them since the Lands · Mana layout. It failed on `b3abef1`. It now asks that a card is clear of the header, the lane's bottom and the dock.
  - It raced with the interface. An answered decision queues one more render, and the test forced an image failure right after the answer; when the render came second it drew a fresh image. Running animations move that render to the next frame, and the race was lost two times in five. The test now waits for the queued render; six runs in a row pass.
- **`resolution-recap-highlights`** fails in two of its six scenarios (`yuriko-one`, `yuriko-zero`: "No native highlight"), exactly as on `b3abef1`. It was not touched.
- **`arena-backgrounds` and `player-experience`** each play one land from an opening hand they did not seed, and stop at `assert.ok(landName)` when the hand has none. Through the interface, 6 of 25 games on the new code were dealt no land and 1 of 22 on `b3abef1`. That is an unlikely run, so it was checked whether this work changes the deal. It does not:
  - the opening hand is a function of the seed alone, and the seed is `Math.floor(Math.random() * 1e9)`;
  - through the interface, seeds 158472725 and 156818565 deal the same seven cards without a land on `b3abef1` and on the new code, and 11081 the same hand with three;
  - dealt by the engine's own start code, 3,000 seeds give the same number of hands for every count of lands on both checkouts, 85 of them without a land;
  - that deal reproduces all 28 hands the interface dealt for the seeds it drew, and 6,000 seeds drawn by the browser give 169 hands without a land (2.8%; 38 lands in 99 cards give 2.9%).

  The run was chance. At 2.8% each suite stops there about once in thirty-five runs, on `b3abef1` as well. Both now pin the seed generation to 11081, as `player-gameplay` does; four runs of each pass.
- **Node tests**, on the final tree.
  - The 80 test files that read interface sources (`ui.js`, `main.js`, the stylesheets, `index.html`, the app's module lists): 1,066 of 1,068 tests pass. The two failures, `legacy-card-catalog-integrity` and `oracle-token-forms-source`, fail the same way on `b3abef1`.
  - Seven more files that read the documents, the packaging and the browser suites changed here (`frontend-overhaul`, `public-release`, `ios-package`, `deck-spotlight`, `local-card-images`, `startup-entry-choice`, `second-audit-browser-launcher`): 43 of 43 pass. `ios-package` was run with the bundle built (`npm run ios:bundle`), so that its check of the bundle's contents ran; the bundle holds `motion.js` and `motion.css`.
- Syntax check, `git diff --check` and the startup catalog check pass.

## Not changed, and not checked

- **Safari and a real phone.** Everything was run in Chromium, with phone emulation. The layer figures are Chromium's. An iPhone tab that runs out of graphics memory is closed by Safari (see the notes of 4 November); the flights add small layers for under a second, but that was not measured on a device.
- **The complete node suite** (870 files) was not run; the 87 files above are the ones that read what changed. No rules, AI, deck or server module was changed: the changes are in `ui.js`, `motion.js`, `action-effects.js`, `phone-table.js`, `arena-render.js`, `visuals.js` (one function), two lines that announce a turn in `main.js` and `multiplayer-arena.js`, one in setup, the stylesheets, and three browser suites (`card-art-edges`, `arena-backgrounds`, `player-experience`).
- **Live.** Host and guest pass `commander-live-launch`, `mass-wipe-live` and `live-combat`. A guest's table moves by the same module from the guest's own renders. What a guest cannot see (hands, libraries) has no place to fly from, so those cards are set down in place. Four-player Live was not run.
- **The existing effects** (damage numbers, the board wipe, the counterspell seal, keyword bursts, spell copies, persona reactions, the combat charge and the replay window) were stepped through frame by frame and left as they are. Their timings and easings are still written in their own rules, not in the tokens.
- **Older stylesheets** (`styles.css`, `client-v3.css`) still carry colours of their own for card badges and counters.
- **Drag and drop.** A dropped card starts from where you let go; `arena-drag-controls` passes, but no test checks where that flight starts.
- **The landing page** was read and left as it is.
