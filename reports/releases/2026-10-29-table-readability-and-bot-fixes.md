# Table readability and bot fixes — 29 October 2026

Based on `f7cda96`.

## Table

- **Tapped lands and mana rocks** in the desktop Lands · Mana column turn 60 degrees clockwise and dim. The column had cancelled the tapped rotation, so a tapped land differed only by slight transparency. The turned card stays inside its own cell, so tapping never reflows the column.
- **P/T stays readable.** The Command Table moves P/T to the lower right, where the classic layout kept the stack count, the TOKEN band and the attachment count. Grouped tokens showed `×3` over `1/1`. Stack counts now sit in the top-right corner, TOKEN is a bottom-left pill and attachments sit on the left edge. P/T and its offsets scale with the card, and P/T is the topmost layer.
- **Commander tax** in the dock uses the same badge as CAST. The bare label sat behind the tilted art and showed only "(tax".

## Bots

Found by playing 69 headless four-player AI games with random decks, styles and difficulties:

- **Land drops.** Post Malone, Olivia and Josh ended the main phase instead of playing a land whenever they held an instant with open mana. A pending land now always ranks above ending the window.
- **Energy and minimum X.** Abilities that cost energy were offered without enough energy (Aetherworks Marvel, 14 failed activations in one game). "X can't be 0" abilities were offered when only X=0 was affordable (Lair of the Hydra, 24).
- **Pursued Whale.** A bot aimed Bedevil at a Pursued Whale whose {3} target tax it could not pay (32 failed casts). Bot target prompts now leave out whales they cannot afford. Humans keep every legal target.
- **Mana-value casting limits.** Under Void Winnower, a bot announced X=2 for Disorder in the Court, giving an even mana value (15 failed casts). X is offered only from values that keep the spell castable; the bot now casts it with X=1.
- **Repeated rejections.** A rejected bot action is not offered again until the bot's resources or the board change. Before, every later priority window asked again. A bot that kept choosing the same failing action could spin the priority loop.

## Verification

- New Node tests: `ai-rejected-actions` (6) and `ai-land-drop` (8). Each fails on the previous code; the priority-loop case hangs there.
- New browser check `tests/browser/battlefield-overlays.mjs` at 1440×900, 1920×1080 and 1280×720. It fails on the previous CSS. `battlefield-resource-dock.mjs` asserts the 60-degree tapped angle and no overlap. `commander-dock.mjs` (6) and `stable-table-ui.mjs` pass.
- 368 related test files: 9,973 of 9,977 tests pass. The four failures fail identically on `f7cda96`: the Esper Sentinel image URL in `commander-staples`, the 6497/6474 count in `full-card-audit`, the Odds and Ends loyalty pairs in `planeswalker-combat`, and the Oracle executable-proof gaps for batches 0260–0266. A full Oracle proof run on both revisions produced the same 2,441 failure rows.
- Re-running the audit seeds after the fixes gives 0 rejected actions for Bedevil, Lair of the Hydra, Aetherworks Marvel and Disorder in the Court.
- Two complete browser games without page errors: 35 turns with real clicks at 390×844, and 56 turns of AI play at 1440×900 to a victory screen.

Not addressed: Necropolis Fiend and Tasigur cast from exile with delve still fail silently, twice in one audit game. This is not a full card catalog or physical-device run.
