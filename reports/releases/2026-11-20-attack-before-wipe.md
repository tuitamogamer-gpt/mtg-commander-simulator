# Bots attack before a board wipe, the wipe's sounds, the phone hand — 20 November 2026

Based on `c223b01`. Three things from the play test of the phone table:

- the phone design is liked, except the fan of hand cards: take only that back;
- bots still make a mistake: with a mass wipe in hand they should attack first, for whatever damage that deals, and cast the wipe in their second main phase;
- make the wipe's sound with Fish Audio, the way professional sound editors work.

## Bots: attack, then sweep

**What happened.** A bot scored a board wipe like any other spell and cast it as soon as it was the best play, which is the first main phase. Its own creatures died with everyone else's and combat had nothing in it. In ten whole bot games, 16 of 19 staged wipes were cast in a first main phase and none in a second.

**Now** (`src/modules/ai-v2.js`):

- **The first main phase holds the sweep.** If a sweep the bot would cast this turn takes creatures of its own that can attack now, casting it scores −80 (`attackFirst` in the decision's breakdown), so the bot goes to combat. With two sweeps in hand both are held; the first version held the better one and the bot cast the other in its place, which a whole game showed.
- **Nothing before it spends its mana.** A spell or ability that would leave less mana than the held sweep costs loses 40 points, in the first main phase and in combat's priority windows.
- **Everything the sweep would take attacks.** At the declaration of attackers those creatures are expendable: no price for a bad block, a free block or a wall, no blockers kept home against creatures the sweep removes, and three points and a little for attacking at all, because a creature the defender lets through connects and a block spares nobody. A 2/2 and a 3/3 that stayed home in front of six 5/5s now both attack.
- **The second main phase casts it**, judged again on the board combat left.

**When the sweep still goes first:**

- it spares the bot's creatures (one-sided), or the attackers that survive it hit harder than the ones it takes: they attack into an empty table;
- nothing of the bot's that it takes can attack (summoning sick, tapped, no power, no legal target);
- the only attacker taps for mana: it pays for the sweep;
- its cost is being reduced by the table (Blasphemous Act and Vanquish the Horde cost one less for each creature) and the bot could not pay if every attacker and a blocker each died in combat. "One less for each creature" is read exactly: the cost rises only once fewer creatures remain than its generic cost.

**Which sweeps.** The exact model the bot already had (`boardWipeImpact`), and for the order of the turn a looser reading (`sweepReach`): `destroy` or `exile all` creatures with `nontoken`, `nonartifact`, a colour, or a power, toughness or mana value limit, a fixed damage to each creature, and a return of all creatures to hand. Nothing is assumed about a sweep that is one-sided in other words, targeted, modal, decided on resolution, depends on X, or spares tapped creatures (an attacker is tapped by then).

The plan is kept beside the game, not in it: a simulation's copy has none and a save drops it. The fallback controller (`ai.js`) holds the sweep in the first main phase too.

## The wipe's sounds, edited from Fish Audio

The three sounds of a staged wipe were synthesized by a script. They are now cut from six sound effects generated with Fish Audio: two each for "a riser", "an impact" and "a breaking hit", 30,000 credits in all (124,560 before).

What came back is raw material, as measured: neither riser rises (one is level for two seconds, the other falls), one impact is three seconds of unbroken rumble and the other begins after 1.13 seconds of silence and does not decay, one break is a 0.1-second bright crack and the other a quiet burst of noise. None could be used as it was. `scripts/master-wipe-sfx.py` edits them, the way a sound editor cuts recordings:

- **charge** (1.08 s): a rumble played at a rising speed under a low-pass filter that opens, on a level that rises 27 dB; the second rumble under it; the hit's sustained noise through a climbing band as the whoosh; the crack played backwards into the cut.
- **impact** (1.85 s): the crack as the transient with a copy an octave down as the knock; the hit from its onset under a filter that closes; the drone slowed down and kept to the low octaves as the boom; the hit's ringing second half as settling debris.
- **shatter** (0.30 s): the crack from its loudest part, with its top taken off because it repeats once per card; a thud cut from the hit; two gated grains.

They meet the pack's own checks (loudness, peak, a clean end, no energy below 45 Hz, no harsh top). Against version 1 the charge carries 74% of its energy above 300 Hz instead of 61%, and the impact 48% instead of 34%: that is the part a phone speaker plays. The manifest records each prompt, task id, permanent URL and hash; the sources are downloaded by the script, not committed. Version 1 stays as legacy tracks.

## The phone hand

The fan of overlapping cards is taken out. The hand is a row of cards side by side that scrolls, as before the phone work, at the larger size (90×126 px on a tall phone). The rest of the phone table is unchanged.

## Verification

**Bots.**

- `tests/ai-attack-before-wipe.test.mjs` (new, 14 tests): the first main phase ends without the sweep (ranking, search and the fallback controller agree); the two creatures attack where they stayed home before; the sweep is cast in the second main phase; a whole turn through the engine's own main and combat phases ends with the sweep in the graveyard and no creature left; a one-sided sweep, creatures that cannot attack, a surviving hard hitter and a mana creature do not hold it back; mana for it is kept; a reduced cost waits only with mana to spare; texts the exact model does not read; what is not assumed; two sweeps in hand; the plan is forgotten on another turn.
- `tests/ai-v2.test.mjs`: one existing test expected the sweep in the first main phase with a 1/1 that could attack; it now expects it held there and cast in the second.
- The bot's own test files (`ai-*`, `combat-transition-audit`), the 38 other test files that call its decisions, and the wipe staging and audio tests, run together after the last change: 1,932 tests pass, none fail.
- **Thirty-four whole four-player bot games** through the engine (1,560 turns, no fallback decision): 52 staged wipes on the caster's own turn. Eight were cast in a second main phase after the bot attacked (Blasphemous Act four times, Shatter the Sky, Necromantic Selection, Hour of Reckoning, Deadly Tempest). Of the 35 still cast in a first main phase, 15 took no creature of the caster's, 6 were abilities of permanents and not spells, and 12 took a creature that could have attacked: six with a cost the table reduces (five Blasphemous Act, one Vanquish the Horde), three with texts the reading does not cover (Nova Flame twice, Celestial Judgment), and three where the rule itself says first (Hour of Reckoning and Organic Extinction, whose survivors hit harder; Rout). The remaining nine were in combat or upkeep, from abilities and free casts.

**Sounds.** `tests/board-wipe-staging.test.mjs` and `tests/game-audio.test.mjs`: 41 pass. `tests/browser/game-audio.mjs` (10 checks, real MP3 decoding and playback in Chromium), `board-wipe.mjs` (5) and `mass-wipe-restored.mjs` pass with the new files.

**Phone hand.** `tests/browser/phone-table.mjs` (10 checks, the hand check rewritten for a row), `commander-dock`, `phone-table-polish`, `mobile-table-view`, `command-table` and `card-art-edges` pass.

**In the interface.** One four-player Solo game on a 1440×900 desktop with a bot in every seat, at the Fast pace for three minutes: 25 turns, 2,227 events, no page error and no bot error. No wipe happened in it.

`npm run check`, `node scripts/build-startup-catalog.mjs --check` and `git diff --check` pass.

**Not verified.**

- **The sounds were not heard.** This environment has no audio output. Their envelopes, brightness over time, spectra and stereo width were measured from the decoded files, and they were sent to the player to listen to. Whether they sound like a professional's work is for an ear to say.
- A bot that holds a cost-reduced sweep and then cannot pay for it after combat was not seen in the games; the rule that prevents it is conservative and keeps half of the Blasphemous Acts in the first main phase.
- Mass removal from a permanent's ability (Massacre Girl, Carnifex Demon) and sweeps with a target or a choice (Nova Flame, Celestial Judgment, Kindred Dominance) are ordered as before.
- No game was played by hand against the bots after the change; the whole-turn test and the 34 games are the engine's own.
- The rest of the node suite and the other browser suites did not run in this round.
