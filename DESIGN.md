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

- `Marcellus` is reserved for product, deck and card-display titles.
- `Barlow` carries reading text and controls.
- `Barlow Semi Condensed` carries short labels, state and numbers.
- Body copy is at least 12px on compact screens and 13px when space allows.
- Muted text must remain readable on the table. Never use low contrast as the only signal for disabled, selected or dangerous state.
- Brass marks the human's current path; green marks valid progress/sync; red is reserved for danger, failure and destructive actions.

## Motion

Motion explains entry, focus or state change. It does not run as ambient decoration during repeated AI renders. Honor the operating-system reduced-motion preference and the in-app `Reduced motion` setting. Cinematic commander entry always has a visible `Skip` control.

## Responsive behavior

- Setup on a phone is a real `Deck → Pod → Review` flow. Only the active stage occupies the screen.
- Arena phone navigation is one level: `Mine / Table / Stack / Politics`. A destination does not add a second tab row.
- An empty hand collapses to a compact status rail; it must not reserve card-height space.
- All primary touch targets are at least 44px.
- Internal battlefield and drawer scrolling is preferred over page-level horizontal overflow.
- The client is drawn on a fixed pixel grid sized for ~1440px desktops. Wider screens scale the whole document through `body { zoom: var(--ui-zoom) }` (`design-system.css`, stepped by viewport width and height) instead of shrinking type into the corners. Because zoom multiplies viewport units, stylesheets and inline styles never use raw `vh`/`dvh`/`vw`; they use `calc(N * var(--vhu|--dvhu|--svhu|--vwu))`.
- Exile and suspend trays sit beside the hand cards, never above them; the hand row may grow but must never push cards below the screen edge.

## Accessibility and failure states

- Dialogs and sheets expose a name, `role="dialog"`, `aria-modal="true"`, initial focus, focus containment, Escape behavior when dismissal is legal, and return focus.
- Inline validation stays beside the control. Sync failures remain visible in the HUD until resolved. A fatal client error offers retry, setup return and a debug snapshot when a game exists.
- Focus rings are visible on dark and brass surfaces. Icon-only controls require an accessible name.

## CSS architecture

`design-system.css` owns new tokens and shared primitives in cascade layers. Existing `styles.css` and `client-v3.css` remain the legacy compatibility layer while the interface is migrated. `frontend-overhaul.css` is the temporary unlayered exception sheet loaded last; each rule there should either introduce an approved frontend behavior or bridge a legacy `!important` declaration. New one-off styling must not be added to `styles.css`.

## JavaScript architecture

Stay with vanilla JavaScript. Reusable presentation belongs in small factories or UI methods: stage navigation, dialog enhancement, public timeline rows, diagnostics and recovery. Do not move rules, legality or AI strategy into DOM code.
