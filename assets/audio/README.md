# Commander audio

Three original instrumentals and four milestone effects generated through the user's
Higgsfield account on 7 September 2026. The model catalog and CLI were checked:
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
limits concurrent effects and coalesces simultaneous milestones. Repeated cues
are spaced at least 2.5 seconds apart. The audio
graph includes a compressor to control overlaps. Device mute/volume settings
are independent of game state and reduced motion.

Menu → Music & sound offers track selection, both volume controls, mute and a
sample. A browser interaction unlocks playback; hidden tabs suspend audio.
Effects are limited to commander/powerhouse arrivals (summon), actual combat
damage of 10 or more (heavy impact), actual noncombat damage of 10 or more or a
board wipe affecting at least three cards (explosion), and game end (victory).
Land and card plays, attack declarations, smaller hits, prevention, counters,
ordinary removal and other routine actions stay silent. The nine routine effect
files were removed at the user's request. Save replay, AI simulations, hidden
identities and UI rerenders do not trigger sounds.

To master already completed jobs, run `python3 scripts/generate-game-audio.py`.
It requires NumPy, FFmpeg and network access for uncached result downloads.
`--generate` additionally submits missing Higgsfield jobs and may spend credits;
it resumes completed jobs and uses the account's single-job audio queue.

Existing coverage: `tests/game-audio.test.mjs` and `tests/browser/game-audio.mjs`.
The browser suite exercises actual paid human/local-AI spells, Stack reviews,
attack declaration, damage/prevention and exile, plus MP3 decoding and the
running Web Audio graph on desktop and phone layouts. Expectations were updated
for milestone-only audio; tests were not rerun for this revision, as requested.
