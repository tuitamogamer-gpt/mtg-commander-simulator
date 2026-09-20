# Action sound effects — 20 September 2026

Five original effects were generated with Higgsfield's `mirelo_text_to_audio`
model, using the account selected by the user. The total generation charge was
1.76 credits. The existing three music loops and four milestone effects remain
unchanged. The five new MP3s total 77,017 bytes.

| Effect | Mastered duration | Gameplay use |
| --- | --- | --- |
| Combat | 1.28 s | Nonempty attacker declaration |
| Venture | 2.01 s | Entering a dungeon room, including Undercity |
| Counters | 0.23 s | Public counter additions and proliferate |
| Counterspell | 1.53 s | Successfully countered spells and abilities |
| Instant | 1.02 s | Instant casts; pitch/volume variations for sorceries and spell copies |

All generation prompts, completed job IDs, dates and mastered asset hashes are
recorded in `assets/audio/manifest.json`. Sources are cached in the ignored
`output/game-audio/raw/` directory. The generator supports selecting individual
assets with `--only`, resolves the Windows CLI launcher, and saves submitted
job IDs before waiting. Combat's initial submission succeeded but returned an
ID-only CLI response; that exact completed job was recovered and reused, with
no duplicate generation charge.

Effects use the existing relative onset trim, RMS/peak ceilings and short fades.
The counters source became a compact click after silence trimming. The game
mixes action cues below the existing effects bus volume, batches simultaneous
events, applies 0.8–1.2 second per-action cooldowns and preserves the longer
milestone cooldowns. Audio does not consume game RNG or change decisions.

`Menu → Music & sound` now includes an effect selector for individual previews.
The engine publishes the types of the chosen spell face, so Adventure and split
spells receive the appropriate cue. Face-down spell identities remain silent;
public counters on a face-down battlefield permanent can still make the generic
counter sound. Live publishes cast, combat and dungeon notifications to both
seats without replaying the backlog on reconnect.

## Validation

- `npm.cmd run check` and `git diff --check` pass.
- 11 audio tests pass, including paid casts, Adventure typing, successful versus
  failed counters, venture, proliferate, cooldowns, mute and hidden information.
- A new Live round-trip test verifies the same action cues for host and guest,
  hidden-card redaction, duplicate snapshot suppression and reconnect silence.
- All 20 existing multiplayer parity tests pass. The preceding focused dungeon,
  commander visual, marked-damage and player-tool checks also passed (32 tests).
- Chromium: all 8 browser groups pass at desktop 1440 px and phone 390 px,
  including all 12 MP3s decoding, a nonzero audio output signal, five effect
  previews, independent levels, mute, and paid human/local-AI combat. The 320 px
  settings layout was also checked. Captured page/console/audio errors: none.
- The browser fixture now starts an isolated in-memory account server by
  default. An initial run against the static Solo server completed its audio
  checks but failed its console assertion on the expected missing account API;
  the final run against the proper fixture passes.
- WebKit could not start because its Playwright browser binary is not installed
  on this workstation. Safari behavior was not validated in this revision.
- No full repository suite was run. After these checks, the user requested a
  combined commit, push and production deployment of audio and the prior Monarch
  layout fix, explicitly without further tests. No additional tests were run
  for that release request.

Browser evidence is in `output/game-audio/chromium/`. A local listening page is
available at `output/game-audio/preview.html` while the preview server is running.
The release also includes the prior Monarch layout correction in
`src/modules/command-table.js` and `src/command-table.css`: Monarch, dungeon and
player-effect badges occupy a separate wrapping row, with readable Monarch text
on narrow screens. That task had already completed its own validation.
Unrelated in-progress Oracle import work was excluded from the release.
