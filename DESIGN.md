# Commander UI design contract

## Product promise

The interface should feel like a calm Commander war room: dark, tactile and information-rich, without hiding legal actions or asking the player to decode decoration. The rules engine remains authoritative. Presentation may summarize only public state and must never expose another player's hand, library order or private choice.

## Interaction hierarchy

Every event belongs to exactly one level:

1. **NOW** — a legal decision, required response or hard pause. One blocking surface at a time, with a visible primary action.
2. **REVIEW** — a spell, ability, combat result or public deal the human must acknowledge. One review with one `Proceed` path. Spell responses use the decision rail; required reveals, combat and public-deal reviews use their named dialog.
3. **ACTIVITY** — passive state changes and AI actions. These go to the public timeline and log; short notices may appear, but never form a wall over the battlefield.

Stack review, Diplomacy hard pauses and explicit `Proceed` checkpoints are never demoted to passive notifications.

## Surfaces and depth

Use only three surface levels:

- **Table**: background and battlefield.
- **Panel**: setup cards, lanes, HUD and utility drawers.
- **Dialog**: the active decision, sheet or fatal recovery surface.

Avoid panels inside panels when spacing, a divider or a label can express the same grouping. Borders describe structure; shadows describe elevation. A component should rarely need both.

## Type and color

- `Bricolage Grotesque` (variable: optical size, width, weight) carries product, deck and card-display titles and, at 88% width, the short uppercase labels.
- `Manrope` carries reading text and controls.
- `JetBrains Mono` with tabular figures carries every number that changes during play: life totals, power/toughness, counts. A number inside a sentence ("You · 26 life") keeps the sentence's face, with tabular figures.
- Body copy is at least 12px on compact screens and 13px when space allows.
- Muted text must remain readable on the table. Never use low contrast as the only signal for disabled, selected or dangerous state.
- Brass marks the human's current path; green marks valid progress/sync; red is reserved for danger, failure and destructive actions.

### Palette (obsidian & ember, refreshed 2026-10-17)

- Every colour comes from `src/design-system.css`; stylesheets never hard-code the accent or the base. `--ds-table`, `--ds-panel`, `--ds-panel-raised` and `--ds-dialog` are one cool blue-black material; `--ds-accent` (ember `#e07a4a`), `--ds-accent-bright` and `--ds-accent-soft` are the only warm colours, with `--ds-*-rgb` triplets for tints. `--ds-brass` and `--ds-brass-bright` remain as aliases of the accent for older rules.
- Surfaces: a fixed soft-light grain (`body::after`), radial ambient light in the accent hue, hairlines at 7–9% white, tinted shadows (`rgba(2, 6, 12, …)`), never pure black.
- Interaction: every control lifts 1px on hover, presses to 98.5% on `:active`, and shows a two-ring focus (outline plus accent halo). Reduced motion removes the lifts.

### Symbols and marks (2026-11-14)

- **A rules symbol is drawn, never printed as braces.** `{T}`, `{2}`, `{B}`, `{W/U}` in a card sheet, on an ability's button, in a prompt, a toast or the log are the glyphs of the local mana set (`assets/mana`); a number or a letter without a picture sits in a disc of the same size. `MTG.symbolizeTextNode` (`visuals.js`) does it for one text node. `MTG.localizeTree` calls it, so a render is complete before `commitArenaRender` compares it with the table, and one observer covers the surfaces that assign their markup directly.
- **The characters stay in the page.** A symbol is `<span class="tsym"><span class="tsymraw">{T}</span>glyph</span>`: the glyph is hidden from assistive technology, `.tsymraw` is clipped and not removed. Text content, a copy, a screen reader and a test read what the card says. Form fields, code and anything under `[data-raw-symbols]` are left as typed.
- **A mark is an icon of the table's set, not a platform emoji.** Labels and scripts write ⚙️, ⚔️, 🛡️, 🌙, ⏸️, 👁, 🔗 and others. Shown, each is the matching symbol of `assets/icons/game-ui.svg` in the colour of its text. A new mark needs three things: a `<symbol id="icon-NAME">` (24×24, strokes only), its name in `ICONS`, and a row in `MARKS`. An emoji without a row is shown as typed.
- In the 9px badges on a card a mark takes the stroke weight of the keyword icons.

### Wording

- A control says where it leads, in words and not in a parenthesis: `Continue to combat`, `Continue to next phase`, `End turn`. The button that advances a main phase keeps `Continue` as its first word; guides and automated players find it by that word.
- Prompts say `choose`, `select` and `press`, which fit a finger and a mouse; `tap` is a word of the game. A text that still says `click` is reworded for a finger on a touch device (`phone-table.js`).
- A count is stated once: `25 cards`, or `3 of 25 cards` when a filter hides some. An empty zone shows no count.
- A rank is a number in a disc and a column is headed by what it stands for (the commander's art over its damage column), not by a medal or four letters of a name.

### Card sheet actions

- What can be done now is a button in the accent tint. `Close` stays neutral and comes last.
- What cannot be done now is a quiet row: the ability's own text, then its state (`UNAVAILABLE NOW`) as a small label. It is not a disabled block, and contrast is not the only thing that says so.

## Motion

Motion explains entry, focus or state change. It does not run as ambient decoration during repeated AI renders. Honor the operating-system reduced-motion preference and the in-app `Reduced motion` setting. Cinematic commander entry always has a visible `Skip` control.

Durations and easings are tokens in `design-system.css`: things arrive decelerating (`--ds-ease`, `--ds-ease-out`), leave accelerating (`--ds-ease-in`) and travel between two places with `--ds-ease-travel`; the spring is for small confirmations. `--ds-t-fast` (140 ms), `--ds-t-base` (220 ms) and `--ds-t-slow` (360 ms) time surfaces, `--ds-t-travel` (440 ms) a flight. `motion.js` reads the same values.

### Table continuity

The arena is rebuilt on every render, so nothing on it has a transition of its own. `motion.js` compares each render with what the table showed just before it (`captureMotion` before the commit, `playMotion` after the lanes are fitted) and animates the difference:

- A card still in its place travels from where it was drawn to where it is drawn now, and turns as it taps or untaps.
- A card that was shown somewhere else flies from there. The places are a permanent (`b`), a card in your hand (`h`), a spell where the Stack shows it (`s`, marked `data-stack-iid`) and your commander in its dock (`c`). The larger of the two is the picture that flies, so nothing is drawn enlarged, and it lands in the pose of its destination: a land that enters tapped lands tapped. The real card appears under the copy as it lands; the copy then fades.
- A card from a zone the table shows as a count flies from that player's counter: a drawn card from your library, an opponent's land or spell from their hand, a commander from the command-zone mark. Between two small places the card comes forward on the way, large enough to be recognised. A spell that resolved flies to its owner's graveyard or exile counter.
- A card with no place to come from, such as a token, is set down in its place.
- A card can be shown nowhere for a render or two (a land drop being applied, a spell resolving). Where it was last shown is remembered for 1.1 s, so its next appearance still starts there.
- A card that leaves a battlefield is carried by the engine's zone-move effect (`ui.js`, `showZoneMoveEffect`); `motion.js` draws no second copy. That effect takes your commander to its dock.
- On a phone the Stack is a tab: a cast card flies into the tab and a resolved permanent comes out of it. Lands are counts per name there; a played land flies into its count (`data-land-iids`), which is never hidden.
- The header's current step wipes in from the side of the step before it. A zone count that changed nods. A life total rolls over: the old number leaves upward as a copy and the new one arrives from below in the colour of the change. The number in the page is the true one at every moment; a transition never writes a number between two totals into it.
- A dialog that closes leaves an empty plate and its dim, which fade; they carry no content and none of the dialog's class names. The Stack's window leaves the same plate. On a desktop the decision panel opens over the table's edge and closes into its strip; a phone keeps the panel in place, so nothing plays there.

- A card you dragged and dropped continues from where you let go, not from its place in your hand (`MTG.noteCardDrop`).

Flights live in a click-through, `aria-hidden` layer inside the arena (`.motionlayer`), which the commit keeps (`arena-render.js`), so a copy is drawn by the same rules as the card it copies. A copy carries no card id, focus stop or control. A render during a flight replaces the card it flies to; the new node stays hidden until landing.

Another phone view or board, another focused opponent, Table/Focus, another hand size or a resized window redraw the table somewhere else: nothing travels then, and the boards now shown come up with a short fade of their contents. That layout is read from the arena as it is drawn (`layoutKey`), never from the UI's state, which a render has already changed when it captures the table it is about to replace. A phone follows the active player to their board on every new turn; read from the state, every card of that board "arrived". A fade of this kind fades a surface's contents, not the surface: a transparent lane or Combat view shows the playmat behind it, a bright flash between two dark views.

Reduced motion (either preference), a hidden tab, a restored save, bot simulations and instant games keep the table still. Motion is decoration and runs inside the arena's render, whose own failure is a recovery dialog over the table: `captureMotion` and `playMotion` are guarded, a failure is reported once to the console, and the table does not move for that render. Equal permanents are drawn as one pile, as its first card; a card that takes the place of an equal one that just left did not arrive and is left alone. `MTG.motionLog` records what moved and from where; `tests/browser/table-motion.mjs` reads it. On a phone at device pixel ratio 3, a render that moves eight cards holds 35 layers and about 55 MB for under a second, against 21 layers and 44 MB at rest (measured as in the notes of 4 November: `LayerTree` over CDP); a render takes as long with the table moving as still.

### Announcements

- The turn announcement is words on a soft glow, without a box: in the middle of the table for your turn, smaller and shorter on the player's own lane for an opponent's, so no seat is covered. The glow is as wide as the words and their two rules. On a desktop it does not cross the screen: a strip from edge to edge covered a row of every board to say two words. A phone, as wide as the words, keeps its strip. One shows at a time.
- The opening hand is one row of seven on a desktop and is dealt one after another; a dialog that is only redrawn keeps its cards still.
- A powerhouse's arrival is a compact plate under the header with the whole card, its name on one line and Skip beside it; a phone places it above the prompt with the other notices (`phone-table.js`). The card that arrived is lit twice, not bounced: how it comes to its place is the table's own motion. The commander's cinematic keeps its frame.
- The spotlight line ("a bot did something aimed at you"), the Monarch change and a table negotiation are plates of the dialog material with the tone on the leading edge, the table's own icons and copy of 12 px or more. They come down into place and leave upward; none cuts out. On a phone a negotiation's action takes its own row.
- One toast shows at a time; it rises in and fades before it is removed.

### Removal (2026-11-17)

- A spell or ability that takes another player's card off the battlefield marks it first, whoever cast it and whoever owned the card: a beam from the one who did it (its source if that is a permanent on screen, otherwise its controller's seat), a frame that closes on the card, the hit, and a plate with the verb, the card and the source (`DESTROYED · Riders of Gavony · Murder · AI Dragon`). The card takes the hit where it stands and its lane closes the gap when it leaves, not under it.
- Three hits, three colours: a blade in the danger red for a card that was destroyed, sacrificed or died; a ring that closes, in violet, for exile; a rising streak in the spell blue for a card returned to hand, library or command zone.
- With the card out of view (a phone on another view) the plate comes to the upper part of the screen with the card's picture, and the hit lands on the picture.
- The engine names the cause with the move: the resolving source, its controller, and whether the card was destroyed or sacrificed (`engine.js`, `move`). What a player's own effect does to their own card (a bounce land's return), a cost paid with nothing resolving, a Treasure or Clue spent on the way, combat and a state-based death outside a resolution leave as before, with the zone's label.
- The parts are the size of a card: no screen-wide layer and no blur, for a phone's memory. Reduced motion keeps the plate and drops the beam and the hit.
- A removal of another player's nontoken permanent is also a table highlight for every player at the table, the one who cast it included: its headline is the verb (`Destroyed`, `Sacrificed`, `Returned to hand`, `Into exile`), its row names the card and its way. The highlight waits for the hit. Three or more removals are a board wipe (below).

### Board wipe (2026-11-19)

Three or more permanents leaving at once are the largest moment on the table. It is played in three beats on the cards themselves, and the game waits for it (`board-wipe.js`, `engine.js` `stageBoardWipe`):

1. **Build-up.** A plate in the middle of the table says what is happening, who did it and how many cards: `BOARD WIPE · AI Dragon`, `Wrath of God`, `14 creatures`, with one pip per card. A frame closes on every doomed card, in the order the cards will go.
2. **Impact.** A flash and a shockwave from the middle of the table; a desktop shakes once. The plate steps under the header, out of the way of the cards.
3. **The cards go one after another**, board by board, row by row, left to right. Each takes the hit of a single removal in its colour: the blade (destroyed, died, damage), the closing ring (exile), the rising streak (returned to hand). The plate counts them (`7 of 14 creatures destroyed`) and a pip goes out per card. When a board's last card has gone, the board shows its loss (`−4`) where its cards stood.

Then the cards leave the battlefield together, the plate says the result with each player's loss (`You 5 · AI Dragon 4 · AI Wolf 3 · AI Raven 2`), and the highlight follows.

- **The engine waits, as it does for a charge.** `stageBoardWipe` announces the wipe with its beats (`MTG.boardWipeTiming`: real milliseconds for the card count and the game speed), waits for the build-up, says the impact, waits for the cascade, moves the cards, says how many really left, and waits a moment for the result to be read. At Normal speed fourteen cards stand for 3.3 seconds before they leave and three for 2.0 (Fast: 2.0 for fourteen; Slow: 4.7, not four times Normal), and the result is read for about a second before the game goes on; the plate leaves before that wait ends, so the highlight opens on a clear table. The waits are presentation: an unpaced game (tests, bot simulations), an instant game and a restored save pass through at once, with a single plate that says what happened.
- **What is a wipe.** Destroy-all, exile-all, a mass return to hand by another player's effect (Cyclonic Rift, Evacuation), creatures that one source damaged lethally, and creatures that shrink to nothing together while a spell or ability resolves (Toxic Deluge). The last two are found by state-based actions. A player returning their own cards, a cost, combat deaths and the same deaths with nothing resolving keep their ordinary effects. A mass sacrifice is still one removal per card.
- **Nothing is cloned.** The cards are still on the battlefield while the wipe plays, so the real cards are marked and fade where they stand; the frames, hits and sparks are small elements in the effect layer. The arena is rebuilt on every render: a card drawn again takes over the state of the one it replaces, and its frame follows it.
- **When each card goes is an animation delay**, set once at the impact, not a timer per card: a busy frame cannot bunch several cards together. Script keeps the words in step by the same clock (the frame's, `document.timeline`).
- **A pile is one picture** and goes as one; the count rises by its cards. Cards that are not in view (another phone view, a board that is not shown) follow as one silent step per player, so the count and each player's loss stay true.
- **Phones**: the same beats, with the plate under the seats from the start, a flash and one shockwave of a card's reach around the middle of the table, and no veil, sparks, per-card flash or camera. No blur, no blend mode, no copy of a card, and no part as large as the screen (`tests/browser/phone-memory.mjs`). Measured at device pixel ratio 3 (`LayerTree` over CDP, drawing layers × 36 bytes per CSS pixel): 21 layers and 44 MB at rest, 26 and 50 MB in the build-up, 47 and 65 MB while eight cards of the visible board go, 54 MB for the result. With a veil and a flash across the screen and a wide shockwave it was 90 MB. What remains is one layer per waiting card and one for their board, because the cards fade in place.
- **Reduced motion**: the plate, a still outline on what is leaving, and the cards gone in the same order, with nothing that moves.
- **Sound**: one for each beat (`game-audio.js`): a rising charge, one weighted impact, and a short break per card at the table's own times, falling in pitch as the board empties. The breaks are one voice of the mixer however many they are. An unstaged wipe keeps the single burst.
- **Live**: the host's engine waits; guests receive the cards, the kind and the beats with the event and play the same wipe.

### Setup and header

- A setup step (Deck, Pod, Review) comes up instead of cutting in: its grid fades and its title rises. The grid only fades, because a transform on it would move the fixed and sticky bars inside it for the length of the animation. The deck spotlight rises into place; on a phone, where it fills the screen, it fades.
- The header's turn tracker keeps its place. The title beside it has one width; when it does not fit, the player's name gives way, never the step. A step's name stays on one line.

Phones have a small graphics memory budget, and an iPhone tab that runs out is closed by Safari. At device pixel ratio 3, measure an effect's layers (Chrome DevTools: Layers, or `LayerTree` over CDP) before adding it. Rules that follow from it:
- On phones, avoid large blurred elements, `backdrop-filter` on full-screen surfaces, full-page `mix-blend-mode` and transforms of the whole table.
- A closed drawer is `visibility: hidden`, not only translated away.
- A box that scrolls is a layer of its own, and so is everything drawn over it later in the document. On the phone table only the rows of cards scroll: your board, the strip across the table and their wrappers do not. The seats stand right after the header in the document, not last (`phone-table.js`); drawn last they shared one layer nearly the size of the screen with everything else over the boards.
- At rest nothing on the phone table has a backdrop filter: the header and the keyword marks are dark enough without one (`phone-experience.css`).
- Restoring a saved table draws no effects of the replayed actions (`main.js`, `restoring`).

Combat is animated live on the table (`action-effects.js`, the `clash` effect). Just before a damage step, every attacker charges its blocker, or the defending player's life total when unblocked. It lands as the damage is dealt, because the engine's pause before damage (`Game.combatPace(700)`, scaled by game speed) is the charge's duration, less the frames it took to paint. The copy that moves is a clone in the effect layer; the real card stays in place, faded (`fx-charging`, kept across renders), and nothing is ever covered or made inert. A blocked attacker charges only a blocker in view. On a phone, the Combat view opens for the step, unless a decision is open, and gives way to the previous view when combat ends. Combat animation off, reduced motion and instant games keep the table still. The replay window (`combat-replay.js`) opens only from Replay last combat.

On a phone's Combat view, an effect that shows a card uses the row's picture, at its place and size (`gameEffectCardArt`): hits land on the picture, and a creature that dies leaves as its picture. A row keeps its height when damage is marked; the amount sits beside power and toughness. A hit on a row scrolled out of view is not drawn. A card leaving for a zone that is not on screen flies to its owner's visible life total, or sinks where it stood, never to a corner. When a row leaves the list, the rows below slide to their places (`mobile-combat.js`, `slideRows`); the zone label travels with the card instead of staying over the row that takes its place. An attacker whose blocker died says so ("Blocked · blocker died"). Your life line flashes with the amount lost (`markLifeHit`, kept across renders), and hits on one player fan out around it. Live combat fades the Combat view in and out instead of cutting.

A card that changes zone without crossing the battlefield flies there as a ghost with a name badge (`ui.js`, `syncZoneEffects`). The flight is read from two renders of the table, which can be several moves apart, so it is named only by what is certain: "DISCARDED" needs the engine's discard mark on the card, "MILLED" a card that was in a library at the last render or carries the engine's mill mark. The marks are published to Live guests, who see neither hands nor libraries. A card that was in no zone then, such as a resolving spell, is not announced on its way to the graveyard. Both ends of a flight are places on screen: the zone, or the player's visible stand-in (`zoneFlightAnchor`). If the player is not on screen, no flight is drawn. The badge stays inside the screen.

The match's last screen (`renderGameOver`, `resolution-recap.css`) is headed by the winner's commander art and says Victory, Defeat or Match complete. It lists the final standing with commander portraits and tells the match (`matchHighlights`): every elimination with its turn and reason, then the win. Only the places left go to the latest attacks, damage and arrivals. It reads at body size (12 px or more) and arrives in order: the art settles, the result is said, then the standing, row by row.

## Responsive behavior

- Setup on every screen is a real `Deck → Pod → Review` flow. Only the active stage occupies the screen. The deck explorer has a full-width gallery and a compact layout; the selected deck has a persistent Continue control.
- Arena phone navigation is one level: `Mine / Table / Stack / Politics`. A destination does not add a second tab row. The floating "The Stack" window is a desktop surface; on phones the Stack destination and its count badge are the stack review, so no window covers the decision tray or the battlefield targets.
- An empty hand collapses to a compact status rail; it must not reserve card-height space.
- All primary touch targets are at least 44px.
- The phone's Combat view opens by itself for a combat decision and for the charge. When combat is over, the view the player had comes back, with a decision waiting or not. A view the player chose during combat is kept, and a Combat view the player opened stays open (`action-effects.js`).
- A seat chip of the phone's ribbon shows life as the lane heads do: the heart, then the number. The word `life` stays in the page for readers.
- The phone's Combat view between combats is one composed block in the middle of the pane (mark, sentence, two links), not a line over an empty pane.
- Internal battlefield and drawer scrolling is preferred over page-level horizontal overflow.
- The client is drawn on a fixed pixel grid sized for ~1440px desktops. Wider screens scale the whole document through `body { zoom: var(--ui-zoom) }` (`design-system.css`, stepped by viewport width and height) instead of shrinking type into the corners. Because zoom multiplies viewport units, stylesheets and inline styles never use raw `vh`/`dvh`/`vw`; they use `calc(N * var(--vhu|--dvhu|--svhu|--vwu))`.
- Exile and suspend trays sit beside the hand cards, never above them; the hand row may grow but must never push cards below the screen edge.
- **A desktop board draws its cards as large as its room allows** (`command-table.js`, `fitBoardCards`). The size the stylesheet gives is the one at which two rows of a crowded board fit; a board with four creatures drew them at that size too, in one corner of an empty lane. Each board takes the largest size at which nothing of it scrolls, up to 124px wide and never less than the stylesheet's, so a crowded board is drawn as before. The size is a custom property on the board; it is measured only when the room or the board's contents change, and `motion.js` carries a card from one size to the next like any other move. Phones are not fitted.
- **An empty board on a desktop** says so in the middle of its lane, under the dashed outline of a card; an opponent with lands and nothing else shows the outline alone (`arena-experience.css`).

## Accessibility and failure states

- Dialogs and sheets expose a name, `role="dialog"`, `aria-modal="true"`, initial focus, focus containment, Escape behavior when dismissal is legal, and return focus.
- Inline validation stays beside the control. Sync failures remain visible in the HUD until resolved. A fatal client error offers retry, setup return and a debug snapshot when a game exists.
- Focus rings are visible on dark and ember surfaces. Icon-only controls require an accessible name.

## CSS architecture

`design-system.css` owns new tokens and shared primitives in cascade layers. Existing `styles.css` and `client-v3.css` remain the legacy compatibility layer while the interface is migrated. `frontend-overhaul.css` bridges older declarations; `command-table.css` follows it and owns the scoped Command Table composition. New one-off styling must not be added to `styles.css`.

`phone-experience.css` loads after the arena sheets and before `motion.css`. It owns the phone table (the two sides, the bar with your portrait, the fan, the prompt line, the Combat cards); the older phone rules in `command-table.css` and `mobile.css` remain underneath it and still lay out a short landscape screen.

`motion.css` loads last. It owns the flight layer of `motion.js` and the moments that are motion first (the turn announcement, the opening deal, the arrival plate, toasts, a removal and a board wipe); it moves no part of the table. A layout rule belongs to the sheet that owns its surface: the opening hand's row is in `decision-experience.css`, the match's last screen in `resolution-recap.css`, the header's tracker and lane marks in `arena-experience.css`.

The experience sheets load after the mobile compatibility rules: `experience-theme.css` supplies shared readable surfaces and controls; `setup-experience.css`, `decision-experience.css`, `experience-tools.css`, `help-experience.css`, `account-experience.css`, `live-experience.css` and `politics-experience.css` own their respective flows. `arena-experience.css` loads last and owns arena chrome only: the segmented turn tracker (full step names when the header has room), active-turn lane light and badge, low/critical life bands (≤10 / ≤5), lane labels, the decision status chip, and the opaque review overlay. It uses shadows rather than borders or sizes, so no lane moves; the active-turn badge is exactly one 14px line so a lane head keeps its height and the battlefield below it keeps its room. During blocker and damage steps it keeps lanes from clipping their cards: at layout heights of 769–860px (real heights translated through the arena zoom regimes) the hand row hides for the step, as the ≤800px combat rules already do; at 861–1000px the hand stays, lane heads and land docks tighten, and the card size is fluid in `--vhu` so it follows the remaining height. They do not change battlefield grid placement. Keep selectors scoped and use fixed SVG dimensions inside grid controls so external symbol sprites cannot fall back to a 150px intrinsic height.

## JavaScript architecture

Stay with vanilla JavaScript. Reusable presentation belongs in small factories or UI methods: stage navigation, dialog enhancement, public timeline rows, diagnostics and recovery. Do not move rules, legality or AI strategy into DOM code. The page opens the table from `src/app-startup.js`, generated from `src/app.js`: the same modules with the Oracle batches replaced by the cards that built-in decks use. The rest of the catalog loads through `MTG.ensureFullCatalog()` when an imported deck, a Live room or a choice among every card name needs it. Completing it stops the page for several seconds, so a player who already has saved imported lists gets it before the table opens, behind the loading message (`MTG.playerHasImportedLists`, asked by `src/public-entry.js`). Code that needs a card no built-in deck uses awaits it first; `MTG.validateImportedDeck` refuses otherwise. A batch that arrives later compiles with the compiler's surroundings of its original place among the modules, so a module that revises scripts registered before it uses `MTG.reviseRegisteredScripts` instead of a loop over `MTG.SCRIPTS`. A registry that cards fill when they compile belongs on `MTG` or on one of its plain namespaces, where an entry added by a later compile is carried over to the registry in use today; `tests/startup-catalog.test.mjs` compares everything on `MTG` between the two ways of loading. Run `npm run build:startup` after adding a deck or a batch. Every string shown passes through `MTG.uiText`; a new translation rule needs no registration, but a rule is tried only when the text has its word or its longest plain run of characters, and `MTG.uiTextReference` is the definition.

A bot ranks its actions against one unchanged board: a forecast that every action needs, such as which attacks get through once blockers are tapped for mana, is built once per ranking (`ai-v2.js`, `rankingTapDefense`, inside `withScoringManaMemo`) and never kept after it.

## Command Table landing

- `command-landing.css` owns the scoped home composition, using the same fonts, obsidian surfaces, ember actions, and compact borders as the arena and seat review. It loads with the public shell; design tokens are render-blocking to keep the first paint styled.
- `index.html` and the runtime home retain matching hero/navigation/library markup. `modules/landing.js` supplies shared lower sections and the Table/Focus image preview to both public entry and runtime home. This module must stay independent of the engine and deck catalog.
- The preview uses labeled screenshots of the real interface with Scryfall imagery; phones receive the actual mobile capture. Preview controls change only the image and its explanation. They never load or mutate a game.
- Navigation, Solo, Live, guide, import, account, recent-deck, and keyboard paths retain their original destinations and behavior. Home content must remain consistent after returning from setup.

## Command Table frontend (2026-09-05)

- `command-table.js` composes the existing public battlefield, hand and engine-backed decisions. `command-table.css` owns its responsive layout after the legacy compatibility sheets.
- Desktop has three opponent zones, the human battlefield and hand, and a stable decision rail. The Table/Focus preference persists on the device. Target selection and combat assignment show all opponents even when Focus is selected.
- On desktop an expanded decision (a Stack review, the Stack, a choice of targets) floats over the right edge of the table. A review leaves the table's size unchanged. A choice of targets makes room for the panel (`ct-target-room` in `command-table.js` and `command-table.css`): every battlefield and the hand stay left of it, so the land column at each board's right edge stays clickable. The header above the panel keeps its full width.
- Phones keep opponent summaries visible, with the two sides of the table under them (see *Phone table*) and the existing Mine / Table / Stack / Politics destinations at the bottom. Full-table navigation exposes every opponent. Crowded zones scroll at readable card sizes.
- Required Stack review remains an explicit hard pause with its original Proceed/respond callbacks, presented in the desktop rail or the mobile decision tray. Reveal, combat and other required dialogs retain their existing engine semantics and accessible dismissal rules.
- Card effects sit beside their cards (`effect-anchors.js`, `effect-anchors.css`). On desktop a minor resolution recap is placed next to the first visible permanent it changed, which is outlined, or on its controller's board; it stays the same dialog, decision and Proceed path. Major results keep the central spotlight; on phones a minor recap is a full-width bottom sheet under the visible board (decision dialogs are otherwise centred). Activity notices about a public card on the table become short callouts beside it; all other notices keep the corner stack. The Stack review stays in the stable decision rail, which outlines an opponent's source permanent (or the caster's board heading) and links to it when near. Anchors carry only public battlefield identities.
- Phone polish lives in `phone-table.js`. Activity notices, spell-copy notices and toasts stand just above your portrait and life (above the prompt in views without them), never over them; while a sheet or modal is open they keep their place under the seats. On touch screens the prompt bar and toasts say "tap" instead of "click" (whole words only, so card names keep their spelling). A portrait full hand puts the commander in a compact row above a hand of at least two columns; landscape keeps the commander column because height is the scarce side. The phone target tray is only as tall as its content, up to a cap that grows with the screen so a cast's two-line hint is not cut off.
- On phones (≤900px), cards you may play from outside your hand appear as full cards at the front of the hand row. This covers exile permissions (impulse, foretold, plotted, adventure, an opponent's card) and graveyard or library-top casts. A ribbon names the zone; a footer gives the window ("This turn only", "Foretold") and the owner of an opponent's card; the green frame still means "playable now". In the full-hand view the ribbon and footer are bands above and below the card, so its name and P/T stay readable. Tapping one opens the ordinary card sheet with its "Play from exile" or graveyard cast action. The thumbnail tray beside the hand is a desktop surface. While the Mine or Hand view shows these cards, the prompt does not repeat them as name buttons; Table, Combat and Stack keep them as one swipeable line, and the prompt grows by that line so its primary action stays visible. A target choice whose only legal targets are on the Stack opens the Stack view on a phone, where the spells glow.
- All card and commander face images must come from Scryfall, including existing local copies. This applies to the main menu, player portraits, review seats and every game zone. Original generated card backs are allowed for concealed cards, unrevealed library checkpoints and unknown/random seat decoration; they never replace a face or commander illustration.
- The large card preview belongs to its card, not to the pointer: it stands beside a card on the table and above a card in your hand or dock, so it never covers the row you are reading along, and it grows out of its card when it appears.
- A prompt, hint or toast written with a leading emoji shows the matching icon of the table's own set (`MTG.iconizeLead`); every platform draws emoji in its own colour font. The text itself is unchanged.
- Scroll position is presentation state and survives ordinary arena renders. No opponent hand identity or library ordering is added to the new presentation model.

## Phone table (2026-11-19)

The phone's table is laid out the way card games use a phone: the board is the screen, your side is at your thumb, and chrome gives way to cards. `phone-table.js` marks the composed table (`ct-phone`, on every screen that uses the phone layout except a short landscape one, which keeps its side-by-side layout) and `phone-experience.css` lays it out. Presentation only: every control keeps its handler, and the Mine / Table / Combat / Stack / Politics destinations are as before.

- **Two sides.** The seats at the top are the opponents: a round portrait, the name, the life; the active one is ringed. Under them the table has two sides. With your board open, a phone 760px tall or more shows the creatures of the opponent across the table above it, as a strip of small cards under that opponent's name; the seat across is marked and points at it. A seat opens that opponent's whole board; then your own creatures are the strip, below it. Shorter phones show one board at a time. "Across" is the focused opponent: the active one on a new turn, or the seat chosen last. With nothing across, one line says so.
- **You.** Your portrait (ringed on your turn), your life in large figures and your piles (Hand, Library, Graveyard, Exile: an icon over a count, 44px each) are one bar between the board and the prompt, with either side open, so your life is in view while you look at an opponent's board. The Hand pile opens the whole hand. The hand row has no heading; sorting lives in the whole hand.
- **Your board** has no frame, heading or lane titles; its playmat is its background. With 700px of height the creatures face the table and their support stands behind them at a smaller size, each row scrolling sideways on its own; a shorter phone keeps one row. Lands are one line of counts by name, with the mana rocks at its start. The cards are anchored from the top of the board: a prompt that grows or shrinks moves the lands and your bar, never the cards, so an effect lands on its card.
- **The hand is a fan.** Cards overlap, and each keeps its middle in view (more than half its width, never less than 44px): a touch on the middle of a card is that card, and a larger hand scrolls. What you can play stands up in its green frame. The cost sits on the part of a card that the next one leaves. A card from another zone (exile, a graveyard) is shown whole, with its ribbon and note. The commander stands at the head of the fan as a flat card under a crown. An empty hand beside a commander keeps the row's height, so the board does not jump when the last card is played.
- **One action.** When the prompt has one button, the instruction (two lines at most) and the button share a line, the button at the right thumb. Several buttons keep their row.
- **Combat.** Your attackers or blockers are a grid of cards, three to a row (four on a short phone): the picture, the name, power and toughness, keywords, and what the card is doing. A chosen card steps forward in a ring. Inspect is a mark in the card's corner with 44px around it. Above the cards: the step and its instruction, the defenders, and one line of who defends with what; the open one shows its creatures under the line.
- **An opponent's board** has its name and piles on one line and no frame. In Table every opponent is such a section.
- **The card sheet** shows the card at 44% of its width, and its action is a 52px button.
- **A recap sheet** rises under both front lines; your portrait and life are beside the hand, under it.
- **Memory**, measured at device pixel ratio 3 on 390×844 (`LayerTree` over CDP): 26 MB in 24 layers at rest (the table before: 44 MB in 28), 33 MB with an opponent's board open, 51 MB at the peak of a staged wipe (before: 65 MB). The two memory rules above about scrolling boxes and backdrop filters come from this table.

## Politics & Diplomacy (2026-11-19)

`politics-experience.css` owns the three Politics surfaces (the drawer, the offer composers, the review that pauses the game); `ui.js` builds them (`renderDiplomacyPanel`, `renderDiplomacyModal`, `renderDiplomacyReviewModal`). The engine's proposals, contracts and callbacks are unchanged.

- **One language for the three.** Players are faces (their commander's art, which is public). A dialog is headed by the faces of who deals with whom, a short label and a title that says what it is or what happened (`Offer AI Wolf a deal`, `AI Wolf accepted your offer`). Terms are headed by the player who makes the promise. The foot carries one quiet line of what pressing means, then the actions, the main one last.
- **The drawer is ordered by need**: whether deals are open (or how far the lock is), what waits for your answer, the players you can offer a deal, the agreements in force, a table deal or a last stand when one is available, what happened recently, and the rules behind a disclosure. The drawer's head carries the title; the panel does not repeat it.
- **The drawer groups with spacing, headings and hairlines.** Only an offer that waits for an answer is a raised card. An offer shows `You get` and `You give`, then the reciprocity check and the bot's reason, then Accept and Decline.
- **The composer**: starting points are chips, and the chosen one says what it does; two plain fields set the exact terms; the deal is shown in words; one line says whether it can be sent and why not. A select shows one line and the deal shows the whole sentence.
- **The review** is still a hard pause with its own Proceed (or Accept and Decline). It no longer explains the pause in a paragraph and the terms are no longer headed `TERM 1`, `TERM 2`.
- The header's chip says `POLITICS` and a state (`OPEN`, `2 OFFERS`, `1 ACTIVE`, `OPENS TURN 3`). Opening the drawer removes the negotiation notice, which would only cover it.
- Buttons in the drawer are at least 36px on a desktop and 44px on a phone; body copy is 12px or more.

## Player tools

- `player-tools.js` owns validated device preferences, recent built-in decks, account-scoped local pod configurations, mana-curve summaries, and presentation-only hand sorting. A saved pod stores setup choices, never a game checkpoint or shuffle seed.
- `arena-tools.js` owns the searchable card/command dialog and hand controls. Search includes the viewer's hand and public zones. Opponent hands, libraries and face-down identities must never enter search results, search text or image URLs.
- Search opens the ordinary card sheet; casts, targets and payments still use the pending engine decision. Inspecting during a blocking decision temporarily hides its presentation and restores it on close.
- Find is available with a visible button, `/`, or Command/Ctrl+K. Each UI instance handles keys only while it is the active game. Search contains focus and makes the arena inert until closed.
- Hand sort, hand size, AI pacing and high contrast persist on the device. Draw-order sorting preserves the underlying hand array and card identities. Larger cards must still fit the reserved hand row.
- Arena background is available in Menu and Find. The validated device preference selects one of six mana atmospheres or five local scenes, with independent 0–75% dimming. Selection updates the existing arena surface without answering or rebuilding a pending game decision; scene colors never replace the readable panel and action tokens. The picker keeps its footer visible while options scroll on compact screens.
- Music & sound is available in Menu and Find. Quiet original instrumentals loop locally with independent music/effect levels and device mute. Settings never answer a pending decision. Sound effects are reserved for commander/powerhouse arrivals, actual hits of at least 10 damage, board wipes affecting at least three cards (three sounds, one for each beat of the staged wipe), and game end. Land/card plays, attack declarations, small hits, ordinary removal, counters and other routine actions stay silent. Coalesce simultaneous milestones and space repeated cues by 2.5 seconds. Hidden identities, save replay and AI simulations stay silent. Pause audio in hidden tabs, unlock it through browser interaction, and keep sound independent of reduced motion.

## Experience upgrade (2026-10-17)

- `experience-tools.js` presents Table, Appearance, Controls and Help tabs. Navigation retains existing table/session/recovery callbacks. Switches expose `aria-checked`; selects show every available value. Changing a preference never confirms a pending game question. Detached settings controls cannot affect a replacement table or a newly opened menu.
- Settings use a vertical navigation rail on wide screens and compact horizontal tabs on phones. Tab orientation and arrow-key navigation follow the visible layout, including viewport changes. Keep the return action visible while the settings body scrolls.
- Card backs are an allowlisted cosmetic preference in `player-tools.js`. Obsidian, Astral and Ember originals and provenance live in `assets/cardbacks/`. Every hidden card wears its owner's deck sleeve (`deck-sleeves.js`): the selected design is the frame, the owner's color identity tints its stone and the owner's commander art (partners side by side) fills the central medallion. The sleeve follows the owner, which is public, never the hidden card's identity, and the accessible name stays generic. Two copies of one deck take the next design. Sleeves are drawn once per deck on a canvas; until one is ready, and without a canvas, the plain design stands in. Random or unknown seats keep the plain design. CSS background URLs are resolved against the document so reveal backs work in both hosted and packaged builds. The separate missing-card-art sentinel remains unchanged.
- The card-back picker pairs a large selected preview with compact choices. Update the connected preview image, since arena reconciliation can reuse decoded artwork from the previous sheet. Selection applies immediately without replacing the focused choice or answering the game decision.
- `help-experience.js` explains current controls and manual reveal checkpoints. Priority profile choices retain their original setting, recorded side action and selection behavior.
- The targeting prompt lists every legal player as a labelled control ("Target you", "Target <name>") beside its zone links: the desktop review panel sits over the lane heads' life totals and a phone shows one board, so the glowing total is not the only way to choose a player.
- When a triggered ability asks for targets with only the generic "Choose target", the prompt shows the ability's effect text instead, so the player knows what the choice does. Inside the end step, a source whose text returns a card "at the beginning of the next end step" adds a warning: a card exiled now returns at the next turn's end step.
- Bot lookahead runs on a deep clone of the game, but closures are shared with the live game (a delayed return holds the live card). Inside a simulation, every live card or player passed to a state-changing method (`move`, `putPermanentOntoBattlefield`, counters, life, damage, draw, tap, tokens, sacrifice, destroy, discard, mill, attach, exile) stands for the clone's copy (`simulationObject`, one map per nesting level). New mutators that closures may call belong in that list.
- A commander's command-zone choice (CR 903.9a) names a pending return (`Game.notePendingCommanderReturn`). This covers:
  - a blink that will return the commander from exile, like a Gift of Immortality return from the graveyard; the choice adds "Keep it in exile to let <source> return it …" with its timing;
  - The Guardian of Forever's sacrifice, marked when the cost is paid (`returnsSacrificed`), because the choice comes before the ability resolves;
  - Temporal Tribulation;
  - S.S. Botany Bay's conditional return, marked uncertain.

  Bots keep the commander in that zone only for a certain return.
- A delayed blink of the bot's own permanent ("return it at the beginning of the next end step") carries the target goal `blink-delayed`; The Guardian of Forever's sacrifice is marked `returnsSacrificed`. Once the end step or cleanup has begun, that return comes at the next player's end step, and the permanent sits out a whole turn. Bots then blink only to save a permanent from removal on the Stack or a declared combat (`delayedBlinkValue` in ai-v2.js). This covers:
  - the target choice (Kyle and Balance of Terror pick nothing);
  - casting such a spell (Temporal Tribulation at an opponent's end step);
  - activating such an ability (The Guardian of Forever), whose sacrifice then goes to the threatened creature.

  In any window, a token is never blinked, since it does not come back, and a threatened permanent is blinked first. Otherwise the ordinary target valuation applies outside the end step.
- Card choices support keyboard selection, explicit selected state and visible disabled confirmation. Scry has named top/bottom and ordering controls; X accepts a validated integer or an explicitly legal sparse value. Presentation never invents legal choices.
- Card inspection is two columns on desktop. On phones, a full-width name and type precede the art and scrollable rules. Additional component information belongs inside the rules area. Zone search, type filters and sorting operate on already-visible cards and never reorder engine arrays. Inspection returns to the same pending reveal or filtered zone and restores focus to the invoking card.
- Only the highest active inspection or required decision surface receives keyboard focus. Covered arena children are inert; temporary ownership attributes are cleared before reconciliation and restored in the same render. Dialog scroll position survives incidental renders.
- Setup retains its selected deck and seat choices through Deck → Pod → Review. Import accepts a text file or pasted list, exposes all validation issues, and keeps saved decks searchable. Loading feedback reports real milestones rather than estimated percentages.
- Setup uses one introduction per step. Official commander artwork leads the collection; deck identity stays visible beside compact artwork in the phone spotlight. Pod places seat editors before optional presets, and Review keeps the final action close to its seat and rules summary.
- Live lobby controls show per-seat readiness, commander art, connection state and actionable waiting reasons. Busy actions preserve focus, failed copies offer a selectable invite, and late async completions cannot reopen an abandoned lobby. Auth, transport and game authority remain outside presentation code.
