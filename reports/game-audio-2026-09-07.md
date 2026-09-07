# Commander music and sound — 7 September 2026

Implemented locally. Open **Menu → Music & sound**, or Find → Music & sound.

Three original Higgsfield/Sonilo instrumentals provide a quiet fantasy lo-fi
background: Moonlit Grove, Astral Library and Ember Sanctum. Each mastered loop
is about 88 seconds. Thirteen Higgsfield/Mirelo effects cover card placement,
summoning, attack movement, light/heavy impacts, magic bolts, explosions,
prevention, counters, portals, death, restoration/proliferate and a match-end
stinger. All assets together are 4,517,159 bytes.

Music and effects default to 18% and 38%; their volumes and mute persist on the
device. Changing music crossfades between tracks. Muting and hidden tabs stop
effect queues. Major effects can retire quieter tails at the voice limit.
Autoplay restrictions, storage failure, missing assets and stale downloads do
not block a game decision. Audio does not use the game RNG or hidden card data.
Gameplay uses local MP3 files and never calls a generation service.

The engine changes add presentation notifications after a successful cast or
land play and include the attacker count in the existing combat notification.
Damage audio consumes the engine's post-prevention outcome. Existing public
events drive the other effects. Saved-decision replay and AI simulations stay
silent. Music continues independently of reduced-motion settings.

Validation:

- 32/32 targeted tests: audio lifecycle, late downloads, track switching, mute,
  voice limits, hidden identities, paid human/local-AI actions and existing
  effects, damage UI, player tools, Command Table and commander visuals.
- Chromium 8/8 and WebKit 8/8 browser groups: desktop 1440px and phone 390px;
  touch/keyboard controls, 320px compact footer fit, exact pending-decision and
  recorded-action preservation, switching all tracks and independent volumes.
- All sixteen files decode in both engines with nonzero waveform energy and
  conservative peaks. The running browser audio graph produces nonzero output.
- Real human land play exercises the production event callback. Controlled
  public boards exercise human and local-AI six-mana casts with Stack/Proceed,
  a six-damage attack, prevention, twelve noncombat damage and exile. Expected
  cues fire, life totals match and no AI fallback is recorded.
- No captured page, console or audio-response errors. Screenshots and text
  states inspected. Standard unmodified develop-web-game client also reaches
  real Quick Draw main phase. Syntax and `git diff --check` pass.

Two integration faults were found and corrected: Safari could lose a mute
click when an unchanged button text node was replaced during audio unlock;
simultaneous sound tails could crowd out an important explosion. Both final
browser runs pass after these fixes.

Exact prompts, provider job IDs, timestamps and asset hashes are in
`assets/audio/manifest.json`; rebuilding is documented in `assets/audio/README.md`.
Raw evidence is under the ignored `output/game-audio/` folder. No full repository
regression, commit, push or deployment was performed for this task. Existing
Station AI work was preserved; it was committed separately during this run.
