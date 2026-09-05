# Import a Commander deck

Bring a text decklist into **My Library**, check it, and use the saved list in Solo or Commander Live. Imported decks use the same rules engine, mana payment, Stack, targeting and combat as the built-in decks. Importing a list does not add missing card implementations to the game.

## From a decklist to your first game

1. Build or edit your list on Moxfield or another deck builder, then export it as plain text. The in-game importer accepts the list text; it does not fetch a deck URL.
2. Open **My Library** / **Import your decklist here** on the home screen. If you want account storage, sign in before importing.
3. Enter an optional, unique deck name and paste the complete list, including its commander or legal commander pair.
4. Click **Check decklist**. Fix every reported error. **Save to My Library** becomes available only after the complete list passes. Editing the list or name requires another check.
5. Click **Save to My Library**. The game checks the list again, saves it, and opens its deck overview.
6. Click **Build this pod →**, choose 1–3 AI opponents and their decks and [play styles](ai-archetypes.md), then continue to **Review** and start the game.

For later games, open My Library and click **Choose deck**. Choosing a saved deck opens setup; it does not immediately start a match. A new ordinary game uses a fresh shuffle. An explicit replay seed is for reproducing the same setup.

## Accepted text format

Use a `Commander` heading followed by a `Deck` heading:

```text
Commander
1 Dwynen, Gilt-Leaf Daen

Deck
1 Sol Ring
1 Elvish Champion
...
```

This snippet shows the format, not a complete list: replace `...` with the rest of your cards. For a complete 100-card example, copy [the Dwynen example deck](../tests/fixtures/oracle-v6-dwynen-deck.txt).

The importer also accepts:

| Input | Meaning |
| --- | --- |
| `1 Card Name` or `1x Card Name` | A quantity and card name. A name without a quantity means one copy. |
| `1 Your Commander *CMDR*` | Marks a commander without needing a separate section. `*COMMANDER*`, `*C*`, `[Commander]` and `# Commander` are also accepted at the end of a line. |
| `1 Sol Ring (C21) 263 *F*` | Common set, collector-number and foil suffixes are stripped. |
| `Commander`, `Commanders`, `Deck`, `Mainboard`, `Main` | Supported section headings, with an optional trailing colon. |
| `Sideboard`, `Considering`, `Maybeboard`, `Companion`, `Token`, `Tokens` | These sections are ignored. `SB:` lines are also ignored. Return to a main section before listing more deck cards. |
| A blank line, or a line beginning `# ` or `// ` | Ignored. |

For two commanders, put both under the Commander heading or tag both. Each must appear once, and their printed pairing rules must permit the combination. Names resolve against the local catalog, including case and common punctuation normalization. For an unrecognized double-faced or split card, use the exact name from the [card catalog](card-catalog.md).

## What the check verifies

- Exactly **100 cards including all commanders**.
- One commander or a legal pair, with each selected commander present exactly once.
- Commander eligibility, pairing restrictions and the deck's combined color identity.
- Singleton rules, with supported basic-land and printed extra-copy exceptions.
- Commander legality recorded in the bundled card data.
- Every card's engine certification and deck-import eligibility.
- The required implemented interaction contracts for the list's mechanics.

Card availability and format legality are separate checks. A real card can be legal in Commander and still unavailable in this engine. The catalog reflects a bundled source snapshot, not a live lookup of newly released cards or subsequent legality changes. Some legacy definitions retain engine certification without per-card legality provenance; that is recorded as a validation warning. Certification is the project's executable support check and does not imply that every possible card combination is bug-free.

## Fixing an import error

| Message or condition | What to do |
| --- | --- |
| Wrong card count | Count the commander within the 100. Check that main-deck lines were not placed beneath a sideboard heading. |
| Missing or invalid commander | Add the Commander section or a marker. Check eligibility and exact pairing rules. |
| Too many copies / color identity error | Correct the list in your deck builder, then paste and check it again. |
| Not available in the engine catalog | Check spelling and the [catalog](card-catalog.md). If the card is absent, use a supported replacement or wait for its implementation. |
| Not semantically certified / unsupported interaction | The card or mechanic has not passed the required support gate. Removing the message from the text cannot enable it. |
| Name already exists | Choose a different name. Imported decks cannot replace a built-in deck or silently overwrite another saved list. |
| **ENGINE UPDATE NEEDED** in My Library | The saved list no longer passes the current checks. It remains listed, with play disabled, so you can identify the problem. |

The UI displays the first eight import errors and reports whether more remain. Rechecking after corrections exposes the remaining issues. Unsupported lists are not partially saved or silently filled with substitute cards.

## Storage and changing a list

My Library holds up to **40 imported decks**. Guest lists stay in that browser's site data; account lists are stored with the signed-in account and can be loaded on another device. Signing in switches to the account library: it does not automatically migrate guest lists. Keep your source decklist and sign in before importing when you want account storage.

The game provides **Choose deck** and **Remove**, with list editing done in your deck builder. To keep a revision alongside the old list, import it under a new name. To reuse a name, keep a copy of the original text, remove the old library entry, and import the revised list. Clearing browser data removes guest decks, so keep an external copy of your decklists.

Every saved list is revalidated before play. A Solo Save/Continue checkpoint includes the imported lists needed by that match, so it can be restored without repasting them, subject to the current engine's validation.

## Give an imported deck to an AI

In **Solo → Pod**, open a bot's **Deck** selector and choose a ready list under **From My Library**. Select its **Play style** independently. An imported deck does not need a separate skill file: the local AI derives a profile from its cards and commander, then applies the selected style. Imported lists are explicitly selected; the random-deck pool remains the built-in decks. Each seat uses a different deck selection.

## Use an imported deck in Commander Live

Save the list first, then enter Commander Live. Ready saved lists appear in the lobby's deck selector with **(My Library)**. Choose the list, ready your seat, and let the host start once all 2–4 human players have selected different decks and are ready.

The selected list is sent to its owner and the host so the host can validate and build that deck. Other guests see that you brought an imported list without receiving its full record. The host runs the rules engine and holds the full game state; use Live with a trusted host. If a guest's deck name conflicts with a list already saved in the host's library, reimport it under a different name. Commander Live has human seats only; [custom AI skills](custom-ai-skills.md) apply to Solo.
