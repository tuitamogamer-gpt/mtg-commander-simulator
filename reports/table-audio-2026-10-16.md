# Card presentation, dungeon header and audio — 16 October 2026

## Changes

- Loaded battlefield, hand and land art sets its frame height, removing the empty
  colored strip below the printed card. Image failures, face-down privacy,
  commander outlines, counters and damage indicators retain their existing UI.
- Tapped lands retain rotation and accessible status, without a printed TAPPED
  overlay. Hover and click inspection still expose card details.
- Dungeon controls share the opponent's effects row. Compact desktop headers
  apply up to 800px viewport height so creatures/support remain above the land
  dock. Proceed and utility drawers preserve table geometry.
- Three new original instrumentals (Council at Dusk, Aether Tides, Emberwatch)
  and nine newly synthesized effects are local MP3 assets. Effects use versioned
  URLs; old assets remain for cached clients. Existing music choices persist.
- Fish Studio's official Sarah voice provides three short English announcements.
  Narration defaults to off and has its own volume and preview. Only the local
  player's turn is announced. Speech never overlaps; music ducks briefly.
  Muting, hiding the page, changing games and advancing to another player's turn
  cancel pending/stale speech. Save/reconnect playback is silent.

## Reproduction and regression coverage

Before the change, loaded art left a 9.32px footer at the screenshot's desktop
size; a Dungeon+Effects header hid approximately 39px of the battlefield cards
behind the resource dock. The new intrinsic-art sizing also exposed a
marked-damage min-content sizing issue during independent review; inline-size
containment and a shared grid cell keep those cards compact with readable stats.

`tests/browser/card-art-edges.mjs` covers full art without cropping/stretching,
damaged cards, native target selection/confirmation, Dungeon open/close, hover,
inspection, stable Proceed geometry, tapped accessibility, mobile full hand,
failed images, face-down privacy and token fallbacks at 2048×1181, 1366×768 and
390×844. `tests/browser/stable-table-ui.mjs` covers existing Table/Focus/combat
and utility behavior across four viewport widths.

`tests/game-audio.test.mjs` covers native event ownership, paid human/AI actions,
Live snapshots, preferences, lifecycle cancellation and volume isolation.
`tests/browser/game-audio.mjs` decodes all 18 current assets and exercises the
real audio graph, six music choices, nine effects, three voice previews and
pending-decision preservation at desktop and narrow mobile widths.

The asset manifest records exact provenance and SHA-256 hashes. New instruments
and effects are deterministic local synthesis, not Fish-generated music. Fish
was used only for the three spoken cues. Measurements cover decoding, loudness,
peaks and loop boundaries; these are not a subjective listening assessment.

Browser automation uses Chromium with desktop/mobile viewports. WebKit could
not launch in this environment because required OS libraries are unavailable;
no direct Safari verification is claimed.

## Local validation

- JavaScript syntax check passed.
- Native audio suite: 16 passed; decision/render/wait UI suites: 26 passed.
- Card-art browser suite: 5 groups, 75 loaded-art measurements, no page errors.
- Existing stable-table browser suite: 12 checks passed.
- Complete mobile Solo match: 69 UI actions, 4 land plays, 6 spells, 2 attacks,
  game end and rematch; no page or HTTP errors.
- iOS offline bundle and its four packaging tests passed.
- All 18 active and 9 retained legacy asset hashes verified against the manifest.
  New music: 85–96 seconds, −22.45 LUFS; loop boundary deltas below 0.001.
  New SFX: 0.52–2.45 seconds, true peaks at or below −5.52 dB.
- Audio browser suite: 8/8 checks at 1440/390px, with a 320px control-footer
  check; all 18 final MP3s decode, six tracks and three voices preview, paid
  human/AI combat and Stack interactions succeed, zero browser errors.
