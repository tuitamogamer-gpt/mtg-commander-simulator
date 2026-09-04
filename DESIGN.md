# Commander UI design contract

## Product promise

The interface should feel like a calm Commander war room: dark, tactile and information-rich, without hiding legal actions or asking the player to decode decoration. The rules engine remains authoritative. Presentation may summarize only public state and must never expose another player's hand, library order or private choice.

## Interaction hierarchy

Every event belongs to exactly one level:

1. **NOW** — a legal decision, required response or hard pause. One blocking surface at a time, with a visible primary action.
2. **REVIEW** — a spell, ability, combat result or public deal the human must acknowledge. One centered review with one `Proceed` path.
3. **ACTIVITY** — passive state changes and AI actions. These go to the public timeline and log; short notices may appear, but never form a wall over the battlefield.

Stack review, Diplomacy hard pauses and explicit `Proceed` checkpoints are never demoted to passive notifications.

## Surfaces and depth

Use only three surface levels:

- **Table**: background and battlefield.
- **Panel**: setup cards, lanes, HUD and utility drawers.
- **Dialog**: the active decision, sheet or fatal recovery surface.

Avoid panels inside panels when spacing, a divider or a label can express the same grouping. Borders describe structure; shadows describe elevation. A component should rarely need both.

## Type and color

- `Bricolage Grotesque` (variable: optical size, width, weight) carries product, deck and card-display titles and, at 88% width, the short uppercase labels.
- `Manrope` carries reading text and controls.
- `JetBrains Mono` with tabular figures carries every number that changes during play: life totals, power/toughness, counts.
- Body copy is at least 12px on compact screens and 13px when space allows.
- Muted text must remain readable on the table. Never use low contrast as the only signal for disabled, selected or dangerous state.
- Brass marks the human's current path; green marks valid progress/sync; red is reserved for danger, failure and destructive actions.

### Palette (obsidian & ember, 2026-09-02)

- Every colour comes from `src/design-system.css`; stylesheets never hard-code the accent or the base. `--ds-table`, `--ds-panel`, `--ds-panel-raised` and `--ds-dialog` are one cool blue-black material; `--ds-accent` (ember `#e07a4a`), `--ds-accent-bright` and `--ds-accent-soft` are the only warm colours, with `--ds-*-rgb` triplets for tints. `--ds-brass` and `--ds-brass-bright` remain as aliases of the accent for older rules.
- Surfaces: a fixed soft-light grain (`body::after`), radial ambient light in the accent hue, hairlines at 7–9% white, tinted shadows (`rgba(2, 6, 12, …)`), never pure black.
- Interaction: every control lifts 1px on hover, presses to 98.5% on `:active`, and shows a two-ring focus (outline plus accent halo). Reduced motion removes the lifts.

## Motion

Motion explains entry, focus or state change. It does not run as ambient decoration during repeated AI renders. Honor the operating-system reduced-motion preference and the in-app `Reduced motion` setting. Cinematic commander entry always has a visible `Skip` control.

## Responsive behavior

- Setup on every screen is a real `Deck → Pod → Review` flow. Only the active stage occupies the screen. The deck explorer has a full-width gallery and a compact layout; the selected deck has a persistent Continue control.
- Arena phone navigation is one level: `Mine / Table / Stack / Politics`. A destination does not add a second tab row.
- An empty hand collapses to a compact status rail; it must not reserve card-height space.
- All primary touch targets are at least 44px.
- Internal battlefield and drawer scrolling is preferred over page-level horizontal overflow.
- The client is drawn on a fixed pixel grid sized for ~1440px desktops. Wider screens scale the whole document through `body { zoom: var(--ui-zoom) }` (`design-system.css`, stepped by viewport width and height) instead of shrinking type into the corners. Because zoom multiplies viewport units, stylesheets and inline styles never use raw `vh`/`dvh`/`vw`; they use `calc(N * var(--vhu|--dvhu|--svhu|--vwu))`.
- Exile and suspend trays sit beside the hand cards, never above them; the hand row may grow but must never push cards below the screen edge.

## Accessibility and failure states

- Dialogs and sheets expose a name, `role="dialog"`, `aria-modal="true"`, initial focus, focus containment, Escape behavior when dismissal is legal, and return focus.
- Inline validation stays beside the control. Sync failures remain visible in the HUD until resolved. A fatal client error offers retry, setup return and a debug snapshot when a game exists.
- Focus rings are visible on dark and ember surfaces. Icon-only controls require an accessible name.

## CSS architecture

`design-system.css` owns new tokens and shared primitives in cascade layers. Existing `styles.css` and `client-v3.css` remain the legacy compatibility layer while the interface is migrated. `frontend-overhaul.css` is the temporary unlayered exception sheet loaded last; each rule there should either introduce an approved frontend behavior or bridge a legacy `!important` declaration. New one-off styling must not be added to `styles.css`.

## JavaScript architecture

Stay with vanilla JavaScript. Reusable presentation belongs in small factories or UI methods: stage navigation, dialog enhancement, public timeline rows, diagnostics and recovery. Do not move rules, legality or AI strategy into DOM code.

## Player tools

- `player-tools.js` owns validated device preferences, recent built-in decks, account-scoped local pod configurations, mana-curve summaries, and presentation-only hand sorting. A saved pod stores setup choices, never a game checkpoint or shuffle seed.
- `arena-tools.js` owns the searchable card/command dialog and hand controls. Search includes the viewer's hand and public zones. Opponent hands, libraries and face-down identities must never enter search results, search text or image URLs.
- Search opens the ordinary card sheet; casts, targets and payments still use the pending engine decision. Inspecting during a blocking decision temporarily hides its presentation and restores it on close.
- Find is available with a visible button, `/`, or Command/Ctrl+K. Each UI instance handles keys only while it is the active game. Search contains focus and makes the arena inert until closed.
- Hand sort, hand size, AI pacing and high contrast persist on the device. Draw-order sorting preserves the underlying hand array and card identities. Larger cards must still fit the reserved hand row.
