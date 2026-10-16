# Sound-effect refinement — 16 October 2026

## Behavior

The previous pack shared one sound between instants, sorceries and spell copies,
and played the same victory fanfare for every game result. The refined pack has
twelve distinct cues, including sorcery, spell copy and local-player defeat.
Solo human and Live viewer ownership choose the correct ending; draws and
unknown listeners do not receive a victory or defeat fanfare. Event mapping uses
public spell-face data and preserves face-down privacy.

All twelve effects have new `-v3.mp3` asset URLs. The original deterministic
synthesis uses shorter recurring gestures and contrasting air, wood, metal and
harmonic textures. Existing music, narration and saved volume preferences are
preserved. Previous effects remain on disk and in manifest history for clients
using earlier releases.

Three simultaneous effects are allowed. Important cues fade older duplicates
and lower-priority tails, and briefly protect their onset from smaller cues.
Late, superseded downloads are dropped. Effect previews replace earlier preview
sounds, and mute/hidden/game-switch cancellation still prevents delayed sound.

## Reproduction

`python3 scripts/generate-polished-sfx.py --metadata output/polished-sfx.json`
requires NumPy, SciPy and FFmpeg. The manifest records generator provenance,
asset hashes, duration, loudness, spectral balance and tail measurements.
Measurements and browser graph checks are not a subjective listening review.

## Validation

Native audio regressions exercise local/Live results, public spell categories,
priority bursts, preview replacement and lifecycle cancellation. Browser checks
exercise real MP3 decoding, settings and previews plus paid human/AI combat and
Stack decisions on desktop and mobile. Direct Safari testing remains unavailable
in this environment; browser verification uses Chromium.

Local results: JavaScript syntax passed; 22 native audio tests and eight browser
checks passed at 1440/390px with a 320px control-footer check. All 21 active audio
assets decoded; all twelve effects could be previewed without overlap or pending
decision changes. Independent native Web Audio checks confirmed the three-source
limit, preview fades and protection against out-of-order downloads.

A full mobile Solo match completed through 69 UI actions, played exactly one
`defeat` cue for the local loss, then rematched successfully. No page/HTTP errors.
The iOS bundle and four packaging tests passed. All 21 active and 18 retained
asset hashes match the manifest. The twelve new effects total 150,047 bytes;
measured loudness is −23.85 to −22.90 LUFS, true peaks are at most −5.48 dB,
and quiet tail padding is at most 42ms.
