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
- `JetBrains Mono` with tabular figures carries every number that changes during play: life totals, power/toughness, counts.
- Body copy is at least 12px on compact screens and 13px when space allows.
- Muted text must remain readable on the table. Never use low contrast as the only signal for disabled, selected or dangerous state.
- Brass marks the human's current path; green marks valid progress/sync; red is reserved for danger, failure and destructive actions.

### Palette (obsidian & ember, refreshed 2026-10-17)

- Every colour comes from `src/design-system.css`; stylesheets never hard-code the accent or the base. `--ds-table`, `--ds-panel`, `--ds-panel-raised` and `--ds-dialog` are one cool blue-black material; `--ds-accent` (ember `#e07a4a`), `--ds-accent-bright` and `--ds-accent-soft` are the only warm colours, with `--ds-*-rgb` triplets for tints. `--ds-brass` and `--ds-brass-bright` remain as aliases of the accent for older rules.
- Surfaces: a fixed soft-light grain (`body::after`), radial ambient light in the accent hue, hairlines at 7–9% white, tinted shadows (`rgba(2, 6, 12, …)`), never pure black.
- Interaction: every control lifts 1px on hover, presses to 98.5% on `:active`, and shows a two-ring focus (outline plus accent halo). Reduced motion removes the lifts.

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

Reduced motion (either preference), a hidden tab, a restored save, bot simulations and instant games keep the table still. `MTG.motionLog` records what moved and from where; `tests/browser/table-motion.mjs` reads it. On a phone at device pixel ratio 3, a render that moves eight cards holds 35 layers and about 55 MB for under a second, against 21 layers and 44 MB at rest (measured as in the notes of 4 November: `LayerTree` over CDP); a render takes as long with the table moving as still.

### Announcements

- The turn announcement is words on a soft band, without a box: across the middle of the table for your turn, smaller and shorter on the player's own lane for an opponent's, so no seat is covered. One shows at a time.
- The opening hand is one row of seven on a desktop and is dealt one after another; a dialog that is only redrawn keeps its cards still.
- A powerhouse's arrival is a compact plate under the header with the whole card, its name on one line and Skip beside it; a phone places it above the prompt with the other notices (`phone-table.js`). The card that arrived is lit twice, not bounced: how it comes to its place is the table's own motion. The commander's cinematic keeps its frame.
- The spotlight line ("a bot did something aimed at you"), the Monarch change and a table negotiation are plates of the dialog material with the tone on the leading edge, the table's own icons and copy of 12 px or more. They come down into place and leave upward; none cuts out. On a phone a negotiation's action takes its own row.
- One toast shows at a time; it rises in and fades before it is removed.

### Setup and header

- A setup step (Deck, Pod, Review) comes up instead of cutting in: its grid fades and its title rises. The grid only fades, because a transform on it would move the fixed and sticky bars inside it for the length of the animation. The deck spotlight rises into place; on a phone, where it fills the screen, it fades.
- The header's turn tracker keeps its place. The title beside it has one width; when it does not fit, the player's name gives way, never the step. A step's name stays on one line.

Phones have a small graphics memory budget, and an iPhone tab that runs out is closed by Safari. At device pixel ratio 3, measure an effect's layers (Chrome DevTools: Layers, or `LayerTree` over CDP) before adding it. Rules that follow from it:
- On phones, avoid large blurred elements, `backdrop-filter` on full-screen surfaces, full-page `mix-blend-mode` and transforms of the whole table.
- A closed drawer is `visibility: hidden`, not only translated away.
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
- Internal battlefield and drawer scrolling is preferred over page-level horizontal overflow.
- The client is drawn on a fixed pixel grid sized for ~1440px desktops. Wider screens scale the whole document through `body { zoom: var(--ui-zoom) }` (`design-system.css`, stepped by viewport width and height) instead of shrinking type into the corners. Because zoom multiplies viewport units, stylesheets and inline styles never use raw `vh`/`dvh`/`vw`; they use `calc(N * var(--vhu|--dvhu|--svhu|--vwu))`.
- Exile and suspend trays sit beside the hand cards, never above them; the hand row may grow but must never push cards below the screen edge.

## Accessibility and failure states

- Dialogs and sheets expose a name, `role="dialog"`, `aria-modal="true"`, initial focus, focus containment, Escape behavior when dismissal is legal, and return focus.
- Inline validation stays beside the control. Sync failures remain visible in the HUD until resolved. A fatal client error offers retry, setup return and a debug snapshot when a game exists.
- Focus rings are visible on dark and ember surfaces. Icon-only controls require an accessible name.

## CSS architecture

`design-system.css` owns new tokens and shared primitives in cascade layers. Existing `styles.css` and `client-v3.css` remain the legacy compatibility layer while the interface is migrated. `frontend-overhaul.css` bridges older declarations; `command-table.css` follows it and owns the scoped Command Table composition. New one-off styling must not be added to `styles.css`.

`motion.css` loads last. It owns the flight layer of `motion.js` and the moments that are motion first (the turn announcement, the opening deal, the arrival plate, toasts); it moves no part of the table. A layout rule belongs to the sheet that owns its surface: the opening hand's row is in `decision-experience.css`, the match's last screen in `resolution-recap.css`, the header's tracker and lane marks in `arena-experience.css`.

The experience sheets load after the mobile compatibility rules: `experience-theme.css` supplies shared readable surfaces and controls; `setup-experience.css`, `decision-experience.css`, `experience-tools.css`, `help-experience.css`, `account-experience.css`, and `live-experience.css` own their respective flows. `arena-experience.css` loads last and owns arena chrome only: the segmented turn tracker (full step names when the header has room), active-turn lane light and badge, low/critical life bands (≤10 / ≤5), lane labels, the decision status chip, and the opaque review overlay. It uses shadows rather than borders or sizes, so no lane moves; the active-turn badge is exactly one 14px line so a lane head keeps its height and the battlefield below it keeps its room. During blocker and damage steps it keeps lanes from clipping their cards: at layout heights of 769–860px (real heights translated through the arena zoom regimes) the hand row hides for the step, as the ≤800px combat rules already do; at 861–1000px the hand stays, lane heads and land docks tighten, and the card size is fluid in `--vhu` so it follows the remaining height. They do not change battlefield grid placement. Keep selectors scoped and use fixed SVG dimensions inside grid controls so external symbol sprites cannot fall back to a 150px intrinsic height.

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
- Phones keep opponent summaries visible, with a selected public battlefield and the existing Mine / Table / Stack / Politics destinations at the bottom. Full-table navigation exposes every opponent. Crowded zones scroll at readable card sizes.
- Required Stack review remains an explicit hard pause with its original Proceed/respond callbacks, presented in the desktop rail or the mobile decision tray. Reveal, combat and other required dialogs retain their existing engine semantics and accessible dismissal rules.
- Card effects sit beside their cards (`effect-anchors.js`, `effect-anchors.css`). On desktop a minor resolution recap is placed next to the first visible permanent it changed, which is outlined, or on its controller's board; it stays the same dialog, decision and Proceed path. Major results keep the central spotlight; on phones a minor recap is a full-width bottom sheet under the visible board (decision dialogs are otherwise centred). Activity notices about a public card on the table become short callouts beside it; all other notices keep the corner stack. The Stack review stays in the stable decision rail, which outlines an opponent's source permanent (or the caster's board heading) and links to it when near. Anchors carry only public battlefield identities.
- Phone polish lives in `phone-table.js`. Activity notices, spell-copy notices and toasts float just above the prompt bar, never over the board or hand heading with your life total; while a sheet or modal is open they keep their place under the seats. On touch screens the prompt bar and toasts say "tap" instead of "click" (whole words only, so card names keep their spelling). A portrait full hand puts the commander in a compact row above a hand of at least two columns; landscape keeps the commander column because height is the scarce side. The phone target tray is only as tall as its content, up to a cap that grows with the screen so a cast's two-line hint is not cut off.
- On phones (≤900px), cards you may play from outside your hand appear as full cards at the front of the hand row. This covers exile permissions (impulse, foretold, plotted, adventure, an opponent's card) and graveyard or library-top casts. A ribbon names the zone; a footer gives the window ("This turn only", "Foretold") and the owner of an opponent's card; the green frame still means "playable now". In the full-hand view the ribbon and footer are bands above and below the card, so its name and P/T stay readable. Tapping one opens the ordinary card sheet with its "Play from exile" or graveyard cast action. The thumbnail tray beside the hand is a desktop surface. While the Mine or Hand view shows these cards, the prompt does not repeat them as name buttons; Table, Combat and Stack keep them as one swipeable line, and the prompt grows by that line so its primary action stays visible. A target choice whose only legal targets are on the Stack opens the Stack view on a phone, where the spells glow.
- All card and commander face images must come from Scryfall, including existing local copies. This applies to the main menu, player portraits, review seats and every game zone. Original generated card backs are allowed for concealed cards, unrevealed library checkpoints and unknown/random seat decoration; they never replace a face or commander illustration.
- The large card preview belongs to its card, not to the pointer: it stands beside a card on the table and above a card in your hand or dock, so it never covers the row you are reading along, and it grows out of its card when it appears.
- A prompt, hint or toast written with a leading emoji shows the matching icon of the table's own set (`MTG.iconizeLead`); every platform draws emoji in its own colour font. The text itself is unchanged.
- Scroll position is presentation state and survives ordinary arena renders. No opponent hand identity or library ordering is added to the new presentation model.

## Player tools

- `player-tools.js` owns validated device preferences, recent built-in decks, account-scoped local pod configurations, mana-curve summaries, and presentation-only hand sorting. A saved pod stores setup choices, never a game checkpoint or shuffle seed.
- `arena-tools.js` owns the searchable card/command dialog and hand controls. Search includes the viewer's hand and public zones. Opponent hands, libraries and face-down identities must never enter search results, search text or image URLs.
- Search opens the ordinary card sheet; casts, targets and payments still use the pending engine decision. Inspecting during a blocking decision temporarily hides its presentation and restores it on close.
- Find is available with a visible button, `/`, or Command/Ctrl+K. Each UI instance handles keys only while it is the active game. Search contains focus and makes the arena inert until closed.
- Hand sort, hand size, AI pacing and high contrast persist on the device. Draw-order sorting preserves the underlying hand array and card identities. Larger cards must still fit the reserved hand row.
- Arena background is available in Menu and Find. The validated device preference selects one of six mana atmospheres or five local scenes, with independent 0–75% dimming. Selection updates the existing arena surface without answering or rebuilding a pending game decision; scene colors never replace the readable panel and action tokens. The picker keeps its footer visible while options scroll on compact screens.
- Music & sound is available in Menu and Find. Quiet original instrumentals loop locally with independent music/effect levels and device mute. Settings never answer a pending decision. Sound effects are reserved for commander/powerhouse arrivals, actual hits of at least 10 damage, board wipes affecting at least three cards, and game end. Land/card plays, attack declarations, small hits, ordinary removal, counters and other routine actions stay silent. Coalesce simultaneous milestones and space repeated cues by 2.5 seconds. Hidden identities, save replay and AI simulations stay silent. Pause audio in hidden tabs, unlock it through browser interaction, and keep sound independent of reduced motion.

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
