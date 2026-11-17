# The phone's Combat view and single removals — 17 November 2026

Based on `f0995ef`. Two reports from a player on a phone:

- after a combat the screen stays on the Combat view, and it should not;
- a removal of one card needs an animation and a highlight too, whether it is the player's own or not.

## The Combat view stayed open

**What happened.** The phone's Combat view opens by itself in two ways: for a combat decision (attackers, blockers, the combat review that waits for `Proceed`), and for the charge when attackers and blockers meet. Only the charge remembered the view it had replaced, and it gave that view back only if no decision was waiting when the charge ended.

- An opponent's combat is reviewed by every player. The review opened the Combat view, `Proceed` closed the review, and nothing brought the old view back. The phone showed an empty Combat view through the rest of that turn and the turns after it, until the next decision.
- After a charge, a decision that was already waiting (a priority window, a review) kept the Combat view and dropped the way back for good.

**Now.** Whoever opened the Combat view, the view the player had comes back when combat is over: the combat phase has ended and no combat decision is waiting (`src/modules/action-effects.js`, `src/modules/battlefield-combat.js`).

- A decision of the main phase or the end step no longer holds the Combat view.
- The view fades out as it did after a charge; reduced motion switches at once.
- A view the player chose during combat is kept. A Combat view the player opened by hand stays open.

## One removal passed without a word

**What happened.** Three or more permanents leaving at once are a board wipe: a storm over the table, then a table highlight. A card exiled by a spell was a highlight too (`Into exile`). A card that was destroyed, sacrificed to an edict, returned to hand or killed by damage only flew to its zone with a small label. Nothing showed who did it, and nothing stopped for it. `tests/resolution-recap.test.mjs` pinned that: "single removal stays quiet".

**The table now shows it** (`src/modules/ui.js`, `showZoneMoveEffect`; `src/motion.css`) when a spell or ability removes another player's card, whoever cast it and whoever owned the card:

- a beam from the one who did it: its source if that is a permanent on screen, otherwise its controller's seat;
- a frame that closes on the card, and the hit: a blade for destroyed, sacrificed and died, a closing ring for exile, a rising streak for a return to hand, library or command zone;
- a plate with the verb, the card and the source: `DESTROYED · Riders of Gavony · Murder · AI Dragon`;
- the card takes the hit where it stands, then leaves as before; its lane closes the gap when it leaves (`src/modules/motion.js`).

On a phone the card is often on another view. The plate then comes to the upper part of the screen with the card's picture, and the hit lands on the picture.

**And it is a table highlight** (`src/modules/resolution-recap.js`): a spell or ability that removes another player's nontoken permanent ends in a highlight for every player, the one who cast it included. The headline is the verb (`Destroyed`, `Sacrificed`, `Returned to hand`, `Put into library`, `Creature died`), the row names the card and its way (`Riders of Gavony · AI Dragon: destroyed, battlefield → graveyard.`), and the highlight waits for the hit to play. Two removals name both cards. Three or more are the upheaval they were.

**What stays quiet.**

- A token of another player: the table shows the hit, with no highlight.
- What a player's own effect does to their own card (a bounce land returning a land, a sacrifice of their own), a cost paid with nothing resolving, and a Treasure or Clue spent while another effect resolves: a plain flight with the zone's label, as before.
- Combat, which has its own review.

**How the table knows.** The engine sends the cause with the move (`src/modules/engine.js`, `move`): the spell or ability that is resolving, its controller, and whether the card was destroyed or sacrificed, which the destination alone does not say. A state-based death right after a resolution belongs to it; a source that leaves by its own effect is not something it removed. No rule changed. Live guests receive the same fields.

## Verification

**New and changed tests.**

- `tests/browser/phone-table-polish.mjs`: on a phone, with motion and with reduced motion, the Combat view opens for my attack and for a block, and the view I had comes back when combat is over; a view I choose during combat is kept and a Combat view I open stays. On the released code this fails at the block: the phone stays on Combat.
- `tests/browser/single-removal.mjs` (new, 8 checks): an opponent's destroy on another opponent at the game's normal pace (beam, frame on the card's place, hit, plate, no second label, the lane's wait, nothing takes a click, the highlight more than 700 ms after the hit), my own exile, a bounce of my card, the quiet cases (a cost, a player's own card, a spent Treasure), a phone with the card on another view and with the card on screen, reduced motion.
- `tests/resolution-recap.test.mjs`: the test that pinned "single removal stays quiet" is replaced by nine: the highlight for an opponent's removal, for my own, between two opponents, each verb, a destroyed commander, two and three removals, what stays quiet, and the fields the engine sends. 41 tests pass.

**Node tests.** 183 test files that load the interface or mention these events, highlights, phone views or Live publishing: 2,967 tests pass and one fails.

- The failure is `oracle-bulk-interactions`, a 52-minute proof of every compiled card: 2,681 cards of newer compiler classes have no proof in it. It fails with the same count on the released commit `f0995ef`, run for this comparison. It is not repaired here.
- After the last change to the code, the ten files that read the changed modules ran again (122 tests, none failing). `npm run check`, `node scripts/build-startup-catalog.mjs --check` and `git diff --check` pass.

**Browser suites.** 78 of the 146 ran in two lanes: the 47 interface suites, the new one, and every suite that mentions removal, highlights, effects or the phone's views. 75 passed.

- `c15-c16-control` needs the page served with its account API on port 8320 and passes with it.
- `resolution-recap` expected Chaos Warp's result in a corner; it shuffles your permanent away, so it is a table highlight now, and the reveal it explains stays in view under the removal. The suite expects that.
- `second-audit-browser-destinations` opened the Combat tab while the new highlight for its bounce was showing. It reads the highlight first.
- After those updates, ten suites ran alone and pass: the three above, `resolution-recap-highlights`, `single-removal`, `second-audit-browser-priority`, `mass-wipe-live`, `effect-anchors`, `zone-flights` and `phone-table-polish`.
- After the last change to the code (a player's own card is not marked), ten ran alone again and pass: `single-removal`, `resolution-recap`, `zone-flights`, `effect-anchors`, `table-motion`, `live-combat`, `mass-wipe-live`, `combat-replay`, `action-effects` and `stable-table-ui`.

**A real game on a phone.** One four-player game through the interface on a 390×844 phone, your seat answered by a bot after each decision was shown: 29 turns, no page error.

- The Combat view was open outside combat for half a second at most, which is its fade.
- Four removals were marked, all cast by opponents (`DESTROYED · Kamiz, Obscura Oculus · Terminate · AI Raven`, `EXILED · Kalemne, Disciple of Iroas · Swords to Plowshares · AI Dragon`), and the highlights `Destroyed` and `Into exile` followed.
- The fourth was a bounce land returning its controller's own land. That led to the last rule above: a player's own card is no longer marked. The game was not played again after that change; the suite covers it.

**How often.** Counted in three whole bot games: 1, 10 and 8 single-removal highlights in 30, 51 and 42 turns, beside 0, 2 and 2 wipes.

**Not verified.**

- The other 68 browser suites (mostly deck lists, imports, accounts and Live rooms) did not run in this round, nor did the complete node suite or the bot sweep. No rule changed: the engine adds fields to an event and passes one option.
- A Live guest receives the new fields through the existing encoder, which already carries cards and players. No Live game with a removal was looked at, so a guest's plate was not seen.
- Chromium at phone and desktop sizes; no iPhone was at hand.
