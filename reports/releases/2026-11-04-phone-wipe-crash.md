# Phone crash after a board wipe, and attack-count spells — 4 November 2026

Based on `5413ed3`. Two reports from play:

- on an iPhone, Safari closed the game with "A problem repeatedly occurred on https://www.mtgpod.xyz/" after a mass wipe;
- a bot cast an instant on its own turn that creates a 1/1 for each attacking creature, although nobody was attacking.

## The crash

No device log was available. Safari shows that message when a tab's web process has died twice. On an iPhone, a web process most often dies when it runs out of memory, and graphics layers count towards that memory. So the table was measured on an emulated iPhone (390×844, device pixel ratio 3) through Chrome's DevTools protocol. Each composited layer was attributed to its element, with its texture size (width × height × 9 × 4 bytes), before, during and after a real Toxic Deluge on 56 creatures, followed by its recap.

**Before any effect, the phone table held about 89 MB of layers:**

- **The closed drawer, 23 MB.** On a phone the drawer (Stack, table information) only slides off screen. It stayed painted with `backdrop-filter: blur(20px)`, as a 596×1070 layer, all game long. Its background is 98% opaque, so the blur barely showed even when open.
- **The page grain, about 12 MB.** A 5.5% noise texture over the whole page with `mix-blend-mode: soft-light`, blended on every frame.

**A wipe added up to about 100 MB at once:**

- **the blurred cloud, 47 MB:** 170% of the screen with `filter: blur(26px)`, an 819×1591 layer;
- **the camera shake:** the whole table as one more full-screen layer, 12 MB;
- the storm and its flash, 12 MB each.

The JavaScript heap of a game is already about 250–300 MB, so a few hundred MB of graphics layers at once is a plausible way to run out on a phone.

**The repeat.** After Safari reloads, the game offers "Continue on this device". Restoring replays every action since the last turn checkpoint at once, at speed 0. Every replayed action drew its effects: board wipes, damage numbers, notices, commander arrivals and turn banners all started together. Sound and attack effects were already skipped there, but these were not. A table that crashed during a wipe would draw that same wipe, with the rest of the turn, the moment it was restored.

### Changes

- **The closed drawer is hidden.** It is `visibility: hidden` after its slide, with no backdrop blur. It no longer paints, and its controls are no longer reachable by keyboard or screen reader while closed. The phone's Stack view still shows it in place.
- **Phones skip the costly parts of a wipe.** They drop the blurred cloud and the camera shake (also the shake of big hits). They keep the flash, the shockwaves, the rune and title, and the falling cards. Desktop is unchanged.
- **No page grain on phones.**
- **Restoring draws nothing.** While a saved table is restored, no game effects, notices, spotlights, arrivals, turn banners or persona reactions are drawn. The restored board is the result. Live play draws them again.

### Measured

On the emulated iPhone, with the same wipe:

| | Before | After |
| --- | --- | --- |
| Layers at rest | 20, 89 MB | 17, 43 MB |
| Peak during the wipe | 29, 137 MB | 17, 50 MB |
| After the wipe | 16, 97 MB | 13, 50 MB |

On the destroy-all path without a recap, the peak before this change was 194 MB.

After a forced garbage collection, the DOM went from about 4,000 nodes before the wipe to about 9,600 after it: 56 more cards in graveyards and the render cache, not a leak. Before collection it reached 42,000 nodes, the normal garbage of re-rendering. This could not be confirmed on a real iPhone here. The changes remove the largest measured costs, and the restore path no longer repeats them.

## Attack-count spells

Galadhrim Ambush ("Create X 1/1 green Elf Warrior creature tokens, where X is the number of attacking creatures. Prevent all combat damage that would be dealt this turn by non-Elf creatures") and Collective Override ("a 1/1 Borg … for each attacking creature", or a card for each) were valued as ordinary token makers. Bots asked in each window:

| Window | Galadhrim Ambush, before | Collective Override, before | Both, now |
| --- | --- | --- | --- |
| own main phase 1 or 2, nobody attacking | waited | **cast, for nothing** | wait |
| an opponent's end step | **cast, for nothing** | **cast, for nothing** | wait |
| own attack with Grizzly Bears | **cast**, preventing its own Bears' damage | cast | Ambush waits, Override casts |
| an opponent attacks the bot | cast | cast | cast |
| an opponent attacks another player | cast | cast | cast |

A spell whose text counts "the number of attacking creatures" or acts "for each attacking creature" now waits for a combat with attackers. A spell that also prevents the combat damage of creatures without a type ("non-Elf") is not cast while the bot's own attackers lack that type.

## Verification

- **New browser test `tests/browser/phone-memory.mjs`**, on a 390×844 phone at device pixel ratio 3 and on a 1440×900 desktop:
  - a closed drawer is hidden with no backdrop blur, the Stack view shows it, and closing hides it again;
  - a phone wipe plays without the cloud, camera shake or grain, and keeps its flash and storm;
  - while a saved table is restored, a wipe, a damage hit and a notice draw nothing, and the next live wipe draws again;
  - the desktop keeps the full wipe.

  On `5413ed3` it fails at the first check.
- **New Node test `tests/ai-attacker-count-spells.test.mjs`:** the eleven windows above, 11 of 11. Five fail on `5413ed3`: Galadhrim Ambush at an opponent's end step and on the bot's own attack, and Collective Override in both main phases and at an opponent's end step.
- **All AI suites:** 784 of 784.
- **Browser suites pass:** `phone-table-polish`, `mobile-table-view`, `live-combat`, `action-effects`, `resolution-recap`, `command-table`, `commander-dock`, `local-solo-recovery` (restoring a table on this device), `stable-table-ui`, `interaction-continuity` and `battlefield-combat`.
