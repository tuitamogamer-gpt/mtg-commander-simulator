# Commander audio

Three original instrumentals and four milestone effects generated through the user's
Higgsfield account on 7 September 2026, plus five action effects generated on
20 September 2026. The model catalog and CLI were checked:
`sonilo_music` generated music and `mirelo_text_to_audio` generated effects.
These use original fantasy prompts. No existing soundtrack was supplied as a
reference or sampled in the asset pipeline.

`manifest.json` records the exact submitted prompts, model, completed job IDs,
generation dates, mastered durations, file sizes and SHA-256 hashes. Raw results are cached in
the ignored `output/game-audio/raw` folder. No provider API or account token is
required by the game; all playback is local, from these MP3 files.

| Instrumental | Character | Loop |
| --- | --- | --- |
| Moonlit Grove | Felt piano, wooden harp, soft drums | about 88 seconds |
| Astral Library | Dusty keys, celesta, floating pads | about 88 seconds |
| Ember Sanctum | Nylon guitar, dark warm pads, hand percussion | about 88 seconds |

Music uses a baked circular two-second crossfade and -22 LUFS mastering, with a
-3 dB true-peak target. Effects use relative onset trimming, a -20.9 dB RMS
ceiling and a -3.7 dB sample-peak ceiling before MP3 encoding, plus short fades.
The runtime defaults to 18% music and 38% effects, crossfades track changes,
limits concurrent effects and coalesces simultaneous events. Action cues have
0.8–1.2 second cooldowns; milestone cues retain their 2.5-second cooldown. The audio
graph includes a compressor to control overlaps. Device mute/volume settings
are independent of game state and reduced motion.

Menu → Music & sound offers track selection, both volume controls, mute and a
selector for previewing each effect. A browser interaction unlocks playback;
hidden tabs suspend audio.

| Action effect | Trigger |
| --- | --- |
| Combat | A nonempty attack declaration |
| Venture | Entering a dungeon room, including Undercity |
| Counters | Adding public battlefield/player counters or proliferating chosen subjects |
| Counterspell | Successfully countering a spell or ability |
| Instant | Casting an instant; softer/lower variation for sorceries and a higher variation for spell copies |

Spell cues use the public types of the selected spell face, so Adventures and
split cards are classified by what was cast. Face-down spell identities never
select a sound. Repeated counters and simultaneous notices coalesce into one cue.
Live forwards the same public cast, combat and dungeon notifications; joining or
reconnecting does not replay the event backlog.

Existing effects mark commander/powerhouse arrivals (summon), actual combat
damage of 10 or more (heavy impact), actual noncombat damage of 10 or more or a
board wipe affecting at least three cards (explosion), and game end (victory).
Land plays, ordinary permanent casts, smaller hits, prevention and ordinary
removal stay silent. Save replay, AI simulations, hidden
identities and UI rerenders do not trigger sounds.

To master already completed jobs, run `python scripts/generate-game-audio.py`.
It requires NumPy, FFmpeg and network access for uncached result downloads.
`--generate` additionally submits missing Higgsfield jobs and may spend credits;
it resumes completed jobs and uses the account's single-job audio queue. Submitted
job IDs are saved before waiting, so a resumed run does not submit them again.
On Windows the script resolves `higgsfield.cmd` automatically. To regenerate or
master only this action set while preserving the existing assets and manifest:

```powershell
python scripts/generate-game-audio.py --only combat venture counters counterspell instant
```

Add `--generate` only to submit missing jobs on the signed-in account.

Existing coverage: `tests/game-audio.test.mjs` and `tests/browser/game-audio.mjs`.
The browser suite exercises actual paid human/local-AI spells, Stack reviews,
attack declaration, damage/prevention and exile, plus MP3 decoding and the
running Web Audio graph and individual effect previews on desktop and phone
layouts. See `reports/game-audio-2026-09-20.md` for this revision's validation.
