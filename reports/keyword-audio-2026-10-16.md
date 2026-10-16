# Keyword sounds and spoken play comments — 16 October 2026

## Behavior

The game now has thirteen keyword cues: flying, vigilance, haste, menace,
reach, first strike, double strike, trample, lifelink, deathtouch, infect,
wither and proliferate. These are short, original synthesized sounds served
with the game. A brief event batch selects one representative keyword cue;
major impacts and victory/defeat retain priority. Existing mixer limits,
preferences, music and earlier effects remain in place.

Six new English Fish Studio Sarah clips mark a heavy player hit (12+ actual
damage), a wipe (5+ actual departures), a countered public spell (mana value
6+), a huge arrival (power 8+ or toughness 10+), a recovery (gain 8+, starting
at 10 or less and ending at 15 or more) and a token army (5+ creature tokens
created in one batch, excluding spell copies). Their exact texts, generation
task IDs, public source URLs and mastering filter are in the manifest.

Narration is optional, with its existing default of 0%. The Music & sound panel
has independent narration volume and previews. Comments share an 18-second
cooldown, skip during active/loading speech and never delay gameplay. Game
result speech can preempt a comment. Hidden tabs, simulations and replay do
not produce missed announcements; rematches reset the commentary state.

## Event accuracy

Audio receives a narrow, immutable set of public facts, captured at the
completed event and sanitized again for Live delivery. It does not inspect
private card definitions, names or later mutable characteristics. Damage and
life-gain facts follow prevention/replacements. Haste requires an otherwise
summoning-sick attacker; reach requires blocking a flyer. Strike sounds require
positive actual damage. Trample requires positive overflow reaching its
assigned recipient rather than a redirected target. Deathtouch requires a
real departure, excluding regeneration and indestructible survival. Wipe
comments use post-result zone changes rather than the old candidate count.

Special defensive/banding assignment branches without a reliable overflow
marker remain silent for trample. This is an audio coverage limit; combat rules
and outcomes are unchanged. Presentation hooks do not consume gameplay RNG.

## Assets and reproduction

The manifest now has 40 active assets: 6 music tracks, 25 effects and 9 voice clips,
plus 18 retained legacy effects. The thirteen keyword MP3s total 107,771 bytes;
the six new voice MP3s total 115,351 bytes. Assets load on demand from the game,
without an external provider or account key at playback.

`python3 scripts/generate-keyword-sfx.py --metadata output/keyword-sfx.json`
regenerates original keyword effects with NumPy, SciPy and FFmpeg. Its helper
source is `scripts/generate-polished-sfx.py`; both source hashes are recorded.
Keyword duration is 0.30–0.90 seconds, measured loudness −23.55 to −23.21 LUFS,
true peaks at most −5.35 dB, and quiet tails at most 40 ms. A deterministic rerender
matched its asset hash. Fish voice sources can be downloaded and mastered
using the manifest's recorded filter; generating new speech is separate.

Measurements and automated audio-graph checks do not constitute a subjective
listening review. Direct Safari/WebKit execution is unavailable in this
environment; browser checks use Chromium desktop and phone layouts.

## Validation

JavaScript syntax and diff checks passed. Runtime tests: 28/28. Engine/public
facts: 19 new tests passed in a 75-test focused bundle, with a further 91 existing
combat/counter regressions passing. Independent review reproduced and verified
the proliferate fix: opponent Vorinclex reducing an addition to zero produces
no keyword cue, while the positive control does.

Chromium browser checks: 10/10 at 1440px and 390px, plus a 320px footer check.
All 40 active MP3s decoded; all 25 effects and 9 voices previewed. Real engine
lifelink and a 12-damage event produced output on their effects/narration buses;
prevented damage stayed silent and a later recovery respected the shared
commentary cooldown. No browser errors.

A complete mobile Solo match exercised 69 UI iterations, 4 land plays, 6 spell
casts and 2 attack declarations across 8 decision types. It finished on turn 16,
played exactly one local defeat sound, then rematched with preferences intact.
Zero page errors or HTTP failures. The iOS bundle and 4 packaging tests passed;
all 40 bundled audio hashes match the manifest. All 40 active and 18 retained
asset hashes were checked locally.
