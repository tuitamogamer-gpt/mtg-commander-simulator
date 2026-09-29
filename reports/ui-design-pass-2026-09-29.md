# Design and UI pass — 29 September 2026

Scope: a review of the shipped interface (landing, Deck → Pod → Review, Command
Table on desktop and phone, dialogs) against `DESIGN.md`, followed by fixes for
everything that could be corrected without changing rules, AI, the catalog or
the CSS architecture. Evidence came from the local preview at 1024×768,
1440×1024 and 390×844 in Chromium, plus a static audit of the ten stylesheets.

## Findings and fixes

| Area | Finding | Fix |
| --- | --- | --- |
| Landing | The importable-card counter showed **24,791**; the catalog has 25,791. `src/catalog-summary.js` had not been regenerated after Oracle batches 0209–0218. | `node scripts/sync-landing-counts.mjs` → 25,791. |
| Landing / SEO | `index.html` canonical, `og:url`, `og:image` and `twitter:image` pointed at the retired `mtg-commander-simulator.vercel.app` domain; so did the iOS bundle's `onlineURL`, `PUBLIC_RELEASE.md` and `docs/deployment.md`. | All point at `https://www.mtgpod.xyz/` (the apex 308-redirects there). The public-release test asserts the new domain. |
| Typography | Four font tokens were never defined (`--tbl-serif`, `--tbl-sans`, `--ds-font-sans`, `--muted`), so commander arrivals, keyword effects, the AI-skill dialog and effect heroes fell back to Times/Arial. The recap title and the account badge named Georgia. | Aliases added to `design-system.css`; Georgia replaced by the display token. |
| Typography | Micro type down to 4–8px: setup review labels, seat badges, timeline/effect kickers, stack target chips, phone lane labels, HUD button labels (8px `!important` on desktop). | Raised to 9–12px across `frontend-overhaul.css`, `command-table.css`, `styles.css`, `client-v3.css`, `resolution-recap.css`. |
| Desktop arena, 901–1250px | With three opponents each seat header had ~60px for the name, so seats read "AI …" and commanders "Omo…". | New laptop rule in `command-table.css`: counters move under the name; names and commanders are no longer truncated at 1024px. |
| Desktop arena | The decision button was a hard-coded tan `#c68b59 !important`, off the ember accent, and its hover was dead. | Uses the accent gradient tokens with a working hover. |
| Dialogs | The legacy `.modal` (opening hand, card choices) used a hard-coded grey `#1c2029`, a 15px title and a 6-per-row card grid that wrapped the seventh opening-hand card alone. Overlays were pure black. | Dialog surface, hairline, shadow and display-font title from tokens; grid fits seven cards; overlays use the tinted shadow colour. |
| Focus | The shared focus ring only covered a few elements and lost to any unlayered `outline: 0`; deck search/sort and library peek had 15% rings; programmatically focused headings (the setup title on phones) showed a stray box. | Ring covers `textarea` and tabbable elements with the two-ring halo from `DESIGN.md`; explicit rings for deck tools and library peek; non-interactive `tabindex="-1"` targets never show a ring. |
| Touch targets | Remove-blocker buttons were 22px `!important` on every screen; the phone life button was 26×36; tablets wider than 900px received desktop sizes. | 28px desktop / 32px phone blocker buttons, 44px phone life button, and a `pointer: coarse` rule that keeps arena controls at 44px on wide tablets. |
| Viewport units | Raw `vh`/`vw`/`dvh` in `resolution-recap.css`, `command-table.css`, `mobile.css`, `client-v3.css` and the Live reconnect dialog ignored the `--ui-zoom` compensation, so recaps could overflow above 1600×900. | All use the `--vhu`/`--dvhu`/`--vwu` units. |
| Deck explorer | Grid cards had no placeholder while card images loaded; long titles pushed art down unevenly; strategy lines cut words mid-way ("Alternate wins and Shri…"). | Placeholder surface on `.deckart`, two-line title reservation, two-line clamp for strategy lines. |
| Pod stage | On single-column and short screens the sticky pod-builder heading and sticky footer left a small window for the seat cards. | The heading scrolls away below 1100px width or 820px height. |
| Motion / contrast | Target-hit and keyword highlight animations ran at full length under the OS reduced-motion setting; `prefers-contrast` had no support. | Added to the OS reduced-motion block; `prefers-contrast: more` receives the in-app high-contrast token remap. |
| Accessibility | `MTG.enhanceDialog` overwrote the Last Resort `alertdialog` role. | The role is preserved. |
| Stack tab (phone) | The threat note rendered larger than the table it explained. | `#game .sidenote` is 12px. |

## Verification

- `npm run check`: PASS.
- Targeted suites (frontend-overhaul, responsive-client-v3, ui-polish-regressions,
  public-release, deck-spotlight, account-client, ai-persona-ui,
  ai-persona-reactions, marked-damage-ui, stack-target-visibility,
  save-continue, counterspell-and-shuffle, divided-damage-targeting,
  ios-package, multiplayer, multiplayer-reconnect): 113/113 after updating the
  one assertion that named the old domain.
- Browser: landing counter and canonical verified; setup Deck → Pod → Review;
  opening hand dialog uses the token surface and display font with seven cards
  in one row; at 1024×768 no opponent name is truncated; phone recap and
  Table/Stack tabs render with the new type sizes. The full test suite was not
  rerun for this presentation-only change.

## Not changed (follow-ups)

- First Solo load fetches 224 scripts (36 MB uncompressed, brotli on Vercel)
  and every visit revalidates each one (`Cache-Control: max-age=0`). Long-lived
  caching needs content hashing or a build step; lazy-loading Oracle batches
  per deck would shorten the "Loading all 175 decks" screen.
- CSS architecture debt: 1,283 `!important`, about 2,860 literal colours
  outside the tokens, five parallel token families, 55 distinct z-index values,
  and dialogs built in 35 places five different ways. These need a planned
  migration, not a patch.
- Default hand cards on desktop are small; **Hand card size → Large** exists in
  the menu. A larger default should be decided with the fixed arena grid.
- Phone seat-header utility buttons (focus board, inspect lands) are 38px tall.
- Informative effects keep the project's 0.55s brief animation under reduced
  motion by design.
