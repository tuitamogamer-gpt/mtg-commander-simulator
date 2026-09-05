# Command Table design QA — 2026-09-05

Scope: the approved combination of tactical Table/Focus, visual four-seat review, and focused phone navigation in the existing game. Worktree: `codex/command-table-frontend`, originally based on `1376abe`. The initial implementation was local; the subsequent authorized release verification is recorded below.

## Source and comparison evidence

The three concept references are in `/Users/borislavvukojevic/.codex/generated_images/01a07233-1ec2-7462-8b2a-3eac2403b4fa/`:

- Desktop: `exec-187f5a2e-1737-410c-baec-8dcbf0a8de71.png`, 1487 × 1058.
- Review: `exec-635dab55-4b3f-49b8-9c13-a7580466cf34.png`, 1487 × 1058.
- Phone: `exec-3d446828-6c25-40bb-857f-d2c41838485b.png`, 853 × 1844.

**The user explicitly superseded the concept illustrations: every card and commander image must remain from Scryfall, including existing local copies.** The concepts are layout references. No generated illustration is referenced by application source or added to `assets/`. Main-menu card images remain unchanged. New portraits use `MTG.cardImageURL(name, 'art')`; cards retain the existing full-card resolver.

Actual screenshots use Chromium, deviceScaleFactor 1, 1440 × 1024 and 390 × 844 CSS viewports, reduced motion, and the existing dark theme. Setup uses Quick Draw, Elven Council, Squirreled Away and Temur Roar. The arena fixture is a public four-player turn-8 board, with seven cards in the viewer's hand and Beast Within targeting the viewer's Sol Ring. Card identities, stats, mana and colors are actual engine data; the concept's invented text and illustrations are intentionally not copied. Politics is off in this fixture, so its optional destination is absent.

The `compare-*.html` pages normalize both images into identical CSS frames without modifying image files. Desktop/reference frames are 1440 × 1024; phone frames are 390 × 844. `object-fit: contain` accounts for the reference's sub-pixel aspect-ratio difference. The comparison captures have DPR 1. Each pair was opened together and inspected, including card names/counters, response controls and setup labels at full resolution.

Evidence under `output/web-game/command-table/`:

- `comparison-desktop.png`, `comparison-mobile.png`, `comparison-review.png`: normalized reference and implementation pairs.
- `desktop-table.png`, `desktop-focus.png`, `response-1440.png`, `response-1280.png`, `response-390.png`, `response-320.png`.
- `review-1440.png`, `review-1280.png`, `review-390.png`, `mobile-crowded.png`, `report.json`.

## Findings and corrections

The first comparison was blocked by the following issues. They were corrected and recaptured before final assessment.

| Severity | Finding | Correction and evidence |
| --- | --- | --- |
| P1 | Decision rail could cover a blocking combat dialog. | Explicit overlay stacking restores pointer access. Complete human game subsequently finished, including blocking and rematch. |
| P1 | Legacy mobile Stack grid created implicit columns. | Stack drawer now owns its explicit grid area; hidden zones cannot add tracks. Mobile view-switching suite passes. |
| P1 | Legacy active-seat hiding could hide a selected opponent. | Excluded Command Table from those legacy selectors. Each of the three seat buttons now shows the chosen battlefield while retaining priority. |
| P2 | Short-phone rows could push bottom navigation off screen. | Retired legacy row overrides, corrected header/tab sizing, and verified normal/empty/large hands through 320 × 568. |
| P2 | Top controls were smaller than the 44px touch target. | Increased controls to 44 × 44 and verified hit geometry. |
| P2 | Mobile response text hid the spell's target below other details. | Added a public spell-to-target summary above the original response/Proceed controls. |
| P2 | Resource labels/counts and horizontal target flow were clipped. | Restored labels to normal flow, removed the inherited narrow resource limit, allowed land-count height and stacked the target flow vertically in the rail. |
| P2 | Review art and primary-button width were excessive on shorter desktops. | Art height follows available height; primary action has a bounded desktop width. Setup remains scrollable on short screens with Start game available. |
| P2 | Large-hand preference did not change card dimensions. | Reserved additional row height and verified actual card dimensions increase without pushing navigation off screen. |

## Required fidelity surfaces

- **Fonts and typography:** existing Bricolage Grotesque/Manrope/JetBrains Mono roles retained. Live life, counters and card names remain legible; full Oracle text is available through existing inspection. Compact card printing is not enlarged by fabricating text.
- **Spacing and layout:** three desktop opponent zones, human battlefield/hand and a stable decision rail follow the approved composition. Phone keeps seat summaries, the selected opponent, own battlefield, response tray and bottom navigation. Crowded zones scroll; short screens intentionally require scrolling within zones and through review details.
- **Colors and tokens:** new surfaces use the existing design tokens, seat accents and ember action color. Existing selected/targetable/damage states remain visible. Existing arena-background preference is retained.
- **Image quality:** all rendered card and commander images are Scryfall images/local copies. Portrait crops preserve aspect ratio with `object-fit: cover`; full card faces use their existing source. Official portraits intentionally differ from generated references.
- **Copy and content:** real commander/deck names, color identity, counters and optional Politics state replace mock content. Existing HOLD, mana mode, explicit Proceed and response semantics are preserved. Setup Change controls return to real selections.

## Functional evidence and limits

- `npm run check` and `git diff --check`: pass.
- Targeted frontend/state tests: 22/22 pass.
- `player-experience.mjs`: deck discovery, presets/save/restore, card inspection, search, keyboard ownership, sorting, preferences, and real land play pass; setup checked at 320/390/820/1280/1900px.
- `command-table.mjs`: official portraits, seat changes, persistent Focus, target selection through actual UI promises, priority retention, responsive reachable Proceed, 18-card hand, larger-card preference and preserved scroll positions pass.
- `mobile-table-view.mjs`: real four-player view switching and land play, normal/empty/large hands at 320 × 568, 390 × 720/844, 430 × 932, 767 × 900, plus 820px tablet and 1024/1440px desktop transitions pass.
- `player-gameplay.mjs`: complete game in 89 UI iterations through turn 18; 4 land plays, 8 spell casts, 3 attacks, blockers/reveals/card choices, game result and rematch pass. All answers use clicks/keyboard.
- `arena-drag-controls.mjs`: persisted opt-in, real spell-to-target cast, invalid-drop preservation, land play, attacker/blocker assignment and touch-pointer land play pass.
- Bundled `develop-web-game` client ran against a seeded local game and produced screenshot/state evidence in `output/command-table/skill-smoke/`.
- Browser runs report no page errors or failed application requests. These are Chromium desktop/mobile-emulation checks, not physical-device or production-release verification. Rules, AI, backend and source image files are unchanged by this task.

Final result: **passed** for the approved combined layout with the user's Scryfall-only card/commander requirement. The final normalized desktop/mobile/review pairs were inspected after the fixes. Remaining differences are intentional existing-game controls, real card data, official imagery and scrollable dense zones; no unresolved P0/P1/P2 finding remains in the checked states.

## Landing alignment — 2026-09-05

User requested the landing page to match the new frontend. The visual source is the implemented Command Table, with the same design tokens, font roles, ember actions, compact borders, and official imagery. No new illustration was generated. Existing three Scryfall menu card files are unchanged. New JPEGs are direct screenshots of the actual UI, with capture provenance in `assets/menu/README.md`.

Changed the hero, navigation, commander presentation, My Library row, product summary, how-to steps, Solo/Live panels, final action and footer. Added an explicitly labeled, keyboard-operable Table/Focus screenshot preview and a responsive mobile capture. Shared lower-section markup prevents boot/runtime copy drift. The lightweight preview/guide do not load the engine; the design tokens load before first paint.

Evidence: `output/web-game/command-landing/landing-{320,390,820,1280,1440,1900}.png`, corresponding viewport captures, `focus-preview.png`, and `report.json`. The actual arena source and finished desktop/mobile pages were inspected together. Screenshots use Chromium, DPR 1, reduced motion, and the established font stack. The account/room label correctly reflects the local environment; no hosted room creation or production verification is claimed.

The first responsive pass found that a legacy rule hid the new mobile navigation. The scoped rule now explicitly restores the two-row mobile header. A repeated check passed at 320/390/600/820/900/901/1024/1100/1280/1440/1900px: no horizontal overflow, out-of-bounds sections, navigation collisions, or primary controls smaller than 44px. The public boot and returned home have identical visible section content.

Functional checks passed: original Scryfall image paths and successful loads; mouse/keyboard Table/Focus switching; guide dialog Escape/return focus; no engine/deck requests from preview/guide; first Solo entry and warm home; Live selects online setup; guest Library opens and rejects an invalid decklist; account dialog remains reachable; phone guide/import/Solo and Deck → Pod → four-seat Review. No page errors or failed responses. Updated existing public-menu checks follow the shared markup and current featured-image preload; 32/32 targeted tests pass, alongside syntax and diff checks.

Landing result: **passed** in the checked desktop/mobile states. Dense game details in screenshots are previews; card inspection and actual game interaction remain in the game. The completed landing is available in the same isolated local worktree and preview as the new frontend.

## Authorized release verification — 2026-09-05

The user's “Odradi” after asking about commit/push/deploy authorizes publication to the existing main/Vercel target. The frontend was rebased onto the completed rules/import release `274ab2d` and the Live recovery/import release `9144dd0`. Existing engine, Oracle modules, original card images and the three original Scryfall menu images are unchanged by the frontend commit.

The release check corrected one stale short-phone CSS selector assertion and preserved the accessible HOLD/MANA/MENU names in the mobile icon toolbar using visually hidden labels. An existing Oracle test required an ignored source fixture; the identical file from main was supplied in the isolated worktree without changing its source records or engine behavior. The focused repaired tests passed 44/44.

On the final integrated source, the complete `npm test` passed **7,162/7,162**, with zero failures, cancellations, skips or TODOs (529.53 seconds). Syntax and catalog audit passed. Strict certification passed **19,484/19,484 definitions**, including 1,580 unique active cards and 2,347 card/deck checks across 27 decks. Pinned Scryfall provenance passed for batches 0127–0178: 52 batches and 5,200 complete rows, source SHA-256 `a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528`. The frozen manifest of 901 source/test/config/menu files remained unchanged throughout the final gates.

Browser evidence additionally passed Command Table, mobile Table in Chromium and Safari WebKit, complete human UI gameplay (89 iterations, turn 18, combat and rematch), six drag scenarios, five HOLD/Full/Auto scenarios, five Manifest/Delve scenarios, and the landing's five check groups across 11 widths. The final Live integration passed all six checks through actual imported-deck setup, two isolated browsers, WebSocket decisions, guest land play, guest reload, restored private seat/deck, host resume and the next accepted action. Host and guest recovery screenshots were inspected. Table/Focus composition applies to Solo and the Live host; the guest retains its existing private client.

Evidence is in ignored `output/release-command-table/`, including `final-full-tests.log`, `final-check.log`, `final-audit.log`, `final-certification.log`, `source-provenance.json`, `final-source-manifest.json`, `final-landing.log`, `live-integration.log`, and browser screenshots. Timestamp-only certification report changes are excluded from the commit. Final main integration, catalog/README refresh and production deployment are coordinated with the existing launch task; production verification must follow that deployment and is not claimed by this local record.
