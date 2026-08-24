# Main, Arena, and gameplay polish audit — 2026-08-24

## Outcome

The sharing-readiness pass was completed locally before release authorization. It closes a real Oracle of Mul Daya rules/UI gap, clarifies top-of-library permissions, removes the most disruptive Main/Arena overlap and density problems, and hardens deep decision flows from 320px phones through short laptops and regular desktop screens. Release state is verified separately after this audit package is committed.

## Confirmed findings and fixes

### Top of library

- Oracle of Mul Daya granted `playTop` and the additional land play, but did not reveal its controller's top card. It now has `revealOwnTop: true`.
- The ambiguous eye beside the library count is replaced by a named, accessible card control with artwork, card name, permission source, and current status: `PLAY NOW`, `PLAYABLE FROM TOP`, `LAND PLAY USED`, or `TOP CARD REVEALED`.
- The control distinguishes revealed information from an actual play permission. Selecting it opens the normal card sheet; a real `Play land` action correctly updated the battlefield, library count, and land-play count.
- The library-top control, land row, command zone, and zone buttons were rebalanced separately for phones, tablets, short laptops, and normal desktop height. They no longer cover one another or get cropped by the hand/player rail.

### Main setup

- Pod and Review remain unavailable until a deck is selected, so the progress rail never promises an inaccessible step.
- Deck cards now say `Select deck` instead of the misleading `View deck`.
- Pod Builder repeats the selected deck name and a clear Ready state above the commander, so the intended deck remains unambiguous even when its card is far down the explorer list.
- Setup progress, filters, mobile continuation, bot configuration, and close controls have stable touch targets.
- At 320×568, Pod Builder was found to be 40px wider than its viewport and clipped both bot selects. Bot cards now use an avatar/identity row followed by full-width labelled Deck and Play style fields; the final drawer has equal client and scroll width.
- The same short-phone pass exposed a second Pod defect: flexbox compressed a 236px commander section into 96px and let its children overlap the Pod controls. Direct sections now keep their natural height and the drawer scrolls normally; the selected-deck block, commander, Pod choices, bot fields, Advanced Rules, Start Game, and sticky Close control remain separated and reachable.
- The setup screen and selected-deck flow were checked at phone, tablet, short-desktop, and regular desktop dimensions without page-level horizontal overflow.

### Arena shell

- Seed/status toasts move above decision overlays instead of crossing Mulligan and other primary actions.
- The right utility rail uses clear icon-and-label controls for Stack, Log, and Deals rather than vertically rotated tiny words.
- The old opponent-card scale bar and resize grip were removed from the battlefield. Equivalent scale controls remain in Game Menu with readable labels.
- Tablet opponent headers use a stable grid for name, life, meta, commander, information, and `ACTIVE TURN` state.
- Mobile phase navigation no longer sits under the HUD; phase controls, player life, opponent info, and zone controls preserve practical touch targets.
- On 568px-tall phones, an action prompt could have 89px of content inside a 54px row, leaving Continue partially hidden behind the hand. When a real prompt action exists, the mobile grid now reserves 96px for it and proportionally compacts opponent/hand rows; the full 44px Continue/Proceed control remains visible without page overflow.
- The production canary caught a final short-phone pressure case: an overfull player battlefield still inherited bottom alignment, which pushed its first rows upward and let Library Top/Command Zone content cross neighboring rows. Mobile battlefield rows now keep their intrinsic height, start at the top, and scroll as one contained surface instead of overlapping.
- Short-desktop rows now reserve enough height for the complete mini card, Library Top, command zone, player rail, action stage, and hand instead of clipping them under section headings.
- Desktop opponent Info/life and the human life/zone controls now use at least 36px hit targets (44px on mobile) instead of the previous 21–30px targets.
- Manual-mana and HOLD messages are consistently English (`choose mana sources`, `sacrifice this card`, `granted by`).

### Decision sheets and secondary surfaces

- Diplomacy fields collapse to a single phone-width column. Native selects no longer clip three-line agreement text, and the Send/Close row remains sticky and reachable.
- A complete human-to-bot offer was sent, reviewed at the required hard pause, continued with Proceed, and preserved as an active public contract.
- Help now has a sticky title bar and 44px close control, so a user never has to scroll a long rules sheet to the bottom just to exit.
- Resource-choice sheets compact their art on short phones while preserving the full illustration and keeping all actions plus Close visible without internal scrolling.
- Opening-hand Keep/Mulligan actions are sticky on short phones. All seven cards remain inspectable while both 44px decisions stay fully above the viewport edge.
- Short-laptop card sheets likewise constrain the art so Cast/Play and Close remain visible together.
- Combat review, attacker assignment, planeswalker allocation, Inferno Titan targeting, exact-source manual mana, global effects, graveyard, player effects, Game Menu, and priority-stop panels were checked for clipping and exit paths.

### Keyboard and interaction stability

- A real double-submit bug was found: pressing Enter on a focused hand card could open its sheet and let the same bubbling key event immediately activate `Cast`, creating exactly the feeling that an action had “flown away.”
- The closed Arena utility drawer is now `aria-hidden` and inert, so keyboard and assistive focus cannot land on Stack/Log/Deals controls while they are visually offscreen; a live accessibility-tree check confirmed that they appear only after the drawer opens.
- Card keyboard handlers now stop propagation, and the global Enter/Space shortcut ignores interactive origins.
- The complete keyboard-only counter flow was exercised: open Arcane Denial, Cast, select Swords to Plowshares on the stack, and Lock target. Swords and Arcane Denial ended in their correct graveyards and Riders of Gavony survived.
- Life, player info, zones, hand cards, Stack objects, battlefield mini cards, command-zone cards, and Library Top use button semantics or equivalent keyboard activation with descriptive labels.

## Responsive browser coverage

- 320×568: fresh setup, selected-deck Pod Builder from top to Start Game, opening hand, Keep, live Arena Continue/Proceed prompt, action stage, resource choice, planeswalker combat allocation, Inferno targeting, and manual mana.
- 375px phone: Diplomacy composer/review, Help, global effects, Game Menu, priority stops, graveyard, and player effects.
- 768×700 and 768×1024: opponent grid, Library Top/land rows, short-height pressure, and regular tablet layout.
- 1280×620: short-laptop battlefield, command zone, Library Top, response hand, full card sheet, and opening hand.
- Regular desktop: Main setup, Arena, utility drawers, Mulligan, revealed library top and real land play, visual card choices, Stack response/targets, combat battlefield review, and multi-copy stack target maps.
- A final real-browser manifest canary selected and started every active deck as the human seat in a four-player pod: 27/27 passed, each state reported the requested human deck, every game had four players, maximum page overflow was 0px, and the browser console had 0 errors.
- A fresh post-fix four-player Jeskai dogfood continued from opening hand through turn 8. The human played Temple of Triumph, completed its visible Scry 1 choice, passed the combat/main sequence, reviewed Nadier's Nightblade, a bot combat, and Pollywog Prodigy at their required pauses, then played Mountain and cast Boros Signet with both lands correctly tapped. The final battlefield/hand/command-zone view remained clean and the console still had 0 errors.

## Automated gates

- `npm run check`: PASS.
- Focused UI/resource/manual-mana/keyboard regressions: 18/18 PASS.
- `npm test`: 696/696 PASS.
- `npm run audit`: 27 active decks, every deck 100 cards, 0 duplicate script registrations, 0 simplified active cards.
- `npm run certify:strict`: 1,580/1,580 active unique cards; 2,347/2,347 card/deck checks; 1,626/1,626 raw cards; 46/46 out-of-active cards; 0 failures.
- `git diff --check`: PASS at the full-gate checkpoint; repeated after final documentation updates.

## Evidence

- Baseline: `output/web-game/polish-baseline-20260824/`
- Main/Arena first corrections: `output/web-game/polish-pass-2/`
- Top-library interaction: `output/web-game/polish-top-library-final/`
- Decision flows: `output/web-game/polish-flows/`
- Responsive Library Top: `output/web-game/polish-pass-3/library-top-responsive/`
- Action-stage responsive matrix: `output/web-game/polish-pass-3/action-stage-responsive/`
- Mobile modal and secondary-surface matrices: `output/web-game/polish-pass-3/mobile-modal-matrix/` and `mobile-secondary-matrix/`
- 320px phone: `output/web-game/polish-pass-3/small-phone/`
- Tablet edge cases: `output/web-game/polish-pass-3/tablet-edge/`
- Short desktop: `output/web-game/polish-pass-3/short-desktop/`
- Keyboard counter flow: `output/web-game/polish-pass-3/keyboard/`
- Final 27-deck/short-desktop canary: `output/web-game/polish-pass-3/final-canary/`
